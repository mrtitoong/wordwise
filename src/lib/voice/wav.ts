/**
 * Chuyển bản thu âm sang WAV PCM 16 bit, 16 kHz, mono để gửi Azure Speech (dịch vụ chỉ nhận
 * WAV/OGG; Safari thu ra MP4/AAC, Firefox ra WebM). Giải mã âm thanh làm ở trình duyệt
 * (AudioContext.decodeAudioData); phần tính toán ở đây là hàm thuần.
 */

export const TARGET_SAMPLE_RATE = 16_000;
/** Mỗi lần nói tối đa 10 giây (giới hạn chi phí, đủ cho một từ hoặc cụm từ). */
export const MAX_RECORD_SECONDS = 10;

/** Trộn các kênh thành mono (trung bình cộng). */
export function downmix(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!;
  const length = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i]!;
    out[i] = sum / channels.length;
  }
  return out;
}

/** Đổi tần số lấy mẫu (nội suy tuyến tính), cắt tối đa MAX_RECORD_SECONDS giây. */
export function resample(
  samples: Float32Array,
  fromRate: number,
  toRate = TARGET_SAMPLE_RATE,
): Float32Array {
  const maxOut = MAX_RECORD_SECONDS * toRate;
  const length = Math.min(Math.floor((samples.length * toRate) / fromRate), maxOut);
  const out = new Float32Array(length);
  const ratio = fromRate / toRate;
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, samples.length - 1);
    const frac = pos - left;
    out[i] = samples[left]! * (1 - frac) + samples[right]! * frac;
  }
  return out;
}

/** WAV PCM 16 bit mono. */
export function encodeWav(samples: Float32Array, sampleRate = TARGET_SAMPLE_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

/** Âm lượng trung bình (RMS) để phát hiện thu im lặng trước khi gửi máy chủ. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
