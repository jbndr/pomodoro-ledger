import { ext, load } from "./ext.js";
import { shouldBlock, statusLine } from "./lib.js";

const $ = (id) => document.getElementById(id);
let state = null;

function render() {
  if (!state) return;
  const now = Date.now(), { timer, domains } = state, on = shouldBlock(timer, now) && domains.length > 0;
  $("status").dataset.on = String(on);
  $("line").textContent = statusLine(timer, domains, now);
  $("sub").textContent = on && timer.task ? "Working on " + timer.task : domains.length ? "" : "Add the sites that pull you away.";
  $("sub").hidden = !$("sub").textContent;
}

const refresh = async () => {
  state = await load();
  const { app } = await ext.storage.local.get("app");
  if (app) $("app").href = app + "/";
  render();
};

$("options").addEventListener("click", () => { ext.runtime.openOptionsPage(); window.close(); });
ext.storage.onChanged.addListener(refresh);
setInterval(render, 1000);
refresh();
