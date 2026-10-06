<script>
  import { flushSync } from "svelte";
  import { choose, cleanName, deleteMix, MAX_LAYERS, MAX_SAVED, matchMix, mixCode, NAME_MAX, phaseMix, PRESETS, renameMix, SAME, saveMix, savedMixes, SCAPE_NAME, setLevel, storedChoice, toggleLayer } from "../lib/mix";
  import { SCAPES, scapeVolume } from "../lib/soundscape";

  let { api, version, onsave, onresize } = $props();

  const svg = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  const ICONS = {
    rain: svg('<path d="M7.5 14.5h9.2a3.3 3.3 0 0 0 .3-6.6 5 5 0 0 0-9.6.9 2.9 2.9 0 0 0 .1 5.7z"/><path d="M9 17.5l-.9 2M12.6 17.5l-.9 2M16.2 17.5l-.9 2"/>'),
    ocean: svg('<path d="M3 9.5c1.5 0 1.5-1.5 3-1.5s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/><path d="M3 15c1.5 0 1.5-1.5 3-1.5s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/>'),
    fire: svg('<path d="M12 3.5c.6 2.9 5 4.9 5 9.6a5 5 0 0 1-10 0c0-2.1 1-3.6 2.2-4.6.2 1.7 1.1 2.7 2.2 3C11 9 11.2 6 12 3.5z"/><path d="M12 20.5a2.2 2.2 0 0 1-2.2-2.2c0-1.3 1.1-2.2 2.2-3.3 1.1 1.1 2.2 2 2.2 3.3a2.2 2.2 0 0 1-2.2 2.2z"/>'),
    brown: svg('<path d="M4 11v2M7.2 8.5v7M10.4 5.5v13M13.6 8v8M16.8 6.5v11M20 10v4"/>'),
  };
  const TINT = { rain: "oklch(62% .12 245)", ocean: "oklch(64% .1 200)", fire: "oklch(68% .16 50)", brown: "oklch(58% .06 55)" };
  const PLUS = svg('<path d="M12 5v14M5 12h14"/>');
  const SPK_LO = svg('<path d="M5 10v4h3l4.5 3.5v-11L8 10z"/>'), SPK_HI = svg('<path d="M4 10v4h3l4.5 3.5v-11L7 10z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/>');

  let phase = $state("focus"), rev = $state(0), naming = $state(null), auditioning = $state(false), building = $state(false), nameEl = $state();
  let auditionEnd = 0;

  const v = $derived.by(() => {
    version; rev;
    const st = api.S.settings, mine = savedMixes(st.scapeMixes), layers = phaseMix(st, phase), match = matchMix(layers, [...PRESETS, ...mine]);
    const same = phase === "break" && storedChoice(st, "break") === SAME;
    return {
      layers, mine, match, same, own: !!match && mine.includes(match),
      sel: same ? SAME : building && !match ? "new" : !layers.length ? "off" : match ? match.id : "",
      on: { focus: phaseMix(st, "focus").length > 0, break: phaseMix(st, "break").length > 0 },
      volume: scapeVolume(st.soundscapeVolume),
    };
  });
  const full = $derived(v.layers.length >= MAX_LAYERS);
  const foot = $derived(building && !v.layers.length ? "Slide up to three sounds, then save it with a name."
    : building && !v.match ? "Set each level, then save it."
    : v.same ? "Follows your focus mix." : !v.layers.length ? "Silence. Pick a mix or slide a sound." : v.own ? "Your mix" : v.match ? "Preset" : "Your own blend, not saved yet");

  $effect(() => { version; auditioning = false; });
  $effect(() => { v.mine.length; naming; onresize?.(); });

  function persist() {
    rev++;
    api.Store.saveSettings(); api.syncTicking(); onsave();
    if (auditioning) audition();
  }

  const commit = (code) => { choose(api.S.settings, phase, code); persist(); };

  function pick(id) {
    naming = null; building = id === "new";
    if (id === "off" || id === "new") commit("");
    else if (id === SAME) commit(SAME);
    else { const m = [...PRESETS, ...v.mine].find((c) => c.id === id); if (m) commit(m.mix); }
  }

  const toggle = (kind) => commit(mixCode(toggleLayer(v.layers, kind)));

  // A slider turns its sound on as it moves up and off again at zero.
  function slide(kind, value) {
    const n = +value, has = v.layers.some((l) => l.kind === kind);
    if (!n) { if (has) toggle(kind); return; }
    commit(mixCode(setLevel(has ? v.layers : toggleLayer(v.layers, kind), kind, n)));
  }

  function volume(value) {
    api.S.settings.soundscapeVolume = scapeVolume(value);
    persist();
  }

  function audition() {
    if (!v.layers.length || !v.volume || api.scapePlaying()) { stop(); return; }
    api.previewSoundscape(v.layers);
    auditioning = true; auditionEnd = Date.now() + 8000;
    setTimeout(() => { if (Date.now() >= auditionEnd) auditioning = false; }, 8050);
  }

  function stop() { auditioning = false; api.cancelScapePreview(); }

  function preview() {
    if (auditioning) { stop(); return; }
    if (!v.layers.length) { api.toast("Pick a mix or slide a sound up first."); return; }
    if (api.scapePlaying()) { api.toast("The soundscape is already playing with your timer."); return; }
    audition();
  }

  function setPhase(p) { phase = p; naming = null; building = false; stop(); }

  function name(id) {
    naming = { id, name: id ? v.match.name : "" };
    flushSync(); nameEl?.focus();
  }

  function saveName() {
    const n = cleanName(naming.name);
    if (!n) { nameEl?.focus(); return; }
    const list = naming.id ? renameMix(v.mine, naming.id, n) : saveMix(v.mine, n, v.layers);
    if (list === v.mine && !naming.id) { api.toast("You can keep up to " + MAX_SAVED + " mixes. Delete one to save another."); return; }
    api.S.settings.scapeMixes = list; naming = null; building = false;
    persist();
  }

  function remove() {
    const m = v.match;
    api.S.settings.scapeMixes = deleteMix(v.mine, m.id);
    persist();
    api.toast("Deleted “" + m.name + "”. The sounds keep playing as your own blend.");
  }

  function nameKey(e) {
    if (e.key === "Enter") { e.preventDefault(); saveName(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); naming = null; }
  }
