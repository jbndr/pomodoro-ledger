<script>
  import { onDestroy } from "svelte";
  import { FACES } from "../lib/faces";
  import { clock, knobAt, litTicks } from "../lib/timer";
  import DialRing from "../timer/DialRing.svelte";
  import FaceDigits from "../timer/FaceDigits.svelte";

  let { value, onpick } = $props();

  const START = 17 * 60 + 30;
  let secs = $state(Object.fromEntries(FACES.map(([id]) => [id, START]))), playing = $state(""), timer = 0, root;
  const hint = $derived((FACES.find(([id]) => id === (playing || value)) || FACES[0])[2]);

  // Pointing at a face (or picking one) lets its preview tick down, one real second at a time, until Settings closes.
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

  onDestroy(() => clearInterval(timer));
</script>

<div class="st-faces-wrap" bind:this={root}>
  <div class="st-faces" role="radiogroup" aria-label="Timer face">
    {#each FACES as [id, name] (id)}
      {@const frac = secs[id] / (25 * 60)}
      <button class="st-face" type="button" role="radio" aria-checked={String(value === id)} data-face={id} onclick={() => { onpick(id); play(id); }} onpointerenter={(e) => { if (e.pointerType === "mouse") play(id); }} onpointerleave={() => stop(id)} onfocus={() => play(id)} onblur={() => stop(id)}>
        <span class="dial-wrap" data-face={id} aria-hidden="true">
          <DialRing face={id} {frac} lit={litTicks(frac)} knob={knobAt(frac)} />
          <span class="dial-center"><span class="time"><FaceDigits face={id} chars={[...clock(secs[id])]} /></span></span>
        </span>
        <b>{name}</b>
      </button>
    {/each}
  </div>
  <p class="st-face-hint" aria-live="polite">{hint}</p>
</div>
