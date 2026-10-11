<script>
  import OdoWheel from "./OdoWheel.svelte";

  let { chars } = $props();
</script>

<span class="face-odo" style:--n={chars.length} aria-hidden="true">{#each chars as c, i (chars.length - i)}{#if c === ":"}<span class="odo-colon"><i></i><i></i></span>{:else if c === "+"}<span class="odo-plus">+</span>{:else}<OdoWheel d={c} />{/if}{/each}</span>
