import { getCollection } from "astro:content";

export const SITE = { name: "Pomodoro Ledger", app: "/app/", tagline: "A Pomodoro timer that keeps the books on your focus." };

export const posts = async (c: "devlog" | "guides") =>
  (await getCollection(c, (p) => import.meta.env.DEV || !p.data.draft)).sort((a, b) => +b.data.date - +a.data.date);

export const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
