<script>
  import { shareShift, weekLabels } from "../lib/patterns";
  import { labelHue, matchesLabel } from "../lib/tasks";

  let { api, tasks, today, filter } = $props();
  let width = $state(0);

  const WEEKS = 8, NAMED = 6, H = 220, mt = 6, mb = 24, GAP = 2;
  const OTHER = "\u0000other";

  const c = $derived.by(() => {
    const weeks = weekLabels(tasks, today, WEEKS);
    if (weeks.filter((w) => w.ms).length < 2) return null;
    const totals = new Map();
    for (const w of weeks) for (const [name, ms] of w.by) totals.set(name, (totals.get(name) || 0) + ms);
    // The most-used labels keep their colour; the rest share one grey, and unlabeled focus sits on top.
    const named = [...totals].filter(([n]) => n).sort((a, b) => b[1] - a[1]).map(([n]) => n);
    const keep = named.slice(0, NAMED), order = [...keep, ...(named.length > NAMED ? [OTHER] : []), ...(totals.has("") ? [""] : [])];
    const W = Math.max(280, width || 600), narrow = W < 520, ml = 2, mr = narrow ? 4 : 92, band = (W - ml - mr) / WEEKS, bw = Math.min(40, band * 0.56), ph = H - mt - mb;
    const cols = weeks.map((w, i) => {
      const cx = ml + i * band + band / 2;
      let y = mt + ph;
      const parts = order.map((name) => {
        const ms = name === OTHER ? named.slice(NAMED).reduce((n, x) => n + (w.by.get(x) || 0), 0) : w.by.get(name) || 0;
        if (!ms) return null;
        const h = (ms / w.ms) * ph;
        y -= h;
        return { name, ms, y: y + GAP, h: Math.max(0, h - GAP), color: fill(name) };
      }).filter(Boolean);
      return { w, i, cx, parts };
    });
    // Colours are worked out here, so they follow label colours that load after the first draw.
    const legend = order.map((name) => ({ name, color: fill(name) }));
    return { cols, legend, bw, W, narrow, shift: shareShift(weeks) };
  });

  const fill = (name) => (name === OTHER ? "var(--line-2)" : name ? `oklch(.68 .15 ${labelHue(name)})` : "var(--faint)");
  const nameOf = (name) => (name === OTHER ? "Other labels" : name || "No label");
  const pct = (v) => Math.round(v * 100) + "%";
  const weekName = (w, i) => (i === WEEKS - 1 ? "This week" : "Week of " + api.fmtDate(w.start, { day: "numeric", month: "short" }));
  const dim = (name) => !!filter && (name === OTHER || !matchesLabel(name, filter));
</script>

{#if c}
  <figure class="chart-card where" id="whereTime">
    <h3>Where your time goes</h3>
    <p class="answer">{#if c.shift}{c.shift.name} {c.shift.to > c.shift.from ? "grew" : "fell"} from {pct(c.shift.from)} to {pct(c.shift.to)} of your focus.{:else}Your mix of labels held steady.{/if}</p>
    <p class="sub">Share of focus by label, week by week.</p>
    <div class="chart" bind:clientWidth={width}>
      <svg viewBox="0 0 {c.W} {H}" role="img" aria-label="Share of focus by label for the last {WEEKS} weeks">
        {#each c.cols as col (col.w.start)}
          <g class="wt-col" style:--i={col.i}>
            {#each col.parts as p (p.name)}
              <rect class="wt-seg" class:off={dim(p.name)} x={col.cx - c.bw / 2} y={p.y} width={c.bw} height={p.h} rx="3" style:fill={p.color}
                data-tip={"<b>" + weekName(col.w, col.i) + "</b><br>" + api.esc(nameOf(p.name)) + " · " + api.fmtDur(p.ms) + " · " + pct(p.ms / col.w.ms)} />
            {/each}
          </g>
          {#if col.i === WEEKS - 1 && !c.narrow}{#each col.parts.filter((p) => p.h >= 14) as p (p.name)}<text class="wt-l" x={col.cx + c.bw / 2 + 8} y={p.y + p.h / 2 + 4}>{nameOf(p.name)}</text>{/each}{/if}
          {#if !col.w.ms}<rect class="wt-none" x={col.cx - c.bw / 2} y={H - mb - 3} width={c.bw} height="3" rx="1.5" />{/if}
          {#if !c.narrow || col.i % 2 === 1}<text x={col.cx} y={H - 6} text-anchor="middle" class:now={col.i === WEEKS - 1}>{col.i === WEEKS - 1 ? "Now" : api.fmtDate(col.w.start, { day: "numeric", month: "short" })}</text>{/if}
        {/each}
      </svg>
    </div>
    <div class="wt-legend" aria-hidden="true">{#each c.legend as l (l.name)}<span class:off={dim(l.name)}><i style:background={l.color}></i>{nameOf(l.name)}</span>{/each}</div>
  </figure>
{/if}
