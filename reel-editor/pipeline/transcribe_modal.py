"""Word-level transcription on Modal: WhisperX large-v3 + wav2vec2 alignment.

    python -m modal run pipeline/transcribe_modal.py --video public/projects/<slug>/source.mp4 --out public/projects/<slug>/transcript.json [--language hi]

Skips the run when the transcript already exists for this exact source, language and model (hash in
<out>.stamp; a legacy transcript with no stamp counts as current if it is newer than the video or ends where the video ends). --force redoes it.
Runs on an L4: large-v3 float16 (about 3 GB) + the aligner (about 1 GB) fit easily.

Output: {"language", "model", "segments": [{start, end, text}], "words": [{i, text, start, end, score}]}
Times are seconds on the source video. Hindi comes out in Devanagari; captions are transliterated
to Roman Hinglish afterwards (see pipeline/plan_tools.py words / captions).
"""
import hashlib
import json
import os
import subprocess
import tempfile

import modal

app = modal.App("reel-transcribe")
models = modal.Volume.from_name("reel-models", create_if_missing=True)
SITE = "/usr/local/lib/python3.11/site-packages"
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("whisperx==3.8.6")
    .env({"HF_HOME": "/models/hf", "LD_LIBRARY_PATH": f"{SITE}/nvidia/cudnn/lib:{SITE}/nvidia/cublas/lib"})
)


SR = 16000


def _speech_gaps(audio, words, min_gap=0.7):
    """Stretches between recognised words (and at the ends) that still contain speech energy.
    Batched Whisper sometimes drops or truncates a whole chunk; these windows get re-transcribed."""
    import numpy as np

    hop = int(0.05 * SR)
    rms = np.sqrt(np.convolve(audio.astype(np.float64) ** 2, np.ones(hop) / hop, mode="same"))[::hop]
    speech_level = np.percentile(rms, 75)
    timed = [w for w in words if w.get("start") is not None]
    starts = [0.0] + [w["end"] for w in timed]
    ends = [w["start"] for w in timed] + [len(audio) / SR]
    gaps = []
    for a, b in zip(starts, ends):
        if b - a < min_gap:
            continue
        seg = rms[int(a / 0.05): int(b / 0.05)]
        if len(seg) and (seg > 0.35 * speech_level).mean() > 0.3:
            gaps.append((max(0.0, a - 0.15), min(len(audio) / SR, b + 0.15)))
    return gaps


@app.function(image=image, gpu="L4", volumes={"/models": models}, timeout=1800)
def transcribe(wav: bytes, language: str, model_name: str) -> dict:
    import whisperx

    path = "/tmp/audio.wav"
    with open(path, "wb") as f:
        f.write(wav)
    audio = whisperx.load_audio(path)
    cached = os.path.isdir("/models/whisper")
    model = whisperx.load_model(model_name, "cuda", compute_type="float16", language=language,
                                download_root="/models/whisper")
    align_model, meta = whisperx.load_align_model(language_code=language, device="cuda")

    def run(clip, offset):
        res = model.transcribe(clip, batch_size=8, language=language, chunk_size=15)
        al = whisperx.align(res["segments"], align_model, meta, clip, "cuda", return_char_alignments=False)
        for seg in al["segments"]:
            seg["start"] += offset
            seg["end"] += offset
            for w in seg.get("words", []):
                if "start" in w:
                    w["start"] += offset
                    w["end"] += offset
        return al["segments"]

    all_segments = run(audio, 0.0)
    flat = [w for s in all_segments for w in s.get("words", [])]
    repaired = []
    for a, b in _speech_gaps(audio, flat):
        extra = run(audio[int(a * SR): int(b * SR)], a)
        # keep only words that fall inside the gap, so nothing is duplicated
        for s in extra:
            s["words"] = [w for w in s.get("words", []) if "start" not in w or a - 0.05 <= w["start"] < b]
        extra = [s for s in extra if s["words"]]
        if extra:
            repaired.append([round(a, 2), round(b, 2)])
            all_segments.extend(extra)
    all_segments.sort(key=lambda s: s["start"])
    if not cached:
        models.commit()

    words, segments = [], []
    for seg in all_segments:
        segments.append({"start": round(seg["start"], 3), "end": round(seg["end"], 3), "text": seg["text"].strip()})
        for w in seg.get("words", []):
            if "start" not in w:  # numbers/symbols the aligner couldn't place; filled in below
                words.append({"text": w["word"], "start": None, "end": None, "score": 0})
                continue
            words.append({"text": w["word"], "start": round(w["start"], 3), "end": round(w["end"], 3),
                          "score": round(w.get("score", 0), 3)})
    # Give unaligned words the gap between their neighbours so nothing is dropped.
    for i, w in enumerate(words):
        if w["start"] is None:
            prev_end = next((words[j]["end"] for j in range(i - 1, -1, -1) if words[j]["end"] is not None), 0.0)
            nxt = next((words[j]["start"] for j in range(i + 1, len(words)) if words[j]["start"] is not None), prev_end + 0.3)
            w["start"], w["end"] = prev_end, max(prev_end + 0.05, nxt)
    for i, w in enumerate(words):
        w["i"] = i
    return {"language": language, "model": model_name, "repaired_gaps": repaired, "segments": segments, "words": words}


def _sha(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                       capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def _legacy_current(out, video):
    """Unstamped transcript: current if newer than the video, or if its last segment ends where the video ends."""
    if os.path.getmtime(out) >= os.path.getmtime(video):
        return True
    try:
        segs = json.load(open(out, encoding="utf-8"))["segments"]
        return abs(_duration(video) - segs[-1]["end"]) < 2.0
    except Exception:  # noqa: BLE001
        return False


@app.local_entrypoint()
def main(video: str, out: str, language: str = "hi", model: str = "large-v3", force: bool = False):
    stamp_path = out + ".stamp"
    sha = _sha(video)
    if os.path.exists(out) and not force:
        if os.path.exists(stamp_path):
            st = json.load(open(stamp_path))
            if (st.get("sha"), st.get("language"), st.get("model")) == (sha, language, model):
                print(f"{out} is current for this source/language/model: skipped (--force to redo)")
                return
        elif _legacy_current(out, video):  # made before stamps existed
            print(f"{out} exists and matches this source: skipped (--force to redo)")
            return
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, "a.wav")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", video, "-vn", "-ac", "1", "-ar", "16000", wav], check=True)
        data = open(wav, "rb").read()
    result = transcribe.remote(data, language, model)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    json.dump({"sha": sha, "language": language, "model": model}, open(stamp_path, "w"))
    print(f"{len(result['words'])} words, {len(result['segments'])} segments, repaired gaps {result['repaired_gaps']} -> {out}")
