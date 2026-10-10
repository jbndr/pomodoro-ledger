<script>
  import { roll } from "../lib/roll";
  import { addDays, dayKey, sod } from "../lib/dates";
  import { progress } from "../lib/redraw.svelte";
  import { dayLabels, dayTotals, estimateAccuracy, streaks, sumDays } from "../lib/stats";
  import { focusTasks, labelHue, matchLabel, progressLabelNames, timeOf } from "../lib/tasks";
  import Bars from "./Bars.svelte";
  import BestTime from "./BestTime.svelte";
  import ByLabel from "./ByLabel.svelte";
  import DayCard from "./DayCard.svelte";
  import Heat from "./Heat.svelte";
  import Ledger from "./Ledger.svelte";
  import Sessions from "./Sessions.svelte";
  import WeekGoals from "./WeekGoals.svelte";

  let { api } = $props();
  let filter = $state(""), allChips = $state(false), picked = $state(0), dir = $state(1);
  const TOP = 5;

  const m = $derived.by(() => {
    progress.version;
    const all = api.viewTasks(), names = progressLabelNames(all), now = Date.now(), today = sod(now);
    const f = !names.length || (filter.startsWith("project:") && !names.includes(filter.slice(8))) ? "" : filter;
    const vt = focusTasks(all, f), days = dayTotals(vt);
    const focusFor = (v) => [...focusTasks(all, v).values()].reduce((a, t) => a + timeOf(t), 0);
    // The five labels with the most focus stay in view, plus the picked one; the rest wait behind "+N more".
    const named = names.filter((n) => f === "project:" + n || !api.labelHidden(n)).map((n) => ({ v: "project:" + n, name: n, hue: labelHue(n), ms: focusFor("project:" + n) })).sort((a, b) => b.ms - a.ms);
    const shown = allChips ? named : named.filter((c, i) => i < TOP || c.v === f);
    const chips = [{ v: "", name: "All", ms: focusFor("") }, ...shown, { v: "none", name: "No label", ms: focusFor("none") }];
    const more = named.length - shown.length;
    const ledger = f ? new Map([...all].filter(([, t]) => matchLabel(t, f))) : all;
    const week = sumDays(days, today, 7), before = sumDays(days, addDays(today, -7), 7);
    return {
      all, names, f, today, vt, days, chips, more, ledger,
      split: f ? new Map() : dayLabels(vt),
      todayTotal: days.get(dayKey(now)) || { ms: 0, cycles: 0 },
      goal: api.S.settings.goal,
      week, before,
      streak: streaks(days, today),
      estimates: estimateAccuracy(ledger.values()),
      goals: api.weekGoals(all),
    };
  });

  // The day shown in Your day: one of the last 14, today unless another was picked; a pick from before midnight falls back to today.
  const first = $derived(addDays(m.today, -13));
  const day = $derived(picked >= first && picked <= m.today ? picked : m.today);
  function pick(t) {
    if (t < first || t > m.today || t === day) return;
    dir = t > day ? 1 : -1;
    picked = t;
  }

  const estLine = $derived(Math.abs(m.estimates.diff) < 5 ? "Close to plan" : Math.abs(m.estimates.diff) + "% " + (m.estimates.diff > 0 ? "more" : "fewer") + " cycles than planned");

  /** Splits "2h 5m" so the units can be set smaller. */
  const parts = (ms) => api.fmtDur(ms).split(" ").map((p) => [p.slice(0, -1), p.slice(-1)]);

</script>

