<script>
  import { addDays, dayKey } from "../lib/dates";
  import { minuteScale } from "../lib/stats";
  import { labelTip } from "./tips";

  let { api, days, today, split, goalMin } = $props();
  const uid = $props.id();
  let width = $state(0);

  const MIN = 60000, H = 210, ml = 34, mr = 8, mt = 18, mb = 26, n = 14, r = 4;
  const c = $derived.by(() => {
    const W = Math.max(300, Math.min(760, width || 560)), pw = W - ml - mr, ph = H - mt - mb, band = pw / n, bw = Math.min(26, band * 0.62);
    const data = [...Array(n)].map((_, j) => {
      const t = addDays(today, j - n + 1), o = days.get(dayKey(t)) || { ms: 0, cycles: 0 };
      return { t, min: o.ms / MIN, cycles: o.cycles };
    });
    const { step, top } = minuteScale(Math.max(goalMin, ...data.map((d) => d.min), 60));
    const y = (v) => mt + ph - (v / top) * ph;
    const grid = [];
    for (let v = 0; v <= top; v += step) grid.push(v);
    return { W, band, bw, data, step, top, y, grid, base: y(0) };
  });

  const tipFor = (d) => "<b>" + api.fmtDate(d.t, { weekday: "short", day: "numeric", month: "short" }) + "</b><br>" + (d.min ? api.fmtDur(d.min * MIN) + " · " + api.plural(d.cycles, "cycle") + labelTip(api, split.get(dayKey(d.t))) : "No focus");
</script>

<div class="chart" id="bars" bind:clientWidth={width}>
  <svg viewBox="0 0 {c.W} {H}" role="img" aria-label="Focus minutes per day for the last 14 days" style:--base="{c.base}px">
    <clipPath id="{uid}-plot"><rect width={c.W} height={c.base} /></clipPath>
    {#each c.grid as v (v)}
      <g class="tick" style:translate="0 {c.y(v)}px">
        <line class={v === 0 ? "base" : "grid"} x1={ml} x2={c.W - mr} />
        <text x={ml - 8} y="4" text-anchor="end">{v >= 60 && v % 60 === 0 ? v / 60 + "h" : v}</text>
      </g>
    {/each}
    {#each c.data as d, i (i)}
      {@const x = ml + i * c.band + (c.band - c.bw) / 2}
      {@const isToday = i === n - 1}
      <rect class="hit" data-tip={tipFor(d)} x={ml + i * c.band} y={mt} width={c.band} height={H - mt - mb} fill="transparent" />
      <rect class="bar" class:today={isToday} x={x} width={c.bw} y={c.y(d.min)} height={c.base - c.y(d.min) + r} rx={r} clip-path="url(#{uid}-plot)" style:--i={i} style:y="{c.y(d.min)}px" style:height="{c.base - c.y(d.min) + r}px" />
      <text x={x + c.bw / 2} y={H - 8} text-anchor="middle" class={isToday ? "val" : null}>{new Date(d.t).getDate()}</text>
      {#if isToday && d.min}<text class="val rise" x={x + c.bw / 2} y={c.base - 6} text-anchor="middle" style:--i={i} style:translate="0 {c.y(d.min) - c.base}px">{api.fmtDur(d.min * MIN)}</text>{/if}
    {/each}
    <g class="tick" style:translate="0 {c.y(goalMin)}px">
      <line class="goal" x1={ml} x2={c.W - mr} />
      <text class="goal-l" x={ml} y="-5">goal {api.fmtDur(goalMin * MIN)}</text>
    </g>
  </svg>
</div>
