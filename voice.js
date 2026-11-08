// Real microphone input. Transcripts always require an explicit review action.
let voiceSession = null;
let voiceSequence = 0;

function voiceStatus(message) {
  const node = document.getElementById('voiceStatus');
  if (node) node.textContent = message;
}

function disposeVoice() {
  const session = voiceSession;
  voiceSession = null;
  voiceSequence++;
  if (!session) return;
  clearInterval(session.timer);
  clearTimeout(session.timeout);
  session.abort.abort();
  if (session.recorder?.state === 'recording') session.recorder.stop();
  session.stream?.getTracks().forEach(track => track.stop());
  if (session.audio?.state !== 'closed') session.audio?.close().catch(() => {});
}

function openVoice(target) {
  disposeVoice();
  show(target === 'transcript' ? '语音录入医嘱原文' : '语音输入', `
    <p class="dialogtext">支持中文与吴语识别，优先测试上海话。请先核对识别结果，尤其是药名、剂量和数字。每次最多 60 秒。</p>
    <p class="dialogtext">点击开始后，录音将发送到语音识别服务用于转写；本应用不保存音频文件。</p>
    <p id="voiceStatus" role="status" aria-live="polite">准备好后，点击开始录音并允许麦克风权限。</p>
    <div class="dialogactions"><button id="voiceStart" class="primary" onclick="startVoice()">开始录音</button><button id="voiceStop" class="secondary" onclick="stopVoice()" disabled>停止并识别</button></div>
    <label class="label">识别文字（可以修改）<textarea id="voiceText" rows="5" maxlength="8000" placeholder="识别结果会显示在这里"></textarea></label>
    <div class="dialogactions"><button class="secondary" onclick="closeModal()">取消</button><button id="voiceUse" class="primary" onclick="useVoiceText()">${target === 'transcript' ? '核对后填入医嘱原文' : '核对后发送'}</button></div>`);
  voiceSession = {target, abort: new AbortController(), id: voiceSequence};
}

async function startVoice() {
  const session = voiceSession;
  if (!session || session.busy) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return voiceStatus('此地址无法使用麦克风，请用 HTTPS 链接打开。电脑本机 localhost 也可使用。');
  }
  if (!window.MediaRecorder || !(window.AudioContext || window.webkitAudioContext) || !(window.OfflineAudioContext || window.webkitOfflineAudioContext)) {
    return voiceStatus('当前浏览器不支持录音，请用系统浏览器打开，或使用键盘上的语音输入。');
  }
  session.busy = true;
  document.getElementById('voiceStart').disabled = true;
  document.getElementById('voiceUse').disabled = true;
  try {
    // Create/resume in the original user gesture for mobile Safari.
    session.audio = new (window.AudioContext || window.webkitAudioContext)();
    await session.audio.resume();
    const config = await agentConfig;
    if (voiceSession !== session) return;
    if (!config.speechConfigured) throw new Error(config.speechConfigError || '服务端尚未配置语音识别，请先配置 DASHSCOPE_API_KEY。');
    const stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true}});
    if (voiceSession !== session) { stream.getTracks().forEach(t => t.stop()); return; }
    session.stream = stream;
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
    session.recorder = new MediaRecorder(stream, mime ? {mimeType: mime} : undefined);
    session.chunks = [];
    session.recorder.ondataavailable = e => { if (e.data.size) session.chunks.push(e.data); };
    session.recorder.onstop = () => finishVoice(session);
    session.recorder.onerror = () => { voiceStatus('录音中断，请关闭后重新录制'); disposeVoice(); };
    session.recorder.start();
    session.started = Date.now();
    document.getElementById('voiceStop').disabled = false;
    voiceStatus('正在录音，完成后点击“停止并识别”…');
    session.timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - session.started) / 1000);
      voiceStatus(`正在录音 ${seconds} 秒 / 60 秒`);
      if (seconds >= 60) stopVoice();
    }, 500);
  } catch (error) {
    if (voiceSession !== session) return;
    session.busy = false;
    session.stream?.getTracks().forEach(t => t.stop());
    await session.audio?.close().catch(() => {});
    document.getElementById('voiceStart').disabled = false;
    document.getElementById('voiceUse').disabled = false;
    voiceStatus(error.name === 'NotAllowedError' ? '麦克风权限被拒绝，请在浏览器设置中允许录音后重试。' : error.message);
  }
}

