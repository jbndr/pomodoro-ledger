<script>
  import { emblem, shapeMask } from "./emblems";

  let { id, locked = false, fg = "currentColor", d = 0 } = $props();
  const svg = $derived(emblem(id, { locked, fg }));
</script>

<span class="medal" class:locked style:--mask={locked ? null : shapeMask(id)} style:--d={d}>
  {@html svg}
  {#if !locked}<i class="foil"></i><i class="glare"></i>{/if}
</span>
