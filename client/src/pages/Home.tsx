import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, Send, MessageCircle } from "lucide-react";
import CandleChart from "@/components/CandleChart";
import BinomoTicket from "@/components/BinomoTicket";

interface SignalData {
  signal: string;
  confidence: number;
  score?: number;
  price: number | null;
  bid: number | null;
  ask: number | null;
  timestamp: Date;
  candleTime?: string | Date | null; // forming candle ka open time (server se ISO string)
  pair: string;
  timeframe: string;
  trickScores: Record<string, number>;
  trickDirections?: Record<string, number>;
  agreement?: number;
  opinions?: number;
  activeTricks: number;
  details?: string[];
  support: number | null;
  resistance: number | null;
  atr?: number;
  error?: string;
  multiTimeframeConfirm?: boolean;
  emaMatch?: boolean;
  volumeConfirm?: boolean;
  liquidityTrapDetect?: boolean;
  entrySignal?: boolean;
}

interface ChatMessage {
  role: "user" | "bot";
  content: string;
  timestamp: Date;
}

const CURRENCY_PAIRS = [
  "CHF/JPY",
  "CAD/JPY",
  "AUD/JPY",
];

// Fixed display order for the 11 tricks
const TRICK_DEFS: { key: string; label: string }[] = [
  { key: "wickCrossing", label: "WICK CROSSING" },
  { key: "wickVolume", label: "WICK + VOLUME" },
  { key: "volumeSpread", label: "VOLUME SPREAD (VSA)" },
  { key: "motiveCandles", label: "MOTIVE CANDLES (WYCKOFF)" },
  { key: "breakoutValidation", label: "BREAKOUT VALIDATION" },
  { key: "rejectionSpike", label: "REJECTION + SPIKE" },
  { key: "priceVolumeAnomaly", label: "PRICE+VOL ANOMALY" },
  { key: "exhaustionCandles", label: "SNR EXHAUSTION" },
  { key: "noSupplyDemand", label: "NO SUPPLY/DEMAND" },
  { key: "sandwichPattern", label: "GRG SANDWICH" },
  { key: "engulfingTrap", label: "ENGULFING TRAP" },
];

