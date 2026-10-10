<script>
  import "./faces/faces.css";
  import Flap from "./faces/Flap.svelte";
  import Matrix from "./faces/Matrix.svelte";
  import Nixie from "./faces/Nixie.svelte";

  let { face = "classic", chars } = $props();
</script>

{#if face === "flap"}<Flap {chars} />{:else if face === "matrix"}<Matrix text={chars.join("")} />{:else if face === "nixie"}<Nixie {chars} />{:else}{#each chars as c}<span class={c === ":" ? "c" : c === "+" ? "p" : "d"}>{c}</span>{/each}{/if}
