<script>
  import { picked } from "./selection.svelte";
  import TaskCard from "./TaskCard.svelte";

  let { api, row, plan, lifted = false, drag = null } = $props();
  const start = $derived(plan && plan.get(row.id));
  const selected = $derived(picked.ids.includes(row.id));
</script>

<li
  class="task"
  class:is-active={row.active}
  class:open={row.open}
  class:completing={row.completing}
  class:dropped={row.dropped}
  class:dragging={!!drag}
  class:sec-lifted={lifted}
  class:selected
  style:top={drag ? drag.top + "px" : null}
  style:left={drag ? drag.left + "px" : null}
  style:width={drag ? drag.width + "px" : null}
  data-move={drag && drag.move ? drag.move : null}
  data-id={row.id}
  tabindex="0"
  aria-expanded={String(row.open)}
  aria-label={row.title}
>
  <button class="grip" type="button" tabindex="-1" disabled={row.locked} aria-label={"Reorder “" + row.title + "”: drag, or press the up and down arrow keys"} title={row.locked ? "Show all tasks to reorder" : "Drag to reorder"}>{@html api.ICON.grip}</button>
  <button class="check" type="button" data-act="done" aria-label={"Mark “" + row.title + "” as finished"} title="Mark finished" onclick={() => api.complete(row.id)}>{@html api.ICON.check}</button>
  <div class="task-main" data-act="open" onclick={() => api.open(row.id)} role="presentation">
    <div class="task-title"><span class="tt">{row.title}</span></div>
    <div class="task-meta">{#if row.when}<span class="when-chip">{row.when}</span>{/if}{#if row.project}<span class="meta-chip" title={"Label: " + row.project}><i class="label-dot" style:--h={row.hue}></i><span>{row.project}</span></span>{/if}{#if row.goal}<span class="goal-mark" class:reached={row.goal.hit} title={"Weekly objective" + (row.goal.name ? ": " + row.goal.name : "") + " · " + row.goal.cycles + " of " + api.plural(row.goal.target, "cycle")}>{@html api.ICON.target}<span class="vh">Weekly objective</span>{row.goal.cycles}/{row.goal.target}</span>{/if}{#if row.subs}<span class={row.subs.done === row.subs.n ? "done-all" : ""}>{@html api.ICON.list}{row.subs.done}/{row.subs.n}</span>{/if}{#if row.notes}<span title="Has notes">{@html api.ICON.note}</span>{/if}{#if row.repeat}<span class="repeat" class:paused={row.repeat.paused} title={row.repeat.title}>{@html row.repeat.paused ? api.ICON.pause : api.ICON.repeat}{row.repeat.short}</span>{/if}{#if row.carry}<span class="carry">{row.carry}</span>{/if}</div>
  </div>
  <div class="task-side">
    <div class="side-info">
      {#if row.today}<span class="late-flag" hidden={!start?.late} title={start?.late ? "Won't finish before " + api.fmtClock(plan.endAt) + " · " + start.text : ""}>{@html api.ICON.clock}</span>{/if}
      <span class="cyc" title={row.cycTitle}>{#if row.pips.mini != null}<span class="mini" aria-hidden="true"><b style:width={row.pips.mini + "%"}></b></span>{:else}<span class="pips" aria-hidden="true">{#each row.pips.dots as dot, i (i)}<i class={dot}></i>{/each}</span>{/if}</span>
    </div>
    <div class="side-acts">
      {#if row.today}<span class="task-start" class:late={!!start?.late} title={start ? start.hint : ""}>{start ? start.text : ""}</span>{/if}
      <button class="icon-btn" type="button" data-act="top" aria-label={"Move “" + row.title + "” to the top"} title="Move to top" onclick={() => api.toTop([row.id])}>{@html api.ICON.top}</button>
      <button class="icon-btn" type="button" data-act="sched" data-sched aria-haspopup="dialog" aria-label={"When: “" + row.title + "”"} title="When? (D)" onclick={(e) => api.sched(e.currentTarget, row.id)}>{@html api.ICON.cal}</button>
      <button class="icon-btn play" type="button" data-act="focus" aria-label={"Start focusing on “" + row.title + "”"} title="Focus on this" onclick={() => api.focus(row.id)}>{@html api.ICON.play}</button>
    </div>
  </div>
  {#if row.card}<TaskCard {api} {row} card={row.card} {start} />{/if}
</li>
