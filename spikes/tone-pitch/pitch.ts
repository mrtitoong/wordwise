/**
 * Thí nghiệm: nhận dạng thanh điệu tiếng Trung bằng đo cao độ (F0) ngay trong trình duyệt.
 * Hàm thuần, không phụ thuộc DOM/Node: chạy được ở cả Node (đánh giá) và trình duyệt (trang thu âm).
 *
 * Các bước: YIN tìm F0 từng khung 10 ms → làm mượt, sửa nhảy quãng tám → đổi sang nửa cung (semitone)
 * so với giọng người nói → tách âm tiết theo đoạn có thanh + chỗ năng lượng thấp → so hình dáng đường cao độ
 * của từng âm tiết với mẫu thanh 1–4 (thang Chao: 55, 35, 214/21, 51).
 */

export type Frame = { t: number; f0: number | null; rms: number };
export type Tone = 1 | 2 | 3 | 4 | 5;

const HOP_MS = 10;

/**
 * F0 từng khung: hàm CMND của YIN (de Cheveigné & Kawahara 2002) cho tối đa 4 ứng viên mỗi khung (các
 * đáy cục bộ), rồi Viterbi chọn đường liền mạch nhất – nhảy quãng tám tốn nhiều, chuyển có tiếng/không
 * tiếng tốn ít (giống pYIN). Chịu được giọng rè (creaky) ở cuối thanh 3/thanh 4 hơn là lấy đáy đầu tiên.
 */
export function pitchTrack(
  samples: Float32Array,
  sampleRate: number,
  { minHz = 55, maxHz = 500 } = {},
): Frame[] {
  const hop = Math.round((sampleRate * HOP_MS) / 1000);
  const maxLag = Math.ceil(sampleRate / minHz);
  const minLag = Math.floor(sampleRate / maxHz);
  const win = Math.round(sampleRate * 0.03);
  const frames: Frame[] = [];
  const cands: { hz: number; cost: number }[][] = [];
  const diff = new Float32Array(maxLag + 2);
  let peak = 0;
  for (let start = 0; start + win + maxLag + 1 < samples.length; start += hop) {
    let energy = 0;
    for (let i = 0; i < win; i++) energy += samples[start + i] ** 2;
    const rms = Math.sqrt(energy / win);
    peak = Math.max(peak, rms);
    frames.push({ t: (start + win / 2) / sampleRate, f0: null, rms });
    const list: { hz: number; cost: number }[] = [];
    cands.push(list);
    if (rms < 1e-3) continue;
    diff[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= maxLag + 1; tau++) {
      let sum = 0;
      for (let i = 0; i < win; i++) {
        const d = samples[start + i] - samples[start + i + tau];
        sum += d * d;
      }
      running += sum;
      diff[tau] = running === 0 ? 1 : (sum * tau) / running;
    }
    for (let tau = Math.max(2, minLag); tau <= maxLag; tau++) {
      const b = diff[tau];
      if (b > 0.6 || b > diff[tau - 1] || b > diff[tau + 1]) continue;
      const a = diff[tau - 1];
      const c = diff[tau + 1];
      const shift = a + c - 2 * b === 0 ? 0 : (a - c) / (2 * (a + c - 2 * b));
      // Ưu tiên nhẹ chu kỳ ngắn để tránh chọn bội số chu kỳ (quãng tám thấp hơn).
      list.push({
        hz: sampleRate / (tau + Math.max(-0.5, Math.min(0.5, shift))),
        cost: b + 0.02 * (tau / minLag) ** 0.5,
      });
    }
    list.sort((x, y) => x.cost - y.cost);
    list.splice(4);
  }
  // Viterbi: trạng thái 0 = không có tiếng, 1..k = ứng viên.
  // Khung càng to thì chọn "không có tiếng" càng đắt (nguyên âm to mà CMND kém thường là giọng rè).
  const unvoiced = (rms: number) => 0.25 + 0.6 * Math.min(1, rms / (0.3 * peak));
  const SWITCH = 0.25;
  const JUMP = 3; // chi phí cho mỗi quãng tám nhảy giữa hai khung liền nhau
  let prevCost = [0];
  let prevStates: (number | null)[] = [null];
  const back: number[][] = [];
  for (let k = 0; k < frames.length; k++) {
    const quiet = frames[k].rms < peak * 0.05;
    const states: (number | null)[] = [null, ...(quiet ? [] : cands[k].map((c) => c.hz))];
    const local = [
      quiet ? 0 : unvoiced(frames[k].rms),
      ...(quiet ? [] : cands[k].map((c) => c.cost)),
    ];
    const cost: number[] = [];
    const from: number[] = [];
    states.forEach((hz, j) => {
      let best = Infinity;
      let arg = 0;
      prevStates.forEach((p, i) => {
        const trans =
          hz == null && p == null
            ? 0
            : hz == null || p == null
              ? SWITCH
              : JUMP * Math.abs(Math.log2(hz / p));
        const c = prevCost[i] + trans;
        if (c < best) {
          best = c;
          arg = i;
        }
      });
      cost.push(best + local[j]);
      from.push(arg);
    });
    back.push(from);
    prevCost = cost;
    prevStates = states;
    (frames[k] as Frame & { _states?: (number | null)[] })._states = states;
  }
  let j = prevCost.indexOf(Math.min(...prevCost));
  for (let k = frames.length - 1; k >= 0; k--) {
    const f = frames[k] as Frame & { _states?: (number | null)[] };
    f.f0 = f._states![j];
    delete f._states;
    j = back[k][j];
  }
  return cleanContour(frames);
}

