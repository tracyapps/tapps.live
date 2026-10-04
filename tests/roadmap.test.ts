import { describe, it, expect } from "vitest";
import { parseRoadmap } from "../src/feeds/roadmap";

const DOC = `# papr.world roadmap

progress: 61

## The foundation
- [x] world exists
- [x] paper physics
- [ ] nothing left

## The invited alpha
<!-- 83 -->
- [x] invites flowing
- [ ] stress test the mail

## Becoming someone

some prose that is not a task

## The map, then underground
- [ ] the map
`;

describe("ROADMAP.md parser", () => {
  it("reads the manual progress override", () => {
    const parsed = parseRoadmap(DOC);
    expect(parsed.progress).toBe(61);
  });

  it("collects phases with checkbox-derived percentages", () => {
    const parsed = parseRoadmap(DOC);
    const foundation = parsed.phases.find((p) => p.label === "The foundation");
    expect(foundation?.pct).toBe(67); // 2 of 3
    expect(foundation?.done).toBe(2);
    expect(foundation?.total).toBe(3);
  });

  it("honors explicit <!-- pct --> overrides", () => {
    const parsed = parseRoadmap(DOC);
    const alpha = parsed.phases.find((p) => p.label === "The invited alpha");
    expect(alpha?.pct).toBe(83);
  });

  it("keeps taskless phases at 0 without crashing", () => {
    const parsed = parseRoadmap(DOC);
    const someone = parsed.phases.find((p) => p.label === "Becoming someone");
    expect(someone?.pct).toBe(0);
  });

  it("computes weighted progress when there is no override", () => {
    const parsed = parseRoadmap(`## A\n- [x] one\n## B\n- [ ] two\n- [ ] three`);
    // 1 of 3 tasks
    expect(parsed.progress).toBe(33);
  });

  it("survives an empty document", () => {
    expect(parseRoadmap("").phases).toEqual([]);
    expect(parseRoadmap("").progress).toBeNull();
  });
});
