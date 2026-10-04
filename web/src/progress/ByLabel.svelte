<script>
  import { flip } from "svelte/animate";
  import { quintOut } from "svelte/easing";
  import { calm } from "../dom";
  import { addDays } from "../lib/dates";
  import { focusByLabel } from "../lib/stats";
  import { labelHue, progressLabelNames } from "../lib/tasks";

  let { api, tasks, today } = $props();
  let range = $state("30");

  const RANGES = [["7", "7 days"], ["30", "30 days"], ["all", "All time"]];
  const COLS = ["Label", "Share of focus", "Focus time", "Share", "Cycles", "Finished", "Open"];

  const shown = $derived(progressLabelNames(tasks).length > 0);
  const rows = $derived(shown ? focusByLabel(tasks, range === "all" ? 0 : addDays(today, 1 - +range)) : []);
  const total = $derived(rows.reduce((a, r) => a + r.ms, 0));
  const max = $derived(Math.max(1, ...rows.map((r) => r.ms)));

  const move = () => ({ duration: calm() ? 0 : 500, easing: quintOut });
  const share = (r) => (total ? Math.round((r.ms / total) * 100) + "%" : "–");
  const tip = (r) => "<b>" + api.esc(r.name || "No label") + "</b><br>" + api.fmtDur(r.ms) + " · " + api.plural(r.cycles, "cycle") + " · " + share(r) + " of focus";
</script>

<div class="ledger" id="byLabel" hidden={!shown}>
  <div class="sec-head">
    <h3>Focus by label</h3>
    <div class="label-filter" id="byRange" role="group" aria-label="Period">
      {#each RANGES as [v, name] (v)}<button type="button" data-range={v} aria-pressed={String(range === v)} onclick={() => (range = v)}><span>{name}</span></button>{/each}
    </div>
  </div>
  <div class="sub" id="byLabelSub">{rows.length ? api.fmtDur(total) + " of focus " + (range === "all" ? "in total" : "in the last " + range + " days") + ". “No label” includes unplanned focus." : "No focus logged in this period."}</div>
  <div class="table-wrap">
    <table id="byLabelTable">
      {#if rows.length}
        <thead><tr>{#each COLS as col, i (i)}<th class={i > 1 ? "num" : null}>{col}</th>{/each}</tr></thead>
        <tbody>
          {#each rows as r (r.name)}
            <tr data-tip={tip(r)} animate:flip={move()}>
              <td class="t" data-label={COLS[0]}><span class="by-name" class:none={!r.name}><i class="label-dot" class:none={!r.name} style:--h={r.name ? labelHue(r.name) : null}></i><span>{r.name || "No label"}</span></span></td>
              <td class="barcell" data-label={COLS[1]}><div class="hbar">{#if r.ms}<b style:width={(r.ms / max) * 100 + "%"}></b>{/if}</div></td>
              <td class="num" data-label={COLS[2]}>{api.fmtDur(r.ms)}</td>
              <td class="num" data-label={COLS[3]}>{share(r)}</td>
              <td class="num" data-label={COLS[4]}>{r.cycles}</td>
              <td class="num" data-label={COLS[5]}>{r.done}</td>
              <td class="num" data-label={COLS[6]}>{r.open}</td>
            </tr>
          {/each}
        </tbody>
      {/if}
    </table>
  </div>
</div>
