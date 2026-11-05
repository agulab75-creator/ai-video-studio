import React from "react";
import { interpolate } from "remotion";
import type { Brand } from "../brands";
import { easeOut } from "../lib/anim";

// A blood vessel in long section: red cells flow through it. At `squeezeAt` (seconds after entrance) the walls
// close in, the cells crowd and speed up, and pressure arrows push on the walls. Shows "nasein sikudti hain".
export const ArteryFlow: React.FC<{
  squeezeAt?: number;
  brand: Brand;
  localFrame: number;
  fps: number;
  width: number;
}> = ({ squeezeAt = 1, brand, localFrame, fps, width }) => {
  const W = width;
  const H = W * 0.5;
  const cy = H / 2;
  const s0 = Math.round(squeezeAt * fps);
  const k = interpolate(localFrame, [s0, s0 + Math.round(0.7 * fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const open = H * 0.52;
  const gap = H * (0.52 - 0.28 * k);
  const wall = H * 0.12;
  // the squeeze is strongest in the middle of the vessel
  const lumenAt = (x: number) => open - (open - gap) * Math.exp(-Math.pow((x - W / 2) / (W * 0.3), 2));
  const N = 40;
  const pts = Array.from({ length: N + 1 }, (_, i) => (i / N) * W);
  const top = pts.map((x) => `${x},${cy - lumenAt(x) / 2}`).join(" ");
  const bot = pts.map((x) => `${x},${cy + lumenAt(x) / 2}`).join(" ");
  // cells speed up after the squeeze (integrated, so they never jump)
  const t = localFrame / fps;
  const v0 = 0.16;
  const dist = t < squeezeAt ? t * v0 : squeezeAt * v0 + (t - squeezeAt) * (v0 + 0.2 * Math.min(1, (t - squeezeAt) / 0.7));
  const cells = Array.from({ length: 14 }, (_, i) => {
    const u = ((i / 14 + dist) % 1) * 1.1 - 0.05;
    const x = u * W;
    const lane = ((i * 37) % 7) / 6 - 0.5;
    return { x, y: cy + lane * lumenAt(x) * 0.6, i };
  });
  const tissue = "#E7B9A8";
  const outer = cy - open / 2 - wall;
  return (
    <div
      style={{
        width: W,
        height: H,
        background: brand.colors.paper,
        borderRadius: 18,
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 16px 34px rgba(0,0,0,0.3)",
      }}
    >
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <rect x={0} y={outer} width={W} height={open + wall * 2} fill={tissue} opacity={0.3} />
        <polygon points={`0,${outer} ${top} ${W},${outer}`} fill={tissue} />
        <polygon points={`0,${H - outer} ${bot} ${W},${H - outer}`} fill={tissue} />
        <polyline points={top} fill="none" stroke="#B4544A" strokeWidth={W * 0.008} />
        <polyline points={bot} fill="none" stroke="#B4544A" strokeWidth={W * 0.008} />
        {cells.map((c) => (
          <ellipse key={c.i} cx={c.x} cy={c.y} rx={W * 0.03} ry={W * 0.02} fill="#C8372D" stroke="#8E1F18" strokeWidth={3} />
        ))}
        {k > 0.05 &&
          [-1, 1].map((d) =>
            [0.38, 0.5, 0.62].map((fx, j) => {
              const x = fx * W;
              const wallY = cy + (d * lumenAt(x)) / 2;
              const y = wallY + d * W * 0.05; // arrow sits outside the wall, pointing in
              const a = W * 0.022 * (1 + 0.15 * Math.sin(localFrame / 2.2 + j));
              return (
                <path
                  key={`${d}${j}`}
                  d={`M ${x - a} ${y + d * a * 0.6} L ${x} ${y - d * a * 0.6} L ${x + a} ${y + d * a * 0.6}`}
                  fill="none"
                  stroke={brand.colors.ink}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={k}
                />
              );
            }),
          )}
      </svg>
    </div>
  );
};
