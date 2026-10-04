let version = $state(0), quick = $state(false);

/** Lets the non-Svelte code redraw the composer after changing what it shows: the new-task fields in S, settings or the view. */
export const composer = {
  get version() { return version; },
  refresh() { version++; },
  get quick() { return quick; },
  set quick(v: boolean) { quick = v; },
};
