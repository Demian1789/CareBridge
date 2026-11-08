// Browser-independent PCM WAV encoder, also exercised by Node tests.
(function (root) {
  function encodeWav(samples, sampleRate = 16000) {
    if (sampleRate !== 16000 || samples.length < 1600 || samples.length > 960000) {
      throw new Error('请录制 0.1 至 60 秒语音');
    }
    const data = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(data);
    const write = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    write(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true);
    write(8, 'WAVE'); write(12, 'fmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    write(36, 'data'); view.setUint32(40, samples.length * 2, true);
    samples.forEach((sample, i) => {
      const value = Math.max(-1, Math.min(1, sample || 0));
      view.setInt16(44 + i * 2, value * (value < 0 ? 32768 : 32767), true);
    });
    return data;
  }
  root.CareBridgeAudio = {encodeWav};
  if (typeof module !== 'undefined') module.exports = {encodeWav};
})(typeof window !== 'undefined' ? window : globalThis);
