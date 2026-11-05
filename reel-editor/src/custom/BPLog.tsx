import { evolvePath } from "@remotion/paths";
import React from "react";
import { interpolate } from "remotion";
import type { Brand } from "../brands";
import { at30, easeOut } from "../lib/anim";

// A printed BP diary page that fills in one day at a time: a handwritten scribble (no real digits,
// so no invented readings) and a tick per row. Shows "roz ki readings note karna" as an action.
export const BPLog: React.FC<{
  rows?: number;
  startAt?: number; // seconds after entrance for the first row
  rowGap?: number; // seconds between rows
  title?: string;
  brand: Brand;
  localFrame: number;
  fps: number;
  width: number;
}> = ({ rows = 6, startAt = 0.3, rowGap = 0.22, title = "BP DIARY", brand, localFrame, fps, width }) => {
  const W = width;
  const rowH = W * 0.11;
  const top = W * 0.2;
  const H = top + rows * rowH + W * 0.06;
  const ink = brand.colors.ink;
  return (
    <div style={{ width: W, height: H, background: brand.colors.paper, borderRadius: 14, position: "relative",
      boxShadow: "0 16px 34px rgba(0,0,0,0.3)", overflow: "hidden" }}>
      {/* margin rule like a ruled notebook */}
      <div style={{ position: "absolute", left: W * 0.26, top: 0, bottom: 0, width: 3, background: "rgba(200,55,45,0.45)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: W * 0.05, textAlign: "center", fontFamily: brand.fonts.mono,
        fontSize: W * 0.085, color: ink, letterSpacing: "0.08em" }}>{title}</div>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: rows }).map((_, i) => {
          const y = top + (i + 1) * rowH;
          const s = Math.round((startAt + i * rowGap) * fps);
          const p = interpolate(localFrame, [s, s + at30(9, fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
          const tp = interpolate(localFrame, [s + at30(7, fps), s + at30(12, fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const x0 = W * 0.31, x1 = W * 0.76, yy = y - rowH * 0.38;
          // a loose handwriting scribble
          let d = `M ${x0} ${yy}`;
          const n = 9;
          for (let k = 1; k <= n; k++) {
            const x = x0 + ((x1 - x0) * k) / n;
            const amp = rowH * (0.16 + 0.08 * Math.sin(i * 3.1 + k * 1.7));
            d += ` Q ${x - (x1 - x0) / n / 2} ${yy - amp * (k % 2 ? 1 : -1)} ${x} ${yy}`;
          }
          const evo = evolvePath(p, d);
          const tick = `M ${W * 0.83} ${yy} L ${W * 0.86} ${yy + rowH * 0.18} L ${W * 0.92} ${yy - rowH * 0.22}`;
          const te = evolvePath(tp, tick);
          return (
            <g key={i}>
              <line x1={0} x2={W} y1={y} y2={y} stroke="rgba(46,139,192,0.35)" strokeWidth={2} />
              <path d={d} fill="none" stroke="#1F4E9C" strokeWidth={W * 0.008} strokeLinecap="round"
                strokeDasharray={evo.strokeDasharray} strokeDashoffset={evo.strokeDashoffset} opacity={p > 0 ? 1 : 0} />
              <path d={tick} fill="none" stroke={brand.colors.green} strokeWidth={W * 0.014} strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={te.strokeDasharray} strokeDashoffset={te.strokeDashoffset} opacity={tp > 0 ? 1 : 0} />
            </g>
          );
        })}
      </svg>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ position: "absolute", left: W * 0.04, top: top + i * rowH + rowH * 0.3, fontFamily: brand.fonts.mono,
          fontSize: W * 0.048, color: ink, opacity: 0.75 }}>DIN {i + 1}</div>
      ))}
    </div>
  );
};
