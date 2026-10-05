// Source: kurt, "Gunshots" (CC0), 22 Magnum.wav; see THIRD_PARTY_NOTICES.md.
// Run: node scripts/prepare-gunshot.mjs path/to/22-Magnum.wav
import { readFileSync, writeFileSync } from 'node:fs';

const input = readFileSync(process.argv[2]);
let channels, rate, pcm;
for (let offset = 12; offset + 8 <= input.length;) {
  const chunk = input.toString('ascii', offset, offset + 4);
  const length = input.readUInt32LE(offset + 4);
  if (chunk === 'fmt ') {
    if (input.readUInt16LE(offset + 8) !== 1 || input.readUInt16LE(offset + 22) !== 16) throw new Error('Expected PCM16');
    channels = input.readUInt16LE(offset + 10);
    rate = input.readUInt32LE(offset + 12);
  }
  if (chunk === 'data') pcm = input.subarray(offset + 8, offset + 8 + length);
  offset += 8 + length + length % 2;
}
if (!pcm || channels !== 2 || rate !== 96000) throw new Error('Unexpected source format');
const mono = Array.from({ length: pcm.length / 4 }, (_, i) => (pcm.readInt16LE(i * 4) + pcm.readInt16LE(i * 4 + 2)) / 65536);
const onset = mono.findIndex(value => Math.abs(value) > 0.1);
if (onset < 0) throw new Error('No shot transient found');
const start = Math.max(0, onset - 192), outputRate = rate / 2;
const count = Math.round(outputRate * 0.42), output = Buffer.alloc(44 + count * 2);
output.write('RIFF'); output.writeUInt32LE(output.length - 8, 4); output.write('WAVEfmt ', 8);
output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22);
output.writeUInt32LE(outputRate, 24); output.writeUInt32LE(outputRate * 2, 28);
output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34); output.write('data', 36); output.writeUInt32LE(count * 2, 40);
for (let i = 0; i < count; i++) {
  // Average two source samples for 48 kHz mono. Fade out the outdoor echo.
  const sample = ((mono[start + i * 2] ?? 0) + (mono[start + i * 2 + 1] ?? 0)) / 2;
  const envelope = Math.min(1, i / 24, (count - 1 - i) / (outputRate * 0.08));
  output.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample * envelope * 0.85)) * 32767), 44 + i * 2);
}
writeFileSync('public/assets/audio/gunshot.wav', output);
console.log(`Extracted one shot at ${(start / rate).toFixed(3)}s; ${count / outputRate}s, ${output.length} bytes`);
