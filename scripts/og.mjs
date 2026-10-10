// Renders the link preview card from the landing hero, light and dark: npm run og (needs the Worker on :8799 serving a fresh build).
import { chromium } from "@playwright/test";
import sharp from "sharp";

const base = process.argv[2] ?? "http://localhost:8799";
const W = 1200, H = 630;
// The window is sized so the full 1280×800 app capture ends exactly on the bottom edge, as in the hero.
const card = `
  html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
  body .live.wp { box-sizing: border-box; width: ${W}px; height: ${H}px; padding: 50px 0 0; border-radius: 0; box-shadow: none; display: flex; flex-direction: column; align-items: center; }
  body .live h1 { font-size: 56px; line-height: 1; max-width: none; margin: 0 0 36px; text-align: center; }
  body .live .win { width: 720px; flex: none; }
  .try, .badge { display: none !important; }
`;

const browser = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: "reduce" });
  await page.goto(base + "/");
  await page.evaluate(() => {
    const live = document.querySelector("[data-live]");
    live.prepend(document.querySelector(".hero h1"));
    document.body.replaceChildren(live);
    for (const img of live.querySelectorAll("img")) img.loading = "eager";
  });
  await page.addStyleTag({ content: card });
  await page.waitForFunction(() => document.fonts.status === "loaded" && [...document.images].every((i) => i.complete));
  await page.waitForTimeout(300);
  await sharp(await page.screenshot()).resize(W, H).png({ palette: true, effort: 10 }).toFile(`web/public/og-${scheme}.png`);
  await page.close();
}
await browser.close();
