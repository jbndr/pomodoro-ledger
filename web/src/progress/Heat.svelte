<script>
  import { addDays, dayKey } from "../lib/dates";
  import { heatLevel } from "../lib/stats";
  import { labelTip } from "./tips";

  let { api, days, today, split } = $props();
  let width = $state(0), height = $state(0);

  const gap = 3, ml = 30, mt = 18;
  // Cells grow until the seven rows fill the height, then as many weeks fit as the width allows, up to a year. Columns share what's left over.
  const cs = $derived(Math.max(13, Math.min(26, Math.floor(((height || 130) - mt + gap) / 7) - gap, Math.floor(((width || 400) - ml + gap) / 12) - gap)));
  const weeks = $derived(width ? Math.max(12, Math.min(53, Math.floor((width - ml + gap) / (cs + gap)))) : 20);
  const W = $derived(width || ml + weeks * (cs + gap));
  const step = $derived((W - ml + gap) / weeks);
  const H = $derived(mt + 7 * (cs + gap) - gap);
  const DAYS = ["Mon", "", "Wed", "", "Fri", "", ""];

  const c = $derived.by(() => {
    const monday = (new Date(today).getDay() + 6) % 7, start = addDays(today, -monday - (weeks - 1) * 7);
    const months = [], cells = [], rh = cs + gap;
    let lastMonth = -1;
    for (let col = 0; col < weeks; col++) {
      const colStart = addDays(start, col * 7), month = new Date(colStart).getMonth();
      if (month !== lastMonth) {
        // A month that starts in the last days of the first column would sit on top of the next one, so it's left out.
        if (col < weeks - 1) { if (months.length && col - months.at(-1).col < 3) months.pop(); months.push({ col, x: ml + col * step, name: api.fmtDate(colStart, { month: "short" }) }); }
        lastMonth = month;
      }
      for (let row = 0; row < 7; row++) {
        const t = addDays(start, col * 7 + row);
        if (t > today) { cells.push({ key: col * 7 + row, col, x: ml + col * step, y: mt + row * rh, future: true }); continue; }
        const o = days.get(dayKey(t)) || { ms: 0, cycles: 0 }, min = o.ms / 60000;
        const tip = "<b>" + api.fmtDate(t, { weekday: "short", day: "numeric", month: "short" }) + "</b><br>" + (min ? api.fmtDur(o.ms) + " · " + api.plural(o.cycles, "cycle") + labelTip(api, split.get(dayKey(t))) : "No focus");
        cells.push({ key: col * 7 + row, col, x: ml + col * step, y: mt + row * rh, level: heatLevel(min), today: t === today, tip });
      }
    }
    return { months, cells };
  });
</script>

<figure class="chart-card calendar" id="calendar">
  <h3>Focus calendar</h3>
  <p class="sub" id="heatSub">Last {weeks} weeks</p>
  <div class="chart heat" id="heat" bind:clientWidth={width} bind:clientHeight={height}>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="Focus calendar for the last {weeks} weeks">
    {#each c.months as mo (mo.x)}<text x={mo.x} y="11">{mo.name}</text>{/each}
    {#each c.cells as cell (cell.key)}
      {#if cell.future}<rect class="cell future" x={cell.x + .5} y={cell.y + .5} width={cs - 1} height={cs - 1} rx="3" />
      {:else}<rect class="cell l{cell.level}" class:today={cell.today} data-tip={cell.tip} x={cell.x} y={cell.y} width={cs} height={cs} rx="3" style:--i={cell.col} />{/if}
    {/each}
    {#each DAYS as label, r (r)}{#if label}<text x="0" y={mt + r * (cs + gap) + cs / 2 + 4}>{label}</text>{/if}{/each}
  </svg>
  </div>
  <div class="legend" aria-hidden="true"><span>Less</span><i style="background:var(--heat0)"></i><i style="background:var(--heat1)"></i><i style="background:var(--heat2)"></i><i style="background:var(--heat3)"></i><i style="background:var(--heat4)"></i><span>More</span></div>
</figure>
