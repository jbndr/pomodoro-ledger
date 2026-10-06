<script>
  import { flushSync } from "svelte";
  import { ALL_DAYS, DAY_NAMES, daysPhrase, durText, hoursPhrase, MAX_TIMES, NUDGE_IDEAS, nudgesOf, parseNudge, scheduleLine, scheduleOf, WEEKDAYS, whenPhrase, whenText, withSchedule } from "../lib/nudges";

  let { api, version = 0, onsave, onresize } = $props();

  const svg = (d, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const CHEV = svg('<path d="M9 6l6 6-6 6"/>'), PLUS = svg('<path d="M12 5v14M5 12h14"/>', 2), CHECK = svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.4), X = svg('<path d="M6 6l12 12M18 6L6 18"/>', 2.2);
  const ICON = { breaks: svg('<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/>'), focus: svg('<path d="M4 12h3l2-5 3 10 2-5h6"/>'), times: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/>') };
  const EVERY = [["1", "Every break"], ["2", "Every 2nd break"], ["3", "Every 3rd break"], ["long", "Long breaks only"]];

  let list = $state([]), openId = $state(""), draft = $state(""), fresh = $state(""), pop = $state(null);
  let root = $state(), popEl = $state();
  let popTok = null;

  // Re-read whenever settings arrive or the sheet opens.
  $effect(() => { version; list = nudgesOf(api.S.settings.nudges).map((n) => ({ id: n.id, text: n.text, on: n.on, preset: !!n.preset, s: scheduleOf(n) })); openId = ""; pop = null; });

  const preview = $derived(draft.trim() ? parseNudge(draft.slice(0, 120)) : null);
  const ideas = $derived(NUDGE_IDEAS.filter((x) => !list.some((n) => n.text.toLowerCase() === x.text.toLowerCase())));
  const popNudge = $derived(pop && list.find((n) => n.id === pop.id));

  function save() {
    api.S.settings.nudges = list.map((n) => withSchedule({ id: n.id, text: n.text.trim(), on: n.on, preset: n.preset }, $state.snapshot(n.s)));
    api.Store.saveSettings();
    onsave?.();
  }

  function expand(id) {
    closePop();
    openId = openId === id ? "" : id;
    flushSync(); onresize?.();
  }
  const closeOpen = () => { if (openId) expand(openId); };

  function add() {
    const p = preview;
    if (!p?.text) return;
    const id = "n" + Date.now().toString(36);
    list.push({ id, text: p.text.slice(0, 80), on: true, preset: false, s: p.schedule });
    fresh = id; draft = ""; openId = "";
    save(); flushSync(); onresize?.();
  }

  function addIdea(x) {
    const id = "n" + Date.now().toString(36);
    list.push({ id, text: x.text, on: true, preset: false, s: scheduleOf(x) });
    fresh = id; save(); flushSync(); onresize?.();
  }

  function remove(id) { list = list.filter((n) => n.id !== id); openId = ""; save(); flushSync(); onresize?.(); }

  function rename(n, el, done) {
    const t = el.value.replace(/\s+/g, " ").trim();
    if (!t) { el.value = n.text; return; }
    if (t !== n.text) { n.text = t; save(); }
    if (done) closeOpen();
  }

  /* The small picker each part of the sentence opens; it always opens below and the list scrolls to fit it. */
  function openPop(n, kind, tok) {
    if (pop && pop.id === n.id && pop.kind === kind) { closePop(); return; }
    pop = { id: n.id, kind }; popTok = tok;
    flushSync(); place(true);
  }
  function closePop(refocus = false) {
    if (!pop) return;
    pop = null; onresize?.();
    if (refocus) popTok?.focus();
  }
  function place(reveal) {
    if (!popEl || !popTok || !root) return;
    const r = root.getBoundingClientRect(), t = popTok.getBoundingClientRect();
    popEl.style.left = Math.max(0, Math.min(t.left - r.left, r.width - popEl.offsetWidth)) + "px";
    popEl.style.top = t.bottom - r.top + 6 + "px";
    onresize?.();
    if (reveal) popEl.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  const changed = (close = false) => { save(); if (close) closePop(); else { flushSync(); place(true); } };

  function minutes(n, d) { n.s.when = "focus"; n.s.minutes = Math.max(15, Math.min(240, n.s.minutes + d)); changed(); }
  function setTime(n, i, v) { if (!/^\d\d:\d\d$/.test(v)) return; n.s.times[i] = v; n.s.times = [...new Set(n.s.times)].sort(); changed(); }
  function addTime(n) { const [h, m] = (n.s.times.at(-1) || "11:00").split(":").map(Number); n.s.times = [...new Set([...n.s.times, String(Math.min(21, h + 3)).padStart(2, "0") + ":" + String(m).padStart(2, "0")])].sort(); changed(); }
  function toggleDay(n, d) { n.s.days = n.s.days.includes(d) ? n.s.days.filter((x) => x !== d) : [...n.s.days, d].sort(); changed(); }
  function hours(n, e, v) { if (e.target.closest("input")) return; n.s.between = v; changed(!v); }
  const activate = (fn) => (e) => { if (e.key === "Enter" || e.key === " ") { if (e.target.closest("input, button") && e.target !== e.currentTarget) return; e.preventDefault(); fn(e); } };

  /** Escape closes the picker, then the open nudge; true when it was used. */
  export function escape() {
    if (pop) { closePop(true); return true; }
    if (openId) { const id = openId; closeOpen(); root?.querySelector(`[data-nudge="${id}"] .st-nudge-hit`)?.focus(); return true; }
    if (draft) { draft = ""; return true; }
    return false;
  }

  // A click anywhere else closes the picker and then the open nudge.
  $effect(() => {
    const down = (e) => {
      const t = e.target;
      if (pop && !popEl?.contains(t) && !t.closest?.(".st-tok")) closePop();
      if (openId && !t.closest?.(".st-nudge.open, .st-pop, .st-nudge-hit, .st-chev")) closeOpen();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  });
</script>

<div class="st-nudges" bind:this={root}>
  <section class="st-grp"><h4>Nudges</h4><div class="st-card">
    {#each list as n (n.id)}
      <div class="st-nudge" class:open={openId === n.id} class:fresh={fresh === n.id} data-nudge={n.id}>
        <div class="st-nudge-row">
          <button class="st-nudge-hit" type="button" aria-expanded={String(openId === n.id)} onclick={() => expand(n.id)}><span>{n.text}</span><small>{@html ICON[n.s.when]}{scheduleLine(n.s)}</small></button>
          <input class="st-nudge-name" type="text" maxlength="80" value={n.text} aria-label="Nudge text" tabindex={openId === n.id ? 0 : -1} onchange={(e) => rename(n, e.currentTarget, false)} onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); rename(n, e.currentTarget, true); } }}>
          <span class="st-nudge-side">
            <button class="st-tog" type="button" role="switch" aria-checked={String(n.on)} aria-label={n.text} onclick={() => { n.on = !n.on; save(); }}></button>
            <button class="st-chev" type="button" aria-label={openId === n.id ? "Close" : "Edit " + n.text} title={openId === n.id ? "Close" : "Edit"} onclick={() => expand(n.id)}>{@html CHEV}</button>
          </span>
        </div>
        <div class="st-fold" class:open={openId === n.id}><div><div class="st-ned">
          <p class="st-sent">Shows up <button class="st-tok" type="button" aria-haspopup="dialog" aria-expanded={String(pop?.id === n.id && pop.kind === "when")} tabindex={openId === n.id ? 0 : -1} onclick={(e) => openPop(n, "when", e.currentTarget)}>{whenPhrase(n.s)}</button>, <button class="st-tok" type="button" aria-haspopup="dialog" aria-expanded={String(pop?.id === n.id && pop.kind === "days")} tabindex={openId === n.id ? 0 : -1} onclick={(e) => openPop(n, "days", e.currentTarget)}>{daysPhrase(n.s)}</button>, <button class="st-tok" type="button" aria-haspopup="dialog" aria-expanded={String(pop?.id === n.id && pop.kind === "hours")} tabindex={openId === n.id ? 0 : -1} onclick={(e) => openPop(n, "hours", e.currentTarget)}>{hoursPhrase(n.s)}</button>.</p>
          <div class="st-ned-foot"><button class="st-link danger" type="button" tabindex={openId === n.id ? 0 : -1} onclick={() => remove(n.id)}>Delete</button><button class="st-btn ink" type="button" tabindex={openId === n.id ? 0 : -1} onclick={closeOpen}>Done</button></div>
        </div></div></div>
      </div>
    {/each}
    <label class="st-nadd">{@html PLUS}<input type="text" id="nudgeAdd" autocomplete="off" maxlength="120" placeholder="Add a nudge, like “Drink water every 90 min”" aria-label="Add a nudge" bind:value={draft} onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}></label>
    <div class="st-fold" class:open={!!preview}><div><div class="st-nadd-pre">
      {#if preview}
        <div class="st-line"><b>{preview.text || "…"}</b><span class="st-pchip">{whenPhrase(preview.schedule)}</span>{#if preview.schedule.days.length < 7}<span class="st-pchip">{daysPhrase(preview.schedule)}</span>{/if}{#if preview.schedule.between}<span class="st-pchip">{hoursPhrase(preview.schedule)}</span>{/if}<kbd>Enter</kbd></div>
        {#if !preview.found}<span class="st-cap">Shows in every break. Add when in your own words, like “every 2nd break”, “every hour” or “at 11 and 15:30”.</span>{/if}
      {/if}
    </div></div></div>
  </div><p class="st-cap">One nudge shows under the dial during a break, after Keep going has had its minute. They never interrupt focus. Tap it when you've done it; the weekly recap counts them.</p></section>

  {#if ideas.length}
    <section class="st-grp"><h4>Ideas</h4><div class="st-ideas">
      {#each ideas as x (x.id)}<button class="st-idea" type="button" onclick={() => addIdea(x)}>{@html PLUS}{x.text}<small>{whenText(scheduleOf(x)).toLowerCase()}</small></button>{/each}
    </div></section>
  {/if}

  {#if pop && popNudge}
    {@const n = popNudge}
    {@const ck = (on) => (on ? CHECK : "")}
    <div class="st-pop" role="dialog" aria-label={pop.kind === "when" ? "When it shows" : pop.kind === "days" ? "Days" : "Hours"} bind:this={popEl}>
      {#if pop.kind === "when"}
        <h5>In breaks</h5>
        {#each EVERY as [e, label] (e)}<button class="st-pi" type="button" onclick={() => { n.s.when = "breaks"; n.s.every = e; changed(true); }}><i class="st-ck">{@html ck(n.s.when === "breaks" && n.s.every === e)}</i>{label}</button>{/each}
        <hr>
        <div class="st-pi" role="button" tabindex="0" onclick={(e) => { if (!e.target.closest("button")) { n.s.when = "focus"; changed(); } }} onkeydown={activate(() => { n.s.when = "focus"; changed(); })}><i class="st-ck">{@html ck(n.s.when === "focus")}</i>After<span class="st-step"><button type="button" aria-label="Less focus" onclick={() => minutes(n, -15)}>−</button><output>{durText(n.s.minutes)}</output><button type="button" aria-label="More focus" onclick={() => minutes(n, 15)}>+</button></span></div>
        <p class="st-cap st-pop-cap">of focus, in the next break</p>
        <hr>
        <div class="st-pi" role="button" tabindex="0" onclick={() => { n.s.when = "times"; changed(); }} onkeydown={activate(() => { n.s.when = "times"; changed(); })}><i class="st-ck">{@html ck(n.s.when === "times")}</i>At set times</div>
        {#if n.s.when === "times"}
          <div class="st-ptimes">
            {#each n.s.times as t, i (t + i)}<span class="st-tchip"><input class="st-time" type="time" value={t} aria-label="Time {i + 1}" onchange={(e) => setTime(n, i, e.currentTarget.value)}>{#if n.s.times.length > 1}<button type="button" aria-label="Remove {t}" onclick={() => { n.s.times = n.s.times.filter((_, j) => j !== i); changed(); }}>{@html X}</button>{/if}</span>{/each}
            {#if n.s.times.length < MAX_TIMES}<button class="st-link" type="button" onclick={() => addTime(n)}>+ Add</button>{/if}
          </div>
          <p class="st-cap st-pop-cap">Waits for the first break after each time.</p>
        {/if}
      {:else if pop.kind === "days"}
        <div class="st-pdays">{#each DAY_NAMES as d, i (d)}<button class="st-day" type="button" aria-pressed={String(n.s.days.includes(i))} onclick={() => toggleDay(n, i)}>{d}</button>{/each}</div>
        <div class="st-pset">{#each [[WEEKDAYS, "Weekdays"], [[5, 6], "Weekends"], [ALL_DAYS, "Every day"]] as [d, label] (label)}<button type="button" onclick={() => { n.s.days = [...d]; changed(); }}>{label}</button>{/each}</div>
      {:else}
        <button class="st-pi" type="button" onclick={(e) => hours(n, e, false)}><i class="st-ck">{@html ck(!n.s.between)}</i>At any time</button>
        <div class="st-pi" role="button" tabindex="0" onclick={(e) => hours(n, e, true)} onkeydown={activate((e) => hours(n, e, true))}><i class="st-ck">{@html ck(n.s.between)}</i>Between<span class="st-pto"><input class="st-time" type="time" value={n.s.from} aria-label="From" onchange={(e) => { n.s.from = e.currentTarget.value || n.s.from; n.s.between = true; changed(); }}>–<input class="st-time" type="time" value={n.s.to} aria-label="Until" onchange={(e) => { n.s.to = e.currentTarget.value || n.s.to; n.s.between = true; changed(); }}></span></div>
      {/if}
    </div>
  {/if}
</div>
