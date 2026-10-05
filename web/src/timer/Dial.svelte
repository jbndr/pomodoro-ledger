<script>
  import { arcOffset, CIRCUMFERENCE, clock, clockLabel, fraction, knobAt, litTicks, TICKS } from "../lib/timer";
  import { rollDigits } from "../lib/roll";
  import { timerView } from "./state.svelte";

  let { sub, nudge = null, onnudge = () => {} } = $props();

  const frac = $derived(timerView.up ? 1 : fraction(timerView.rem, timerView.total));
  const secs = $derived(timerView.up ? Math.floor(timerView.rem / 1000) : Math.ceil(timerView.rem / 1000));
  const chars = $derived([...(timerView.up ? "+" : "") + clock(secs)]);
  const lit = $derived(litTicks(frac));
  const knob = $derived(knobAt(frac));

  // Jumps (±min, skip, a new phase) roll the digits that changed; ordinary seconds keep still.
  let timeEl, before = [], beforeSecs = 0, seen = -1;
  $effect(() => {
    const now = chars, v = timerView.version;
    if (v !== seen && seen >= 0 && before.length === now.length) rollDigits([...timeEl.children], before, now, secs > beforeSecs);
    before = now; beforeSecs = secs; seen = v;
  });
</script>

<div class="dial-wrap">
  <svg class="dial" viewBox="0 0 300 300" aria-hidden="true">
    <g id="ticks">{#each TICKS as t, i}<line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} class={"tick" + (t.major ? " major" : "") + (i < lit ? " lit" : "")} />{/each}</g>
    <circle class="track" cx="150" cy="150" r="112" />
    <circle class="arc" id="arc" cx="150" cy="150" r="112" transform="rotate(-90 150 150)" stroke-dasharray={CIRCUMFERENCE.toFixed(2)} stroke-dashoffset={arcOffset(frac)} />
    <circle class="knob" id="knob" cx={knob.cx} cy={knob.cy} r="9" />
  </svg>
  <div class="dial-center" aria-live="off">
    <div class="time" class:counting={timerView.up} id="time" role="timer" bind:this={timeEl} aria-label={timerView.up ? Math.floor(secs / 60) + " minutes " + (secs % 60) + " seconds past the bell" : clockLabel(secs)}>{#each chars as c}<span class={c === ":" ? "c" : c === "+" ? "p" : "d"}>{c}</span>{/each}</div>
    {#if nudge}<button class="nudge" class:done={nudge.done} type="button" disabled={nudge.done} aria-label={nudge.done ? "Done: " + nudge.text : nudge.text + ". Mark as done"} title={nudge.done ? "" : "Tap when done"} onclick={onnudge}><i aria-hidden="true">{#if nudge.done}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>{/if}</i><span>{nudge.text}</span></button>
    {:else}<div class="dial-sub" id="dialSub">{sub}</div>{/if}
  </div>
</div>
