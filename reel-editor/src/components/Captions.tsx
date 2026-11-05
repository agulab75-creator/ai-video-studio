import React from "react";
import type { Brand } from "../brands";
import type { Captions as CaptionsData } from "../schema";

// Ali Abdaal-style boxed captions: rounded box at ~78% height, bold sans, words already spoken
// dark, upcoming words in the chunk faded. Always on top of every layout.
export const Captions: React.FC<{
  data: CaptionsData;
  brand: Brand;
  t: number; // current time, seconds
  width: number;
  height: number;
}> = ({ data, brand, t, width, height }) => {
  const chunks = data.chunks;
  // A chunk shows from its start until the next chunk starts (or 0.4 s after it ends).
  const idx = chunks.findIndex((c, i) => t >= c.start && t < Math.min(chunks[i + 1]?.start ?? Infinity, c.end + 0.4));
  if (idx === -1) return null;
  const chunk = chunks[idx];
  const cap = brand.caption;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: cap.y * height,
        transform: "translateY(-50%)",
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: width * 0.86,
          background: cap.box,
          borderRadius: 18,
          padding: "12px 26px 14px",
          fontFamily: brand.fonts.sans,
          fontWeight: cap.weight,
          fontSize: cap.size,
          lineHeight: 1.18,
          textAlign: "center",
          boxShadow: "0 8px 22px rgba(0,0,0,0.22)",
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
  );
};
