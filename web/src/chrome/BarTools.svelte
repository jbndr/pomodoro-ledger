<script>
  import { onMount } from "svelte";
  import { room } from "../lib/redraw.svelte";
  import { roomList } from "../room/net";
  import Pill from "./Pill.svelte";
  import ThemeButton from "./ThemeButton.svelte";

  let { api } = $props();
  let menuOpen = $state(false), menuEl, people = $state([]);

  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl ";
  const roomName = $derived.by(() => { room.version; return api.RM.code ? api.RM.pub?.title || "your room" : ""; });
  const hueOf = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const initials = (n) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const faces = $derived(people.slice(0, 3).map((n) => ({ ini: initials(n), hue: hueOf(n) })));
  const label = $derived(roomName ? "In " + roomName : people.length ? people.length + " in rooms now" : "Work together");

  // Only names come back from the lobby; what anyone works on stays on their own device.
  async function load() {
    if (api.DEMO || document.hidden) return;
    try { people = (await roomList()).rooms.flatMap((r) => r.names); } catch {}
  }

  function close(refocus) {
    if (!menuOpen) return;
    menuOpen = false;
    if (refocus) document.getElementById("openSettings")?.focus();
  }
  const run = (fn) => () => { close(); fn(); };

  onMount(() => {
    load();
    const poll = setInterval(load, 90e3);
    const vis = () => { if (!document.hidden) load(); };
    const outside = (e) => { if (menuOpen && !menuEl.contains(e.target)) close(); };
    const esc = (e) => { if (e.key === "Escape" && menuOpen) { e.stopPropagation(); close(true); } };
    document.addEventListener("visibilitychange", vis);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc, true);
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", vis); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", esc, true); };
  });
</script>

<button class="together" class:in={!!roomName} id="openRoom" type="button" aria-label={label + ". Work together"} onclick={() => api.openRoom()}>
  {#if faces.length}<span class="faces" aria-hidden="true">{#each faces as f, i (i)}<span class="face" style:--h={f.hue}>{f.ini}</span>{/each}</span>{:else}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.2c2.2.2 3.6 1.6 4 3.8"/></svg>{/if}
  <span class="together-label">{label}</span>
</button>
<Pill {api} />
<button class="search-btn" id="openPalette" type="button" aria-label="Search actions and tasks" onclick={() => api.openPalette()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><span>Search</span><kbd>{mod}K</kbd></button>
<div class="bar-menu-wrap" bind:this={menuEl}>
  <button class="icon-btn" id="openSettings" type="button" aria-label="Menu" aria-haspopup="menu" aria-expanded={String(menuOpen)} aria-controls="barMenu" onclick={() => (menuOpen = !menuOpen)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></button>
  <div class="bar-menu" class:open={menuOpen} id="barMenu" role="menu" aria-label="Menu">
    <button class="item" type="button" role="menuitem" onclick={run(() => api.openSettings())}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>Settings</button>
    <button class="item" type="button" role="menuitem" id="openKeys" onclick={run(() => api.openKeys())}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/></svg>Keyboard shortcuts<kbd>?</kbd></button>
    <hr />
    <div class="theme-row"><span>Theme</span><ThemeButton {api} /></div>
  </div>
</div>
