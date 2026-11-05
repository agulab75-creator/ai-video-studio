import React from "react";
import { interpolate } from "remotion";
import type { Brand } from "../brands";
import { easeOut } from "../lib/anim";

// A North Indian kundali (square, both diagonals, inner diamond) on a cream paper card.
// The lines draw on from `at`; `highlight` (1-12, counted anticlockwise from the top-centre
// house as in the North Indian chart) glows gold from `highlightAt`. Drawn, not generated,
// so the chart is correct for an astrologer audience.
export const KundaliChart: React.FC<{
  at?: number;
  draw?: number; // seconds for the lines to draw
  highlight?: number;
  highlightAt?: number;
  brand: Brand;
  localFrame: number;
  fps: number;
  width: number;
}> = ({ at = 0, draw = 0.9, highlight, highlightAt = 1.5, brand, localFrame, fps, width }) => {
  const W = width;
  const pad = W * 0.06;
  const s = W - pad * 2;
  const p = interpolate(localFrame, [at * fps, (at + draw) * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const glow = interpolate(localFrame, [highlightAt * fps, (highlightAt + 0.4) * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const a = pad, b = pad + s, m = pad + s / 2;
  const lines: [number, number, number, number][] = [
    [a, a, b, a], [b, a, b, b], [b, b, a, b], [a, b, a, a], // frame
    [a, a, b, b], [b, a, a, b], // diagonals
    [m, a, b, m], [b, m, m, b], [m, b, a, m], [a, m, m, a], // inner diamond
  ];
  const q = s / 4;
  // House polygons, anticlockwise from the top-centre diamond.
  const houses: Record<number, string> = {
    1: `${m},${a} ${m + q},${a + q} ${m},${m} ${m - q},${a + q}`,
    4: `${a},${m} ${a + q},${m - q} ${m},${m} ${a + q},${m + q}`,
    7: `${m},${b} ${m - q},${b - q} ${m},${m} ${m + q},${b - q}`,
    10: `${b},${m} ${b - q},${m + q} ${m},${m} ${b - q},${m - q}`,
  };
  const ink = brand.colors.ink;
  return (
    <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`} style={{ overflow: "visible" }}>
      <rect x={0} y={0} width={W} height={W} rx={W * 0.02} fill="#F6EFDF" stroke="#E3D6BC" strokeWidth={2} />
      {highlight && houses[highlight] ? (
        <polygon points={houses[highlight]} fill={brand.colors.accent} opacity={0.35 * glow} />
      ) : null}
      {lines.map(([x1, y1, x2, y2], i) => {
        const len = Math.hypot(x2 - x1, y2 - y1);
        const local = Math.min(1, Math.max(0, p * lines.length - i * 0.6));
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={ink}
            strokeWidth={W * 0.008}
            strokeLinecap="round"
            strokeDasharray={len}
            strokeDashoffset={len * (1 - local)}
          />
        );
      })}
    </svg>
  );
};
