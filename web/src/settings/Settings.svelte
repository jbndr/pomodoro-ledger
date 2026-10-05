<script>
  import { flushSync } from "svelte";
  import { refreshNudge } from "../chrome/backupNudge.svelte";
  import { extensionVersion } from "../extension";
  import { PHASE_MORPHS, phaseMorph } from "../lib/phaseMorph";
  import { rolloverMode } from "../lib/rollover";
  import { rovingIndex, tickPace, tickVolume, wholeIn, workdayEnd } from "../lib/settings";
  import Mixer from "./Mixer.svelte";
  import SyncPanel from "./SyncPanel.svelte";

  let { api } = $props();

  const NUM = { sFocus: "focus", sShort: "short", sLong: "long", sEvery: "longEvery", sGoal: "goal" };
  const TOGGLE = { sAutoBreak: "autoBreak", sAutoFocus: "autoFocus", sSound: "sound", sNotify: "notify", sTicking: "ticking", sAutoFloat: "autoFloat", sRecap: "weeklyRecap", sPlanOffer: "weeklyPlan" };
  const TABS = [["timer", "Timer"], ["auto", "Automation"], ["alerts", "Sound & alerts"], ["sync", "Data & sync"]];
  const ROLLOVER = [["always", "Move to Today"], ["ask", "Ask"], ["never", "Don't move"]];
  const TICKS = [...Array(12)].map((_, i) => { const a = (i / 12) * Math.PI * 2; return [32 + Math.sin(a) * 27.5, 32 - Math.cos(a) * 27.5, 32 + Math.sin(a) * 30.5, 32 - Math.cos(a) * 30.5].map((n) => +n.toFixed(2)); });
  const PACE = [["1", "1 s", "Every second"], ["2", "2 s", "Every 2 seconds"], ["4", "4 s", "Every 4 seconds"]];
  // A field being typed into keeps its text when settings arrive from another device.
  const HELD = { ...NUM, sDayEnd: "workdayEnd" };

  const read = () => {
    const s = api.S.settings, out = { workdayEnd: s.workdayEnd || "", tickVolume: s.tickVolume, tickPace: String(s.tickPace) };
    for (const k of Object.values(NUM)) out[k] = s[k];
    for (const k of Object.values(TOGGLE)) out[k] = !!s[k];
    out.reactions = s.reactions !== false;
    out.rollover = rolloverMode(s.rollover);
    out.phaseMorph = phaseMorph(s.phaseMorph);
    return out;
  };
  const saved = () => { const t = api.ls.get("pl.setTab"); return TABS.some(([name]) => name === t) ? t : "timer"; };

  let f = $state(read());
  let tab = $state("timer");
  let note = $state("Changes save as you type.");
  let syncVersion = $state(0), mixVersion = $state(0);
  let extOn = $state(false);
  show(saved());

  export function fill() {
    const held = HELD[document.activeElement?.id];
    for (const [k, v] of Object.entries(read())) if (k !== held) f[k] = v;
    mixVersion++;
    flushSync();
  }

  export function open(name) {
    fill();
    extOn = !!extensionVersion();
    refreshNudge();
    api.setOverlay("#settings", true);
    if (name) show(name, true);
    else document.getElementById("setTab-" + tab).focus({ preventScroll: true });
  }

  export function close() {
    api.cancelTickPreview(); api.cancelScapePreview();
    api.setOverlay("#settings", false);
    document.getElementById("openSettings").focus({ preventScroll: true });
  }

  export const renderSync = () => { syncVersion++; };

  function show(name, focus) {
    tab = name;
    api.ls.set("pl.setTab", name);
    if (focus) { flushSync(); document.getElementById("setTab-" + name).focus(); }
  }

  function tabKey(e, i) {
    const j = rovingIndex(e.key, i, TABS.length);
    if (j < 0) return;
    e.preventDefault(); show(TABS[j][0], true);
  }

  function fillTicking() {
    const r = read();
    f.ticking = r.ticking; f.tickVolume = r.tickVolume; f.tickPace = r.tickPace;
  }

  function changed(e) {
    const el = e.target, id = el.type === "radio" ? el.name : el.id, s = api.S.settings;
    if (NUM[id]) {
      const v = wholeIn(el.value, +el.min, +el.max);
      if (v == null) { note = "Use a number from " + el.min + " to " + el.max + "."; return; }
      s[NUM[id]] = v;
    } else if (TOGGLE[id]) s[TOGGLE[id]] = el.checked;
    else if (id === "sTickVolume") s.tickVolume = tickVolume(el.value);
    else if (id === "sTickPace") s.tickPace = tickPace(el.value);
    else if (id === "sDayEnd") s.workdayEnd = workdayEnd(el.value);
    else if (id === "sReactions") { s.reactions = el.checked; api.reactionsChanged(); }
    else if (id === "sRollover") s.rollover = rolloverMode(el.value);
    else if (id === "sPhaseMorph") s.phaseMorph = phaseMorph(el.value);
    if (["sTicking", "sTickVolume", "sTickPace"].includes(id)) { api.cancelTickPreview(); fillTicking(); api.syncTicking(); }
    note = "Saved.";
    api.Store.saveSettings();
    if (api.T.setIndex > s.longEvery) api.T.setIndex = 0;
    if (id === "sNotify" && s.notify) askNotify();
    if (id === "sSound") { if (s.sound) api.scheduleEnd(); else api.cancelEnd(); }
    if (id === "sAutoFloat") api.autoFloatHandler();
    api.renderTimer(true); api.renderStats(); api.renderEstPick();
  }

  async function askNotify() {
    let p = "Notification" in window ? Notification.permission : "unsupported";
    if (p === "default") { try { p = await Notification.requestPermission(); } catch {} }
    if (p === "granted") return;
    api.S.settings.notify = false; f.notify = false; api.Store.saveSettings();
    api.toast(p === "unsupported" ? "This browser can't show notifications." : p === "denied" ? "Notifications are blocked for this site. Allow them in the browser's site settings." : "Notifications weren't allowed.");
  }

  function testSound() {
    if (!api.S.settings.sound) { api.toast("Turn sounds on first."); return; }
    api.playSound("focus");
  }

  function testTicking() {
    api.ensureAudio(); api.cancelTickPreview();
    if (!api.S.settings.ticking) { api.toast("Turn ticking on first."); return; }
    if (api.T.status === "running" && api.T.mode === "focus") { api.toast("The ticking is already playing with your timer."); return; }
    try { api.previewTicking(); } catch {}
  }
