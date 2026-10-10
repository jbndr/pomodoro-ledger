import { toast } from "../chrome/notice.svelte";
import { fmtClock } from "../format";
import { bestSlot, inWindow, planWindow, windowOn, type Span } from "../lib/bestTime";
import { dayKey, MIN } from "../lib/dates";
import { windowHours, type FocusWindow } from "../lib/insights";
import { cyclesOf } from "../lib/tasks";
import { renderTasks } from "../render";
import { ls, S, T, type Task } from "../state";
import { Store } from "../store";
import { dur, ping } from "../timer/engine";
import { ui } from "../ui";
import { guardPreview, isToday, openOf, preview, todayKey, topOfToday, viewTasks } from "./derived";
import { taskStartPlan, type BestPlan, type StartPlan } from "./plan";

type Offer = NonNullable<BestPlan["offer"]>;

let memo: { key: string; w: FocusWindow | null } = { key: "", w: null };

function todaysWindow(now: number): (Span & { w: FocusWindow }) | null {
  const tasks = viewTasks(), key = dayKey(now) + ":" + tasks.size;
  if (memo.key !== key) memo = { key, w: planWindow(tasks, now) };
  const span = memo.w && windowOn(memo.w, now);
  return span ? { ...span, w: memo.w! } : null;
}

/** Marks the tasks that fall in today's best time, and finds a move that puts the biggest one there. */
export function withBest(plan: StartPlan): StartPlan {
  const win = S.settings.bestTime === false ? null : todaysWindow(Date.now());
  if (!win) return plan;
  const hours = windowHours(win.w.from, win.w.to);
  for (const s of plan.values()) {
    if (s.start == null || s.end == null || !inWindow({ start: s.start, end: s.end }, win)) continue;
    s.best = true;
    s.hint += " In your best time, " + hours + ".";
  }
  plan.best = { start: win.start, end: win.end, hours, offer: offerFor(win) };
  return plan;
}

function offerFor(win: Span): Offer | null {
  const now = Date.now();
  if (S.settings.bestSeen === todayKey() || S.projectFilter || win.end - now < 20 * MIN) return null;
  const today = openOf(viewTasks()).filter(isToday);
  const current = T.mode === "focus" && T.status !== "idle" ? today.find((t) => t.id === S.activeId) : undefined;
  const rest = today.filter((t) => t !== current), left = (t: Task) => (t.est || 0) - cyclesOf(t);
  const big = rest.reduce<Task | null>((b, t) => (left(t) >= 2 && (!b || left(t) > left(b)) ? t : b), null);
  if (!big) return null;
  const others = rest.filter((t) => t !== big);
  const spans = [...others, big].map((_, i) => {
    const s = taskStartPlan([...(current ? [current] : []), ...others.slice(0, i), big, ...others.slice(i)]).get(big.id)!;
    return { start: s.start!, end: s.end! };
  });
  const i = bestSlot(spans, win, rest.indexOf(big), dur("focus") / 2);
  return i < 0 ? null : { id: big.id, title: big.title, before: others[i]?.id ?? null, start: spans[i].start, now: win.start <= now };
}

export function bestLine() {
  const w = planWindow(viewTasks(), Date.now());
  return w ? w.text.replace(/^You/, "From the last 90 days, you") : "Your best time shows up once you've focused on a few different days.";
}

export function lineUp(o: Offer) {
  if (guardPreview() || !ui.list?.moveBefore(o.id, o.before)) return;
  toast(o.now ? "“" + o.title + "” is up next." : "Lined up “" + o.title + "” for your best time, from about " + fmtClock(o.start) + ".");
}

export function notToday() {
  S.settings.bestSeen = todayKey();
  Store.saveSettings();
  renderTasks();
}

/** Says when your best time starts, once a day, if the timer isn't running yet. */
export function remindBest() {
  if (!S.settings.bestRemind || preview() || T.status !== "idle") return;
  const now = Date.now(), win = todaysWindow(now), day = win && dayKey(win.start);
  if (!win || now < win.start || now > win.start + 15 * MIN || ls.get("pl.bestRung", "") === day) return;
  const next = topOfToday();
  if (!next) return;
  ls.set("pl.bestRung", day);
  const text = "Your best time starts now. Up next: “" + next.title + "”.";
  if (!ping(text)) toast(text);
}
