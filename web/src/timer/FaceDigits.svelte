<script>
  import "./faces/faces.css";
  import Bedside from "./faces/Bedside.svelte";
  import Editorial from "./faces/Editorial.svelte";
  import Flap from "./faces/Flap.svelte";
  import Matrix from "./faces/Matrix.svelte";
  import Nixie from "./faces/Nixie.svelte";
  import Numerals from "./faces/Numerals.svelte";
  import Odometer from "./faces/Odometer.svelte";
  import Segments from "./faces/Segments.svelte";
  import Sport from "./faces/Sport.svelte";
  import Stacked from "./faces/Stacked.svelte";
  import Thermo from "./faces/Thermo.svelte";
  import Weight from "./faces/Weight.svelte";
  import Words from "./faces/Words.svelte";

  let { face = "classic", chars, mode = "focus", up = "", frac = 1 } = $props();

  const LCD = { focus: "Focus", short: "Break", long: "Long break" };
  const label = $derived(up === "flow" ? "Flow" : up === "over" ? "Over" : LCD[mode] || "");
</script>

{#if face === "flap"}<Flap {chars} />{:else if face === "matrix"}<Matrix text={chars.join("")} />{:else if face === "nixie"}<Nixie {chars} />{:else if face === "vfd" || face === "lcd"}<Segments {chars} kind={face} label={face === "lcd" ? label : ""} />{:else if face === "odo"}<Odometer {chars} />{:else if face === "serif"}<Editorial {chars} />{:else if face === "words"}<Words {chars} {up} />{:else if face === "stack"}<Stacked {chars} />{:else if face === "weight"}<Weight {chars} {frac} />{:else if face === "numerals"}<Numerals {chars} />{:else if face === "thermo"}<Thermo {chars} />{:else if face === "sport"}<Sport {chars} />{:else if face === "bedside"}<Bedside {chars} />{:else}{#each chars as c}<span class={c === ":" ? "c" : c === "+" ? "p" : "d"}>{c}</span>{/each}{/if}
