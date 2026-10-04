#!/usr/bin/env node
// CLI for the feed system: refresh caches or run live connection tests.
//   npm run feeds:refresh   → refresh every enabled feed once
//   npm run feeds:test      → run every enabled feed's connection test
//   npm run feeds:test github twitch → target specific feeds
import { refreshAllEnabled, testFeed, getFeedStatuses } from "../src/feeds/runner";
import { feedById } from "../src/feeds/registry";
import { loadEnv } from "../src/lib/env";

const mode = process.argv[2] || "refresh";
const targets = process.argv.slice(3);
loadEnv();

const pad = (s: string, n: number) => s.padEnd(n, " ");

async function main() {
  const statuses = getFeedStatuses().filter((s) => !s.linkOnly);
  const enabled = statuses.filter((s) => s.enabled);
  const chosen = targets.length ? targets : enabled.map((s) => s.id);

  console.log(`\ntapps.live feeds — ${mode}\n========================${"=".repeat(mode.length)}\n`);

  if (mode === "refresh") {
    for (const id of chosen) {
      if (!feedById(id)) {
        console.log(`${pad(id, 10)} ✗ unknown feed`);
        continue;
      }
      process.stdout.write(`${pad(id, 10)} refreshing… `);
      const r = await refreshAllOne(id);
      console.log(r.status === "ok" ? `✓ ${r.itemCount} items (${r.durationMs}ms)` : `✗ ${r.status}${r.error ? " — " + r.error : ""}`);
    }
    console.log("\ndone. caches are warm — the site reads only from cache.");
  } else if (mode === "test") {
    let pass = 0;
    let ran = 0;
    for (const id of chosen) {
      if (!feedById(id)) {
        console.log(`${pad(id, 10)} ✗ unknown feed`);
        continue;
      }
      ran++;
      process.stdout.write(`${pad(id, 10)} testing… `);
      const t = await testFeed(id);
      console.log(t.ok ? `✓ ${t.message}` : `✗ ${t.message}`);
      if (t.detail) console.log(`${pad("", 11)}${t.detail}`);
      if (t.ok) pass++;
    }
    console.log(`\n${pass}/${ran} passed.`);
    process.exitCode = pass === ran ? 0 : 1;
  } else {
    console.error("usage: tsx scripts/run-feeds.ts [refresh|test] [feed-id…]");
    process.exitCode = 1;
  }
}

async function refreshAllOne(id: string) {
  const { refreshFeed } = await import("../src/feeds/runner");
  return refreshFeed(id);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
