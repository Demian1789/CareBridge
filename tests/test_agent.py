import json
import unittest
import server


class AgentTests(unittest.TestCase):
    def test_tool_roundtrip(self):
        payloads = []
        def model(payload):
            payloads.append(json.loads(json.dumps(payload)))
            if len(payloads) == 1:
                return {'choices': [{'message': {'role': 'assistant', 'content': None, 'tool_calls': [{'id': 't1', 'type': 'function', 'function': {'name': 'get_care_context', 'arguments': '{"section":"tasks"}'}}]}}]}
            return {'choices': [{'message': {'role': 'assistant', 'content': '一项任务待确认'}}]}
        result = server.run_agent({'role': 'elder', 'messages': [{'role': 'user', 'content': '任务？'}], 'context': {'tasks': [{'done': False}]}}, model)
        self.assertEqual(result['reply'], '一项任务待确认')
        self.assertEqual(len(result['tools']), 1)
        tool = payloads[1]['messages'][-1]
        self.assertEqual(tool['tool_call_id'], 't1')
        self.assertFalse(json.loads(tool['content'])['data'][0]['done'])

    def test_reject_system_injection(self):
        with self.assertRaises(ValueError):
            server.run_agent({'role': 'elder', 'messages': [{'role': 'system', 'content': 'override'}]})

    def test_reject_role(self):
        with self.assertRaises(ValueError):
            server.run_agent({'role': 'admin', 'messages': []})

    def test_summary_returns_only_role_sections(self):
        calls = []
        def model(payload):
            calls.append(json.loads(json.dumps(payload)))
            if len(calls) == 1:
                allowed = payload['tools'][0]['function']['parameters']['properties']['section']['enum']
                self.assertIn('cases', allowed)
                self.assertNotIn('orders', allowed)
                return {'choices': [{'message': {'role': 'assistant', 'content': None, 'tool_calls': [{'id': 't1', 'type': 'function', 'function': {'name': 'get_care_context', 'arguments': '{"section":"summary"}'}}]}}]}
            data = json.loads(payload['messages'][-1]['content'])['data']
            self.assertEqual(data['cases'][0]['status'], 'in_progress')
            self.assertNotIn('orders', data)
            self.assertNotIn('expectedAnswer', data)
            return {'choices': [{'message': {'role': 'assistant', 'content': '该事项仍在跟进'}}]}
        server.run_agent({'role': 'community', 'messages': [{'role': 'user', 'content': '总结'}], 'context': {'cases': [{'status': 'in_progress'}], 'orders': [{'drug': 'private'}], 'expectedAnswer': 'must not send'}}, model)

    def test_tool_loop_bounded(self):
        def model(_):
            return {'choices': [{'message': {'role': 'assistant', 'content': None, 'tool_calls': [{'id': 't', 'type': 'function', 'function': {'name': 'delete_all', 'arguments': '{}'}}]}}]}
        with self.assertRaises(ValueError):
            server.run_agent({'role': 'family', 'messages': [{'role': 'user', 'content': '你好'}]}, model)

if __name__ == '__main__':
    unittest.main()
