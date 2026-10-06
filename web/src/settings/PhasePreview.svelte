<script>
  import { onDestroy } from "svelte";
  import { PHASE_MORPHS } from "../lib/phaseMorph";

  let { value, onpick } = $props();

  const R = 112, C = 2 * Math.PI * R, EASE = "cubic-bezier(.77, 0, .175, 1)";
  const HINTS = { wipe: "The new colour wipes across the card", clock: "It sweeps round the dial from 12 o'clock", sweep: "Travels round the colour wheel, through amber", blend: "A quick, direct blend", grey: "Drains to grey, then the new colour fills in", instant: "Switches at once, with a small press" };

  let mini = $state(), slow = $state(true), hovered = "", hoverT = 0, playing = 0;
  const wait = (ms) => new Promise((d) => setTimeout(d, ms));

  const tokens = () => {
    const cs = getComputedStyle(document.documentElement), g = (k) => cs.getPropertyValue(k).trim();
    return { focus: [g("--t-l"), +g("--t-c"), +g("--t-h")], short: [g("--lf-l"), +g("--lf-c"), +g("--lf-h")] };
  };
  const faceHTML = (st) => `<div class="mw"><span class="${st === "focus" ? "on" : ""}">Focus</span><span class="${st === "short" ? "on" : ""}">Short</span><span>Long</span></div><svg viewBox="0 0 300 300" aria-hidden="true"><circle class="mtrack" cx="150" cy="150" r="${R}"/><circle class="marc" cx="150" cy="150" r="${R}" transform="rotate(-90 150 150)" stroke-dasharray="${C.toFixed(1)}"/><circle class="mknob" cx="150" cy="38" r="10"/></svg><div class="mt">${st === "focus" ? "25:00" : "05:00"}</div><span class="mb">Start</span>`;
  function paint(face, st) {
    const [l, c, h] = tokens()[st];
    face.style.setProperty("--ml", l); face.style.setProperty("--mc", c); face.style.setProperty("--mh", h);
    face.innerHTML = faceHTML(st); face.dataset.st = st;
  }
  function mount(el) {
    el.innerHTML = '<div class="mface"></div>';
    paint(el.firstChild, "focus");
  }

  function morphTo(st, kind) {
    const a = mini?.querySelector(".mface:last-child"); if (!a) return Promise.resolve();
    const k = slow ? 2.5 : 1, t = tokens(), [l0, c0, h0] = t[a.dataset.st], [l1, c1, h1] = t[st];
    if (kind === "wipe" || kind === "clock" || kind === "blend") {
      const b = document.createElement("div"); b.className = "mface"; mini.append(b); paint(b, st);
      if (kind === "wipe") b.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 520 * k, easing: EASE });
      else if (kind === "clock") { b.classList.add("sweeping"); b.animate([{ "--ma": "0deg" }, { "--ma": "360deg" }], { duration: 620 * k, easing: "cubic-bezier(.65, 0, .35, 1)" }); }
      else b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280 * k, easing: "ease-in-out" });
      return wait((kind === "clock" ? 640 : kind === "wipe" ? 540 : 300) * k).then(() => { a.remove(); b.classList.remove("sweeping"); });
    }
    paint(a, st);
    if (kind === "instant") { a.querySelector("svg").animate([{ scale: 1 }, { scale: .965, offset: .35 }, { scale: 1 }], { duration: 320 * k, easing: "ease-out" }); return wait(330 * k); }
    const frames = kind === "sweep"
      ? [{ "--ml": l0, "--mc": c0, "--mh": h0 }, { "--ml": l1, "--mc": c1, "--mh": h1 }]
      : [{ "--ml": l0, "--mc": c0, "--mh": h0 }, { "--ml": l0, "--mc": .012, "--mh": h0, offset: .5 }, { "--ml": l1, "--mc": .012, "--mh": h1, offset: .5 }, { "--ml": l1, "--mc": c1, "--mh": h1 }];
    a.animate(frames, { duration: (kind === "sweep" ? 460 : 520) * k, easing: EASE });
    return wait(540 * k);
  }

  async function play(kind = value) {
    const id = ++playing;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) kind = "instant";
    if (mini) { for (const f of [...mini.children].slice(0, -1)) f.remove(); paint(mini.lastChild, "focus"); }
    await wait(200); if (id !== playing) return;
    await morphTo("short", kind);
    await wait(slow ? 1300 : 900); if (id !== playing) return;
    await morphTo("focus", kind);
  }

  function pick(v) { onpick(v); play(v); }

  // Pointing at a style plays it after a short pause; clicking picks it.
  function over(e, v) {
    if (e.pointerType !== "mouse" || v === hovered) return;
    hovered = v; clearTimeout(hoverT);
    hoverT = setTimeout(() => play(v), 160);
  }
  function out(e) { if (!e.currentTarget.contains(e.relatedTarget)) { hovered = ""; clearTimeout(hoverT); } }

  function speed(s) { slow = s; play(); }

  onDestroy(() => { playing++; clearTimeout(hoverT); });
</script>

<div class="st-morph">
  <div class="st-mini-wrap">
    <div class="st-mini" aria-hidden="true" bind:this={mini} {@attach mount}></div>
    <span class="st-seg st-speed" role="group" aria-label="Preview speed"><button type="button" aria-pressed={String(slow)} onclick={() => speed(true)}>Slowed</button><button type="button" aria-pressed={String(!slow)} onclick={() => speed(false)}>Real speed</button></span>
    <button class="st-link" type="button" onclick={() => play()}>Play again</button>
  </div>
  <div class="st-styles" role="radiogroup" aria-label="How the timer changes colour between phases">
    {#each PHASE_MORPHS as [v, name] (v)}
      <button class="st-style" type="button" role="radio" aria-checked={String(value === v)} data-morph={v} onclick={() => pick(v)} onpointerover={(e) => over(e, v)} onpointerout={out}><i></i><span><b>{name}</b><small>{HINTS[v]}</small></span></button>
    {/each}
  </div>
</div>
