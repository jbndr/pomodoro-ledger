let rem = $state(0), total = $state(1), up = $state(""), version = $state(0), zen = $state(false);

/** What the timer card shows: the clock is pushed on every tick, the rest redraws on `refresh()`. */
export const timerView = {
  get rem() { return rem; },
  get total() { return total; },
  /** "over" past the bell or "flow" while the clock counts up; `rem` is then the time counted so far. */
  get up() { return up; },
  set(r: number, t: number, u = "") { rem = r; total = t; up = u; },
  get version() { return version; },
  refresh() { version++; },
  get zen() { return zen; },
  set zen(on: boolean) { zen = on; },
};
