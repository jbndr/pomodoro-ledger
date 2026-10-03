<script>
  import { clock, MODE_NAME, MODES, modeLabel, setDots, startLabel } from "../lib/timer";
  import Dial from "./Dial.svelte";
  import Picker from "./Picker.svelte";
  import { timerView } from "./state.svelte";

  let { api } = $props();

  const c = $derived.by(() => {
    timerView.version;
    const T = api.T, every = api.S.settings.longEvery;
    return {
      mode: T.mode, status: T.status,
      label: modeLabel(T.mode, T.setIndex, every),
      sub: T.status === "running" ? "ends at " + api.fmtClock(T.endsAt) : T.status === "paused" ? "paused" : timerView.total / 60000 + " min",
      held: Object.fromEntries(MODES.map((m) => [m, T.saved[m] ? "Paused with " + clock(Math.ceil(T.saved[m].remaining / 1000)) + " left" : ""])),
      ...setDots(T.mode, T.status, T.setIndex, every),
    };
  });
</script>

<div class="glow" aria-hidden="true"></div>
<div class="modes" role="tablist" aria-label="Timer mode">
  {#each MODES as m}<button type="button" role="tab" data-mode={m} aria-selected={String(m === c.mode)} data-held={c.held[m] ? "" : null} title={c.held[m]} onclick={() => { if (m !== api.T.mode) api.setMode(m, true); }}>{MODE_NAME[m]}</button>{/each}
</div>
<Dial {api} label={c.label} sub={c.sub} />
<div class="adjust" id="adjust" role="group" aria-label="Adjust this session">
  <button type="button" data-adj="-1" title="1 minute less (−)" onclick={() => api.adjust(-1)}>−1 min</button>
  <button type="button" data-adj="1" title="1 minute more (+)" onclick={() => api.adjust(1)}>+1 min</button>
  <button type="button" data-adj="5" title="5 minutes more" onclick={() => api.adjust(5)}>+5 min</button>
</div>
<div class="set-dots" id="setDots" aria-label="Cycles until long break">{#each c.dots as cls}<span class={cls}></span>{/each}<em>{c.text}</em></div>
<div class="controls">
  <button class="round" type="button" id="resetBtn" aria-label="Reset timer" title="Reset" onclick={() => { api.buzz(8); api.flushPartial(); api.setMode(api.T.mode); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/></svg></button>
  <button class="go" type="button" id="startBtn" onclick={() => { api.buzz(api.T.status === "running" ? 8 : 14); api.toggle(); }}>{@html c.status === "running" ? api.ICON.pause : api.ICON.play}{startLabel(c.status)}</button>
  <button class="round" type="button" id="skipBtn" aria-label="Skip to next phase" title="Skip" onclick={() => { api.buzz(8); api.skip(); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 7-10 7z"/><path d="M19 5v14"/></svg></button>
</div>
<Picker {api} />
