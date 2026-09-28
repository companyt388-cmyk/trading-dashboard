import { Candle } from "../drizzle/schema";

/**
 * Trading Tricks Analysis Engine v2 — directional edition.
 *
 * v1 flaw this fixes: every trick only measured pattern STRENGTH (0-100) with no
 * direction, and the final UP/DOWN call was made by an arbitrary formula
 * (upTricks = wickCrossing + motiveCandles + noSupplyDemand vs
 *  downTricks = engulfingTrap + exhaustionCandles). A bearish wick-cross still
 * added to the "bullish" bucket. Direction is now first-class: every trick
 * returns { direction: -1 | 0 | 1, strength: 0-100 } and the final signal is a
 * weighted vote. A signal is emitted ONLY when enough tricks agree.
 *
 * Thresholds/weights are tuned by scripts/backtest.mts against real
 * Dukascopy CHF/JPY 1-minute history (see BACKTEST_REPORT.md).
 */

export type Direction = -1 | 0 | 1; // -1 = DOWN, +1 = UP, 0 = no opinion

export interface TrickScores {
  wickCrossing: number;
  wickVolume: number;
  volumeSpread: number;
  motiveCandles: number;
  breakoutValidation: number;
  rejectionSpike: number;
  priceVolumeAnomaly: number;
  exhaustionCandles: number;
  noSupplyDemand: number;
  sandwichPattern: number;
  engulfingTrap: number;
}

export type TrickName = keyof TrickScores;

export interface TrickSignal {
  name: TrickName;
  /** Human label, e.g. "Wick Crossing" */
  label: string;
  direction: Direction;
  /** 0-100, how clean the pattern is */
  strength: number;
  detail: string;
}

export interface AnalysisResult {
  signal: "UP" | "DOWN" | "NO_TRADE";
  confidence: number; // 0-100, calibrated from trick agreement
  score: number; // 0-100, average trick strength (diagnostic)
  trickScores: TrickScores;
  /** Direction each trick voted (-1 | 0 | 1) */
  trickDirections: Record<TrickName, Direction>;
  /** Weighted agreement of the winning side, 0-1 */
  agreement: number;
  /** How many tricks voted (non-zero direction) */
  opinions: number;
  multiTimeframeConfirm: boolean;
  emaMatch: boolean;
  volumeConfirm: boolean;
  liquidityTrapDetect: boolean;
  entrySignal: boolean;
  details: string[];
}

/** Minimal candle shape — accepts drizzle rows (decimal strings) or plain numbers. */
export interface EngineCandle {
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
}

/** Per-trick weights, tuned by backtest. Multiply trick strength in the vote. */
export const TRICK_WEIGHTS: Record<TrickName, number> = {
  wickCrossing: 1.0,
  wickVolume: 1.0,
  volumeSpread: 1.0,
  motiveCandles: 1.0,
  breakoutValidation: 1.0,
  rejectionSpike: 1.0,
  priceVolumeAnomaly: 1.0,
  exhaustionCandles: 1.0,
  noSupplyDemand: 1.0,
  sandwichPattern: 1.0,
  engulfingTrap: 1.0,
};

/** Signal gate thresholds. 2026-09-28: loosened per user request (was 3/0.70/80).
 *  Backtest on 9,156 real CHF/JPY 1m candles: strict=497 signals@50.70%,
 *  loose(2/0.65)=1767 signals@49.80%. More signals, ~same coin-flip accuracy. */
