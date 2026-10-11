<script>
  import { addDays } from "../lib/dates";
  import { timerHabits } from "../lib/patterns";

  let { api, tasks, today } = $props();

  const days = $derived([...Array(7)].map((_, i) => addDays(today, i - 6)));
  const h = $derived(timerHabits(tasks, api.S.settings.breakLog, days));
  const any = $derived(h.due || h.overN || h.flowN || h.early.some(Boolean) || h.over.some(Boolean));
  const earlyN = $derived(h.early.reduce((a, b) => a + b, 0));
  const skipped = $derived(h.due - h.taken);

  const dayName = (i) => (i === 6 ? "Today" : api.fmtDate(days[i], { weekday: "short", day: "numeric" }));
  const rows = $derived([
    { key: "over", n: h.overN, text: "Kept going past the bell " + api.plural(h.overN, "time"), sub: api.fmtDur(h.over.reduce((a, b) => a + b, 0)) + " on top of the cycles", none: "Every cycle stopped at the bell.", bars: bars(h.over, api.fmtDur) },
    { key: "early", n: earlyN, text: "Stopped " + api.plural(earlyN, "cycle") + " early", sub: h.earlyTop ? "Mostly " + h.earlyTop : "Mostly without a label", none: "No cycles stopped early.", bars: bars(h.early, (n) => api.plural(n, "cycle")) },
    { key: "flow", n: h.flowN, text: api.plural(h.flowN, "flow session"), sub: h.flowN ? api.fmtDur(h.flow.reduce((a, b) => a + b, 0) / h.flowN) + " on average" : "", none: "No flow sessions.", bars: bars(h.flow, api.fmtDur) },
  ]);
  function bars(v, fmt) {
    const max = Math.max(1, ...v);
    return v.map((n, i) => ({ h: n ? Math.max(14, (n / max) * 100) : 0, tip: "<b>" + dayName(i) + "</b><br>" + (n ? fmt(n) : "None") }));
  }
</script>

{#if any}
  <div class="chart-card habits" id="habits">
    <div class="sec-head"><h3>Timer habits</h3><span class="sub">Last seven days</span></div>
    <ul class="hb">
      <li>
        <p>{#if h.due}Took {h.taken} of {api.plural(h.due, "break")}<span>{skipped ? (skipped === 1 ? "One was skipped." : skipped + " were skipped or started late.") : "None skipped."}</span>{:else}No breaks due yet.{/if}</p>
        {#if h.due}<div class="meter good" role="img" aria-label="{h.taken} of {h.due} breaks taken"><b style:width={(h.taken / h.due) * 100 + "%"}></b></div>{/if}
      </li>
      {#each rows as r (r.key)}
        <li>
          <p>{#if r.n}{r.text}<span>{r.sub}</span>{:else}{r.none}{/if}</p>
          {#if r.n}<span class="hb-bars">{#each r.bars as b, i (i)}<i class:z={!b.h} style:height={b.h ? b.h + "%" : null} style:--i={i} data-tip={b.tip}></i>{/each}</span>{/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}
