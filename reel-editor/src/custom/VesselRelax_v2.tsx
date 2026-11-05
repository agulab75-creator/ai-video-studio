import React from "react";
import { interpolate } from "remotion";
import type { Brand } from "../brands";
import { easeOut } from "../lib/anim";

// v2 of VesselRelax: a softly curved, shaded blood vessel (cut-away) instead of flat bars.
// Tight: thick contracted walls with packed muscle bands, a narrow dark lumen, cells rushing and a
// faint red pressure glow. At `relaxAt` the walls thin and ease outward, the bands spread, the
// glow fades and the cells slow down. Label pill swaps TIGHT -> RELAXED.
const rnd = (i: number) => {
  const x = Math.sin(i * 91.17 + 12.3) * 43758.5453;
  return x - Math.floor(x);
};

export const VesselRelax_v2: React.FC<{
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
  const H = W * 0.74;
  const cy = H * 0.43;
  const s = Math.round(relaxAt * fps);
  const e = s + Math.round(relaxDur * fps);
  const pAt = (f: number) => interpolate(f, [s, e], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const p = pAt(localFrame);
  const gap = H * (0.085 + 0.1 * p); // half lumen height
  const wall = H * (0.1 - 0.035 * p);
  // gentle S-curve centreline with a slow breathing drift
  const drift = Math.sin(localFrame / (fps * 1.6)) * H * 0.008;
  const C = (x: number) => cy + Math.sin((x / W) * Math.PI * 1.3 + 0.4) * H * 0.045 + drift;
  const N = 48;
  const xs = Array.from({ length: N + 1 }).map((_, i) => -W * 0.05 + (W * 1.1 * i) / N);
  const line = (off: number) => xs.map((x, i) => `${i ? "L" : "M"} ${x.toFixed(1)} ${(C(x) + off).toFixed(1)}`).join(" ");
  const band = (a: number, b: number) =>
    `${line(a)} ${[...xs].reverse().map((x) => `L ${x.toFixed(1)} ${(C(x) + b).toFixed(1)}`).join(" ")} Z`;

  // cells: integrate speed so the slow-down is smooth
  const fast = W * 0.024, slow = W * 0.009;
  let dist = 0;
  for (let f = 0; f < localFrame; f++) dist += fast + (slow - fast) * pAt(f);
  const span = W * 1.3;
  const cells = Array.from({ length: 16 }).map((_, i) => {
    const x = (((i * span) / 16 + rnd(i) * W * 0.05 + dist * (0.85 + 0.3 * rnd(i + 7))) % span) - W * 0.15;
    const lane = (rnd(i + 3) - 0.5) * 1.5;
    const depth = 0.75 + 0.35 * rnd(i + 11); // smaller = further back
    return { x, y: C(x) + lane * gap * 0.75, d: depth, rot: (rnd(i + 5) - 0.5) * 50 + Math.sin((localFrame + i * 9) / 8) * 8 };
  }).sort((a, b) => a.d - b.d);

  const press = 1 - p;
  const pulse = 0.55 + 0.45 * Math.sin((localFrame / fps) * Math.PI * 2 * 1.4);
  const bands = 14;
  const tightC = "#C8372D";
  const okC = brand.colors.green;
  const id = "vr2";
  return (
    <div style={{ width: W, height: H, borderRadius: 26, position: "relative", overflow: "hidden",
      background: "radial-gradient(120% 90% at 50% 40%, #FFF9F4 0%, #F7E9DF 70%, #EFDCCF 100%)",
      boxShadow: "0 18px 40px rgba(60,20,10,0.22)" }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id={`${id}-lumen`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6E1218" />
            <stop offset="0.5" stopColor="#B4323A" />
            <stop offset="1" stopColor="#5C0E14" />
          </linearGradient>
          <linearGradient id={`${id}-wallT`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F4B7A8" />
            <stop offset="0.55" stopColor="#E38A7C" />
            <stop offset="1" stopColor="#B9534B" />
          </linearGradient>
          <linearGradient id={`${id}-wallB`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#B9534B" />
            <stop offset="0.45" stopColor="#E38A7C" />
            <stop offset="1" stopColor="#F0AE9F" />
          </linearGradient>
          <radialGradient id={`${id}-cell`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#A3201F" />
            <stop offset="0.45" stopColor="#C8302A" />
            <stop offset="0.8" stopColor="#E8564A" />
            <stop offset="1" stopColor="#C23A30" />
          </radialGradient>
          <filter id={`${id}-glow`} x="-10%" y="-50%" width="120%" height="200%">
            <feGaussianBlur stdDeviation={W * 0.018} />
          </filter>
          <filter id={`${id}-soft`}><feGaussianBlur stdDeviation={1.2} /></filter>
          <clipPath id={`${id}-clip`}><path d={band(-gap, gap)} /></clipPath>
        </defs>

        {/* pressure glow around the vessel while it is tight */}
        <path d={band(-gap - wall, gap + wall)} fill={tightC} opacity={0.32 * press * pulse} filter={`url(#${id}-glow)`} />
        {/* soft drop shadow under the vessel */}
        <path d={band(gap + wall * 0.6, gap + wall * 1.25)} fill="rgba(80,20,10,0.18)" filter={`url(#${id}-glow)`} />

        {/* lumen + cells */}
        <path d={band(-gap, gap)} fill={`url(#${id}-lumen)`} />
        <g clipPath={`url(#${id}-clip)`}>
          {cells.map((c, i) => {
            const rx = W * 0.034 * c.d, ry = W * 0.022 * c.d;
            return (
              <g key={i} transform={`translate(${c.x} ${c.y}) rotate(${c.rot})`} opacity={0.65 + 0.35 * c.d}>
                <ellipse rx={rx} ry={ry} fill={`url(#${id}-cell)`} />
                <ellipse rx={rx * 0.45} ry={ry * 0.35} cx={-rx * 0.15} cy={-ry * 0.35} fill="#FFFFFF" opacity={0.18} filter={`url(#${id}-soft)`} />
              </g>
            );
          })}
          {/* inner sheen along the lumen */}
          <path d={band(-gap * 0.55, -gap * 0.35)} fill="#FFFFFF" opacity={0.07} />
        </g>

        {/* walls */}
        <path d={band(-gap - wall, -gap)} fill={`url(#${id}-wallT)`} />
        <path d={band(gap, gap + wall)} fill={`url(#${id}-wallB)`} />
        {/* smooth-muscle bands: packed when tight, spread when relaxed */}
        {Array.from({ length: bands }).map((_, i) => {
          const x = W * (0.03 + (0.94 * i) / (bands - 1));
          const sp = wall * (0.55 + 0.25 * p);
          const yT = C(x) - gap - wall / 2, yB = C(x) + gap + wall / 2;
          return (
            <g key={i} stroke="#9E3F38" strokeWidth={W * 0.004} strokeLinecap="round" opacity={0.28 + 0.22 * press} fill="none">
              <path d={`M ${x - sp * 0.35} ${yT - sp * 0.3} Q ${x} ${yT} ${x + sp * 0.35} ${yT + sp * 0.3}`} />
              <path d={`M ${x - sp * 0.35} ${yB + sp * 0.3} Q ${x} ${yB} ${x + sp * 0.35} ${yB - sp * 0.3}`} />
            </g>
          );
        })}
        {/* specular edge highlights */}
        <path d={line(-gap - wall + W * 0.006)} stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={W * 0.005} fill="none" />
        <path d={line(-gap)} stroke="#7A1C1C" strokeOpacity={0.5} strokeWidth={W * 0.003} fill="none" />
        <path d={line(gap)} stroke="#7A1C1C" strokeOpacity={0.5} strokeWidth={W * 0.003} fill="none" />
      </svg>

      {/* label pill */}
      {[0, 1].map((k) => {
        const o = k === 0 ? interpolate(p, [0.3, 0.55], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
          : interpolate(p, [0.45, 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const c = k === 0 ? tightC : okC;
        return (
          <div key={k} style={{ position: "absolute", left: "50%", bottom: H * 0.07, transform: `translateX(-50%) scale(${0.92 + 0.08 * o})`,
            opacity: o, padding: `${W * 0.012}px ${W * 0.04}px`, borderRadius: 999, background: c, color: "#fff",
            fontFamily: brand.fonts.mono, fontSize: W * 0.05, letterSpacing: "0.12em", boxShadow: "0 6px 14px rgba(0,0,0,0.18)" }}>
            {k === 0 ? tightLabel : relaxedLabel}
          </div>
        );
      })}
    </div>
  );
};
