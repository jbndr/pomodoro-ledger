<script>
  import { addDays } from "../lib/dates";
  import { dayGaps, dayItems, daySummary, runStart } from "../lib/day";
  import { progress } from "../lib/redraw.svelte";
  import { projectOf } from "../lib/tasks";
  import { timerView } from "../timer/state.svelte";
  import Stages from "./Stages.svelte";

  let { api, tasks, day, dir, first, today, filter, onpick } = $props();
  let now = $state(Date.now());

  $effect(() => {
    const t = setInterval(() => { now = Date.now(); }, 30_000);
    return () => clearInterval(t);
  });

  /** What's running right now, so today's chart reaches the present. */
  function live(at) {
    const T = api.T, out = [];
    if (T.status === "idle") return out;
    if (T.mode === "focus") {
      const done = T.up ? at - T.up : Math.max(0, (T.total || 0) - api.remNow());
      const t = api.S.activeId && api.S.tasks.get(api.S.activeId);
      out.push({ kind: "focus", from: T.up || runStart(T.run, at, done), to: at, ms: done, title: t ? t.title : "Unplanned focus", label: t ? projectOf(t) : "", full: false, over: T.upKind === "over", flow: T.upKind === "flow", live: true });
    } else if (T.breakFrom && T.status === "running") out.push({ kind: "break", from: T.breakFrom, to: at, long: T.mode === "long", ...(T.nudge?.done ? { nudge: T.nudge.text } : {}), live: true });
    return out;
  }

  const v = $derived.by(() => {
    progress.version; timerView.version;
    const isToday = day === today, items = dayItems(tasks.values(), api.S.settings.breakLog, day, isToday ? live(now) : []);
    return { items, gaps: dayGaps(items), sum: daySummary(items), isToday };
  });
  const name = $derived(day === addDays(today, -1) ? "Yesterday" : api.fmtDate(day, { weekday: "short", day: "numeric", month: "short" }));

  function keys(e) {
    if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.target.closest("input, textarea, [role=listbox]") || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    onpick(addDays(day, e.key === "ArrowRight" ? 1 : -1));
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="chart-card day-card" id="dayCard" aria-label="Your day" onkeydown={keys}>
  <Stages {api} {day} {name} {dir} {now} {filter} items={v.items} gaps={v.gaps} sum={v.sum} isToday={v.isToday}
    canPrev={day > first} canNext={day < today} onstep={(d) => onpick(addDays(day, d))} />
</section>
