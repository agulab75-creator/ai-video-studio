import { loadFont as loadArchivoBlack } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as loadBodoni } from "@remotion/google-fonts/BodoniModa";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";

// atlasian-clinic-3d type: bold geometric sans captions, Didone serif accents, wide black grotesk titles.
loadMontserrat("normal", { weights: ["600", "700", "800"], subsets: ["latin"] });
loadBodoni("normal", { weights: ["500", "700"], subsets: ["latin"] });
loadBodoni("italic", { weights: ["500", "700"], subsets: ["latin"] });
loadArchivoBlack("normal", { weights: ["400"], subsets: ["latin"] });

export const F = {
  sans: "Montserrat",
  serif: "Bodoni Moda",
  grotesk: "Archivo Black",
};

/** Outer glow in the element's own colour (every graphic in this style glows). */
export const glowShadow = (color: string, k = 1) =>
  `0 0 ${10 * k}px ${color}, 0 0 ${28 * k}px ${color}99, 0 0 ${60 * k}px ${color}55`;

export const darkShadow = "0 3px 12px rgba(0,0,0,0.75), 0 1px 3px rgba(0,0,0,0.6)";
