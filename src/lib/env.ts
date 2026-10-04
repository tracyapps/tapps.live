// Minimal .env loader — sets process.env entries that aren't already defined.
// Node 20.6+ also supports `node --env-file`; this keeps the CLI scripts and
// the Astro server on the same footing without an extra dependency.
import { readFileSync } from "node:fs";
import path from "node:path";

// Resolve from the process working directory (the project root you launch
// from) — import.meta.url lands inside dist/ after bundling, which would
// scatter .env and the database across build output on rebuilds.
const root = process.env.TAPPS_ROOT
  ? path.resolve(process.env.TAPPS_ROOT)
  : process.cwd();

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  for (const file of [".env", ".env.local"]) {
    try {
      const text = readFileSync(path.join(root, file), "utf8");
      for (const line of text.split("\n")) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const key = m[1];
        let value = m[2];
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      /* no .env — fine */
    }
  }
}

export function env(key: string): string | undefined {
  loadEnv();
  return process.env[key]?.trim() || undefined;
}
