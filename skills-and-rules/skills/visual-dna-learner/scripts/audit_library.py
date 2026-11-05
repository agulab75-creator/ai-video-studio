"""Evidence extraction for the visual-dna-learner skill.

Commands
  inventory <folder> -o inventory.json          probe every video, assign stable IDs
  changes   <video>  -o changes.json            visual-change timeline (full-frame AND partial-frame)
  sheet     <video>  -o sheet.jpg [--fps 2]     contact sheet with burned-in timestamps
  strip     <video>  --at SEC -o strip.jpg      every frame around a moment, numbered
  all       <folder> -o <audit_dir>             inventory + changes + sheet for every video

Why partial-frame detection: a header panel, overlay or sticker changes only part of the
frame, so a full-frame scene score (ffmpeg `scene`) stays low and the insert is missed.
This script diffs the top, middle and bottom thirds separately.
Needs ffmpeg/ffprobe on PATH and numpy.
"""
import argparse, json, os, re, subprocess, sys
import numpy as np

VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"}
FONT = "C\\:/Windows/Fonts/arial.ttf" if os.name == "nt" else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
W, H = 72, 128  # analysis size (9:16); change detection doesn't need detail


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format",
                          "-show_streams", path], capture_output=True, text=True, encoding="utf-8")
    data = json.loads(out.stdout or "{}")
    v = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
    a = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)
    num, den = (v.get("r_frame_rate") or "0/1").split("/")
    fps = round(float(num) / float(den), 3) if float(den) else 0
    w, h = int(v.get("width", 0)), int(v.get("height", 0))
    return {"filename": os.path.basename(path), "path": os.path.abspath(path),
            "duration_seconds": round(float(data.get("format", {}).get("duration", 0)), 2),
            "width": w, "height": h, "fps": fps,
            "aspect_ratio": "9:16" if h > w else ("16:9" if w > h else "1:1"),
            "has_audio": a is not None}


def list_videos(folder):
    return sorted(os.path.join(folder, f) for f in os.listdir(folder)
                  if os.path.splitext(f)[1].lower() in VIDEO_EXT)


def cmd_inventory(folder, prefix, out):
    items = []
    for i, p in enumerate(list_videos(folder), 1):
        info = probe(p)
        info["video_id"] = f"{prefix}_{i:03d}"
        items.append(info)
    write_json(out, items)
    print(f"{len(items)} videos -> {out}")
    return items


def read_frames(path):
    """Yield (time, gray frame HxW float32) at native fps."""
    info = probe(path)
    fps = info["fps"] or 30
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", path, "-vf", f"scale={W}:{H}",
                             "-pix_fmt", "gray", "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
    n, size = 0, W * H
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            break
        yield n / fps, np.frombuffer(buf, np.uint8).reshape(H, W).astype(np.float32)
        n += 1
    proc.wait()


def cmd_changes(path, out, threshold=14.0, min_gap=0.25):
    """Record moments where a region of the frame changes sharply.

    threshold: mean absolute difference (0-255) in a third of the frame between consecutive frames.
    A talking head moving produces ~2-6; a jump cut on the same background ~8-15; an insert 20+.
    """
    thirds = [(0, H // 3), (H // 3, 2 * H // 3), (2 * H // 3, H)]
    names = ["top", "middle", "bottom"]
    prev, events, rows = None, [], []
    for t, f in read_frames(path):
        if prev is not None:
            d = [float(np.abs(f[a:b] - prev[a:b]).mean()) for a, b in thirds]
            rows.append((t, d))
        prev = f
    last_t = -1e9
    for i, (t, d) in enumerate(rows):
        hit = [names[k] for k in range(3) if d[k] >= threshold]
        if not hit:
            continue
        # keep only the local peak of a burst
        window = rows[max(0, i - 2): i + 3]
        if max(d) < max(max(x[1]) for x in window):
            continue
        if t - last_t < min_gap:
            continue
        last_t = t
        events.append({"t": round(t, 3), "regions": hit,
                       "kind": "full" if len(hit) == 3 else "partial",
                       "diff": [round(x, 1) for x in d]})
    write_json(out, {"video": os.path.basename(path), "threshold": threshold, "events": events})
    full = sum(e["kind"] == "full" for e in events)
    print(f"{os.path.basename(path)}: {len(events)} changes ({full} full, {len(events) - full} partial) -> {out}")
    return events


def cmd_sheet(path, out, fps=2.0, cols=10):
    info = probe(path)
    rows = int(np.ceil(info["duration_seconds"] * fps / cols)) or 1
    vf = (f"fps={fps},scale=180:320,drawtext=fontfile='{FONT}':text='%{{pts\\:hms}}':fontsize=18:"
          f"fontcolor=yellow:box=1:boxcolor=black@0.7:x=3:y=3,tile={cols}x{rows}:padding=2")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", path, "-vf", vf, "-frames:v", "1", "-q:v", "3", out],
                   check=True)
    print(f"sheet -> {out}")


def cmd_strip(path, at, out, frames=24, cols=8):
    info = probe(path)
    fps = info["fps"] or 30
    start = max(0.0, at - frames / fps / 3)
    rows = int(np.ceil(frames / cols))
    vf = (f"scale=270:480,drawtext=fontfile='{FONT}':text='%{{n}}  %{{pts\\:hms\\:{start:.3f}}}':fontsize=20:"
          f"fontcolor=red:box=1:boxcolor=white@0.8:x=4:y=4,tile={cols}x{rows}:padding=2")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{start:.3f}", "-i", path, "-frames:v", str(frames),
                    "-vf", vf, "-frames:v", "1", out], check=True)
    print(f"strip {start:.2f}s +{frames} frames -> {out}")


def cmd_all(folder, audit_dir, prefix):
    os.makedirs(audit_dir, exist_ok=True)
    items = cmd_inventory(folder, prefix, os.path.join(audit_dir, "inventory.json"))
    for it in items:
        vid = it["video_id"]
        cmd_changes(it["path"], os.path.join(audit_dir, f"{vid}_changes.json"))
        cmd_sheet(it["path"], os.path.join(audit_dir, f"{vid}_sheet.jpg"))


def write_json(path, data):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # emoji filenames on Windows consoles
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("inventory"); s.add_argument("folder"); s.add_argument("-o", required=True); s.add_argument("--prefix", default="REF")
    s = sub.add_parser("changes"); s.add_argument("video"); s.add_argument("-o", required=True); s.add_argument("--threshold", type=float, default=14.0)
    s = sub.add_parser("sheet"); s.add_argument("video"); s.add_argument("-o", required=True); s.add_argument("--fps", type=float, default=2.0)
    s = sub.add_parser("strip"); s.add_argument("video"); s.add_argument("--at", type=float, required=True); s.add_argument("-o", required=True); s.add_argument("--frames", type=int, default=24)
    s = sub.add_parser("all"); s.add_argument("folder"); s.add_argument("-o", required=True); s.add_argument("--prefix", default="REF")
    a = p.parse_args()
    if a.cmd == "inventory": cmd_inventory(a.folder, a.prefix, a.o)
    elif a.cmd == "changes": cmd_changes(a.video, a.o, a.threshold)
    elif a.cmd == "sheet": cmd_sheet(a.video, a.o, a.fps)
    elif a.cmd == "strip": cmd_strip(a.video, a.at, a.o, a.frames)
    elif a.cmd == "all": cmd_all(a.folder, a.o, a.prefix)


if __name__ == "__main__":
    main()
