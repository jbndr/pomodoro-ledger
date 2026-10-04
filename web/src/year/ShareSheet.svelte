<script>
  import { flushSync } from "svelte";
  import { CARD_THEMES, shareImage } from "./card";

  let { api } = $props();

  let shown = $state(false), theme = $state("tomato"), url = $state(""), busy = $state(false), sending = $state(false), tall = $state(true);
  let req = null, back = null, sheet = $state(), token = 0;
  const canShare = typeof navigator !== "undefined" && !!navigator.canShare;

  const key = (kind) => "pl-share-theme:" + kind;
  const remembered = (kind, fallback) => { try { return localStorage.getItem(key(kind)) || fallback; } catch { return fallback; } };

  /** Opens with a card maker; `make(theme)` resolves to the PNG for that theme. */
  export function open(r) {
    req = r;
    back = document.activeElement;
    theme = CARD_THEMES.some((t) => t.id === remembered(r.kind, r.theme)) ? remembered(r.kind, r.theme) : r.theme;
    tall = r.tall !== false;
    shown = true;
    api.setOverlay("#share", true);
    addEventListener("keydown", onKey, true);
    flushSync();
    sheet.focus({ preventScroll: true });
    render();
  }

  export function close() {
    if (!shown) return;
    removeEventListener("keydown", onKey, true);
    shown = false;
    api.setOverlay("#share", false);
    if (url) URL.revokeObjectURL(url);
    url = "";
    const done = req?.onclose;
    req = null;
    done?.();
    if (back && back.isConnected) back.focus({ preventScroll: true });
  }

  async function render() {
    const t = ++token;
    busy = true;
    try {
      const b = await req.make(theme);
      if (t !== token || !shown) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(b);
    } catch {
      api.toast("Couldn't make the image. Try again.");
    }
    if (t === token) busy = false;
  }

  function pick(id) {
    if (id === theme) return;
    theme = id;
    try { localStorage.setItem(key(req.kind), id); } catch {}
    render();
  }

  async function send() {
    if (sending || !req) return;
    sending = true;
    try {
      const b = await req.make(theme);
      const r = await shareImage(b, req.name, req.title);
      if (r === "saved") api.toast("Saved the image to your downloads.");
      if (r !== "cancelled") close();
    } catch {
      api.toast("Couldn't make the image. Try again.");
    }
    sending = false;
  }

  function onKey(e) {
    if (!shown) return;
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    const radio = e.target instanceof HTMLElement && e.target.getAttribute("role") === "radio";
    if (radio && ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      const i = CARD_THEMES.findIndex((t) => t.id === theme), n = CARD_THEMES.length, d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
      pick(CARD_THEMES[(i + d + n) % n].id);
      flushSync();
      sheet.querySelector("[role=radio][aria-checked=true]")?.focus();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay share-ov" id="share" hidden onclick={(e) => { if (e.target.id === "share") close(); }}>
  {#if shown}
    <div class="sheet share-sheet" role="dialog" aria-modal="true" aria-labelledby="shareH" tabindex="-1" bind:this={sheet}>
      <div class="sec-head"><h2 id="shareH">{req?.heading || "Share"}</h2><button class="icon-btn" type="button" aria-label="Close" onclick={close}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="share-body" class:wide={!tall}>
        <div class="share-prev" class:busy>
          {#if url}<img src={url} alt="Preview of the image" />{:else}<span class="share-ph"></span>{/if}
        </div>
        <div class="share-side">
          <p class="share-k" id="shareThemeK">Theme</p>
          <div class="share-themes" role="radiogroup" aria-labelledby="shareThemeK">
            {#each CARD_THEMES as t (t.id)}
              <button type="button" role="radio" aria-checked={String(t.id === theme)} tabindex={t.id === theme ? 0 : -1} onclick={() => pick(t.id)} style:--sw-bg={t.bg} style:--sw-fg={t.fg}>
                <i class="sw" aria-hidden="true"><b></b></i><span>{t.name}</span>
              </button>
            {/each}
          </div>
          <div class="share-acts">
            <button class="btn solid" type="button" disabled={sending} onclick={send}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>{sending ? "Making the image…" : canShare ? "Share" : "Save image"}
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
