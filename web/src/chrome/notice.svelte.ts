let msg = $state(""), shown = $state(false), timer: ReturnType<typeof setTimeout> | undefined;

export const notice = {
  get msg() { return msg; },
  get shown() { return shown; },
};

export function toast(text: string) {
  msg = text; shown = true;
  clearTimeout(timer);
  timer = setTimeout(() => (shown = false), 3600);
}
