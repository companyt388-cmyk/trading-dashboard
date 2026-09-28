import { invokeLLM } from "./_core/llm";

/**
 * Adaptive AI Learning Bot
 * Analyzes 2-hour historical data, learns from user feedback, and improves predictions
 */

interface SignalFeedback {
  signalId: string;
  pair: string;
  timeframe: string;
  predictedSignal: "UP" | "DOWN" | "NO_TRADE";
  actualOutcome: "UP" | "DOWN" | "NEUTRAL";
  isCorrect: boolean;
  confidence: number;
  timestamp: Date;
  userFeedback: string;
}

interface HistoricalPattern {
  pattern: string;
  occurrences: number;
  successRate: number;
  lastSeen: Date;
}

interface BotLearningState {
  totalSignals: number;
  correctSignals: number;
  accuracy: number;
  patterns: HistoricalPattern[];
  feedback: SignalFeedback[];
  lastUpdated: Date;
}

// In-memory learning state
const botState: Record<string, BotLearningState> = {};

/**
 * Initialize learning state for a pair
 */
export function initializeBotState(pair: string): BotLearningState {
  if (!botState[pair]) {
    botState[pair] = {
      totalSignals: 0,
      correctSignals: 0,
      accuracy: 0,
      patterns: [],
      feedback: [],
      lastUpdated: new Date(),
    };
  }
  return botState[pair];
}

/**
 * Analyze 2-hour historical data using LLM
 */
export async function analyzeHistoricalData(
  pair: string,
  priceHistory: any[],
  currentSignal: { signal: string; confidence: number }
): Promise<string> {
  try {
    // Prepare historical data summary
    const recentPrices = priceHistory.slice(-120); // Last 2 hours (assuming 1-minute candles)
    const highPrice = Math.max(...recentPrices.map((p: any) => p.mid || 0));
    const lowPrice = Math.min(...recentPrices.map((p: any) => p.mid || 0));
    const avgPrice = recentPrices.reduce((sum: number, p: any) => sum + (p.mid || 0), 0) / recentPrices.length;

    const priceChange = recentPrices.length > 0 
      ? ((recentPrices[recentPrices.length - 1]?.mid - recentPrices[0]?.mid) / recentPrices[0]?.mid) * 100
      : 0;

    const historyAnalysis = `
2-Hour Historical Analysis for ${pair}:
- High: ${highPrice.toFixed(4)}
- Low: ${lowPrice.toFixed(4)}
- Average: ${avgPrice.toFixed(4)}
- Price Change: ${priceChange.toFixed(2)}%
- Current Signal: ${currentSignal.signal} (${currentSignal.confidence}% confidence)
- Data Points: ${recentPrices.length}
    `;

    // Get bot learning state
    const state = botState[pair] || initializeBotState(pair);

    const learningContext = `
Bot Learning State:
- Total Signals Analyzed: ${state.totalSignals}
- Correct Predictions: ${state.correctSignals}
- Current Accuracy: ${state.accuracy.toFixed(2)}%
- Known Patterns: ${state.patterns.length}
    `;

    // Use LLM to analyze and provide insights
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert forex trading analyst AI bot. Analyze price patterns and provide trading insights. 
          You learn from historical data and user feedback. Be concise and actionable.
          Focus on: trend direction, support/resistance levels, risk factors, and pattern recognition.`,
        },
        {
          role: "user",
          content: `${historyAnalysis}\n${learningContext}\n\nProvide a brief analysis of the current signal and historical patterns. 
          Explain if this signal aligns with historical patterns. Suggest confidence level adjustment if needed.`,
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content;
    const analysis = typeof content === "string" ? content : "Unable to analyze at this time";
    return analysis;
  } catch (error) {
    console.error("Error analyzing historical data:", error);
    return "Historical analysis temporarily unavailable";
  }
}

/**
 * Record user feedback and update bot learning
 */
export async function recordFeedback(feedback: SignalFeedback): Promise<void> {
  try {
    const state = botState[feedback.pair] || initializeBotState(feedback.pair);

    // Add feedback
    state.feedback.push(feedback);

    // Update accuracy metrics
    state.totalSignals++;
    if (feedback.isCorrect) {
      state.correctSignals++;
    }
    state.accuracy = (state.correctSignals / state.totalSignals) * 100;
    state.lastUpdated = new Date();

    // Extract pattern if signal was correct
    if (feedback.isCorrect) {
      const pattern = `${feedback.pair}_${feedback.timeframe}_${feedback.predictedSignal}`;
      const existingPattern = state.patterns.find((p) => p.pattern === pattern);

      if (existingPattern) {
        existingPattern.occurrences++;
        existingPattern.successRate = (existingPattern.occurrences / state.totalSignals) * 100;
        existingPattern.lastSeen = new Date();
      } else {
        state.patterns.push({
          pattern,
          occurrences: 1,
          successRate: (1 / state.totalSignals) * 100,
          lastSeen: new Date(),
        });
      }
    }

    // Use LLM to learn from feedback
    await learnFromFeedback(feedback, state);
  } catch (error) {
    console.error("Error recording feedback:", error);
  }
}

/**
 * Use LLM to learn from feedback and improve future predictions
 */
async function learnFromFeedback(feedback: SignalFeedback, state: BotLearningState): Promise<void> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an adaptive AI trading bot. Learn from feedback to improve future predictions.
          Identify patterns, adjust confidence levels, and provide insights for better trading signals.`,
        },
        {
          role: "user",
          content: `Signal Feedback:
- Pair: ${feedback.pair}
- Timeframe: ${feedback.timeframe}
- Predicted: ${feedback.predictedSignal}
- Actual: ${feedback.actualOutcome}
- Correct: ${feedback.isCorrect}
- User Comment: ${feedback.userFeedback}
- Current Accuracy: ${state.accuracy.toFixed(2)}%

What should I learn from this feedback to improve future signals?`,
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content;
    const learning = typeof content === "string" ? content : "Learning processed";
    console.log(`[AI Bot Learning] ${feedback.pair}: ${learning}`);
  } catch (error) {
    console.error("Error in learning feedback:", error);
  }
}

