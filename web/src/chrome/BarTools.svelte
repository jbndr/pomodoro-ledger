<script>
  import { room } from "../lib/redraw.svelte";
  import Pill from "./Pill.svelte";
  import ThemeButton from "./ThemeButton.svelte";

  let { api } = $props();
  const inRoom = $derived.by(() => { room.version; return !!api.RM.code; });
</script>

<Pill {api} /><button class="icon-btn" class:on={inRoom} id="openRoom" type="button" aria-label="Work together" title="Work together" onclick={() => api.openRoom()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.2c2.2.2 3.6 1.6 4 3.8"/></svg></button><ThemeButton {api} /><button class="icon-btn palette-btn" id="openPalette" type="button" aria-label="Search actions and tasks" onclick={() => api.openPalette()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg></button><button class="icon-btn keys-btn" id="openKeys" type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onclick={() => api.openKeys()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/></svg></button>