/** Bỏ khung có tiếng đứng lẻ (≤ 2 khung), làm mượt trung vị 5 khung. Nhảy quãng tám đã do Viterbi lo. */
function cleanContour(frames: Frame[]): Frame[] {
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].f0 == null) continue;
    let j = i;
    while (j < frames.length && frames[j].f0 != null) j++;
    if (j - i <= 2) for (let k = i; k < j; k++) frames[k].f0 = null;
    i = j;
  }
  const raw = frames.map((f) => f.f0);
  return frames.map((f, i) => {
    if (raw[i] == null) return f;
    const window = raw.slice(Math.max(0, i - 2), i + 3).filter((v): v is number => v != null);
    return { ...f, f0: median(window) };
  });
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/** Hz → nửa cung so với mốc (thường là cao độ trung vị của người nói). */
export const semitones = (hz: number, refHz: number) => 12 * Math.log2(hz / refHz);

/**
 * Tách `count` âm tiết: lấy các đoạn có thanh (nối khoảng hở ≤ 40 ms, bỏ đoạn < 60 ms); nhiều hơn cần thì
 * gộp hai đoạn sát nhau nhất, ít hơn thì cắt đoạn dài nhất ở chỗ năng lượng thấp nhất (phần giữa).
 */
export function segmentSyllables(frames: Frame[], count: number): Frame[][] {
  let runs: [number, number][] = [];
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].f0 == null) continue;
    let j = i;
    while (j < frames.length && frames[j].f0 != null) j++;
    const last = runs.at(-1);
    if (last && i - last[1] <= 4) last[1] = j;
    else runs.push([i, j]);
    i = j;
  }
  runs = runs.filter(([a, b]) => b - a >= 6);
  if (!runs.length) return [];
  while (runs.length > count) {
    let best = 1;
    for (let k = 2; k < runs.length; k++)
      if (runs[k][0] - runs[k - 1][1] < runs[best][0] - runs[best - 1][1]) best = k;
    runs.splice(best - 1, 2, [runs[best - 1][0], runs[best][1]]);
  }
  while (runs.length < count) {
    let longest = 0;
    for (let k = 1; k < runs.length; k++)
      if (runs[k][1] - runs[k][0] > runs[longest][1] - runs[longest][0]) longest = k;
    const [a, b] = runs[longest];
    if (b - a < 12) break;
    // Điểm cắt: năng lượng thấp nhất (đã làm mượt) trong 25–75% đoạn.
    let cut = a + Math.floor((b - a) / 2);
    let low = Infinity;
    for (let i = a + Math.floor((b - a) * 0.25); i < a + Math.ceil((b - a) * 0.75); i++) {
      const e = (frames[i - 1].rms + frames[i].rms + frames[i + 1].rms) / 3;
      if (e < low) {
        low = e;
        cut = i;
      }
    }
    runs.splice(longest, 1, [a, cut], [cut, b]);
  }
  return runs.map(([a, b]) => frames.slice(a, b));
}

/** Đường cao độ của âm tiết (nửa cung so với mốc), cắt 15% đầu/10% cuối, lấy lại `points` điểm. */
export function syllableShape(frames: Frame[], refHz: number, points = 10): number[] {
  const voiced = frames.filter((f) => f.f0 != null).map((f) => semitones(f.f0!, refHz));
  const a = Math.floor(voiced.length * 0.15);
  const b = Math.max(a + 2, Math.ceil(voiced.length * 0.9));
  const core = voiced.slice(a, b);
  return Array.from({ length: points }, (_, i) => {
    const x = (i * (core.length - 1)) / (points - 1);
    const lo = Math.floor(x);
    const hi = Math.min(core.length - 1, lo + 1);
    return core[lo] + (core[hi] - core[lo]) * (x - lo);
  });
}

