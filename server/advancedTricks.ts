/**
 * Advanced 11 Trading Tricks Implementation
 * Properly analyzes each trick based on real price data
 */

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

interface TrickAnalysis {
  name: string;
  active: boolean;
  score: number;
  reason: string;
}

/**
 * Trick 1: Wick Crossing - Detect when price crosses previous support/resistance levels
 */
export function analyzeTrick1_WickCrossing(candles: Candle[]): TrickAnalysis {
  if (candles.length < 3) {
    return { name: "Wick Crossing", active: false, score: 0, reason: "Insufficient data" };
  }

  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const older = candles[candles.length - 3];

  // Check if current wick crosses previous support/resistance
  const prevSupport = Math.min(previous.low, older.low);
  const prevResistance = Math.max(previous.high, older.high);

  const crossesSupport = current.low < prevSupport && current.close > prevSupport;
  const crossesResistance = current.high > prevResistance && current.close < prevResistance;

  const active = crossesSupport || crossesResistance;
  const score = active ? 85 : 0;

  return {
    name: "Wick Crossing",
    active,
    score,
    reason: active ? "Wick crossing detected at support/resistance" : "No wick crossing",
  };
}

/**
 * Trick 2: Wick + Volume - Combine wick crossing with volume confirmation
 */
export function analyzeTrick2_WickVolume(candles: Candle[]): TrickAnalysis {
  if (candles.length < 3) {
    return { name: "Wick + Volume", active: false, score: 0, reason: "Insufficient data" };
  }

  const current = candles[candles.length - 1];
  const avgVolume = candles.slice(-5).reduce((sum, c) => sum + c.volume, 0) / 5;

  // Check if volume is higher than average (confirmation)
  const volumeConfirmed = current.volume > avgVolume * 1.5;

  // Check wick crossing
  const wickAnalysis = analyzeTrick1_WickCrossing(candles);

  const active = wickAnalysis.active && volumeConfirmed;
  const score = active ? 90 : wickAnalysis.score * 0.5;

  return {
    name: "Wick + Volume",
    active,
    score,
    reason: active ? "Wick crossing with high volume confirmation" : "Volume not confirmed",
  };
}

/**
 * Trick 3: Volume Spread Analysis (VSA) - Big candle low volume vs small candle high volume
 */
export function analyzeTrick3_VolumeSpread(candles: Candle[]): TrickAnalysis {
  if (candles.length < 2) {
    return { name: "Volume Spread", active: false, score: 0, reason: "Insufficient data" };
  }

  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  const currentRange = current.high - current.low;
  const previousRange = previous.high - previous.low;

  // Big candle low volume = trap (fake move)
  // Small candle high volume = smart money entry
  const bigCandleLowVolume = currentRange > previousRange * 1.5 && current.volume < previous.volume;
  const smallCandleHighVolume = currentRange < previousRange * 0.7 && current.volume > previous.volume * 1.5;

  const active = smallCandleHighVolume; // Small candle high volume is bullish
  const score = active ? 80 : bigCandleLowVolume ? 20 : 0;

  return {
    name: "Volume Spread",
    active,
    score,
    reason: active ? "Small candle with high volume detected" : "No VSA pattern",
  };
}

/**
 * Trick 4: 3 Motive Candles + Counter + Last Effort (Wyckoff Theory)
 */
export function analyzeTrick4_MotiveCandles(candles: Candle[]): TrickAnalysis {
  if (candles.length < 5) {
    return { name: "Motive Candles", active: false, score: 0, reason: "Insufficient data" };
  }

  const last3 = candles.slice(-3);
  const allGreen = last3.every((c) => c.close > c.open);
  const allRed = last3.every((c) => c.close < c.open);

  // Check for increasing volumes (motive candles)
  const increasingVolume = last3[0].volume < last3[1].volume && last3[1].volume < last3[2].volume;

  const active = (allGreen || allRed) && increasingVolume;
  const score = active ? 85 : 0;

  return {
    name: "Motive Candles",
    active,
    score,
    reason: active ? "3 motive candles with increasing volume detected" : "No motive pattern",
  };
}

/**
 * Trick 5: Horizontal Line Breakout - Price breaks through support/resistance
 */
