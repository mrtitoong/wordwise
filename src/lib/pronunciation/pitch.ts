/**
 * Đo đường cao độ (F0) trong trình duyệt để người học tự so thanh điệu với mẫu (chốt Z4). Không chấm:
 * trên giọng lạ chỉ nhận đúng ~54% âm tiết và báo nhầm ~3/10 bản đọc đúng (docs/zh-spike.md §1b), nên
 * chỉ vẽ, không nhận xét. Hàm thuần, chuyển từ spikes/tone-pitch/pitch.ts.
 *
 * Các bước: YIN cho vài ứng viên mỗi khung 10 ms → Viterbi chọn đường liền mạch (giống pYIN, chịu được
 * giọng rè cuối thanh 3, thanh 4) → làm mượt → tách âm tiết → đổi sang nửa cung so với cao độ giữa của
 * chính người nói, nhờ vậy giọng nam so được với mẫu giọng nữ.
 */

type Frame = { f0: number | null; rms: number };
type Candidate = { hz: number; cost: number };

const HOP_MS = 10;
/** Số điểm vẽ mỗi âm tiết. */
export const CURVE_POINTS = 10;
/** Giới hạn trục dọc (nửa cung). */
export const CURVE_RANGE = 8;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  return sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function candidatesAt(
  samples: Float32Array,
  start: number,
  win: number,
  minLag: number,
  maxLag: number,
  sampleRate: number,
  diff: Float32Array,
): Candidate[] {
  diff[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxLag + 1; tau++) {
    let sum = 0;
    for (let i = 0; i < win; i++) {
      const d = samples[start + i]! - samples[start + i + tau]!;
      sum += d * d;
    }
    running += sum;
    diff[tau] = running === 0 ? 1 : (sum * tau) / running;
  }
  const list: Candidate[] = [];
  for (let tau = Math.max(2, minLag); tau <= maxLag; tau++) {
    const b = diff[tau]!;
    const a = diff[tau - 1]!;
    const c = diff[tau + 1]!;
    if (b > 0.6 || b > a || b > c) continue;
    const shift = a + c - 2 * b === 0 ? 0 : (a - c) / (2 * (a + c - 2 * b));
    list.push({
      hz: sampleRate / (tau + Math.max(-0.5, Math.min(0.5, shift))),
      // Ưu tiên nhẹ chu kỳ ngắn để tránh chọn bội số chu kỳ (quãng tám thấp hơn).
      cost: b + 0.02 * (tau / minLag) ** 0.5,
    });
  }
  return list.sort((x, y) => x.cost - y.cost).slice(0, 4);
}

/** Bỏ khung có tiếng đứng lẻ (≤ 2 khung), làm mượt trung vị 5 khung. */
function cleanContour(frames: Frame[]): Frame[] {
  for (let i = 0; i < frames.length; i++) {
    if (frames[i]!.f0 == null) continue;
    let j = i;
    while (j < frames.length && frames[j]!.f0 != null) j++;
    if (j - i <= 2) for (let k = i; k < j; k++) frames[k]!.f0 = null;
    i = j;
  }
  const raw = frames.map((frame) => frame.f0);
  return frames.map((frame, i) => {
    if (raw[i] == null) return frame;
    const near = raw.slice(Math.max(0, i - 2), i + 3).filter((v): v is number => v != null);
    return { ...frame, f0: median(near) };
  });
}

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
  const candidates: Candidate[][] = [];
  const diff = new Float32Array(maxLag + 2);
  let peak = 0;
  for (let start = 0; start + win + maxLag + 1 < samples.length; start += hop) {
    let energy = 0;
    for (let i = 0; i < win; i++) energy += samples[start + i]! ** 2;
    const rms = Math.sqrt(energy / win);
    peak = Math.max(peak, rms);
    frames.push({ f0: null, rms });
    candidates.push(
      rms < 1e-3 ? [] : candidatesAt(samples, start, win, minLag, maxLag, sampleRate, diff),
    );
  }

  // Viterbi: trạng thái 0 = không có tiếng, còn lại là ứng viên. Khung càng to thì chọn "không có
  // tiếng" càng đắt (nguyên âm to mà độ tuần hoàn kém thường là giọng rè).
  const unvoiced = (rms: number) => 0.25 + 0.6 * Math.min(1, rms / (0.3 * peak));
  const SWITCH = 0.25;
  const JUMP = 3;
  let previousCost = [0];
  let previousStates: (number | null)[] = [null];
  const history: { states: (number | null)[]; from: number[] }[] = [];
  frames.forEach((frame, index) => {
    const quiet = frame.rms < peak * 0.05;
    const own = quiet ? [] : candidates[index]!;
    const states: (number | null)[] = [null, ...own.map((c) => c.hz)];
    const local = [quiet ? 0 : unvoiced(frame.rms), ...own.map((c) => c.cost)];
    const cost: number[] = [];
    const from: number[] = [];
    states.forEach((hz, j) => {
      let best = Infinity;
      let arg = 0;
      previousStates.forEach((previous, i) => {
        const move =
          hz == null && previous == null
            ? 0
            : hz == null || previous == null
              ? SWITCH
              : JUMP * Math.abs(Math.log2(hz / previous));
        const total = previousCost[i]! + move;
        if (total < best) {
          best = total;
          arg = i;
        }
      });
      cost.push(best + local[j]!);
      from.push(arg);
    });
    history.push({ states, from });
    previousCost = cost;
    previousStates = states;
  });
  let state = previousCost.indexOf(Math.min(...previousCost));
  for (let k = frames.length - 1; k >= 0; k--) {
    const step = history[k]!;
    frames[k]!.f0 = step.states[state] ?? null;
    state = step.from[state]!;
  }
  return cleanContour(frames);
}

