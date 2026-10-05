<script>
  import { pillOf } from "../lib/chrome";
  import { pill } from "../lib/redraw.svelte";

  let { api } = $props();
  const p = $derived.by(() => { pill.version; return pillOf({ demo: api.DEMO, preview: api.preview(), storeMode: api.S.storeMode, cloud: api.Cloud.state }); });
</script>

<button class="pill" id="syncPill" type="button" data-state={p.state} aria-label={p.text + ". Sync settings"} onclick={api.openSync}><i aria-hidden="true"></i><span class="pill-tip" aria-hidden="true">{p.text}</span></button>
