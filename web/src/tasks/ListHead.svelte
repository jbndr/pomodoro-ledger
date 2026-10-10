<script>
  import { composer } from "../composer/state.svelte";
  import { list } from "../lib/redraw.svelte";
  import { labelFilter } from "./filter.svelte";

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
  // Waits its turn behind the other prompts.
  const offer = $derived.by(() => {
    const o = list.plan?.best?.offer;
    return o && !fit.shown && !left && api.S.taskView === "today" && !api.preview() ? o : null;
  });

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

<div class="filter-fold" class:open={labelFilter.open} hidden={!h.labeled}><div><div class="label-filter" id="projectFilter" role="group" aria-label="Filter tasks by label" bind:this={chipsEl}>
  {#each h.chips as c (c.v)}<button type="button" data-filter={c.v} aria-pressed={String(h.filter === c.v)} onclick={() => pick(c.v)}>{#if c.hue != null}<i class="label-dot" style:--h={c.hue}></i>{/if}<span>{c.name}</span><em>{c.n}</em></button>{/each}
</div></div></div>
<div class="day-fit" class:over={fit.over} id="dayFit" role="status" hidden={!fit.shown} data-ids={fit.shown ? fit.ids.join(",") : null}><span id="dayFitText">{fit.text}</span><button class="btn small" type="button" id="dayFitMove" onclick={moveFit}>{fit.move}</button></div>
<div class="day-fit leftover" id="leftovers" role="status" hidden={!left}><span>{left?.text}</span><span class="acts"><button class="btn small" type="button" id="leftoversMove" onclick={api.moveAsked}>Move to today</button><button class="btn small" type="button" id="leftoversLeave" onclick={api.leaveAsked}>Leave</button></span></div>
<div class="day-fit best" id="bestFit" role="status" hidden={!offer}>{#if offer}<span class="fit-body"><span>{#if offer.now}It's your best time, {list.plan.best.hours}. Do “<span class="best-task">{offer.title}</span>” next?{:else}You focus best {list.plan.best.hours}. Line up “<span class="best-task">{offer.title}</span>” for then?{/if}</span><span class="acts"><button class="btn small" type="button" id="bestMove" onclick={() => api.lineUp(offer)}>{offer.now ? "Move it up" : "Line it up"}</button><button class="btn small" type="button" id="bestSkip" onclick={api.notToday}>Not today</button></span></span>{/if}</div>
<div class="sub" id="projectSummary" hidden={!h.filter}>{api.plural(h.open, "open task")} · {api.plural(h.done, "finished task")} · {api.fmtDur(h.focus)} focus logged</div>
