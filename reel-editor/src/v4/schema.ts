import { z } from "zod";
import { EditSchema, layouts, SegmentSchema } from "../schema";

// v4 "paper cut" renderer: the v1 edit.json plus a sticker presenter, paper transitions and
// stop-motion stepping. Same file (edit.json), rendered by the ReelPaper composition.

export const PaperSegmentSchema = SegmentSchema.extend({
  layout: z.enum([...layouts, "sticker"]),
  transitionIn: z.enum(["cut", "paper-wipe", "page-flip", "slide-left", "slide-up", "pop-up"]).default("cut"),
  // paper desk behind fullscreen / sticker / bgswap segments
  desk: z
    .object({ color: z.string().default("#F4EEE3"), pattern: z.enum(["none", "grid"]).default("none") })
    .default({ color: "#F4EEE3", pattern: "none" }),
  // the cut-out presenter as a die-cut sticker: x/y = where the bottom-centre of his body lands
  sticker: z
    .object({ x: z.number().default(0.5), y: z.number().default(0.95), scale: z.number().default(0.8), rotate: z.number().default(0) })
    .default({ x: 0.5, y: 0.95, scale: 0.8, rotate: 0 }),
  stepped: z.boolean().default(true), // graphics animate on twos with a boil
});
export type PaperSegment = z.infer<typeof PaperSegmentSchema>;

export const PaperEditSchema = EditSchema.extend({ segments: z.array(PaperSegmentSchema) });
export type PaperEdit = z.infer<typeof PaperEditSchema>;
