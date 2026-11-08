"""Short WAV transcription through Alibaba Cloud Qwen-ASR. Never persists audio."""
import base64
import io
import json
import os
import re
import urllib.request
from urllib.parse import urlsplit
import wave

MAX_AUDIO_BYTES = 2_000_000
DEFAULT_ASR_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'


class SpeechConfigError(ValueError):
    pass


def speech_config():
    key = os.getenv('DASHSCOPE_API_KEY', '').strip()
    base = os.getenv('ASR_BASE_URL', DEFAULT_ASR_BASE_URL).strip().rstrip('/')
    model = os.getenv('ASR_MODEL', 'qwen3-asr-flash').strip()
    if not key:
        raise SpeechConfigError('语音识别尚未配置，请填写 DASHSCOPE_API_KEY 后重启服务')
    if not key.isascii() or any(c.isspace() for c in key):
        raise SpeechConfigError('语音密钥格式不正确，请在 .env 中填写完整百炼 API Key，不要填写中文说明或空格')
    if not base.isascii() or any(c.isspace() for c in base) or any(c in base for c in '{}<>'):
        raise SpeechConfigError('语音接口地址仍含占位内容或特殊字符，请将 ASR_BASE_URL 改为真实地址；北京地域可填写 ' + DEFAULT_ASR_BASE_URL)
    try:
        parsed = urlsplit(base)
        valid = (parsed.scheme == 'https' and parsed.hostname and parsed.hostname.endswith('.aliyuncs.com')
                 and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment
                 and parsed.path == '/compatible-mode/v1' and parsed.port in (None, 443))
    except ValueError:
        valid = False
    if not valid:
        raise SpeechConfigError('ASR_BASE_URL 格式不正确，请填写百炼 HTTPS 接口地址，结尾为 /compatible-mode/v1')
    if not re.fullmatch(r'[a-zA-Z0-9._-]+', model):
        raise SpeechConfigError('ASR_MODEL 格式不正确，请填写 qwen3-asr-flash')
    return base, key, model


def speech_configuration_status():
    try:
        speech_config()
        return {'speechConfigured': True, 'speechConfigError': ''}
    except SpeechConfigError as exc:
        return {'speechConfigured': False, 'speechConfigError': str(exc)}


def validate_audio(audio):
    if not audio or len(audio) > MAX_AUDIO_BYTES:
        raise ValueError('录音为空或超过大小限制，请录制 60 秒以内的语音')
    try:
        with wave.open(io.BytesIO(audio), 'rb') as wav:
            frames = wav.getnframes()
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (1, 2, 16000, 'NONE'):
                raise ValueError('需要 16kHz 单声道 PCM WAV 音频')
            if not 1600 <= frames <= 960000 or len(wav.readframes(frames)) != frames * 2:
                raise ValueError('录音过短、超过 60 秒或数据不完整')
    except (wave.Error, EOFError) as exc:
        raise ValueError('无法读取录音，请重新录制') from exc


def transcribe(audio, call=None):
    validate_audio(audio)
    payload = {
        'model': os.getenv('ASR_MODEL', 'qwen3-asr-flash'),
        'messages': [{'role': 'user', 'content': [{'type': 'input_audio', 'input_audio': {
            'data': 'data:audio/wav;base64,' + base64.b64encode(audio).decode('ascii')
        }}]}],
        # zh includes Wu dialects; the provider has no separate Shanghai language code.
        'asr_options': {'language': 'zh', 'enable_itn': False},
        'stream': False,
    }
    if call:
        result = call(payload)
    else:
        base, key, model = speech_config()
        payload['model'] = model
        req = urllib.request.Request(base + '/chat/completions', data=json.dumps(payload).encode(), headers={
            'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'
        })
        with urllib.request.urlopen(req, timeout=65) as response:
            result = json.load(response)
    text = result['choices'][0]['message']['content']
    if not isinstance(text, str) or not text.strip():
        raise ValueError('没有识别到清晰语音，请靠近麦克风再试')
    if len(text) > 8000:
        raise ValueError('识别结果过长，请分段录制')
    return {'text': text.strip(), 'language': 'zh', 'requiresConfirmation': True}
