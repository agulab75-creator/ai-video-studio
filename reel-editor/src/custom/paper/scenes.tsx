import React from "react";
import { Easing, Img, interpolate, staticFile } from "remotion";
import { Pack, PACK_ASPECT } from "./Pack";
import { At, backOut, boil, Cut, CutLetters, easeIn, fibreBg, FONT, Marker, P, PenCircle, PenTick, prog, rnd, Stage, Stamp, Sticker } from "./kit";

// Paper-cut scenes for the sugar-free reel. Each one draws on a 1080x1920 stage; every time in props
// is seconds from the segment start (the builder script computes them from captions.json).

type Base = { localFrame: number; fps: number; width: number };
const A = (id: string) => `projects/sugar-free/assets/${id}.png`;

// ---------------------------------------------------------------- hook
export const PaperHook: React.FC<Base & { badgeAt: number; healthyAt: number; ripAt: number }> = ({
  localFrame: f,
  fps,
  width,
  badgeAt,
  healthyAt,
  ripAt,
}) => {
  const slide = prog(f, fps, -0.12, 0.42, Easing.out(Easing.cubic));
  const b = boil(5, f, 1.2);
  return (
    <Stage width={width}>
      <At x={1290 - 400 * slide + b.x} y={640 + b.y}>
        <div style={{ transform: `rotate(${14 - 8 * slide}deg)` }}>
          <Pack w={280} f={f} fps={fps} badgeAt={badgeAt} />
        </div>
      </At>
      <At x={345} y={330}>
        <CutLetters text="HEALTHY" f={f} fps={fps} at={healthyAt} stagger={0.035} size={98} seed={9}
          colors={[P.cream, P.green, P.yellow, P.cream, P.blue]} ripAt={ripAt} />
      </At>
      {f >= (ripAt + 0.12) * fps && (
        <At x={330} y={540}>
          <div style={{ fontFamily: FONT.hand, fontSize: 92, color: P.red, transform: `rotate(-4deg) scale(${prog(f, fps, ripAt + 0.12, 0.15, backOut)})`, fontWeight: 700 }}>
            nahi hota!
          </div>
        </At>
      )}
    </Stage>
  );
};

// ---------------------------------------------------------------- nutrition label (hero object)
const LW = 820;
const LH = 960;
const ROWS = { serving: 255, carbs: 410, sugars: 515, source: 665 } as const;
type Row = keyof typeof ROWS;

type Shot = { at: number; z: number; row?: Row };
const shotXf = (s: Shot) => {
  if (!s.row || s.z === 1) return { tx: 0, ty: 0, z: s.z };
  const ry = ROWS[s.row];
  return { tx: 410 - 410 * s.z, ty: 700 - 280 - ry * s.z, z: s.z };
};

export const PaperLabel: React.FC<
  Base & {
    mode: "sugar" | "carbs" | "check";
    shots?: Shot[];
    cubeAt?: number;
    shrinkAt?: number;
    markAt?: number;
    noteAt?: number;
    barAt?: number;
    circleAt?: number;
    ticks?: { row: Row; at: number }[];
  }
