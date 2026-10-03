<script>
  import { flushSync } from "svelte";
  import { pop } from "./state.svelte";

  let { api } = $props();
  let ul, items = $state.raw([]), cur = $state(""), idx = $state(0), left = $state(0), top = $state(0);
  let cb = null, anchor = null;

  function move(i) {
    idx = i;
    flushSync();
    ul.children[i]?.scrollIntoView({ block: "nearest" });
  }

  /** A menu of `items` ({ id, title, key? }) under `anchor`; `pick` gets the chosen id. */
  export function open(a, list, current, pick) {
    items = list; cur = current; cb = pick; anchor = a;
    pop.hidden = false;
    flushSync();
    const r = a.getBoundingClientRect(), h = ul.offsetHeight, w = ul.offsetWidth;
    left = Math.max(12, Math.min(r.left, innerWidth - w - 12));
    top = r.bottom + 6 + h > innerHeight - 8 && r.top - 6 - h > 8 ? r.top - 6 - h : r.bottom + 6;
    move(Math.max(0, list.findIndex((o) => o.id === current)));
    ul.focus({ preventScroll: true });
  }

  export function close(refocus) {
    if (pop.hidden) return;
    pop.hidden = true; cb = null;
    flushSync();
    if (refocus && anchor && anchor.isConnected) anchor.focus();
  }

  function choose(i) {
    const pick = cb, o = items[i];
    close(true);
    if (pick && o) pick(o.id);
  }

  function keydown(e) {
    const k = e.key, last = items.length - 1;
    e.stopPropagation();
    if (k === "Tab") { close(); return; }
    if (k === "Escape") close(true);
    else if (k === "ArrowDown") move(Math.min(last, idx + 1));
    else if (k === "ArrowUp") move(Math.max(0, idx - 1));
    else if (k === "Home") move(0);
    else if (k === "End") move(last);
    else if (k === "Enter" || k === " ") choose(idx);
    else if (k.length === 1 && items.some((o) => o.key === k.toUpperCase())) choose(items.findIndex((o) => o.key === k.toUpperCase()));
    else return;
    e.preventDefault();
  }
  const at = (e) => e.target.closest("li");
</script>

<svelte:window onscrollcapture={(e) => { if (e.target !== ul) close(); }} onresize={() => close()} />
<svelte:document onpointerdown={(e) => { if (!pop.hidden && !e.target.closest("#pop, [data-move]")) close(); }} />

<ul
  class="pick-menu pop"
  id="pop"
  role="listbox"
  tabindex="-1"
  hidden={pop.hidden}
  style:left={left + "px"}
  style:top={top + "px"}
  bind:this={ul}
  onclick={(e) => { const li = at(e); if (li) choose(+li.dataset.i); }}
  onpointermove={(e) => { const li = at(e); if (li && +li.dataset.i !== idx) move(+li.dataset.i); }}
  onkeydown={keydown}
>
  {#each items as o, i (i)}
    <li role="option" data-i={i} aria-selected={String(o.id === cur)} aria-keyshortcuts={o.key || null} class:act={i === idx}><span>{o.title}</span>{#if o.key}<kbd>{o.key}</kbd>{/if}{@html api.ICON.check}</li>
  {/each}
</ul>