/**
 * Tách `count` âm tiết: lấy các đoạn có thanh (nối khoảng hở ≤ 40 ms, bỏ đoạn < 60 ms); nhiều hơn cần
 * thì gộp hai đoạn sát nhau nhất, ít hơn thì cắt đoạn dài nhất ở chỗ năng lượng thấp nhất.
 */
function segmentSyllables(frames: readonly Frame[], count: number): Frame[][] {
  let runs: [number, number][] = [];
  for (let i = 0; i < frames.length; i++) {
    if (frames[i]!.f0 == null) continue;
    let j = i;
    while (j < frames.length && frames[j]!.f0 != null) j++;
    const last = runs.at(-1);
    if (last && i - last[1] <= 4) last[1] = j;
    else runs.push([i, j]);
    i = j;
  }
  runs = runs.filter(([a, b]) => b - a >= 6);
  if (!runs.length) return [];
  while (runs.length > count) {
    let best = 1;
    for (let k = 2; k < runs.length; k++) {
      if (runs[k]![0] - runs[k - 1]![1] < runs[best]![0] - runs[best - 1]![1]) best = k;
    }
    runs.splice(best - 1, 2, [runs[best - 1]![0], runs[best]![1]]);
  }
  while (runs.length < count) {
    let longest = 0;
    for (let k = 1; k < runs.length; k++) {
      if (runs[k]![1] - runs[k]![0] > runs[longest]![1] - runs[longest]![0]) longest = k;
    }
    const [a, b] = runs[longest]!;
    if (b - a < 12) break;
    let cut = a + Math.floor((b - a) / 2);
    let low = Infinity;
    for (let i = a + Math.floor((b - a) * 0.25); i < a + Math.ceil((b - a) * 0.75); i++) {
      const energy = (frames[i - 1]!.rms + frames[i]!.rms + frames[i + 1]!.rms) / 3;
      if (energy < low) {
        low = energy;
        cut = i;
      }
    }
    runs.splice(longest, 1, [a, cut], [cut, b]);
  }
  return runs.map(([a, b]) => frames.slice(a, b));
}

/** Đường cao độ của một âm tiết: bỏ 15% đầu, 10% cuối, lấy lại CURVE_POINTS điểm. */
function syllableShape(frames: readonly Frame[], refHz: number): number[] {
  const voiced = frames.flatMap((f) => (f.f0 == null ? [] : [12 * Math.log2(f.f0 / refHz)]));
  const from = Math.floor(voiced.length * 0.15);
  const to = Math.max(from + 2, Math.ceil(voiced.length * 0.9));
  const core = voiced.slice(from, to);
  return Array.from({ length: CURVE_POINTS }, (_, i) => {
    const x = (i * (core.length - 1)) / (CURVE_POINTS - 1);
    const lo = Math.floor(x);
    const hi = Math.min(core.length - 1, lo + 1);
    const value = core[lo]! + (core[hi]! - core[lo]!) * (x - lo);
    return Math.max(-CURVE_RANGE, Math.min(CURVE_RANGE, value));
  });
}

/**
 * Đường cao độ từng âm tiết, tính bằng nửa cung so với cao độ giữa của người nói. null khi không đo
 * được đủ số âm tiết (ồn, đọc quá khẽ).
 */
export function pitchCurves(
  samples: Float32Array,
  sampleRate: number,
  syllables: number,
): number[][] | null {
  if (syllables < 1) return null;
  const frames = pitchTrack(samples, sampleRate);
  const voiced = frames.flatMap((frame) => (frame.f0 == null ? [] : [frame.f0]));
  if (voiced.length < 6) return null;
  const parts = segmentSyllables(frames, syllables);
  if (parts.length !== syllables) return null;
  const refHz = median(voiced);
  return parts.map((part) => syllableShape(part, refHz));
}
