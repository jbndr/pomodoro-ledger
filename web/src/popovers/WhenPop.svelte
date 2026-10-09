<script>
  import { flushSync } from "svelte";
  import { calMove, monthGrid, monthOf, stepMonth, weekStartOf } from "../lib/calendar";
  import { addDays, dayKey, keyTime } from "../lib/dates";
  import { anchored, cleanRepeat, firstDue, isPaused, MAX_N, ordinal } from "../lib/repeat";
  import { whenOptions } from "../lib/when";
  import { whenPop } from "./state.svelte";

  let { api } = $props();

  const ICON = {
    today: '<svg class="ic-today" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>',
    day: '<svg class="ic-day" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    week: '<svg class="ic-week" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h12M12 6l6 6-6 6M20 5v14"/></svg>',
    repeat: '<svg class="ic-repeat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l3 3-3 3"/><path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20"/><path d="M7 21l-3-3 3-3"/><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4"/></svg>',
    later: '<svg class="ic-later" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="17" height="5" rx="1.5"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/></svg>',
  };
  const weekStart = weekStartOf(navigator.language);

  let el, panel, input, grid;
  let typed = $state(""), idx = $state(0), month = $state(0), focus = $state(""), preview = $state(""), task = $state.raw(null), opened = $state(0);
  let rule = $state.raw(null);
  let anchor = null, onPick = null, onRepeat = null;

  const items = $derived.by(() => { opened; return whenOptions(typed); });
  const cal = $derived.by(() => {
    opened;
    const tk = api.todayKey(), load = new Map();
    for (const t of api.openOf(api.S.tasks)) { const k = api.isToday(t) ? tk : t.plan; if (k) load.set(k, (load.get(k) || 0) + 1); }
    return { tk, load, days: monthGrid(month, weekStart) };
  });

  /** Keeps the highlight on a choice that can be picked, and shows a typed day in the calendar. */
  function sync() {
    const first = items.findIndex((o) => !o.off);
    if (idx < first || idx >= items.length || items[idx].off) idx = first;
    const head = items[0];
    const parsed = head && head.parsed && head.g !== "later" ? (head.g === "today" ? api.todayKey() : head.g) : "";
    if (parsed !== preview) {
      preview = parsed;
      if (parsed) { month = monthOf(keyTime(parsed)); focus = parsed; }
    }
  }

  /** Opens under `a` for task `t`; `pick` and `repeat` get the choices, otherwise the task changes. */
  export function open(a, t, pick, repeat) {
    onPick = pick || null; onRepeat = repeat || null; rule = cleanRepeat(t.repeat);
    const tk = api.todayKey(), start = t.plan && t.plan > tk ? t.plan : dayKey(addDays(Date.now(), 1));
    task = t; anchor = a; focus = start; idx = 0; preview = ""; month = monthOf(keyTime(start));
    typed = input.value = ""; opened++;
    whenPop.hidden = false;
    sync();
    flushSync();
    // On phones a focused field would pop the keyboard over the calendar.
    if (matchMedia("(hover: hover)").matches) input.focus({ preventScroll: true }); else panel.focus({ preventScroll: true });
  }

  export function close(refocus) {
    if (whenPop.hidden) return;
    whenPop.hidden = true;
    flushSync();
    const a = anchor;
    if (!refocus || !a || !a.isConnected) return;
    a.focus({ preventScroll: true });
    if (document.activeElement !== a) a.closest(".task")?.focus({ preventScroll: true });
  }

  function choose(g) {
    const t = task, cb = onPick;
    close(true);
    if (!g) return;
    if (cb) cb(g); else if (t) api.scheduleTask(t.id, g);
  }

  function pickItem(o) {
    if (!o || o.off) return;
    if (o.repeat) { const { from, ...r } = o.repeat; setRule(r); close(true); } else choose(o.g);
  }

  const dayText = (k) => api.fmtDate(keyTime(k), { weekday: "short", day: "numeric", month: "short" });
  function pause(days) {
    const t = task;
    close(true);
    if (t) api.pauseRepeat(t.id, days ? dayKey(addDays(Date.now(), days)) : null);
  }
  function resume() {
    const t = task;
    close(true);
    if (t) api.resumeRepeat(t.id);
  }

  const startKey = () => { const tk = api.todayKey(); return task && task.plan && task.plan > tk ? task.plan : tk; };

  function setRule(r) {
    rule = r = r && anchored(r, startKey());
    if (onRepeat) onRepeat(r);
    else if (task) { api.setRepeat(task.id, r); task = api.S.tasks.get(task.id) || task; }
  }

  function setKind(every) {
    const base = new Date(keyTime(startKey()));
    const n = rule && every in MAX_N ? Math.min(rule.n || 1, MAX_N[every]) : 1;
    setRule(!every ? null : cleanRepeat(every === "week" ? { every, days: [base.getDay()], n } : every === "month" ? { every, date: base.getDate(), n } : { every, n }));
  }

  function toggleDay(d) {
    const days = rule.days.includes(d) ? rule.days.filter((x) => x !== d) : [...rule.days, d];
    if (days.length) setRule(cleanRepeat({ ...rule, days }));
  }

  function stepEvery(by) {
    const { from, ...r } = rule, n = Math.max(1, Math.min(MAX_N[r.every], (r.n || 1) + by));
    if (n !== (r.n || 1)) setRule(cleanRepeat({ ...r, n }));
  }

  function calFocus(k) {
    if (k < api.todayKey()) k = api.todayKey();
    focus = k; month = monthOf(keyTime(k));
    flushSync();
    grid.querySelector('[tabindex="0"]')?.focus({ preventScroll: true });
  }

  function inputKey(e) {
    const k = e.key;
    const step = (dir) => { let i = idx; do { i = (i + dir + items.length) % items.length; } while (items[i].off && i !== idx); idx = i; sync(); };
    if (k === "ArrowDown") step(1);
    else if (k === "ArrowUp") step(-1);
    else if (k === "Enter") pickItem(items[idx]);
    else if (k === "Escape") close(true);
    else return;
    e.preventDefault(); e.stopPropagation();
  }

  function dayKeydown(e) {
    e.stopPropagation();
    if (e.key === "Escape") close(true);
    else {
      const k = calMove(focus || api.todayKey(), e.key, weekStart);
      if (!k) return;
      calFocus(k);
    }
    e.preventDefault();
  }

  const KINDS = [["", "Never"], ["day", "Daily"], ["weekday", "Weekdays"], ["week", "Weekly"], ["month", "Monthly"]];
  const UNIT = { day: "day", week: "week", month: "month" };
  const every = (r) => {
    const n = r.n || 1, unit = n > 1 ? n + " " + UNIT[r.every] + "s" : UNIT[r.every];
    return (n === 2 && r.every === "day" ? "Every other day" : "Every " + unit) + (r.every === "month" ? " on the " + ordinal(r.date) : "");
  };
  const next = $derived(rule ? api.fmtDate(keyTime(firstDue(rule, startKey())), { weekday: "short", day: "numeric", month: "short" }) : "");

  function kindKey(e, i) {
    const j = e.key === "ArrowRight" ? (i + 1) % KINDS.length : e.key === "ArrowLeft" ? (i - 1 + KINDS.length) % KINDS.length : -1;
    if (j < 0) return;
    e.preventDefault();
    setKind(KINDS[j][0]);
    flushSync();
    panel.querySelector(".rep-kinds [aria-checked='true']")?.focus();
  }

  const title = $derived(task && task.title ? task.title : "New task");
  const todayNote = $derived.by(() => { opened; return api.fmtDate(Date.now(), { weekday: "short" }); });

  const hovered = (e) => { const li = e.target.closest("li"); return li ? +li.dataset.i : -1; };
  const dayLabel = (d) => api.fmtDate(d.t, { weekday: "long", day: "numeric", month: "long" }) + (cal.load.get(d.key) ? ", " + api.plural(cal.load.get(d.key), "task") + " planned" : "");
