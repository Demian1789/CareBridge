import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from collaboration import TaskStore, TaskError, today


class CollaborationTests(unittest.TestCase):
    def setUp(self):
        runtime=Path(__file__).resolve().parents[1]/'.runtime'
        self.folder=tempfile.TemporaryDirectory(dir=runtime)
        assert Path(self.folder.name).resolve().is_relative_to(runtime.resolve())
        self.addCleanup(self.folder.cleanup)
        self.path=Path(self.folder.name)/'flow.sqlite3'
        self.store=TaskStore(self.path)
        self.doctor='doctor:13800000001'
        self.family='family:13800000003'
        self.other_family='family:13800000005'
        self.elder='elder:13800000002'
        self.payload={'role':'doctor','subjectId':'DEMO-P001','recipientId':self.other_family,'expectedVersion':2,'requestId':'send-order-test-001','order':{'drug':'测试药品 Z','dose':'测试用剂量','frequency':'每日 1 次','duration':'3 天','route':'测试给药途径','care':'仅供软件演示','source':'测试原文：测试药品 Z，测试用剂量，每日一次，三天，测试给药途径。','dailyCount':1,'durationDays':3}}

    def test_targeted_delivery_and_read_receipt(self):
        sent=self.store.send_order(self.payload,self.doctor)
        target=self.store.get_tasks('DEMO-P001','family',self.other_family)
        unrelated=self.store.get_tasks('DEMO-P001','family',self.family)
        self.assertEqual(target['order']['drug'],'测试药品 Z')
        self.assertFalse(any(o['id']==sent['orderId'] for o in unrelated['orders']))
        self.assertIsNone(unrelated['order'])
        self.store.mark_read({'subjectId':'DEMO-P001','orderIds':[sent['orderId']]},self.family)
        self.assertIsNone(self.store.get_tasks('DEMO-P001','doctor',self.doctor)['order']['recipients'][0]['readAt'])
        self.store.mark_read({'subjectId':'DEMO-P001','orderIds':[sent['orderId']]},self.other_family)
        self.assertIsNotNone(self.store.get_tasks('DEMO-P001','doctor',self.doctor)['order']['recipients'][0]['readAt'])

    def test_real_sent_order_drives_tasks_and_recipient_can_publish(self):
        sent=self.store.send_order(self.payload,self.doctor)
        request={'role':'family','subjectId':'DEMO-P001','orderId':sent['orderId'],'orderVersion':3,'times':['10:00']}
        with self.assertRaises(TaskError):self.store.publish(request,self.family)
        self.store.publish(request,self.other_family)
        data=self.store.get_tasks('DEMO-P001','elder',self.elder)
        self.assertEqual(len(data['tasks']),1)
        task=data['tasks'][0]
        self.assertIn('测试药品 Z',task['name'])
        self.assertIn('测试用剂量',task['detail'])
        self.store.complete({'role':'elder','subjectId':'DEMO-P001','taskId':task['remoteId']},self.elder)
        self.assertTrue(self.store.get_tasks('DEMO-P001','family',self.other_family)['tasks'][0]['done'])

    def test_new_order_invalidates_old_tasks_but_preserves_history(self):
        self.store.publish({'role':'family','subjectId':'DEMO-P001','orderVersion':2,'times':['08:00','12:30']},self.family)
        old=self.store.get_tasks('DEMO-P001','elder',self.elder)['tasks'][0]
        self.store.send_order(self.payload,self.doctor)
        self.assertEqual(self.store.get_tasks('DEMO-P001','elder',self.elder)['tasks'],[])
        with self.assertRaises(TaskError):self.store.complete({'role':'elder','subjectId':'DEMO-P001','taskId':old['remoteId']},self.elder)
        with self.store.connect() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM shared_task_instances').fetchone()[0],14)

    def test_send_retries_are_idempotent_and_stale_drafts_conflict(self):
        one=self.store.send_order(self.payload,self.doctor)
        two=self.store.send_order(self.payload,self.doctor)
        self.assertEqual(one['orderId'],two['orderId'])
        with self.assertRaises(TaskError):self.store.send_order({**self.payload,'requestId':'send-order-test-002'},self.doctor)
        self.assertEqual(self.store.get_tasks('DEMO-P001','doctor',self.doctor)['currentVersion'],3)

    def test_subject_and_doctor_confirmation_are_checked(self):
        for patch in [{'recipientId':'family:13800000013'},{'order':{**self.payload['order'],'dailyCount':2}},{'order':{**self.payload['order'],'dose':''}},{'order':{**self.payload['order'],'durationDays':4}}]:
            with self.subTest(patch=patch),self.assertRaises(TaskError):self.store.send_order({**self.payload,**patch},self.doctor)
        with self.assertRaises(TaskError):self.store.get_tasks('DEMO-P001','family','family:13800000013')

    def test_daily_care_tasks_are_shared_and_medication_cannot_be_forged(self):
        request={'role':'family','subjectId':'DEMO-P001','kind':'care','title':'晚餐情况记录','detail':'拍照或本人反馈','days':3,'times':['18:30']}
        self.store.publish(request,self.family)
        self.store.publish(request,self.family)
        tasks=self.store.get_tasks('DEMO-P001','elder',self.elder)['tasks']
        self.assertEqual(len(tasks),1)
        self.assertEqual(tasks[0]['name'],'晚餐情况记录')
        with self.assertRaises(TaskError):self.store.publish({**request,'title':'服药提醒'},self.family)

    def test_legacy_tasks_migrate_without_losing_confirmations(self):
        with sqlite3.connect(self.path) as db:
            db.executescript('CREATE TABLE plans(id INTEGER PRIMARY KEY,subject_id TEXT,order_version INTEGER,times TEXT,start_date TEXT,days INTEGER,created_at TEXT);CREATE TABLE task_instances(id INTEGER PRIMARY KEY,plan_id INTEGER,task_date TEXT,task_time TEXT,completed_at TEXT);')
            db.execute('INSERT INTO plans VALUES(1,?,?,?,?,?,?)',('DEMO-P001',2,json.dumps(['08:00','12:30']),today(),7,'created'))
            db.execute('INSERT INTO task_instances VALUES(1,1,?,?,?)',(today(),'08:00','original-confirmation-time'))
        db.close()
        current=self.store.get_tasks('DEMO-P001','family',self.family)
        self.assertTrue(current['tasks'][0]['done'])
        self.assertEqual(current['tasks'][0]['confirmedAt'],'original-confirmation-time')
