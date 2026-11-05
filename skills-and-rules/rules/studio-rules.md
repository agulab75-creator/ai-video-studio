# Studio rules (every client, every tool)

These are the only rules that apply to all work in `anti-human`. Everything about a client's look (palette, fonts, caption style) lives in that client's `BRAND.md`, and everything about a style (pacing, layouts, motion timing) lives in its `style-dna/<slug>/style-spec.json`. If a rule here seems to fight a brand or style file, the brand or style file wins for look and pacing; these rules still win for workflow and safety.

## Workflow
- Video work starts with the `ai-creative-director` skill: plan first, one approval of the plan, then build.
- Never overwrite a working scene or composition. Add `SceneX_v2.tsx` (or a new `edit.v2.json`) and register both.
- "Done" means checked on rendered frames and frame strips, not "it compiles". Look at the output before you report it.
- Let scripts do arithmetic (durations, frame numbers, coverage). Don't compute timings in your head.

## Speech and timeline
- Captions are verbatim: show exactly what was said. Never translate or paraphrase. The script (Roman / Devanagari) is set per client in `BRAND.md`.
- Never cut mid-sentence. Snap every cut and layout change to a word boundary, ideally a pause.
- Keep the speaker's master audio continuous under every insert.

## Remotion
- Remotion is the motion engine. Don't install Onda, Motion Canvas, or unverified template packs (`snapcn`, "RemotionUI", "Ali Abassi templates"). HyperFrames is a known alternative, but this studio's components are Remotion.
- Every animation is driven by `useCurrentFrame()` with `interpolate()`, `spring()` or `Easing`. No CSS transitions/animations, Framer Motion, or timers.
- Check for an official `@remotion/*` package before writing a helper. Verify any other package exists (`npm view <name>`) before installing it.
- Default is stillness: one thing moves at a time, and motion must mean something.

## Assets
- Don't draw real-world objects (hands, phones, pens, organs, products) out of CSS or basic SVG. Generate or source the image, cut it out, then animate it. Code draws only type, lines, shapes, charts, masks and UI.
- AI images and video are generated with open models on Modal (`python -m modal run <script>`). GPU runs bill the account: ask first unless the client's `BRAND.md` says the budget is pre-approved.
- Check a model's licence before using it for paid client work.

## Premiere
- Two routes: full Remotion (default for reels), or Premiere for the cut with Remotion overlays exported as ProRes 4444 with alpha.
- MOGRTs stay in Premiere; don't rebuild them in Remotion.
- Only one Premiere bridge drives a timeline at a time. Read `premiere-uxp-traps.md` before scripting UXP.

## Safety
- `.env*` files and `wrangler.jsonc` hold keys and passwords: never print, commit or paste their values.
- Don't put `&` in the names of folders that hold Node projects (it breaks npm/npx on Windows).
