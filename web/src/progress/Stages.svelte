<script>
  import { fly } from "svelte/transition";
  import { calm } from "../dom";
  import { MIN } from "../lib/dates";
  import { matchesLabel } from "../lib/tasks";

  let { api, day, items, gaps, sum, isToday, now, filter = "", name, dir = 1, canPrev, canNext, onstep } = $props();
  const uid = $props.id();
  let w = $state(0), at = $state(null);

  const HOUR = 60 * MIN, HALF = 30 * MIN, LH = 40, BH = 22, AX = 24, LANES = ["f", "s", "l", "i"];
  const NAMES = { f: "Focus", s: "Short breaks", l: "Long breaks", i: "Idle" }, KIND = { f: "Focus", s: "Short break", l: "Long break", i: "Idle" };
  const laneOf = (x) => (x.kind === "focus" ? "f" : x.kind === "break" ? (x.long ? "l" : "s") : "i");
  const laneY = (k) => LANES.indexOf(k) * LH + LH / 2;

  const c = $derived.by(() => {
    const W = Math.max(240, w || 640), LT = LANES.length * LH, H = LT + AX;
    const seq = [...items, ...gaps.map((g) => ({ kind: "idle", ...g }))].sort((a, b) => a.from - b.from);
    // A day without focus keeps the same frame, over working hours, so the card never changes height.
    const start = items.length ? sum.start : Math.min(day + 8 * HOUR, isToday ? now - HOUR : Infinity);
    const end = Math.max(items.length ? sum.end : day + 18 * HOUR, isToday ? now : 0);
    const from = Math.floor((start - 5 * MIN) / HALF) * HALF, to = Math.ceil((end + 5 * MIN) / HALF) * HALF;
    const x = (t) => ((t - from) / (to - from)) * W, hourPx = W / ((to - from) / HOUR), step = (hourPx >= 44 ? 1 : hourPx >= 22 ? 2 : 3) * HOUR;
    const ticks = [];
    for (let h = Math.ceil(from / HOUR) * HOUR; h <= to; h += step) ticks.push(h);
    const blocks = seq.map((it, i) => ({ i, it, k: laneOf(it), x: x(it.from), w: Math.max(2.5, x(it.to) - x(it.from)) }));
    const links = [];
    for (let i = 1; i < blocks.length; i++) {
      const a = blocks[i - 1], b = blocks[i];
      if (a.k === b.k) continue;
      const ya = laneY(a.k), yb = laneY(b.k), down = yb > ya;
      links.push({ i, x: b.x, a: a.k, b: b.k, y1: ya + (down ? BH / 2 : -BH / 2), y2: yb + (down ? -BH / 2 : BH / 2) });
    }
    return { W, H, LT, x, from, to, ticks, blocks, links, nowX: isToday ? x(now) : -1, end };
  });

  const clock = (t) => api.fmtClock(t);
  const totals = $derived({ f: sum.focus, s: sum.rest, l: sum.long, i: sum.idle });
  const kindLine = (it) => it.flow ? "Flow" : it.over ? "Past the bell" : it.live ? "In focus now" : it.full ? "Cycle" : "Stopped early";
  const detail = (it, k) => {
    const span = clock(it.from) + "–" + (it.live ? "now" : clock(it.to)) + " · " + api.fmtDur(Math.max(MIN, it.to - it.from));
    if (k === "f") return it.title + (it.label ? " · " + it.label : "") + " · " + span + " · " + kindLine(it);
    if (k === "i") return span + " with no focus and no break";
    return span + (it.nudge ? " · " + it.nudge : "");
  };
  // With a label picked, the whole day stays, so breaks and idle keep their meaning; other labels' focus steps back.
  const off = (it) => !!filter && it.kind === "focus" && !matchesLabel(it.label, filter);
  const picked = $derived(filter ? items.reduce((n, it) => n + (it.kind === "focus" && !it.live && !off(it) ? it.ms : 0), 0) : 0);
  const rest = $derived([
    api.fmtDur(sum.focus) + " focus" + (filter ? " (" + api.fmtDur(picked) + " " + (filter === "none" ? "no label" : filter.slice(8)) + ")" : ""),
    ...(sum.due ? [sum.taken + " of " + sum.due + " breaks taken"] : []),
    ...(sum.idle >= MIN ? [api.fmtDur(sum.idle) + " idle"] : []),
    clock(sum.start) + " – " + (isToday ? "now" : clock(sum.end)),
  ].join(" · "));

  function scrub(e) {
    if (!c.blocks.length) return;
    const r = e.currentTarget.getBoundingClientRect(), lo = c.x(sum.start), hi = c.x(isToday ? Math.min(c.end, now) : sum.end);
    const X = Math.max(lo, Math.min(hi - 0.5, e.clientX - r.left)), t = c.from + (X / c.W) * (c.to - c.from);
    const b = c.blocks.find((b) => t >= b.it.from && t < b.it.to) || c.blocks.at(-1);
    at = { X, t, b };
  }
  function end() { at = null; }
  const move = (e) => { if (e.pointerType === "mouse" || e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e); };
  const down = (e) => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e); };
  const up = (e) => { if (e.pointerType !== "mouse") end(); };
  const leave = (e) => { if (e.pointerType === "mouse") end(); };
  const lit = $derived(at ? at.b.i : -1);
