<script>
  import { hhmm, hueOf, initials, phaseAt } from "../lib/rhythm";
  import Ring from "./Ring.svelte";

  let { r, now, i, onjoin } = $props();

  const p = $derived(phaseAt(r.rhythm, now));
  const n = $derived(r.names.length);
  const max = $derived(r.max);
  const full = $derived(n >= max);
  const label = $derived("Join " + r.title + ". " + n + " of " + max + " people. " + (p.focus ? "Focus" : "Break") + " until " + hhmm(p.end) + ".");
</script>

<li class="rcard" style:--i={i}>
  <button type="button" disabled={full} aria-label={full ? r.title + " is full" : label} onclick={() => onjoin(r)}>
    <Ring rhythm={r.rhythm} {now} />
    <span class="rcard-main">
      <b>{r.title}</b>
      <span class="rcard-meta"><em class:brk={!p.focus}>{p.focus ? "Focus" : "Break"}</em> until {hhmm(p.end)}<i aria-hidden="true">·</i>{r.rhythm}</span>
      <span class="faces">
        {#each r.names.slice(0, 5) as name, k (k)}<i style:--h={hueOf(name)} title={name}>{initials(name)}</i>{/each}
        {#if n > 5}<i class="more">+{n - 5}</i>{/if}
        {#if !n}<small>Nobody yet. Be the first.</small>{/if}
      </span>
    </span>
    <span class="rcard-side">
      <span class="cap" class:full>{n}<small>/{max}</small></span>
      <span class="rcard-go">{full ? "Full" : "Join"}</span>
    </span>
  </button>
</li>
