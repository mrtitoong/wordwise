/** Đọc/ghi WAV PCM 16-bit mono, thêm nhiễu trắng theo SNR. Chỉ dùng cho thí nghiệm. */
export function readWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let sampleRate = 16000;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") sampleRate = view.getUint32(offset + 12, true);
    if (id === "data") {
      const n = Math.floor(Math.min(size, bytes.length - offset - 8) / 2);
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = view.getInt16(offset + 8 + i * 2, true) / 32768;
      return { samples, sampleRate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV không có khối data");
}

/** Cộng nhiễu trắng (tất định theo seed) với tỉ lệ tín hiệu/nhiễu snrDb, tính trên đoạn có tiếng. */
export function addNoise(samples: Float32Array, snrDb: number, seed = 1): Float32Array {
  let power = 0;
  let count = 0;
  for (const s of samples)
    if (Math.abs(s) > 0.01) {
      power += s * s;
      count++;
    }
  const noiseRms = Math.sqrt(power / Math.max(1, count) / 10 ** (snrDb / 10));
  let state = seed;
  const rand = () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const g = Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
    out[i] = samples[i] + g * noiseRms;
  }
  return out;
}
