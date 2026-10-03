<script>
  import { addDays, dayKey } from "../lib/dates";
  import { heatLevel } from "../lib/stats";
  import { labelTip } from "./tips";

  let { api, days, today, split } = $props();

  const weeks = 20, cs = 13, gap = 3, ml = 30, mt = 18, W = ml + weeks * (cs + gap), H = mt + 7 * (cs + gap);
  const DAYS = ["Mon", "", "Wed", "", "Fri", "", ""];

  const c = $derived.by(() => {
    const monday = (new Date(today).getDay() + 6) % 7, start = addDays(today, -monday - (weeks - 1) * 7);
    const months = [], cells = [];
    let lastMonth = -1;
    for (let col = 0; col < weeks; col++) {
      const colStart = addDays(start, col * 7), month = new Date(colStart).getMonth();
      if (month !== lastMonth) {
        if (col < weeks - 1) months.push({ x: ml + col * (cs + gap), name: api.fmtDate(colStart, { month: "short" }) });
        lastMonth = month;
      }
      for (let row = 0; row < 7; row++) {
        const t = addDays(start, col * 7 + row);
        if (t > today) continue;
        const o = days.get(dayKey(t)) || { ms: 0, cycles: 0 }, min = o.ms / 60000;
        const tip = "<b>" + api.fmtDate(t, { weekday: "short", day: "numeric", month: "short" }) + "</b><br>" + (min ? api.fmtDur(o.ms) + " · " + api.plural(o.cycles, "cycle") + labelTip(api, split.get(dayKey(t))) : "No focus");
        cells.push({ key: col * 7 + row, x: ml + col * (cs + gap), y: mt + row * (cs + gap), level: heatLevel(min), today: t === today, tip });
      }
    }
    return { months, cells };
  });
</script>

<div class="chart heat" id="heat">
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="Focus calendar for the last 20 weeks">
    {#each c.months as mo (mo.x)}<text x={mo.x} y="11">{mo.name}</text>{/each}
    {#each c.cells as cell (cell.key)}
      <rect class="cell l{cell.level}" class:today={cell.today} data-tip={cell.tip} x={cell.x} y={cell.y} width={cs} height={cs} rx="3" />
    {/each}
    {#each DAYS as label, r (r)}{#if label}<text x="0" y={mt + r * (cs + gap) + 10}>{label}</text>{/if}{/each}
  </svg>
</div>
