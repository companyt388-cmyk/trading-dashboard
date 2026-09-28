/**
 * Real-time 1-minute candle builder.
 *
 * Problem it solves: the old pipeline fed the 11-trick engine with pseudo-candles
 * built from a handful of spot ticks (and the router even overrode NO_TRADE with
 * a raw trend guess). Now we poll live spot prices on a fixed cadence, aggregate
 * ticks into proper 1m OHLC candles (volume = tick count, the standard proxy for
 * decentralized forex), persist closed candles to the DB, and serve the engine
 * only real candles.
 *
 * Price source is swappable via the PriceProvider interface:
 *   - ExchangeRateApiProvider (default, free, no key): polls spot every 15s.
 *   - Set PRICE_PROVIDER=twelvedata + TWELVEDATA_API_KEY for exchange-grade
 *     1m candles (still no true forex volume — OTC market has none).
 */
import { getDb } from "./db";
import { candles } from "../drizzle/schema";
import { desc, eq, and } from "drizzle-orm";

export interface SpotPrice {
  pair: string;
  bid: number;
  ask: number;
  mid: number;
  timestamp: Date;
}

export interface PriceProvider {
  name: string;
  fetchSpot(pair: string): Promise<SpotPrice | null>;
}

/** Yahoo Finance 1m candles (free, no key). Real intraday forex OHLC, ~1min delay.
 *  2026-09-28: exchangerate-api daily-rate feed flat tha (intraday move hi nahi karta)
 *  isliye Yahoo par switch — asli market data. */
const YAHOO_MAP: Record<string, string> = {
  "CHF/JPY": "CHFJPY=X",
  "CAD/JPY": "CADJPY=X",
  "AUD/JPY": "AUDJPY=X",
};

