/** Tooltip lines for a day's focus split by label; empty when nothing was labeled. */
export function labelTip(api, byLabel) {
  if (!byLabel || ![...byLabel.keys()].some(Boolean)) return "";
  const rows = [...byLabel].sort((a, b) => b[1] - a[1]);
  return rows.slice(0, 4).map(([name, ms]) => "<br>" + api.esc(name || "No label") + " " + api.fmtDur(ms)).join("") + (rows.length > 4 ? "<br>+" + (rows.length - 4) + " more" : "");
}
