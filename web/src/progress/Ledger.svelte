<script>
  import { spanDays } from "../lib/stats";
  import { cyclesOf, labelHue, projectOf, timeOf } from "../lib/tasks";

  let { api, tasks } = $props();
  let showAll = $state(false);

  const COLS = ["Task", "Planned", "Took", "Focus time", "Finished", "Span", "Actions"];
  const fin = $derived([...tasks.values()].filter((t) => t.done && !t.system).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)));
  const rows = $derived((showAll ? fin : fin.slice(0, 8)).map((t) => {
    const c = cyclesOf(t), project = projectOf(t), subs = Array.isArray(t.subtasks) ? t.subtasks : [];
    return { t, c, d: c - (t.est || 0), project, subs, subsDone: subs.filter((s) => s.done).length };
  }));
</script>

<div class="ledger" id="ledger">
  <div class="sec-head"><h3>Finished tasks</h3><span class="sub">Planned cycles against what it actually took</span></div>
  <div class="table-wrap">
    <table id="doneTable">
      {#if fin.length}
        <thead><tr><th>Task</th><th class="num">Planned</th><th class="num">Took</th><th class="num">Focus time</th><th>Finished</th><th>Span</th><th class="num"><span hidden>Actions</span></th></tr></thead>
        <tbody>
          {#each rows as r (r.t.id)}
            <tr>
              <td class="t" data-label={COLS[0]}>{r.t.title} {#if r.project}<span class="meta-chip" title={"Label: " + r.project}><i class="label-dot" style:--h={labelHue(r.project)}></i><span>{r.project}</span></span>{/if}{#if r.subs.length}<details class="subtask-archive"><summary>Subtasks · {r.subsDone}/{r.subs.length} done</summary><ul>{#each r.subs as s (s.id)}<li>{s.done ? "✓ " : "○ "}{s.title}</li>{/each}</ul></details>{/if}{#if r.t.sample} <span class="chip">Example</span>{/if}</td>
              <td class="num" data-label={COLS[1]}>{r.t.est || "–"}</td>
              <td class="num" data-label={COLS[2]}>{r.c}{#if r.t.est}<span class="delta {r.d > 0 ? 'over' : 'on'}">{r.d > 0 ? "+" + r.d : r.d === 0 ? "on plan" : r.d}</span>{/if}</td>
              <td class="num" data-label={COLS[3]}>{api.fmtDur(timeOf(r.t))}</td>
              <td class="mono" data-label={COLS[4]}>{r.t.doneAt ? api.fmtDate(r.t.doneAt) : "–"}</td>
              <td class="mono" data-label={COLS[5]}>{api.plural(spanDays(r.t), "day")}</td>
              <td class="num" data-label={COLS[6]}><button class="icon-btn" type="button" data-reopen={r.t.id} aria-label={"Move “" + r.t.title + "” back to open tasks"} title="Reopen" onclick={() => api.reopen(r.t.id)}>{@html api.ICON.undo}</button></td>
            </tr>
          {/each}
        </tbody>
      {/if}
    </table>
  </div>
  <div id="doneFoot">
    {#if !fin.length}
      <div class="empty"><strong>Nothing finished yet</strong><span>Tick a task when it’s done. It moves here with its planned cycles, actual cycles and total focus time.</span></div>
    {:else if fin.length > 8}
      <button class="link" type="button" id="toggleAll" onclick={() => (showAll = !showAll)}>{showAll ? "Show recent only" : "Show all " + fin.length + " finished tasks"}</button>
    {/if}
  </div>
</div>
