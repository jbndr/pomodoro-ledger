<script>
  import { flushSync, tick } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import { calm } from "../dom";
  import { timerBackdrop, timerFace, timerRing } from "../lib/faces";
  import { cz, ZONES } from "./state.svelte";
  import Tiles from "./Tiles.svelte";
  import "./customize.css";

  let { api } = $props();

  // While the look changes, the timer's own controls and the rest of the page are out of play; its face, ring and background become the way to choose what to change.
  const CHROME = ".bar, .room, .banner, .panel, .progress, .tabbar, .timer-card > :is(.card-head, .cycle, .adjust, .controls)";
  const NAME = Object.fromEntries(ZONES);
  const wideQuery = matchMedia("(min-width: 901px)");
  let wide = $state(wideQuery.matches), dir = $state(1), look = $state({ face: "classic", ring: "arc", backdrop: "glow" }), hints = $state({});
  let before = null, opener = null, inerted = [], morphs = 0, lastZone = "face", tray = $state();

  const read = () => ({ face: timerFace(api.S.settings.face), ring: timerRing(api.S.settings.ring), backdrop: timerBackdrop(api.S.settings.backdrop) });
  const hint = $derived(hints[(wide && cz.hover) || cz.zone] || "");

  // Where the browser can, each change is a view transition: the dial glides to its new size and a new look crossfades in.
  function morph(change) {
    const apply = () => { change(); flushSync(); };
    if (calm() || !document.startViewTransition) { apply(); return; }
    const root = document.documentElement;
    morphs++;
    root.classList.add("cz-morph");
    const vt = document.startViewTransition(apply);
    vt.ready.catch(() => {});
    vt.finished.finally(() => { if (!--morphs) root.classList.remove("cz-morph"); });
  }

  // The tray's height tells a phone how much room the timer has left; beside the card, the panel matches the card's height.
  function fit() {
    document.body.style.setProperty("--cz-h", (tray && !wide ? tray.offsetHeight : 0) + "px");
    api.sizeTimer();
    const card = document.querySelector(".timer-card");
    if (card) document.body.style.setProperty("--cz-card", card.offsetHeight + "px");
  }

  function apply(l) {
    Object.assign(api.S.settings, l);
    api.renderTimer(true);
  }

  const selected = () => tray?.querySelector(wide ? `.cz-sec[data-zone="${cz.zone}"] [aria-checked="true"]` : '[aria-checked="true"]');

  export function open(which) {
    if (cz.open) { if (which) cz.zone = which; return; }
    cz.zone = which || "face";
    opener = document.activeElement;
    if (api.zen()) api.setZen(false);
    if (api.phone() && document.body.dataset.page !== "timer") api.showPage("timer");
    before = read(); look = { ...before }; cz.hover = "";
    morph(() => {
      cz.open = true;
      document.body.classList.add("customizing");
      inerted = [...document.querySelectorAll(CHROME)].filter((el) => !el.inert);
      inerted.forEach((el) => (el.inert = true));
      flushSync();
      if (!api.phone() && !wide) window.scrollTo(0, 0);
      fit();
      selected()?.focus({ preventScroll: true });
      if (wide) reveal(cz.zone, false);
    });
  }

  export function close(keep) {
    if (!cz.open) return;
    const changed = Object.keys(before).some((k) => before[k] !== look[k]);
    morph(() => {
      if (!keep && changed) apply(before);
      cz.open = false; cz.hover = "";
      document.body.classList.remove("customizing");
      inerted.forEach((el) => (el.inert = false));
      inerted = [];
      flushSync();
      fit();
    });
    if (keep && changed) api.save();
    if (opener?.isConnected && !opener.closest("[inert], [hidden]")) opener.focus({ preventScroll: true });
    opener = null;
  }

  export const isOpen = () => cz.open;

  function pick(k, id) {
    cz.zone = k;
    if (look[k] === id) return;
    morph(() => { look[k] = id; apply({ [k]: id }); });
  }

  const section = (k) => tray?.querySelector(`.cz-sec[data-zone="${k}"]`);

  // Scrolls only the panel, never the page, just far enough to show the whole group.
  function reveal(k, smooth) {
    const box = tray?.querySelector(".cz-scroll"), sec = section(k);
    if (!box || !sec) return;
    const top = sec.offsetTop - box.offsetTop, bottom = top + sec.offsetHeight;
    const to = top < box.scrollTop ? top : bottom > box.scrollTop + box.clientHeight ? Math.min(top, bottom - box.clientHeight) : box.scrollTop;
    if (to !== box.scrollTop) box.scrollTo({ top: to, behavior: smooth && !calm() ? "smooth" : "auto" });
  }

  // Choosing a part on the timer slides its tiles in from the side it sits on in the order face, ring, background; on a wide screen its group scrolls into view.
  $effect(() => {
    const k = cz.zone;
    if (k === lastZone) return;
    const order = ZONES.map(([z]) => z);
    dir = order.indexOf(k) > order.indexOf(lastZone) ? 1 : -1;
    lastZone = k;
    if (cz.open && wide) tick().then(() => reveal(k, true));
  });

  function key(e) {
    if (!cz.open) return;
    if (e.key === "Escape") { e.preventDefault(); close(false); }
    else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); close(true); }
  }

  $effect(() => {
    const on = () => (wide = wideQuery.matches);
    wideQuery.addEventListener("change", on);
    return () => wideQuery.removeEventListener("change", on);
  });

  $effect(() => {
    if (!cz.open || !tray) return;
    const ro = new ResizeObserver(fit);
    ro.observe(tray);
    ro.observe(document.querySelector(".timer-card"));
    return () => ro.disconnect();
  });
</script>

<svelte:window onkeydown={key} />

{#if cz.open}
  <div class="cz" class:wide role="dialog" aria-label="Customize the timer" bind:this={tray}>
    <header class="cz-head">
      <button class="cz-btn" type="button" onclick={() => close(false)}>Cancel</button>
      <div class="cz-title" aria-live="polite">
        {#if wide}<b>Customize timer</b><small>Click a part of the timer to jump to it</small>
        {:else}{#key cz.zone}<b in:fade={{ duration: calm() ? 0 : 180 }}>{NAME[cz.zone]}</b>{/key}{/if}
      </div>
      <button class="cz-btn cz-done" type="button" onclick={() => close(true)}>Done</button>
    </header>
    {#if wide}
      <div class="cz-scroll">
        {#each ZONES as [k, label] (k)}
          <section class="cz-sec" class:on={cz.zone === k} data-zone={k} aria-label={label} onpointerenter={() => (cz.hover = k)} onpointerleave={() => (cz.hover = "")} onfocusin={() => (cz.zone = k)}>
            <h3>{label}</h3>
            <Tiles kind={k} value={look[k]} onpick={(id) => pick(k, id)} onhint={(t) => (hints[k] = t)} />
          </section>
        {/each}
      </div>
    {:else}
      <div class="cz-panel">
        {#key cz.zone}<div in:fly={{ x: calm() ? 0 : dir * 16, duration: calm() ? 0 : 280, easing: cubicOut }}><Tiles kind={cz.zone} value={look[cz.zone]} onpick={(id) => pick(cz.zone, id)} onhint={(t) => (hints[cz.zone] = t)} /></div>{/key}
      </div>
    {/if}
    <p class="cz-hint">{hint}</p>
  </div>
{/if}
