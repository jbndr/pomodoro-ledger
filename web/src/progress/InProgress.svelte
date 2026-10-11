<script>
  import { labelPace } from "../lib/patterns";
  import { cyclesOf, labelHue, projectOf, timeOf } from "../lib/tasks";
  import EstDots from "./EstDots.svelte";

  let { api, tasks, all } = $props();
  let width = $state(0);

  const SHOW = 6;
  const rows = $derived([...tasks.values()]
    .filter((t) => !t.done && !t.system && t.est > 0 && (t.sessions || []).length)
    .map((t) => ({ t, took: cyclesOf(t), est: t.est, label: projectOf(t) }))
    .sort((a, b) => b.took / b.est - a.took / a.est || b.took - a.took)
    .slice(0, SHOW));
  const pace = $derived(labelPace(all.values()));
  const past = $derived(rows.filter((r) => r.took > r.est));
  const cap = $derived(width && width < 480 ? 10 : 16);

  /** What a task will really take at its label's pace, when that says more than it has taken already. */
  const needs = (r) => (pace.has(r.label) ? Math.max(r.took + 1, Math.round(r.est * pace.get(r.label))) : null);
  const tip = (r) => "<b>" + api.esc(r.t.title) + "</b><br>" + r.took + " of " + api.plural(r.est, "planned cycle") + " · " + api.fmtDur(timeOf(r.t)) + (needs(r) ? "<br>At your " + api.esc(r.label || "unlabeled") + " pace it needs about " + needs(r) : "");
  const hint = $derived(past.find((r) => needs(r)));
</script>

{#if rows.length}
  <div class="chart-card in-progress" id="inProgress" bind:clientWidth={width}>
    <h3>In progress</h3>
    <p class="answer">{api.plural(rows.length, "open task")} {rows.length === 1 ? "has" : "have"} focus logged. {past.length ? (past.length === 1 ? "One is" : past.length + " are") + " past the plan." : "All are within their plan."}</p>
    <ul class="est-list">
      {#each rows as r (r.t.id)}
        <li data-tip={tip(r)}>
          <span class="est-t"><i class="label-dot" class:none={!r.label} style:--h={r.label ? labelHue(r.label) : null}></i><span>{r.t.title}</span></span>
          <EstDots took={r.took} est={r.est} {cap} />
          <span class="est-d" class:over={r.took > r.est}>{r.took > r.est ? "+" + (r.took - r.est) : r.took + " of " + r.est}</span>
        </li>
      {/each}
    </ul>
    {#if hint}<p class="sub">At your {hint.label || "unlabeled"} pace, “{hint.t.title}” needs about {needs(hint)} cycles in all.</p>{/if}
  </div>
{/if}
