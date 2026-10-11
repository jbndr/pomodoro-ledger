<script>
  let { took, est, cap = 16 } = $props();

  // Filled is what it took within the plan, hollow is plan not needed, red is past the plan. Past `cap` dots, each dot stands for several cycles.
  const dots = $derived.by(() => {
    const k = Math.max(1, Math.ceil(Math.max(took, est) / cap)), e = Math.round(est / k);
    let t = Math.round(took / k);
    if (took > est) t = Math.max(t, e + 1);
    else if (took < est) t = Math.min(t, e - 1);
    const out = [];
    for (let i = 0; i < Math.max(t, e); i++) out.push(!est || i < Math.min(t, e) ? "" : t > e ? "x" : "u");
    return { out, k };
  });
</script>

<span class="est-dots" aria-hidden="true">{#each dots.out as c, i (i)}<i class={c} style:--i={i}></i>{/each}{#if dots.k > 1}<em data-tip="Each dot is {dots.k} cycles">×{dots.k}</em>{/if}</span>