export function analyzeTrick5_Breakout(candles: Candle[]): TrickAnalysis {
  if (candles.length < 10) {
    return { name: "Breakout", active: false, score: 0, reason: "Insufficient data" };
  }

  const recent = candles.slice(-10);
  const support = Math.min(...recent.map((c) => c.low));
  const resistance = Math.max(...recent.map((c) => c.high));

  const current = candles[candles.length - 1];

  // Breakout above resistance or below support
  const breakoutUp = current.close > resistance && current.volume > candles.slice(-5).reduce((sum, c) => sum + c.volume, 0) / 5;
  const breakoutDown = current.close < support && current.volume > candles.slice(-5).reduce((sum, c) => sum + c.volume, 0) / 5;

  const active = breakoutUp || breakoutDown;
  const score = active ? 85 : 0;

  return {
    name: "Breakout",
    active,
    score,
    reason: active ? "Breakout detected with volume confirmation" : "No breakout",
  };
}

/**
 * Trick 6: Rejection + Early Volume Spike
 */
export function analyzeTrick6_RejectionSpike(candles: Candle[]): TrickAnalysis {
  if (candles.length < 3) {
    return { name: "Rejection Spike", active: false, score: 0, reason: "Insufficient data" };
  }

  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  // Rejection: price goes high but closes low (or vice versa)
  const rejectionUp = current.high > previous.high && current.close < previous.close;
  const rejectionDown = current.low < previous.low && current.close > previous.close;

  const avgVolume = candles.slice(-5).reduce((sum, c) => sum + c.volume, 0) / 5;
  const volumeSpike = current.volume > avgVolume * 2;

  const active = (rejectionUp || rejectionDown) && volumeSpike;
  const score = active ? 80 : 0;

  return {
    name: "Rejection Spike",
    active,
    score,
    reason: active ? "Price rejection with volume spike detected" : "No rejection pattern",
  };
}

/**
 * Trick 7: Price + Volume Anomaly
 */
export function analyzeTrick7_PriceVolumeAnomaly(candles: Candle[]): TrickAnalysis {
  if (candles.length < 5) {
    return { name: "Price-Vol Anomaly", active: false, score: 0, reason: "Insufficient data" };
  }

  const current = candles[candles.length - 1];
  const avgVolume = candles.slice(-5).reduce((sum, c) => sum + c.volume, 0) / 5;
  const avgRange = candles.slice(-5).reduce((sum, c) => sum + (c.high - c.low), 0) / 5;

  // Anomaly: large price move with low volume (unusual)
  const largeRange = current.high - current.low > avgRange * 1.5;
  const lowVolume = current.volume < avgVolume * 0.8;

  const active = largeRange && lowVolume;
  const score = active ? 70 : 0;

  return {
    name: "Price-Vol Anomaly",
    active,
    score,
    reason: active ? "Unusual price-volume anomaly detected" : "No anomaly",
  };
}

/**
 * Trick 8: 3 Anomalies on SNR (Exhaustion Candle)
 */
export function analyzeTrick8_Exhaustion(candles: Candle[]): TrickAnalysis {
  if (candles.length < 3) {
    return { name: "Exhaustion", active: false, score: 0, reason: "Insufficient data" };
  }

  const last3 = candles.slice(-3);
  const avgVolume = candles.slice(-10).reduce((sum, c) => sum + c.volume, 0) / 10;

  // Count anomalies: high volume with small range
  let anomalies = 0;
  last3.forEach((c) => {
    const range = c.high - c.low;
    if (c.volume > avgVolume * 1.5 && range < (candles.slice(-5).reduce((sum, x) => sum + (x.high - x.low), 0) / 5) * 0.7) {
      anomalies++;
    }
  });

  const active = anomalies >= 2;
  const score = active ? 85 : 0;

  return {
    name: "Exhaustion",
    active,
    score,
    reason: active ? `${anomalies} exhaustion anomalies detected` : "No exhaustion pattern",
  };
}

/**
 * Trick 9: No Supply / No Demand
 */
