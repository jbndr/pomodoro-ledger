<script>
  let { chars } = $props();
</script>

<span class="face-sport" aria-hidden="true">{#each chars as c}<span class={c === ":" ? "c" : c === "+" ? "p" : "d"}>{c}</span>{/each}</span>