> = ({ localFrame: f, fps, width, mode, shots = [{ at: 0, z: 1 }], cubeAt = 0, shrinkAt = 0, markAt = 0, noteAt = 0, barAt = 0, circleAt = 0, ticks = [] }) => {
  // camera: hold each shot, move to the next over 0.4 s
  let cam = shotXf(shots[0]);
  for (let i = 1; i < shots.length; i++) {
    const p = prog(f, fps, shots[i].at, 0.4, Easing.inOut(Easing.cubic));
    if (p <= 0) break;
    const n = shotXf(shots[i]);
    cam = { tx: cam.tx + (n.tx - cam.tx) * p, ty: cam.ty + (n.ty - cam.ty) * p, z: cam.z + (n.z - cam.z) * p };
  }
  const b = boil(17, f, 1);
  const text = (t: string, size: number, weight = 700, indent = 0): React.CSSProperties => ({
    position: "absolute",
    left: 40 + indent,
    fontFamily: FONT.sans,
    fontWeight: weight,
    fontSize: size,
    color: P.ink,
    lineHeight: 1,
  });
  const rule = (top: number, h: number) => <div style={{ position: "absolute", left: 36, right: 36, top, height: h, background: P.ink }} />;
  const rowText = (row: Row, label: string, weight = 700, indent = 0, size = 48) => (
    <div style={{ ...text(label, size, weight, indent), top: ROWS[row] - size / 2 }}>{label}</div>
  );

  const sugarBar = mode === "sugar" ? 0 : 1; // the sugar row keeps a tiny bar once the cube has gone
  const carbP = mode === "carbs" ? prog(f, fps, barAt, 0.5, Easing.out(Easing.cubic)) : mode === "check" ? 1 : 0;
  const cubeIn = prog(f, fps, cubeAt, 0.18, backOut);
  const cubeShrink = prog(f, fps, shrinkAt, 0.45, Easing.inOut(Easing.cubic));
  const cubeSize = 200 - 168 * cubeShrink;

  return (
    <Stage width={width}>
      <div
        style={{
          position: "absolute",
          left: (1080 - LW) / 2 + b.x,
          top: 280 + b.y,
          width: LW,
          height: LH,
          transformOrigin: "0 0",
          transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.z}) rotate(${b.r - 1}deg)`,
        }}
      >
        <Cut color={P.cream} seed={23} jag={0.6} shadow={2} style={{ position: "absolute", inset: 0 }} />
        <div style={{ ...text("", 104, 800), top: 48, letterSpacing: "-0.02em" }}>Nutrition Facts</div>
        {rule(176, 14)}
        <div style={{ position: "absolute", left: 40, top: ROWS.serving - 37 }}>
          {ticks.find((t) => t.row === "serving") && <Marker f={f} fps={fps} at={ticks.find((t) => t.row === "serving")!.at} w={740} h={74} />}
        </div>
        {rowText("serving", "Serving size", 800)}
        {rule(306, 12)}
        <div style={{ ...text("", 30, 600), top: 330, color: "rgba(13,25,18,0.6)" }}>Amount per serving</div>
        <div style={{ position: "absolute", left: 40, top: ROWS.carbs - 37 }}>
          {ticks.find((t) => t.row === "carbs") && <Marker f={f} fps={fps} at={ticks.find((t) => t.row === "carbs")!.at} w={740} h={74} />}
        </div>
        {rowText("carbs", "Total Carbohydrate", 800)}
        {rule(462, 3)}
        <div style={{ position: "absolute", left: 40, top: ROWS.sugars - 37 }}>
          {mode === "sugar" && <Marker f={f} fps={fps} at={markAt} w={740} h={74} />}
        </div>
        {rowText("sugars", "Total Sugars", 600, 40)}
        {rule(566, 14)}
        <div style={{ position: "absolute", left: 40, top: ROWS.source - 37 }}>
          {ticks.find((t) => t.row === "source") && <Marker f={f} fps={fps} at={ticks.find((t) => t.row === "source")!.at} w={740} h={74} />}
        </div>
        {rowText("source", "Ingredients", 800)}
        <div style={{ ...text("", 34, 600), top: ROWS.source - 15, left: 330, color: "rgba(13,25,18,0.6)" }}>(carb source)</div>
        <div style={{ position: "absolute", left: 40, right: 40, top: 730, height: 190, background: "repeating-linear-gradient(to bottom, rgba(13,25,18,0.28) 0 7px, transparent 7px 30px)", clipPath: "polygon(0 0, 100% 0, 100% 80%, 62% 80%, 62% 100%, 0 100%)" }} />

        {/* sugar bar: tiny */}
        {sugarBar > 0 && <div style={{ position: "absolute", left: 545, top: ROWS.sugars - 16, width: 22, height: 32, ...fibreBg(P.green), borderRadius: 4 }} />}
        {/* carb bar: a flap that unfolds and runs long */}
        {carbP > 0 && (
          <div style={{ position: "absolute", left: 545, top: ROWS.carbs - 24, perspective: 600 }}>
            <div
              style={{
                width: 22 + 213 * carbP,
                height: 48,
                ...fibreBg(P.red),
                borderRadius: 4,
                transformOrigin: "0 50%",
                transform: `rotateY(${(1 - Math.min(1, carbP * 2.5)) * 80}deg)`,
                boxShadow: "0 5px 8px rgba(0,0,0,0.25)",
              }}
            />
          </div>
        )}
        {/* the sugar cube that shrinks to almost nothing */}
        {mode === "sugar" && cubeIn > 0 && (
          <div style={{ position: "absolute", left: 660 - cubeSize / 2, top: ROWS.sugars - cubeSize / 2, transform: `scale(${cubeIn})` }}>
            <Sticker src={A("sugar_cube")} width={cubeSize} border={cubeSize > 80 ? 5 : 3} />
          </div>
        )}
        {mode === "sugar" && f >= noteAt * fps && (
          <div style={{ position: "absolute", left: 420, top: ROWS.sugars + 46, fontFamily: FONT.hand, fontWeight: 700, fontSize: 64, color: P.orange, transform: `rotate(-5deg) scale(${prog(f, fps, noteAt, 0.15, backOut)})`, transformOrigin: "0 50%" }}>
            bahut kam!
          </div>
        )}
        {mode === "carbs" && (
          <div style={{ position: "absolute", left: 10, top: ROWS.carbs - 62 }}>
            <PenCircle f={f} fps={fps} at={circleAt} w={800} h={124} />
          </div>
        )}
        {mode === "carbs" && f >= (circleAt + 0.3) * fps && (
          <div style={{ position: "absolute", left: 450, top: 300, fontFamily: FONT.hand, fontWeight: 700, fontSize: 64, color: P.red, transform: `rotate(-6deg) scale(${prog(f, fps, circleAt + 0.3, 0.15, backOut)})`, transformOrigin: "0 50%", whiteSpace: "nowrap" }}>
            ≠ low carb
          </div>
        )}
        {ticks.map((t) => (
          <div key={t.row} style={{ position: "absolute", left: 770, top: ROWS[t.row] - 70 }}>
            <PenTick f={f} fps={fps} at={t.at + 0.12} size={100} />
          </div>
        ))}
      </div>
    </Stage>
  );
};

// ---------------------------------------------------------------- carb stack
const BLOCK_W = 230;
const BLOCK_H = 100;
const STACK_X = 300;
const blockY = (i: number) => 1110 - i * (BLOCK_H + 6);
const TIERS = {
  low: { color: P.green, title: "LOW", sub: "~5g", blocks: [0, 0] },
  mod: { color: P.orange, title: "MODERATE", sub: "10–15g", blocks: [1, 2] },
  high: { color: P.red, title: "KAAFI ZYADA", sub: "20g+", blocks: [3, 5] },
} as const;

export const CarbStack: React.FC<
  Base & {
    scoopAt: number;
    blocks: number[];
    flags: { tier: keyof typeof TIERS; at: number }[];
    toppleAt?: number;
  }
> = ({ localFrame: f, fps, width, scoopAt, blocks, flags, toppleAt }) => {
  const scoop = prog(f, fps, scoopAt, 0.3, backOut);
  const zoneTop = (i: number) => blockY(i) - BLOCK_H / 2 - 3;
  const zoneBot = (i: number) => blockY(i) + BLOCK_H / 2 + 3;
  return (
    <Stage width={width}>
      {/* ruler strip with the three zones */}
      <div style={{ position: "absolute", left: 470, top: zoneTop(5), width: 46, height: zoneBot(0) - zoneTop(5), filter: "drop-shadow(0 4px 5px rgba(0,0,0,0.3))" }}>
        {(Object.keys(TIERS) as (keyof typeof TIERS)[]).map((k) => {
          const t = TIERS[k];
          const top = zoneTop(t.blocks[1]) - zoneTop(5);
          const h = zoneBot(t.blocks[0]) - zoneTop(t.blocks[1]);
          return <div key={k} style={{ position: "absolute", left: 0, top, width: 46, height: h - 4, ...fibreBg(t.color), opacity: 0.9 }} />;
        })}
      </div>
      {/* scoop */}
      {scoop > 0 && (
        <At x={STACK_X} y={1260 - (1 - scoop) * 300}>
          <div style={{ position: "relative" }}>
            <Sticker src={A("scoop")} width={260} />
            <div style={{ position: "absolute", left: "50%", bottom: -50, transform: "translateX(-50%) rotate(-3deg)", background: P.ink, color: P.cream, fontFamily: FONT.mono, fontSize: 30, padding: "4px 14px", whiteSpace: "nowrap" }}>
              1 SERVING
            </div>
          </div>
        </At>
      )}
      {/* blocks */}
      {blocks.map((at, i) => {
        const land = prog(f, fps, at, 0.28, easeIn);
        if (land <= 0) return null;
        const squash = f >= (at + 0.28) * fps ? 1 - 0.12 * Math.max(0, 1 - (f - (at + 0.28) * fps) / (0.12 * fps)) : 1;
        let x = STACK_X + (rnd(i + 3) - 0.5) * 14;
        let y = blockY(i) - (1 - land) * 1200;
        let r = (rnd(i + 8) - 0.5) * 5;
        if (toppleAt !== undefined && i >= 3) {
          const t = Math.max(0, f / fps - toppleAt - (i - 3) * 0.04);
          x += t * (520 + i * 60);
          y += 0.5 * 4200 * t * t - t * 300;
          r += t * (200 + i * 40);
        }
        return (
          <At key={i} x={x} y={y}>
            <Cut color={i < 1 ? P.green : i < 3 ? P.orange : P.red} seed={60 + i} jag={1.5}
              style={{ width: BLOCK_W, height: BLOCK_H, transform: `rotate(${r}deg) scaleY(${squash})`, transformOrigin: "50% 100%" }}
              inner={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 46, color: "#fff" }}>5g</span>
            </Cut>
          </At>
        );
      })}
      {/* flags */}
      {flags.map(({ tier, at }) => {
        const t = TIERS[tier];
        const p = prog(f, fps, at, 0.2, backOut);
        if (p <= 0) return null;
        const y = (zoneTop(t.blocks[1]) + zoneBot(t.blocks[0])) / 2;
        return (
          <div key={tier} style={{ position: "absolute", left: 530, top: y - 62, transformOrigin: "0 50%", transform: `scaleX(${p}) rotate(${tier === "high" ? -3 : 2}deg)` }}>
            <Cut color={t.color} seed={80 + t.title.length} jag={1.5} style={{ padding: 0 }} inner={{ padding: "12px 26px 14px" }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 30, color: "rgba(255,255,255,0.9)" }}>{t.sub}</div>
              <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 54, color: "#fff", lineHeight: 1, whiteSpace: "nowrap" }}>{t.title}</div>
            </Cut>
          </div>
        );
      })}
    </Stage>
  );
};

// ---------------------------------------------------------------- PDF booklet (above the head)
export const PdfBooklet: React.FC<Base & { inAt: number; fanAt: number; pdfAt: number }> = ({ localFrame: f, fps, width, inAt, fanAt, pdfAt }) => {
  const drop = prog(f, fps, inAt, 0.25, backOut);
  if (drop <= 0) return <Stage width={width}>{null}</Stage>;
  const b = boil(31, f, 1);
  return (
    <Stage width={width}>
      <At x={470 + b.x} y={250 - (1 - drop) * 500 + b.y}>
        <div style={{ position: "relative", width: 300, height: 380, perspective: 1400, transform: "rotate(-4deg)" }}>
          {/* inside page */}
          <div style={{ position: "absolute", inset: 0, ...fibreBg(P.cream), borderRadius: 6, boxShadow: "0 14px 22px rgba(0,0,0,0.35)" }}>
            <div style={{ position: "absolute", left: 30, right: 30, top: 40, bottom: 40, background: "repeating-linear-gradient(to bottom, rgba(13,25,18,0.3) 0 6px, transparent 6px 26px)" }} />
          </div>
          {[3, 2, 1, 0].map((k) => {
            const p = prog(f, fps, fanAt + k * 0.08, 0.22, Easing.inOut(Easing.cubic));
            const ang = -168 * p + k * 0;
            const isCover = k === 0;
            return (
              <div key={k} style={{ position: "absolute", inset: 0, transformOrigin: "0 50%", transform: `rotateY(${ang}deg)`, backfaceVisibility: "hidden" }}>
                {isCover ? (
                  <div style={{ position: "absolute", inset: 0, ...fibreBg(P.orange), borderRadius: 6, borderLeft: `18px solid ${P.navy}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ fontFamily: FONT.serif, fontSize: 110, color: "#fff", lineHeight: 1 }}>Carbs</div>
                    <div style={{ marginTop: 18, background: P.ink, color: P.cream, fontFamily: FONT.mono, fontSize: 28, padding: "4px 12px" }}>DETAILED GUIDE</div>
                  </div>
                ) : (
                  <div style={{ position: "absolute", inset: 0, ...fibreBg(k === 2 ? "#F7EFDF" : P.cream), borderRadius: 6, boxShadow: "inset 8px 0 14px rgba(0,0,0,0.08)" }} />
                )}
              </div>
            );
          })}
        </div>
      </At>
      <At x={820} y={250}>
        <Stamp text="PDF" f={f} fps={fps} at={pdfAt} color={P.red} size={96} rotate={8} style={{ ...fibreBg(P.cream), mixBlendMode: "normal", boxShadow: "0 8px 16px rgba(0,0,0,0.35)" }} />
      </At>
    </Stage>
  );
};