/** candleTime (ISO string / Date) ko browser ke local timezone me "4:27 PM" style me dikhao. */
function formatCandleTime(t?: string | Date | null): string {
  if (!t) return "—";
  const d = new Date(t);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Home() {
  const [activePair, setActivePair] = useState("CHF/JPY");
  const [timeframe, setTimeframe] = useState("1m");
  const [signals, setSignals] = useState<Record<string, SignalData>>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [botState, setBotState] = useState<any>(null);
  const [feedbackMode, setFeedbackMode] = useState<string | null>(null);

  // ---- Feedback history (browser me save — hamesha dikhega) ----
  const [feedbackHistory, setFeedbackHistory] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("feedbackHistory") || "[]");
    } catch {
      return [];
    }
  });

  // ---- Signal log: har UP/DOWN signal apni candle time ke saath (browser me saved) ----
  const [signalLog, setSignalLog] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("signalLog") || "[]");
    } catch {
      return [];
    }
  });

  // Signal log browser me save rakho — refresh ke baad bhi rahe
  useEffect(() => {
    try {
      localStorage.setItem("signalLog", JSON.stringify(signalLog.slice(0, 30)));
    } catch {}
  }, [signalLog]);

  // ---- Signal alert ring ----
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem("signalSoundOn") === "1";
    } catch {
      return false;
    }
  });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevSignalRef = useRef<Record<string, string>>({});

  function getAudioCtx(): AudioContext | null {
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AC();
      }
      if (audioCtxRef.current.state === "suspended") {
        void audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }

  // Chhoti si alert ring — UP: ascending chime, DOWN: descending chime
  function playRing(direction: string) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes = direction === "UP" ? [880, 1174.66] : [880, 659.25];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t0 = now + i * 0.22;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.45);
      });
    } catch {
      /* audio unavailable */
    }
  }

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem("signalSoundOn", next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (next) {
      // user gesture -> unlock audio + test ring
      playRing("UP");
    }
  };

  // Get real-time signals for active pair
  const { data: signal, isLoading: signalLoading } = trpc.trading.getRealtimeSignal.useQuery(
    { pair: activePair, timeframe },
    { refetchInterval: 2000 }
  );

  // Recent candles for the chart
  const { data: candles } = trpc.trading.getCandles.useQuery(
    { pair: activePair, limit: 120 },
    { refetchInterval: 15000 }
  );

  // Measured accuracy for active pair + timeframe
  const { data: accuracyStats } = trpc.trading.getAccuracyStats.useQuery(
    { pair: activePair, timeframe },
    { refetchInterval: 15000 }
  );

  // Get bot learning state
  const { data: botData } = trpc.trading.getBotState.useQuery(
    { pair: activePair },
    { refetchInterval: 5000 }
  );

  const currentSignal = signals[activePair];
  const accuracyRow = accuracyStats?.find(
    (r) => r.pair === activePair && r.timeframe === timeframe
  );

  // Muse Analyst — on-demand Hindi read of live engine state
  const {
    data: analystData,
    isFetching: analystFetching,
    refetch: askAnalyst,
  } = trpc.trading.getAnalystRead.useQuery(
    { pair: activePair, timeframe },
    { enabled: false, refetchOnWindowFocus: false }
  );

  // Get signal explanation - using query instead
  const [shouldExplain, setShouldExplain] = useState(false);
  const { data: explanationData } = trpc.trading.explainSignal.useQuery(
    currentSignal && currentSignal.signal !== "NO_TRADE"
      ? {
          pair: activePair,
          signal: {
            signal: currentSignal.signal,
            confidence: currentSignal.confidence,
            trickScores: currentSignal.trickScores || {},
          },
        }
      : { pair: activePair, signal: { signal: "NO_TRADE", confidence: 0 } },
    { enabled: shouldExplain && currentSignal && currentSignal.signal !== "NO_TRADE" }
  );

  useEffect(() => {
    if (explanationData?.explanation) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content: explanationData.explanation,
          timestamp: new Date(),
        },
      ]);
      setShouldExplain(false);
    }
  }, [explanationData]);

  // Record feedback
  const { mutate: recordFeedback } = trpc.trading.recordSignalFeedback.useMutation({
    onSuccess: () => {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content: "✅ Feedback recorded! I'm learning from this. My predictions will improve!",
          timestamp: new Date(),
        },
      ]);
      setFeedbackMode(null);
    },
  });

  useEffect(() => {
    if (signal) {
      const sig = (signal as any).signal as string;
      const prev = prevSignalRef.current[activePair];
      // Naya UP/DOWN signal aaye to alert ring bajao (pehli load par nahi)
      if (soundOn && (sig === "UP" || sig === "DOWN") && prev !== undefined && prev !== sig) {
        playRing(sig);
      }
      prevSignalRef.current[activePair] = sig;
      // Har UP/DOWN candle ko time ke saath log karo (feedback ke liye)
      if (sig === "UP" || sig === "DOWN") {
        const ct = (signal as any).candleTime as string | undefined;
        if (ct) {
          setSignalLog((prevLog) => {
            if (prevLog.some((e) => e.pair === activePair && e.candleTime === ct)) return prevLog;
            return [
              {
                pair: activePair,
                candleTime: ct,
                signal: sig,
                confidence: (signal as any).confidence ?? 0,
              },
              ...prevLog,
            ].slice(0, 30);
          });
        }
      }
      setSignals((prevSigs) => ({
        ...prevSigs,
        [activePair]: signal as any,
      }));
    }
  }, [signal, activePair, soundOn]);

  useEffect(() => {
    if (botData) {
      setBotState(botData);
    }
  }, [botData]);

  const handleAskBot = () => {
    if (!chatInput.trim()) return;

    setChatMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: chatInput,
        timestamp: new Date(),
      },
    ]);

    if (currentSignal && currentSignal.signal !== "NO_TRADE") {
      setShouldExplain(true);
    }

    setChatInput("");
  };

  const handleFeedback = (outcome: "UP" | "DOWN" | "NEUTRAL", logEntry?: any) => {
    const sig = logEntry ? logEntry.signal : currentSignal?.signal;
    if (!sig || sig === "NO_TRADE") return;

    // Browser me save karo — hamesha dikhega (candle time ke saath)
    const entry = {
      time: new Date().toISOString(),
      candleTime: logEntry?.candleTime,
      pair: activePair,
      signal: sig,
      outcome,
      correct: (sig === "UP" && outcome === "UP") || (sig === "DOWN" && outcome === "DOWN"),
    };
    setFeedbackHistory((prev) => {
      const updated = [entry, ...prev].slice(0, 50);
      try {
        localStorage.setItem("feedbackHistory", JSON.stringify(updated));
      } catch {}
      return updated;
    });

    recordFeedback({
      pair: activePair,
      timeframe,
      predictedSignal: sig as "UP" | "DOWN" | "NO_TRADE",
      actualOutcome: outcome,
      confidence: logEntry?.confidence ?? currentSignal?.confidence ?? 0,
      userFeedback: `Signal was ${outcome}`,
    });
  };

  const confirmChips = currentSignal
    ? [
        { label: "EMA MATCH", ok: !!currentSignal.emaMatch },
        { label: "VOLUME OK", ok: !!currentSignal.volumeConfirm },
        { label: "MTF CONFIRM", ok: !!currentSignal.multiTimeframeConfirm },
      ]
    : [];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b-4 border-red-600 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-7xl font-black mb-2">FOREX TRADING</h1>
            <p className="text-gray-400">AI-Powered Next Candle Prediction with Learning Bot</p>
          </div>
          <div className="flex gap-3 items-center">
            <button
              onClick={toggleSound}
              title={soundOn ? "Signal alert ring OFF karo" : "Signal alert ring ON karo"}
              className={`border-2 px-5 py-3 font-black transition-all ${
                soundOn
                  ? "border-yellow-400 bg-yellow-950 text-yellow-300 animate-pulse"
                  : "border-gray-700 text-gray-400 hover:border-yellow-600"
              }`}
            >
              {soundOn ? "🔔 RING ON" : "🔕 RING OFF"}
            </button>
            <a href="/todos" className="border-2 border-gray-700 px-5 py-3 font-bold hover:border-green-500">TO-DO LIST →</a>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Main Content */}
        <div className="flex-1 p-8">
          {/* Pair Selector */}
          <div className="mb-8">
            <h2 className="text-2xl font-black mb-4">SELECT CURRENCY PAIR</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {CURRENCY_PAIRS.map((pair) => (
                <button
                  key={pair}
                  onClick={() => setActivePair(pair)}
                  className={`p-4 font-bold border-2 transition-all ${
                    activePair === pair
                      ? "border-green-500 bg-green-950"
                      : "border-gray-700 bg-gray-900 hover:border-gray-500"
                  }`}
                >
                  {pair}
                </button>
              ))}
            </div>
          </div>

          <div className="h-1 bg-red-600 my-8"></div>

          {/* Timeframe Selector */}
          <div className="mb-8">
            <h2 className="text-2xl font-black mb-4">TIMEFRAME</h2>
            <div className="flex gap-4">
              {["1m", "5m"].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-8 py-3 font-bold border-2 ${
                    timeframe === tf
                      ? "border-green-500 bg-green-950"
                      : "border-gray-700 bg-gray-900"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          <div className="h-1 bg-red-600 my-8"></div>

          {/* Current Signal Display */}
          {signalLoading ? (
            <div className="flex items-center justify-center h-64 border-4 border-gray-700 bg-gray-950">
              <Loader2 className="animate-spin mr-4" size={40} />
              <span className="text-2xl font-black">ANALYZING...</span>
            </div>
          ) : currentSignal ? (
            currentSignal.error ? (
              /* Warmup state — engine needs >= 60 candles */
              <div className="border-4 border-yellow-500 bg-yellow-950 p-10 mb-8 text-center">
                <div className="text-4xl font-black text-yellow-400 mb-4">⚠ WARMING UP</div>
                <div className="text-xl font-bold text-yellow-200 mb-2">{currentSignal.error}</div>
                <div className="text-sm text-gray-400">
                  The 11-trick engine needs at least 60 one-minute candles before it can vote.
                  Signals will appear here automatically.
                </div>
              </div>
            ) : (
            <div className="border-4 border-gray-700 bg-gray-950 p-8 mb-8">
              {/* Price */}
              <div className="mb-6">
                <div className="text-sm font-bold text-gray-400 mb-2">CURRENT PRICE</div>
                <div className="text-5xl font-black mb-2">{currentSignal.price?.toFixed(4)}</div>
                <div className="text-xs text-gray-500">
                  BID: {currentSignal.bid != null ? currentSignal.bid.toFixed(4) : "—"} | ASK:{" "}
                  {currentSignal.ask != null ? currentSignal.ask.toFixed(4) : "—"}
                </div>
              </div>

              <div className="h-1 bg-red-600 my-6"></div>

              {/* Signal + ENTRY badge */}
              <div className="mb-6">
                <div className="text-sm font-bold text-gray-400 mb-4">NEXT CANDLE PREDICTION</div>
                <div className="text-2xl font-black text-cyan-400 mb-4">
                  🕐 Candle: {formatCandleTime(currentSignal.candleTime)}
                </div>
                <div className="flex flex-wrap gap-8 items-center">
                  <div
                    className={`text-6xl font-black ${
                      currentSignal.signal === "UP"
                        ? "text-green-500"
                        : currentSignal.signal === "DOWN"
                          ? "text-red-500"
                          : "text-yellow-500"
                    }`}
                  >
                    {currentSignal.signal}
                  </div>
                  <div>
                    <div className="text-4xl font-black">{Math.round(currentSignal.confidence)}%</div>
                    <div className="text-xs text-gray-400">CONFIDENCE</div>
                    <div className="text-xs text-gray-400 mt-2">
                      {currentSignal.opinions ?? currentSignal.activeTricks}/11 TRICKS VOTED
                      {currentSignal.agreement != null &&
                        ` · AGREEMENT ${Math.round(currentSignal.agreement * 100)}%`}
                    </div>
                  </div>
                  {/* ENTRY SIGNAL badge */}
                  <div
                    className={`px-6 py-4 font-black text-2xl border-4 ${
                      currentSignal.entrySignal
                        ? "border-green-400 bg-green-600 text-black animate-pulse"
                        : "border-gray-700 bg-gray-900 text-gray-600"
                    }`}
                  >
                    {currentSignal.entrySignal ? "⚡ ENTRY SIGNAL" : "ENTRY: OFF"}
                  </div>
                </div>

                {/* Confirmation chips */}
                <div className="flex flex-wrap gap-2 mt-4">
                  {confirmChips.map((chip) => (
                    <span
                      key={chip.label}
                      className={`px-3 py-1 text-xs font-black border-2 ${
                        chip.ok
                          ? "border-green-500 text-green-400 bg-green-950"
                          : "border-gray-700 text-gray-500 bg-gray-900"
                      }`}
                    >
                      {chip.ok ? "✓ " : "✗ "}
                      {chip.label}
                    </span>
                  ))}
                  {currentSignal.liquidityTrapDetect && (
                    <span className="px-3 py-1 text-xs font-black border-2 border-red-500 text-red-400 bg-red-950">
                      ⚠ LIQUIDITY TRAP DETECTED
                    </span>
                  )}
                </div>
              </div>

              <div className="h-1 bg-red-600 my-6"></div>

              {/* Live candle chart */}
              <div className="mb-6">
                <div className="text-sm font-bold text-gray-400 mb-4">
                  LIVE CHART — {activePair} ({timeframe})
                </div>
                <CandleChart
                  candles={candles ?? []}
                  signal={currentSignal.signal}
                  confidence={currentSignal.confidence}
                  support={currentSignal.support ?? null}
                  resistance={currentSignal.resistance ?? null}
                />
                <div className="flex gap-6 mt-2 text-xs font-bold text-gray-500">
                  <span>
                    <span className="text-yellow-500">- - -</span> SUPPORT:{" "}
                    {currentSignal.support != null ? currentSignal.support.toFixed(2) : "—"}
                  </span>
                  <span>
                    <span className="text-cyan-400">- - -</span> RESISTANCE:{" "}
                    {currentSignal.resistance != null ? currentSignal.resistance.toFixed(2) : "—"}
                  </span>
                  {currentSignal.atr != null && (
                    <span>ATR: {currentSignal.atr.toFixed(4)}</span>
                  )}
                </div>
              </div>

              <div className="h-1 bg-red-600 my-6"></div>

              {/* MUSE ANALYST — live engine state par Hindi me seedha read */}
              <div className="mb-6 border-2 border-purple-500 bg-gray-950 p-4">
                <div className="text-sm font-black text-purple-400 mb-1">
                  🧠 MUSE ANALYST <span className="text-gray-500 font-bold">— LIVE DATA PAR SEEDHA READ</span>
                </div>
                <div className="text-xs text-gray-500 font-bold mb-3">
                  Ye prediction nahi, analysis hai. RUKO bolna bhi salah hai.
                </div>
                <button
                  onClick={() => askAnalyst()}
                  disabled={analystFetching}
                  className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white font-black px-6 py-3 text-sm mb-3"
                >
                  {analystFetching ? "SOCH RAHA HOON…" : "👉 ABHI BATAO — KYA KARUN?"}
                </button>
                {analystData?.read && (
                  <div className="border-l-4 border-purple-500 bg-black px-4 py-3 text-sm text-gray-200 whitespace-pre-line font-medium">
                    {analystData.read}
                  </div>
                )}
                {analystData?.generatedAt && (
                  <div className="text-xs text-gray-600 font-bold mt-2">
                    {new Date(analystData.generatedAt).toLocaleTimeString("en-IN")} IST · {activePair} / {timeframe}
                  </div>
                )}
              </div>

              <div className="h-1 bg-red-600 my-6"></div>

              {/* BINOMO TRADE TICKET — fixed-time trade style */}
              {currentSignal && (
                <BinomoTicket
                  signal={currentSignal.signal}
                  confidence={currentSignal.confidence ?? 0}
                  pair={activePair}
                  timeframe={timeframe}
                  candles={candles}
                  accuracy={accuracyRow ?? null}
                />
              )}

              {/* Meri Feedback History — browser me saved, hamesha dikhega */}
              {feedbackHistory.length > 0 && (
                <div className="mb-6">
                  <div className="text-sm font-bold text-gray-400 mb-4">
                    MERI FEEDBACK HISTORY ({feedbackHistory.filter((f) => f.pair === activePair).length})
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {feedbackHistory
                      .filter((f) => f.pair === activePair)
                      .map((f, i) => (
                        <div
                          key={i}
                          className={`flex items-center justify-between px-3 py-2 text-sm font-bold border ${
                            f.correct
                              ? "border-green-700 bg-green-950 text-green-200"
                              : f.outcome === "NEUTRAL"
                                ? "border-gray-700 bg-gray-900 text-gray-300"
                                : "border-red-700 bg-red-950 text-red-200"
                          }`}
                        >
                          <span>
                            🕐{" "}
                            {new Date(f.candleTime || f.time).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {f.candleTime ? " candle" : ""}
                          </span>
                          <span>
                            {f.signal} → {f.outcome}
                          </span>
                          <span className="text-lg">{f.correct ? "✓" : f.outcome === "NEUTRAL" ? "~" : "✗"}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="h-1 bg-red-600 my-6"></div>

              {/* WHY THIS SIGNAL */}
              <div className="mb-6">
                <div className="text-sm font-bold text-gray-400 mb-4">WHY THIS SIGNAL</div>
                {currentSignal.details && currentSignal.details.length > 0 ? (
                  <ul className="space-y-2">
                    {currentSignal.details.map((d, i) => (
                      <li
                        key={i}
                        className="border-l-4 border-yellow-500 bg-gray-900 px-4 py-2 text-sm font-bold text-gray-200"
                      >
                        {d}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-gray-500 text-sm font-bold">
                    No active trick reasons — engine is in NO_TRADE.
                  </div>
                )}
              </div>

              <div className="h-1 bg-red-600 my-6"></div>

              {/* 11 Tricks breakdown — direction votes matter most */}
              <div className="mb-6">
                <div className="text-sm font-bold text-gray-400 mb-4">
                  11 TRICKS BREAKDOWN <span className="text-gray-600">(DIRECTION VOTE + STRENGTH)</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {TRICK_DEFS.map(({ key, label }) => {
                    const dir = currentSignal.trickDirections?.[key] ?? 0;
                    const strength = Math.round(currentSignal.trickScores?.[key] ?? 0);
                    const arrow = dir > 0 ? "▲" : dir < 0 ? "▼" : "–";
                    return (
                      <div
                        key={key}
                        className={`p-2 border-2 text-center ${
                          dir > 0
                            ? "border-green-500 bg-green-950"
                            : dir < 0
                              ? "border-red-500 bg-red-950"
                              : "border-gray-700 bg-gray-900"
                        }`}
                      >
                        <div className="text-xs font-bold text-gray-300">{label}</div>
                        <div
                          className={`text-xl font-black ${
                            dir > 0
                              ? "text-green-400"
                              : dir < 0
                                ? "text-red-400"
                                : "text-gray-500"
                          }`}
                        >
                          {arrow} {strength}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="h-1 bg-red-600 my-6"></div>

              {/* MEASURED ACCURACY */}
              <div className="mb-6">
                <div className="text-sm font-bold text-gray-400 mb-4">
                  MEASURED ACCURACY <span className="text-gray-600">(LIVE RESULTS — {activePair} / {timeframe})</span>
                </div>
                {accuracyRow && accuracyRow.total > 0 ? (
                  <>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="border border-gray-700 p-4 bg-gray-900">
                        <div className="text-xs font-bold text-gray-400">SIGNALS RESOLVED</div>
                        <div className="text-2xl font-black">{accuracyRow.total}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          ↑ {accuracyRow.upSignals} UP · ↓ {accuracyRow.downSignals} DOWN
                        </div>
                      </div>
                      <div className="border border-gray-700 p-4 bg-gray-900">
                        <div className="text-xs font-bold text-gray-400">ACCURACY</div>
                        <div
                          className={`text-2xl font-black ${
                            accuracyRow.accuracy >= 60
                              ? "text-green-400"
                              : accuracyRow.accuracy >= 50
                                ? "text-yellow-400"
                                : "text-red-400"
                          }`}
                        >
                          {accuracyRow.accuracy}%
                        </div>
                      </div>
                      <div className="border border-gray-700 p-4 bg-gray-900">
                        <div className="text-xs font-bold text-gray-400">AVG CONFIDENCE</div>
                        <div className="text-2xl font-black">{accuracyRow.avgConfidence}%</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {accuracyRow.byConfidence.map((b) => (
                        <div key={b.bucket} className="flex items-center gap-3">
                          <div className="w-16 text-xs font-black text-gray-400">{b.bucket}%</div>
                          <div className="flex-1 h-5 bg-gray-900 border border-gray-700">
                            <div
                              className={`h-full ${
                                b.accuracy >= 60
                                  ? "bg-green-600"
                                  : b.accuracy >= 50
                                    ? "bg-yellow-600"
                                    : "bg-red-600"
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, b.accuracy))}%` }}
                            />
                          </div>
                          <div className="w-28 text-xs font-black text-right">
                            {b.accuracy}% <span className="text-gray-500">({b.total})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="border-2 border-dashed border-gray-700 p-6 text-center text-gray-500 font-bold">
                    Collecting live results — check back soon.
                  </div>
                )}
              </div>

              <div className="h-1 bg-red-600 my-6"></div>

              {/* Signals + Feedback — har candle time ke saath */}
              <div className="mb-6">
                <div className="text-sm font-bold text-gray-400 mb-4">
                  SIGNALS — KAUNSI CANDLE SAHI / GALAT THI?
                </div>
                {signalLog.filter((e) => e.pair === activePair).length === 0 ? (
                  <div className="text-gray-500 text-sm border border-dashed border-gray-700 p-4 text-center">
                    Abhi tak koi UP/DOWN signal nahi aaya. Signal aate hi yahan time ke saath dikhega.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {signalLog
                      .filter((e) => e.pair === activePair)
                      .slice(0, 5)
                      .map((logEntry, i) => {
                        const fb = feedbackHistory.find(
                          (f) => f.pair === logEntry.pair && f.candleTime === logEntry.candleTime
                        );
                        const candleClosed =
                          Date.now() > new Date(logEntry.candleTime).getTime() + 60000;
                        return (
                          <div key={i} className="border border-gray-700 p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-gray-300">
                                🕐{" "}
                                {new Date(logEntry.candleTime).toLocaleString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                                <span className="text-xs text-gray-500">
                                  {" "}
                                  {candleClosed ? "✓ candle band" : "● live"}
                                </span>
                              </span>
                              <span
                                className={`text-sm font-black ${
                                  logEntry.signal === "UP" ? "text-green-400" : "text-red-400"
                                }`}
                              >
                                {logEntry.signal}
                              </span>
                            </div>
                            {fb ? (
                              <div className="text-sm font-bold text-gray-400">
                                Tumhari feedback: {fb.outcome === "NEUTRAL" ? "~ SIDEWAYS" : fb.correct ? "✓ SAHI THI" : "✗ GALAT THI"}
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleFeedback(logEntry.signal, logEntry)}
                                  className="flex-1 bg-green-600 hover:bg-green-700 px-3 py-2 text-sm font-bold"
                                >
                                  ✓ SAHI THI
                                </button>
                                <button
                                  onClick={() =>
                                    handleFeedback(logEntry.signal === "UP" ? "DOWN" : "UP", logEntry)
                                  }
                                  className="flex-1 bg-red-600 hover:bg-red-700 px-3 py-2 text-sm font-bold"
                                >
                                  ✗ GALAT THI
                                </button>
                                <button
                                  onClick={() => handleFeedback("NEUTRAL", logEntry)}
                                  className="flex-1 bg-gray-600 hover:bg-gray-700 px-3 py-2 text-sm font-bold"
                                >
                                  ~ SIDEWAYS
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              <div className="h-1 bg-red-600 my-6"></div>

              {/* Bot Learning State */}
              {botState && (
                <div>
                  <div className="text-sm font-bold text-gray-400 mb-4">BOT LEARNING STATE</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-gray-700 p-4 bg-gray-900">
                      <div className="text-xs font-bold text-gray-400">TOTAL SIGNALS ANALYZED</div>
                      <div className="text-2xl font-black">{botState.totalSignals}</div>
                    </div>
                    <div className="border border-gray-700 p-4 bg-gray-900">
                      <div className="text-xs font-bold text-gray-400">CURRENT ACCURACY</div>
                      <div className="text-2xl font-black">{botState.accuracy}%</div>
                    </div>
                    <div className="border border-gray-700 p-4 bg-gray-900">
                      <div className="text-xs font-bold text-gray-400">CORRECT PREDICTIONS</div>
                      <div className="text-2xl font-black">{botState.correctSignals}</div>
                    </div>
                    <div className="border border-gray-700 p-4 bg-gray-900">
                      <div className="text-xs font-bold text-gray-400">PATTERNS LEARNED</div>
                      <div className="text-2xl font-black">{botState.patterns}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            )
          ) : (
            <div className="text-gray-500 text-center py-12">No signal data available</div>
          )}
        </div>

        {/* AI Bot Chat Sidebar */}
        <div className="w-80 border-l-4 border-red-600 bg-gray-950 flex flex-col">
          {/* Chat Header */}
          <div className="p-4 border-b-2 border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle size={20} className="text-red-600" />
              <h3 className="text-lg font-black">AI LEARNING BOT</h3>
            </div>
            <p className="text-xs text-gray-400">Learns from your feedback to improve predictions</p>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <p className="text-sm">👋 Hello! I'm your AI trading bot.</p>
                <p className="text-sm mt-2">Ask me about the current signal or give me feedback to help me learn!</p>
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded text-sm ${
                    msg.role === "user"
                      ? "bg-green-900 text-green-100 ml-4"
                      : "bg-gray-800 text-gray-100 mr-4"
                  }`}
                >
                  {msg.content}
                </div>
              ))
            )}
          </div>

          {/* Chat Input */}
          <div className="p-4 border-t-2 border-gray-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAskBot()}
                placeholder="Ask the bot..."
                className="flex-1 bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500"
              />
              <button
                onClick={handleAskBot}
                className="bg-red-600 hover:bg-red-700 p-2"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
