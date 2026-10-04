export const $ = <E extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as E;

export const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export const taskRows = () => [...$("#taskList").querySelectorAll<HTMLElement>(".task")];
export const taskRow = (id: string) => taskRows().find((el) => el.dataset.id === id);

/** Calls `fn` on click, and keeps calling it while the pointer is held down until it returns false. */
export const hold = (fn: () => boolean) => (node: HTMLElement) => {
  let t = 0, held = false;
  const stop = () => { clearTimeout(t); clearInterval(t); removeEventListener("pointerup", stop); };
  const down = (e: PointerEvent) => {
    if (e.button) return;
    held = false; stop();
    addEventListener("pointerup", stop);
    t = window.setTimeout(() => {
      held = true;
      if (fn()) t = window.setInterval(() => { if (!fn()) stop(); }, 90);
    }, 420);
  };
  const click = () => { if (held) held = false; else fn(); };
  const on = [["pointerdown", down], ["pointercancel", stop], ["pointerleave", stop], ["click", click]] as const;
  for (const [k, f] of on) node.addEventListener(k, f as EventListener);
  return () => { stop(); for (const [k, f] of on) node.removeEventListener(k, f as EventListener); };
};
