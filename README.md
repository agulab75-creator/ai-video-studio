# AI Video Studio

An AI-assisted pipeline that turns a raw talking-head video (a doctor, a founder, a creator) into a finished, branded short-form reel, with generated B-roll, animated graphics, captions and sound design, then posts it to Instagram, Facebook and YouTube Shorts.

I built it to produce Hindi/Hinglish reels for small businesses in India. Claude Code does the planning and orchestration, Remotion renders the video, Modal runs the GPU jobs, and Gemini (through Antigravity) acts as a second pair of eyes that watches footage and reviews frames.

> Source only. Raw footage, renders, client assets and all credentials are deliberately not in this repo.

## What's in here

| Folder | What it is |
|---|---|
| [`reel-editor/`](reel-editor) | The Remotion project that renders a reel from one `edit.json` file, plus the Python/Node pipeline scripts |
| [`skills-and-rules/`](skills-and-rules) | The Claude Code skills and studio rules that drive the workflow (the "brain") |
| [`publish/`](publish) | One script that posts a finished reel to Instagram, Facebook and YouTube |
| [`meta-unified-sync/`](meta-unified-sync) | A Google Apps Script that pulls Instagram + Facebook KPIs into a Sheet (Meta Graph API v26), with a test harness |

## How a reel gets made

```
raw video
  │
  ├─ 1  Transcribe (Whisper-class model on a Modal GPU)  →  transcript.json, word timestamps
  ├─ 2  Pre-read: Gemini watches the raw video, returns a timestamped brief
  ├─ 3  Captions: transliterate Hindi → Roman script, one line per word  →  captions.json
  ├─ 4  Tighten: cut silences between words (jump cuts only on word boundaries)
  ├─ 5  Plan: every beat of the script gets a layout + a visual, written to edit.json
  ├─ 6  Check: plan_tools.py validates timings, overlaps, caption-safe zone
  ├─ 7  Approve: I review a segment table (time, layout, what's on screen, why)
  ├─ 8  Presenter cut-out (matting on Modal) – only for segments that need it
  ├─ 9  B-roll: image/cutout generation on Modal (Qwen-Image, BiRefNet)
  ├─ 10 Storyboard: stills + contact sheet, inspected by me and by Gemini
  ├─ 11 Sound: a few soft SFX cues, level-checked against the voice
  ├─ 12 Review live in Remotion Studio, apply notes
  └─ 13 Render → loudness-master (−14 LUFS) → publish/
```

The key design choice: **one `edit.json` is the whole edit.** The model decides *what the viewer sees at every moment* and writes that down with a `why` quoting the script line. Scripts do the arithmetic (timings, cuts, level checks) and Remotion renders it deterministically, so an edit is reviewable, diffable and re-renderable.

### The layouts

`aroll` (plain talking head), `header` (presenter below a title/visual panel), `fullscreen` (visual replaces the video), `overlay`, `pip` (picture-in-picture). Element types: image, video, text, label, counter, annotation, and custom React components (`reel-editor/src/custom/` holds hand-built animated explainers such as a blood-flow artery, a heartbeat, a kundali chart). The contract is `reel-editor/src/schema.ts`.

### Taste rules

Written down so the model applies them consistently ([`skills-and-rules/rules/visual-taste.md`](skills-and-rules/rules/visual-taste.md)): show the *mechanism*, not the label; a physical change beats an icon; every beat must work on mute; SFX are few and soft; one consistent A-roll grade across clips.

## Skills I use

All live in [`skills-and-rules/skills`](skills-and-rules/skills) and are loaded by Claude Code.

| Skill | Job |
|---|---|
| `ai-creative-director` | Entry point for all video work: transcribes, plans layouts, builds the edit, QA, render. Always shows an edit plan and waits for approval first |
| `ai-broll` | Generates B-roll images, cut-outs and clips on Modal (Qwen-Image, Qwen-Image-Edit, BiRefNet) |
| `visual-dna-learner` | Studies a library of reference videos and writes an evidence-backed `style-spec.json` + `STYLE-BIBLE.md` that the director can apply to new videos |
| `indian-ecommerce-builder`, `shopify-variant-photos` | Shopify/Liquid work for an Indian jewellery store |
| `ponytail*` | A "smallest possible change" coding discipline for the code I write with Claude |

Other tools in the loop: Remotion's own agent skills (`npx skills add remotion-dev/skills`), Antigravity/Gemini for watching video and frame review, Modal for GPU jobs, ffmpeg for audio mastering.

## How I built it

I built it iteratively with Claude Code, one painful reel at a time. Every time a render came out wrong, the fix went into a rule or a script rather than just the one video: parallel-render audio failures, a quiet-voice SFX rescale, the "no background swap" decision, the loudness chain. That is why the skills are long and specific. The approach: make the model's decisions explicit and checkable (`edit.json`, `plan_tools.py check`, contact sheets), and keep humans (me) in the loop at the plan and the final review.

## Run it

Needs Node 20+, Python 3.10+, ffmpeg, and (for GPU steps) a [Modal](https://modal.com) account.

```bash
cd reel-editor
npm install
npm run dev            # Remotion Studio
npx remotion render Reel out/my-reel.mp4 --props='{"project":"my-reel"}'
```

A project is a folder `public/projects/<slug>/` with `source.mp4` and an `edit.json`. GPU steps, for example transcription:

```bash
python -m modal run pipeline/transcribe_modal.py --video public/projects/<slug>/source.mp4 --out public/projects/<slug>/transcript.json
```

GPU jobs bill your Modal account.

## Post to Instagram, Facebook and YouTube

```bash
pip install -r publish/requirements.txt
cp publish/.env.example publish/.env      # fill in your tokens
python publish/publish.py out/my-reel_final.mp4 --caption "Caption #tags" --title "YouTube title"            # dry run
python publish/publish.py out/my-reel_final.mp4 --caption "Caption #tags" --title "YouTube title" --live     # really posts
```

- **Dry run by default**; `--live` is required to upload. It also rejects non-vertical video and, for YouTube, anything over 3 minutes.
- **Instagram** Reels: resumable upload via the Graph API, waits for processing, then publishes.
- **Facebook** Page Reels: the `video_reels` start / upload / finish flow.
- **YouTube** Shorts: Data API v3 resumable upload. Uploads as **private** unless you pass `--yt-public`. First run opens a browser for Google sign-in.
- One platform failing doesn't stop the others.

Setup you have to do once: a Meta app with a System User token (`pages_manage_posts`, `instagram_content_publish`), your Instagram Business account linked to the Page, and a Google Cloud OAuth client with the YouTube Data API enabled. Meta app review may be needed before posting to accounts you don't own. I have only tested the dry-run path; the live calls follow the platforms' documented flows.

## Security

Credentials are read from environment variables or the git-ignored `publish/.env`. `.env*`, tokens, footage and renders are in `.gitignore`.
