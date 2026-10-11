<script>
  import { SvelteSet } from "svelte/reactivity";
  import { addDays, MIN, sod } from "../lib/dates";
  import { journal } from "../lib/patterns";
  import { labelHue } from "../lib/tasks";

  let { api, tasks, filter } = $props();
  let count = $state(4), hl = $state(""), confirming = $state(""), width = $state(0), timer = 0;
  const open = new SvelteSet();

  const HOUR = 60 * MIN, KIND = { cycle: "Cycle", flow: "Flow", over: "Past the bell", early: "Stopped early" };
  const days = $derived(journal(tasks, filter));
  const shown = $derived(days.slice(0, count));
  const c = $derived.by(() => {
    if (!shown.length) return null;
    const today = sod(Date.now());
    const lo = Math.min(...shown.map((d) => d.from - d.day)), hi = Math.max(...shown.map((d) => d.to - d.day));
    const a = Math.floor(lo / HOUR) * HOUR, b = Math.max(a + 4 * HOUR, Math.ceil(hi / HOUR) * HOUR), SW = Math.max(200, width || 600);
    const x = (t) => Math.max(0, Math.min(SW, ((t - a) / (b - a)) * SW));
    const every = SW / ((b - a) / HOUR) >= 34 ? 1 : 2, hours = [];
    for (let h = a; h <= b; h += every * HOUR) hours.push(h);
    return { SW, x, hours, today };
  });

  const dayName = (day) => (day === c.today ? "Today" : day === addDays(c.today, -1) ? "Yesterday" : api.fmtDate(day, { weekday: "short", day: "numeric", month: "short" }));
  const fill = (label) => (label ? `oklch(.68 .15 ${labelHue(label)})` : "var(--faint)");
  const segTip = (t, s) => "<b>" + api.esc(t.title) + "</b><br>" + (s.label ? api.esc(s.label) + " · " : "") + api.fmtClock(s.from) + "–" + api.fmtClock(s.to) + " · " + api.fmtDur(s.ms) + " · " + KIND[s.kind];
  const toggle = (k) => (open.has(k) ? open.delete(k) : open.add(k));

  function del(key) {
    if (api.guardPreview()) return;
    clearTimeout(timer);
    if (confirming === key) { confirming = ""; api.deleteSession(key); return; }
    confirming = key;
    timer = setTimeout(() => { confirming = ""; }, 3000);
  }
  function label(e, s) {
    if (api.guardPreview()) return;
    const el = e.currentTarget;
    api.openLabelPop("session:" + s.key, () => (el.isConnected ? el : null), s.label, (name) => api.labelSession(s.key, name));
  }
  function move(e, s, t) {
    if (!api.popHidden()) { api.closePop(); return; }
    if (api.guardPreview()) return;
    api.openPop(e.currentTarget, api.moveItems(), t.system ? "" : t.id, (id) => api.moveSession(s.key, id));
  }
</script>

<div class="chart-card journal" id="journal">
  <h3>Journal</h3>
  <p class="sub">What each day went to. Open a task to label, move or delete a session.</p>
  {#if c}
    <div class="jn" bind:clientWidth={width}>
      <div class="jn-axis" aria-hidden="true">{#each c.hours as h (h)}<span style:left="{c.x(h)}px">{Math.round(h / HOUR) % 24}</span>{/each}</div>
      {#each shown as d (d.day)}
        <section class="jn-day" class:hl-on={hl.startsWith(d.day + "|")}>
          <div class="jn-head"><b>{dayName(d.day)}</b><span>{api.fmtDur(d.ms)}</span></div>
          <svg class="jn-strip" width={c.SW} height="12" viewBox="0 0 {c.SW} 12" aria-hidden="true">
            <line class="jn-base" x1={c.x(d.from - d.day)} x2={c.x(d.to - d.day)} y1="6" y2="6" />
            {#each d.tasks as t (t.id)}
              {#each t.sessions as s (s.key)}
                <rect class="jn-seg" class:hl={hl === d.day + "|" + t.id} x={c.x(s.from - d.day)} y="0" width={Math.max(1.5, c.x(s.to - d.day) - c.x(s.from - d.day) - 1)} height="12" rx="2" style:fill={fill(s.label)} data-tip={segTip(t, s)} />
              {/each}
            {/each}
          </svg>
          <ul>
            {#each d.tasks as t (t.id)}
              {@const k = d.day + "|" + t.id}
              <li class="jn-task" class:open={open.has(k)} onpointerenter={() => (hl = k)} onpointerleave={() => (hl = "")}>
                <button class="jn-row" type="button" aria-expanded={String(open.has(k))} onclick={() => toggle(k)}>
                  <span class="jn-t"><i class="label-dot" class:none={!t.label} style:--h={t.label ? labelHue(t.label) : null}></i><span>{t.title}</span></span>
                  <span class="jn-bar" aria-hidden="true"><i style:width="{(t.ms / d.tasks[0].ms) * 100}%"></i></span>
                  <b>{api.fmtDur(t.ms)}</b>
                  <svg class="jn-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                <div class="jn-ses" inert={!open.has(k)}><div>
                  {#each t.sessions as s (s.key)}
                    <div class="jn-s">
                      <span class="jn-time">{api.fmtClock(s.from)}–{api.fmtClock(s.to)}<em>{KIND[s.kind]}</em></span>
                      <span class="jn-len">{api.fmtDur(s.ms)}</span>
                      <span class="jn-acts">
                        <button class="meta-chip session-label" class:none={!s.label} type="button" aria-haspopup="listbox" aria-label={s.label ? "Session label: " + s.label + ". Change label" : "Add a label to this session"} title="Change label for this session" onclick={(e) => label(e, s)}>{#if s.label}<i class="label-dot" style:--h={labelHue(s.label)}></i>{:else}{@html api.ICON.tag}{/if}<span>{s.label || "Label"}</span></button>
                        <button class="icon-btn" type="button" data-move aria-haspopup="listbox" aria-label="Move this session to another task" title="Move to another task" onclick={(e) => move(e, s, t)}>{@html api.ICON.move}</button>
                        <button class="icon-btn" class:danger={confirming === s.key} type="button" data-sdel aria-label={confirming === s.key ? null : "Delete this session"} title={confirming === s.key ? null : "Delete"} onclick={() => del(s.key)}>{#if confirming === s.key}Delete?{:else}{@html api.ICON.trash}{/if}</button>
                      </span>
                    </div>
                  {/each}
                </div></div>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
    {#if days.length > count}<button class="link" type="button" id="journalMore" onclick={() => (count += 7)}>Earlier days</button>{/if}
  {:else}
    <div class="empty"><strong>No sessions yet</strong><span>Every focus block you run shows up here by day, so you can label it, move it to another task or delete it.</span></div>
  {/if}
</div>
