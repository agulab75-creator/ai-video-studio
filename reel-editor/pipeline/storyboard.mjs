// Render stills of a reel for review, without rendering the whole video.
//
//   node pipeline/storyboard.mjs <project>                    one still per segment (at its middle)
//   node pipeline/storyboard.mjs <project> --at 4.2,19,33.5    stills at these output times
//   node pipeline/storyboard.mjs <project> --strip 5.39 --frames 16   every frame from a time (motion check)
//   add --comp ReelV3 (or ReelV2) for the newer renderers
//
// Writes out/<project>/story/*.jpg and a labelled contact sheet out/<project>/storyboard.jpg
// (or strip_<t>.jpg). Look at the sheet before rendering the full reel.
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [project, ...rest] = process.argv.slice(2);
if (!project) {
  console.log("usage: node pipeline/storyboard.mjs <project> [--at t1,t2] [--strip t --frames n]");
  process.exit(1);
}
const arg = (name) => {
  const i = rest.indexOf(name);
  return i === -1 ? undefined : rest[i + 1];
};
// --comp ReelV3 (reads edit_v3.json scenes) / ReelV2 (edit_v2.json); default Reel (edit.json)
const comp = arg("--comp") ?? "Reel";
const editFile = { Reel: "edit.json", ReelPaper: "edit.json", ReelV2: "edit_v2.json", ReelV3: "edit_v3.json" }[comp];
const edit = JSON.parse(fs.readFileSync(path.join(root, "public/projects", project, editFile), "utf8"));
if (!edit.segments) edit.segments = edit.scenes.map((s) => ({ ...s, layout: s.kind }));
const fps = edit.fps;

let shots; // [{frame, label}]
if (arg("--strip")) {
  const start = Math.round(parseFloat(arg("--strip")) * fps);
  const n = parseInt(arg("--frames") ?? "16", 10);
  shots = Array.from({ length: n }, (_, k) => ({ frame: start + k, label: `f${start + k}  ${((start + k) / fps).toFixed(2)}s` }));
} else if (arg("--at")) {
  shots = arg("--at").split(",").map((t) => ({ frame: Math.round(parseFloat(t) * fps), label: `${parseFloat(t).toFixed(2)}s` }));
} else {
  shots = edit.segments.map((s) => {
    // a bit past the middle so entrances have landed
    const t = s.start + (s.end - s.start) * 0.62;
    return { frame: Math.round(t * fps), label: `${s.id} (${s.layout}) ${t.toFixed(1)}s` };
  });
}

const outDir = path.join(root, "out", project, "story");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

console.log("bundling...");
const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts"), publicDir: path.join(root, "public") });
const inputProps = { project };
const composition = await selectComposition({ serveUrl, id: comp, inputProps, timeoutInMilliseconds: 120000 });

const files = [];
for (const [k, s] of shots.entries()) {
  const file = path.join(outDir, `${String(k).padStart(2, "0")}.jpg`);
  await renderStill({ composition, serveUrl, output: file, frame: Math.min(s.frame, composition.durationInFrames - 1), inputProps, imageFormat: "jpeg", jpegQuality: 85, scale: 0.5, timeoutInMilliseconds: 120000 });
  files.push({ file, label: s.label });
  process.stdout.write(`\r${k + 1}/${shots.length}`);
}
console.log();

// contact sheet with labels (ffmpeg)
const cols = arg("--strip") ? 8 : 5;
const rows = Math.ceil(files.length / cols);
const inputs = files.flatMap((f) => ["-i", f.file]);
const font = process.platform === "win32" ? "C\\:/Windows/Fonts/arial.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:").replace(/%/g, "\\%");
const labelled = files
  .map((f, k) => `[${k}:v]scale=432:768,drawtext=fontfile='${font}':text='${esc(f.label)}':fontsize=18:fontcolor=white:box=1:boxcolor=black@0.75:x=6:y=6[v${k}]`)
  .join(";");
const pads = Array.from({ length: rows * cols - files.length }, (_, k) => `color=c=black:s=432x768:d=1[p${k}]`).join(";");
const all = [...files.map((_, k) => `[v${k}]`), ...Array.from({ length: rows * cols - files.length }, (_, k) => `[p${k}]`)];
const grid = `${all.join("")}xstack=inputs=${all.length}:layout=${all
  .map((_, k) => `${(k % cols) * 432}_${Math.floor(k / cols) * 768}`)
  .join("|")}[out]`;
const sheet = path.join(root, "out", project, arg("--strip") ? `strip_${arg("--strip")}.jpg` : "storyboard.jpg");
const filter = [labelled, pads, grid].filter(Boolean).join(";");
execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", filter, "-map", "[out]", "-frames:v", "1", "-q:v", "3", sheet]);
console.log(`sheet -> ${path.relative(root, sheet)}`);
