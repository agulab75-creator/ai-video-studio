import { evolvePath } from "@remotion/paths";
import React from "react";
import { Img, interpolate, OffthreadVideo, staticFile } from "remotion";
import type { Brand } from "../brands";
import { customComponents } from "../custom";
import { at30, easeOut, enterFrames, enterStyle, exitStyle } from "../lib/anim";
import type { Element } from "../schema";

type Props = {
  el: Element;
  brand: Brand;
  localFrame: number; // frames since the segment started
  segFrames: number;
  fps: number;
  width: number;
  height: number;
};

const fontFor = (brand: Brand, f: "serif" | "sans" | "mono" | "hand") => brand.fonts[f];

/** Renders *accent* words in the accent colour. */
const Accented: React.FC<{ text: string; accent: string; visibleChars?: number }> = ({ text, accent, visibleChars }) => {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  let budget = visibleChars ?? Infinity;
  return (
    <>
      {parts.map((p, i) => {
        const isAccent = p.startsWith("*") && p.endsWith("*");
        const raw = isAccent ? p.slice(1, -1) : p;
        const shown = raw.slice(0, Math.max(0, budget));
        budget -= raw.length;
        return (
          <span key={i} style={isAccent ? { color: accent } : undefined}>
            {shown}
          </span>
        );
      })}
    </>
  );
};

