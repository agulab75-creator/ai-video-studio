---
name: ai-broll
description: Generate B-roll images, cutouts and AI video clips on Modal for reels — Qwen-Image-2512 (text-to-image), Qwen-Image-Edit-2511 (edits), BiRefNet cutouts, and image-to-video. Use when a video needs generated visuals, cutout objects, textures, or short generated clips; replaces the old wan21-video skill.
version: 1.0.0
---

# AI B-roll on Modal

Scripts live in `AI and Remotion/reel-editor/pipeline/`. Run from `reel-editor/`. Models are cached in the Modal volume `reel-models`.

| Need | Model | Licence | Script |
|---|---|---|---|
| Still / object / texture | Qwen-Image-2512 | Apache-2.0 | `image_modal.py` |
| Edit an image (make halftone, change angle, keep identity) | Qwen-Image-Edit-2511 | Apache-2.0 | `image_modal.py` (`"edit"`) |
| Cutout (transparent PNG) | BiRefNet via rembg | MIT | `image_modal.py` (`"cutout": true`) |
| Presenter matte (video) | BiRefNet HR-matting | MIT | `matte_modal.py` |
| Image-to-video clip | LTX-2.5 (needs HF token secret `huggingface` + accepted licence); else Wan 2.2 | community (<$10M ARR) / Apache-2.0 | `video_modal.py` — **not built yet** |

Top-ranked but NOT for client work: FLUX.2 dev, Ideogram 4, Qwen-Image-2.1 (non-commercial); MiniMax H3 (branding clause, health AUP) — ask first.

## Images
Write `public/projects/<slug>/assets.json`:
```json
[{"id": "glp1_pen", "prompt": "...", "aspect": "1:1", "cutout": true, "seed": 11}]
```
`python -m modal run pipeline/image_modal.py --spec public/projects/<slug>/assets.json` — only missing ids are generated (`"force": true` to redo, `--only id1,id2`; an entry whose prompt/seed/aspect changed is redone automatically). Default is 30 steps; `--steps 20` makes a cheap draft pass that the next normal run replaces. The H100 only renders; cutouts run on CPU containers in parallel. Outputs `assets/<id>.png` (trimmed cutout) and `<id>_raw.png`. Look at every result before using it.

Prompt shape for collage objects: *[one subject, concrete], photograph printed on matte magazine paper with a clearly visible halftone dot print texture, flat even lighting, isolated on a plain light grey background, whole object in frame.* Say "no brand name, no text" for products. One subject per image; composite in Remotion.

## Video
Motion-first prompt, one subject / one action / one camera move per clip. Generate the keyframe with Qwen-Image first, then animate it (I2V). Never prompt text or logos.

## Rules
- Budget per client is in `BRAND.md`; otherwise ask before GPU runs.
- No photoreal fake patients, before/after people, or real brands.
