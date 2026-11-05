import { evolvePath } from "@remotion/paths";
import React from "react";
import { interpolate } from "remotion";
import type { Brand } from "../brands";
import { at30, easeOut } from "../lib/anim";

// A printed diet-chart sheet with two columns, KHAAYEIN (eat) and AVOID. Rows are blank ruled
// lines (the real chart is what he sends in DM; we don't invent its contents). Each column gets a
// hand-drawn circle when he says it.
export const BPDietChart: React.FC<{
  title?: string;
  eatAt?: number; // seconds after entrance; omit to skip the circle
  avoidAt?: number;
  rows?: number;
  brand: Brand;
  localFrame: number;
  fps: number;
  width: number;
}> = ({ title = "BP DIET CHART", eatAt, avoidAt, rows = 5, brand, localFrame, fps, width }) => {
  const W = width;
  const H = W * 1.15;
  const red = "#C8372D";
  const green = brand.colors.green;
  const colTop = H * 0.2;
  const colX = [W * 0.06, W * 0.53];
  const colW = W * 0.41;
  const ring = (atS: number | undefined, x: number) => {
    if (atS === undefined) return null;
    const s = Math.round(atS * fps);
    const p = interpolate(localFrame, [s, s + at30(12, fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
    const cx = x + colW / 2, cy = colTop + H * 0.05, rx = colW * 0.55, ry = H * 0.065;
    const d = `M ${cx + rx * 0.2} ${cy - ry} C ${cx + rx * 1.3} ${cy - ry * 0.9}, ${cx + rx * 1.2} ${cy + ry * 1.1}, ${cx} ${cy + ry}
               C ${cx - rx * 1.25} ${cy + ry}, ${cx - rx * 1.2} ${cy - ry * 1.1}, ${cx + rx * 0.4} ${cy - ry * 1.12}`;
    const e = evolvePath(p, d);
    return { d, e, p };
  };
  const rings = [ring(eatAt, colX[0]), ring(avoidAt, colX[1])];
  const dim = (i: number) => {
    // the column not being talked about fades slightly once the other is circled
    const other = rings[1 - i];
    const mine = rings[i];
    if (!other || other.p === 0) return 1;
    return mine && mine.p > 0 && (i === 1 || (rings[1]?.p ?? 0) === 0) ? 1 : 0.45 + 0.55 * (1 - other.p);
  };
  return (
    <div style={{ width: W, height: H, background: brand.colors.paper, borderRadius: 14, position: "relative",
      boxShadow: "0 18px 38px rgba(0,0,0,0.32)" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: H * 0.05, textAlign: "center", fontFamily: brand.fonts.mono,
        fontSize: W * 0.085, color: brand.colors.ink, letterSpacing: "0.06em" }}>{title}</div>
      <div style={{ position: "absolute", left: W * 0.08, right: W * 0.08, top: H * 0.15, height: 4, background: brand.colors.ink }} />
      {[0, 1].map((c) => (
        <div key={c} style={{ position: "absolute", left: colX[c], top: colTop, width: colW, opacity: dim(c) }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: W * 0.02, height: H * 0.1,
            fontFamily: brand.fonts.sans, fontWeight: 800, fontSize: W * 0.06, color: c === 0 ? green : red }}>
            <span style={{ fontSize: W * 0.07 }}>{c === 0 ? "✓" : "✗"}</span>
            {c === 0 ? "KHAAYEIN" : "AVOID"}
          </div>
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} style={{ marginTop: H * 0.06, height: W * 0.022, borderRadius: 6,
              width: `${70 + 25 * Math.abs(Math.sin(r * 2.3 + c))}%`, background: "rgba(13,25,18,0.16)" }} />
          ))}
        </div>
      ))}
      <div style={{ position: "absolute", left: W / 2 - 1.5, top: colTop, height: H * 0.72, width: 3, background: "rgba(13,25,18,0.2)" }} />
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {rings.map((r, i) => r && r.p > 0 ? (
          <path key={i} d={r.d} fill="none" stroke={i === 0 ? green : red} strokeWidth={W * 0.012} strokeLinecap="round"
            strokeDasharray={r.e.strokeDasharray} strokeDashoffset={r.e.strokeDashoffset} />
        ) : null)}
      </svg>
    </div>
  );
};