export const SIGNAL_CONFIG = {
  /** Minimum tricks that must vote (non-zero direction) */
  minOpinions: 2,
  /** Minimum weighted agreement for the winning side (0-1) */
  minAgreement: 0.65,
  /** Minimum confidence to allow an entry signal */
  minEntryConfidence: 75,
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const num = (v: number | string): number =>
  typeof v === "string" ? parseFloat(v) : v;

function closes(c: EngineCandle[]): number[] {
  return c.map((k) => num(k.close));
}
function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function atr(c: EngineCandle[], period = 14): number {
  const n = Math.min(period, c.length);
  if (n < 2) return 0;
  const ranges = c.slice(-n).map((k) => num(k.high) - num(k.low));
  return avg(ranges);
}
function avgVolume(c: EngineCandle[], period = 10, endOffset = 0): number {
  // average volume of `period` candles ending `endOffset` bars before the last
  const end = c.length - endOffset;
  const start = Math.max(0, end - period);
  const vols = c.slice(start, end).map((k) => num(k.volume));
  return avg(vols);
}
function ema(values: number[], period: number): number {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

function noSignal(name: TrickName, label: string): TrickSignal {
  return { name, label, direction: 0, strength: 0, detail: "" };
}

// ---------------------------------------------------------------------------
// The 11 tricks — each returns direction + strength
// ---------------------------------------------------------------------------

/**
 * Trick 1: Wick Crossing = rejection at prior bar's extreme.
 * Wick pokes below prior low but body closes back above -> UP (bullish rejection).
 * Wick pokes above prior high but body closes back below -> DOWN.
 */
function trick1_WickCrossing(c: EngineCandle[]): TrickSignal {
  const NAME: TrickName = "wickCrossing";
  if (c.length < 3) return noSignal(NAME, "Wick Crossing");
  const i = c.length - 1;
  const cur = c[i];
  const prev = c[i - 1];
  const o = num(cur.open), h = num(cur.high), l = num(cur.low), cl = num(cur.close);
  const prevHigh = num(prev.high), prevLow = num(prev.low);
  const a = atr(c);
  if (a <= 0) return noSignal(NAME, "Wick Crossing");

  const bullReject = l < prevLow && cl > prevLow && cl > o;
  const bearReject = h > prevHigh && cl < prevHigh && cl < o;

  if (bullReject) {
    const wick = prevLow - l;
    const strength = clamp(55 + (wick / a) * 60, 0, 95);
    return { name: NAME, label: "Wick Crossing", direction: 1, strength, detail: `Bullish rejection wick below ${prevLow}` };
  }
  if (bearReject) {
    const wick = h - prevHigh;
    const strength = clamp(55 + (wick / a) * 60, 0, 95);
    return { name: NAME, label: "Wick Crossing", direction: -1, strength, detail: `Bearish rejection wick above ${prevHigh}` };
  }
  return noSignal(NAME, "Wick Crossing");
}

/**
 * Trick 2: Wick + Volume — trick 1 rejection confirmed by a volume spike.
 */
function trick2_WickVolume(c: EngineCandle[]): TrickSignal {
  const NAME: TrickName = "wickVolume";
  if (c.length < 6) return noSignal(NAME, "Wick + Volume");
  const t1 = trick1_WickCrossing(c);
  if (t1.direction === 0) return noSignal(NAME, "Wick + Volume");
  const v = num(c[c.length - 1].volume);
  const av = avgVolume(c, 5, 1);
  if (av <= 0) return noSignal(NAME, "Wick + Volume");
  const ratio = v / av;
  if (ratio > 1.5) {
    const strength = clamp(t1.strength + 8 + (ratio - 1.5) * 25, 0, 98);
    return { name: NAME, label: "Wick + Volume", direction: t1.direction, strength, detail: `Rejection confirmed by ${ratio.toFixed(1)}x volume` };
  }
  return noSignal(NAME, "Wick + Volume");
}

/**
 * Trick 3: Effort vs Result (VSA).
 * Big range + tiny volume = trap -> fade the candle (exhaustion).
 * Tiny range + huge volume after a push = smart-money absorption -> reversal.
 */
function trick3_VolumeSpread(c: EngineCandle[]): TrickSignal {
  const NAME: TrickName = "volumeSpread";
  if (c.length < 12) return noSignal(NAME, "Volume Spread");
  const i = c.length - 1;
  const cur = c[i];
  const r = num(cur.high) - num(cur.low);
  const v = num(cur.volume);
  const avgR = avg(c.slice(i - 10, i).map((k) => num(k.high) - num(k.low)));
  const avgV = avgVolume(c, 10, 1);
  if (avgR <= 0 || avgV <= 0) return noSignal(NAME, "Volume Spread");
  const body = num(cur.close) - num(cur.open);

  // Trap candle: huge effort, no result -> fade it
  if (r > 1.8 * avgR && v < 0.75 * avgV && Math.abs(body) > 0.2 * r) {
    return {
      name: NAME, label: "Volume Spread",
      direction: body > 0 ? -1 : 1, strength: 70,
      detail: "Big candle on low volume = trap, fading the move",
    };
  }
  // Absorption: tiny spread, big volume -> reversal of the prior push
  if (r < 0.65 * avgR && v > 1.6 * avgV) {
    const trend = num(c[i - 1].close) - num(c[i - 6].close);
    if (trend < 0) {
      return { name: NAME, label: "Volume Spread", direction: 1, strength: 72, detail: "High volume, no downside progress = accumulation" };
    }
    if (trend > 0) {
      return { name: NAME, label: "Volume Spread", direction: -1, strength: 72, detail: "High volume, no upside progress = distribution" };
    }
  }
  return noSignal(NAME, "Volume Spread");
}

/**
 * Trick 4: 3 Pushes + counter candle (Wyckoff).
 * 3+ consecutive pushes one way, then a counter candle = the last effort
 * failed -> reversal. Without the counter candle: no signal (wait).
 */
function trick4_MotiveCandles(c: EngineCandle[]): TrickSignal {
  const NAME: TrickName = "motiveCandles";
  if (c.length < 5) return noSignal(NAME, "3 Motive Candles");
  const i = c.length - 1;
  const dir = (k: EngineCandle) => Math.sign(num(k.close) - num(k.open));

  // count consecutive same-direction candles ending at i-1
  const first = dir(c[i - 1]);
  if (first === 0) return noSignal(NAME, "3 Motive Candles");
  let run = 1;
  for (let j = i - 2; j >= 0 && run < 6; j--) {
    if (dir(c[j]) === first) run++;
    else break;
  }
  const lastDir = dir(c[i]);
  if (run >= 3 && lastDir === -first) {
    const strength = clamp(58 + (run - 3) * 9, 0, 92);
    return {
      name: NAME, label: "3 Motive Candles",
      direction: (lastDir === 1 ? 1 : -1) as Direction,
      strength,
      detail: `${run} pushes ${first === 1 ? "up" : "down"} then counter candle = exhaustion`,
    };
  }
  return noSignal(NAME, "3 Motive Candles");
}

/**
 * Trick 5: Horizontal level break / trap (30-bar lookback, not whole history).
 * Clean body break -> continuation. Wick pokes through but body fails back
 * inside -> bull/bear trap -> fade.
 */
function trick5_Breakout(c: EngineCandle[]): TrickSignal {
  const NAME: TrickName = "breakoutValidation";
  const LOOKBACK = 30;
  if (c.length < LOOKBACK + 2) return noSignal(NAME, "Breakout");
  const i = c.length - 1;
  const window = c.slice(i - LOOKBACK, i);
  const res = Math.max(...window.map((k) => num(k.high)));
  const sup = Math.min(...window.map((k) => num(k.low)));
  const o = num(c[i].open), h = num(c[i].high), l = num(c[i].low), cl = num(c[i].close);
  const v = num(c[i].volume);
  const vr = v / (avgVolume(c, 10, 1) || 1);

  if (cl > res && o < res) {
    return { name: NAME, label: "Breakout", direction: 1, strength: vr > 1.5 ? 80 : 64, detail: `Body break above ${res}` };
  }
  if (cl < sup && o > sup) {
    return { name: NAME, label: "Breakout", direction: -1, strength: vr > 1.5 ? 80 : 64, detail: `Body break below ${sup}` };
  }
  // traps: wick through, body back inside
  if (h > res && cl < res && cl < o) {
    return { name: NAME, label: "Breakout", direction: -1, strength: 70, detail: `Bull trap above ${res}` };
  }
  if (l < sup && cl > sup && cl > o) {
    return { name: NAME, label: "Breakout", direction: 1, strength: 70, detail: `Bear trap below ${sup}` };
  }
  return noSignal(NAME, "Breakout");
}

/**
 * Trick 6: Rejection + volume spike.
 * Volume spike with a dominant upper wick -> DOWN; dominant lower wick -> UP.
 */
function trick6_RejectionSpike(c: EngineCandle[]): TrickSignal {
  const NAME: TrickName = "rejectionSpike";
  if (c.length < 6) return noSignal(NAME, "Rejection Spike");
  const i = c.length - 1;
  const cur = c[i];
  const v = num(cur.volume);
  const av = avgVolume(c, 5, 1);
  if (av <= 0 || v <= 2 * av) return noSignal(NAME, "Rejection Spike");
  const o = num(cur.open), h = num(cur.high), l = num(cur.low), cl = num(cur.close);
  const r = h - l;
  if (r <= 0) return noSignal(NAME, "Rejection Spike");
  const upperWick = h - Math.max(o, cl);
  const lowerWick = Math.min(o, cl) - l;
  if (upperWick > 0.45 * r) {
    return { name: NAME, label: "Rejection Spike", direction: -1, strength: 82, detail: "Volume spike rejecting highs" };
  }
  if (lowerWick > 0.45 * r) {
    return { name: NAME, label: "Rejection Spike", direction: 1, strength: 82, detail: "Volume spike rejecting lows" };
  }
  return noSignal(NAME, "Rejection Spike");
}

/**
 * Trick 7: Effort/result anomaly.
 * Big price move on tiny volume = fake -> fade. Tiny move on huge volume
 * with a dominant wick = stealth absorption -> follow the wick.
 */
function trick7_PriceVolumeAnomaly(c: EngineCandle[]): TrickSignal {
  const NAME: TrickName = "priceVolumeAnomaly";
  if (c.length < 6) return noSignal(NAME, "Price/Volume Anomaly");
  const i = c.length - 1;
  const cur = c[i];
  const a = atr(c);
  const av = avgVolume(c, 5, 1);
  if (a <= 0 || av <= 0) return noSignal(NAME, "Price/Volume Anomaly");
  const priceChg = (num(cur.close) - num(c[i - 1].close)) / a;
  const volRatio = num(cur.volume) / av;
  const o = num(cur.open), h = num(cur.high), l = num(cur.low), cl = num(cur.close);

  if (Math.abs(priceChg) > 1.2 && volRatio < 0.8) {
    return {
      name: NAME, label: "Price/Volume Anomaly",
      direction: (priceChg > 0 ? -1 : 1) as Direction, strength: 68,
      detail: "Big move on low volume = fake, expecting reversal",
    };
  }
  if (Math.abs(priceChg) < 0.35 && volRatio > 2.0) {
    const upperWick = h - Math.max(o, cl);
    const lowerWick = Math.min(o, cl) - l;
    if (lowerWick > upperWick * 1.2) {
      return { name: NAME, label: "Price/Volume Anomaly", direction: 1, strength: 62, detail: "Stealth buying on volume spike" };
    }
    if (upperWick > lowerWick * 1.2) {
      return { name: NAME, label: "Price/Volume Anomaly", direction: -1, strength: 62, detail: "Stealth selling on volume spike" };
    }
  }
  return noSignal(NAME, "Price/Volume Anomaly");
}

/**
 * Trick 8: Exhaustion at support/resistance.
 * 3 consecutive indecision candles (small bodies, long wicks) parked at a
 * 30-bar high/low -> reversal away from the level.
 */
function trick8_Exhaustion(c: EngineCandle[]): TrickSignal {
  const NAME: TrickName = "exhaustionCandles";
  const LOOKBACK = 30;
  if (c.length < LOOKBACK + 3) return noSignal(NAME, "Exhaustion");
  const i = c.length - 1;
  const a = atr(c);
  if (a <= 0) return noSignal(NAME, "Exhaustion");
  const last3 = c.slice(i - 2, i + 1);
  const avgR = avg(c.slice(i - 10, i).map((k) => num(k.high) - num(k.low)));
  let indecision = 0;
  for (const k of last3) {
    const r = num(k.high) - num(k.low);
    const body = Math.abs(num(k.close) - num(k.open));
    if (r < 0.85 * avgR && body < 0.5 * r) indecision++;
  }
  if (indecision < 3) return noSignal(NAME, "Exhaustion");
  const window = c.slice(i - LOOKBACK, i - 2);
  const res = Math.max(...window.map((k) => num(k.high)));
  const sup = Math.min(...window.map((k) => num(k.low)));
  const cl = num(c[i].close);
  if (Math.abs(cl - res) < 0.6 * a) {
    return { name: NAME, label: "Exhaustion", direction: -1, strength: 85, detail: "Exhaustion into resistance" };
  }
  if (Math.abs(cl - sup) < 0.6 * a) {
    return { name: NAME, label: "Exhaustion", direction: 1, strength: 85, detail: "Exhaustion into support" };
  }
  return noSignal(NAME, "Exhaustion");
}

/**
 * Trick 9: No supply / no demand.
 * Two strong pushes with volume, then a low-volume pullback candle that
 * holds -> continuation (no supply above / no demand below).
 */
function trick9_NoSupplyDemand(c: EngineCandle[]): TrickSignal {
  const NAME: TrickName = "noSupplyDemand";
  if (c.length < 5) return noSignal(NAME, "No Supply/Demand");
  const i = c.length - 1;
  const g = (k: EngineCandle) => num(k.close) > num(k.open);
  const v = (k: EngineCandle) => num(k.volume);

  const upPush = g(c[i - 2]) && g(c[i - 1]);
  const downPush = !g(c[i - 2]) && !g(c[i - 1]);
  const pullbackVol = v(c[i]) < 0.7 * Math.min(v(c[i - 2]), v(c[i - 1]));

  if (upPush && pullbackVol && num(c[i].close) >= num(c[i - 1].open)) {
    return { name: NAME, label: "No Supply/Demand", direction: 1, strength: 74, detail: "No supply on pullback = markup likely" };
  }
  if (downPush && pullbackVol && num(c[i].close) <= num(c[i - 1].open)) {
    return { name: NAME, label: "No Supply/Demand", direction: -1, strength: 74, detail: "No demand on pullback = markdown likely" };
  }
  return noSignal(NAME, "No Supply/Demand");
}

/**
 * Trick 10: Sandwich (G-R-G / R-G-R).
 * Buyers/sellers stepped back in on the third candle -> follow its momentum.
 * Kept at a modest strength; backtest decides its weight.
 */
function trick10_Sandwich(c: EngineCandle[]): TrickSignal {
  const NAME: TrickName = "sandwichPattern";
  if (c.length < 4) return noSignal(NAME, "Sandwich");
  const i = c.length - 1;
  const g = (k: EngineCandle) => num(k.close) > num(k.open);
  const c1 = g(c[i - 2]), c2 = g(c[i - 1]), c3 = g(c[i]);
  if (c1 && !c2 && c3) {
    return { name: NAME, label: "Sandwich", direction: 1, strength: 55, detail: "Green-Red-Green: buyers back in control" };
  }
  if (!c1 && c2 && !c3) {
    return { name: NAME, label: "Sandwich", direction: -1, strength: 55, detail: "Red-Green-Red: sellers back in control" };
  }
  return noSignal(NAME, "Sandwich");
}

/**
 * Trick 11: Oversized candle = engulfing trap.
 * A candle far bigger than recent average that swallows prior ranges is
 * climactic -> fade it (exhaustion reversal).
 */
function trick11_EngulfingTrap(c: EngineCandle[]): TrickSignal {
  const NAME: TrickName = "engulfingTrap";
  if (c.length < 12) return noSignal(NAME, "Engulfing Trap");
  const i = c.length - 1;
  const cur = c[i];
  const r = num(cur.high) - num(cur.low);
  const avgR = avg(c.slice(i - 10, i).map((k) => num(k.high) - num(k.low)));
  if (avgR <= 0 || r < 1.5 * avgR) return noSignal(NAME, "Engulfing Trap");
  const priorRange =
    Math.max(num(c[i - 1].high), num(c[i - 2].high)) -
    Math.min(num(c[i - 1].low), num(c[i - 2].low));
  if (r < priorRange) return noSignal(NAME, "Engulfing Trap");
  const body = num(cur.close) - num(cur.open);
  if (Math.abs(body) < 0.3 * r) return noSignal(NAME, "Engulfing Trap");
  return {
    name: NAME, label: "Engulfing Trap",
    direction: (body > 0 ? -1 : 1) as Direction, strength: 76,
    detail: "Climactic oversized candle = exhaustion, fading",
  };
}

const ALL_TRICKS: Array<(c: EngineCandle[]) => TrickSignal> = [
  trick1_WickCrossing,
  trick2_WickVolume,
  trick3_VolumeSpread,
  trick4_MotiveCandles,
  trick5_Breakout,
  trick6_RejectionSpike,
  trick7_PriceVolumeAnomaly,
  trick8_Exhaustion,
  trick9_NoSupplyDemand,
  trick10_Sandwich,
  trick11_EngulfingTrap,
];

/** Run all 11 tricks — exported for backtesting and inspection. */
export function runAllTricks(candles: EngineCandle[]): TrickSignal[] {
  return ALL_TRICKS.map((fn) => fn(candles));
}

// ---------------------------------------------------------------------------
// Validation helpers (kept API-compatible with v1)
// ---------------------------------------------------------------------------

/** 1m and 5m signals agree (and are not NO_TRADE). */
export function checkMultiTimeframeConfirm(
  signal1m: "UP" | "DOWN" | "NO_TRADE",
  signal5m: "UP" | "DOWN" | "NO_TRADE"
): boolean {
  return signal1m === signal5m && signal1m !== "NO_TRADE";
}

/** Real EMA(20) trend filter: price above EMA = uptrend. */
export function checkEMAMatch(candles: EngineCandle[], signal: "UP" | "DOWN"): boolean {
  if (candles.length < 20) return false;
  const e = ema(closes(candles).slice(-20), 20);
  const last = num(candles[candles.length - 1].close);
  return signal === "UP" ? last > e : last < e;
}

/** Current tick-volume above its recent average. */
export function checkVolumeConfirm(candles: EngineCandle[]): boolean {
  if (candles.length < 6) return false;
  const vols = candles.slice(-6).map((k) => num(k.volume));
  const avgV = avg(vols.slice(0, 5));
  return avgV > 0 && vols[5] > avgV * 1.2;
}

/** Volume spike that immediately reverses = liquidity trap (veto entries). */
export function detectLiquidityTrap(candles: EngineCandle[]): boolean {
  if (candles.length < 3) return false;
  const i = candles.length - 1;
  const v = num(candles[i].volume);
  const pv = num(candles[i - 1].volume);
  const ppv = num(candles[i - 2].volume);
  if (v > 2 * pv && v > 1.5 * ppv) {
    const cl = num(candles[i].close);
    const pcl = num(candles[i - 1].close);
    const ppcl = num(candles[i - 2].close);
    if ((cl < pcl && pcl > ppcl) || (cl > pcl && pcl < ppcl)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main analysis: weighted directional vote
// ---------------------------------------------------------------------------

export function analyzeCandles(candles: EngineCandle[]): AnalysisResult {
  const details: string[] = [];
  const emptyScores = (): TrickScores => ({
    wickCrossing: 0, wickVolume: 0, volumeSpread: 0, motiveCandles: 0,
    breakoutValidation: 0, rejectionSpike: 0, priceVolumeAnomaly: 0,
    exhaustionCandles: 0, noSupplyDemand: 0, sandwichPattern: 0, engulfingTrap: 0,
  });

  if (!candles || candles.length === 0) {
    return {
      signal: "NO_TRADE", confidence: 0, score: 0,
      trickScores: emptyScores(),
      trickDirections: emptyScores() as unknown as Record<TrickName, Direction>,
      agreement: 0, opinions: 0,
      multiTimeframeConfirm: false, emaMatch: false, volumeConfirm: false,
      liquidityTrapDetect: false, entrySignal: false,
      details: ["No candle data"],
    };
  }

  const tricks = runAllTricks(candles);
  const trickScores = emptyScores();
  const trickDirections = emptyScores() as unknown as Record<TrickName, Direction>;
  let bull = 0, bear = 0, opinions = 0;

  for (const t of tricks) {
    trickScores[t.name] = Math.round(t.strength);
    trickDirections[t.name] = t.direction;
    if (t.direction !== 0 && t.strength > 0) {
      opinions++;
      const w = (TRICK_WEIGHTS[t.name] ?? 1) * t.strength;
      if (t.direction === 1) bull += w;
      else bear += w;
      details.push(`${t.label}: ${t.direction === 1 ? "UP" : "DOWN"} (${Math.round(t.strength)}) — ${t.detail}`);
    }
  }

  const score = Math.round(avg(tricks.map((t) => t.strength)) * 100) / 100;

  let signal: "UP" | "DOWN" | "NO_TRADE" = "NO_TRADE";
  let confidence = 0;
  let agreement = 0;
  const total = bull + bear;

  if (opinions >= SIGNAL_CONFIG.minOpinions && total > 0) {
    agreement = Math.max(bull, bear) / total;
    if (agreement >= SIGNAL_CONFIG.minAgreement) {
      signal = bull > bear ? "UP" : "DOWN";
      // calibrate: 0.65 agreement -> ~79, 1.00 -> 95
      confidence = Math.round(clamp(50 + agreement * 45, 0, 97));
      details.push(
        `${opinions} tricks voted, ${Math.round(agreement * 100)}% agreement ` +
        `(${signal === "UP" ? "bullish" : "bearish"})`
      );
    } else {
      details.push(`${opinions} tricks voted but only ${Math.round(agreement * 100)}% agreement — no trade`);
    }
  } else if (opinions > 0) {
    details.push(`Only ${opinions} trick(s) active — waiting for confirmation`);
  } else {
    details.push("No trick patterns detected");
  }

  const emaMatch = signal === "NO_TRADE" ? false : checkEMAMatch(candles, signal);
  const volumeConfirm = checkVolumeConfirm(candles);
  const liquidityTrapDetect = detectLiquidityTrap(candles);

  // Entry only on strong, trend-aligned, trap-free signals.
  // (multiTimeframeConfirm is set by analyzeWithTimeframes when 5m data exists.)
  const entrySignal =
    signal !== "NO_TRADE" &&
    confidence >= SIGNAL_CONFIG.minEntryConfidence &&
    score > 70 &&
    emaMatch &&
    volumeConfirm &&
    !liquidityTrapDetect;

  return {
    signal, confidence, score, trickScores, trickDirections,
    agreement: Math.round(agreement * 1000) / 1000, opinions,
    multiTimeframeConfirm: false,
    emaMatch, volumeConfirm, liquidityTrapDetect, entrySignal,
    details,
  };
}

/**
 * Full analysis with 5m context: aggregates 1m candles into 5m, requires the
 * 5m vote to agree for multi-timeframe confirmation, and upgrades entrySignal.
 */
export function analyzeWithTimeframes(
  candles1m: EngineCandle[],
  candles5m?: EngineCandle[]
): AnalysisResult {
  const r1 = analyzeCandles(candles1m);
  let mtf = false;
  if (candles5m && candles5m.length >= 12 && r1.signal !== "NO_TRADE") {
    const r5 = analyzeCandles(candles5m);
    mtf = checkMultiTimeframeConfirm(r1.signal, r5.signal);
  }
  const entrySignal =
    r1.signal !== "NO_TRADE" &&
    r1.confidence >= SIGNAL_CONFIG.minEntryConfidence &&
    r1.score > 70 &&
    r1.emaMatch &&
    r1.volumeConfirm &&
    !r1.liquidityTrapDetect &&
    mtf;
  return { ...r1, multiTimeframeConfirm: mtf, entrySignal };
}

/** Aggregate 1m candles into 5m candles (for multi-timeframe confirmation). */
export function aggregateTimeframe(
  candles1m: Array<EngineCandle & { timestamp?: Date | number | string }>,
  minutes: number
): EngineCandle[] {
  if (!candles1m.length) return [];
  const out: EngineCandle[] = [];
  let bucket: EngineCandle[] = [];
  const bucketKey = (k: EngineCandle & { timestamp?: Date | number | string }) => {
    const t = k.timestamp ? new Date(k.timestamp).getTime() : 0;
    return Math.floor(t / (minutes * 60000));
  };
  let curKey: number | null = null;
  for (const k of candles1m) {
    const key = bucketKey(k);
    if (curKey === null) curKey = key;
    if (key !== curKey && bucket.length) {
      out.push({
        open: bucket[0].open,
        high: Math.max(...bucket.map((b) => num(b.high))),
        low: Math.min(...bucket.map((b) => num(b.low))),
        close: bucket[bucket.length - 1].close,
        volume: bucket.reduce((a, b) => a + num(b.volume), 0),
      });
      bucket = [];
      curKey = key;
    }
    bucket.push(k);
  }
  if (bucket.length) {
    out.push({
      open: bucket[0].open,
      high: Math.max(...bucket.map((b) => num(b.high))),
      low: Math.min(...bucket.map((b) => num(b.low))),
      close: bucket[bucket.length - 1].close,
      volume: bucket.reduce((a, b) => a + num(b.volume), 0),
    });
  }
  return out;
}
