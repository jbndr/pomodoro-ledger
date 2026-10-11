<script>
  import { flushSync } from "svelte";
  import { dayKey, keyTime } from "../lib/dates";
  import { decimalComma, rangeOf, RANGES, sheetFileName, sheetRows, timesheet, toCSV, toTSV } from "../lib/timesheet";
  import { labelHue, progressLabelNames } from "../lib/tasks";
  import "./timesheet.css";

  let { api } = $props();

  const KEY = "pl.timesheet";
  const BY = [["task", "By task"], ["day", "By day"]];
  const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  let kind = $state("week"), by = $state("task"), from = $state(""), to = $state(""), filter = $state(""), now = $state(0);
  let all = $state.raw(new Map()), fadeTop = $state(false), fadeBottom = $state(false);
  let sheet, body, back = null;

  const range = $derived(rangeOf(kind, now, { from, to }));
  const data = $derived(timesheet(all, range, filter, by));
  const perLabel = $derived(new Map(timesheet(all, range, "", "task").groups.map((g) => [g.label, g.ms])));
  const name = $derived(filter.startsWith("project:") ? filter.slice(8) : "");

  function span(r, k) {
    if (k === "month" || k === "lastMonth") return api.fmtDate(keyTime(r.from), { month: "long", year: "numeric" });
    const a = keyTime(r.from), b = keyTime(r.to), y = new Date(now).getFullYear();
    const o = new Date(a).getFullYear() !== y || new Date(b).getFullYear() !== y ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" };
    try { return new Intl.DateTimeFormat(undefined, o).formatRange(a, b); } catch { return r.from === r.to ? api.fmtDate(a, o) : api.fmtDate(a, o) + " – " + api.fmtDate(b, o); }
  }
  const dayName = (k) => api.fmtDate(keyTime(k), { weekday: "short", day: "numeric", month: "short" });

  function save() {
    api.ls.set(KEY, { range: kind, by, from, to });
  }

  export function open(f = "") {
    const o = api.ls.get(KEY, null) || {};
    now = Date.now();
    kind = RANGES.some(([k]) => k === o.range) ? o.range : "week";
    by = o.by === "day" ? "day" : "task";
    const r = rangeOf("custom", now, { from: o.from || rangeOf("month", now).from, to: o.to || dayKey(now) });
    from = r.from; to = r.to;
    all = api.viewTasks();
    const names = progressLabelNames(all);
    filter = f === "none" || (f.startsWith("project:") && names.includes(f.slice(8))) ? f : "";
    if (api.overlayHidden()) back = document.activeElement;
    api.setOverlay("#timesheet", true);
    flushSync();
    body.scrollTop = 0;
    sheet.focus({ preventScroll: true });
    edges();
  }

  export function close() {
    api.closePop();
    api.setOverlay("#timesheet", false);
    if (back && back.isConnected) back.focus({ preventScroll: true });
    back = null;
  }

  function edges() {
    if (!body) return;
    fadeTop = body.scrollTop > 2;
    fadeBottom = body.scrollTop + body.clientHeight < body.scrollHeight - 2;
  }

  $effect(() => {
    data;
    edges();
  });

  function show(fn) {
    fn();
    save();
    flushSync();
    body.scrollTop = 0;
    edges();
  }

  function pickRange(e) {
    if (!api.popHidden()) { api.closePop(); return; }
    api.openPop(e.currentTarget, RANGES.map(([k, title]) => ({ id: k, title, meta: k === "custom" ? "" : span(rangeOf(k, now), k) })), kind, (k) => show(() => (kind = k)));
  }

  function pickLabel(e) {
    if (!api.popHidden()) { api.closePop(); return; }
    const meta = (ms) => (ms ? api.fmtDur(ms) : "");
    const labels = progressLabelNames(all).filter((n) => filter === "project:" + n || !api.labelHidden(n))
      .sort((a, b) => (perLabel.get(b) || 0) - (perLabel.get(a) || 0) || a.localeCompare(b))
      .map((n) => ({ id: "project:" + n, title: n, hue: labelHue(n), meta: meta(perLabel.get(n) || 0) }));
    const total = [...perLabel.values()].reduce((a, b) => a + b, 0);
    api.openPop(e.currentTarget, [{ id: "", title: "All labels", meta: meta(total) }, ...labels, { id: "none", title: "No label", none: true, meta: meta(perLabel.get("") || 0) }], filter, (v) => show(() => (filter = v)));
  }

  const comma = () => decimalComma(navigator.language);

  async function copy() {
    const rows = sheetRows(data, by, comma());
    try {
      await navigator.clipboard.writeText(toTSV(rows));
      api.toast("Copied " + api.plural(rows.length - 1, "row") + ". Paste them into a spreadsheet.");
    } catch {
      api.toast("Couldn't copy. Download the CSV instead.");
    }
  }

  function download() {
    const c = comma(), url = URL.createObjectURL(new Blob(["﻿" + toCSV(sheetRows(data, by, c), c)], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: sheetFileName(filter, range) });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // The app's shortcuts stay out while the sheet is open.
  function keydown(e) {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); close(); }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="overlay" id="timesheet" hidden role="presentation" onclick={(e) => { if (e.target === e.currentTarget) close(); }} onkeydown={keydown}>
  <div class="ts-sheet" role="dialog" aria-modal="true" aria-labelledby="tsH" tabindex="-1" bind:this={sheet}>
    <div class="ts-top">
      <div class="ts-head"><h2 id="tsH">Timesheet</h2><span class="ts-span">{span(range, kind)}</span></div>
      <button class="st-x" type="button" aria-label="Close timesheet" onclick={close}>{@html svg('<path d="M6 6l12 12M18 6L6 18"/>')}</button>
    </div>
    <div class="ts-ctl">
      <div class="st-seg ts-range" role="group" aria-label="Range">
        {#each RANGES as [k, title] (k)}<button type="button" aria-pressed={String(kind === k)} onclick={() => show(() => (kind = k))}>{title}</button>{/each}
      </div>
      <div class="ts-row">
        <button class="btn small ts-menu ts-range-menu" type="button" data-move aria-haspopup="listbox" aria-label={"Range: " + RANGES.find(([k]) => k === kind)[1]} onclick={pickRange}><span>{RANGES.find(([k]) => k === kind)[1]}</span>{@html api.ICON.chev}</button>
        <button class="btn small ts-menu" type="button" data-move aria-haspopup="listbox" aria-label={"Label: " + (name || (filter === "none" ? "No label" : "All labels"))} onclick={pickLabel}>
          {#if name}<i class="label-dot" style:--h={labelHue(name)}></i><span>{name}</span>{:else if filter === "none"}<i class="label-dot none"></i><span>No label</span>{:else}<span>All labels</span>{/if}
          {@html api.ICON.chev}
        </button>
        <span class="ts-gap"></span>
        <div class="st-seg" role="group" aria-label="Group">
          {#each BY as [k, title] (k)}<button type="button" aria-pressed={String(by === k)} onclick={() => show(() => (by = k))}>{title}</button>{/each}
        </div>
      </div>
      <div class="st-fold ts-custom" class:open={kind === "custom"}><div>
        <div class="ts-dates">
          <label><span>From</span><input class="st-time" type="date" bind:value={from} onchange={save} tabindex={kind === "custom" ? 0 : -1}></label>
          <label><span>To</span><input class="st-time" type="date" bind:value={to} onchange={save} tabindex={kind === "custom" ? 0 : -1}></label>
        </div>
      </div></div>
    </div>
    <div class="st-body ts-body" class:fade-top={fadeTop} class:fade-bottom={fadeBottom} bind:this={body} onscroll={edges}>
      {#if data.groups.length}
        {#each data.groups as g (g.key)}
          <section class="st-grp">
            <h4 class="ts-gh">
              {#if by === "task"}<span class="ts-name"><i class="label-dot" class:none={!g.label} style:--h={g.label ? labelHue(g.label) : null}></i><span>{g.label || "No label"}</span></span>{:else}<span class="ts-name"><span>{dayName(g.day)}</span></span>{/if}
              <b>{api.fmtDur(g.ms)}</b>
            </h4>
            <div class="st-card">
              {#each g.rows as r (r.key)}
                <div class="ts-item">
                  <span class="ts-name">{#if by === "day"}<i class="label-dot" class:none={!r.label} style:--h={r.label ? labelHue(r.label) : null}></i>{/if}<span>{r.title}</span></span>
                  <span class="ts-time">{api.fmtDur(r.ms)}</span>
                </div>
              {/each}
            </div>
          </section>
        {/each}
      {:else}
        <div class="empty ts-empty"><strong>No focus in this range</strong><span>Pick another range{filter ? " or label" : ""} to see where your time went.</span></div>
      {/if}
    </div>
    <div class="ts-foot">
      <span class="ts-total"><span>Total</span><b>{api.fmtDur(data.ms)}</b></span>
      <button class="st-btn" type="button" disabled={!data.groups.length} onclick={copy}>{@html svg('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>')}Copy table</button>
      <button class="st-btn ink" type="button" disabled={!data.groups.length} onclick={download}>{@html svg('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/>')}Download CSV</button>
    </div>
  </div>
</div>
