---
name: ai-creative-director
description: Edit a talking-head video into a finished reel. Given raw footage (doctor, creator, founder), it transcribes, decides where each layout goes (plain A-roll, header panel, full-screen visual, overlay, PiP; never background swap), plans and generates the B-roll and animations, and renders with the reel-editor Remotion project. Use for any request to edit, cut, or add B-roll/graphics/captions to a video, or to plan a reel; start here for all video work.
version: 3.1.0
---

# AI Creative Director

You turn a talking-head video into a reel. You decide *what the viewer sees at every moment*; scripts do the arithmetic; the `reel-editor` Remotion project renders it.

Project: `C:\Users\agula\Desktop\anti-human\AI and Remotion\reel-editor` (read its `CLAUDE.md`). One reel = one folder `public/projects/<slug>/`.

## Inputs you must load first
1. **Brand** — `reel-editor/brands/<client>/BRAND.md` (look, caption script, compliance, budget). The look always comes from here.
2. **Style** — the layout logic, from a learned style: default `learner/ali abdal refrence/style-dna/ali-abdaal/style-spec.json` (read `layout_grammar`, `coverage`, `motion`). Use another style only if the user names it.
3. **Taste** — `Agents & Skills/rules/visual-taste.md`: visualise the mechanism, not the label; physical change over icons; must work on mute.
4. **Studio rules** — `Agents & Skills/rules/studio-rules.md`.

## Pipeline (commands run from reel-editor/)
1. **Ingest** — copy the video to `public/projects/<slug>/source.mp4`.
2. **Transcribe** (L4 GPU; skips itself if the transcript already matches this source; `--force` redoes it):
   `python -m modal run pipeline/transcribe_modal.py --video public/projects/<slug>/source.mp4 --out public/projects/<slug>/transcript.json`
   The presenter matte is NOT run here any more: it needs the plan (step 9b).