export function analyzeTrick9_NoSupplyDemand(candles: Candle[]): TrickAnalysis {
  if (candles.length < 3) {
    return { name: "Supply/Demand", active: false, score: 0, reason: "Insufficient data" };
  }

  const last3 = candles.slice(-3);
  const avgVolume = candles.slice(-5).reduce((sum, c) => sum + c.volume, 0) / 5;

  // No supply: 2 green candles high volume, 3rd green low volume
  const noSupply = last3[0].close > last3[0].open && last3[1].close > last3[1].open && 
                   last3[0].volume > avgVolume && last3[1].volume > avgVolume && 
                   last3[2].close > last3[2].open && last3[2].volume < avgVolume;

  // No demand: 2 red candles high volume, 3rd red low volume
  const noDemand = last3[0].close < last3[0].open && last3[1].close < last3[1].open && 
                   last3[0].volume > avgVolume && last3[1].volume > avgVolume && 
                   last3[2].close < last3[2].open && last3[2].volume < avgVolume;

  const active = noSupply || noDemand;
  const score = active ? 80 : 0;

  return {
    name: "Supply/Demand",
    active,
    score,
    reason: active ? (noSupply ? "No supply detected" : "No demand detected") : "Normal supply/demand",
  };
}

/**
 * Trick 10: Green-Red-Green or Red-Green-Red Pattern (Sandwich)
 */
export function analyzeTrick10_SandwichPattern(candles: Candle[]): TrickAnalysis {
  if (candles.length < 3) {
    return { name: "Sandwich Pattern", active: false, score: 0, reason: "Insufficient data" };
  }

  const last3 = candles.slice(-3);
  const colors = last3.map((c) => (c.close > c.open ? "G" : "R"));

  // Green-Red-Green or Red-Green-Red
  const isGRG = colors[0] === "G" && colors[1] === "R" && colors[2] === "G";
  const isRGR = colors[0] === "R" && colors[1] === "G" && colors[2] === "R";

  const active = isGRG || isRGR;
  const score = active ? 75 : 0;

  return {
    name: "Sandwich Pattern",
    active,
    score,
    reason: active ? `${colors.join("")} pattern detected` : "No sandwich pattern",
  };
}

/**
 * Trick 11: Oversized Candle (Engulfing Trap)
 */
export function analyzeTrick11_EngulfingTrap(candles: Candle[]): TrickAnalysis {
  if (candles.length < 2) {
    return { name: "Engulfing Trap", active: false, score: 0, reason: "Insufficient data" };
  }

  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  // Current candle engulfs previous candle
  const engulfs = current.low < previous.low && current.high > previous.high;

  // And current has high volume (trap)
  const avgVolume = candles.slice(-5).reduce((sum, c) => sum + c.volume, 0) / 5;
  const highVolume = current.volume > avgVolume * 2;

  const active = engulfs && highVolume;
  const score = active ? 80 : 0;

  return {
    name: "Engulfing Trap",
    active,
    score,
    reason: active ? "Oversized engulfing candle with high volume detected" : "No engulfing trap",
  };
}

/**
 * Analyze all 11 tricks and return comprehensive analysis
 */
export function analyzeAll11Tricks(candles: Candle[]) {
  return {
    trick1: analyzeTrick1_WickCrossing(candles),
    trick2: analyzeTrick2_WickVolume(candles),
    trick3: analyzeTrick3_VolumeSpread(candles),
    trick4: analyzeTrick4_MotiveCandles(candles),
    trick5: analyzeTrick5_Breakout(candles),
    trick6: analyzeTrick6_RejectionSpike(candles),
    trick7: analyzeTrick7_PriceVolumeAnomaly(candles),
    trick8: analyzeTrick8_Exhaustion(candles),
    trick9: analyzeTrick9_NoSupplyDemand(candles),
    trick10: analyzeTrick10_SandwichPattern(candles),
    trick11: analyzeTrick11_EngulfingTrap(candles),
  };
}

/**
 * Calculate overall signal based on all tricks
 */
export function calculateSignalFromTricks(allTricks: ReturnType<typeof analyzeAll11Tricks>) {
  const tricks = Object.values(allTricks);
  const activeTricks = tricks.filter((t) => t.active).length;
  const avgScore = tricks.reduce((sum, t) => sum + t.score, 0) / tricks.length;

  // Determine signal direction based on which tricks are active
  const bullishTricks = tricks.filter((t) => t.active && ["Wick Crossing", "Breakout", "Motive Candles"].includes(t.name)).length;
  const bearishTricks = tricks.filter((t) => t.active && ["Rejection Spike", "Exhaustion"].includes(t.name)).length;

  let signal = "NO_TRADE";
  if (activeTricks >= 7 && avgScore > 60) {
    signal = bullishTricks > bearishTricks ? "UP" : "DOWN";
  }

  return {
    signal,
    confidence: Math.round(avgScore),
    activeTricks,
    bullishTricks,
    bearishTricks,
    allTricks: tricks,
  };
}
