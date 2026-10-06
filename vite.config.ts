import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "web",
  plugins: [svelte()],
  base: "/app/",
  publicDir: false,
  build: { outDir: "../dist/app", emptyOutDir: true },
  test: { include: ["src/**/*.test.ts"] },
});
