<script>
  import { splitClock } from "../../lib/faces";

  let { chars } = $props();

  const t = $derived(splitClock(chars));
</script>

<span class="face-thermo" aria-hidden="true"><span>{t.plus ? "+" : ""}{t.big}</span><sup>{t.small}</sup></span>
