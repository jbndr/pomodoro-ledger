<script>
  import { phaseAt } from "../lib/rhythm";

  let { rhythm, now, big = false } = $props();

  const p = $derived(phaseAt(rhythm, now));
  const left = $derived(Math.max(0, p.end - now));
</script>

<div class="ring" class:big class:brk={!p.focus} aria-hidden="true">
  <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"/><circle class="arc" cx="22" cy="22" r="19" pathLength="100" stroke-dasharray="{(left / (p.end - p.start)) * 100} 100"/></svg>
  <span>{left ? Math.max(1, Math.floor(left / 60000)) : 0}<small>min</small></span>
</div>
