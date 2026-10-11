<script>
  import { faceWeight } from "../../lib/faces";

  let { chars, frac = 1 } = $props();
</script>

<span class="face-weight" style:font-weight={faceWeight(frac)} aria-hidden="true">{#each chars as c}<span class={c === ":" ? "c" : c === "+" ? "p" : "d"}>{c}</span>{/each}</span>
