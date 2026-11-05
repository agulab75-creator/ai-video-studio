import React from "react";
import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";
import type { Sfx } from "../schema";

/** Sound effects from edit.sfx, each placed at its output time. Files: public/sfx/<sound>.mp3 */
export const SfxTrack: React.FC<{ sfx: Sfx[]; fps: number }> = ({ sfx, fps }) => (
  <>
    {sfx.map((s, i) => (
      <Sequence key={i} from={Math.max(0, Math.round(s.at * fps))} layout="none" name={`sfx ${s.sound}`}>
        <Audio
          src={staticFile(`sfx/${s.sound}.mp3`)}
          volume={s.volume}
          trimBefore={s.trimBefore ? Math.round(s.trimBefore * fps) : undefined}
        />
      </Sequence>
    ))}
  </>
);
