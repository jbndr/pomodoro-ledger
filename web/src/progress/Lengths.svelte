<script>
  import { MIN } from "../lib/dates";
  import { lengthBins } from "../lib/patterns";

  let { api, tasks } = $props();
  const uid = $props.id();
  let width = $state(0);

  const STEP = 5, H = 190, ml = 26, mr = 10, mt = 24, mb = 40, ENOUGH = 5;
  const focus = $derived(api.S.settings.focus);
  // The axis reaches past the focus length, so flow has room on the right.
  const last = $derived(Math.max(75, Math.ceil((focus + 30) / 15) * 15));
  const b = $derived(lengthBins(tasks, STEP, last));
  const c = $derived.by(() => {
    if (b.flow.length + b.early.length < ENOUGH) return null;
    const W = Math.max(280, width || 520), n = b.bins.length, band = (W - ml - mr) / n, bw = Math.min(22, band - 3), max = Math.max(...b.bins);
    const x = (m) => ml + (m / (last + STEP)) * (W - ml - mr), y = (v) => mt + (1 - v / max) * (H - mt - mb);
    const ticks = [];
    for (let m = 0; m <= last; m += 15) ticks.push(m);
    return { W, band, bw, max, x, y, ticks, grid: [...new Set([0, Math.ceil(max / 2), max])] };
  });
  const avg = (a) => a.reduce((n, v) => n + v, 0) / a.length;
  const med = (a) => { const s = [...a].sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const answer = $derived([
    b.flow.length ? "In flow you stay about " + Math.round(avg(b.flow) / MIN) + " minutes." : "",
    b.early.length ? "Cycles you stop end around " + Math.round(med(b.early) / MIN) + "." : "",
  ].filter(Boolean).join(" "));
  const binName = (i) => (i === b.bins.length - 1 ? last + "+ min" : i * STEP + "–" + (i + 1) * STEP + " min");
</script>

{#if c}
  <figure class="chart-card lengths" id="lengths">
    <h3>How long you stay</h3>
    <p class="answer">{answer}</p>
    <p class="sub">Sessions that weren’t a full {focus}-minute cycle, by length.</p>
    <div class="chart" bind:clientWidth={width}>
      <svg viewBox="0 0 {c.W} {H}" role="img" aria-label={answer} style:--base="{c.y(0)}px">
        <clipPath id="{uid}-plot"><rect width={c.W} height={c.y(0)} /></clipPath>
        {#each c.grid as v (v)}<line class={v ? "grid" : "base"} x1={ml} x2={c.W - mr} y1={c.y(v)} y2={c.y(v)} /><text x={ml - 6} y={c.y(v) + 4} text-anchor="end">{v}</text>{/each}
        {#each b.bins as n, i (i)}
          {#if n}<rect class="bar len" x={ml + i * c.band + (c.band - c.bw) / 2} width={c.bw} rx="3" clip-path="url(#{uid}-plot)" style:--i={i} style:y="{c.y(n)}px" style:height="{c.y(0) - c.y(n) + 3}px" data-tip={"<b>" + binName(i) + "</b><br>" + api.plural(n, "session")} />{/if}
        {/each}
        <line class="len-mark" x1={c.x(focus)} x2={c.x(focus)} y1={mt - 14} y2={c.y(0)} />
        <text class="len-mark-l" x={c.x(focus) + 6} y={mt - 5}>{api.plural(b.cycles, "full cycle")} at {focus}</text>
        {#each c.ticks as m (m)}<text x={c.x(m)} y={c.y(0) + 15} text-anchor="middle">{m}{m === last ? "+" : ""}</text>{/each}
        <text class="len-zone" x={(c.x(0) + c.x(focus)) / 2} y={H - 4} text-anchor="middle">stopped early</text>
        <text class="len-zone" x={(c.x(focus + STEP) + c.x(last + STEP)) / 2} y={H - 4} text-anchor="middle">flow</text>
      </svg>
    </div>
  </figure>
{/if}
