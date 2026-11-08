import base64
import io
import json
import unittest
from email.message import Message
from unittest.mock import patch
import server
from test_speech import wav_bytes


def request(path, method='GET', headers=None, body=b''):
    handler = server.Handler.__new__(server.Handler)
    handler.path = path
    handler.headers = Message()
    for k, v in (headers or {}).items():
        handler.headers[k] = v
    handler.rfile = io.BytesIO(body)
    handler.wfile = io.BytesIO()
    handler.send_response = lambda code: setattr(handler, 'status', code)
    handler.send_header = lambda *_: None
    handler.end_headers = lambda: None
    handler.connection = type('Connection', (), {'settimeout': lambda *_: None})()
    getattr(handler, 'do_' + method)()
    return handler.status, handler.wfile.getvalue()


class HttpTests(unittest.TestCase):
    def test_password_protects_config_and_assets(self):
        with patch.dict('os.environ', {'DEMO_PASSWORD': 'test-password-only'}, clear=True):
            for path in ('/', '/api/config', '/voice.js'):
                self.assertEqual(request(path)[0], 401)
            auth = 'Basic ' + base64.b64encode(b'carebridge:test-password-only').decode()
            status, body = request('/api/config', headers={'Authorization': auth})
            self.assertEqual(status, 200)
            self.assertNotIn('test-password-only', body.decode())

    def test_audio_requires_token_and_configuration(self):
        with patch.dict('os.environ', {}, clear=True):
            self.assertEqual(request('/api/transcribe', 'POST')[0], 403)
            status, _ = request('/api/transcribe', 'POST', {'X-CareBridge-Token': server.TOKEN})
            self.assertEqual(status, 503)

    def test_audio_endpoint(self):
        body = wav_bytes()
        with patch.dict('os.environ', {'DASHSCOPE_API_KEY': 'test-key'}, clear=True), patch('server.transcribe', return_value={'text': '你好', 'requiresConfirmation': True}) as fake:
            status, result = request('/api/transcribe', 'POST', {'X-CareBridge-Token': server.TOKEN, 'Content-Length': str(len(body))}, body)
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(result)['text'], '你好')
            fake.assert_called_once_with(body)

    def test_static_secret_isolation_and_voice_assets(self):
        with patch.dict('os.environ', {}, clear=True):
            for path in ('/.env', '/speech.py', '/../.env'):
                self.assertEqual(request(path)[0], 404)
            for path in ('/voice.js', '/voice-audio.js'):
                self.assertEqual(request(path)[0], 200)

    def test_shared_data_requires_a_known_demo_account_and_relation(self):
        with patch.dict('os.environ', {}, clear=True):
            path='/api/tasks?subjectId=DEMO-P001&role=family'
            self.assertEqual(request(path)[0],403)
            self.assertEqual(request(path,headers={'X-CareBridge-Account':'family:13800000013'})[0],403)

    def test_only_doctor_route_can_submit_confirmed_orders(self):
        body=json.dumps({'role':'doctor','subjectId':'DEMO-P001'}).encode()
        headers={'X-CareBridge-Token':server.TOKEN,'Content-Length':str(len(body)),'X-CareBridge-Account':'family:13800000003'}
        with patch.dict('os.environ', {}, clear=True):
            self.assertEqual(request('/api/orders/send','POST',headers,body)[0],403)
