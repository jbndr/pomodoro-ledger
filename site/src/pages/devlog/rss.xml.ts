import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { posts } from "../../lib";

export async function GET(ctx: APIContext) {
  return rss({
    title: "Pomodoro Ledger · Devlog",
    description: "Notes on what we're building, why, and what we learned along the way.",
    site: ctx.site!,
    items: (await posts("devlog")).map((p) => ({ title: p.data.title, pubDate: p.data.date, description: p.data.description, link: `/devlog/${p.id}` })),
  });
}
