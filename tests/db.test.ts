import { describe, it, expect } from "vitest";
import { useTestDB, getProjects, getKv, setKv, getNav, getAllLinks } from "../src/lib/db";

describe("database layer + seed", () => {
  useTestDB();

  it("seeds the eight design projects in order", () => {
    const projects = getProjects();
    expect(projects).toHaveLength(8);
    expect(projects[0].name).toBe("papr.world");
    expect(projects[0].roadmap.length).toBeGreaterThan(3);
    expect(projects.map((p) => p.name)).toContain("synamp.app");
    // synamp deliberately has no progress
    expect(projects.find((p) => p.slug === "synamp")!.progress).toBeNull();
  });

  it("parses json columns into arrays", () => {
    const exp = getProjects().find((p) => p.slug === "exp-design")!;
    expect(Array.isArray(exp.stack)).toBe(true);
    expect(exp.stack).toContain("Swift");
    expect(exp.tags.length).toBeGreaterThan(2);
  });

  it("kv round-trips structured content", () => {
    setKv("page:home", { nowTitle: "test", slots: [{ day: "Mon" }] });
    expect(getKv<{ nowTitle: string }>("page:home", {}).nowTitle).toBe("test");
    expect(getKv("missing:key", "fallback")).toBe("fallback");
  });

  it("seeds nav and links with visibility", () => {
    const nav = getNav(false);
    expect(nav.length).toBeGreaterThanOrEqual(7);
    expect(getNav().length).toBe(nav.length); // all visible by default
    const links = getAllLinks();
    expect(links.filter((l) => l.kind === "social")).toHaveLength(6);
    expect(links.filter((l) => l.kind === "portfolio")).toHaveLength(3);
  });
});
