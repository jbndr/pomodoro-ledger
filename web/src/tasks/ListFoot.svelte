<script>
  import { list } from "../lib/redraw.svelte";

  let { api } = $props();

  const EMPTY = { today: ["Nothing planned for today", "Press D on a task, or use its calendar button, to bring it here."], upcoming: ["", ""], later: ["Nothing in Later", "Tasks without a day land here."] };
  const h = $derived.by(() => { list.version; return api.listHead(); });
  const empty = $derived(h.open && !h.byView[h.view] ? EMPTY[h.view] : ["", ""]);
</script>

<div id="taskFoot">{#if !h.open}{#if h.filter}<div class="empty"><strong>No open tasks with this label</strong><span>Choose “All” to see the rest of your ledger.</span></div>{:else}<div class="empty"><strong>No open tasks</strong><span>Add one above and estimate how many 25-minute cycles it needs. Then pick it under “Working on” and press Start.</span></div>{/if}{:else}{#if empty[0]}<div class="empty"><strong>{empty[0]}</strong><span>{empty[1]}</span></div>{/if}{#if h.done}<div class="finished-note">{api.plural(h.done, "finished task")} with cycles and time are in the <a href="#ledger">ledger below</a>.</div>{/if}{/if}</div>
