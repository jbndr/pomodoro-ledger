<script>
  import { onMount } from "svelte";
  import { normTheme, themeColor } from "../lib/chrome";

  let { api } = $props();
  let theme = $state("system");
  const CHOICES = [["system", "Auto"], ["light", "Light"], ["dark", "Dark"]];

  function apply(t) {
    theme = normTheme(t);
    if (theme === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = themeColor(theme, m.media); });
    api.themed();
  }

  function pick(t) {
    api.ls.set("pl.theme", t);
    apply(t);
  }

  onMount(() => apply(api.ls.get("pl.theme", "system")));
</script>

<div class="seg theme-seg" id="themeSeg" role="group" aria-label="Theme">
  {#each CHOICES as [t, name] (t)}<button type="button" aria-pressed={String(theme === t)} onclick={() => pick(t)}>{name}</button>{/each}
</div>
