import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { posts } from "../../lib";

export async function GET(ctx: APIContext) {
  return rss({
    title: "Pomodoro Ledger · Guides",
    description: "Practical guides to the Pomodoro technique, planning and deep work.",
    site: ctx.site!,
    items: (await posts("guides")).map((p) => ({ title: p.data.title, pubDate: p.data.date, description: p.data.description, link: `/guides/${p.id}` })),
  });
}
