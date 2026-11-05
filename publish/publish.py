#!/usr/bin/env python3
"""Post one finished reel to Instagram, Facebook and YouTube Shorts.

    python publish/publish.py out/reel_final.mp4 --caption "text #tags" --title "Short title" --to ig,fb,yt
    python publish/publish.py out/reel_final.mp4 --caption "..." --to ig,fb,yt --live

Dry run by default: validates the file and credentials, prints what it would post, uploads nothing.
Credentials come from environment variables (see .env.example); nothing is stored in the repo.
"""
import argparse, os, sys, time, subprocess, json
import requests

GRAPH = "https://graph.facebook.com/v21.0"

env = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(env):  # KEY=value lines; real environment wins
    for line in open(env, encoding="utf-8"):
        k, _, v = line.strip().partition("=")
        if k and not k.startswith("#") and v:
            os.environ.setdefault(k, v)


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height:format=duration", "-of", "json", path],
        capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    return j["streams"][0]["width"], j["streams"][0]["height"], float(j["format"]["duration"])


def need(*names):
    missing = [n for n in names if not os.environ.get(n)]
    if missing:
        sys.exit(f"missing env vars: {', '.join(missing)}")


def check(r):
    if not r.ok:
        sys.exit(f"{r.request.method} {r.url.split('?')[0]} -> {r.status_code}: {r.text[:400]}")
    return r.json()


def instagram(path, caption):
    need("META_ACCESS_TOKEN", "IG_USER_ID")
    tok, uid, size = os.environ["META_ACCESS_TOKEN"], os.environ["IG_USER_ID"], os.path.getsize(path)
    c = check(requests.post(f"{GRAPH}/{uid}/media", data={
        "media_type": "REELS", "upload_type": "resumable", "caption": caption,
        "share_to_feed": "true", "access_token": tok}))
    with open(path, "rb") as f:
        check(requests.post(c["uri"], data=f, headers={
            "Authorization": f"OAuth {tok}", "offset": "0", "file_size": str(size)}))
    for _ in range(60):  # IG transcodes after upload; ~5 min cap
        st = check(requests.get(f"{GRAPH}/{c['id']}", params={
            "fields": "status_code", "access_token": tok}))["status_code"]
        if st == "FINISHED":
            break
        if st in ("ERROR", "EXPIRED"):
            sys.exit(f"instagram processing failed: {st}")
        time.sleep(5)
    else:
        sys.exit("instagram processing timed out")
    pub = check(requests.post(f"{GRAPH}/{uid}/media_publish", data={
        "creation_id": c["id"], "access_token": tok}))
    return f"instagram media id {pub['id']}"


def facebook(path, caption):
    need("META_ACCESS_TOKEN", "FB_PAGE_ID")
    pid, size = os.environ["FB_PAGE_ID"], os.path.getsize(path)
    ptok = check(requests.get(f"{GRAPH}/{pid}", params={
        "fields": "access_token", "access_token": os.environ["META_ACCESS_TOKEN"]}))["access_token"]
    s = check(requests.post(f"{GRAPH}/{pid}/video_reels", data={
        "upload_phase": "start", "access_token": ptok}))
    with open(path, "rb") as f:
        check(requests.post(s["upload_url"], data=f, headers={
            "Authorization": f"OAuth {ptok}", "offset": "0", "file_size": str(size)}))
    check(requests.post(f"{GRAPH}/{pid}/video_reels", data={
        "upload_phase": "finish", "video_id": s["video_id"], "video_state": "PUBLISHED",
        "description": caption, "access_token": ptok}))
    return f"facebook reel video id {s['video_id']}"


def youtube(path, title, caption, public):
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    scopes = ["https://www.googleapis.com/auth/youtube.upload"]
    secret, tokfile = os.environ.get("YT_CLIENT_SECRET", "client_secret.json"), "yt_token.json"
    creds = Credentials.from_authorized_user_file(tokfile, scopes) if os.path.exists(tokfile) else None
    if not creds or not creds.valid:
        if creds and creds.refresh_token:
            creds.refresh(Request())
        else:
            creds = InstalledAppFlow.from_client_secrets_file(secret, scopes).run_local_server(port=0)
        open(tokfile, "w").write(creds.to_json())
    yt = build("youtube", "v3", credentials=creds)
    req = yt.videos().insert(
        part="snippet,status",
        body={"snippet": {"title": title[:100], "description": caption, "categoryId": "22"},
              "status": {"privacyStatus": "public" if public else "private",
                         "selfDeclaredMadeForKids": False}},
        media_body=MediaFileUpload(path, chunksize=-1, resumable=True))
    resp = None
    while resp is None:
        _, resp = req.next_chunk()
    return f"youtube https://youtu.be/{resp['id']} ({'public' if public else 'private'})"


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("video")
    a.add_argument("--caption", required=True)
    a.add_argument("--title", help="YouTube title (default: first line of caption)")
    a.add_argument("--to", default="ig,fb,yt", help="comma list of ig,fb,yt")
    a.add_argument("--live", action="store_true", help="actually upload (default is dry run)")
    a.add_argument("--yt-public", action="store_true", help="publish YouTube as public (default private)")
    a = a.parse_args()

    targets = [t.strip() for t in a.to.split(",") if t.strip()]
    bad = set(targets) - {"ig", "fb", "yt"}
    if bad:
        sys.exit(f"unknown target(s): {', '.join(sorted(bad))}")
    if not os.path.isfile(a.video):
        sys.exit(f"no such file: {a.video}")
    w, h, dur = probe(a.video)
    if h <= w:
        sys.exit(f"{w}x{h} is not vertical; reels/shorts need 9:16")
    if dur > 90 and "ig" in targets:
        print(f"warning: {dur:.0f}s; Instagram Reels allow up to 90s on this API path", file=sys.stderr)
    if dur > 180 and "yt" in targets:
        sys.exit(f"{dur:.0f}s is over 3 minutes, so YouTube will not treat it as a Short")
    title = a.title or a.caption.splitlines()[0][:90]
    if "#shorts" not in (title + a.caption).lower():
        a.caption += "\n#Shorts"
    print(f"{a.video}  {w}x{h}  {dur:.1f}s  ->  {', '.join(targets)}  ({'LIVE' if a.live else 'dry run'})")
    if not a.live:
        print(f"title:   {title}\ncaption: {a.caption}\nre-run with --live to upload.")
        return
    for t in targets:  # one platform failing must not hide the others' results
        try:
            print({"ig": lambda: instagram(a.video, a.caption),
                   "fb": lambda: facebook(a.video, a.caption),
                   "yt": lambda: youtube(a.video, title, a.caption, a.yt_public)}[t]())
        except SystemExit as e:
            print(f"{t} FAILED: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
