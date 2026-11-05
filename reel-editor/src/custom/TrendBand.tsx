import React from "react";
import { interpolate } from "remotion";
import type { Brand } from "../brands";
import { at30, easeOut } from "../lib/anim";

// A printed graph: daily readings plotted one by one, drifting down into a green CONTROL band.
// No numbers on the axis: it shows what a record lets you see (the trend), not specific values.
export const TrendBand: React.FC<{
  at?: number; // seconds after entrance when plotting starts
  dur?: number; // seconds to plot all points
  points?: number[]; // 0 = bottom, 1 = top
  bandLow?: number;
  bandHigh?: number;
  yLabel?: string;
  xLabel?: string;
  bandLabel?: string;
  brand: Brand;
  localFrame: number;
  fps: number;
  width: number;
}> = ({
  at = 0.3,
  dur = 1.8,
  points = [0.86, 0.8, 0.83, 0.7, 0.64, 0.55, 0.47, 0.4, 0.36],
  bandLow = 0.18,
  bandHigh = 0.42,
  yLabel = "BP",
  xLabel = "DIN →",
  bandLabel = "CONTROL",
  brand,
  localFrame,
  fps,
  width,
}) => {
  const W = width;
  const H = W * 0.8;
  const L = W * 0.14, R = W * 0.94, T = H * 0.08, B = H * 0.84;
  const X = (i: number) => L + ((R - L) * (i + 0.5)) / points.length;
  const Y = (v: number) => B - (B - T) * v;
  const s = Math.round(at * fps);
  const e = s + Math.round(dur * fps);
  const shown = interpolate(localFrame, [s, e], [0, points.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const full = Math.floor(shown);
  const frac = shown - full;
  let d = "";
  for (let i = 0; i < Math.min(points.length, full + 1); i++) {
    let x = X(i), y = Y(points[i]);
    if (i === full && i > 0) {
      x = X(i - 1) + (X(i) - X(i - 1)) * frac;
      y = Y(points[i - 1]) + (Y(points[i]) - Y(points[i - 1])) * frac;
    }
    d += `${i ? "L" : "M"} ${x} ${y} `;
  }
  const done = localFrame >= e;
  const glow = interpolate(localFrame, [e, e + at30(8, fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const red = "#C8372D";
  return (
    <div style={{ width: W, height: H, background: brand.colors.paper, borderRadius: 16, position: "relative",
      boxShadow: "0 16px 34px rgba(0,0,0,0.3)" }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <rect x={L} y={Y(bandHigh)} width={R - L} height={Y(bandLow) - Y(bandHigh)} fill={brand.colors.green} opacity={0.18 + 0.12 * glow} />
        <line x1={L} x2={R} y1={Y(bandHigh)} y2={Y(bandHigh)} stroke={brand.colors.green} strokeWidth={3} strokeDasharray="10 8" />
        <line x1={L} x2={L} y1={T} y2={B} stroke={brand.colors.ink} strokeWidth={5} />
        <line x1={L} x2={R} y1={B} y2={B} stroke={brand.colors.ink} strokeWidth={5} />
        {d && <path d={d} fill="none" stroke={brand.colors.ink} strokeWidth={W * 0.009} strokeLinejoin="round" strokeLinecap="round" />}
        {points.slice(0, full + (frac > 0.95 ? 1 : 0)).map((v, i) => (
          <circle key={i} cx={X(i)} cy={Y(v)} r={W * 0.018} fill={v > bandHigh ? red : brand.colors.green} stroke={brand.colors.paper} strokeWidth={3} />
        ))}
        {done && (
          <circle cx={X(points.length - 1)} cy={Y(points[points.length - 1])} r={W * (0.03 + 0.03 * glow)} fill="none"
            stroke={brand.colors.green} strokeWidth={5} opacity={1 - 0.4 * glow} />
        )}
      </svg>
      <div style={{ position: "absolute", left: W * 0.02, top: T, fontFamily: brand.fonts.mono, fontSize: W * 0.055, color: brand.colors.ink }}>{yLabel}</div>
      <div style={{ position: "absolute", right: W * 0.06, top: B + H * 0.03, fontFamily: brand.fonts.mono, fontSize: W * 0.05, color: brand.colors.ink, opacity: 0.75 }}>{xLabel}</div>
      <div style={{ position: "absolute", right: W * 0.08, top: Y(bandLow) - W * 0.075, fontFamily: brand.fonts.mono, fontSize: W * 0.05,
        color: brand.colors.green, letterSpacing: "0.08em" }}>{bandLabel}</div>
    </div>
  );
};
