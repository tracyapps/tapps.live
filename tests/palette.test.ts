import { describe, it, expect } from "vitest";
import { COLORWAYS, pickColorway, nextColorway, colorwayById } from "../src/lib/palette";

describe("colorway system", () => {
  it("has the nine export colorways with valid hex inks", () => {
    expect(COLORWAYS).toHaveLength(9);
    for (const c of COLORWAYS) {
      expect(c.shadow).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.highlight).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.shadow).not.toEqual(c.highlight);
    }
  });

  it("picks deterministically per seed", () => {
    expect(pickColorway("art-123").id).toBe(pickColorway("art-123").id);
    expect(pickColorway("art-123").id).toBe(pickColorway("art-123").id);
  });

  it("spreads seeds across colorways (not all the same)", () => {
    const picks = new Set(Array.from({ length: 40 }, (_, i) => pickColorway(`seed-${i}`).id));
    expect(picks.size).toBeGreaterThanOrEqual(4);
  });

  it("cycles through every colorway on reroll", () => {
    const seen = new Set<string>();
    let current = COLORWAYS[0];
    for (let i = 0; i < COLORWAYS.length; i++) {
      seen.add(current.id);
      current = nextColorway(current.id);
    }
    expect(seen.size).toBe(COLORWAYS.length);
    expect(current.id).toBe(COLORWAYS[0].id);
  });

  it("resolves colorway by id", () => {
    expect(colorwayById("hot-sun")?.highlight).toBe("#facc15");
    expect(colorwayById("nope")).toBeUndefined();
  });
});
