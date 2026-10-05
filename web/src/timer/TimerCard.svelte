<script>
  import { clock, MODE_NAME, MODES, modeLabel, roundDots, startLabel } from "../lib/timer";
  import Dial from "./Dial.svelte";
  import NowTask from "./NowTask.svelte";
  import { onMount } from "svelte";
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
      label: modeLabel(T.mode, T.setIndex, every), name: MODE_NAME[T.mode], dots: roundDots(T.mode, T.setIndex, every),
      sub: T.status === "running" ? "ends at " + api.fmtClock(T.endsAt) : T.status === "paused" ? "paused" : "",
      held: Object.fromEntries(MODES.map((m) => [m, T.saved[m] ? "Paused with " + clock(Math.ceil(T.saved[m].remaining / 1000)) + " left" : ""])),
    };
  });
</script>

<div class="glow" aria-hidden="true"></div>
<div class="modes" role="tablist" aria-label="Timer mode">
  {#each MODES as m}<button type="button" role="tab" data-mode={m} aria-selected={String(m === c.mode)} data-held={c.held[m] ? "" : null} title={c.held[m]} onclick={() => { if (m !== api.T.mode) api.setMode(m, true); }}>{MODE_NAME[m]}</button>{/each}
</div>
<Dial {api} label={c.label} name={c.name} dots={c.dots} sub={c.sub} />
<div class="adjust" id="adjust" role="group" aria-label="Adjust this session">
  <button type="button" data-adj="-1" title="1 minute less (−)" onclick={() => api.adjust(-1)}>−1 min</button>
  <button type="button" data-adj="1" title="1 minute more (+)" onclick={() => api.adjust(1)}>+1 min</button>
  <button type="button" data-adj="5" title="5 minutes more" onclick={() => api.adjust(5)}>+5 min</button>
</div>
<NowTask {api} />
<div class="controls">
  <button class="round" type="button" id="resetBtn" aria-label="Reset timer" title="Reset" onclick={() => { api.buzz(8); api.flushPartial(); api.setMode(api.T.mode); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/></svg></button>
  <button class="go" type="button" id="startBtn" onclick={() => { api.buzz(api.T.status === "running" ? 8 : 14); api.toggle(); }}>{@html c.status === "running" ? api.ICON.pause : api.ICON.play}{startLabel(c.status)}</button>
  <button class="round" type="button" id="skipBtn" aria-label="Skip to next phase" title="Skip" onclick={() => { api.buzz(8); api.skip(); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 7-10 7z"/><path d="M19 5v14"/></svg></button>
</div>