</script>

{#snippet mini(which)}
  <span class="pv-face pv-{which}">
    <svg viewBox="0 0 64 64"><circle class="pv-track" cx="32" cy="32" r="22"/><circle class="pv-arc" cx="32" cy="32" r="22" pathLength="100" stroke-dasharray="72 100" transform="rotate(-90 32 32)"/>{#each TICKS as [x1, y1, x2, y2], k (k)}<line x1={x1} y1={y1} x2={x2} y2={y2}/>{/each}<circle class="pv-knob" cx="32" cy="10" r="3.6"/></svg>
    <i class="pv-go"></i>
  </span>
{/snippet}

<div class="overlay" id="settings" hidden role="presentation" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
  <form class="sheet settings-sheet" id="settingsForm" aria-labelledby="setH" oninput={changed} onsubmit={(e) => { e.preventDefault(); close(); }}>
    <div class="sec-head"><h2 id="setH">Settings</h2><button class="icon-btn" type="button" id="closeSettings" aria-label="Close settings" onclick={close}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="seg" role="tablist" aria-label="Settings categories">
      {#each TABS as [name, label], i (name)}
        <button type="button" role="tab" id="setTab-{name}" data-tab={name} aria-controls="setPanel-{name}" aria-selected={String(tab === name)} tabindex={tab === name ? 0 : -1} onclick={() => show(name)} onkeydown={(e) => tabKey(e, i)}>{label}</button>
      {/each}
    </div>
    <div class="set-panels">
      <div class="set-panel" role="tabpanel" id="setPanel-timer" aria-labelledby="setTab-timer" aria-hidden={String(tab !== "timer")}>
        <fieldset class="group">
          <legend>Durations</legend>
          <div class="fields three">
            <label class="field">Focus<span class="unit"><input type="number" id="sFocus" min="1" max="120" inputmode="numeric" bind:value={f.focus}><i>min</i></span></label>
            <label class="field">Short break<span class="unit"><input type="number" id="sShort" min="1" max="60" inputmode="numeric" bind:value={f.short}><i>min</i></span></label>
            <label class="field">Long break<span class="unit"><input type="number" id="sLong" min="1" max="90" inputmode="numeric" bind:value={f.long}><i>min</i></span></label>
          </div>
        </fieldset>
        <fieldset class="group">
          <legend>Your day</legend>
          <div class="fields">
            <label class="field">Long break every<span class="unit"><input type="number" id="sEvery" min="2" max="12" inputmode="numeric" bind:value={f.longEvery}><i>cycles</i></span></label>
            <label class="field">Daily goal<span class="unit"><input type="number" id="sGoal" min="1" max="30" inputmode="numeric" bind:value={f.goal}><i>cycles</i></span></label>
            <label class="field">Workday ends <span class="opt">optional</span><input type="time" id="sDayEnd" step="900" bind:value={f.workdayEnd}></label>
          </div>
          <p class="hint">Optional. When set, Today points out tasks that won't finish before then, and after hours offers to move the rest to tomorrow.</p>
        </fieldset>
        <fieldset class="group">
          <legend>Phase change</legend>
          <div class="pm-tiles" role="radiogroup" aria-label="How the timer changes colour between focus and breaks">
            {#each PHASE_MORPHS as [v, name] (v)}
              <label class="pm-tile"><input type="radio" name="sPhaseMorph" value={v} bind:group={f.phaseMorph}><span class="pv pv-{v}" aria-hidden="true">{@render mini("now")}{@render mini("next")}</span><span>{name}</span></label>
            {/each}
          </div>
          <p class="hint">{PHASE_MORPHS.find(([v]) => v === f.phaseMorph)?.[2]} With reduced motion turned on, changes are instant.</p>
        </fieldset>
      </div>
      <div class="set-panel" role="tabpanel" id="setPanel-auto" aria-labelledby="setTab-auto" aria-hidden={String(tab !== "auto")}>
        <fieldset class="group">
          <legend>Start automatically</legend>
          <div class="card">
            <label class="toggle"><span>Breaks<small>Right after a focus cycle ends</small></span><input type="checkbox" id="sAutoBreak" bind:checked={f.autoBreak}></label>
            <label class="toggle"><span>Focus cycles<small>Right after a break ends</small></span><input type="checkbox" id="sAutoFocus" bind:checked={f.autoFocus}></label>
          </div>
        </fieldset>
        <fieldset class="group">
          <legend>New day</legend>
          <div class="field"><span id="sRolloverLabel">Unfinished tasks from earlier days</span>
            <div class="seg-ctl" id="sRollover" role="radiogroup" aria-labelledby="sRolloverLabel">
              {#each ROLLOVER as [v, name] (v)}<label><input type="radio" name="sRollover" value={v} bind:group={f.rollover}>{name}</label>{/each}
            </div>
          </div>
          <p class="hint">They show in Today either way, marked with their day. Ask offers to move them each morning.</p>
        </fieldset>
        <fieldset class="group" id="autoFloatRow" hidden={!api.floatable}>
          <legend>Floating timer</legend>
          <div class="card">
            <label class="toggle"><span>Open automatically<small>When a session starts or you switch tabs</small></span><input type="checkbox" id="sAutoFloat" bind:checked={f.autoFloat}></label>
          </div>
        </fieldset>
        <fieldset class="group">
          <legend>Weekly recap</legend>
          <div class="card">
            <label class="toggle"><span>Show each new week<small>Last week at a glance, on your first visit</small></span><input type="checkbox" id="sRecap" bind:checked={f.weeklyRecap}></label>
          </div>
        </fieldset>
        <fieldset class="group">
          <legend>Weekly plan</legend>
          <div class="card">
            <label class="toggle"><span>Offer to plan the week<small>A quiet prompt from Sunday to Tuesday · P opens it any time</small></span><input type="checkbox" id="sPlanOffer" bind:checked={f.weeklyPlan}></label>
          </div>
        </fieldset>
        {#if extOn}
          <fieldset class="group" id="blockRow">
            <legend>Block distracting sites</legend>
            <div class="card">
              <div class="toggle"><span>Site blocker<small>Extension connected · blocks sites during focus</small></span><span class="in-step"><i></i>On</span></div>
            </div>
            <p class="hint">Manage the site list in the extension's options.</p>
          </fieldset>
        {/if}
      </div>
      <div class="set-panel" role="tabpanel" id="setPanel-alerts" aria-labelledby="setTab-alerts" aria-hidden={String(tab !== "alerts")}>
        <div class="group">
          <div class="card">
            <label class="toggle"><span>Notification<small>When a cycle or break ends</small></span><input type="checkbox" id="sNotify" bind:checked={f.notify}></label>
            <div class="toggle"><label for="sSound">Sound<small>When a cycle, break or task finishes</small></label><span class="acts"><button class="btn small" type="button" id="testSound" onclick={testSound}>Test</button><input type="checkbox" id="sSound" bind:checked={f.sound}></span></div>
            <div class="toggle"><label for="sTicking">Ticking<small>A soft tap during focus, quiet otherwise</small></label><span class="acts"><button class="btn small" type="button" id="testTicking" onclick={testTicking}>Preview</button><input type="checkbox" id="sTicking" aria-controls="tickingOptions" bind:checked={f.ticking}></span></div>
            <div class="nested fields" id="tickingOptions" hidden={!f.ticking}>
              <label class="field"><span class="field-head">Volume<span id="tickVolumeValue">{f.tickVolume}%</span></span><input type="range" id="sTickVolume" min="0" max="100" step="1" aria-label="Tick volume" bind:value={f.tickVolume}></label>
              <div class="field"><span id="sTickPaceLabel">Tick every</span>
                <div class="seg-ctl" id="sTickPace" role="radiogroup" aria-labelledby="sTickPaceLabel">
                  {#each PACE as [v, name, full] (v)}<label><input type="radio" name="sTickPace" value={v} aria-label={full} bind:group={f.tickPace}>{name}</label>{/each}
                </div>
              </div>
            </div>
            <Mixer {api} version={mixVersion} onsave={() => (note = "Saved.")} />
          </div>
          <p class="hint">Sounds play once you've clicked somewhere on the page.</p>
        </div>
        <fieldset class="group">
          <legend>Rooms</legend>
          <div class="card">
            <label class="toggle"><span>Reactions<small>See and send quick reactions like 🎉 in a room</small></span><input type="checkbox" id="sReactions" bind:checked={f.reactions}></label>
          </div>
        </fieldset>
      </div>
      <div class="set-panel" role="tabpanel" id="setPanel-sync" aria-labelledby="setTab-sync" aria-hidden={String(tab !== "sync")}>
        <SyncPanel {api} version={syncVersion} />
      </div>
    </div>
    <div class="sheet-foot"><span class="sub" id="setNote">{note}</span><button class="btn solid" type="submit">Done</button></div>
  </form>
</div>
