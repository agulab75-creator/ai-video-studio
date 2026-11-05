import { evolvePath } from "@remotion/paths";
import React from "react";
import { Easing, Img, interpolate, OffthreadVideo, staticFile } from "remotion";
import { darkShadow, F, glowShadow } from "./fonts";
import type { ElementV2 } from "./schema";

// Timings are the measured atlasian-clinic-3d table (frames @30fps): title blur-in 4, tracking-in 6,
// callout word 3, pill 4, ring draw 8, tile flip 6 / slide 5, check pop 3 (the only overshoot).

const out = Easing.out(Easing.cubic);
const inOut = Easing.inOut(Easing.cubic);
const k30 = (n: number, fps: number) => Math.max(1, Math.round((n * fps) / 30));
const ramp = (f: number, n: number, e = out) => interpolate(f, [0, n], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });

type P = { el: ElementV2; lf: number; fps: number; width: number; height: number };

const Line: React.FC<{ line: Extract<ElementV2, { type: "title" }>["lines"][number]; f: number; fps: number; glow: boolean; align: string }> = ({ line, f, fps, glow, align }) => {
  if (f < 0) return null;
  const font: React.CSSProperties =
    line.font === "serif"
      ? { fontFamily: F.serif, fontWeight: 700 }
      : line.font === "serifItalic"
        ? { fontFamily: F.serif, fontWeight: 700, fontStyle: "italic" }
        : line.font === "grotesk"
          ? { fontFamily: F.grotesk, textTransform: "uppercase", letterSpacing: "0.01em" }
          : line.font === "tracked"
            ? { fontFamily: F.sans, fontWeight: 700, textTransform: "uppercase" }
            : { fontFamily: F.sans, fontWeight: 800 };
  const baseTrack = line.font === "tracked" ? 0.28 : line.font === "grotesk" ? 0.01 : 0;
  let opacity = 1;
  let transform = "";
  let filter = "";
  let letterSpacing = `${baseTrack}em`;
  let text = line.text;
  if (line.anim === "blurIn") {
    const p = ramp(f, k30(4, fps));
    opacity = p;
    filter = `blur(${(1 - p) * 14}px)`;
    transform = `scale(${1.06 - 0.06 * p})`;
  } else if (line.anim === "tracking") {
    const p = ramp(f, k30(6, fps));
    opacity = Math.min(1, p * 1.5);
    letterSpacing = `${baseTrack + (1 - p) * 0.6}em`;
    filter = `blur(${(1 - p) * 6}px)`;
  } else if (line.anim === "rise") {
    const p = ramp(f, k30(5, fps));
    opacity = p;
    transform = `translateY(${(1 - p) * 40}px)`;
  } else if (line.anim === "type") {
    text = line.text.slice(0, Math.floor(f / k30(1.5, fps)) + 1);
  }
  const s = line.strikeAt !== undefined ? ramp(f - Math.round(line.strikeAt * fps), k30(5, fps)) : 0;
  return (
    <div style={{ position: "relative", display: "block", textAlign: align as React.CSSProperties["textAlign"] }}>
      <span
        style={{
          ...font,
          position: "relative",
          display: "inline-block",
          fontSize: line.size,
          lineHeight: 1,
          color: line.color,
          letterSpacing,
          whiteSpace: "pre",
          opacity,
          transform,
          filter: filter || undefined,
          textShadow: glow ? `${glowShadow(line.color, line.size > 140 ? 1.2 : 0.9)}` : darkShadow,
        }}
      >
        {text}
        {s > 0 && (
          <span
            style={{
              position: "absolute",
              left: "-4%",
              top: "52%",
              width: "108%",
              height: Math.max(8, line.size * 0.09),
              background: line.strikeColor,
              borderRadius: 99,
              transform: `rotate(-3deg) scaleX(${s})`,
              transformOrigin: "0% 50%",
              boxShadow: glowShadow(line.strikeColor, 0.7),
            }}
          />
        )}
      </span>
    </div>
  );
};

const floatOf = (el: { x: number; y: number }, amp: number, period: number, t: number) => {
  const ph = (el.x * 13.7 + el.y * 7.3) % (Math.PI * 2);
  return {
    y: amp * Math.sin((2 * Math.PI * t) / period + ph),
    r: 1.6 * Math.sin((2 * Math.PI * t) / (period * 1.3) + ph * 0.7),
  };
};

