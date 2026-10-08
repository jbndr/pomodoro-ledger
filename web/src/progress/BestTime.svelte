<script>
  import { addDays } from "../lib/dates";
  import { bestWindow, cellAt, hourGrid, hourSpan, relLevel, WEEKDAYS } from "../lib/insights";

  let { api, tasks, today } = $props();
  const uid = $props.id();
  let range = $state("90");
  let width = $state(0);

  const RANGES = [["30", "30 days"], ["90", "90 days"], ["all", "All time"]];
  const ml = 34, mr = 4, mt = 6, hh = 54, r = 3, gap = 12, ch = 17, cg = 3, mb = 22;
  const H = mt + hh + gap + 7 * (ch + cg) - cg + mb;

  const g = $derived(hourGrid(tasks, range === "all" ? 0 : addDays(today, 1 - +range)));
  const best = $derived(bestWindow(g));
  const c = $derived.by(() => {
    const W = Math.max(300, Math.min(1100, width || 600)), { from, to } = hourSpan(g), n = to - from, band = (W - ml - mr) / n, cw = band - cg;
    const hours = [...Array(n)].map((_, i) => from + i), maxH = Math.max(1, ...hours.map((h) => g.hours[h % 24]));
    const maxCell = Math.max(0, ...g.ms.flatMap((_, d) => hours.map((h) => cellAt(g, d, h))));
    const every = band >= 26 ? 1 : band >= 15 ? 2 : 3;
    return { W, hours, band, cw, maxH, maxCell, every, x: (h) => ml + (h - from) * band + cg / 2 };
  });
  const inWin = (h) => best && best.share >= 0.3 && h >= best.from && h < best.to;
  const span = (h) => (h % 24) + "–" + ((h + 1) % 24);
  const hourTip = (h) => "<b>" + span(h) + "</b><br>" + (g.hours[h % 24] ? api.fmtDur(g.hours[h % 24]) + " · " + Math.round((g.hours[h % 24] / g.total) * 100) + "% of focus" : "No focus");
  // Past midnight the row keeps the night going, so the tooltip names the day it really was.
  const cellTip = (d, h) => "<b>" + WEEKDAYS[(d + (h >= 24 ? 1 : 0)) % 7] + " " + span(h) + "</b><br>" + (cellAt(g, d, h) ? api.fmtDur(cellAt(g, d, h)) : "No focus");
</script>

<figure class="chart-card best-time" id="bestTime">
  <div class="sec-head">
    <h3>Best time of day</h3>
    <div class="label-filter" role="group" aria-label="Period">
      {#each RANGES as [v, name] (v)}<button type="button" aria-pressed={String(range === v)} onclick={() => (range = v)}><span>{name}</span></button>{/each}
    </div>
  </div>
  <p class="best-line" class:quiet={!best}>
    {#if best}{best.text.replace("–", "\u2060–\u2060")}{:else if g.sessions}Needs a few more sessions to find your best time.{:else}No focus logged in this period.{/if}
  </p>
  {#if g.sessions}
    <div class="chart heat" bind:clientWidth={width}>
      <svg viewBox="0 0 {c.W} {H}" role="img" aria-label={"Focus by hour of day and weekday. " + (best ? best.text : "")} style:--base="{mt + hh}px">
        <clipPath id="{uid}-plot"><rect width={c.W} height={mt + hh} /></clipPath>
        <line class="base" x1={ml} x2={c.W - mr} y1={mt + hh} y2={mt + hh} />
        {#each c.hours as h, i (h)}
          {@const bh = (g.hours[h] / c.maxH) * (hh - 4)}
          <rect class="hit" data-tip={hourTip(h)} x={c.x(h) - 1} y={mt} width={c.cw + 2} height={hh} fill="transparent" />
          <rect class="bar" class:peak={inWin(h)} x={c.x(h)} width={c.cw} y={mt + hh - bh} height={bh + r} rx={r} clip-path="url(#{uid}-plot)" style:--i={i} style:y="{mt + hh - bh}px" style:height="{bh + r}px" />
        {/each}
        {#each WEEKDAYS as day, d (d)}
          {@const y = mt + hh + gap + d * (ch + cg)}
          <text x="0" y={y + 12.5}>{day.slice(0, 3)}</text>
          {#each c.hours as h, i (h)}
            <rect class="cell l{relLevel(cellAt(g, d, h), c.maxCell)}" data-tip={cellTip(d, h)} x={c.x(h)} y={y} width={c.cw} height={ch} rx="3" style:--i={i} />
          {/each}
        {/each}
        {#each c.hours as h (h)}
          {#if h % c.every === 0}<text class={inWin(h) ? "val" : null} x={c.x(h)} y={H - 6}>{h % 24}</text>{/if}
        {/each}
      </svg>
    </div>
    <div class="legend" aria-hidden="true"><span>Less</span><i style="background:var(--heat0)"></i><i style="background:var(--heat1)"></i><i style="background:var(--heat2)"></i><i style="background:var(--heat3)"></i><i style="background:var(--heat4)"></i><span>More</span></div>
  {/if}
</figure>
