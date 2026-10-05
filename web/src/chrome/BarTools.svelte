<script>
  import { onMount } from "svelte";
  import { pillOf } from "../lib/chrome";
  import { pill, room } from "../lib/redraw.svelte";
  import { roomList } from "../room/net";
  import { toast } from "./notice.svelte";
  import ThemeButton from "./ThemeButton.svelte";

  let { api } = $props();
  let menuOpen = $state(false), menuEl, people = $state([]);

  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl ";
  const sync = $derived.by(() => { pill.version; return pillOf({ demo: api.DEMO, preview: api.preview(), storeMode: api.S.storeMode, cloud: api.Cloud.state }); });
  const alert = $derived(sync.state === "offline" || sync.state === "preview");
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

  // With no search box in the bar, the palette is taught once: on a later visit, by keyboard users only.
  function teachPalette() {
    if (!matchMedia("(hover: hover)").matches || api.ls.get("pl.hint.palette", false)) return;
    const visits = api.ls.get("pl.visits", 0) + 1;
    api.ls.set("pl.visits", visits);
    if (visits < 2) return;
    setTimeout(() => { api.ls.set("pl.hint.palette", true); toast("Tip: press " + mod + "K to find any task or action."); }, 6000);
  }

  onMount(() => {
    load();
    teachPalette();
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
<div class="bar-menu-wrap" bind:this={menuEl} onfocusout={(e) => { if (e.relatedTarget && !menuEl.contains(e.relatedTarget)) close(); }}>
  <button class="icon-btn" class:alert id="openSettings" type="button" aria-label={alert ? "Menu. " + sync.text : "Menu"} aria-haspopup="menu" aria-expanded={String(menuOpen)} aria-controls="barMenu" onclick={() => (menuOpen = !menuOpen)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></button>
  <div class="bar-menu" class:open={menuOpen} id="barMenu" role="menu" aria-label="Menu">
    <button class="item sync-item" id="syncPill" type="button" role="menuitem" data-state={sync.state} onclick={run(() => api.openSync())}><i aria-hidden="true"></i><span>{sync.text}</span></button>
    <hr />
    <button class="item" type="button" role="menuitem" onclick={run(() => api.openSettings())}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.6a1.8 1.8 0 0 1 3.4 0l.3.9a1.8 1.8 0 0 0 2.5 1l.8-.4a1.8 1.8 0 0 1 2.4 2.4l-.4.8a1.8 1.8 0 0 0 1 2.5l.9.3a1.8 1.8 0 0 1 0 3.4l-.9.3a1.8 1.8 0 0 0-1 2.5l.4.8a1.8 1.8 0 0 1-2.4 2.4l-.8-.4a1.8 1.8 0 0 0-2.5 1l-.3.9a1.8 1.8 0 0 1-3.4 0l-.3-.9a1.8 1.8 0 0 0-2.5-1l-.8.4a1.8 1.8 0 0 1-2.4-2.4l.4-.8a1.8 1.8 0 0 0-1-2.5l-.9-.3a1.8 1.8 0 0 1 0-3.4l.9-.3a1.8 1.8 0 0 0 1-2.5l-.4-.8a1.8 1.8 0 0 1 2.4-2.4l.8.4a1.8 1.8 0 0 0 2.5-1z"/><circle cx="12" cy="12" r="3"/></svg>Settings</button>
    <button class="item" type="button" role="menuitem" id="openPalette" onclick={run(() => api.openPalette())}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>Search and commands<kbd>{mod}K</kbd></button>
    <button class="item" type="button" role="menuitem" id="openKeys" onclick={run(() => api.openKeys())}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/></svg>Keyboard shortcuts<kbd>?</kbd></button>
    <hr />
    <div class="theme-row"><span>Theme</span><ThemeButton {api} /></div>
  </div>
</div>