/**
 * Get bot explanation for current signal
 */
export async function explainSignal(
  pair: string,
  signal: { signal: string; confidence: number; trickScores?: any },
  priceHistory?: any[]
): Promise<string> {
  try {
    const state = botState[pair] || initializeBotState(pair);

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a forex trading AI bot. Explain trading signals in simple, actionable terms.
          Reference the 11 trading tricks and historical patterns. Be specific about why the signal is generated.`,
        },
        {
          role: "user",
          content: `Explain this trading signal for ${pair}:
- Signal: ${signal.signal}
- Confidence: ${signal.confidence}%
- Active Tricks: ${Object.values(signal.trickScores).filter((v: any) => v > 50).length}/11
- Bot Accuracy: ${state.accuracy.toFixed(2)}%
- Historical Patterns Matched: ${state.patterns.length}

Provide a concise explanation of why this signal was generated and what the bot learned from history.`,
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : "Signal explanation unavailable";
  } catch (error) {
    console.error("Error explaining signal:", error);
    return "Unable to explain signal at this time";
  }
}

/**
 * Get bot's learning summary
 */
export function getBotLearningState(pair: string): BotLearningState {
  return botState[pair] || initializeBotState(pair);
}

/**
 * Get all patterns learned by the bot
 */
export function getLearnedPatterns(pair: string): HistoricalPattern[] {
  const state = botState[pair];
  if (!state) return [];

  // Sort by success rate
  return state.patterns.sort((a, b) => b.successRate - a.successRate);
}

/**
 * Reset bot learning (for testing)
 */
export function resetBotLearning(pair: string): void {
  if (botState[pair]) {
    botState[pair] = initializeBotState(pair);
  }
}

/**
 * Get recent feedback for a pair
 */
export function getRecentFeedback(pair: string, limit: number = 10): SignalFeedback[] {
  const state = botState[pair];
  if (!state) return [];

  return state.feedback.slice(-limit);
}
