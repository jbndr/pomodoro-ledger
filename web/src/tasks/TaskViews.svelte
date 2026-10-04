<script>
  import { list } from "../lib/redraw.svelte";

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
<div class="seg task-views" id="taskViews" role="group" aria-label="Which tasks to show">
  {#each VIEWS as [view, name] (view)}<button type="button" data-view={view} aria-pressed={String(h.view === view)} onclick={() => pick(view)}>{name}<em>{h.byView[view] || ""}</em></button>{/each}
</div>
