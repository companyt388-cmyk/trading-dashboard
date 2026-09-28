import { eq, and, desc, asc } from "drizzle-orm";
import { candles, predictions, patternHistory, supportResistance, accuracyTracking, InsertCandle, InsertPrediction, InsertPatternHistory } from "../drizzle/schema";
import { getDb } from "./db";

/**
 * Store candle data
 */
export async function storeCandle(data: InsertCandle): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(candles).values(data);
}

/**
 * Get candles for a specific pair and timeframe
 */
export async function getCandles(pair: string, timeframe: string, limit: number = 100) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(candles)
    .where(and(eq(candles.pair, pair), eq(candles.timeframe, timeframe)))
    .orderBy(asc(candles.timestamp))
    .limit(limit);

  // Convert decimal strings to numbers for analysis
  return result.map(c => ({
    ...c,
    open: parseFloat(c.open.toString()),
    high: parseFloat(c.high.toString()),
    low: parseFloat(c.low.toString()),
    close: parseFloat(c.close.toString()),
    volume: parseFloat(c.volume.toString()),
  })) as any;
}

/**
 * Get latest candle for a pair and timeframe
 */
export async function getLatestCandle(pair: string, timeframe: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(candles)
    .where(and(eq(candles.pair, pair), eq(candles.timeframe, timeframe)))
    .orderBy(desc(candles.timestamp))
    .limit(1);

  if (!result[0]) return undefined;
  
  return {
    ...result[0],
    open: parseFloat(result[0].open.toString()),
    high: parseFloat(result[0].high.toString()),
    low: parseFloat(result[0].low.toString()),
    close: parseFloat(result[0].close.toString()),
    volume: parseFloat(result[0].volume.toString()),
  } as any;
}

/**
 * Store prediction result
 */
export async function storePrediction(data: InsertPrediction): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(predictions).values(data);
}

/**
 * Get latest prediction for a pair and timeframe
 */
export async function getLatestPrediction(pair: string, timeframe: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(predictions)
    .where(and(eq(predictions.pair, pair), eq(predictions.timeframe, timeframe)))
    .orderBy(desc(predictions.createdAt))
    .limit(1);

  return result[0];
}

/**
 * Get prediction history for accuracy tracking
 */
export async function getPredictionHistory(pair: string, timeframe: string, limit: number = 50) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(predictions)
    .where(and(eq(predictions.pair, pair), eq(predictions.timeframe, timeframe)))
    .orderBy(desc(predictions.createdAt))
    .limit(limit);

  return result;
}

/**
 * Store detected pattern
 */
export async function storePattern(data: InsertPatternHistory): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(patternHistory).values(data);
}

/**
 * Get recent patterns for a pair
 */
export async function getRecentPatterns(pair: string, timeframe: string, limit: number = 20) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(patternHistory)
    .where(and(eq(patternHistory.pair, pair), eq(patternHistory.timeframe, timeframe)))
    .orderBy(desc(patternHistory.createdAt))
    .limit(limit);

  return result;
}

/**
 * Store or update support/resistance level
 */
export async function storeSupportResistance(pair: string, timeframe: string, level: number, type: "SUPPORT" | "RESISTANCE", strength: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if level exists (within tolerance)
  const tolerance = level * 0.001; // 0.1% tolerance
  const existing = await db
    .select()
    .from(supportResistance)
    .where(
      and(
        eq(supportResistance.pair, pair),
        eq(supportResistance.timeframe, timeframe),
        eq(supportResistance.type, type)
      )
    );

  const existingLevel = existing.find((s) => Math.abs(parseFloat(s.level.toString()) - level) < tolerance);

  if (existingLevel) {
    // Update touches count
    await db
      .update(supportResistance)
      .set({ touches: (existingLevel.touches || 1) + 1 })
      .where(eq(supportResistance.id, existingLevel.id));
  } else {
    // Insert new level
    await db.insert(supportResistance).values({
      pair,
      timeframe,
      level,
      type,
      strength,
      touches: 1,
    } as any);
  }
}

/**
 * Get support/resistance levels for a pair
 */
export async function getSupportResistanceLevels(pair: string, timeframe: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(supportResistance)
    .where(and(eq(supportResistance.pair, pair), eq(supportResistance.timeframe, timeframe)))
    .orderBy(desc(supportResistance.strength));

  return result;
}

/**
 * Calculate prediction accuracy
 */
export async function calculateAccuracy(pair: string, timeframe: string): Promise<{ correct: number; total: number; percentage: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(accuracyTracking)
    .where(and(eq(accuracyTracking.pair, pair), eq(accuracyTracking.timeframe, timeframe)));

  const resolved = result.filter((r) => r.isCorrect !== null);
  const correct = resolved.filter((r) => r.isCorrect === 1).length;

  return {
    correct,
    total: resolved.length,
    percentage: resolved.length > 0 ? (correct / resolved.length) * 100 : 0,
  };
}

/**
 * Get all currency pairs
 */
export function getAllPairs(): string[] {
  return ["CHF/JPY", "CAD/JPY", "USD/CHF", "GBP/HKD", "CAD/MXN", "AUD/JPY", "EUR/NOK", "USD/HUF"];
}
