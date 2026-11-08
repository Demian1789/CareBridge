import tempfile
import unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from shared_tasks import TaskStore, TaskError


class SharedTasksTests(unittest.TestCase):
    def setUp(self):
        runtime=Path(__file__).resolve().parents[1]/'.runtime'
        runtime.mkdir(exist_ok=True)
        self.folder = tempfile.TemporaryDirectory(dir=runtime)
        assert Path(self.folder.name).resolve().is_relative_to(runtime.resolve())
        self.addCleanup(self.folder.cleanup)
        self.path = Path(self.folder.name) / 'tasks.sqlite3'
        self.store = TaskStore(self.path)
        self.plan = {'role':'family','subjectId':'DEMO-P001','orderVersion':2,'times':['08:00','12:30']}

    def test_publish_two_daily_tasks_for_seven_days_without_duplicates(self):
        first=self.store.publish(self.plan)
        again=self.store.publish(self.plan)
        self.assertTrue(first['created'])
        self.assertFalse(again['created'])
        self.assertEqual(first['planId'],again['planId'])
        with self.store.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM shared_task_instances').fetchone()[0],14)
        elder=self.store.get_tasks('DEMO-P001','elder')
        self.assertEqual(len(elder['tasks']),2)
        self.assertFalse(elder['tasks'][0]['done'])
        self.assertEqual(elder['tasks'][0]['sourceOrderVersion'],2)

    def test_completion_is_shared_persistent_and_idempotent(self):
        self.store.publish(self.plan)
        task=self.store.get_tasks('DEMO-P001','elder')['tasks'][0]
        request={'role':'elder','subjectId':'DEMO-P001','taskId':task['remoteId']}
        first=self.store.complete(request)
        self.assertEqual(first['confirmedAt'],self.store.complete(request)['confirmedAt'])
        family=TaskStore(self.path).get_tasks('DEMO-P001','family')
        self.assertTrue(family['tasks'][0]['done'])
        self.assertFalse(family['tasks'][1]['done'])

    def test_reject_prescription_changes_wrong_subject_and_wrong_actor(self):
        bad=[{**self.plan,'dose':'double'},{**self.plan,'subjectId':'OTHER'}, {**self.plan,'orderVersion':1}, {**self.plan,'role':'elder'}, {**self.plan,'times':['08:00']}, {**self.plan,'times':['25:00','12:30']}]
        for request in bad:
            with self.subTest(request=request),self.assertRaises(TaskError):
                self.store.publish(request)
        with self.assertRaises(TaskError):
            self.store.complete({'role':'family','subjectId':'DEMO-P001','taskId':1})

    def test_parallel_duplicate_publish_creates_one_plan(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda _:self.store.publish(self.plan),range(2)))
        self.assertEqual(sum(result['created'] for result in results),1)
