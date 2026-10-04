<script>
  let { api } = $props();
  let closeBtn;

  export function open() {
    api.setOverlay("#keys", true);
    closeBtn.focus({ preventScroll: true });
  }

  export function close() {
    api.setOverlay("#keys", false);
    document.getElementById("openKeys").focus({ preventScroll: true });
  }
</script>

<!-- Escape is handled by the app-wide keydown handler. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" id="keys" hidden onclick={(e) => { if (e.target.id === "keys") close(); }}>
  <div class="sheet keys-sheet" role="dialog" aria-labelledby="keysH">
    <div class="sec-head"><h2 id="keysH">Keyboard shortcuts</h2><button class="icon-btn" type="button" id="closeKeys" aria-label="Close" bind:this={closeBtn} onclick={close}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="keys-grid">
      <section><h3>Timer</h3><dl>
        <dt><kbd>Space</kbd></dt><dd>Start or pause</dd>
        <dt><kbd>S</kbd></dt><dd>Skip to the next phase</dd>
        <dt><kbd>+</kbd> <kbd>−</kbd></dt><dd>A minute more or less</dd>
        <dt><kbd>F</kbd></dt><dd>Fill the page</dd>
        <dt><kbd>⇧</kbd> <kbd>F</kbd></dt><dd>Full screen</dd>
      </dl></section>
      <section><h3>Tasks</h3><dl>
        <dt><kbd>N</kbd></dt><dd>Quick add a task</dd>
        <dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Move between tasks (or <kbd>J</kbd> <kbd>K</kbd>)</dd>
        <dt><kbd>↵</kbd></dt><dd>Open the task</dd>
        <dt><kbd>Esc</kbd></dt><dd>Close it</dd>
        <dt><kbd>⌥</kbd> <kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Move the task up or down</dd>
        <dt><kbd>⌥</kbd> <kbd>⇧</kbd> <kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Move it to the previous or next section (a day in Upcoming)</dd>
      </dl></section>
      <section><h3>Quick add</h3><dl>
        <dt><kbd>↓</kbd></dt><dd>Add a note (or type <kbd>//</kbd> in the title)</dd>
        <dt><kbd>⌥</kbd> <kbd>D</kbd></dt><dd>Pick when (or type fri, next week)</dd>
        <dt><kbd>⌥</kbd> <kbd>L</kbd></dt><dd>Pick a label (or type #name)</dd>
        <dt><kbd>⌥</kbd> <kbd>1</kbd>–<kbd>9</kbd></dt><dd>Set cycles (or type 2c)</dd>
        <dt><kbd>↵</kbd></dt><dd>Add it and start the next one</dd>
      </dl></section>
      <section><h3>When</h3><dl>
        <dt><kbd>T</kbd></dt><dd>Today</dd>
        <dt><kbd>M</kbd></dt><dd>Tomorrow</dd>
        <dt><kbd>W</kbd></dt><dd>Next week</dd>
        <dt><kbd>L</kbd></dt><dd>Later</dd>
        <dt><kbd>D</kbd></dt><dd>Pick a day…</dd>
      </dl></section>
    </div>
    <p class="hint">Scheduling keys act on the task under the pointer or with keyboard focus, otherwise the one you're working on. <kbd>?</kbd> opens this list.</p>
  </div>
</div>
