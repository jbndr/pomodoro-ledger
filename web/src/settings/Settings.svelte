<script>
  import { flushSync } from "svelte";
  import { refreshNudge } from "../chrome/backupNudge.svelte";
  import { applyTheme, theme } from "../chrome/theme.svelte";
  import { extensionVersion } from "../extension";
  import { mixLabel } from "../lib/mix";
  import { phaseMorph } from "../lib/phaseMorph";
  import { rolloverMode } from "../lib/rollover";
  import { tickPace, tickVolume, workdayEnd } from "../lib/settings";
  import Mixer from "./Mixer.svelte";
  import NudgeSettings from "./NudgeSettings.svelte";
  import PhasePreview from "./PhasePreview.svelte";
  import SyncPanel from "./SyncPanel.svelte";
  import "./settings.css";

  let { api } = $props();

  const svg = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  // Each icon is scaled and centred so they read the same size: square ones by height, wide ones by width.
  const icon = (k, cx, cy, d) => svg(`<g transform="translate(12 12) scale(${k}) translate(${-cx} ${-cy})">${d}</g>`);
  const SECTIONS = [
    ["timer", "Timer", icon(0.885, 12.0, 11.5, '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>')],
    ["breaks", "Breaks", icon(1.034, 12.5, 11.0, '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3"/>')],
    ["sound", "Sound & alerts", icon(1.049, 12.3, 12.0, '<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>')],
    ["planning", "Planning", icon(0.979, 12.0, 11.5, '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>')],
    ["rooms", "Rooms", icon(1.037, 11.9, 12.4, '<circle cx="9" cy="9" r="3.2"/><circle cx="17" cy="10" r="2.4"/><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5M15 15.2c2.6-.4 4.6.9 5.4 3.4"/>')],
    ["look", "Appearance", icon(1.034, 12.0, 12.0, '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>')],
    ["data", "Data & sync", icon(1.026, 12.7, 12.1, '<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z"/>')],
  ];
  const OLD = { auto: "breaks", alerts: "sound", sync: "data" };
  const LENGTHS = [["focus", "Focus", "var(--tomato)", 1, 120, 5], ["short", "Short break", "var(--leaf)", 1, 60, 1], ["long", "Long break", "var(--sky)", 1, 90, 5]];
  const PACE = [["1", "Every second", "1s"], ["2", "Every 2 s", "2s"], ["4", "Every 4 s", "4s"]];
  const CHEV = svg('<path d="M9 6l6 6-6 6"/>');
  const SPK_LO = svg('<path d="M5 10v4h3l4.5 3.5v-11L8 10z"/>'), SPK_HI = svg('<path d="M4 10v4h3l4.5 3.5v-11L7 10z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/>');

  const read = () => {
    const s = api.S.settings;
    return {
      focus: s.focus, short: s.short, long: s.long, longEvery: s.longEvery, goal: s.goal,
      autoBreak: !!s.autoBreak, autoFocus: !!s.autoFocus, sound: !!s.sound, notify: !!s.notify, ticking: !!s.ticking, autoFloat: !!s.autoFloat,
      weeklyRecap: !!s.weeklyRecap, weeklyPlan: !!s.weeklyPlan, reactions: s.reactions !== false,
      tickVolume: s.tickVolume, tickPace: String(s.tickPace), workdayEnd: s.workdayEnd || "",
      rollover: rolloverMode(s.rollover), phaseMorph: phaseMorph(s.phaseMorph),
    };
  };
  const known = (k) => SECTIONS.some(([name]) => name === k);
  const savedSection = () => { const t = api.ls.get("pl.setTab"); return known(OLD[t] || t) ? OLD[t] || t : "timer"; };

  let f = $state(read());
  let sec = $state(savedSection()), sub = $state(""), inside = $state(false);
  let flashOn = $state(false), syncVersion = $state(0), mixVersion = $state(0), extOn = $state(false), listening = $state(false);
  let dayEnd = $state(read().workdayEnd || "18:00");
  let bodyEl = $state(), nudgeUI = $state(), fadeTop = $state(false), fadeBottom = $state(false);
  let flashT = 0, listenT = 0;

  const title = $derived(SECTIONS.find(([k]) => k === sec)[1]);
  const scapeLine = $derived.by(() => { mixVersion; return { focus: mixLabel(api.S.settings, "focus"), brk: mixLabel(api.S.settings, "break") }; });

  export function fill() {
    const held = document.activeElement?.dataset?.held;
    for (const [k, v] of Object.entries(read())) if (k !== held) f[k] = v;
    if (f.workdayEnd) dayEnd = f.workdayEnd;
    mixVersion++;
    flushSync();
  }

  export function open(name) {
    fill();
    extOn = !!extensionVersion();
    refreshNudge();
    api.setOverlay("#settings", true);
    if (name) go(OLD[name] || name);
    inside = !!name;
    flushSync();
    (document.querySelector("#settings .st-nav [aria-current='page']") || document.getElementById("closeSettings"))?.focus({ preventScroll: true });
    edges();
  }

  export function close() {
    stopListen();
    api.cancelTickPreview(); api.cancelScapePreview();
    api.setOverlay("#settings", false);
    document.getElementById("openSettings").focus({ preventScroll: true });
  }

  export const renderSync = () => { syncVersion++; };

  function go(name, focus = false) {
    if (!known(name)) return;
    stopListen(); api.cancelScapePreview();
    sec = name; sub = ""; inside = true;
    api.ls.set("pl.setTab", name);
    flushSync();
    if (bodyEl) bodyEl.scrollTop = 0;
    edges();
    if (focus) bodyEl?.querySelector("button, input")?.focus({ preventScroll: true });
  }

  function openSub(name) { sub = name; flushSync(); if (bodyEl) bodyEl.scrollTop = 0; edges(); }

  function back() {
    if (sub) { api.cancelScapePreview(); sub = ""; mixVersion++; flushSync(); edges(); }
    else inside = false;
  }

  /* Soft fades show there's more to scroll, in place of a scrollbar. */
  function edges() {
    const b = bodyEl; if (!b) return;
    fadeTop = b.scrollTop > 2;
    fadeBottom = b.scrollTop + b.clientHeight < b.scrollHeight - 2;
  }

  function flash() {
    flashOn = true; clearTimeout(flashT);
    flashT = setTimeout(() => (flashOn = false), 1400);
  }

  function save(after) {
    api.Store.saveSettings();
    after?.();
    api.renderTimer(true); api.renderStats(); api.renderEstPick();
    flash();
  }

  function set(k, v) {
    const s = api.S.settings;
    s[k] = v; f[k] = v;
    if (k === "longEvery" && api.T.setIndex > v) api.T.setIndex = 0;
    save(() => {
      if (k === "notify" && v) askNotify();
      if (k === "sound") { if (v) api.scheduleEnd(); else api.cancelEnd(); }
      if (k === "autoFloat") api.autoFloatHandler();
      if (k === "reactions") api.reactionsChanged();
      if (k === "ticking" || k === "tickVolume" || k === "tickPace") { api.cancelTickPreview(); api.syncTicking(); }
    });
  }

  const LIMIT = Object.fromEntries([...LENGTHS.map(([k, , , min, max]) => [k, [min, max]]), ["longEvery", [2, 12]], ["goal", [1, 30]]]);
  function num(k, v) {
    const [min, max] = LIMIT[k], n = Math.round(+v);
    if (!Number.isFinite(n) || !n) { f[k] = api.S.settings[k]; return; }
    set(k, Math.max(min, Math.min(max, n)));
  }

  async function askNotify() {
    let p = "Notification" in window ? Notification.permission : "unsupported";
    if (p === "default") { try { p = await Notification.requestPermission(); } catch {} }
    if (p === "granted") return;
    api.S.settings.notify = false; f.notify = false; api.Store.saveSettings();
    api.toast(p === "unsupported" ? "This browser can't show notifications." : p === "denied" ? "Notifications are blocked for this site. Allow them in the browser's site settings." : "Notifications weren't allowed.");
  }

  function testSound() {
    if (!api.S.settings.sound) { api.toast("Turn the bell on first."); return; }
    api.playSound("focus");
  }

  function listen() {
    if (listening) { stopListen(); return; }
    api.ensureAudio(); api.cancelTickPreview();
    if (api.T.status === "running" && api.T.mode === "focus") { api.toast("The ticking is already playing with your timer."); return; }
    try { api.previewTicking(); } catch { return; }
    listening = true; clearTimeout(listenT);
    listenT = setTimeout(() => (listening = false), +f.tickPace * 3000 + 600);
  }
  function stopListen() { if (!listening) return; listening = false; clearTimeout(listenT); api.cancelTickPreview(); }

  function workday(on) {
    set("workdayEnd", on ? workdayEnd(dayEnd) || "18:00" : "");
  }

  function pickTheme(t) { api.ls.set("pl.theme", t); applyTheme(t, api.themed); flash(); }


  function keydown(e) {
    if (e.key !== "Escape") return;
    e.stopPropagation(); e.preventDefault();
    if (nudgeUI?.escape()) return;
    if (sub) back();
    else close();
  }
