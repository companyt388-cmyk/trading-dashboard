import { getDb } from "./db";
import { candles, InsertCandle } from "../drizzle/schema";

/**
 * Generate realistic OHLCV candle data for testing and demo purposes
 */

const CURRENCY_PAIRS = ["CHF/JPY", "CAD/JPY", "USD/CHF", "GBP/HKD", "CAD/MXN", "AUD/JPY", "EUR/NOK", "USD/HUF"];

interface CandleGeneratorOptions {
  pair: string;
  timeframe: "1m" | "5m";
  startPrice: number;
  volatility: number;
  numCandles: number;
}

/**
 * Generate realistic candlestick data using random walk with mean reversion
 */
function generateRealisticCandles(options: CandleGeneratorOptions): InsertCandle[] {
  const { pair, timeframe, startPrice, volatility, numCandles } = options;
  const result: InsertCandle[] = [];

  let currentPrice = startPrice;
  const now = new Date();
  const timeframeMs = timeframe === "1m" ? 60000 : 300000;

  for (let i = 0; i < numCandles; i++) {
    // Generate random walk with mean reversion
    const randomChange = (Math.random() - 0.5) * volatility;
    const meanReversion = (startPrice - currentPrice) * 0.01;
    const priceChange = randomChange + meanReversion;

    const open = currentPrice;
    const close = currentPrice + priceChange;

    // Generate high and low with some randomness
    const high = Math.max(open, close) + Math.abs(Math.random() * volatility * 0.5);
    const low = Math.min(open, close) - Math.abs(Math.random() * volatility * 0.5);

    // Generate volume with some randomness
    const baseVolume = 1000000;
    const volume = baseVolume * (0.5 + Math.random() * 1.5);

    // Timestamp for this candle
    const timestamp = new Date(now.getTime() - (numCandles - i - 1) * timeframeMs);

    result.push({
      pair,
      timeframe,
      timestamp,
      open: open.toString(),
      high: high.toString(),
      low: low.toString(),
      close: close.toString(),
      volume: volume.toString(),
    });

    currentPrice = close;
  }

  return result;
}

/**
 * Populate database with mock candle data for all pairs
 */
export async function populateMockCandles(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    return;
  }

  try {
    // Check if data already exists
    const existingCount = await db.select().from(candles).limit(1);
    if (existingCount.length > 0) {
      console.log("Mock data already exists, skipping population");
      return;
    }

    console.log("Generating mock candle data for all pairs...");
    let totalInserted = 0;

    // Generate data for each pair and timeframe
    for (const pair of CURRENCY_PAIRS) {
      // Get a realistic starting price for the pair
      const startPrices: Record<string, number> = {
        "CHF/JPY": 155.5,
        "CAD/JPY": 110.2,
        "USD/CHF": 0.88,
        "GBP/HKD": 10.5,
        "CAD/MXN": 17.3,
        "AUD/JPY": 90.1,
        "EUR/NOK": 11.2,
        "USD/HUF": 360.5,
      };

      const startPrice = startPrices[pair] || 100;
      const volatility = 0.001; // 0.1% volatility per candle

      // Generate 1-minute candles (200 candles = ~3 hours of data)
      const oneMinCandles = generateRealisticCandles({
        pair,
        timeframe: "1m",
        startPrice,
        volatility,
        numCandles: 200,
      });

      // Generate 5-minute candles (100 candles = ~8 hours of data)
      const fiveMinCandles = generateRealisticCandles({
        pair,
        timeframe: "5m",
        startPrice,
        volatility: volatility * 2.236, // Adjust volatility for 5m
        numCandles: 100,
      });

      // Batch insert all candles for this pair
      const allCandles = [...oneMinCandles, ...fiveMinCandles];

      try {
        // Insert in batches of 50 to avoid overwhelming the database
        for (let i = 0; i < allCandles.length; i += 50) {
          const batch = allCandles.slice(i, i + 50);
          await db.insert(candles).values(batch);
          totalInserted += batch.length;
        }
        console.log(`✓ Generated ${allCandles.length} candles for ${pair}`);
      } catch (error) {
        console.error(`Error inserting candles for ${pair}:`, error);
      }
    }

    console.log(`✓ Mock candle data population complete! Total: ${totalInserted} candles`);
  } catch (error) {
    console.error("Error populating mock candles:", error);
  }
}

/**
 * Generate a new candle to simulate live data
 */
export function generateNewCandle(
  pair: string,
  timeframe: "1m" | "5m",
  lastCandle: {
    open: number;
    high: number;
    low: number;
    close: number;
  }
): InsertCandle {
  const volatility = 0.001;
  const randomChange = (Math.random() - 0.5) * volatility;
  const meanReversion = (lastCandle.close - lastCandle.open) * 0.01;
  const priceChange = randomChange + meanReversion;

  const open = lastCandle.close;
  const close = open + priceChange;
  const high = Math.max(open, close) + Math.abs(Math.random() * volatility * 0.5);
  const low = Math.min(open, close) - Math.abs(Math.random() * volatility * 0.5);
  const volume = 1000000 * (0.5 + Math.random() * 1.5);

  return {
    pair,
    timeframe,
    timestamp: new Date(),
    open: open.toString(),
    high: high.toString(),
    low: low.toString(),
    close: close.toString(),
    volume: volume.toString(),
  };
}
