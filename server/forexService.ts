/**
 * Real-time Forex Data Service
 * Fetches live exchange rates for multiple currency pairs
 */

interface ForexPrice {
  pair: string;
  bid: number;
  ask: number;
  mid: number;
  timestamp: Date;
}

interface PriceHistory {
  prices: ForexPrice[];
  lastUpdate: Date;
}

// In-memory cache for price history per pair (last 100 prices each)
const priceCache: Record<string, PriceHistory> = {};

// Initialize cache for all pairs
const CURRENCY_PAIRS = [
  "CAD/JPY",
  "USD/CHF",
  "GBP/HKD",
  "CAD/MXN",
  "AUD/JPY",
  "EUR/NOK",
  "USD/HUF",
];

CURRENCY_PAIRS.forEach((pair) => {
  priceCache[pair] = {
    prices: [],
    lastUpdate: new Date(),
  };
});

/**
 * Fetch real-time price for a currency pair
 */
export async function fetchForexPrice(pair: string): Promise<ForexPrice | null> {
  try {
    // Parse pair (e.g., "CAD/JPY" -> base: "CAD", quote: "JPY")
    const [base, quote] = pair.split("/");

    if (!base || !quote) {
      console.error("Invalid pair format:", pair);
      return null;
    }

    // Fetch exchange rate
    const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${base}`);

    if (!response.ok) {
      console.error("Failed to fetch forex data:", response.statusText);
      return null;
    }

    const data = await response.json();
    const rate = data.rates?.[quote];

    if (!rate) {
      console.error(`${quote} rate not found for ${base}`);
      return null;
    }

    // Add slight variation to simulate bid/ask spread
    const spread = rate * 0.0001; // 0.01% spread
    const price: ForexPrice = {
      pair,
      bid: rate - spread,
      ask: rate + spread,
      mid: rate,
      timestamp: new Date(),
    };

    // Add to cache
    if (!priceCache[pair]) {
      priceCache[pair] = { prices: [], lastUpdate: new Date() };
    }

    priceCache[pair].prices.push(price);
    if (priceCache[pair].prices.length > 100) {
      priceCache[pair].prices.shift(); // Keep only last 100
    }
    priceCache[pair].lastUpdate = new Date();

    return price;
  } catch (error) {
    console.error(`Error fetching forex data for ${pair}:`, error);
    return null;
  }
}

/**
 * Get price history for a specific pair
 */
export function getPriceHistory(pair: string): ForexPrice[] {
  return priceCache[pair]?.prices || [];
}

/**
 * Calculate price change percentage
 */
export function calculatePriceChange(prices: ForexPrice[]): number {
  if (prices.length < 2) return 0;

  const oldest = prices[0]?.mid || 0;
  const newest = prices[prices.length - 1]?.mid || 0;

  if (oldest === 0) return 0;

  return ((newest - oldest) / oldest) * 100;
}

/**
 * Detect trend direction based on price history
 */
export function detectTrend(prices: ForexPrice[]): "UP" | "DOWN" | "NEUTRAL" {
  if (prices.length < 3) return "NEUTRAL";

  const change = calculatePriceChange(prices);

  // Forex price changes are small; 0.005% is a meaningful short-term move.
  if (change > 0.005) return "UP";
  if (change < -0.005) return "DOWN";
  return "NEUTRAL";
}

/**
 * Calculate volatility
 */
export function calculateVolatility(prices: ForexPrice[]): number {
  if (prices.length < 2) return 0;

  const mids = prices.map((p) => p.mid);
  const mean = mids.reduce((a, b) => a + b, 0) / mids.length;
  const variance = mids.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / mids.length;
  const stdDev = Math.sqrt(variance);

  return (stdDev / mean) * 100; // Coefficient of variation
}

/**
 * Analyze price momentum
 */
export function analyzeMomentum(prices: ForexPrice[]): number {
  if (prices.length < 5) return 0;

  // Simple momentum: compare last 5 prices with previous 5
  const recentPrices = prices.slice(-5).map((p) => p.mid);
  const previousPrices = prices.slice(-10, -5).map((p) => p.mid);

  const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
  const previousAvg = previousPrices.reduce((a, b) => a + b, 0) / previousPrices.length;

  return ((recentAvg - previousAvg) / previousAvg) * 100;
}

/**
 * Get support and resistance levels
 */
export function getSupportResistance(prices: ForexPrice[]): { support: number; resistance: number } {
  if (prices.length === 0) {
    return { support: 0, resistance: 0 };
  }

  const mids = prices.map((p) => p.mid);
  const support = Math.min(...mids);
  const resistance = Math.max(...mids);

  return { support, resistance };
}

/**
 * Get all available currency pairs
 */
export function getAllPairs(): string[] {
  return CURRENCY_PAIRS;
}

/**
 * Simulate timeframe-based analysis (1m vs 5m)
 * In real implementation, would use different candle data
 */
export function getTimeframeAnalysis(prices: ForexPrice[], timeframe: "1m" | "5m") {
  // For 1m: use more recent data, more sensitive
  // For 5m: use broader data, less sensitive
  const factor = timeframe === "1m" ? 0.8 : 1.2;

  return {
    timeframe,
    volatilityFactor: factor,
    sensitivity: timeframe === "1m" ? "HIGH" : "MEDIUM",
  };
}
