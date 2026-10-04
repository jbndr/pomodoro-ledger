<script>
  import { flushSync } from "svelte";
  import { addDays, dayKey } from "../lib/dates";
  import { firstWeek, recapDue, weekRecap, weekStart } from "../lib/insights";
  import { labelHue } from "../lib/tasks";

  const LABELS = 3, DONE = 3;
  const slots = (list, n) => [...list, ...Array(Math.max(0, n - list.length)).fill(null)].slice(0, n);

  let { api } = $props();
  let start = $state(0), version = $state(0), sheet, back = null, tries = 0;

  const thisWeek = () => weekStart(Date.now());
  const r = $derived.by(() => { version; return start ? weekRecap(api.viewTasks(), start) : null; });
  const first = $derived.by(() => { version; return firstWeek(api.viewTasks()); });
  const delta = $derived(r ? r.ms - r.before.ms : 0);
  const maxDay = $derived(r ? Math.max(1, ...r.days.map((d) => d.ms)) : 1);
  const title = $derived(start === thisWeek() ? "This week so far" : start === addDays(thisWeek(), -7) ? "Last week" : "Week of " + api.fmtDate(start, { day: "numeric", month: "long" }));
  const range = $derived(api.fmtDate(start, { weekday: "short", day: "numeric", month: "short" }) + " – " + api.fmtDate(addDays(start, 6), { weekday: "short", day: "numeric", month: "short" }));
  const done = $derived(r ? r.finished.slice(0, r.finished.length > DONE ? DONE - 1 : DONE) : []);
  let auto = $state(true);

  /** Opens on a week, last week by default. */
  export function open(week) {
    start = week || addDays(thisWeek(), -7);
    version++;
    auto = api.S.settings.weeklyRecap !== false;
    if (api.overlayHidden()) back = document.activeElement;
    api.setOverlay("#recap", true);
    flushSync();
    sheet.focus({ preventScroll: true });
  }

  export function close() {
    api.setOverlay("#recap", false);
    if (back && back.isConnected) back.focus({ preventScroll: true });
    back = null;
  }

  /** Opens last week's recap on the first visit of a new week, once settings have synced and nothing else is going on. */
  export function maybeOpen() {
    const s = api.S.settings;
    if (s.weeklyRecap === false || (api.preview() && !api.DEMO) || !api.overlayHidden()) return;
    if (api.syncing() && tries++ < 8) { setTimeout(maybeOpen, 1000); return; }
    if (api.T.status === "running" || document.body.classList.contains("zen")) return;
    const week = recapDue(api.viewTasks(), Date.now(), s.recapSeen);
    if (week == null) return;
    s.recapSeen = dayKey(thisWeek());
    api.Store.saveSettings();
    open(week);
  }

  function toggleAuto(e) {
    api.S.settings.weeklyRecap = auto = e.currentTarget.checked;
    api.Store.saveSettings();
  }

  const go = (n) => { start = addDays(start, 7 * n); };
  const parts = (ms) => api.fmtDur(ms).split(" ").map((p) => [p.slice(0, -1), p.slice(-1)]);
  const dayTip = (d) => "<b>" + api.fmtDate(d.t, { weekday: "long", day: "numeric", month: "short" }) + "</b><br>" + (d.ms ? api.fmtDur(d.ms) + " · " + api.plural(d.cycles, "cycle") : "No focus");
</script>

<!-- Escape is handled by the app-wide keydown handler. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" id="recap" hidden onclick={(e) => { if (e.target.id === "recap") close(); }}>
  <div class="sheet recap-sheet" role="dialog" aria-modal="true" aria-labelledby="recapH" tabindex="-1" bind:this={sheet}>
    <div class="recap-head">
      <div><h2 id="recapH">{title}</h2><span class="sub">{range}</span></div>
      <div class="recap-nav">
        <button class="icon-btn" type="button" aria-label="Previous week" disabled={first == null || start <= first} onclick={() => go(-1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>
        <button class="icon-btn" type="button" aria-label="Next week" disabled={start >= thisWeek()} onclick={() => go(1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>
        <button class="icon-btn" type="button" aria-label="Close" onclick={close}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
    </div>
    {#if r}
      <div class="recap-hero">
        <div class="k">Focus</div>
        <div class="v">{#each parts(r.ms) as [n, unit], i (i)}{i ? " " : ""}{n}<small>{unit}</small>{/each}</div>
        <div class="s">{#if r.before.ms}<span class={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "+" : "−"}{api.fmtDur(Math.abs(delta))}</span> vs the week before{:else}No focus the week before{/if}</div>
      </div>
      <div class="recap-stats">
        <div><b>{r.cycles}</b><span>{r.cycles === 1 ? "cycle" : "cycles"}</span></div>
        <div><b>{r.active}<small>/7</small></b><span>days with focus</span></div>
        <div><b>{r.finished.length}</b><span>{r.finished.length === 1 ? "task" : "tasks"} finished</span></div>
        <div><b>{r.streak}</b><span>{r.streak === 1 ? "day" : "days"} streak</span></div>
      </div>
      <div class="recap-days">
        <div class="recap-bars">
          {#each r.days as d (d.t)}
            <div class="recap-day" class:best={r.best && d.t === r.best.t} data-tip={dayTip(d)}>
              <i class:on={d.ms} style:height={d.ms ? Math.max(6, (d.ms / maxDay) * 100) + "%" : null}></i>
              <span>{api.fmtDate(d.t, { weekday: "narrow" })}</span>
            </div>
          {/each}
        </div>
        <p>{#if r.best}Best day: <b>{api.fmtDate(r.best.t, { weekday: "long" })}</b>, {api.fmtDur(r.best.ms)}{:else}No focus this week{/if}</p>
      </div>
      <section class="recap-list">
        <h3>Top labels</h3>
        {#each slots(r.labels, LABELS) as l, i (i)}
          {#if l}
            <div class="recap-label">
              <span class="by-name" class:none={!l.name}><i class="label-dot" class:none={!l.name} style:--h={l.name ? labelHue(l.name) : null}></i><span>{l.name || "No label"}</span></span>
              <div class="hbar"><b style:width={(l.ms / r.labels[0].ms) * 100 + "%"}></b></div>
              <em>{api.fmtDur(l.ms)}</em>
            </div>
          {:else if i === 0}
            <div class="recap-label"><span class="by-name none">No labels this week</span></div>
          {:else}
            <div class="recap-label" aria-hidden="true">&nbsp;</div>
          {/if}
        {/each}
      </section>
      <section class="recap-list">
        <h3>Finished</h3>
        <ul>
          {#each slots(done, DONE) as title, i (i)}
            {#if title}<li><span>{title}</span></li>
            {:else if i === 0}<li class="more">Nothing finished</li>
            {:else if i === DONE - 1 && r.finished.length > DONE}<li class="more">and {r.finished.length - DONE + 1} more</li>
            {:else}<li class="more" aria-hidden="true">&nbsp;</li>{/if}
          {/each}
        </ul>
      </section>
    {/if}
    <div class="sheet-foot">
      <label class="toggle recap-auto"><span>Show each new week</span><input type="checkbox" checked={auto} onchange={toggleAuto}></label>
      <button class="btn solid" type="button" onclick={close}>Done</button>
    </div>
  </div>
</div>