// ---------------------------------------------------------------- comment "carbs" + paper plane
export const CommentBubble: React.FC<Base & { inAt: number; typeAt: number; word: string; postAt: number; planeAt: number }> = ({
  localFrame: f,
  fps,
  width,
  inAt,
  typeAt,
  word,
  postAt,
  planeAt,
}) => {
  const p = prog(f, fps, inAt, 0.22, backOut);
  if (p <= 0) return <Stage width={width}>{null}</Stage>;
  const typed = Math.max(0, Math.min(word.length, Math.floor((f / fps - typeAt) / 0.07) + 1));
  const posted = f >= postAt * fps;
  const press = posted ? 1 - 0.1 * Math.max(0, 1 - (f / fps - postAt) / 0.12) : 1;
  const plane = prog(f, fps, planeAt, 0.7, Easing.in(Easing.quad));
  const b = boil(44, f, 1);
  return (
    <Stage width={width}>
      <At x={540 + b.x} y={250 + b.y - (1 - p) * 60}>
        <div style={{ transform: `scale(${0.7 + 0.3 * p}) rotate(-2deg)` }}>
          <Cut color={P.cream} seed={51} jag={0.8} shadow={1.6} style={{ width: 860, height: 190 }} inner={{ display: "flex", alignItems: "center", gap: 26, padding: "0 30px", boxSizing: "border-box" }}>
            <div style={{ width: 110, height: 110, borderRadius: "50%", ...fibreBg(P.orange), flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.sans, fontWeight: 800, fontSize: 56, color: "#fff" }}>
              💬
            </div>
            <div style={{ flex: 1, height: 100, borderRadius: 50, border: `4px solid ${P.ink}`, display: "flex", alignItems: "center", padding: "0 30px", fontFamily: FONT.sans, fontWeight: 800, fontSize: 64, color: P.ink }}>
              {word.slice(0, f >= typeAt * fps ? typed : 0)}
              {!posted && Math.floor(f / 8) % 2 === 0 && <span style={{ width: 5, height: 60, background: P.orange, marginLeft: 6, display: "inline-block" }} />}
            </div>
            <div style={{ transform: `scale(${press})`, ...fibreBg(posted ? P.green : P.blue), color: "#fff", fontFamily: FONT.sans, fontWeight: 800, fontSize: 40, padding: "22px 24px", borderRadius: 18, flexShrink: 0 }}>
              {posted ? "✓" : "Post"}
            </div>
          </Cut>
        </div>
      </At>
      {plane > 0 && plane < 1 && (
        <At x={760 + plane * 520} y={330 - plane * 280 + Math.sin(plane * Math.PI) * -60}>
          <svg width={150} height={110} viewBox="0 0 150 110" style={{ transform: `rotate(${-18 - plane * 12}deg)`, filter: "drop-shadow(0 8px 8px rgba(0,0,0,0.3))" }}>
            <polygon points="0,55 150,0 60,70" fill="#FFFFFF" />
            <polygon points="60,70 150,0 80,110" fill="#E9E2D3" />
            <polygon points="0,55 60,70 50,90" fill="#D9D0BE" />
          </svg>
        </At>
      )}
    </Stage>
  );
};

