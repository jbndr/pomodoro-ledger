/** The task list as plain rows for the current view: headings and tasks, in display order. */
export function buildList(a) {
  const S = a.S, tk = a.todayKey();
  const open = a.openOf(a.viewTasks()).filter(a.inProject);
  if (!open.length) return [];
  const byView = { today: [], upcoming: [], later: [] };
  open.forEach((t) => byView[a.bucketOf(t, tk)].push(t));
  const shown = byView[S.taskView], items = [];
  const left = (list) => list.reduce((n, t) => n + Math.max(0, (t.est || 0) - a.cyclesOf(t)), 0);
  const summary = (list) => (list.length ? a.plural(list.length, "task") + (left(list) ? " · " + a.fmtDur(left(list) * a.dur("focus")) + " focus" : "") : "");
  const add = (t, dated) => items.push(taskRow(a, t, dated, tk));

  if (S.taskView === "today" && (shown.length || a.sections().length)) items.push({ kind: "today", key: "g:today", g: "today", tasks: shown.length, cycles: left(shown) });
  if (S.taskView === "upcoming") {
    // The next seven days always show, so any of them can take a dropped task; further out is grouped by month.
    const base = a.sod(Date.now()), week = [...Array(7)].map((_, i) => a.dayKey(a.addDays(base, i + 1)));
    for (const k of week) {
      const same = shown.filter((t) => t.plan === k);
      items.push({ kind: "day", key: "g:" + k, g: k, num: new Date(a.keyTime(k)).getDate(), name: a.dayName(k), summary: summary(same), empty: !same.length });
      same.forEach((t) => add(t));
    }
    const months = new Map();
    shown.filter((t) => t.plan > week[6]).forEach((t) => { const ym = t.plan.slice(0, 7); months.set(ym, [...(months.get(ym) || []), t]); });
    for (const [ym, list] of months) {
      const [y, m] = ym.split("-").map(Number), firstDay = a.dayKey(a.addDays(base, 8)), start = firstDay > ym + "-01" ? firstDay : ym + "-01";
      const end = a.dayKey(new Date(y, m, 0).getTime());
      const name = a.fmtDate(new Date(y, m - 1, 1).getTime(), y === new Date(base).getFullYear() ? { month: "long" } : { month: "long", year: "numeric" });
      items.push({ kind: "month", key: "g:" + start, g: start, end, name: (start !== ym + "-01" ? "Rest of " : "") + name, summary: summary(list) });
      list.forEach((t) => add(t, true));
    }
  } else if (S.taskView === "today") {
    const known = new Set(a.sections().map((x) => x.id));
    shown.filter((t) => !known.has(t.section)).forEach((t) => add(t));
    for (const sec of a.sections()) {
      const mine = shown.filter((t) => t.section === sec.id);
      items.push({ kind: "section", key: "g:sec:" + sec.id, g: "sec:" + sec.id, id: sec.id, title: sec.title, ids: mine.map((t) => t.id) });
      mine.forEach((t) => add(t));
    }
  } else shown.forEach((t) => add(t));
  return items;
}

function taskRow(a, t, dated, tk) {
  const S = a.S, c = a.cyclesOf(t), est = t.est || 0, n = Math.max(c, est), project = a.projectOf(t), today = a.isToday(t);
  const subs = a.subsOf(t), open = S.openTask === t.id;
  return {
    kind: "task", key: "t:" + t.id, id: t.id, title: t.title, today, project, hue: project ? a.labelHue(project) : 0,
    active: t.id === S.activeId, open, completing: a.completing.has(t.id),
    dropped: !!S.dropped && S.dropped.id === t.id && Date.now() - S.dropped.at < 900,
    locked: !!S.projectFilter,
    when: dated && t.plan ? a.shortDay(t.plan) : "",
    subs: subs.length ? { done: subs.filter((s) => s.done).length, n: subs.length } : null,
    notes: !!t.notes,
    carry: today && t.plan && t.plan < tk ? "from " + a.fmtDate(a.keyTime(t.plan), { weekday: "short" }) : "",
    pips: n > 12 ? { mini: est ? Math.min(100, (c / est) * 100) : 100 } : { dots: [...Array(n)].map((_, i) => (i < c ? (i >= est ? "o" : "f") : "")) },
    cycTitle: c + " of " + a.plural(est, "planned cycle"),
    card: open ? taskCard(a, t, c, est, project, subs) : null,
  };
}

function taskCard(a, t, c, est, project, subs) {
  const bucket = a.bucketOf(t), ms = a.timeOf(t);
  return {
    title: t.title, notes: t.notes || "", est, circles: Math.min(16, Math.max(8, est + 1)), estText: a.plural(est, "cycle"),
    bucket, whenText: bucket === "today" ? "Today" : bucket === "later" ? "When" : a.dayName(t.plan),
    labelName: a.labelChipName(project),
    del: a.S.confirmDel === t.id,
    stats: c + " of " + a.plural(est, "cycle") + (ms ? " · " + a.fmtDur(ms) + " focus" : ""),
    added: t.createdAt > 1 ? " · added " + a.fmtDate(t.createdAt) : "",
    subtasks: subs.map((s) => ({ id: s.id, title: s.title, done: !!s.done })),
    draft: a.S.subtaskDrafts.get(t.id) || "",
  };
}
