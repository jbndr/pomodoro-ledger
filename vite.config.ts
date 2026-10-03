import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "web",
  build: { outDir: "../dist", emptyOutDir: true },
  test: { include: ["src/**/*.test.ts"] },
});
