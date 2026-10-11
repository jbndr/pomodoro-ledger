<script>
  import { flushSync, tick } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import { calm } from "../dom";
  import { LOOKS, timerBackdrop, timerFace, timerRing } from "../lib/faces";
  import { deleteLook, findLook, MAX_LOOKS, renameLook, saveLook, savedLooks } from "../lib/looks";
  import { rovingIndex } from "../lib/settings";
  import { cz, ZONES } from "./state.svelte";
  import Tiles from "./Tiles.svelte";
  import "./customize.css";

  let { api } = $props();

  // While the look changes, the timer's own controls and the rest of the page are out of play; its face, ring and background become the way to choose what to change.
  const CHROME = ".bar, .room, .banner, .panel, .progress, .tabbar, .timer-card > :is(.card-head, .cycle, .adjust, .controls)";
  const TABS = [["looks", "Looks"], ...ZONES], ORDER = TABS.map(([k]) => k);
  const icon = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  const X = icon('<path d="M7 7l10 10M17 7L7 17"/>'), CHECK = icon('<path d="M5.5 12.5l4.2 4.2L18.5 7.8"/>');
  const wideQuery = matchMedia("(min-width: 901px)");
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  let wide = $state(wideQuery.matches), dir = $state(1), look = $state({ face: "classic", ring: "arc", backdrop: "glow" }), hints = $state({});
  let mine = $state([]), editing = $state(""), undo = $state(null), undoT = 0;
  let before = null, opener = null, inerted = [], lastZone = "looks", tray = $state(), tabs = $state(), panel = $state(), touched = false;
  const morphs = { "cz-morph": 0, "cz-pick": 0 };

  const read = () => ({ face: timerFace(api.S.settings.face), ring: timerRing(api.S.settings.ring), backdrop: timerBackdrop(api.S.settings.backdrop) });
  const value = (k) => (k === "looks" ? findLook(look, mine)?.id || "" : look[k]);
  const shown = $derived(hints[cz.zone] || {});
  const save = $derived.by(() => {
    const made = findLook(look, mine), full = mine.length >= MAX_LOOKS;
    return {
      look: made || full ? null : look,
      hint: made ? "Change the face, ring or background, then save your mix here." : full ? `You can keep up to ${MAX_LOOKS} looks. Delete one to save another.` : "Keep this face, ring and background as one of your looks.",
      onsave: saveCurrent,
    };
  });

  // Opening and closing are view transitions in which the dial glides to its new size. A pick only crossfades the card, and the tray stays live and scrollable through it.
  function morph(change, pick = false) {
    const apply = () => { change(); flushSync(); };
    if (calm() || !document.startViewTransition) { apply(); return; }
    const root = document.documentElement, kind = pick ? "cz-pick" : "cz-morph";
    morphs[kind]++;
    root.classList.add(kind);
    const vt = document.startViewTransition(apply);
    vt.ready.catch(() => {});
    vt.finished.finally(() => { if (!--morphs[kind]) root.classList.remove(kind); });
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

  // While one group fades out the next is already in, so lookups go to the group that's on.
  const pane = () => tray?.querySelector(`.cz-pane[data-zone="${cz.zone}"]`);
  const selected = () => pane()?.querySelector('[aria-checked="true"]');

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
      if (wide) show();
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
      cz.open = false; cz.hover = ""; editing = ""; forget();
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
    cz.zone = k; forget();
    if (look[k] === id) return;
    morph(() => { look[k] = id; apply({ [k]: id }); }, true);
  }

  function pickLook(id) {
    const l = [...LOOKS, ...mine].find((x) => x.id === id);
    cz.zone = "looks"; forget();
    if (!l || value("looks") === id) return;
    const next = { face: l.face, ring: l.ring, backdrop: l.backdrop };
    morph(() => { look = next; apply(next); }, true);
  }

  function keepLooks(list) {
    mine = list; api.S.settings.looks = list; touched = true;
  }

  const tile = (id) => pane()?.querySelector(`.st-face[data-id="${id}"]`);

  // With a keyboard at hand, a new look's name is ready to type over; on a touchscreen it keeps the suggested one.
  function saveCurrent() {
    const list = saveLook(mine, look);
    if (list === mine) return;
    forget();
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

  // A deleted look can be brought back, name and place included, for a few seconds; the timer keeps wearing it meanwhile.
  function remove(id) {
    const at = mine.findIndex((m) => m.id === id), wasOn = value("looks") === id;
    if (at < 0) return;
    undo = { look: mine[at], at };
    clearTimeout(undoT); undoT = setTimeout(forget, 6000);
    keepLooks(deleteLook(mine, id));
    tick().then(() => (wasOn ? pane()?.querySelector(".cz-save") : selected())?.focus({ preventScroll: true }));
  }

  function restore() {
    const { look: l, at } = undo;
    forget();
    if (findLook(l, mine) || mine.length >= MAX_LOOKS) return;
    keepLooks([...mine.slice(0, at), l, ...mine.slice(at)]);
    tick().then(() => tile(l.id)?.focus({ preventScroll: true }));
  }

  function forget() { clearTimeout(undoT); undo = null; }

  const lookProps = (k) => (k === "looks" ? { mine, save, editing, onrename: rename, onedit: (id) => { forget(); editing = id; }, ondelete: remove } : {});

  // A group opens at its top, or just far enough down to show the tile that's on; picking never scrolls.
  function show() {
    if (!panel) return;
    const sel = selected(), max = sel ? sel.offsetTop + sel.offsetHeight - panel.clientHeight : 0;
    panel.scrollTop = Math.max(0, max);
    edges();
  }

  // The panel scrolls only when its tiles don't fit, and fades only at an edge with more beyond it.
  function edges() {
    if (!panel) return;
    const top = panel.scrollTop > 1, end = panel.scrollTop + panel.clientHeight < panel.scrollHeight - 1;
    panel.dataset.fade = (top ? "t" : "") + (end ? "b" : "");
  }

  // The old group fades out before the new one slides in from the side its tab sits on, so the two grids never overlap.
  $effect(() => {
    const k = cz.zone;
    if (k === lastZone) return;
    dir = ORDER.indexOf(k) > ORDER.indexOf(lastZone) ? 1 : -1;
    lastZone = k;
    if (cz.open && wide) tick().then(show);
    else tick().then(edges);
  });

  // The segmented control's thumb follows the selected tab.
  function thumb() {
    const on = tabs?.querySelector('[aria-selected="true"]');
    if (!on) return;
    tabs.style.setProperty("--tx", on.offsetLeft + "px");
    tabs.style.setProperty("--tw", on.offsetWidth + "px");
    requestAnimationFrame(() => tabs?.classList.add("ready"));
  }
  $effect(() => { cz.zone; wide; thumb(); });

  function tabKey(e) {
    const i = rovingIndex(e.key, ORDER.indexOf(cz.zone), ORDER.length);
    if (i < 0) return;
    e.preventDefault();
    cz.zone = ORDER[i];
    tick().then(() => tabs?.querySelector('[aria-selected="true"]')?.focus());
  }

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
    const ro = new ResizeObserver(() => { fit(); thumb(); edges(); });
    ro.observe(tray);
    if (tabs) ro.observe(tabs);
    if (panel) ro.observe(panel);
    ro.observe(document.querySelector(".timer-card"));
    return () => ro.disconnect();
  });
