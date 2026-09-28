import { useEffect, useRef } from "react";

export interface ChartCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface CandleChartProps {
  candles: ChartCandle[];
  signal: string;
  confidence: number;
  support: number | null;
  resistance: number | null;
}

const UP = "#22c55e";
const DOWN = "#ef4444";

/**
 * Dependency-free canvas candlestick chart.
 * Draws candles, volume bars, dashed S/R lines, and a signal marker
 * on the last candle. Handles empty data gracefully.
 */
export default function CandleChart({
  candles,
  signal,
  confidence,
  support,
  resistance,
}: CandleChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = Math.max(wrap.clientWidth, 50);
      const H = Math.max(wrap.clientHeight, 50);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, H);

      if (!candles || candles.length === 0) {
        ctx.fillStyle = "#6b7280";
        ctx.font = "700 14px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("WAITING FOR CANDLES…", W / 2, H / 2);
        return;
      }

      const VOL_H = Math.round(H * 0.16);
      const PAD_TOP = 26;
      const PAD_BOT = 6;
      const priceH = H - VOL_H - PAD_TOP - PAD_BOT;

      let lo = Infinity;
      let hi = -Infinity;
      let maxV = 0;
      for (const c of candles) {
        if (c.l < lo) lo = c.l;
        if (c.h > hi) hi = c.h;
        if (c.v > maxV) maxV = c.v;
      }
      if (support != null) {
        lo = Math.min(lo, support);
        hi = Math.max(hi, support);
      }
      if (resistance != null) {
        lo = Math.min(lo, resistance);
        hi = Math.max(hi, resistance);
      }
      const pad = (hi - lo) * 0.1 || 1;
      lo -= pad;
      hi += pad;
      const yOf = (p: number) => PAD_TOP + ((hi - p) / (hi - lo)) * priceH;

      // horizontal gridlines
      ctx.strokeStyle = "#1f2937";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const gy = Math.round(PAD_TOP + (priceH * i) / 4) + 0.5;
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
      }
      ctx.stroke();

      const n = candles.length;
      const slot = W / n;
      const bodyW = Math.max(2, Math.min(14, Math.floor(slot * 0.65)));

      for (let i = 0; i < n; i++) {
        const c = candles[i];
        const x = i * slot + slot / 2;
        const col = c.c >= c.o ? UP : DOWN;

        // wick
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, yOf(c.h));
        ctx.lineTo(x, yOf(c.l));
        ctx.stroke();

        // body
        const yO = yOf(c.o);
        const yC = yOf(c.c);
        ctx.fillStyle = col;
        ctx.fillRect(
          x - bodyW / 2,
          Math.min(yO, yC),
          bodyW,
          Math.max(1.5, Math.abs(yC - yO))
        );

        // volume bar at bottom
        const vh = maxV > 0 ? (c.v / maxV) * (VOL_H - 6) : 0;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x - bodyW / 2, H - PAD_BOT - vh, bodyW, Math.max(0, vh));
        ctx.globalAlpha = 1;
      }

      // dashed support / resistance lines
      const hline = (price: number, color: string, tag: string) => {
        const ly = yOf(price);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(W, ly);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = color;
        ctx.font = "700 11px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(`${tag} ${price.toFixed(2)}`, 6, Math.max(ly - 3, 12));
      };
      if (resistance != null) hline(resistance, "#22d3ee", "R");
      if (support != null) hline(support, "#eab308", "S");

      // signal marker on the last candle
      const last = candles[n - 1];
      const lx = (n - 1) * slot + slot / 2;
      const isUp = signal === "UP";
      const isDown = signal === "DOWN";
      const mColor = isUp ? UP : isDown ? DOWN : "#9ca3af";
      const text = isUp
        ? `▲ UP ${Math.round(confidence)}%`
        : isDown
          ? `▼ DOWN ${Math.round(confidence)}%`
          : "NO TRADE";

      // triangle pointer
      ctx.fillStyle = mColor;
      ctx.beginPath();
      if (isDown) {
        const py = yOf(last.h);
        ctx.moveTo(lx, py - 4);
        ctx.lineTo(lx - 6, py - 14);
        ctx.lineTo(lx + 6, py - 14);
      } else if (isUp) {
        const py = yOf(last.l);
        ctx.moveTo(lx, py + 4);
        ctx.lineTo(lx - 6, py + 14);
        ctx.lineTo(lx + 6, py + 14);
      }
      ctx.fill();

      // badge
      ctx.font = "800 12px system-ui, sans-serif";
      const tw = ctx.measureText(text).width + 18;
      const mx = Math.min(Math.max(lx - tw / 2, 4), W - tw - 4);
      let my = isDown ? yOf(last.h) - 42 : yOf(last.l) + 16;
      my = Math.max(PAD_TOP - 4, Math.min(my, H - 26));
      ctx.fillStyle = mColor;
      ctx.fillRect(mx, my, tw, 20);
      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, mx + tw / 2, my + 10.5);
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [candles, signal, confidence, support, resistance]);

  return (
    <div ref={wrapRef} className="w-full h-80 border-2 border-gray-800 bg-black">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
