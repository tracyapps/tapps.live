import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  // CSRF is enforced in src/middleware.ts (origin check + per-process form
  // token + SameSite=strict cookies) — Astro's built-in checkOrigin is
  // disabled because it rejects valid same-origin form posts behind proxies.
  security: {
    checkOrigin: false
  },
  server: {
    port: 4321,
    host: true
  },
  vite: {
    server: {
      watch: {
        ignored: ["**/data/**"]
      }
    }
  }
});
