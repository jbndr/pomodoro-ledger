import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";

export async function GET(ctx: APIContext) {
  const entries = (await getCollection("changelog")).sort((a, b) => b.data.n - a.data.n);
  return rss({
    title: "Pomodoro Ledger changelog",
    description: "Every change to Pomodoro Ledger.",
    site: ctx.site!,
    items: entries.map((e) => ({ title: e.data.title, pubDate: e.data.date, link: `/changelog#${e.data.n}`, description: e.body?.trim() || undefined })),
  });
}
