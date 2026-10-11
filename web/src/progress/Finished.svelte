<script>
  import { learnPace, tookOf } from "../lib/pace";
  import { ratioWords } from "../lib/patterns";
  import { spanDays } from "../lib/stats";
  import { labelHue, projectOf, timeOf } from "../lib/tasks";
  import EstDots from "./EstDots.svelte";

  let { api, tasks } = $props();
  let showAll = $state(false), width = $state(0);

  const RECENT = 8;
  const fin = $derived([...tasks.values()].filter((t) => t.done && !t.system).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)));
  const took = (t) => Math.round(tookOf(t, api.dur("focus")));
  const pace = $derived(learnPace(fin, api.dur("focus")).all);
  const timed = $derived(fin.filter((t) => t.est && tookOf(t, api.dur("focus")) > 0));
  const over = $derived(timed.filter((t) => took(t) > t.est).length);
  const rows = $derived((showAll ? fin : fin.slice(0, RECENT)).map((t) => ({ t, took: took(t), est: t.est || 0, label: projectOf(t) })));
  const cap = $derived(width && width < 480 ? 10 : 16);

  const delta = (r) => (!r.est ? "–" : r.took > r.est ? "+" + (r.took - r.est) : r.took === r.est ? "on plan" : "−" + (r.est - r.took));
  function tip(r) {
    const subs = Array.isArray(r.t.subtasks) ? r.t.subtasks : [];
    return "<b>" + api.esc(r.t.title) + "</b><br>" + (r.est ? "Planned " + r.est + " · took " + api.plural(r.took, "cycle") : "No estimate · " + api.plural(r.took, "cycle"))
      + "<br>" + api.fmtDur(timeOf(r.t)) + " focus · " + api.plural(spanDays(r.t), "day")
      + (subs.length ? "<br>Subtasks " + subs.filter((s) => s.done).length + "/" + subs.length + " done" : "")
      + (r.t.doneAt ? "<br>Finished " + api.fmtDate(r.t.doneAt, { weekday: "short", day: "numeric", month: "short" }) : "");
  }
</script>

<div class="chart-card finished" id="ledger" bind:clientWidth={width}>
  <h3>How long things take</h3>
  {#if pace}
    <p class="answer">Lately, tasks take {ratioWords(pace.ratio)}.</p>
    <p class="sub">{over} of {api.plural(timed.length, "finished task")} ran past the plan.</p>
  {:else if fin.length}
    <p class="sub">Finish a few tasks that have an estimate to see how long things really take you.</p>
  {/if}
  {#if fin.length}
    <div class="est-legend" aria-hidden="true"><span><i></i>Took, within plan</span><span><i class="u"></i>Plan not needed</span><span><i class="x"></i>Past the plan</span></div>
    <ul class="est-list">
      {#each rows as r (r.t.id)}
        <li data-tip={tip(r)}>
          <span class="est-t"><i class="label-dot" class:none={!r.label} style:--h={r.label ? labelHue(r.label) : null}></i><span>{r.t.title}</span>{#if r.t.sample}<span class="chip">Example</span>{/if}</span>
          <EstDots took={r.took} est={r.est} {cap} />
          <span class="est-d" class:over={r.est && r.took > r.est}>{delta(r)}</span>
          <button class="icon-btn" type="button" data-reopen={r.t.id} aria-label={"Move “" + r.t.title + "” back to open tasks"} title="Reopen" onclick={() => api.reopen(r.t.id)}>{@html api.ICON.undo}</button>
        </li>
      {/each}
    </ul>
    {#if fin.length > RECENT}<button class="link" type="button" id="toggleAll" onclick={() => (showAll = !showAll)}>{showAll ? "Show recent only" : "Show all " + fin.length + " finished tasks"}</button>{/if}
  {:else}
    <div class="empty"><strong>Nothing finished yet</strong><span>Tick a task when it’s done. It shows up here with the cycles you planned and the cycles it took.</span></div>
  {/if}
</div>
