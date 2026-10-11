// Copies the Google Fonts we use into web/public/fonts, so visitors' browsers never contact Google.
// Run with `node scripts/fonts.mjs` after changing a family, axis range or digit subset.
import { mkdir, rm, writeFile } from "node:fs/promises";

const OUT = new URL("../web/public/fonts/", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const SHEETS = {
  // Site, app and the stats page.
  "fonts.css": [{ q: "family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Geist:wght@200..700&family=Geist+Mono:wght@400..600" }],
  // Only the app: the serif accent and the digit-only faces of some timer looks.
  "faces.css": [
    { q: "family=Instrument+Serif:ital@1" },
    { q: "family=M+PLUS+Rounded+1c:wght@800&text=0123456789%2B", tag: "digits" },
    { q: "family=Barlow+Condensed:ital,wght@1,700&family=Fredoka:wght@600&family=Nunito:wght@200..1000&text=0123456789%3A%2B", tag: "digits" },
  ],
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const get = async (url, as) => {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(res.status + " " + url);
  return as === "text" ? res.text() : Buffer.from(await res.arrayBuffer());
};

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const files = new Map();
for (const [sheet, requests] of Object.entries(SHEETS)) {
  const out = [];
  for (const { q, tag } of requests) {
    const css = await get("https://fonts.googleapis.com/css2?" + q + "&display=swap", "text");
    for (const [, subset, block] of css.matchAll(/(?:\/\* ([\w-[\]]+) \*\/\s*)?(@font-face \{[^}]+\})/g)) {
      const family = block.match(/font-family: '([^']+)'/)[1], italic = /font-style: italic/.test(block);
      const src = block.match(/url\((https:[^)]+)\) format\('woff2'\)/)[1];
      const name = [slug(family), italic && "italic", tag || subset.replace(/[[\]]/g, "")].filter(Boolean).join("-") + ".woff2";
      if (!files.has(name)) files.set(name, await get(src));
      out.push(block.replace(src, "./" + name));
    }
  }
  await writeFile(new URL(sheet, OUT), out.join("\n") + "\n");
}
for (const [name, data] of files) await writeFile(new URL(name, OUT), data);
console.log(files.size + " files, " + Math.round([...files.values()].reduce((n, b) => n + b.length, 0) / 1024) + " KB");