// ---------------------------------------------------------------- "carbs ka source?" words
export const SourceWords: React.FC<Base & { labelAt: number; carbsAt: number; sourceAt: number }> = ({ localFrame: f, fps, width, labelAt, carbsAt, sourceAt }) => {
  const lp = prog(f, fps, labelAt, 0.2, backOut);
  return (
    <Stage width={width}>
      {lp > 0 && (
        <At x={540} y={150}>
          <div style={{ transform: `scaleX(${lp}) rotate(-2deg)`, background: P.ink, color: P.cream, fontFamily: FONT.mono, fontSize: 44, padding: "8px 22px", whiteSpace: "nowrap" }}>
            EK AUR IMPORTANT CHEEZ
          </div>
        </At>
      )}
      <At x={540} y={330}>
        <CutLetters text="CARBS KA" f={f} fps={fps} at={carbsAt} stagger={0.04} size={104} seed={21} colors={[P.cream, P.orange, P.yellow, P.cream]} />
      </At>
      <At x={540} y={500}>
        <CutLetters text="SOURCE?" f={f} fps={fps} at={sourceAt} stagger={0.045} size={128} seed={33} colors={[P.orange, P.cream, P.green, P.yellow]} />
      </At>
    </Stage>
  );
};

// ---------------------------------------------------------------- pop-up book of good carbs
const BOOK_ITEMS = [
  { id: "daal", name: "DAAL", x: 250, y: 610 },
  { id: "chana", name: "CHANA", x: 540, y: 600 },
  { id: "rajma", name: "RAJMA", x: 830, y: 610 },
  { id: "grains", name: "SAABUT ANAAJ", x: 370, y: 950 },
  { id: "nuts", name: "NUTS", x: 710, y: 950 },
];
export const PopUpBook: React.FC<Base & { openAt: number; pops: number[]; fibreAt: number; choiceAt: number }> = ({
  localFrame: f,
  fps,
  width,
  openAt,
  pops,
  fibreAt,
  choiceAt,
}) => {
  const open = prog(f, fps, openAt, 0.4, Easing.inOut(Easing.cubic));
  const ribbon = prog(f, fps, fibreAt, 0.3, Easing.out(Easing.cubic));
  const b = boil(61, f, 1);
  return (
    <Stage width={width}>
      {/* the spread */}
      <div style={{ position: "absolute", left: 40 + b.x, top: 380 + b.y, width: 1000, height: 760, perspective: 2400 }}>
        <div style={{ position: "absolute", inset: 0, boxShadow: "0 30px 40px rgba(0,0,0,0.35)", borderRadius: 10 }} />
        <div style={{ position: "absolute", left: 0, top: 0, width: 500, height: 760, ...fibreBg(P.cream), borderRadius: "10px 0 0 10px", boxShadow: "inset -30px 0 40px rgba(0,0,0,0.12)" }} />
        <div style={{ position: "absolute", left: 500, top: 0, width: 500, height: 760, ...fibreBg(P.cream), borderRadius: "0 10px 10px 0", boxShadow: "inset 30px 0 40px rgba(0,0,0,0.12)" }} />
        {/* the cover swings open from the right page to the left */}
        {open < 1 && (
          <div style={{ position: "absolute", left: 500, top: 0, width: 500, height: 760, transformOrigin: "0 50%", transform: `rotateY(${-180 * open}deg)`, ...fibreBg(P.green), borderRadius: "0 10px 10px 0", display: "flex", alignItems: "center", justifyContent: "center", backfaceVisibility: "hidden" }}>
            <span style={{ fontFamily: FONT.serif, fontSize: 120, color: "#fff", lineHeight: 0.95, textAlign: "center" }}>Better<br />carbs</span>
          </div>
        )}
      </div>
      {/* pop-ups */}
      {BOOK_ITEMS.map((it, i) => {
        const at = pops[i];
        const p = prog(f, fps, at, 0.26, backOut);
        if (p <= 0) return null;
        return (
          <At key={it.id} x={it.x} y={it.y}>
            <div style={{ perspective: 900, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ transformOrigin: "50% 100%", transform: `rotateX(${(1 - p) * 82}deg)` }}>
                <Sticker src={A(it.id)} width={it.id === "grains" || it.id === "nuts" ? 290 : 260} border={6} />
              </div>
              <div style={{ marginTop: -6, transform: `scale(${p}) rotate(${(rnd(i) - 0.5) * 6}deg)`, background: P.ink, color: P.cream, fontFamily: FONT.mono, fontSize: 32, padding: "3px 12px", whiteSpace: "nowrap" }}>
                {it.name}
              </div>
            </div>
          </At>
        );
      })}
      {/* FIBRE RICH ribbon */}
      {ribbon > 0 && (
        <At x={540} y={290}>
          <Cut color={P.green} seed={71} jag={1} style={{ width: 640 * ribbon, height: 120, overflow: "hidden" }} inner={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 76, color: "#fff", whiteSpace: "nowrap", letterSpacing: "0.02em" }}>FIBRE RICH</span>
          </Cut>
        </At>
      )}
      <At x={540} y={1250}>
        <Stamp text="✓ behtar choice" f={f} fps={fps} at={choiceAt} color={P.green} size={70} rotate={-4} />
      </At>
    </Stage>
  );
};

