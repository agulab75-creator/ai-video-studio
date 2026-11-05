import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { getBrand, type Brand } from "./brands";
import { Captions } from "./components/Captions";
import { ElementView } from "./components/ElementView";
import { BackgroundView, tornPolygon, TornFiber } from "./components/Paper";
import { SfxTrack } from "./components/SfxTrack";
import { SourceVideo } from "./components/SourceVideo";
import { at30, easeOut, enterStyle } from "./lib/anim";
import type { Captions as CaptionsData, Edit, Segment } from "./schema";

export type ReelProps = { project: string; edit?: Edit; captions?: CaptionsData | null };

const segIndexAt = (segs: Segment[], t: number) => {
  let i = 0;
  for (let k = 0; k < segs.length; k++) if (segs[k].start <= t + 1e-6) i = k;
  return i;
};

const HEADER_ENTER = 10; // frames @30fps: between the 4 (ALI_002) and 12 (ALI_004) measured

/** Where the A-roll sits for a segment, `lf` frames after it starts. */
const arollState = (edit: Edit, seg: Segment, prev: Segment | undefined, lf: number, fps: number) => {
  const hidden = seg.layout === "fullscreen" || seg.layout === "bgswap" || seg.layout === "pip";
  let ty = 0;
  let zoom = seg.layout === "aroll" || seg.layout === "overlay" ? seg.zoom : 1;
  if (seg.layout === "header") {
    const overlap = seg.presenterInFront && edit.matte ? 0.04 : -0.015;
    const shift = Math.max(0, seg.panelHeight - edit.framing.headTop - overlap);
    const from = prev?.layout === "header" ? shift : 0;
    ty = interpolate(lf, [0, at30(HEADER_ENTER, fps)], [from, shift], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: easeOut,
    });
    zoom = 1;
  }
  return { hidden, ty, zoom };
};

const Presenter: React.FC<{ edit: Edit; fps: number; transform: string; origin: string }> = ({
  edit,
  fps,
  transform,
  origin,
}) => (
  <AbsoluteFill style={{ transform, transformOrigin: origin }}>
    <SourceVideo src={edit.matte!} keep={edit.keep} fps={fps} muted transparent />
  </AbsoluteFill>
);

const Elements: React.FC<{
  seg: Segment;
  brand: Brand;
  lf: number;
  segF: number;
  fps: number;
  width: number;
  height: number;
  layer: "under" | "over";
}> = ({ seg, brand, lf, segF, fps, width, height, layer }) => (
  <AbsoluteFill>
    {seg.elements
      .filter((el) => (layer === "over" ? el.z >= 10 : el.z < 10))
      .map((el, i) => (
        <ElementView key={i} el={el} brand={brand} localFrame={lf} segFrames={segF} fps={fps} width={width} height={height} />
      ))}
  </AbsoluteFill>
);

const SegmentLayer: React.FC<{
  edit: Edit;
  seg: Segment;
  prev?: Segment;
  brand: Brand;
  lf: number;
  segF: number;
  fps: number;
  width: number;
  height: number;
  arollTransform: string;
  origin: string;
}> = ({ edit, seg, prev, brand, lf, segF, fps, width, height, arollTransform, origin }) => {
  const common = { seg, brand, lf, segF, fps, width, height };
  switch (seg.layout) {
    case "aroll":
      return <Elements {...common} layer="under" />;
    case "overlay": {
      const blur = seg.blurAroll
        ? interpolate(lf, [0, at30(6, fps)], [0, 1], { extrapolateRight: "clamp", easing: easeOut })
        : 0;
      return (
        <>
          {blur > 0 && (
            <AbsoluteFill style={{ backdropFilter: `blur(${18 * blur}px)`, background: `rgba(0,0,0,${0.18 * blur})` }} />
          )}
          <Elements {...common} layer="under" />
          <Elements {...common} layer="over" />
        </>
      );
    }
    case "header": {
      const panelH = seg.panelHeight * height;
      const slide =
        prev?.layout === "header"
          ? 0
          : interpolate(lf, [0, at30(HEADER_ENTER, fps)], [-(panelH + 60), 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: easeOut,
            });
      const bg = seg.background ?? brand.header.background;
      return (
        <>
          <AbsoluteFill style={{ transform: `translateY(${slide}px)` }}>
            <TornFiber edgeY={seg.panelHeight} seed={7} width={width} height={height} />
            <AbsoluteFill style={{ clipPath: tornPolygon(seg.panelHeight, 7, width, height) }}>
              <BackgroundView bg={bg} brand={brand} localFrame={lf} durationFrames={segF} />
              <Elements {...common} layer="under" />
            </AbsoluteFill>
          </AbsoluteFill>
          {seg.presenterInFront && edit.matte && <Presenter edit={edit} fps={fps} transform={arollTransform} origin={origin} />}
          <Elements {...common} layer="over" />
        </>
      );
    }
    case "fullscreen":
      return (
        <>
          <BackgroundView bg={seg.background ?? { kind: "paper", grain: true, kenburns: 0 }} brand={brand} localFrame={lf} durationFrames={segF} />
          <Elements {...common} layer="under" />
          <Elements {...common} layer="over" />
        </>
      );
    case "bgswap": {
      const t = `translateY(${seg.presenterY * height}px) scale(${seg.presenterScale})`;
      return (
        <>
          <BackgroundView bg={seg.background ?? brand.header.background} brand={brand} localFrame={lf} durationFrames={segF} />
          <Elements {...common} layer="under" />
          {edit.matte && <Presenter edit={edit} fps={fps} transform={t} origin="50% 100%" />}
          <Elements {...common} layer="over" />
        </>
      );
    }
    case "pip": {
      const S = seg.pip.size * width;
      const margin = width * 0.06;
      const left = seg.pip.corner.endsWith("left") ? margin : width - margin - S;
      const top = seg.pip.corner.startsWith("top") ? height * 0.11 : height * 0.6 - S;
      const f = edit.framing;
      const k = S / (1.5 * f.faceSize * height);
      const st = enterStyle("pop", lf - at30(4, fps), fps);
      return (
        <>
          <BackgroundView bg={seg.background ?? { kind: "paper", grain: true, kenburns: 0 }} brand={brand} localFrame={lf} durationFrames={segF} />
          <Elements {...common} layer="under" />
          <div
            style={{
              position: "absolute",
              left,
              top,
              width: S,
              height: S,
              borderRadius: seg.pip.shape === "circle" ? "50%" : 36,
              overflow: "hidden",
              boxShadow: `0 0 0 7px ${brand.pipBorder}, 0 0 0 12px #fff, 0 20px 40px rgba(0,0,0,0.35)`,
              opacity: st.opacity,
              transform: st.transform,
            }}
          >
            <div
              style={{
                position: "absolute",
                width,
                height,
                transformOrigin: "0 0",
                transform: `translate(${S / 2 - f.faceX * width * k}px, ${S / 2 - f.faceY * height * k}px) scale(${k})`,
              }}
            >
              <SourceVideo src={edit.source} keep={edit.keep} fps={fps} muted />
            </div>
          </div>
          <Elements {...common} layer="over" />
        </>
      );
    }
  }
};

