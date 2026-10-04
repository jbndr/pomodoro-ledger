export const $ = <E extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as E;

export const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export const taskRows = () => [...$("#taskList").querySelectorAll<HTMLElement>(".task")];
export const taskRow = (id: string) => taskRows().find((el) => el.dataset.id === id);
