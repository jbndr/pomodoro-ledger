let rem = $state(0), total = $state(1), version = $state(0), zen = $state(false);

/** What the timer card shows: the clock is pushed on every tick, the rest redraws on `refresh()`. */
export const timerView = {
  get rem() { return rem; },
  get total() { return total; },
  set(r: number, t: number) { rem = r; total = t; },
  get version() { return version; },
  refresh() { version++; },
  get zen() { return zen; },
  set zen(on: boolean) { zen = on; },
};
