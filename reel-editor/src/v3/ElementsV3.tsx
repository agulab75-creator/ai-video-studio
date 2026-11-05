import React from "react";
import { Easing, Img, interpolate, staticFile } from "remotion";
import type { ElementV3 } from "./schema";
import { C, F, glow } from "./theme";

// Elements for the v3 (rovix-comparison) renderer. Everything floats gently (slow sine bob), nothing shakes.
// Times inside an element are seconds after its scene starts.

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const out = Easing.out(Easing.cubic);
const inOut = Easing.inOut(Easing.cubic);
const f30 = (n: number, fps: number) => (n * fps) / 30;

type P = { el: ElementV3; t: number; fps: number; W: number; H: number; segDur: number };

/** Deterministic pseudo-random numbers. */
const rng = (seed: number) => {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};

/** Common entrance (blur-fade / pop / rise / slide / drop) and exit (blur-fade at `until`). */
const envelope = (el: ElementV3, t: number, fps: number, W: number, enter = "blur") => {
  const lf = (t - el.at) * fps;
  const n = f30(enter === "pop" ? 7 : 9, fps);
  const p = interpolate(lf, [0, n], [0, 1], { ...clamp, easing: out });
  let tx = 0;
  let ty = 0;
  let s = 1;
  let blur = 0;
  if (enter === "blur") (blur = (1 - p) * 16), (s = 0.94 + 0.06 * p);
  if (enter === "pop") s = interpolate(lf, [0, n], [0.55, 1], { ...clamp, easing: Easing.out(Easing.back(1.2)) });
  if (enter === "rise") (ty = (1 - p) * 90), (blur = (1 - p) * 8);
  if (enter === "drop") (ty = -(1 - p) * 140), (blur = (1 - p) * 6);
  if (enter === "slideLeft") tx = (1 - p) * W * 0.6;
  if (enter === "slideRight") tx = -(1 - p) * W * 0.6;
  let a = enter === "none" ? (lf >= 0 ? 1 : 0) : p;
  if (el.until !== undefined) {
    const q = interpolate((t - el.until) * fps, [0, f30(5, fps)], [0, 1], clamp);
    a *= 1 - q;
    blur += q * 14;
  }
  return { a: lf < 0 ? 0 : a, tx, ty, s, blur };
};

const floatY = (t: number, amp: number, period: number, phase = 0) => amp * Math.sin((2 * Math.PI * t) / period + phase);

const Centered: React.FC<{ x: number; y: number; W: number; H: number; w: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  x,
  y,
  W,
  H,
  w,
  style,
  children,
}) => (
  <div style={{ position: "absolute", left: x * W, top: y * H, width: w * W, transform: "translate(-50%, -50%)", ...style }}>{children}</div>
);

/** Brass coin with a stamped number (embossed in dark brass, a thin ring in the group colour). */
const CoinFace: React.FC<{ src: string; n?: number; size: number; color: string }> = ({ src, n, size, color }) => (
  <div style={{ position: "relative", width: size, height: size }}>
    <div style={{ position: "absolute", inset: size * 0.02, borderRadius: "50%", boxShadow: `0 0 0 ${size * 0.025}px ${color}, ${glow(color, 1.1)}` }} />
    <Img src={staticFile(src)} style={{ position: "absolute", inset: 0, width: size, height: size, objectFit: "contain", filter: "drop-shadow(0 14px 18px rgba(60,35,10,0.35))" }} />
    {n !== undefined && (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: F.serif,
          fontWeight: 700,
          fontSize: size * 0.64,
          lineHeight: 1,
          paddingBottom: size * 0.05,
          color: "#4A2C08",
          textShadow: `0 ${size * 0.012}px 0 rgba(255,236,190,0.8), 0 -${size * 0.012}px 1px rgba(40,20,0,0.5)`,
        }}
      >
        {n}
      </div>
    )}
  </div>
);

