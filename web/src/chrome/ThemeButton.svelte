<script>
  import { onMount } from "svelte";
  import { applyTheme, theme } from "./theme.svelte";

  let { api, id = "themeSeg" } = $props();
  const CHOICES = [["system", "Auto"], ["light", "Light"], ["dark", "Dark"]];

  function pick(t) {
    api.ls.set("pl.theme", t);
    applyTheme(t, api.themed);
  }

  onMount(() => { if (id === "themeSeg") applyTheme(api.ls.get("pl.theme", "system"), api.themed); });
</script>

<div class="seg theme-seg" {id} role="group" aria-label="Theme">
  {#each CHOICES as [t, name] (t)}<button type="button" aria-pressed={String(theme.v === t)} onclick={() => pick(t)}>{name}</button>{/each}
</div>
