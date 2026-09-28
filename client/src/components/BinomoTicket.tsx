import { useEffect, useState } from "react";

interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface AccuracyRow {
  total: number;
  accuracy: number; // %
}

interface BinomoTicketProps {
  signal: string; // "UP" | "DOWN" | "NO_TRADE"
  confidence: number;
  pair: string;
  timeframe: string; // "1m" | "5m"
  candles: Candle[] | undefined;
  accuracy: AccuracyRow | null | undefined;
}

/**
 * Binomo Fixed-Time Trade ticket.
 * Mirrors how a trade is placed on Binomo (asset + direction + duration),
 * and shows the HONEST math: break-even win-rate vs measured accuracy.
 */
export default function BinomoTicket({
  signal,
  confidence,
  pair,
  timeframe,
  candles,
  accuracy,
}: BinomoTicketProps) {
  const [payout, setPayout] = useState(85); // Binomo typical payout %
  const [stake, setStake] = useState(100); // ₹ per trade
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const durationMin = timeframe === "5m" ? 5 : 1;
  const lastT = candles && candles.length > 0 ? candles[candles.length - 1].t : 0;
  const closeAt = lastT + durationMin * 60 * 1000;
  const secsLeft = lastT > 0 ? Math.max(0, Math.ceil((closeAt - now) / 1000)) : 0;

  const p = Math.min(95, Math.max(10, payout)) / 100;
  const breakEven = (1 / (1 + p)) * 100; // % win-rate needed
  const measured = accuracy && accuracy.total > 0 ? accuracy.accuracy : null;
  const w = (measured ?? 50) / 100; // assumed win-rate for EV
  const ev = stake * (w * p - (1 - w)); // expected ₹ per trade

  const dirColor =
    signal === "UP"
      ? "border-green-500 bg-green-950"
      : signal === "DOWN"
        ? "border-red-500 bg-red-950"
        : "border-gray-600 bg-gray-900";

  let verdict: { text: string; cls: string };
  if (signal === "NO_TRADE") {
    verdict = {
      text: "⛔ TICKET BAND — engine abhi NO_TRADE hai. Binomo par click mat karo.",
      cls: "text-gray-400",
    };
  } else if (measured === null) {
    verdict = {
      text: "⏳ Accuracy abhi jama ho rahi hai — pehle Binomo DEMO par test karo, real paise mat lagao.",
      cls: "text-yellow-400",
    };
  } else if (measured >= breakEven) {
    verdict = {
      text: `✅ Math tumhare saath hai — naapi hui accuracy (${measured.toFixed(1)}%) break-even (${breakEven.toFixed(1)}%) se upar hai. Phir bhi stake chhota rakho.`,
      cls: "text-green-400",
    };
  } else {
    verdict = {
      text: `⚠️ Math tumhare KHILAAF hai — break-even ke liye ${breakEven.toFixed(1)}% chahiye, tumhari accuracy ${measured.toFixed(1)}% hai. Har ₹${stake} trade par ausat nuksaan ≈ ₹${Math.abs(ev).toFixed(1)}.`,
      cls: "text-red-400",
    };
  }

  return (
    <div className={`mb-6 border-2 ${dirColor} p-4`}>
      <div className="text-sm font-black text-orange-400 mb-3">
        🎯 BINOMO TRADE TICKET <span className="text-gray-500 font-bold">— FIXED-TIME TRADE</span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="bg-black p-2">
          <div className="text-xs text-gray-500 font-bold">ASSET</div>
          <div className="text-lg font-black text-white">{pair}</div>
        </div>
        <div className="bg-black p-2">
          <div className="text-xs text-gray-500 font-bold">DIRECTION</div>
          <div
            className={`text-lg font-black ${
              signal === "UP" ? "text-green-400" : signal === "DOWN" ? "text-red-400" : "text-gray-400"
            }`}
          >
            {signal === "UP" ? "▲ UP" : signal === "DOWN" ? "▼ DOWN" : "– RUKO"}
          </div>
        </div>
        <div className="bg-black p-2">
          <div className="text-xs text-gray-500 font-bold">DURATION</div>
          <div className="text-lg font-black text-white">{durationMin} MIN</div>
        </div>
      </div>

      <div className="flex items-center justify-between bg-black px-3 py-2 mb-3">
        <span className="text-xs font-bold text-gray-400">CANDLE CLOSE MEIN</span>
        <span className="text-xl font-black text-yellow-400 tabular-nums">
          {Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, "0")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="bg-black p-2">
          <div className="text-xs text-gray-500 font-bold mb-1">BINOMO PAYOUT %</div>
          <input
            type="number"
            value={payout}
            min={10}
            max={95}
            onChange={(e) => setPayout(Number(e.target.value) || 85)}
            className="w-full bg-gray-900 text-white font-black px-2 py-1 border border-gray-700"
          />
        </label>
        <label className="bg-black p-2">
          <div className="text-xs text-gray-500 font-bold mb-1">STAKE ₹ / TRADE</div>
          <input
            type="number"
            value={stake}
            min={1}
            onChange={(e) => setStake(Number(e.target.value) || 100)}
            className="w-full bg-gray-900 text-white font-black px-2 py-1 border border-gray-700"
          />
        </label>
      </div>

      <div className="bg-black p-3 mb-3 text-sm font-bold space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-400">Break-even win-rate chahiye:</span>
          <span className="text-white">{breakEven.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Naapi hui accuracy:</span>
          <span className="text-white">
            {measured !== null ? `${measured.toFixed(1)}% (${accuracy!.total} trades)` : "jama ho rahi hai…"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Expected / trade:</span>
          <span className={ev >= 0 ? "text-green-400" : "text-red-400"}>
            {ev >= 0 ? "+" : "−"}₹{Math.abs(ev).toFixed(1)}
          </span>
        </div>
        {signal !== "NO_TRADE" && (
          <div className="flex justify-between">
            <span className="text-gray-400">Engine confidence:</span>
            <span className="text-white">{Math.round(confidence)}%</span>
          </div>
        )}
      </div>

      <div className={`text-sm font-black mb-2 ${verdict.cls}`}>{verdict.text}</div>
      <div className="text-xs text-gray-500 font-bold">
        Note: Binomo ka price feed thoda alag ho sakta hai — signal direction ke liye hai. Pehle hamesha demo par test karo.
      </div>
    </div>
  );
}
