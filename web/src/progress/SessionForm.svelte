<script>
  import { onMount, untrack } from "svelte";
  import { addDays, MIN, pad, sod } from "../lib/dates";
  import { checkSession, parseLength, suggestStart } from "../lib/manual";

  /** Adds a session by hand, to `taskId` or a task picked here, or changes `session` ({ key, from, ms }). */
  let { api, taskId = null, session = null, onclose } = $props();
  let el;

  // What's logged is read once, when the form opens.
  const first = untrack(() => {
    const S = api.S, focus = S.settings.focus * MIN, busy = api.busyNow(session?.key), active = S.activeId && S.tasks.get(S.activeId);
    const ms = session ? session.ms : focus;
    return { focus, busy, ms, len: api.fmtDur(ms), task: taskId ?? (active && !active.done ? active.id : ""), from: session ? session.from : suggestStart(busy, focus, Date.now()) };
  });
  const { focus, busy } = first;
  let task = $state(first.task), from = $state(first.from), ms = $state(first.ms), len = $state(first.len), lenOk = $state(true), timeOk = $state(true);

  const dayName = (t) => {
    const today = sod(Date.now());
    return t === today ? "Today" : t === addDays(today, -1) ? "Yesterday" : api.fmtDate(t, { weekday: "short", day: "numeric", month: "short" });
  };
  const hhmm = $derived(pad(new Date(from).getHours()) + ":" + pad(new Date(from).getMinutes()));
  const taskName = $derived((task && api.S.tasks.get(task)?.title) || "Unplanned focus");
  const problem = $derived.by(() => {
    if (!timeOk) return "Pick a start time.";
    if (!lenOk) return "Type a length like 25m or 1h 30m.";
    const p = checkSession(from, ms, busy, Date.now());
    if (!p) return "";
    if (p.kind === "short") return "A session needs at least a minute.";
    if (p.kind === "long") return "A session can be 12 hours at most.";
    if (p.kind === "future") return "That ends in the future.";
    return "Overlaps " + api.fmtClock(p.with.from) + "–" + api.fmtClock(p.with.to) + " on “" + p.with.title + "”.";
  });
  const note = $derived.by(() => {
    const n = Math.floor(ms / focus);
    return "Ends " + api.fmtClock(from + ms) + " · " + (n ? api.plural(n, "cycle") : "less than a cycle");
  });

  onMount(() => {
    if (matchMedia("(hover: hover)").matches) el.querySelector("input")?.focus({ preventScroll: true });
  });

  function pickTask(e) {
    if (!api.popHidden()) { api.closePop(); return; }
    api.openPop(e.currentTarget, api.moveItems(), task, (id) => { task = id; });
  }
  function pickDay(e) {
    if (!api.popHidden()) { api.closePop(); return; }
    const today = sod(Date.now()), days = [...Array(14)].map((_, i) => addDays(today, -i));
    api.openPop(e.currentTarget, days.map((t) => ({ id: String(t), title: dayName(t) })), String(sod(from)), (id) => {
      const d = new Date(+id), f = new Date(from);
      from = new Date(d.getFullYear(), d.getMonth(), d.getDate(), f.getHours(), f.getMinutes()).getTime();
    });
  }
  function setTime(e) {
    const m = /^(\d{2}):(\d{2})/.exec(e.currentTarget.value);
    timeOk = !!m;
    if (!m) return;
    const d = new Date(from);
    from = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +m[1], +m[2]).getTime();
  }
  function setLen(e) {
    len = e.currentTarget.value;
    const v = parseLength(len);
    lenOk = v != null;
    if (v != null) ms = v;
  }
  function stepLen(e) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const step = 5 * MIN, base = Math.round(ms / step) * step;
    ms = Math.max(5 * MIN, base + (e.key === "ArrowUp" ? step : -step));
    len = api.fmtDur(ms); lenOk = true;
  }
  function keydown(e) {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    onclose();
  }
  function save(e) {
    e.preventDefault();
    if (problem || api.guardPreview()) return;
    if (session) { api.editSession(session.key, from, ms); onclose(); }
    else onclose(api.addSession(task, from, ms), from);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="sf" autocomplete="off" bind:this={el} onsubmit={save} onkeydown={keydown}>
  <span class="sf-fields">
    {#if taskId == null && !session}
      <button class="btn small sf-pick sf-task" type="button" data-move aria-haspopup="listbox" aria-label="Task: {taskName}" onclick={pickTask}><span>{taskName}</span>{@html api.ICON.chev}</button>
    {/if}
    {#if !session}
      <button class="btn small sf-pick" type="button" data-move aria-haspopup="listbox" aria-label="Day: {dayName(sod(from))}" onclick={pickDay}><span>{dayName(sod(from))}</span>{@html api.ICON.chev}</button>
    {/if}
    <span class="sf-span">
      <input class="sf-in sf-time" type="time" step="60" required aria-label="Started at" value={hhmm} oninput={setTime} />
      <span class="sf-for" aria-hidden="true">for</span>
      <input class="sf-in sf-len" type="text" inputmode="text" spellcheck="false" aria-label="Length" value={len} oninput={setLen} onkeydown={stepLen} />
    </span>
  </span>
  <span class="sf-note" class:bad={!!problem} aria-live="polite">{problem || note}</span>
  <span class="sf-acts">
    <button class="btn small" type="button" onclick={() => onclose()}>Cancel</button>
    <button class="btn small solid" type="submit" disabled={!!problem}>{session ? "Save" : "Add"}</button>
  </span>
</form>
