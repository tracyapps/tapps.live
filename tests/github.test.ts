import { describe, it, expect } from "vitest";
import { normalizeEvent, languagesFromRepos } from "../src/feeds/github";

describe("github event normalizer", () => {
  it("turns a PushEvent into a readable item with commit count", () => {
    const item = normalizeEvent({
      id: "123",
      type: "PushEvent",
      created_at: "2026-10-01T12:00:00Z",
      repo: { name: "tracyapps/EXP-design" },
      payload: { commits: [{ message: "fix: token contrast math\n\nlong body" }, { message: "second" }] }
    });
    expect(item?.title).toBe("fix: token contrast math");
    expect(item?.detail).toBe("2 commits");
    expect(item?.url).toBe("https://github.com/tracyapps/EXP-design");
    expect(item?.kind).toBe("PushEvent");
  });

  it("handles PR events with their own url", () => {
    const item = normalizeEvent({
      id: "124",
      type: "PullRequestEvent",
      created_at: "2026-10-01T13:00:00Z",
      repo: { name: "tracyapps/draw-tionary" },
      payload: { action: "opened", pull_request: { title: "Add pressure drawing", html_url: "https://github.com/tracyapps/draw-tionary/pull/12" } }
    });
    expect(item?.title).toBe("Add pressure drawing");
    expect(item?.url).toContain("/pull/12");
    expect(item?.detail).toBe("opened a pull request");
  });

  it("falls back gracefully for unknown payloads", () => {
    const item = normalizeEvent({ id: "125", type: "ReleaseEvent", created_at: "2026-10-01T14:00:00Z", repo: { name: "a/b" }, payload: {} });
    expect(item?.title).toBe("Released");
    expect(item?.detail).toBe("shipped");
  });

  it("push with no commits still renders", () => {
    const item = normalizeEvent({ id: "126", type: "PushEvent", created_at: "2026-10-01T15:00:00Z", repo: { name: "a/b" }, payload: {} });
    expect(item?.title).toBe("Pushed to a/b");
    expect(item?.detail).toBe("0 commits");
  });
});

describe("language aggregation", () => {
  it("counts repos per language and caps the table", () => {
    const langs = languagesFromRepos([
      { language: "Swift" }, { language: "Swift" }, { language: "TypeScript" },
      { language: null }, { language: "PHP" }, { language: "Swift" }
    ]);
    expect(langs[0]).toEqual({ label: "Swift", pct: 60 });
    expect(langs.map((l) => l.label)).toEqual(["Swift", "TypeScript", "PHP"]);
  });

  it("returns empty for repos without languages", () => {
    expect(languagesFromRepos([{ language: null }])).toEqual([]);
  });
});
