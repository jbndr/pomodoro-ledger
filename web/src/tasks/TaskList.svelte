<script>
  import { flushSync } from "svelte";
  import { groupAt, jump, place, placements, step, toTop } from "../lib/order";
  import { list } from "../lib/redraw.svelte";
  import { buildList } from "./model.js";
  import { picked, togglePick } from "./selection.svelte";
  import TaskRow from "./TaskRow.svelte";

  let { api } = $props();

  const EASE = "cubic-bezier(.2, .8, .2, 1)";

  let ul;
  const items = $derived.by(() => { list.version; return buildList(api); });
  const plan = $derived(list.plan);

  // Reactive bits of a drag: which task floats, where the drop slot sits and what the badge says.
  let drag = $state(null);
  // The rest of it, read every frame: pointer, scroll container, settle flag.
  let ctl = null, pending = null, dragJustEnded = false;
  let sec = $state(null);
  let secPending = null;

  const shown = $derived.by(() => {
    if (!drag) return items;
    const out = [...items];
    out.splice(drag.before ?? out.length, 0, { kind: "slot", key: "slot" });
    return out;
  });
  const lifted = $derived(new Set(sec ? sec.blocks[sec.from].keys : []));

  const fallback = () => (api.S.taskView === "today" ? "today" : "later");
  const entries = () => items.map((it) => (it.kind === "task" ? { kind: "task", id: it.id } : { kind: "group", g: it.g, end: it.end }));
  const keyOf = (el) => (el.dataset.id != null ? "t:" + el.dataset.id : el.dataset.g != null ? "g:" + el.dataset.g : "");
  const rowEl = (id) => [...ul.querySelectorAll(".task")].find((el) => el.dataset.id === id);
  const elOf = (key) => [...ul.children].find((el) => keyOf(el) === key);

  /** Applies a change that reorders rows, then slides each row from where it was. */
  function flip(change) {
    const els = [...ul.children], before = new Map(els.map((el) => [el, el.getBoundingClientRect().top]));
    change();
    flushSync();
    if (api.calm()) return;
    const top = ul.getBoundingClientRect().top;
    for (const el of els) {
      if (!el.isConnected || el.classList.contains("dragging")) continue;
      const d = before.get(el) - (top + el.offsetTop);
      if (Math.abs(d) > 0.5) el.animate([{ transform: "translateY(" + d + "px)" }, { transform: "none" }], { duration: 220, easing: EASE });
    }
  }

  function save(order) {
    api.commit(placements(order, fallback()));
  }

  /** Moves a task one row, or a whole group with `far`, and saves. Returns the group it ends up in, or null if it can't move. */
  export function moveTask(id, up, far) {
    const now = entries(), at = now.findIndex((e) => e.kind === "task" && e.id === id);
    const next = at < 0 ? null : (far ? jump : step)(now, id, up);
    if (!next) return null;
    const from = groupAt(now, at, fallback());
    flip(() => save(next));
    const to = groupAt(next, next.findIndex((e) => e.kind === "task" && e.id === id), fallback());
    return { from, to };
  }

  export function moveToTop(ids) {
    const next = toTop(entries(), ids);
    if (!next) return false;
    flip(() => save(next));
    return true;
  }

  export const dragging = () => !!drag;

  const taskIds = () => entries().filter((e) => e.kind === "task").map((e) => e.id);

  // ⌘/Ctrl-click picks a task for a bulk edit, Shift-click picks a range; once anything is picked, a plain click or tap toggles.
  function pickClick(e) {
    if (pressPicked) { pressPicked = false; e.preventDefault(); e.stopPropagation(); return true; }
    const li = e.target.closest(".task");
    if (!li || li.classList.contains("open") || e.target.closest(".task-card, .side-acts, .grip, .check, input, textarea")) return false;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod && !e.shiftKey && !picked.ids.length) return false;
    e.preventDefault(); e.stopPropagation();
    const id = li.dataset.id, ids = taskIds();
    if (e.shiftKey && picked.anchor && ids.includes(picked.anchor)) {
      const a = ids.indexOf(picked.anchor), b = ids.indexOf(id), [lo, hi] = a < b ? [a, b] : [b, a];
      picked.ids = [...new Set([...picked.ids, ...ids.slice(lo, hi + 1)])];
      return true;
    }
    togglePick(id);
    return true;
  }

  // On touch, a long press picks the task, the way Mail and Photos start a selection.
  let pressTimer = 0, pressAt = null, pressPicked = false;
  function pressStart(e) {
    if (e.pointerType === "mouse" || e.target.closest(".grip, .check, .side-acts, .task-card, input, textarea")) return;
    const li = e.target.closest(".task");
    if (!li || li.classList.contains("open")) return;
    pressAt = { x: e.clientX, y: e.clientY };
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { pressPicked = true; togglePick(li.dataset.id); api.buzz?.(10); }, 450);
  }
  function pressMove(e) { if (pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 8) pressEnd(); }
  function pressEnd() { clearTimeout(pressTimer); pressAt = null; }

  // Rows are hit-tested by layout position, so the sliding animations can't make the slot flicker back and forth.
  function updateDrop(y) {
    if (!drag || ctl.settling) return;
    drag.top = Math.max(0, Math.min(innerHeight - 40, y - ctl.offset));
    const top = ul.getBoundingClientRect().top;
    const rows = [...ul.children].filter((el) => !el.classList.contains("task-drop") && !el.classList.contains("dragging"));
    const heading = rows.find((el) => { const t = top + el.offsetTop; return el.classList.contains("group") && y >= t && y <= t + el.offsetHeight; });
    let next = heading ? rows[rows.indexOf(heading) + 1] || null : rows.find((el) => y < top + el.offsetTop + el.offsetHeight / 2) || null;
    if (next === rows[0] && next?.classList.contains("group")) next = rows[1] || null;
    let before = next ? items.findIndex((it) => it.key === keyOf(next)) : items.length;
    if (before === ctl.index + 1) before = ctl.index;
    if (before !== drag.before) flip(() => { drag.before = before; });
    const group = groupAt(entries(), drag.before, fallback());
    drag.move = group === ctl.from ? "" : "Move to " + api.groupName(group);
  }

  function dragScroll() {
    if (!drag || ctl.settling) return;
    const bounds = ul.getBoundingClientRect(), y = ctl.y;
    const view = ctl.scroller ? ctl.scroller.getBoundingClientRect() : { top: 0, bottom: innerHeight };
    const by = y < view.top + 64 && bounds.top < y ? -Math.ceil((view.top + 64 - y) / 5) : y > view.bottom - 64 && bounds.bottom > y ? Math.ceil((y - view.bottom + 64) / 5) : 0;
    if (by) { (ctl.scroller || window).scrollBy(0, Math.max(-14, Math.min(14, by))); updateDrop(y); }
    ctl.frame = requestAnimationFrame(dragScroll);
  }

  function startDrag(e, li) {
    if (api.guardPreview()) return;
    const id = li.dataset.id, index = items.findIndex((it) => it.key === "t:" + id);
    if (index < 0) return;
    const r = li.getBoundingClientRect(), panel = ul.closest(".panel");
    ctl = { pointer: e.pointerId, offset: e.clientY - r.top, y: e.clientY, frame: 0, settling: false, index, from: groupAt(entries(), index, fallback()),
      scroller: panel && getComputedStyle(panel).overflowY === "auto" ? panel : null };
    try { ul.setPointerCapture(e.pointerId); } catch {}
    drag = { id, before: index, top: r.top, left: r.left, width: r.width, height: li.offsetHeight, move: "" };
    flushSync();
    updateDrop(e.clientY);
    ctl.frame = requestAnimationFrame(dragScroll);
    if (!api.calm()) li.animate([{ transform: "none", boxShadow: "none", offset: 0 }], { duration: 180, easing: EASE });
  }

  function finishDrag(cancel = false) {
    if (!drag || ctl.settling) return;
    ctl.settling = true;
    cancelAnimationFrame(ctl.frame);
    try { ul.releasePointerCapture(ctl.pointer); } catch {}
    if (cancel) flip(() => { drag.before = ctl.index; });
    const id = drag.id, li = rowEl(id), slot = ul.querySelector(".task-drop");
    const done = () => {
      li.getAnimations().forEach((a) => a.cancel());
      const order = place(entries(), id, drag.before);
      drag = null; ctl = null;
      dragJustEnded = !cancel;
      setTimeout(() => { dragJustEnded = false; }, 0);
      api.S.dropped = cancel ? null : { id, at: Date.now() };
      if (cancel) api.renderTasks(); else save(order);
      flushSync();
      // Focus left on the dropped row would keep its grip showing as if still held.
      if (ul.contains(document.activeElement)) document.activeElement.blur();
    };
    if (api.calm() || !li || !slot) { done(); return; }
    const to = slot.getBoundingClientRect();
    let ended = false;
    const end = () => { if (!ended) { ended = true; done(); } };
    li.animate([{ top: to.top + "px", left: to.left + "px", transform: "none", boxShadow: "none" }], { duration: 200, easing: EASE, fill: "forwards" }).finished.then(end, end);
    // Animations freeze in hidden tabs; don't leave the drop hanging.
    setTimeout(end, 300);
  }

  // Sections move as a block: the heading floats with the pointer, a line marks where it lands, and its tasks follow on drop.
  function sectionBlocks() {
    const blocks = [];
    let cur = null;
    for (const it of items) {
      if (it.kind === "section") { cur = { id: it.id, keys: [it.key] }; blocks.push(cur); }
      else if (it.kind !== "task") cur = null;
      else if (cur) cur.keys.push(it.key);
    }
    return blocks;
  }
  function startSecDrag(e, head) {
    if (api.guardPreview()) return;
    const blocks = sectionBlocks(), from = blocks.findIndex((b) => b.keys[0] === keyOf(head));
    if (from < 0 || blocks.length < 2) return;
    const r = head.getBoundingClientRect(), n = blocks[from].keys.length - 1;
    secPending = null;
    sec = { blocks, from, to: from, offset: e.clientY - r.top, left: r.left, width: r.width, top: r.top, line: null,
      text: head.querySelector(".sec-title").value + (n ? "  ·  " + api.plural(n, "task") : "") };
    document.body.classList.add("sec-sorting");
    moveSecDrag(e.clientY);
  }
  function moveSecDrag(y) {
    const others = sec.blocks.filter((_, i) => i !== sec.from);
    const rect = (key) => elOf(key).getBoundingClientRect();
    sec.top = y - sec.offset;
    let to = others.findIndex((b) => y < (rect(b.keys[0]).top + rect(b.keys.at(-1)).bottom) / 2);
    if (to < 0) to = others.length;
    sec.to = to;
    const box = ul.getBoundingClientRect();
    const at = others[to] ? rect(others[to].keys[0]).top - 2 : rect(others.at(-1).keys.at(-1)).bottom + 2;
    sec.line = { left: box.left, width: box.width, top: at };
  }
  function endSecDrag(cancel) {
    const d = sec;
    if (!d) return;
    sec = null;
    document.body.classList.remove("sec-sorting");
    if (!cancel) api.moveSection(d.blocks[d.from].id, d.to);
  }

  function pointerdown(e) {
    if (e.button > 0 || drag || sec) return;
    const secGrip = e.target.closest(".sec-grip"), head = e.target.closest(".group.section");
    if (secGrip) { e.preventDefault(); startSecDrag(e, head); return; }
    if (head) {
      if (e.pointerType === "mouse" && !e.target.closest("input, button")) secPending = { x: e.clientX, y: e.clientY, head };
      return;
    }
    const grip = e.target.closest(".grip");
    if (grip) {
      if (!grip.disabled) { e.preventDefault(); startDrag(e, grip.closest(".task")); }
      return;
    }
    // Mouse users drag the whole row once it moves a few pixels; touch keeps the grip so lists still scroll.
    if (e.pointerType !== "mouse" || api.S.projectFilter) return;
    const li = e.target.closest(".task");
    if (!li || li.classList.contains("open") || e.target.closest("button, input, textarea, a, .task-card")) return;
    pending = { x: e.clientX, y: e.clientY, li, id: e.pointerId };
  }
  function pointermove(e) {
    if (drag) {
      if (e.pointerId === ctl.pointer) { ctl.y = e.clientY; updateDrop(e.clientY); }
      return;
    }
    if (!pending || e.pointerId !== pending.id || Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < 5) return;
    const li = pending.li;
    pending = null;
    startDrag(e, li);
  }
  function pointerend(e) {
    if (drag && ctl && e.pointerId === ctl.pointer) finishDrag(e.type !== "pointerup");
  }
  function docMove(e) {
    if (sec) { moveSecDrag(e.clientY); return; }
    if (secPending && Math.hypot(e.clientX - secPending.x, e.clientY - secPending.y) > 5) startSecDrag(e, secPending.head);
  }
  function escape(e) {
    if (e.key !== "Escape") return;
    if (drag) { e.preventDefault(); e.stopPropagation(); finishDrag(true); }
    else if (sec) { e.preventDefault(); e.stopPropagation(); endSecDrag(true); }
  }
  function swallowClick(e) {
    if (!dragJustEnded) return;
    dragJustEnded = false;
    e.stopPropagation();
  }

  function keydown(e) {
    const t = e.target;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !t.matches("input, textarea")) { e.preventDefault(); picked.ids = taskIds(); return; }
    if (t.matches(".sec-grip") && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const id = t.closest(".group.section").dataset.g.slice(4), i = api.sections().findIndex((x) => x.id === id);
      if (api.moveSection(id, i + (e.key === "ArrowUp" ? -1 : 1))) elOf("g:sec:" + id)?.querySelector(".sec-grip")?.focus();
      return;
    }
    const grip = t.closest(".grip");
    if (grip && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      if (api.guardPreview()) return;
      const id = grip.closest(".task").dataset.id;
      if (moveTask(id, e.key === "ArrowUp", false)) rowEl(id)?.querySelector(".grip").focus();
      return;
    }
    if (t.matches(".sec-title") && e.key === "Enter") { e.preventDefault(); t.blur(); return; }
    if (t.matches(".sec-title") && e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      const s = api.sections().find((x) => x.id === t.dataset.sec);
      if (s) t.value = s.title;
      t.blur();
      return;
    }
    const li = t.closest(".task");
    if (li && e.key === "Escape" && li.classList.contains("open")) {
      e.preventDefault(); e.stopPropagation();
      if (t.matches("[data-field]")) api.saveField(t);
      api.open(li.dataset.id);
      return;
    }
    if (t !== li) return;
    if (e.key === "Enter") { e.preventDefault(); api.open(li.dataset.id, true); }
    else if (["ArrowDown", "ArrowUp", "j", "k"].includes(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault(); e.stopPropagation();
      const rows = [...ul.querySelectorAll(".task")], i = rows.indexOf(li);
      api.focusRow(rows[i + (e.key === "ArrowDown" || e.key === "j" ? 1 : -1)]);
    }
  }

  function secTime(it) {
    const times = plan ? it.ids.map((id) => plan.get(id)).filter((x) => x && x.start) : [];
    return times.length ? api.fmtClock(Math.min(...times.map((x) => x.start))) + " – " + api.fmtClock(Math.max(...times.map((x) => x.end))) : "";
  }
  function dayTitle(it) {
    if (!plan) return "";
    const late = plan.end > plan.endAt && !plan.over;
    return api.plural(it.tasks, "task") + " · " + api.plural(it.cycles, "cycle") + " to go. Focus is pure work time; with breaks adds " + api.fmtDur(plan.breaks) + " of short and long breaks from your settings. Done is when you'd finish if you start now" + (late ? ", after your workday ends at " + api.fmtClock(plan.endAt) : "") + ".";
  }