// ---------------------------------------------------------------- limit the refined stuff
const JUNK = [
  { id: "biscuits", x: 290, y: 430, w: 300, tag: "added" },
  { id: "soda", x: 790, y: 440, w: 230, tag: "added" },
  { id: "bread", x: 290, y: 820, w: 300, tag: "refined" },
  { id: "chips", x: 790, y: 830, w: 240, tag: "refined" },
] as const;
export const LimitBox: React.FC<Base & { inAt: number; addedAt: number; refinedAt: number; limitAt: number; boxX?: number }> = ({
  localFrame: f,
  fps,
  width,
  inAt,
  addedAt,
  refinedAt,
  limitAt,
  boxX = 540,
}) => {
  const box = prog(f, fps, limitAt - 0.15, 0.25, backOut);
  const boxY = 1130;
  return (
    <Stage width={width}>
      {/* box back */}
      {box > 0 && <At x={boxX} y={boxY - 70 + (1 - box) * 900}><div style={{ width: 560, height: 120, ...fibreBg("#9E2A22"), borderRadius: 8 }} /></At>}
      {JUNK.map((j, i) => {
        const inP = prog(f, fps, inAt + i * 0.07, 0.25, backOut);
        if (inP <= 0) return null;
        const go = prog(f, fps, limitAt + i * 0.06, 0.3, Easing.inOut(Easing.cubic));
        const tx = boxX - 180 + i * 120;
        const ty = boxY - 60 + (i % 2) * 10;
        const x = j.x + (tx - j.x) * go;
        const y = j.y + (ty - j.y) * go - (1 - inP) * 200;
        const s = (1 - 0.6 * go) * (0.6 + 0.4 * inP);
        const b = boil(90 + i, f, 1.4);
        const tagAt = j.tag === "added" ? addedAt + (i === 1 ? 0.1 : 0) : refinedAt + (i === 3 ? 0.1 : 0);
        const tp = prog(f, fps, tagAt, 0.18, backOut);
        return (
          <At key={j.id} x={x + b.x} y={y + b.y}>
            <div style={{ transform: `scale(${s}) rotate(${b.r * 3 + (i % 2 ? 4 : -4)}deg)`, position: "relative" }}>
              <Sticker src={A(j.id)} width={j.w} />
              {tp > 0 && (
                <div style={{ position: "absolute", left: "50%", bottom: -30, transform: `translateX(-50%) scale(${tp}) rotate(${i % 2 ? 5 : -5}deg)`, ...fibreBg(j.tag === "added" ? P.red : P.orange), color: "#fff", fontFamily: FONT.mono, fontSize: 34, padding: "5px 14px", whiteSpace: "nowrap", boxShadow: "0 6px 10px rgba(0,0,0,0.3)" }}>
                  {j.tag === "added" ? "ADDED SUGAR" : "REFINED CARBS"}
                </div>
              )}
            </div>
          </At>
        );
      })}
      {/* box front, drawn over the items so they sit inside */}
      {box > 0 && (
        <At x={boxX} y={boxY + 60 + (1 - box) * 900}>
          <Cut color={P.red} seed={93} jag={0.8} shadow={1.6} style={{ width: 600, height: 230 }} inner={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 120, color: "#fff", letterSpacing: "0.06em" }}>LIMIT</span>
          </Cut>
        </At>
      )}
    </Stage>
  );
};

