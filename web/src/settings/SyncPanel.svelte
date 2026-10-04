<script>
  import { flushSync } from "svelte";
  import { nudge, setReminders, signedIn } from "../chrome/backupNudge.svelte";
  import { parseFile, summary } from "../lib/backup";
  import { lastBackup } from "../lib/backupReminder";
  import { syncCopy } from "../lib/settings";

  let { api, version } = $props();

  const c = $derived.by(() => {
    version;
    const { Cloud, S } = api;
    return syncCopy(Cloud.state, Cloud.state === "off" && S.storeMode === "db", Cloud.email);
  });
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

  let picked = $state(null);
  let mode = $state("merge");
  let confirming = $state(false);
  let status = $state("");
  let failed = $state(false);
  let fileInput;

  const plan = $derived.by(() => { version; return picked ? api.backup.planImport(picked.data, mode) : null; });
  const synced = $derived.by(() => { version; return !!api.Cloud.email; });
  const kept = $derived.by(() => { version; return signedIn(); });

  function signOut() {
    api.ls.set("pl.syncEmail", "");
    location.href = "/cdn-cgi/access/logout";
  }

  function say(msg, bad = false) { status = msg; failed = bad; }

  function exportFile() {
    api.backup.exportLedger();
    say("Exported. Keep the file somewhere safe.");
  }

  async function choose(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    picked = null; confirming = false; mode = "merge";
    if (file.size > 50 * 1024 * 1024) return say("This file is too large to be an export.", true);
    const r = parseFile(await file.text());
    if (!r.ok) return say(r.error, true);
    say("");
    picked = { name: file.name, data: r.data };
    flushSync();
    document.getElementById("importMerge")?.focus();
  }

  function cancel() {
    picked = null; confirming = false;
    say("");
    document.getElementById("importPick")?.focus();
  }

  function run() {
    if (mode === "replace" && !confirming) { confirming = true; flushSync(); document.getElementById("importBack")?.focus(); return; }
    const r = api.backup.importLedger(picked.data, mode);
    picked = null; confirming = false;
    say(mode === "replace"
      ? "Replaced. This browser now has " + plural(r.tasks.size, "task") + " from the file."
      : r.added || r.updated || r.profileChanged ? "Merged. " + plural(r.added, "new task") + ", " + r.updated + " updated." : "Nothing new: everything in the file is already here.");
    api.toast(mode === "replace" ? "Import done. Everything now matches the file." : "Import done.");
    document.getElementById("importPick")?.focus();
  }

  function mergeNote(p) {
    const what = [p.added && "adds " + plural(p.added, "new task"), p.updated && "updates " + plural(p.updated, "task")].filter(Boolean).join(" and ");
    const settings = !picked.data.profile ? "" : p.settingsFromFile ? " Settings come from the file." : " Your settings here are newer, so they stay.";
    if (!what && !p.profileChanged) return "Everything in this file is already here.";
    return (what ? what[0].toUpperCase() + what.slice(1) + ". " : "") + "Newer copies win, all history is kept, and nothing here is deleted." + settings;
  }

  const when = (t) => (t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
</script>

<div class="group">
  <div class="card">
    <div class="toggle sync-row"><span><b id="syncTitle">{c.title}</b><small id="syncDetail">{c.detail}</small></span><span class="acts" id="syncActs">{#if c.acts === "signin"}<a class="btn small solid" href="/api/sync/login">Sign in</a>{:else if c.acts === "account" && !local}<button class="btn small" type="button" id="syncOut" onclick={signOut}>Sign out</button>{/if}</span></div>
  </div>
  {#if c.hint}<p class="hint" id="syncHint">{c.hint}</p>{/if}
</div>

<fieldset class="group backup" oninput={(e) => e.stopPropagation()}>
  <legend>Backup</legend>
  <div class="card">
    <div class="toggle"><span>Export<small>Tasks, history, labels and settings in one file</small>{#if !api.DEMO}<small id="lastBackup">{lastBackup(nudge.memo.at, nudge.now)}</small>{/if}</span><span class="acts"><button class="btn small" type="button" id="exportData" disabled={api.DEMO} onclick={exportFile}>Export</button></span></div>
    <label class="toggle"><span>Remind me to back up<small>{kept ? "Not needed while signed in: sync keeps a copy." : "When it's been 30 days since an export"}</small></span><input type="checkbox" id="sBackupRemind" disabled={api.DEMO || kept} checked={!api.DEMO && !kept && !nudge.memo.off} onchange={(e) => setReminders(e.currentTarget.checked)}></label>
    <div class="toggle"><span>Import<small>Merge or replace from an exported file</small></span><span class="acts"><button class="btn small" type="button" id="importPick" disabled={api.DEMO} onclick={() => fileInput.click()}>Choose file…</button></span></div>
    <input type="file" id="importFile" accept=".json,application/json" hidden bind:this={fileInput} onchange={choose}>
    {#if picked && plan}
      <div class="import-preview" role="region" aria-label="Import preview">
        <p><b>{summary(picked.data)}.</b> <span>{picked.name}{picked.data.exportedAt ? ", exported " + when(picked.data.exportedAt) : ""}.</span>{#if picked.data.skipped} <span>{picked.data.skipped === 1 ? "1 damaged entry" : picked.data.skipped + " damaged entries"} will be skipped.</span>{/if}</p>
        {#if !confirming}
          <div class="seg" role="radiogroup" aria-label="How to import">
            <button type="button" role="radio" id="importMerge" aria-checked={String(mode === "merge")} onclick={() => (mode = "merge")}>Merge</button>
            <button type="button" role="radio" id="importReplace" aria-checked={String(mode === "replace")} onclick={() => (mode = "replace")}>Replace</button>
          </div>
          <p class="sub">{mode === "replace"
            ? "Makes this browser match the file" + (synced ? ", and your synced devices too" : "") + ". " + plural(plan.removed.length, "task") + " not in the file will be deleted."
            : mergeNote(plan)}</p>
          <div class="import-acts"><button class="btn small" type="button" onclick={cancel}>Cancel</button><button class="btn small solid" type="button" id="importRun" onclick={run}>{mode === "merge" ? "Merge" : "Replace…"}</button></div>
        {:else}
          <p class="import-warn" role="alert">Replace everything{synced ? " on all your devices" : " in this browser"}? {plan.removed.length ? "This deletes " + plural(plan.removed.length, "task") + (plan.removed.length === 1 ? " that isn't" : " that aren't") + " in the file" : "This overwrites your tasks with the file"}{picked.data.profile ? " and replaces your settings" : ""}. Export first if you might want them back.</p>
          <div class="import-acts"><button class="btn small" type="button" id="importBack" onclick={() => (confirming = false)}>Back</button><button class="btn small danger" type="button" id="importConfirm" onclick={run}>Replace everything</button></div>
        {/if}
      </div>
    {/if}
  </div>
  {#if api.DEMO}<p class="hint">The demo can't export or import. Open the app without ?demo=1 to back up your own ledger.</p>
  {:else if status}<p class="hint" class:import-error={failed} role="status">{status}</p>
  {:else}<p class="hint">Exported files work in any browser{synced ? " and include everything synced to your account" : ""}.</p>{/if}
</fieldset>
