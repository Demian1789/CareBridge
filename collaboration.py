"""Account-routed demo medical orders and daily tasks, persisted in SQLite.

Account selection identifies a demo participant; it is not production authentication.
"""
import json
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone, date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ORDER = json.loads((ROOT / 'demo-order.json').read_text(encoding='utf-8'))
CN_TIME = timezone(timedelta(hours=8))
SUBJECTS = {'DEMO-P001': {'id':'DEMO-P001','name':'林秀英','age':72}, 'DEMO-P002': {'id':'DEMO-P002','name':'陈建国','age':76}}
ACCOUNTS = {
    'doctor:13800000001': {'role':'doctor','label':'张医生','subjects':['DEMO-P001','DEMO-P002']},
    'family:13800000003': {'role':'family','label':'林女士','subjects':['DEMO-P001'],'relation':'女儿'},
    'family:13800000005': {'role':'family','label':'林先生','subjects':['DEMO-P001'],'relation':'儿子'},
    'family:13800000013': {'role':'family','label':'陈女士','subjects':['DEMO-P002'],'relation':'女儿'},
    'elder:13800000002': {'role':'elder','label':'林秀英','subjects':['DEMO-P001']},
    'elder:13800000012': {'role':'elder','label':'陈建国','subjects':['DEMO-P002']},
}
DEFAULT_ACCOUNT = {'doctor':'doctor:13800000001','family':'family:13800000003','elder':'elder:13800000002'}


class TaskError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def today():
    return datetime.now(CN_TIME).date().isoformat()


def now():
    return datetime.now(CN_TIME).isoformat()


def identity(account, role, subject=None):
    actor = ACCOUNTS.get(account)
    if not actor or actor['role'] != role:
        raise TaskError('该演示账号尚未配置照护关系，请使用使用手册中的演示手机号', 403)
    if subject is not None and subject not in actor['subjects']:
        raise TaskError('该账号没有关联这位患者', 403)
    return actor


