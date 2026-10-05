<script>
  import { list } from "../lib/redraw.svelte";
  import { labelFilter } from "./filter.svelte";

  let { api } = $props();

  const VIEWS = [["today", "Today"], ["upcoming", "Upcoming"], ["later", "Later"]];
  const h = $derived.by(() => { list.version; return api.listHead(); });
  const count = $derived(h.open ? api.plural(h.open, "open task") + (h.done ? " · " + h.done + " finished" : "") : h.done ? h.done + " finished" : "");

  function pick(view) {
    if (view === api.S.taskView) return;
    api.S.taskView = view; api.ss.set("pl.taskView", view);
    api.renderTasks();
  }
</script>

<span class="sub" id="taskCount" hidden>{count}</span>
<div class="task-views" id="taskViews" role="group" aria-label="Which tasks to show">
  {#each VIEWS as [view, name] (view)}<button type="button" data-view={view} aria-pressed={String(h.view === view)} onclick={() => pick(view)}>{name}<em>{h.byView[view] || ""}</em></button>{/each}
</div>
{#if h.labeled}<button class="filter-btn" class:on={!!h.filter} type="button" id="filterBtn" aria-expanded={String(labelFilter.open)} aria-controls="projectFilter" onclick={() => (labelFilter.open = !labelFilter.open)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>{h.filter ? h.chips.find((c) => c.v === h.filter)?.name || "Filter" : "Filter"}</button>{/if}
