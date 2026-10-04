import { $ } from "./dom";
import { sizeTimer } from "./layout";
import { ss } from "./state";

const PAGES = ["timer", "tasks", "progress"], pageScroll: Record<string, number> = {};
export const phone = () => matchMedia("(max-width: 640px)").matches;

/** Switches the phone layout's page; on wider screens it only records the choice. */
export function showPage(name: string) {
  if (!PAGES.includes(name)) name = "timer";
  const prev = document.body.dataset.page;
  if (prev === name) return;
  const scroller = (n: string) => n === "timer" ? $(".timer-card") : n === "tasks" ? $(".top > .panel") : $(".progress");
  if (prev) pageScroll[prev] = scroller(prev).scrollTop;
  document.body.dataset.page = name;
  ss.set("pl.page", name);
  document.querySelectorAll<HTMLElement>(".tabbar [data-page]").forEach((b) => b.dataset.page === name ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  if (!phone() || !prev) return;
  const el = scroller(name);
  el.scrollTop = pageScroll[name] || 0;
  if (name === "timer") sizeTimer();
  el.classList.remove("page-in"); void el.offsetWidth; el.classList.add("page-in");
}

export function initPages() {
  $(".tabbar").addEventListener("click", (e) => { const b = (e.target as Element).closest<HTMLElement>("[data-page]"); if (b) showPage(b.dataset.page!); });
  showPage(ss.get("pl.page") || "timer");
}
