<script>
  import { askOf, mateClock, MODE_NAME } from "../lib/room";
  import { room, roomClock } from "../lib/redraw.svelte";

  let { api } = $props();

  const ask = $derived.by(() => { room.version; return api.RM.code && api.RM.live ? askOf(api.RM.prop, api.RM.members, api.RM.you) : null; });
  const now = $derived.by(() => { roomClock.version; room.version; return Date.now(); });
  const vote = (ok) => api.roomSend({ t: "vote", ok });
</script>

{#snippet timer(s)}{#if s && s.status === "idle"}start a {Math.round(s.total / 60000)} min {MODE_NAME[s.mode].toLowerCase()} together now{:else if s}{MODE_NAME[s.mode].toLowerCase()}, {s.status === "paused" ? "paused at " : ""}<span data-end={s.status === "running" ? s.end : undefined}>{mateClock(s, now)}</span>{s.status === "paused" ? "" : " left"}{/if}{/snippet}

<div class="ask" id="ask" role="alert" hidden={!ask}>
  {#if ask?.kind === "mine"}<p>You asked everyone to sync to your timer. {ask.count}.</p><div><button class="btn small" type="button" data-ask="cancel" onclick={() => api.roomSend({ t: "cancel" })}>Cancel</button></div>
  {:else if ask?.kind === "accepted"}<p>You accepted. Waiting for the others: {ask.count}.</p>
  {:else if ask}<p><b>{ask.by ? ask.by.name : "Someone"}</b> wants everyone to sync to their timer: {@render timer(ask.by && ask.by.s)}. Your timer would jump to theirs.</p><div><button class="btn small" type="button" data-ask="no" onclick={() => vote(false)}>Decline</button><button class="btn small solid" type="button" data-ask="yes" onclick={() => vote(true)}>Accept</button></div>
  {/if}
</div>
