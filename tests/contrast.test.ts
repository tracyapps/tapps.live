import { describe, it, expect } from "vitest";
import { contrastRatio, passesAA } from "../src/lib/contrast";
import { TOKENS, FILLS, checkedPairs } from "../src/lib/tokens";
import { COLORWAYS } from "../src/lib/palette";

describe("design system a11y contract", () => {
  it("every shipped text/background pair passes WCAG AA (≥ 4.5:1)", () => {
    const pairs = checkedPairs();
    expect(pairs.length).toBeGreaterThan(10);
    for (const p of pairs) {
      expect(
        passesAA(p.fg, p.bg),
        `${p.label}: ${p.fg} on ${p.bg} = ${contrastRatio(p.fg, p.bg).toFixed(2)}`
      ).toBe(true);
    }
  });

  it("the export's known failures stay fixed: white/grey ink on loud fills", () => {
    // these exact pairs shipped grey-on-green in the design export
    expect(passesAA("#ffffff", "#ff00a8")).toBe(false); // white on magenta — must NOT be used
    expect(passesAA("#9ca3af", "#22c55e")).toBe(false); // grey on lime — the reported glitch
    expect(passesAA("#e5e7eb", "#ef4444")).toBe(false); // light on hot
    // and their replacements pass
    expect(passesAA("#050505", "#ff00a8")).toBe(true);
    expect(passesAA("#050505", "#22c55e")).toBe(true);
    expect(passesAA("#050505", "#ef4444")).toBe(true);
  });

  it("every fill token's ink passes AA against its surface", () => {
    for (const f of FILLS) {
      expect(passesAA(f.ink, f.hex), `${f.name}: ${f.ink} on ${f.hex}`).toBe(true);
    }
  });

  it("live badge keeps white ink readable (darkened danger)", () => {
    const badge = TOKENS.find((t) => t.name === "--live-badge")!.hex;
    expect(passesAA("#ffffff", badge)).toBe(true);
    expect(passesAA("#ffffff", "#ef4444")).toBe(false); // raw danger would fail
  });

  it("base surfaces keep muted meta text readable", () => {
    const bg = TOKENS.find((t) => t.name === "--bg")!.hex;
    const surface = TOKENS.find((t) => t.name === "--surface")!.hex;
    const warm = TOKENS.find((t) => t.name === "--surface-warm")!.hex;
    const muted = "#9ca3af";
    for (const s of [bg, surface, warm]) {
      expect(passesAA(muted, s), `muted on ${s}`).toBe(true);
    }
  });

  it("duo colorway inks are visible against the near-black canvas", () => {
    for (const c of COLORWAYS) {
      // at least the highlight ink should clear AA as text on canvas
      const hi = contrastRatio(c.highlight, "#050505");
      const lo = contrastRatio(c.shadow, "#050505");
      expect(Math.max(hi, lo), `${c.id} inks both vanish on canvas`).toBeGreaterThanOrEqual(3);
    }
  });
});
