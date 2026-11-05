"""Cut the presenter out of the frames that need it on Modal (BiRefNet HR matting) -> transparent WebM (VP9 + alpha).

    python -m modal run pipeline/matte_modal.py --video public/projects/<slug>/source.mp4 --out public/projects/<slug>/matte.webm [--edit public/projects/<slug>/edit.json] [--ranges 3.2:9.5,20:31] [--force]

The matte has the source's size, fps and length, so it lines up frame-for-frame with the A-roll.
Remotion plays it with <OffthreadVideo transparent>. Used by the header (presenter in front of the
panel), bgswap and sticker layouts. pip and aroll play the plain source, not the matte.

Cost control (the H100 bills per second):
  --edit    run it AFTER edit.json is approved: only the source ranges used by header (presenterInFront),
            bgswap and sticker segments are matted (output-timeline segments are mapped through `keep`).
            Every other frame is written fully transparent, so the file keeps the same length and fps.
  --ranges  explicit source-second ranges "a:b,c:d" (instead of --edit).
  neither   whole video (old behaviour).
  --pad     seconds added around each range (default 0.3) for the header slide-in and the alpha smoothing.
Skips the run when matte.webm already covers the request for this exact source (hash in matte.webm.stamp;
a legacy matte with no stamp counts as full if it is newer than the source or the same length). --force redoes it.
"""
import hashlib
import json
import os

import modal

app = modal.App("reel-matte")
models = modal.Volume.from_name("reel-models", create_if_missing=True)
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("torch==2.7.1", "torchvision==0.22.1", "transformers==4.53.3", "timm==1.0.19",
                 "kornia==0.8.1", "einops==0.8.1", "numpy<2.3", "huggingface_hub<1.0")
    .env({"HF_HOME": "/models/hf"})
)

MODEL_ID = "ZhengPeng7/BiRefNet_HR-matting"
MATTE_LAYOUTS = {"header", "bgswap", "sticker"}  # layouts that composite edit.matte


@app.function(image=image, gpu="H100", cpu=8, memory=32768, volumes={"/models": models}, timeout=3600)
def matte(video: bytes, smooth: float = 0.25, batch: int = 6, ranges: list | None = None) -> bytes:
    """ranges: source-second [a, b] pairs to matte; None = every frame. Other frames come out transparent."""
    import queue
    import subprocess
    import threading
    from fractions import Fraction

    import numpy as np
    import torch
    from transformers import AutoModelForImageSegmentation

    src, out = "/tmp/src.mp4", "/tmp/matte.webm"
    with open(src, "wb") as f:
        f.write(video)
    info = json.loads(subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", src],
                                     capture_output=True, text=True).stdout)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    w, h, fps = int(v["width"]), int(v["height"]), v["r_frame_rate"]
    fpsf = float(Fraction(fps))
    # Model input: nearest size divisible by 32 (1080x1920 -> 1088x1920)
    mw, mh = (w + 31) // 32 * 32, (h + 31) // 32 * 32
    spans = None if ranges is None else [(int(a * fpsf), int(b * fpsf) + 1) for a, b in ranges]

    def needed(i):
        return spans is None or any(a <= i < b for a, b in spans)

    cached = os.path.isdir("/models/hf/hub/models--" + MODEL_ID.replace("/", "--"))
    model = AutoModelForImageSegmentation.from_pretrained(MODEL_ID, trust_remote_code=True)
    model.to("cuda").eval().half()
    if not cached:
        models.commit()
    mean = torch.tensor([0.485, 0.456, 0.406], device="cuda").view(1, 3, 1, 1)
    std = torch.tensor([0.229, 0.224, 0.225], device="cuda").view(1, 3, 1, 1)

    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                           stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{w}x{h}",
                            "-r", fps, "-i", "-", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0",
                            "-crf", "22", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1",
                            "-auto-alt-ref", "0", out], stdin=subprocess.PIPE)
    frame_size = w * h * 3
    # decode -> (GPU, this thread) -> smooth + encode, so the H100 never waits on ffmpeg or numpy.
    q_in, q_out, errors = queue.Queue(maxsize=3), queue.Queue(maxsize=3), []
    counts = {"matted": 0, "total": 0}

    def reader():
        try:
            i, buf, skip = 0, [], 0
            while True:
                raw = dec.stdout.read(frame_size)
                if len(raw) < frame_size:
                    break
                if needed(i):
                    if skip:
                        q_in.put(("skip", skip)); skip = 0
                    buf.append(np.frombuffer(raw, np.uint8).reshape(h, w, 3))
                    if len(buf) == batch:
                        q_in.put(("frames", buf)); buf = []
                else:
                    if buf:
                        q_in.put(("frames", buf)); buf = []
                    skip += 1
                i += 1
            if buf:
                q_in.put(("frames", buf))
            if skip:
                q_in.put(("skip", skip))
            counts["total"] = i
        except Exception as e:  # noqa: BLE001
            errors.append(e)
        finally:
            q_in.put(None)

    def writer():
        prev_alpha = None
        clear = bytes(w * h * 4)
        try:
            while True:
                item = q_out.get()
                if item is None:
                    break
                if item[0] == "skip":
                    for _ in range(item[1]):
                        enc.stdin.write(clear)
                    prev_alpha = None
                    continue
                _, frames, alphas = item
                for rgb, a in zip(frames, alphas):
                    # Light temporal smoothing against edge shimmer; motion stays sharp because the weight is small.
                    if prev_alpha is not None and smooth > 0:
                        a = (1 - smooth) * a + smooth * prev_alpha
                    prev_alpha = a
                    enc.stdin.write(np.dstack([rgb, (a * 255).astype(np.uint8)]).tobytes())
        except Exception as e:  # noqa: BLE001
            errors.append(e)
            while q_out.get() is not None:  # keep draining so the GPU loop never blocks
                pass

    threads = [threading.Thread(target=reader, daemon=True), threading.Thread(target=writer, daemon=True)]
    for t in threads:
        t.start()
    try:
        while True:
            item = q_in.get()
            if item is None:
                break
            if item[0] == "skip":
                q_out.put(item)
                continue
            frames = item[1]
            x = torch.from_numpy(np.stack(frames)).to("cuda").permute(0, 3, 1, 2).float() / 255.0
            x = torch.nn.functional.interpolate(x, size=(mh, mw), mode="bilinear", align_corners=False)
            x = ((x - mean) / std).half()
            with torch.no_grad():
                pred = model(x)[-1].sigmoid().float()
            pred = torch.nn.functional.interpolate(pred, size=(h, w), mode="bilinear", align_corners=False)
            q_out.put(("alpha", frames, pred[:, 0].clamp(0, 1).cpu().numpy()))
            counts["matted"] += len(frames)
    finally:
        q_out.put(None)
        for t in threads:
            t.join()
        enc.stdin.close(); enc.wait(); dec.wait()
    if errors:
        raise errors[0]
    if enc.returncode != 0:
        raise RuntimeError(f"ffmpeg encode failed ({enc.returncode})")
    print(f"matted {counts['matted']} of {counts['total']} frames at {w}x{h} ({mw}x{mh} model input)")
    return open(out, "rb").read()


