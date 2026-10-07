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

<section class="st-grp"><h4>Sync</h4><div class="st-card">
  <div class="st-row"><div class="st-lab"><span id="syncTitle">{c.title}</span><small id="syncDetail">{c.detail}</small></div><span class="st-inline" id="syncActs">{#if c.acts === "account"}<span class="st-status" class:live={api.Cloud.state === "live"}></span>{/if}{#if c.acts === "signin"}<a class="st-btn ink" href="/api/sync/login">Sign in</a>{:else if c.acts === "account" && !local}<button class="st-btn" type="button" id="syncOut" onclick={signOut}>Sign out</button>{/if}</span></div>
</div>{#if c.hint}<p class="st-cap" id="syncHint">{c.hint}</p>{/if}</section>

<section class="st-grp" oninput={(e) => e.stopPropagation()}><h4>Backup</h4><div class="st-card">
  <div class="st-row"><div class="st-lab"><span>Export</span><small>Tasks, history, labels and settings in one file{#if !api.DEMO} · <span id="lastBackup">{lastBackup(nudge.memo.at, nudge.now)}</span>{/if}</small></div><button class="st-btn" type="button" id="exportData" disabled={api.DEMO} onclick={exportFile}>Export</button></div>
  <div class="st-row"><div class="st-lab"><span>Import</span><small>Merge or replace from an exported file</small></div><button class="st-btn" type="button" id="importPick" disabled={api.DEMO} onclick={() => fileInput.click()}>Choose file…</button></div>
  <input type="file" id="importFile" accept=".json,application/json" hidden bind:this={fileInput} onchange={choose}>
  {#if picked && plan}
    <div class="st-import" role="region" aria-label="Import preview">
      <p><b>{summary(picked.data)}.</b> <span>{picked.name}{picked.data.exportedAt ? ", exported " + when(picked.data.exportedAt) : ""}.</span>{#if picked.data.skipped} <span>{picked.data.skipped === 1 ? "1 damaged entry" : picked.data.skipped + " damaged entries"} will be skipped.</span>{/if}</p>
      {#if !confirming}
        <span class="st-seg" role="group" aria-label="How to import">
          <button type="button" id="importMerge" aria-pressed={String(mode === "merge")} onclick={() => (mode = "merge")}>Merge</button>
          <button type="button" id="importReplace" aria-pressed={String(mode === "replace")} onclick={() => (mode = "replace")}>Replace</button>
        </span>
        <p class="st-sub">{mode === "replace"
          ? "Makes this browser match the file" + (synced ? ", and your synced devices too" : "") + ". " + plural(plan.removed.length, "task") + " not in the file will be deleted."
          : mergeNote(plan)}</p>
        <div class="st-acts"><button class="st-btn" type="button" onclick={cancel}>Cancel</button><button class="st-btn ink" type="button" id="importRun" onclick={run}>{mode === "merge" ? "Merge" : "Replace…"}</button></div>
      {:else}
        <p class="st-warn" role="alert">Replace everything{synced ? " on all your devices" : " in this browser"}? {plan.removed.length ? "This deletes " + plural(plan.removed.length, "task") + (plan.removed.length === 1 ? " that isn't" : " that aren't") + " in the file" : "This overwrites your tasks with the file"}{picked.data.profile ? " and replaces your settings" : ""}. Export first if you might want them back.</p>
        <div class="st-acts"><button class="st-btn" type="button" id="importBack" onclick={() => (confirming = false)}>Back</button><button class="st-btn danger" type="button" id="importConfirm" onclick={run}>Replace everything</button></div>
      {/if}
    </div>
  {/if}
  <div class="st-row"><div class="st-lab"><span>Remind me to back up</span><small>{kept ? "Not needed while signed in: sync keeps a copy." : "When it's been 30 days since an export"}</small></div><button class="st-tog" type="button" role="switch" id="sBackupRemind" aria-label="Remind me to back up" disabled={api.DEMO || kept} aria-checked={String(!api.DEMO && !kept && !nudge.memo.off)} onclick={() => setReminders(!!nudge.memo.off)}></button></div>
</div>
{#if api.DEMO}<p class="st-cap">The demo can't export or import. Open the app without ?demo=1 to back up your own ledger.</p>
{:else if status}<p class="st-cap" class:st-error={failed} role="status">{status}</p>
{:else}<p class="st-cap">Exported files work in any browser{synced ? " and include everything synced to your account" : ""}.</p>{/if}
</section>
