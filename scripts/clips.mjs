// Records short looping clips of the demo app for the landing page: npm run clips (needs the Worker on :8799). ONLY=looks,faces records just those, SCHEMES=dark just one scheme.
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const base = process.argv[2] ?? "http://localhost:8799";
const out = "site/src/assets/clips";
const FADE = 0.5;
const only = process.env.ONLY?.split(",");
// A Tuesday, as in the shots: at 9:40 the demo's best time is under way and its biggest task isn't in it yet.
const TUE = "2026-10-13T";
const WEATHER = { lat: 52.37, lon: 4.9, place: "Amsterdam", temp: 11, cloud: 0.9, precip: 0.6, symbol: "lightrain", wind: 6, windFrom: 230 };
const ARROW = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2.5v16.2l4.3-4.1 2.9 6.6 2.6-1.1-2.9-6.5h6z" fill="#141816" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';

/** A visible pointer for clips that drag or point, moved with eased glides instead of jumps. */
async function pointer(page) {
  await page.addStyleTag({ content: "#clip-cursor{position:fixed;left:-40px;top:-40px;z-index:2147483647;pointer-events:none;translate:-3.7px -2.3px;transition:scale .12s;filter:drop-shadow(0 1px 1.5px rgb(0 0 0 / .3))} #clip-cursor.down{scale:.86}" });
  await page.evaluate((svg) => {
    const el = Object.assign(document.createElement("div"), { id: "clip-cursor", innerHTML: svg });
    document.body.append(el);
    addEventListener("pointermove", (e) => { el.style.left = e.clientX + "px"; el.style.top = e.clientY + "px"; }, true);
    addEventListener("pointerdown", () => el.classList.add("down"), true);
    addEventListener("pointerup", () => el.classList.remove("down"), true);
  }, ARROW);
  let at = [0, 0];
  const glide = async (x, y, ms = 600) => {
    const [x0, y0] = at, t0 = Date.now();
    for (let t = 0; t < 1;) {
      t = Math.min(1, (Date.now() - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
      await page.waitForTimeout(12);
    }
    at = [x, y];
  };
  const place = async (x, y) => { await page.mouse.move(x, y); at = [x, y]; };
  const click = async (x, y, ms) => { await glide(x, y, ms); await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up(); };
  return { glide, place, click };
}

const center = (b) => [b.x + b.width / 2, b.y + b.height / 2];
const corners = async (loc) => {
  const r = await loc.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius)), b = await loc.boundingBox();
  return `${(r / b.width * 100).toFixed(2)}% / ${(r / b.height * 100).toFixed(2)}%`;
};

async function record(page, run) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    frames.push({ data: Buffer.from(data, "base64"), t: metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: 4000, maxHeight: 4000 });
  const t0 = Date.now() / 1000;
  await run();
  const t1 = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  return { frames, t0, t1 };
}

async function encode({ frames, t0, t1 }, box, name, width, vw) {
  const dir = await mkdtemp(join(tmpdir(), "clip-"));
  const list = [];
  const kept = frames.filter((f) => f.t >= t0 - 0.05);
  for (const [i, f] of kept.entries()) {
    const file = join(dir, `${String(i).padStart(5, "0")}.jpg`);
    await writeFile(file, f.data);
    const next = kept[i + 1]?.t ?? t1;
    list.push(`file '${file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  }
  list.push(`file '${join(dir, `${String(kept.length - 1).padStart(5, "0")}.jpg`)}'`);
  await writeFile(join(dir, "list.txt"), list.join("\n"));
  const d = t1 - Math.max(t0, kept[0].t);
  const k = (await sharp(kept[0].data).metadata()).width / vw;
  const px = (n) => Math.round(n * k / 2) * 2;
  const crop = `crop=${px(box.width)}:${px(box.height)}:${px(box.x)}:${px(box.y)},scale=${width}:-2:flags=lanczos,fps=30`;
  // The end crossfades into the start, so the loop has no seam.
  const graph = `[0:v]${crop},split[a][b];[a]trim=start=${FADE},setpts=PTS-STARTPTS[main];[b]trim=end=${FADE},setpts=PTS-STARTPTS[head];[main][head]xfade=transition=fade:duration=${FADE}:offset=${(d - 2 * FADE).toFixed(3)},format=yuv420p[v]`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-filter_complex", graph, "-map", "[v]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", `${out}/${name}.mp4`]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${out}/${name}.mp4`, "-vframes", "1", "-c:v", "libwebp", "-quality", "85", `${out}/${name}.webp`]);
  await rm(dir, { recursive: true });
  console.log(name, `${d.toFixed(1)}s`);
}

