import React from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { SfxTrack } from "../components/SfxTrack";
import { SourceVideo } from "../components/SourceVideo";
import type { Captions as CaptionsData } from "../schema";
import { CaptionsV2 } from "./CaptionsV2";
import { ElementV2View } from "./ElementsV2";
import "./fonts";
import type { EditV2, SceneV2, ShotSchema } from "./schema";
import type { z } from "zod";

// Renderer for edit_v2.json (style: learner/klickpin-ref/style-dna/atlasian-clinic-3d).
// Layer order: room (source, blurred/darkened/washed) -> scene back layer -> presenter (matte)
// -> scene front layer -> captions. Transitions wrap everything but the captions.

export type ReelV2Props = { project: string; edit?: EditV2; captions?: CaptionsData | null };
type Shot = z.infer<typeof ShotSchema>;

const out = Easing.out(Easing.cubic);
const inOut = Easing.inOut(Easing.cubic);
const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const k30 = (n: number, fps: number) => Math.max(1, Math.round((n * fps) / 30));

const indexAt = <T extends { start: number }>(list: T[], t: number) => {
  let i = 0;
  for (let k = 0; k < list.length; k++) if (list[k].start <= t + 1e-6) i = k;
  return i;
};

/** Crop + push-in for the shot at time t. */
const camera = (edit: EditV2, shot: Shot, t: number, fps: number, width: number, height: number) => {
  const lf = (t - shot.start) * fps;
  const n = Math.max(1, (shot.end - shot.start) * fps);
  let s = shot.scale + shot.push * interpolate(lf, [0, n], [0, 1], clamp);
  if (shot.punch) s += shot.punch * interpolate(lf, [0, k30(shot.punchFrames, fps)], [0, 1], { ...clamp, easing: inOut });
  const cx = shot.cx ?? edit.framing.faceX;
  const cy = shot.cy ?? edit.framing.faceY;
  const dx = shot.dx * interpolate(lf, [0, n], [0, 1], clamp);
  return {
    transform: `translateX(${dx}px) scale(${s})`,
    origin: `${cx * 100}% ${cy * 100}%`,
    style: { width, height },
  };
};

const bgAmount = (scene: SceneV2, lf: number, fps: number) => {
  const b = scene.bg;
  const p = interpolate(lf - Math.round(b.at * fps), [0, k30(b.frames, fps)], [0, 1], { ...clamp, easing: inOut });
  return { blur: b.blur * p, darken: b.darken * p, white: b.white * p, tint: b.tint * p, tintColor: b.tintColor };
};

const needsMatte = (scene: SceneV2) =>
  scene.kind === "aroll" && (scene.bg.blur > 0 || scene.bg.darken > 0 || scene.bg.white > 0 || scene.bg.tint > 0 || scene.elements.some((e) => e.behind));

const SceneLayer: React.FC<{ scene: SceneV2; layer: "back" | "front"; width: number; height: number }> = ({ scene, layer, width, height }) => {
  const lf = useCurrentFrame();
  const { fps } = useVideoConfig();
  const els = scene.elements.filter((e) => (layer === "back" ? e.behind : !e.behind));
  return (
    <AbsoluteFill>
      {els.map((el, i) => (
        <ElementV2View key={i} el={el} lf={lf} fps={fps} width={width} height={height} />
      ))}
    </AbsoluteFill>
  );
};

const FullBackground: React.FC<{ kind: SceneV2["bg"]["kind"]; lf: number; fps: number }> = ({ kind, lf, fps }) => {
  if (kind === "dark")
    return <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 70% at 50% 40%, #3a3f47 0%, #15181c 55%, #050607 100%)" }} />;
  if (kind === "white") return <AbsoluteFill style={{ background: "#FFFFFF" }} />;
  // light: white -> grey vertical gradient that slowly breathes (AFTER_001 0.55-2.95)
  const g = 70 + 4 * Math.sin((lf / fps) * 1.3);
  return <AbsoluteFill style={{ background: `linear-gradient(180deg, #ffffff 0%, #eef0f3 ${g - 30}%, #9aa0a8 100%)` }} />;
};

