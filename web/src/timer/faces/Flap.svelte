<script>
  import FlapTile from "./FlapTile.svelte";

  let { chars } = $props();
</script>

<span class="face-flap" style:--n={chars.length} aria-hidden="true">{#each chars as c, i (i)}{#if c === ":"}<span class="fl-colon"><i></i><i></i></span>{:else if c === "+"}<span class="fl-plus">+</span>{:else}<FlapTile {c} delay={(chars.length - 1 - i) * 22} />{/if}{/each}</span>
