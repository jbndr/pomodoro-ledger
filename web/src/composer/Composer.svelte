<script>
  import { flushSync } from "svelte";
  import { addDays, dayKey } from "../lib/dates";
  import { labelMatches } from "../lib/labels";
  import { breaksBetween, dropToken, hashToken, parseTitle } from "../lib/quickEntry";
  import { labelHue } from "../lib/tasks";
  import { LP, labelPop } from "../popovers/state.svelte";
  import { composer } from "./state.svelte";

  let { api } = $props();
  let form, input, notes, labelBtn;
  let title = $state(""), open = $state(false);
  let hashOff = -1;

  /** The title parser's result, with each recognised token in the words the hint shows. */
  function parseNew(raw) {
    const parsed = parseTitle(raw, api.S.newKeep);
    return { ...parsed, tokens: parsed.tokens.map((x) => ({ text: x.text, label: x.kind === "est" ? api.plural(x.est, "cycle") : x.when === "later" ? "Later" : api.dayName(x.when === "today" ? api.todayKey() : x.when) })) };
  }
  const whenNow = (parsed) => parsed.when || api.S.newWhen || (api.S.taskView === "upcoming" ? dayKey(addDays(Date.now(), 1)) : api.S.taskView);

  const v = $derived.by(() => {
    composer.version;
    const parsed = parseNew(title), est = parsed.est || api.S.newEst, breaks = breaksBetween(est, api.S.settings.longEvery, api.dur("short"), api.dur("long"));
    return {
      parsed, est, when: whenNow(parsed), label: api.S.newLabel,
      circles: Math.min(16, Math.max(8, est + 1)),
      estTitle: api.fmtDur(est * api.dur("focus")) + " focus" + (breaks ? " + " + api.fmtDur(breaks) + " breaks" : ""),
    };
  });

  const hashOpen = () => !labelPop.hidden && LP.key === "hash";

  function setTitle(text) { title = input.value = text; }

  /** Changing a chip by hand takes over from what was typed, so the typed words come out of the title. */
  function drop(text) {
    const next = dropToken(input.value, text);
    if (next != null) setTitle(next);
  }

  function pickEst(n) {
    const parsed = parseNew(input.value);
    if (parsed.est) drop(parsed.tokens.at(-1).text);
    api.S.newEst = n;
    composer.refresh();
  }

  function pickWhen(e) {
    const when = whenNow(parseNew(input.value));
    api.openWhen(e.currentTarget, { plan: when !== "today" && when !== "later" ? when : undefined }, (g) => {
      const p = parseNew(input.value);
      if (p.when) drop(p.tokens[0].text);
      api.S.newWhen = g; composer.refresh(); input.focus();
    });
  }

  function keep() {
    api.S.newKeep.push(...parseNew(input.value).tokens.map((x) => x.text.toLowerCase()));
    composer.refresh(); input.focus();
  }

  function pickLabel() {
    api.openLabelPop("new", () => labelBtn, api.S.newLabel, (name) => { api.S.newLabel = name; composer.refresh(); input.focus(); });
  }

  function hashLabel(name) {
    const t = hashToken(input.value, input.selectionStart, input.selectionEnd);
    if (t) {
      const head = input.value.slice(0, t.at);
      setTitle(head + input.value.slice(input.selectionStart).trimStart());
      input.setSelectionRange(head.length, head.length);
    }
    api.S.newLabel = name; composer.refresh();
  }

  function typing() {
    const tok = hashToken(input.value, input.selectionStart, input.selectionEnd), q = tok ? tok.query : "";
    if (!tok) hashOff = -1;
    if (!tok || tok.at === hashOff || /^\s/.test(q) || (/\s/.test(q) && !labelMatches(api.S.labels, q.trim()).length)) { if (hashOpen()) api.closeLabelPop(); return; }
    if (!hashOpen()) api.openLabelPop("hash", () => input, api.S.newLabel, hashLabel);
    if (!api.filterLabels(q)) api.closeLabelPop();
  }

  function titleKey(e) {
    if (!hashOpen()) return;
    if (e.key === "Tab") { api.closeLabelPop(); return; }
    if (e.key === "Escape") { const tok = hashToken(input.value, input.selectionStart, input.selectionEnd); hashOff = tok ? tok.at : -1; }
    api.labelKey(e);
  }

  function collapse() {
    if (LP.key === "new" || LP.key === "hash") api.closeLabelPop();
    if (form.contains(document.activeElement)) document.activeElement.blur();
    open = false;
    if (!input.value.trim()) { api.S.newLabel = api.filterLabel(); api.S.newWhen = null; api.S.newKeep = []; notes.value = ""; composer.refresh(); }
    flushSync();
  }

  function submit(e) {
    e.preventDefault();
    if (hashOpen()) api.closeLabelPop();
    const parsed = parseNew(input.value), name = parsed.title.slice(0, 140);
    if (!name) { input.focus(); return; }
    const into = whenNow(parsed), text = notes.value.trim(), est = parsed.est || api.S.newEst;
    setTitle(""); notes.value = ""; api.S.newWhen = null; api.S.newKeep = [];
    api.addTask(name, est, into, text);
    input.focus();
  }

  function keydown(e) {
    if (e.key === "Escape") { e.stopPropagation(); collapse(); }
    else if (e.key === "Enter" && e.target.id === "newNotes" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  }

  // On click, not pointerdown: collapsing shifts the list, and the click would land on a different row.
  // A label filter chip also picks the new task's label, so the box stays open for it.
  function outside(e) {
    if (!open || !e.target.isConnected || e.target.closest("#openRoom, #openSettings, #labelPop, #whenPop, #projectFilter button")) return;
    if (!form.contains(e.target) && !input.value.trim()) collapse();
  }
</script>

<svelte:document onclick={outside} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="add" class:open id="addForm" autocomplete="off" bind:this={form} onsubmit={submit} onkeydown={keydown} onfocusin={() => { open = true; composer.refresh(); }}>
  <span class="add-check" aria-hidden="true"></span>
  <div class="add-body">
    <input type="text" id="newTitle" maxlength="160" placeholder="New task" aria-label="New task title" aria-describedby="newParsed" bind:this={input} bind:value={() => title, (v) => { title = v; typing(); }} onkeydown={titleKey} onblur={() => { if (hashOpen() && document.hasFocus()) api.closeLabelPop(); }} />
    <div class="new-task-options" id="newTaskOptions" hidden={!open}>
      <div class="new-parsed" id="newParsed" aria-live="polite" hidden={!v.parsed.tokens.length}>{#each v.parsed.tokens as x, i (i)}{i ? " · " : ""}<mark>{x.text}</mark> → {x.label}{/each}{#if v.parsed.tokens.length}{" "}<button type="button" id="newKeep" onclick={keep}>Keep as text</button>{/if}</div>
      <textarea id="newNotes" rows="1" maxlength="4000" placeholder="Notes" aria-label="Notes" bind:this={notes}></textarea>
      <div class="card-bar">
        <button class="card-btn set" class:auto={!!v.parsed.when} type="button" id="newWhen" data-sched aria-haspopup="dialog" title="When? Or type it: tomorrow, fri, next week, 12 oct" onclick={pickWhen}>{@html v.when === "today" ? api.ICON.star : api.ICON.cal}{v.when === "today" ? "Today" : v.when === "later" ? "Later" : api.dayName(v.when)}</button>
        <button class="card-btn" class:set={!!v.label} type="button" id="newLabel" aria-haspopup="listbox" aria-expanded="false" title="Label, or type #name" aria-label={api.labelChipName(v.label)} bind:this={labelBtn} onclick={pickLabel}>{#if v.label}<i class="label-dot" style:--h={labelHue(v.label)}></i>{:else}{@html api.ICON.tag}{/if}<span>{v.label || "Label"}</span></button>
        <span class="card-est" class:auto={!!v.parsed.est} id="newEst">
          <span class="est-pick" role="radiogroup" aria-label="Estimated cycles">
            {#each { length: v.circles } as _, i (i)}
              <button type="button" role="radio" aria-checked={String(i + 1 === v.est)} aria-label={api.plural(i + 1, "cycle")} data-nset={i + 1} class={i < v.est ? "on" : ""} onclick={() => pickEst(i + 1)}><i></i></button>
            {/each}
          </span><output id="estOut" title={v.estTitle}>{api.plural(v.est, "cycle")}</output>
        </span>
        <span class="spacer"></span>
        <button class="btn small solid" type="submit">Add <kbd>↵</kbd></button>
      </div>
    </div>
  </div>
</form>
