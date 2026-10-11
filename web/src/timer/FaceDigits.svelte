<script>
  import "./faces/faces.css";
  import Editorial from "./faces/Editorial.svelte";
  import Flap from "./faces/Flap.svelte";
  import Matrix from "./faces/Matrix.svelte";
  import Nixie from "./faces/Nixie.svelte";
  import Odometer from "./faces/Odometer.svelte";
  import Segments from "./faces/Segments.svelte";
  import Stacked from "./faces/Stacked.svelte";
  import Words from "./faces/Words.svelte";

  let { face = "classic", chars, mode = "focus", up = "" } = $props();

  const LCD = { focus: "Focus", short: "Break", long: "Long break" };
  const label = $derived(up === "flow" ? "Flow" : up === "over" ? "Over" : LCD[mode] || "");
</script>

{#if face === "flap"}<Flap {chars} />{:else if face === "matrix"}<Matrix text={chars.join("")} />{:else if face === "nixie"}<Nixie {chars} />{:else if face === "vfd" || face === "lcd"}<Segments {chars} kind={face} label={face === "lcd" ? label : ""} />{:else if face === "odo"}<Odometer {chars} />{:else if face === "serif"}<Editorial {chars} />{:else if face === "words"}<Words {chars} {up} />{:else if face === "stack"}<Stacked {chars} />{:else}{#each chars as c}<span class={c === ":" ? "c" : c === "+" ? "p" : "d"}>{c}</span>{/each}{/if}
