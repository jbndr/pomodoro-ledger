<script>
  import { nudgesOf, RHYTHMS } from "../lib/nudges";

  let { api, version = 0 } = $props();
  let list = $state([]), draft = $state("");

  // Re-read whenever settings arrive or the sheet opens.
  $effect(() => { version; list = nudgesOf(api.S.settings.nudges).map((n) => ({ ...n })); });

  function save() {
    api.S.settings.nudges = list.map(({ id, text, every, on, preset }) => ({ id, text: text.trim(), every, on, ...(preset ? { preset } : {}) }));
    api.Store.saveSettings();
  }

  function add() {
    const text = draft.trim().slice(0, 60);
    if (!text) return;
    list.push({ id: "n" + Date.now().toString(36), text, every: "break", on: true });
    draft = "";
    save();
  }

  function remove(id) { list = list.filter((n) => n.id !== id); save(); }
</script>

<!-- Its own saves, so typing here doesn't run the sheet's field handler. -->
<fieldset class="group" oninput={(e) => e.stopPropagation()}>
  <legend>Break nudges</legend>
  <div class="card nudge-list">
    {#each list as n (n.id)}
      <div class="toggle nudge-row">
        <span class="nudge-copy">{n.text}
          <select aria-label={"How often: " + n.text} bind:value={n.every} onchange={save}>{#each RHYTHMS as [v, name] (v)}<option value={v}>{name}</option>{/each}</select>
        </span>
        {#if !n.preset}<button class="icon-btn" type="button" aria-label={"Remove " + n.text} title="Remove" onclick={() => remove(n.id)}>{@html api.ICON.trash}</button>{/if}
        <input type="checkbox" aria-label={n.text} bind:checked={n.on} onchange={save}>
      </div>
    {/each}
  </div>
  <div class="nudge-add">
    <input type="text" maxlength="60" placeholder="Add your own, like 5 push-ups" aria-label="New break nudge" bind:value={draft} onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}>
    <button class="btn small" type="button" onclick={add}>Add</button>
  </div>
  <p class="hint">One quiet nudge shows during a break, under the time. Tap it when you've done it; the weekly recap counts them.</p>
</fieldset>
