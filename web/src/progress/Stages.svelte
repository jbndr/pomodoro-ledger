<script>
  import { untrack } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { Tween } from "svelte/motion";
  import { fly } from "svelte/transition";
  import { calm } from "../dom";
  import { MIN } from "../lib/dates";
  import { matchesLabel } from "../lib/tasks";

  let { api, day, items, gaps, sum, isToday, now, filter = "", name, dir = 1, canPrev, canNext, onstep } = $props();
  const uid = $props.id();
  let w = $state(0), at = $state(null), sel = $state(null), zoom = $state(null);

  const HOUR = 60 * MIN, HALF = 30 * MIN, LH = 40, BH = 22, AX = 24, LANES = ["f", "s", "l", "i"], MIN_SPAN = 10 * MIN;
  const STEPS = [5, 10, 15, 30, 60, 120, 180].map((m) => m * MIN);
  const NAMES = { f: "Focus", s: "Short breaks", l: "Long breaks", i: "Idle" }, KIND = { f: "Focus", s: "Short break", l: "Long break", i: "Idle" };
  const laneOf = (x) => (x.kind === "focus" ? "f" : x.kind === "break" ? (x.long ? "l" : "s") : "i");
  const laneY = (k) => LANES.indexOf(k) * LH + LH / 2;
  const pad = (n) => String(n).padStart(2, "0");

  const seq = $derived([...items, ...gaps.map((g) => ({ kind: "idle", ...g }))].sort((a, b) => a.from - b.from));
  // A day without focus keeps the same frame, over working hours, so the card never changes height.
  const full = $derived.by(() => {
    const start = items.length ? sum.start : Math.min(day + 8 * HOUR, isToday ? now - HOUR : Infinity);
    const end = Math.max(items.length ? sum.end : day + 18 * HOUR, isToday ? now : 0);
    return { from: Math.floor((start - 5 * MIN) / HALF) * HALF, to: Math.ceil((end + 5 * MIN) / HALF) * HALF };
  });

  // The visible span glides when you zoom or reset, and follows the day directly otherwise.
  const view = new Tween(untrack(() => ({ ...full })), { duration: 0 });
  let glide = false;
  $effect(() => { day; untrack(() => { zoom = null; sel = null; at = null; }); });
  $effect(() => {
    const t = zoom || full;
    view.set({ from: t.from, to: t.to }, { duration: glide && !calm() ? 460 : 0, easing: cubicOut });
    glide = false;
  });

  const c = $derived.by(() => {
    const W = w || 640, LT = LANES.length * LH, H = LT + AX, { from, to } = view.current, span = to - from;
    const x = (t) => ((t - from) / span) * W;
    const step = STEPS.find((s) => (s / span) * W >= 52) || 3 * HOUR;
    const ticks = [];
    for (let h = day + Math.ceil((from - day) / step) * step; h <= to; h += step) ticks.push(h);
    const blocks = seq.map((it, i) => ({ i, it, k: laneOf(it), x: x(it.from), w: Math.max(2.5, x(it.to) - x(it.from)) }));
    const links = [];
    for (let i = 1; i < blocks.length; i++) {
      const a = blocks[i - 1], b = blocks[i];
      if (a.k === b.k) continue;
      const ya = laneY(a.k), yb = laneY(b.k), down = yb > ya;
      links.push({ i, x: b.x, a: a.k, b: b.k, y1: ya + (down ? BH / 2 : -BH / 2), y2: yb + (down ? -BH / 2 : BH / 2) });
    }
    return { W, H, LT, x, from, span, ticks, step, blocks, links, nowX: isToday ? x(now) : -1 };
  });
  const tickText = (h) => { const d = new Date(h); return c.step < HOUR ? d.getHours() + ":" + pad(d.getMinutes()) : String(d.getHours()); };

  const clock = (t) => api.fmtClock(t);
  const totals = $derived.by(() => {
    if (!zoom) return { f: sum.focus, s: sum.rest, l: sum.long, i: sum.idle };
    const t = { f: 0, s: 0, l: 0, i: 0 };
    for (const it of seq) if (!it.live) t[laneOf(it)] += Math.max(0, Math.min(it.to, zoom.to) - Math.max(it.from, zoom.from));
    return t;
  });
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

  const tAt = (X) => c.from + (X / c.W) * c.span;
  const rel = (e) => { const r = e.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(c.W, ((e.clientX - r.left) / r.width) * c.W)); };
  const range = $derived(sel ? [tAt(Math.min(sel.a, sel.b)), tAt(Math.max(sel.a, sel.b))] : null);

  function scrubAt(X) {
    if (!c.blocks.length) return;
    const t = tAt(X), dist = (b) => (t < b.it.from ? b.it.from - t : t >= b.it.to ? t - b.it.to : 0);
    at = { X, t, b: c.blocks.reduce((best, b) => (dist(b) < dist(best) ? b : best)) };
  }
  function zoomTo(a, b) {
    const span = Math.min(full.to - full.from, Math.max(MIN_SPAN, b - a)), from = Math.max(full.from, Math.min(a, full.to - span));
    glide = true;
    zoom = { from, to: from + span };
    at = null;
  }
  function reset() {
    if (!zoom) return;
    glide = true;
    zoom = null;
  }
  function pan(d) {
    const span = zoom.to - zoom.from, from = Math.max(full.from, Math.min(full.to - span, zoom.from + (d * span) / 2));
    glide = true;
    zoom = { from, to: from + span };
  }
  function commit() {
    const r = range;
    sel = null;
    if (r && r[1] - r[0] >= MIN_SPAN) zoomTo(r[0], r[1]);
  }

  // Mouse: hover reads a moment, a drag picks a span. Touch: one finger reads, two fingers pick a span.
  let press = null, pinch = false;
  const touches = new Map();
  function down(e) {
    const X = rel(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.pointerType === "touch") {
      touches.set(e.pointerId, X);
      if (touches.size === 2) { pinch = true; at = null; const [a, b] = touches.values(); sel = { a, b }; }
      else if (!pinch) scrubAt(X);
    } else if (e.button === 0) press = { x0: X, moved: false };
  }
  function move(e) {
    const X = rel(e);
    if (e.pointerType === "touch") {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, X);
      if (touches.size === 2) { const [a, b] = touches.values(); sel = { a, b }; }
      else if (!pinch) scrubAt(X);
    } else if (press) {
      if (press.moved || Math.abs(X - press.x0) > 5) { press.moved = true; at = null; sel = { a: press.x0, b: X }; }
    } else scrubAt(X);
  }
  function up(e) {
    if (e.pointerType === "touch") {
      touches.delete(e.pointerId);
      if (sel) commit();
      if (!touches.size) { pinch = false; at = null; }
      return;
    }
    if (press?.moved) commit();
    press = null;
  }
  function leave(e) { if (e.pointerType === "mouse" && !press) at = null; }
  function cancel() { press = null; sel = null; pinch = false; touches.clear(); at = null; }
  function keys(e) {
    if (!zoom) return;
    if (e.key === "Escape") { e.stopPropagation(); reset(); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); pan(e.key === "ArrowRight" ? 1 : -1); }
  }
  const lit = $derived(at ? at.b.i : -1);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="stages" onkeydown={keys}>
  <div class="sg-top">
    <div class="sg-read">
      <h3>Your day</h3>
      <p class="sg-line" aria-live="polite">
        {#if range}<b>{clock(range[0])} – {clock(range[1])}</b> · {api.fmtDur(Math.max(MIN, range[1] - range[0]))}
        {:else if at}<i style:--c="var(--c-{at.b.k})"></i><b>{clock(at.t)}</b> {KIND[at.b.k]} · {detail(at.b.it, at.b.k)}
        {:else if zoom}<button class="sg-reset" type="button" onclick={reset}>Whole day</button>{clock(zoom.from)} – {clock(zoom.to)} · {api.fmtDur(zoom.to - zoom.from)}
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
      {#if items.length && !zoom}<span class="sg-hint" aria-hidden="true">Drag to zoom</span>{/if}
    </div>
    {#key day}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="sg-plot" class:dim={lit >= 0} tabindex="0" role="group" aria-label={zoom ? "Zoomed in. Arrow keys move, Escape shows the whole day." : "Drag across to zoom in."} bind:clientWidth={w}
        onpointermove={move} onpointerdown={down} onpointerup={up} onpointerleave={leave} onpointercancel={cancel} ondblclick={reset}
        in:fly={{ x: calm() ? 0 : dir * 24, duration: calm() ? 0 : 480, easing: cubicOut }}>
        <svg viewBox="0 0 {c.W} {c.H}" role="img" aria-label="{name}: {api.fmtDur(sum.focus)} focus, {api.fmtDur(sum.rest)} short breaks, {api.fmtDur(sum.long)} long breaks, {api.fmtDur(sum.idle)} idle">
          <defs>
            <clipPath id="{uid}-clip"><rect x="0" y="-8" width={c.W} height={c.LT + 16} /></clipPath>
            <pattern id="{uid}-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="hatch-bg" width="5" height="5" /><line class="hatch-ln" x1="1" y1="0" x2="1" y2="5" /></pattern>
            {#each c.links as l (l.i)}<linearGradient id="{uid}-g{l.i}" gradientUnits="userSpaceOnUse" x1={l.x} y1={l.y1} x2={l.x} y2={l.y2}><stop offset="0" style:stop-color="var(--c-{l.a})" /><stop offset="1" style:stop-color="var(--c-{l.b})" /></linearGradient>{/each}
          </defs>
          {#each [1, 2, 3] as j (j)}<line class="sep" x1="0" x2={c.W} y1={j * LH} y2={j * LH} />{/each}
          {#each c.ticks as h (h)}<line class="hr" x1={c.x(h)} x2={c.x(h)} y1="0" y2={c.LT} />{/each}
          <g clip-path="url(#{uid}-clip)">
            {#if c.nowX >= 0}<rect class="fut" x={c.nowX} y="0" width={Math.max(0, c.W - c.nowX)} height={c.LT} rx="6" />{/if}
            {#each c.links as l (l.i)}<line class="cn" x1={l.x} x2={l.x} y1={l.y1} y2={l.y2} stroke="url(#{uid}-g{l.i})" />{/each}
            {#each c.blocks as b (b.i)}
              <rect class="blk {b.k}" class:live={b.it.live} class:on={b.i === lit} class:off={off(b.it)} x={b.x} y={laneY(b.k) - BH / 2} width={b.w} height={BH} rx={Math.min(6, b.w / 2)} fill={b.k === "i" ? `url(#${uid}-hatch)` : null} />
            {/each}
            {#if c.nowX >= 0}<line class="nowl" x1={c.nowX} x2={c.nowX} y1="-4" y2={c.LT + 4} />{/if}
          </g>
          {#each c.ticks as h (h)}{#if c.nowX < 0 || Math.abs(c.x(h) - c.nowX) > 30}<text class="ax" x={c.x(h)} y={c.H - 6} text-anchor="middle">{tickText(h)}</text>{/if}{/each}
          {#if c.nowX >= 0 && c.nowX <= c.W}<text class="ax now" x={c.nowX} y={c.H - 6} text-anchor="middle">Now</text>{/if}
          {#if sel}<rect class="sel" x={Math.min(sel.a, sel.b)} y="-4" width={Math.abs(sel.b - sel.a)} height={c.LT + 8} rx="6" />{/if}
          {#if at}
            <line class="hair" x1={at.X} x2={at.X} y1="-4" y2={c.LT + 4} />
            <circle class="knob" r="4.5" cx={at.X} cy={laneY(at.b.k)} />
          {/if}
        </svg>
      </div>
    {/key}
  </div>
</div>