{#snippet dur(ms)}{#each parts(ms) as [n, unit], i (i)}{i ? " " : ""}{n}<small>{unit}</small>{/each}{/snippet}

<section class="progress" aria-labelledby="progH">
  <div class="sec-head">
    <h2 id="progH">Insights</h2>
    <button class="btn small recap-btn" type="button" id="openPlan" onclick={() => api.openPlan()}>Plan the week</button>
    <button class="btn small recap-btn" type="button" id="openRecap" onclick={() => api.openRecap()}>Weekly recap</button>
    <span class="sub">Every finished focus block counts as one cycle. Stopped sessions over a minute still count toward focus time.</span>
  </div>
  <div class="label-filter" id="statsFilter" role="group" aria-label="Show progress for one label" hidden={!m.names.length}>
    {#each m.chips as c (c.v)}
      <button type="button" data-filter={c.v} aria-pressed={String(m.f === c.v)} onclick={() => (filter = c.v)}>{#if c.hue != null}<i class="label-dot" style:--h={c.hue}></i>{/if}<span>{c.name}</span><em>{api.fmtDur(c.ms)}</em></button>
    {/each}
    {#if m.more || allChips}<button type="button" class="chips-more" aria-expanded={String(allChips)} onclick={() => (allChips = !allChips)}><span>{allChips ? "Fewer" : "+" + m.more + " more"}</span></button>{/if}
  </div>
  <div class="tiles" id="tiles">
    <div class="tile">
      <div class="k">Focus today</div>
      <div class="v" {@attach roll}>{@render dur(m.todayTotal.ms)}</div>
      <div class="s"><div class="meter" role="img" aria-label={m.todayTotal.cycles + " of " + m.goal + " cycles"}><b style:width={Math.min(100, (m.todayTotal.cycles / m.goal) * 100) + "%"}></b></div><span>{m.todayTotal.cycles} of {m.goal} cycles{m.todayTotal.cycles >= m.goal ? " · goal reached" : ""}</span></div>
    </div>
    <div class="tile">
      <div class="k">Focus · 7 days</div>
      <div class="v" {@attach roll}>{@render dur(m.week)}</div>
      <div class="s">{#if m.before || m.week}<span class={m.week >= m.before ? "up" : "down"}>{m.week >= m.before ? "+" : "−"}{api.fmtDur(Math.abs(m.week - m.before))}</span> vs the 7 days before{:else}No focus logged yet{/if}</div>
    </div>
    <div class="tile">
      <div class="k">Streak</div>
      <div class="v" {@attach roll}>{m.streak.current}<small>{m.streak.current === 1 ? "day" : "days"}</small></div>
      <div class="s">{m.streak.current ? "Best run: " + api.plural(m.streak.best, "day") : "Finish a cycle today to start one"}</div>
    </div>
    <div class="tile">
      <div class="k">Estimates</div>
      <div class="v" {@attach roll}>{#if m.estimates.ratio == null}–{:else}{m.estimates.ratio.toFixed(2)}<small>×</small>{/if}</div>
      <div class="s" data-tip={m.estimates.ratio == null ? null : estLine + " · " + api.plural(m.estimates.count, "finished task")}>{#if m.estimates.ratio == null}Finish a task to compare{:else}{estLine} · {api.plural(m.estimates.count, "task")}{/if}</div>
    </div>
  </div>
  <DayCard {api} tasks={m.all} {day} {dir} {first} today={m.today} filter={m.f} onpick={pick} />
  {#if m.goals}<WeekGoals {api} week={m.goals} today={m.today} />{/if}
  <div class="charts">
    <figure class="chart-card">
      <h3>Focus per day</h3>
      <div class="sub">Last 14 days, in minutes. Dashed line is your daily goal.</div>
      <Bars {api} days={m.days} today={m.today} split={m.split} goalMin={m.goal * api.S.settings.focus} selected={day} onpick={pick} />
    </figure>
    <figure class="chart-card">
      <h3>Focus calendar</h3>
      <div class="sub" id="heatSub">Last 20 weeks</div>
      <Heat {api} days={m.days} today={m.today} split={m.split} />
      <div class="legend" aria-hidden="true"><span>Less</span><i style="background:var(--heat0)"></i><i style="background:var(--heat1)"></i><i style="background:var(--heat2)"></i><i style="background:var(--heat3)"></i><i style="background:var(--heat4)"></i><span>More</span></div>
    </figure>
  </div>
  <BestTime {api} tasks={m.vt} today={m.today} />
  <ByLabel {api} tasks={m.all} today={m.today} />
  <!-- A new filter starts both lists from their first page again. -->
  {#key m.f}
    <Sessions {api} tasks={m.all} filter={m.f} />
    <Ledger {api} tasks={m.ledger} />
  {/key}
</section>
