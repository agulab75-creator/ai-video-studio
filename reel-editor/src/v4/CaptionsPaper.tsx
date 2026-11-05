import React from "react";
import type { Brand } from "../brands";
import { fibreBg, rnd } from "../custom/paper/kit";
import type { Captions as CaptionsData } from "../schema";

const tornEnds = (seed: number) => {
  const pts: string[] = [];
  const n = 9;
  for (let i = 0; i <= n; i++) pts.push(`${(rnd(seed + i) * 1.6).toFixed(2)}% ${(i / n) * 100}%`);
  const right: string[] = [];
  for (let i = n; i >= 0; i--) right.push(`${(100 - rnd(seed + 40 + i) * 1.6).toFixed(2)}% ${(i / n) * 100}%`);
  return `polygon(${pts.join(",")}, ${right.join(",")})`;
};

// Captions on a strip of torn paper tape, slapped on per chunk at a slightly different angle.
export const CaptionsPaper: React.FC<{ data: CaptionsData; brand: Brand; t: number; fps: number; width: number; height: number }> = ({
  data,
  brand,
  t,
  fps,
  width,
  height,
}) => {
  const chunks = data.chunks;
  const idx = chunks.findIndex((c, i) => t >= c.start && t < Math.min(chunks[i + 1]?.start ?? Infinity, c.end + 0.4));
  if (idx === -1) return null;
  const chunk = chunks[idx];
  const cap = brand.caption;
  const since = (t - chunk.start) * fps;
  const slap = since < 2 ? 1.07 : 1; // two frames big, then flat
  const rot = (rnd(idx * 3.7) - 0.5) * 3;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: cap.y * height, transform: "translateY(-50%)", display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ filter: "drop-shadow(0 5px 7px rgba(30,20,10,0.35))", transform: `rotate(${rot}deg) scale(${slap})` }}>
        <div
          style={{
            ...fibreBg("#F6EFDF"),
            clipPath: tornEnds(idx * 13 + 5),
            maxWidth: width * 0.86,
            padding: "12px 38px 15px",
            fontFamily: brand.fonts.sans,
            fontWeight: cap.weight,
            fontSize: cap.size,
            lineHeight: 1.18,
            textAlign: "center",
            letterSpacing: "-0.01em",
          }}
        >
          {chunk.words.map((w, i) => (
            <span key={i} style={{ color: t >= w.start ? cap.text : cap.upcoming }}>
              {w.text}
              {i < chunk.words.length - 1 ? " " : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
