<script>
  import { focusTasks, labelHue, timeOf } from "../lib/tasks";

  let { api, all, names, filter, onpick } = $props();

  const name = $derived(filter.startsWith("project:") ? filter.slice(8) : "");

  function open(e) {
    if (!api.popHidden()) { api.closePop(); return; }
    const focusFor = (v) => [...focusTasks(all, v).values()].reduce((a, t) => a + timeOf(t), 0);
    const meta = (v) => { const ms = focusFor(v); return ms ? api.fmtDur(ms) : ""; };
    const labels = names.filter((n) => filter === "project:" + n || !api.labelHidden(n))
      .map((n) => ({ id: "project:" + n, title: n, hue: labelHue(n), ms: focusFor("project:" + n) }))
      .sort((a, b) => b.ms - a.ms)
      .map(({ ms, ...o }) => ({ ...o, meta: ms ? api.fmtDur(ms) : "" }));
    api.openPop(e.currentTarget, [{ id: "", title: "All labels", meta: meta("") }, ...labels, { id: "none", title: "No label", none: true, meta: meta("none") }], filter, onpick);
  }
</script>

<span class="label-menu" id="statsFilter">
  <button class="btn small" type="button" data-move aria-haspopup="listbox" onclick={open}>
    {#if name}<i class="label-dot" style:--h={labelHue(name)}></i><span>{name}</span>{:else if filter === "none"}<i class="label-dot none"></i><span>No label</span>{:else}<span>All labels</span>{/if}
    {@html api.ICON.chev}
  </button>
  {#if filter}<button class="icon-btn" type="button" aria-label="Show all labels" title="Show all labels" onclick={() => onpick("")}>{@html api.ICON.x}</button>{/if}
</span>
