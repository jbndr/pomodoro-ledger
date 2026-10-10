<script>
  import WeatherLayers from "./WeatherLayers.svelte";

  let { backdrop = "glow" } = $props();
</script>

{#if backdrop === "weather"}<WeatherLayers />{/if}
