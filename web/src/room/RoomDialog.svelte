<script>
  import { flushSync, tick } from "svelte";
  import { normCode } from "../lib/room";
  import { room, roomClock } from "../lib/redraw.svelte";
  import { hhmm, hueOf, initials, phaseAt } from "../lib/rhythm";
  import { rovingIndex } from "../lib/settings";
  import Ask from "./Ask.svelte";
  import Discover from "./Discover.svelte";
  import { copyInvite } from "./invite";
  import Ring from "./Ring.svelte";

  let { api } = $props();

  const TABS = [["public", "Public rooms"], ["private", "Private room"]];
  let shown = $state(false), tab = $state(api.ls.get("pl.roomTab", "public") === "private" ? "private" : "public");
  let joining = $state(false), naming = $state(false), name = $state(""), code = $state(""), note = $state(""), busy = $state(false);
  let nameEl, codeEl, createBtn, joinBtn, copyBtn;
  const v = $derived.by(() => { room.version; return { on: !!api.RM.code, code: api.RM.code || "", pub: api.RM.pub, count: api.RM.members.length, names: api.RM.members.map((m) => m.name) }; });
  const now = $derived.by(() => { roomClock.version; room.version; return Date.now() - api.RM.skew; });
  const step = $derived.by(() => { roomClock.version; room.version; return api.inStep(); });

  export function open() {
    joining = api.invite.length === 6 && !api.RM.code;
    if (joining) { code = api.invite; tab = "private"; }
    name = api.RM.name;
    naming = !api.RM.name;
    note = "";
    shown = true;
    api.setOverlay("#room", true);
    flushSync();
    (api.RM.code ? copyBtn : !api.RM.name ? nameEl : joining ? joinBtn : tab === "private" ? createBtn : document.getElementById("roomTab-public")).focus({ preventScroll: true });
  }

  export function close() {
    shown = false;
    api.setOverlay("#room", false);
    document.getElementById("openRoom").focus({ preventScroll: true });
  }

  function show(t, focus) {
    tab = t; note = "";
    api.ls.set("pl.roomTab", t);
    if (focus) { flushSync(); document.getElementById("roomTab-" + t).focus(); }
  }

  function tabKey(e, i) {
    const j = rovingIndex(e.key, i, TABS.length);
    if (j < 0) return;
    e.preventDefault(); show(TABS[j][0], true);
  }

  async function rename() {
    naming = true;
    await tick();
    nameEl.select();
  }

  function saveName() {
    const n = name.trim().slice(0, 20);
    if (!n) { note = "Add a name so the others know who you are."; nameEl.focus(); return false; }
    api.RM.name = n; api.ls.set("pl.name", n);
    return true;
  }

  async function create(pub) {
    if (!saveName()) return;
    busy = true;
    try { await api.roomCreate(pub); shown = false; } catch { note = "Couldn't start a room. Check your connection and try again."; }
    busy = false;
  }

  function enter(c) {
    if (!saveName()) return;
    shown = false;
    api.roomEnter(c);
  }

  function join(e) {
    e.preventDefault();
    const c = normCode(code);
    if (c.length !== 6) { note = "Room codes have six letters and digits."; codeEl.focus(); return; }
    enter(c);
  }
</script>

<Ask {api} />

