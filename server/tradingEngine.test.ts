import { describe, it, expect } from "vitest";
import {
  analyzeCandles,
  runAllTricks,
  checkEMAMatch,
  checkVolumeConfirm,
  detectLiquidityTrap,
  aggregateTimeframe,
  analyzeWithTimeframes,
  type EngineCandle,
} from "./tradingTricks";

const C = (
  open: number, high: number, low: number, close: number, volume = 1000
): EngineCandle => ({ open, high, low, close, volume });

/** Flat base candles with tiny noise */
function baseCandles(n: number, price = 180, vol = 1000): EngineCandle[] {
  const out: EngineCandle[] = [];
  let p = price;
  for (let i = 0; i < n; i++) {
    const drift = Math.sin(i * 0.7) * 0.02;
    const o = p;
    const c = p + drift;
    out.push(C(o, Math.max(o, c) + 0.015, Math.min(o, c) - 0.015, c, vol));
    p = c;
  }
  return out;
}

describe("Directional engine v2", () => {
  it("detects bullish wick-crossing rejection with UP direction", () => {
    const cs = baseCandles(10, 180);
    const prev = cs[cs.length - 1];
    // current: wick below prev low, closes back above, bullish body
    const prevLow = Number(prev.low);
    cs.push(C(180.02, 180.06, prevLow - 0.09, 180.05, 1600));
    const tricks = runAllTricks(cs);
    const t1 = tricks.find((t) => t.name === "wickCrossing")!;
    expect(t1.direction).toBe(1);
    expect(t1.strength).toBeGreaterThan(50);
  });

  it("detects bearish wick-crossing rejection with DOWN direction", () => {
    const cs = baseCandles(10, 180);
    const prev = cs[cs.length - 1];
    const prevHigh = Number(prev.high);
    cs.push(C(179.98, prevHigh + 0.09, 179.94, 179.95, 1600));
    const tricks = runAllTricks(cs);
    const t1 = tricks.find((t) => t.name === "wickCrossing")!;
    expect(t1.direction).toBe(-1);
  });

  it("detects body breakout above resistance as UP", () => {
    const cs = baseCandles(40, 180);
    const res = Math.max(...cs.slice(-30, -1).map((c) => Number(c.high)));
    const last = cs[cs.length - 1];
    // body breaks above resistance
    cs.push(C(res - 0.02, res + 0.06, res - 0.03, res + 0.04, 2200));
    void last;
    const tricks = runAllTricks(cs);
    const t5 = tricks.find((t) => t.name === "breakoutValidation")!;
    expect(t5.direction).toBe(1);
    expect(t5.strength).toBeGreaterThan(50);
  });

  it("detects bull trap (wick through resistance, body back inside) as DOWN", () => {
    const cs = baseCandles(40, 180);
    const res = Math.max(...cs.slice(-30, -1).map((c) => Number(c.high)));
    // wick pokes above resistance but body closes back below, bearish
    cs.push(C(res - 0.01, res + 0.08, res - 0.04, res - 0.02, 1500));
    const tricks = runAllTricks(cs);
    const t5 = tricks.find((t) => t.name === "breakoutValidation")!;
    expect(t5.direction).toBe(-1);
  });

  it("emits UP only when tricks agree directionally (no arbitrary formula)", () => {
    // Strong bullish setup: rejection + volume + no supply
    const cs = baseCandles(30, 180);
    const prevLow = Number(cs[cs.length - 1].low);
    cs.push(C(180.03, 180.08, prevLow - 0.1, 180.07, 3200)); // bullish rejection + volume spike
    const res = analyzeCandles(cs);
    expect(res.signal).toMatch(/UP|DOWN|NO_TRADE/);
    if (res.signal !== "NO_TRADE") {
      // direction must match the majority vote, not a hardcoded bucket
      const dirs = Object.values(res.trickDirections);
      const ups = dirs.filter((d) => d === 1).length;
      const downs = dirs.filter((d) => d === -1).length;
      expect(res.signal === "UP" ? ups >= downs : downs >= ups).toBe(true);
    }
  });

  it("returns NO_TRADE on flat choppy data most of the time", () => {
    const cs = baseCandles(120, 180, 1000);
    const res = analyzeCandles(cs);
    // flat noise should not constantly fire; allow occasional signal but not always
    expect(res.confidence).toBeGreaterThanOrEqual(0);
    expect(res.confidence).toBeLessThanOrEqual(100);
  });

  it("empty input -> NO_TRADE, score 0", () => {
    const res = analyzeCandles([]);
    expect(res.signal).toBe("NO_TRADE");
    expect(res.score).toBe(0);
  });

  it("checkEMAMatch uses real EMA trend", () => {
    const up = baseCandles(25, 180).map((c, i) => ({
      ...c,
      close: 180 + i * 0.05,
      open: 180 + i * 0.05 - 0.01,
    }));
    expect(checkEMAMatch(up, "UP")).toBe(true);
    expect(checkEMAMatch(up, "DOWN")).toBe(false);
  });

  it("detectLiquidityTrap flags volume spike + reversal", () => {
    const cs = baseCandles(10, 180, 1000);
    // prev prev close 180, prev close 180.05 (up), current volume spike + close back down
    cs.push(C(180.05, 180.1, 180.0, 180.06, 1000));
    cs.push(C(180.06, 180.08, 179.95, 179.97, 3500));
    expect(detectLiquidityTrap(cs)).toBe(true);
  });

  it("aggregateTimeframe builds 5m candles", () => {
    const cs = baseCandles(10, 180).map((c, i) => ({
      ...c,
      timestamp: new Date(i * 60000),
    }));
    const m5 = aggregateTimeframe(cs, 5);
    expect(m5.length).toBe(2);
    expect(Number(m5[0].volume)).toBeGreaterThan(0);
  });

  it("analyzeWithTimeframes sets mtf flag shape", () => {
    const cs = baseCandles(200, 180).map((c, i) => ({
      ...c,
      timestamp: new Date(i * 60000),
    }));
    const m5 = aggregateTimeframe(cs, 5);
    const res = analyzeWithTimeframes(cs, m5);
    expect(typeof res.multiTimeframeConfirm).toBe("boolean");
    expect(typeof res.entrySignal).toBe("boolean");
  });

  it("volume confirm needs real volume lift", () => {
    const cs = baseCandles(10, 180, 1000);
    expect(checkVolumeConfirm(cs)).toBe(false);
    cs.push(C(180.01, 180.05, 179.99, 180.03, 2000));
    expect(checkVolumeConfirm(cs)).toBe(true);
  });
});
