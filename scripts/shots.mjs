// Captures real app components from the demo for the landing page: npm run shots (needs the Worker on :8799).
import { readdir, rm } from "node:fs/promises";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const base = process.argv[2] ?? "http://localhost:8799";
const out = "site/src/assets/shots";
const clear = "html,body,.app{background:transparent!important} body::before,body::after,.app::before,.app::after{display:none!important} .overlay{background:transparent!important;backdrop-filter:none!important} #ledger .chip{display:none!important}";

const browser = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  const open = async (w = 1280, h = 860, o = {}) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: o.dpr ?? 2, colorScheme: scheme, reducedMotion: "reduce", isMobile: !!o.mobile, hasTouch: !!o.mobile });
    await page.goto(base + "/app/?demo=1&embed=1");
    if (o.clear !== false) await page.addStyleTag({ content: clear });
    await page.waitForTimeout(800);
    return page;
  };
  const shot = (page, sel, name) => page.locator(sel).first().screenshot({ path: `${out}/${name}-${scheme}.png`, omitBackground: true, animations: "disabled" });

  let page = await open(1280, 800, { clear: false });
  await page.screenshot({ path: `${out}/app-${scheme}.png` });
  await page.close();

  page = await open(390, 844, { clear: false, mobile: true });
  await page.screenshot({ path: `${out}/phone-${scheme}.png` });
  await page.close();

  page = await open();
  await shot(page, "section.panel", "today");
  await page.getByRole("button", { name: /^Start/ }).first().click();
  await page.waitForTimeout(3200);
  await shot(page, ".timer-card", "timer-focus");
  await page.close();

  page = await open();
  await page.getByRole("tab", { name: "Short" }).or(page.getByRole("button", { name: "Short" })).first().click();
  await page.getByRole("button", { name: /^Start/ }).first().click();
  await page.waitForTimeout(2200);
  await shot(page, ".timer-card", "timer-break");
  await page.close();

  page = await open();
  await page.getByRole("tab", { name: "Flow" }).or(page.getByRole("button", { name: "Flow" })).first().click();
  await page.getByRole("button", { name: /^Start/ }).first().click();
  await page.waitForTimeout(4200);
  await shot(page, ".timer-card", "timer-flow");
  await page.close();

  page = await open(1280, 1100);
  await page.getByRole("button", { name: "Weekly recap" }).click();
  await page.locator(".recap-sheet").waitFor();
  await page.waitForTimeout(500);
  await shot(page, ".recap-sheet", "recap");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Plan the week" }).click();
  await page.locator(".plan-sheet").waitFor();
  await page.waitForTimeout(500);
  await shot(page, ".plan-sheet", "plan");
  await page.keyboard.press("Escape");
  await page.close();

  page = await open(390, 2800, { mobile: true });
  await page.locator(".tabbar [data-page=progress]").click();
  await page.waitForTimeout(600);
  await page.addStyleTag({ content: ".bar,.tabbar{display:none!important}" });
  await page.locator("#ledger").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, "#ledger", "ledger-phone");
  const tall = `${out}/ledger-phone-${scheme}.png`;
  const cut = await sharp(tall).extract({ left: 0, top: 0, width: (await sharp(tall).metadata()).width, height: 1240 }).toBuffer();
  await sharp(cut).toFile(tall);
  await page.close();

  page = await open(940, 1100, { dpr: 4 });
  await page.locator("#tiles").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot(page, "#tiles .tile:nth-child(4)", "estimates");
  await page.close();

  page = await open(940, 1100);
  for (const [sel, name] of [["#bestTime", "besttime"], ["#ledger", "ledger"]]) {
    await page.locator(sel).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot(page, sel, name);
  }
  await page.close();
}
await browser.close();

for (const f of (await readdir(out)).filter((f) => f.endsWith(".png"))) {
  await sharp(`${out}/${f}`).webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(`${out}/${f.replace(/\.png$/, ".webp")}`);
  await rm(`${out}/${f}`);
}
