<script>
  import { roll } from "../lib/roll";
  import { addDays, dayKey, MIN } from "../lib/dates";
  import { weekStart } from "../lib/insights";
  import { streaks } from "../lib/stats";

  let { api, tasks, days, today, now } = $props();

  const SEGMENTS = 12;
  const t = $derived(days.get(dayKey(today)) || { ms: 0, cycles: 0 });
  const goal = $derived(api.S.settings.goal);
  const streak = $derived(streaks(days, today).current);
  // This week so far, against last week up to the same moment.
  const week = $derived.by(() => {
    const ws = weekStart(today), back = now - (today - addDays(today, -7));
    let ms = 0, before = 0;
    for (const t of tasks.values()) for (const s of t.sessions || []) {
      if (s.at >= ws && s.at <= now) ms += s.ms || 0;
      else if (s.at >= addDays(ws, -7) && s.at <= back) before += s.ms || 0;
    }
    return { ms, before, d: ms - before };
  });

  /** Splits "2h 5m" so the units can be set smaller. */
  const parts = (ms) => api.fmtDur(ms).split(" ").map((p) => [p.slice(0, -1), p.slice(-1)]);
</script>

<div class="today-line" id="todayLine">
  <div class="tl-row">
    <span class="tl-v" {@attach roll}>{#each parts(t.ms) as [n, unit], i (i)}{i ? " " : ""}{n}<small>{unit}</small>{/each}</span>
    <div class="tl-cycles" data-tip="Every finished focus block counts as one cycle. Stopped sessions over a minute still count toward focus time.">
      {#if goal <= SEGMENTS}
        <span class="tl-segs" role="img" aria-label="{t.cycles} of {goal} cycles">{#each { length: goal } as _, i (i)}<i class:on={i < t.cycles} style:--i={i}></i>{/each}</span>
      {:else}
        <div class="meter" role="img" aria-label="{t.cycles} of {goal} cycles"><b style:width={Math.min(100, (t.cycles / goal) * 100) + "%"}></b></div>
      {/if}
      <span>{t.cycles} of {goal} cycles today{t.cycles >= goal ? " · goal reached" : ""}</span>
    </div>
  </div>
  <p class="tl-line">
    {#if !week.ms}Nothing logged this week yet.
    {:else}This week <b>{api.fmtDur(week.ms)}</b>{#if !week.before}.{:else if Math.abs(week.d) < 10 * MIN}, about the same as last week by now.{:else}, <span class:up={week.d > 0}>{api.fmtDur(Math.abs(week.d))} {week.d > 0 ? "more" : "less"}</span> than last week by now.{/if}{/if}
    {#if streak > 1}<b>{streak} days</b> in a row.{/if}
  </p>
</div>
