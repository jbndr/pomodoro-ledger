<script>
  import { mateClock, mateProgress, MODE_NAME, othersOf } from "../lib/room";
  import { room, roomClock } from "../lib/redraw.svelte";
  import { copyInvite } from "./invite";

  let { api } = $props();

  const v = $derived.by(() => {
    room.version;
    return { on: !!api.RM.code, code: api.RM.code, live: api.RM.live, owner: api.RM.owner, others: othersOf(api.RM.members, api.RM.you), prop: !!api.RM.prop };
  });
  const now = $derived.by(() => { roomClock.version; room.version; return Date.now(); });

  let shown = false;
  $effect(() => {
    if (v.on !== shown) { shown = v.on; requestAnimationFrame(api.sizeTimer); }
  });
</script>

<section class="room" id="roomStrip" aria-label="Shared room" hidden={!v.on}>
  <button class="room-code" type="button" id="stripCode" title="Copy invite link" onclick={() => copyInvite(api.RM.code)}><small>Room</small>{v.code}</button>
  <ul class="mates" id="mates">
    {#if v.on && !v.live}<li class="hint">Connecting…</li>
    {:else if v.on && !v.others.length}<li class="hint">Nobody else is here yet. Share the code or the invite link.</li>
    {:else if v.on}
      {#each v.others as m (m.id)}
        {@const ring = mateProgress(m.s, now)}
        <li class="mate" data-member={m.id} data-mode={m.s ? m.s.mode : ""} data-status={m.s ? m.s.status : "idle"} style:--progress={ring.deg} title={ring.title}><i aria-hidden="true"></i><b>{m.name}</b>{#if !m.s || m.s.status === "idle"}<em>Ready to focus</em>{:else}<span data-end={m.s.status === "running" ? m.s.end : undefined}>{mateClock(m.s, now)}</span><em>{MODE_NAME[m.s.mode]}{m.s.status === "paused" ? " · paused" : ""}</em>{/if}{#if v.owner && !m.owner}<button class="kick" type="button" data-kick={m.id} aria-label="Remove {m.name} from room" title="Remove from room" onclick={() => { if (api.RM.owner) api.roomSend({ t: "kick", id: m.id }); }}>×</button>{/if}</li>
      {/each}
    {/if}
  </ul>
  <div class="room-actions">
    <button class="btn small" type="button" id="syncAll" title="Ask everyone to switch to your timer. It only happens if all of them accept." disabled={v.on && (!v.live || !v.others.length || v.prop)} onclick={() => api.roomSend({ t: "propose" })}>Sync timers</button>
    <button class="link" type="button" id="stripLeave" onclick={() => api.roomReset()}>Leave</button>
  </div>
</section>
