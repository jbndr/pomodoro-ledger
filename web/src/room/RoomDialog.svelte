<script>
  import { flushSync } from "svelte";
  import { normCode } from "../lib/room";
  import { room } from "../lib/redraw.svelte";
  import Ask from "./Ask.svelte";
  import { copyInvite } from "./invite";

  let { api } = $props();

  let joining = $state(false), name = $state(""), code = $state(""), note = $state(""), busy = $state(false);
  let nameEl, codeEl, createBtn, joinBtn, copyBtn;
  const v = $derived.by(() => { room.version; return { on: !!api.RM.code, code: api.RM.code || "" }; });

  export function open() {
    joining = api.invite.length === 6 && !api.RM.code;
    if (joining) code = api.invite;
    name = api.RM.name;
    note = "";
    api.setOverlay("#room", true);
    flushSync();
    (api.RM.code ? copyBtn : !api.RM.name ? nameEl : joining ? joinBtn : createBtn).focus({ preventScroll: true });
  }

  export function close() {
    api.setOverlay("#room", false);
    document.getElementById("openRoom").focus({ preventScroll: true });
  }

  function saveName() {
    const n = name.trim().slice(0, 20);
    if (!n) { note = "Add a name so the others know who you are."; nameEl.focus(); return false; }
    api.RM.name = n; api.ls.set("pl.name", n);
    return true;
  }

  async function create() {
    if (!saveName()) return;
    busy = true;
    try { await api.roomCreate(); } catch { note = "Couldn't start a room. Check your connection and try again."; }
    busy = false;
  }

  function join(e) {
    e.preventDefault();
    const c = normCode(code);
    if (c.length !== 6) { note = "Room codes have six letters and digits."; codeEl.focus(); return; }
    if (saveName()) api.roomEnter(c);
  }
</script>

<Ask {api} />

<!-- Escape is handled by the app-wide keydown handler. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" id="room" hidden onclick={(e) => { if (e.target.id === "room") close(); }}>
  <div class="sheet" role="dialog" aria-labelledby="roomH">
    <div class="sec-head"><h2 id="roomH">{joining ? "Join a room" : "Work together"}</h2><button class="icon-btn" type="button" id="closeRoom" aria-label="Close" onclick={close}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="sub" id="roomIntro">{joining
      ? "You've been invited to a shared room. Enter your name and press Join. Your tasks and history stay private."
      : "Start a temporary room and share its code. Everyone in it sees who is focusing or on a break and how much time is left. Your tasks and history stay private."}</div>
    <label class="field">Your name<input type="text" id="rName" maxlength="20" autocomplete="nickname" placeholder="Shown to people in the room" disabled={v.on} bind:value={name} bind:this={nameEl}></label>
    <div class="room-form" id="roomOut" hidden={v.on}>
      <button class="btn solid" type="button" id="rCreate" hidden={joining} disabled={busy} bind:this={createBtn} onclick={create}>Start a room</button>
      <form class="join" id="rJoin" autocomplete="off" onsubmit={join}>
        <label class="field"><span id="rCodeLabel">{joining ? "Room code" : "Or join with a code"}</span><input type="text" id="rCode" maxlength="6" autocapitalize="characters" spellcheck="false" placeholder="ABC234" bind:value={code} bind:this={codeEl}></label>
        <button class="btn" class:solid={joining} type="submit" bind:this={joinBtn}>Join</button>
      </form>
    </div>
    <div class="room-form" id="roomIn" hidden={!v.on}>
      <div class="big-code" id="bigCode">{v.code}</div>
      <div class="sheet-foot"><button class="btn" type="button" id="rLeave" onclick={() => { api.roomReset(); close(); }}>Leave room</button><button class="btn solid" type="button" id="rCopy" bind:this={copyBtn} onclick={() => copyInvite(api.RM.code)}>Copy invite link</button></div>
    </div>
    <div class="sub" id="roomNote" role="status">{note}</div>
  </div>
</div>