function stopVoice() {
  const session = voiceSession;
  if (session?.recorder?.state !== 'recording') return;
  clearInterval(session.timer);
  document.getElementById('voiceStop').disabled = true;
  voiceStatus('录音已结束，正在识别…');
  session.recorder.stop();
  session.stream.getTracks().forEach(t => t.stop());
}

async function finishVoice(session) {
  if (voiceSession !== session) return;
  try {
    const blob = new Blob(session.chunks, {type: session.recorder.mimeType});
    const decoded = await session.audio.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration < 0.1) throw new Error('录音过短，请重新录制');
    // Convert browser-native WebM/MP4 into interoperable mono PCM WAV.
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offline = new Offline(1, Math.min(960000, Math.ceil(decoded.duration * 16000)), 16000);
    const source = offline.createBufferSource();
    source.buffer = decoded; source.connect(offline.destination); source.start();
    const buffer = await offline.startRendering();
    const wav = CareBridgeAudio.encodeWav(buffer.getChannelData(0));
    if (voiceSession !== session) return;
    const config = await agentConfig;
    session.timeout = setTimeout(() => session.abort.abort(), 90000);
    const response = await fetch('/api/transcribe', {method: 'POST', headers: {'Content-Type': 'audio/wav', 'X-CareBridge-Token': config.token}, body: wav, signal: session.abort.signal});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '语音识别失败');
    if (voiceSession !== session) return;
    document.getElementById('voiceText').value = result.text;
    voiceStatus('识别完成。请核对并修改文字，确认后再继续。');
  } catch (error) {
    if (voiceSession === session) voiceStatus(error.name === 'AbortError' ? '识别超时，请重新录制' : error.message || '语音识别失败，请重试');
  } finally {
    clearTimeout(session.timeout);
    session.chunks = [];
    if (session.audio.state !== 'closed') await session.audio.close().catch(() => {});
    if (voiceSession === session) {
      session.busy = false;
      document.getElementById('voiceStart').disabled = false;
      document.getElementById('voiceUse').disabled = false;
    }
  }
}

function useVoiceText() {
  if (!voiceSession || voiceSession.busy) return;
  const text = document.getElementById('voiceText').value.trim();
  if (!text) return voiceStatus('请先录音，或输入需要核对的文字');
  if (text.length > 8000) return voiceStatus('文字过长，请分段输入');
  const target = voiceSession.target;
  closeModal();
  if (target === 'transcript') {
    state.transcript = text; save(); switchTab('record');
    toast('已填入原文，请继续核对并整理草稿');
  } else ask(text);
}

const voiceOriginalClose = closeModal;
closeModal = function () { disposeVoice(); voiceOriginalClose(); };
voice = function () { if (!agentBusy) openVoice('chat'); };
if (typeof toggleRecording === 'function') toggleRecording = function () { openVoice('transcript'); };
document.getElementById('modal').addEventListener('close', disposeVoice);
document.getElementById('modal').addEventListener('cancel', disposeVoice);
window.addEventListener('pagehide', disposeVoice);

// Replace the doctor's old simulated recording label while preserving the page layout.
const voiceOriginalRender = render;
render = function () {
  voiceOriginalRender();
  document.querySelectorAll('[onclick="toggleRecording()"]').forEach(button => {
    const strong = button.querySelector('strong');
    const small = button.querySelector('small');
    if (strong) strong.textContent = '录音转写医嘱';
    if (small) small.textContent = '支持上海话等吴语，识别后先核对文字';
  });
};
render();
