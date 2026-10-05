<script>
  import { arcOffset, CIRCUMFERENCE, clock, clockLabel, fraction, knobAt, litTicks, TICKS } from "../lib/timer";
  import { timerView } from "./state.svelte";

  let { api, label, name, dots, sub } = $props();

  const frac = $derived(fraction(timerView.rem, timerView.total));
  const secs = $derived(Math.ceil(timerView.rem / 1000));
  const chars = $derived([...clock(secs)]);
  const lit = $derived(litTicks(frac));
  const knob = $derived(knobAt(frac));
  const zenLabel = $derived(timerView.zen ? "Exit full screen" : "Full screen");

  // The floating timer's button is wired up before this mounts, so it is moved in rather than rendered here.
  const adoptFloatBtn = (el) => { el.append(api.floatBtn); };
</script>

<div class="dial-wrap" {@attach adoptFloatBtn}>
  <svg class="dial" viewBox="0 0 300 300" aria-hidden="true">
    <g id="ticks">{#each TICKS as t, i}<line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} class={"tick" + (t.major ? " major" : "") + (i < lit ? " lit" : "")} />{/each}</g>
    <circle class="track" cx="150" cy="150" r="112" />
    <circle class="arc" id="arc" cx="150" cy="150" r="112" transform="rotate(-90 150 150)" stroke-dasharray={CIRCUMFERENCE.toFixed(2)} stroke-dashoffset={arcOffset(frac)} />
    <circle class="knob" id="knob" cx={knob.cx} cy={knob.cy} r="9" />
  </svg>
  <div class="dial-center" aria-live="off">
    <div class="dial-label" id="modeLabel" aria-label={label} title={label}><span>{name}</span><span class="rounds" aria-hidden="true">{#each dots as d, i (i)}<i class={d}></i>{/each}</span></div>
    <div class="time" id="time" role="timer" aria-label={clockLabel(secs)}>{#each chars as c}<span class={c === ":" ? "c" : "d"}>{c}</span>{/each}</div>
    <div class="dial-sub" id="dialSub">{sub}</div>
  </div>
  <button class="icon-btn full-btn" type="button" id="fullBtn" aria-label={zenLabel} title={timerView.zen ? zenLabel : "Fill the page (F) · Shift-click for browser full screen (Shift+F)"} onclick={(e) => api.toggleZen(e.shiftKey)}>{@html timerView.zen ? api.ICON.shrink : api.ICON.expand}</button>
</div>
