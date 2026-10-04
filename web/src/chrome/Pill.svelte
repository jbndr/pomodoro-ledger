<script>
  import { pillOf } from "../lib/chrome";
  import { pill } from "../lib/redraw.svelte";

  let { api } = $props();
  const p = $derived.by(() => { pill.version; return pillOf({ demo: api.DEMO, preview: api.preview(), storeMode: api.S.storeMode, cloud: api.Cloud.state }); });
</script>

<button class="pill" id="syncPill" type="button" data-state={p.state} title="Sync settings" onclick={api.openSync}><i></i><span>{p.text}</span></button>
