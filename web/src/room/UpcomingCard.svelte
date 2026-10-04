<script>
  import { clockIn, dayIn, daysIn, daysText, localZone, offsetAt, placeOf } from "../lib/schedule";

  let { s, now, reminded, own, onremind, onremove } = $props();

  const day = $derived(dayIn(s.start, now));
  const time = $derived(clockIn(s.start));
  const days = $derived(daysText(daysIn(s, s.start)));
  const away = $derived(offsetAt(s.start, s.tz) !== offsetAt(s.start, localZone()));
  const mins = $derived(Math.max(1, Math.ceil((s.start - now) / 60000)));
  const notes = $derived([
    mins <= 60 ? "Starts in " + mins + " min" : "",
    away ? "Your time, " + clockIn(s.start, s.tz) + " in " + placeOf(s.tz) : "",
    s.going ? s.going + " coming" : "",
  ].filter(Boolean).join(" · "));
</script>

<div class="ucard">
  <span class="when"><small>{day}</small> {time}</span>
  <span class="rcard-main">
    <b>{s.title}</b>
    <span class="rcard-meta">{time}–{clockIn(s.end)}<i aria-hidden="true">·</i>{days}<i aria-hidden="true">·</i>{s.rhythm}</span>
    {#if notes || own}<span class="ucard-notes">{notes}{#if own}<button class="link" type="button" onclick={onremove}>Remove</button>{/if}</span>{/if}
  </span>
  <span class="rcard-side">
    <button class="rcard-go remind" type="button" aria-pressed={String(reminded)} onclick={onremind}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/></svg>Remind me</button>
  </span>
</div>