def _sha(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _merge(ranges):
    out = []
    for a, b in sorted(ranges):
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def _covers(have, want):
    """have/want: merged [a, b] lists or None (= whole video)."""
    if have is None:
        return True
    if want is None:
        return False
    return all(any(ha <= a + 1e-6 and b <= hb + 1e-6 for ha, hb in have) for a, b in want)


def ranges_from_edit(edit_path, pad):
    """Source-second ranges used by header(presenterInFront)/bgswap/sticker segments. Segments are on the
    output timeline; `keep` maps output time back to source time."""
    e = json.load(open(edit_path, encoding="utf-8-sig"))
    keep = e.get("keep") or [[0, e["duration"]]]
    want = [(s["start"], s["end"]) for s in e["segments"]
            if s["layout"] in MATTE_LAYOUTS and s.get("presenterInFront", True)]
    src, off = [], 0.0
    for ks, ke in keep:
        for a, b in want:
            lo, hi = max(a, off), min(b, off + (ke - ks))
            if hi > lo:
                src.append([max(0.0, ks + lo - off - pad), ks + hi - off + pad])
        off += ke - ks
    return _merge(src)


def _duration(path):
    import subprocess
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                       capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def _legacy_current(out, video):
    """Unstamped matte (a full one): current if newer than the source or exactly as long as it."""
    return os.path.getmtime(out) >= os.path.getmtime(video) or abs(_duration(out) - _duration(video)) < 0.1


@app.local_entrypoint()
def main(video: str, out: str, smooth: float = 0.25, edit: str = "", ranges: str = "", pad: float = 0.3,
         force: bool = False):
    want = None
    if ranges:
        want = _merge([[float(x) for x in r.split(":")] for r in ranges.split(",")])
    elif edit:
        want = ranges_from_edit(edit, pad)
        if not want:
            print("edit.json has no header/bgswap/sticker segment that uses the matte: nothing to matte")
            return
    stamp_path = out + ".stamp"
    sha = _sha(video)
    if os.path.exists(out) and not force:
        if os.path.exists(stamp_path):
            st = json.load(open(stamp_path))
            if st.get("sha") == sha and st.get("smooth") == smooth and _covers(st.get("ranges"), want):
                print(f"{out} already covers this request for this source: skipped (--force to redo)")
                return
        elif _legacy_current(out, video):  # full matte made before stamps existed
            print(f"{out} exists and matches this source: skipped (--force to redo)")
            return
    if want:
        total = sum(b - a for a, b in want)
        print(f"matting {total:.1f}s of the source: " + ", ".join(f"{a:.2f}-{b:.2f}" for a, b in want))
    data = matte.remote(open(video, "rb").read(), smooth, 6, want)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "wb") as f:
        f.write(data)
    json.dump({"sha": sha, "smooth": smooth, "ranges": want, "model": MODEL_ID}, open(stamp_path, "w"))
    print(f"{len(data) / 1e6:.1f} MB -> {out}")
