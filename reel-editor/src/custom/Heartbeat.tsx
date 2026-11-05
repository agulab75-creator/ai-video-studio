import React from "react";
import { Img, staticFile } from "remotion";
import type { Brand } from "../brands";

// A cut-out heart that beats, with an ECG trace under it. The rate goes from `bpm` to `fastBpm` at `fastAt`
// (seconds after entrance): "dil tez dhadakta hai".
export const Heartbeat: React.FC<{
  src: string;
  bpm?: number;
  fastBpm?: number;
  fastAt?: number;
  brand: Brand;
  localFrame: number;
  fps: number;
  width: number;
}> = ({ src, bpm = 70, fastBpm = 130, fastAt = 1, brand, localFrame, fps, width }) => {
  const W = width;
  const t = localFrame / fps;
  const ramp = 0.5;
  const r0 = bpm / 60;
  const r1 = fastBpm / 60;
  // beat phase, integrated so the rate change is smooth
  const phaseAt = (x: number) => {
    if (x <= fastAt) return x * r0;
    const d = Math.min(x - fastAt, ramp);
    const rest = Math.max(0, x - fastAt - ramp);
    return fastAt * r0 + d * r0 + ((r1 - r0) * d * d) / (2 * ramp) + rest * r1;
  };
  const ph = phaseAt(t) % 1;
  const beat =
    ph < 0.12 ? Math.sin((ph / 0.12) * Math.PI) : ph > 0.2 && ph < 0.3 ? 0.45 * Math.sin(((ph - 0.2) / 0.1) * Math.PI) : 0;
  const scale = 1 + 0.07 * beat;
  // ECG: the last 2.2 s, newest on the right
  const H = W * 0.22;
  const span = 2.2;
  const n = 180;
  const ecg = (p: number) => {
    const q = ((p % 1) + 1) % 1;
    if (q < 0.04) return -0.15 * Math.sin((q / 0.04) * Math.PI);
    if (q < 0.06) return 0.2;
    if (q < 0.09) return -1;
    if (q < 0.12) return 0.35;
    if (q > 0.3 && q < 0.42) return -0.25 * Math.sin(((q - 0.3) / 0.12) * Math.PI);
    return 0;
  };
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const tt = t - span + (i / n) * span;
    return `${(i / n) * W},${H / 2 + (tt < 0 ? 0 : ecg(phaseAt(tt))) * H * 0.42}`;
  }).join(" ");
  const stroke = t > fastAt + ramp / 2 ? "#C8372D" : brand.colors.green;
  return (
    <div style={{ width: W, position: "relative" }}>
      <Img
        src={staticFile(src)}
        style={{
          width: W * 0.78,
          marginLeft: W * 0.11,
          display: "block",
          transform: `scale(${scale})`,
          filter: "drop-shadow(0 14px 22px rgba(0,0,0,0.3))",
        }}
      />
      <svg width={W} height={H} style={{ display: "block", marginTop: W * 0.02 }}>
        <polyline points={pts} fill="none" stroke={stroke} strokeWidth={W * 0.014} strokeLinejoin="round" />
      </svg>
    </div>
  );
};
