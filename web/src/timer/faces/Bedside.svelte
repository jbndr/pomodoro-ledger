<script>
  let { chars } = $props();
</script>

<span class="face-bed" class:long={chars.length > 5} aria-hidden="true">{#each chars as c}{#if c === ":"}<span class="c"><i></i><i></i></span>{:else}<span class={c === "+" ? "p" : "d"}>{c}</span>{/if}{/each}</span>
