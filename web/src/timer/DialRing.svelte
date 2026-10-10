<script>
  import { calm } from "../dom";
  import { arcOffset, CIRCUMFERENCE, TICKS } from "../lib/timer";

  let { ring = "arc", frac, lit, lead = lit - 1, knob } = $props();

  const around = (r) => Array.from({ length: 60 }, (_, i) => { const a = (i / 60) * 2 * Math.PI; return { cx: +(150 + Math.sin(a) * r).toFixed(2), cy: +(150 - Math.cos(a) * r).toFixed(2), deg: i * 6 }; });
  const DOTS = around(112), TILES = around(125), MARKS = around(137).filter((_, i) => i % 5 === 0);
  // The slit is one dashed circle whose dashes line up with the tiles.
  const TILE_W = 7.4, SLIT_DASH = `${TILE_W} ${(2 * Math.PI * 125) / 60 - TILE_W}`;

  // A tile that runs out turns over: it folds flat in the lit colour and opens in the dim one.
  let tilesEl, lastLit = lit;
  $effect(() => {
    const now = lit, was = lastLit;
    lastLit = now;
    if (ring !== "tiles" || !tilesEl || now !== was - 1 || calm()) return;
    const tile = tilesEl.children[now]?.firstElementChild;
    if (!tile) return;
    const on = getComputedStyle(tilesEl).getPropertyValue("--accent");
    tile.animate([{ scale: "1 1", fill: on }, { scale: "1 .06", fill: on, offset: .48 }, { scale: "1 .06", offset: .52 }, { scale: "1 1" }], { duration: 420, easing: "cubic-bezier(.45, 0, .2, 1)" });
  });
</script>

<svg class="dial" viewBox="0 0 300 300" aria-hidden="true">
  {#if ring === "none"}
  {:else if ring === "dots"}
    <g class="mx-ring">{#each DOTS as d, i}<circle cx={d.cx} cy={d.cy} r="3.6" class:lit={i < lit} class:lead={i === lead} />{/each}</g>
  {:else if ring === "tiles"}
    <g class="fl-ring" bind:this={tilesEl}>{#each TILES as d, i}<g transform="rotate({d.deg} 150 150)"><rect x={150 - TILE_W / 2} y="17.5" width={TILE_W} height="15" rx="1.5" class:lit={i < lit} class:lead={i === lead} /></g>{/each}</g>
    <circle class="fl-slit" cx="150" cy="150" r="125" transform="rotate(-90 150 150)" stroke-dasharray={SLIT_DASH} stroke-dashoffset={TILE_W / 2} />
  {:else if ring === "glow"}
    <g class="gl-marks">{#each MARKS as d}<circle cx={d.cx} cy={d.cy} r="1.7" />{/each}</g>
    <circle class="gl-tube" cx="150" cy="150" r="112" />
    <circle class="gl-glass" cx="150" cy="150" r="106" />
    <circle class="gl-arc" cx="150" cy="150" r="112" transform="rotate(-90 150 150)" stroke-dasharray={CIRCUMFERENCE.toFixed(2)} stroke-dashoffset={arcOffset(frac)} />
    <circle class="gl-knob" cx={knob.cx} cy={knob.cy} r="4.2" />
  {:else}
    <g class="ticks">{#each TICKS as t, i}<line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} class={"tick" + (t.major ? " major" : "") + (i < lit ? " lit" : "")} />{/each}</g>
    <circle class="track" cx="150" cy="150" r="112" />
    <circle class="arc" cx="150" cy="150" r="112" transform="rotate(-90 150 150)" stroke-dasharray={CIRCUMFERENCE.toFixed(2)} stroke-dashoffset={arcOffset(frac)} />
    <circle class="knob" cx={knob.cx} cy={knob.cy} r="9" />
  {/if}
</svg>
