<script>
  import { onDestroy } from "svelte";
  import { FACES, RINGS, timerRing } from "../lib/faces";
  import { clock, knobAt, litTicks } from "../lib/timer";
  import DialRing from "../timer/DialRing.svelte";
  import FaceDigits from "../timer/FaceDigits.svelte";

  let { face, ring, onface, onring } = $props();

  const START = 17 * 60 + 30, OPTIONS = [...FACES, ...RINGS];
  let secs = $state(Object.fromEntries(OPTIONS.map(([id]) => [id, START]))), playing = $state(""), timer = 0, root;
  const hint = $derived((OPTIONS.find(([id]) => id === playing) || FACES.find(([id]) => id === face) || FACES[0])[2]);

  // Pointing at an option (or picking one) lets its preview tick down, one real second at a time, until Settings closes.
  function play(id) {
    if (playing === id) return;
    clearInterval(timer);
    playing = id;
    const step = () => {
      if (!root?.offsetParent) { stop(id); return; }
      secs[id] = secs[id] > 1 ? secs[id] - 1 : START;
    };
    step();
    timer = setInterval(step, 1000);
  }
  function stop(id) { if (playing !== id) return; clearInterval(timer); playing = ""; }
  const hover = (id) => ({ onpointerenter: (e) => { if (e.pointerType === "mouse") play(id); }, onpointerleave: () => stop(id), onfocus: () => play(id), onblur: () => stop(id) });

  onDestroy(() => clearInterval(timer));
</script>

{#snippet preview(id, digits, around)}
  {@const frac = secs[id] / (25 * 60)}
  <span class="dial-wrap" data-face={digits} data-ring={around} aria-hidden="true">
    <DialRing ring={around} {frac} lit={litTicks(frac)} knob={knobAt(frac)} />
    <span class="dial-center"><span class="time"><FaceDigits face={digits} chars={[...clock(secs[id])]} /></span></span>
  </span>
{/snippet}

<div class="st-faces-wrap" bind:this={root}>
  <div class="st-faces" role="radiogroup" aria-label="Timer face">
    {#each FACES as [id, name] (id)}
      <button class="st-face" type="button" role="radio" aria-checked={String(face === id)} data-face={id} onclick={() => { onface(id); play(id); }} {...hover(id)}>{@render preview(id, id, timerRing(id, undefined))}<b>{name}</b></button>
    {/each}
  </div>
  <p class="st-face-hint" aria-live="polite">{hint}</p>
  <div class="st-rings-row">
    <span class="st-rings-label" id="ringLabel">Ring</span>
    <div class="st-faces st-rings" role="radiogroup" aria-labelledby="ringLabel">
      {#each RINGS as [id, name] (id)}
        <button class="st-face" type="button" role="radio" aria-checked={String(ring === id)} data-ring={id} onclick={() => { onring(id); play(id); }} {...hover(id)}>{@render preview(id, face, id)}<b>{name}</b></button>
      {/each}
    </div>
  </div>
</div>
