<script module>
  let last = null, lastSkew = 0;
</script>

<script>
  import { onMount, tick } from "svelte";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import { calm, hold } from "../dom";
  import { pad } from "../lib/dates";
  import { RHYTHMS, SIZE, sortRooms } from "../lib/rhythm";
  import { LONGEST, spanText, STEP, startStep, typedTime } from "../lib/schedule";
  import { spinValue } from "../lib/settings";
  import RoomCard from "./RoomCard.svelte";
  import UpcomingCard from "./UpcomingCard.svelte";

  let { api, busy, onjoin, oncreate } = $props();

  const WEEK = [[1, "M", "Monday"], [2, "T", "Tuesday"], [3, "W", "Wednesday"], [4, "T", "Thursday"], [5, "F", "Friday"], [6, "S", "Saturday"], [0, "S", "Sunday"]];
  const MINUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>';
  const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';
  const slot = (m) => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
  const nextHour = Math.min(23, new Date().getHours() + 1) * 60;

  let data = $state(last), failed = $state(false), skew = lastSkew, now = $state(Date.now() - lastSkew), due = 0;
  let filter = $state("all"), making = $state(false), title = $state(""), rhythm = $state("25/5"), size = $state(6), titleEl;
  let repeat = $state(false), days = $state([1, 2, 3, 4, 5]), from = $state(nextHour), want = $state(120), typed = "", typedAt = 0, saving = $state(false), err = $state("");
  let listEl = $state(), above = $state(false), below = $state(false), marks = $state(0);

  const shown = (r) => filter === "all" || r.rhythm === filter;
  const ups = $derived(data && data.upcoming ? data.upcoming.filter(shown) : []);
  const items = $derived(data ? [
    ...sortRooms(data.rooms.filter(shown)).map((r) => ({ key: r.code, r })),
    ...(ups.length ? [{ key: "upcoming", head: true }, ...ups.map((s) => ({ key: "s:" + s.id, s }))] : []),
  ] : []);
  const people = $derived(data ? data.rooms.reduce((n, r) => n + r.names.length, 0) : 0);
  const busyRooms = $derived(data ? data.rooms.filter((r) => r.names.length).length : 0);
  const status = $derived(!data ? "Looking for rooms…" : people ? people + " " + (people === 1 ? "person" : "people") + " working in " + busyRooms + " " + (busyRooms === 1 ? "room" : "rooms") : "Quiet right now. Start a round.");
  const lastStart = $derived(1440 - startStep(rhythm));
  const longest = $derived(Math.min(LONGEST, 1440 - from));
  const len = $derived(Math.min(want, longest));
  $effect(() => { if (from % startStep(rhythm)) from = Math.min(lastStart, Math.ceil(from / 60) * 60); });
  const reminded = (id) => marks >= 0 && api.sched.reminded(id);
  const owns = (id) => marks >= 0 && api.sched.owns(id);

  const move = () => ({ duration: calm() ? 0 : 320, easing: cubicOut });
  const arrive = () => calm() ? { duration: 160, css: (t) => `opacity: ${t}` } : { duration: 260, easing: cubicOut, css: (t, u) => `opacity: ${t}; translate: 0 ${u * 8}px; scale: ${0.98 + 0.02 * t}` };
  const leave = () => calm() ? { duration: 120, css: (t) => `opacity: ${t}` } : { duration: 180, easing: cubicOut, css: (t) => `opacity: ${t}; scale: ${0.97 + 0.03 * t}` };
  const appear = () => ({ duration: calm() ? 120 : 220, css: (t) => `opacity: ${t}` });

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

  onMount(() => {
    load();
    const poll = setInterval(() => { if (!document.hidden) load(); }, 15000);
    const clock = setInterval(() => {
      now = Date.now() - skew;
      if (now >= due) { due = Infinity; load(); }
    }, 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  });

  function edges() {
    if (!listEl) return;
    above = listEl.scrollTop > 2;
    below = listEl.scrollTop + listEl.clientHeight < listEl.scrollHeight - 2;
  }

  $effect(() => {
    if (!listEl || !items) return;
    const seen = new ResizeObserver(edges);
    seen.observe(listEl);
    for (const el of listEl.children) seen.observe(el);
    return () => seen.disconnect();
  });

  async function make() {
    making = true;
    await tick();
    titleEl.focus();
  }

  const setFrom = (m) => { const v = Math.max(0, Math.min(lastStart, m)); if (v === from) return false; from = v; return true; };
  const setLen = (m) => { const v = Math.max(STEP, Math.min(longest, m)); if (v === len) return false; want = v; return true; };

  function fromKey(e) {
    let v = spinValue(e.key, from, startStep(rhythm), 120, 0, lastStart);
    if (v != null) typed = "";
    else if (/^\d$/.test(e.key)) {
      typed = e.timeStamp - typedAt < 1000 && typedTime(typed + e.key) != null ? typed + e.key : e.key;
      typedAt = e.timeStamp;
      const t = typedTime(typed);
      v = Math.min(lastStart, t - (t % startStep(rhythm)));
    }
    if (v == null) return;
    e.preventDefault();
    setFrom(v);
  }

  function lenKey(e) {
    const v = /^[1-8]$/.test(e.key) ? +e.key * 60 : spinValue(e.key, len, STEP, 60, STEP, longest);
    if (v == null) return;
    e.preventDefault();
    setLen(v);
  }

  const toggleDay = (d) => (days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);

  async function schedule() {
    if (!days.length) { err = "Pick at least one day."; return; }
    saving = true; err = "";
    try {
      const s = await api.sched.create({ title: title.trim(), rhythm, max: size, days, from, to: from + len });
      making = false; repeat = false; title = "";
      await load();
      await tick();
      listEl?.querySelector(`[data-sched="${s.id}"]`)?.scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" });
    } catch (e) {
      err = e === 429 ? "You've scheduled a few already. Try again in a while." : e === 507 ? "There are a lot of schedules right now. Try again in a few days." : e === 400 ? "Check the name, days and times." : "Couldn't save it. Check your connection and try again.";
    }
    saving = false;
  }

  async function remind(s) {
    const on = !api.sched.reminded(s.id), count = (n) => (data.upcoming = data.upcoming.map((u) => (u.id === s.id ? { ...u, going: n } : u)));
    const was = s.going;
    count(Math.max(0, was + (on ? 1 : -1)));
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

  function submit(e) {
    e.preventDefault();
    if (!title.trim()) { titleEl.focus(); return; }
    if (repeat) schedule();
    else oncreate({ title: title.trim(), rhythm, max: size });
  }
</script>

<div class="lobby">
  <div class="lobby-head">
    <span class="live" class:on={people > 0}><i aria-hidden="true"></i>{#key status}<span in:appear>{status}</span>{/key}</span>
    <div class="chips" role="radiogroup" aria-label="Rhythm">
      {#each [["all", "All"], ...RHYTHMS.map((r) => [r.id, r.id])] as [id, name] (id)}
        <button type="button" role="radio" aria-checked={String(filter === id)} onclick={() => (filter = id)}>{name}</button>
      {/each}
    </div>
  </div>

  {#if failed}
    <div class="lobby-empty"><p>Couldn't load public rooms.</p><button class="btn small" type="button" onclick={load}>Try again</button></div>
  {:else if !data}
    <ul class="rlist" aria-hidden="true">{#each [0, 1] as k (k)}<li class="rcard ghost"><span></span></li>{/each}</ul>
  {:else}
    <ul class="rlist" class:above class:below aria-label="Public rooms" aria-busy={busy} bind:this={listEl} onscroll={edges} in:appear>
      {#each items as it (it.key)}
        <li class={it.head ? "rgroup" : "rcard"} data-sched={it.s?.id} animate:flip={move()} in:arrive out:leave>
          {#if it.head}Upcoming
          {:else if it.s}<UpcomingCard s={it.s} {now} reminded={reminded(it.s.id)} own={owns(it.s.id)} onremind={() => remind(it.s)} onremove={() => remove(it.s)} />
          {:else}<RoomCard r={it.r} {now} {onjoin} />{/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if making}
    <form class="rnew" autocomplete="off" onsubmit={submit}>
      <label class="field">Room name<input type="text" name="pl-room-title" maxlength="32" autocomplete="off" data-bwignore="true" data-1p-ignore="true" data-lpignore="true" data-form-type="other" placeholder="Thesis writing, Spanish practice…" bind:value={title} bind:this={titleEl}></label>
      <div class="seg" role="radiogroup" aria-label="Rhythm">
        {#each RHYTHMS as r (r.id)}
          <button type="button" role="radio" aria-checked={String(rhythm === r.id)} onclick={() => (rhythm = r.id)}>{r.id} <small>{r.name}</small></button>
        {/each}
      </div>
      <div class="step-row">
        <span>Room size<small>{size === 2 ? "Just you and one other" : "You and " + (size - 1) + " others"}</small></span>
        <div class="stepper">
          <button type="button" aria-label="Fewer people" disabled={size <= SIZE.min} onclick={() => (size = Math.max(SIZE.min, size - 1))}>{@html MINUS}</button>
          <output aria-live="polite">{size}</output>
          <button type="button" aria-label="More people" disabled={size >= SIZE.max} onclick={() => (size = Math.min(SIZE.max, size + 1))}>{@html PLUS}</button>
        </div>
      </div>
      <label class="toggle repeat"><span>Repeat</span><input type="checkbox" bind:checked={repeat}></label>
      {#if repeat}
        <div class="seg days" role="group" aria-label="Days">
          {#each WEEK as [d, letter, name] (d)}<button type="button" aria-pressed={String(days.includes(d))} aria-label={name} onclick={() => toggleDay(d)}>{letter}</button>{/each}
        </div>
        <div class="step-row">
          <span>Starts at<small>{rhythm === "50/10" ? "On the hour, like 50/10 rounds" : "In your own time zone"}</small></span>
          <div class="stepper spin">
            <button type="button" tabindex="-1" aria-label="Earlier" disabled={from <= 0} {@attach hold(() => setFrom(from - startStep(rhythm)))}>{@html MINUS}</button>
            <span role="spinbutton" tabindex="0" aria-label="Starts at" aria-valuemin={0} aria-valuemax={lastStart} aria-valuenow={from} aria-valuetext={slot(from)} onkeydown={fromKey}>{slot(from)}</span>
            <button type="button" tabindex="-1" aria-label="Later" disabled={from >= lastStart} {@attach hold(() => setFrom(from + startStep(rhythm)))}>{@html PLUS}</button>
          </div>
        </div>
        <div class="step-row">
          <span>Lasts<small>Until {from + len === 1440 ? "midnight" : slot(from + len)}</small></span>
          <div class="stepper spin">
            <button type="button" tabindex="-1" aria-label="Shorter" disabled={len <= STEP} {@attach hold(() => setLen(len - STEP))}>{@html MINUS}</button>
            <span role="spinbutton" tabindex="0" aria-label="Lasts" aria-valuemin={STEP} aria-valuemax={longest} aria-valuenow={len} aria-valuetext={spanText(len) + ", until " + slot(from + len)} onkeydown={lenKey}>{spanText(len)}</span>
            <button type="button" tabindex="-1" aria-label="Longer" disabled={len >= longest} {@attach hold(() => setLen(len + STEP))}>{@html PLUS}</button>
          </div>
        </div>
      {/if}
      <p class="hint" class:err role="status">{err || (repeat ? "Listed under Upcoming, in each person's own time." : "Listed while anyone is in it. Rounds follow the clock, so people can drop in any time.")}</p>
      <div class="sheet-foot"><button class="btn" type="button" onclick={() => { making = false; err = ""; }}>Cancel</button><button class="btn solid" type="submit" disabled={busy || saving}>{repeat ? "Schedule" : "Open room"}</button></div>
    </form>
  {:else}
    <button class="rnew-btn" type="button" onclick={make}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Open a public room</button>
  {/if}
</div>
