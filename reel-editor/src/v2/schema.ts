import { z } from "zod";
import { SfxSchema } from "../schema";

// edit_v2.json — the "atlasian-clinic-3d" style (learner/klickpin-ref/style-dna/atlasian-clinic-3d).
// Times are output seconds; element times (`at`) are seconds after the scene starts.
// Positions are fractions of the frame (x/y = element centre); w = width as a fraction of frame width.

// Camera on the A-roll: a crop that pushes in slowly. Shots are independent of scenes so the camera
// keeps moving across graphic changes; a new shot = a new "angle".
export const ShotSchema = z.object({
  start: z.number(),
  end: z.number(),
  scale: z.number().default(1), // crop at the shot's start
  push: z.number().default(0.05), // extra scale reached by the end (ambient push-in)
  punch: z.number().optional(), // fast punch-in: reach scale+punch in `punchFrames` then keep drifting
  punchFrames: z.number().default(12),
  cx: z.number().optional(), // focus point; default framing.faceX/faceY
  cy: z.number().optional(),
  dx: z.number().default(0), // horizontal drift in px over the shot
});

const glow = z.boolean().default(true);

const TitleLine = z.object({
  text: z.string(),
  font: z.enum(["serif", "serifItalic", "grotesk", "tracked", "sans"]).default("grotesk"),
  size: z.number().default(120),
  color: z.string().default("#FFFFFF"),
  at: z.number().default(0),
  anim: z.enum(["blurIn", "tracking", "type", "rise", "none"]).default("blurIn"),
  strikeAt: z.number().optional(), // a red line is drawn through the line
  strikeColor: z.string().default("#FF3B30"),
});

const base = {
  x: z.number().default(0.5),
  y: z.number().default(0.5),
  w: z.number().default(0.5),
  rotate: z.number().default(0),
  at: z.number().default(0),
  until: z.number().optional(), // fade out at this time (scene-relative)
  behind: z.boolean().default(false), // drawn behind the presenter (needs matte)
};

export const ElementV2Schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("title"), lines: z.array(TitleLine), align: z.enum(["left", "center", "right"]).default("center"), glow, lineGap: z.number().default(0.95), ...base }),
  z.object({
    type: z.literal("object"), // a cut-out "3D" object, floating
    src: z.string(),
    blur: z.number().default(0), // depth-of-field blur, px
    float: z.number().default(10), // float amplitude, px
    period: z.number().default(3.2),
    enter: z.enum(["pop", "rise", "slideLeft", "slideRight", "flyIn", "none"]).default("pop"),
    shadow: z.boolean().default(true),
    glowColor: z.string().optional(),
    dimAt: z.number().optional(), // desaturate + darken ("it doesn't work")
    ...base,
  }),
  z.object({
    type: z.literal("tile"), // solid colour square holding an object (hook collage)
    src: z.string(),
    color: z.string().default("#D32F2F"),
    enter: z.enum(["slideLeft", "slideRight", "flip", "rise"]).default("slideLeft"),
    ...base,
  }),
  z.object({
    type: z.literal("pill"),
    text: z.string(),
    color: z.string().default("#39C6FF"), // stroke + glow
    solid: z.boolean().default(false), // solid red pill (problems) vs glass pill (benefits)
    icon: z.string().optional(),
    size: z.number().default(46),
    from: z.enum(["right", "left", "below"]).default("right"),
    ...base,
  }),
  z.object({ type: z.literal("check"), cross: z.boolean().default(false), color: z.string().optional(), lines: z.array(z.object({ text: z.string(), size: z.number().default(78), at: z.number().default(0) })).default([]), ...base }),
  z.object({ type: z.literal("ring"), color: z.string().default("#39C6FF"), icon: z.string().optional(), ...base }),
  z.object({
    type: z.literal("callout"), // leader line + words typed one by one
    words: z.array(z.object({ text: z.string(), at: z.number() })),
    to: z.tuple([z.number(), z.number()]), // where the line points (frame fractions)
    color: z.string().default("#FF3B30"),
    size: z.number().default(64),
    ...base,
  }),
  z.object({ type: z.literal("video"), src: z.string(), h: z.number().default(1), ...base }),
  z.object({ type: z.literal("form"), color: z.string().default("#FF7A1A"), fillAt: z.number().default(0.7), ...base }),
]);
export type ElementV2 = z.infer<typeof ElementV2Schema>;

export const transitionTypes = ["cut", "whip", "flash", "zoomThrough", "flyThrough", "whiteWash", "dip"] as const;

export const SceneV2Schema = z.object({
  id: z.string(),
  start: z.number(),
  end: z.number(),
  kind: z.enum(["aroll", "card", "fullscreen"]).default("aroll"),
  why: z.string().default(""),
  transitionIn: z.enum(transitionTypes).default("cut"),
  captions: z.boolean().default(true),
  // background behind the presenter (aroll) or the whole frame (fullscreen/card)
  bg: z
    .object({
      blur: z.number().default(0), // aroll: blur the room (presenter stays sharp via matte)
      darken: z.number().default(0), // 0..1
      white: z.number().default(0), // 0..1 wash the room to white
      tint: z.number().default(0), // 0..1 colour-grade the room toward tintColor (presenter untouched)
      tintColor: z.string().default("#0A2A4A"),
      at: z.number().default(0), // when the treatment starts
      frames: z.number().default(8),
      kind: z.enum(["room", "dark", "light", "white"]).default("room"),
    })
    .default({ blur: 0, darken: 0, white: 0, tint: 0, tintColor: "#0A2A4A", at: 0, frames: 8, kind: "room" }),
  elements: z.array(ElementV2Schema).default([]),
});
export type SceneV2 = z.infer<typeof SceneV2Schema>;

export const AccentSchema = z.object({
  word: z.string(), // matched case-insensitively against caption words
  color: z.string(),
  from: z.number().optional(), // only between these output times
  to: z.number().optional(),
});

export const EditV2Schema = z.object({
  version: z.literal(2),
  style: z.string().default("atlasian-clinic-3d"),
  brand: z.string(),
  source: z.string(),
  matte: z.string(),
  captions: z.string(),
  fps: z.number(),
  width: z.number().default(1080),
  height: z.number().default(1920),
  duration: z.number(),
  keep: z.array(z.tuple([z.number(), z.number()])).optional(),
  framing: z.object({ faceX: z.number(), faceY: z.number(), headTop: z.number() }),
  captionStyle: z
    .object({ y: z.number().default(0.585), size: z.number().default(66), maxWords: z.number().default(3) })
    .default({ y: 0.585, size: 66, maxWords: 3 }),
  accents: z.array(AccentSchema).default([]),
  shots: z.array(ShotSchema),
  scenes: z.array(SceneV2Schema),
  voiceVolume: z.number().default(1),
  sfx: z.array(SfxSchema).default([]),
});
export type EditV2 = z.infer<typeof EditV2Schema>;
