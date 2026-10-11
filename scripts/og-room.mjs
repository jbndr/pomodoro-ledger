// Renders the link preview cards for room invites from a real room bar: node scripts/og-room.mjs [base] (needs the Worker serving a fresh build).
import { chromium } from "@playwright/test";
import sharp from "sharp";

const base = process.argv[2] ?? "http://localhost:8799";
const W = 1200, H = 630;
const CARDS = [
  { file: "og-room", title: "Join my focus room", sub: "See each other's timers. Your tasks stay yours." },
  { file: "og-room-25", title: "Join a focus room", sub: "25 minutes of focus, 5 of break, together." },
  { file: "og-room-50", title: "Join a focus room", sub: "50 minutes of deep work, 10 of break, together." },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 4, colorScheme: "light", reducedMotion: "reduce" });
const page = await ctx.newPage();
await page.goto(base + "/app/?demo=1&embed=1");
const code = await page.evaluate(async () => (await (await fetch("/api/room", { method: "POST", body: JSON.stringify({ goal: 12 }) })).json()).code);
await page.goto(`${base}/app/?demo=1&embed=1&room=${code}`);
await page.locator("#room input[placeholder='Shown to people in the room']").fill("Sam");
await page.locator("#room").getByRole("button", { name: "Join", exact: true }).click();
await page.waitForTimeout(800);

// Others in the room are plain sockets: seven finish a round and go, three stay at different points of theirs.
await page.evaluate(async (code) => {
  const MIN = 60000, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const join = async (name, steps) => {
    const ws = new WebSocket(location.origin.replace("http", "ws") + "/api/room/" + code + "/ws");
    await new Promise((r) => (ws.onopen = r));
    ws.send(JSON.stringify({ t: "hello", id: name + Math.random(), name }));
    for (const s of steps) { await wait(120); ws.send(JSON.stringify(s)); }
    return ws;
  };
  const state = (mode, remaining, total) => ({ t: "state", s: { mode, status: "running", remaining, total } });
  for (let i = 0; i < 7; i++) (await join("Guest", [state("focus", 0, 25 * MIN), state("short", 5 * MIN, 5 * MIN)])).close();
  await join("Maya", [state("focus", 9 * MIN, 25 * MIN), { t: "sig", k: "deep" }]);
  await join("Jonas", [state("focus", 17 * MIN, 25 * MIN)]);
  await join("Lee", [state("short", 2.5 * MIN, 5 * MIN), { t: "sig", k: "back" }]);
}, code);
await page.getByRole("button", { name: /^Start/ }).first().click();
await page.waitForTimeout(1500);
await page.addStyleTag({ content: `
  html, body, .app { background: transparent !important; }
  .app > :not(#roomStrip), #toast, #tip { visibility: hidden !important; }
  #roomStrip .room-name, #roomStrip .room-actions { display: none !important; }
  #roomStrip { width: max-content; } #roomStrip .mates { flex: none; }
` });
await page.mouse.move(1, 1);
await page.waitForTimeout(400);
const box = await page.locator("#roomStrip").boundingBox(), pad = 28;
const strip = await page.screenshot({ omitBackground: true, clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 } });

const card = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: "light", reducedMotion: "reduce" });
await card.goto(base + "/");
await card.evaluate(() => { self.paint = document.querySelector("#sc-together .paint-clip"); });
await card.addStyleTag({ content: `
  html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
  .og-room { --wp-r: 0px; box-sizing: border-box; width: ${W}px; height: ${H}px; border-radius: 0; box-shadow: none; display: flex; flex-direction: column; align-items: center; padding-top: 80px; }
  .og-room, .og-room .paint-clip, .og-room .paint { border-radius: 0 !important; clip-path: none !important; }
  .og-text { text-align: center; }
  .og-room h1 { margin: 0; font: 700 66px/1 var(--f-display); letter-spacing: -.02em; color: var(--fg); }
  .og-room p { margin: 18px 0 0; font: 500 27px/1.3 var(--f-body); color: var(--muted); }
  .og-room img { margin-top: 40px; }
` });
for (const c of CARDS) {
  await card.evaluate(({ c, src, w }) => {
    const paint = self.paint.cloneNode(true);
    const wp = document.createElement("div");
    wp.className = "wp og-room";
    wp.innerHTML = `<div class="og-text"><h1></h1><p></p></div><img alt="">`;
    wp.prepend(paint);
    wp.querySelector("h1").textContent = c.title;
    wp.querySelector("p").textContent = c.sub;
    const img = wp.querySelector("img");
    img.src = src; img.style.width = w + "px";
    document.body.replaceChildren(wp);
  }, { c, src: "data:image/png;base64," + strip.toString("base64"), w: Math.round((box.width + pad * 2) * 1.78) });
  await card.waitForFunction(() => document.fonts.status === "loaded" && [...document.images].every((i) => i.complete));
  await card.waitForTimeout(300);
  await sharp(await card.screenshot()).resize(W, H).png({ palette: true, effort: 10 }).toFile(`web/public/${c.file}.png`);
}
await browser.close();
