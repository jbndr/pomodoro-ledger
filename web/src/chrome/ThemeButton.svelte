<script>
  import { onMount } from "svelte";
  import { nextTheme, normTheme, themeColor, themeName, themeToast } from "../lib/chrome";
  import { toast } from "./notice.svelte";

  let { api } = $props();
  let theme = $state("system");
  const next = $derived(nextTheme(theme));

  function apply(t) {
    theme = normTheme(t);
    if (theme === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = themeColor(theme, m.media); });
    api.themed();
  }

  // Reads the stored value rather than `theme`: demo mode never stores one, so there every click lands on light.
  function cycle() {
    const t = nextTheme(api.ls.get("pl.theme", "system"));
    api.ls.set("pl.theme", t);
    apply(t);
    toast(themeToast(t));
  }

  onMount(() => apply(api.ls.get("pl.theme", "system")));
</script>

<button class="icon-btn" id="themeBtn" type="button" aria-label="Theme: {themeName(theme)}. Switch to {themeName(next)}" title="Theme: {themeName(theme)} · click for {themeName(next)}" onclick={cycle}>{#if theme === "system"}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg>{:else if theme === "light"}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>{:else}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>{/if}</button>
