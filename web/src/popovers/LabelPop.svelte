<script>
  import { flushSync } from "svelte";
  import { labelOptions, sameLabel } from "../lib/labels";
  import { labelHue } from "../lib/tasks";
  import { LP, labelPop } from "./state.svelte";

  let { api } = $props();
  let el, search, ul;
  let opts = $state.raw([]), idx = $state(-1), text = $state(""), manage = $state(false), hash = $state(false), value = $state("");
  let left = $state(0), top = $state(0), bottom = $state(null);
  let query = "", find = null, cb = null, skip = "";

  export const anchor = () => (find ? find() : null);

  function move(i) {
    idx = i;
    flushSync();
    const li = ul.children[i];
    if (!li || i < 0) return;
    const at = li.offsetTop - ul.offsetTop;
    if (at < ul.scrollTop) ul.scrollTop = at;
    else if (at + li.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = at + li.offsetHeight - ul.clientHeight;
  }

  function render() {
    const r = labelOptions(api.S.labels, { query, value, hash: LP.key === "hash", manage });
    opts = r.opts;
    move(r.idx);
  }

  export function place() {
    const a = anchor();
    if (!a) return;
    const r = a.getBoundingClientRect(), bar = a.closest(".bulk-bar")?.getBoundingClientRect();
    const view = document.documentElement.clientHeight, below = view - r.bottom, above = r.top;
    left = Math.max(12, Math.min(r.left, document.documentElement.clientWidth - el.offsetWidth - 12)) + scrollX;
    // Near the bottom of the screen (the bulk bar) it opens upward, held by its bottom edge so filtering keeps it attached.
    if (below < 340 && above > below) { bottom = view - (bar ? bar.top : r.top) - scrollY + 8; top = null; }
    else { top = r.bottom + 6 + scrollY; bottom = null; }
    flushSync();
  }

  /** Opens under `find()` for `key`, with `value` checked; `pick` gets the chosen name, "" for none. Opening it again for the same key closes it. */
  export function open(key, f, v, pick) {
    const toggled = skip === key;
    skip = "";
    close(toggled);
    if (toggled) return;
    LP.key = key; find = f; cb = pick; value = v || ""; query = text = search.value = ""; manage = false; hash = key === "hash";
    labelPop.hidden = false;
    flushSync();
    if (!hash) f().setAttribute("aria-expanded", "true");
    place(); render();
    if (!hash) search.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
  }

  export function close(refocus) {
    if (labelPop.hidden) return;
    const a = anchor();
    labelPop.hidden = true;
    find = cb = null;
    flushSync();
    if (!a) return;
    if (LP.key !== "hash") a.setAttribute("aria-expanded", "false");
    if (refocus) a.focus();
  }

  /** Filters by `q` without touching the search field, for "#" typed in a title. Returns how many rows it lists. */
  export function filter(q) {
    query = q;
    render();
    return opts.length;
  }

  export function refresh() { if (!labelPop.hidden) render(); }

  function choose(i) {
    const o = opts[i], pick = cb;
    if (!o || manage) return;
    close(true);
    pick(o.clear ? "" : o.name);
  }

  /** Arrow keys, Enter and Escape, from the search field or a title that is typing "#". */
  export function key(e) {
    const k = e.key, last = opts.length - 1;
    if (k === "Escape") close(true);
    else if (manage) return;
    else if (k === "ArrowDown") move(idx >= last ? 0 : idx + 1);
    else if (k === "ArrowUp") move(idx <= 0 ? last : idx - 1);
    else if (k === "Enter" && idx >= 0) choose(idx);
    else return;
    e.preventDefault(); e.stopPropagation();
  }

  function click(e) {
    const hide = e.target.closest("[data-label-archive]"), li = e.target.closest("li[data-i]");
    if (hide) {
      const label = api.S.labels.find((l) => l.name === hide.dataset.labelArchive);
      if (!label) return;
      label.archived = !label.archived; label.updatedAt = Date.now();
      api.saveSettings(); render(); api.renderTasks();
    } else if (e.target.id === "labelManage") {
      manage = !manage; query = text = search.value = "";
      render(); search.focus();
    } else if (li) choose(+li.dataset.i);
  }

  function keydown(e) {
    const inSearch = e.target === search;
    if (e.key === "Tab" && (inSearch ? e.shiftKey : !e.shiftKey && e.target.id === "labelManage")) { e.preventDefault(); close(true); }
    else if (inSearch || e.key === "Escape") key(e);
  }

  function outside(e) {
    skip = "";
    if (labelPop.hidden || el.contains(e.target)) return;
    const a = anchor();
    if (a && a.contains(e.target) && LP.key !== "hash") skip = LP.key;
    else if (!a || !a.contains(e.target)) close();
  }

  const optKey = (o) => (o.create ? "+" : o.clear ? "-" : "=") + o.name;
</script>

<svelte:window onresize={place} />
<svelte:document onpointerdown={outside} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="label-pop"
  id="labelPop"
  hidden={labelPop.hidden}
  style:left={left + "px"}
  style:top={top == null ? "auto" : top + "px"}
  style:bottom={bottom == null ? null : bottom + "px"}
  bind:this={el}
  onmousedown={(e) => { if (e.target !== search) e.preventDefault(); }}
  onpointermove={(e) => { const li = e.target.closest("li[data-i]"); if (li && +li.dataset.i !== idx) move(+li.dataset.i); }}
  onclick={click}
  onkeydown={keydown}
>
  <input type="text" id="labelSearch" maxlength="80" placeholder="Find or create a label" role="combobox" aria-expanded="true" aria-controls="labelOpts" aria-autocomplete="list" aria-label="Find or create a label" autocomplete="off" spellcheck="false" hidden={hash} aria-activedescendant={!manage && idx >= 0 && idx < opts.length ? "label-opt-" + idx : null} bind:this={search} bind:value={() => text, (v) => { query = text = v; render(); }} />
  <ul id="labelOpts" role={manage ? "list" : "listbox"} aria-label="Labels" bind:this={ul}>
    {#if !opts.length}
      <li class="plain empty-note">{manage ? "No labels yet." : "No labels yet. Type a name to create your first one."}</li>
    {:else if manage}
      {#each opts as o (o.name)}
        <li class={"plain" + (o.archived ? " off" : "")}><i class="label-dot" style:--h={labelHue(o.name)}></i><span>{o.name}</span><button class="btn small" type="button" data-label-archive={o.name}>{o.archived ? "Restore" : "Hide"}</button></li>
      {/each}
    {:else}
      {#each opts as o, i (optKey(o))}
        {@const sel = !o.create && !o.clear && sameLabel(o.name, value)}
        <li role="option" id={"label-opt-" + i} data-i={i} aria-selected={String(sel)} class:act={i === idx}>{#if o.create}<b>+</b><span>Create “{o.name}”</span>{:else if o.clear}<i class="label-dot none"></i><span>No label</span>{:else}<i class="label-dot" style:--h={labelHue(o.name)}></i><span>{o.name}</span>{/if}{#if sel}{@html api.ICON.check}{/if}</li>
      {/each}
    {/if}
  </ul>
  <div class="label-pop-foot" id="labelPopFoot" hidden={hash}><span id="labelPopHint">{manage ? "Hidden labels aren’t suggested" : LP.key.startsWith("session:") ? "Applies only to this session" : "Or type # in a new task"}</span><button class="link" type="button" id="labelManage">{manage ? "Done" : "Manage"}</button></div>
</div>
