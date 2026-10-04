<script>
  import { flushSync } from "svelte";
  import { calMove, monthGrid, monthOf, stepMonth, weekStartOf } from "../lib/calendar";
  import { addDays, dayKey, keyTime } from "../lib/dates";
  import { cleanRepeat, ordinal } from "../lib/repeat";
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

  let el, input, grid;
  let typed = $state(""), idx = $state(0), month = $state(0), focus = $state(""), preview = $state(""), task = $state.raw(null), opened = $state(0);
  let left = $state(0), top = $state(0), origin = $state("top right");
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
    // Hover-only buttons have no box while hidden; fall back to their row.
    let r = a.getBoundingClientRect();
    if (!r.width && !r.height) r = (a.closest(".task") || document.getElementById("taskList")).getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    const above = r.bottom + 6 + h > innerHeight - 8 && r.top - 6 - h > 8;
    left = Math.max(12, Math.min(r.right - w, innerWidth - w - 12));
    top = Math.max(8, above ? r.top - 6 - h : Math.min(r.bottom + 6, innerHeight - h - 8));
    origin = (above ? "bottom" : "top") + " right";
    flushSync();
    // On phones a focused field would pop the keyboard over the calendar.
    if (matchMedia("(hover: hover)").matches) input.focus({ preventScroll: true }); else el.focus({ preventScroll: true });
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
    if (o.repeat) { setRule(o.repeat); close(true); } else choose(o.g);
  }

  function setRule(r) {
    rule = r;
    if (onRepeat) onRepeat(r);
    else if (task) { api.setRepeat(task.id, r); task = api.S.tasks.get(task.id) || task; }
    flushSync();
    top = Math.max(8, Math.min(top, innerHeight - el.offsetHeight - 8));
  }

  function setKind(every) {
    const tk = api.todayKey(), base = new Date(keyTime(task && task.plan && task.plan > tk ? task.plan : tk));
    setRule(!every ? null : every === "week" ? { every, days: [base.getDay()] } : every === "month" ? { every, date: base.getDate() } : { every });
  }

  function toggleDay(d) {
    const days = rule.days.includes(d) ? rule.days.filter((x) => x !== d) : [...rule.days, d];
    if (days.length) setRule(cleanRepeat({ every: "week", days }));
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

  const hovered = (e) => { const li = e.target.closest("li"); return li ? +li.dataset.i : -1; };
  const dayLabel = (d) => api.fmtDate(d.t, { weekday: "long", day: "numeric", month: "long" }) + (cal.load.get(d.key) ? ", " + api.plural(cal.load.get(d.key), "task") + " planned" : "");
</script>

<svelte:window onresize={() => close()} onscrollcapture={(e) => { if (!el.contains(e.target)) close(); }} />
<svelte:document onpointerdown={(e) => { if (!whenPop.hidden && !e.target.closest("#whenPop, [data-sched]")) close(); }} />

<div
  class="when-pop"
  id="whenPop"
  role="dialog"
  aria-label="When"
  tabindex="-1"
  hidden={whenPop.hidden}
  style:left={left + "px"}
  style:top={top + "px"}
  style:transform-origin={origin}
  bind:this={el}
  onkeydown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(true); } }}
>
  <input type="text" id="whenInput" placeholder="When? fri, 12 oct, every mon…" autocomplete="off" spellcheck="false" aria-label="When" aria-controls="whenList" aria-autocomplete="list" aria-activedescendant={"when-" + idx} bind:this={input} bind:value={() => typed, (v) => { typed = v; idx = 0; sync(); }} onkeydown={inputKey} />
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
      <li role="option" id={"when-" + i} data-i={i} aria-disabled={o.off ? "true" : null} class:parsed={o.parsed} class:act={i === idx} aria-selected={String(i === idx)}>{@html ICON[o.icon]}<span>{o.title}</span>{#if o.note}<em>{o.note}</em>{/if}{#if o.key}<kbd>{o.key}</kbd>{/if}</li>
    {/each}
  </ul>
  <div class="cal-head">
    <button class="icon-btn" type="button" data-cal-step="-1" aria-label="Previous month" onclick={() => (month = stepMonth(month, -1))}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>
    <strong id="calMonth" aria-live="polite">{api.fmtDate(month, { month: "long", year: "numeric" })}</strong>
    <button class="icon-btn" type="button" data-cal-step="1" aria-label="Next month" onclick={() => (month = stepMonth(month, 1))}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>
  </div>
  <div class="cal-grid" id="calGrid" bind:this={grid}>
    {#each cal.days.slice(0, 7) as d, i (i)}
      <span class="wd" aria-hidden="true">{api.fmtDate(d.t, { weekday: "narrow" })}</span>
    {/each}
    {#each cal.days as d, i (i)}
      {@const n = Math.min(3, cal.load.get(d.key) || 0)}
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
      >{d.date}{#if n}<i>{#each { length: n } as _, j (j)}<b></b>{/each}</i>{/if}</button>
    {/each}
  </div>
  <div class="cal-foot"><i aria-hidden="true"></i>Tasks already planned that day</div>
  <div class="when-repeat">
    <label for="whenRepeat">{@html ICON.repeat}Repeat</label>
    <select id="whenRepeat" value={rule ? rule.every : ""} onchange={(e) => setKind(e.currentTarget.value)}>
      <option value="">Never</option><option value="day">Every day</option><option value="weekday">Every weekday</option><option value="week">Every week</option><option value="month">Every month</option>
    </select>
    {#if rule && rule.every === "week"}
      <div class="rep-days" role="group" aria-label="Repeat on">
        {#each cal.days.slice(0, 7) as d (d.key)}
          {@const wd = new Date(d.t).getDay()}
          <button type="button" aria-pressed={String(rule.days.includes(wd))} aria-label={api.fmtDate(d.t, { weekday: "long" })} onclick={() => toggleDay(wd)}>{api.fmtDate(d.t, { weekday: "narrow" })}</button>
        {/each}
      </div>
    {:else if rule && rule.every === "month"}
      <span class="rep-note">On the {ordinal(rule.date)}</span>
    {/if}
  </div>
</div>
