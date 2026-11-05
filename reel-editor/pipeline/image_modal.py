"""Generate still assets on Modal: Qwen-Image-2512 (text-to-image) and Qwen-Image-Edit-2511 (edits),
optional cutout with BiRefNet (rembg). Both Qwen models are Apache-2.0, fine for client work.

    python -m modal run pipeline/image_modal.py --spec public/projects/<slug>/assets.json [--only id1,id2] [--steps 20] [--force]

assets.json is a list of:
  {"id": "glp1_pen", "prompt": "...", "negative": "...", "aspect": "1:1", "cutout": true, "seed": 7}
  {"id": "pen_halftone", "edit": "projects/<slug>/assets/glp1_pen_raw.png", "prompt": "make it ...", "cutout": true}
Only entries whose output file doesn't exist yet are generated (add "force": true to redo one).
An entry whose prompt/seed/aspect/etc. changed since it was generated (hash in assets/<id>.stamp) is redone too;
assets made before stamps existed are left alone. --steps N overrides the step count (e.g. 20 for a cheap draft
pass); drafts are redone by the next normal run. Default is 30 steps (was 50).
Output: public/projects/<slug>/assets/<id>.png (cutout, trimmed, transparent) and <id>_raw.png.

The H100 only generates. Cutouts run on cheap CPU containers (Cutter) while the next image renders.
"""
import hashlib
import io
import json
import os

import modal

app = modal.App("reel-images")
models = modal.Volume.from_name("reel-models", create_if_missing=True)
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch==2.8.0", "torchvision==0.23.0", "diffusers==0.40.0", "transformers==5.17.0", "accelerate==1.15.0",
                 "pillow", "numpy")
    .env({"HF_HOME": "/models/hf"})
)
cut_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("rembg[cpu]==2.0.85", "pillow", "numpy")
    .env({"U2NET_HOME": "/models/rembg"})
)

DEFAULT_STEPS = 30
SIZES = {"1:1": (1328, 1328), "9:16": (928, 1664), "16:9": (1664, 928), "4:3": (1472, 1104),
         "3:4": (1104, 1472), "3:2": (1584, 1056), "2:3": (1056, 1584)}
NEGATIVE = ("text, watermark, logo, brand name, letters, caption, blurry, low quality, deformed, extra fingers, "
            "cropped, frame, border")


def _load(cls, repo):
    """Straight onto the GPU (no 57 GB staging copy in host RAM); falls back to the old load if unsupported."""
    import torch
    try:
        return cls.from_pretrained(repo, torch_dtype=torch.bfloat16, device_map="cuda")
    except (ValueError, NotImplementedError) as e:
        print(f"device_map='cuda' not supported ({e}); loading via CPU")
        return cls.from_pretrained(repo, torch_dtype=torch.bfloat16).to("cuda")


# scaledown_window: release the H100 15 s after the last image instead of the 60 s default, while the CPU cutter
# finishes the final cutout (still long enough to bridge the gap between two images in the loop below).
@app.cls(image=image, gpu="H100", volumes={"/models": models}, timeout=3600, memory=32768, scaledown_window=15)
class Images:
    @modal.enter()
    def load(self):
        self.gen = None
        self.edit = None

    def _gen(self):
        import torch
        from diffusers import DiffusionPipeline
        if self.gen is None:
            self.edit = None
            torch.cuda.empty_cache()
            cached = os.path.isdir("/models/hf/hub/models--Qwen--Qwen-Image-2512")
            self.gen = _load(DiffusionPipeline, "Qwen/Qwen-Image-2512")
            if not cached:
                models.commit()
        return self.gen

    def _edit(self):
        import torch
        from diffusers import QwenImageEditPlusPipeline
        if self.edit is None:
            self.gen = None
            torch.cuda.empty_cache()
            cached = os.path.isdir("/models/hf/hub/models--Qwen--Qwen-Image-Edit-2511")
            self.edit = _load(QwenImageEditPlusPipeline, "Qwen/Qwen-Image-Edit-2511")
            if not cached:
                models.commit()
        return self.edit

    @modal.method()
    def make(self, item: dict, edit_input: bytes | None = None) -> bytes:
        """Raw PNG bytes. The cutout is a separate Cutter call so the H100 never waits on CPU work."""
        import torch
        from PIL import Image
        g = torch.Generator("cuda").manual_seed(int(item.get("seed", 7)))
        steps = int(item.get("steps", DEFAULT_STEPS))
        if edit_input is not None:
            src = Image.open(io.BytesIO(edit_input)).convert("RGB")
            out = self._edit()(image=[src], prompt=item["prompt"], negative_prompt=item.get("negative", " "),
                               num_inference_steps=steps, true_cfg_scale=4.0, guidance_scale=1.0,
                               generator=g).images[0]
        else:
            w, h = SIZES[item.get("aspect", "1:1")]
            out = self._gen()(prompt=item["prompt"], negative_prompt=item.get("negative", NEGATIVE), width=w, height=h,
                              num_inference_steps=steps, true_cfg_scale=4.0, generator=g).images[0]
        buf = io.BytesIO()
        out.save(buf, "PNG")
        return buf.getvalue()


