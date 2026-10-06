<script>
  import { pill } from "../lib/redraw.svelte";

  let { api } = $props();
  const shown = $derived.by(() => { pill.version; return !api.EMBED && api.preview(); });

  function click() {
    if (api.DEMO) {
      const url = new URL(location.href);
      url.searchParams.delete("demo");
      location.assign(url.pathname + url.search + url.hash);
      return;
    }
    api.markStarted(); document.getElementById("newTitle").focus();
  }
</script>

<div class="banner" id="previewBanner" hidden={!shown}>
  <span>{#if api.DEMO}<strong>Interactive demo.</strong> Changes reset when you reload and never affect your saved ledger.{:else}<strong>You're looking at example data.</strong> Add your first task or start the timer, and the examples disappear.{/if}</span>
  <button class="btn" type="button" id="startOwn" onclick={click}>{api.DEMO ? "Exit demo" : "Start my own ledger"}</button>
</div>
