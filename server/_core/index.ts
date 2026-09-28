import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { populateMockCandles } from "../mockDataGenerator";
import { candleService } from "../candleBuilder";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Seed real historical candles from disk (instant warmup, no 1h wait).
 *  Yahoo pairs (CHF/JPY, CAD/JPY, AUD/JPY) skip hote hain — unka fresh
 *  intraday data Yahoo se aata hai, Friday ka stale seed nahi chahiye. */
function seedHistoryFromDisk() {
  const skip = new Set(["CHF/JPY", "CAD/JPY", "AUD/JPY"]); // Yahoo live feed
  const map: Array<[string, string]> = [
    ["CHF/JPY", "chfjpy_1m.json"],
    ["CAD/JPY", "cadjpy_1m.json"],
    ["USD/CHF", "usdchf_1m.json"],
    ["GBP/HKD", "gbphkd_1m.json"],
    ["CAD/MXN", "cadmxn_1m.json"],
    ["AUD/JPY", "audjpy_1m.json"],
    ["EUR/NOK", "eurnok_1m.json"],
    ["USD/HUF", "usdhuf_1m.json"],
  ];
  for (const [pair, file] of map) {
    if (skip.has(pair)) continue; // Yahoo live feed handles these
    const p = join(__dirname, "..", "scripts", file);
    try {
      if (existsSync(p)) {
        const raw = JSON.parse(readFileSync(p, "utf8"));
        if (Array.isArray(raw) && raw.length > 40) candleService.seedFromCandles(pair, raw);
      }
    } catch (e) {
      console.warn(`[seed] ${pair}:`, (e as Error).message);
    }
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Initialize mock data on startup
  await populateMockCandles();

  // Seed real historical candles from disk (instant warmup, no 1h wait)
  seedHistoryFromDisk();

  // Start real-time 1m candle builder (live spot -> candles for the engine)
  candleService.start().catch((e) => console.error("[CandleService] failed to start:", e));

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
