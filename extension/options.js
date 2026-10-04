import { ext } from "./ext.js";
import { cleanList, expandAll, expandDomain, normalizeDomain, originOf, PRESETS, plural } from "./lib.js";

const $ = (id) => document.getElementById(id);
let list = [];

const read = async () => cleanList((await ext.storage.sync.get("domains")).domains);
const save = (next) => ext.storage.sync.set({ domains: next });

function ask(entries) {
  try { return ext.permissions.request({ origins: expandAll(entries).map(originOf) }).catch(() => false); } catch { return Promise.resolve(false); }
}

const granted = (entry) => ext.permissions.contains({ origins: expandDomain(entry).map(originOf) }).catch(() => false);

async function add(entries) {
  const asked = ask(entries);
  list = [...new Set([...(await read()), ...entries])];
  await save(list);
  await asked;
  render();
}

async function remove(entries) {
  list = (await read()).filter((d) => !entries.includes(d));
  await save(list);
  const keep = new Set(expandAll(list));
  const drop = expandAll(entries).filter((h) => !keep.has(h)).map(originOf);
  if (drop.length) await ext.permissions.remove({ origins: drop }).catch(() => {});
  render();
}

function renderPresets() {
  $("presets").replaceChildren(...Object.entries(PRESETS).map(([name, sites]) => {
    const on = sites.every((d) => list.includes(d)), b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.setAttribute("aria-pressed", String(on));
    b.title = (on ? "Remove " : "Add ") + sites.join(", ");
    b.append(name + " ", Object.assign(document.createElement("small"), { textContent: on ? "added" : "+" + sites.filter((d) => !list.includes(d)).length }));
    b.addEventListener("click", () => (on ? remove(sites) : add(sites.filter((d) => !list.includes(d)))));
    return b;
  }));
}

async function render() {
  list = await read();
  const sorted = [...list].sort((a, b) => a.localeCompare(b));
  const access = await Promise.all(sorted.map(granted));
  $("list").replaceChildren(...sorted.map((d, i) => {
    const li = document.createElement("li"), name = document.createElement("span"), x = document.createElement("button");
    name.className = "name"; name.textContent = d;
    if (!access[i]) name.append(Object.assign(document.createElement("small"), { textContent: "No access" }));
    x.type = "button"; x.className = "x"; x.textContent = "×"; x.setAttribute("aria-label", "Remove " + d);
    x.addEventListener("click", () => remove([d]));
    li.append(name, x);
    return li;
  }));
  const missing = sorted.filter((_, i) => !access[i]);
  $("access").hidden = !missing.length;
  $("accessText").textContent = (missing.length === 1 ? missing[0] + " shows" : plural(missing.length, "site") + " show") + " the browser's error page instead of the focus page.";
  $("allow").onclick = () => ask(missing).then(render);
  $("empty").hidden = list.length > 0;
  $("count").textContent = list.length ? plural(list.length, "site") : "";
  renderPresets();
}

$("add").addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = $("domain").value, d = normalizeDomain(raw);
  if (!raw.trim()) return;
  if (!d) { $("err").textContent = "That doesn't look like a site. Try something like youtube.com."; return; }
  if (list.includes(d)) { $("err").textContent = d + " is already on your list."; return; }
  $("err").textContent = "";
  $("domain").value = "";
  add([d]);
});
$("domain").addEventListener("input", () => { $("err").textContent = ""; });

ext.storage.onChanged.addListener((changes, area) => { if (area === "sync" && changes.domains) render(); });
ext.permissions.onAdded?.addListener(render);
ext.permissions.onRemoved?.addListener(render);
render();
