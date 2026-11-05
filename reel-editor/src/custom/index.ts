import type React from "react";
import { BPDietChart } from "./BPDietChart";
import { BPLog } from "./BPLog";
import { Dial } from "./Dial";
import { KundaliChart } from "./KundaliChart";
import { SugarWindow } from "./SugarWindow";
import { PotassiumFlush } from "./PotassiumFlush";
import { TimelineStrip } from "./TimelineStrip";
import { TrendBand } from "./TrendBand";
import { VesselRelax } from "./VesselRelax";
import { VesselRelax_v2 } from "./VesselRelax_v2";
import { AlarmSwitches } from "./AlarmSwitches";
import { ArteryFlow } from "./ArteryFlow";
import { Heartbeat } from "./Heartbeat";
import { KidneyRetain } from "./KidneyRetain";
import { CarbStack, CommentBubble, FollowButton, HandGrab, LimitBox, PackTeaser, PaperHook, PaperLabel, PaperTagEl, PdfBooklet, PopUpBook, SourceWords, StampEl } from "./paper/scenes";

// Bespoke animated pieces that the element types can't express (a mechanism animation, a chart
// that builds, etc.). Write them as new files in this folder and register them here; edit.json
// uses them with { "type": "component", "name": "...", "props": {...} }.
// Never overwrite a working component: add Name_v2 and register both.
//
// Every component receives its props plus { brand, localFrame, fps, width }.
// localFrame counts from the element's entrance; width is the element's width in px.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const customComponents: Record<string, React.FC<any>> = {
  TimelineStrip,
  Dial,
  KundaliChart,
  SugarWindow,
  AlarmSwitches,
  ArteryFlow,
  Heartbeat,
  KidneyRetain,
  BPLog,
  TrendBand,
  PotassiumFlush,
  BPDietChart,
  VesselRelax,
  VesselRelax_v2,
  // paper-cut set (sugar-free reel)
  PaperHook,
  PaperLabel,
  CarbStack,
  PdfBooklet,
  CommentBubble,
  SourceWords,
  PopUpBook,
  LimitBox,
  HandGrab,
  PackTeaser,
  FollowButton,
  PaperTagEl,
  StampEl,
};
