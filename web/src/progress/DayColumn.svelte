<script>
  import { cubicOut } from "svelte/easing";
  import { fly } from "svelte/transition";
  import { calm } from "../dom";
  import { MIN } from "../lib/dates";
  import { labelHue, matchesLabel } from "../lib/tasks";

  let { api, day, items, gaps, isToday, now, filter = "", line, name, dir = 1, canPrev, canNext, onstep } = $props();

  const HOUR = 60 * MIN, PPM = 0.8, GAP = 25 * MIN, FOLD = 60 * MIN, KEEP = 10 * MIN, FOLD_H = 28;
  const kindOf = (it) => (it.hand ? "h" : it.flow ? "f" : it.over ? "o" : it.full ? "c" : it.live ? "l" : "p");
  const lane = (it) => (it.kind === "focus" ? "f" : it.kind === "break" ? (it.long ? "l" : "s") : "i");
  const off = (label) => !!filter && !matchesLabel(label, filter);

  const c = $derived.by(() => {
    if (!items.length) return null;
    const end = Math.max(items.at(-1).to, isToday ? now : 0);
    const from = Math.floor((items[0].from - 5 * MIN) / (HOUR / 2)) * (HOUR / 2), to = Math.ceil((end + 5 * MIN) / (HOUR / 2)) * (HOUR / 2);
    // An hour or more with nothing logged folds into a short band, so a long lunch or the evening so far doesn't stretch the column.
    const quiet = [];
    for (let i = 1; i < items.length; i++) if (items[i].from - items[i - 1].to >= FOLD) quiet.push([items[i - 1].to, items[i].from]);
    if (isToday && now - items.at(-1).to >= FOLD) quiet.push([items.at(-1).to, now]);
    const pieces = [];
    let cur = from;
    for (const [a, b] of quiet) { pieces.push({ a: cur, b: a + KEEP }, { a: a + KEEP, b: b - KEEP, fold: b - a }); cur = b - KEEP; }
    pieces.push({ a: cur, b: to });
    const y = (t) => {
      let acc = 0;
      for (const p of pieces) {
        if (t <= p.a) break;
        const span = Math.min(t, p.b) - p.a;
        acc += p.fold ? (span / (p.b - p.a)) * FOLD_H : (span / MIN) * PPM;
      }
      return acc;
    };
    const folds = pieces.filter((p) => p.fold);
    const hours = [];
    for (let h = day + Math.ceil((from - day) / HOUR) * HOUR; h <= to; h += HOUR) if (!folds.some((p) => h > p.a - 8 * MIN && h < p.b + 8 * MIN)) hours.push(h);
    const runs = [];
    for (const it of items) {
      if (it.kind !== "focus") continue;
      const r = runs.at(-1);
      if (r && r.title === it.title && it.from - r.to < GAP) { r.items.push(it); r.to = it.to; }
      else runs.push({ title: it.title, label: it.label, from: it.from, to: it.to, items: [it] });
    }
    let floor = -Infinity;
    for (const r of runs) {
      r.ms = r.items.reduce((n, x) => n + (x.ms || 0), 0);
      r.top = Math.max(y(r.from), floor + 3);
      r.h = Math.max(24, y(r.to) - r.top - 2);
      floor = r.top + r.h;
    }
    const rail = [...items, ...gaps.map((g) => ({ kind: "idle", ...g }))].map((it) => ({ it, k: lane(it), top: y(it.from), h: Math.max(1.5, y(it.to) - y(it.from) - 0.5) }));
    return { y, hours, runs, rail, folds, height: Math.max(y(to), floor + 4), nowY: isToday ? y(now) : -1 };
  });

  const clock = (t) => api.fmtClock(t);
  const count = (r) => {
    const n = (k) => r.items.filter((x) => kindOf(x) === k).length;
    return [n("c") && api.plural(n("c"), "cycle"), n("f") && api.plural(n("f"), "flow session"), n("p") && n("p") + " stopped early", n("o") && api.fmtDur(r.items.filter((x) => x.over).reduce((a, x) => a + x.ms, 0)) + " past the bell", n("h") && api.fmtDur(r.items.filter((x) => x.hand).reduce((a, x) => a + x.ms, 0)) + " by hand"].filter(Boolean).join(" · ");
  };
  const runTip = (r) => "<b>" + api.esc(r.title) + "</b><br>" + (r.label ? api.esc(r.label) + " · " : "") + clock(r.from) + "–" + (r.items.at(-1).live ? "now" : clock(r.to)) + " · " + api.fmtDur(Math.max(MIN, r.ms)) + (count(r) ? "<br>" + count(r) : "");
  const railTip = (x) => {
    const span = clock(x.it.from) + "–" + (x.it.live ? "now" : clock(x.it.to)) + " · " + api.fmtDur(Math.max(MIN, x.it.to - x.it.from));
    return "<b>" + (x.k === "f" ? api.esc(x.it.title) : x.k === "i" ? "Idle" : x.k === "l" ? "Long break" : "Short break") + "</b><br>" + span;
  };
</script>

<div class="stages">
  <div class="sg-top">
    <div class="sg-read">
      <h3>Your day</h3>
      <p class="sg-line">{#if items.length}{line}{:else}{isToday ? "Nothing logged yet. Your day draws itself here as you focus and take breaks." : "No focus logged on this day."}{/if}</p>
    </div>
    <div class="sg-nav">
      <button class="icon-btn" type="button" aria-label="Previous day" disabled={!canPrev} onclick={() => onstep(-1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>
      <span class="sg-date">{isToday ? "Today" : name}</span>
      <button class="icon-btn" type="button" aria-label="Next day" disabled={!canNext} onclick={() => onstep(1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>
  </div>
  {#key day}
    {#if c}
      <div class="dcol" style:height="{c.height}px" in:fly={{ x: calm() ? 0 : dir * 24, duration: calm() ? 0 : 480, easing: cubicOut }}>
        {#each c.hours as h (h)}<div class="dcol-h" style:top="{c.y(h)}px"><span>{new Date(h).getHours()}:00</span></div>{/each}
        {#each c.folds as f (f.a)}<div class="dcol-fold" style:top="{c.y(f.a)}px" style:height="{FOLD_H}px"><span>{api.fmtDur(f.fold)} without focus</span></div>{/each}
        {#each c.rail as x, i (i)}<i class="dcol-r {x.k}" class:off={x.k === "f" && off(x.it.label)} style:top="{x.top}px" style:height="{x.h}px" data-tip={railTip(x)}></i>{/each}
        {#each c.runs as r, i (i)}
          <div class="dcol-c" class:one={r.h < 40} class:off={off(r.label)} class:live={r.items.at(-1).live} style:top="{r.top}px" style:height="{r.h}px" data-tip={runTip(r)}>
            <span class="dcol-t"><i class="label-dot" class:none={!r.label} style:--h={r.label ? labelHue(r.label) : null}></i><span>{r.title}</span></span>
            <span class="dcol-m">
              <span>{#if r.h < 40}{api.fmtDur(Math.max(MIN, r.ms))}{:else}{clock(r.from)}–{r.items.at(-1).live ? "now" : clock(r.to)} · {api.fmtDur(Math.max(MIN, r.ms))}{/if}</span>
              {#if r.h >= 40}<span class="cyc" aria-hidden="true">{#each r.items.slice(0, 9) as x, j (j)}<i class={kindOf(x)}></i>{/each}</span>{/if}
            </span>
          </div>
        {/each}
        {#if c.nowY >= 0}<div class="dcol-now" style:top="{c.nowY}px"><span>Now</span></div>{/if}
      </div>
    {/if}
  {/key}
</div>