</script>

<svelte:document onpointerdown={(e) => { if (!whenPop.hidden && e.target === el) close(true); }} />

<div class="when-pop" id="whenPop" hidden={whenPop.hidden} bind:this={el}>
<div
  class="when-panel"
  role="dialog"
  aria-modal="true"
  aria-labelledby="whenTitle"
  tabindex="-1"
  bind:this={panel}
  onkeydown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(true); } }}
>
  <div class="when-head">
    <div><span>Schedule</span><strong id="whenTitle">{title}</strong></div>
    <button class="icon-btn" type="button" aria-label="Close" onclick={() => close(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  </div>
  <label class="when-field">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>
    <input type="text" id="whenInput" placeholder="Type a date: fri, 12 oct, every mon" autocomplete="off" spellcheck="false" aria-label="When" aria-controls="whenList" aria-autocomplete="list" aria-activedescendant={"when-" + idx} bind:this={input} bind:value={() => typed, (v) => { typed = v; idx = 0; sync(); }} onkeydown={inputKey} />
  </label>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <ul
    class="when-list"
    id="whenList"
    role="listbox"
    aria-label="Suggestions"
    onclick={(e) => pickItem(items[hovered(e)])}
    onpointermove={(e) => { const i = hovered(e); if (i >= 0 && !items[i].off && i !== idx) idx = i; }}
  >
    {#each items as o, i (i)}
      <li role="option" id={"when-" + i} data-i={i} aria-disabled={o.off ? "true" : null} class:parsed={o.parsed || o.off} class:act={i === idx} aria-selected={String(i === idx)} title={o.key ? "Type " + o.key : null}>{@html ICON[o.icon]}<span>{o.title}</span><em>{o.note || (o.g === "today" && !o.parsed ? todayNote : "")}</em>{#if o.parsed}<kbd aria-hidden="true">↵</kbd>{/if}</li>
    {/each}
  </ul>
  <div class="cal-head">
    <strong id="calMonth" aria-live="polite">{api.fmtDate(month, { month: "long", year: "numeric" })}</strong>
    <button class="icon-btn" type="button" data-cal-step="-1" aria-label="Previous month" onclick={() => (month = stepMonth(month, -1))}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>
    <button class="icon-btn" type="button" data-cal-step="1" aria-label="Next month" onclick={() => (month = stepMonth(month, 1))}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>
  </div>
  <div class="cal-grid" id="calGrid" bind:this={grid}>
    {#each cal.days.slice(0, 7) as d, i (i)}
      <span class="wd" aria-hidden="true">{api.fmtDate(d.t, { weekday: "narrow" })}</span>
    {/each}
    {#each cal.days as d, i (i)}
      {@const n = cal.load.get(d.key) || 0}
      <button
        type="button"
        data-day={d.key}
        tabindex={d.key === focus ? 0 : -1}
        disabled={d.key < cal.tk}
        class={(d.out ? "out " : "") + (d.key === cal.tk ? "today " : "") + (d.key === preview ? "preview" : "")}
        aria-pressed={String(!!task && task.plan === d.key)}
        aria-label={dayLabel(d)}
        onclick={() => choose(d.key)}
        onkeydown={dayKeydown}
      >{d.date}{#if n}<i class:busy={n > 2}></i>{/if}</button>
    {/each}
  </div>
  <div class="when-repeat">
    <div class="rep-head">{@html ICON.repeat}<span id="repLabel">Repeat</span>{#if rule && !(task && !onRepeat && isPaused(task, api.todayKey()))}<em>Next {next}</em>{/if}</div>
    <div class="seg-ctl rep-kinds" role="radiogroup" aria-labelledby="repLabel">
      {#each KINDS as [k, name], i (k)}
        {@const on = (rule ? rule.every : "") === k}
        <button type="button" role="radio" aria-checked={String(on)} tabindex={on ? 0 : -1} onclick={() => setKind(k)} onkeydown={(e) => kindKey(e, i)}>{name}</button>
      {/each}
    </div>
    {#if rule && rule.every !== "weekday"}
      {@const n = rule.n || 1}
      <div class="rep-every">
        <button type="button" aria-label="Repeat more often" disabled={n <= 1} onclick={() => stepEvery(-1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg></button>
        <output aria-live="polite">{every(rule)}</output>
        <button type="button" aria-label="Repeat less often" disabled={n >= MAX_N[rule.every]} onclick={() => stepEvery(1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg></button>
      </div>
    {/if}
    {#if rule && rule.every === "week"}
      <div class="rep-days" role="group" aria-label="Repeat on">
        {#each cal.days.slice(0, 7) as d (d.key)}
          {@const wd = new Date(d.t).getDay()}
          <button type="button" aria-pressed={String(rule.days.includes(wd))} aria-label={api.fmtDate(d.t, { weekday: "long" })} onclick={() => toggleDay(wd)}>{api.fmtDate(d.t, { weekday: "short" }).slice(0, 2)}</button>
        {/each}
      </div>
    {/if}
    {#if rule && task && !onRepeat && task.repeat}
      {@const held = isPaused(task, api.todayKey())}
      <div class="rep-pause">
        {#if held}
          <span>{task.paused.until ? "Paused · back " + dayText(task.plan) : "Paused until you resume it"}</span>
          <button class="rep-resume" type="button" onclick={resume}>Resume</button>
        {:else}
          <span id="pauseLabel">Pause</span>
          <div class="rep-pause-opts" role="group" aria-labelledby="pauseLabel">
            <button type="button" onclick={() => pause(7)}>1 week</button><button type="button" onclick={() => pause(14)}>2 weeks</button><button type="button" onclick={() => pause(0)}>Until I resume</button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
</div>
