import { describe, expect, it } from "vitest";
import { CURVE_POINTS, CURVE_RANGE, pitchCurves } from "./pitch";

const RATE = 16_000;

/** Âm có hài, cao độ đổi tuyến tính từ `fromHz` tới `toHz`. */
function sweep(fromHz: number, toHz: number, seconds: number): Float32Array {
  const samples = new Float32Array(Math.round(RATE * seconds));
  let phase = 0;
  for (let i = 0; i < samples.length; i++) {
    const hz = fromHz + ((toHz - fromHz) * i) / samples.length;
    phase += (2 * Math.PI * hz) / RATE;
    samples[i] = 0.3 * Math.sin(phase) + 0.15 * Math.sin(2 * phase) + 0.08 * Math.sin(3 * phase);
  }
  return samples;
}

function join(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const silence = (seconds: number) => new Float32Array(Math.round(RATE * seconds));

describe("pitchCurves", () => {
  it("giọng đi lên thì đường đi lên, đi xuống thì đi xuống", () => {
    const rising = pitchCurves(sweep(160, 280, 0.5), RATE, 1)![0]!;
    const falling = pitchCurves(sweep(280, 160, 0.5), RATE, 1)![0]!;
    expect(rising).toHaveLength(CURVE_POINTS);
    expect(rising.at(-1)!).toBeGreaterThan(rising[0]! + 3);
    expect(falling.at(-1)!).toBeLessThan(falling[0]! - 3);
  });

  it("đường phẳng thì gần mốc", () => {
    const flat = pitchCurves(sweep(200, 200, 0.5), RATE, 1)![0]!;
    for (const value of flat) expect(Math.abs(value)).toBeLessThan(1);
  });

  it("giọng trầm và giọng cao cùng hình dáng thì đường gần nhau", () => {
    const high = pitchCurves(sweep(220, 330, 0.5), RATE, 1)![0]!;
    const low = pitchCurves(sweep(110, 165, 0.5), RATE, 1)![0]!;
    high.forEach((value, index) => expect(Math.abs(value - low[index]!)).toBeLessThan(1));
  });

  it("tách được hai âm tiết có khoảng lặng", () => {
    const curves = pitchCurves(
      join(sweep(180, 260, 0.35), silence(0.12), sweep(260, 170, 0.35)),
      RATE,
      2,
    )!;
    expect(curves).toHaveLength(2);
    expect(curves[0]!.at(-1)!).toBeGreaterThan(curves[0]![0]!);
    expect(curves[1]!.at(-1)!).toBeLessThan(curves[1]![0]!);
  });

  it("giới hạn trong khung vẽ", () => {
    const curve = pitchCurves(sweep(80, 450, 0.5), RATE, 1)![0]!;
    for (const value of curve) expect(Math.abs(value)).toBeLessThanOrEqual(CURVE_RANGE);
  });

  it("im lặng hoặc không đủ âm tiết thì không vẽ", () => {
    expect(pitchCurves(silence(1), RATE, 1)).toBeNull();
    expect(pitchCurves(sweep(200, 200, 0.1), RATE, 3)).toBeNull();
    expect(pitchCurves(sweep(200, 200, 0.5), RATE, 0)).toBeNull();
  });
});
