import { evolvePath } from "@remotion/paths";
import React from "react";
import { interpolate } from "remotion";
import type { Brand } from "../brands";
import { at30, easeOut } from "../lib/anim";

// A printed paper strip with milestones (e.g. 3 / 6 / 12 MAHINE). Earlier milestones are filled,
// the active one gets a hand-drawn circle. Reuse it in every chapter so the viewer sees progress.
export const TimelineStrip: React.FC<{
  steps: string[];
  unit?: string;
  active: number;
  brand: Brand;
  localFrame: number;
  fps: number;
  width: number;
}> = ({ steps, unit = "", active, brand, localFrame, fps, width }) => {
  const h = width * 0.3;
  const pad = width * 0.1;
  const lineY = h * 0.42;
  const xs = steps.map((_, i) => pad + (i * (width - 2 * pad)) / Math.max(1, steps.length - 1));
  const fillTo = interpolate(localFrame, [at30(4, fps), at30(16, fps)], [xs[Math.max(0, active - 1)], xs[active]], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const circleP = interpolate(localFrame, [at30(14, fps), at30(28, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const r = h * 0.2;
  const cx = xs[active];
  const circle = `M ${cx + r * 0.3} ${lineY - r} C ${cx + r * 1.35} ${lineY - r * 0.9}, ${cx + r * 1.25} ${lineY + r * 1.1}, ${cx} ${lineY + r}
                  C ${cx - r * 1.3} ${lineY + r}, ${cx - r * 1.25} ${lineY - r * 1.1}, ${cx + r * 0.5} ${lineY - r * 1.12}`;
  const evo = evolvePath(circleP, circle);
  return (
    <div
      style={{
        width,
        height: h,
        background: brand.colors.paper,
        borderRadius: 10,
        boxShadow: "0 14px 30px rgba(0,0,0,0.28)",
        position: "relative",
        transform: "rotate(-1.2deg)",
      }}
    >
      <svg width={width} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <line x1={xs[0]} x2={xs[xs.length - 1]} y1={lineY} y2={lineY} stroke="rgba(13,25,18,0.18)" strokeWidth={8} strokeLinecap="round" />
        <line x1={xs[0]} x2={fillTo} y1={lineY} y2={lineY} stroke={brand.colors.ink} strokeWidth={8} strokeLinecap="round" />
        {xs.map((x, i) => (
          <circle key={i} cx={x} cy={lineY} r={h * 0.075} fill={i <= active && x <= fillTo + 1 ? brand.colors.ink : brand.colors.paper}
            stroke={brand.colors.ink} strokeWidth={6} />
        ))}
        <path d={circle} fill="none" stroke={brand.colors.accent} strokeWidth={9} strokeLinecap="round"
          strokeDasharray={evo.strokeDasharray} strokeDashoffset={evo.strokeDashoffset} />
      </svg>
      {steps.map((s, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: xs[i],
            top: lineY + h * 0.3,
            transform: "translateX(-50%)",
            textAlign: "center",
            fontFamily: brand.fonts.mono,
            color: i === active ? brand.colors.accent : brand.colors.ink,
            opacity: i <= active ? 1 : 0.45,
            fontSize: h * 0.17,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {s}
          {unit ? <div style={{ fontSize: h * 0.1, marginTop: 4, letterSpacing: "0.08em" }}>{unit}</div> : null}
        </div>
      ))}
    </div>
  );
};
