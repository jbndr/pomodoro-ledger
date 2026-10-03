import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "web",
  plugins: [svelte()],
  build: { outDir: "../dist", emptyOutDir: true },
  test: { include: ["src/**/*.test.ts"] },
});
