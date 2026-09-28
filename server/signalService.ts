/**
 * Signal service — the single place that turns live candles into a signal.
 *
 * Fixes vs the old router code:
 *  - The engine now receives REAL 1m candles from candleBuilder (no more
 *    pseudo-candles built from a few spot ticks).
 *  - REMOVED the old override that replaced the engine's NO_TRADE with a raw
 *    trend guess. When the 11 tricks don't agree, the answer is NO_TRADE.
 *    (That override was the #1 accuracy killer: it emitted UP/DOWN on vibes.)
 *  - Every emitted signal is stored in `predictions` and auto-resolved against
 *    the next candle into `accuracyTracking`, so the dashboard shows MEASURED
 *    accuracy, not vibes.
 */
import { getDb } from "./db";
import { predictions, accuracyTracking } from "../drizzle/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { candleService } from "./candleBuilder";
import {
  analyzeWithTimeframes,
  aggregateTimeframe,
  type AnalysisResult,
} from "./tradingTricks";

export interface SignalPayload extends AnalysisResult {
  price: number | null;
  bid: number | null;
  ask: number | null;
  timestamp: Date;
  /** Current forming 1m candle ka open time — trade isi candle par lagta hai. */
  candleTime: Date;
  pair: string;
  timeframe: string;
  activeTricks: number;
  support: number | null;
  resistance: number | null;
  atr: number;
  error?: string;
}

function computeSR(candles: Array<{ high: number; low: number; close: number }>) {
  if (candles.length < 30) return { support: null as number | null, resistance: null as number | null, atr: 0 };
  const window = candles.slice(-30);
  const resistance = Math.max(...window.map((c) => c.high));
  const support = Math.min(...window.map((c) => c.low));
  const atr = window.reduce((a, c) => a + (c.high - c.low), 0) / window.length;
  return { support, resistance, atr };
}

async function recordPrediction(
  pair: string,
  timeframe: string,
  res: AnalysisResult,
  candleTime: Date | null
) {
  try {
    const db = await getDb();
    if (!db || !candleTime) return;
    const [row] = await db
      .insert(predictions)
      .values({
        pair,
        timeframe,
        candleTimestamp: candleTime,
        signal: res.signal,
        confidence: res.confidence.toFixed(2),
        score: res.score.toFixed(2),
        trickScores: res.trickScores,
        multiTimeframeConfirm: res.multiTimeframeConfirm ? 1 : 0,
        emaMatch: res.emaMatch ? 1 : 0,
        volumeConfirm: res.volumeConfirm ? 1 : 0,
        liquidityTrapDetect: res.liquidityTrapDetect ? 1 : 0,
        entrySignal: res.entrySignal ? 1 : 0,
      })
      .$returningId();
    if (row && res.signal !== "NO_TRADE") {
      await db.insert(accuracyTracking).values({
        pair,
        timeframe,
        predictionId: row.id,
        predictedSignal: res.signal,
        confidence: res.confidence.toFixed(2),
      });
    }
  } catch {
    /* accuracy tracking is best-effort */
  }
}

/** Resolve open predictions whose next candle is now known. */
async function resolveOpenPredictions(pair: string, timeframe: "1m" | "5m") {
  try {
    const db = await getDb();
    if (!db) return;
    const open = await db
      .select()
      .from(accuracyTracking)
      .where(
        and(
          eq(accuracyTracking.pair, pair),
          eq(accuracyTracking.timeframe, timeframe),
          isNull(accuracyTracking.isCorrect)
        )
      )
      .orderBy(desc(accuracyTracking.id))
      .limit(50);

    if (!open.length) return;
    const candles = candleService.getCandles(pair, 500);
    if (candles.length < 2) return;

    for (const row of open) {
      const predTime = new Date(row.createdAt).getTime();
      // find first candle that closed AFTER the prediction was made
      const next = candles.find((c) => c.timestamp.getTime() > predTime);
      const prev = [...candles].reverse().find((c) => c.timestamp.getTime() <= predTime);
      if (!next || !prev) continue;
      const actual = next.close > prev.close ? "UP" : next.close < prev.close ? "DOWN" : "NEUTRAL";
      const isCorrect = actual === row.predictedSignal ? 1 : 0;
      await db
        .update(accuracyTracking)
        .set({ actualSignal: actual as "UP" | "DOWN" | "NEUTRAL", isCorrect, resolvedAt: new Date() })
        .where(eq(accuracyTracking.id, row.id));
    }
  } catch {
    /* best-effort */
  }
}

