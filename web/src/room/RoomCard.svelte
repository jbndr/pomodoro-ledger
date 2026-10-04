<script>
  import { hhmm, hueOf, initials, phaseAt } from "../lib/rhythm";
  import { backOut } from "svelte/easing";
  import { calm } from "../dom";
  import Ring from "./Ring.svelte";

  let { r, now, onjoin } = $props();

  const pop = () => calm() ? { duration: 0 } : { duration: 260, easing: backOut, css: (t) => `transform: scale(${t}); opacity: ${Math.min(1, t * 2)}` };

  const p = $derived(phaseAt(r.rhythm, now));
  const n = $derived(r.names.length);
  const max = $derived(r.max);
  const full = $derived(n >= max);
  const label = $derived("Join " + r.title + ". " + n + " of " + max + " people. " + (p.focus ? "Focus" : "Break") + " until " + hhmm(p.end) + ".");
</script>

<button type="button" disabled={full} aria-label={full ? r.title + " is full" : label} onclick={() => onjoin(r)}>
  <Ring rhythm={r.rhythm} {now} />
  <span class="rcard-main">
    <b>{r.title}</b>
    <span class="rcard-meta"><em class:brk={!p.focus}>{p.focus ? "Focus" : "Break"}</em> until {hhmm(p.end)}<i aria-hidden="true">·</i>{r.rhythm}{#if r.ends}<i aria-hidden="true">·</i>Ends {hhmm(r.ends)}{/if}</span>
    <span class="faces">
      {#each r.names.slice(0, 5) as name, k (name + "#" + r.names.slice(0, k).filter((x) => x === name).length)}<i style:--h={hueOf(name)} title={name} in:pop>{initials(name)}</i>{/each}
      {#if n > 5}<i class="more">+{n - 5}</i>{/if}
      {#if !n}<small>Nobody yet. Be the first.</small>{/if}
    </span>
  </span>
  <span class="rcard-side">
    <span class="cap" class:full>{n}<small>/{max}</small></span>
    <span class="rcard-go">{full ? "Full" : "Join"}</span>
  </span>
</button>