@app.cls(image=cut_image, cpu=8, memory=8192, volumes={"/models": models}, timeout=900, max_containers=3)
class Cutter:
    """BiRefNet (rembg birefnet-general) cutout on CPU: same model and settings as before, not on the H100."""

    @modal.enter()
    def load(self):
        from rembg import new_session
        cached = os.path.isdir("/models/rembg")
        self.cut = new_session("birefnet-general")
        if not cached:
            models.commit()

    @modal.method()
    def cut_out(self, raw: bytes) -> bytes:
        from PIL import Image
        from rembg import remove
        img = Image.open(io.BytesIO(raw))
        rgba = remove(img.convert("RGB"), session=self.cut, post_process_mask=True)
        box = rgba.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox()
        if box:
            pad = int(0.03 * max(rgba.size))
            box = (max(0, box[0] - pad), max(0, box[1] - pad), min(rgba.width, box[2] + pad), min(rgba.height, box[3] + pad))
            rgba = rgba.crop(box)
        buf = io.BytesIO()
        (rgba if isinstance(rgba, Image.Image) else Image.open(io.BytesIO(rgba))).save(buf, "PNG")
        return buf.getvalue()


def _stamp(item, draft):
    keys = ("prompt", "negative", "aspect", "seed", "steps", "edit", "cutout")
    body = json.dumps({k: item.get(k) for k in keys}, sort_keys=True, ensure_ascii=False)
    return {"hash": hashlib.sha1(body.encode("utf-8")).hexdigest(), "draft": draft}


@app.local_entrypoint()
def main(spec: str, only: str = "", steps: int = 0, force: bool = False):
    public = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public"))
    items = json.load(open(spec, encoding="utf-8"))
    outdir = os.path.join(os.path.dirname(os.path.abspath(spec)), "assets")
    os.makedirs(outdir, exist_ok=True)
    wanted = set(only.split(",")) if only else None
    ids = [it["id"] for it in items]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise SystemExit(f"duplicate ids in {spec}: {sorted(dupes)}")

    def stale(it):
        png, stamp = (os.path.join(outdir, f"{it['id']}{x}") for x in (".png", ".stamp"))
        if force or it.get("force") or not os.path.exists(png):
            return True
        if not os.path.exists(stamp):  # made before stamps existed: leave it alone
            return False
        old = json.load(open(stamp))
        return bool(old.get("draft")) or old.get("hash") != _stamp(it, False)["hash"]

    todo = [it for it in items if (wanted is None or it["id"] in wanted) and stale(it)]
    print(f"{len(todo)} of {len(items)} assets to generate" + (f" (draft, {steps} steps)" if steps else ""))
    worker, cutter = Images(), Cutter()
    pending = []

    def write_stamp(it):
        json.dump(_stamp(it, bool(steps)), open(os.path.join(outdir, f"{it['id']}.stamp"), "w"))

    for it in todo:
        gen_item = {**it, "steps": steps} if steps else it
        edit_bytes = open(os.path.join(public, it["edit"]), "rb").read() if it.get("edit") else None
        raw = worker.make.remote(gen_item, edit_bytes)
        open(os.path.join(outdir, f"{it['id']}_raw.png"), "wb").write(raw)
        if it.get("cutout"):
            pending.append((it, cutter.cut_out.spawn(raw)))  # CPU works while the H100 starts the next image
        else:
            open(os.path.join(outdir, f"{it['id']}.png"), "wb").write(raw)
            write_stamp(it)
            print(f"  {it['id']}.png")
    for it, call in pending:
        open(os.path.join(outdir, f"{it['id']}.png"), "wb").write(call.get())
        write_stamp(it)
        print(f"  {it['id']}.png (cutout)")
