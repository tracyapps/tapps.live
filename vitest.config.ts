import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "src")
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // keep the scheduler and file db out of unit tests
    env: { VITEST: "1", TAPPS_NO_SCHEDULER: "1" }
  }
});
