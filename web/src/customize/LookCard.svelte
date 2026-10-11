<script>
  import { knobAt, litTicks } from "../lib/timer";
  import DialRing from "../timer/DialRing.svelte";
  import FaceDigits from "../timer/FaceDigits.svelte";
  import { wantHalftone } from "../halftone";
  import { applyWeather } from "../weather.svelte";
  import { wantWeatherArt } from "../weatherArt";

  let { look, time = "17:30", frac = 0.7 } = $props();

  $effect(() => {
    if (look.backdrop === "halftone") wantHalftone();
    if (look.backdrop === "weather") { wantWeatherArt(); applyWeather(document.documentElement); }
  });

  // Backgrounds that are always dark, and the sky after dusk, give the miniature the dark theme's ink, as they give the timer.
  const ink = $derived(["film", "stars", "wash"].includes(look.backdrop) ? "dark" : look.backdrop === "sky" || look.backdrop === "weather" ? document.documentElement.dataset.skyInk || null : null);
</script>

<span class="lk st-swatch" data-backdrop={look.backdrop} data-ink={ink} aria-hidden="true"><span class="glow"></span><span class="dial-wrap" data-face={look.face} data-ring={look.ring}><DialRing ring={look.ring} {frac} lit={litTicks(frac)} knob={knobAt(frac)} /><span class="dial-center"><span class="time"><FaceDigits face={look.face} chars={[...time]} /></span></span></span></span>
