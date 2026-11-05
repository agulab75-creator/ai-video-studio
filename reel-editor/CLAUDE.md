# reel-editor

Turns a talking-head video into a reel: Ali Abdaal layout logic, client brand, all driven by one `edit.json` per reel. Workflow is in the `ai-creative-director` skill; generation in `ai-broll`.

- One reel = `public/projects/<slug>/`: `source.mp4`, `transcript.json`, `roman.txt`, `captions.json`, `matte.webm`, `assets.json`, `assets/`, `edit.json`.
- `src/schema.ts` is the edit.json contract (layouts: aroll, header, bgswap, fullscreen, overlay, pip; element types: image, video, text, label, counter, annotation, component).
- Brands: `src/brands/<id>.ts` (tokens) + `brands/<id>/BRAND.md` (rules). Custom animations: `src/custom/` (register in `index.ts`, never overwrite — add `_v2`).
- Pipeline (`pipeline/`): `transcribe_modal.py`, `matte_modal.py`, `image_modal.py` (Modal GPU); `plan_tools.py` (words, captions, beats, tighten, check); `storyboard.mjs` (stills + contact sheet).
- Studio: `npm run dev` (port 3006). Render: `npx remotion render Reel out/<slug>.mp4 --props="{\"project\":\"<slug>\"}"`.
- Sound effects: `edit.sfx` cues (`{sound, at, volume, trimBefore?, why}`) play files from `public/sfx/` (Pixabay, peak-normalised; originals in `_original/`). `edit.voiceVolume` lowers the source audio. `plan_tools.py sfxmix` reports each cue's level vs the voice and writes a quick preview mix.
- After rendering, run the audio through `alimiter` (command in the `ai-creative-director` skill): voice + SFX go over 0 dBFS otherwise.
- Always run `plan_tools.py check` and look at the storyboard before a full render; the user reviews in Studio before the final render.
