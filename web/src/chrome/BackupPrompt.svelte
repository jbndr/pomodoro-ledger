<script>
  import { promptText } from "../lib/backupReminder";
  import { later, nudge, setReminders } from "./backupNudge.svelte";

  let { api } = $props();

  function exportNow() {
    api.exportLedger();
    api.toast("Exported. Keep the file somewhere safe.");
  }

  function off() {
    setReminders(false);
    api.toast("Backup reminders are off. Turn them on in Settings → Data & sync.");
  }
</script>

<div class="banner backup-nudge" id="backupNudge" role="status" hidden={!nudge.shown}>
  <span>{promptText(nudge.memo.at, nudge.now)}</span>
  <span class="acts">
    <button class="btn small solid" type="button" id="backupNow" onclick={exportNow}>Export</button>
    <button class="btn small" type="button" id="backupLater" onclick={later}>Later</button>
    <button class="btn small quiet" type="button" id="backupOff" onclick={off}>Don't remind me</button>
  </span>
</div>
