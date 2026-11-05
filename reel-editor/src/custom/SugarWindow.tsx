import { evolvePath } from "@remotion/paths";
import React from "react";
import { interpolate } from "remotion";
import type { Brand } from "../brands";
import { easeOut } from "../lib/anim";

// HbA1c as a look-back window: ~90 days of a wobbly sugar line draw across three months, then a
// bracket spans all of it ("pichhle 2-3 mahine") and a green "control" band fades in behind the
// line, so the test reads as one picture of the whole period, not a single day's reading.
export const SugarWindow: React.FC<{
  drawAt?: number; // seconds after entrance
  bracketAt?: number;
  bandAt?: number;
  months?: string[];
  tag?: string;
  bandLabel?: string;
  brand: Brand;
  localFrame: number;
  fps: number;
  width: number;
}> = ({ drawAt = 0.2, bracketAt = 1.6, bandAt = 3.0, months = ["MAHINA 1", "MAHINA 2", "MAHINA 3"], tag = "HbA1c",
  bandLabel = "control", brand, localFrame, fps, width }) => {
  const W = width;
  const H = W * 0.62;
  const padX = W * 0.07;
  const top = H * 0.3;
  const bottom = H * 0.78;
  const t = localFrame / fps;
  const p = (a: number, d: number) =>
    interpolate(t, [a, a + d], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });

  // deterministic wobble: a few sines, no randomness
  const N = 90;
  const pts = Array.from({ length: N }, (_, i) => {
    const x = padX + (i / (N - 1)) * (W - 2 * padX);
    const v = 0.5 + 0.22 * Math.sin(i * 0.55) + 0.12 * Math.sin(i * 1.7 + 1) + 0.08 * Math.sin(i * 0.13 + 2);
    return [x, top + (bottom - top) * (1 - v)] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const evo = evolvePath(p(drawAt, 1.3), line);
  const bp = p(bracketAt, 0.6);
  const band = p(bandAt, 0.5);
  const bandTop = top + (bottom - top) * 0.12;
  const bandBot = top + (bottom - top) * 0.88;
  const bx0 = padX;
  const bx1 = padX + (W - 2 * padX) * bp;
  const by = H * 0.17;

  return (
    <div style={{ width: W, height: H, background: brand.colors.paper, borderRadius: 18, position: "relative",
      boxShadow: "0 16px 34px rgba(0,0,0,0.3)", overflow: "hidden" }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <rect x={padX} y={bandTop} width={W - 2 * padX} height={bandBot - bandTop} fill={brand.colors.green} opacity={0.16 * band} />
        {[1, 2].map((m) => {
          const x = padX + (m / 3) * (W - 2 * padX);
          return <line key={m} x1={x} x2={x} y1={top - 10} y2={bottom + 10} stroke={brand.colors.ink} strokeWidth={3} strokeDasharray="10 10" opacity={0.25} />;
        })}
        <line x1={padX} x2={W - padX} y1={bottom + 18} y2={bottom + 18} stroke={brand.colors.ink} strokeWidth={4} opacity={0.5} />
        <path d={line} fill="none" stroke={brand.colors.navy} strokeWidth={W * 0.012} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={evo.strokeDasharray} strokeDashoffset={evo.strokeDashoffset} />
        {bp > 0 && (
          <path d={`M ${bx0} ${by + 22} L ${bx0} ${by} L ${bx1} ${by} L ${bx1} ${by + 22}`} fill="none" stroke={brand.colors.accent}
            strokeWidth={W * 0.012} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      {months.map((m, i) => (
        <div key={m} style={{ position: "absolute", top: bottom + 30, left: padX + (i / 3) * (W - 2 * padX), width: (W - 2 * padX) / 3,
          textAlign: "center", fontFamily: brand.fonts.mono, fontSize: W * 0.04, color: brand.colors.ink, opacity: 0.75 }}>{m}</div>
      ))}
      <div style={{ position: "absolute", top: by - W * 0.075, left: 0, right: 0, textAlign: "center", opacity: bp,
        transform: `translateY(${(1 - bp) * 20}px)` }}>
        <span style={{ background: brand.colors.ink, color: brand.colors.paper, fontFamily: brand.fonts.mono, fontSize: W * 0.055,
          padding: `${W * 0.008}px ${W * 0.03}px`, letterSpacing: "0.05em" }}>{tag}</span>
      </div>
      <div style={{ position: "absolute", right: padX * 0.6, top: by - W * 0.02, fontFamily: brand.fonts.hand, fontSize: W * 0.065,
        color: brand.colors.white, background: brand.colors.green, padding: `0 ${W * 0.02}px`, borderRadius: 8, opacity: band,
        fontWeight: 700, transform: "rotate(-3deg)" }}>{bandLabel}</div>
    </div>
  );
};