export class YahooProvider {
  name = "yahoo";
  async fetchCandles(pair: string): Promise<BuiltCandle[]> {
    const sym = YAHOO_MAP[pair];
    if (!sym) return [];
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1m&range=1d`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      if (!res.ok) return [];
      const j = (await res.json()) as any;
      const r = j?.chart?.result?.[0];
      if (!r) return [];
      const ts: number[] = r.timestamp ?? [];
      const q = r.indicators?.quote?.[0] ?? {};
      const out: BuiltCandle[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
        if (o == null || h == null || l == null || c == null) continue;
        const bucket = Math.floor(ts[i] / 60) * 60 * 1000;
        out.push({
          pair, timeframe: "1m", timestamp: new Date(bucket),
          open: o, high: h, low: l, close: c, volume: 1,
        });
      }
      return out;
    } catch {
      return [];
    }
  }
}
/** Default provider: free exchangerate-api.com spot polling (no key needed). */
export class ExchangeRateApiProvider implements PriceProvider {
  name = "exchangerate-api";
  async fetchSpot(pair: string): Promise<SpotPrice | null> {
    try {
      const [base, quote] = pair.split("/");
      if (!base || !quote) return null;
      const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${base}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { rates?: Record<string, number> };
      const rate = data.rates?.[quote];
      if (!rate) return null;
      const spread = rate * 0.0002; // ~2 pip estimate when bid/ask unavailable
      return { pair, bid: rate - spread / 2, ask: rate + spread / 2, mid: rate, timestamp: new Date() };
    } catch {
      return null;
    }
  }
}

export interface BuiltCandle {
  pair: string;
  timeframe: "1m";
  timestamp: Date; // minute bucket start
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // tick count
}

const PAIRS = [
  "CHF/JPY",
  "CAD/JPY",
  "AUD/JPY",
];

/** Yahoo se aane wale pairs (real 1m candles). */
const YAHOO_PAIRS = ["CHF/JPY", "CAD/JPY", "AUD/JPY"];

const POLL_MS = 15_000;
const KEEP_CANDLES = 500;

class PairBuilder {
  pair: string;
  candles: BuiltCandle[] = []; // closed candles, oldest -> newest
  private cur: BuiltCandle | null = null;
  lastSpot: SpotPrice | null = null;

  constructor(pair: string) {
    this.pair = pair;
  }

  ingest(spot: SpotPrice) {
    this.lastSpot = spot;
    const bucket = Math.floor(spot.timestamp.getTime() / 60000) * 60000;
    if (!this.cur || this.cur.timestamp.getTime() !== bucket) {
      if (this.cur) this.closeCurrent();
      this.cur = {
        pair: this.pair,
        timeframe: "1m",
        timestamp: new Date(bucket),
        open: spot.mid, high: spot.mid, low: spot.mid, close: spot.mid,
        volume: 1,
      };
    } else {
      this.cur.high = Math.max(this.cur.high, spot.mid);
      this.cur.low = Math.min(this.cur.low, spot.mid);
      this.cur.close = spot.mid;
      this.cur.volume += 1;
    }
  }

  private closeCurrent() {
    if (!this.cur) return;
    this.candles.push(this.cur);
    if (this.candles.length > KEEP_CANDLES) {
      this.candles.splice(0, this.candles.length - KEEP_CANDLES);
    }
    persistCandle(this.cur).catch(() => {});
    this.cur = null;
  }

  /** Candles for display: closed candles + the live forming candle (engine use se pehle forming hatana). */
  getCandles(n: number): BuiltCandle[] {
    const all = this.cur ? [...this.candles, this.cur] : this.candles;
    return all.slice(-n);
  }

  /** Bulk provider (Yahoo) se forming candle set karo. */
  setLiveForming(c: BuiltCandle | null) {
    this.cur = c;
  }

  async backfillFromDb() {
    try {
      const db = await getDb();
      if (!db) return;
      const rows = await db
        .select()
        .from(candles)
        .where(and(eq(candles.pair, this.pair), eq(candles.timeframe, "1m")))
        .orderBy(desc(candles.timestamp))
        .limit(KEEP_CANDLES);
      const ordered = rows.reverse().map((r) => ({
        pair: r.pair,
        timeframe: "1m" as const,
        timestamp: new Date(r.timestamp),
        open: parseFloat(r.open.toString()),
        high: parseFloat(r.high.toString()),
        low: parseFloat(r.low.toString()),
        close: parseFloat(r.close.toString()),
        volume: parseFloat(r.volume.toString()),
      }));
      // only take rows older than the current forming bucket
      this.candles = ordered;
    } catch {
      /* DB optional — in-memory still works */
    }
  }
}

async function persistCandle(c: BuiltCandle) {
  const db = await getDb();
  if (!db) return;
  await db.insert(candles).values({
    pair: c.pair,
    timeframe: c.timeframe,
    timestamp: c.timestamp,
    open: c.open.toFixed(8),
    high: c.high.toFixed(8),
    low: c.low.toFixed(8),
    close: c.close.toFixed(8),
    volume: c.volume.toFixed(2),
  });
}

class CandleService {
  private builders = new Map<string, PairBuilder>();
  private yahoo = new YahooProvider();
  private timer: NodeJS.Timeout | null = null;
  private starting: Promise<void> | null = null;
  private lastYahooFetch = 0;

  private builder(pair: string): PairBuilder {
    let b = this.builders.get(pair);
    if (!b) {
      b = new PairBuilder(pair);
      this.builders.set(pair, b);
    }
    return b;
  }

  /** Start polling. Safe to call multiple times. */
  start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      await Promise.all(PAIRS.map((p) => this.builder(p).backfillFromDb()));
      await this.pollOnce();
      this.timer = setInterval(() => this.pollOnce(), POLL_MS);
      console.log(`[CandleService] polling ${PAIRS.length} pairs every ${POLL_MS / 1000}s via ${this.yahoo.name} (forex 1m)`);
    })();
    return this.starting;
  }

  private async pollOnce() {
    const now = Date.now();
    // Yahoo 1m candles: har 20s me refresh (Yahoo ka data ~1s fresh hota hai)
    if (now - this.lastYahooFetch >= 20_000) {
      this.lastYahooFetch = now;
      await Promise.all(
        YAHOO_PAIRS.map(async (pair) => {
          try {
            const cs = await this.yahoo.fetchCandles(pair);
            if (cs.length) this.syncYahoo(pair, cs);
          } catch {
            /* keep old data on transient failure */
          }
        })
      );
    }
    // Sab pairs Yahoo se aate hain — tick polling ki zaroorat nahi
  }

  /** Yahoo candles ko builder me sync karo — closed candles + live forming candle. */
  private syncYahoo(pair: string, cs: BuiltCandle[]) {
    const b = this.builder(pair);
    const nowBucket = Math.floor(Date.now() / 60000) * 60000;
    const closed = cs.filter((c) => c.timestamp.getTime() < nowBucket);
    if (!closed.length) return; // ajeeb fetch ho to purana data rakho
    b.candles = closed.slice(-KEEP_CANDLES);
    const forming = cs.find((c) => c.timestamp.getTime() === nowBucket) ?? null;
    b.setLiveForming(forming);
    const live = forming ?? closed[closed.length - 1];
    b.lastSpot = {
      pair,
      bid: live.close,
      ask: live.close,
      mid: live.close,
      timestamp: new Date(),
    };
  }

  getCandles(pair: string, n = 200): BuiltCandle[] {
    return this.builder(pair).getCandles(n);
  }

  /**
   * Seed a pair's history from previously downloaded 1m candles
   * (e.g. scripts/chfjpy_1m.json) so the engine works instantly on boot
   * instead of waiting ~1h for live candles to accumulate.
   */
  seedFromCandles(pair: string, raw: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>) {
    const b = this.builder(pair);
    const seeded: BuiltCandle[] = raw.slice(-KEEP_CANDLES).map((r) => ({
      pair,
      timeframe: "1m" as const,
      timestamp: new Date(r.t),
      open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v,
    }));
    // drop any seeded candle from the currently-forming minute
    const nowBucket = Math.floor(Date.now() / 60000) * 60000;
    b.candles = seeded.filter((c) => c.timestamp.getTime() < nowBucket);
    console.log(`[CandleService] seeded ${pair} with ${b.candles.length} historical 1m candles`);
  }

  getLastSpot(pair: string): SpotPrice | null {
    return this.builder(pair).lastSpot;
  }

  getPairs(): string[] {
    return [...PAIRS];
  }
}

export const candleService = new CandleService();
