import { getSignal, getAccuracyStats } from "./signalService";
import { candleService } from "./candleBuilder";

/**
 * Muse Analyst — deterministic Hindi read of live engine state.
 *
 * Jaankaar faisla: LLM ki jagah niyam-based analysis, taaki
 * (1) bina API key ke hamesha kaam kare,
 * (2) kabhi jhoothi certainty na bole — verdict engine ke hi
 *     discipline gates (entrySignal / NO_TRADE) se nikalta hai.
 */

const TRICK_LABELS: Record<string, string> = {
  wickCrossing: "Wick Crossing",
  wickVolume: "Wick Volume",
  volumeSpread: "Volume Spread",
  motiveCandles: "Motive Candles",
  breakoutValidation: "Breakout Validation",
  rejectionSpike: "Rejection Spike",
  priceVolumeAnomaly: "Price/Volume Anomaly",
  exhaustionCandles: "Exhaustion",
  noSupplyDemand: "No Supply/Demand",
  sandwichPattern: "Sandwich",
  engulfingTrap: "Engulfing Trap",
};

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

export async function getAnalystRead(
  pair: string,
  timeframe: string
): Promise<{ read: string; generatedAt: string }> {
  const generatedAt = new Date().toISOString();
  const signal: any = await getSignal(pair, timeframe);
  const candles = candleService.getCandles(pair, 60);
  const stats: any = getAccuracyStats(pair, timeframe);

  if (signal.error || candles.length < 30) {
    return {
      read: `⏳ **Abhi ruko** — ${signal.error || "candles jama ho rahe hain"}. Pehle data aane do, phir main poora analysis dunga.`,
      generatedAt,
    };
  }

  const closes = candles.map((c) => c.close);
  const price: number = signal.price ?? closes[closes.length - 1];
  const ema20 = ema(closes, 20);
  const ema20Prev = ema(closes.slice(0, -5), 20);
  const slope = ema20 - ema20Prev;
  const atr: number = signal.atr || 0;
  const slopeAtr = atr > 0 ? slope / atr : 0;

  const trend =
    slopeAtr > 0.4 ? "UPTREND (EMA20 oopar)" :
    slopeAtr < -0.4 ? "DOWNTREND (EMA20 neeche)" : "RANGE (EMA20 flat)";

  const s: number | null = signal.support;
  const r: number | null = signal.resistance;
  let level = "beech me";
  if (s != null && r != null && atr > 0) {
    if (price - s < atr) level = `SUPPORT (${s.toFixed(4)}) ke paas`;
    else if (r - price < atr) level = `RESISTANCE (${r.toFixed(4)}) ke paas`;
    else level = `support ${s.toFixed(4)} aur resistance ${r.toFixed(4)} ke beech`;
  }

  const firstC = closes[0];
  const driftPct = (((price - firstC) / firstC) * 100).toFixed(2);

  const dirRecord: Record<string, number> = signal.trickDirections || {};
  const scoreRecord: Record<string, number> = signal.trickScores || {};
  const votes = Object.keys(dirRecord).map((name) => ({
    name,
    direction: dirRecord[name] as number,
    strength: (scoreRecord[name] as number) || 0,
  }));
  const votesAll = votes.filter((t) => t.direction !== 0);
  const upVotes = votesAll.filter((t) => t.direction === 1);
  const downVotes = votesAll.filter((t) => t.direction === -1);
  const topVote = [...votesAll].sort((a, b) => b.strength - a.strength)[0];
  const voteLine =
    votesAll.length === 0
      ? "Koi trick vote nahi kar rahi — market me koi saaf pattern nahi."
      : `${upVotes.length} UP, ${downVotes.length} DOWN vote. ` +
        (topVote
          ? `Sabse strong: ${TRICK_LABELS[topVote.name] || topVote.name} (${topVote.direction === 1 ? "UP" : "DOWN"}, ${Math.round(topVote.strength)}%).`
          : "");

  // Verdict — engine ke discipline gates se, koi nayi prediction nahi
  let verdict: string;
  if (signal.entrySignal) {
    const dir = signal.signal === "UP" ? "UP (kharido)" : "DOWN (becho)";
    const inval = signal.signal === "UP" ? s : r;
    verdict =
      `✅ **SETUP HAI — ${dir}**\n` +
      `Sab checklist green hai: EMA, volume, multi-timeframe sab agree kar rahe hain, aur koi liquidity trap nahi. ` +
      (inval != null
        ? `Invalidation: ${inval.toFixed(4)} ke paar jaye to trade galat — wahan niklo.`
        : `Invalidation: ATR (${atr.toFixed(4)}) ka 1x ulta jaye to niklo.`) +
      ` Risk sirf 1-2% rakho.`;
  } else if (signal.signal === "UP" || signal.signal === "DOWN") {
    const missing: string[] = [];
    if (!signal.emaMatch) missing.push("EMA match nahi");
    if (!signal.volumeConfirm) missing.push("volume kamzor");
    if (!signal.multiTimeframeConfirm) missing.push("5m timeframe agree nahi");
    if (signal.liquidityTrapDetect) missing.push("liquidity trap ka khatra");
    verdict =
      `⚠️ **SIGNAL HAI (${signal.signal}), LEKIN ENTRY NAHI**\n` +
      `Tricks ${signal.signal} bol rahi hain (${signal.confidence}% confidence), lekin entry checklist poori nahi: ${missing.join(", ") || "score kam"}. ` +
      `Aadhe setup par mat koodo — poora hone ka wait karo ya chhodo.`;
  } else {
    const reason =
      signal.opinions < 2
        ? `sirf ${signal.opinions} trick vote kar rahi hai (kam se kam 2 chahiye)`
        : `agreement sirf ${Math.round((signal.agreement || 0) * 100)}% hai (65% chahiye)`;
    verdict =
      `⛔ **RUKO — NO_TRADE**\n` +
      `Abhi koi saaf edge nahi: ${reason}. Zabardasti trade = paise phenkna. ` +
      `Rukna bhi ek jeet hai — agle setup ka wait karo.`;
  }

  const accLine =
    stats && stats.resolved > 0
      ? `Naapi hui live accuracy: ${stats.resolved} signals me ${stats.accuracy.toFixed(1)}% sahi.`
      : `Live accuracy abhi jama ho rahi hai — har signal record hota hai aur khud verify hota hai.`;

  const read =
    `📊 **Abhi kya ho raha hai**\n${pair} (${timeframe}) — ${trend}. ` +
    `Price ${price.toFixed(4)}, ${level}. Aakhri ~60 candles me drift ${driftPct}%.\n\n` +
    `🗳️ **Tricks kya keh rahi hain**\n${voteLine}\n\n` +
    `${verdict}\n\n` +
    `⚠️ **Risk yaad rakho**\n${accLine} 100% wala koi system nahi hota — jo ye daava kare usse door raho.`;

  return { read, generatedAt };
}
