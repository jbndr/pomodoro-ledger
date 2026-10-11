<script>
  import { calm } from "../../dom";

  let { chars } = $props();

  const CATHODES = [..."0123456789"];
  const light = () => ({ duration: calm() ? 0 : 170, css: (t) => `opacity: ${t}` });
</script>

<span class="face-nixie" style:--n={chars.length} aria-hidden="true">{#each chars as c, i (i)}{#if c === ":"}<span class="nx-colon"><i></i><i></i></span>{:else if c === "+"}<span class="nx-plus">+</span>{:else}<span class="tube"><span class="cathodes">{#each CATHODES as d (d)}<b>{d}</b>{/each}</span>{#key c}<b class="lit" in:light out:light>{c}</b>{/key}</span>{/if}{/each}</span>