</script>

<div class="st-mix-top">
  <span class="st-seg" role="group" aria-label="Soundscape for">
    {#each [["focus", "During focus"], ["break", "During breaks"]] as [p, label] (p)}<button type="button" aria-pressed={String(phase === p)} onclick={() => setPhase(p)}><i class="st-dot" class:on={v.on[p]}></i>{label}</button>{/each}
  </span>
  <button class="st-btn" class:playing={auditioning} type="button" id="testScape" onclick={preview}><span class="st-eq" aria-hidden="true"><i></i><i></i><i></i></span>{auditioning ? "Stop" : "Preview"}</button>
</div>
<section class="st-grp"><h4>Mix</h4><div class="st-card">
  <div class="st-chips" role="radiogroup" aria-label={phase === "focus" ? "Mix during focus" : "Mix during breaks"}>
    {#snippet chip(id, label)}<button class="st-chip" type="button" role="radio" aria-checked={String(v.sel === id)} onclick={() => pick(id)}>{label}</button>{/snippet}
    {@render chip("off", "Off")}
    {#if phase === "break"}{@render chip(SAME, "Same as focus")}{/if}
    {#each PRESETS as m (m.id)}{@render chip(m.id, m.name)}{/each}
    <span class="st-chip-break"></span><span class="st-chip-sep">Yours</span>
    {#each v.mine as m (m.id)}{@render chip(m.id, m.name)}{/each}
    <button class="st-chip st-chip-new" type="button" role="radio" aria-checked={String(v.sel === "new")} onclick={() => pick("new")}>{@html PLUS}New mix</button>
  </div>
  <div class="st-sounds">
    {#each SCAPES as k (k)}
      {@const l = v.layers.find((x) => x.kind === k)}
      <div class="st-snd" class:on={!!l} style:--c={TINT[k]}>
        <button type="button" aria-pressed={String(!!l)} disabled={!l && full} title={!l && full ? "Up to three sounds at once" : null} onclick={() => toggle(k)}>
          <span class="st-snd-top">{@html ICONS[k]}<em>{l ? l.level + "%" : full ? "Max 3" : "Off"}</em></span>
          <b>{SCAPE_NAME[k]}</b>
        </button>
        <input class="st-range" type="range" min="0" max="100" step="1" value={l ? l.level : 0} style:--v="{l ? l.level : 0}%" disabled={!l && full} aria-label="{SCAPE_NAME[k]} level" oninput={(e) => slide(k, e.currentTarget.value)}>
      </div>
    {/each}
  </div>
  {#if naming}
    <div class="st-mix-foot naming">
      <input class="st-text" type="text" name="pl-mix-name" maxlength={NAME_MAX} autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-form-type="other" aria-label="Mix name" placeholder="Name this mix" bind:value={naming.name} bind:this={nameEl} onkeydown={nameKey}>
      <span class="st-acts"><button class="st-btn" type="button" onclick={() => (naming = null)}>Cancel</button><button class="st-btn ink" type="button" onclick={saveName}>{naming.id ? "Rename" : "Save"}</button></span>
    </div>
  {:else}
    <div class="st-mix-foot">
      <span>{foot}</span>
      <span class="st-acts">
        {#if v.own && !v.same}<button class="st-link" type="button" onclick={() => name(v.match.id)}>Rename</button><button class="st-link" type="button" onclick={remove}>Delete</button>
        {:else if v.layers.length && !v.match && !v.same}<button class="st-btn" type="button" id="saveMix" onclick={() => name("")}>{@html PLUS}Save as a mix</button>{/if}
      </span>
    </div>
  {/if}
</div><p class="st-cap">To make your own: New mix, then slide up to three sounds to the level you like and save it. Slide one to zero to turn it off.</p></section>
<section class="st-grp"><div class="st-card">
  <div class="st-row"><div class="st-lab"><span>Volume</span></div><span class="st-vol st-vol-wide">{@html SPK_LO}<input class="st-range" type="range" id="sScapeVolume" min="0" max="100" step="1" aria-label="Soundscape volume" value={v.volume} style:--v="{v.volume}%" oninput={(e) => volume(e.currentTarget.value)}>{@html SPK_HI}<output>{v.volume}%</output></span></div>
</div></section>
