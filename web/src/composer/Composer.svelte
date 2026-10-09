<script>
  import { flushSync, tick } from "svelte";
  import { addDays, dayKey } from "../lib/dates";
  import { labelMatches } from "../lib/labels";
  import { firstDue, repeatText } from "../lib/repeat";
  import { linkHost, linkLabel, takeLinks } from "../lib/links";
  import { breaksBetween, dropToken, hashToken, parseTitle } from "../lib/quickEntry";
  import { labelHue } from "../lib/tasks";
  import { LP, labelPop } from "../popovers/state.svelte";
  import { composer } from "./state.svelte";

  let { api } = $props();
  let form, input, notes, labelBtn, whenBtn;
  let title = $state(""), open = $state(false), hints = $state(false);
  let hashOff = -1;

  const NOTE = /\s\/\/\s*/;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const alt = mac ? "⌥" : "Alt+";

  /** The title parser's result, with each recognised token in the words the hint shows; " // " starts a note. */
  function parseNew(raw) {
    const found = takeLinks(raw);
    raw = found.text;
    const cut = raw.search(NOTE), head = cut > 0 ? raw.slice(0, cut) : raw, note = cut > 0 ? raw.slice(cut).replace(NOTE, "").trim() : "";
    const parsed = parseTitle(head, api.S.newKeep);
    if (note) parsed.tokens.push({ text: "// " + note, kind: "note" });
    for (const u of found.links) parsed.tokens.push({ text: linkHost(u), kind: "link" });
    if (!parsed.title && found.links.length) parsed.title = linkLabel(found.links[0]);
    parsed.links = found.links;
    return { ...parsed, note, tokens: parsed.tokens.map((x) => ({ text: x.text, label: x.kind === "note" ? "note" : x.kind === "link" ? "link" : x.kind === "est" ? api.plural(x.est, "cycle") : x.kind === "repeat" ? repeatText(x.repeat) : x.when === "later" ? "Later" : api.dayName(x.when === "today" ? api.todayKey() : x.when) })) };
  }
  const whenNow = (parsed) => parsed.when || api.S.newWhen || (api.S.taskView === "upcoming" ? dayKey(addDays(Date.now(), 1)) : api.S.taskView);

  const v = $derived.by(() => {
    composer.version;
    const parsed = parseNew(title), est = parsed.est || api.S.newEst, breaks = breaksBetween(est, api.S.settings.longEvery, api.dur("short"), api.dur("long"));
    return {
      parsed, est, when: whenNow(parsed), label: api.S.newLabel, repeat: parsed.repeat || api.S.newRepeat,
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
    const typed = parsed.tokens.find((x) => x.label.endsWith("cycle") || x.label.endsWith("cycles"));
    if (parsed.est && typed) drop(typed.text);
    api.S.newEst = n;
    composer.refresh();
  }

  function pickWhen(e) {
    const when = whenNow(parseNew(input.value));
    const typed = () => { const p = parseNew(input.value); if (p.when) drop(p.tokens[0].text); };
    api.openWhen(e.currentTarget, { plan: when !== "today" && when !== "later" ? when : undefined, repeat: v.repeat }, (g) => {
      typed();
      api.S.newWhen = g; api.S.newRepeat = null; composer.refresh(); input.focus();
    }, (r) => {
      typed();
      const first = r && firstDue(r, api.todayKey());
      api.S.newRepeat = r; api.S.newWhen = first ? (first === api.todayKey() ? "today" : first) : null; composer.refresh();
    });
  }

  function keep() {
    api.S.newKeep.push(...parseNew(input.value).tokens.filter((x) => x.label !== "note" && x.label !== "link").map((x) => x.text.toLowerCase()));
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

  let leaving = 0;
  function collapse() {
    if (LP.key === "new" || LP.key === "hash") api.closeLabelPop();
    if (form.contains(document.activeElement)) document.activeElement.blur();
    // Quick add fades and settles a little before it goes, instead of vanishing.
    if (composer.quick && !api.calm()) {
      const id = ++leaving;
      form.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.97 }], { duration: 150, easing: "ease-in" });
      document.querySelector(".add-scrim")?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: "ease-in", fill: "forwards" });
      setTimeout(() => { if (id === leaving) finishCollapse(); }, 140);
      return;
    }
    finishCollapse();
  }
  function finishCollapse() {
    open = false; composer.quick = false;
    if (!input.value.trim()) { api.S.newLabel = api.filterLabel(); api.S.newWhen = null; api.S.newRepeat = null; api.S.newKeep = []; notes.value = ""; composer.refresh(); }
    flushSync();
  }

  function submit(e) {
    e.preventDefault();
    if (hashOpen()) api.closeLabelPop();
    const parsed = parseNew(input.value), name = parsed.title.slice(0, 140);
    if (!name) { input.focus(); return; }
    const into = whenNow(parsed), text = [notes.value.trim(), parsed.note].filter(Boolean).join("\n"), est = parsed.est || api.S.newEst, repeat = parsed.repeat || api.S.newRepeat;
    setTitle(""); notes.value = ""; api.S.newWhen = null; api.S.newRepeat = null; api.S.newKeep = [];
    const id = api.addTask(name, est, into, text, repeat, parsed.links);
    input.focus();
    unfold(id);
  }

  // The new row fades and unfolds quietly at the end of its group, so the rows below glide instead of jumping.
  async function unfold(id) {
    if (api.calm()) return;
    await tick();
    const row = document.querySelector(`#taskList .task[data-id="${CSS.escape(id)}"]`);
    if (!row) return;
    const h = row.offsetHeight;
    row.animate([{ height: "0px", opacity: 0, overflow: "hidden" }, { height: h + "px", opacity: 1, overflow: "hidden" }], { duration: 260, easing: "cubic-bezier(.32, .72, 0, 1)" });
  }

  function keydown(e) {
    const field = e.target === input || e.target === notes;
    if (e.key === "Escape") { e.stopPropagation(); collapse(); }
    else if (e.key === "Enter" && e.target.id === "newNotes" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    else if (e.altKey && !e.metaKey && !e.ctrlKey && /^Digit[1-9]$/.test(e.code)) { e.preventDefault(); pickEst(+e.code.slice(5)); }
    else if (e.key === "Alt") hints = true;
    else if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === "KeyD") { e.preventDefault(); hints = false; pickWhen({ currentTarget: field ? e.target : whenBtn }); }
    else if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === "KeyL") { e.preventDefault(); hints = false; pickLabel(); }
    else if (field && e.key === "ArrowDown" && e.target === input && !hashOpen()) { e.preventDefault(); notes.focus(); }
    else if (field && e.key === "ArrowUp" && e.target === notes && notes.selectionStart === 0 && notes.selectionEnd === 0) { e.preventDefault(); input.focus(); }
  }

  function estKey(e) {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    const n = step ? Math.max(1, Math.min(24, v.est + step)) : /^[1-9]$/.test(e.key) ? +e.key : 0;
    if (!n) return;
    e.preventDefault();
    pickEst(n);
    flushSync();
    form.querySelector('.est-pick [aria-checked="true"]')?.focus();
  }

  $effect(() => {
    if (!composer.quick) return;
    open = true;
    input.focus({ preventScroll: true });
  });

  // On click, not pointerdown: collapsing shifts the list, and the click would land on a different row.
  // A label filter chip also picks the new task's label, so the box stays open for it.
  function outside(e) {
    if (!open || composer.quick || !e.target.isConnected || e.target.closest("#openRoom, #openSettings, #labelPop, #whenPop, #projectFilter button")) return;
    if (!form.contains(e.target) && !input.value.trim()) collapse();
  }
