import React from "react";
import { interpolate } from "remotion";
import type { Brand } from "../brands";
import { easeOut } from "../lib/anim";

// A cut-away blood vessel. Starts tight (narrow lumen, cells rushing, pressure arrows pushing on
// the walls); at `relaxAt` the walls ease outward, cells slow down and the pressure arrows fade.
// Visualises "regular walking blood vessels ko relax karti hai".
export const VesselRelax: React.FC<{
  relaxAt?: number;
  relaxDur?: number;
  tightLabel?: string;
  relaxedLabel?: string;
  brand: Brand;
  localFrame: number;
  fps: number;
  width: number;
}> = ({ relaxAt = 1.5, relaxDur = 1.4, tightLabel = "TIGHT", relaxedLabel = "RELAXED", brand, localFrame, fps, width }) => {
  const W = width;
  const H = W * 0.72;
  const cy = H * 0.42;
  const s = Math.round(relaxAt * fps);
  const p = interpolate(localFrame, [s, s + Math.round(relaxDur * fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const gap = H * (0.14 + 0.14 * p); // half lumen height
  const wall = H * 0.09;
  const wallC = "#D9776B";
  const red = "#C8372D";
  // cells move with speed that drops as the vessel relaxes; integrate speed so motion stays smooth
  const fast = W * 0.028, slow = W * 0.011;
  let dist = 0;
  for (let f = 0; f < localFrame; f++) {
    const pf = interpolate(f, [s, s + Math.round(relaxDur * fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
    dist += fast + (slow - fast) * pf;
  }
  const n = 11;
  const span = W * 1.2;
  const cells = Array.from({ length: n }).map((_, i) => {
    const x = ((i * span) / n + dist) % span - W * 0.1;
    const lane = Math.sin(i * 2.7) * 0.7;
    return { x, y: cy + lane * gap * 0.6, r: (i * 37) % 11 };
  });
  const press = 1 - p;
  const label = p < 0.5 ? tightLabel : relaxedLabel;
  return (
    <div style={{ width: W, height: H, background: brand.colors.paper, borderRadius: 16, position: "relative", overflow: "hidden",
      boxShadow: "0 16px 34px rgba(0,0,0,0.3)" }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <rect x={0} y={cy - gap} width={W} height={gap * 2} fill="#F6D9D2" />
        {cells.map((c, i) => (
          <ellipse key={i} cx={c.x} cy={c.y} rx={W * 0.032} ry={W * 0.02} fill={red} transform={`rotate(${c.r - 5} ${c.x} ${c.y})`} />
        ))}
        <rect x={0} y={cy - gap - wall} width={W} height={wall} fill={wallC} stroke="#9E3B30" strokeWidth={3} />
        <rect x={0} y={cy + gap} width={W} height={wall} fill={wallC} stroke="#9E3B30" strokeWidth={3} />
        {[0.2, 0.5, 0.8].map((fx, i) => (
          <g key={i} opacity={press} stroke={brand.colors.ink} strokeWidth={6} strokeLinecap="round" fill="none">
            <line x1={W * fx} x2={W * fx} y1={cy - gap - wall - H * 0.02} y2={cy - gap - wall - H * 0.1} />
            <path d={`M ${W * fx - 12} ${cy - gap - wall - H * 0.075} L ${W * fx} ${cy - gap - wall - H * 0.105} L ${W * fx + 12} ${cy - gap - wall - H * 0.075}`} />
            <line x1={W * fx} x2={W * fx} y1={cy + gap + wall + H * 0.02} y2={cy + gap + wall + H * 0.1} />
            <path d={`M ${W * fx - 12} ${cy + gap + wall + H * 0.075} L ${W * fx} ${cy + gap + wall + H * 0.105} L ${W * fx + 12} ${cy + gap + wall + H * 0.075}`} />
          </g>
        ))}
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: H * 0.04, textAlign: "center", fontFamily: brand.fonts.mono,
        fontSize: W * 0.06, letterSpacing: "0.1em", color: p < 0.5 ? red : brand.colors.green }}>{label}</div>
    </div>
  );
};
