<script>
  import { backOut, cubicOut } from "svelte/easing";
  import { flip } from "svelte/animate";
  import { calm } from "../dom";
  import { bubbleNames, mateClock, mateProgress, MODE_NAME, REACTIONS } from "../lib/room";
  import { room, roomClock } from "../lib/redraw.svelte";
  import { hueOf, initials } from "../lib/rhythm";
  import { copyInvite } from "./invite";

  let { api } = $props();

  const v = $derived.by(() => {
    room.version;
    const you = api.RM.members.find((m) => m.id === api.RM.you);
    return {
      on: !!api.RM.code, code: api.RM.code, pub: api.RM.pub, live: api.RM.live, owner: api.RM.owner, prop: !!api.RM.prop,
      // You come first, so your own reactions rise from a face you can find.
      people: [...(you ? [you] : []), ...api.RM.members.filter((m) => m.id !== api.RM.you)],
      alone: api.RM.members.filter((m) => m.id !== api.RM.you).length === 0,
      reacts: api.reactionsOn(), bubbles: api.RM.bubbles, floats: api.RM.floats, cheer: api.RM.cheerUntil > Date.now(),
    };
  });
  const now = $derived.by(() => { roomClock.version; room.version; return Date.now(); });
  const step = $derived.by(() => { roomClock.version; room.version; return api.inStep(); });

  let cool = $state(false);
  const pop = () => calm() ? { duration: 160, css: (t) => `opacity: ${t}` } : { duration: 420, easing: backOut, css: (t) => `opacity: ${Math.min(1, t * 2)}; scale: ${0.4 + 0.6 * t}` };
  const fade = () => ({ duration: calm() ? 120 : 200, easing: cubicOut, css: (t) => `opacity: ${t}; scale: ${0.8 + 0.2 * t}` });
  const move = () => ({ duration: calm() ? 0 : 320, easing: cubicOut });

  const statusOf = (m) => !m.s || m.s.status === "idle" ? "Ready to focus" : MODE_NAME[m.s.mode] + " · " + mateClock(m.s, now) + (m.s.status === "paused" ? " · paused" : "");
  const tip = (m) => "<b>" + (m.id === api.RM.you ? "You" : api.esc(m.name)) + "</b><br>" + statusOf(m);

  function send(e) {
    if (!api.roomReact(e)) return;
    const wait = api.reactWait();
    if (!wait) return;
    cool = true;
    setTimeout(() => { cool = false; }, wait);
  }

  let shown = false;
  $effect(() => {
    if (v.on !== shown) { shown = v.on; requestAnimationFrame(api.sizeTimer); }
  });
</script>

<section class="room" class:pub={!!v.pub} id="roomStrip" aria-label="Shared room" hidden={!v.on}>
  {#if v.pub}
    <button class="room-name" type="button" title="Room details" onclick={() => api.openRoom()}><b>{v.pub.title}</b><span>{v.pub.rhythm} · {step ? "timer shared with the room" : "your timer runs on its own"}</span></button>
  {:else}
    <button class="room-name" type="button" title="Copy invite link" onclick={() => copyInvite(api.RM.code)}><b>Your room</b><span>Code {v.code} · copy invite</span></button>
  {/if}

  <ul class="mates" aria-label="People in the room">
    {#if v.on && !v.live}<li class="hint">Connecting…</li>
    {:else if v.on}
      {#each v.people as m (m.id)}
        {@const ring = mateProgress(m.s, now)}
        {@const done = parseFloat(ring.deg) / 3.6}
        <li class="mate" data-mode={m.s ? m.s.mode : ""} data-status={m.s ? m.s.status : "idle"} class:you={m.id === api.RM.you} data-tip={tip(m)} animate:flip={move()} in:pop out:fade>
          <svg class="mate-ring" viewBox="0 0 40 40" aria-hidden="true"><circle class="track" cx="20" cy="20" r="18.6"/>{#if done > 0}<circle class="arc" cx="20" cy="20" r="18.6" pathLength="100" stroke-dasharray="{done} 100" transform="rotate(-90 20 20)"/>{/if}</svg>
          <span class="face" style:--h={hueOf(m.name)} role="img" aria-label={(m.id === api.RM.you ? "You" : m.name) + ": " + statusOf(m)}>{initials(m.name)}</span>
          {#each v.floats.filter((f) => f.by === m.id) as f (f.key)}<span class="float" aria-hidden="true">{f.e}</span>{/each}
          {#if v.owner && !m.owner && m.id !== api.RM.you}<button class="kick" type="button" aria-label="Remove {m.name} from room" title="Remove from room" onclick={() => { if (api.RM.owner) api.roomSend({ t: "kick", id: m.id }); }}>×</button>{/if}
        </li>
      {/each}
      {#if v.alone}
        <li class="seat" in:fade><button type="button" aria-label="Copy invite link" data-tip="Invite someone" onclick={() => copyInvite(api.RM.code)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg></button></li>
        <li class="hint" in:fade>Just you so far</li>
      {/if}
    {/if}
  </ul>

  <div class="vh" aria-live="polite">{#each v.bubbles as b (b.key)}<span>{bubbleNames(b.names)} sent {b.e}. </span>{/each}</div>

  {#if v.reacts && v.live && !v.alone}
    <div class="reacts" role="group" aria-label="Send a reaction">
      {#each REACTIONS as e (e)}<button type="button" class:cheer={e === "🎉" && v.cheer} aria-label="Send {e}" title={cool ? "Wait a moment" : "Send " + e} disabled={cool} onclick={() => send(e)}>{e}</button>{/each}
    </div>
  {/if}
  <div class="room-actions">
    {#if v.pub && !step}<button class="btn small solid" type="button" id="followRoom" title="Jump to the room's current round" onclick={() => api.followRoom(true)}>Rejoin round</button>{/if}
    {#if !v.pub}<button class="btn small" type="button" id="syncAll" title="Ask everyone to switch to your timer. It only happens if all of them accept." disabled={v.on && (!v.live || v.alone || v.prop)} onclick={() => api.roomSend({ t: "propose" })}>Sync timers</button>{/if}
    <button class="btn small leave" type="button" id="stripLeave" onclick={() => api.roomReset()}>Leave</button>
  </div>
</section>
