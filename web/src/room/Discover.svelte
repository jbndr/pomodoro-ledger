<script module>
  let last = null, lastSkew = 0;
</script>

<script>
  import { onMount, tick } from "svelte";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import { calm } from "../dom";
  import { pad } from "../lib/dates";
  import { RHYTHMS, SIZE, sortRooms } from "../lib/rhythm";
  import { LONGEST, STEP } from "../lib/schedule";
  import RoomCard from "./RoomCard.svelte";
  import UpcomingCard from "./UpcomingCard.svelte";

  let { api, busy, onjoin, oncreate } = $props();

  const WEEK = [[1, "M", "Monday"], [2, "T", "Tuesday"], [3, "W", "Wednesday"], [4, "T", "Thursday"], [5, "F", "Friday"], [6, "S", "Saturday"], [0, "S", "Sunday"]];
  const SLOTS = Array.from({ length: 1440 / STEP + 1 }, (_, i) => i * STEP);
  const slot = (m) => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
  const nextHour = Math.min(23, new Date().getHours() + 1) * 60;

  let data = $state(last), failed = $state(false), skew = lastSkew, now = $state(Date.now() - lastSkew), due = 0;
  let filter = $state("all"), making = $state(false), title = $state(""), rhythm = $state("25/5"), size = $state(6), titleEl;
  let repeat = $state(false), days = $state([1, 2, 3, 4, 5]), from = $state(nextHour), to = $state(Math.min(1440, nextHour + 120)), saving = $state(false), err = $state("");
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
  const toSlots = $derived(SLOTS.filter((m) => m > from && m - from <= LONGEST));
  const reminded = (id) => marks >= 0 && api.sched.reminded(id);
  const owns = (id) => marks >= 0 && api.sched.owns(id);

  const move = () => ({ duration: calm() ? 0 : 320, easing: cubicOut });
  const arrive = () => calm() ? { duration: 160, css: (t) => `opacity: ${t}` } : { duration: 260, easing: cubicOut, css: (t, u) => `opacity: ${t}; transform: translateY(${u * 8}px) scale(${0.98 + 0.02 * t})` };
  const leave = () => calm() ? { duration: 120, css: (t) => `opacity: ${t}` } : { duration: 180, easing: cubicOut, css: (t, u) => `opacity: ${t}; transform: scale(${0.97 + 0.03 * t})` };
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

  function setFrom(m) {
    from = m;
    to = Math.min(1440, Math.max(to, m + STEP), m + LONGEST);
  }

  const toggleDay = (d) => (days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);

  async function schedule() {
    if (!days.length) { err = "Pick at least one day."; return; }
    saving = true; err = "";
    try {
      const s = await api.sched.create({ title: title.trim(), rhythm, max: size, days, from, to });
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
      <label class="field">Room name<input type="text" maxlength="32" placeholder="Thesis writing, Spanish practice…" bind:value={title} bind:this={titleEl}></label>
      <div class="seg" role="radiogroup" aria-label="Rhythm">
        {#each RHYTHMS as r (r.id)}
          <button type="button" role="radio" aria-checked={String(rhythm === r.id)} onclick={() => (rhythm = r.id)}>{r.id} <small>{r.name}</small></button>
        {/each}
      </div>
      <div class="size">
        <span>Room size<small>{size === 2 ? "Just you and one other" : "You and " + (size - 1) + " others"}</small></span>
        <div class="stepper">
          <button type="button" aria-label="Fewer people" disabled={size <= SIZE.min} onclick={() => (size = Math.max(SIZE.min, size - 1))}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg></button>
          <output aria-live="polite">{size}</output>
          <button type="button" aria-label="More people" disabled={size >= SIZE.max} onclick={() => (size = Math.min(SIZE.max, size + 1))}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg></button>
        </div>
      </div>
      <label class="toggle repeat"><span>Repeat</span><input type="checkbox" bind:checked={repeat}></label>
      {#if repeat}
        <div class="seg days" role="group" aria-label="Days">
          {#each WEEK as [d, letter, name] (d)}<button type="button" aria-pressed={String(days.includes(d))} aria-label={name} onclick={() => toggleDay(d)}>{letter}</button>{/each}
        </div>
        <div class="rwin">
          <span>From</span><select aria-label="From" value={from} onchange={(e) => setFrom(Number(e.currentTarget.value))}>{#each SLOTS.slice(0, -1) as m (m)}<option value={m}>{slot(m)}</option>{/each}</select>
          <span>to</span><select aria-label="To" bind:value={to}>{#each toSlots as m (m)}<option value={m}>{slot(m)}</option>{/each}</select>
        </div>
      {/if}
      <p class="hint" class:err role="status">{err || (repeat ? "Listed under Upcoming, in each person's own time." : "Listed while anyone is in it. Rounds follow the clock, so people can drop in any time.")}</p>
      <div class="sheet-foot"><button class="btn" type="button" onclick={() => { making = false; err = ""; }}>Cancel</button><button class="btn solid" type="submit" disabled={busy || saving}>{repeat ? "Schedule" : "Open room"}</button></div>
    </form>
  {:else}
    <button class="rnew-btn" type="button" onclick={make}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Open a public room</button>
  {/if}
</div>
