import React from "react";
import { interpolate } from "remotion";
import type { Brand } from "../brands";
import { easeOut } from "../lib/anim";

// A printed control panel: one row per body system, each with a toggle that flips to a red "ON" at its time
// (seconds after entrance) and stays on, glowing. Shows systems stuck switched on ("active rehta hai").
export const AlarmSwitches: React.FC<{
  rows: { label: string; at: number }[];
  onText?: string;
  brand: Brand;
  localFrame: number;
  fps: number;
  width: number;
}> = ({ rows, onText = "ACTIVE", brand, localFrame, fps, width }) => {
  const W = width;
  const rowH = W * 0.2;
  const red = "#C8372D";
  return (
    <div
      style={{
        width: W,
        background: brand.colors.paper,
        borderRadius: 18,
        padding: `${W * 0.03}px ${W * 0.05}px`,
        boxShadow: "0 16px 34px rgba(0,0,0,0.3)",
        boxSizing: "border-box",
      }}
    >
      {rows.map((r, i) => {
        const s = Math.round(r.at * fps);
        const p = interpolate(localFrame, [s, s + Math.round(0.25 * fps)], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easeOut,
        });
        const glow = p >= 1 ? 0.6 + 0.4 * Math.abs(Math.sin((localFrame - s) / 5)) : p;
        const tw = W * 0.22;
        const th = W * 0.1;
        return (
          <div
            key={i}
            style={{
              height: rowH,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: i ? "3px dashed rgba(13,25,18,0.25)" : undefined,
            }}
          >
            <div style={{ fontFamily: brand.fonts.mono, fontSize: W * 0.06, color: brand.colors.ink, lineHeight: 1.05, maxWidth: W * 0.46 }}>
              {r.label}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: W * 0.03 }}>
              <div style={{ fontFamily: brand.fonts.sans, fontWeight: 800, fontSize: W * 0.042, color: red, opacity: p, letterSpacing: "0.06em" }}>
                {onText}
              </div>
              <div
                style={{
                  width: tw,
                  height: th,
                  borderRadius: th,
                  position: "relative",
                  background: p > 0.5 ? red : "#C9C3B8",
                  boxShadow: p > 0.5 ? `0 0 ${30 * glow}px ${red}` : "inset 0 3px 6px rgba(0,0,0,0.25)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: th * 0.1,
                    left: th * 0.1 + p * (tw - th),
                    width: th * 0.8,
                    height: th * 0.8,
                    borderRadius: "50%",
                    background: "#FFFFFF",
                    boxShadow: "0 3px 6px rgba(0,0,0,0.3)",
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
