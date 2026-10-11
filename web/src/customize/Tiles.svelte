<script>
  import { onDestroy, onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { calm } from "../dom";
  import { BACKDROP_GROUPS, BACKDROPS, FACE_GROUPS, FACES, LOOKS, RINGS } from "../lib/faces";
  import { describeLook, LOOK_NAME_MAX } from "../lib/looks";
  import LookCard from "./LookCard.svelte";
  import { clock, knobAt, litTicks } from "../lib/timer";
  import DialRing from "../timer/DialRing.svelte";
  import FaceDigits from "../timer/FaceDigits.svelte";
  import { fmtClock } from "../format";
  import { sky, wantPlace } from "../sky.svelte";
  import { wantHalftone } from "../halftone";
  import { applyWeather, weatherHint } from "../weather.svelte";
  import { wantWeatherArt } from "../weatherArt";

  let { kind, value, onpick, onhint, mine = [], save = null, editing = "", onrename, onedit, ondelete } = $props();

  wantHalftone();
  $effect(() => { if (kind === "backdrop") { wantWeatherArt(); applyWeather(document.documentElement); } });

  const LIST = { face: FACES, ring: RINGS, backdrop: BACKDROPS }, NAME = { looks: "Looks", face: "Face", ring: "Ring", backdrop: "Background" };
  const START = 17 * 60 + 30, TOTAL = 25 * 60, SAVE = "+save";
  const icon = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  const PEN = icon('<path d="M4.5 19.5h3.8L19 8.8 15.2 5 4.5 15.7z"/><path d="M13.2 7l3.8 3.8"/>'), TRASH = icon('<path d="M4.5 7h15M9.5 7V4.8h5V7M6.8 7l.9 12.2h8.6l.9-12.2"/>');
  const looks = $derived([...LOOKS, ...mine]);
  const items = $derived(kind === "looks" ? looks.map((l) => [l.id, l.name, l.note || describeLook(l)]) : LIST[kind]);
  // With nothing chosen (a mix that isn't one of the looks), the first tile takes the group's turn in the tab order.
  const tabStop = $derived(items.some(([id]) => id === value) ? value : items[0][0]);
  let secs = $state(Object.fromEntries([...FACES, ...RINGS].map(([id]) => [id, START]))), playing = $state(""), timer = 0, grid;
  const skyHint = $derived(sky.turn ? [sky.here?.place, (sky.turn.rise ? "Sunrise at " : "Sunset at ") + fmtClock(sky.turn.at)].filter(Boolean).join(" · ") : "");
  // A mix that isn't a look yet is Save look's to describe.
  const shown = $derived(playing || value || (save?.look ? SAVE : ""));
  const hint = $derived((shown === SAVE && save?.hint) || (shown === "sky" && skyHint) || (shown === "weather" && weatherHint()) || items.find(([id]) => id === shown)?.[2] || "");

  // Pointing at a face ticks its preview in real seconds; a ring runs down 25 seconds a step, so a tile turns or a dot goes out each time.
  function play(id, step = 1) {
    if (playing === id) return;
    clearInterval(timer);
    playing = id;
    if (id === "sky" || id === "weather") wantPlace();
    const tick = () => {
      if (!grid?.offsetParent) { stop(id); return; }
      if (id in secs) secs[id] = secs[id] > step ? secs[id] - step : START;
    };
    tick();
    timer = setInterval(tick, 1000);
  }
  function stop(id) { if (playing !== id) return; clearInterval(timer); playing = ""; }
  const step = $derived(kind === "ring" ? 25 : 1);
  const hover = (id) => ({ onpointerenter: (e) => { if (e.pointerType === "mouse") play(id, step); }, onpointerleave: () => stop(id), onfocus: () => play(id, step), onblur: () => stop(id) });

  // Arrow keys move through the tiles and try each one on, as radio buttons do; up and down skip a row in a grid.
  function key(e) {
    const tiles = [...grid.querySelectorAll('.st-face[role="radio"]')], at = tiles.indexOf(document.activeElement);
    if (at < 0) return;
    const cols = tiles.filter((t) => t.offsetTop === tiles[0].offsetTop).length;
    const by = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols < tiles.length ? cols : 1, ArrowUp: cols < tiles.length ? -cols : -1, Home: -at, End: tiles.length - 1 - at }[e.key];
    if (by === undefined) return;
    e.preventDefault();
    const next = tiles[Math.max(0, Math.min(tiles.length - 1, at + by))];
    next.focus();
    next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    onpick(next.dataset.id);
  }

  $effect(() => { onhint?.(hint, shown); });

  // In a row of tiles to swipe through, the current one starts in view.
  onMount(() => {
    const sel = grid.querySelector('[aria-checked="true"], .cz-save:not([aria-disabled="true"])');
    if (!sel || grid.scrollWidth <= grid.clientWidth) return;
    const g = grid.getBoundingClientRect(), r = sel.getBoundingClientRect();
    grid.scrollLeft += r.left - g.left - (g.width - r.width) / 2;
  });

  onDestroy(() => clearInterval(timer));

  function naming(node) {
    node.focus({ preventScroll: true });
    node.select();
  }

  function nameKey(e) {
    if (e.key === "Enter") { e.preventDefault(); onrename(e.currentTarget.value, true); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onrename(null, true); }
  }