export const ElementV2View: React.FC<P> = ({ el, lf, fps, width, height }) => {
  const f = lf - Math.round(el.at * fps);
  if (f < 0) return null;
  const t = lf / fps;
  const fadeOut = el.until !== undefined ? 1 - ramp(lf - Math.round(el.until * fps), k30(6, fps), Easing.in(Easing.cubic)) : 1;
  if (fadeOut <= 0) return null;
  const W = el.w * width;
  const box: React.CSSProperties = {
    position: "absolute",
    left: el.x * width,
    top: el.y * height,
    width: W,
    opacity: fadeOut,
    transform: `translate(-50%, -50%) rotate(${el.rotate}deg)`,
  };

  switch (el.type) {
    case "title":
      return (
        <div style={{ ...box, display: "flex", flexDirection: "column", gap: 0 }}>
          {el.lines.map((line, i) => (
            <div key={i} style={{ marginTop: i ? -line.size * (1 - el.lineGap) : 0 }}>
              <Line line={line} f={lf - Math.round(line.at * fps)} fps={fps} glow={el.glow} align={el.align} />
            </div>
          ))}
        </div>
      );

    case "object": {
      const fl = floatOf(el, el.float, el.period, t);
      let tr = "";
      let op = 1;
      let extraBlur = 0;
      if (el.enter === "pop") {
        const p = ramp(f, k30(6, fps));
        tr = `scale(${0.4 + 0.6 * p})`;
        op = Math.min(1, p * 1.8);
      } else if (el.enter === "rise") {
        const p = ramp(f, k30(9, fps));
        tr = `translateY(${(1 - p) * height * 0.25}px)`;
        op = p;
      } else if (el.enter === "slideLeft" || el.enter === "slideRight") {
        const p = ramp(f, k30(7, fps));
        tr = `translateX(${(el.enter === "slideLeft" ? -1 : 1) * (1 - p) * width * 0.7}px)`;
      } else if (el.enter === "flyIn") {
        const p = ramp(f, k30(9, fps));
        tr = `scale(${2.4 - 1.4 * p})`;
        op = p;
        extraBlur = (1 - p) * 22;
      }
      const dim = el.dimAt !== undefined ? ramp(lf - Math.round(el.dimAt * fps), k30(10, fps)) : 0;
      const filters = [
        el.shadow ? "drop-shadow(0 26px 30px rgba(0,0,0,0.45))" : "",
        el.glowColor ? `drop-shadow(0 0 18px ${el.glowColor}) drop-shadow(0 0 40px ${el.glowColor}88)` : "",
        el.blur + extraBlur > 0 ? `blur(${el.blur + extraBlur}px)` : "",
        dim > 0 ? `grayscale(${dim}) brightness(${1 - 0.5 * dim})` : "",
      ].filter(Boolean);
      return (
        <div style={{ ...box, opacity: fadeOut * op, transform: `${box.transform} translateY(${fl.y}px) rotate(${fl.r}deg) ${tr}` }}>
          <Img src={staticFile(el.src)} style={{ width: "100%", display: "block", filter: filters.join(" ") || undefined }} />
        </div>
      );
    }

    case "tile": {
      const fl = floatOf(el, 6, 3.6, t);
      let tr = "";
      let op = 1;
      if (el.enter === "flip") {
        const p = ramp(f, k30(6, fps));
        tr = `perspective(900px) translateY(${(1 - p) * 120}px) rotateY(${(1 - p) * 90}deg)`;
        op = Math.min(1, p * 2);
      } else if (el.enter === "rise") {
        const p = ramp(f, k30(6, fps));
        tr = `translateY(${(1 - p) * 260}px)`;
        op = p;
      } else {
        const p = ramp(f, k30(5, fps));
        tr = `translateX(${(el.enter === "slideLeft" ? -1 : 1) * (1 - p) * width * 0.6}px)`;
      }
      return (
        <div style={{ ...box, height: W, opacity: fadeOut * op, transform: `${box.transform} translateY(${fl.y}px) ${tr}` }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(145deg, ${el.color}, ${el.color}cc)`,
              borderRadius: W * 0.07,
              boxShadow: "0 24px 40px rgba(0,0,0,0.35), inset 0 2px 0 rgba(255,255,255,0.25)",
            }}
          />
          <Img
            src={staticFile(el.src)}
            style={{ position: "absolute", left: "8%", top: "8%", width: "84%", height: "84%", objectFit: "contain", filter: "drop-shadow(0 12px 14px rgba(0,0,0,0.4))" }}
          />
        </div>
      );
    }

    case "pill": {
      const p = ramp(f, k30(4, fps));
      const d = (1 - p) * 70;
      const tr = el.from === "right" ? `translateX(${d}px)` : el.from === "left" ? `translateX(${-d}px)` : `translateY(${d}px)`;
      const pad = el.size * 0.55;
      return (
        <div style={{ ...box, width: "auto", opacity: fadeOut * p, transform: `${box.transform} ${tr}`, whiteSpace: "nowrap" }}>
          <div
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              gap: pad * 0.6,
              padding: `${pad * 0.42}px ${pad}px ${pad * 0.46}px ${el.icon ? el.size * 1.75 : pad}px`,
              borderRadius: 999,
              background: el.solid ? el.color : "rgba(8, 18, 28, 0.55)",
              border: el.solid ? "none" : `3px solid ${el.color}`,
              boxShadow: el.solid ? `0 8px 18px rgba(0,0,0,0.3)` : `0 0 16px ${el.color}aa, inset 0 0 14px ${el.color}55`,
              backdropFilter: el.solid ? undefined : "blur(10px)",
              fontFamily: F.sans,
              fontWeight: el.solid ? 800 : 700,
              fontSize: el.size,
              color: "#FFFFFF",
              textTransform: el.solid ? "uppercase" : undefined,
              letterSpacing: el.solid ? "0.04em" : "0.01em",
              textShadow: el.solid ? undefined : darkShadow,
            }}
          >
            {el.icon && (
              <Img
                src={staticFile(el.icon)}
                style={{ position: "absolute", left: -el.size * 0.35, top: "50%", width: el.size * 1.9, height: el.size * 1.9, objectFit: "contain", transform: "translateY(-50%)", filter: "drop-shadow(0 8px 10px rgba(0,0,0,0.45))" }}
              />
            )}
            {el.text}
          </div>
        </div>
      );
    }

    case "check": {
      const n = k30(3, fps);
      const s = f < n ? interpolate(f, [0, n], [0.3, 1.15]) : interpolate(f, [n, n + k30(2, fps)], [1.15, 1], { extrapolateRight: "clamp" });
      const color = el.color ?? (el.cross ? "#FF3B30" : "#3BE36B");
      const R = W / 2;
      const draw = ramp(f - 1, k30(5, fps));
      const mark = el.cross
        ? `M ${R * 0.62} ${R * 0.62} L ${R * 1.38} ${R * 1.38} M ${R * 1.38} ${R * 0.62} L ${R * 0.62} ${R * 1.38}`
        : `M ${R * 0.58} ${R * 1.02} L ${R * 0.88} ${R * 1.32} L ${R * 1.44} ${R * 0.7}`;
      const evo = evolvePath(draw, mark);
      return (
        <div style={{ ...box, height: undefined }}>
          <div style={{ width: W, height: W, margin: "0 auto", transform: `scale(${s})`, filter: `drop-shadow(0 0 12px ${color}) drop-shadow(0 0 28px ${color}88)` }}>
            <svg width={W} height={W}>
              <circle cx={R} cy={R} r={R * 0.86} fill="rgba(0,0,0,0.18)" stroke={color} strokeWidth={R * 0.13} />
              <path d={mark} fill="none" stroke={color} strokeWidth={R * 0.16} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={evo.strokeDasharray} strokeDashoffset={evo.strokeDashoffset} />
            </svg>
          </div>
          {el.lines.map((l, i) => {
            const offset = el.lines.slice(0, i).reduce((sum, prev) => sum + prev.size * 1.05, 0);
            const lp = ramp(lf - Math.round(l.at * fps), k30(4, fps));
            if (lp <= 0) return null;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: -width,
                  right: -width,
                  top: W * 1.02 + offset,
                  textAlign: "center",
                  fontFamily: F.sans,
                  fontWeight: 800,
                  fontSize: l.size,
                  lineHeight: 1,
                  color: "#FFFFFF",
                  opacity: lp,
                  transform: `translateY(${(1 - lp) * 24}px)`,
                  textShadow: `${darkShadow}, 0 0 20px rgba(255,255,255,0.35)`,
                }}
              >
                {l.text}
              </div>
            );
          })}
        </div>
      );
    }

    case "ring": {
      const R = W / 2;
      const p = ramp(f, k30(8, fps));
      const circ = 2 * Math.PI * R * 0.8;
      const spin = (t * 18) % 360;
      return (
        <div style={{ ...box, height: W }}>
          {el.icon && (
            <Img
              src={staticFile(el.icon)}
              style={{ position: "absolute", left: "50%", top: "50%", height: W * 0.72, transform: "translate(-50%,-50%)", opacity: 0.55 * p, filter: `drop-shadow(0 0 14px ${el.color})` }}
            />
          )}
          <svg width={W} height={W} style={{ position: "absolute", inset: 0, transform: `rotate(${-90 + spin}deg)`, filter: `drop-shadow(0 0 10px ${el.color}) drop-shadow(0 0 24px ${el.color}aa)` }}>
            <circle cx={R} cy={R} r={R * 0.8} fill="none" stroke={el.color} strokeWidth={R * 0.07} strokeLinecap="round" strokeDasharray={`${circ * 0.83 * p} ${circ}`} />
            <circle cx={R} cy={R} r={R * 0.92} fill="none" stroke={el.color} strokeOpacity={0.35 * p} strokeWidth={2} strokeDasharray="6 14" />
          </svg>
        </div>
      );
    }

    case "callout": {
      // text sits with its left edge at x; the line underlines it then elbows to `to`
      const first = Math.round(el.words[0].at * fps);
      const lineP = ramp(lf - first, k30(9, fps), inOut);
      const x0 = el.x * width;
      const y0 = el.y * height + el.size * 0.7;
      const x1 = (el.x + el.w) * width;
      const [tx, ty] = [el.to[0] * width, el.to[1] * height];
      const d = `M ${x0} ${y0} L ${x1} ${y0} L ${tx} ${ty}`;
      const evo = evolvePath(lineP, d);
      return (
        <div style={{ position: "absolute", inset: 0, opacity: fadeOut }}>
          <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
            <path d={d} fill="none" stroke="#111" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={evo.strokeDasharray} strokeDashoffset={evo.strokeDashoffset} />
            <circle cx={tx} cy={ty} r={12 * ramp(lf - first - k30(8, fps), k30(4, fps))} fill={el.color} style={{ filter: `drop-shadow(0 0 10px ${el.color})` }} />
          </svg>
          <div style={{ position: "absolute", left: x0, top: el.y * height - el.size * 0.5, display: "flex", gap: el.size * 0.28, whiteSpace: "nowrap" }}>
            {el.words.map((w, i) => {
              const wf = lf - Math.round(w.at * fps);
              if (wf < 0) return null;
              const p = ramp(wf, k30(3, fps));
              return (
                <span
                  key={i}
                  style={{
                    fontFamily: F.sans,
                    fontWeight: 800,
                    fontSize: el.size,
                    textTransform: "uppercase",
                    color: el.color,
                    opacity: 0.3 + 0.7 * p,
                    transform: `translateX(${(1 - p) * 18}px)`,
                    textShadow: glowShadow(el.color, 0.6),
                    display: "inline-block",
                  }}
                >
                  {w.text}
                </span>
              );
            })}
          </div>
        </div>
      );
    }

    case "video":
      return (
        <div style={{ position: "absolute", left: (el.x - el.w / 2) * width, top: (el.y - el.h / 2) * height, width: W, height: el.h * height, opacity: fadeOut }}>
          <OffthreadVideo muted src={staticFile(el.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      );

    case "form": {
      const p = ramp(f, k30(8, fps));
      const H = W * 0.62;
      const fillF = lf - Math.round(el.fillAt * fps);
      const bounce = Math.abs(Math.sin((t * Math.PI * 2) / 0.7)) * 26;
      const field = (i: number) => {
        const fp = ramp(fillF - i * k30(8, fps), k30(12, fps), inOut);
        return (
          <div key={i} style={{ height: H * 0.15, borderRadius: 14, background: "rgba(255,255,255,0.10)", border: "2px solid rgba(255,255,255,0.28)", marginBottom: H * 0.06, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 18, top: "50%", height: 6, width: `${fp * (i ? 46 : 62)}%`, borderRadius: 3, background: "#FFFFFF", transform: "translateY(-50%)" }} />
          </div>
        );
      };
      return (
        <div style={{ ...box, height: H, opacity: fadeOut * p, transform: `${box.transform} translateY(${(1 - p) * 200}px)` }}>
          <svg width={90} height={70} style={{ position: "absolute", left: "50%", top: -110 + bounce, transform: "translateX(-50%)", filter: `drop-shadow(0 0 12px ${el.color})` }}>
            <path d="M 10 12 L 45 52 L 80 12" fill="none" stroke={el.color} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 34,
              padding: `${H * 0.1}px ${W * 0.08}px`,
              background: "rgba(10, 20, 30, 0.55)",
              backdropFilter: "blur(14px)",
              border: `3px solid ${el.color}`,
              boxShadow: `0 0 26px ${el.color}88, 0 30px 50px rgba(0,0,0,0.45)`,
            }}
          >
            {field(0)}
            {field(1)}
            <div
              style={{
                height: H * 0.2,
                borderRadius: 999,
                background: el.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: F.sans,
                fontWeight: 800,
                fontSize: H * 0.1,
                letterSpacing: "0.06em",
                color: "#FFFFFF",
                boxShadow: `0 0 20px ${el.color}`,
              }}
            >
              CALL BACK
            </div>
          </div>
        </div>
      );
    }
  }
};
