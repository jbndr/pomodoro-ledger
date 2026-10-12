<script module>
  let last = null, lastSkew = 0;
</script>

<script>
  import { flushSync, tick } from "svelte";
  import { slide } from "svelte/transition";
  import { calm, hold } from "../dom";
  import { pad } from "../lib/dates";
  import { focusing, weekText } from "../lib/crew";
  import { GOAL_STEPS, goalStep, mateClock, normCode } from "../lib/room";
  import { room, roomClock } from "../lib/redraw.svelte";
  import { hhmm, hueOf, initials, phaseAt, RHYTHMS, SIZE, sortRooms } from "../lib/rhythm";
  import { clockIn, dayTag, localZone, LONGEST, nextSession, spanText, STEP, startStep, typedTime } from "../lib/schedule";
  import { spinValue } from "../lib/settings";
  import Ask from "./Ask.svelte";
  import { copyInvite } from "./invite";
  import Ring from "./Ring.svelte";

  let { api } = $props();

  const TOP = 3, WIDTH = 348;
  const WEEK = [[1, "M", "Monday"], [2, "T", "Tuesday"], [3, "W", "Wednesday"], [4, "T", "Thursday"], [5, "F", "Friday"], [6, "S", "Saturday"], [0, "S", "Sunday"]];
  const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.3 7.3A16.5 16.5 0 0 0 2.5 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a2.8 2.8 0 0 0 4 4"/><path d="M3 3l18 18"/></svg>';
  const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';
  const MINUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>';
  const FLAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 20.5V4.5"/><path d="M6 4.5h11l-2.4 4 2.4 4H6"/></svg>';
  const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';
  const slot = (m) => pad(Math.floor(m / 60)) + ":" + pad(m % 60);

  let shown = $state(false), view = $state("main"), dir = $state("r"), popEl, rootEl;
  let data = $state(last), failed = $state(false), skew = lastSkew, now = $state(Date.now() - lastSkew), due = 0, marks = $state(0);
  let allOpen = $state(false), filter = $state("all"), allSched = $state(false);
  let name = $state(""), naming = $state(false), nameEl = $state(), note = $state(""), busy = $state(false);
  let coding = $state(false), code = $state(""), codeEl = $state();
  let title = $state(""), rhythm = $state("25/5"), who = $state("public"), when = $state("now"), titleEl = $state();
  let goal = $state(0);
  let crewName = $state(""), renaming = $state(false), crewInv = $state(null), leaving = $state(false), leaveT = 0, slotT = 0, crewNameEl = $state();
  let cdays = $state([1, 2, 3, 4, 5]), cfrom = $state(19 * 60), clen = $state(120);
  let days = $state([1, 2, 3, 4, 5]), from = $state(Math.min(23, new Date().getHours() + 1) * 60), want = $state(120), typed = "", typedAt = 0, err = $state("");
  let place = $state({ top: 0, left: 0 });

  const v = $derived.by(() => { room.version; return { on: !!api.RM.code, code: api.RM.code || "", pub: api.RM.pub, names: api.RM.members.map((m) => m.name), owner: api.RM.owner, goal: api.RM.goal }; });
  const clock = $derived.by(() => { roomClock.version; room.version; return Date.now() - api.RM.skew; });
  const step = $derived.by(() => { roomClock.version; room.version; return api.inStep(); });
  const invited = $derived(api.invite.length === 6 && !v.on);

  const mine = () => (api.S.settings.focus >= 45 ? "50/10" : "25/5");
  // Listings you reported stay hidden here; for a few seconds after reporting, the row offers Undo instead.
  let hidden = $state(api.ls.get("pl.hidden", {})), undoing = $state({});
  const undoT = {};
  const keyOf = (r) => (r.sched ? "s:" + r.sched : "r:" + r.code);
  const visible = (k) => !hidden[k] || k in undoing;
  const rooms = $derived(data ? sortRooms(data.rooms).filter((r) => visible(keyOf(r))) : []);
  const quick = $derived.by(() => {
    const open = rooms.filter((r) => r.names.length < r.max && !hidden[keyOf(r)]), want = mine();
    return open.find((r) => r.rhythm === want && r.names.length) || open.find((r) => r.names.length) || open.find((r) => r.rhythm === want) || open[0] || null;
  });
  const top = $derived(rooms.slice(0, TOP));
  const listed = $derived(rooms.filter((r) => filter === "all" || r.rhythm === filter));
  const upcoming = $derived(data ? [...(data.upcoming || [])].filter((u) => visible("s:" + u.id)).sort((a, b) => a.start - b.start) : []);
  const sched = $derived(allSched ? upcoming : upcoming.slice(0, 2));
  const busyRoom = $derived(rooms.find((r) => r.rhythm === rhythm && r.names.length >= 2 && r.names.length < r.max));
  const lastStart = $derived(1440 - startStep(rhythm));
  const longest = $derived(Math.min(LONGEST, 1440 - from));
  const len = $derived(Math.min(want, longest));
  $effect(() => { if (from % startStep(rhythm)) from = Math.min(lastStart, Math.ceil(from / 60) * 60); });
  const reminded = (id) => marks >= 0 && api.sched.reminded(id);
  const owns = (id) => marks >= 0 && api.sched.owns(id);

  const C = api.crew;
  const cv = $derived.by(() => {
    room.version;
    const c = C.CR;
    return { on: C.crewsOn(), code: c.code, live: c.live, crew: c.crew, members: c.members, you: c.you, week: c.week, remind: c.remind, hide: c.hide, here: !!c.crew && api.RM.code === c.crew.room };
  });
  const crewInvited = () => !!api.crewInvite && api.crewInvite !== C.CR.code;
  const others = $derived(cv.members.filter((m) => m.id !== cv.you));
  const crewSub = $derived.by(() => {
    if (!cv.live) return "Connecting…";
    const busy = others.filter(focusing).length, here = others.filter((m) => m.on).length;
    const one = others.find(focusing);
    return busy === 1 ? one.name + " is focusing" : busy ? busy + " focusing now" : here ? here + " around" : others.length ? "Nobody else around" : "Just you so far";
  });
  const nextCrew = $derived(cv.crew && cv.crew.slot ? nextSession(cv.crew.slot, now) : null);
  const mateState = (m) => !m.on ? "Away" : focusing(m) ? "Focusing · " + mateClock(m.s, now + skew) + " left" : m.s && m.s.status === "running" ? "On a break" : m.s && m.s.status === "paused" ? "Paused" : "Around";

  export const isOpen = () => shown;

  export function open() {
    if (shown) return;
    view = invited ? "invite" : crewInvited() ? "crew-invite" : "main"; dir = "r";
    if (invited) code = api.invite;
    if (view === "crew-invite") { crewInv = null; C.crewInfo(api.crewInvite).then((i) => { crewInv = i || false; }); }
    renaming = false; leaving = false;
    name = api.RM.name; naming = !api.RM.name; note = ""; coding = false; allOpen = false; allSched = false;
    measure();
    shown = true;
    document.getElementById("openRoom")?.setAttribute("aria-expanded", "true");
    flushSync();
    first()?.focus({ preventScroll: true });
    load();
  }

  export function close(refocus = true) {
    if (!shown) return;
    shown = false;
    document.getElementById("openRoom")?.setAttribute("aria-expanded", "false");
    if (refocus) document.getElementById("openRoom")?.focus({ preventScroll: true });
  }

  const first = () => popEl?.querySelector(naming ? "input" : "button:not(:disabled), input");

  function measure() {
    const pill = document.getElementById("openRoom");
    if (!pill) return;
    const r = pill.getBoundingClientRect();
    // Anchored by its left edge: the body reserves room for its own scrollbar, so a right offset lands short of the pill.
    place = { top: Math.round(r.bottom + 8), left: Math.max(12, Math.round(r.right - WIDTH)) };
  }

  async function load() {
    try {
      const d = await api.roomList();
      d.upcoming = d.upcoming || [];
      skew = lastSkew = Date.now() - d.now; now = d.now; data = last = d; failed = false;
      api.sched.seen(d.upcoming, d.rooms.filter((r) => r.sched).map((r) => r.sched));
      due = Math.min(Infinity, ...d.upcoming.map((u) => u.start), ...d.rooms.filter((r) => r.ends).map((r) => r.ends));
      marks++;
    } catch { failed = !data; }
  }

  $effect(() => {
    if (!shown) return;
    const poll = setInterval(() => { if (!document.hidden) load(); }, 15000);
    const tickNow = setInterval(() => { now = Date.now() - skew; if (now >= due) { due = Infinity; load(); } }, 1000);
    const outside = (e) => { if (!rootEl.contains(e.target) && !e.target.closest?.("#openRoom")) close(false); };
    const resize = () => measure();
    document.addEventListener("pointerdown", outside);
    addEventListener("resize", resize);
    return () => { clearInterval(poll); clearInterval(tickNow); document.removeEventListener("pointerdown", outside); removeEventListener("resize", resize); };
  });

  async function go(next, back = false) {
    dir = back ? "l" : "r";
    view = next; note = ""; err = "";
    await tick();
    (next === "new" ? titleEl : first())?.focus({ preventScroll: true });
  }

  function saveName() {
    const n = name.trim().slice(0, 20);
    if (!n) { naming = true; note = "Add a name so the others know who you are."; tick().then(() => nameEl?.focus()); return false; }
    const changed = n !== api.RM.name;
    api.RM.name = n; api.ls.set("pl.name", n); naming = false;
    if (changed || !C.CR.ws) C.crewRehello();
    return true;
  }

  function enter(c) {
    if (!saveName()) return;
    close(false);
    api.roomEnter(c);
  }

  function joinCode(e) {
    e.preventDefault();
    const c = normCode(code);
    if (c.length !== 6) { note = "Room codes have six letters and digits."; codeEl?.focus(); return; }
    enter(c);
  }

  async function openCode() {
    coding = true; note = "";
    await tick();
    codeEl?.focus();
  }

  async function create(e) {
    e.preventDefault();
    if (!saveName()) return;
    if (who === "public" && !title.trim()) { titleEl.focus(); return; }
    busy = true; err = "";
    try {
      if (who === "public" && when === "later") {
        if (!days.length) { err = "Pick at least one day."; busy = false; return; }
        await api.sched.create({ title: title.trim(), rhythm, max: SIZE.max, days, from, to: from + len });
        title = ""; when = "now";
        await load();
        await go("main", true);
      } else {
        await api.roomCreate(who === "public" ? { title: title.trim(), rhythm, max: SIZE.max } : undefined, goal);
        title = ""; goal = 0;
        close(false);
      }
    } catch (x) {
      err = x === 429 ? "You've scheduled a few already. Try again in a while." : x === 507 ? "There are a lot of schedules right now. Try again in a few days." : x === 400 ? "Check the name, days and times." : "Couldn't start it. Check your connection and try again.";
    }
    busy = false;
  }

  async function remind(s) {
    const on = !api.sched.reminded(s.id), count = (n) => (data.upcoming = data.upcoming.map((u) => (u.id === s.id ? { ...u, going: n } : u)));
    count(Math.max(0, s.going + (on ? 1 : -1)));
    const n = api.sched.remind(s, on);
    marks++;
    const real = await n;
    if (real != null) count(real);
  }

  async function remove(s) {
    if (!(await api.sched.remove(s.id))) return;
    data.upcoming = data.upcoming.filter((u) => u.id !== s.id);
    marks++;
  }

  const setFrom = (m) => { const x = Math.max(0, Math.min(lastStart, m)); if (x === from) return false; from = x; return true; };
  const setLen = (m) => { const x = Math.max(STEP, Math.min(longest, m)); if (x === len) return false; want = x; return true; };
  function fromKey(e) {
    let x = spinValue(e.key, from, startStep(rhythm), 120, 0, lastStart);
    if (x != null) typed = "";
    else if (/^\d$/.test(e.key)) {
      typed = e.timeStamp - typedAt < 1000 && typedTime(typed + e.key) != null ? typed + e.key : e.key;
      typedAt = e.timeStamp;
      const t = typedTime(typed);
      x = Math.min(lastStart, t - (t % startStep(rhythm)));
    }
    if (x == null) return;
    e.preventDefault(); setFrom(x);
  }
  function lenKey(e) {
    const x = /^[1-8]$/.test(e.key) ? +e.key * 60 : spinValue(e.key, len, STEP, 60, STEP, longest);
    if (x == null) return;
    e.preventDefault(); setLen(x);
  }
  const TOP_GOAL = GOAL_STEPS.at(-1);
  const goalLabel = (n) => (n ? n + " rounds" : "Off");
  function goalKey(e, n, set) {
    const x = e.key === "ArrowUp" || e.key === "ArrowRight" ? goalStep(n, 1) : e.key === "ArrowDown" || e.key === "ArrowLeft" ? goalStep(n, -1) : e.key === "Home" ? 0 : e.key === "End" ? TOP_GOAL : null;
    if (x == null) return;
    e.preventDefault(); set(x);
  }
  const setGoal = (n) => { if (n === goal) return false; goal = n; return true; };
  const roomGoalN = () => (api.RM.goal && api.RM.goal.n) || 0;
  const setRoomGoal = (n) => { if (n === roomGoalN()) return false; api.roomGoal(n); return true; };
  const toggleDay = (d) => (days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);

  const here = (r) => {
    const n = r.names.length, p = phaseAt(r.rhythm, now);
    return n ? n + (n === 1 ? " person" : " people") + " · " + (p.focus ? "focus" : "break") + " until " + hhmm(p.end) : (p.focus ? "Focus" : "Break") + " until " + hhmm(p.end);
  };
  const quickSub = (r) => r.names.length ? "Joins " + r.title + ", " + r.names.length + " focusing on " + r.rhythm : "Opens " + r.title + " on " + r.rhythm + ". Others can drop in";
  const pane = () => calm() ? "" : "in-" + dir;

  function openCrew() {
    const sl = cv.crew && cv.crew.slot;
    if (sl) { cdays = [...sl.days]; cfrom = sl.from; clen = sl.to - sl.from; }
    renaming = false; leaving = false;
    go("crew");
  }

  async function startCrew(e) {
    e.preventDefault();
    if (!saveName()) return;
    const n = crewName.trim();
    if (!n) { crewNameEl?.focus(); return; }
    busy = true; err = "";
    try { await C.crewCreate(n); crewName = ""; openCrew(); }
    catch (x) { err = x === 429 ? "You've started a few crews already. Try again in a while." : "Couldn't start it. Check your connection and try again."; }
    busy = false;
  }

  function joinCrew(e) {
    e.preventDefault();
    if (!saveName() || !crewInv) return;
    C.crewJoin(api.crewInvite);
    api.crewInvite = "";
    openCrew();
  }

  function rename() {
    const n = crewName.trim();
    renaming = false;
    if (n && cv.crew && n !== cv.crew.name) C.crewRename(n);
  }

  // Crew time is shared, so changes go out once the controls rest, and someone else's change shows unless you're mid-edit.
  let slotPending = false;
  function sendSlot(on) {
    clearTimeout(slotT);
    slotPending = true;
    const tz = (cv.crew && cv.crew.slot && cv.crew.slot.tz) || localZone();
    slotT = setTimeout(() => { slotPending = false; C.crewSlot(on && cdays.length ? { tz, days: [...cdays].sort(), from: cfrom, to: cfrom + clen } : null); }, on ? 800 : 0);
  }
  $effect(() => {
    const sl = cv.crew && cv.crew.slot;
    if (sl && !slotPending) { cdays = [...sl.days]; cfrom = sl.from; clen = sl.to - sl.from; }
  });
  const setCrewFrom = (m) => { const x = Math.max(0, Math.min(1440 - STEP, m)); if (x === cfrom) return false; cfrom = x; clen = Math.min(clen, Math.min(LONGEST, 1440 - x)); sendSlot(true); return true; };
  const setCrewLen = (m) => { const x = Math.max(STEP, Math.min(Math.min(LONGEST, 1440 - cfrom), m)); if (x === clen) return false; clen = x; sendSlot(true); return true; };
  const toggleCrewDay = (d) => { cdays = cdays.includes(d) ? cdays.filter((x) => x !== d) : [...cdays, d]; sendSlot(cdays.length > 0); };
  function crewFromKey(e) { const x = spinValue(e.key, cfrom, STEP, 120, 0, 1440 - STEP); if (x == null) return; e.preventDefault(); setCrewFrom(x); }
  function crewLenKey(e) { const x = /^[1-8]$/.test(e.key) ? +e.key * 60 : spinValue(e.key, clen, STEP, 60, STEP, Math.min(LONGEST, 1440 - cfrom)); if (x == null) return; e.preventDefault(); setCrewLen(x); }

  function leaveCrew() {
    if (!leaving) { leaving = true; clearTimeout(leaveT); leaveT = setTimeout(() => (leaving = false), 4000); return; }
    clearTimeout(leaveT); leaving = false;
    C.crewLeave();
    go("main", true);
  }

  function report(k, on, e) {
    const [kind, id] = k.split(":"), { [k]: _, ...rest } = hidden, h = e?.currentTarget.closest(".tg-row")?.offsetHeight || 0;
    hidden = on ? { ...Object.fromEntries(Object.entries(hidden).slice(-99)), [k]: Date.now() } : rest;
    api.ls.set("pl.hidden", hidden);
    clearTimeout(undoT[k]);
    if (on) { undoing = { ...undoing, [k]: h }; undoT[k] = setTimeout(() => { const { [k]: _, ...left } = undoing; undoing = left; }, 6000); }
    else { const { [k]: _, ...left } = undoing; undoing = left; }
    api.report(kind, id, on);
  }