/** Transition in/out: transform + filter on the picture, and flash/wash overlays. */
const transitionFx = (scene: SceneV2, next: SceneV2 | undefined, lf: number, segF: number, fps: number, width: number) => {
  let transform = "";
  let filter = "";
  let overlay: React.CSSProperties | null = null;
  const left = segF - lf; // frames until the next scene
  // outgoing
  if (next && next.transitionIn === "whip" && left <= k30(3, fps)) {
    const p = interpolate(k30(3, fps) - left, [0, k30(3, fps)], [0, 1], clamp);
    transform += ` translateX(${-p * width * 0.35}px)`;
    filter += ` blur(${p * 24}px)`;
  }
  if (next && next.transitionIn === "zoomThrough" && left <= k30(6, fps)) {
    const p = interpolate(k30(6, fps) - left, [0, k30(6, fps)], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
    transform += ` scale(${1 + 0.8 * p})`;
    filter += ` blur(${p * 18}px)`;
  }
  if (next && next.transitionIn === "flash" && scene.kind === "fullscreen" && left <= k30(6, fps)) {
    // fly-through: rush into the hero object before the flash (AFTER_001 4.83-5.03)
    const p = interpolate(k30(6, fps) - left, [0, k30(6, fps)], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
    transform += ` scale(${1 + 1.6 * p})`;
    filter += ` blur(${p * 26}px)`;
  }
  // incoming
  const n = scene.transitionIn;
  if (n === "whip" && lf < k30(4, fps)) {
    const p = interpolate(lf, [0, k30(4, fps)], [1, 0], { ...clamp, easing: out });
    transform += ` translateX(${p * width * 0.35}px)`;
    filter += ` blur(${p * 24}px)`;
  }
  if (n === "zoomThrough" && lf < k30(5, fps)) {
    const p = interpolate(lf, [0, k30(5, fps)], [1, 0], { ...clamp, easing: out });
    transform += ` scale(${1 + 0.15 * p})`;
    filter += ` blur(${p * 14}px)`;
  }
  if (n === "flash") {
    const fl = Math.floor((lf * 30) / fps);
    if (fl === 0) overlay = { background: "#FFFFFF" };
    else if (fl === 1) {
      filter += " invert(1) brightness(0.6)";
    } else if (fl === 2) overlay = { background: "rgba(255,255,255,0.55)" };
  }
  if (n === "whiteWash" && lf < k30(6, fps)) {
    overlay = { background: `rgba(255,255,255,${interpolate(lf, [0, k30(6, fps)], [1, 0], clamp)})` };
  }
  if (n === "dip" && lf < k30(1, fps)) overlay = { background: "#000" };
  return { transform: transform.trim(), filter: filter.trim(), overlay };
};

export const ReelV2: React.FC<ReelV2Props> = ({ edit, captions }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (!edit) return null;
  const t = frame / fps;
  const si = indexAt(edit.scenes, t);
  const scene = edit.scenes[si];
  const next = edit.scenes[si + 1];
  const sceneStartF = Math.round(scene.start * fps);
  const segF = Math.round((scene.end - scene.start) * fps);
  const lf = frame - sceneStartF;
  const shot = edit.shots[indexAt(edit.shots, t)];
  const cam = camera(edit, shot, t, fps, width, height);
  const bg = bgAmount(scene, lf, fps);
  const fx = transitionFx(scene, next, lf, segF, fps, width);
  const roomVisible = scene.kind === "aroll";

  // Card hook: the A-roll shrinks into a floating rounded card (AFTER_001 0.55-2.95).
  const cardS =
    scene.kind === "card"
      ? interpolate(lf, [0, k30(9, fps)], [1, 0.78], { ...clamp, easing: out }) - 0.05 * interpolate(lf, [k30(9, fps), segF], [0, 1], clamp)
      : 1;
  const cardFloat = scene.kind === "card" ? 8 * Math.sin(t * 1.7) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill style={{ transform: fx.transform || undefined, filter: fx.filter || undefined }}>
        {/* the room: continuous master audio, always mounted */}
        <AbsoluteFill style={{ opacity: roomVisible ? 1 : 0 }}>
          <AbsoluteFill
            style={{
              transform: cam.transform,
              transformOrigin: cam.origin,
              filter: roomVisible && (bg.blur > 0 || bg.darken > 0) ? `blur(${bg.blur}px) brightness(${1 - bg.darken})` : undefined,
            }}
          >
            <SourceVideo src={edit.source} keep={edit.keep} fps={fps} volume={edit.voiceVolume} />
          </AbsoluteFill>
          {bg.white > 0 && <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(255,255,255,${bg.white}) 0%, rgba(240,244,248,${bg.white}) 100%)` }} />}
          {bg.tint > 0 && (
            <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 60% at 50% 35%, ${bg.tintColor}99 0%, ${bg.tintColor} 70%)`, opacity: bg.tint, mixBlendMode: "multiply" }} />
          )}
        </AbsoluteFill>

        {scene.kind !== "aroll" && <FullBackground kind={scene.bg.kind} lf={lf} fps={fps} />}

        <Sequence from={sceneStartF} durationInFrames={segF} layout="none" name={`${scene.id} back`}>
          <SceneLayer scene={scene} layer="back" width={width} height={height} />
        </Sequence>

        {scene.kind === "card" && (
          <AbsoluteFill style={{ transform: `translateY(${cardFloat}px) scale(${cardS})` }}>
            <AbsoluteFill style={{ borderRadius: 72 / cardS, overflow: "hidden", boxShadow: "0 40px 80px rgba(0,0,0,0.45)" }}>
              <AbsoluteFill style={{ transform: cam.transform, transformOrigin: cam.origin }}>
                <SourceVideo src={edit.source} keep={edit.keep} fps={fps} muted />
              </AbsoluteFill>
            </AbsoluteFill>
          </AbsoluteFill>
        )}

        {needsMatte(scene) && (
          <AbsoluteFill style={{ transform: cam.transform, transformOrigin: cam.origin }}>
            <SourceVideo src={edit.matte} keep={edit.keep} fps={fps} muted transparent />
          </AbsoluteFill>
        )}

        <Sequence from={sceneStartF} durationInFrames={segF} layout="none" name={`${scene.id} front`}>
          <SceneLayer scene={scene} layer="front" width={width} height={height} />
        </Sequence>
      </AbsoluteFill>

      {fx.overlay && <AbsoluteFill style={fx.overlay} />}
      {captions && scene.captions && <CaptionsV2 data={captions} edit={edit} t={t} width={width} height={height} />}
      <SfxTrack sfx={edit.sfx} fps={fps} />
    </AbsoluteFill>
  );
};
