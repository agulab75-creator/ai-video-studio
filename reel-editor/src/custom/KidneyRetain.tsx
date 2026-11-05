import React from "react";
import { Img, interpolate, random, staticFile } from "remotion";
import type { Brand } from "../brands";
import { easeOut } from "../lib/anim";

// Kidneys with sodium (Na+) and water drops streaming in from the top. Before `blockAt` they pass through and
// drain out the bottom; at `blockAt` (seconds after entrance) a red bar closes the exit and everything that
// arrives afterwards piles up around the kidneys: "kidneys mein sodium aur paani rok sakte hain".
export const KidneyRetain: React.FC<{
  src: string;
  blockAt?: number;
  brand: Brand;
  localFrame: number;
  fps: number;
  width: number;
}> = ({ src, blockAt = 1.5, brand, localFrame, fps, width }) => {
  const W = width;
  const H = W * 1.15;
  const kx = W / 2;
  const ky = H * 0.48;
  const t = localFrame / fps;
  const every = 0.1; // seconds between particles
  const travel = 0.9; // seconds from the top to the kidneys
  const count = Math.min(90, Math.max(0, Math.floor(t / every)));
  const bar = interpolate(localFrame, [Math.round(blockAt * fps), Math.round((blockAt + 0.2) * fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const s = W * 0.06;
  let held = 0;
  const parts: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const born = i * every;
    const age = t - born;
    const isNa = i % 2 === 0;
    const x0 = kx + (random(`l${i}`) - 0.5) * W * 0.5;
    const y0 = -s;
    let x: number;
    let y: number;
    let op = 1;
    if (born + travel >= blockAt) {
      // held: settles into a growing ring around the kidneys
      const slot = held++;
      const ang = random(`a${i}`) * Math.PI * 2;
      const rad = W * (0.33 + 0.045 * Math.floor(slot / 16) + random(`r${i}`) * 0.04);
      const hx = kx + Math.cos(ang) * rad;
      const hy = ky + Math.sin(ang) * rad * 0.85;
      const e = easeOut(Math.min(1, age / travel));
      x = x0 + (hx - x0) * e;
      y = y0 + (hy - y0) * e;
    } else {
      // passes through: top -> kidneys -> out the bottom
      const p = age / (travel * 2);
      if (p > 1) continue;
      x = x0 + (kx - x0) * Math.min(1, p * 2);
      y = y0 + (H + s - y0) * p;
      op = p > 0.8 ? (1 - p) / 0.2 : 1;
    }
    parts.push(
      isNa ? (
        <div
          key={i}
          style={{
            position: "absolute",
            left: x - s / 2,
            top: y - s / 2,
            width: s,
            height: s,
            borderRadius: "50%",
            background: "#FFFFFF",
            border: `4px solid ${brand.colors.ink}`,
            boxSizing: "border-box",
            opacity: op,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: brand.fonts.sans,
            fontWeight: 800,
            fontSize: s * 0.34,
            color: brand.colors.ink,
          }}
        >
          Na+
        </div>
      ) : (
        <svg key={i} width={s} height={s * 1.3} style={{ position: "absolute", left: x - s / 2, top: y - s * 0.65, opacity: op }}>
          <path
            d={`M ${s / 2} 2 C ${s * 0.85} ${s * 0.55}, ${s - 2} ${s * 0.8}, ${s / 2} ${s * 1.26} C 2 ${s * 0.8}, ${s * 0.15} ${s * 0.55}, ${s / 2} 2 Z`}
            fill={brand.colors.blue}
            stroke={brand.colors.navy}
            strokeWidth={3}
          />
        </svg>
      ),
    );
  }
  return (
    <div style={{ width: W, height: H, position: "relative" }}>
      <Img
        src={staticFile(src)}
        style={{ position: "absolute", width: W * 0.6, left: kx - W * 0.3, top: ky - W * 0.26, filter: "drop-shadow(0 14px 22px rgba(0,0,0,0.3))" }}
      />
      {/* the exit: a red bar slides across under the kidneys */}
      <div
        style={{
          position: "absolute",
          left: kx - W * 0.34,
          top: H * 0.84,
          width: W * 0.68 * bar,
          height: W * 0.035,
          background: "#C8372D",
          borderRadius: 8,
          boxShadow: "0 6px 12px rgba(0,0,0,0.25)",
        }}
      />
      {parts}
    </div>
  );
};
