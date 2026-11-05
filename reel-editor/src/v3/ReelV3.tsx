import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { SfxTrack } from "../components/SfxTrack";
import { SourceVideo } from "../components/SourceVideo";
import type { Captions as CaptionsData } from "../schema";
import { CaptionsV3 } from "./CaptionsV3";
import { ElementV3View } from "./ElementsV3";
import type { EditV3, SceneV3 } from "./schema";
import { C } from "./theme";

// Renderer for edit_v3.json (style: learner/shrihari-ref/style-dna/rovix-comparison).
// A-roll with hard-cut punch-ins; full-screen scenes in a warm cream studio world; a 1-2 frame white flash into
// every visual (the last A-roll frame blows out, then the scene builds out of white), hard cuts back.

export type ReelV3Props = { project: string; edit?: EditV3; captions?: CaptionsData | null };

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

const indexAt = <T extends { start: number }>(list: T[], t: number) => {
  let i = 0;
  for (let k = 0; k < list.length; k++) if (list[k].start <= t + 1e-6) i = k;
  return i;
};

/** Warm cream studio: radial glow, vignette, faint gold dot grid that fades toward the edges. */
const Studio: React.FC<{ t: number }> = ({ t }) => {
  const g = 46 + 3 * Math.sin(t * 1.1);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 85% 60% at 50% 42%, #FFFDF8 0%, ${C.paper} ${g}%, #E4D6BE 100%)` }} />
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(circle, ${C.gold}66 2.2px, transparent 2.6px)`,
          backgroundSize: "96px 96px",
          backgroundPosition: "48px 30px",
          WebkitMaskImage: "radial-gradient(ellipse 60% 45% at 50% 45%, black 0%, transparent 100%)",
          maskImage: "radial-gradient(ellipse 60% 45% at 50% 45%, black 0%, transparent 100%)",
          opacity: 0.8,
        }}
      />
      <AbsoluteFill style={{ boxShadow: "inset 0 0 260px rgba(120,85,40,0.28)" }} />
    </AbsoluteFill>
  );
};

const musicVolume = (edit: EditV3, t: number) => {
  const m = edit.music!;
  let v = m.volume;
  for (const [a, b, vol] of m.lifts) {
    const up = interpolate(t, [a - 0.25, a, b, b + 0.35], [0, 1, 1, 0], clamp);
    v = v + (vol - m.volume) * up;
  }
  const fin = interpolate(t, [0, m.fadeIn], [0, 1], clamp);
  const fout = interpolate(t, [edit.duration - m.fadeOut, edit.duration], [1, 0], clamp);
  return Math.max(0, v * fin * fout);
};

export const ReelV3: React.FC<ReelV3Props> = ({ edit, captions }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (!edit) return null;
  const t = frame / fps;
  const si = indexAt(edit.scenes, t);
  const scene: SceneV3 = edit.scenes[si];
  const next = edit.scenes[si + 1];
  const lf = frame - Math.round(scene.start * fps);
  const left = Math.round(scene.end * fps) - frame; // frames until the next scene
  const st = t - scene.start;
  const segDur = scene.end - scene.start;
  const showRoom = scene.kind !== "fullscreen";

  // A-roll framing: hard-cut punch-in
  const zoom = scene.punch && st >= scene.punch.at ? scene.punch.zoom : scene.zoom;

  // flash in: frame 0 white, then the scene builds out of white over ~5 frames (at 30fps)
  const f30 = (lf * 30) / fps;
  let white = 0;
  let contentBlur = 0;
  if (scene.transitionIn === "flash" && lf >= 0) {
    if (f30 < 1) white = 1;
    else {
      white = interpolate(f30, [1, 6], [0.85, 0], clamp);
      contentBlur = interpolate(f30, [1, 6], [12, 0], clamp);
    }
  }
  // the last A-roll frame before a flash blows out
  const blowOut = next?.transitionIn === "flash" && left <= 1 && showRoom;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* the room: continuous master audio, always mounted */}
      <AbsoluteFill style={{ opacity: showRoom ? 1 : 0, filter: blowOut ? "brightness(1.9) saturate(0.6)" : undefined }}>
        <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: `${edit.framing.faceX * 100}% ${edit.framing.faceY * 100}%` }}>
          <SourceVideo src={edit.source} keep={edit.keep} fps={fps} volume={edit.voiceVolume} />
        </AbsoluteFill>
      </AbsoluteFill>

      {scene.kind === "fullscreen" && <Studio t={t} />}

      <AbsoluteFill style={{ filter: contentBlur ? `blur(${contentBlur}px)` : undefined }}>
        {scene.elements.map((el, i) => (
          <ElementV3View key={`${scene.id}-${i}`} el={el} t={st} fps={fps} W={width} H={height} segDur={segDur} />
        ))}
      </AbsoluteFill>

      {white > 0 && <AbsoluteFill style={{ background: `rgba(255,253,248,${white})` }} />}

      {captions && scene.captions && (
        <CaptionsV3 data={captions} edit={edit} t={t} fps={fps} width={width} height={height} onScene={scene.kind === "fullscreen"} />
      )}

      {edit.music && (
        <Audio
          src={staticFile(edit.music.src)}
          trimBefore={Math.round(edit.music.startAt * fps)}
          volume={(f) => musicVolume(edit, f / fps)}
        />
      )}
      <SfxTrack sfx={edit.sfx} fps={fps} />
    </AbsoluteFill>
  );
};
