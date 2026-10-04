<script>
  import { flushSync } from "svelte";
  import { placeTip } from "../lib/chrome";

  let el, html = $state(""), shown = $state(false), at = $state(null);
  let bar = null;
  // A finger that starts scrolling fires pointermove but never pointerleave, which left tips stranded; touch shows them on tap.
  let pointer = "mouse";

  function hide() {
    shown = false;
    if (bar) { bar.classList.remove("hover"); bar = null; }
  }

  function show(e) {
    const t = e.target.closest && e.target.closest("[data-tip]");
    hide();
    if (!t) return;
    if (t.classList.contains("hit") && t.nextElementSibling) { bar = t.nextElementSibling; bar.classList.add("hover"); }
    html = t.dataset.tip; shown = true;
    flushSync();
    at = placeTip(e.clientX, e.clientY, el.offsetWidth, el.offsetHeight, innerWidth);
  }
</script>

<svelte:document
  onpointerdowncapture={(e) => { pointer = e.pointerType; }}
  onpointermove={(e) => { if (e.pointerType === "mouse") show(e); }}
  onclick={(e) => { if (pointer !== "mouse") show(e); }}
  onpointerleave={hide}
  onscrollcapture={hide}
/>

<div class="tip" id="tip" bind:this={el} hidden={!shown} style:left={at && at.left + "px"} style:top={at && at.top + "px"}>{@html html}</div>
