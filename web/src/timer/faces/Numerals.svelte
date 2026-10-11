<script>
  import { splitClock } from "../../lib/faces";

  let { chars } = $props();

  const t = $derived(splitClock(chars));
</script>

<span class="face-num" aria-hidden="true"><span class="nm-m">{t.plus ? "+" : ""}{t.big}</span><span class="nm-s">{t.small}</span></span>
