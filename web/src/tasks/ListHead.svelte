<script>
  import { composer } from "../composer/state.svelte";
  import { list } from "../lib/redraw.svelte";

  let { api } = $props();
  let chipsEl;

  const h = $derived.by(() => { list.version; return api.listHead(); });
  // Redrawn with each new start-time plan, which comes with every list change.
  const fit = $derived.by(() => {
    const plan = list.plan;
    if (!plan) return { shown: false, over: false, ids: [], text: "", move: "Move to tomorrow" };
    const ids = plan.over ? plan.rest : plan.late, shown = api.S.taskView === "today" && ids.length > 0 && !api.preview();
    if (!shown) return { shown, over: plan.over, ids, text: "", move: "Move to tomorrow" };
    return {
      shown, over: plan.over, ids,
      text: plan.over ? "Your workday ended at " + api.fmtClock(plan.endAt) + ". Done for today?" : api.plural(ids.length, "task") + " won't fit before " + api.fmtClock(plan.endAt) + ".",
      move: plan.over ? "Move the rest to tomorrow" : "Move to tomorrow",
    };
  });

  const left = $derived.by(() => { list.version; return api.leftoverPrompt(); });

  function pick(v) {
    api.S.projectFilter = v;
    if (!(document.getElementById("newTitle")?.value ?? "").trim()) { api.S.newLabel = api.filterLabel(); composer.refresh(); }
    api.renderTasks();
    chipsEl.querySelector('[aria-pressed="true"]')?.focus();
  }

  function moveFit() {
    if (api.guardPreview()) return;
    api.moveToTomorrow(fit.ids);
  }
</script>

<div class="label-filter" id="projectFilter" role="group" aria-label="Filter tasks by label" hidden={!h.labeled} bind:this={chipsEl}>
  {#each h.chips as c (c.v)}<button type="button" data-filter={c.v} aria-pressed={String(h.filter === c.v)} onclick={() => pick(c.v)}>{#if c.hue != null}<i class="label-dot" style:--h={c.hue}></i>{/if}<span>{c.name}</span><em>{c.n}</em></button>{/each}
</div>
<div class="day-fit" class:over={fit.over} id="dayFit" role="status" hidden={!fit.shown} data-ids={fit.shown ? fit.ids.join(",") : null}><span id="dayFitText">{fit.text}</span><button class="btn small" type="button" id="dayFitMove" onclick={moveFit}>{fit.move}</button></div>
<div class="day-fit leftover" id="leftovers" role="status" hidden={!left}><span>{left?.text}</span><button class="btn small" type="button" id="leftoversMove" onclick={api.moveAsked}>Move to today</button><button class="btn small" type="button" id="leftoversLeave" onclick={api.leaveAsked}>Leave</button></div>
<div class="sub" id="projectSummary" hidden={!h.filter}>{api.plural(h.open, "open task")} · {api.plural(h.done, "finished task")} · {api.fmtDur(h.focus)} focus logged</div>
