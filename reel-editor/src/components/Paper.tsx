import React, { useId } from "react";
import { AbsoluteFill, Img, OffthreadVideo, staticFile } from "remotion";
import type { Brand } from "../brands";
import { rand } from "../lib/anim";
import type { Background } from "../schema";

/** Paper grain: SVG turbulence, multiplied over whatever is below. */
export const Grain: React.FC<{ opacity?: number; seed?: number }> = ({ opacity = 0.16, seed = 3 }) => {
  const id = useId().replace(/:/g, "");
  return (
    <AbsoluteFill style={{ mixBlendMode: "multiply", opacity, pointerEvents: "none" }}>
      <svg width="100%" height="100%">
        <filter id={`g${id}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={3} seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#g${id})`} />
      </svg>
    </AbsoluteFill>
  );
};

/** Halftone dots like Ali's maroon / blue panels. */
const Halftone: React.FC<{ dot?: string }> = ({ dot = "rgba(255,255,255,0.13)" }) => (
  <AbsoluteFill
    style={{
      backgroundImage: `radial-gradient(circle, ${dot} 1.6px, transparent 2.2px)`,
      backgroundSize: "11px 11px",
    }}
  />
);

export const BackgroundView: React.FC<{
  bg: Background;
  brand: Brand;
  localFrame: number;
  durationFrames: number;
}> = ({ bg, brand, localFrame, durationFrames }) => {
  const c = brand.colors;
  const scale = 1 + bg.kenburns * Math.min(1, localFrame / Math.max(1, durationFrames));
  let inner: React.ReactNode = null;
  switch (bg.kind) {
    case "paper":
      inner = (
        <AbsoluteFill
          style={{ background: `radial-gradient(120% 90% at 50% 40%, ${bg.color ?? c.paper} 55%, ${c.paperWarm} 100%)` }}
        />
      );
      break;
    case "dark":
      inner = (
        <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 40%, ${bg.color ?? c.navy} 30%, #07121c 100%)` }} />
      );
      break;
    case "color":
      inner = <AbsoluteFill style={{ background: bg.color ?? c.navy }} />;
      break;
    case "halftone":
      inner = (
        <>
          <AbsoluteFill style={{ background: bg.color ?? c.navy }} />
          <Halftone />
        </>
      );
      break;
    case "gradient":
      inner = (
        <AbsoluteFill
          style={{ background: `linear-gradient(170deg, ${bg.color ?? c.navy} 0%, ${bg.color2 ?? c.blue} 100%)` }}
        />
      );
      break;
    case "image":
      inner = (
        <AbsoluteFill style={{ transform: `scale(${scale})` }}>
          <Img src={staticFile(bg.src!)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
      );
      break;
    case "video":
      inner = (
        <AbsoluteFill style={{ transform: `scale(${scale})` }}>
          <OffthreadVideo muted src={staticFile(bg.src!)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
      );
      break;
  }
  return (
    <AbsoluteFill>
      {inner}
      {bg.grain && bg.kind !== "video" && <Grain opacity={bg.kind === "paper" ? 0.14 : 0.22} />}
    </AbsoluteFill>
  );
};

/**
 * Torn paper edge as a clip-path polygon. The shape covers everything ABOVE `edgeY`
 * (fraction of height) with a jagged bottom edge; `invert` covers everything below instead.
 */
export const tornPolygon = (edgeY: number, seed: number, width: number, height: number, invert = false, amp = 16) => {
  const pts: string[] = [];
  const steps = 54;
  const edge: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const jag = (rand(seed + i) - 0.5) * amp + (rand(seed * 3 + i * 7) - 0.5) * amp * 0.5;
    edge.push([x, edgeY * height + jag]);
  }
  if (!invert) {
    pts.push(`0px -10px`, `${width}px -10px`);
    for (let i = edge.length - 1; i >= 0; i--) pts.push(`${edge[i][0]}px ${edge[i][1]}px`);
  } else {
    for (const [x, y] of edge) pts.push(`${x}px ${y}px`);
    pts.push(`${width}px ${height + 10}px`, `0px ${height + 10}px`);
  }
  return `polygon(${pts.join(",")})`;
};

/** A torn paper strip: white fibrous band drawn just under a torn edge at `edgeY`. */
export const TornFiber: React.FC<{ edgeY: number; seed: number; width: number; height: number; color?: string }> = ({
  edgeY,
  seed,
  width,
  height,
  color = "#FBF8F1",
}) => (
  // filter on the parent: a filter on the clipped element itself would be clipped away
  <AbsoluteFill style={{ filter: "drop-shadow(0 7px 9px rgba(0,0,0,0.35))" }}>
    <AbsoluteFill style={{ background: color, clipPath: tornPolygon(edgeY + 0.011, seed + 11, width, height, false, 22) }} />
  </AbsoluteFill>
);
