import React from "react";
import { OffthreadVideo, Sequence, staticFile } from "remotion";

/**
 * The talking-head source (or its matte) on the output timeline. With `keep` ranges the source
 * is played range by range, so cuts in the talking head stay frame-exact.
 */
export const SourceVideo: React.FC<{
  src: string;
  keep?: [number, number][];
  fps: number;
  muted?: boolean;
  transparent?: boolean;
  volume?: number;
}> = ({ src, keep, fps, muted = false, transparent = false, volume = 1 }) => {
  const style: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };
  if (!keep || keep.length === 0) {
    return <OffthreadVideo src={staticFile(src)} muted={muted} transparent={transparent} volume={volume} style={style} />;
  }
  let out = 0;
  return (
    <>
      {keep.map(([s, e], i) => {
        const from = Math.round(out * fps);
        const dur = Math.round((e - s) * fps);
        out += e - s;
        return (
          <Sequence key={i} from={from} durationInFrames={dur} layout="none">
            <OffthreadVideo
              src={staticFile(src)}
              trimBefore={Math.round(s * fps)}
              muted={muted}
              volume={volume}
              transparent={transparent}
              style={{ ...style, position: "absolute", inset: 0 }}
            />
          </Sequence>
        );
      })}
    </>
  );
};
