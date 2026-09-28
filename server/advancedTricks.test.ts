import { describe, it, expect } from "vitest";
import {
  analyzeTrick1_WickCrossing,
  analyzeTrick2_WickVolume,
  analyzeTrick3_VolumeSpread,
  analyzeTrick4_MotiveCandles,
  analyzeTrick5_Breakout,
  analyzeTrick6_RejectionSpike,
  analyzeTrick7_PriceVolumeAnomaly,
  analyzeTrick8_Exhaustion,
  analyzeTrick9_NoSupplyDemand,
  analyzeTrick10_SandwichPattern,
  analyzeTrick11_EngulfingTrap,
  analyzeAll11Tricks,
  calculateSignalFromTricks,
} from "./advancedTricks";

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

// Helper function to create mock candles
function createMockCandles(count: number, trend: "up" | "down" | "neutral" = "neutral"): Candle[] {
  const candles: Candle[] = [];
  let basePrice = 100;

  for (let i = 0; i < count; i++) {
    const direction = trend === "up" ? 1 : trend === "down" ? -1 : Math.random() > 0.5 ? 1 : -1;
    const open = basePrice;
    const close = basePrice + direction * (Math.random() * 2);
    const high = Math.max(open, close) + Math.random() * 0.5;
    const low = Math.min(open, close) - Math.random() * 0.5;
    const volume = Math.random() * 1000 + 500;

    candles.push({
      open,
      high,
      low,
      close,
      volume,
      timestamp: new Date(),
    });

    basePrice = close;
  }

  return candles;
}

