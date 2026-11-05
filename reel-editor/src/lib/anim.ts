import { Easing, interpolate } from "remotion";
import type { enterTypes } from "../schema";

export const easeOut = Easing.out(Easing.cubic);
export const easeIn = Easing.in(Easing.cubic);

// Default entrance lengths in frames at 30 fps, measured from the Ali Abdaal strips
// (header 4-10 frames, pops ~6, paper wipe ~6). No overshoot anywhere.
const DEFAULT_FRAMES: Record<(typeof enterTypes)[number], number> = {
  none: 0,
  fade: 8,
  pop: 7,
  "slide-up": 9,
  "slide-down": 9,
  "slide-left": 9,
  "slide-right": 9,
  drop: 10,
  "type-on": 0, // depends on text length
  draw: 14,
};

export const at30 = (frames: number, fps: number) => Math.max(1, Math.round((frames * fps) / 30));

export const enterFrames = (type: (typeof enterTypes)[number], fps: number, override?: number) =>
  override ?? at30(DEFAULT_FRAMES[type], fps);

export type EnterStyle = { opacity: number; transform: string; progress: number };

/** Style for an element `f` frames after its entrance starts. */
export const enterStyle = (
  type: (typeof enterTypes)[number],
  f: number,
  fps: number,
  override?: number,
): EnterStyle => {
  if (type === "none" || type === "type-on" || type === "draw") {
    return { opacity: f < 0 ? 0 : 1, transform: "", progress: f < 0 ? 0 : 1 };
  }
  const n = enterFrames(type, fps, override);
  const p = interpolate(f, [0, n], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const opacity = f < 0 ? 0 : type === "drop" ? 1 : Math.min(1, p * 1.6);
  const d = (1 - p) * 90;
  switch (type) {
    case "pop":
      return { opacity, transform: `scale(${0.86 + 0.14 * p})`, progress: p };
    case "slide-up":
      return { opacity, transform: `translateY(${d}px)`, progress: p };
    case "slide-down":
      return { opacity, transform: `translateY(${-d}px)`, progress: p };
    case "slide-left":
      return { opacity, transform: `translateX(${d * 1.3}px)`, progress: p };
    case "slide-right":
      return { opacity, transform: `translateX(${-d * 1.3}px)`, progress: p };
    case "drop":
      return { opacity: f < 0 ? 0 : 1, transform: `translateY(${-(1 - p) * 1400}px)`, progress: p };
    default:
      return { opacity, transform: "", progress: p };
  }
};

/** Exit: fade, or slide out of frame (accelerating, like being pushed). `f` = frames since segment start. */
export const exitStyle = (
  type: "fade" | "slide-left" | "slide-right" | "slide-up" | "slide-down" | undefined,
  f: number,
  exitFrame: number | undefined,
  fps: number,
  override?: number,
): { opacity: number; transform: string } => {
  if (type === undefined || exitFrame === undefined) return { opacity: 1, transform: "" };
  const n = override ?? at30(type === "fade" ? 6 : 11, fps);
  const p = interpolate(f, [exitFrame, exitFrame + n], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeIn });
  const d = p * 1500;
  switch (type) {
    case "fade":
      return { opacity: 1 - p, transform: "" };
    case "slide-left":
      return { opacity: 1, transform: `translateX(${-d}px)` };
    case "slide-right":
      return { opacity: 1, transform: `translateX(${d}px)` };
    case "slide-up":
      return { opacity: 1, transform: `translateY(${-d}px)` };
    case "slide-down":
      return { opacity: 1, transform: `translateY(${d}px)` };
  }
};

/** Deterministic pseudo-random in [0,1) for torn edges etc. */
export const rand = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
