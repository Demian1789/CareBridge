const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {encodeWav} = require('../voice-audio.js');

function harness() {
  const nodes = {};
  const sent = [];
  const uploads = [];
  let stopped = 0;
  const stream = {getTracks: () => [{stop: () => stopped++}]};
  class Audio {
    state = 'running';
    async resume() {}
    async close() { this.state = 'closed'; }
    async decodeAudioData() { return {duration: 1}; }
  }
  class Offline {
    createBufferSource() { return {connect() {}, start() {}}; }
    async startRendering() { return {getChannelData: () => new Float32Array(16000)}; }
  }
  class Recorder {
    static isTypeSupported() { return true; }
    state = 'inactive';
    mimeType = 'audio/webm';
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable({data: new Blob(['audio'])});
      this.onstop();
    }
  }
  const context = {
    console, Blob, AbortController, setTimeout, clearTimeout, setInterval, clearInterval,
    navigator: {mediaDevices: {getUserMedia: async () => stream}},
    MediaRecorder: Recorder, CareBridgeAudio: {encodeWav},
    document: {getElementById: id => nodes[id] ||= {value: '', addEventListener() {}}, querySelectorAll: () => []},
    isSecureContext: true, AudioContext: Audio, OfflineAudioContext: Offline,
    addEventListener() {}, show() {}, closeModal() {}, render() {}, voice() {},
    ask: text => sent.push(text), toast() {}, save() {}, switchTab() {}, state: {}, agentBusy: false,
    agentConfig: Promise.resolve({speechConfigured: true, token: 'test'}),
    fetch: async (url, options) => {
      uploads.push({url, options});
      return {ok: true, json: async () => ({text: '阿拉吃好饭了'})};
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('voice.js', 'utf8'), context);
  return {context, nodes, sent, uploads, stopped: () => stopped};
}

test('record -> WAV -> transcribe -> edit -> explicit send', async () => {
  const h = harness();
  h.context.voice();
  await h.context.startVoice();
  h.context.stopVoice();
  for (let i = 0; i < 30 && !h.nodes.voiceText?.value; i++) await new Promise(r => setTimeout(r, 2));
  assert.equal(h.uploads[0].url, '/api/transcribe');
  assert.equal(h.uploads[0].options.body.byteLength, 32044);
  assert.equal(h.nodes.voiceText.value, '阿拉吃好饭了');
  assert.equal(h.sent.length, 0);
  h.nodes.voiceText.value = '我已经吃过午饭了';
  h.context.useVoiceText();
  assert.deepEqual(h.sent, ['我已经吃过午饭了']);
  assert.ok(h.stopped() > 0);
});

test('cancelling recording stops microphone without uploading or sending', async () => {
  const h = harness();
  h.context.voice();
  await h.context.startVoice();
  h.context.closeModal();
  await new Promise(r => setTimeout(r, 2));
  assert.equal(h.uploads.length, 0);
  assert.equal(h.sent.length, 0);
  assert.ok(h.stopped() > 0);
});

test('insecure phone page reports HTTPS requirement before requesting mic', async () => {
  const h = harness();
  h.context.isSecureContext = false;
  h.context.voice();
  await h.context.startVoice();
  assert.match(h.nodes.voiceStatus.textContent, /HTTPS/);
  assert.equal(h.uploads.length, 0);
  h.context.closeModal();
});
