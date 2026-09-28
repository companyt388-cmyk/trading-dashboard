import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { fetchForexPrice, getPriceHistory, getAllPairs } from "./forexService";
import { getSignal, getAccuracyStats } from "./signalService";
import { candleService } from "./candleBuilder";
import { analyzeHistoricalData, recordFeedback, explainSignal, getBotLearningState, getLearnedPatterns, getRecentFeedback } from "./aiLearningBot";
import { getAnalystRead } from "./analyst";
import { getDb } from "./db";
import { todos } from "../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import { createMemoryTodo, deleteMemoryTodo, listMemoryTodos, toggleMemoryTodo } from "./todoStore";


export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  trading: router({
    // Get real-time trading signal — 11-trick engine on real 1m candles.
    // NO_TRADE is final: no trend-guess override anymore.
    getRealtimeSignal: publicProcedure
      .input(z.object({ pair: z.string().optional(), timeframe: z.string().optional() }).optional())
      .query(async ({ input }) => {
        try {
          const pair = input?.pair || "CHF/JPY";
          const timeframe = input?.timeframe || "1m";
          return await getSignal(pair, timeframe);
        } catch (error) {
          console.error("Error generating signal:", error);
          return {
            signal: "NO_TRADE",
            confidence: 0,
            price: null,
            candleTime: new Date(Math.floor(Date.now() / 60000) * 60000),
            error: "Error generating signal",
          };
        }
      }),

    // Measured accuracy from resolved predictions (no vibes)
    getAccuracyStats: publicProcedure
      .input(z.object({ pair: z.string().optional(), timeframe: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return getAccuracyStats(input?.pair, input?.timeframe);
      }),

    // Recent 1m candles for charting (with S/R + signal markers on client)
    getCandles: publicProcedure
      .input(z.object({ pair: z.string().optional(), limit: z.number().optional() }).optional())
      .query(({ input }) => {
        const cs = candleService.getCandles(
          input?.pair || "CHF/JPY",
          Math.max(10, Math.min(input?.limit || 120, 500))
        );
        return cs.map((c) => ({
          t: c.timestamp.getTime(),
          o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume,
        }));
      }),
    // Get current price for any pair
    getCurrentPrice: publicProcedure
      .input(z.object({ pair: z.string().optional() }))
      .query(async ({ input }) => {
        const price = await fetchForexPrice(input?.pair || "CAD/JPY");
        return price || { error: "Failed to fetch price" };
      }),

    // Get price history
    getPriceHistory: publicProcedure
      .input(z.object({ pair: z.string().optional() }))
      .query(({ input }) => {
      const history = getPriceHistory(input?.pair || "CAD/JPY");
        return {
          prices: history.slice(-50),
          count: history.length,
        };
      }),

    // Get all available currency pairs
    getAllCurrencyPairs: publicProcedure.query(() => {
      return getAllPairs();
    }),

    // AI Bot: Analyze historical data
    analyzeHistoricalData: publicProcedure
      .input(z.object({ pair: z.string(), signal: z.object({ signal: z.string(), confidence: z.number() }) }))
      .query(async ({ input }) => {
        try {
          const priceHistory = getPriceHistory(input.pair);
          const analysis = await analyzeHistoricalData(input.pair, priceHistory, input.signal);
          return { analysis };
        } catch (error) {
          console.error("Error analyzing historical data:", error);
          return { analysis: "Unable to analyze at this time" };
        }
      }),

    // AI Bot: Record user feedback and learn
    recordSignalFeedback: publicProcedure
      .input(z.object({
        pair: z.string(),
        timeframe: z.string(),
        predictedSignal: z.enum(["UP", "DOWN", "NO_TRADE"]),
        actualOutcome: z.enum(["UP", "DOWN", "NEUTRAL"]),
        confidence: z.number(),
        userFeedback: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          const isCorrect = 
            (input.predictedSignal === "UP" && input.actualOutcome === "UP") ||
            (input.predictedSignal === "DOWN" && input.actualOutcome === "DOWN");

          await recordFeedback({
            signalId: `${input.pair}_${Date.now()}`,
            pair: input.pair,
            timeframe: input.timeframe,
            predictedSignal: input.predictedSignal as "UP" | "DOWN" | "NO_TRADE",
            actualOutcome: input.actualOutcome as "UP" | "DOWN" | "NEUTRAL",
            isCorrect,
            confidence: input.confidence,
            timestamp: new Date(),
            userFeedback: input.userFeedback,
          });

          return { success: true, message: "Feedback recorded and bot is learning!" };
        } catch (error) {
          console.error("Error recording feedback:", error);
          return { success: false, error: "Failed to record feedback" };
        }
      }),

    // AI Bot: Get signal explanation
    explainSignal: publicProcedure
      .input(z.object({
        pair: z.string(),
        signal: z.object({
          signal: z.string(),
          confidence: z.number(),
          trickScores: z.record(z.string(), z.number()).optional(),
        }),
      }))
      .query(async ({ input }) => {
        try {
          const explanation = await explainSignal(input.pair, input.signal);
          return { explanation };
        } catch (error) {
          console.error("Error explaining signal:", error);
          return { explanation: "Unable to explain signal at this time" };
        }
      }),

    // Muse Analyst: live engine state padhkar Hindi me seedha read (on-demand)
    getAnalystRead: publicProcedure
      .input(z.object({ pair: z.string().optional(), timeframe: z.string().optional() }).optional())
      .query(async ({ input }) => {
        try {
          return await getAnalystRead(input?.pair || "CHF/JPY", input?.timeframe || "1m");
        } catch (error) {
          console.error("Error getting analyst read:", error);
          return {
            read: "⚠️ Abhi analyst se connect nahi ho paya — thodi der me phir try karo.",
            generatedAt: new Date().toISOString(),
          };
        }
      }),

    // AI Bot: Get learning state
    getBotState: publicProcedure
      .input(z.object({ pair: z.string() }))
      .query(({ input }) => {
        const state = getBotLearningState(input.pair);
        return {
          totalSignals: state.totalSignals,
          correctSignals: state.correctSignals,
          accuracy: Math.round(state.accuracy * 100) / 100,
          patterns: state.patterns.length,
          lastUpdated: state.lastUpdated,
        };
      }),

    // AI Bot: Get learned patterns
    getBotPatterns: publicProcedure
      .input(z.object({ pair: z.string() }))
      .query(({ input }) => {
        return getLearnedPatterns(input.pair);
      }),

    // AI Bot: Get recent feedback
    getBotFeedback: publicProcedure
      .input(z.object({ pair: z.string(), limit: z.number().optional() }))
      .query(({ input }) => {
        return getRecentFeedback(input.pair, input.limit || 10);
    }),
  }),

  todos: router({
    list: publicProcedure.query(async () => {
      const db = await getDb();
      if (db) {
        try {
          const rows = await db.select().from(todos).orderBy(desc(todos.createdAt));
          return rows.map((row) => ({ ...row, completed: Boolean(row.completed) }));
        } catch (error) {
          console.warn("[Todos] Database unavailable, using in-memory storage:", error);
        }
      }
      return listMemoryTodos();
    }),
    create: publicProcedure
      .input(z.object({ title: z.string().trim().min(1).max(255), description: z.string().trim().max(2000).optional() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (db) {
          try {
            const result = await db.insert(todos).values({ title: input.title, description: input.description || null, completed: 0 });
            const id = Number(result[0].insertId);
            return { id, title: input.title, description: input.description || null, completed: false, createdAt: new Date(), updatedAt: new Date() };
          } catch (error) {
            console.warn("[Todos] Could not write to database, using in-memory storage:", error);
          }
        }
        return createMemoryTodo(input.title, input.description);
      }),
    toggle: publicProcedure
      .input(z.object({ id: z.number().int().positive(), completed: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (db) {
          try {
            await db.update(todos).set({ completed: input.completed ? 1 : 0 }).where(eq(todos.id, input.id));
            return { success: true };
          } catch (error) {
            console.warn("[Todos] Could not update database, using in-memory storage:", error);
          }
        }
        if (!toggleMemoryTodo(input.id, input.completed)) throw new Error("Task not found");
        return { success: true };
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (db) {
          try {
            await db.delete(todos).where(eq(todos.id, input.id));
            return { success: true };
          } catch (error) {
            console.warn("[Todos] Could not delete from database, using in-memory storage:", error);
          }
        }
        if (!deleteMemoryTodo(input.id)) throw new Error("Task not found");
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
