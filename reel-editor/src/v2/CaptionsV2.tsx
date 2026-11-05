import React from "react";
import type { Captions as CaptionsData } from "../schema";
import { darkShadow, F, glowShadow } from "./fonts";
import type { EditV2 } from "./schema";

type Word = { text: string; start: number; end: number };

/** Split caption chunks into groups of at most `max` words; a group shows until the next one starts. */
const groupsOf = (data: CaptionsData, max: number) => {
  const out: Word[][] = [];
  for (const c of data.chunks) {
    for (let i = 0; i < c.words.length; i += max) out.push(c.words.slice(i, i + max));
  }
  return out;
};

const clean = (s: string) => s.toLowerCase().replace(/[.,!?]/g, "");

// No box. 1-3 words, hard swaps, at chest height. The keyword drops to a second line in an italic
// Didone serif in the scene colour with a glow (AFTER_001 10.2 s 'Regenerate', 32.4 s 'of it').
export const CaptionsV2: React.FC<{ data: CaptionsData; edit: EditV2; t: number; width: number; height: number }> = ({
  data,
  edit,
  t,
  width,
  height,
}) => {
  const groups = groupsOf(data, edit.captionStyle.maxWords);
  const i = groups.findIndex(
    (g, k) => t >= g[0].start && t < Math.min(groups[k + 1]?.[0].start ?? Infinity, g[g.length - 1].end + 0.35),
  );
  if (i === -1) return null;
  const g = groups[i];
  const accentOf = (w: Word) =>
    edit.accents.find(
      (a) => clean(a.word) === clean(w.text) && (a.from === undefined || w.start >= a.from) && (a.to === undefined || w.start <= a.to),
    );
  // Keep spoken order: consecutive plain words share a line, an accented word gets its own line.
  const lines: { words: Word[]; color?: string }[] = [];
  for (const w of g) {
    const color = accentOf(w)?.color;
    const last = lines[lines.length - 1];
    if (last && last.color === color) last.words.push(w);
    else lines.push({ words: [w], color });
  }
  const size = edit.captionStyle.size;
  return (
    <div
      style={{
        position: "absolute",
        left: width * 0.06,
        right: width * 0.06,
        top: edit.captionStyle.y * height,
        transform: "translateY(-50%)",
        textAlign: "center",
        pointerEvents: "none",
      }}
    >
      {lines.map((l, k) =>
        l.color ? (
          <div
            key={k}
            style={{
              fontFamily: F.serif,
              fontStyle: "italic",
              fontWeight: 700,
              fontSize: size * 1.3,
              lineHeight: 1.0,
              color: l.color,
              textShadow: `${glowShadow(l.color, 0.8)}, ${darkShadow}`,
            }}
          >
            {l.words.map((w) => w.text).join(" ")}
          </div>
        ) : (
          <div
            key={k}
            style={{ fontFamily: F.sans, fontWeight: 800, fontSize: size, lineHeight: 1.08, color: "#FFFFFF", textShadow: `${darkShadow}, 0 0 18px rgba(255,255,255,0.35)` }}
          >
            {l.words.map((w) => w.text).join(" ")}
          </div>
        ),
      )}
    </div>
  );
};