</script>

<svelte:window onpointerup={() => { pending = null; }} />
<svelte:document
  onpointermove={docMove}
  onpointerup={() => { secPending = null; endSecDrag(false); }}
  onpointercancel={() => { secPending = null; endSecDrag(true); }}
  onkeydowncapture={escape}
/>

<ul
  class="tasks"
  class:sorting={!!drag}
  id="taskList"
  bind:this={ul}
  onmousedown={(e) => { if ((e.shiftKey || e.metaKey || e.ctrlKey) && e.target.closest(".task-main")) e.preventDefault(); }}
  onpointerdown={(e) => { pressStart(e); pointerdown(e); }}
  onpointermove={(e) => { pressMove(e); pointermove(e); }}
  onpointerup={(e) => { pressEnd(); pointerend(e); }}
  onpointercancel={(e) => { pressEnd(); pointerend(e); }}
  onlostpointercapture={pointerend}
  onpointerover={(e) => { if (e.pointerType === "mouse") api.hover(e.target.closest(".task")?.dataset.id || ""); }}
  onpointerleave={() => api.hover("")}
  onkeydown={keydown}
  onclickcapture={(e) => { if (!pickClick(e)) swallowClick(e); }}
>
  {#each shown as it (it.key)}
    {#if it.kind === "task"}
      <TaskRow {api} row={it} {plan} lifted={lifted.has(it.key)} drag={drag && drag.id === it.id ? drag : null} />
    {:else if it.kind === "slot"}
      <li class="task-drop" aria-hidden="true" style:height={drag.height + "px"}></li>
    {:else if it.kind === "today"}
      <li class="group today-head" data-g="today"><span class="vh">Today</span>{#if it.cycles}<div class="day-plan" data-cycles={it.cycles} data-tasks={it.tasks} title={dayTitle(it)}><b>{api.plural(it.tasks, "task")}</b> · about <strong class="net">{plan ? api.fmtDur(plan.focus) : ""}</strong> of focus · done around <strong class="eta" class:late={plan && plan.end > plan.endAt && !plan.over}>{plan ? api.fmtClock(plan.end) : ""}</strong></div>{:else}<span class="day-plan">{it.tasks ? api.plural(it.tasks, "task") + " · all planned cycles done" : "Nothing planned yet"}</span>{/if}<button class="add-sec" type="button" data-addsec title="Add a section, like Morning or Admin" onclick={() => api.addSection()}>+ Section</button></li>
    {:else if it.kind === "section"}
      <li class="group section" class:sec-lifted={lifted.has(it.key)} data-g={it.g}><button class="grip sec-grip" type="button" aria-label={"Move section " + it.title + ": drag, or press the up and down arrow keys"} title="Drag to reorder">{@html api.ICON.grip}</button><input class="sec-title" type="text" maxlength="60" value={it.title} aria-label="Section name" data-sec={it.id} onchange={(e) => api.renameSection(e.currentTarget)} /><span class="sec-time">{secTime(it)}</span><span class="sec-sum">{it.ids.length ? "" : "Drag tasks here"}</span><button class="icon-btn sec-del" type="button" data-secdel={it.id} aria-label={"Remove section " + it.title} title="Remove section (its tasks stay in Today)" onclick={() => api.removeSection(it.id)}>{@html api.ICON.x}</button></li>
    {:else if it.kind === "day"}
      <li class="group day" class:empty={it.empty} data-g={it.g}><b>{it.num}</b>{it.name}<span>{it.summary}</span></li>
    {:else if it.kind === "month"}
      <li class="group month" data-g={it.g} data-end={it.end}>{it.name}<span>{it.summary}</span></li>
    {/if}
  {/each}
</ul>
{#if sec}
  <div class="sec-ghost" style:left={sec.left + "px"} style:top={sec.top + "px"} style:width={sec.width + "px"}>{sec.text}</div>
  {#if sec.line}<div class="sec-drop" style:left={sec.line.left + "px"} style:top={sec.line.top + "px"} style:width={sec.line.width + "px"}></div>{/if}
{/if}