// ---------------------------------------------------------------- the hand reaching for the pack
export const HandGrab: React.FC<Base & { reachAt: number; stopAt: number; wiggleAt: number; flipAt: number }> = ({
  localFrame: f,
  fps,
  width,
  reachAt,
  stopAt,
  wiggleAt,
  flipAt,
}) => {
  const t = f / fps;
  const reach = interpolate(t, [reachAt, stopAt], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const back = prog(f, fps, stopAt, 0.18, Easing.out(Easing.back(2)));
  const handX = 1500 - 560 * reach + 230 * back;
  const flip = prog(f, fps, flipAt, 0.3, Easing.inOut(Easing.cubic));
  const zoom = 1 + 1.15 * prog(f, fps, flipAt + 0.05, 0.38, Easing.in(Easing.cubic));
  const wig = prog(f, fps, wiggleAt, 0.35);
  const b = boil(101, f, 1.2);
  return (
    <Stage width={width}>
      <At x={540 + b.x} y={800 + b.y}>
        <div style={{ transform: `scale(${zoom}) rotate(${-3 * (1 - flip)}deg)` }}>
          <Pack w={380} f={f} fps={fps} flip={flip} wiggle={wig > 0 && wig < 1 ? wig : 0} />
        </div>
      </At>
      {flip < 0.5 && (
        <At x={handX} y={820}>
          <div style={{ transform: `rotate(${-6 + 4 * back}deg)` }}>
            <Sticker src={A("hand")} width={640} />
          </div>
        </At>
      )}
      {flip < 0.6 && (
        <At x={540} y={250}>
          <Stamp text="✗ mat uthao" f={f} fps={fps} at={stopAt + 0.02} color={P.red} size={92} rotate={-5} />
        </At>
      )}
    </Stage>
  );
};

// ---------------------------------------------------------------- part 2 teaser (above the head)
export const PackTeaser: React.FC<Base & { partAt: number; packAt: number; stickerAt: number; peelAt: number }> = ({
  localFrame: f,
  fps,
  width,
  partAt,
  packAt,
  stickerAt,
  peelAt,
}) => {
  const part = prog(f, fps, partAt, 0.22, backOut);
  const pack = prog(f, fps, packAt, 0.22, backOut);
  const st = prog(f, fps, stickerAt, 0.12, easeIn);
  const peel = prog(f, fps, peelAt, 0.35, Easing.out(Easing.cubic));
  const pw = 150;
  const b = boil(121, f, 1);
  return (
    <Stage width={width}>
      {part > 0 && (
        <At x={290} y={230}>
          <Cut color={P.orange} seed={131} jag={1.5} style={{ width: 340, height: 150, transform: `translateX(${(1 - part) * -300}px) rotate(-5deg)` }} inner={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
            <span style={{ fontFamily: FONT.mono, fontSize: 30, color: "rgba(255,255,255,0.9)" }}>AGLE</span>
            <span style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 80, color: "#fff", lineHeight: 0.95 }}>PART 2</span>
          </Cut>
        </At>
      )}
      {pack > 0 && (
        <At x={790 + b.x} y={240 + b.y}>
          <div style={{ transform: `scale(${pack}) rotate(6deg)`, position: "relative", width: pw, height: pw * PACK_ASPECT }}>
            <Img src={staticFile(A("pack_front"))} style={{ width: pw, display: "block", filter: "drop-shadow(0 10px 12px rgba(0,0,0,0.35))" }} />
            {peel > 0 && (
              <div style={{ position: "absolute", left: "50%", top: "52%", transform: `translate(-50%,-50%) scale(${peel})`, fontFamily: FONT.hand, fontWeight: 700, fontSize: 150, color: P.red, textShadow: "0 0 10px #fff, 0 0 4px #fff" }}>?</div>
            )}
            {st > 0 && (
              <div style={{ position: "absolute", left: -40, top: pw * PACK_ASPECT * 0.3, width: 230, height: 150, transformOrigin: "0 0", transform: `scale(${1.5 - 0.5 * st}) rotate(${-6 - 34 * peel}deg) translate(${-30 * peel}px, ${-50 * peel}px)`, opacity: 0.4 + 0.6 * st }}>
                <Cut color={P.yellow} seed={141} jag={2.5} style={{ width: 230, height: 150 }} inner={{ display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                  <span style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 36, color: P.ink, lineHeight: 1 }}>NO ADDED<br />SUGAR</span>
                </Cut>
              </div>
            )}
          </div>
        </At>
      )}
    </Stage>
  );
};

