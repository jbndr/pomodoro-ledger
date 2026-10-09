<script module>
  let last = null, lastSkew = 0;
</script>

<script>
  import { flushSync, tick } from "svelte";
  import { calm, hold } from "../dom";
  import { pad } from "../lib/dates";
  import { normCode } from "../lib/room";
  import { room, roomClock } from "../lib/redraw.svelte";
  import { hhmm, hueOf, initials, phaseAt, RHYTHMS, SIZE, sortRooms } from "../lib/rhythm";
  import { clockIn, dayTag, LONGEST, spanText, STEP, startStep, typedTime } from "../lib/schedule";
  import { spinValue } from "../lib/settings";
  import Ask from "./Ask.svelte";
  import { copyInvite } from "./invite";
  import Ring from "./Ring.svelte";

  let { api } = $props();

  const TOP = 3, WIDTH = 348;
  const WEEK = [[1, "M", "Monday"], [2, "T", "Tuesday"], [3, "W", "Wednesday"], [4, "T", "Thursday"], [5, "F", "Friday"], [6, "S", "Saturday"], [0, "S", "Sunday"]];
  const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';
  const MINUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>';
  const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';
  const slot = (m) => pad(Math.floor(m / 60)) + ":" + pad(m % 60);

  let shown = $state(false), view = $state("main"), dir = $state("r"), popEl, rootEl;
  let data = $state(last), failed = $state(false), skew = lastSkew, now = $state(Date.now() - lastSkew), due = 0, marks = $state(0);
  let allOpen = $state(false), filter = $state("all"), allSched = $state(false);
  let name = $state(""), naming = $state(false), nameEl = $state(), note = $state(""), busy = $state(false);
  let coding = $state(false), code = $state(""), codeEl = $state();
  let title = $state(""), rhythm = $state("25/5"), who = $state("public"), when = $state("now"), titleEl = $state();
  let days = $state([1, 2, 3, 4, 5]), from = $state(Math.min(23, new Date().getHours() + 1) * 60), want = $state(120), typed = "", typedAt = 0, err = $state("");
  let place = $state({ top: 0, left: 0 });

  const v = $derived.by(() => { room.version; return { on: !!api.RM.code, code: api.RM.code || "", pub: api.RM.pub, names: api.RM.members.map((m) => m.name) }; });
  const clock = $derived.by(() => { roomClock.version; room.version; return Date.now() - api.RM.skew; });
  const step = $derived.by(() => { roomClock.version; room.version; return api.inStep(); });
  const invited = $derived(api.invite.length === 6 && !v.on);

  const mine = () => (api.S.settings.focus >= 45 ? "50/10" : "25/5");
  const rooms = $derived(data ? sortRooms(data.rooms) : []);
  const quick = $derived.by(() => {
    const open = rooms.filter((r) => r.names.length < r.max), want = mine();
    return open.find((r) => r.rhythm === want && r.names.length) || open.find((r) => r.names.length) || open.find((r) => r.rhythm === want) || open[0] || null;
  });
  const top = $derived(rooms.slice(0, TOP));
  const listed = $derived(rooms.filter((r) => filter === "all" || r.rhythm === filter));
  const upcoming = $derived(data ? [...(data.upcoming || [])].sort((a, b) => a.start - b.start) : []);
  const sched = $derived(allSched ? upcoming : upcoming.slice(0, 2));
  const busyRoom = $derived(rooms.find((r) => r.rhythm === rhythm && r.names.length >= 2 && r.names.length < r.max));
  const lastStart = $derived(1440 - startStep(rhythm));
  const longest = $derived(Math.min(LONGEST, 1440 - from));
  const len = $derived(Math.min(want, longest));
  $effect(() => { if (from % startStep(rhythm)) from = Math.min(lastStart, Math.ceil(from / 60) * 60); });
  const reminded = (id) => marks >= 0 && api.sched.reminded(id);
  const owns = (id) => marks >= 0 && api.sched.owns(id);

  export const isOpen = () => shown;

  export function open() {
    if (shown) return;
    view = invited ? "invite" : "main"; dir = "r";
    if (invited) code = api.invite;
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
    api.RM.name = n; api.ls.set("pl.name", n); naming = false;
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
        await api.roomCreate(who === "public" ? { title: title.trim(), rhythm, max: SIZE.max } : undefined);
        title = "";
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
  const toggleDay = (d) => (days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);

  const here = (r) => {
    const n = r.names.length, p = phaseAt(r.rhythm, now);
    return n ? n + (n === 1 ? " person" : " people") + " · " + (p.focus ? "focus" : "break") + " until " + hhmm(p.end) : (p.focus ? "Focus" : "Break") + " until " + hhmm(p.end);
  };
  const quickSub = (r) => r.names.length ? "Joins " + r.title + ", " + r.names.length + " focusing on " + r.rhythm : "Opens " + r.title + " on " + r.rhythm + ". Others can drop in";
  const pane = () => calm() ? "" : "in-" + dir;
</script>

<Ask {api} />

{#snippet faces(names, max = 3)}
  <span class="tg-faces" aria-hidden="true">{#each names.slice(0, max) as n, k (k)}<i style:--h={hueOf(n)}>{initials(n)}</i>{/each}{#if names.length > max}<i class="more">+{names.length - max}</i>{/if}</span>
{/snippet}

{#snippet roomRow(r)}
  {@const full = r.names.length >= r.max}
  <div class="tg-row">
    <div class="tg-what"><b>{r.title}<span>{" · " + r.rhythm}</span></b><span>{#if r.names.length}{@render faces(r.names)}{/if}{here(r)}</span></div>
    <button class="tg-join" type="button" disabled={full} aria-label={full ? r.title + " is full" : "Join " + r.title} onclick={() => enter(r.code)}>{full ? "Full" : "Join"}</button>
  </div>
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
        <div class="tg-here private"><div><b>Your room</b><span>Share the code or the link. Only people with it can join.</span></div><span class="tg-code">{v.code}</span></div>
      {/if}
      <div class="tg-foot">
        <button class="tg-btn" type="button" onclick={() => { api.roomReset(); close(); }}>Leave</button>
        {#if !v.pub || step}<button class="tg-btn strong" type="button" onclick={() => copyInvite(api.RM.code)}>Copy invite link</button>
        {:else}<button class="tg-btn strong" type="button" onclick={() => { api.followRoom(true); close(); }}>Rejoin round</button>{/if}
      </div>
    {:else if view === "invite"}
      <div class="tg-view {pane()}">
        <form class="tg-form" autocomplete="off" onsubmit={joinCode}>
          <div class="tg-title"><b>Join a room</b><span>You've been invited. Others see your name and timer, never your tasks.</span></div>
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
                <div class="tg-row">
                  <div class="tg-what"><b>{s.title}</b><span>{dayTag(s.start, now)} {clockIn(s.start)} · {s.rhythm}{s.going ? " · " + s.going + " going" : ""}{#if owns(s.id)} · <button class="tg-inline" type="button" onclick={() => remove(s)}>Remove</button>{/if}</span></div>
                  <button class="tg-remind" type="button" aria-pressed={String(on)} aria-label={(on ? "Reminding you about " : "Remind me about ") + s.title} onclick={() => remind(s)}>{@html BELL}<span>{on ? "Reminding" : "Remind me"}</span></button>
                </div>
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
