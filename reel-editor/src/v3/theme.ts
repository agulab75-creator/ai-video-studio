import { loadFont as loadCormorant } from "@remotion/google-fonts/CormorantGaramond";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";

// Shrihari "warm numerology" tokens (brands/shrihari/BRAND.md). The v3 renderer reads its look from here.
loadCormorant("normal", { weights: ["600", "700"], subsets: ["latin"] });
loadCormorant("italic", { weights: ["600", "700"], subsets: ["latin"] });
loadMontserrat("normal", { weights: ["500", "600", "700"], subsets: ["latin"] });

export const F = { serif: "Cormorant Garamond", sans: "Montserrat" };

export const C = {
  paper: "#F7F1E6",
  paperWarm: "#EFE5D3",
  paperEdge: "#E3D4BA",
  ink: "#2A1A12",
  maroon: "#7A1F1F",
  saffron: "#E8871E",
  gold: "#C9962E",
  goldLight: "#E9C46A",
  sage: "#4F7A4A",
};

/** Soft glow in the element's own colour. */
export const glow = (color: string, k = 1) => `0 0 ${12 * k}px ${color}66, 0 0 ${34 * k}px ${color}40`;

/** Legibility shadow for light text over the A-roll. */
export const softShadow = "0 2px 10px rgba(20,10,4,0.55), 0 1px 2px rgba(20,10,4,0.5)";
