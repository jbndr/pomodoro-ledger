<script>
  import { tick } from "svelte";
  let { api, row, card, start } = $props();
  let notesTimer = 0, linking = $state(false), linkEl = $state();

  function notesInput(e) {
    clearTimeout(notesTimer);
    const el = e.currentTarget;
    notesTimer = setTimeout(() => api.saveField(el), 500);
  }
  function fieldBlur(e) {
    clearTimeout(notesTimer);
    api.saveField(e.currentTarget);
  }
  function titleKey(e) {
    if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
  }
  function subKey(e, sub) {
    if (e.key === "Enter") { e.preventDefault(); api.renameSub(row.id, sub.id, e.currentTarget); }
    else if (e.key === "Escape") { e.stopPropagation(); e.currentTarget.value = sub.title; }
  }
  function addSub(e) {
    e.preventDefault();
    if (api.guardPreview()) return;
    const input = e.currentTarget.querySelector("input"), title = input.value.trim();
    if (!title) { input.focus(); return; }
    input.value = "";
    api.addSubtasks(row.id, [title]);
  }
  async function openLink() {
    linking = true;
    await tick();
    linkEl?.focus();
  }
  function addLink(e) {
    e.preventDefault();
    const v = linkEl.value.trim();
    if (!v) { linking = false; return; }
    if (api.addLink(row.id, v)) { linkEl.value = ""; linking = false; }
  }
  function linkKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); linking = false; }
  }

  function pasteSubs(e) {
    const lines = (e.clipboardData ? e.clipboardData.getData("text") : "").split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])?\s*(?:\[[ xX]?\]\s*)?/, "").trim()).filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    if (api.guardPreview()) return;
    e.currentTarget.value = "";
    api.addSubtasks(row.id, lines.slice(0, 50));
  }
</script>

<div class="task-card">
  <input class="card-title" type="text" data-field="title" maxlength="140" value={card.title} aria-label="Title" onkeydown={titleKey} onblur={fieldBlur} />
  <textarea class="card-notes" data-field="notes" rows="1" maxlength="4000" placeholder="Notes" aria-label="Notes" value={card.notes} oninput={notesInput} onblur={fieldBlur}></textarea>
  <div class="card-links">
    {#each card.links as l (l.href)}
      <span class="card-link"><a href={l.href} target="_blank" rel="noopener noreferrer" title={l.href}>{@html api.ICON.link}<span>{l.label}</span></a><button type="button" aria-label={"Remove link " + l.label} title="Remove link" onclick={() => api.removeLink(row.id, l.href)}>×</button></span>
    {/each}
    {#if linking}
      <form class="card-link-add" autocomplete="off" onsubmit={addLink}><input type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Paste a link" aria-label="Link" bind:this={linkEl} onkeydown={linkKey} onblur={(e) => { if (!e.currentTarget.value.trim()) linking = false; }} /><button class="btn small" type="submit">Add</button></form>
    {:else}
      <button class="card-link-new" type="button" onclick={openLink}>{@html api.ICON.link}{card.links.length ? "Add link" : "Add a link"}</button>
    {/if}
  </div>
  <div class="subplan">
    <ul class="subtasks">
      {#each card.subtasks as sub (sub.id)}
        <li class="subtask" data-subid={sub.id} data-done={String(sub.done)}>
          <input type="checkbox" data-subdone aria-label={"Complete subtask: " + sub.title} checked={sub.done} onchange={(e) => api.subDone(row.id, sub.id, e.currentTarget.checked)} />
          <input type="text" data-subtitle maxlength="140" aria-label="Subtask title" value={sub.title} onchange={(e) => api.renameSub(row.id, sub.id, e.currentTarget)} onkeydown={(e) => subKey(e, sub)} />
          <button class="icon-btn" type="button" data-act="subdelete" aria-label={"Delete subtask: " + sub.title} title="Delete subtask" onclick={() => api.deleteSub(row.id, sub.id)}>{@html api.ICON.trash}</button>
        </li>
      {/each}
    </ul>
    <form class="subtask-add" autocomplete="off" onsubmit={addSub}>
      <input type="text" maxlength="140" aria-label={"New subtask for " + row.title} placeholder={card.subtasks.length ? "Add another step" : "Add a step, e.g. Draft the outline"} value={card.draft} oninput={(e) => api.S.subtaskDrafts.set(row.id, e.currentTarget.value)} onpaste={pasteSubs} />
      <button class="btn small" type="submit">Add</button>
    </form>
  </div>
  <div class="card-bar">
    <button class="card-btn" class:set={card.bucket !== "later"} type="button" data-act="sched" data-sched aria-haspopup="dialog" title="When? (D)" onclick={(e) => api.sched(e.currentTarget, row.id)}>{@html card.bucket === "today" ? api.ICON.star : api.ICON.cal}{card.whenText}</button>
    <button class="card-btn" class:set={!!row.project} type="button" data-act="label" title={row.project || null} aria-haspopup="listbox" aria-expanded="false" aria-label={card.labelName} onclick={() => api.label(row.id)}>{#if row.project}<i class="label-dot" style:--h={row.hue}></i><span>{row.project}</span>{:else}{@html api.ICON.tag}<span>Label</span>{/if}</button>
    <span class="card-est">
      <span class="est-pick" role="radiogroup" aria-label="Estimated cycles">
        {#each { length: card.circles } as _, i (i)}
          <button type="button" role="radio" aria-checked={String(i + 1 === card.est)} aria-label={api.plural(i + 1, "cycle")} data-cest={i + 1} class={i < card.est ? "on" : ""} onclick={() => api.setEst(row.id, i + 1)}><i></i></button>
        {/each}
      </span>
      <output>{card.estText}</output>
    </span>
    <span class="spacer"></span>
    <span class="card-actions">
      <button class="icon-btn" class:danger={card.del} type="button" data-act="del" aria-label={card.del ? null : "Delete task"} title={card.del ? null : "Delete"} onclick={() => api.del(row.id)}>{#if card.del}Delete?{:else}{@html api.ICON.trash}{/if}</button>
      <button class="btn small solid" type="button" data-act="focus" onclick={() => api.focus(row.id)}>{@html api.ICON.play}Focus</button>
    </span>
  </div>
  <div class="card-stats">{card.stats}{#if row.today}<span class="task-start" class:late={!!start?.late} title={start ? start.hint : ""}>{start ? " · " + start.text.replace(/^Starts/, "starts") : ""}</span>{/if}{card.added}</div>
</div>