export const Reel: React.FC<ReelProps> = ({ edit, captions }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (!edit) return null;
  const brand = getBrand(edit.brand);
  const t = frame / fps;
  const segs = edit.segments;
  const i = segIndexAt(segs, t);
  const seg = segs[i];
  const prev = segs[i - 1];
  const segStartF = Math.round(seg.start * fps);
  const lf = frame - segStartF;
  const segF = Math.round((seg.end - seg.start) * fps);

  const wipeF = at30(7, fps);
  const wiping = seg.transitionIn === "paper-wipe" && lf < wipeF;
  const edgeY = interpolate(lf, [0, wipeF], [1.04, -0.06], { extrapolateRight: "clamp", easing: easeOut });

  const cur = arollState(edit, seg, prev, lf, fps);
  // During a paper wipe the outgoing A-roll stays visible under the incoming layer.
  const prevState = prev ? arollState(edit, prev, segs[i - 2], Math.round((prev.end - prev.start) * fps), fps) : cur;
  const ar = wiping && cur.hidden ? prevState : cur;
  const origin = `${edit.framing.faceX * 100}% ${edit.framing.faceY * 100}%`;
  const arollTransform = `translateY(${ar.ty * height}px) scale(${ar.zoom})`;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill style={{ transform: arollTransform, transformOrigin: origin, opacity: ar.hidden ? 0 : 1 }}>
        {/* the only unmuted source: continuous master audio */}
        <SourceVideo src={edit.source} keep={edit.keep} fps={fps} volume={edit.voiceVolume} />
      </AbsoluteFill>
      <SfxTrack sfx={edit.sfx} fps={fps} />
      <AbsoluteFill style={{ clipPath: wiping ? tornPolygon(edgeY, 31, width, height, true, 26) : undefined }}>
        <SegmentLayer
          edit={edit}
          seg={seg}
          prev={prev}
          brand={brand}
          lf={lf}
          segF={segF}
          fps={fps}
          width={width}
          height={height}
          arollTransform={arollTransform}
          origin={origin}
        />
      </AbsoluteFill>
      {wiping && (
        <AbsoluteFill style={{ filter: "drop-shadow(0 -6px 10px rgba(0,0,0,0.3))" }}>
          <AbsoluteFill
            style={{
              background: "#FBF8F1",
              clipPath: `${tornPolygon(edgeY - 0.012, 44, width, height, true, 26)}`,
              WebkitMaskImage: `linear-gradient(to bottom, transparent ${(edgeY - 0.02) * 100}%, #000 ${(edgeY - 0.012) * 100}%, #000 ${(edgeY + 0.004) * 100}%, transparent ${(edgeY + 0.006) * 100}%)`,
            }}
          />
        </AbsoluteFill>
      )}
      {captions && seg.captions && <Captions data={captions} brand={brand} t={t} width={width} height={height} />}
    </AbsoluteFill>
  );
};
