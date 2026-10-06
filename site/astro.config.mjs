import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://pomodoro.jbndr.com",
  outDir: "../dist",
  publicDir: "../web/public",
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [sitemap({ filter: (p) => !p.includes("/404") })],
});
