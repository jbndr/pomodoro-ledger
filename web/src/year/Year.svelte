<script>
  import { flushSync } from "svelte";
  import { cubicIn, quintOut } from "svelte/easing";
  import { calm } from "../dom";
  import { addDays, dayKey } from "../lib/dates";
  import { heatLevel } from "../lib/stats";
  import { labelHue } from "../lib/tasks";
  import { badges, focusYears, monthsSoFar, yearDue, yearStats } from "../lib/year";
  import { badgesCard, hoursOf, hoursUnit, summaryCard } from "./card";
  import Medal from "./Medal.svelte";
  import { yearEnabled } from "./flag";
  import { grid } from "./grid";
  import "./year.css";

  let { api } = $props();

  const TONE = { intro: "paper", total: "tomato", labels: "ink", month: "paper", time: "leaf", streak: "ink", busiest: "sky", heat: "paper", badges: "ink", summary: "tomato" };
  const DUR = { intro: Infinity, badges: 12000, summary: 9000 };
  const PERSONA = { morning: "You're a morning person", afternoon: "You hit your stride after lunch", evening: "You're an evening person", night: "You're a night owl" };
  const PERSONA_SHORT = { morning: "Morning person", afternoon: "Afternoon person", evening: "Evening person", night: "Night owl" };
  const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

  let shown = $state(false), year = $state(0), i = $state(0), dir = $state(1), elapsed = $state(0), held = $state(false), busy = $state(false);
  let pick = $state(null), hint = $state(false), version = $state(0);
  let card = $state(), back = null, raf = 0, last = 0, holdT = 0, hintT = 0, down = null, tries = 0;

  const tasks = $derived.by(() => { version; return shown ? api.viewTasks() : null; });
  const years = $derived(tasks ? focusYears(tasks) : []);
  const y = $derived(tasks && year ? yearStats(tasks, year) : null);
  const list = $derived(y ? badges(y, api.S.settings.goal) : []);
  const earned = $derived(list.filter((b) => b.earned));
  const screens = $derived(y ? ["intro", "total", y.labels.length && "labels", y.bestMonth != null && "month", y.persona && "time", y.streak && y.streak.days > 1 && "streak", y.busiest && "busiest", "heat", "badges", "summary"].filter(Boolean) : []);
  const cur = $derived(screens[i] || "intro");
  const dur = (s) => DUR[s] || 7000;

  const fmtHours = (v, final) => (final >= 3600000 * 10 ? Math.round(v / 3600000).toLocaleString() : final >= 3600000 ? (v / 3600000).toFixed(1) : String(Math.round(v / 60000)));
  const day = (t, o = { day: "numeric", month: "long" }) => api.fmtDate(t, o);
  const monthName = (m, o = { month: "long" }) => api.fmtDate(new Date(year, m, 1).getTime(), o);

  const view = $derived.by(() => {
    if (!y) return null;
    const total = y.labels.reduce((a, l) => a + l.ms, 0), top = y.labels[0], soFar = monthsSoFar(y);
    const best = y.bestMonth == null ? 0 : y.months[y.bestMonth], avg = y.months.slice(0, soFar).reduce((a, b) => a + b, 0) / soFar;
    const unit = [1, 5, 10, 25, 50, 100, 250].find((u) => y.cycles / u <= 120) || 500;
    const b = y.busiest, bFrom = b ? Math.floor(new Date(b.blocks[0].from).getHours()) : 0, bTo = b ? Math.min(24, Math.ceil((b.blocks.at(-1).to - b.t) / 3600000)) : 24;
    const peakH = Math.max(1, ...y.hours);
    return {
      top, share: top && total ? Math.round((top.ms / y.ms) * 100) : 0,
      ranks: y.labels.slice(0, 5).map((l) => ({ ...l, w: (l.ms / top.ms) * 100 })),
      workdays: Math.round(y.ms / 3600000 / 8),
      unit, dots: Math.ceil(y.cycles / unit),
      soFar, bestMs: best, above: avg ? Math.round((best / avg - 1) * 100) : 0,
      bars: y.months.map((ms, m) => ({ m, h: best ? (ms / best) * 100 : 0, fut: m >= soFar })),
      spokes: y.hours.map((ms, h) => ({ h, len: ms / peakH, on: y.window && y.window.share >= 0.3 ? h >= y.window.from && h < y.window.to : ms === peakH })),
      peak: y.window ? y.window.from + "–" + y.window.to : y.hours.indexOf(peakH) + "–" + (y.hours.indexOf(peakH) + 1),
      run: y.streak ? Math.min(70, y.streak.days) : 0,
      span: { from: bFrom, to: Math.max(bTo, bFrom + 4) },
      cal: [...Array(12)].map((_, m) => {
        const first = new Date(year, m, 1).getTime(), n = new Date(year, m + 1, 0).getDate();
        return { m, off: (new Date(first).getDay() + 6) % 7, days: [...Array(n)].map((_, d) => { const t = addDays(first, d); return { lvl: heatLevel((y.days.get(dayKey(t))?.ms || 0) / 60000), fut: t > y.end }; }) };
      }),
    };
  });

  const streakLine = (n) => (n >= 30 ? "A month without a miss. Unstoppable." : n >= 21 ? Math.floor(n / 7) + " weeks straight. That's commitment." : n >= 14 ? "Two weeks and then some." : n >= 7 ? "A full week without missing a day." : "Small streaks add up.");

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, now - last);
    last = now;
    if (held || busy || document.hidden || !screens.length) return;
    const d = dur(cur);
    if (!isFinite(d)) return;
    if (elapsed < d) elapsed = Math.min(d, elapsed + dt);
    else if (i < screens.length - 1) go(1);
  }

  function go(n) {
    const j = i + n;
    if (j < 0 || j >= screens.length) { if (j < 0) elapsed = 0; return; }
    dir = n;
    i = j; elapsed = 0; pick = null;
  }

  function jump(j) { dir = j >= i ? 1 : -1; i = j; elapsed = 0; pick = null; }

  /** Opens on a year, the current one (or the latest with focus) by default. */
  export function open(yr) {
    if (!yearEnabled()) return;
    version++;
    const ys = focusYears(api.viewTasks()), now = new Date().getFullYear();
    year = yr || (ys.includes(now) || !ys.length ? now : ys.at(-1));
    i = 0; dir = 1; elapsed = 0; pick = null; held = false; busy = false;
    if (api.overlayHidden()) back = document.activeElement;
    shown = true;
    api.setOverlay("#year", true);
    flushSync();
    card.focus({ preventScroll: true });
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
    addEventListener("keydown", key, true);
    clearTimeout(hintT);
    hint = matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (hint) hintT = setTimeout(() => (hint = false), 4200);
  }

  export function close() {
    if (!shown) return;
    cancelAnimationFrame(raf);
    removeEventListener("keydown", key, true);
    clearTimeout(hintT);
    shown = false; hint = false;
    api.setOverlay("#year", false);
    if (back && back.isConnected) back.focus({ preventScroll: true });
    back = null;
  }

  /** In December, offers the year once, after settings have synced and nothing else is going on. */
  export function maybeOpen() {
    const s = api.S.settings;
    if ((api.preview() && !api.DEMO) || !api.overlayHidden() || !yearEnabled()) return;
    if (api.syncing() && tries++ < 8) { setTimeout(maybeOpen, 1000); return; }
    if (api.T.status === "running" || document.body.classList.contains("zen")) return;
    const due = yearDue(api.viewTasks(), Date.now(), s.yearSeen);
    if (due == null) return;
    s.yearSeen = due;
    api.Store.saveSettings();
    open(due);
  }

  function key(e) {
    if (!shown || e.metaKey || e.ctrlKey || document.querySelector("#palette:not([hidden]), #share:not([hidden])")) return;
    e.stopPropagation();
    const onButton = e.target instanceof HTMLElement && e.target.closest("button, select") && e.target !== card;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !onButton)) go(1);
    else if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
    else if (e.key === "Tab") { trap(e); return; }
    else return;
    e.preventDefault();
  }

  function trap(e) {
    const els = [...document.querySelectorAll("#year button:not([disabled]), #year select")].filter((el) => el.offsetParent);
    if (!els.length) return;
    const a = els[0], z = els.at(-1);
    if (e.shiftKey && (document.activeElement === a || document.activeElement === card)) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }

  function pdown(e) {
    if (e.button || e.target.closest("button, select, a")) return;
    down = { x: e.clientX };
    clearTimeout(holdT);
    holdT = setTimeout(() => (held = true), 220);
  }

  function pup() {
    clearTimeout(holdT);
    if (!down) return;
    const x = down.x, wasHeld = held;
    down = null; held = false;
    if (wasHeld) return;
    const r = card.getBoundingClientRect();
    go(x - r.left < r.width * 0.3 ? -1 : 1);
  }

  function pcancel() { clearTimeout(holdT); down = null; held = false; }

  function share(kind) {
    if (busy || !y) return;
    busy = true;
    const yy = y, ll = list, persona = yy.persona ? PERSONA_SHORT[yy.persona] + (yy.window ? " · best " + view.peak : "") : "";
    api.openShare({
      kind: "year-" + kind, theme: kind === "badges" ? "night" : "tomato",
      heading: kind === "badges" ? "Share your badges" : "Share your year",
      name: "focus-" + year + "-" + kind + ".png", title: "My " + year + " in focus",
      make: (th) => (kind === "badges" ? badgesCard(yy, ll, th) : summaryCard(yy, ll, persona, api, th)),
      onclose: () => { busy = false; last = performance.now(); card?.focus({ preventScroll: true }); },
    });
  }

  let tilted = null;
  function tilt(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest(".yr-badge")?.querySelector(".medal:not(.locked)");
    if (el !== tilted) untilt();
    if (!el || calm()) return;
    const r = el.getBoundingClientRect(), x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), yv = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    el.style.setProperty("--rx", ((0.5 - yv) * 26).toFixed(2) + "deg");
    el.style.setProperty("--ry", ((x - 0.5) * 26).toFixed(2) + "deg");
    el.style.setProperty("--px", (x * 100).toFixed(1) + "%");
    el.style.setProperty("--py", (yv * 100).toFixed(1) + "%");
    el.style.setProperty("--gx", (x * 100).toFixed(1) + "%");
    el.style.setProperty("--gy", (yv * 100).toFixed(1) + "%");
    el.classList.add("on");
    tilted = el;
  }
  function untilt() {
    if (!tilted) return;
    for (const p of ["--rx", "--ry", "--px", "--py", "--gx", "--gy"]) tilted.style.removeProperty(p);
    tilted.classList.remove("on");
    tilted = null;
  }

  function count(node, { to, fmt = (v) => Math.round(v).toLocaleString(), d = 0 }) {
    if (calm()) { node.textContent = fmt(to); return; }
    const t0 = performance.now() + 160 + d * 90, D = 1300;
    let r = 0;
    const step = (now) => {
      const p = Math.max(0, Math.min(1, (now - t0) / D));
      node.textContent = fmt(to * (1 - Math.pow(1 - p, 4)));
      if (p < 1) r = requestAnimationFrame(step);
    };
    node.textContent = fmt(0);
    r = requestAnimationFrame(step);
    return { destroy() { cancelAnimationFrame(r); } };
  }

  const rise = (node, { d = 0 } = {}) => calm()
    ? { delay: 80 + d * 30, duration: 240, css: (t) => `opacity: ${t}` }
    : { delay: 140 + d * 90, duration: 680, easing: quintOut, css: (t, u) => `opacity: ${Math.min(1, t * 1.5)}; translate: 0 ${u * 26}px; scale: ${0.97 + 0.03 * t}` };
  const enter = () => calm() ? { duration: 240, css: (t) => `opacity: ${t}` } : { duration: 420, easing: quintOut, css: (t, u) => `opacity: ${t}; translate: ${dir * u * 40}px 0` };
  const leave = () => calm() ? { duration: 200, css: (t) => `opacity: ${t}` } : { duration: 240, easing: cubicIn, css: (t, u) => `opacity: ${t}; translate: ${-dir * u * 40}px 0; scale: ${1 - u * 0.03}` };
  const fade = () => ({ duration: calm() ? 0 : 260, css: (t) => `opacity: ${t}` });

  const spoke = (h, len) => {
    const a = (h / 24) * Math.PI * 2 - Math.PI / 2, r0 = 46, r1 = r0 + 6 + len * 46;
    return { x1: 100 + Math.cos(a) * r0, y1: 100 + Math.sin(a) * r0, x2: 100 + Math.cos(a) * r1, y2: 100 + Math.sin(a) * r1 };
  };
  const pos = (t, s) => ((t - s.from * 3600000) / ((s.to - s.from) * 3600000)) * 100;
