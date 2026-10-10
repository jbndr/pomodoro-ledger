<script>
  import { arcOffset, CIRCUMFERENCE, TICKS } from "../lib/timer";

  let { face = "classic", frac, lit, lead = lit - 1, knob } = $props();

  const RING = Array.from({ length: 60 }, (_, i) => { const a = (i / 60) * 2 * Math.PI; return { cx: +(150 + Math.sin(a) * 112).toFixed(2), cy: +(150 - Math.cos(a) * 112).toFixed(2) }; });
</script>

<svg class="dial" viewBox="0 0 300 300" aria-hidden="true">
  {#if face === "matrix"}
    <g class="mx-ring">{#each RING as d, i}<circle cx={d.cx} cy={d.cy} r="3.6" class:lit={i < lit} class:lead={i === lead} />{/each}</g>
  {:else}
    <g class="ticks">{#each TICKS as t, i}<line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} class={"tick" + (t.major ? " major" : "") + (i < lit ? " lit" : "")} />{/each}</g>
    <circle class="track" cx="150" cy="150" r="112" />
    <circle class="arc" cx="150" cy="150" r="112" transform="rotate(-90 150 150)" stroke-dasharray={CIRCUMFERENCE.toFixed(2)} stroke-dashoffset={arcOffset(frac)} />
    <circle class="knob" cx={knob.cx} cy={knob.cy} r="9" />
  {/if}
</svg>
