<script>
  import { calm } from "../../dom";

  let { d } = $props();

  // Spare digits at both ends let a wrap-around roll the short way, and the overshoot never shows an empty wheel.
  const STRIP = [..."89012345678901"];
  const at = (i) => `translateY(${-i * 1.1}em)`;
  let strip, last = null;

  $effect(() => {
    const now = +d;
    if (now === last) return;
    const was = last;
    last = now;
    for (const a of strip.getAnimations()) a.cancel();
    strip.style.transform = at(now + 2);
    if (was === null || calm()) return;
    const to = was === 0 && now === 9 ? 1 : was === 9 && now === 0 ? 12 : now + 2;
    strip.animate([{ transform: at(was + 2) }, { transform: at(to) }], { duration: 520, easing: "cubic-bezier(.5, 0, .2, 1.25)" });
  });
</script>

<span class="wheel"><span class="strip" bind:this={strip}>{#each STRIP as c, i (i)}<span>{c}</span>{/each}</span></span>
