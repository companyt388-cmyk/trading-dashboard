import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Candle data for all currency pairs
export const candles = mysqlTable("candles", {
  id: int("id").autoincrement().primaryKey(),
  pair: varchar("pair", { length: 20 }).notNull(), // CHF/JPY, CAD/JPY, etc.
  timeframe: varchar("timeframe", { length: 10 }).notNull(), // 1m, 5m
  timestamp: timestamp("timestamp").notNull(),
  open: decimal("open", { precision: 20, scale: 8 }).notNull(),
  high: decimal("high", { precision: 20, scale: 8 }).notNull(),
  low: decimal("low", { precision: 20, scale: 8 }).notNull(),
  close: decimal("close", { precision: 20, scale: 8 }).notNull(),
  volume: decimal("volume", { precision: 20, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Candle = typeof candles.$inferSelect;
export type InsertCandle = typeof candles.$inferInsert;

// Predictions and analysis results
export const predictions = mysqlTable("predictions", {
  id: int("id").autoincrement().primaryKey(),
  pair: varchar("pair", { length: 20 }).notNull(),
  timeframe: varchar("timeframe", { length: 10 }).notNull(),
  candleTimestamp: timestamp("candleTimestamp").notNull(),
  signal: mysqlEnum("signal", ["UP", "DOWN", "NO_TRADE"]).notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull(), // 0-100
  score: decimal("score", { precision: 5, scale: 2 }).notNull(), // 0-100
  trickScores: json("trickScores").notNull(), // JSON object with all 11 trick scores
  multiTimeframeConfirm: int("multiTimeframeConfirm").default(0), // 0 or 1
  emaMatch: int("emaMatch").default(0), // 0 or 1
  volumeConfirm: int("volumeConfirm").default(0), // 0 or 1
  liquidityTrapDetect: int("liquidityTrapDetect").default(0), // 0 or 1
  entrySignal: int("entrySignal").default(0), // 0 or 1 - only if all conditions met
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Prediction = typeof predictions.$inferSelect;
export type InsertPrediction = typeof predictions.$inferInsert;

// Accuracy tracking
export const accuracyTracking = mysqlTable("accuracyTracking", {
  id: int("id").autoincrement().primaryKey(),
  pair: varchar("pair", { length: 20 }).notNull(),
  timeframe: varchar("timeframe", { length: 10 }).notNull(),
  predictionId: int("predictionId").notNull(),
  predictedSignal: mysqlEnum("predictedSignal", ["UP", "DOWN", "NO_TRADE"]).notNull(),
  actualSignal: mysqlEnum("actualSignal", ["UP", "DOWN", "NEUTRAL"]),
  isCorrect: int("isCorrect"), // 0, 1, or null if not yet determined
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});

export type AccuracyTracking = typeof accuracyTracking.$inferSelect;
export type InsertAccuracyTracking = typeof accuracyTracking.$inferInsert;

// Support and Resistance levels
export const supportResistance = mysqlTable("supportResistance", {
  id: int("id").autoincrement().primaryKey(),
  pair: varchar("pair", { length: 20 }).notNull(),
  timeframe: varchar("timeframe", { length: 10 }).notNull(),
  level: decimal("level", { precision: 20, scale: 8 }).notNull(),
  type: mysqlEnum("type", ["SUPPORT", "RESISTANCE"]).notNull(),
  strength: decimal("strength", { precision: 5, scale: 2 }).notNull(), // 0-100
  touches: int("touches").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupportResistance = typeof supportResistance.$inferSelect;
export type InsertSupportResistance = typeof supportResistance.$inferInsert;

// Pattern detection history
export const patternHistory = mysqlTable("patternHistory", {
  id: int("id").autoincrement().primaryKey(),
  pair: varchar("pair", { length: 20 }).notNull(),
  timeframe: varchar("timeframe", { length: 10 }).notNull(),
  patternType: varchar("patternType", { length: 50 }).notNull(), // e.g., "wick_crossing", "sandwich", etc.
  candleTimestamp: timestamp("candleTimestamp").notNull(),
  strength: decimal("strength", { precision: 5, scale: 2 }).notNull(), // 0-100
  details: json("details"), // Additional pattern details
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PatternHistory = typeof patternHistory.$inferSelect;
export type InsertPatternHistory = typeof patternHistory.$inferInsert;

// Public trading task list. The server uses an in-memory fallback when no DB is configured.
export const todos = mysqlTable("todos", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  completed: int("completed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Todo = typeof todos.$inferSelect;
export type InsertTodo = typeof todos.$inferInsert;
