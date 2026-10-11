<script>
  let { chars } = $props();

  const parts = $derived.by(() => { const t = chars.join(""), [m, s] = t.replace("+", "").split(":"); return { plus: t[0] === "+", m: String(+m), s }; });
</script>

<span class="face-serif" style:--n={parts.m.length} aria-hidden="true">{#if parts.plus}<span class="sf-plus">+</span>{/if}<span class="sf-m">{parts.m}</span><span class="sf-pr">′</span><span class="sf-s">{parts.s}″</span></span>
