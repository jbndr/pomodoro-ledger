import { ext, load } from "./ext.js";
import { APP_MATCHES, APP_URL, buildRules, entryFor, expandAll, grantPass, isAppUrl, livePasses, nextPasses, nextWake, originOf, shouldBlock, validateTimer } from "./lib.js";

const ALARM = "sync";
const page = ext.runtime.getURL("/blocked.html");

async function grantedHosts(domains) {
  const hosts = expandAll(domains);
  const ok = await Promise.all(hosts.map((h) => ext.permissions.contains({ origins: [originOf(h)] }).catch(() => false)));
  return new Set(hosts.filter((_, i) => ok[i]));
}

let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

const sync = () => serial(async () => {
  const now = Date.now();
  const { domains, timer, passes } = await load();
  const granted = await grantedHosts(domains);
  const rules = buildRules({ domains, granted, timer, passes, now, page });
  const old = await ext.declarativeNetRequest.getDynamicRules();
  await ext.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.map((r) => r.id), addRules: rules });
  const wake = nextWake(timer, passes, now);
  if (wake) ext.alarms.create(ALARM, { when: Math.max(wake, now + 1000) });
  else await ext.alarms.clear(ALARM);
});

async function onTimer(msg) {
  const timer = validateTimer(msg, Date.now());
  if (!timer) return { ok: false };
  const { passes } = await ext.storage.local.get("passes");
  await ext.storage.local.set({ timer, passes: nextPasses(passes, timer) });
  await sync();
  return { ok: true };
}

async function onPass(msg) {
  const now = Date.now();
  const { domains, timer, passes } = await load();
  const entry = typeof msg.host === "string" ? entryFor(domains, msg.host) : null;
  if (!entry || !shouldBlock(timer, now)) return { ok: true, open: true };
  if (livePasses(passes, now)[entry]) return { ok: true };
  const next = grantPass(passes, entry, now);
  if (!next) return { ok: false, left: 0 };
  await ext.storage.local.set({ passes: next });
  await sync();
  return { ok: true };
}

async function focusApp(origin) {
  const tabs = await ext.tabs.query({ url: APP_MATCHES });
  const tab = tabs.find((t) => t.url && new URL(t.url).origin === origin) || tabs.find((t) => t.url && t.url.startsWith(APP_URL));
  if (!tab) return { ok: false };
  await ext.tabs.update(tab.id, { active: true });
  await ext.windows.update(tab.windowId, { focused: true });
  return { ok: true };
}

ext.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== ext.runtime.id || !msg || typeof msg !== "object") return false;
  const fromPage = typeof sender.url === "string" && sender.url.startsWith(ext.runtime.getURL(""));
  let job;
  if (msg.type === "timer" && sender.tab && isAppUrl(sender.url)) {
    job = onTimer(msg).then(async (r) => { if (r.ok) await ext.storage.local.set({ app: new URL(sender.url).origin }); return r; });
  } else if (msg.type === "pass" && fromPage) job = onPass(msg);
  else if (msg.type === "sync" && fromPage) job = sync().then(() => ({ ok: true }));
  else if (msg.type === "focusApp" && fromPage) job = ext.storage.local.get("app").then(({ app }) => focusApp(app || new URL(APP_URL).origin));
  else return false;
  job.then(reply, () => reply({ ok: false }));
  return true;
});

ext.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) sync(); });
ext.storage.onChanged.addListener((changes, area) => { if (area === "sync" && changes.domains) sync(); });
ext.permissions.onAdded.addListener(() => sync());
ext.permissions.onRemoved.addListener(() => sync());
ext.runtime.onStartup.addListener(() => sync());
ext.runtime.onInstalled.addListener(() => sync());
sync();