/** Mẫu thanh theo thang Chao, đổi ra nửa cung: mức 3 = mốc, mỗi mức ≈ 2 nửa cung. */
const chao = (levels: number[], points = 10) =>
  Array.from({ length: points }, (_, i) => {
    const x = (i * (levels.length - 1)) / (points - 1);
    const lo = Math.floor(x);
    const hi = Math.min(levels.length - 1, lo + 1);
    return (levels[lo] + (levels[hi] - levels[lo]) * (x - lo) - 3) * 2;
  });
export const TEMPLATES: Template[] = [
  { tone: 1, name: "55", shape: chao([5, 5]) },
  { tone: 2, name: "35", shape: chao([3, 3, 4, 5]) },
  { tone: 3, name: "214", shape: chao([2, 1, 1, 3]) },
  { tone: 3, name: "21", shape: chao([2, 1, 1]) },
  { tone: 4, name: "51", shape: chao([5, 3, 1]) },
];

export type ToneGuess = {
  tone: Tone;
  distance: number;
  scores: Record<number, number>;
  shape: number[];
};

/**
 * So hình dáng với mẫu. `useLevel`: mốc là cao độ trung vị của người nói (đã hiệu chỉnh), nên mức cao/thấp
 * có nghĩa (thanh 1 cao, thanh 3 thấp). Không có mốc thì chỉ so hình dáng: trừ trung bình cả hai bên và cho
 * co giãn biên độ 0,5–2×.
 */
export type Template = { tone: Tone; name: string; shape: number[] };

export function classifyShape(
  shape: number[],
  useLevel: boolean,
  templates: Template[] = TEMPLATES,
): ToneGuess {
  const scores: Record<number, number> = {};
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  for (const t of templates) {
    let x = shape;
    let y = t.shape;
    let scale = 1;
    if (!useLevel) {
      const mx = mean(x);
      const my = mean(y);
      x = x.map((v) => v - mx);
      y = y.map((v) => v - my);
      const yy = y.reduce((s, v) => s + v * v, 0);
      scale =
        yy < 1e-6 ? 1 : Math.max(0.5, Math.min(2, x.reduce((s, v, i) => s + v * y[i], 0) / yy));
    }
    const d = Math.sqrt(mean(x.map((v, i) => (v - scale * y[i]) ** 2)));
    scores[t.tone] = Math.min(scores[t.tone] ?? Infinity, d);
  }
  const best = (Object.entries(scores) as [string, number][]).sort((a, b) => a[1] - b[1])[0];
  return { tone: Number(best[0]) as Tone, distance: best[1], scores, shape };
}

export type Analysis = {
  frames: Frame[];
  segments: Frame[][];
  refHz: number;
  syllables: ToneGuess[];
  ms: number;
};

/**
 * Phân tích một bản thu: `count` âm tiết, `speakerHz` = cao độ trung vị của người nói (hiệu chỉnh trước);
 * không có thì lấy trung vị của chính bản thu và chỉ so hình dáng.
 */
export function analyze(
  samples: Float32Array,
  sampleRate: number,
  count: number,
  speakerHz?: number,
  templates?: Template[],
): Analysis {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const frames = pitchTrack(samples, sampleRate);
  const voiced = frames.map((f) => f.f0).filter((v): v is number => v != null);
  const refHz = speakerHz ?? (voiced.length ? median(voiced) : 200);
  const segments = segmentSyllables(frames, count);
  const syllables = segments.map((seg) =>
    classifyShape(syllableShape(seg, refHz), speakerHz != null, templates),
  );
  const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - started;
  return { frames, segments, refHz, syllables, ms };
}

/**
 * Thanh thực tế cần đọc từ thanh gốc: 3 + 3 → 2 + 3 (tính từ phải sang trái cho chuỗi 3);
 * 不 trước thanh 4 → 2; 一 trước thanh 4 → 2, trước 1/2/3 → 4. Thanh nhẹ (5) giữ nguyên.
 */
export function surfaceTones(tones: Tone[], chars?: string): Tone[] {
  const out = [...tones];
  for (let i = out.length - 2; i >= 0; i--) if (tones[i] === 3 && out[i + 1] === 3) out[i] = 2;
  if (chars)
    for (let i = 0; i + 1 < out.length; i++) {
      if (chars[i] === "不" && tones[i + 1] === 4) out[i] = 2;
      if (chars[i] === "一") out[i] = tones[i + 1] === 4 ? 2 : tones[i + 1] === 5 ? out[i] : 4;
    }
  return out;
}
