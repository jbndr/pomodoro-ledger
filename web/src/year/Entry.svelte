<script>
  import { badges, focusYears, monthsSoFar, yearStats } from "../lib/year";
  import { hoursOf, hoursUnit } from "./card";

  let { api, tasks } = $props();

  const year = $derived.by(() => {
    const ys = focusYears(tasks), now = new Date().getFullYear();
    return ys.includes(now) ? now : ys.includes(now - 1) ? now - 1 : null;
  });
  const y = $derived(year ? yearStats(tasks, year) : null);
  const got = $derived(y ? badges(y, api.S.settings.goal).filter((b) => b.earned).length : 0);
  const max = $derived(y ? Math.max(1, ...y.months) : 1);
</script>

{#if y}
  <button class="yr-entry" type="button" id="openYear" onclick={() => api.openYear(year)}>
    <span class="yr-entry-mark" aria-hidden="true"><svg viewBox="0 0 28 28"><circle cx="5.6" cy="14" r="4.5" fill="var(--tomato)"/><path d="M13.04 20.96L22.16 7.76" fill="none" stroke="var(--leaf)" stroke-width="6" stroke-linecap="round"/></svg></span>
    <span class="yr-entry-text">
      <b>Your {year} in focus</b>
      <span>{y.partial ? "So far: " : ""}{hoursOf(y.ms)} {hoursUnit(y.ms)} · {got} {got === 1 ? "badge" : "badges"}</span>
    </span>
    <span class="yr-entry-months" aria-hidden="true">
      {#each y.months as ms, m (m)}<i class:best={m === y.bestMonth} class:fut={m >= monthsSoFar(y)} style:height={Math.max(12, (ms / max) * 100) + "%"}></i>{/each}
    </span>
    <svg class="yr-entry-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
  </button>
{/if}
