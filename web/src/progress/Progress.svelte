<script>
  import { addDays, sod } from "../lib/dates";
  import { progress } from "../lib/redraw.svelte";
  import { dayLabels, dayTotals } from "../lib/stats";
  import { focusTasks, matchLabel, progressLabelNames } from "../lib/tasks";
  import Bars from "./Bars.svelte";
  import BestTime from "./BestTime.svelte";
  import DayCard from "./DayCard.svelte";
  import Finished from "./Finished.svelte";
  import Habits from "./Habits.svelte";
  import Heat from "./Heat.svelte";
  import Journal from "./Journal.svelte";
  import LabelMenu from "./LabelMenu.svelte";
  import TodayLine from "./TodayLine.svelte";
  import WeekGoals from "./WeekGoals.svelte";
  import WhereTime from "./WhereTime.svelte";

  let { api } = $props();
  let filter = $state(""), picked = $state(0), dir = $state(1);

  const m = $derived.by(() => {
    progress.version;
    const all = api.viewTasks(), names = progressLabelNames(all), now = Date.now(), today = sod(now);
    const f = !names.length || (filter.startsWith("project:") && !names.includes(filter.slice(8))) ? "" : filter;
    const vt = focusTasks(all, f), days = dayTotals(vt);
    return {
      all, names, f, now, today, vt, days,
      ledger: f ? new Map([...all].filter(([, t]) => matchLabel(t, f))) : all,
      split: f ? new Map() : dayLabels(vt),
      goals: api.weekGoals(all),
    };
  });

  // The day shown in Your day: any day the calendar can show, today unless another was picked; a pick from before midnight falls back to today.
  const first = $derived(addDays(m.today, -7 * 53));
  const day = $derived(picked >= first && picked <= m.today ? picked : m.today);
  function pick(t) {
    if (t < first || t > m.today || t === day) return;
    dir = t > day ? 1 : -1;
    picked = t;
  }
</script>

<section class="progress" aria-labelledby="progH">
  <div class="sec-head">
    <h2 id="progH">Insights</h2>
    <button class="btn small recap-btn" type="button" id="openPlan" onclick={() => api.openPlan()}>Plan the week</button>
    <button class="btn small recap-btn" type="button" id="openRecap" onclick={() => api.openRecap()}>Weekly recap</button>
  </div>
  <div class="ins-head">
    <TodayLine {api} tasks={m.vt} days={m.days} today={m.today} now={m.now} />
    {#if m.names.length}<LabelMenu {api} all={m.all} names={m.names} filter={m.f} onpick={(v) => (filter = v)} />{/if}
  </div>
  <DayCard {api} tasks={m.all} {day} {dir} {first} today={m.today} filter={m.f} onpick={pick} />
  {#if m.goals}<WeekGoals {api} week={m.goals} today={m.today} />{/if}
  <div class="charts">
    <figure class="chart-card" id="perDay">
      <h3>Focus per day</h3>
      <div class="sub">Last 14 days, in minutes. Dashed line is your daily goal.</div>
      <Bars {api} days={m.days} today={m.today} split={m.split} goalMin={api.S.settings.goal * api.S.settings.focus} selected={day} onpick={pick} />
    </figure>
    <Heat {api} days={m.days} today={m.today} split={m.split} selected={day} onpick={pick} />
  </div>
  <BestTime {api} tasks={m.vt} today={m.today} />
  <Finished {api} tasks={m.ledger} />
  <WhereTime {api} tasks={m.all} today={m.today} filter={m.f} />
  <Habits {api} tasks={m.all} today={m.today} />
  <!-- A new filter starts the journal from its first days again. -->
  {#key m.f}<Journal {api} tasks={m.all} filter={m.f} />{/key}
</section>
