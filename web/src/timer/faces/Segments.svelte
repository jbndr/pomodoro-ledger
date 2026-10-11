<script>
  import { SEGMENTS } from "../../lib/faces";

  let { chars, kind, label = "" } = $props();

  // Bevelled bars on a 12×22 cell, slanted a little like a real display.
  const h = (x, y, l, t) => `${x + t / 2},${y} ${x + l - t / 2},${y} ${x + l},${y + t / 2} ${x + l - t / 2},${y + t} ${x + t / 2},${y + t} ${x},${y + t / 2}`;
  const v = (x, y, l, t) => `${x + t / 2},${y} ${x + t},${y + t / 2} ${x + t},${y + l - t / 2} ${x + t / 2},${y + l} ${x},${y + l - t / 2} ${x},${y + t / 2}`;
  const BARS = Object.entries({ a: h(1.8, .6, 8.4, 2), b: v(9.4, 1.8, 8.6, 2), c: v(9.4, 11.6, 8.6, 2), d: h(1.8, 19.4, 8.4, 2), e: v(.6, 11.6, 8.6, 2), f: v(.6, 1.8, 8.6, 2), g: h(1.8, 10, 8.4, 2) });
  const ADVANCE = { ":": 5, "+": 10 };

  const cells = $derived.by(() => {
    let x = 0;
    return chars.map((c) => { const cell = { c, x, on: SEGMENTS[c] || "" }; x += ADVANCE[c] ?? 14; return cell; });
  });
  const width = $derived.by(() => { const last = cells[cells.length - 1]; return last ? last.x + (ADVANCE[last.c] ?? 12) : 0; });
  // The colon blinks with the seconds, as on a real VFD clock.
  const dim = $derived(kind === "vfd" && +chars[chars.length - 1] % 2 === 1);
</script>

<span class="face-seg face-{kind}" style:--ar={(width + 4) / 24} aria-hidden="true">{#if label}<small>{label}</small>{/if}<svg viewBox="-3 -1 {width + 4} 24" class:dim>{#each cells as cell, i (i)}<g transform="translate({cell.x} 0) skewX(-6)">{#if cell.c === ":"}<rect class="on colon" x="1.5" y="6" width="2" height="2" /><rect class="on colon" x="1.5" y="14" width="2" height="2" />{:else if cell.c === "+"}<rect class="on" x="1" y="10" width="8" height="2" /><rect class="on" x="4" y="7" width="2" height="8" />{:else}{#each BARS as [k, pts] (k)}{#if kind === "lcd" && cell.on.includes(k)}<polygon class="shade" points={pts} transform="translate(.7 .7)" />{/if}<polygon class={cell.on.includes(k) ? "on" : "off"} points={pts} />{/each}{/if}</g>{/each}</svg></span>
