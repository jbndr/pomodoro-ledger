import { $ } from "./dom";

let modalScroll: number | null = null;

/** Shows or hides a dialog overlay, freezing the page behind it while any is open. */
export function setOverlay(id: string, open: boolean) {
  const overlay = $(id);
  if (open && modalScroll === null) {
    modalScroll = scrollY;
    const bounds = document.body.getBoundingClientRect();
    document.body.style.setProperty("--modal-top", bounds.top + "px");
    document.body.style.setProperty("--modal-width", bounds.width + "px");
    document.body.classList.add("modal-open");
  }
  overlay.hidden = !open;
  if (!open && modalScroll !== null && !document.querySelector(".overlay:not([hidden])")) {
    const top = modalScroll;
    modalScroll = null;
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("--modal-top");
    document.body.style.removeProperty("--modal-width");
    window.scrollTo(0, top);
    requestAnimationFrame(sizeTimer);
  }
}

function sizeViewport() {
  if (!window.visualViewport) return;
  document.documentElement.style.setProperty("--viewport-height", visualViewport!.height + "px");
  document.documentElement.style.setProperty("--viewport-top", visualViewport!.offsetTop + "px");
}

export function sizeTimer() {
  const card = $(".timer-card"), dial = $(".dial-wrap");
  if (modalScroll !== null || document.body.classList.contains("zen")) return;
  const mobile = matchMedia("(max-width: 640px)").matches;
  const landscape = matchMedia("(orientation: landscape)").matches;
  document.body.classList.toggle("landscape-phone", mobile && landscape);
  document.body.classList.toggle("compact-phone", mobile && !landscape && matchMedia("(max-height: 640px)").matches);
  if (!mobile) {
    // The card is sticky, so measure where its column starts in the document rather than where it's stuck now.
    const top = $(".top").getBoundingClientRect().top + scrollY;
    const fit = () => innerHeight - top - 18 - (card.getBoundingClientRect().height - dial.getBoundingClientRect().height);
    // Short windows drop the extras (shortcut hints, cycle dots, spacing) before the dial gets small.
    document.body.classList.remove("short-desk");
    let size = fit();
    if (size < 300) { document.body.classList.add("short-desk"); size = fit(); }
    card.style.setProperty("--desk-dial", Math.max(160, Math.min(380, size)) + "px");
    return;
  }
  if (landscape || document.body.dataset.page !== "timer") return;
  // The shell gives the card a fixed height; whatever its other rows don't need goes to the dial.
  const fit = () => {
    const cs = getComputedStyle(card), gap = parseFloat(cs.rowGap) || 0;
    const rows = ([...card.children] as HTMLElement[]).filter((el) => el !== dial && !el.classList.contains("glow") && el.offsetHeight);
    const used = rows.reduce((sum, el) => sum + el.offsetHeight, 0) + gap * rows.length + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    return card.clientHeight - used - 12;
  };
  // Short screens, or a room strip on top, get the tighter layout before the dial gets small.
  let size = fit();
  if (size < 200 && !document.body.classList.contains("compact-phone")) { document.body.classList.add("compact-phone"); size = fit(); }
  card.style.setProperty("--mobile-dial", Math.max(140, Math.min(380, size)) + "px");
}

export const timerLayout = new ResizeObserver(sizeTimer);
const barHeight = () => document.documentElement.style.setProperty("--bar-h", $(".bar").offsetHeight + "px");
const scrolled = () => document.body.classList.toggle("scrolled", scrollY > 4);

export function initLayout() {
  // The sticky bar's height decides where the sticky timer card can rest below it.
  new ResizeObserver(barHeight).observe($(".bar"));
  addEventListener("scroll", scrolled, { passive: true });
  [$(".bar"), $("#previewBanner")].forEach((el) => timerLayout.observe(el));
  addEventListener("resize", sizeTimer);
  // The observer above doesn't run in background tabs, and web fonts change heights after the first measure.
  if (document.fonts) document.fonts.ready.then(sizeTimer);
  if (window.visualViewport) {
    visualViewport!.addEventListener("resize", sizeViewport);
    visualViewport!.addEventListener("scroll", sizeViewport);
    visualViewport!.addEventListener("resize", sizeTimer);
    sizeViewport();
  }
}

/** Measures the layout once everything is mounted. */
export function measure() { barHeight(); scrolled(); sizeTimer(); }
