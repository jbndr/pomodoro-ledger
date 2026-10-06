import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:8799";
const out = "site/src/assets/shots";
const browser = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: "reduce" });
  await page.goto(base + "/app/?demo=1");
  await page.addStyleTag({ content: "#previewBanner{display:none!important}" });
  await page.locator(".recap-sheet").waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/recap-${scheme}.png`, clip: await page.locator(".recap-sheet").boundingBox() });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Start/ }).first().click();
  await page.waitForTimeout(4200);
  await page.screenshot({ path: `${out}/today-${scheme}.png`, clip: { x: 0, y: 0, width: 1280, height: 740 } });
  await page.locator("h2", { hasText: /^Progress$/ }).evaluate((h) => scrollTo(0, h.getBoundingClientRect().top + scrollY - 96));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/progress-${scheme}.png`, clip: { x: 48, y: 72, width: 1184, height: 560 } });
  await page.close();
}
await browser.close();
