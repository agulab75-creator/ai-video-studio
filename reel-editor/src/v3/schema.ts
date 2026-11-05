import { z } from "zod";
import { SfxSchema } from "../schema";

// edit_v3.json — the "rovix-comparison" style (learner/shrihari-ref/style-dna/rovix-comparison), tinted by the
// client brand. Scene times are OUTPUT seconds; element times (`at`, `until`) are seconds after the scene starts;
// keyword and music times are OUTPUT seconds. Positions are fractions of the frame (x/y = element centre).

const base = {
  x: z.number().default(0.5),
  y: z.number().default(0.5),
  w: z.number().default(0.4), // width as a fraction of frame width
  rotate: z.number().default(0),
  at: z.number().default(0),
  until: z.number().optional(), // blur-fade out at this time
  z: z.number().default(0),
};

const pt = z.tuple([z.number(), z.number()]);

export const ElementV3Schema = z.discriminatedUnion("type", [
  // A cut-out object that floats (slow sine bob). Optional move (ease-out, then stops) and flip (rotation).
  z.object({
    type: z.literal("object"),
    src: z.string(),
    enter: z.enum(["rise", "pop", "blur", "slideLeft", "slideRight", "drop", "none"]).default("blur"),
    float: z.number().default(8),
    period: z.number().default(3.4),
    blur: z.number().default(0),
    shadow: z.boolean().default(true),
    glow: z.string().optional(), // warm light behind the object
    move: z.object({ to: pt, at: z.number(), dur: z.number() }).optional(),
    flip: z.object({ at: z.number(), deg: z.number().default(180), dur: z.number().default(0.5) }).optional(),
    scaleTo: z.number().optional(), // slow push over the scene
    ...base,
  }),
  // Coins as particles: spill (burst from a point and fall), pour (stream into a point), fly (rush past, blurred)
  z.object({
    type: z.literal("coins"),
    src: z.string(),
    mode: z.enum(["spill", "pour", "fly"]),
    count: z.number().default(8),
    seed: z.number().default(1),
    from: pt,
    to: pt,
    dur: z.number().default(1.2),
    size: z.number().default(0.09),
    ...base,
  }),
  // The mulank coin card: brass coins stamped with the numbers, each landing on its spoken time.
  z.object({
    type: z.literal("coinRow"),
    src: z.string(),
    numbers: z.array(z.number()),
    times: z.array(z.number()),
    color: z.string(),
    label: z.string().default("MULANK"),
    ...base,
  }),
  // A stack revealed from the bottom in steps (it grows).
  z.object({ type: z.literal("stack"), src: z.string(), dur: z.number().default(2), steps: z.number().default(6), ...base }),
  // Small paper tag with tracked caps (calendar page).
  z.object({ type: z.literal("tag"), text: z.string(), color: z.string(), ...base }),
  // Recap: three groups side by side, each drawing its own line.
  z.object({
    type: z.literal("pattern"),
    src: z.string(),
    groups: z.array(z.object({ numbers: z.array(z.number()), color: z.string(), shape: z.enum(["rise", "steady", "pause"]), at: z.number() })),
    ...base,
  }),
  // CTA: comment bubble with the three groups as chips, then a follow button pressed.
  z.object({
    type: z.literal("cta"),
    chips: z.array(z.object({ text: z.string(), color: z.string() })),
    followAt: z.number(),
    ...base,
  }),
  z.object({ type: z.literal("tick"), color: z.string(), ...base }),
  z.object({ type: z.literal("qmark"), color: z.string(), size: z.number().default(360), ...base }),
  // Teaser: a 3x3 grid of numbered coins that flip face-down one by one.
  z.object({
    type: z.literal("coinFlip"),
    front: z.string(),
    back: z.string(),
    numbers: z.array(z.number()),
    flipAt: z.number(),
    stagger: z.number().default(0.08),
    colors: z.array(z.string()), // one per number (group colour)
    ...base,
  }),
]);
export type ElementV3 = z.infer<typeof ElementV3Schema>;

export const SceneV3Schema = z.object({
  id: z.string(),
  start: z.number(),
  end: z.number(),
  kind: z.enum(["aroll", "fullscreen", "overlay"]).default("aroll"),
  why: z.string().default(""),
  transitionIn: z.enum(["cut", "flash"]).default("cut"),
  captions: z.boolean().default(true),
  zoom: z.number().default(1), // A-roll framing (hard-cut punch-ins, Rovix)
  punch: z.object({ at: z.number(), zoom: z.number() }).optional(), // hard-cut to a tighter framing mid-scene
  elements: z.array(ElementV3Schema).default([]),
});
export type SceneV3 = z.infer<typeof SceneV3Schema>;

export const KeywordSchema = z.object({
  text: z.string(),
  at: z.number(), // output seconds: blur-in starts
  until: z.number().optional(), // default: next keyword or at + 2.2
  color: z.string(),
  hide: z.tuple([z.number(), z.number()]).optional(), // caption words starting in this range move into the keyword
  strikeAt: z.number().optional(), // output seconds: a line is drawn through
  size: z.number().default(128),
});

export const MusicSchema = z.object({
  src: z.string(),
  volume: z.number().default(0.1),
  startAt: z.number().default(0), // seconds into the track
  fadeIn: z.number().default(0.6),
  fadeOut: z.number().default(1.2),
  lifts: z.array(z.tuple([z.number(), z.number(), z.number()])).default([]), // [from, to, volume] output seconds
});

export const EditV3Schema = z.object({
  version: z.literal(3),
  style: z.string().default("rovix-comparison"),
  brand: z.string(),
  source: z.string(),
  matte: z.string().optional(),
  captions: z.string(),
  fps: z.number(),
  width: z.number().default(1080),
  height: z.number().default(1920),
  duration: z.number(),
  keep: z.array(z.tuple([z.number(), z.number()])).optional(),
  framing: z.object({ faceX: z.number(), faceY: z.number(), headTop: z.number() }),
  captionStyle: z.object({ y: z.number().default(0.74), size: z.number().default(48) }).default({ y: 0.74, size: 48 }),
  keywords: z.array(KeywordSchema).default([]),
  scenes: z.array(SceneV3Schema),
  music: MusicSchema.optional(),
  voiceVolume: z.number().default(1),
  sfx: z.array(SfxSchema).default([]),
});
export type EditV3 = z.infer<typeof EditV3Schema>;
