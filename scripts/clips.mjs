// Records short looping clips of the demo app for the landing page: npm run clips (needs the Worker on :8799).
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const base = process.argv[2] ?? "http://localhost:8799";
const out = "site/src/assets/clips";
const FADE = 0.5;

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
for (const scheme of ["light", "dark"]) {
  const open = async (w, h) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.clock.install();
    await page.goto(base + "/app/?demo=1&embed=1");
    await page.waitForTimeout(1200);
    return page;
  };

  let page = await open(1000, 700);
  await page.getByRole("button", { name: /^Start/ }).first().click();
  await page.waitForTimeout(400);
  await page.clock.fastForward(25 * 60 * 1000 - 6500);
  await page.waitForTimeout(600);
  const top = await page.locator("main.top").boundingBox();
  const box = { x: Math.round(top.x - 16), y: Math.round(top.y - 16), width: Math.round(top.width + 32), height: Math.round(Math.min(top.height + 32, 700 - top.y + 16)) };
  await encode(await record(page, () => page.waitForTimeout(11000)), box, `round-${scheme}`, 1320, 1000);
  await page.context().close();

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

  page = await open(640, 900);
  await page.getByRole("button", { name: "Work together" }).click();
  await page.getByRole("tab", { name: /Private/ }).click();
  await page.locator("#rName").fill("Sam");
  await page.locator("#rCreate").click();
  await page.waitForTimeout(1200);
  const code = await page.locator("#stripCode").innerText().then((t) => t.match(/[A-Z2-9]{6}/)[0]);
  const mates = [];
  for (const name of ["Maya", "Jonas"]) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 740 }, colorScheme: scheme });
    const mate = await ctx.newPage();
    await mate.goto(`${base}/app/?demo=1&embed=1&room=${code}`);
    await mate.waitForTimeout(1200);
    await mate.locator("#rName").fill(name);
    await mate.getByRole("button", { name: /^Join/ }).first().click();
    await mate.waitForTimeout(900);
    mates.push(mate);
  }
  await page.waitForTimeout(1200);
  const strip = await page.locator("#roomStrip").boundingBox();
  const rbox = { x: Math.round(strip.x - 12), y: Math.round(strip.y - 12), width: Math.round(strip.width + 24), height: Math.round(Math.min(900 - strip.y + 12, 640)) };
  const react = async (mate, emoji) => { await mate.locator("#reactBtn").click(); await mate.waitForTimeout(250); await mate.getByRole("button", { name: `Send ${emoji}` }).click(); };
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

  page = await open(1000, 820);
  await page.locator(".yr-hero").scrollIntoViewIfNeeded();
  await page.locator(".yr-hero").click();
  await page.waitForTimeout(1600);
  const card = page.locator(".yr-card").first();
  const cb = (await card.count()) ? await card.boundingBox() : null;
  const story = cb ?? { x: 330, y: 40, width: 340, height: 740 };
  const sbox = { x: Math.round(story.x), y: Math.round(story.y), width: Math.round(story.width), height: Math.round(story.height) };
  await encode(await record(page, async () => {
    await page.waitForTimeout(1800);
    await page.getByRole("button", { name: /Let's go/i }).click().catch(() => {});
    for (let i = 0; i < 4; i++) { await page.waitForTimeout(2600); await page.keyboard.press("ArrowRight"); }
    await page.waitForTimeout(2400);
  }), sbox, `year-${scheme}`, 600, 1000);
  await page.context().close();
}
await browser.close();
