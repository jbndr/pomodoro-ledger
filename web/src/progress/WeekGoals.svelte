<script>
  import { addDays, keyTime, sod } from "../lib/dates";
  import { labelHue } from "../lib/tasks";

  let { api, week, today } = $props();

  const daysLeft = $derived(Math.round((addDays(keyTime(week.plan.week), 7) - sod(today)) / 864e5));
  const tip = (g) => "<b>" + api.esc(g.name || g.label) + "</b><br>" + g.cycles + " of " + api.plural(g.target, "cycle") + " · " + api.fmtDur(g.ms) + " focus";
</script>

<div class="week-goals" id="weekGoals">
  <div class="sec-head">
    <h3>This week</h3>
    <span class="sub">{daysLeft <= 1 ? "Last day" : daysLeft + " days left"}</span>
  </div>
  <ul>
    {#each week.goals as g (g.label)}
      <li class:reached={g.hit} data-tip={tip(g)}>
        <div class="wg-top">
          <span class="by-name"><i class="label-dot" style:--h={labelHue(g.label)}></i><span>{g.name || g.label}</span></span>
          <em>{g.cycles}<small>/{g.target}</small></em>
        </div>
        <div class="meter" role="img" aria-label={g.cycles + " of " + g.target + " cycles"}><b style:width={Math.min(100, (g.cycles / g.target) * 100) + "%"}></b></div>
        <span class="wg-sub">{g.name ? g.label + " · " : ""}{g.hit ? "Reached" : api.plural(g.target - g.cycles, "cycle") + " to go"}</span>
      </li>
    {/each}
  </ul>
</div>
