import { ext, load } from "./ext.js";
import { APP_URL, clock, entryFor, hostOf, livePasses, originalUrl, PASSES, plural, shouldBlock } from "./lib.js";

const $ = (id) => document.getElementById(id);
const url = originalUrl(location.href), host = url ? hostOf(url) : "";
let state = null, leaving = false;

$("site").textContent = host.replace(/^www\./, "") || "This site";

async function leave() {
  if (leaving || !url) return;
  leaving = true;
  try { await ext.runtime.sendMessage({ type: "sync" }); } catch {}
  location.replace(url);
}

function render() {
  if (!state) return;
  const now = Date.now(), { timer, domains, passes } = state, entry = entryFor(domains, host);
  if (url && (!shouldBlock(timer, now) || !entry || livePasses(passes, now)[entry])) { leave(); return; }
  const left = shouldBlock(timer, now) ? clock(timer.endsAt - now) : "00:00";
  $("left").textContent = left;
  document.title = left + " · Focus time";
  $("task").hidden = !timer?.task;
  $("taskName").textContent = timer?.task || "";
  const passLeft = PASSES - (passes?.used || 0);
  $("pass").hidden = !url || passLeft <= 0;
  $("passLeft").textContent = "(" + plural(passLeft, "pass", "passes") + " left)";
  if (passLeft <= 0 && !$("msg").textContent) $("msg").textContent = "No passes left this round.";
}

const refresh = async () => { state = await load(); render(); };

$("back").addEventListener("click", async () => {
  let r = null;
  try { r = await ext.runtime.sendMessage({ type: "focusApp" }); } catch {}
  if (r?.ok) return;
  const { app } = await ext.storage.local.get("app");
  location.href = app ? app + "/app/" : APP_URL;
});

$("pass").addEventListener("click", async () => {
  $("pass").disabled = true;
  let r = null;
  try { r = await ext.runtime.sendMessage({ type: "pass", host }); } catch {}
  if (r?.ok) { leave(); return; }
  $("msg").textContent = "No passes left this round.";
  $("pass").disabled = false;
  refresh();
});

ext.storage.onChanged.addListener(refresh);
setInterval(render, 1000);
refresh();
