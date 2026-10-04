// The ink system — the same duotone colorways the design export baked with
// ImageMagick (assets/build-photo-restyles.sh), now applied live in the
// browser via SVG feComponentTransfer duotone filters. Each colorway is a
// shadow/highlight ink pair on the near-black canvas.
import { hexToRgb } from "./contrast";

export interface Colorway {
  id: string;
  label: string;
  shadow: string;
  highlight: string;
}

export const COLORWAYS: Colorway[] = [
  { id: "magenta-lime", label: "magenta / lime", shadow: "#ff00a8", highlight: "#22c55e" },
  { id: "magenta-mint", label: "magenta / mint", shadow: "#ff00a8", highlight: "#3cffd0" },
  { id: "ultra-mint", label: "ultra / mint", shadow: "#5200ff", highlight: "#3cffd0" },
  { id: "ultra-sun", label: "ultra / sun", shadow: "#5200ff", highlight: "#facc15" },
  { id: "hot-sun", label: "hot / sun", shadow: "#ef4444", highlight: "#facc15" },
  { id: "hot-mint", label: "hot / mint", shadow: "#ef4444", highlight: "#3cffd0" },
  { id: "mint-magenta", label: "mint / magenta", shadow: "#3cffd0", highlight: "#ff00a8" },
  { id: "sun-ultra", label: "sun / ultra", shadow: "#facc15", highlight: "#5200ff" },
  { id: "lime-ultra", label: "lime / ultra", shadow: "#22c55e", highlight: "#5200ff" }
];

export const CANVAS = "#050505";

export function colorwayById(id: string): Colorway | undefined {
  return COLORWAYS.find((c) => c.id === id);
}

// Deterministic PRNG so a given image keeps its colorway across renders
// (no layout-shifting surprises), while different seeds spread across the palette.
function seeded(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function pickColorway(seed: string): Colorway {
  const rnd = seeded(seed);
  rnd(); // burn one
  return COLORWAYS[Math.floor(rnd() * COLORWAYS.length)] ?? COLORWAYS[0];
}

export function nextColorway(id: string): Colorway {
  const i = COLORWAYS.findIndex((c) => c.id === id);
  return COLORWAYS[(i + 1 + COLORWAYS.length) % COLORWAYS.length] ?? COLORWAYS[0];
}
