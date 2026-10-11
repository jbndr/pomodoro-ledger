<script>
  let { chars } = $props();

  const parts = $derived.by(() => { const t = chars.join(""), [m, s] = t.replace("+", "").split(":"); return { plus: t[0] === "+", m: [...m], s: [...s] }; });
</script>

<span class="face-stack" style:--n={parts.m.length} aria-hidden="true"><span class="sk-m">{#if parts.plus}<i>+</i>{/if}{#each parts.m as d}<span>{d}</span>{/each}</span><span class="sk-s">{#each parts.s as d}<span>{d}</span>{/each}</span></span>