</script>

{#snippet tog(k, label)}
  <button class="st-tog" type="button" role="switch" aria-checked={String(f[k])} aria-label={label} onclick={() => set(k, !f[k])}></button>
{/snippet}
{#snippet stepper(k, unit, label)}
  <span class="st-step" role="group" aria-label={label}><button type="button" aria-label="Fewer" onclick={() => num(k, f[k] - 1)}>−</button><output>{f[k]} {unit}</output><button type="button" aria-label="More" onclick={() => num(k, f[k] + 1)}>+</button></span>
{/snippet}
{#snippet row(label, hint, control)}
  <div class="st-row"><div class="st-lab"><span>{label}</span>{#if hint}<small>{hint}</small>{/if}</div>{@render control()}</div>
{/snippet}
{#snippet vol(value, label, oninput)}
  <span class="st-vol">{@html SPK_LO}<input class="st-range" type="range" min="0" max="100" step="1" {value} aria-label={label} {oninput} style:--v="{value}%">{@html SPK_HI}<output>{value}%</output></span>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="overlay" id="settings" hidden role="presentation" onclick={(e) => { if (e.target === e.currentTarget) close(); }} onkeydown={keydown}>
  <div class="st-sheet" class:inside class:has-sub={!!sub} role="dialog" aria-modal="true" aria-labelledby="setH">
    <nav class="st-nav" aria-label="Settings sections">
      <div class="st-nav-head"><h2 id="setH">Settings</h2><button class="st-x" type="button" id="closeSettings" aria-label="Close settings" onclick={close}>{@html svg('<path d="M6 6l12 12M18 6L6 18"/>')}</button></div>
      {#each SECTIONS as [k, name, ic] (k)}
        <button type="button" data-sec={k} aria-current={sec === k ? "page" : undefined} onclick={() => go(k)}><span class="st-ic">{@html ic}</span>{name}<span class="st-go">{@html CHEV}</span></button>
      {/each}
      <span class="st-spacer"></span>
      <button class="st-done" type="button" onclick={close}>Done</button>
    </nav>
    <div class="st-main">
      <div class="st-top">
        <button class="st-back" type="button" aria-label={sub ? title : "All settings"} onclick={back}>{@html svg('<path d="M15 6l-6 6 6 6"/>')}</button>
        <h3>{#if sub}<span class="st-crumb">{title} /</span> Soundscape{:else}{title}{/if}</h3>
        <span class="st-saved" class:show={flashOn} aria-live="polite">{@html svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>')}Saved</span>
      </div>
      <div class="st-body" class:fade-top={fadeTop} class:fade-bottom={fadeBottom} bind:this={bodyEl} onscroll={edges}>
        {#if sub === "scape"}
          <div class="st-pane" data-sub="scape"><Mixer {api} version={mixVersion} onsave={() => { mixVersion++; flash(); }} onresize={edges} /></div>
        {:else if sec === "timer"}
          <div class="st-pane" data-sec="timer">
            <section class="st-grp"><h4>Lengths</h4><div class="st-card">
              <div class="st-lengths">
                {#each LENGTHS as [k, name, c, , , step] (k)}
                  <div class="st-len" style:--c={c}>
                    <label for="len-{k}"><i></i>{name}</label>
                    <span class="st-len-v"><input id="len-{k}" type="number" inputmode="numeric" min={LIMIT[k][0]} max={LIMIT[k][1]} data-held={k} style:width="calc({String(f[k] ?? "").length || 1}ch + 2px)" bind:value={f[k]} onchange={(e) => num(k, e.currentTarget.value)}><em>min</em></span>
                    <span class="st-pm"><button type="button" aria-label="{name} shorter" onclick={() => num(k, f[k] - step)}>−</button><button type="button" aria-label="{name} longer" onclick={() => num(k, f[k] + step)}>+</button></span>
                  </div>
                {/each}
              </div>
              {#snippet longEvery()}{@render stepper("longEvery", "rounds", "Long break after")}{/snippet}
              {@render row("Long break after", "", longEvery)}
            </div></section>
            <section class="st-grp"><h4>Between phases</h4><div class="st-card">
              {#snippet ab()}{@render tog("autoBreak", "Start breaks automatically")}{/snippet}
              {#snippet af()}{@render tog("autoFocus", "Start focus automatically")}{/snippet}
              {@render row("Start breaks automatically", "Right after a focus round ends", ab)}
              {@render row("Start focus automatically", "Right after a break ends", af)}
            </div></section>
            <section class="st-grp"><h4>Goal</h4><div class="st-card">
              {#snippet goal()}{@render stepper("goal", "rounds", "Daily goal")}{/snippet}
              {@render row("Daily goal", "Shown in Progress and the round row", goal)}
            </div></section>
            {#if extOn}
              <section class="st-grp" id="blockRow"><h4>While you focus</h4><div class="st-card">
                {#snippet blocker()}<span class="st-on"><i></i>On</span>{/snippet}
                {@render row("Site blocker", "Extension connected · blocks sites during focus", blocker)}
              </div><p class="st-cap">Manage the site list in the extension's options.</p></section>
            {/if}
          </div>
        {:else if sec === "breaks"}
          <div class="st-pane" data-sec="breaks"><NudgeSettings bind:this={nudgeUI} api={{ S: api.S, Store: api.Store }} version={mixVersion} onsave={flash} onresize={edges} /></div>
        {:else if sec === "sound"}
          <div class="st-pane" data-sec="sound">
            <section class="st-grp"><h4>When a phase ends</h4><div class="st-card">
              {#snippet bell()}<span class="st-inline"><button class="st-link" type="button" id="testSound" onclick={testSound}>Test</button>{@render tog("sound", "Bell")}</span>{/snippet}
              {#snippet notify()}{@render tog("notify", "Notification")}{/snippet}
              {@render row("Bell", "Also when a task finishes", bell)}
              {@render row("Notification", "When the tab is in the background", notify)}
            </div></section>
            <section class="st-grp"><h4>While you focus</h4><div class="st-card">
              {#snippet ticking()}{@render tog("ticking", "Ticking")}{/snippet}
              {@render row("Ticking", "A soft tap, only while focus runs", ticking)}
              <div class="st-fold" class:open={f.ticking} id="tickingOptions"><div><div class="st-nest">
                <div class="st-opt"><span>Volume</span>{@render vol(f.tickVolume, "Ticking volume", (e) => set("tickVolume", tickVolume(e.currentTarget.value)))}</div>
                <div class="st-opt"><span>Pace</span><div class="st-opt-end">
                  <span class="st-seg" role="group" aria-label="Tick every">{#each PACE as [v, name, p] (v)}<button type="button" aria-pressed={String(f.tickPace === v)} onclick={() => { set("tickPace", tickPace(v)); f.tickPace = v; if (listening) { stopListen(); listen(); } }}><i class="st-pulse" style:--p={p}></i>{name}</button>{/each}</span>
                  <button class="st-btn" class:playing={listening} type="button" id="testTicking" onclick={listen}><span class="st-eq" aria-hidden="true"><i></i><i></i><i></i></span>{listening ? "Stop" : "Listen"}</button>
                </div></div>
              </div></div></div>
              <button class="st-row st-hit" type="button" id="openScape" onclick={() => openSub("scape")}><div class="st-lab"><span>Soundscape</span><small>Breaks: {scapeLine.brk}</small></div><span class="st-val">{scapeLine.focus}{@html CHEV}</span></button>
            </div><p class="st-cap">Sounds play once you've clicked somewhere on the page.</p></section>
          </div>
        {:else if sec === "planning"}
          <div class="st-pane" data-sec="planning">
            <section class="st-grp"><h4>A new day</h4><div class="st-card">
              {#snippet rollover()}<span class="st-seg" role="group" aria-label="Unfinished tasks">{#each [["always", "Move"], ["ask", "Ask"], ["never", "Keep"]] as [v, name] (v)}<button type="button" aria-pressed={String(f.rollover === v)} onclick={() => set("rollover", rolloverMode(v))}>{name}</button>{/each}</span>{/snippet}
              {#snippet dayEndCtl()}<span class="st-inline"><span class="st-reveal" class:open={!!f.workdayEnd}><span><input class="st-time" type="time" step="900" id="sDayEnd" aria-label="Workday ends at" tabindex={f.workdayEnd ? 0 : -1} bind:value={dayEnd} onchange={() => { const v = workdayEnd(dayEnd); if (v) set("workdayEnd", v); }}></span></span><button class="st-tog" type="button" role="switch" aria-checked={String(!!f.workdayEnd)} aria-label="Workday ends" onclick={() => workday(!f.workdayEnd)}></button></span>{/snippet}
              {@render row("Unfinished tasks", "From earlier days: move them to Today, ask each morning, or keep them where they are", rollover)}
              {@render row("Workday ends", "Today points out tasks that won't fit before then", dayEndCtl)}
            </div></section>
            <section class="st-grp"><h4>Each week</h4><div class="st-card">
              {#snippet recap()}{@render tog("weeklyRecap", "Weekly recap")}{/snippet}
              {#snippet plan()}{@render tog("weeklyPlan", "Offer to plan the week")}{/snippet}
              {@render row("Weekly recap", "Last week at a glance on your first visit", recap)}
              {@render row("Offer to plan the week", "Sunday to Tuesday · P opens it any time", plan)}
            </div></section>
          </div>
        {:else if sec === "rooms"}
          <div class="st-pane" data-sec="rooms">
            <section class="st-grp"><div class="st-card">
              {#snippet reactions()}{@render tog("reactions", "Reactions")}{/snippet}
              {@render row("Reactions", "See and send quick reactions like 🎉 in a room", reactions)}
            </div><p class="st-cap">Others in a room only ever see your name and the timer, never your tasks.</p></section>
          </div>
        {:else if sec === "look"}
          <div class="st-pane" data-sec="look">
            <section class="st-grp"><div class="st-card">
              {#snippet themeCtl()}<span class="st-seg" role="group" aria-label="Theme">{#each [["system", "Auto"], ["light", "Light"], ["dark", "Dark"]] as [v, name] (v)}<button type="button" aria-pressed={String(theme.v === v)} onclick={() => pickTheme(v)}>{name}</button>{/each}</span>{/snippet}
              {#snippet float()}{@render tog("autoFloat", "Open the floating timer automatically")}{/snippet}
              {@render row("Theme", "", themeCtl)}
              {#if api.floatable}{@render row("Floating timer", "Opens when a session starts or you switch tabs", float)}{/if}
            </div></section>
            <section class="st-grp"><h4>Phase change</h4><div class="st-card">
              <PhasePreview value={f.phaseMorph} onpick={(v) => set("phaseMorph", phaseMorph(v))} />
            </div><p class="st-cap">Point at a style to see it play. With reduced motion turned on, changes are instant.</p></section>
          </div>
        {:else}
          <div class="st-pane" data-sec="data"><SyncPanel {api} version={syncVersion} /></div>
        {/if}
      </div>
    </div>
  </div>
</div>