</script>

<div class="st-faces" role="radiogroup" tabindex="-1" aria-label={NAME[kind]} bind:this={grid} onkeydown={key}>
  {#each items as [id, label] (id)}
    {@const on = value === id}
    {#if id === editing}
      <div class="st-face cz-naming" class:yours={mine[0]?.id === id}>
        <span class="st-stage" aria-hidden="true"><LookCard look={looks.find((l) => l.id === id)} /></span>
        <input class="cz-name" type="text" value={label} maxlength={LOOK_NAME_MAX} autocomplete="off" spellcheck="false" data-1p-ignore="true" data-lpignore="true" data-form-type="other" aria-label="Name this look" use:naming onkeydown={nameKey} onblur={(e) => onrename(e.currentTarget.value, false)}>
      </div>
    {:else if mine.some((m) => m.id === id)}
      <div class="cz-mine" class:yours={mine[0]?.id === id} class:on>
        {@render tile(id, label, on)}
        <button class="cz-badge cz-badge-edit" type="button" aria-label={"Rename " + label} title="Rename" tabindex={on ? 0 : -1} onclick={() => onedit(id)}>{@html PEN}</button>
        <button class="cz-badge cz-badge-del" type="button" aria-label={"Delete " + label} title="Delete" tabindex={on ? 0 : -1} onclick={() => ondelete(id)}>{@html TRASH}</button>
      </div>
    {:else}
      {@render tile(id, label, on)}
    {/if}
  {/each}
  {#snippet tile(id, label, on)}
    <button class="st-face" class:group={(kind === "backdrop" && BACKDROP_GROUPS.has(id)) || (kind === "face" && FACE_GROUPS.has(id))} type="button" role="radio" data-id={id} aria-checked={String(on)} tabindex={id === tabStop ? 0 : -1} onclick={() => { onpick(id); play(id, step); }} {...hover(id)}>
      {#if kind === "looks"}
        <span class="st-stage" aria-hidden="true"><LookCard look={looks.find((l) => l.id === id)} /></span>
      {:else if kind === "face"}
        <span class="st-stage" aria-hidden="true"><span class="time"><FaceDigits face={id} chars={[...clock(secs[id])]} frac={secs[id] / TOTAL} /></span></span>
      {:else if kind === "ring"}
        {@const frac = secs[id] / TOTAL}
        <span class="st-stage" data-ring={id} aria-hidden="true"><DialRing ring={id} {frac} lit={litTicks(frac)} knob={knobAt(frac)} /></span>
      {:else}
        <span class="st-stage st-swatch" data-backdrop={id} aria-hidden="true"><span class="glow"></span></span>
      {/if}
      <b>{label}</b>
    </button>
  {/snippet}
  {#if kind === "looks" && save}
    {#key mine.length}
      <button class="st-face cz-save" type="button" data-id={SAVE} aria-disabled={String(!save.look)} in:fade={{ duration: calm() ? 0 : 220 }} onclick={() => { if (save.look) save.onsave(); }} {...hover(SAVE)}>
        <span class="st-stage" aria-hidden="true">{#if save.look}<LookCard look={save.look} />{/if}<i class="cz-plus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg></i></span>
        <b>Save look</b>
      </button>
    {/key}
  {/if}
</div>
