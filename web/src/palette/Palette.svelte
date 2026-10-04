<script>
  import { flushSync } from "svelte";
  import { arrange, recordUse, segments } from "../lib/palette";
  import "./palette.css";

  const KEY = "pl.palette";

  let { api } = $props();
  let input, list, back = null, usage = {}, pointer = "";
  let items = $state.raw([]), query = $state(""), sel = $state(0), snap = $state(true);
  let hl = $state({ y: 0, h: 0, on: false });

  const view = $derived.by(() => {
    let i = 0;
    return arrange(items, query, usage, Date.now()).map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r, i: i++ })) }));
  });
  const rows = $derived(view.flatMap((s) => s.rows));
  const cur = $derived(rows[sel]?.item);

  $effect(() => {
    rows;
    const el = list?.querySelector(`[data-i="${sel}"]`);
    hl = el ? { y: el.offsetTop, h: el.offsetHeight, on: true } : { y: 0, h: 0, on: false };
  });

  export function open() {
    api.closeOthers();
    if (document.activeElement !== document.body) back = document.activeElement;
    usage = api.ls.get(KEY, usage);
    items = api.commands();
    query = ""; sel = 0; snap = true;
    api.setOverlay("#palette", true);
    flushSync();
    list.scrollTop = 0;
    input.focus({ preventScroll: true });
  }

  export function close() {
    if (document.getElementById("palette").hidden) return;
    api.setOverlay("#palette", false);
    if (back && back.isConnected) back.focus({ preventScroll: true });
    back = null;
  }

  export const toggle = () => (document.getElementById("palette").hidden ? open() : close());

  function run(i, alt) {
    const item = rows[i]?.item;
    if (!item) return;
    usage = recordUse(usage, item.id, Date.now());
    api.ls.set(KEY, usage);
    close();
    item.run(!!(alt && item.alt));
  }

  function move(to) {
    if (!rows.length) return;
    snap = false;
    sel = (to + rows.length) % rows.length;
    flushSync();
    const el = list.querySelector(`[data-i="${sel}"]`);
    if (sel === 0) list.scrollTop = 0;
    else if (el.previousElementSibling?.hasAttribute("aria-hidden")) el.previousElementSibling.scrollIntoView({ block: "nearest" });
    el.scrollIntoView({ block: "nearest" });
  }

  function key(e) {
    if (e.isComposing) return;
    const ctrl = e.ctrlKey && !e.metaKey && !e.altKey;
    if (e.key === "ArrowDown" || (ctrl && e.key === "n")) { e.preventDefault(); move(sel + 1); }
    else if (e.key === "ArrowUp" || (ctrl && e.key === "p")) { e.preventDefault(); move(sel - 1); }
    else if (e.key === "PageDown") { e.preventDefault(); move(Math.min(sel + 6, rows.length - 1)); }
    else if (e.key === "PageUp") { e.preventDefault(); move(Math.max(sel - 6, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); run(sel, e.metaKey || e.ctrlKey); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") e.preventDefault();
  }

  // A list scrolling under a still pointer fires pointer events too; only real movement picks a row.
  function hover(e, i) {
    if (e.pointerType !== "mouse") return;
    const at = e.clientX + ":" + e.clientY;
    if (at === pointer || i === sel) { pointer = at; return; }
    pointer = at; snap = false; sel = i;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay palette" id="palette" hidden onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="sheet palette-sheet" role="dialog" aria-modal="true" aria-label="Command palette" tabindex="-1" onmousedown={(e) => { if (e.target !== input) e.preventDefault(); }}>
    <div class="pal-head">
      <svg class="pal-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>
      <input type="text" id="palInput" name="pl-palette" role="combobox" aria-expanded="true" aria-controls="palList" aria-autocomplete="list" aria-activedescendant={cur ? "palOpt-" + sel : undefined}
        aria-label="Search actions and tasks" placeholder="Search actions and tasks…" maxlength="120" enterkeyhint="go"
        autocomplete="off" autocapitalize="off" spellcheck="false" data-bwignore="true" data-1p-ignore="true" data-lpignore="true" data-form-type="other"
        bind:this={input} bind:value={() => query, (v) => { query = v; sel = 0; snap = true; if (list) list.scrollTop = 0; }} onkeydown={key}>
      <button class="pal-close" type="button" aria-label="Close" onclick={close}><kbd>esc</kbd><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <div class="pal-list" id="palList" role="listbox" aria-label="Actions and tasks" bind:this={list}>
      <i class="pal-hl" class:snap class:on={hl.on} style:translate="0 {hl.y}px" style:height="{hl.h}px" aria-hidden="true"></i>
      {#each view as s (s.title)}
        <div class="pal-group" role="group" aria-label={s.title}>
          <div class="pal-group-head" aria-hidden="true">{s.title}</div>
          {#each s.rows as r (r.item.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="pal-row" role="option" tabindex="-1" id="palOpt-{r.i}" data-i={r.i} aria-selected={String(r.i === sel)} onpointermove={(e) => hover(e, r.i)} onclick={(e) => run(r.i, e.metaKey || e.ctrlKey)}>
              <span class="pal-ic">{@html r.item.icon || ""}</span>
              <span class="pal-text"><span class="pal-title">{#each segments(r.item.title, r.hits) as g}{#if g.hit}<mark>{g.text}</mark>{:else}{g.text}{/if}{/each}</span>{#if r.item.hint}<span class="pal-hint">{r.item.hint}</span>{/if}</span>
              {#if r.item.on}<svg class="pal-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-label="Current"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>{/if}
              {#if r.item.keys}<span class="pal-keys" aria-label="Shortcut {r.item.keys.join(' ')}">{#each r.item.keys as k}<kbd>{k}</kbd>{/each}</span>{/if}
            </div>
          {/each}
        </div>
      {/each}
      {#if !rows.length}<p class="pal-empty"><strong>No matches for “{query.trim()}”</strong><span>Try an action, a task title or a label.</span></p>{/if}
    </div>
    <div class="pal-foot" aria-hidden="true">
      <span><kbd>↑</kbd><kbd>↓</kbd> Move</span>
      <span class="pal-acts">{#if cur?.alt}<span>{cur.alt} <kbd>{api.MOD}</kbd><kbd>↵</kbd></span>{/if}{#if cur}<span class="pal-go">{cur.verb || "Run"} <kbd>↵</kbd></span>{/if}</span>
    </div>
    <p class="vh" aria-live="polite">{query.trim() ? (rows.length ? rows.length + (rows.length === 1 ? " result" : " results") : "No results") : ""}</p>
  </div>
</div>
