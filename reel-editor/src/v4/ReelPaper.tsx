import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { getBrand, type Brand } from "../brands";
import { ElementView } from "../components/ElementView";
import { Grain } from "../components/Paper";
import { SfxTrack } from "../components/SfxTrack";
import { SourceVideo } from "../components/SourceVideo";
import { boil, fibreBg } from "../custom/paper/kit";
import type { Captions as CaptionsData } from "../schema";
import { CaptionsPaper } from "./CaptionsPaper";
import type { PaperEdit, PaperSegment } from "./schema";

// "Paper cut" renderer: the presenter as a die-cut sticker on a paper desk, page-flip / slide
// transitions, graphics on twos with a boil, torn-tape captions. Reads the same edit.json.
//   npx remotion render ReelPaper out/<project>.mp4 --props='{"project":"sugar-free"}'

export type ReelPaperProps = { project: string; edit?: PaperEdit; captions?: CaptionsData | null };

const TRANS_F: Record<PaperSegment["transitionIn"], number> = {
  cut: 0,
  "paper-wipe": 8,
  "page-flip": 10,
  "slide-left": 8,
  "slide-up": 8,
  "pop-up": 5,
};

const SourceAudio: React.FC<{ edit: PaperEdit; fps: number }> = ({ edit, fps }) => {
  const keep = edit.keep ?? [[0, edit.duration] as [number, number]];
  let out = 0;
  return (
    <>
      {keep.map(([s, e], i) => {
        const from = Math.round(out * fps);
        const dur = Math.round((e - s) * fps);
        out += e - s;
        return (
          <Sequence key={i} from={from} durationInFrames={dur} layout="none" name={`voice ${i}`}>
            <Audio src={staticFile(edit.source)} trimBefore={Math.round(s * fps)} volume={edit.voiceVolume} />
          </Sequence>
        );
      })}
    </>
  );
};

const Desk: React.FC<{ seg: PaperSegment }> = ({ seg }) => (
  <AbsoluteFill style={{ ...fibreBg(seg.desk.color) }}>
    <AbsoluteFill style={{ background: "radial-gradient(130% 90% at 50% 40%, rgba(255,255,255,0.12) 40%, rgba(60,35,10,0.18) 100%)" }} />
    {seg.desk.pattern === "grid" && (
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.22) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.22) 2px, transparent 2px), linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "120px 120px, 120px 120px, 24px 24px, 24px 24px",
        }}
      />
    )}
    <Grain opacity={0.12} />
  </AbsoluteFill>
);

/** The matte presenter with a white die-cut border. */
const StickerPresenter: React.FC<{ edit: PaperEdit; seg: PaperSegment; fps: number; width: number; height: number; lf: number }> = ({
  edit,
  seg,
  fps,
  width,
  height,
  lf,
}) => {
  const s = seg.sticker;
  const ox = 0.52; // bottom-centre of the body in the matte
  const oy = 0.78;
  const b = 9;
  const ring = [[b, 0], [-b, 0], [0, b], [0, -b], [b * 0.7, b * 0.7], [-b * 0.7, b * 0.7], [b * 0.7, -b * 0.7], [-b * 0.7, -b * 0.7]]
    .map(([x, y]) => `drop-shadow(${x}px ${y}px 0 #fff)`)
    .join(" ");
  // the sticker lands with a little slap when the segment starts
  const land = interpolate(lf, [0, 5], [1.06, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ filter: "drop-shadow(0 22px 22px rgba(30,20,10,0.38))" }}>
      <AbsoluteFill
        style={{
          filter: ring,
          transformOrigin: `${ox * 100}% ${oy * 100}%`,
          transform: `translate(${(s.x - ox) * width}px, ${(s.y - oy) * height}px) scale(${s.scale * land}) rotate(${s.rotate}deg)`,
          clipPath: `inset(0 0 ${(1 - oy - 0.004) * 100}% 0)`,
        }}
      >
        <SourceVideo src={edit.matte!} keep={edit.keep} fps={fps} muted transparent />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Elements: React.FC<{ seg: PaperSegment; brand: Brand; lf: number; segF: number; fps: number; width: number; height: number; layer: "under" | "over" }> = ({
  seg,
  brand,
  lf,
  segF,
  fps,
  width,
  height,
  layer,
}) => {
  const f = seg.stepped ? lf - (((lf % 2) + 2) % 2) : lf;
  return (
    <AbsoluteFill>
      {seg.elements
        .filter((el) => (layer === "over" ? el.z >= 10 : el.z < 10))
        .map((el, i) => {
          const b = seg.stepped && el.type !== "component" ? boil(i * 17 + 3, lf, 1.3) : { x: 0, y: 0, r: 0 };
          return (
            <AbsoluteFill key={i} style={{ transform: `translate(${b.x}px, ${b.y}px)` }}>
              <ElementView el={el} brand={brand} localFrame={f} segFrames={segF} fps={fps} width={width} height={height} />
            </AbsoluteFill>
          );
        })}
    </AbsoluteFill>
  );
};

/** Everything one segment shows (minus captions and audio), `lf` frames in. */
const Screen: React.FC<{ edit: PaperEdit; seg: PaperSegment; brand: Brand; lf: number; fps: number; width: number; height: number }> = ({
  edit,
  seg,
  brand,
  lf,
  fps,
  width,
  height,
}) => {
  const segF = Math.round((seg.end - seg.start) * fps);
  const common = { seg, brand, lf, segF, fps, width, height };
  const origin = `${edit.framing.faceX * 100}% ${edit.framing.faceY * 100}%`;
  if (seg.layout === "aroll" || seg.layout === "overlay" || seg.layout === "header" || seg.layout === "pip") {
    // punch-ins ease in over 6 frames rather than snapping
    const zoom = interpolate(lf, [0, 6], [1, seg.zoom], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
    return (
      <AbsoluteFill style={{ backgroundColor: "#000" }}>
        <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: origin }}>
          <SourceVideo src={edit.source} keep={edit.keep} fps={fps} muted />
        </AbsoluteFill>
        <Elements {...common} layer="under" />
        <Elements {...common} layer="over" />
      </AbsoluteFill>
    );
  }
  const withPresenter = (seg.layout === "sticker" || seg.layout === "bgswap") && edit.matte;
  return (
    <AbsoluteFill>
      <Desk seg={seg} />
      <Elements {...common} layer="under" />
      {withPresenter && <StickerPresenter edit={edit} seg={seg} fps={fps} width={width} height={height} lf={lf} />}
      <Elements {...common} layer="over" />
    </AbsoluteFill>
  );
};

