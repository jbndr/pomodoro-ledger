/** Lets the non-Svelte code tell the task list to redraw: its state lives in plain objects Svelte can't track. */
let version = $state(0);
let plan = $state.raw<unknown>(null);

export const list = {
  get version() { return version; },
  get plan() { return plan; },
  refresh() { version++; },
  setPlan(p: unknown) { plan = p; },
};
