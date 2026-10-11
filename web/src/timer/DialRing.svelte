<script>
  import { calm } from "../dom";
  import { arcOffset, CIRCUMFERENCE, TICKS } from "../lib/timer";

  let { ring = "arc", frac, lit, lead = lit - 1, knob, prog = undefined, spin = -1 } = $props();

  const around = (r) => Array.from({ length: 60 }, (_, i) => { const a = (i / 60) * 2 * Math.PI; return { cx: +(150 + Math.sin(a) * r).toFixed(2), cy: +(150 - Math.cos(a) * r).toFixed(2), deg: i * 6 }; });
  const DOTS = around(112), TILES = around(125), MARKS = around(137).filter((_, i) => i % 5 === 0);
  // The slit is one dashed circle whose dashes line up with the tiles.
  const TILE_W = 7.4, SLIT_DASH = `${TILE_W} ${(2 * Math.PI * 125) / 60 - TILE_W}`;

  const at = (deg, r) => [+(150 + r * Math.sin((deg * Math.PI) / 180)).toFixed(2), +(150 - r * Math.cos((deg * Math.PI) / 180)).toFixed(2)];
  const arc = (a0, a1, r) => { if (a1 - a0 < .3) return ""; const [x0, y0] = at(a0, r), [x1, y1] = at(Math.min(a1, a0 + 359.98), r); return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  const p = $derived(Math.max(0, prog ?? 1 - frac));

  // Closing: past 1 the ring laps itself, so its head turns from the top again.
  const lap = $derived(p > 1);
  const head = $derived(lap ? (p * 360) % 360 : p * 360);
  const tip = $derived.by(() => { const a = (head * Math.PI) / 180; return { x: 50 + 40 * Math.sin(a), y: 50 - 40 * Math.cos(a), sx: Math.cos(a) * 1.6, sy: Math.sin(a) * 1.6 }; });

  // Ticks and the gauge leave a gap at the bottom; in flow their marker circles once a minute.
  const TH = Array.from({ length: 151 }, (_, i) => { const a = -150 + i * 2, [x1, y1] = at(a, 121), [x2, y2] = at(a, 136); return { x1, y1, x2, y2 }; });
  const thLit = $derived(spin >= 0 || p >= 1 ? TH.length : Math.round(p * 150));
  const thNow = $derived.by(() => { const a = -150 + 300 * (spin >= 0 ? spin : Math.min(1, p)), [x1, y1] = at(a, 110), [x2, y2] = at(a, 141); return { x1, y1, x2, y2 }; });
  const TH_END = (() => { const [x1, y1] = at(150, 114), [x2, y2] = at(150, 140); return { x1, y1, x2, y2 }; })();

  const GA_W = (270 - 4 * 4) / 5, GA_ZONES = [.38, .54, .7, .85, 1].map((o, i) => ({ o, a0: -135 + i * (GA_W + 4), a1: -135 + i * (GA_W + 4) + GA_W }));
  const gaAt = $derived(-135 + 270 * (spin >= 0 ? spin : Math.min(1, p)));
  const gaPtr = $derived.by(() => { const [x1, y1] = at(gaAt, 119), [x2, y2] = at(gaAt, 137), [tx, ty] = at(gaAt, 141), [ax, ay] = at(gaAt - 3.4, 151), [bx, by] = at(gaAt + 3.4, 151); return { x1, y1, x2, y2, d: `M${tx} ${ty}L${ax} ${ay}L${bx} ${by}Z` }; });

  const hlDot = $derived(at(spin >= 0 ? spin * 360 : frac * 360, 141));

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

{#if ring === "close"}
  <div class="dial cl-ring" aria-hidden="true">
    <i class="cl-band cl-track"></i>
    <i class="cl-band cl-fill" class:lap style:--deg="{head.toFixed(2)}deg"></i>
    {#if p > .004}
      {#if !lap}<i class="cl-cap cl-start"></i>{/if}
      <i class="cl-cap cl-end" class:over={lap || p > .965} style:left="{tip.x.toFixed(3)}%" style:top="{tip.y.toFixed(3)}%" style:--sx="{tip.sx.toFixed(2)}cqw" style:--sy="{tip.sy.toFixed(2)}cqw"></i>
    {/if}
  </div>
{:else}
<svg class="dial" viewBox="0 0 300 300" aria-hidden="true">
  {#if ring === "none"}
  {:else if ring === "ticks"}
    <g class="th-ticks">{#each TH as t, i}<line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} class:lit={i >= thLit} />{/each}</g>
    <line class="th-end" x1={TH_END.x1} y1={TH_END.y1} x2={TH_END.x2} y2={TH_END.y2} />
    <line class="th-now" x1={thNow.x1} y1={thNow.y1} x2={thNow.x2} y2={thNow.y2} />
  {:else if ring === "gauge"}
    {#each GA_ZONES as z}
      {@const cut = Math.max(z.a0, Math.min(z.a1, gaAt))}
      <g style:--zo={z.o}><path class="ga-z ga-past" d={arc(z.a0, cut, 128)} /><path class="ga-z ga-ahead" d={arc(cut, z.a1, 128)} /></g>
    {/each}
    <line class="ga-tick" x1={gaPtr.x1} y1={gaPtr.y1} x2={gaPtr.x2} y2={gaPtr.y2} />
    <path class="ga-ptr" d={gaPtr.d} />
  {:else if ring === "hair"}
    <circle class="hl-track" cx="150" cy="150" r="141" />
    <path class="hl-arc" d={arc(0, frac * 360, 141)} />
    <circle class="hl-halo" cx={hlDot[0]} cy={hlDot[1]} r="8" />
    <circle class="hl-dot" cx={hlDot[0]} cy={hlDot[1]} r="3.2" />
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
{/if}