export const ElementView: React.FC<Props> = ({ el, brand, localFrame, segFrames, fps, width, height }) => {
  const enter = el.enter ?? { type: "pop" as const, at: 0 };
  const f = localFrame - Math.round(enter.at * fps);
  const exit = el.exit ?? (el.until !== undefined ? { type: "fade" as const, at: el.until, frames: undefined } : undefined);
  const st = enterStyle(enter.type, f, fps, enter.frames);
  const ex = exitStyle(exit?.type, localFrame, exit ? Math.round(exit.at * fps) : undefined, fps, exit?.frames);
  const opacity = st.opacity * ex.opacity;
  if (f < 0 || opacity <= 0) return null;

  const w = el.w * width;
  const box: React.CSSProperties = {
    position: "absolute",
    left: el.x * width,
    top: el.y * height,
    width: w,
    transform: `${ex.transform} translate(-50%, -50%) rotate(${el.rotate}deg) ${st.transform}`,
    opacity,
    zIndex: el.z,
  };

  switch (el.type) {
    case "image": {
      const kb = 1 + el.kenburns * Math.min(1, localFrame / Math.max(1, segFrames));
      const border = el.border
        ? "drop-shadow(4px 0 0 #fff) drop-shadow(-4px 0 0 #fff) drop-shadow(0 4px 0 #fff) drop-shadow(0 -4px 0 #fff)"
        : "";
      const shadow = el.shadow ? "drop-shadow(0 18px 24px rgba(0,0,0,0.35))" : "";
      return (
        <div style={box}>
          <Img
            src={staticFile(el.src)}
            style={{ width: "100%", display: "block", transform: `scale(${kb})`, filter: `${border} ${shadow}`.trim() || undefined }}
          />
        </div>
      );
    }
    case "video": {
      const h = el.h * height;
      return (
        <div
          style={{
            ...box,
            height: h,
            borderRadius: el.radius,
            overflow: "hidden",
            boxShadow: el.border ? "0 0 0 8px #fff, 0 18px 30px rgba(0,0,0,0.35)" : "0 18px 30px rgba(0,0,0,0.3)",
          }}
        >
          <OffthreadVideo muted src={staticFile(el.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      );
    }
    case "text": {
      const color = el.color ?? brand.colors.ink;
      const accent = el.accent ?? brand.colors.accent;
      const plainLength = el.text.replace(/\*/g, "").length;
      const cps = at30(2, fps); // frames per character for type-on
      const visible = enter.type === "type-on" ? Math.floor(f / cps) + 1 : plainLength;
      return (
        <div
          style={{
            ...box,
            fontFamily: fontFor(brand, el.font),
            fontSize: el.size,
            fontWeight: el.weight ?? (el.font === "sans" ? 800 : 400),
            fontStyle: el.italic ? "italic" : "normal",
            lineHeight: el.lineHeight,
            color,
            textAlign: el.align,
            letterSpacing: el.font === "serif" ? "-0.01em" : undefined,
            whiteSpace: "pre-wrap",
            textShadow: color === "#FFFFFF" || color.toLowerCase() === "#fff" ? "0 4px 18px rgba(0,0,0,0.85), 0 2px 4px rgba(0,0,0,0.6)" : undefined,
          }}
        >
          <Accented text={el.text} accent={accent} visibleChars={visible} />
        </div>
      );
    }
    case "label": {
      const cps = at30(1.5, fps);
      const visible = enter.type === "type-on" ? Math.floor(f / cps) + 1 : el.text.length;
      return (
        <div style={{ ...box, width: "auto", display: "flex", justifyContent: "center" }}>
          <span
            style={{
              background: el.bg ?? brand.label.bg,
              color: el.color ?? brand.label.color,
              fontFamily: brand.fonts.mono,
              fontSize: el.size,
              letterSpacing: "0.08em",
              padding: "0.18em 0.5em",
              textTransform: "uppercase",
              boxShadow: "0 6px 14px rgba(0,0,0,0.3)",
              whiteSpace: "pre",
            }}
          >
            {el.text.slice(0, visible)}
          </span>
        </div>
      );
    }
    case "counter": {
      const n = at30(Math.round(el.seconds * 30), fps);
      const v = interpolate(f, [0, n], [el.from, el.to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
      return (
        <div
          style={{
            ...box,
            fontFamily: fontFor(brand, el.font),
            fontSize: el.size,
            fontWeight: el.font === "sans" ? 800 : 400,
            color: el.color ?? brand.colors.accent,
            textAlign: "center",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {el.prefix}
          {v.toLocaleString("en-IN", { minimumFractionDigits: el.decimals, maximumFractionDigits: el.decimals })}
          {el.suffix}
        </div>
      );
    }
    case "annotation": {
      const h = el.h * height;
      const n = enterFrames("draw", fps, enter.frames);
      const p = interpolate(f, [0, n], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
      const color = el.color ?? brand.annotation;
      let d = "";
      if (el.kind === "circle") {
        // slightly open, hand-drawn ellipse that overshoots its start point
        const rx = w / 2 - el.stroke, ry = h / 2 - el.stroke, cx = w / 2, cy = h / 2;
        d = `M ${cx + rx * 0.2} ${cy - ry} C ${cx + rx * 1.15} ${cy - ry * 0.95}, ${cx + rx * 1.05} ${cy + ry * 1.05}, ${cx} ${cy + ry}
             C ${cx - rx * 1.1} ${cy + ry * 1.0}, ${cx - rx * 1.08} ${cy - ry * 1.05}, ${cx + rx * 0.35} ${cy - ry * 1.08}`;
      } else if (el.kind === "underline") {
        d = `M ${el.stroke} ${h * 0.6} C ${w * 0.35} ${h * 0.45}, ${w * 0.65} ${h * 0.7}, ${w - el.stroke} ${h * 0.5}`;
      } else {
        d = `M ${el.stroke} ${h - el.stroke} C ${w * 0.3} ${h * 0.2}, ${w * 0.6} ${h * 0.15}, ${w - el.stroke * 3} ${el.stroke * 2}
             M ${w - el.stroke * 3} ${el.stroke * 2} L ${w - el.stroke * 9} ${el.stroke * 2.6}
             M ${w - el.stroke * 3} ${el.stroke * 2} L ${w - el.stroke * 4.2} ${el.stroke * 8}`;
      }
      const evo = evolvePath(p, d);
      return (
        <div style={{ ...box, height: h, opacity }}>
          <svg width={w} height={h} style={{ overflow: "visible" }}>
            <path d={d} fill="none" stroke={color} strokeWidth={el.stroke} strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={evo.strokeDasharray} strokeDashoffset={evo.strokeDashoffset} />
          </svg>
        </div>
      );
    }
    case "component": {
      const C = customComponents[el.name];
      if (!C) throw new Error(`Unknown custom component "${el.name}". Register it in src/custom/index.ts`);
      return (
        <div style={{ ...box, height: undefined }}>
          <C {...el.props} brand={brand} localFrame={f} fps={fps} width={w} />
        </div>
      );
    }
  }
};