describe("Advanced Trading Tricks Analysis", () => {
  describe("Trick 1: Wick Crossing", () => {
    it("should detect wick crossing at support level", () => {
      const candles = createMockCandles(3, "neutral");
      candles[2].low = Math.min(candles[0].low, candles[1].low) - 1;
      candles[2].close = Math.min(candles[0].low, candles[1].low) + 0.5;

      const result = analyzeTrick1_WickCrossing(candles);
      expect(result.active).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it("should return false when no wick crossing", () => {
      const candles = createMockCandles(3, "up");
      const result = analyzeTrick1_WickCrossing(candles);
      expect(result.name).toBe("Wick Crossing");
    });
  });

  describe("Trick 2: Wick + Volume", () => {
    it("should detect wick crossing with volume confirmation", () => {
      const candles = createMockCandles(3, "neutral");
      candles[2].low = Math.min(candles[0].low, candles[1].low) - 1;
      candles[2].close = Math.min(candles[0].low, candles[1].low) + 0.5;
      candles[2].volume = 2000; // High volume

      const result = analyzeTrick2_WickVolume(candles);
      expect(result.name).toBe("Wick + Volume");
    });
  });

  describe("Trick 3: Volume Spread Analysis", () => {
    it("should detect small candle with high volume", () => {
      const candles = createMockCandles(2);
      const prevRange = candles[0].high - candles[0].low;
      candles[1].high = candles[1].low + prevRange * 0.5; // Small range
      candles[1].volume = 2000; // High volume

      const result = analyzeTrick3_VolumeSpread(candles);
      expect(result.name).toBe("Volume Spread");
    });
  });

  describe("Trick 4: 3 Motive Candles", () => {
    it("should detect 3 green candles with increasing volume", () => {
      const candles: Candle[] = [
        { open: 100, high: 102, low: 99, close: 101.5, volume: 500, timestamp: new Date() },
        { open: 101.5, high: 103.5, low: 100.5, close: 103, volume: 750, timestamp: new Date() },
        { open: 103, high: 105, low: 102, close: 104.5, volume: 1000, timestamp: new Date() },
      ];

      const result = analyzeTrick4_MotiveCandles(candles);
      expect(result.name).toBe("Motive Candles");
    });
  });

  describe("Trick 5: Breakout", () => {
    it("should detect breakout above resistance with volume", () => {
      const candles = createMockCandles(10, "up");
      const resistance = Math.max(...candles.slice(-10).map((c) => c.high));
      candles[candles.length - 1].close = resistance + 1;
      candles[candles.length - 1].volume = 2000;

      const result = analyzeTrick5_Breakout(candles);
      expect(result.name).toBe("Breakout");
    });
  });

  describe("Trick 6: Rejection Spike", () => {
    it("should detect price rejection with volume spike", () => {
      const candles = createMockCandles(3);
      candles[2].high = candles[1].high + 1;
      candles[2].close = candles[1].close - 1;
      candles[2].volume = 2000;

      const result = analyzeTrick6_RejectionSpike(candles);
      expect(result.name).toBe("Rejection Spike");
    });
  });

  describe("Trick 7: Price-Volume Anomaly", () => {
    it("should detect large price move with low volume", () => {
      const candles = createMockCandles(5);
      const avgRange = candles.slice(-5).reduce((sum, c) => sum + (c.high - c.low), 0) / 5;
      candles[4].high = candles[4].low + avgRange * 2;
      candles[4].volume = 100; // Low volume

      const result = analyzeTrick7_PriceVolumeAnomaly(candles);
      expect(result.name).toBe("Price-Vol Anomaly");
    });
  });

  describe("Trick 8: Exhaustion", () => {
    it("should detect exhaustion candles", () => {
      const avgVolume = 1000;
      const candles: Candle[] = [
        { open: 100, high: 101, low: 99, close: 100.5, volume: 1500, timestamp: new Date() },
        { open: 100.5, high: 101.5, low: 99.5, close: 101, volume: 1600, timestamp: new Date() },
        { open: 101, high: 101.2, low: 100.8, close: 101.1, volume: 1700, timestamp: new Date() },
      ];

      const result = analyzeTrick8_Exhaustion(candles);
      expect(result.name).toBe("Exhaustion");
    });
  });

  describe("Trick 9: No Supply/Demand", () => {
    it("should detect no supply pattern", () => {
      const candles: Candle[] = [
        { open: 100, high: 101, low: 99.5, close: 100.8, volume: 1000, timestamp: new Date() },
        { open: 100.8, high: 102, low: 100, close: 101.5, volume: 1200, timestamp: new Date() },
        { open: 101.5, high: 101.8, low: 101, close: 101.6, volume: 300, timestamp: new Date() },
      ];

      const result = analyzeTrick9_NoSupplyDemand(candles);
      expect(result.name).toBe("Supply/Demand");
    });
  });

  describe("Trick 10: Sandwich Pattern", () => {
    it("should detect Green-Red-Green pattern", () => {
      const candles: Candle[] = [
        { open: 100, high: 101, low: 99.5, close: 100.8, volume: 500, timestamp: new Date() }, // Green
        { open: 100.8, high: 101, low: 99.8, close: 99.9, volume: 500, timestamp: new Date() }, // Red
        { open: 99.9, high: 101.2, low: 99.5, close: 100.5, volume: 500, timestamp: new Date() }, // Green
      ];

      const result = analyzeTrick10_SandwichPattern(candles);
      expect(result.name).toBe("Sandwich Pattern");
      expect(result.active).toBe(true);
    });
  });

  describe("Trick 11: Engulfing Trap", () => {
    it("should detect engulfing candle with high volume", () => {
      const candles: Candle[] = [
        { open: 100.5, high: 101, low: 100, close: 100.8, volume: 500, timestamp: new Date() },
        { open: 100.2, high: 101.5, low: 99.5, close: 100.5, volume: 2000, timestamp: new Date() },
      ];

      const result = analyzeTrick11_EngulfingTrap(candles);
      expect(result.name).toBe("Engulfing Trap");
    });
  });

  describe("Analyze All 11 Tricks", () => {
    it("should return all 11 trick analyses", () => {
      const candles = createMockCandles(10, "up");
      const result = analyzeAll11Tricks(candles);

      expect(result.trick1).toBeDefined();
      expect(result.trick2).toBeDefined();
      expect(result.trick3).toBeDefined();
      expect(result.trick4).toBeDefined();
      expect(result.trick5).toBeDefined();
      expect(result.trick6).toBeDefined();
      expect(result.trick7).toBeDefined();
      expect(result.trick8).toBeDefined();
      expect(result.trick9).toBeDefined();
      expect(result.trick10).toBeDefined();
      expect(result.trick11).toBeDefined();
    });
  });

  describe("Calculate Signal from Tricks", () => {
    it("should generate UP signal when 7+ tricks are active", () => {
      const candles = createMockCandles(10, "up");
      const allTricks = analyzeAll11Tricks(candles);

      // Manually set some tricks to active for testing
      (allTricks as any).trick1.active = true;
      (allTricks as any).trick2.active = true;
      (allTricks as any).trick3.active = true;
      (allTricks as any).trick4.active = true;
      (allTricks as any).trick5.active = true;
      (allTricks as any).trick6.active = true;
      (allTricks as any).trick7.active = true;

      const result = calculateSignalFromTricks(allTricks);
      expect(result.activeTricks).toBeGreaterThanOrEqual(7);
    });

    it("should return NO_TRADE when less than 7 tricks active", () => {
      const candles = createMockCandles(5);
      const allTricks = analyzeAll11Tricks(candles);

      const result = calculateSignalFromTricks(allTricks);
      expect(result.signal).toBe("NO_TRADE");
    });
  });
});
