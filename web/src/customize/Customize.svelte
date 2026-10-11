<script>
  import { flushSync, tick } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import { calm } from "../dom";
  import { LOOKS, timerBackdrop, timerFace, timerRing } from "../lib/faces";
  import { deleteLook, findLook, MAX_LOOKS, renameLook, saveLook, savedLooks } from "../lib/looks";
  import { cz, ZONES } from "./state.svelte";
  import Tiles from "./Tiles.svelte";
  import "./customize.css";

  let { api } = $props();

  // While the look changes, the timer's own controls and the rest of the page are out of play; its face, ring and background become the way to choose what to change.
  const CHROME = ".bar, .room, .banner, .panel, .progress, .tabbar, .timer-card > :is(.card-head, .cycle, .adjust, .controls)";
  const SECTIONS = [["looks", "Looks"], ...ZONES], NAME = Object.fromEntries(SECTIONS), ORDER = SECTIONS.map(([k]) => k);
  const wideQuery = matchMedia("(min-width: 901px)");
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  let wide = $state(wideQuery.matches), dir = $state(1), look = $state({ face: "classic", ring: "arc", backdrop: "glow" }), hints = $state({});
  let mine = $state([]), editing = $state("");
  let before = null, opener = null, inerted = [], morphs = 0, lastZone = "looks", tray = $state(), touched = false;

  const read = () => ({ face: timerFace(api.S.settings.face), ring: timerRing(api.S.settings.ring), backdrop: timerBackdrop(api.S.settings.backdrop) });
  const value = (k) => (k === "looks" ? findLook(look, mine)?.id || "" : look[k]);
  const about = $derived((wide && cz.hover) || cz.zone), shown = $derived(hints[about] || {});
  // Your own look, when it's the one on and the one the hint is about, can be renamed or deleted from the hint's line.
  const own = $derived(!editing && about === "looks" && shown.id === value("looks") ? mine.find((m) => m.id === shown.id) : null);
  const save = $derived.by(() => {
    const made = findLook(look, mine), full = mine.length >= MAX_LOOKS;
    return {
      look: made || full ? null : look,
      hint: made ? "Change the face, ring or background, then save your mix here." : full ? `You can keep up to ${MAX_LOOKS} looks. Delete one to save another.` : "Keep this face, ring and background as one of your looks.",
      onsave: saveCurrent,
    };
  });

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

  /** Opens on a part of the timer, or on the ready-made looks; with a look's id, tries that look on straight away. */
  export function open(which, tryLook) {
    if (cz.open) { if (which) cz.zone = which; if (tryLook) pickLook(tryLook); return; }
    cz.zone = which || "looks";
    opener = document.activeElement;
    if (api.zen()) api.setZen(false);
    if (api.phone() && document.body.dataset.page !== "timer") api.showPage("timer");
    before = read(); look = { ...before }; cz.hover = "";
    mine = savedLooks(api.S.settings.looks); editing = ""; touched = false;
    morph(() => {
      cz.open = true;
      document.body.classList.add("customizing");
      inerted = [...document.querySelectorAll(CHROME)].filter((el) => !el.inert);
      inerted.forEach((el) => (el.inert = true));
      flushSync();
      if (!api.phone() && !wide) window.scrollTo(0, 0);
      fit();
      (selected() || tray?.querySelector(".st-face"))?.focus({ preventScroll: true });
      if (wide) reveal(cz.zone, false);
    });
    if (tryLook) pickLook(tryLook);
  }

  export function close(keep) {
    if (!cz.open) return;
    const changed = Object.keys(before).some((k) => before[k] !== look[k]), persist = (keep && changed) || touched;
    // Looks you saved stay saved on Cancel; only the timer goes back to how it was.
    morph(() => {
      if (!keep && changed) apply(before);
      if (persist) api.save();
      cz.open = false; cz.hover = ""; editing = "";
      document.body.classList.remove("customizing");
      inerted.forEach((el) => (el.inert = false));
      inerted = [];
      flushSync();
      fit();
    });
    if (opener?.isConnected && !opener.closest("[inert], [hidden]")) opener.focus({ preventScroll: true });
    opener = null;
  }

  export const isOpen = () => cz.open;

  function pick(k, id) {
    cz.zone = k;
    if (look[k] === id) return;
    morph(() => { look[k] = id; apply({ [k]: id }); });
  }

  function pickLook(id) {
    const l = [...LOOKS, ...mine].find((x) => x.id === id);
    cz.zone = "looks";
    if (!l || value("looks") === id) return;
    const next = { face: l.face, ring: l.ring, backdrop: l.backdrop };
    morph(() => { look = next; apply(next); });
  }

  function keepLooks(list) {
    mine = list; api.S.settings.looks = list; touched = true;
  }

  const tile = (id) => tray?.querySelector(`.st-face[data-id="${id}"]`);

  // With a keyboard at hand, a new look's name is ready to type over; on a touchscreen it keeps the suggested one.
  function saveCurrent() {
    const list = saveLook(mine, look);
    if (list === mine) return;
    keepLooks(list);
    cz.zone = "looks";
    const id = list.at(-1).id;
    if (fine.matches) editing = id;
    else tick().then(() => tile(id)?.focus({ preventScroll: true }));
  }

  function rename(name, refocus) {
    const id = editing;
    if (!id) return;
    editing = "";
    if (name != null) keepLooks(renameLook(mine, id, name));
    if (refocus) tick().then(() => tile(id)?.focus({ preventScroll: true }));
  }

  // The timer keeps a deleted look on, so Save look offers it back straight away.
  function remove(id) {
    keepLooks(deleteLook(mine, id));
    tick().then(() => tray?.querySelector(".cz-save")?.focus({ preventScroll: true }));
  }

  const lookProps = (k) => (k === "looks" ? { mine, save, editing, onrename: rename } : {});

  const section = (k) => tray?.querySelector(`.cz-sec[data-zone="${k}"]`);

  // Scrolls only the panel, never the page, just far enough to show the whole group.
  function reveal(k, smooth) {
    const box = tray?.querySelector(".cz-scroll"), sec = section(k);
    if (!box || !sec) return;
    const top = sec.offsetTop - box.offsetTop, bottom = top + sec.offsetHeight;
    const to = top < box.scrollTop ? top : bottom > box.scrollTop + box.clientHeight ? Math.min(top, bottom - box.clientHeight) : box.scrollTop;
    if (to !== box.scrollTop) box.scrollTo({ top: to, behavior: smooth && !calm() ? "smooth" : "auto" });
  }

  // Choosing a part on the timer slides its tiles in from the side it sits on in the order looks, face, ring, background; on a wide screen its group scrolls into view.
  $effect(() => {
    const k = cz.zone;
    if (k === lastZone) return;
    dir = ORDER.indexOf(k) > ORDER.indexOf(lastZone) ? 1 : -1;
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
        {:else if cz.zone === "looks"}<b>Looks</b>
        {:else}<span class="cz-crumb"><button type="button" onclick={() => (cz.zone = "looks")}>Looks</button><i aria-hidden="true">›</i>{#key cz.zone}<b in:fade={{ duration: calm() ? 0 : 180 }}>{NAME[cz.zone]}</b>{/key}</span>{/if}
      </div>
      <button class="cz-btn cz-done" type="button" onclick={() => close(true)}>Done</button>
    </header>
    {#if wide}
      <div class="cz-scroll">
        {#each SECTIONS as [k, label] (k)}
          <section class="cz-sec" class:on={cz.zone === k} data-zone={k} aria-label={label} onpointerenter={() => (cz.hover = k)} onpointerleave={() => (cz.hover = "")} onfocusin={() => (cz.zone = k)}>
            <h3>{label}</h3>
            <Tiles kind={k} value={value(k)} onpick={(id) => (k === "looks" ? pickLook(id) : pick(k, id))} onhint={(text, id) => (hints[k] = { text, id })} {...lookProps(k)} />
          </section>
        {/each}
      </div>
    {:else}
      <div class="cz-panel">
        {#key cz.zone}<div in:fly={{ x: calm() ? 0 : dir * 16, duration: calm() ? 0 : 280, easing: cubicOut }}><Tiles kind={cz.zone} value={value(cz.zone)} onpick={(id) => (cz.zone === "looks" ? pickLook(id) : pick(cz.zone, id))} onhint={(text, id) => (hints[cz.zone] = { text, id })} {...lookProps(cz.zone)} /></div>{/key}
      </div>
    {/if}
    <p class="cz-hint">{#if own}<span class="cz-own"><span>{shown.text}</span><button type="button" aria-label={"Rename " + own.name} onclick={() => (editing = own.id)}>Rename</button><button type="button" aria-label={"Delete " + own.name} onclick={() => remove(own.id)}>Delete</button></span>{:else}{shown.text || ""}{/if}</p>
  </div>
{/if}
