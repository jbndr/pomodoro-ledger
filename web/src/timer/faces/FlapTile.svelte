<script>
  import { calm } from "../../dom";

  let { c, delay = 0 } = $props();

  // The top leaf falls with the old digit, then the bottom leaf lands with the new one over the old bottom half.
  let next = $state(c), under = $state(c), falling = $state(c);
  let topLeaf, bottomLeaf, last = c;

  $effect(() => {
    const now = c;
    if (now === last) return;
    const was = last;
    last = now;
    for (const a of [...topLeaf.getAnimations(), ...bottomLeaf.getAnimations()]) a.cancel();
    falling = was; next = now; under = was;
    if (calm()) { under = now; return; }
    topLeaf.animate([{ transform: "rotateX(0deg)", filter: "brightness(1)" }, { transform: "rotateX(-90deg)", filter: "brightness(.62)" }], { duration: 150, delay, easing: "cubic-bezier(.5, 0, .9, .5)", fill: "backwards" });
    const land = bottomLeaf.animate([{ transform: "rotateX(90deg)", filter: "brightness(1.25)" }, { transform: "rotateX(-5deg)", filter: "brightness(1)", offset: .78 }, { transform: "rotateX(0deg)", filter: "brightness(1)" }], { duration: 190, delay: delay + 150, easing: "cubic-bezier(.3, .6, .4, 1)", fill: "backwards" });
    land.onfinish = () => { under = now; };
  });
</script>

<span class="flap"><span class="fh up"><b>{next}</b></span><span class="fh dn"><b>{under}</b></span><span class="fh up leaf" bind:this={topLeaf}><b>{falling}</b></span><span class="fh dn leaf" bind:this={bottomLeaf}><b>{next}</b></span></span>
