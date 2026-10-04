<script>
  import { flushSync } from "svelte";
  import { choose, cleanName, deleteMix, MAX_LAYERS, MAX_SAVED, matchMix, mixCode, mixLabel, NAME_MAX, phaseMix, PRESETS, renameMix, SAME, saveMix, savedMixes, SCAPE_NAME, setLevel, storedChoice, toggleLayer } from "../lib/mix";
  import { SCAPES, scapeVolume } from "../lib/soundscape";

  let { api, version, onsave } = $props();

  const PHASES = [["focus", "Focus"], ["break", "Breaks"]];
  const svg = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  const ICONS = {
    rain: svg('<path d="M7.5 14.5h9.2a3.3 3.3 0 0 0 .3-6.6 5 5 0 0 0-9.6.9 2.9 2.9 0 0 0 .1 5.7z"/><path d="M9 17.5l-.9 2M12.6 17.5l-.9 2M16.2 17.5l-.9 2"/>'),
    ocean: svg('<path d="M3 9.5c1.5 0 1.5-1.5 3-1.5s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/><path d="M3 15c1.5 0 1.5-1.5 3-1.5s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/>'),
    fire: svg('<path d="M12 3.5c.6 2.9 5 4.9 5 9.6a5 5 0 0 1-10 0c0-2.1 1-3.6 2.2-4.6.2 1.7 1.1 2.7 2.2 3C11 9 11.2 6 12 3.5z"/><path d="M12 20.5a2.2 2.2 0 0 1-2.2-2.2c0-1.3 1.1-2.2 2.2-3.3 1.1 1.1 2.2 2 2.2 3.3a2.2 2.2 0 0 1-2.2 2.2z"/>'),
    brown: svg('<path d="M4 11v2M7.2 8.5v7M10.4 5.5v13M13.6 8v8M16.8 6.5v11M20 10v4"/>'),
  };

  let phase = $state("focus"), rev = $state(0), naming = $state(null), auditioning = $state(false), nameEl = $state();
  let auditionEnd = 0;

  const v = $derived.by(() => {
    version; rev;
    const st = api.S.settings, mine = savedMixes(st.scapeMixes), layers = phaseMix(st, phase), match = matchMix(layers, [...PRESETS, ...mine]);
    const same = phase === "break" && storedChoice(st, "break") === SAME;
    return {
      layers, mine, match, own: !!match && mine.includes(match),
      sel: same ? SAME : !layers.length ? "off" : match ? match.id : "",
      choices: [{ id: "off", name: "Off" }, ...(phase === "break" ? [{ id: SAME, name: "Same as focus" }] : []), ...PRESETS, ...mine],
      on: { focus: phaseMix(st, "focus").length > 0, break: phaseMix(st, "break").length > 0 },
      summary: "Focus: " + mixLabel(st, "focus") + " · Breaks: " + mixLabel(st, "break"),
      volume: scapeVolume(st.soundscapeVolume),
    };
  });
  const full = $derived(v.layers.length >= MAX_LAYERS);

  $effect(() => { version; auditioning = false; });

  function persist() {
    rev++;
    api.Store.saveSettings(); api.syncTicking(); onsave();
    if (auditioning) audition();
  }

  const commit = (code) => { choose(api.S.settings, phase, code); persist(); };

  function pick(id) {
    naming = null;
    if (id === "off" || id === SAME) commit(id === SAME ? SAME : "");
    else { const m = v.choices.find((c) => c.id === id); if (m) commit(m.mix); }
  }

  const toggle = (kind) => commit(mixCode(toggleLayer(v.layers, kind)));
  const level = (kind, value) => commit(mixCode(setLevel(v.layers, kind, +value)));

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
    if (!v.layers.length) { api.toast("Pick a mix or turn on a sound first."); return; }
    if (api.scapePlaying()) { api.toast("The soundscape is already playing with your timer."); return; }
    audition();
  }

  function name(id) {
    naming = { id, name: id ? v.match.name : "" };
    flushSync(); nameEl?.focus();
  }

  function saveName() {
    const n = cleanName(naming.name);
    if (!n) { nameEl?.focus(); return; }
    const list = naming.id ? renameMix(v.mine, naming.id, n) : saveMix(v.mine, n, v.layers);
    if (list === v.mine && !naming.id) { api.toast("You can keep up to " + MAX_SAVED + " mixes. Delete one to save another."); return; }
    api.S.settings.scapeMixes = list; naming = null;
    persist();
  }

  function remove() {
    const m = v.match;
    api.S.settings.scapeMixes = deleteMix(v.mine, m.id);
    persist();
    api.toast("Deleted “" + m.name + "”. The sounds keep playing as a custom mix.");
  }

  function nameKey(e) {
    if (e.key === "Enter") { e.preventDefault(); saveName(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); naming = null; }
  }
