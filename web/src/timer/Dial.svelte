<script>
  import { clock, clockLabel, fraction, knobAt, litTicks } from "../lib/timer";
  import { sessionProgress } from "../lib/faces";
  import { rollDigits } from "../lib/roll";
  import { timerView } from "./state.svelte";
  import DialRing from "./DialRing.svelte";
  import FaceDigits from "./FaceDigits.svelte";
  import { cz } from "../customize/state.svelte";

  let { sub, flow = false, mode = "", face = "classic", ring = "arc" } = $props();

  // Flow has no end, so its ring is a quiet, full circle and only the digits move.
  const frac = $derived(timerView.up === "over" || timerView.up === "flow" ? 1 : fraction(timerView.rem, timerView.total));
  const secs = $derived(timerView.up ? Math.floor(timerView.rem / 1000) : Math.ceil(timerView.rem / 1000));
  const chars = $derived([...(timerView.up === "over" ? "+" : "") + clock(secs)]);
  // Flow keeps a quiet full ring; its knob is a second hand that circles once a minute, so nothing suggests an end.
  const lit = $derived(timerView.up === "flow" ? 0 : litTicks(frac));
  const knob = $derived.by(() => {
    if (timerView.up !== "flow") return knobAt(frac);
    const a = ((timerView.rem / 1000) % 60) / 60 * Math.PI * 2;
    return { cx: +(150 + Math.sin(a) * 112).toFixed(2), cy: +(150 - Math.cos(a) * 112).toFixed(2) };
  });
  const lead = $derived(timerView.up === "flow" ? Math.floor(timerView.rem / 1000) % 60 : timerView.up ? -1 : lit - 1);
  const prog = $derived(sessionProgress(timerView.up, frac, timerView.rem, timerView.span));
  const spin = $derived(timerView.up === "flow" ? ((timerView.rem / 1000) % 60) / 60 : -1);

  // ±min rolls the digits that changed. A new phase changes them in place, under the phase-change motion; seconds keep still.
  let timeEl, before = [], beforeSecs = 0, seen = -1, beforeKey = "";
  $effect(() => {
    const now = chars, v = timerView.version;
    const key = mode + (flow ? ":flow" : "") + face;
    if (v !== seen && seen >= 0 && key === beforeKey && before.length === now.length && face === "classic") rollDigits([...timeEl.children], before, now, secs > beforeSecs);
    before = now; beforeSecs = secs; seen = v; beforeKey = key;
  });
</script>

{#snippet zone(k, label)}<button class="cz-zone cz-zone-{k}" class:hot={cz.hover === k} type="button" aria-pressed={String(cz.zone === k)} aria-label={"Change the " + label.toLowerCase()} onclick={() => (cz.zone = k)}><span>{label}</span></button>{/snippet}

<div class="dial-wrap" class:flow data-face={face} data-ring={ring}>
  <DialRing {ring} {frac} {lit} {lead} {knob} {prog} {spin} />
  <div class="dial-center" aria-live="off">
    <div class="time" class:counting={timerView.up === "over"} id="time" role="timer" bind:this={timeEl} aria-label={timerView.up ? Math.floor(secs / 60) + " minutes " + (secs % 60) + (timerView.up === "flow" ? " seconds of flow" : " seconds past the bell") : clockLabel(secs)}><FaceDigits {face} {chars} {mode} {frac} up={timerView.up} /></div>
    <div class="dial-sub" id="dialSub">{sub}</div>
  </div>
  {#if cz.open}{@render zone("ring", "Ring")}{@render zone("face", "Face")}{/if}
</div>
