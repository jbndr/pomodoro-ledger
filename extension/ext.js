import { cleanList } from "./lib.js";

export const ext = globalThis.browser ?? globalThis.chrome;

export async function load() {
  const [{ domains = [] }, { timer = null, passes = null }] = await Promise.all([
    ext.storage.sync.get("domains"),
    ext.storage.local.get(["timer", "passes"]),
  ]);
  return { domains: cleanList(domains), timer, passes };
}