export const ElementV3View: React.FC<P> = ({ el, t, fps, W, H, segDur }) => {
  switch (el.type) {
    case "object": {
      const e = envelope(el, t, fps, W, el.enter);
      let x = el.x;
      let y = el.y;
      if (el.move) {
        const m = interpolate((t - el.move.at) * fps, [0, el.move.dur * fps], [0, 1], { ...clamp, easing: out });
        x += (el.move.to[0] - el.x) * m;
        y += (el.move.to[1] - el.y) * m;
      }
      let rot = el.rotate + 0.6 * Math.sin((2 * Math.PI * t) / (el.period * 1.3));
      if (el.flip) rot += el.flip.deg * interpolate((t - el.flip.at) * fps, [0, el.flip.dur * fps], [0, 1], { ...clamp, easing: inOut });
      const push = el.scaleTo ? 1 + (el.scaleTo - 1) * interpolate(t, [el.at, segDur], [0, 1], clamp) : 1;
      const fy = floatY(t, el.float, el.period);
      return (
        <Centered x={x} y={y} W={W} H={H} w={el.w} style={{ zIndex: el.z, opacity: e.a }}>
          {el.glow && (
            <div
              style={{
                position: "absolute",
                left: "-35%",
                right: "-35%",
                top: "-25%",
                bottom: "-25%",
                background: `radial-gradient(closest-side, ${el.glow}CC, ${el.glow}55 45%, transparent 75%)`,
                transform: `scale(${0.9 + 0.08 * Math.sin(t * 2.1)})`,
              }}
            />
          )}
          <Img
            src={staticFile(el.src)}
            style={{
              width: "100%",
              display: "block",
              transform: `translate(${e.tx}px, ${e.ty + fy}px) scale(${e.s * push}) rotate(${rot}deg)`,

              filter: [
                el.shadow ? "drop-shadow(0 24px 30px rgba(60,35,10,0.30))" : "",
                e.blur + el.blur > 0 ? `blur(${e.blur + el.blur}px)` : ""
              ].join(" ").trim() || undefined,

              translate: "34.2px 61.5px"
            }}
          />
        </Centered>
      );
    }

    case "coins": {
      const r = rng(el.seed);
      const coins = Array.from({ length: el.count }, (_, i) => ({ i, a: r(), b: r(), c: r(), d: r() }));
      const size = el.size * W;
      return (
        <div style={{ position: "absolute", inset: 0, zIndex: el.z }}>
          {coins.map(({ i, a, b, c, d }) => {
            let x = 0;
            let y = 0;
            let rot = 0;
            let op = 1;
            let blur = 0;
            let s = 0.7 + 0.5 * c;
            if (el.mode === "spill") {
              const t0 = el.at + (i / el.count) * el.dur * 0.7;
              const p = interpolate(t - t0, [0, 0.55], [0, 1], clamp);
              if (t < t0) return null;
              const tx = el.to[0] + (a - 0.5) * 0.5;
              const ty = el.to[1] + (b - 0.5) * 0.06;
              x = el.from[0] + (tx - el.from[0]) * p;
              y = el.from[1] + (ty - el.from[1]) * Easing.in(Easing.quad)(p) - 0.12 * Math.sin(Math.PI * p);
              rot = (d - 0.5) * 540 * p + (d - 0.5) * 30;
              blur = p < 1 ? 1.5 : 0;
            } else if (el.mode === "pour") {
              // a looping stream: each coin repeats every `dur` seconds until `until`
              const phase = (i / el.count) * el.dur;
              const lt = t - el.at - phase;
              if (lt < 0 || (el.until !== undefined && t > el.until + 0.6)) return null;
              const p = (lt % el.dur) / el.dur;
              if (el.until !== undefined && t - (lt % el.dur) > el.until) return null;
              x = el.from[0] + (a - 0.5) * 0.06 + (el.to[0] - el.from[0]) * p;
              y = el.from[1] + (el.to[1] - el.from[1]) * Easing.in(Easing.quad)(p);
              rot = (d - 0.5) * 360 * p;
              op = interpolate(p, [0, 0.1, 0.85, 1], [0, 1, 1, 0]);
              s *= 1 - 0.35 * p;
            } else {
              // fly: rush past from `from` to `to`, big and motion-blurred
              const t0 = el.at + (i / el.count) * el.dur;
              const p = interpolate(t - t0, [0, 0.75], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
              if (t < t0 || p >= 1) return null;
              x = el.from[0] + (el.to[0] - el.from[0]) * p;
              y = el.from[1] + (b - 0.5) * 0.7 + (el.to[1] - el.from[1]) * p;
              rot = (d - 0.5) * 200 + 120 * p;
              s = 0.8 + 1.2 * c;
              blur = 3 + 9 * c;
            }
            return (
              <Img
                key={i}
                src={staticFile(el.src)}
                style={{
                  position: "absolute",
                  left: x * W - (size * s) / 2,
                  top: y * H - (size * s) / 2,
                  width: size * s,
                  opacity: op,
                  transform: `rotate(${rot}deg)`,
                  filter: `drop-shadow(0 8px 10px rgba(60,35,10,0.3))${blur ? ` blur(${blur}px)` : ""}`,
                }}
              />
            );
          })}
        </div>
      );
    }

    case "coinRow": {
      const e = envelope(el, t, fps, W, "blur");
      const n = el.numbers.length;
      const size = ((el.w * W) / n) * 0.86;
      const labelA = interpolate((t - el.at) * fps, [0, f30(8, fps)], [0, 1], { ...clamp, easing: out });
      return (
        <Centered x={el.x} y={el.y} W={W} H={H} w={el.w} style={{ zIndex: el.z, opacity: e.a, filter: e.blur ? `blur(${e.blur}px)` : undefined }}>
          <div
            style={{
              textAlign: "center",
              fontFamily: F.sans,
              fontWeight: 700,
              fontSize: 40,
              letterSpacing: "0.42em",
              color: el.color,
              marginBottom: 34,
              opacity: labelA,
              transform: `translateY(${(1 - labelA) * 16}px)`,
            }}
          >
            {el.label}
            <div style={{ margin: "14px auto 0", height: 4, width: 110 * labelA, background: el.color, borderRadius: 2 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {el.numbers.map((num, i) => {
              const lf = (t - el.times[i]) * fps;
              if (lf < 0) return <div key={i} style={{ width: size, height: size }} />;
              const p = interpolate(lf, [0, f30(6, fps)], [0, 1], { ...clamp, easing: out });
              const ring = interpolate(lf, [0, f30(14, fps)], [0, 1], clamp);
              return (
                <div key={i} style={{ position: "relative", width: size, height: size }}>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "50%",
                      border: `4px solid ${el.color}`,
                      transform: `scale(${1 + ring * 0.45})`,
                      opacity: 0.8 * (1 - ring),
                    }}
                  />
                  <div
                    style={{
                      transform: `translateY(${-(1 - p) * 120 + floatY(t, 6, 3.2, i * 1.3)}px) scale(${1.18 - 0.18 * p})`,
                      opacity: p,
                      filter: p < 1 ? `blur(${(1 - p) * 6}px)` : undefined,
                    }}
                  >
                    <CoinFace src={el.src} n={num} size={size} color={el.color} />
                  </div>
                </div>
              );
            })}
          </div>
        </Centered>
      );
    }

    case "stack": {
      const e = envelope(el, t, fps, W, "blur");
      const p = interpolate(t, [el.at + 0.3, el.at + 0.3 + el.dur], [0, 1], clamp);
      const step = Math.floor(p * el.steps);
      const inStep = interpolate((p * el.steps - step) * (el.dur / el.steps) * fps, [0, f30(5, fps)], [0, 1], { ...clamp, easing: out });
      const shown = 0.34 + (0.66 * Math.min(el.steps, step + (p >= 1 ? 0 : inStep))) / el.steps;
      return (
        <Centered x={el.x} y={el.y} W={W} H={H} w={el.w} style={{ zIndex: el.z, opacity: e.a, filter: e.blur ? `blur(${e.blur}px)` : undefined }}>
          {/* shadow on the wrapper: a drop-shadow on the clipped img itself draws a box */}
          <div style={{ transform: `translateY(${floatY(t, 5, 3.6)}px)`, filter: "drop-shadow(0 26px 30px rgba(60,35,10,0.32))" }}>
            <Img src={staticFile(el.src)} style={{ width: "100%", display: "block", clipPath: `inset(${(1 - shown) * 100}% 0 0 0)` }} />
          </div>
        </Centered>
      );
    }

    case "tag": {
      const e = envelope(el, t, fps, W, "slideLeft");
      return (
        <Centered x={el.x} y={el.y} W={W} H={H} w={el.w} style={{ zIndex: el.z, opacity: e.a }}>
          <div
            style={{
              transform: `translateX(${e.tx}px) translateY(${floatY(t, 5, 3.4)}px) rotate(${el.rotate + 0.5 * Math.sin(t * 1.4)}deg)`,
              background: `linear-gradient(180deg, ${C.paper}, ${C.paperWarm})`,
              border: `2px solid ${C.paperEdge}`,
              borderRadius: 14,
              padding: "22px 34px 22px 64px",
              boxShadow: "0 18px 30px rgba(40,20,5,0.28)",
              position: "relative",
            }}
          >
            <div style={{ position: "absolute", left: 24, top: "50%", width: 18, height: 18, marginTop: -9, borderRadius: "50%", background: C.paperEdge, boxShadow: "inset 0 2px 3px rgba(0,0,0,0.25)" }} />
            <div style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 44, letterSpacing: "0.32em", color: el.color, whiteSpace: "nowrap" }}>{el.text}</div>
          </div>
        </Centered>
      );
    }

    case "pattern": {
      const colW = (el.w * W) / el.groups.length;
      const cw = colW * 0.8;
      const ch = cw * 1.05;
      const paths: Record<string, string> = {
        rise: `M 10 ${ch - 20} C ${cw * 0.35} ${ch - 30}, ${cw * 0.55} ${ch * 0.55}, ${cw - 14} 24`,
        steady: `M 10 ${ch * 0.62} C ${cw * 0.3} ${ch * 0.55}, ${cw * 0.6} ${ch * 0.5}, ${cw - 14} ${ch * 0.38}`,
        pause: `M 10 ${ch * 0.6} L ${cw * 0.62} ${ch * 0.6}`,
      };
      return (
        <Centered x={el.x} y={el.y} W={W} H={H} w={el.w} style={{ zIndex: el.z }}>
          <div style={{ display: "flex" }}>
            {el.groups.map((g, i) => {
              const lf = (t - g.at) * fps;
              const a = interpolate(lf, [0, f30(8, fps)], [0, 1], { ...clamp, easing: out });
              const draw = interpolate(lf, [f30(6, fps), f30(30, fps)], [0, 1], { ...clamp, easing: inOut });
              const coin = colW * 0.27;
              return (
                <div key={i} style={{ width: colW, display: "flex", flexDirection: "column", alignItems: "center", opacity: a, transform: `translateY(${(1 - a) * 50 + floatY(t, 5, 3.4, i)}px)`, filter: a < 1 ? `blur(${(1 - a) * 10}px)` : undefined }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 26 }}>
                    {g.numbers.map((n) => (
                      <CoinFace key={n} src={el.src} n={n} size={coin} color={g.color} />
                    ))}
                  </div>
                  <svg width={cw} height={ch} style={{ overflow: "visible" }}>
                    <rect x={0} y={0} width={cw} height={ch} rx={22} fill="rgba(255,252,245,0.7)" stroke={`${g.color}55`} strokeWidth={2} />
                    <path d={paths[g.shape]} fill="none" stroke={g.color} strokeWidth={12} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} style={{ filter: `drop-shadow(0 0 8px ${g.color}88)` }} />
                    {g.shape === "pause" && draw >= 1 && (
                      <g opacity={interpolate(lf, [f30(30, fps), f30(36, fps)], [0, 1], clamp)}>
                        <rect x={cw * 0.72} y={ch * 0.47} width={14} height={ch * 0.26} rx={5} fill={g.color} />
                        <rect x={cw * 0.72 + 30} y={ch * 0.47} width={14} height={ch * 0.26} rx={5} fill={g.color} />
                      </g>
                    )}
                    {g.shape !== "pause" && draw >= 1 && <circle cx={cw - 14} cy={g.shape === "rise" ? 24 : ch * 0.38} r={14} fill={g.color} />}
                  </svg>
                </div>
              );
            })}
          </div>
        </Centered>
      );
    }

    case "cta": {
      const e = envelope(el, t, fps, W, "rise");
      const pressF = (t - el.followAt) * fps;
      const btnA = interpolate(pressF, [-f30(8, fps), 0], [0, 1], { ...clamp, easing: out });
      const press = pressF < 0 ? 1 : interpolate(pressF, [0, f30(3, fps), f30(8, fps)], [1, 0.9, 1], clamp);
      const done = pressF > f30(3, fps);
      return (
        <Centered x={el.x} y={el.y} W={W} H={H} w={el.w} style={{ zIndex: el.z, opacity: e.a }}>
          <div style={{ transform: `translateY(${e.ty + floatY(t, 5, 3.6)}px)`, filter: e.blur ? `blur(${e.blur}px)` : undefined }}>
            <div
              style={{
                background: "rgba(255,251,243,0.94)",
                borderRadius: 40,
                padding: "30px 36px 34px",
                boxShadow: "0 24px 50px rgba(40,20,5,0.35)",
                border: `2px solid ${C.paperEdge}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
                <svg width={46} height={46} viewBox="0 0 24 24">
                  <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" fill={C.gold} />
                </svg>
                <div style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 36, color: C.ink }}>Comment</div>
              </div>
              <div style={{ display: "flex", gap: 16, justifyContent: "space-between" }}>
                {el.chips.map((c, i) => {
                  const a = interpolate((t - el.at - 0.25 - i * 0.14) * fps, [0, f30(6, fps)], [0, 1], { ...clamp, easing: out });
                  return (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        textAlign: "center",
                        padding: "14px 0",
                        borderRadius: 999,
                        background: `${c.color}1F`,
                        border: `3px solid ${c.color}`,
                        fontFamily: F.serif,
                        fontWeight: 700,
                        fontSize: 48,
                        color: c.color,
                        opacity: a,
                        transform: `translateX(${(1 - a) * 60}px)`,
                      }}
                    >
                      {c.text}
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 26, opacity: btnA, transform: `translateY(${(1 - btnA) * 30}px)` }}>
              <div
                style={{
                  transform: `scale(${press})`,
                  background: done ? C.paper : C.maroon,
                  color: done ? C.maroon : "#FFF6E8",
                  border: `3px solid ${C.maroon}`,
                  borderRadius: 999,
                  padding: "18px 64px",
                  fontFamily: F.sans,
                  fontWeight: 700,
                  fontSize: 42,
                  letterSpacing: "0.04em",
                  boxShadow: "0 14px 28px rgba(90,20,20,0.3)",
                }}
              >
                {done ? "Following ✓" : "Follow"}
              </div>
            </div>
          </div>
        </Centered>
      );
    }

    case "tick": {
      const lf = (t - el.at) * fps;
      const draw = interpolate(lf, [0, f30(9, fps)], [0, 1], { ...clamp, easing: out });
      const e = envelope(el, t, fps, W, "none");
      const s = el.w * W;
      return (
        <Centered x={el.x} y={el.y} W={W} H={H} w={el.w} style={{ zIndex: el.z, opacity: e.a }}>
          <svg width={s} height={s} viewBox="0 0 100 100" style={{ transform: `translateY(${floatY(t, 4, 3)}px)`, overflow: "visible" }}>
            <circle cx={50} cy={50} r={46} fill="rgba(255,250,240,0.92)" stroke={el.color} strokeWidth={5} opacity={Math.min(1, draw * 2)} />
            <path d="M 28 52 L 44 67 L 73 35" fill="none" stroke={el.color} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
          </svg>
        </Centered>
      );
    }

    case "qmark": {
      const e = envelope(el, t, fps, W, "rise");
      return (
        <Centered x={el.x} y={el.y} W={W} H={H} w={el.w} style={{ zIndex: el.z, opacity: e.a, textAlign: "center" }}>
          <div
            style={{
              fontFamily: F.serif,
              fontStyle: "italic",
              fontWeight: 700,
              fontSize: el.size,
              lineHeight: 1,
              color: el.color,
              textShadow: glow(el.color, 1.4),
              transform: `translateY(${e.ty + floatY(t, 8, 3.2)}px)`,
              filter: e.blur ? `blur(${e.blur}px)` : undefined,
            }}
          >
            ?
          </div>
        </Centered>
      );
    }

    case "coinFlip": {
      const e = envelope(el, t, fps, W, "blur");
      const cols = 3;
      const size = ((el.w * W) / cols) * 0.8;
      return (
        <Centered x={el.x} y={el.y} W={W} H={H} w={el.w} style={{ zIndex: el.z, opacity: e.a, filter: e.blur ? `blur(${e.blur}px)` : undefined }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, rowGap: size * 0.2, justifyItems: "center" }}>
            {el.numbers.map((n, i) => {
              const lf = (t - el.flipAt - i * el.stagger) * fps;
              const p = interpolate(lf, [0, f30(8, fps)], [0, 1], { ...clamp, easing: inOut });
              const showBack = p >= 0.5;
              const sx = Math.abs(Math.cos(p * Math.PI));
              return (
                <div key={i} style={{ transform: `translateY(${floatY(t, 5, 3.3, i * 0.7)}px) scaleX(${Math.max(0.02, sx)})` }}>
                  {showBack ? (
                    <CoinFace src={el.back} size={size} color={C.gold} />
                  ) : (
                    <CoinFace src={el.front} n={n} size={size} color={el.colors[i]} />
                  )}
                </div>
              );
            })}
          </div>
        </Centered>
      );
    }
  }
};
