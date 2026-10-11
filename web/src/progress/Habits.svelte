<script>
  import { addDays, MIN } from "../lib/dates";
  import { timerHabits } from "../lib/patterns";

  let { api, tasks, today } = $props();

  // Past these, the oldest marks drop off; the numbers above them still count everything.
  const DOTS = 48, PIES = 24, LINES = 6;
  const days = $derived([...Array(7)].map((_, i) => addDays(today, i - 6)));
  const h = $derived(timerHabits(tasks, api.S.settings.breakLog, days));
  const focus = $derived(api.S.settings.focus * MIN);
  const any = $derived(h.breaks.length || h.overN || h.stopped.length || h.flows.length);
  const taken = $derived(h.breaks.filter(Boolean).length);
  const overMs = $derived(h.over.reduce((a, b) => a + b, 0));
  const overTop = $derived(Math.max(1, ...h.over));
  const flowMs = $derived(h.flows.reduce((a, s) => a + s.ms, 0));
  const flowTop = $derived(Math.max(2 * focus, ...h.flows.map((s) => s.ms)));

  /** Splits "1h 5m" so the units can be set smaller. */
  const parts = (ms) => api.fmtDur(ms).split(" ").map((p) => [p.slice(0, -1), p.slice(-1)]);
  const dayName = (i) => (i === 6 ? "Today" : api.fmtDate(days[i], { weekday: "short", day: "numeric" }));
</script>

{#snippet dur(ms)}{#each parts(ms) as [n, unit], i (i)}{i ? " " : ""}{n}<small>{unit}</small>{/each}{/snippet}

{#if any}
  <figure class="chart-card habits" id="habits">
    <div class="sec-head"><h3>Timer habits</h3><span class="sub">Last seven days</span></div>
    <div class="ht-grid">
      <div class="ht">
        <span class="ht-k">Breaks</span>
        <span class="ht-v">{#if h.breaks.length}{taken}<small>/{h.breaks.length}</small>{:else}–{/if}</span>
        <span class="ht-viz" aria-hidden="true">{#each h.breaks.slice(-DOTS) as b, i (i)}<i class="ht-dot" class:no={!b} style:--i={i}></i>{/each}</span>
        <span class="ht-s">{!h.breaks.length ? "No breaks due yet" : taken < h.breaks.length ? api.plural(h.breaks.length - taken, "break") + " skipped or started late" : "None skipped"}</span>
      </div>
      <div class="ht">
        <span class="ht-k">Past the bell</span>
        <span class="ht-v">{#if h.overN}+{@render dur(overMs)}{:else}0{/if}</span>
        <span class="ht-viz"><span class="hb-bars">{#each h.over as v, i (i)}<i class:z={!v} style:height={v ? Math.max(14, (v / overTop) * 100) + "%" : null} style:--i={i} data-tip={"<b>" + dayName(i) + "</b><br>" + (v ? api.fmtDur(v) + " past the bell" : "Stopped at the bell")}></i>{/each}</span></span>
        <span class="ht-s">{h.overN ? api.plural(h.overN, "time") + ", about " + api.fmtDur(overMs / h.overN) + " each" : "Every cycle stopped at the bell"}</span>
      </div>
      <div class="ht">
        <span class="ht-k">Stopped early</span>
        <span class="ht-v">{h.stopped.length}</span>
        <span class="ht-viz">{#each h.stopped.slice(-PIES) as s, i (i)}<i class="ht-pie" style:--p={Math.min(1, s.ms / focus)} style:--i={i} data-tip={"<b>" + api.esc(s.title) + "</b><br>Stopped after " + api.fmtDur(s.ms) + " of " + api.fmtDur(focus)}></i>{/each}</span>
        <span class="ht-s">{h.stopped.length ? "Filled to where you stopped. Mostly " + (h.earlyTop || "without a label") : "Every cycle ran to the bell"}</span>
      </div>
      <div class="ht">
        <span class="ht-k">Flow</span>
        <span class="ht-v">{#if h.flows.length}{@render dur(flowMs / h.flows.length)}{:else}0{/if}</span>
        <span class="ht-viz">
          {#if h.flows.length}
            <span class="ht-flow">
              {#each h.flows.slice(-LINES) as s, i (i)}<i style:width={(s.ms / flowTop) * 100 + "%"} style:--i={i} data-tip={"<b>" + api.esc(s.title) + "</b><br>Flow · " + api.fmtDur(s.ms)}></i>{/each}
              <span class="ht-mark" style:left={(focus / flowTop) * 100 + "%"}><b>{api.S.settings.focus}m</b></span>
            </span>
          {/if}
        </span>
        <span class="ht-s">{h.flows.length ? "Average of " + api.plural(h.flows.length, "flow session") : "No flow sessions"}</span>
      </div>
    </div>
  </figure>
{/if}
