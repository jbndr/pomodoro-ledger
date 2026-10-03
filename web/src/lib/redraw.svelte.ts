/** Lets the non-Svelte code ask a component to redraw: its state lives in plain objects Svelte can't track. */
function redraw() {
  let version = $state(0);
  return {
    get version() { return version; },
    refresh() { version++; },
  };
}

const tasks = redraw();
let plan = $state.raw<unknown>(null);

export const list = {
  get version() { return tasks.version; },
  refresh: tasks.refresh,
  /** Estimated start times for Today, recomputed once a minute. */
  get plan() { return plan; },
  setPlan(p: unknown) { plan = p; },
};

export const progress = redraw();