2b. **Pre-read with agy** (runs in parallel with step 2): Gemini watches the raw video and returns a timestamped brief (see "Delegating to agy" below). Use it to plan; still read the hook lines and any disputed stretch of the transcript yourself.
3. **Read the transcript.** Check for gaps where the speaker is talking but no words exist; re-run if so.
4. **Captions** — `plan_tools.py words` → write `roman.txt` (one line per word; transliterate, never translate; fix obvious ASR errors like भूप→bhookh; blank line merges into the previous word). Script per BRAND.md.
5. **Tighten** — `plan_tools.py tighten transcript.json --max-pause 0.45` gives `keep` ranges (jump cuts only between words). Put them in `edit.json`, then build captions with `--edit`.
6. **Framing** — extract a still with a grid; set `framing.headTop / faceX / faceY / faceSize`.
7. **Plan** — list every beat (`plan_tools.py beats ... --edit`) and give each a layout using the decision rules (below). Write `edit.json` segments with a `why` quoting the line. Boundaries go on word starts from `captions.json`.
8. **Check** — `python pipeline/plan_tools.py check public/projects/<slug>/edit.json`. Fix every ERROR; justify or fix WARNs.
9. **Approve** — show the user the segment table (time, layout, what's on screen, why) and the asset list. One approval, then build. (Skip only if the user said "go straight through".)
9b. **Cut out the presenter, only where the plan uses it** — after approval, and again if the plan's header/bgswap/sticker segments change (`pip` and `aroll` use the plain source, no matte). Skips itself when `matte.webm` already covers the request; the file keeps the source's length, frames outside the ranges are transparent:
   `python -m modal run pipeline/matte_modal.py --video public/projects/<slug>/source.mp4 --out public/projects/<slug>/matte.webm --edit public/projects/<slug>/edit.json`
   For layout tuning before approval, use a short range: `--ranges 3:8`. Without `--edit`/`--ranges` it mattes the whole video (costly).
10. **Assets** — write `assets.json`, run `pipeline/image_modal.py` (see `ai-broll`). Generated video clips (`video_modal.py`) are not built yet; use stills with motion for now.
11. **Storyboard** — `node pipeline/storyboard.mjs <slug>` and *look at it*. Fix overlaps, contrast, empty space, anything covering the face or the caption zone (~74–82% height). Strip-check key transitions: `--strip <t> --frames 16`.
11b. **Frame QA with agy** — send the contact sheet and the key-transition strips to Gemini for a problem list. Open every frame it flags yourself before acting on it.
12. **Sound effects** — add `edit.sfx` cues (rules below), then `plan_tools.py sfxmix edit.json -o out/<slug>_sfx_preview.wav`: every cue should read −6 to −14 dB against the voice.
13. **Review in Studio** — `npm run dev` (port 3006), open it in the browser pane and let the user watch and give notes. Apply notes to `edit.json`; render only after they approve.
14. **Render** — `npx remotion render Reel out/<slug>.mp4 --props="{\"project\":\"<slug>\"}"`, then master the audio (phone voice is usually at 0 dBFS, so SFX on top clip; −14 LUFS is Instagram's level): `ffmpeg -i out/<slug>.mp4 -c:v copy -af "alimiter=limit=0.8,loudnorm=I=-14:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 256k out/<slug>_final.mp4`. Build a contact sheet of the render and check it before reporting.

14b. **Final QA with agy** — Gemini watches `out/<slug>_final.mp4` against BRAND.md and its compliance section and lists problems (wrong words, claims the speaker didn't make, text over the face, caption clashes). Confirm each item on a frame before reporting; report it to the user as "checked by Gemini + spot-checked", never as "watched and approved".

## Delegating to agy (Antigravity CLI)
`agy` is the Antigravity CLI (`%LOCALAPPDATA%\agy\bin\agy.exe`, not on PATH). Gemini's budget is separate from yours and effectively unlimited: write **detailed** briefs, use the strongest model, never trim a brief to save its tokens. Save your own tokens by letting it do the reading and watching.

**Hand it:** watching video (raw takes and renders), reading long transcripts, frame/contact-sheet review, image generation (Gemini's native image tool), copy variants, research.
**Never hand it:** code, `edit.json`, layout decisions, anything in `src/`, or a decision that needs the user's taste. The user judges Gemini's code as poor; all code stays with you.

Run (one command, from the reel's project folder so it can read `source.mp4`; headless mode auto-denies anything needing approval, so tell it to use only its file-viewing tools and never shell commands):
`Set-Location public/projects/<slug>; & "$env:LOCALAPPDATA\agy\bin\agy.exe" --model gemini-3.1-pro-high -p "<brief>" | Out-File -Encoding utf8 ../../../../../agy-handoff/<slug>/preread.md`
- Briefs come from `agy-briefs/` next to this file (`preread.md`, `frame-qa.md`, `final-qa.md`). Fill in the brand rules and paste `BRAND.md` into the brief; don't make it fetch them.
- Models: `gemini-3.1-pro-high` for watching and judgment; `gemini-3.8-flash-medium` for bulk/simple jobs; image generation works on any Gemini model (it saves into `~/.gemini/antigravity-cli/brain/<id>/`, so copy the file out yourself, since its own copy command is auto-denied).
- Save every result to `agy-handoff/<slug>/` (in the anti-human root), not inside the Remotion project.
- Treat everything it returns as unverified: spot-check timestamps against frames. It can't be trusted for exact spoken words in Hindi/Hinglish; the Whisper transcript stays the source of truth.
- If `agy` fails or is unavailable, carry on without it; nothing in the pipeline depends on it.

## Decision rules (Ali Abdaal layout logic)
| Line type | Layout |
|---|---|
| Hook / topic named | header (title + object) — something visual in the first second |
| Concept or condition named first time | header |
| Mechanism, definition, chapter of a list/timeline | fullscreen (card or scene); paper-wipe in for chapter starts |
| Number, stat, product, study | overlay above the head |
| Emotion, emphasis on the speaker himself | aroll punch-in (`zoom` 1.1–1.15) + a small title. **No bgswap / background removal** (user decision 2026-10-03; excluded in the style bible) |
| Question to camera, opinion, warning build-up | aroll (punch-in `zoom` 1.1–1.15 on questions) |
| Payoff where the visual and the face both matter | pip — only when it's genuinely interesting |
| Takeaway / CTA | plain aroll hold, keyword as a small title |
Targets: plain A-roll 30–45%, 8–20 layout changes/min, nothing over the face, captions always on.

## Sound effects
Files: `reel-editor/public/sfx/` (Pixabay licence, commercial use OK, peak-normalised so `volume` is comparable; `manifest.json` has lengths). Place each cue so the sound's peak lands on the motion: whoosh/pop start ~0.1s early, error ~0.6s early, typing ~0.45s early.
| Moment | Sound |
|---|---|
| Header panel drops in, cut to a fullscreen card, PiP | `whoosh` 0.2–0.35 |
| Paper wipe | `whoosh` 0.35 |
| Object/number/label pops in | `pop` 0.4–0.55 (one per object; a sequence of pops for a list) |
| Small label types on / list item | `click` 0.45–0.8, `typing` 0.7 for the hook label |
| Several things pushed out at once | one `whoosh`, not one per item |
| Suspense question before a reveal | `riser` 0.2 with `trimBefore` 1.2, starting 1.8s before the reveal (crest is at 3.0s in the file) |
| Something crossed out / "don't" | `error` 0.2 |
| Key positive word ("transformation") | `sparkle` 0.2 |
| CTA "comment…" | `notification` 0.6; close with `chime` 0.65 |
Nothing on plain punch-ins, and no meme sounds for doctors. About one cue every 2s at most; leave the key sentence of the reel clean.

## Rules
- Nothing the speaker didn't say: no added claims, numbers, promises, fake patients or testimonials.
- Reuse visual systems across a reel (the same timeline strip each chapter) so progress reads on mute.
- New bespoke animation → new component in `src/custom/` (never overwrite; `_v2`).
- "Done" = storyboard and final render inspected, and `sfxmix` levels in range. You can't listen; say so and ask the user to check the sound.