// ---------------------------------------------------------------- follow button
export const FollowButton: React.FC<Base & { inAt: number; pressAt: number }> = ({ localFrame: f, fps, width, inAt, pressAt }) => {
  const p = prog(f, fps, inAt, 0.22, backOut);
  if (p <= 0) return <Stage width={width}>{null}</Stage>;
  const press = prog(f, fps, pressAt, 0.08, easeIn);
  const done = f >= (pressAt + 0.12) * fps;
  return (
    <Stage width={width}>
      <At x={540} y={260}>
        <div style={{ position: "relative", width: 560, height: 170, transform: `scale(${p}) rotate(-2deg)` }}>
          <Cut color={done ? "#2A6B33" : "#CC4800"} seed={151} jag={0.8} style={{ position: "absolute", left: 0, top: 22, width: 560, height: 150 }} />
          <Cut color={done ? P.green : P.orange} seed={152} jag={0.8} shadow={1 - press}
            style={{ position: "absolute", left: 0, top: 22 * press, width: 560, height: 150 }}
            inner={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 66, color: "#fff", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>{done ? "FOLLOWING ✓" : "+ FOLLOW"}</span>
          </Cut>
        </div>
      </At>
    </Stage>
  );
};

// ---------------------------------------------------------------- small pieces for A-roll beats
export const PaperTagEl: React.FC<Base & { text: string; sub?: string; color?: string; at?: number; rotate?: number }> = ({
  localFrame: f,
  fps,
  width,
  text,
  sub,
  color = P.green,
  at = 0,
  rotate = -6,
}) => {
  const p = prog(f, fps, at, 0.16, easeIn);
  if (p <= 0) return null;
  return (
    <div style={{ width, display: "flex", justifyContent: "center" }}>
      <div style={{ transform: `scale(${1.5 - 0.5 * p}) rotate(${rotate}deg)`, opacity: 0.4 + 0.6 * p }}>
        <Cut color={color} seed={161} jag={1.5} shadow={1.4} inner={{ padding: "14px 34px 18px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          {sub && <span style={{ fontFamily: FONT.mono, fontSize: 34, color: "rgba(255,255,255,0.92)" }}>{sub}</span>}
          <span style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 70, color: "#fff", lineHeight: 1, whiteSpace: "nowrap" }}>{text}</span>
        </Cut>
      </div>
    </div>
  );
};

export const StampEl: React.FC<Base & { text: string; at?: number; color?: string; size?: number; rotate?: number; onVideo?: boolean }> = ({
  localFrame: f,
  fps,
  width,
  text,
  at = 0,
  color = P.green,
  size = 80,
  rotate = -6,
  onVideo = false,
}) => (
  <div style={{ width, display: "flex", justifyContent: "center" }}>
    <Stamp text={text} f={f} fps={fps} at={at} color={color} size={size} rotate={rotate}
      style={onVideo ? { ...fibreBg(P.cream), mixBlendMode: "normal", boxShadow: "0 8px 16px rgba(0,0,0,0.35)" } : undefined} />
  </div>
);
