<script>
  import { list } from "../lib/redraw.svelte";
  import { cyclesOf, labelHue, projectOf, timeOf } from "../lib/tasks";

  let { api } = $props();

  const t = $derived.by(() => {
    list.version;
    return (api.S.activeId && api.viewTasks().get(api.S.activeId)) || null;
  });
  const note = $derived(t ? cyclesOf(t) + " of " + api.plural(t.est || 0, "planned cycle") + " done · " + api.fmtDur(timeOf(t)) + " focus so far" : "");
</script>

<p class="now-task" id="nowTask" title={note || null}>
  {#if t}
    {#if projectOf(t)}<i class="label-dot" style:--h={labelHue(projectOf(t))}></i>{/if}<span>{t.title}</span><em>{cyclesOf(t)}/{t.est || 0}</em>
  {:else}
    <span class="none">Nothing planned for today</span>
  {/if}
</p>
