<script>
  import { onDestroy, onMount } from "svelte";
  import { BACKDROP_GROUPS, BACKDROPS, FACES, RINGS } from "../lib/faces";
  import { clock, knobAt, litTicks } from "../lib/timer";
  import DialRing from "../timer/DialRing.svelte";
  import FaceDigits from "../timer/FaceDigits.svelte";
  import { fmtClock } from "../format";
  import { sky, wantPlace } from "../sky.svelte";
  import { wantHalftone } from "../halftone";

  let { kind, value, onpick, onhint } = $props();

  wantHalftone();

  const LIST = { face: FACES, ring: RINGS, backdrop: BACKDROPS }, NAME = { face: "Face", ring: "Ring", backdrop: "Background" };
  const START = 17 * 60 + 30, TOTAL = 25 * 60;
  const items = $derived(LIST[kind]);
  let secs = $state(Object.fromEntries([...FACES, ...RINGS].map(([id]) => [id, START]))), playing = $state(""), timer = 0, grid;
  const skyHint = $derived(sky.turn ? [sky.here?.place, (sky.turn.rise ? "Sunrise at " : "Sunset at ") + fmtClock(sky.turn.at)].filter(Boolean).join(" · ") : "");
  const hint = $derived(((playing || value) === "sky" && skyHint) || items.find(([id]) => id === (playing || value))?.[2] || "");

  // Pointing at a face ticks its preview in real seconds; a ring runs down 25 seconds a step, so a tile turns or a dot goes out each time.
  function play(id, step = 1) {
    if (playing === id) return;
    clearInterval(timer);
    playing = id;
    if (id === "sky") wantPlace();
    const tick = () => {
      if (!grid?.offsetParent) { stop(id); return; }
      if (id in secs) secs[id] = secs[id] > step ? secs[id] - step : START;
    };
    tick();
    timer = setInterval(tick, 1000);
  }
  function stop(id) { if (playing !== id) return; clearInterval(timer); playing = ""; }
  const step = $derived(kind === "ring" ? 25 : 1);
  const hover = (id) => ({ onpointerenter: (e) => { if (e.pointerType === "mouse") play(id, step); }, onpointerleave: () => stop(id), onfocus: () => play(id, step), onblur: () => stop(id) });

  // Arrow keys move through the tiles and try each one on, as radio buttons do; up and down skip a row in a grid.
  function key(e) {
    const tiles = [...grid.querySelectorAll(".st-face")], at = tiles.indexOf(document.activeElement);
    if (at < 0) return;
    const cols = tiles.filter((t) => t.offsetTop === tiles[0].offsetTop).length;
    const by = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols < tiles.length ? cols : 1, ArrowUp: cols < tiles.length ? -cols : -1, Home: -at, End: tiles.length - 1 - at }[e.key];
    if (by === undefined) return;
    e.preventDefault();
    const next = tiles[Math.max(0, Math.min(tiles.length - 1, at + by))];
    next.focus();
    next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    onpick(next.dataset.id);
  }

  $effect(() => { onhint?.(hint); });

  // In a row of tiles to swipe through, the current one starts in view.
  onMount(() => {
    const sel = grid.querySelector('[aria-checked="true"]');
    if (!sel || grid.scrollWidth <= grid.clientWidth) return;
    const g = grid.getBoundingClientRect(), r = sel.getBoundingClientRect();
    grid.scrollLeft += r.left - g.left - (g.width - r.width) / 2;
  });

  onDestroy(() => clearInterval(timer));
</script>

<div class="st-faces" role="radiogroup" tabindex="-1" aria-label={NAME[kind]} bind:this={grid} onkeydown={key}>
  {#each items as [id, label] (id)}
    {@const on = value === id}
    <button class="st-face" class:group={kind === "backdrop" && BACKDROP_GROUPS.has(id)} type="button" role="radio" data-id={id} aria-checked={String(on)} tabindex={on ? 0 : -1} onclick={() => { onpick(id); play(id, step); }} {...hover(id)}>
      {#if kind === "face"}
        <span class="st-stage" aria-hidden="true"><span class="time"><FaceDigits face={id} chars={[...clock(secs[id])]} /></span></span>
      {:else if kind === "ring"}
        {@const frac = secs[id] / TOTAL}
        <span class="st-stage" data-ring={id} aria-hidden="true"><DialRing ring={id} {frac} lit={litTicks(frac)} knob={knobAt(frac)} /></span>
      {:else}
        <span class="st-stage st-swatch" data-backdrop={id} aria-hidden="true"><span class="glow"></span></span>
      {/if}
      <b>{label}</b>
    </button>
  {/each}
</div>
