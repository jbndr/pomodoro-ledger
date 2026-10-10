<script>
  let { ring = "arc", frac = 1 } = $props();

  const TILES = 24, DOTS = 30;
</script>

{#if ring !== "none"}
  <div class="bar" data-ring={ring} aria-hidden="true">
    {#if ring === "tiles"}
      {#each { length: TILES }, i}<i class="t" class:lit={i < Math.ceil(frac * TILES)}></i>{/each}
    {:else if ring === "dots"}
      {#each { length: DOTS }, i}<i class="o" class:lit={i < Math.ceil(frac * DOTS)} class:lead={i === Math.ceil(frac * DOTS) - 1 && frac < 1}></i>{/each}
    {:else}
      <i id="miniBar" style:scale="{frac} 1"></i>
    {/if}
  </div>
{/if}