</script>

<Ask {api} />

{#snippet faces(names, max = 3)}
  <span class="tg-faces" aria-hidden="true">{#each names.slice(0, max) as n, k (k)}<i style:--h={hueOf(n)}>{initials(n)}</i>{/each}{#if names.length > max}<i class="more">+{names.length - max}</i>{/if}</span>
{/snippet}

{#snippet goalSpin(n, set, label)}
  <div class="tg-spin"><button type="button" tabindex="-1" aria-label="Lower goal" disabled={n <= 0} {@attach hold(() => set(goalStep(n, -1)))}>{@html MINUS}</button><span role="spinbutton" tabindex="0" aria-label={label} aria-valuemin={0} aria-valuemax={TOP_GOAL} aria-valuenow={n} aria-valuetext={n ? n + " rounds" : "No goal"} onkeydown={(e) => goalKey(e, n, set)}>{goalLabel(n)}</span><button type="button" tabindex="-1" aria-label="Higher goal" disabled={n >= TOP_GOAL} {@attach hold(() => set(goalStep(n, 1)))}>{@html PLUS}</button></div>
{/snippet}

{#snippet crewFaces(ms)}
  <span class="tg-faces tg-crew-faces" aria-hidden="true">{#each ms as m (m.id)}<i style:--h={hueOf(m.name)} class:off={!m.on || (m.id === cv.you && cv.hide)} class:busy={focusing(m)}>{initials(m.name)}</i>{/each}</span>
{/snippet}

{#snippet flag(k, title)}
  <button class="tg-flag" type="button" aria-label={"Report “" + title + "”"} title="Report" onclick={(e) => report(k, true, e)}>{@html FLAG}</button>
{/snippet}

{#snippet gone(k)}
  <div class="tg-row tg-gone" style:min-height="{undoing[k]}px" out:slide={{ duration: calm() ? 0 : 220 }}><div class="tg-what"><b>Reported</b><span>It's hidden for you now.</span></div><button class="tg-remind" type="button" onclick={() => report(k, false)}>Undo</button></div>
{/snippet}

{#snippet roomRow(r)}
  {@const full = r.names.length >= r.max}
  {@const k = keyOf(r)}
  {#if k in undoing}{@render gone(k)}
  {:else}
    <div class="tg-row">
      <div class="tg-what"><b>{r.title}<span>{" · " + r.rhythm}</span></b><span>{#if r.names.length}{@render faces(r.names)}{/if}{here(r)}</span></div>
      {#if !r.house && !(r.sched && owns(r.sched))}{@render flag(k, r.title)}{/if}
      <button class="tg-join" type="button" disabled={full} aria-label={full ? r.title + " is full" : "Join " + r.title} onclick={() => enter(r.code)}>{full ? "Full" : "Join"}</button>
    </div>
  {/if}
{/snippet}

<div class="tg" id="room" hidden={!shown} bind:this={rootEl} style:--tg-top="{place.top}px" style:--tg-left="{place.left}px">
  <div class="tg-pop" role="dialog" aria-label="Work together" bind:this={popEl}>
    {#if v.on}
      {#if v.pub}
        {@const p = phaseAt(v.pub.rhythm, clock)}
        <div class="tg-here">
          <Ring rhythm={v.pub.rhythm} now={clock} big />
          <div><b>{v.pub.title}</b><span>{p.focus ? "Focus" : "Break"} until {hhmm(p.end)} · {v.pub.rhythm}</span><span class="tg-here-faces">{@render faces(v.names, 6)}{v.names.length} of {v.pub.max || 12} here</span></div>
        </div>
        <p class="tg-note">{step ? "Your timer follows the room clock. Pause or skip to go your own way." : "Your timer is off the room clock. Rejoin and it jumps to the room's current round."}</p>
      {:else}
        {#if cv.here}
          <div class="tg-here private"><div><b>{cv.crew.name}</b><span>Your crew's room. It's always here, whenever one of you comes in.</span></div></div>
        {:else}
          <div class="tg-here private"><div><b>Your room</b><span>Share the code or the link. Only people with it can join.</span></div><span class="tg-code">{v.code}</span></div>
        {/if}
        {#if v.owner}
          {@const n = (v.goal && v.goal.n) || 0}
          <div class="tg-opt tg-goal"><span>Room goal<small>{v.goal && v.goal.done ? v.goal.done + (v.goal.done === 1 ? " round" : " rounds") + " finished so far" : "Every finished focus round counts"}</small></span>{@render goalSpin(n, setRoomGoal, "Room goal in rounds")}</div>
        {/if}
      {/if}
      <div class="tg-foot">
        <button class="tg-btn" type="button" onclick={() => { api.roomReset(); close(); }}>Leave</button>
        {#if !v.pub || step}<button class="tg-btn strong" type="button" onclick={() => (cv.here ? C.copyCrewInvite() : copyInvite(api.RM.code))}>Copy invite link</button>
        {:else}<button class="tg-btn strong" type="button" onclick={() => { api.followRoom(true); close(); }}>Rejoin round</button>{/if}
      </div>
    {:else if view === "crew" && cv.code}
      <div class="tg-view {pane()}">
        <button class="tg-back" type="button" onclick={() => go("main", true)}>{@html BACK}Work together</button>
        <div class="tg-crew-top">
          {#if renaming}
            <input class="tg-crew-name" type="text" maxlength="32" aria-label="Crew name" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other" bind:value={crewName} bind:this={crewNameEl}
              onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); rename(); } else if (e.key === "Escape") { e.stopPropagation(); renaming = false; } }} onblur={rename}>
          {:else}
            <div class="tg-crew-titled"><b>{cv.crew ? cv.crew.name : "Your crew"}</b>{#if cv.crew}<button class="tg-inline" type="button" onclick={async () => { crewName = cv.crew.name; renaming = true; await tick(); crewNameEl?.select(); }}>Rename</button>{/if}</div>
          {/if}
          <span>{cv.week ? weekText(cv.week) : "Connecting…"}</span>
        </div>
        <ul class="tg-crew-list" aria-label="In the crew">
          {#each cv.members as m (m.id)}
            {@const me = m.id === cv.you}
            <li class:off={!m.on || (me && cv.hide)}><span class="tg-faces" aria-hidden="true"><i style:--h={hueOf(m.name)} class:busy={focusing(m)}>{initials(m.name)}</i></span><span class="tg-crew-who"><b>{m.name}{#if me}<small>{" · you"}</small>{/if}</b><span>{me && cv.hide ? "Your crew sees you as away" : mateState(m)}</span></span>{#if me && cv.live}<button class="tg-remind tg-hide" type="button" aria-pressed={String(cv.hide)} aria-label={cv.hide ? "Hidden from your crew. Show me again" : "Hide me from my crew"} onclick={() => C.crewHide(!cv.hide)}>{@html EYE_OFF}<span>{cv.hide ? "Hidden" : "Hide me"}</span></button>{/if}</li>
          {/each}
          {#if cv.members.length < 8}<li class="tg-crew-seat"><button class="tg-inline" type="button" onclick={() => C.copyCrewInvite()}>Copy invite link</button><span>Room for {8 - cv.members.length} more</span></li>{/if}
        </ul>
        <div class="tg-crew-time">
        <div class="tg-opt"><span>Crew time</span><div class="tg-seg" role="radiogroup" aria-label="Crew time"><button type="button" role="radio" aria-checked={String(!cv.crew?.slot)} onclick={() => sendSlot(false)}>Any time</button><button type="button" role="radio" aria-checked={String(!!cv.crew?.slot)} onclick={() => sendSlot(true)}>Set times</button></div></div>
        <div class="tg-fold" class:open={!!cv.crew?.slot}><div>
          <div class="tg-days" role="group" aria-label="Days">{#each WEEK as [d, letter, dayName] (d)}<button type="button" aria-pressed={String(cdays.includes(d))} aria-label={dayName} onclick={() => toggleCrewDay(d)}>{letter}</button>{/each}</div>
          <div class="tg-opt"><span>Starts</span><div class="tg-spin"><button type="button" tabindex="-1" aria-label="Earlier" disabled={cfrom <= 0} {@attach hold(() => setCrewFrom(cfrom - STEP))}>{@html MINUS}</button><span role="spinbutton" tabindex="0" aria-label="Crew time starts at" aria-valuemin={0} aria-valuemax={1440 - STEP} aria-valuenow={cfrom} aria-valuetext={slot(cfrom)} onkeydown={crewFromKey}>{slot(cfrom)}</span><button type="button" tabindex="-1" aria-label="Later" disabled={cfrom >= 1440 - STEP} {@attach hold(() => setCrewFrom(cfrom + STEP))}>{@html PLUS}</button></div></div>
          <div class="tg-opt"><span>Lasts</span><div class="tg-spin"><button type="button" tabindex="-1" aria-label="Shorter" disabled={clen <= STEP} {@attach hold(() => setCrewLen(clen - STEP))}>{@html MINUS}</button><span role="spinbutton" tabindex="0" aria-label="Crew time lasts" aria-valuemin={STEP} aria-valuemax={LONGEST} aria-valuenow={clen} aria-valuetext={spanText(clen) + ", until " + slot(cfrom + clen)} onkeydown={crewLenKey}>{spanText(clen)}</span><button type="button" tabindex="-1" aria-label="Longer" disabled={clen >= Math.min(LONGEST, 1440 - cfrom)} {@attach hold(() => setCrewLen(clen + STEP))}>{@html PLUS}</button></div></div>
          <div class="tg-opt tg-crew-next"><span>{nextCrew ? "Next " + (nextCrew.start <= now ? "now" : dayTag(nextCrew.start, now) + " " + clockIn(nextCrew.start)) : ""}</span><button class="tg-remind" type="button" aria-pressed={String(cv.remind)} aria-label={cv.remind ? "Reminding you when crew time starts" : "Remind me when crew time starts"} onclick={() => C.crewRemind(!cv.remind)}>{@html BELL}<span>{cv.remind ? "Reminding" : "Remind me"}</span></button></div>
        </div></div>
        </div>
        <div class="tg-foot">
          <button class="tg-btn" class:danger={leaving} type="button" onclick={leaveCrew}>{leaving ? "Leave for good?" : "Leave crew"}</button>
          {#if cv.crew}<button class="tg-btn strong" type="button" disabled={cv.here} onclick={() => { close(false); C.crewRoom(); }}>{cv.here ? "You're in its room" : "Join crew room"}</button>{/if}
        </div>
      </div>
    {:else if view === "crew-new"}
      <div class="tg-view {pane()}">
        <button class="tg-back" type="button" onclick={() => go("main", true)}>{@html BACK}Work together</button>
        <form class="tg-form" autocomplete="off" onsubmit={startCrew}>
          <div class="tg-title"><b>Start a crew</b><span>A standing room for up to eight people. You see who's around and focusing, and the rounds you finish add up each week. Never anyone's tasks.</span></div>
          <label class="tg-field">Crew name<input type="text" maxlength="32" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other" placeholder="Thesis group" bind:value={crewName} bind:this={crewNameEl}></label>
          {#if naming}<label class="tg-field">Your name<input type="text" maxlength="20" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other" placeholder="Shown to your crew" bind:value={name} bind:this={nameEl}></label>{/if}
          <p class="tg-note" class:tg-err={!!(err || note)} role="status">{err || note || "Next, you get a link to invite the others."}</p>
          <button class="tg-btn strong wide" type="submit" disabled={busy}>Start crew</button>
        </form>
      </div>
    {:else if view === "crew-invite"}
      <div class="tg-view {pane()}">
        <form class="tg-form" autocomplete="off" onsubmit={joinCrew}>
          {#if crewInv === false}
            <div class="tg-title"><b>That crew is gone</b><span>Nobody opened it for a long while, or everyone left. Start your own, or ask for a new link.</span></div>
            <button class="tg-btn strong wide" type="button" onclick={() => { api.crewInvite = ""; go("crew-new"); }}>Start a crew</button>
          {:else}
            <div class="tg-title"><b>Join {crewInv ? crewInv.name : "a crew"}</b><span>{crewInv ? (crewInv.size === 1 ? "1 person is" : crewInv.size + " people are") + " in it, with room for " + (crewInv.max - crewInv.size) + " more. " : ""}A standing room where you see who's around and focusing, and the rounds you finish add up each week. Others see your name and timer, never your tasks, and you can hide yourself any time.</span></div>
            {#if cv.code && cv.crew}<p class="tg-hint">You're in {cv.crew.name}. Joining this crew leaves it.</p>{/if}
            <label class="tg-field">Your name<input type="text" maxlength="20" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other" placeholder="Shown to your crew" bind:value={name} bind:this={nameEl}></label>
            {#if note}<p class="tg-err" role="status">{note}</p>{/if}
            <button class="tg-btn strong wide" type="submit" disabled={!crewInv || crewInv.size >= crewInv.max}>{crewInv && crewInv.size >= crewInv.max ? "This crew is full" : "Join crew"}</button>
          {/if}
          <button class="tg-link" type="button" onclick={() => { api.crewInvite = ""; go("main", true); }}>Not now</button>
        </form>
      </div>
    {:else if view === "invite"}
      <div class="tg-view {pane()}">
        <form class="tg-form" autocomplete="off" onsubmit={joinCode}>
          <div class="tg-title"><b>Join a room</b><span>You've been invited. Others see your name and timer, never your tasks, and you can hide yourself any time.</span></div>
          <label class="tg-field">Your name<input type="text" maxlength="20" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other" placeholder="Shown to people in the room" bind:value={name} bind:this={nameEl}></label>
          <label class="tg-field">Room code<input type="text" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other" placeholder="ABC234" bind:value={code} bind:this={codeEl}></label>
          {#if note}<p class="tg-err" role="status">{note}</p>{/if}
          <button class="tg-btn strong wide" type="submit">Join</button>
          <button class="tg-link" type="button" onclick={() => go("main", true)}>See public rooms instead</button>
        </form>
      </div>
    {:else if view === "new"}
      <div class="tg-view {pane()}">
        <button class="tg-back" type="button" onclick={() => go("main", true)}>{@html BACK}Work together</button>
        <form class="tg-form" autocomplete="off" onsubmit={create}>
          {#if who === "public"}<label class="tg-field">Name<input type="text" maxlength="32" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other" placeholder="Thesis writing" bind:value={title} bind:this={titleEl}></label>{/if}
          <div class="tg-opt"><span>Rhythm</span><div class="tg-seg" role="radiogroup" aria-label="Rhythm">{#each RHYTHMS as r (r.id)}<button type="button" role="radio" aria-checked={String(rhythm === r.id)} onclick={() => (rhythm = r.id)}>{r.id}</button>{/each}</div></div>
          <div class="tg-opt"><span>Who can join</span><div class="tg-seg" role="radiogroup" aria-label="Who can join"><button type="button" role="radio" aria-checked={String(who === "public")} onclick={() => (who = "public")}>Anyone</button><button type="button" role="radio" aria-checked={String(who === "link")} onclick={() => { who = "link"; when = "now"; }}>With the link</button></div></div>
          {#if who === "public"}
            <div class="tg-opt"><span>When</span><div class="tg-seg" role="radiogroup" aria-label="When"><button type="button" role="radio" aria-checked={String(when === "now")} onclick={() => (when = "now")}>Now</button><button type="button" role="radio" aria-checked={String(when === "later")} onclick={() => (when = "later")}>Later</button></div></div>
          {/if}
          <div class="tg-fold" class:open={who === "public" && when === "later"}><div>
            <div class="tg-days" role="group" aria-label="Days">{#each WEEK as [d, letter, dayName] (d)}<button type="button" aria-pressed={String(days.includes(d))} aria-label={dayName} onclick={() => toggleDay(d)}>{letter}</button>{/each}</div>
            <div class="tg-opt"><span>Starts</span><div class="tg-spin"><button type="button" tabindex="-1" aria-label="Earlier" disabled={from <= 0} {@attach hold(() => setFrom(from - startStep(rhythm)))}>{@html MINUS}</button><span role="spinbutton" tabindex="0" aria-label="Starts at" aria-valuemin={0} aria-valuemax={lastStart} aria-valuenow={from} aria-valuetext={slot(from)} onkeydown={fromKey}>{slot(from)}</span><button type="button" tabindex="-1" aria-label="Later" disabled={from >= lastStart} {@attach hold(() => setFrom(from + startStep(rhythm)))}>{@html PLUS}</button></div></div>
            <div class="tg-opt"><span>Lasts</span><div class="tg-spin"><button type="button" tabindex="-1" aria-label="Shorter" disabled={len <= STEP} {@attach hold(() => setLen(len - STEP))}>{@html MINUS}</button><span role="spinbutton" tabindex="0" aria-label="Lasts" aria-valuemin={STEP} aria-valuemax={longest} aria-valuenow={len} aria-valuetext={spanText(len) + ", until " + slot(from + len)} onkeydown={lenKey}>{spanText(len)}</span><button type="button" tabindex="-1" aria-label="Longer" disabled={len >= longest} {@attach hold(() => setLen(len + STEP))}>{@html PLUS}</button></div></div>
          </div></div>
          <div class="tg-fold" class:open={!(who === "public" && when === "later")}><div>
            <div class="tg-opt"><span>Goal</span>{@render goalSpin(goal, setGoal, "Room goal in rounds")}</div>
          </div></div>
          <div class="tg-fold" class:open={who === "public" && when === "now" && !!busyRoom}><div>
            {#if busyRoom}<p class="tg-hint">{busyRoom.title} already has {busyRoom.names.length} people on {rhythm}. <button type="button" class="tg-inline" onclick={() => enter(busyRoom.code)}>Join them instead</button></p>{/if}
          </div></div>
          {#if naming}<label class="tg-field">Your name<input type="text" maxlength="20" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other" placeholder="Shown to people in the room" bind:value={name} bind:this={nameEl}></label>{/if}
          <p class="tg-note" class:tg-err={!!(err || note)} role="status">{err || note || (who === "link" ? "You get a link to share. The room closes ten minutes after everyone leaves." : when === "later" ? "Listed under Scheduled, in each person's own time." : "Listed while anyone is in it. Closes ten minutes after everyone leaves.")}</p>
          <button class="tg-btn strong wide" type="submit" disabled={busy}>{who === "public" && when === "later" ? "Schedule" : "Start room"}</button>
        </form>
      </div>
    {:else}
      <div class="tg-view {pane()}">
        {#if naming}
          <label class="tg-field tg-name">Your name in rooms<input type="text" maxlength="20" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other" placeholder="Shown to others, never your tasks" bind:value={name} bind:this={nameEl}
            onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (saveName()) first()?.focus(); } else if (e.key === "Escape" && api.RM.name) { e.stopPropagation(); name = api.RM.name; naming = false; note = ""; } }}
            onblur={() => { if (name.trim() && api.RM.name) saveName(); }}></label>
        {:else}
          <div class="tg-me"><span class="tg-faces" aria-hidden="true"><i style:--h={hueOf(api.RM.name)}>{initials(api.RM.name)}</i></span><span>Joining as <b>{api.RM.name}</b></span><button class="tg-inline" type="button" onclick={async () => { name = api.RM.name; naming = true; await tick(); nameEl?.select(); }}>Change</button></div>
        {/if}
        {#if cv.code}
          <section class="tg-crew" aria-label="Your crew">
            <button class="tg-crew-head" type="button" onclick={openCrew}>
              {@render crewFaces(cv.members.length ? cv.members : [{ id: "me", name: api.RM.name || "?", on: true, s: null }])}
              <span><b>{cv.crew ? cv.crew.name : "Your crew"}</b><small>{crewSub}</small></span>
              {@html CHEVRON}
            </button>
            {#if cv.crew}<button class="tg-join" type="button" disabled={cv.here} onclick={() => { close(false); C.crewRoom(); }}>{cv.here ? "You're in" : "Join room"}</button>{/if}
          </section>
        {:else if cv.on}
          <button class="tg-crew-start" type="button" onclick={() => go("crew-new")}>
            <span class="tg-quick-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3"/><circle cx="5.5" cy="10.5" r="2.2"/><circle cx="18.5" cy="10.5" r="2.2"/><path d="M7 19a5 5 0 0 1 10 0M2.5 18a3.5 3.5 0 0 1 4.6-3.3M21.5 18a3.5 3.5 0 0 0-4.6-3.3"/></svg></span>
            <span><b>Start a crew</b><small>A standing room for up to eight, with your rounds counted together each week</small></span>
            {@html CHEVRON}
          </button>
        {/if}
        {#if failed}
          <div class="tg-empty"><span>Couldn't load rooms.</span><button class="tg-link" type="button" onclick={load}>Try again</button></div>
        {:else if !data}
          <div class="tg-ghost" aria-hidden="true"><i></i><i></i><i></i></div>
        {:else}
          {#if quick}
            <button class="tg-quick" type="button" onclick={() => enter(quick.code)}>
              {#if quick.names.length}{@render faces(quick.names)}{:else}<span class="tg-quick-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.2a3 3 0 0 1 0 5.6M18 14.5a5.5 5.5 0 0 1 2.5 4.5"/></svg></span>{/if}
              <span><b>Focus with others now</b><small>{quickSub(quick)}</small></span>
              {@html CHEVRON}
            </button>
          {/if}
          <section class="tg-sec" aria-labelledby="tgRoomsH">
            <h4 id="tgRoomsH">Rooms{#if rooms.length > TOP && !allOpen}<small>{TOP} of {rooms.length}</small>{/if}</h4>
            {#if allOpen}
              <div class="tg-chips" role="radiogroup" aria-label="Rhythm">{#each [["all", "All"], ...RHYTHMS.map((r) => [r.id, r.id])] as [id, label] (id)}<button type="button" role="radio" aria-checked={String(filter === id)} onclick={() => (filter = id)}>{label}</button>{/each}</div>
              <div class="tg-all">{#each listed as r (r.code)}{@render roomRow(r)}{/each}</div>
            {:else}
              {#each top as r (r.code)}{@render roomRow(r)}{/each}
            {/if}
            {#if rooms.length > TOP}<button class="tg-link" type="button" aria-expanded={String(allOpen)} onclick={() => { allOpen = !allOpen; filter = "all"; }}>{allOpen ? "Fewer rooms" : "All " + rooms.length + " rooms"}</button>{/if}
          </section>
          {#if upcoming.length}
            <section class="tg-sec" aria-labelledby="tgSchedH">
              <h4 id="tgSchedH">Scheduled{#if upcoming.length > 2}<small>next 2</small>{/if}</h4>
              {#each sched as s (s.id)}
                {@const on = reminded(s.id)}
                {#if "s:" + s.id in undoing}{@render gone("s:" + s.id)}
                {:else}
                  <div class="tg-row">
                    <div class="tg-what"><b>{s.title}</b><span>{dayTag(s.start, now)} {clockIn(s.start)} · {s.rhythm}{s.going ? " · " + s.going + " going" : ""}{#if owns(s.id)} · <button class="tg-inline" type="button" onclick={() => remove(s)}>Remove</button>{/if}</span></div>
                    {#if !owns(s.id)}{@render flag("s:" + s.id, s.title)}{/if}
                    <button class="tg-remind" type="button" aria-pressed={String(on)} aria-label={(on ? "Reminding you about " : "Remind me about ") + s.title} onclick={() => remind(s)}>{@html BELL}<span>{on ? "Reminding" : "Remind me"}</span></button>
                  </div>
                {/if}
              {/each}
              {#if upcoming.length > 2}<button class="tg-link" type="button" aria-expanded={String(allSched)} onclick={() => (allSched = !allSched)}>{allSched ? "Fewer" : "Full schedule"}</button>{/if}
            </section>
          {/if}
        {/if}
        <div class="tg-foot">
          {#if coding}
            <form class="tg-code-form" autocomplete="off" onsubmit={joinCode}>
              <input type="text" maxlength="6" aria-label="Room code" autocomplete="off" autocapitalize="characters" spellcheck="false" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other" placeholder="Room code" bind:value={code} bind:this={codeEl} onkeydown={(e) => { if (e.key === "Escape") { e.stopPropagation(); coding = false; note = ""; } }}>
              <button class="tg-btn strong" type="submit">Join</button>
            </form>
          {:else}
            <button class="tg-btn strong" type="button" onclick={() => go("new")}>Start a room</button>
            <button class="tg-btn" type="button" onclick={openCode}>Join with code</button>
          {/if}
        </div>
        {#if note}<p class="tg-err" role="status">{note}</p>{/if}
        <p class="tg-as">Others see your name and timer, never your tasks.</p>
      </div>
    {/if}
  </div>
</div>