def integer_in_text(text):
    values = {'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}
    if text.isdigit():
        return int(text)
    if text in values:
        return values[text]
    if '十' in text:
        left, right = text.split('十', 1)
        return values.get(left, 1) * 10 + values.get(right, 0)
    return None


class TaskStore:
    def __init__(self, path):
        self.path = Path(path)

    @contextmanager
    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS medical_orders (
                    id INTEGER PRIMARY KEY, subject_id TEXT NOT NULL, version INTEGER NOT NULL,
                    doctor_account TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL,
                    status TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE, UNIQUE(subject_id, version)
                );
                CREATE TABLE IF NOT EXISTS order_deliveries (
                    order_id INTEGER NOT NULL, family_account TEXT NOT NULL,
                    delivered_at TEXT NOT NULL, read_at TEXT,
                    PRIMARY KEY(order_id,family_account)
                );
                CREATE TABLE IF NOT EXISTS shared_plans (
                    id INTEGER PRIMARY KEY, subject_id TEXT NOT NULL, owner_account TEXT NOT NULL,
                    order_id INTEGER, order_version INTEGER, kind TEXT NOT NULL,
                    content TEXT NOT NULL, times TEXT NOT NULL, start_date TEXT NOT NULL,
                    days INTEGER NOT NULL, created_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
                    UNIQUE(subject_id,order_id)
                );
                CREATE TABLE IF NOT EXISTS shared_task_instances (
                    id INTEGER PRIMARY KEY, plan_id INTEGER NOT NULL, task_date TEXT NOT NULL,
                    task_time TEXT NOT NULL, completed_at TEXT, UNIQUE(plan_id,task_date,task_time)
                );
                CREATE TABLE IF NOT EXISTS shared_meta (name TEXT PRIMARY KEY,value TEXT NOT NULL);
            ''')
            with db:
                seed = {**ORDER,'duration':'7 天','source':'预置演示医嘱：虚构药品 A，每次 1 片，每日 2 次，早、午餐后口服，疗程 7 天。','care':'康复执行困难时联系照护者核实'}
                db.execute('INSERT OR IGNORE INTO medical_orders(subject_id,version,doctor_account,content,created_at,status,request_id) VALUES(?,?,?,?,?,?,?)', ('DEMO-P001',2,DEFAULT_ACCOUNT['doctor'],json.dumps(seed,ensure_ascii=False),'2026-11-05T07:30:00+08:00','current','initial-demo-order-v2'))
                seed_id = db.execute('SELECT id FROM medical_orders WHERE request_id=?', ('initial-demo-order-v2',)).fetchone()['id']
                db.execute('INSERT OR IGNORE INTO order_deliveries(order_id,family_account,delivered_at) VALUES(?,?,?)', (seed_id,DEFAULT_ACCOUNT['family'],'2026-11-05T07:30:00+08:00'))
                history={**seed,'frequency':'每日 1 次，早餐后','dailyCount':1,'source':'历史演示原文：虚构药品 A，每次 1 片，每日 1 次，早餐后口服，疗程 7 天。'}
                db.execute('INSERT OR IGNORE INTO medical_orders(subject_id,version,doctor_account,content,created_at,status,request_id) VALUES(?,?,?,?,?,?,?)',('DEMO-P001',1,DEFAULT_ACCOUNT['doctor'],json.dumps(history,ensure_ascii=False),'2026-11-04T16:00:00+08:00','superseded','initial-demo-order-v1'))
                history_id=db.execute('SELECT id FROM medical_orders WHERE request_id=?',('initial-demo-order-v1',)).fetchone()['id']
                db.execute('INSERT OR IGNORE INTO order_deliveries(order_id,family_account,delivered_at) VALUES(?,?,?)',(history_id,DEFAULT_ACCOUNT['family'],'2026-11-04T16:00:00+08:00'))
                if not db.execute('SELECT 1 FROM shared_meta WHERE name=?', ('legacy-tasks-imported',)).fetchone():
                    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='plans'").fetchone():
                        for p in db.execute('SELECT * FROM plans').fetchall():
                            db.execute('INSERT OR IGNORE INTO shared_plans(id,subject_id,owner_account,order_id,order_version,kind,content,times,start_date,days,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', (p['id'],p['subject_id'],DEFAULT_ACCOUNT['family'],seed_id,p['order_version'],'med',json.dumps(seed,ensure_ascii=False),p['times'],p['start_date'],p['days'],p['created_at']))
                        db.execute('INSERT OR IGNORE INTO shared_task_instances(id,plan_id,task_date,task_time,completed_at) SELECT id,plan_id,task_date,task_time,completed_at FROM task_instances')
                    db.execute('INSERT OR IGNORE INTO shared_meta VALUES(?,?)', ('legacy-tasks-imported','yes'))
            with db:
                yield db
        finally:
            db.close()

    def _account(self, role, account, subject):
        account = account or DEFAULT_ACCOUNT.get(role)
        identity(account, role, subject)
        return account

    def send_order(self, data, account):
        if not isinstance(data, dict) or data.get('role') != 'doctor':
            raise TaskError('请由医生端确认并发送医嘱', 403)
        subject = data.get('subjectId')
        if subject not in SUBJECTS:
            raise TaskError('请选择已关联的患者',403)
        identity(account, 'doctor', subject)
        recipient = data.get('recipientId')
        identity(recipient, 'family', subject)
        fields = data.get('order')
        required = ['drug','dose','frequency','duration','route','source']
        if not isinstance(fields, dict) or any(not isinstance(fields.get(k), str) or not fields[k].strip() or len(fields[k]) > 8000 for k in required):
            raise TaskError('请完整核对药名、剂量、频次、疗程、给药方式和原文')
        count, days = fields.get('dailyCount'), fields.get('durationDays')
        if type(count) is not int or not 1 <= count <= 4 or type(days) is not int or not 1 <= days <= 30:
            raise TaskError('请由医生确认每日次数（1–4）和疗程天数（1–30）')
        match = re.search(r'(?:每日|每天|一日)\s*([0-9一二两三四五六七八九十]+)\s*次', fields['frequency'])
        if match and integer_in_text(match.group(1)) != count:
            raise TaskError('每日次数与医嘱频次不一致，请重新核对')
        match = re.search(r'([0-9一二两三四五六七八九十]+)\s*天', fields['duration'])
        if match and integer_in_text(match.group(1)) != days:
            raise TaskError('疗程天数与原医嘱不一致，请重新核对')
        if re.search(r'按需|必要时|每周|隔日|隔天', fields['frequency']):
            raise TaskError('此演示排程仅支持每日规律用药，请先核对频次')
        request_id = data.get('requestId')
        if type(data.get('expectedVersion')) is not int or data['expectedVersion']<0:
            raise TaskError('医嘱版本不正确，请刷新后重新核对')
        if not isinstance(request_id, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{8,80}', request_id):
            raise TaskError('发送标识不正确，请重新打开确认窗口')
        content = {k: fields[k].strip() for k in required}
        content.update({'care':str(fields.get('care','')).strip()[:2000], 'dailyCount':count, 'durationDays':days})
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            existing = db.execute('SELECT * FROM medical_orders WHERE request_id=?', (request_id,)).fetchone()
            if existing:
                delivery = db.execute('SELECT 1 FROM order_deliveries WHERE order_id=? AND family_account=?', (existing['id'],recipient)).fetchone()
                if existing['subject_id'] != subject or existing['doctor_account'] != account or json.loads(existing['content']) != content or not delivery:
                    raise TaskError('发送内容已变化，请重新打开确认窗口',409)
                return {'orderId':existing['id'],'version':existing['version'],'recipientLabel':ACCOUNTS[recipient]['label'],'created':False}
            current = db.execute('SELECT COALESCE(MAX(version),0) FROM medical_orders WHERE subject_id=?',(subject,)).fetchone()[0]
            if data.get('expectedVersion') != current:
                raise TaskError('患者医嘱已更新，请刷新后重新核对发送',409)
            timestamp = now()
            db.execute("UPDATE medical_orders SET status='superseded' WHERE subject_id=?",(subject,))
            db.execute("UPDATE shared_plans SET active=0 WHERE subject_id=? AND kind='med'",(subject,))
            row = db.execute('INSERT INTO medical_orders(subject_id,version,doctor_account,content,created_at,status,request_id) VALUES(?,?,?,?,?,?,?)',(subject,current+1,account,json.dumps(content,ensure_ascii=False),timestamp,'current',request_id))
            db.execute('INSERT INTO order_deliveries(order_id,family_account,delivered_at) VALUES(?,?,?)',(row.lastrowid,recipient,timestamp))
            return {'orderId':row.lastrowid,'version':current+1,'recipientLabel':ACCOUNTS[recipient]['label'],'created':True}

    def mark_read(self, data, account):
        identity(account, 'family', data.get('subjectId'))
        ids = data.get('orderIds')
        if not isinstance(ids, list) or len(ids)>100 or any(type(i) is not int for i in ids):
            raise TaskError('医嘱编号不正确')
        with self.connect() as db:
            for order_id in ids:
                db.execute('UPDATE order_deliveries SET read_at=COALESCE(read_at,?) WHERE order_id=? AND family_account=? AND EXISTS(SELECT 1 FROM medical_orders WHERE id=? AND subject_id=?)',(now(),order_id,account,order_id,data['subjectId']))
        return {'read':True}

    def _times(self, times, count):
        if not isinstance(times,list) or len(times)!=count or len(set(str(t) for t in times))!=count or any(not isinstance(t,str) or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',t) for t in times):
            raise TaskError(f'请设置 {count} 个不同的有效提醒时间，与医嘱每日次数一致')
        return sorted(times)

    def publish(self, data, account=None):
        if not isinstance(data,dict) or data.get('role')!='family':
            raise TaskError('请从家属端发布每日任务',403)
        subject=data.get('subjectId')
        account=self._account('family',account,subject)
        if set(data)-{'role','subjectId','orderVersion','orderId','times','kind','title','detail','days'}:
            raise TaskError('不能通过每日任务修改医嘱药品、剂量或频次')
        kind=data.get('kind','med')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            order_id, version = None, None
            if kind=='med':
                order=db.execute("SELECT o.* FROM medical_orders o JOIN order_deliveries d ON d.order_id=o.id WHERE o.subject_id=? AND d.family_account=? AND o.status='current'",(subject,account)).fetchone()
                if not order or data.get('orderVersion')!=order['version'] or data.get('orderId',order['id'])!=order['id']:
                    raise TaskError('尚无可用的新医嘱，或版本已更新，请刷新后查看医生发送的医嘱',409)
                content=json.loads(order['content'])
                count,days=content['dailyCount'],content['durationDays']
                order_id,version=order['id'],order['version']
            elif kind=='care':
                title,detail,days=data.get('title'),data.get('detail',''),data.get('days')
                if not isinstance(title,str) or not 1<=len(title.strip())<=80 or not isinstance(detail,str) or len(detail)>500 or type(days) is not int or not 1<=days<=30:
                    raise TaskError('请填写日常任务名称、说明及 1–30 天的重复天数')
                if re.search(r'用药|吃药|服药|剂量|药片|胶囊|注射',title+detail):
                    raise TaskError('用药任务请从医生确认的医嘱生成，不能用日常任务代替医嘱')
                content={'title':title.strip(),'detail':detail.strip()}
                count=1
            else:
                raise TaskError('不支持的任务类型')
            times=self._times(data.get('times'),count)
            existing=db.execute('SELECT * FROM shared_plans WHERE subject_id=? AND order_id=?',(subject,order_id)).fetchone() if kind=='med' else db.execute("SELECT * FROM shared_plans WHERE subject_id=? AND owner_account=? AND kind='care' AND content=? AND times=? AND days=? AND active=1",(subject,account,json.dumps(content,ensure_ascii=False),json.dumps(times),days)).fetchone()
            if existing:
                if json.loads(existing['times'])!=times:
                    raise TaskError('该医嘱已有每日提醒，修改医嘱后可发布新版；本版暂不支持改排',409)
                return {'planId':existing['id'],'created':False,'startDate':existing['start_date'],'days':existing['days'],'dailyCount':len(times),'times':times}
            start=today()
            row=db.execute('INSERT INTO shared_plans(subject_id,owner_account,order_id,order_version,kind,content,times,start_date,days,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',(subject,account,order_id,version,kind,json.dumps(content,ensure_ascii=False),json.dumps(times),start,days,now()))
            for day in range(days):
                task_date=(date.fromisoformat(start)+timedelta(days=day)).isoformat()
                for task_time in times:
                    db.execute('INSERT INTO shared_task_instances(plan_id,task_date,task_time) VALUES(?,?,?)',(row.lastrowid,task_date,task_time))
            return {'planId':row.lastrowid,'created':True,'startDate':start,'days':days,'dailyCount':count,'times':times}

    def get_tasks(self, subject, role, account=None):
        if subject not in SUBJECTS:
            raise TaskError('请选择已关联的患者',403)
        account=self._account(role,account,subject)
        actor=identity(account,role,subject)
        current_date=today()
        with self.connect() as db:
            if role=='family':
                order_rows=db.execute('SELECT o.* FROM medical_orders o JOIN order_deliveries d ON d.order_id=o.id WHERE o.subject_id=? AND d.family_account=? ORDER BY o.version DESC',(subject,account)).fetchall()
            else:
                order_rows=db.execute('SELECT * FROM medical_orders WHERE subject_id=? ORDER BY version DESC',(subject,)).fetchall()
            orders=[]
            for o in order_rows:
                deliveries=db.execute('SELECT * FROM order_deliveries WHERE order_id=?',(o['id'],)).fetchall()
                orders.append({**json.loads(o['content']),'id':o['id'],'version':o['version'],'status':o['status'],'time':o['created_at'],'doctorLabel':ACCOUNTS[o['doctor_account']]['label'],'deliveryStatus':'account_inbox','recipients':[{'accountId':d['family_account'],'label':ACCOUNTS[d['family_account']]['label'],'deliveredAt':d['delivered_at'],'readAt':d['read_at']} for d in deliveries]})
            plans=db.execute('SELECT * FROM shared_plans WHERE subject_id=? AND active=1'+(' AND owner_account=?' if role=='family' else ''),(subject,account) if role=='family' else (subject,)).fetchall()
            tasks=[]
            for p in plans:
                content=json.loads(p['content'])
                rows=db.execute('SELECT * FROM shared_task_instances WHERE plan_id=? AND task_date=? ORDER BY task_time',(p['id'],current_date)).fetchall()
                for r in rows:
                    title='用药提醒 · '+content['drug'] if p['kind']=='med' else content['title']
                    detail=content['dose']+' · '+content['route']+' · '+content['frequency'] if p['kind']=='med' else content['detail']
                    tasks.append({'id':100000+r['id'],'remoteId':r['id'],'date':r['task_date'],'time':r['task_time'],'name':title,'kind':p['kind'],'detail':detail,'done':bool(r['completed_at']),'confirmedAt':r['completed_at'],'sourceOrderVersion':p['order_version'],'source':'shared_demo_server'})
            managed=bool(db.execute("SELECT 1 FROM shared_plans WHERE subject_id=? AND kind='med' LIMIT 1",(subject,)).fetchone())
        return {'subjectId':subject,'subject':SUBJECTS[subject],'account':{'id':account,'label':actor['label'],'role':role},'subjects':[SUBJECTS[s] for s in actor['subjects']],'recipients':[{'id':a,'label':v['label'],'relation':v.get('relation','')} for a,v in ACCOUNTS.items() if v['role']=='family' and subject in v['subjects']] if role=='doctor' else [],'serverDate':current_date,'tasks':sorted(tasks,key=lambda t:t['time']),'plans':[{'id':p['id'],'kind':p['kind'],'orderId':p['order_id'],'times':json.loads(p['times']),'startDate':p['start_date'],'days':p['days']} for p in plans],'orders':orders,'order':next((o for o in orders if o['status']=='current'),None),'managedMedications':managed,'currentVersion':max((o['version'] for o in orders),default=0)}

    def complete(self, data, account=None):
        if not isinstance(data,dict) or data.get('role')!='elder':
            raise TaskError('必须由患者端本人确认任务',403)
        account=self._account('elder',account,data.get('subjectId'))
        if type(data.get('taskId')) is not int:
            raise TaskError('任务编号不正确')
        with self.connect() as db:
            row=db.execute('SELECT t.*,p.active FROM shared_task_instances t JOIN shared_plans p ON t.plan_id=p.id WHERE t.id=? AND p.subject_id=?',(data['taskId'],data['subjectId'])).fetchone()
            if not row:
                raise TaskError('任务不存在，请刷新',404)
            if not row['active'] or row['task_date']!=today():
                raise TaskError('任务已失效或不是今天的任务，请刷新',409)
            timestamp=row['completed_at'] or now()
            db.execute('UPDATE shared_task_instances SET completed_at=? WHERE id=?',(timestamp,data['taskId']))
        return {'taskId':data['taskId'],'confirmedAt':timestamp,'status':'本人已确认'}


STORE=TaskStore(os.getenv('CAREBRIDGE_TASK_DB',str(ROOT/'.runtime'/'shared-tasks.sqlite3')))
