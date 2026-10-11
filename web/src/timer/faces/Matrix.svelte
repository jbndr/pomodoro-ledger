<script>
  import { matrix, MATRIX_ROWS } from "../../lib/faces";

  let { text } = $props();

  const P = 10;
  const m = $derived(matrix(text));
  const dots = $derived(Array.from({ length: m.cols * MATRIX_ROWS }, (_, i) => ({ x: i % m.cols, y: Math.floor(i / m.cols) })));
</script>

<svg class="face-matrix" viewBox="0 0 {m.cols * P} {MATRIX_ROWS * P}" style:--cols={m.cols} aria-hidden="true">{#each dots as d (d.x + "," + d.y)}<circle cx={d.x * P + P / 2} cy={d.y * P + P / 2} r="3.7" class:on={m.lit.has(d.x + "," + d.y)} style:--y={d.y} />{/each}</svg>
