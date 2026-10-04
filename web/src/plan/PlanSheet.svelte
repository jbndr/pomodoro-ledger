<script>
  import { flushSync } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { calm, hold } from "../dom";
  import { addDays, dayKey, keyTime } from "../lib/dates";
  import { weekRecap } from "../lib/insights";
  import { sameLabel } from "../lib/labels";
  import { rovingIndex, spinValue } from "../lib/settings";
  import { cyclesOf, labelHue, projectOf } from "../lib/tasks";
  import { labelChoices, MAX_OBJECTIVES, objectiveProgress, planOf, planWeek, suggestTarget, TARGET, weekLeftovers } from "../lib/weekPlan";

  let { api } = $props();

  const STEPS = [["review", "Look back"], ["left", "Leftovers"], ["goals", "Objectives"]];
  const MINUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>';
  const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';

  let step = $state(0), now = $state(0), week = $state(""), review = $state("");
  let r = $state.raw(null), past = $state.raw(null), left = $state.raw([]), choices = $state.raw([]);
  let fates = $state({}), goals = $state([]), naming = $state(false), newName = $state("");
  let sheet, body, back = null;

  const ahead = $derived(week > dayKey(now));
  const short = (k) => api.fmtDate(keyTime(k), { day: "numeric", month: "short" });
  const span = (k) => short(k) + " – " + short(dayKey(addDays(keyTime(k), 6)));
  const chips = $derived([...goals.filter((g) => !choices.some((c) => sameLabel(c.name, g.label))).map((g) => ({ name: g.label, cycles: 0, ms: 0 })), ...choices]);
  const picked = (name) => goals.some((g) => sameLabel(g.label, name));
  const before = (name) => choices.find((c) => sameLabel(c.name, name));
  const parts = (ms) => api.fmtDur(ms).split(" ").map((p) => [p.slice(0, -1), p.slice(-1)]);
  const FATES = $derived([["week", ahead ? "Next week" : "This week"], ["later", "Later"], ["drop", "Drop"]]);

  const enter = () => (calm() ? { duration: 0 } : { duration: 220, easing: cubicOut, css: (t, u) => `opacity: ${t}; translate: 0 ${u * 6}px` });
  const pop = () => (calm() ? { duration: 0 } : { duration: 200, easing: cubicOut, css: (t) => `opacity: ${t}; scale: ${0.97 + 0.03 * t}` });

  export function open() {
    now = Date.now();
    const w = planWeek(now), all = api.viewTasks(), plans = api.plans();
    week = dayKey(w); review = dayKey(addDays(w, -7));
    r = weekRecap(all, addDays(w, -7));
    const prev = planOf(plans, review), cur = planOf(plans, week);
    past = prev ? objectiveProgress(all, prev) : null;
    left = weekLeftovers(all.values(), week, dayKey(now));
    fates = Object.fromEntries(left.map((t) => [t.id, "week"]));
    choices = labelChoices(all, api.S.labels, review);
    goals = cur ? cur.objectives.map((o) => ({ label: o.label, target: o.target, name: o.name || "" })) : [];
    naming = false; newName = ""; step = 0;
    if (api.overlayHidden()) back = document.activeElement;
    api.setOverlay("#plan", true);
    flushSync();
    sheet.focus({ preventScroll: true });
  }

  export function close() {
    api.setOverlay("#plan", false);
    if (back && back.isConnected) back.focus({ preventScroll: true });
    back = null;
  }

  function go(i, tab) {
    step = Math.max(0, Math.min(STEPS.length - 1, i));
    flushSync();
    body.scrollTop = 0;
    const el = tab ? document.getElementById("planTab-" + STEPS[step][0])
      : step === 1 ? body.querySelector("input:checked")
      : step === 2 ? body.querySelector("[role='spinbutton']") || body.querySelector(".plan-labels button:not(:disabled)") : null;
    (el || sheet).focus({ preventScroll: true });
  }

  function finish() {
    const objectives = goals.map((g) => (g.name.trim() ? { label: g.label, target: g.target, name: g.name.trim() } : { label: g.label, target: g.target }));
    if (api.savePlan(week, objectives, $state.snapshot(fates))) close();
  }

  const next = () => (step < STEPS.length - 1 ? go(step + 1) : finish());

  // The app's shortcuts stay out while planning; Escape closes, ⌘↵ saves from any step.
  function keydown(e) {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); finish(); }
    else if (e.key === "Enter" && (e.target === sheet || e.target.matches("input[type='radio'], [role='spinbutton'], .plan-goal-name"))) { e.preventDefault(); next(); }
  }

  function tabKey(e, i) {
    const j = rovingIndex(e.key, i, STEPS.length);
    if (j < 0) return;
    e.preventDefault(); go(j, true);
  }

  function toggle(name) {
    const i = goals.findIndex((g) => sameLabel(g.label, name));
    if (i >= 0) goals.splice(i, 1);
    else if (goals.length < MAX_OBJECTIVES) goals.push({ label: name, target: suggestTarget(before(name)?.cycles || 0), name: "" });
  }

  function bump(g, by) {
    const v = Math.max(TARGET.min, Math.min(TARGET.max, g.target + by));
    if (v === g.target) return false;
    g.target = v;
    return true;
  }

  function spin(e, g) {
    const v = spinValue(e.key, g.target, 1, 5, TARGET.min, TARGET.max);
    if (v == null) return;
    e.preventDefault(); g.target = v;
  }

  function nameKey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); naming = false; newName = ""; flushSync(); body.querySelector(".plan-new")?.focus(); }
    else if (e.key === "Enter") {
      e.preventDefault(); e.stopPropagation();
      const name = api.addLabel(newName);
      naming = false; newName = "";
      if (name && !picked(name)) toggle(name);
      flushSync();
      body.querySelector(".plan-new")?.focus();
    }
  }

  function startNaming() {
    naming = true;
    flushSync();
    body.querySelector(".plan-new-input")?.focus();
  }

  const dayText = (t) => (t.plan ? api.fmtDate(keyTime(t.plan), { weekday: "short", day: "numeric", month: "short" }) : "Today");
  const lastWeek = (name) => {
    const c = before(name);
    return c && c.ms ? api.plural(c.cycles, "cycle") + " last week" : "No focus last week";
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" id="plan" hidden onclick={(e) => { if (e.target.id === "plan") close(); }} onkeydown={keydown}>
  <div class="sheet plan-sheet" role="dialog" aria-modal="true" aria-labelledby="planH" tabindex="-1" bind:this={sheet}>
    <div class="sec-head">
      <h2 id="planH">{ahead ? "Plan next week" : "Plan the week"}</h2>
      <span class="sub">{week ? span(week) : ""}</span>
      <button class="icon-btn" type="button" aria-label="Close" onclick={close}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <div class="seg" role="tablist" aria-label="Steps">
      {#each STEPS as [id, name], i (id)}
        <button type="button" role="tab" id="planTab-{id}" aria-controls="planBody" aria-selected={String(step === i)} tabindex={step === i ? 0 : -1} onclick={() => go(i)} onkeydown={(e) => tabKey(e, i)}>{name}{#if i === 1 && left.length}<small>{left.length}</small>{:else if i === 2 && goals.length}<small>{goals.length}</small>{/if}</button>
      {/each}
    </div>
    <div class="plan-body" id="planBody" role="tabpanel" aria-labelledby="planTab-{STEPS[step][0]}" bind:this={body}>
      {#key step}
        <div class="plan-step" in:enter>
          {#if step === 0 && r}
            <div class="recap-hero">
              <div class="k">{ahead ? "This week" : "Last week"} · {span(review)}</div>
              <div class="v">{#each parts(r.ms) as [n, unit], i (i)}{i ? " " : ""}{n}<small>{unit}</small>{/each}</div>
              <div class="s">{#if r.before.ms}<span class={r.ms >= r.before.ms ? "up" : "down"}>{r.ms >= r.before.ms ? "+" : "−"}{api.fmtDur(Math.abs(r.ms - r.before.ms))}</span> vs the week before{:else}No focus the week before{/if}</div>
            </div>
            <div class="plan-facts">
              <span><b>{r.cycles}</b> {r.cycles === 1 ? "cycle" : "cycles"}</span>
              <span><b>{r.active}</b>/7 days with focus</span>
              <span><b>{r.finished.length}</b> {r.finished.length === 1 ? "task" : "tasks"} finished</span>
            </div>
            <section class="recap-list">
              <h3>{past ? "Objectives" : "Where your focus went"}</h3>
              {#if past}
                {#each past as o (o.label)}
                  <div class="plan-past">
                    <span class="by-name"><i class="label-dot" style:--h={labelHue(o.label)}></i><span>{o.name || o.label}</span></span>
                    <div class="meter" class:hit={o.hit}><b style:width={Math.min(100, (o.cycles / o.target) * 100) + "%"}></b></div>
                    <em>{o.cycles}/{o.target}</em>
                    <span class="delta {o.hit ? 'on' : 'over'}">{o.hit ? "Hit" : o.target - o.cycles + " short"}</span>
                  </div>
                {/each}
              {:else if r.labels.length}
                {#each r.labels as l (l.name)}
                  <div class="recap-label">
                    <span class="by-name" class:none={!l.name}><i class="label-dot" class:none={!l.name} style:--h={l.name ? labelHue(l.name) : null}></i><span>{l.name || "No label"}</span></span>
                    <div class="hbar"><b style:width={(l.ms / r.labels[0].ms) * 100 + "%"}></b></div>
                    <em>{api.fmtDur(l.ms)}</em>
                  </div>
                {/each}
                <p class="plan-note">No objectives were set for that week.</p>
              {:else}
                <p class="plan-note">{r.ms ? "None of that focus was labeled, and no objectives were set." : "No focus logged that week. A fresh start."}</p>
              {/if}
            </section>
          {:else if step === 1}
            {#if left.length}
              <p class="plan-lead">{left.length === 1 ? "One task is" : left.length + " tasks are"} still open from before {api.fmtDate(keyTime(week), { weekday: "long" })}. Roll each into {ahead ? "next" : "this"} week, park it in Later, or drop it. Dropped tasks keep their logged focus.</p>
              <ul class="plan-left">
                {#each left as t (t.id)}
                  {@const label = projectOf(t)}
                  <li>
                    <div class="plan-task">
                      <span class="tt">{t.title}</span>
                      <span class="plan-meta"><span>{dayText(t)}</span>{#if label}<span class="meta-chip"><i class="label-dot" style:--h={labelHue(label)}></i><span>{label}</span></span>{/if}{#if t.est}<span>{cyclesOf(t)} of {api.plural(t.est, "cycle")}</span>{/if}</span>
                    </div>
                    <div class="seg-ctl" role="radiogroup" aria-label={"What to do with “" + t.title + "”"}>
                      {#each FATES as [v, name] (v)}<label class:drop={v === "drop"}><input type="radio" name={"fate-" + t.id} value={v} bind:group={fates[t.id]}>{name}</label>{/each}
                    </div>
                  </li>
                {/each}
              </ul>
            {:else}
              <div class="empty plan-clear"><strong>Nothing left over</strong><span>Every task planned before {api.fmtDate(keyTime(week), { weekday: "long" })} is finished or already moved on.</span></div>
            {/if}
          {:else if step === 2}
            <p class="plan-lead">Pick up to three labels to focus on {ahead ? "next" : "this"} week and how many cycles each should get. Focus on tasks with that label counts toward it.</p>
            <div class="label-filter plan-labels" role="group" aria-label="Labels">
              {#each chips as c (c.name)}
                <button type="button" aria-pressed={String(picked(c.name))} disabled={!picked(c.name) && goals.length >= MAX_OBJECTIVES} onclick={() => toggle(c.name)}><i class="label-dot" style:--h={labelHue(c.name)}></i><span>{c.name}</span></button>
              {/each}
              {#if naming}
                <input class="plan-new-input" type="text" autocomplete="off" maxlength="80" placeholder="Label name" aria-label="New label" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" bind:value={newName} onkeydown={nameKey} onblur={() => { if (!newName.trim()) naming = false; }}>
              {:else}
                <button type="button" class="plan-new" disabled={goals.length >= MAX_OBJECTIVES} onclick={startNaming}><span>+ New label</span></button>
              {/if}
            </div>
            {#if goals.length}
              <ul class="plan-goals">
                {#each goals as g (g.label.toLocaleLowerCase())}
                  <li class="plan-goal" transition:pop>
                    <span class="plan-goal-label"><i class="label-dot" style:--h={labelHue(g.label)}></i><b>{g.label}</b><small>{lastWeek(g.label)}</small></span>
                    <div class="stepper spin">
                        <button type="button" tabindex="-1" aria-label="Fewer cycles" disabled={g.target <= TARGET.min} {@attach hold(() => bump(g, -1))}>{@html MINUS}</button>
                        <span role="spinbutton" tabindex="0" aria-label={"Cycles for " + g.label} aria-valuemin={TARGET.min} aria-valuemax={TARGET.max} aria-valuenow={g.target} aria-valuetext={api.plural(g.target, "cycle")} onkeydown={(e) => spin(e, g)}>{api.plural(g.target, "cycle")}</span>
                        <button type="button" tabindex="-1" aria-label="More cycles" disabled={g.target >= TARGET.max} {@attach hold(() => bump(g, 1))}>{@html PLUS}</button>
                    </div>
                    <input class="plan-goal-name" type="text" autocomplete="off" maxlength="60" placeholder="Name it (optional)" aria-label={"Name for the " + g.label + " objective, optional"} data-1p-ignore="true" data-lpignore="true" data-bwignore="true" bind:value={g.name}>
                  </li>
                {/each}
              </ul>
            {:else}
              <div class="plan-none">{chips.length ? "Pick a label above to set your first objective." : "Objectives follow labels. Create one above, then label the tasks that count toward it."}</div>
            {/if}
          {/if}
        </div>
      {/key}
    </div>
    <div class="sheet-foot">
      {#if step}<button class="btn" type="button" onclick={() => go(step - 1)}>Back</button>{/if}
      <button class="btn solid" type="button" onclick={next}>{step < STEPS.length - 1 ? "Next" : ahead ? "Plan next week" : "Start the week"}</button>
    </div>
  </div>
</div>
