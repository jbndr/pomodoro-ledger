import { badges, focusYears, yearStats } from "../lib/year";
import { addCommands } from "../palette/registry";
import { S } from "../state";
import { viewTasks } from "../tasks/derived";
import { openYear } from "../ui";

const MARK = '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="5.6" cy="14" r="4.5" fill="var(--tomato)"/><path d="M13.04 20.96L22.16 7.76" fill="none" stroke="var(--leaf)" stroke-width="6" stroke-linecap="round"/></svg>';

addCommands(() => {
  const tasks = viewTasks(), ys = focusYears(tasks), now = new Date().getFullYear(), year = ys.includes(now) ? now : ys.at(-1);
  if (!year) return [];
  const got = badges(yearStats(tasks, year), S.settings.goal).filter((b) => b.earned).length;
  return [{
    id: "year.open", group: "Go to", title: "Your " + year + " in focus", words: "year wrapped review stories badges share", icon: MARK,
    hint: got + (got === 1 ? " badge" : " badges"), verb: "Open", run: () => openYear(year),
  }];
});
