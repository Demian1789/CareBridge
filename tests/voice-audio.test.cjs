const {test} = require('node:test');
const assert = require('node:assert/strict');
const {encodeWav} = require('../voice-audio.js');
test('WAV output has accurate headers, PCM values and clipping', () => {
  const samples = new Float32Array(16000);
  samples.set([-2, -1, 0, 1, 2]);
  const result = Buffer.from(encodeWav(samples));
  assert.equal(result.toString('ascii', 0, 4), 'RIFF');
  assert.equal(result.toString('ascii', 8, 12), 'WAVE');
  assert.equal(result.readUInt32LE(24), 16000);
  assert.equal(result.readUInt32LE(40), 32000);
  assert.deepEqual([0,1,2,3,4].map(i => result.readInt16LE(44 + 2*i)), [-32768,-32768,0,32767,32767]);
});
test('duration bounds are enforced before upload', () => {
  assert.throws(() => encodeWav(new Float32Array(100)));
  assert.throws(() => encodeWav(new Float32Array(960001)));
});
