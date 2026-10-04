<script module>
  let last = null, lastSkew = 0;
</script>

<script>
  import { onMount, tick } from "svelte";
  import { RHYTHMS, SIZE, sortRooms } from "../lib/rhythm";
  import RoomCard from "./RoomCard.svelte";

  let { api, busy, onjoin, oncreate } = $props();

  let data = $state(last), failed = $state(false), skew = lastSkew, now = $state(Date.now() - lastSkew);
  let filter = $state("all"), making = $state(false), title = $state(""), rhythm = $state("25/5"), size = $state(6), titleEl;
  let listEl = $state(), above = $state(false), below = $state(false);

  const rooms = $derived(data ? sortRooms(data.rooms.filter((r) => filter === "all" || r.rhythm === filter)) : []);
  const people = $derived(data ? data.rooms.reduce((n, r) => n + r.names.length, 0) : 0);
  const busyRooms = $derived(data ? data.rooms.filter((r) => r.names.length).length : 0);

  async function load() {
    try {
      const d = await api.roomList();
      skew = lastSkew = Date.now() - d.now; now = d.now; data = last = d; failed = false;
    } catch { failed = !data; }
  }

  onMount(() => {
    load();
    const poll = setInterval(() => { if (!document.hidden) load(); }, 15000);
    const clock = setInterval(() => (now = Date.now() - skew), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  });

  function edges() {
    if (!listEl) return;
    above = listEl.scrollTop > 2;
    below = listEl.scrollTop + listEl.clientHeight < listEl.scrollHeight - 2;
  }

  $effect(() => {
    if (!listEl || !rooms) return;
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

  function submit(e) {
    e.preventDefault();
    if (!title.trim()) { titleEl.focus(); return; }
    oncreate({ title: title.trim(), rhythm, max: size });
  }
</script>

<div class="lobby">
  <div class="lobby-head">
    <span class="live" class:on={people > 0}><i aria-hidden="true"></i>{#if !data}Looking for rooms…{:else if people}{people} {people === 1 ? "person" : "people"} working in {busyRooms} {busyRooms === 1 ? "room" : "rooms"}{:else}Quiet right now. Start a round.{/if}</span>
    <div class="chips" role="radiogroup" aria-label="Rhythm">
      {#each [["all", "All"], ...RHYTHMS.map((r) => [r.id, r.id])] as [id, name] (id)}
        <button type="button" role="radio" aria-checked={String(filter === id)} onclick={() => (filter = id)}>{name}</button>
      {/each}
    </div>
  </div>

  {#if failed}
    <div class="lobby-empty"><p>Couldn't load public rooms.</p><button class="btn small" type="button" onclick={load}>Try again</button></div>
  {:else if !data}
    <ul class="rlist" aria-hidden="true">{#each [0, 1, 2] as k (k)}<li class="rcard ghost"><span></span></li>{/each}</ul>
  {:else}
    <ul class="rlist" class:above class:below aria-label="Public rooms" aria-busy={busy} bind:this={listEl} onscroll={edges}>
      {#each rooms as r (r.code)}<RoomCard {r} {now} {onjoin} />{/each}
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
      <p class="hint">Listed while anyone is in it. Rounds follow the clock, so people can drop in any time.</p>
      <div class="sheet-foot"><button class="btn" type="button" onclick={() => (making = false)}>Cancel</button><button class="btn solid" type="submit" disabled={busy}>Open room</button></div>
    </form>
  {:else}
    <button class="rnew-btn" type="button" onclick={make}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Open a public room</button>
  {/if}
</div>