export async function getSignal(pair: string, timeframe: string): Promise<SignalPayload> {
  const tf = timeframe === "5m" ? "5m" : "1m";
  const candles1m = candleService.getCandles(pair, 200);

  // Engine SIRF closed candles par chalega — forming candle display/price ke liye hai.
  const nowBucket = Math.floor(Date.now() / 60000) * 60000;
  const closed1m = candles1m.filter((c) => c.timestamp.getTime() < nowBucket);

  if (closed1m.length < 40) {
    const spot = candleService.getLastSpot(pair);
    return {
      ...(analyzeWithTimeframes([]) as AnalysisResult),
      price: spot?.mid ?? null,
      bid: spot?.bid ?? null,
      ask: spot?.ask ?? null,
      timestamp: new Date(),
      candleTime: new Date(nowBucket),
      pair,
      timeframe: tf,
      activeTricks: 0,
      support: null,
      resistance: null,
      atr: 0,
      error: `Warming up: ${closed1m.length}/40 candles collected`,
    };
  }

  const engineCandles = closed1m.map((c) => ({
    open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
    timestamp: c.timestamp,
  }));
  const candles5m = tf === "5m" ? aggregateTimeframe(engineCandles, 5) : aggregateTimeframe(engineCandles, 5);
  const res = analyzeWithTimeframes(engineCandles, candles5m);

  const spot = candleService.getLastSpot(pair);
  const { support, resistance, atr } = computeSR(engineCandles);
  const activeTricks = Object.values(res.trickScores).filter((s) => s > 50).length;
  const lastClosed = closed1m.length ? closed1m[closed1m.length - 1].timestamp : null;

  // Fire-and-forget bookkeeping (never block the signal on DB).
  recordPrediction(pair, tf, res, lastClosed).catch(() => {});
  resolveOpenPredictions(pair, tf as "1m" | "5m").catch(() => {});

  return {
    ...res,
    price: spot?.mid ?? engineCandles[engineCandles.length - 1].close,
    bid: spot?.bid ?? null,
    ask: spot?.ask ?? null,
    timestamp: new Date(),
    candleTime: new Date(nowBucket),
    pair,
    timeframe: tf,
    activeTricks,
    support,
    resistance,
    atr: Math.round(atr * 100000) / 100000,
  };
}

export interface AccuracyStats {
  pair: string;
  timeframe: string;
  total: number;
  correct: number;
  accuracy: number; // %
  upSignals: number;
  downSignals: number;
  avgConfidence: number;
  byConfidence: Array<{ bucket: string; total: number; accuracy: number }>;
}

export async function getAccuracyStats(pair?: string, timeframe?: string): Promise<AccuracyStats[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(accuracyTracking).orderBy(desc(accuracyTracking.id)).limit(2000);
    const filtered = rows.filter(
      (r) =>
        r.isCorrect !== null &&
        (!pair || r.pair === pair) &&
        (!timeframe || r.timeframe === timeframe)
    );
    const groups = new Map<string, typeof filtered>();
    for (const r of filtered) {
      const key = `${r.pair}|${r.timeframe}`;
      const arr = groups.get(key);
      if (arr) arr.push(r);
      else groups.set(key, [r]);
    }
    const out: AccuracyStats[] = [];
    groups.forEach((rs, key) => {
      const [p, tf] = key.split("|");
      const correct = rs.filter((r) => r.isCorrect === 1).length;
      const conf = rs.map((r) => parseFloat(r.confidence.toString()));
      const buckets = [
        { bucket: "70-79", lo: 70, hi: 79 },
        { bucket: "80-89", lo: 80, hi: 89 },
        { bucket: "90-100", lo: 90, hi: 100 },
      ].map((b) => {
        const inB = rs.filter((r) => {
          const c = parseFloat(r.confidence.toString());
          return c >= b.lo && c <= b.hi;
        });
        return {
          bucket: b.bucket,
          total: inB.length,
          accuracy: inB.length ? Math.round((inB.filter((r) => r.isCorrect === 1).length / inB.length) * 1000) / 10 : 0,
        };
      });
      out.push({
        pair: p,
        timeframe: tf,
        total: rs.length,
        correct,
        accuracy: rs.length ? Math.round((correct / rs.length) * 1000) / 10 : 0,
        upSignals: rs.filter((r) => r.predictedSignal === "UP").length,
        downSignals: rs.filter((r) => r.predictedSignal === "DOWN").length,
        avgConfidence: rs.length ? Math.round((conf.reduce((a, b) => a + b, 0) / rs.length) * 10) / 10 : 0,
        byConfidence: buckets,
      });
    });
    return out;
  } catch {
    return [];
  }
}
