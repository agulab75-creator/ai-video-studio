import React from "react";
import { CalculateMetadataFunction, Composition, staticFile } from "remotion";
import { z } from "zod";
import { Reel, type ReelProps } from "./Reel";
import { CaptionsSchema, EditSchema } from "./schema";
import { ReelV2, type ReelV2Props } from "./v2/ReelV2";
import { EditV2Schema } from "./v2/schema";
import { ReelV3, type ReelV3Props } from "./v3/ReelV3";
import { EditV3Schema } from "./v3/schema";
import { ReelPaper, type ReelPaperProps } from "./v4/ReelPaper";
import { PaperEditSchema } from "./v4/schema";

// One composition for every reel: pick the project folder under public/projects/.
//   npx remotion render Reel out/<project>.mp4 --props='{"project":"glp1-raw"}'
const propsSchema = z.object({ project: z.string() });

const calculateMetadata: CalculateMetadataFunction<ReelProps> = async ({ props }) => {
  const base = `projects/${props.project}`;
  const res = await fetch(staticFile(`${base}/edit.json`));
  if (!res.ok) throw new Error(`No ${base}/edit.json in public/`);
  const edit = EditSchema.parse(await res.json());
  const captions = edit.captions
    ? CaptionsSchema.parse(await (await fetch(staticFile(edit.captions))).json())
    : null;
  return {
    durationInFrames: Math.round(edit.duration * edit.fps),
    fps: edit.fps,
    width: edit.width,
    height: edit.height,
    props: { ...props, edit, captions },
  };
};

// v2: the atlasian-clinic-3d style, driven by edit_v2.json.
//   npx remotion render ReelV2 out/<project>.mp4 --props='{"project":"lead-01"}'
const calculateMetadataV2: CalculateMetadataFunction<ReelV2Props> = async ({ props }) => {
  const base = `projects/${props.project}`;
  const res = await fetch(staticFile(`${base}/edit_v2.json`));
  if (!res.ok) throw new Error(`No ${base}/edit_v2.json in public/`);
  const edit = EditV2Schema.parse(await res.json());
  const captions = CaptionsSchema.parse(await (await fetch(staticFile(edit.captions))).json());
  return {
    durationInFrames: Math.round(edit.duration * edit.fps),
    fps: edit.fps,
    width: edit.width,
    height: edit.height,
    props: { ...props, edit, captions },
  };
};

// v3: the rovix-comparison style + client brand, driven by edit_v3.json.
//   npx remotion render ReelV3 out/<project>.mp4 --props='{"project":"oct-mulank"}'
const calculateMetadataV3: CalculateMetadataFunction<ReelV3Props> = async ({ props }) => {
  const base = `projects/${props.project}`;
  const res = await fetch(staticFile(`${base}/edit_v3.json`));
  if (!res.ok) throw new Error(`No ${base}/edit_v3.json in public/`);
  const edit = EditV3Schema.parse(await res.json());
  const captions = CaptionsSchema.parse(await (await fetch(staticFile(edit.captions))).json());
  return {
    durationInFrames: Math.round(edit.duration * edit.fps),
    fps: edit.fps,
    width: edit.width,
    height: edit.height,
    props: { ...props, edit, captions },
  };
};

// v4: the paper-cut look (sticker presenter, page flips, stop-motion), driven by the same edit.json.
//   npx remotion render ReelPaper out/<project>.mp4 --props='{"project":"sugar-free"}'
const calculateMetadataPaper: CalculateMetadataFunction<ReelPaperProps> = async ({ props }) => {
  const base = `projects/${props.project}`;
  const res = await fetch(staticFile(`${base}/edit.json`));
  if (!res.ok) throw new Error(`No ${base}/edit.json in public/`);
  const edit = PaperEditSchema.parse(await res.json());
  const captions = edit.captions ? CaptionsSchema.parse(await (await fetch(staticFile(edit.captions))).json()) : null;
  return {
    durationInFrames: Math.round(edit.duration * edit.fps),
    fps: edit.fps,
    width: edit.width,
    height: edit.height,
    props: { ...props, edit, captions },
  };
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Reel"
      component={Reel}
      schema={propsSchema}
      defaultProps={{ project: "glp1-raw" }}
      calculateMetadata={calculateMetadata}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="ReelV2"
      component={ReelV2}
      schema={propsSchema}
      defaultProps={{ project: "lead-01" }}
      calculateMetadata={calculateMetadataV2}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="ReelV3"
      component={ReelV3}
      schema={propsSchema}
      defaultProps={{ project: "oct-mulank" }}
      calculateMetadata={calculateMetadataV3}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="ReelPaper"
      component={ReelPaper}
      schema={propsSchema}
      defaultProps={{ project: "sugar-free" }}
      calculateMetadata={calculateMetadataPaper}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="ReelSahilVid1"
      component={Reel}
      schema={propsSchema}
      defaultProps={{ project: "sahil-vid1" }}
      calculateMetadata={calculateMetadata}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="ReelBP3Things"
      component={Reel}
      schema={propsSchema}
      defaultProps={{ project: "bp-3-things" }}
      calculateMetadata={calculateMetadata}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);
