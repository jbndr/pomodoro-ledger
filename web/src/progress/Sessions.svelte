<script>
  import { labelHue, matchesLabel, sessionProject } from "../lib/tasks";

  let { api, tasks, filter } = $props();
  let count = $state(8), confirming = $state(""), timer = 0;

  const COLS = ["When", "Task", "Length", "Type", "Actions"];
  const all = $derived.by(() => {
    const out = [];
    for (const t of tasks.values()) (t.sessions || []).forEach((s, i) => {
      const label = sessionProject(t, s);
      if (matchesLabel(label, filter)) out.push({ key: t.id + ":" + i, t, s, label });
    });
    return out.sort((a, b) => b.s.at - a.s.at);
  });

  function del(key) {
    if (api.guardPreview()) return;
    clearTimeout(timer);
    if (confirming === key) { confirming = ""; api.deleteSession(key); return; }
    confirming = key;
    timer = setTimeout(() => { confirming = ""; }, 3000);
  }
  function label(e, row) {
    if (api.guardPreview()) return;
    const el = e.currentTarget;
    api.openLabelPop("session:" + row.key, () => (el.isConnected ? el : null), row.label, (name) => api.labelSession(row.key, name));
  }
  function move(e, row) {
    if (!api.popHidden()) { api.closePop(); return; }
    if (api.guardPreview()) return;
    api.openPop(e.currentTarget, api.moveItems(), row.t.system ? "" : row.t.id, (id) => api.moveSession(row.key, id));
  }
</script>

<div class="ledger" id="sessions">
  <div class="sec-head"><h3>Session log</h3><span class="sub">Label a session, move it to another task, or delete one that shouldn't count</span></div>
  <div class="table-wrap">
    <table id="sesTable">
      {#if all.length}
        <thead><tr><th>When</th><th>Task</th><th class="num">Length</th><th>Type</th><th class="num"><span hidden>Actions</span></th></tr></thead>
        <tbody>
          {#each all.slice(0, count) as row (row.key)}
            <tr data-ses={row.key}>
              <td class="mono" data-label={COLS[0]}>{api.fmtDate(row.s.at, { weekday: "short", day: "numeric", month: "short" })} · {api.fmtClock(row.s.at)}</td>
              <td class="t" data-label={COLS[1]}><button class="move" type="button" data-move aria-haspopup="listbox" title="Move to another task" onclick={(e) => move(e, row)}><span>{row.t.title}</span>{@html api.ICON.chev}</button> <button class="meta-chip session-label" class:none={!row.label} type="button" data-session-label aria-haspopup="listbox" aria-expanded="false" aria-label={row.label ? "Session label: " + row.label + ". Change label" : "Add a label to this session"} title="Change label for this session" onclick={(e) => label(e, row)}>{#if row.label}<i class="label-dot" style:--h={labelHue(row.label)}></i>{:else}{@html api.ICON.tag}{/if}<span>{row.label || "Label"}</span></button></td>
              <td class="num" data-label={COLS[2]}>{api.fmtDur(row.s.ms)}</td>
              <td data-label={COLS[3]}><span class="chip">{row.s.full ? "Cycle" : "Partial"}</span></td>
              <td class="num" data-label={COLS[4]}><button class="icon-btn" class:danger={confirming === row.key} type="button" data-sdel aria-label={confirming === row.key ? null : "Delete this session"} title={confirming === row.key ? null : "Delete"} onclick={() => del(row.key)}>{#if confirming === row.key}Delete?{:else}{@html api.ICON.trash}{/if}</button></td>
            </tr>
          {/each}
        </tbody>
      {/if}
    </table>
  </div>
  <div id="sesFoot">
    {#if !all.length}
      <div class="empty"><strong>No sessions yet</strong><span>Every focus block you run is listed here, so you can move it to another task or delete it.</span></div>
    {:else if all.length > count}
      <button class="link" type="button" id="sesMore" onclick={() => (count += 20)}>Show {Math.min(20, all.length - count)} more</button>
    {/if}
  </div>
</div>
