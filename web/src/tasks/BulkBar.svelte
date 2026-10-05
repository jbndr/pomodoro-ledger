<script>
  import { onMount } from "svelte";
  import { list } from "../lib/redraw.svelte";
  import { clearPicks, picked } from "./selection.svelte";

  let { api } = $props();
  let labelBtn, confirm = $state(false), confirmT = 0;

  // Only tasks still shown in the list count, so a task moved to another day or filtered away is never edited by mistake.
  const ids = $derived.by(() => { list.version; return picked.ids.filter((id) => { const t = api.S.tasks.get(id); return t && !t.done && api.shown(t); }); });
  const n = $derived(ids.length);
  $effect(() => { if (!n) confirm = false; });

  function del() {
    clearTimeout(confirmT);
    if (!confirm) { confirm = true; confirmT = setTimeout(() => (confirm = false), 3000); return; }
    confirm = false;
    api.deleteMany(ids);
    clearPicks();
  }

  // Escape clears the selection once any open picker has had its turn.
  onMount(() => {
    const esc = (e) => {
      if (e.key !== "Escape" || !picked.ids.length || e.defaultPrevented) return;
      if (document.querySelector("#whenPop:not([hidden]), #labelPop:not([hidden]), .overlay:not([hidden])")) return;
      clearPicks();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  });
</script>

<div class="bulk-bar" class:open={n > 0} role="toolbar" aria-label="Edit selected tasks" inert={!n}>
  <span class="bulk-count" aria-live="polite"><b>{n}</b> selected</span>
  <button type="button" bind:this={labelBtn} onclick={() => api.labelMany(ids, () => labelBtn)}>{@html api.ICON.tag}Label</button>
  <button type="button" data-sched onclick={(e) => api.schedMany(e.currentTarget, ids)}>{@html api.ICON.cal}Date</button>
  <button type="button" onclick={() => api.toTop(ids)}>{@html api.ICON.top}To top</button>
  <button type="button" onclick={() => { api.finishMany(ids); clearPicks(); }}>{@html api.ICON.check}Finish</button>
  <button type="button" class:danger={confirm} onclick={del}>{@html api.ICON.trash}{confirm ? "Delete " + n + "?" : "Delete"}</button>
  <button class="bulk-x" type="button" aria-label="Clear selection" title="Clear selection (Esc)" onclick={clearPicks}>{@html api.ICON.x}</button>
</div>
