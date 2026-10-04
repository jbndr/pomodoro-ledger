import { addDays, MIN, sod } from "../lib/dates";
import type { Session, Task } from "../lib/tasks";

/** Example tasks for the preview and demo; kept in memory, never saved. */
export function makeSamples() {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const now = Date.now(), today = sod(now);
  const at = (ago: number, hour: number) => Math.min(now - 5 * MIN, addDays(today, -ago) + hour * 3600000 + Math.floor(rnd() * 40) * MIN);
  const F = 25 * MIN;
  type Day = [ago: number, n: number, partial?: boolean];
  const mk = (id: string, title: string, est: number, created: number, done: number | null, plan: Day[]): Task => {
    const sessions: Session[] = [];
    plan.forEach(([ago, n, partial]) => {
      for (let i = 0; i < n; i++) sessions.push({ at: at(ago, 9 + i), ms: F, full: true });
      if (partial) sessions.push({ at: at(ago, 10 + n), ms: (8 + Math.floor(rnd() * 12)) * MIN, full: false });
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
  ];
  list[5].today = list[6].today = true;
  return new Map(list.map((t) => [t.id, t]));
}
