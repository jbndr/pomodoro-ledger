<script>
  import { onDestroy } from "svelte";
  import { BACKDROPS, FACES, RINGS } from "../lib/faces";
  import { clock, knobAt, litTicks } from "../lib/timer";
  import DialRing from "../timer/DialRing.svelte";
  import FaceDigits from "../timer/FaceDigits.svelte";
  import { fmtClock } from "../format";
  import { sky, wantPlace } from "../sky.svelte";

  let { face, ring, backdrop, onface, onring, onbackdrop } = $props();

  const START = 17 * 60 + 30, TOTAL = 25 * 60;
  let secs = $state(Object.fromEntries([...FACES, ...RINGS].map(([id]) => [id, START]))), playing = $state(""), timer = 0, root;
  const name = (list, id) => list.find(([k]) => k === id)?.[1];
  const skyHint = $derived(sky.turn ? [sky.here?.place, (sky.turn.rise ? "Sunrise at " : "Sunset at ") + fmtClock(sky.turn.at)].filter(Boolean).join(" · ") : "");
  const hint = $derived((playing === "sky" && skyHint) ||[...FACES, ...RINGS, ...BACKDROPS].find(([id]) => id === playing)?.[2] || [name(FACES, face), ring === "none" ? "No ring" : name(RINGS, ring) + " ring", name(BACKDROPS, backdrop)].join(" · "));

  // Pointing at a face ticks its preview in real seconds; a ring runs down 25 seconds a step, so a tile turns or a dot goes out each time.
  function play(id, step = 1) {
    if (playing === id) return;
    clearInterval(timer);
    playing = id;
    const tick = () => {
      if (!root?.offsetParent) { stop(id); return; }
      if (id in secs) secs[id] = secs[id] > step ? secs[id] - step : START;
    };
    tick();
    timer = setInterval(tick, 1000);
  }
  function stop(id) { if (playing !== id) return; clearInterval(timer); playing = ""; }
  const hover = (id, step) => ({ onpointerenter: (e) => { if (e.pointerType === "mouse") play(id, step); }, onpointerleave: () => stop(id), onfocus: () => play(id, step), onblur: () => stop(id) });

  onDestroy(() => clearInterval(timer));
</script>

<div class="st-faces-wrap" bind:this={root}>
  <div class="st-pick-row">
    <span class="st-pick-label" id="faceLabel">Face</span>
    <div class="st-faces" role="radiogroup" aria-labelledby="faceLabel">
      {#each FACES as [id, label] (id)}
        <button class="st-face" type="button" role="radio" aria-checked={String(face === id)} onclick={() => { onface(id); play(id); }} {...hover(id, 1)}>
          <span class="st-stage" aria-hidden="true"><span class="time"><FaceDigits face={id} chars={[...clock(secs[id])]} /></span></span><b>{label}</b>
        </button>
      {/each}
    </div>
  </div>
  <div class="st-pick-row">
    <span class="st-pick-label" id="ringLabel">Ring</span>
    <div class="st-faces" role="radiogroup" aria-labelledby="ringLabel">
      {#each RINGS as [id, label] (id)}
        {@const frac = secs[id] / TOTAL}
        <button class="st-face" type="button" role="radio" aria-checked={String(ring === id)} onclick={() => { onring(id); play(id, 25); }} {...hover(id, 25)}>
          <span class="st-stage" data-ring={id} aria-hidden="true"><DialRing ring={id} {frac} lit={litTicks(frac)} knob={knobAt(frac)} /></span><b>{label}</b>
        </button>
      {/each}
    </div>
  </div>
  <div class="st-pick-row">
    <span class="st-pick-label" id="backdropLabel">Background</span>
    <div class="st-faces" role="radiogroup" aria-labelledby="backdropLabel">
      {#each BACKDROPS as [id, label] (id)}
        <button class="st-face" type="button" role="radio" aria-checked={String(backdrop === id)} onclick={() => onbackdrop(id)} onpointerover={() => { if (id === "sky") wantPlace(); }} {...hover(id)}>
          <span class="st-stage st-swatch" data-backdrop={id} aria-hidden="true"><span class="glow"></span></span><b>{label}</b>
        </button>
      {/each}
    </div>
  </div>
  <p class="st-face-hint" aria-live="polite">{hint}</p>
</div>