</script>

<svelte:document onclick={outside} />
<svelte:window onkeyup={(e) => { if (e.key === "Alt") hints = false; }} onblur={() => (hints = false)} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
{#if composer.quick}<div class="add-scrim" aria-hidden="true" onclick={collapse}></div>{/if}
<form class="add" class:open class:quick={composer.quick} class:hints id="addForm" autocomplete="off" bind:this={form} onsubmit={submit} onkeydown={keydown} onfocusin={() => { open = true; composer.refresh(); }}>
  <span class="add-check" aria-hidden="true"></span>
  <div class="add-body">
    <input type="text" id="newTitle" maxlength="160" placeholder={composer.quick ? "New task, e.g. Call Sam fri 2c #work // agenda" : "New task"} aria-label="New task title" aria-describedby="newParsed" bind:this={input} bind:value={() => title, (v) => { title = v; typing(); }} onkeydown={titleKey} onblur={() => { if (hashOpen() && document.hasFocus()) api.closeLabelPop(); }} />
    <div class="new-task-options" id="newTaskOptions" hidden={!open}>
      <div class="new-parsed" id="newParsed" aria-live="polite" hidden={!v.parsed.tokens.length}>{#each v.parsed.tokens as x, i (i)}{i ? " · " : ""}<mark>{x.text}</mark> → {x.label}{/each}{#if v.parsed.tokens.some((x) => x.label !== "note" && x.label !== "link")}{" "}<button type="button" id="newKeep" onclick={keep}>Keep as text</button>{/if}</div>
      <span class="key-hint notes-hint" aria-hidden="true">↓</span>
      <textarea id="newNotes" rows="1" maxlength="4000" placeholder="Notes" aria-label="Notes" bind:this={notes}></textarea>
      <div class="card-bar">
        <button class="card-btn set" class:auto={!!v.parsed.when} type="button" id="newWhen" data-sched aria-haspopup="dialog" bind:this={whenBtn} title="When? Or type it: tomorrow, fri, next week, 12 oct" onclick={pickWhen}>{@html v.when === "today" ? api.ICON.star : api.ICON.cal}{v.when === "today" ? "Today" : v.when === "later" ? "Later" : api.dayName(v.when)}{#if v.repeat}<span class="rep" title={repeatText(v.repeat)}>{@html api.ICON.repeat}</span>{/if}<kbd class="key-hint" aria-hidden="true">{alt}D</kbd></button>
        <button class="card-btn" class:set={!!v.label} type="button" id="newLabel" aria-haspopup="listbox" aria-expanded="false" title="Label, or type #name" aria-label={api.labelChipName(v.label)} bind:this={labelBtn} onclick={pickLabel}>{#if v.label}<i class="label-dot" style:--h={labelHue(v.label)}></i>{:else}{@html api.ICON.tag}{/if}<span>{v.label || "Label"}</span><kbd class="key-hint" aria-hidden="true">{alt}L</kbd></button>
        <span class="card-est" class:auto={!!v.parsed.est} id="newEst"><kbd class="key-hint" aria-hidden="true">{alt}1–9</kbd>
          <span class="est-pick" role="radiogroup" aria-label="Estimated cycles" tabindex="-1" onkeydown={estKey}>
            {#each { length: v.circles } as _, i (i)}
              <button type="button" role="radio" aria-checked={String(i + 1 === v.est)} tabindex={i + 1 === v.est ? 0 : -1} aria-label={api.plural(i + 1, "cycle")} data-nset={i + 1} class={i < v.est ? "on" : ""} onclick={() => pickEst(i + 1)}><i></i></button>
            {/each}
          </span><output id="estOut" title={v.estTitle}>{api.plural(v.est, "cycle")}</output>
        </span>
        <span class="spacer"></span>
        <button class="btn small solid" type="submit">Add <kbd>↵</kbd></button>
      </div>

    </div>
  </div>
</form>
