<script>
  import { flip } from "svelte/animate";
  import { quintOut } from "svelte/easing";
  import { calm } from "../dom";
  import { addDays, MIN } from "../lib/dates";
  import { labelTotals } from "../lib/patterns";
  import { labelHue, matchesLabel } from "../lib/tasks";

  let { api, tasks, today, filter } = $props();
  let range = $state("30");

  const RANGES = [["7", "7 days"], ["30", "30 days"], ["all", "All time"]];

  const ever = $derived([...tasks.values()].some((t) => (t.sessions || []).some((s) => s.ms)));
  const c = $derived.by(() => {
    const all = range === "all", n = +range, to = addDays(today, 1), from = all ? 0 : addDays(to, -n);
    const cur = labelTotals(tasks, from, to), prev = all ? null : labelTotals(tasks, addDays(from, -n), from);
    const total = [...cur.values()].reduce((a, r) => a + r.ms, 0);
    // Colours are worked out here, so they follow label colours that load after the first draw.
    const rows = [...new Set([...cur.keys(), ...(prev?.keys() || [])])]
      .map((name) => ({ name, ...(cur.get(name) || { ms: 0, cycles: 0 }), before: prev?.get(name)?.ms || 0, color: name ? `oklch(.68 .15 ${labelHue(name)})` : "var(--faint)" }))
      .sort((a, b) => b.ms - a.ms || b.before - a.before || a.name.localeCompare(b.name));
    return { all, n, total, rows, prev: !!prev, max: Math.max(1, ...rows.map((r) => r.ms)) };
  });

  const top = $derived(c.rows[0]?.ms ? c.rows[0] : null);
  const nameOf = (name) => name || "No label";
  /** A duration that never breaks across lines. */
  const span = (ms) => api.fmtDur(ms).replaceAll(" ", "\u00a0");
  const pct = (ms) => (c.total ? Math.round((ms / c.total) * 100) : 0) + "%";
  const move = () => ({ duration: calm() ? 0 : 450, easing: quintOut });
  const change = (r) => {
    if (!r.before) return { text: "new" };
    const d = r.ms - r.before;
    return Math.abs(d) < 5 * MIN ? { text: "same" } : { text: api.fmtDur(Math.abs(d)), dir: d > 0 ? "up" : "dn" };
  };
  const tip = (r) => "<b>" + api.esc(nameOf(r.name)) + "</b><br>" + (r.ms ? api.fmtDur(r.ms) + " · " + api.plural(r.cycles, "cycle") + " · " + pct(r.ms) + " of focus" : "No focus") + (c.prev ? "<br>" + (r.before ? api.fmtDur(r.before) : "None") + " in the " + c.n + " days before" : "");
</script>

{#if ever}
  <figure class="chart-card by-label" id="byLabel">
    <div class="sec-head">
      <h3>Focus by label</h3>
      <div class="label-filter" id="byRange" role="group" aria-label="Period">
        {#each RANGES as [v, name] (v)}<button type="button" data-range={v} aria-pressed={String(range === v)} onclick={() => (range = v)}><span>{name}</span></button>{/each}
      </div>
    </div>
    <p class="answer">{top ? nameOf(top.name) + " got the most: " + span(top.ms) + ", " + pct(top.ms) + " of your focus." : "No focus in this period."}</p>
    {#if c.total}<p class="sub">{span(c.total)} of focus {c.all ? "in all" : "in the last " + c.n + " days, against the " + c.n + " days before"}. “No label” includes unplanned focus.</p>{/if}
    <div class="bl" class:no-prev={!c.prev}>
      <div class="bl-h" aria-hidden="true"><span>Label</span><span></span><span>Focus</span><span>Share</span>{#if c.prev}<span>Change</span>{/if}</div>
      {#each c.rows as r (r.name)}
        {@const d = change(r)}
        <div class="bl-r" class:off={!!filter && !matchesLabel(r.name, filter)} data-tip={tip(r)} animate:flip={move()}>
          <span class="bl-n"><i class="label-dot" class:none={!r.name} style:--h={r.name ? labelHue(r.name) : null}></i><span>{nameOf(r.name)}</span></span>
          <span class="bl-bar">{#if r.ms}<i style:width={(r.ms / c.max) * 100 + "%"} style:background={r.color}></i>{/if}</span>
          <b class="bl-v">{r.ms ? api.fmtDur(r.ms) : "–"}</b>
          <span class="bl-s">{pct(r.ms)}</span>
          {#if c.prev}<span class="bl-d {d.dir || ''}">{d.text}</span>{/if}
        </div>
      {/each}
    </div>
  </figure>
{/if}
