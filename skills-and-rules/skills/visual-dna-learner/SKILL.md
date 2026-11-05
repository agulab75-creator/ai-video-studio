---
name: visual-dna-learner
description: Study a library of reference videos from a creator or brand and turn their editing into a reusable, evidence-backed style (STYLE-BIBLE.md + style-spec.json) that ai-creative-director can apply to new videos. Use when the user gives reference videos and asks to learn, study, reverse-engineer or copy a style ("edit like Ali Abdaal", "learn this creator's style", "master-theaf", "theaf"), or asks whether an existing style study is accurate.
version: 3.0.0
---

# Visual DNA Learner

Turn a folder of reference videos into a style system another agent can apply without watching the videos again. The output is evidence, not vibes: every rule points at video IDs and timestamps, and every number was measured from frames.

The central question for every pattern: **what visual decision does this creator repeatedly make, when do they make it, and why does it serve the story?**

## Where things go

Studies live in `C:\Users\agula\Desktop\anti-human\learner\<study>\`:

```text
learner/<study>/
  <reference videos>
  audit/                      # script output: inventory, change timelines, contact sheets, strips
  style-dna/<style-slug>/
    STYLE-BIBLE.md            # human-readable
    style-spec.json           # machine-readable, canonical for downstream agents
    references/               # only frames that prove a rule
```

Never overwrite another style's folder. A new creator gets a new slug.

## Workflow

### 1. Check what already exists
If `style-dna/<slug>/style-spec.json` exists and the user didn't ask to redo it, load it and only fill gaps. Re-analyse when new references arrive, evidence is thin, or someone finds a contradiction.

### 2. Extract evidence with the script
```bash
python "<this skill>/scripts/audit_library.py" all "<folder>" -o "<folder>/audit" --prefix ALI
```
This writes `inventory.json` (every video, stable IDs), `<ID>_changes.json` (full-frame *and* partial-frame change events) and `<ID>_sheet.jpg` (2 frames per second, timestamps burned in). Then, for any transition or entrance you want to measure:
```bash
python "<this skill>/scripts/audit_library.py" strip "<video>" --at 22.0 --frames 16 -o "<folder>/audit/<ID>_22s.jpg"
```
Strips show every frame, numbered, with absolute timestamps. Measure durations, easing and overshoot from strips, never from contact sheets.

### 3. Look at every contact sheet
Read every sheet yourself. For each video, write a layout timeline: one row per stretch, with start, end, layout, what's on screen, and what was being said. Use the layout vocabulary in `references/layout-grammar.md` (A-roll, header panel, background swap, full-screen visual, overlay, PiP, other). Partial-frame changes in `<ID>_changes.json` point at inserts that are easy to miss.

### 4. Measure
From the timelines, compute per video and across the library:
- share of runtime per layout (plain A-roll vs visuals)
- length range of each layout
- time to first visual
- what narration triggers each layout (naming a concept, explaining, a number, a product, an opinion, the CTA)
- where the long A-roll holds are (and what's being said)
- caption style, position and whether it's always on
Then measure entrances and transitions from strips: duration in frames, easing, overshoot, and which layer moves.

### 5. Cross-video patterns
Classify each candidate rule by how many videos show it:
- **CORE** — most videos, defining
- **COMMON** — several videos, context-dependent
- **OCCASIONAL** — a few videos
- **ONE-OFF** — one video
- **NOT OBSERVED** — looked for it, it isn't there (say so; this matters as much as a positive)

Only CORE and COMMON rules become defaults. Write them as IF → THEN decisions ("IF a concept is named for the first time THEN header panel with the term as title").

### 6. Write the outputs
- `style-spec.json` — schema in `references/spec-schema.md`. It must include `layout_grammar`, `coverage`, `captions`, and a measured `motion.timing_table`.
- `STYLE-BIBLE.md` — the same content for a person: identity, layout grammar table, decision rules, look, motion, captions, audio, do/don't, confidence, evidence links.
- `references/` — a small set of frames or strips that prove specific rules.

### 7. Validate before calling it done
Pick 3–5 moments from different videos. Predict the layout from the transcript using only your rules, then check the sheet. Downgrade or delete rules that fail. List what you could not verify (audio, SFX and music can't be checked from frames).

## Hard rules
1. Never equate style with typography, captions or one effect. Style is layout decisions + asset treatment + pacing + motion + sound, and how they follow the story.
2. Never invent measurements. If a number came from one instance, say so.
3. Never promote a one-video pattern to CORE.
4. "Unverified" means you haven't looked yet: go and look before writing it down as uncertain.
5. Don't trust full-frame scene detection alone: inserts that cover part of the frame (panels, overlays, stickers) score low. Use the partial-frame events and the sheets.
6. Separate what the creator does from any adaptation (faceless versions, other clients). Adaptations go in their own section.
7. A learned style is a decision framework, not a template: it says *when* to do what.

## Final report to the user
Library (count, durations, resolutions) → strongest patterns with video counts → layout grammar table → what changed from any previous study → what couldn't be verified → paths to `style-spec.json`, `STYLE-BIBLE.md` and the audit folder.

## Reference files
- `references/layout-grammar.md` — layout vocabulary and what to record for each
- `references/spec-schema.md` — `style-spec.json` schema
- `references/checklists.md` — what to look for in story beats, shots, composition, camera, assets, graphics, typography, pacing, audio and transitions
