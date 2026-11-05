import { evolvePath } from "@remotion/paths";
import React from "react";
import { Easing, Img, interpolate, staticFile } from "remotion";

// Shared pieces for the paper-cut scenes (sugar-free reel, Oct 2026): stop-motion timing,
// hand-cut paper shapes, stamps and pen marks. Times in props are seconds from the segment start.

export const P = {
  cream: "#FBF6EC",
  paper: "#F4EEE3",
  kraft: "#D8B98E",
  ink: "#0D1912",
  orange: "#E65100",
  orangeSoft: "#F28A3C",
  blue: "#2E8BC0",
  navy: "#0C4A6E",
  green: "#3B9347",
  red: "#C8372D",
  yellow: "#F6C445",
};
export const FONT = { serif: "Instrument Serif", sans: "Plus Jakarta Sans", mono: "Special Elite", hand: "Caveat" };

export const rnd = (s: number) => {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** 0..1 progress of an action that starts at `at` seconds and lasts `dur` seconds. */
export const prog = (f: number, fps: number, at: number, dur: number, ease: (t: number) => number = Easing.out(Easing.cubic)) =>
  interpolate(f, [at * fps, (at + dur) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

export const backOut = Easing.out(Easing.back(1.7));
export const easeIn = Easing.in(Easing.cubic);

/** Small hand-held wobble that changes every 3 frames, like a stop-motion boil. */
export const boil = (seed: number, f: number, amt = 1) => {
  const k = Math.floor(f / 3);
  return {
    x: (rnd(seed + k * 1.31) - 0.5) * 2 * amt,
    y: (rnd(seed + 50 + k * 1.73) - 0.5) * 2 * amt,
    r: (rnd(seed + 99 + k * 2.11) - 0.5) * 0.7 * amt,
  };
};

const fibre = (() => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' seed='4'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.22'/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
})();
export const fibreBg = (color: string): React.CSSProperties => ({
  backgroundColor: color,
  backgroundImage: fibre,
  backgroundBlendMode: "multiply",
});

/** Hand-cut polygon: a rectangle whose corners and edge midpoints wander a little. */
export const cutPoly = (seed: number, j = 1.4) => {
  const pts: [number, number][] = [
    [0, 0], [50, 0], [100, 0], [100, 50], [100, 100], [50, 100], [0, 100], [0, 50],
  ];
  return `polygon(${pts
    .map(([x, y], i) => `${x + (rnd(seed + i) - 0.5) * 2 * j}% ${y + (rnd(seed + i + 20) - 0.5) * 2 * j}%`)
    .join(",")})`;
};

/** A piece of cut paper with a drop shadow (the filter sits on the parent so the clip doesn't cut it). */
export const Cut: React.FC<{
  color: string;
  seed?: number;
  jag?: number;
  shadow?: number;
  style?: React.CSSProperties;
  inner?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ color, seed = 1, jag = 1.2, shadow = 1, style, inner, children }) => (
  <div style={{ filter: `drop-shadow(0 ${4 * shadow}px ${5 * shadow}px rgba(40,25,10,0.32))`, ...style }}>
    <div style={{ ...fibreBg(color), clipPath: cutPoly(seed, jag), width: "100%", height: "100%", ...inner }}>{children}</div>
  </div>
);

/** Cutout image with a white die-cut sticker border. */
export const Sticker: React.FC<{ src: string; width: number; border?: number; style?: React.CSSProperties }> = ({
  src,
  width,
  border = 6,
  style,
}) => {
  const b = border;
  const ring = [
    [b, 0], [-b, 0], [0, b], [0, -b], [b * 0.7, b * 0.7], [-b * 0.7, b * 0.7], [b * 0.7, -b * 0.7], [-b * 0.7, -b * 0.7],
  ]
    .map(([x, y]) => `drop-shadow(${x}px ${y}px 0 #fff)`)
    .join(" ");
  return (
    <Img
      src={staticFile(src)}
      style={{ width, display: "block", filter: `${ring} drop-shadow(0 14px 16px rgba(40,25,10,0.35))`, ...style }}
    />
  );
};

/** Rubber stamp that slams in: big and light, then flat and inked. */
export const Stamp: React.FC<{
  text: string;
  f: number;
  fps: number;
  at: number;
  color?: string;
  size?: number;
  rotate?: number;
  style?: React.CSSProperties;
}> = ({ text, f, fps, at, color = P.red, size = 64, rotate = -6, style }) => {
  if (f < at * fps) return null;
  const p = prog(f, fps, at, 0.12, easeIn);
  return (
    <div
      style={{
        transform: `rotate(${rotate}deg) scale(${1.7 - 0.7 * p})`,
        opacity: 0.35 + 0.65 * p,
        fontFamily: FONT.mono,
        fontSize: size,
        color,
        border: `${Math.max(4, size / 11)}px solid ${color}`,
        borderRadius: 10,
        padding: "0.08em 0.4em",
        letterSpacing: "0.06em",
        whiteSpace: "nowrap",
        textTransform: "uppercase",
        mixBlendMode: "multiply",
        background: "rgba(255,255,255,0.08)",
        ...style,
      }}
    >
      {text}
    </div>
  );
};

/** Pen tick drawn in `dur` seconds. */
export const PenTick: React.FC<{ f: number; fps: number; at: number; size?: number; color?: string; dur?: number; stroke?: number }> = ({
  f,
  fps,
  at,
  size = 80,
  color = P.green,
  dur = 0.25,
  stroke = 11,
}) => {
  const p = prog(f, fps, at, dur, Easing.inOut(Easing.quad));
  if (p <= 0) return null;
  const d = `M ${size * 0.08} ${size * 0.55} L ${size * 0.38} ${size * 0.85} L ${size * 0.95} ${size * 0.1}`;
  const e = evolvePath(p, d);
  return (
    <svg width={size} height={size} style={{ overflow: "visible", display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={e.strokeDasharray} strokeDashoffset={e.strokeDashoffset} />
    </svg>
  );
};

/** Loose hand-drawn ellipse. */
export const PenCircle: React.FC<{ f: number; fps: number; at: number; w: number; h: number; color?: string; dur?: number; stroke?: number }> = ({
  f,
  fps,
  at,
  w,
  h,
  color = P.red,
  dur = 0.35,
  stroke = 9,
}) => {
  const p = prog(f, fps, at, dur, Easing.inOut(Easing.quad));
  if (p <= 0) return null;
  const rx = w / 2 - stroke, ry = h / 2 - stroke, cx = w / 2, cy = h / 2;
  const d = `M ${cx + rx * 0.2} ${cy - ry} C ${cx + rx * 1.15} ${cy - ry * 0.95}, ${cx + rx * 1.05} ${cy + ry * 1.05}, ${cx} ${cy + ry}
     C ${cx - rx * 1.1} ${cy + ry} ${cx - rx * 1.08} ${cy - ry * 1.05}, ${cx + rx * 0.4} ${cy - ry * 1.1}`;
  const e = evolvePath(p, d);
  return (
    <svg width={w} height={h} style={{ overflow: "visible", display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={e.strokeDasharray} strokeDashoffset={e.strokeDashoffset} />
    </svg>
  );
};

/** Highlighter swipe behind a row. */
export const Marker: React.FC<{ f: number; fps: number; at: number; w: number; h: number; color?: string }> = ({
  f,
  fps,
  at,
  w,
  h,
  color = "rgba(246,196,69,0.75)",
}) => {
  const p = prog(f, fps, at, 0.22);
  return (
    <div
      style={{
        position: "absolute",
        width: w * p,
        height: h,
        background: color,
        mixBlendMode: "multiply",
        clipPath: "polygon(0 12%, 100% 0, 99% 88%, 1% 100%)",
      }}
    />
  );
};

/**
 * A word built from paper letter chips that fold up one by one; `ripAt` tears the word in two.
 */
export const CutLetters: React.FC<{
  text: string;
  f: number;
  fps: number;
  at: number;
  stagger?: number;
  size?: number;
  colors?: string[];
  inkOn?: string[]; // text colour per chip colour index
  seed?: number;
  ripAt?: number;
  font?: "serif" | "sans";
}> = ({ text, f, fps, at, stagger = 0.05, size = 120, colors = [P.cream, P.orange, P.blue, P.yellow, P.green], inkOn, seed = 3, ripAt, font = "sans" }) => {
  const chars = [...text];
  const row = (half?: "l" | "r") => (
    <div style={{ display: "flex", gap: size * 0.06, alignItems: "center", justifyContent: "center" }}>
      {chars.map((ch, i) => {
        if (ch === " ") return <div key={i} style={{ width: size * 0.3 }} />;
        const p = prog(f, fps, at + i * stagger, 0.16, backOut);
        if (p <= 0) return <div key={i} style={{ width: size * 0.78, height: size * 1.05, opacity: 0 }} />;
        const ci = Math.floor(rnd(seed + i * 3) * colors.length);
        const bg = colors[ci];
        const ink = inkOn?.[ci] ?? (bg === P.cream || bg === P.yellow ? P.ink : "#fff");
        const rot = (rnd(seed + i * 7) - 0.5) * 12;
        const dy = (rnd(seed + i * 11) - 0.5) * size * 0.14;
        return (
          <Cut
            key={i}
            color={bg}
            seed={seed + i * 5}
            jag={3}
            style={{
              width: size * 0.78,
              height: size * 1.05,
              transform: `translateY(${dy}px) rotate(${rot}deg) perspective(600px) rotateX(${(1 - p) * 85}deg) scale(${0.6 + 0.4 * p})`,
              transformOrigin: "50% 100%",
            }}
            inner={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <span
              style={{
                fontFamily: font === "serif" ? FONT.serif : FONT.sans,
                fontWeight: font === "serif" ? 400 : 800,
                fontSize: size * (font === "serif" ? 0.92 : 0.72),
                color: ink,
                lineHeight: 1,
              }}
            >
              {ch}
            </span>
          </Cut>
        );
      })}
    </div>
  );
  if (ripAt === undefined || f < ripAt * fps) return row();
  // Torn in two: a jagged vertical edge through the middle; halves fall apart.
  const p = prog(f, fps, ripAt, 0.45, Easing.out(Easing.quad));
  const xs: number[] = [];
  for (let i = 0; i <= 12; i++) xs.push(50 + (rnd(seed + 300 + i) - 0.5) * 6);
  const edge = xs.map((x, i) => `${x}% ${(i / 12) * 100}%`).join(",");
  const left = `polygon(-5% -20%, ${xs[0]}% -20%, ${edge}, ${xs[12]}% 120%, -5% 120%)`;
  const right = `polygon(105% -20%, ${xs[0]}% -20%, ${edge}, ${xs[12]}% 120%, 105% 120%)`;
  return (
    <div style={{ position: "relative" }}>
      <div style={{ clipPath: left, transform: `translate(${-90 * p}px, ${140 * p * p}px) rotate(${-11 * p}deg)` }}>{row("l")}</div>
      <div style={{ position: "absolute", inset: 0, clipPath: right, transform: `translate(${90 * p}px, ${170 * p * p}px) rotate(${13 * p}deg)` }}>
        {row("r")}
      </div>
    </div>
  );
};

/** Absolute-positioned helper: centre a child at (x, y) px. */
export const At: React.FC<{ x: number; y: number; children: React.ReactNode; z?: number; style?: React.CSSProperties }> = ({
  x,
  y,
  children,
  z,
  style,
}) => (
  <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)", zIndex: z, ...style }}>{children}</div>
);

/** A full 1080x1920 stage, scaled to the element width. Scenes draw in 1080-wide px. */
export const Stage: React.FC<{ width: number; children: React.ReactNode; h?: number }> = ({ width, children, h = 1920 }) => {
  const k = width / 1080;
  return (
    <div style={{ width, height: h * k, position: "relative" }}>
      <div style={{ width: 1080, height: h, position: "absolute", left: 0, top: 0, transform: `scale(${k})`, transformOrigin: "0 0" }}>
        {children}
      </div>
    </div>
  );
};
