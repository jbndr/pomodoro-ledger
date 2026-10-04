import { addDays, dayKey, MIN, sod } from "../lib/dates";
import { weekStart } from "../lib/insights";
import { firstDue, type Repeat } from "../lib/repeat";
import type { Session, Task } from "../lib/tasks";
import type { WeekPlan } from "../lib/weekPlan";

/** Example tasks for the preview and demo; kept in memory, never saved. The demo adds a year of finished work. */
export function makeSamples(year = false) {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const now = Date.now(), today = sod(now);
  const at = (ago: number, hour: number) => Math.min(now - 5 * MIN, addDays(today, -ago) + hour * 3600000 + Math.floor(rnd() * 40) * MIN);
  const F = 25 * MIN;
  const startHour = (ago: number) => [15, 9, 9, 10, 9, 14, 11][new Date(addDays(today, -ago)).getDay()];
  type Day = [ago: number, n: number, partial?: boolean];
  const mk = (id: string, title: string, est: number, created: number, done: number | null, plan: Day[]): Task => {
    const sessions: Session[] = [];
    plan.forEach(([ago, n, partial]) => {
      for (let i = 0; i < n; i++) sessions.push({ at: at(ago, startHour(ago) + i), ms: F, full: true });
      if (partial) sessions.push({ at: at(ago, startHour(ago) + 1 + n), ms: (8 + Math.floor(rnd() * 12)) * MIN, full: false });
    });
    return { id, title, est, done: done != null, createdAt: at(created, 8), doneAt: done != null ? at(done, 17) : null, sessions, sample: true };
  };
  const spread = (from: number, to: number, p: number, max: number) => { const out: Day[] = []; for (let d = from; d >= to; d--) if (rnd() < p) out.push([d, 1 + Math.floor(rnd() * max), rnd() < 0.2]); return out; };
  const list = [
    mk("x1", "Migrate the blog to the new CMS", 10, 84, 58, spread(84, 58, 0.45, 2)),
    mk("x2", "Refactor auth middleware", 6, 21, 15, [[20, 2], [19, 1, true], [17, 1], [15, 1]]),
    mk("x3", "Draft Q4 roadmap outline", 4, 12, 6, [[11, 1], [9, 2, true], [7, 1], [6, 1]]),
    mk("x4", "Clear the pull-request review backlog", 2, 4, 2, [[3, 1], [2, 1]]),
    mk("x5", "Study for the cloud architect certification", 50, 110, null, spread(110, 1, 0.33, 2)),
    mk("x6", "Write the onboarding guide", 5, 3, null, [[1, 2], [0, 1]]),
    mk("x7", "Prepare the monthly investor update", 3, 0, null, []),
    mk("x8", "Polish the pricing page", 8, 18, 3, spread(16, 3, 0.85, 3)),
  ];
  list[5].today = list[6].today = true;
  ["Website", "App", "Planning", "App", "Learning", "Writing", "Admin", "Website"].forEach((name, i) => { list[i].project = name; });
  const daily: Repeat = { every: "day" }, plants: Repeat = { every: "week", days: [1, 4] };
  list.push({ ...mk("x9", "Plan the day", 1, 6, null, []), today: true, plan: dayKey(now), repeat: daily }, { ...mk("x10", "Water the plants", 1, 9, null, []), plan: firstDue(plants, dayKey(addDays(now, 1))), repeat: plants });
  if (year) list.push(...yearSamples(now, rnd));
  return new Map(list.map((t) => [t.id, t]));
}

/** Weekly objectives for the demo: last week's to look back on, and this week's in progress. */
export function samplePlans(): WeekPlan[] {
  const week = weekStart(Date.now());
  return [
    { week: dayKey(addDays(week, -7)), at: 1, objectives: [{ label: "Website", target: 8, name: "Polish the pricing page" }, { label: "Learning", target: 4 }] },
    { week: dayKey(week), at: 1, objectives: [{ label: "Writing", target: 6, name: "Ship the onboarding guide" }, { label: "Learning", target: 5, name: "Cert: networking module" }, { label: "Website", target: 4 }] },
  ];
}

/** Finished work from New Year (or 150 days back) until two weeks ago, with a break in May-ish for a comeback. */
function yearSamples(now: number, rnd: () => number): Task[] {
  const today = sod(now), from = Math.max(150, Math.round((today - new Date(new Date(now).getFullYear(), 0, 1).getTime()) / 864e5)), to = 15;
  const away = (ago: number) => ago >= 130 && ago <= 145;
  const plans: [id: string, title: string, label: string, est: number, a: number, b: number][] = [
    ["y1", "Ship the mobile app v2", "App", 60, 1, 0.55],
    ["y2", "Hire a product designer", "Admin", 6, 0.86, 0.72],
    ["y3", "Write the conference talk", "Writing", 24, 0.7, 0.5],
    ["y4", "Plan the H2 roadmap", "Planning", 8, 0.55, 0.46],
    ["y5", "Redesign the docs site", "Website", 40, 0.46, 0.2],
    ["y6", "Migrate billing to Stripe", "App", 30, 0.3, 0],
    ["y7", "Read Designing Data-Intensive Applications", "Learning", 20, 1, 0],
  ];
  const tasks = plans.map(([id, title, project, est]) => ({ id, title, project, est, done: true, sessions: [] as Session[], sample: true } as Task));
  const crunch = (ago: number) => { const f = (ago - to) / (from - to); return f > 0.56 && f < 0.6; };
  const peak = Math.round(to + (from - to) * 0.58);
  for (let ago = from; ago >= to; ago--) {
    const day = addDays(today, -ago), wd = new Date(day).getDay(), weekend = wd === 0 || wd === 6, f = (ago - to) / (from - to);
    if (away(ago) || (!crunch(ago) && rnd() > (weekend ? 0.3 : 0.84))) continue;
    let n = weekend ? 1 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 6);
    if (crunch(ago)) n = 7 + Math.floor(rnd() * 4);
    else if (!weekend && rnd() < 0.08) n = 8 + Math.floor(rnd() * 3);
    if (ago === peak) n = 12;
    const start = weekend ? 10 : rnd() < 0.16 ? 7 : rnd() < 0.2 ? 13 : 9;
    const live = plans.map((p, i) => [p, i] as const).filter(([p]) => f <= p[4] && f >= p[5] && p[0] !== "y7");
    for (let i = 0; i < n; i++) {
      const pick = rnd() < 0.18 || !live.length ? 6 : live[Math.floor(rnd() * live.length)][1];
      const end = day + (start * 60 + i * 30 + (i >= 4 ? 50 : 0) + 25 + Math.floor(rnd() * 4)) * MIN;
      tasks[pick].sessions!.push({ at: end, ms: 25 * MIN, full: true });
    }
    if (rnd() < 0.12) tasks[6].sessions!.push({ at: day + (start * 60 + n * 30 + 70) * MIN, ms: (8 + Math.floor(rnd() * 12)) * MIN, full: false });
  }
  return tasks.filter((t) => t.sessions!.length).map((t) => {
    t.sessions!.sort((a, b) => a.at - b.at);
    const first = t.sessions![0].at, last = t.sessions!.at(-1)!.at;
    return { ...t, createdAt: first - 864e5, doneAt: last + 3600000 };
  });
}