<!-- Escape is handled by the app-wide keydown handler. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" id="room" hidden onclick={(e) => { if (e.target.id === "room") close(); }}>
  <div class="sheet room-sheet" role="dialog" aria-labelledby="roomH">
    <div class="sec-head"><h2 id="roomH">{v.pub ? v.pub.title : joining ? "Join a room" : "Work together"}</h2><button class="icon-btn" type="button" id="closeRoom" aria-label="Close" onclick={close}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>

    {#if v.on && v.pub}
      {@const p = phaseAt(v.pub.rhythm, now)}
      <div class="here">
        <Ring rhythm={v.pub.rhythm} {now} big />
        <div>
          <b>{p.focus ? "Focus" : "Break"} until {hhmm(p.end)}</b>
          <span>{v.pub.rhythm} rounds · {v.count} of {v.pub.max || 12} here</span>
          <span class="faces">{#each v.names.slice(0, 8) as n, k (k)}<i style:--h={hueOf(n)} title={n}>{initials(n)}</i>{/each}{#if v.names.length > 8}<i class="more">+{v.names.length - 8}</i>{/if}</span>
        </div>
      </div>
      <p class="sub">{step ? "Your timer follows the room clock. Pause or skip to go your own way." : "Your timer is off the room clock. Rejoin and it jumps to the room's current round."}</p>
      <div class="sheet-foot">
        <button class="btn" type="button" onclick={() => { api.roomReset(); close(); }}>Leave room</button>
        {#if step}<button class="btn solid" type="button" bind:this={copyBtn} onclick={() => copyInvite(api.RM.code)}>Copy invite link</button>
        {:else}<button class="btn solid" type="button" bind:this={copyBtn} onclick={() => { api.followRoom(true); close(); }}>Rejoin round</button>{/if}
      </div>
    {:else}
      {#if !v.on && !joining}
        <div class="seg" role="tablist" aria-label="Room type">
          {#each TABS as [t, label], i (t)}
            <button type="button" role="tab" id="roomTab-{t}" aria-controls="roomPanel" aria-selected={String(tab === t)} tabindex={tab === t ? 0 : -1} onclick={() => show(t)} onkeydown={(e) => tabKey(e, i)}>{label}</button>
          {/each}
        </div>
      {/if}
      {#if !v.on && !joining && tab === "public" && !naming}
        <div class="sub" id="roomIntro">Drop in and your timer joins the room's round. Others see you as <b class="as">{api.RM.name}</b>, never your tasks. <button class="link" type="button" onclick={rename}>Change name</button></div>
      {:else}
        <div class="sub" id="roomIntro">{joining
          ? "You've been invited to a shared room. Enter your name and press Join. Your tasks and history stay private."
          : v.on ? "Share the code or the invite link. Everyone in the room sees who is focusing or on a break."
          : tab === "public" ? "Drop into a room and your timer joins its round. People in it see your name and timer, never your tasks."
          : "Start a temporary room and share its code. Everyone in it sees who is focusing or on a break and how much time is left. Your tasks and history stay private."}</div>
        <label class="field">Your name<input type="text" id="rName" maxlength="20" autocomplete="nickname" placeholder="Shown to people in the room" disabled={v.on} bind:value={name} bind:this={nameEl}></label>
      {/if}
      <div class="sub room-note" id="roomNote" role="status" hidden={!note}>{note}</div>
      <div id="roomPanel" role={v.on || joining ? undefined : "tabpanel"} aria-labelledby={v.on || joining ? undefined : "roomTab-" + tab}>
        {#if !v.on && !joining && tab === "public"}
          {#if shown}<Discover {api} {busy} onjoin={(r) => enter(r.code)} oncreate={(pub) => create(pub)} />{/if}
        {:else}
          <div class="room-form" id="roomOut" hidden={v.on}>
            <button class="btn solid" type="button" id="rCreate" hidden={joining} disabled={busy} bind:this={createBtn} onclick={() => create()}>Start a room</button>
            <form class="join" id="rJoin" autocomplete="off" onsubmit={join}>
              <label class="field"><span id="rCodeLabel">{joining ? "Room code" : "Or join with a code"}</span><input type="text" id="rCode" maxlength="6" autocapitalize="characters" spellcheck="false" placeholder="ABC234" bind:value={code} bind:this={codeEl}></label>
              <button class="btn" class:solid={joining} type="submit" bind:this={joinBtn}>Join</button>
            </form>
          </div>
          <div class="room-form" id="roomIn" hidden={!v.on}>
            <div class="big-code" id="bigCode">{v.code}</div>
            <div class="sheet-foot"><button class="btn" type="button" id="rLeave" onclick={() => { api.roomReset(); close(); }}>Leave room</button><button class="btn solid" type="button" id="rCopy" bind:this={copyBtn} onclick={() => copyInvite(api.RM.code)}>Copy invite link</button></div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
