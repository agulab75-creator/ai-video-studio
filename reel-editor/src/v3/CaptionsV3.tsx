import React from "react";
import { Easing, interpolate } from "remotion";
import type { Captions as CaptionsData } from "../schema";
import type { EditV3 } from "./schema";
import { C, F, glow, softShadow } from "./theme";

type Word = { text: string; start: number; end: number };

/** Mix a hex colour toward white (keywords over the dark wood desk need a lighter tint of the brand colour). */
const tint = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * k));
  return `rgb(${ch.join(",")})`;
};
const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const out = Easing.out(Easing.cubic);

// Rovix two-tier captions: small lead-in words appear one by one on their spoken word; one big italic keyword
// per phrase blurs in (4 frames at 30fps, no overshoot) below them in its semantic colour (SHR_001 0.53-0.67s).
export const CaptionsV3: React.FC<{ data: CaptionsData; edit: EditV3; t: number; fps: number; width: number; height: number; onScene: boolean }> = ({
  data,
  edit,
  t,
  fps,
  width,
  height,
  onScene,
}) => {
  const kws = edit.keywords;
  const kwEnd = (i: number) => kws[i].until ?? Math.min(kws[i + 1]?.at ?? Infinity, kws[i].at + 2.2);
  const hidden = (w: Word) => kws.some((k) => k.hide && w.start >= k.hide[0] - 1e-3 && w.start < k.hide[1]);

  // lead-in line: the current chunk, spoken words only
  const ci = data.chunks.findIndex((c, k) => t >= c.start && t < Math.min(data.chunks[k + 1]?.start ?? Infinity, c.end + 0.4));
  const words = ci === -1 ? [] : data.chunks[ci].words.filter((w) => t >= w.start - 0.02 && !hidden(w));

  const ki = kws.findIndex((k, i) => t >= k.at && t < kwEnd(i));
  const kw = ki === -1 ? null : kws[ki];

  const size = edit.captionStyle.size;
  const y = edit.captionStyle.y * height;
  const leadColor = onScene ? C.ink : "#FFFFFF";

  let kwStyle: React.CSSProperties | null = null;
  let strikeP = 0;
  if (kw) {
    const lf = (t - kw.at) * fps;
    const inF = (4 * fps) / 30;
    const p = interpolate(lf, [0, inF], [0, 1], { ...clamp, easing: out });
    const leftF = (kwEnd(ki) - t) * fps;
    const q = interpolate(leftF, [0, (3 * fps) / 30], [0, 1], clamp);
    const a = Math.min(p, q);
    kwStyle = {
      opacity: a,
      filter: a < 1 ? `blur(${(1 - a) * 14}px)` : undefined,
      transform: `translateY(${(1 - p) * 10}px)`,
    };
    if (kw.strikeAt !== undefined) strikeP = interpolate((t - kw.strikeAt) * fps, [0, (7 * fps) / 30], [0, 1], { ...clamp, easing: out });
  }

  const kwColor = kw ? (onScene ? kw.color : tint(kw.color, kw.color.toUpperCase() === C.maroon ? 0.5 : 0.3)) : "";

  return (
    <>
    {!onScene && (
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: y - height * 0.07,
          bottom: 0,
          background: "linear-gradient(180deg, rgba(28,14,4,0) 0%, rgba(28,14,4,0.5) 45%, rgba(28,14,4,0.62) 100%)",
          pointerEvents: "none",
        }}
      />
    )}
    <div style={{ position: "absolute", left: width * 0.06, right: width * 0.06, top: y, textAlign: "center", pointerEvents: "none" }}>
      <div style={{ height: size * 1.25, display: "flex", justifyContent: "center", gap: size * 0.28, flexWrap: "nowrap" }}>
        {words.map((w, i) => {
          const a = interpolate((t - w.start) * fps, [0, (2 * fps) / 30], [0.3, 1], clamp);
          return (
            <span
              key={i}
              style={{
                fontFamily: F.sans,
                fontWeight: 600,
                fontSize: size,
                lineHeight: 1.2,
                color: leadColor,
                opacity: a,
                textShadow: onScene ? undefined : softShadow,
                whiteSpace: "nowrap",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
      {kw && kwStyle && (
        <div style={{ position: "relative", display: "inline-block", marginTop: -size * 0.1, ...kwStyle }}>
          <span
            style={{
              fontFamily: F.serif,
              fontStyle: "italic",
              fontWeight: 700,
              fontSize: kw.size,
              lineHeight: 1.0,
              color: kwColor,
              whiteSpace: "nowrap",
              textShadow: onScene ? glow(kw.color, 0.8) : `${glow(kw.color, 0.9)}, 0 3px 14px rgba(20,10,4,0.7)`,
            }}
          >
            {kw.text}
          </span>
          {strikeP > 0 && (
            <div
              style={{
                position: "absolute",
                left: "-3%",
                top: "56%",
                height: kw.size * 0.07,
                width: `${106 * strikeP}%`,
                background: C.maroon,
                borderRadius: 6,
                transform: "rotate(-3deg)",
                boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
              }}
            />
          )}
        </div>
      )}
    </div>
    </>
  );
};
