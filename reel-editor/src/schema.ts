import { z } from "zod";

// All times are seconds on the OUTPUT timeline. Positions are fractions of the frame
// (x = 0 left .. 1 right, y = 0 top .. 1 bottom); x/y is the element's centre.

export const enterTypes = [
  "none",
  "fade",
  "pop",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "drop",
  "type-on",
  "draw",
] as const;

const Enter = z.object({
  type: z.enum(enterTypes).default("pop"),
  at: z.number().default(0), // seconds after the segment starts
  frames: z.number().optional(), // override the default duration
});

const Exit = z.object({
  type: z.enum(["fade", "slide-left", "slide-right", "slide-up", "slide-down"]).default("fade"),
  at: z.number(), // seconds after the segment starts
  frames: z.number().optional(),
});

const base = {
  x: z.number().default(0.5),
  y: z.number().default(0.5),
  w: z.number().default(0.6), // width as a fraction of frame width
  rotate: z.number().default(0),
  enter: Enter.optional(),
  exit: Exit.optional(), // physical exits (slide out of frame) or a fade
  until: z.number().optional(), // shorthand for exit: { type: "fade", at: until }
  z: z.number().default(0), // >= 10 draws above the cut-out presenter
};

const ImageEl = z.object({
  type: z.literal("image"),
  src: z.string(), // path under public/
  border: z.boolean().default(false), // white paper border around a cutout
  shadow: z.boolean().default(true),
  kenburns: z.number().default(0), // extra scale reached by the end of the segment, e.g. 0.06
  ...base,
});

const VideoEl = z.object({
  type: z.literal("video"),
  src: z.string(),
  h: z.number().default(0.5), // height as a fraction of frame height
  radius: z.number().default(0),
  border: z.boolean().default(false),
  ...base,
});

const TextEl = z.object({
  type: z.literal("text"),
  text: z.string(), // wrap words in *asterisks* to use the accent colour
  font: z.enum(["serif", "sans", "mono", "hand"]).default("serif"),
  size: z.number().default(96), // px at 1080 wide
  color: z.string().optional(),
  accent: z.string().optional(),
  align: z.enum(["left", "center", "right"]).default("center"),
  weight: z.number().optional(),
  italic: z.boolean().default(false),
  lineHeight: z.number().default(1.05),
  ...base,
});

const LabelEl = z.object({
  type: z.literal("label"), // label-maker / typewriter strip
  text: z.string(),
  size: z.number().default(44),
  bg: z.string().optional(),
  color: z.string().optional(),
  ...base,
});

const CounterEl = z.object({
  type: z.literal("counter"),
  from: z.number(),
  to: z.number(),
  decimals: z.number().default(0),
  prefix: z.string().default(""),
  suffix: z.string().default(""),
  seconds: z.number().default(1.2), // how long the count takes
  font: z.enum(["serif", "sans", "mono", "hand"]).default("sans"),
  size: z.number().default(140),
  color: z.string().optional(),
  ...base,
});

const AnnotationEl = z.object({
  type: z.literal("annotation"), // hand-drawn mark
  kind: z.enum(["circle", "underline", "arrow"]),
  h: z.number().default(0.1),
  color: z.string().optional(),
  stroke: z.number().default(9),
  ...base,
});

const ComponentEl = z.object({
  type: z.literal("component"), // a custom TSX scene registered in src/custom/index.ts
  name: z.string(),
  props: z.record(z.string(), z.unknown()).default({}),
  ...base,
});

export const ElementSchema = z.discriminatedUnion("type", [
  ImageEl,
  VideoEl,
  TextEl,
  LabelEl,
  CounterEl,
  AnnotationEl,
  ComponentEl,
]);
export type Element = z.infer<typeof ElementSchema>;

export const BackgroundSchema = z.object({
  kind: z.enum(["paper", "dark", "color", "halftone", "gradient", "image", "video"]).default("paper"),
  color: z.string().optional(),
  color2: z.string().optional(), // gradient end
  src: z.string().optional(),
  kenburns: z.number().default(0.05),
  grain: z.boolean().default(true),
});
export type Background = z.infer<typeof BackgroundSchema>;

export const layouts = ["aroll", "header", "bgswap", "fullscreen", "overlay", "pip"] as const;
export type Layout = (typeof layouts)[number];

export const SegmentSchema = z.object({
  id: z.string(),
  start: z.number(),
  end: z.number(),
  layout: z.enum(layouts),
  why: z.string().default(""), // the line / trigger that justified this layout
  transitionIn: z.enum(["cut", "paper-wipe"]).default("cut"),
  captions: z.boolean().default(true),
  background: BackgroundSchema.optional(),
  elements: z.array(ElementSchema).default([]),
  // aroll / overlay
  zoom: z.number().default(1), // punch-in on the A-roll, e.g. 1.12
  blurAroll: z.boolean().default(false), // overlay: blur the A-roll behind the element
  // header
  panelHeight: z.number().default(0.4),
  presenterInFront: z.boolean().default(true), // needs matte; head crosses the torn edge
  // bgswap
  presenterScale: z.number().default(1),
  presenterY: z.number().default(0), // extra downward shift (fraction of height)
  // pip
  pip: z
    .object({
      corner: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).default("top-right"),
      size: z.number().default(0.3), // bubble diameter as a fraction of frame width
      shape: z.enum(["circle", "rounded"]).default("circle"),
    })
    .default({ corner: "top-right", size: 0.3, shape: "circle" }),
});
export type Segment = z.infer<typeof SegmentSchema>;

// A sound effect on the output timeline. Files live in public/sfx/ (see manifest.json there).
export const SfxSchema = z.object({
  sound: z.string(), // file name without .mp3, e.g. "whoosh-short"
  at: z.number(), // output seconds
  volume: z.number().default(0.3),
  trimBefore: z.number().optional(), // seconds cut from the start of the file (e.g. play only a riser's crest)
  why: z.string().optional(),
});
export type Sfx = z.infer<typeof SfxSchema>;

export const EditSchema = z.object({
  version: z.literal(1).default(1),
  brand: z.string(),
  source: z.string(), // under public/, e.g. projects/glp1-raw/source.mp4
  matte: z.string().optional(), // transparent WebM, same timing as source
  captions: z.string().optional(), // captions.json under public/
  fps: z.number(),
  width: z.number().default(1080),
  height: z.number().default(1920),
  duration: z.number(), // output seconds
  // Source ranges to keep, in order. Omit to use the whole source.
  keep: z.array(z.tuple([z.number(), z.number()])).optional(),
  framing: z
    .object({
      headTop: z.number().default(0.2), // top of the head, fraction of height, in the untouched A-roll
      faceX: z.number().default(0.5),
      faceY: z.number().default(0.3), // face centre, used for punch-ins and the PiP bubble
      faceSize: z.number().default(0.22), // face height as a fraction of frame height
    })
    .default({ headTop: 0.2, faceX: 0.5, faceY: 0.3, faceSize: 0.22 }),
  segments: z.array(SegmentSchema),
  voiceVolume: z.number().default(1), // the source audio; lower it when SFX push the mix into clipping
  sfx: z.array(SfxSchema).default([]),
});
export type Edit = z.infer<typeof EditSchema>;

export const CaptionsSchema = z.object({
  chunks: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      words: z.array(z.object({ text: z.string(), start: z.number(), end: z.number() })),
    }),
  ),
});
export type Captions = z.infer<typeof CaptionsSchema>;
