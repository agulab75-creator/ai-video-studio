import React from "react";
import { Img, staticFile } from "remotion";
import { Cut, FONT, fibreBg, P, prog, backOut } from "./kit";

// The generic snack pack that recurs through the sugar-free reel: front with a SUGAR FREE badge,
// back with a mini nutrition label. Pack image aspect is 499x1246.
export const PACK_ASPECT = 1246 / 499;

export const MiniLabel: React.FC<{ w: number; h: number }> = ({ w, h }) => {
  const line = (top: number, thick = 2) => (
    <div style={{ position: "absolute", left: w * 0.08, right: w * 0.08, top: h * top, height: thick, background: P.ink }} />
  );
  return (
    <div style={{ position: "absolute", inset: 0, ...fibreBg(P.cream), borderRadius: 10 }}>
      <div style={{ position: "absolute", left: w * 0.08, top: h * 0.06, fontFamily: FONT.sans, fontWeight: 800, fontSize: w * 0.13, color: P.ink, lineHeight: 1 }}>
        Nutrition
        <br />
        Facts
      </div>
      {line(0.24, 6)}
      {[0.3, 0.38, 0.46, 0.54, 0.62].map((t, i) => (
        <React.Fragment key={i}>
          <div style={{ position: "absolute", left: w * 0.08, top: h * t, width: w * (0.3 + 0.25 * ((i * 37) % 10) / 10), height: h * 0.025, background: "rgba(13,25,18,0.55)", borderRadius: 3 }} />
          {line(t + 0.05, 2)}
        </React.Fragment>
      ))}
      <div style={{ position: "absolute", left: w * 0.08, right: w * 0.08, top: h * 0.72, height: h * 0.2, background: "repeating-linear-gradient(to bottom, rgba(13,25,18,0.35) 0 4px, transparent 4px 14px)" }} />
    </div>
  );
};

/** The pack. `flip` 0..1 turns it round to the label side. `badgeAt` stamps the SUGAR FREE badge on. */
export const Pack: React.FC<{
  w: number;
  f: number;
  fps: number;
  badgeAt?: number;
  flip?: number;
  wiggle?: number; // 0..1 badge pulse
  children?: React.ReactNode; // extra stickers on the front
}> = ({ w, f, fps, badgeAt = -1, flip = 0, wiggle = 0, children }) => {
  const h = w * PACK_ASPECT;
  const angle = flip * 180;
  const showBack = angle > 90;
  const bp = badgeAt >= 0 ? prog(f, fps, badgeAt, 0.14, backOut) : 1;
  return (
    <div style={{ width: w, height: h, perspective: 1600 }}>
      <div style={{ width: w, height: h, position: "relative", transform: `rotateY(${angle}deg)`, transformStyle: "preserve-3d" }}>
        {!showBack && (
          <div style={{ position: "absolute", inset: 0 }}>
            <Img src={staticFile("projects/sugar-free/assets/pack_front.png")} style={{ width: w, height: h, display: "block", filter: "drop-shadow(0 18px 18px rgba(40,25,10,0.35))" }} />
            {bp > 0 && (
              <Cut
                color={P.green}
                seed={41}
                jag={2.5}
                style={{
                  position: "absolute",
                  left: w * 0.06,
                  top: h * 0.1,
                  width: w * 0.88,
                  height: w * 0.42,
                  transform: `rotate(-7deg) scale(${(0.3 + 0.7 * bp) * (1 + 0.08 * Math.sin(wiggle * Math.PI))})`,
                }}
                inner={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
              >
                <span style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: w * 0.15, color: "#fff", lineHeight: 0.95, letterSpacing: "-0.01em" }}>SUGAR</span>
                <span style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: w * 0.15, color: "#fff", lineHeight: 0.95 }}>FREE</span>
              </Cut>
            )}
            {children}
          </div>
        )}
        {showBack && (
          <div style={{ position: "absolute", inset: 0, transform: "rotateY(180deg)", filter: "drop-shadow(0 18px 18px rgba(40,25,10,0.35))" }}>
            <div style={{ position: "absolute", inset: 0, ...fibreBg(P.orange), borderRadius: 14 }} />
            <div style={{ position: "absolute", left: w * 0.08, top: h * 0.07, width: w * 0.84, height: h * 0.86 }}>
              <MiniLabel w={w * 0.84} h={h * 0.86} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
