import { describe, it, expect } from "vitest";
import { analyzeCandles } from "./tradingTricks";

// Mock candle data for testing
const mockCandles = [
  { open: "100", high: "105", low: "95", close: "103", volume: "1000000", timestamp: new Date(), pair: "CHF/JPY", timeframe: "1m" },
  { open: "103", high: "108", low: "100", close: "106", volume: "1200000", timestamp: new Date(), pair: "CHF/JPY", timeframe: "1m" },
  { open: "106", high: "110", low: "104", close: "108", volume: "1100000", timestamp: new Date(), pair: "CHF/JPY", timeframe: "1m" },
  { open: "108", high: "112", low: "106", close: "110", volume: "1300000", timestamp: new Date(), pair: "CHF/JPY", timeframe: "1m" },
  { open: "110", high: "115", low: "108", close: "112", volume: "1400000", timestamp: new Date(), pair: "CHF/JPY", timeframe: "1m" },
] as any;

describe("Trading Tricks Analysis Engine", () => {
  it("should analyze candles and return valid result", () => {
    const result = analyzeCandles(mockCandles);
    expect(result).toBeDefined();
    expect(result.signal).toMatch(/UP|DOWN|NO_TRADE/);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("should have all 11 trick scores", () => {
    const result = analyzeCandles(mockCandles);
    expect(result.trickScores).toBeDefined();
    expect(result.trickScores.wickCrossing).toBeDefined();
    expect(result.trickScores.wickVolume).toBeDefined();
    expect(result.trickScores.volumeSpread).toBeDefined();
    expect(result.trickScores.motiveCandles).toBeDefined();
    expect(result.trickScores.breakoutValidation).toBeDefined();
    expect(result.trickScores.rejectionSpike).toBeDefined();
    expect(result.trickScores.priceVolumeAnomaly).toBeDefined();
    expect(result.trickScores.exhaustionCandles).toBeDefined();
    expect(result.trickScores.noSupplyDemand).toBeDefined();
    expect(result.trickScores.sandwichPattern).toBeDefined();
    expect(result.trickScores.engulfingTrap).toBeDefined();
  });

  it("should validate entry signal conditions", () => {
    const result = analyzeCandles(mockCandles);
    expect(result.multiTimeframeConfirm).toBeDefined();
    expect(result.emaMatch).toBeDefined();
    expect(result.volumeConfirm).toBeDefined();
    expect(result.liquidityTrapDetect).toBeDefined();
    expect(result.entrySignal).toBeDefined();
  });

  it("should return NO_TRADE for empty candles", () => {
    const result = analyzeCandles([]);
    expect(result.signal).toBe("NO_TRADE");
    expect(result.score).toBe(0);
  });

  it("should calculate score based on trick signals", () => {
    const result = analyzeCandles(mockCandles);
    // Score should be weighted average of all tricks
    const avgScore = (
      result.trickScores.wickCrossing +
      result.trickScores.wickVolume +
      result.trickScores.volumeSpread +
      result.trickScores.motiveCandles +
      result.trickScores.breakoutValidation +
      result.trickScores.rejectionSpike +
      result.trickScores.priceVolumeAnomaly +
      result.trickScores.exhaustionCandles +
      result.trickScores.noSupplyDemand +
      result.trickScores.sandwichPattern +
      result.trickScores.engulfingTrap
    ) / 11;
    
    // Score should be close to average (within reasonable margin)
    expect(Math.abs(result.score - avgScore)).toBeLessThan(30);
  });

  it("should enforce entry signal validation rules", () => {
    const result = analyzeCandles(mockCandles);
    
    // Entry signal should only be true if:
    // 1. Score > 70
    // 2. Multi-timeframe confirmed
    // 3. EMA matches signal
    // 4. Volume confirmed
    // 5. No liquidity trap
    if (result.entrySignal) {
      expect(result.score).toBeGreaterThan(70);
      expect(result.multiTimeframeConfirm).toBe(true);
      expect(result.emaMatch).toBe(true);
      expect(result.volumeConfirm).toBe(true);
      expect(result.liquidityTrapDetect).toBe(false);
    }
  });

  it("should handle multiple candles correctly", () => {
    // Test with more candles
    const moreCandles = Array(50).fill(null).map((_, i) => ({
      open: (100 + i).toString(),
      high: (105 + i).toString(),
      low: (95 + i).toString(),
      close: (103 + i).toString(),
      volume: "1000000",
      timestamp: new Date(),
      pair: "CHF/JPY",
      timeframe: "1m",
    })) as any;

    const result = analyzeCandles(moreCandles);
    expect(result).toBeDefined();
    expect(result.signal).toMatch(/UP|DOWN|NO_TRADE/);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
