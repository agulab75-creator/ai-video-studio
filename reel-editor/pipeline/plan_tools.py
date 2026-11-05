"""Planning helpers for reel-editor. Scripts do the arithmetic; the agent does the thinking.

  words    <transcript.json>                         numbered word list (to write roman.txt)
  captions <transcript.json> --roman roman.txt -o captions.json [--edit edit.json]
                                                     caption chunks in OUTPUT time (applies edit.keep)
  beats    <transcript.json> [--edit edit.json]      sentences with output times, pauses marked
  tighten  <transcript.json> [--max-pause 0.35]       keep ranges that shorten long pauses (jump cuts)
  check    <edit.json>                               validate an edit and report coverage vs the style
  sfxmix   <edit.json> [-o preview.wav]              voice + edit.sfx: level of each cue vs the voice, clipping

roman.txt: one line per transcript word, same order. An empty line merges that word into the
previous one (e.g. "GLP" + "one" -> "GLP-1" on the first line, blank on the second).
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.normpath(os.path.join(HERE, "..", "public"))
END_PUNCT = re.compile(r"[?.!,।|]$")


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save(p, data):
    os.makedirs(os.path.dirname(os.path.abspath(p)), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


# ---------- time mapping ----------
def mapper(keep):
    """source seconds -> output seconds (None if cut)."""
    if not keep:
        return lambda t: t
    ranges, acc = [], 0.0
    for s, e in keep:
        ranges.append((s, e, acc))
        acc += e - s

    def f(t):
        for s, e, off in ranges:
            if s - 1e-6 <= t <= e + 1e-6:
                return off + (t - s)
        return None
    return f


def keep_of(edit_path):
    if not edit_path:
        return None
    return load(edit_path).get("keep")


# ---------- words / roman ----------
def cmd_words(transcript):
    words = load(transcript)["words"]
    print(" | ".join(f"{w['i']}:{w['text']}" for w in words))
    print(f"\n{len(words)} words. Write roman.txt with exactly {len(words)} lines.")


def merged_words(transcript, roman_path):
    words = load(transcript)["words"]
    with open(roman_path, encoding="utf-8") as f:
        roman = f.read().split("\n")
    if roman and roman[-1] == "":
        roman = roman[:-1]
    if len(roman) != len(words):
        sys.exit(f"roman.txt has {len(roman)} lines but the transcript has {len(words)} words")
    out = []
    for w, r in zip(words, roman):
        r = r.strip()
        if not r:
            if out:
                out[-1]["end"] = w["end"]
                out[-1]["src"] += w["text"]
            continue
        out.append({"text": r, "start": w["start"], "end": w["end"], "src": w["text"]})
    return out


def cmd_captions(transcript, roman, out, edit=None, max_words=4, max_chars=22, pause=0.28):
    m = mapper(keep_of(edit))
    words = []
    for w in merged_words(transcript, roman):
        s, e = m(w["start"]), m(w["end"])
        if s is None or e is None:
            continue
        words.append({**w, "start": round(s, 3), "end": round(e, 3)})
    chunks, cur = [], []

    def flush():
        if cur:
            chunks.append({"start": cur[0]["start"], "end": cur[-1]["end"],
                           "words": [{"text": x["text"].rstrip(",."), "start": x["start"], "end": x["end"]} for x in cur]})
            cur.clear()

    for w in words:
        if cur:
            chars = sum(len(x["text"]) + 1 for x in cur) + len(w["text"])
            gap = w["start"] - cur[-1]["end"]
            ended = END_PUNCT.search(cur[-1]["src"]) or END_PUNCT.search(cur[-1]["text"])
            if len(cur) >= max_words or chars > max_chars or gap > pause or ended:
                flush()
        cur.append(w)
    flush()
    # don't leave a lonely one-word chunk if it can join its neighbour
    i = 1
    while i < len(chunks):
        c, p = chunks[i], chunks[i - 1]
        p_chars = sum(len(x["text"]) + 1 for x in p["words"]) + len(c["words"][0]["text"])
        if len(c["words"]) == 1 and len(p["words"]) <= max_words and p_chars <= max_chars + 8 \
                and c["start"] - p["end"] < pause and not END_PUNCT.search(p["words"][-1]["text"]):
            p["words"] += c["words"]
            p["end"] = c["end"]
            chunks.pop(i)
        else:
            i += 1
    save(out, {"chunks": chunks})
    print(f"{len(words)} words -> {len(chunks)} caption chunks -> {out}")


def cmd_beats(transcript, edit=None, roman=None):
    m = mapper(keep_of(edit))
    words = merged_words(transcript, roman) if roman else [
        {"text": w["text"], "start": w["start"], "end": w["end"], "src": w["text"]} for w in load(transcript)["words"]]
    line, start, prev_end = [], None, None
    for w in words:
        s = m(w["start"])
        if s is None:
            continue
        if prev_end is not None and w["start"] - prev_end > 0.45 and line:
            print(f"{start:6.2f}  {' '.join(line)}    [pause {w['start'] - prev_end:.2f}s]")
            line, start = [], None
        if start is None:
            start = s
        line.append(w["text"])
        prev_end = w["end"]
        if END_PUNCT.search(w["src"]) or END_PUNCT.search(w["text"]):
            print(f"{start:6.2f}  {' '.join(line)}")
            line, start = [], None
    if line:
        print(f"{start:6.2f}  {' '.join(line)}")


def cmd_tighten(transcript, max_pause=0.35, pad=0.12, head=0.05, tail=0.35):
    """Keep ranges that shorten every pause longer than max_pause down to 2*pad (jump cuts).
    Cuts land between words, never inside one."""
    words = load(transcript)["words"]
    keep, s = [], max(0.0, words[0]["start"] - head)
    for a, b in zip(words, words[1:]):
        if b["start"] - a["end"] > max_pause:
            keep.append([round(s, 3), round(a["end"] + pad, 3)])
            s = b["start"] - pad
    keep.append([round(s, 3), round(words[-1]["end"] + tail, 3)])
    out = sum(e - s for s, e in keep)
    src = words[-1]["end"] - words[0]["start"]
    print(json.dumps(keep))
    print(f"{len(keep)} ranges, {len(keep) - 1} jump cuts, output {out:.2f}s (speech span {src:.2f}s, saved {src - out + head + tail:.2f}s)")


# ---------- check ----------
STYLE = {  # from learner/ali abdal refrence/style-dna/ali-abdaal/style-spec.json (v5)
    "aroll_share": (0.35, 0.45, 0.21, 0.56),
    "changes_per_min": (7.9, 19.5),
    "len": {"aroll": (0.5, 13), "header": (1.5, 9.5), "bgswap": (2, 5), "overlay": (1, 6), "fullscreen": (1, 15), "pip": (1.5, 8),
            "sticker": (1.5, 12)},  # ReelPaper: presenter as a sticker on the paper desk
}


def cmd_check(edit_path, transcript=None):
    e = load(edit_path)
    segs = sorted(e["segments"], key=lambda s: s["start"])
    dur = e["duration"]
    errors, warns = [], []
    # word boundaries in output time
    tpath = transcript or os.path.join(os.path.dirname(edit_path), "transcript.json")
    words = []
    if os.path.exists(tpath):
        m = mapper(e.get("keep"))
        for w in load(tpath)["words"]:
            s, en = m(w["start"]), m(w["end"])
            if s is not None and en is not None:
                words.append((s, en, w["text"]))
    if abs(segs[0]["start"]) > 0.02:
        errors.append(f"first segment starts at {segs[0]['start']} (must be 0)")
    if abs(segs[-1]["end"] - dur) > 0.05:
        errors.append(f"last segment ends at {segs[-1]['end']} but duration is {dur}")
    for a, b in zip(segs, segs[1:]):
        if abs(a["end"] - b["start"]) > 0.02:
            errors.append(f"{a['id']} ends {a['end']} but {b['id']} starts {b['start']} (gap/overlap)")
    for s in segs:
        if s["end"] - s["start"] < 0.4:
            errors.append(f"{s['id']} is only {s['end'] - s['start']:.2f}s")
        for t in (s["start"],):
            inside = [w for w in words if w[0] + 0.06 < t < w[1] - 0.06]
            if inside and t > 0:
                warns.append(f"{s['id']} starts inside the word '{inside[0][2]}' ({inside[0][0]:.2f}-{inside[0][1]:.2f}); snap to a word edge")
        lay = s["layout"]
        lo, hi = STYLE["len"][lay]
        L = s["end"] - s["start"]
        if not lo <= L <= hi:
            warns.append(f"{s['id']} {lay} is {L:.1f}s (style range {lo}-{hi}s)")
        if lay in ("header", "bgswap", "sticker") and not e.get("matte") and (lay != "header" or s.get("presenterInFront", True)):
            errors.append(f"{s['id']} {lay} needs edit.matte")
        for el in s.get("elements", []):
            src = el.get("src")
            if src and not os.path.exists(os.path.join(PUBLIC, src)):
                errors.append(f"{s['id']}: missing asset public/{src}")
            at = (el.get("enter") or {}).get("at", 0)
            if at > L:
                warns.append(f"{s['id']}: element enters at {at}s but the segment is {L:.1f}s")
        bg = s.get("background") or {}
        if bg.get("src") and not os.path.exists(os.path.join(PUBLIC, bg["src"])):
            errors.append(f"{s['id']}: missing background public/{bg['src']}")
        if not s.get("why"):
            warns.append(f"{s['id']}: no 'why' (say what line triggered this layout)")
    for p in ("source", "matte", "captions"):
        if e.get(p) and not os.path.exists(os.path.join(PUBLIC, e[p])):
            errors.append(f"missing public/{e[p]}")
    sfx = sorted(e.get("sfx", []), key=lambda x: x["at"])
    for x in sfx:
        if not os.path.exists(os.path.join(PUBLIC, "sfx", x["sound"] + ".mp3")):
            errors.append(f"sfx at {x['at']}s: missing public/sfx/{x['sound']}.mp3")
        if not 0 <= x["at"] < dur:
            errors.append(f"sfx {x['sound']} at {x['at']}s is outside the reel")
        if x.get("volume", 0.3) > 0.9:
            warns.append(f"sfx {x['sound']} at {x['at']}s: volume {x['volume']} will fight the voice")
    for a, b in zip(sfx, sfx[1:]):
        if b["at"] - a["at"] < 0.12 and a["sound"] == b["sound"]:
            warns.append(f"sfx {a['sound']} twice within 0.12s at {a['at']}s (sounds like one flam)")

    share = {}
    for s in segs:
        share[s["layout"]] = share.get(s["layout"], 0) + s["end"] - s["start"]
    aroll = share.get("aroll", 0) / dur
    changes = len(segs) - 1
    first_visual = next((s["start"] for s in segs if s["layout"] != "aroll"), None)
    runs = [s["end"] - s["start"] for s in segs if s["layout"] == "aroll"]
    end_hold = segs[-1]["end"] - segs[-1]["start"] if segs[-1]["layout"] == "aroll" else 0
    print(f"duration {dur:.1f}s, {len(segs)} segments, {changes / dur * 60:.1f} layout changes/min (style 8-20)")
    print("share: " + ", ".join(f"{k} {v / dur:.0%}" for k, v in sorted(share.items(), key=lambda x: -x[1])))
    print(f"plain A-roll {aroll:.0%} (style typical 35-45%, range 21-56%)")
    print(f"first visual at {first_visual}s (style: within 1s) | longest A-roll {max(runs, default=0):.1f}s | end hold {end_hold:.1f}s (style: 8-13s takeaway hold in 6/11)")
    lo, hi, mn, mx = STYLE["aroll_share"]
    if not mn <= aroll <= mx:
        warns.append(f"plain A-roll share {aroll:.0%} is outside the style range {mn:.0%}-{mx:.0%}")
    if first_visual is None or first_visual > 1.0:
        warns.append("no visual in the first second")
    print()
    for s in segs:
        print(f"  {s['start']:6.2f}-{s['end']:6.2f}  {s['layout']:10s} {s['id']:14s} {s.get('why', '')[:70]}")
    print()
    for w in warns:
        print("WARN ", w)
    for x in errors:
        print("ERROR", x)
    if errors:
        sys.exit(1)
    print("OK" if not warns else f"OK with {len(warns)} warnings")


def cmd_sfxmix(edit_path, out=None):
    """Voice (keep ranges, voiceVolume) + edit.sfx mixed with numpy: a fast audio preview and level report."""
    import subprocess
    import numpy as np
    SR = 48000
    e = load(edit_path)
    fps = e["fps"]

    def decode(p, extra=()):
        raw = subprocess.run(["ffmpeg", "-v", "quiet", "-i", p, *extra, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                             capture_output=True).stdout
        return np.frombuffer(raw, np.float32).copy()

    fr = lambda t: int(round(t * fps)) * SR // fps  # frame-exact sample index, like Remotion's Sequences
    src = decode(os.path.join(PUBLIC, e["source"]), ["-vn"])
    keep = e.get("keep") or [[0, len(src) / SR]]
    voice = np.concatenate([src[fr(s):fr(s) + fr(en - s)] for s, en in keep]) * e.get("voiceVolume", 1)
    sfx = np.zeros(len(voice), np.float32)
    files = {}
    db = lambda x: 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9) if len(x) else -120
    n = int(0.15 * SR)
    print("  at     sound         sfx vs voice (rms at the sound's loudest 0.15s; aim -6 to -14 dB)")
    for c in e.get("sfx", []):
        x = files.setdefault(c["sound"], decode(os.path.join(PUBLIC, "sfx", c["sound"] + ".mp3")))
        x = x[int(c.get("trimBefore", 0) * SR):] * c.get("volume", 0.3)
        i0 = fr(c["at"])
        x = x[: max(0, len(sfx) - i0)]
        sfx[i0:i0 + len(x)] += x
        if len(x) < n:
            continue
        j = int(np.convolve(x ** 2, np.ones(n), "valid").argmax())
        rel = db(x[j:j + n]) - db(voice[i0 + j:i0 + j + n])
        flag = "  <- quiet" if rel < -16 else "  <- loud" if rel > -4 else ""
        print(f"  {c['at']:6.2f} {c['sound']:13s} {rel:6.1f} dB{flag}")
    mix = voice + sfx
    peak = 20 * np.log10(np.abs(mix).max() + 1e-9)
    over = int((np.abs(mix) > 1.0).sum())
    print(f"mix peak {peak:.1f} dBFS, {over} samples over full scale (voice alone: {int((np.abs(voice) > 1.0).sum())})")
    if out:
        pcm = (np.clip(mix, -1, 1) * 32767).astype("<i2").tobytes()
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", out],
                       input=pcm, check=True)
        print("wrote", out)


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("words"); s.add_argument("transcript")
    s = sub.add_parser("captions"); s.add_argument("transcript"); s.add_argument("--roman", required=True); s.add_argument("-o", required=True); s.add_argument("--edit")
    s = sub.add_parser("beats"); s.add_argument("transcript"); s.add_argument("--edit"); s.add_argument("--roman")
    s = sub.add_parser("check"); s.add_argument("edit"); s.add_argument("--transcript")
    s = sub.add_parser("tighten"); s.add_argument("transcript"); s.add_argument("--max-pause", type=float, default=0.35); s.add_argument("--pad", type=float, default=0.12)
    s = sub.add_parser("sfxmix"); s.add_argument("edit"); s.add_argument("-o")
    a = p.parse_args()
    if a.cmd == "words": cmd_words(a.transcript)
    elif a.cmd == "captions": cmd_captions(a.transcript, a.roman, a.o, a.edit)
    elif a.cmd == "beats": cmd_beats(a.transcript, a.edit, a.roman)
    elif a.cmd == "check": cmd_check(a.edit, a.transcript)
    elif a.cmd == "tighten": cmd_tighten(a.transcript, a.max_pause, a.pad)
    elif a.cmd == "sfxmix": cmd_sfxmix(a.edit, a.o)


if __name__ == "__main__":
    main()
