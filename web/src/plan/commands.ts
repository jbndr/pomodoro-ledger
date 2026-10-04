import { plural } from "../format";
import { ICON } from "../icons";
import { addCommands } from "../palette/registry";
import { openPlan } from "../ui";
import { currentPlan } from "./actions";

addCommands(() => {
  const n = currentPlan()?.objectives.length || 0;
  return [{ id: "plan.week", group: "Plan", title: "Plan the week", words: "weekly objectives goals review leftovers", hint: n ? plural(n, "objective") + " this week" : "", icon: ICON.target, keys: ["P"], run: openPlan }];
});
