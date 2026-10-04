<script>
  import { onMount } from "svelte";
  import { keyTime } from "../lib/dates";
  import { progress } from "../lib/redraw.svelte";

  let { api } = $props();
  let ready = $state(false), tick = $state(0);

  // Waits a moment so a signed-in visit has its plans from the account before offering.
  onMount(() => { const t = setTimeout(() => (ready = true), 2000); return () => clearTimeout(t); });

  const week = $derived.by(() => { progress.version; tick; return ready ? api.planDue() : null; });
  const ahead = $derived(!!week && keyTime(week) > Date.now());

  function later() { api.waveOff(week); tick++; }
  function off() { api.stopOffering(); tick++; }
</script>

<svelte:document onvisibilitychange={() => { if (!document.hidden) tick++; }} />

<div class="banner plan-nudge" id="planNudge" role="status" hidden={!week}>
  <span>{#if ahead}<strong>The week's nearly done.</strong> Look back and plan the next one?{:else}<strong>New week.</strong> Look back, sort the leftovers and set your objectives?{/if}</span>
  <span class="acts">
    <button class="btn small solid" type="button" onclick={() => api.openPlan()}>{ahead ? "Plan next week" : "Plan the week"}</button>
    <button class="btn small" type="button" onclick={later}>Not this week</button>
    <button class="btn small quiet" type="button" onclick={off}>Don't offer again</button>
  </span>
</div>