</script>

{#snippet mark(cls)}<svg class={cls} viewBox="0 0 28 28" aria-hidden="true"><circle cx="5.6" cy="14" r="4.5" fill="var(--tomato)"/><path d="M13.04 20.96L22.16 7.76" fill="none" stroke="var(--leaf)" stroke-width="6" stroke-linecap="round"/></svg>{/snippet}
{#snippet eyebrow(text, d = 0)}<p class="yr-eye" in:rise|global={{ d }}>{text}</p>{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay yr" id="year" hidden onclick={(e) => { if (e.target.id === "year") close(); }}>
  {#if shown && y && view}
    <button class="yr-side prev" type="button" aria-label="Previous" disabled={i === 0} onclick={() => go(-1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>
    <div class="yr-card t-{TONE[cur]}" class:held role="dialog" aria-modal="true" aria-label="Your {year} in focus" aria-roledescription="stories" tabindex="-1" bind:this={card}>
      <div class="yr-top">
        <div class="yr-bars" aria-hidden="true">
          {#each screens as s, j (s)}<i><b style:scale={(j < i ? 1 : j > i ? 0 : isFinite(dur(s)) ? elapsed / dur(s) : 0) + " 1"}></b></i>{/each}
        </div>
        <div class="yr-head">
          <span class="yr-tag">{@render mark("yr-tag-mark")}{year} in focus</span>
          {#if cur === "badges" || cur === "summary"}
            <button class="yr-btn" type="button" aria-label="Share this card" title="Share" disabled={busy} onclick={() => share(cur)} in:fade><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></button>
          {/if}
          <button class="yr-btn" type="button" aria-label="Close" title="Close" onclick={close}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>
      </div>

      <div class="yr-stage" onpointerdown={pdown} onpointerup={pup} onpointercancel={pcancel} onpointerleave={pcancel} oncontextmenu={(e) => e.preventDefault()}>
        {#key i + ":" + year}
          <section class="yr-screen s-{cur}" aria-live="polite" in:enter out:leave>
            {#if cur === "intro"}
              <div class="yr-intro-mark" aria-hidden="true">
                <svg viewBox="0 0 28 28"><circle class="dot" cx="5.6" cy="14" r="4.5"/><path class="tick" d="M13.04 20.96L22.16 7.76" pathLength="1"/></svg>
              </div>
              <div class="yr-fill"></div>
              <p class="yr-eye" in:rise|global={{ d: 1 }}>{y.partial ? "Your year so far" : "Your year"}</p>
              <h2 class="yr-year" in:rise|global={{ d: 2 }}>{year}</h2>
              <p class="yr-infocus" in:rise|global={{ d: 3 }}>in focus</p>
              {#if y.partial}<p class="yr-sub" in:rise|global={{ d: 4 }}>{day(y.start, { day: "numeric", month: "short" })} – {day(y.end, { day: "numeric", month: "short" })}. A look back at every cycle, label and late night.</p>{/if}
              {#if years.length > 1}
                <div class="yr-years" role="group" aria-label="Year" in:rise|global={{ d: 5 }}>
                  {#each years as yr (yr)}<button type="button" aria-pressed={String(yr === year)} onclick={() => { year = yr; jump(0); }}>{yr}</button>{/each}
                </div>
              {/if}
              <button class="yr-go" type="button" onclick={() => go(1)} in:rise|global={{ d: 6 }}>Let's go<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>

            {:else if cur === "total"}
              {@render eyebrow("This year you focused for")}
              <p class="yr-mega" in:rise|global={{ d: 1 }}><span use:count={{ to: y.ms, fmt: (v) => fmtHours(v, y.ms), d: 1 }}>0</span></p>
              <p class="yr-unit" in:rise|global={{ d: 2 }}>{hoursUnit(y.ms)}</p>
              <p class="yr-line" in:rise|global={{ d: 3 }}>{y.cycles.toLocaleString()} {y.cycles === 1 ? "cycle" : "cycles"} across {y.active} {y.active === 1 ? "day" : "days"}.{#if view.workdays >= 2}{" "}That's {view.workdays} full workdays of deep work.{/if}</p>
              <div class="yr-fill"></div>
              <canvas class="yr-dots" in:rise|global={{ d: 4 }} aria-hidden="true" use:grid={{ n: view.dots, cols: view.dots > 100 ? 15 : view.dots > 60 ? 12 : view.dots > 24 ? 10 : 8, kind: "dot", gap: (w) => Math.min(w * 0.026, 11), delay: 480 }}></canvas>
              <p class="yr-note" in:rise|global={{ d: 5 }}><i class="yr-key-dot"></i>{view.unit === 1 ? "Each dot is a cycle" : "Each dot is " + view.unit + " cycles"}</p>

            {:else if cur === "labels"}
              {@render eyebrow("Where your focus went")}
              <h2 class="yr-h" in:rise|global={{ d: 1 }}>{y.labels.length === 1 ? "All in on " + view.top.name : view.top.name + " took the top spot"}</h2>
              <p class="yr-line" in:rise|global={{ d: 2 }}>{view.share}% of your focus went to {view.top.name}.</p>
              <div class="yr-fill"></div>
              <ol class="yr-rank">
                {#each view.ranks as l, k (l.name)}
                  <li in:rise|global={{ d: 3 + k }} style:--w={l.w + "%"} style:--h={labelHue(l.name)}>
                    <b class="n">{k + 1}</b>
                    <span class="nm"><i class="label-dot"></i><span>{l.name}</span></span>
                    <em>{hoursOf(l.ms)}<small>{l.ms >= 3600000 ? "h" : "m"}</small></em>
                    <span class="rk-bar"><i></i></span>
                  </li>
                {/each}
              </ol>

            {:else if cur === "month"}
              {@render eyebrow("Your biggest month")}
              <h2 class="yr-mega yr-word" in:rise|global={{ d: 1 }}>{monthName(y.bestMonth)}</h2>
              <p class="yr-line" in:rise|global={{ d: 2 }}>{hoursOf(view.bestMs)} {hoursUnit(view.bestMs)} of focus{#if view.above >= 10}, {view.above}% above your monthly average{/if}.</p>
              <div class="yr-fill"></div>
              <div class="yr-months" in:rise|global={{ d: 3 }} aria-hidden="true">
                {#each view.bars as b (b.m)}
                  <div class:best={b.m === y.bestMonth} class:fut={b.fut}><i style:--h={b.h + "%"} style:--k={b.m}></i><span>{monthName(b.m, { month: "narrow" })}</span></div>
                {/each}
              </div>

            {:else if cur === "time"}
              {@render eyebrow("Your best time of day")}
              <h2 class="yr-h" in:rise|global={{ d: 1 }}>{PERSONA[y.persona]}</h2>
              <p class="yr-line" in:rise|global={{ d: 2 }}>{y.window ? y.window.text : "Your focus is spread across the day."}</p>
              <div class="yr-fill"></div>
              <div class="yr-clock" in:rise|global={{ d: 3 }}>
                <svg viewBox="-24 -24 248 248" aria-hidden="true">
                  <circle class="rim" cx="100" cy="100" r="101" /><circle class="face" cx="100" cy="100" r="40" />
                  {#each view.spokes as s (s.h)}
                    {@const p = spoke(s.h, s.len)}
                    <line class:on={s.on} class:none={!s.len} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} style:--k={s.h} />
                  {/each}
                  {#each [0, 6, 12, 18] as h (h)}
                    {@const a = (h / 24) * Math.PI * 2 - Math.PI / 2}
                    <text x={100 + Math.cos(a) * 114} y={100 + Math.sin(a) * 114 + 3.5}>{h}</text>
                  {/each}
                </svg>
                <div class="yr-clock-mid"><b>{view.peak}</b><span>peak hours</span></div>
              </div>

            {:else if cur === "streak"}
              {@render eyebrow("Your longest streak")}
              <p class="yr-mega" in:rise|global={{ d: 1 }}><span use:count={{ to: y.streak.days, d: 1 }}>0</span></p>
              <p class="yr-unit" in:rise|global={{ d: 2 }}>days in a row</p>
              <p class="yr-line" in:rise|global={{ d: 3 }}>{day(y.streak.from)} to {day(y.streak.to)}. {streakLine(y.streak.days)}</p>
              <div class="yr-fill"></div>
              <canvas class="yr-run" in:rise|global={{ d: 4 }} aria-hidden="true" use:grid={{ n: view.run, cols: 7, kind: "tick", gap: (w) => Math.min(w * 0.02, 8), cap: (w, h) => h * (view.run > 35 ? 0.04 : 0.056), delay: 460 }}></canvas>
              {#if y.streak.days > view.run}<p class="yr-note">and {y.streak.days - view.run} more</p>{/if}

            {:else if cur === "busiest"}
              {@const b = y.busiest}
              {@render eyebrow("Your biggest day")}
              <h2 class="yr-mega yr-word" in:rise|global={{ d: 1 }}>{api.fmtDate(b.t, { weekday: "long" })}</h2>
              <p class="yr-unit" in:rise|global={{ d: 2 }}>{day(b.t)}</p>
              <p class="yr-line" in:rise|global={{ d: 3 }}>{api.fmtDur(b.ms)} of focus in {api.plural(b.cycles, "cycle")}, from {api.fmtClock(b.blocks[0].from)} to {api.fmtClock(b.blocks.at(-1).to)}. You went all in.</p>
              <div class="yr-fill"></div>
              <div class="yr-day" in:rise|global={{ d: 4 }} aria-hidden="true">
                <div class="track">
                  {#each b.blocks as bl, k (k)}<i style:left={pos(bl.from - b.t, view.span) + "%"} style:width={Math.max(0.6, pos(bl.to - b.t, view.span) - pos(bl.from - b.t, view.span)) + "%"} style:--k={k}></i>{/each}
                </div>
                <div class="hours">
                  {#each Array(view.span.to - view.span.from + 1) as _, k (k)}{#if (view.span.from + k) % 2 === 0}<span style:left={(k / (view.span.to - view.span.from)) * 100 + "%"}>{view.span.from + k}</span>{/if}{/each}
                </div>
              </div>

            {:else if cur === "heat"}
              {@render eyebrow("Your year, day by day")}
              <h2 class="yr-h" in:rise|global={{ d: 1 }}>{y.active} {y.active === 1 ? "day" : "days"} with focus</h2>
              <div class="yr-fill"></div>
              <div class="yr-cal" in:rise|global={{ d: 2 }} aria-hidden="true">
                {#each view.cal as mo (mo.m)}
                  <div class="mo" style:--m={mo.m}>
                    <span>{monthName(mo.m, { month: "short" })}</span>
                    <div class="days">{#each mo.days as c, k (k)}<i class="l{c.lvl}" class:fut={c.fut} style:grid-column-start={k === 0 ? mo.off + 1 : null}></i>{/each}</div>
                  </div>
                {/each}
              </div>
              <div class="yr-legend" in:rise|global={{ d: 3 }} aria-hidden="true"><span>Less</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>More</span></div>

            {:else if cur === "badges"}
              {@render eyebrow(year + " badges")}
              <h2 class="yr-h" in:rise|global={{ d: 1 }}>{earned.length} of {list.length} earned</h2>
              <div class="yr-fill"></div>
              <div class="yr-badges" onpointermove={tilt} onpointerleave={untilt} onpointercancel={untilt} onpointerup={(e) => { if (e.pointerType !== "mouse") untilt(); }}>
                {#each list as b, k (b.id)}
                  <button type="button" class="yr-badge" class:locked={!b.earned} aria-pressed={String(pick === b.id)} onclick={() => (pick = pick === b.id ? null : b.id)} in:rise|global={{ d: 2 + k * 0.35 }}>
                    <span class="em"><Medal id={b.id} locked={!b.earned} fg="var(--yr-fg)" d={k} /></span>
                    <b>{b.name}</b>
                    {#if !b.earned}<small>{b.have} of {b.need}</small>{/if}
                  </button>
                {/each}
              </div>
              <p class="yr-caption" in:rise|global={{ d: 6 }}>
                {#if pick}{@const b = list.find((x) => x.id === pick)}<b>{b.name}</b> · {b.how}{b.earned ? (b.note ? ". Yours: " + b.note + "." : ". Earned.") : ". " + b.have + " of " + b.need + " so far."}{:else}Tap a badge to see what it's for.{/if}
              </p>

            {:else if cur === "summary"}
              <div class="yr-sum-head" in:rise|global={{ d: 0 }}>
                <h2 class="yr-sum-year">{year}</h2>
                <p>in focus{y.partial ? ", so far" : ""}</p>
              </div>
              <dl class="yr-stats">
                <div in:rise|global={{ d: 1 }}><dt>Focus</dt><dd>{hoursOf(y.ms)}<small>{y.ms >= 3600000 ? "h" : "m"}</small></dd></div>
                <div in:rise|global={{ d: 1.4 }}><dt>Cycles</dt><dd>{y.cycles.toLocaleString()}</dd></div>
                <div in:rise|global={{ d: 1.8 }}><dt>Days</dt><dd>{y.active}</dd></div>
                <div in:rise|global={{ d: 2.2 }}><dt>Streak</dt><dd>{y.streak ? y.streak.days : 0}<small>{y.streak && y.streak.days === 1 ? "day" : "days"}</small></dd></div>
                <div in:rise|global={{ d: 2.6 }}><dt>Best month</dt><dd>{y.bestMonth == null ? "–" : monthName(y.bestMonth)}</dd></div>
                <div in:rise|global={{ d: 3 }}><dt>Top label</dt><dd>{view.top ? view.top.name : "–"}</dd></div>
              </dl>
              {#if y.persona}<p class="yr-persona" in:rise|global={{ d: 3.6 }}>{PERSONA_SHORT[y.persona]}{y.window ? " · best " + view.peak : ""}</p>{/if}
              {#if earned.length}
                <div class="yr-strip" in:rise|global={{ d: 4 }}>
                  <p class="yr-eye">{earned.length} of {list.length} badges</p>
                  <div>{#each earned as b, k (b.id)}<span class="em" title={b.name}><Medal id={b.id} d={k} /></span>{/each}</div>
                </div>
              {/if}
              <div class="yr-fill"></div>
              <div class="yr-acts" in:rise|global={{ d: 5 }}>
                <button class="yr-share" type="button" disabled={busy} onclick={() => share("summary")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>{busy ? "Making the image…" : "Share your year"}</button>
                <button class="yr-again" type="button" onclick={() => jump(0)}>Replay</button>
              </div>
            {/if}
          </section>
        {/key}
      </div>
    </div>
    {#if hint}<p class="yr-hint" transition:fade><kbd>←</kbd><kbd>→</kbd> to move · hold to pause · <kbd>Esc</kbd> to close</p>{/if}
    <button class="yr-side next" type="button" aria-label="Next" disabled={i >= screens.length - 1} onclick={() => go(1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>
  {/if}
</div>
