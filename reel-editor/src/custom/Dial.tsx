import React from "react";
import { interpolate } from "remotion";
import type { Brand } from "../brands";
import { at30, easeOut } from "../lib/anim";

// A printed analog gauge (hunger, sugar, BP, weight). The needle sweeps from `from` to `to`
// (0 = left end, 1 = right end) starting `at` seconds after the element enters. Shows a change
// happening instead of a static icon.
export const Dial: React.FC<{
  label: string;
  from: number;
  to: number;
  at?: number;
  sweep?: number; // seconds
  lowLabel?: string;
  highLabel?: string;
  goodSide?: "low" | "high";
  brand: Brand;
  localFrame: number;
  fps: number;
  width: number;
}> = ({ label, from, to, at = 0.6, sweep = 0.9, lowLabel = "LOW", highLabel = "HIGH", goodSide = "low", brand, localFrame, fps, width }) => {
  const W = width;
  const H = W * 0.72;
  const cx = W / 2;
  const cy = H * 0.74;
  const R = W * 0.38;
  const start = Math.round(at * fps);
  const p = interpolate(localFrame, [start, start + at30(Math.round(sweep * 30), fps)], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  // tiny settle wobble after the sweep, like a real needle (no overshoot past the target)
  const settle = localFrame > start ? Math.sin((localFrame - start) / 3) * 0.004 * Math.max(0, 1 - (localFrame - start) / (fps * 1.6)) : 0;
  const angle = Math.PI * (1 - (p + settle)); // radians from +x axis
  const arc = (a0: number, a1: number) => {
    const t0 = Math.PI * (1 - a0), t1 = Math.PI * (1 - a1);
    return `M ${cx + R * Math.cos(t0)} ${cy - R * Math.sin(t0)} A ${R} ${R} 0 0 1 ${cx + R * Math.cos(t1)} ${cy - R * Math.sin(t1)}`;
  };
  const good = brand.colors.green, mid = "#E9A23B", bad = "#C8372D";
  const zones = goodSide === "low" ? [good, mid, bad] : [bad, mid, good];
  return (
    <div style={{ width: W, height: H, background: brand.colors.paper, borderRadius: 18, position: "relative",
      boxShadow: "0 16px 34px rgba(0,0,0,0.3)" }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {zones.map((c, i) => (
          <path key={i} d={arc(i / 3 + 0.005, (i + 1) / 3 - 0.005)} stroke={c} strokeWidth={W * 0.06} fill="none" />
        ))}
        {Array.from({ length: 11 }).map((_, i) => {
          const t = Math.PI * (1 - i / 10);
          const r0 = R - W * 0.06, r1 = R - W * (i % 5 === 0 ? 0.11 : 0.085);
          return <line key={i} x1={cx + r0 * Math.cos(t)} y1={cy - r0 * Math.sin(t)} x2={cx + r1 * Math.cos(t)} y2={cy - r1 * Math.sin(t)}
            stroke={brand.colors.ink} strokeWidth={4} opacity={0.6} />;
        })}
        <line x1={cx} y1={cy} x2={cx + (R - W * 0.05) * Math.cos(angle)} y2={cy - (R - W * 0.05) * Math.sin(angle)}
          stroke={brand.colors.ink} strokeWidth={W * 0.022} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={W * 0.035} fill={brand.colors.ink} />
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: H * 0.8, textAlign: "center", fontFamily: brand.fonts.mono,
        fontSize: W * 0.085, color: brand.colors.ink, letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ position: "absolute", left: W * 0.06, top: cy + 6, fontFamily: brand.fonts.mono, fontSize: W * 0.045, color: brand.colors.ink, opacity: 0.7 }}>{lowLabel}</div>
      <div style={{ position: "absolute", right: W * 0.06, top: cy + 6, fontFamily: brand.fonts.mono, fontSize: W * 0.045, color: brand.colors.ink, opacity: 0.7 }}>{highLabel}</div>
    </div>
  );
};
