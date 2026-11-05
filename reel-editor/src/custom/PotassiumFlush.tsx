import React from "react";
import { interpolate } from "remotion";
import type { Brand } from "../brands";
import { at30, easeIn, easeOut } from "../lib/anim";

// A paper body silhouette full of sodium (Na) dots. Potassium (K) dots arrive from the left at
// `kAt`, then at `flushAt` most of the Na dots are carried out through the right side.
// Visualises "potassium body se extra sodium nikaalne mein help karta hai".
const rnd = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export const PotassiumFlush: React.FC<{
  kAt?: number;
  flushAt?: number;
  naCount?: number;
  keep?: number; // Na dots that stay (normal amount)
  brand: Brand;
  localFrame: number;
  fps: number;
  width: number;
}> = ({ kAt = 0.4, flushAt = 2.6, naCount = 14, keep = 4, brand, localFrame, fps, width }) => {
  const W = width;
  const H = W * 1.0;
  const red = "#C8372D";
  const green = brand.colors.green;
  // body: head + torso (rounded) centred
  const cx = W * 0.47;
  const headR = W * 0.1;
  const headY = H * 0.14;
  const tx = W * 0.22, ty = H * 0.27, tw = W * 0.5, th = H * 0.62;
  const kF = Math.round(kAt * fps);
  const fF = Math.round(flushAt * fps);
  const dot = W * 0.072;
  const na = Array.from({ length: naCount }).map((_, i) => {
    const x = tx + tw * (0.2 + 0.3 * (i % 3) + 0.08 * (rnd(i + 1) - 0.5));
    const y = ty + th * (0.1 + 0.16 * Math.floor(i / 3) + 0.05 * (rnd(i + 50) - 0.5));
    const leaves = i >= keep;
    const delay = at30(Math.round(rnd(i + 90) * 14), fps);
    const p = leaves
      ? interpolate(localFrame, [fF + delay, fF + delay + at30(22, fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeIn })
      : 0;
    const wob = Math.sin((localFrame + i * 7) / 9) * W * 0.006;
    return { x: x + p * (W * 1.05 - x), y: y + wob + p * (H * 0.55 - y) * 0.4, o: 1 - Math.max(0, (p - 0.75) * 4) };
  });
  const k = Array.from({ length: 5 }).map((_, i) => {
    const tx2 = tx + tw * (0.35 + 0.3 * (i % 2));
    const ty2 = ty + th * (0.18 + 0.16 * i);
    const d = at30(i * 3, fps);
    const p = interpolate(localFrame, [kF + d, kF + d + at30(14, fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
    return { x: -dot + p * (tx2 + dot), y: ty2, o: p > 0 ? 1 : 0 };
  });
  const arrowP = interpolate(localFrame, [fF - at30(6, fps), fF + at30(4, fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const Dot: React.FC<{ x: number; y: number; o: number; c: string; t: string }> = ({ x, y, o, c, t }) => (
    <div style={{ position: "absolute", left: x - dot / 2, top: y - dot / 2, width: dot, height: dot, borderRadius: "50%", background: c,
      opacity: o, color: "#fff", fontFamily: brand.fonts.sans, fontWeight: 800, fontSize: dot * 0.42, display: "flex",
      alignItems: "center", justifyContent: "center", boxShadow: "0 3px 6px rgba(0,0,0,0.25)" }}>{t}</div>
  );
  return (
    <div style={{ width: W, height: H, position: "relative" }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <circle cx={cx} cy={headY} r={headR} fill={brand.colors.paperWarm} stroke={brand.colors.ink} strokeWidth={5} />
        <rect x={tx} y={ty} width={tw} height={th} rx={W * 0.12} fill={brand.colors.paperWarm} stroke={brand.colors.ink} strokeWidth={5} />
        <g opacity={arrowP}>
          <line x1={tx + tw + W * 0.03} x2={tx + tw + W * 0.2} y1={ty + th * 0.55} y2={ty + th * 0.55} stroke={red} strokeWidth={9} strokeLinecap="round" />
          <path d={`M ${tx + tw + W * 0.16} ${ty + th * 0.5} L ${tx + tw + W * 0.21} ${ty + th * 0.55} L ${tx + tw + W * 0.16} ${ty + th * 0.6}`}
            fill="none" stroke={red} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
      {na.map((d, i) => <Dot key={`n${i}`} {...d} c={red} t="Na" />)}
      {k.map((d, i) => <Dot key={`k${i}`} {...d} c={green} t="K" />)}
    </div>
  );
};
