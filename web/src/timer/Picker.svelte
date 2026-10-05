<script>
  import { flushSync, untrack } from "svelte";
  import { list } from "../lib/redraw.svelte";
  import { cyclesOf, timeOf } from "../lib/tasks";
  import { pickOptions } from "../lib/timer";

  let { api } = $props();

  let open = $state(false), idx = $state(0), menu;

  const p = $derived.by(() => {
    list.version;
    const vt = api.viewTasks(), act = (api.S.activeId && vt.get(api.S.activeId)) || null;
    return { ...pickOptions(api.openOf(vt), act), act };
  });
  const note = $derived(p.act ? cyclesOf(p.act) + " of " + api.plural(p.act.est || 0, "planned cycle") + " done · " + api.fmtDur(timeOf(p.act)) + " focus so far" : "Pick a task so its cycles and time are tracked.");

  $effect(() => {
    const n = p.opts.length;
    untrack(() => { if (open) move(Math.min(idx, n - 1)); });
  });

  function move(i) {
    idx = i;
    const li = menu.children[i];
    if (!li) return;
    if (li.offsetTop < menu.scrollTop) menu.scrollTop = li.offsetTop - 5;
    else if (li.offsetTop + li.offsetHeight > menu.scrollTop + menu.clientHeight) menu.scrollTop = li.offsetTop + li.offsetHeight - menu.clientHeight + 5;
  }
  function show() {
    open = true;
    flushSync();
    move(Math.max(0, p.opts.findIndex((o) => o.id === (api.S.activeId || ""))));
  }
  function choose(i) {
    const o = p.opts[i];
    open = false;
    if (o) api.setActive(o.id);
  }
  function keydown(e) {
    const k = e.key, last = p.opts.length - 1;
    if (!open) { if (k === "ArrowDown" || k === "ArrowUp" || k === " ") { e.preventDefault(); show(); } return; }
    e.stopPropagation();
    if (k === "Tab") { open = false; return; }
    if (k === "Escape") open = false;
    else if (k === "ArrowDown") move(Math.min(last, idx + 1));
    else if (k === "ArrowUp") move(Math.max(0, idx - 1));
    else if (k === "Home") move(0);
    else if (k === "End") move(last);
    else if (k === "Enter" || k === " ") choose(idx);
    else return;
    e.preventDefault();
  }
  function hover(e) {
    const li = e.target.closest("li");
    if (li && +li.dataset.i !== idx) move(+li.dataset.i);
  }
  function click(e) {
    const li = e.target.closest("li");
    if (li) choose(+li.dataset.i);
  }
</script>

<svelte:document onpointerdown={(e) => { if (open && !e.target.closest("#pick")) open = false; }} />

<div class="working">
  <span id="pickLabel" class="vh">Working on</span>
  <div class="pick" id="pick">
    <!-- svelte-ignore a11y_role_supports_aria_props_implicit -->
    <button class="pick-btn" type="button" id="taskPick" aria-haspopup="listbox" aria-expanded={String(open)} aria-labelledby="pickLabel pickValue" aria-activedescendant={open ? "pick-" + idx : null} onclick={() => (open ? (open = false) : show())} onkeydown={keydown} onkeyup={(e) => { if (e.key === " ") e.preventDefault(); }}><span id="pickValue">{p.opts[p.cur].id ? p.opts[p.cur].title : "Pick a task"}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10l4-4 4 4M8 14l4 4 4-4"/></svg></button>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <ul class="pick-menu" id="pickMenu" role="listbox" aria-labelledby="pickLabel" hidden={!open} bind:this={menu} onmousedown={(e) => e.preventDefault()} onpointermove={hover} onclick={click}>
      {#each p.opts as o, i (o.id)}<li role="option" id={"pick-" + i} data-i={i} aria-selected={String(i === p.cur)} class:act={open && i === idx}><span>{o.title}</span>{#if o.meta}<em>{o.meta}</em>{/if}{@html api.ICON.check}</li>{/each}
    </ul>
  </div>
  <small id="workingNote">{note}</small>
</div>