export const ReelPaper: React.FC<ReelPaperProps> = ({ edit, captions }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (!edit) return null;
  const brand = getBrand(edit.brand);
  const t = frame / fps;
  const segs = edit.segments;
  let i = 0;
  for (let k = 0; k < segs.length; k++) if (segs[k].start <= t + 1e-6) i = k;
  const seg = segs[i];
  const prev = segs[i - 1];
  const lf = frame - Math.round(seg.start * fps);
  const n = TRANS_F[seg.transitionIn];
  const inTrans = prev && n > 0 && lf < n;
  const p = inTrans ? interpolate(lf, [0, n], [0, 1], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) }) : 1;

  let incoming: React.CSSProperties = {};
  let outgoing: React.CSSProperties = {};
  let shade = 0;
  switch (seg.transitionIn) {
    case "page-flip":
      // the new page swings in from the left like a turned page landing on the stack
      incoming = { transform: `perspective(2600px) rotateY(${(1 - p) * 100}deg)`, transformOrigin: "0% 50%" };
      shade = (1 - p) * 0.5;
      break;
    case "slide-left":
      incoming = { transform: `translateX(${(1 - p) * width}px) rotate(${(1 - p) * 4}deg)`, transformOrigin: "0% 100%" };
      outgoing = { transform: `translateX(${-p * width * 0.25}px)` };
      break;
    case "slide-up":
      incoming = { transform: `translateY(${(1 - p) * height}px) rotate(${(1 - p) * -3}deg)` };
      break;
    case "pop-up":
      incoming = { transform: `scale(${0.9 + 0.1 * p}) rotate(${(1 - p) * -2}deg)` };
      break;
    case "paper-wipe":
      incoming = { clipPath: `inset(${(1 - p) * 100}% 0 0 0)` };
      break;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#1a120a" }}>
      <SourceAudio edit={edit} fps={fps} />
      <SfxTrack sfx={edit.sfx} fps={fps} />
      {inTrans && (
        <AbsoluteFill style={outgoing}>
          <Screen edit={edit} seg={prev} brand={brand} lf={Math.round((prev.end - prev.start) * fps) - 1 + lf} fps={fps} width={width} height={height} />
          {shade > 0 && <AbsoluteFill style={{ background: `rgba(20,12,4,${shade * 0.6})` }} />}
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ ...incoming, boxShadow: inTrans ? "0 0 60px rgba(0,0,0,0.45)" : undefined, overflow: "hidden" }}>
        <Screen edit={edit} seg={seg} brand={brand} lf={lf} fps={fps} width={width} height={height} />
        {shade > 0 && <AbsoluteFill style={{ background: `linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(20,12,4,${shade}) 100%)` }} />}
      </AbsoluteFill>
      {captions && seg.captions && <CaptionsPaper data={captions} brand={brand} t={t} fps={fps} width={width} height={height} />}
    </AbsoluteFill>
  );
};
