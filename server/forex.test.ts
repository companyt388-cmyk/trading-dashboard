import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";

describe("Forex API Integration", () => {
  it("should have FOREX_API_KEY configured", () => {
    expect(ENV.forexApiKey).toBeDefined();
    expect(ENV.forexApiKey).toBeTruthy();
    expect(ENV.forexApiKey.length).toBeGreaterThan(0);
  });

  it("should validate API key format", () => {
    const apiKey = ENV.forexApiKey;
    // API key should be a valid string (adjust pattern based on your API provider)
    expect(apiKey).toMatch(/^[a-f0-9]{32}$/i);
  });

  it("should be able to construct API request with the key", () => {
    const apiKey = ENV.forexApiKey;
    const pair = "CHF/JPY";
    const timeframe = "1m";
    
    // Simulate API request construction
    const apiUrl = `https://api.example.com/candles?pair=${pair}&timeframe=${timeframe}&apikey=${apiKey}`;
    
    expect(apiUrl).toContain(apiKey);
    expect(apiUrl).toContain(pair);
    expect(apiUrl).toContain(timeframe);
  });
});
