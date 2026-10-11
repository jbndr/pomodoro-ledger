<script>
  import { inWords } from "../../lib/faces";

  let { chars, up = "" } = $props();

  const w = $derived(inWords(chars.join(""), up));
</script>

<span class="face-words" aria-hidden="true"><b>{w.n}</b><span>{w.unit}</span></span>