</script>

<div class="stages">
  <div class="sg-top">
    <div class="sg-read">
      <h3>Your day</h3>
      <p class="sg-line" aria-live="polite">
        {#if at}<i style:--c="var(--c-{at.b.k})"></i><b>{clock(at.t)}</b> {KIND[at.b.k]} · {detail(at.b.it, at.b.k)}
        {:else if items.length}{rest}
        {:else}{isToday ? "Nothing logged yet. Your day draws itself here as you focus and take breaks." : "No focus logged on this day."}{/if}
      </p>
    </div>
    <div class="sg-nav">
      <button class="icon-btn" type="button" aria-label="Previous day" disabled={!canPrev} onclick={() => onstep(-1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>
      <span class="sg-date">{isToday ? "Today" : name}</span>
      <button class="icon-btn" type="button" aria-label="Next day" disabled={!canNext} onclick={() => onstep(1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>
  </div>
  <div class="sg-chart">
    <div class="sg-lanes">
      {#each LANES as k (k)}<div class="sg-lane"><i class="sg-sw {k}"></i><span><span class="full">{NAMES[k]}</span><span class="abbr">{KIND[k].split(" ")[0]}</span></span><b>{totals[k] ? api.fmtDur(totals[k]) : "–"}</b></div>{/each}
    </div>
    {#key day}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="sg-plot" class:dim={lit >= 0} bind:clientWidth={w} onpointermove={move} onpointerdown={down} onpointerup={up} onpointerleave={leave} onpointercancel={end}
        in:fly={{ x: calm() ? 0 : dir * 24, duration: calm() ? 0 : 480, easing: (t) => 1 - Math.pow(1 - t, 3) }}>
        <svg viewBox="0 0 {c.W} {c.H}" role="img" aria-label="{name}: {api.fmtDur(sum.focus)} focus, {api.fmtDur(sum.rest)} short breaks, {api.fmtDur(sum.long)} long breaks, {api.fmtDur(sum.idle)} idle">
          <defs>
            <pattern id="{uid}-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="hatch-bg" width="5" height="5" /><line class="hatch-ln" x1="1" y1="0" x2="1" y2="5" /></pattern>
            {#each c.links as l (l.i)}<linearGradient id="{uid}-g{l.i}" gradientUnits="userSpaceOnUse" x1={l.x} y1={l.y1} x2={l.x} y2={l.y2}><stop offset="0" style:stop-color="var(--c-{l.a})" /><stop offset="1" style:stop-color="var(--c-{l.b})" /></linearGradient>{/each}
          </defs>
          {#if c.nowX >= 0}<rect class="fut" x={c.nowX} y="0" width={Math.max(0, c.W - c.nowX)} height={c.LT} rx="6" />{/if}
          {#each [1, 2, 3] as j (j)}<line class="sep" x1="0" x2={c.W} y1={j * LH} y2={j * LH} />{/each}
          {#each c.ticks as h (h)}<line class="hr" x1={c.x(h)} x2={c.x(h)} y1="0" y2={c.LT} />{/each}
          {#each c.links as l (l.i)}<line class="cn" x1={l.x} x2={l.x} y1={l.y1} y2={l.y2} stroke="url(#{uid}-g{l.i})" />{/each}
          {#each c.blocks as b (b.i)}
            <rect class="blk {b.k}" class:live={b.it.live} class:on={b.i === lit} class:off={off(b.it)} x={b.x} y={laneY(b.k) - BH / 2} width={b.w} height={BH} rx={Math.min(6, b.w / 2)} fill={b.k === "i" ? `url(#${uid}-hatch)` : null} />
          {/each}
          {#if c.nowX >= 0}<line class="nowl" x1={c.nowX} x2={c.nowX} y1="-4" y2={c.LT + 4} />{/if}
          {#each c.ticks as h (h)}{#if c.nowX < 0 || Math.abs(c.x(h) - c.nowX) > 30}<text class="ax" x={c.x(h)} y={c.H - 6} text-anchor="middle">{new Date(h).getHours()}</text>{/if}{/each}
          {#if c.nowX >= 0}<text class="ax now" x={c.nowX} y={c.H - 6} text-anchor="middle">Now</text>{/if}
          {#if at}
            <line class="hair" x1={at.X} x2={at.X} y1="-4" y2={c.LT + 4} />
            <circle class="knob" r="4.5" cx={at.X} cy={laneY(at.b.k)} />
          {/if}
        </svg>
      </div>
    {/key}
  </div>
</div>