const browser = await chromium.launch({ args: ["--force-device-scale-factor=2"] });
for (const scheme of process.env.SCHEMES?.split(",") ?? ["light", "dark"]) {
  const open = async (w, h, o = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: scheme });
    // Rooms run on the server's clock, so the room clip passes time: null and keeps the real one.
    const time = o.time === undefined ? TUE + "08:20" : o.time, at = time ? new Date(time).getTime() : Date.now();
    await ctx.route("**/api/weather", (r) => r.fulfill({ json: { ...WEATHER, at } }));
    await ctx.route("**/api/here", (r) => r.fulfill({ json: { lat: WEATHER.lat, lon: WEATHER.lon, place: WEATHER.place } }));
    const page = await ctx.newPage();
    await page.clock.install(time ? { time: new Date(time) } : undefined);
    await page.goto(base + "/app/?demo=1&embed=1");
    await page.waitForTimeout(1200);
    return page;
  };

  let page;
  const steps = {
    async round() {
      page = await open(1000, 700);
      await page.getByRole("button", { name: /^Start/ }).first().click();
      await page.waitForTimeout(400);
      await page.clock.fastForward(25 * 60 * 1000 - 6500);
      await page.waitForTimeout(600);
      const top = await page.locator("main.top").boundingBox();
      const box = { x: Math.round(top.x - 16), y: Math.round(top.y - 16), width: Math.round(top.width + 32), height: Math.round(Math.min(top.height + 32, 700 - top.y + 16)) };
      await encode(await record(page, () => page.waitForTimeout(11000)), box, `round-${scheme}`, 1320, 1000);
      await page.context().close();
    },
    async nudge() {
      page = await open(1000, 700);
      await page.getByRole("button", { name: /^Start/ }).first().click();
      await page.waitForTimeout(300);
      await page.clock.fastForward(25 * 60 * 1000 - 1500);
      await page.waitForTimeout(2500);
      const tc = await page.locator(".timer-card").boundingBox();
      const cbox = { x: Math.round(tc.x), y: Math.round(tc.y + 150), width: Math.round(tc.width), height: Math.round(tc.height - 150) };
      await page.clock.fastForward(60_500);
      await encode(await record(page, async () => {
        await page.waitForTimeout(2200);
        await page.locator(".timer-card .nudge").click();
        await page.waitForTimeout(3600);
      }), cbox, `nudge-${scheme}`, 880, 1000);
      await page.context().close();
    },
    async room() {
      page = await open(640, 900, { time: null });
      const name = (p) => p.locator("#room input[placeholder='Shown to people in the room']");
      await page.getByRole("button", { name: /Work together/ }).click();
      await page.getByRole("button", { name: "Start a room" }).click();
      await page.getByRole("radio", { name: "With the link" }).click();
      await name(page).fill("Sam");
      await page.getByRole("button", { name: "Start room" }).click();
      await page.waitForTimeout(1200);
      await page.keyboard.press("Escape");
      const code = await page.locator("#roomStrip").innerText().then((t) => t.match(/[A-Z2-9]{6}/)[0]);
      const mates = [];
      for (const who of ["Maya", "Jonas"]) {
        const ctx = await browser.newContext({ viewport: { width: 1000, height: 740 }, colorScheme: scheme });
        const mate = await ctx.newPage();
        await mate.goto(`${base}/app/?demo=1&embed=1&room=${code}`);
        await mate.waitForTimeout(1200);
        await name(mate).fill(who);
        await mate.locator("#room").getByRole("button", { name: "Join", exact: true }).click();
        await mate.waitForTimeout(900);
        mates.push(mate);
      }
      const later = page.getByRole("button", { name: "Not this week" });
      if (await later.isVisible()) await later.click();
      await page.mouse.move(5, 5);
      await page.waitForTimeout(1200);
      const strip = await page.locator("#roomStrip").boundingBox();
      const rbox = { x: Math.round(strip.x - 12), y: Math.round(strip.y - 12), width: Math.round(strip.width + 24), height: Math.round(Math.min(900 - strip.y + 12, 640)) };
      const react = (mate, emoji) => mate.getByRole("button", { name: `Send ${emoji}` }).click();
      await encode(await record(page, async () => {
        await page.waitForTimeout(900);
        await mates[0].getByRole("button", { name: /^Start/ }).first().click();
        await page.waitForTimeout(1100);
        await mates[1].getByRole("button", { name: /^Start/ }).first().click();
        await page.waitForTimeout(1200);
        await page.getByRole("button", { name: /^Start/ }).first().click();
        await page.waitForTimeout(1600);
        await react(mates[0], "🎉");
        await page.waitForTimeout(2200);
        await react(mates[1], "👋");
        await page.waitForTimeout(2600);
      }), rbox, `room-${scheme}`, 900, 640);
      for (const m of mates) await m.context().close();
      await page.context().close();
    },
    async digits() {
      page = await open(1000, 700);
      await page.locator(".timer-card .dial-wrap").hover();
      await page.waitForTimeout(500);
      const tcard = await page.locator(".timer-card").boundingBox();
      const dbox = { x: Math.round(tcard.x), y: Math.round(tcard.y), width: Math.round(tcard.width), height: Math.round(tcard.height) };
      await encode(await record(page, async () => {
        await page.waitForTimeout(900);
        await page.locator(".timer-card [data-adj='5']").click();
        await page.waitForTimeout(1300);
        await page.locator(".timer-card [data-adj='5']").click();
        await page.waitForTimeout(1300);
        await page.locator(".timer-card [data-adj='-1']").click();
        await page.waitForTimeout(1800);
      }), dbox, `digits-${scheme}`, 760, 1000);
      await page.context().close();
    },
    async finish() {
      page = await open(1000, 700);
      const panel = await page.locator("section.panel").boundingBox();
      await page.addStyleTag({ content: `section.panel{min-height:${Math.ceil(panel.height)}px}` });
      await encode(await record(page, async () => {
        await page.waitForTimeout(900);
        await page.locator("section.panel .check").nth(2).click();
        await page.mouse.move(5, 5);
        await page.waitForTimeout(3000);
      }), { x: Math.round(panel.x), y: Math.round(panel.y), width: Math.round(panel.width), height: Math.round(panel.height) }, `finish-${scheme}`, 1040, 1000);
      await page.context().close();
    },
    async pip() {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2, colorScheme: scheme });
      await ctx.addInitScript(() => {
        Object.defineProperty(window, "documentPictureInPicture", { value: { window: null, requestWindow: async ({ width, height }) => window.open("about:blank", "pip", `popup,width=${width},height=${height}`) } });
      });
      const main = await ctx.newPage();
      await main.goto(base + "/app/?demo=1&embed=1");
      await main.waitForTimeout(1000);
      await main.getByRole("button", { name: /^Start/ }).first().click();
      const [pip] = await Promise.all([ctx.waitForEvent("page"), main.locator("#floatBtn").click()]);
      await pip.setViewportSize({ width: 320, height: 110 });
      await pip.waitForTimeout(1500);
      const p = await pointer(pip);
      await p.place(400, 70);
      // Pointing at the window swaps the task line for −1, +1 and skip.
      await encode(await record(pip, async () => {
        await pip.waitForTimeout(1600);
        await p.glide(170, 62, 600);
        await pip.waitForTimeout(2200);
        await p.glide(400, 70, 600);
        await pip.waitForTimeout(1600);
      }), { x: 0, y: 0, width: 320, height: 110 }, `pip-${scheme}`, 640, 320);
      await ctx.close();
    },
    async phases() {
      page = await open(1280, 900);
      await page.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("menuitem", { name: /Settings/ }).or(page.getByRole("button", { name: /^Settings/ })).first().click();
      await page.locator('.st-nav button[data-sec="look"]').click();
      await page.waitForTimeout(900);
      const morph = page.locator(".st-morph").locator("xpath=..");
      await morph.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const mb = await morph.boundingBox();
      console.log("morph card", Math.round(mb.width), Math.round(mb.height));
      const style = (v) => page.locator(`.st-style[data-morph="${v}"]`);
      await page.mouse.move(mb.x + mb.width - 6, mb.y + mb.height + 30);
      await encode(await record(page, async () => {
        for (const v of ["wipe", "clock", "sweep", "grey"]) { await style(v).hover(); await page.waitForTimeout(2300); }
      }), { x: Math.round(mb.x), y: Math.round(mb.y), width: Math.round(mb.width), height: Math.round(mb.height) }, `phases-${scheme}`, 960, 1280);
      await page.context().close();
    },
    async zoom() {
      page = await open(940, 760, { time: TUE + "12:00" });
      const card = page.locator("#dayCard");
      await card.scrollIntoViewIfNeeded();
      for (let i = 0; i < 13; i++) await card.getByRole("button", { name: "Previous day" }).click();
      await page.waitForTimeout(900);
      const cb = await card.boundingBox(), plot = await card.locator(".sg-plot").boundingBox();
      console.log("day card", await corners(card));
      const x = (f) => plot.x + plot.width * f, y = plot.y + plot.height * 0.42, rest = [x(0.62), plot.y - 30];
      const p = await pointer(page);
      await p.place(...rest);
      await encode(await record(page, async () => {
        await page.waitForTimeout(600);
        await p.glide(x(0.1), y, 700);
        await page.waitForTimeout(250);
        await page.mouse.down();
        await p.glide(x(0.47), y, 1000);
        await page.waitForTimeout(150);
        await page.mouse.up();
        await page.waitForTimeout(900);
        await p.glide(x(0.32), y, 600);
        await p.glide(x(0.8), y, 1200);
        await page.waitForTimeout(300);
        await p.glide(x(0.5), plot.y - 30, 500);
        await page.waitForTimeout(250);
        await p.click(...center(await card.locator(".sg-reset").boundingBox()), 500);
        await page.waitForTimeout(500);
        await p.glide(...rest, 700);
        await page.waitForTimeout(1000);
      }), { x: Math.round(cb.x), y: Math.round(cb.y), width: Math.round(cb.width), height: Math.round(cb.height) }, `zoom-${scheme}`, 1360, 940);
      await page.context().close();
    },
    async best() {
      page = await open(1000, 700, { time: TUE + "09:40" });
      const panel = page.locator("section.panel"), pb = await panel.boundingBox();
      console.log("panel", await corners(panel));
      await page.addStyleTag({ content: `section.panel{min-height:${Math.ceil(pb.height)}px}` });
      const move = await page.locator("#bestMove").boundingBox(), rest = [pb.x + pb.width * 0.7, center(await page.locator("#filterBtn").boundingBox())[1]];
      const p = await pointer(page);
      await p.place(...rest);
      await encode(await record(page, async () => {
        await page.waitForTimeout(1200);
        await p.click(...center(move), 800);
        await page.waitForTimeout(400);
        await p.glide(...rest, 700);
        await page.waitForTimeout(2600);
      }), { x: Math.round(pb.x), y: Math.round(pb.y), width: Math.round(pb.width), height: Math.round(pb.height) }, `best-${scheme}`, 1040, 1000);
      await page.context().close();
    },
    async looks() {
      page = await open(1280, 820, { time: TUE + "10:05" });
      await page.getByRole("button", { name: /^Start/ }).first().click();
      await page.waitForTimeout(800);
      await page.locator(".timer-card").hover();
      await page.locator(".look-btn").click();
      await page.waitForTimeout(1400);
      const top = await page.locator("main.top").boundingBox();
      const box = { x: Math.round(top.x - 16), y: Math.round(top.y - 16), width: Math.round(top.width + 32), height: Math.round(Math.min(top.height + 32, 820 - top.y + 16)) };
      const tile = (id) => page.locator(`.cz-sec[data-zone="looks"] [data-id="${id}"]`);
      const p = await pointer(page);
      await p.place(...center(await tile("default").boundingBox()).map((v, i) => v + (i ? 70 : 0)));
      await encode(await record(page, async () => {
        await page.waitForTimeout(700);
        for (const id of ["bold", "notebook", "forecast", "wrist", "sports", "nightstand", "default"]) {
          await p.click(...center(await tile(id).boundingBox()), 650);
          await page.waitForTimeout(id === "forecast" ? 1800 : 1200);
        }
      }), box, `looks-${scheme}`, 1320, 1280);
      await page.context().close();
    },
    async looksPhone() {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 740 }, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true });
      await ctx.route("**/api/weather", (r) => r.fulfill({ json: { ...WEATHER, at: new Date(TUE + "10:05").getTime() } }));
      await ctx.route("**/api/here", (r) => r.fulfill({ json: { lat: WEATHER.lat, lon: WEATHER.lon, place: WEATHER.place } }));
      page = await ctx.newPage();
      await page.clock.install({ time: new Date(TUE + "10:05") });
      await page.goto(base + "/app/?demo=1&embed=1");
      await page.waitForTimeout(1200);
      // Taps only: a mouse click would leave a pointer hovering over the tray once it opens.
      await page.getByRole("button", { name: /^Start/ }).first().tap();
      await page.waitForTimeout(800);
      await page.addStyleTag({ content: "*{-webkit-tap-highlight-color:transparent!important}" });
      await page.locator(".timer-card .dial-wrap").dispatchEvent("contextmenu");
      await page.waitForTimeout(1400);
      const tile = (id) => page.locator(`.cz [data-id="${id}"]`);
      await encode(await record(page, async () => {
        await page.waitForTimeout(900);
        for (const id of ["bold", "notebook", "forecast", "wrist", "sports", "nightstand", "default"]) {
          await tile(id).tap();
          await page.waitForTimeout(id === "forecast" ? 1800 : 1300);
        }
      }), { x: 0, y: 0, width: 390, height: 740 }, `looks-phone-${scheme}`, 520, 390);
      await ctx.close();
    },
    async faces() {
      page = await open(1000, 760, { time: TUE + "10:05" });
      await page.getByRole("button", { name: /^Start/ }).first().click();
      await page.waitForTimeout(800);
      await page.locator(".timer-card").hover();
      await page.locator(".look-btn").click();
      await page.waitForTimeout(1200);
      // Only the timer: Customize stays open to switch faces, out of sight.
      await page.addStyleTag({ content: ".cz,.cz-zone{visibility:hidden!important}" });
      const card = page.locator(".timer-card"), tb = await card.boundingBox();
      console.log("timer card", await corners(card));
      const face = (id) => page.locator(`.cz-sec[data-zone="face"] [data-id="${id}"]`).evaluate((el) => el.click());
      await page.mouse.move(5, 5);
      await page.waitForTimeout(600);
      await encode(await record(page, async () => {
        await page.waitForTimeout(1500);
        for (const id of ["weight", "sport", "flap", "odo", "nixie", "vfd", "words", "classic"]) { await face(id); await page.waitForTimeout(1700); }
      }), { x: Math.round(tb.x), y: Math.round(tb.y), width: Math.round(tb.width), height: Math.round(tb.height) }, `faces-${scheme}`, 760, 1000);
      await page.context().close();
    },
  };
  for (const [name, run] of Object.entries(steps)) if (!only || only.includes(name)) await run();
}
await browser.close();
