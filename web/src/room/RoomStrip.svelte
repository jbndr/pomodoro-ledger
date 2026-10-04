<script>
  import { tick } from "svelte";
  import { backOut } from "svelte/easing";
  import { bubbleNames, mateClock, mateProgress, MODE_NAME, othersOf, REACTIONS } from "../lib/room";
  import { room, roomClock } from "../lib/redraw.svelte";
  import { copyInvite } from "./invite";

  let { api } = $props();

  const v = $derived.by(() => {
    room.version;
    return {
      on: !!api.RM.code, code: api.RM.code, pub: api.RM.pub, live: api.RM.live, owner: api.RM.owner, others: othersOf(api.RM.members, api.RM.you), prop: !!api.RM.prop,
      reacts: api.reactionsOn(), bubbles: api.RM.bubbles, cheer: api.RM.cheerUntil > Date.now(),
    };
  });
  const now = $derived.by(() => { roomClock.version; room.version; return Date.now(); });
  const step = $derived.by(() => { roomClock.version; room.version; return api.inStep(); });

  let tray = $state(false), cool = $state(false), trayBtn = $state(), trayEl = $state();
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rise = () => still() ? { duration: 200, css: (t) => `opacity: ${t}` } : { duration: 320, easing: backOut, css: (t, u) => `opacity: ${Math.min(1, t * 2)}; transform: translateY(${u * 12}px) scale(${0.7 + 0.3 * t})` };
  const drift = () => still() ? { duration: 300, css: (t) => `opacity: ${t}` } : { duration: 600, css: (t, u) => `opacity: ${t}; transform: translateY(${-u * 16}px)` };

  async function openTray() {
    tray = !tray;
    if (!tray) return;
    await tick();
    trayEl?.querySelector("button")?.focus();
  }

  function send(e) {
    tray = false;
    if (!api.roomReact(e)) return;
    const wait = api.reactWait();
    if (!wait) return;
    cool = true;
    setTimeout(() => { cool = false; }, wait);
  }

  function away(e) {
    if (tray && !trayEl?.contains(e.target) && !trayBtn?.contains(e.target)) tray = false;
  }

  function trayKey(e) {
    if (!tray || e.key !== "Escape") return;
    tray = false;
    trayBtn?.focus();
  }

  let shown = false;
  $effect(() => {
    if (v.on !== shown) { shown = v.on; requestAnimationFrame(api.sizeTimer); }
  });
</script>

<svelte:window onpointerdown={away} onkeydown={trayKey} />

<section class="room" class:pub={!!v.pub} id="roomStrip" aria-label="Shared room" hidden={!v.on}>
  {#if v.pub}
    <button class="room-code" type="button" id="stripCode" title="Room details" onclick={() => api.openRoom()}><small>{v.pub.rhythm}</small><span>{v.pub.title}</span></button>
  {:else}
    <button class="room-code" type="button" id="stripCode" title="Copy invite link" onclick={() => copyInvite(api.RM.code)}><small>Room</small>{v.code}</button>
  {/if}
  <ul class="mates" id="mates">
    {#if v.on && !v.live}<li class="hint">Connecting…</li>
    {:else if v.on && !v.others.length}<li class="hint">{v.pub ? "Nobody else is here yet. Others can drop in any time." : "Nobody else is here yet. Share the code or the invite link."}</li>
    {:else if v.on}
      {#each v.others as m (m.id)}
        {@const ring = mateProgress(m.s, now)}
        <li class="mate" data-member={m.id} data-mode={m.s ? m.s.mode : ""} data-status={m.s ? m.s.status : "idle"} style:--progress={ring.deg} title={ring.title}><i aria-hidden="true"></i><b>{m.name}</b>{#if !m.s || m.s.status === "idle"}<em>Ready to focus</em>{:else}<span data-end={m.s.status === "running" ? m.s.end : undefined}>{mateClock(m.s, now)}</span><em>{MODE_NAME[m.s.mode]}{m.s.status === "paused" ? " · paused" : ""}</em>{/if}{#if v.owner && !m.owner}<button class="kick" type="button" data-kick={m.id} aria-label="Remove {m.name} from room" title="Remove from room" onclick={() => { if (api.RM.owner) api.roomSend({ t: "kick", id: m.id }); }}>×</button>{/if}</li>
      {/each}
    {/if}
  </ul>
  <div class="room-actions">
    {#if v.reacts && v.live && v.others.length}
      <div class="react-wrap">
        <div class="bubbles" aria-live="polite">
          {#each v.bubbles as b (b.key)}
            <span class="bubble" in:rise out:drift>{#key b.n}<i in:rise>{b.e}</i>{/key}<b>{bubbleNames(b.names)}</b>{#if b.n > b.names.length}<small>×{b.n}</small>{/if}</span>
          {/each}
        </div>
        {#if v.cheer}<button class="btn small cheer" type="button" title="Send 🎉 to the room" in:rise out:drift onclick={() => send("🎉")}>🎉<span>Cheer</span></button>{/if}
        <button class="btn small react-btn" type="button" id="reactBtn" bind:this={trayBtn} aria-label="Send a reaction" aria-expanded={tray} title={cool ? "Wait a moment" : "Send a reaction"} disabled={cool} onclick={openTray}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c.8 1.3 2 2 3.5 2s2.7-.7 3.5-2"/><path d="M9.2 9.8h.01M14.8 9.8h.01" stroke-width="2.6"/></svg></button>
        {#if tray}
          <div class="react-tray" role="group" aria-label="Reactions" bind:this={trayEl} in:rise>
            {#each REACTIONS as e (e)}<button type="button" aria-label="Send {e}" onclick={() => send(e)}>{e}</button>{/each}
          </div>
        {/if}
      </div>
    {/if}
    {#if v.pub}
      {#if step}<span class="in-step" title="Your timer follows the room clock"><i aria-hidden="true"></i><span>In step</span></span>
      {:else}<button class="btn small solid" type="button" id="followRoom" title="Jump to the room's current round" onclick={() => api.followRoom(true)}>Rejoin round</button>{/if}
    {:else}
      <button class="btn small" type="button" id="syncAll" title="Ask everyone to switch to your timer. It only happens if all of them accept." disabled={v.on && (!v.live || !v.others.length || v.prop)} onclick={() => api.roomSend({ t: "propose" })}>Sync timers</button>
    {/if}
    <button class="link" type="button" id="stripLeave" onclick={() => api.roomReset()}>Leave</button>
  </div>
</section>
