<script>
  import { clock, MODE_NAME, MODES, roundDots, startLabel } from "../lib/timer";
  import Dial from "./Dial.svelte";
  import { onMount } from "svelte";
  import { calm } from "../dom";
  import { timerView } from "./state.svelte";

  let { api } = $props();

  // Touch and full screen have no lasting hover, so a tap or a mouse move shows the controls for a moment.
  onMount(() => {
    const card = document.querySelector(".timer-card");
    let t = 0;
    const show = (e) => {
      if (e.pointerType === "mouse" && !document.body.classList.contains("zen")) return;
      card.classList.add("reveal");
      clearTimeout(t);
      t = setTimeout(() => { if (!card.querySelector(":is(button, select):hover")) card.classList.remove("reveal"); else show(e); }, 3000);
    };
    card.addEventListener("pointerdown", show);
    card.addEventListener("pointermove", show);
    return () => { clearTimeout(t); card.removeEventListener("pointerdown", show); card.removeEventListener("pointermove", show); };
  });

  const c = $derived.by(() => {
    timerView.version;
    const T = api.T, every = api.S.settings.longEvery;
    return {
      mode: T.mode, status: T.status,
      dots: roundDots(T.mode, T.setIndex, every), round: Math.min(Math.min(T.setIndex || 0, every) + 1, every), every,
      up: T.up ? T.upKind || "over" : "", keep: api.canKeepGoing(), bellAt: T.bellAt || 0, flowSince: T.upKind === "flow" ? T.up : 0, flow: T.upKind === "flow" || !!T.flowReady, nudge: T.mode !== "focus" && T.nudge ? { ...T.nudge } : null,
      sub: T.up ? (T.upKind === "flow" ? "flow · stop when you're done" : "past the bell") : T.flowReady ? "counts up from zero" : T.status === "running" ? "ends " + api.fmtClock(T.endsAt) : T.status === "paused" ? "paused" : "",
      held: Object.fromEntries(MODES.map((m) => [m, T.saved[m] ? "Paused with " + clock(Math.ceil(T.saved[m].remaining / 1000)) + " left" : ""])),
    };
  });
  // The pill springs to its new width when the word changes, so the change reads as one motion rather than a jump.
  let goBtn, goWidth = 0;
  $effect.pre(() => { c.status; c.up; if (goBtn) goWidth = goBtn.offsetWidth; });
  $effect(() => {
    c.status; c.up;
    const w = goBtn.offsetWidth;
    if (goWidth && w !== goWidth && !calm()) goBtn.animate([{ width: goWidth + "px" }, { width: w + "px" }], { duration: 380, easing: "cubic-bezier(.32, .72, 0, 1)" });
  });
  const STOP = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>';
  // One thing at a time: Keep going owns a break's first minute, then the nudge takes the same spot.
  // Both read the ticking clock so the hand-over happens without a refresh; O and the palette keep going for ten minutes.
  const showKeep = $derived.by(() => { timerView.rem; return c.keep && Date.now() - c.bellAt < 60_000; });
  const showNudge = $derived(!showKeep && !!c.nudge);
  const flowSub = $derived.by(() => { timerView.rem; return c.flowSince && Date.now() - c.flowSince >= 90 * 60_000 ? "90 min in flow · a break soon?" : ""; });
  const zenLabel = $derived(timerView.zen ? "Exit full screen" : "Full screen");

  // The floating timer's button is wired up before this mounts, so it is moved in rather than rendered here.
  const adoptFloatBtn = (el) => { el.prepend(api.floatBtn); };
</script>

<div class="glow" aria-hidden="true"></div>
<div class="card-head">
  <div class="modes" role="tablist" aria-label="Timer mode">
    {#each MODES as m}<button type="button" role="tab" data-mode={m} aria-label={MODE_NAME[m]} aria-selected={String(m === c.mode && !c.flow)} data-held={c.held[m] ? "" : null} title={c.held[m]} onclick={() => { if (api.T.up) api.toggle(); if (m !== api.T.mode || api.T.flowReady) api.setMode(m, true); }}>{m === "focus" ? "Focus" : m === "short" ? "Short" : "Long"}</button>{/each}<button type="button" role="tab" data-mode="flow" aria-label="Flow: count up until you stop" aria-selected={String(c.flow)} title="Count up from zero until you stop" onclick={() => api.readyFlow()}>Flow</button>
  </div>
  <div class="head-icons" {@attach adoptFloatBtn}>
    <button class="icon-btn full-btn" type="button" id="fullBtn" aria-label={zenLabel} title={timerView.zen ? zenLabel : "Fill the page (F) · Shift-click for browser full screen (Shift+F)"} onclick={(e) => api.toggleZen(e.shiftKey)}>{@html timerView.zen ? api.ICON.shrink : api.ICON.expand}</button>
  </div>
</div>
<Dial sub={flowSub || c.sub} flow={c.flow} mode={c.mode} />
{#if showKeep}
  <div class="cycle"><button class="keep-going" type="button" title="Go back to focus, counting from the bell (O)" onclick={() => api.keepGoing()}>{@html api.ICON.play}Keep going</button></div>
{:else if showNudge}
  <div class="cycle"><button class="nudge" class:done={c.nudge.done} type="button" disabled={c.nudge.done} aria-label={c.nudge.done ? "Done: " + c.nudge.text : c.nudge.text + ". Mark as done"} title={c.nudge.done ? "" : "Tap when done"} onclick={() => api.nudgeDone()}><i aria-hidden="true">{#if c.nudge.done}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>{/if}</i><span>{c.nudge.text}</span></button></div>
{:else}
  <div class="cycle" class:off={c.mode !== "focus" || c.flow} title={"A long break comes after round " + c.every}>
    <span class="rounds" aria-hidden="true">{#each c.dots as d, i (i)}<i class={d}></i>{/each}</span><span>Round {c.round} of {c.every}</span>
  </div>
{/if}
<div class="adjust" class:off={!!c.up} id="adjust" role="group" aria-label="Adjust this session">
  <button type="button" data-adj="-1" title="1 minute less (−)" onclick={() => api.adjust(-1)}>−1 min</button>
  <button type="button" data-adj="1" title="1 minute more (+)" onclick={() => api.adjust(1)}>+1 min</button>
  <button type="button" data-adj="5" title="5 minutes more" onclick={() => api.adjust(5)}>+5 min</button>
</div>
<div class="controls">
  <button class="round" type="button" id="resetBtn" aria-label="Reset timer" title="Reset" onclick={(e) => { api.buzz(8); api.flushPartial(); api.setMode(api.T.mode); if (e.detail) e.currentTarget.blur(); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/></svg></button>
  <button class="go" type="button" id="startBtn" bind:this={goBtn} onclick={(e) => { api.buzz(api.T.status === "running" ? 8 : 14); api.toggle(); if (e.detail) e.currentTarget.blur(); }}><span class="go-ic" aria-hidden="true"><span class:on={c.status !== "running"}>{@html api.ICON.play}</span><span class:on={c.status === "running" && !c.up}>{@html api.ICON.pause}</span><span class:on={!!c.up}>{@html STOP}</span></span>{#key c.status + c.up}<span class="go-lbl">{c.up ? "Stop" : startLabel(c.status)}</span>{/key}</button>
  <button class="round" type="button" id="skipBtn" aria-label="Skip to next phase" title="Skip" onclick={(e) => { api.buzz(8); api.skip(); if (e.detail) e.currentTarget.blur(); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 7-10 7z"/><path d="M19 5v14"/></svg></button>
</div>
