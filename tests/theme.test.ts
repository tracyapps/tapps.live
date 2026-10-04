import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles/theme.css", import.meta.url), "utf8");

// Fills are equal-specificity single classes — they only win over component
// backgrounds (.tile, .social-tile, …) by being declared later in the sheet.
// This pins that order so a refactor can't quietly grey out the link wall.
describe("theme.css cascade contract", () => {
  it("fill utilities are declared after every background-bearing component", () => {
    const fills = css.indexOf(".fill-magenta {");
    expect(fills).toBeGreaterThan(-1);
    for (const component of [".tile {", ".social-tile {", ".chart {", ".tl-card {"]) {
      const at = css.indexOf(component);
      expect(at, `${component} not found`).toBeGreaterThan(-1);
      expect(fills, `${component} must be declared before the fill layer`).toBeGreaterThan(at);
    }
  });

  it("every fill class still declares its background", () => {
    for (const f of ["magenta", "lime", "sun", "hot", "tang", "mint", "grape"]) {
      const re = new RegExp(`\\.fill-${f}\\s*\\{[^}]*background:`);
      expect(re.test(css), `.fill-${f} lost its background declaration`).toBe(true);
    }
  });

  it("fill surfaces keep their self-contained ink overrides (the export's grey-on-green fix)", () => {
    // the descendant override group must exist for text-bearing children
    expect(css).toMatch(/\.fill-magenta p,\s*\n\.fill-magenta \.kicker,/);
    expect(css).toMatch(/\.fill-grape p,/);
  });
});