</script>

<div class="toggle"><span id="sScapeLabel">Soundscape<small>{v.summary}</small></span><span class="acts"><button class="btn small" type="button" id="testScape" onclick={preview}>{auditioning ? "Stop" : "Preview"}</button></span></div>
<div class="mixer" role="group" aria-labelledby="sScapeLabel" oninput={(e) => e.stopPropagation()}>
  <div class="seg-ctl" role="radiogroup" aria-label="Soundscape for">
    {#each PHASES as [p, label] (p)}<label><input type="radio" name="sScapePhase" value={p} bind:group={phase} onchange={() => (naming = null)}>{label}<i class="mix-dot" class:on={v.on[p]} aria-hidden="true"></i></label>{/each}
  </div>
  <div class="mix-chips" role="radiogroup" aria-label={phase === "focus" ? "Mix during focus" : "Mix during breaks"}>
    {#each v.choices as c (c.id)}<label><input type="radio" name="sMix" value={c.id} checked={v.sel === c.id} onchange={() => pick(c.id)}>{c.name}</label>{/each}
  </div>
  <div class="scape-tiles">
    {#each SCAPES as k (k)}
      {@const l = v.layers.find((x) => x.kind === k)}
      <div class="scape-tile" class:on={!!l}>
        <button type="button" aria-pressed={String(!!l)} disabled={!l && full} title={!l && full ? "Up to three sounds at once" : null} onclick={() => toggle(k)}>
          <span class="tile-top">{@html ICONS[k]}<em>{l ? l.level + "%" : full ? "Max 3" : "Off"}</em></span>
          <span class="tile-name">{SCAPE_NAME[k]}</span>
        </button>
        <input type="range" min="5" max="100" step="1" value={l ? l.level : 5} disabled={!l} aria-label="{SCAPE_NAME[k]} level" oninput={(e) => level(k, e.currentTarget.value)}>
      </div>
    {/each}
  </div>
  {#if naming}
    <div class="mix-foot naming">
      <input type="text" name="pl-mix-name" maxlength={NAME_MAX} autocomplete="off" data-bwignore="true" data-1p-ignore="true" data-lpignore="true" data-form-type="other" aria-label="Mix name" placeholder="Name this mix" bind:value={naming.name} bind:this={nameEl} onkeydown={nameKey}>
      <button class="btn small" type="button" onclick={() => (naming = null)}>Cancel</button>
      <button class="btn small solid" type="button" onclick={saveName}>{naming.id ? "Rename" : "Save"}</button>
    </div>
  {:else}
    <div class="mix-foot">
      <span>{v.sel === SAME ? "Follows your focus mix." : !v.layers.length ? "Turn on up to three sounds." : v.own ? "Your mix" : v.match ? "Preset" : "Unsaved mix"}</span>
      {#if v.own && v.sel !== SAME}
        <span class="acts"><button class="btn small quiet" type="button" onclick={() => name(v.match.id)}>Rename</button><button class="btn small quiet" type="button" onclick={remove}>Delete</button></span>
      {:else if v.layers.length && !v.match && v.sel !== SAME}
        <button class="btn small" type="button" onclick={() => name("")}>Save mix</button>
      {/if}
    </div>
  {/if}
  <label class="field"><span class="field-head">Volume<span id="scapeVolumeValue">{v.volume}%</span></span><input type="range" id="sScapeVolume" min="0" max="100" step="1" aria-label="Soundscape volume" value={v.volume} oninput={(e) => volume(e.currentTarget.value)}></label>
</div>
