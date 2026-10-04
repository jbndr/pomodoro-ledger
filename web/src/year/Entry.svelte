<script>
  import { badges, focusYears, yearStats } from "../lib/year";
  import { hoursOf, hoursUnit } from "./card";
  import { yearEnabled } from "./flag";
  import Medal from "./Medal.svelte";

  let { api, tasks } = $props();

  const year = $derived.by(() => {
    const ys = focusYears(tasks), now = new Date().getFullYear();
    if (!yearEnabled()) return null;
    return ys.includes(now) ? now : ys.includes(now - 1) ? now - 1 : null;
  });
  const y = $derived(year ? yearStats(tasks, year) : null);
  const got = $derived(y ? badges(y, api.S.settings.goal).filter((b) => b.earned) : []);
  const fan = $derived(got.slice(0, 4));
</script>

{#if y}
  <button class="yr-hero" type="button" id="openYear" onclick={() => api.openYear(year)}
    aria-label="Your {year} in focus: {hoursOf(y.ms)} {hoursUnit(y.ms)}, {got.length} {got.length === 1 ? 'badge' : 'badges'}. Play">
    <span class="yr-hero-glow" aria-hidden="true"></span>
    <span class="yr-hero-text" aria-hidden="true">
      <span class="yr-hero-eye">{y.partial ? "Your year so far" : "Your year"}</span>
      <span class="yr-hero-year">{year}<em>in focus</em></span>
      <span class="yr-hero-stats"><b>{hoursOf(y.ms)}</b> {hoursUnit(y.ms)}<i></i><b>{y.cycles.toLocaleString()}</b> cycles<i></i><b>{got.length}</b> {got.length === 1 ? "badge" : "badges"}</span>
    </span>
    {#if fan.length}
      <span class="yr-hero-fan" aria-hidden="true" style:--n={fan.length}>
        {#each fan as b, k (b.id)}<span style:--k={k - (fan.length - 1) / 2}><Medal id={b.id} d={k} /></span>{/each}
      </span>
    {/if}
    <span class="yr-hero-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8.5 5.8v12.4a1 1 0 0 0 1.5.86l10-6.2a1 1 0 0 0 0-1.72l-10-6.2a1 1 0 0 0-1.5.86z" fill="currentColor"/></svg></span>
  </button>
{/if}
