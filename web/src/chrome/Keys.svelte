<script>
  let { api } = $props();
  let sheet;

  export function open() {
    api.setOverlay("#keys", true);
    sheet.focus({ preventScroll: true });
  }

  export function close() {
    api.setOverlay("#keys", false);
    document.getElementById("openKeys").focus({ preventScroll: true });
  }
</script>

<!-- Escape is handled by the app-wide keydown handler. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" id="keys" hidden onclick={(e) => { if (e.target.id === "keys") close(); }}>
  <div class="sheet keys-sheet" role="dialog" aria-labelledby="keysH" tabindex="-1" bind:this={sheet}>
    <div class="sec-head"><h2 id="keysH">Keyboard shortcuts</h2><button class="icon-btn" type="button" id="closeKeys" aria-label="Close" onclick={close}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <button class="keys-lead" type="button" onclick={api.openPalette}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><span>Search every action and task</span><span class="keys-lead-k"><kbd>{api.MOD}</kbd> <kbd>K</kbd></span></button>
    <div class="keys-grid">
      <section><h3>Timer</h3><dl>
        <dt><kbd>Space</kbd></dt><dd><span>Start or pause</span></dd>
        <dt><kbd>S</kbd></dt><dd><span>Skip to the next phase</span></dd>
        <dt><kbd>+</kbd> <kbd>−</kbd></dt><dd><span>A minute more or less</span></dd>
        <dt><kbd>F</kbd></dt><dd><span>Fill the page</span></dd>
        <dt><kbd>⇧</kbd> <kbd>F</kbd></dt><dd><span>Full screen</span></dd>
      </dl></section>
      <section><h3>Tasks</h3><dl>
        <dt><kbd>N</kbd></dt><dd><span>Quick add a task</span></dd>
        <dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd><span>Move between tasks (or <kbd>J</kbd> <kbd>K</kbd>)</span></dd>
        <dt><kbd>↵</kbd></dt><dd><span>Open the task</span></dd>
        <dt><kbd>Esc</kbd></dt><dd><span>Close it</span></dd>
        <dt><kbd>⌥</kbd> <kbd>↑</kbd> <kbd>↓</kbd></dt><dd><span>Move the task up or down</span></dd>
        <dt><kbd>⌥</kbd> <kbd>⇧</kbd> <kbd>↑</kbd> <kbd>↓</kbd></dt><dd><span>Move it to the previous or next section (a day in Upcoming)</span></dd>
        <dt><kbd>P</kbd></dt><dd><span>Plan the week</span></dd>
      </dl></section>
      <section><h3>Quick add</h3><dl>
        <dt><kbd>↓</kbd></dt><dd><span>Add a note (or type <kbd>//</kbd> in the title)</span></dd>
        <dt><kbd>⌥</kbd> <kbd>D</kbd></dt><dd><span>Pick when (or type fri, next week)</span></dd>
        <dt><kbd>⌥</kbd> <kbd>L</kbd></dt><dd><span>Pick a label (or type #name)</span></dd>
        <dt><kbd>⌥</kbd> <kbd>1</kbd>–<kbd>9</kbd></dt><dd><span>Set cycles (or type 2c)</span></dd>
        <dt><kbd>↵</kbd></dt><dd><span>Add it and start the next one</span></dd>
      </dl></section>
      <section><h3>When</h3><dl>
        <dt><kbd>T</kbd></dt><dd><span>Today</span></dd>
        <dt><kbd>M</kbd></dt><dd><span>Tomorrow</span></dd>
        <dt><kbd>W</kbd></dt><dd><span>Next week</span></dd>
        <dt><kbd>L</kbd></dt><dd><span>Later</span></dd>
        <dt><kbd>D</kbd></dt><dd><span>Pick a day…</span></dd>
      </dl></section>
    </div>
    <p class="hint">Scheduling keys act on the task under the pointer or with keyboard focus, otherwise the one you're working on. <kbd>?</kbd> opens this list.</p>
  </div>
</div>