</script>

<svelte:window onkeydown={key} />

{#if cz.open}
  <div class="cz" class:wide role="dialog" aria-label="Customize the timer" bind:this={tray}>
    <header class="cz-head">
      <button class="cz-btn" type="button" aria-label="Cancel" title="Cancel · Esc" onclick={() => close(false)}>{@html X}</button>
      <div class="cz-tabs" role="tablist" aria-label="What to change" bind:this={tabs} onkeydown={tabKey}>
        {#each TABS as [k, label] (k)}
          <button type="button" role="tab" id="cz-tab-{k}" aria-selected={String(cz.zone === k)} aria-controls="cz-panel" tabindex={cz.zone === k ? 0 : -1} onclick={() => (cz.zone = k)} onpointerenter={() => (cz.hover = k)} onpointerleave={() => (cz.hover = "")}>{label}</button>
        {/each}
      </div>
      <button class="cz-btn cz-done" type="button" aria-label="Done" title="Done · ⌘↵" onclick={() => close(true)}>{@html CHECK}</button>
    </header>
    <div class="cz-panel" id="cz-panel" role="tabpanel" aria-labelledby="cz-tab-{cz.zone}" bind:this={panel} onscroll={edges}>
      {#key cz.zone}<div class="cz-pane" data-zone={cz.zone} in:fly={{ x: calm() ? 0 : dir * 12, delay: calm() ? 0 : 60, duration: calm() ? 0 : 240, easing: cubicOut }} out:fade={{ duration: calm() ? 0 : 90 }} onintroend={edges} onoutroend={edges}><Tiles kind={cz.zone} value={value(cz.zone)} onpick={(id) => (cz.zone === "looks" ? pickLook(id) : pick(cz.zone, id))} onhint={(text, id) => (hints[cz.zone] = { text, id })} {...lookProps(cz.zone)} /></div>{/key}
    </div>
    <p class="cz-hint">{#if undo && cz.zone === "looks"}<span class="cz-own"><span>Deleted “{undo.look.name}”</span><button type="button" onclick={restore}>Undo</button></span>{:else}{shown.text || ""}{/if}</p>
  </div>
{/if}
