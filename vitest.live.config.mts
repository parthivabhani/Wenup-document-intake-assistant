import { defineConfig } from "vitest/config";
import path from "node:path";

// Live evals against the real model. Needs GROQ_API_KEY (read from .env.local).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    include: ["tests/live/**/*.live.test.ts"],
    testTimeout: 90_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
