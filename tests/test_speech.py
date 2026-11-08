import io
import unittest
import wave
from unittest.mock import patch
from speech import transcribe, validate_audio, speech_config, speech_configuration_status, SpeechConfigError


def wav_bytes(seconds=1):
    result = io.BytesIO()
    with wave.open(result, 'wb') as wav:
        wav.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
        wav.writeframes(b'\0\0' * int(16000 * seconds))
    return result.getvalue()


class SpeechTests(unittest.TestCase):
    def test_placeholder_url_is_caught_without_exposing_key(self):
        with patch.dict('os.environ', {'DASHSCOPE_API_KEY': 'test-secret', 'ASR_BASE_URL': 'https://你的APIHost/compatible-mode/v1'}, clear=True):
            status = speech_configuration_status()
            self.assertFalse(status['speechConfigured'])
            self.assertIn('占位', status['speechConfigError'])
            self.assertNotIn('test-secret', status['speechConfigError'])

    def test_default_beijing_configuration(self):
        with patch.dict('os.environ', {'DASHSCOPE_API_KEY': 'test-secret'}, clear=True):
            self.assertEqual(speech_config(), ('https://dashscope.aliyuncs.com/compatible-mode/v1', 'test-secret', 'qwen3-asr-flash'))

    def test_invalid_key_and_endpoint(self):
        for values in ({'DASHSCOPE_API_KEY': '填入你的密钥'}, {'DASHSCOPE_API_KEY': 'test-key', 'ASR_BASE_URL': 'http://example.com/compatible-mode/v1'}, {'DASHSCOPE_API_KEY': 'test-key', 'ASR_BASE_URL': 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'}):
            with self.subTest(values=values), patch.dict('os.environ', values, clear=True), self.assertRaises(SpeechConfigError):
                speech_config()

    def test_payload_and_confirmation(self):
        def fake(payload):
            self.assertEqual(payload['asr_options'], {'language': 'zh', 'enable_itn': False})
            self.assertTrue(payload['messages'][0]['content'][0]['input_audio']['data'].startswith('data:audio/wav;base64,'))
            return {'choices': [{'message': {'content': '阿拉吃好饭了'}}]}
        result = transcribe(wav_bytes(), fake)
        self.assertEqual(result['text'], '阿拉吃好饭了')
        self.assertTrue(result['requiresConfirmation'])

    def test_invalid_audio(self):
        for audio in (b'', b'not wav', wav_bytes(61), wav_bytes()[:-100]):
            with self.subTest(length=len(audio)), self.assertRaises(ValueError):
                validate_audio(audio)

    def test_empty_result_is_failure(self):
        with self.assertRaises(ValueError):
            transcribe(wav_bytes(), lambda _: {'choices': [{'message': {'content': ''}}]})
