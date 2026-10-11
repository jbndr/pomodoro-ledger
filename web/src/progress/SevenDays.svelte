<script>
  import { addDays, MIN, sod } from "../lib/dates";
  import { breaksTaken, dayItems } from "../lib/day";
  import { usualHours } from "../lib/patterns";
  import { matchesLabel } from "../lib/tasks";

  let { api, tasks, today, filter, selected, onpick } = $props();
  let width = $state(0);

  const HOUR = 60 * MIN, LW = 64, TW = 56, GAP = 12;
  const c = $derived.by(() => {
    const days = [...Array(7)].map((_, i) => {
      const day = addDays(today, i - 6), items = dayItems(tasks.values(), api.S.settings.breakLog, day);
      const focus = items.reduce((n, x) => n + (x.kind === "focus" ? x.ms : 0), 0);
      return { day, items, focus, isToday: day === today, from: items[0]?.from, to: items.at(-1)?.to };
    });
    const used = days.filter((d) => d.items.length);
    if (!used.length) return null;
    const lo = Math.min(...used.map((d) => d.from - d.day)), hi = Math.max(...used.map((d) => d.to - d.day));
    const a = Math.floor(lo / HOUR) * HOUR, b = Math.max(a + 4 * HOUR, Math.ceil(hi / HOUR) * HOUR);
    const RW = Math.max(120, (width || 600) - LW - TW - 2 * GAP), x = (t) => ((t - a) / (b - a)) * RW;
    const every = RW / ((b - a) / HOUR) >= 34 ? 1 : 2, hours = [];
    for (let h = a; h <= b; h += every * HOUR) hours.push(h);
    const usual = usualHours(used.map((d) => ({ from: d.from, to: d.to, done: !d.isToday })));
    return { days, RW, x, hours, usual };
  });

  const at = (offset) => api.fmtClock(sod(today) + Math.round(offset / (5 * MIN)) * 5 * MIN);
  const label = (d) => (d.isToday ? "Today" : api.fmtDate(d.day, { weekday: "short" }) + " " + new Date(d.day).getDate());
  const tip = (d) => {
    if (!d.items.length) return "<b>" + label(d) + "</b><br>No focus";
    const { due, taken } = breaksTaken(d.items);
    return "<b>" + label(d) + "</b><br>" + api.fmtDur(d.focus) + " focus · " + api.fmtClock(d.from) + "–" + (d.isToday ? "now" : api.fmtClock(d.to)) + (due ? "<br>" + taken + " of " + due + " breaks taken" : "");
  };
  const lane = (x) => (x.kind === "focus" ? "f" : x.long ? "l" : "s");
</script>

<figure class="chart-card seven" id="sevenDays">
  <h3>The last seven days</h3>
  {#if c?.usual}<p class="answer">{"You usually start around " + at(c.usual.start) + (c.usual.end != null && c.usual.end - c.usual.start >= 30 * MIN ? " and stop around " + at(c.usual.end) : "") + "."}</p>
  {:else}<p class="sub">{c ? "A few more days and this shows when you usually start and stop." : "No focus in the last seven days."}</p>{/if}
  {#if c}
    <div class="sd" bind:clientWidth={width} style:--lw="{LW}px" style:--tw="{TW}px">
      <div class="sd-axis" aria-hidden="true"><span></span><div>{#each c.hours as h (h)}<span style:left="{c.x(h)}px">{new Date(sod(today) + h).getHours()}</span>{/each}</div></div>
      {#each c.days as d (d.day)}
        <button class="sd-row" class:today={d.isToday} type="button" aria-pressed={String(selected === d.day)} aria-label="Show {label(d)} in Your day" data-tip={tip(d)} onclick={() => onpick(d.day)}>
          <span class="sd-day">{label(d)}</span>
          <svg width={c.RW} height="14" viewBox="0 0 {c.RW} 14" aria-hidden="true">
            {#if d.items.length}<line class="sd-base" x1={c.x(d.from - d.day)} x2={c.x(d.to - d.day)} y1="7" y2="7" />{/if}
            {#each d.items as it, i (i)}
              {@const k = lane(it)}
              <rect class="sd-b {k}" class:off={k === "f" && !!filter && !matchesLabel(it.label, filter)} style:--i={i} x={c.x(it.from - d.day)} y={k === "f" ? 1 : 4} width={Math.max(1.5, c.x(it.to - d.day) - c.x(it.from - d.day) - 0.6)} height={k === "f" ? 12 : 6} rx={k === "f" ? 2.5 : 2} />
            {/each}
          </svg>
          <b class:none={!d.focus}>{d.focus ? api.fmtDur(d.focus) : "–"}</b>
        </button>
      {/each}
    </div>
    <div class="sd-legend" aria-hidden="true"><span><i class="f"></i>Focus</span><span><i class="s"></i>Short break</span><span><i class="l"></i>Long break</span></div>
  {/if}
</figure>
