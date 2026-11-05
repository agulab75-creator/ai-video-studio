# Layout vocabulary for talking-head styles

Use these names in layout timelines and in `style-spec.json → layout_grammar`. They match the layouts the `ai-creative-director` skill and the `reel-editor` Remotion project can build, so a learned style maps straight onto production.

| Layout | What's on screen | Record |
|---|---|---|
| `aroll` | Presenter full frame. May carry a title or number overlay that's part of the A-roll layer. | Framing (head height), punch-ins, how long holds last, what's being said during long holds |
| `header` | A graphic panel across the top of the frame (with an edge treatment: torn paper, straight, wave) and the presenter below. Note whether the presenter is cut out and drawn *in front of* the panel (head crossing the edge). | Panel height (% of frame), edge style, background texture, what goes in the panel (title, illustration, photo), how the A-roll is reframed (scale / shift), entrance timing |
| `bgswap` | Presenter cut out from their background and placed over a full-frame graphic background, often with objects around the head | Background type, objects, entrance |
| `fullscreen` | Presenter hidden, voice continues. Sub-types: `card` (chapter/tip card, text-led), `scene` (illustrated/collage explanation), `broll` (stock or filmed footage), `photo` (still with push-in), `document` (paper, journal, screenshot) | Sub-type, length, how it enters (cut, paper wipe, slide) |
| `overlay` | Presenter stays full frame; one element floats on top (product, number, icon, photo, sticker). May blur the A-roll behind it. | Element, position, whether A-roll is blurred, entrance |
| `pip` | Graphic or footage full frame, presenter in a small window (circle or rounded rect) | Window shape, size, corner, border |
| `other` | Anything else (triptych split, interview footage, a second location). Describe it. | |

Also record, per video:
- **Coverage:** % of runtime in plain `aroll` vs everything else.
- **First visual:** seconds until the first non-A-roll element appears.
- **End hold:** length of the final uninterrupted A-roll stretch.
- **Triggers:** the kind of line that caused each layout change (concept named, mechanism explained, example, number/stat, product/brand, evidence/study, list item, emotion/hook, opinion, CTA).
- **Transitions between layouts:** hard cut, panel slide, paper wipe, zoom — with frame counts from a strip.
- **Captions:** style, position (% of height), always on or not, whether they stay on over full-screen visuals.
