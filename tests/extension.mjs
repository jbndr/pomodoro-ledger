import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BLOCK_RULE, buildRules, clock, cleanList, entryFor, expandAll, expandDomain, FALLBACK_RULE, grantPass, HOUR, isAppUrl, MIN,
  nextPasses, nextWake, normalizeDomain, originalUrl, PASS_MS, PASS_RULE, PRESETS, shouldBlock, statusLine, validateTimer,
} from "../extension/lib.js";

const NOW = 1_800_000_000_000;
const PAGE = "chrome-extension://abc/blocked.html";
const running = (over = {}) => ({ mode: "focus", status: "running", endsAt: NOW + 20 * MIN, task: null, at: NOW, ...over });

test("normalizeDomain strips scheme, path, port and www", () => {
  assert.equal(normalizeDomain("https://www.YouTube.com/watch?v=1"), "youtube.com");
  assert.equal(normalizeDomain("  reddit.com/r/all  "), "reddit.com");
  assert.equal(normalizeDomain("http://user:pw@news.ycombinator.com:8080/item"), "news.ycombinator.com");
  assert.equal(normalizeDomain("*.example.com"), "example.com");
  assert.equal(normalizeDomain("example.com."), "example.com");
  assert.equal(normalizeDomain("bücher.de"), "xn--bcher-kva.de");
  assert.equal(normalizeDomain("amazon.*"), "amazon.*");
});

test("normalizeDomain rejects what isn't a hostname", () => {
  for (const bad of ["", "   ", "localhost", "foo", "exa mple.com", "-bad.com", "bad-.com", "1.2.3.4", "a..com", "*.*", "ex_ample.com", "javascript:alert(1)", null, 42, "a".repeat(64) + ".com"]) {
    assert.equal(normalizeDomain(bad), null, String(bad));
  }
});

test("cleanList normalises, drops junk and duplicates", () => {
  assert.deepEqual(cleanList(["www.x.com", "x.com", "nope", "https://twitch.tv/"]), ["x.com", "twitch.tv"]);
  assert.deepEqual(cleanList("x.com"), []);
});

test("wildcard entries expand to common TLDs", () => {
  const hosts = expandDomain("amazon.*");
  assert.ok(hosts.includes("amazon.com") && hosts.includes("amazon.co.uk") && hosts.includes("amazon.de"));
  assert.deepEqual(expandDomain("x.com"), ["x.com"]);
  assert.equal(new Set(expandAll(["x.com", "x.com", "amazon.*"])).size, expandAll(["x.com", "x.com", "amazon.*"]).length);
});

test("presets hold valid entries", () => {
  for (const sites of Object.values(PRESETS)) for (const d of sites) assert.equal(normalizeDomain(d), d);
  assert.ok(PRESETS.Social.includes("x.com") && PRESETS.Video.includes("youtube.com") && PRESETS.Shopping.includes("amazon.*"));
});

test("entryFor matches subdomains and wildcard TLDs", () => {
  const list = ["youtube.com", "amazon.*"];
  assert.equal(entryFor(list, "m.youtube.com"), "youtube.com");
  assert.equal(entryFor(list, "www.amazon.co.uk"), "amazon.*");
  assert.equal(entryFor(list, "notyoutube.com"), null);
});

test("validateTimer accepts a running focus round", () => {
  assert.deepEqual(validateTimer({ type: "timer", mode: "focus", status: "running", endsAt: NOW + 25 * MIN, task: " Write " }, NOW),
    { mode: "focus", status: "running", endsAt: NOW + 25 * MIN, task: "Write", at: NOW });
  assert.deepEqual(validateTimer({ type: "timer", mode: "short", status: "paused", endsAt: null }, NOW),
    { mode: "short", status: "paused", endsAt: null, task: null, at: NOW });
  assert.equal(validateTimer({ type: "timer", mode: "focus", status: "running", endsAt: NOW + 25 * MIN, task: "x".repeat(500) }, NOW).task.length, 200);
});

test("validateTimer rejects anything off", () => {
  const ok = { type: "timer", mode: "focus", status: "running", endsAt: NOW + MIN, task: null };
  for (const bad of [
    null, "timer", { ...ok, type: "other" }, { ...ok, mode: "nap" }, { ...ok, status: "done" },
    { ...ok, endsAt: "soon" }, { ...ok, endsAt: NaN }, { ...ok, endsAt: Infinity }, { ...ok, endsAt: null },
    { ...ok, endsAt: NOW + 4 * HOUR }, { ...ok, endsAt: NOW - 10 * MIN }, { ...ok, status: "paused" }, { ...ok, task: 5 },
  ]) assert.equal(validateTimer(bad, NOW), null, JSON.stringify(bad));
});

test("shouldBlock only during a running focus round", () => {
  assert.equal(shouldBlock(running(), NOW), true);
  assert.equal(shouldBlock(running({ status: "paused", endsAt: null }), NOW), false);
  assert.equal(shouldBlock(running({ mode: "short" }), NOW), false);
  assert.equal(shouldBlock(running(), NOW + 20 * MIN), false);
  assert.equal(shouldBlock(running({ at: NOW - 3 * HOUR - 1, endsAt: NOW + MIN }), NOW), false);
  assert.equal(shouldBlock(null, NOW), false);
});

test("buildRules redirects granted sites and plainly blocks the rest", () => {
  const rules = buildRules({ domains: ["example.com", "x.com"], granted: new Set(["example.com"]), timer: running(), passes: null, now: NOW, page: PAGE });
  assert.deepEqual(rules, [
    { id: BLOCK_RULE, priority: 1, action: { type: "redirect", redirect: { regexSubstitution: PAGE + "?u=\\0" } }, condition: { regexFilter: "^.+$", requestDomains: ["example.com"], resourceTypes: ["main_frame"] } },
    { id: FALLBACK_RULE, priority: 1, action: { type: "block" }, condition: { requestDomains: ["x.com"], resourceTypes: ["main_frame"] } },
  ]);
});

test("buildRules is empty when not blocking or the list is empty", () => {
  const base = { domains: ["example.com"], granted: new Set(["example.com"]), passes: null, now: NOW, page: PAGE };
  assert.deepEqual(buildRules({ ...base, timer: running({ status: "paused", endsAt: null }) }), []);
  assert.deepEqual(buildRules({ ...base, timer: running({ mode: "long" }) }), []);
  assert.deepEqual(buildRules({ ...base, domains: [], timer: running() }), []);
});

test("a pass adds a higher priority allow rule until it runs out", () => {
  const passes = grantPass(null, "amazon.*", NOW);
  const base = { domains: ["amazon.*"], granted: new Set(), timer: running(), passes, page: PAGE };
  const allow = buildRules({ ...base, now: NOW }).find((r) => r.id === PASS_RULE);
  assert.equal(allow.priority, 2);
  assert.equal(allow.action.type, "allow");
  assert.ok(allow.condition.requestDomains.includes("amazon.de"));
  assert.equal(buildRules({ ...base, now: NOW + PASS_MS }).some((r) => r.id === PASS_RULE), false);
});

test("passes are limited per round and reset when focus stops", () => {
  let p = null;
  for (let i = 0; i < 3; i++) p = grantPass(p, "x.com", NOW);
  assert.equal(p.used, 3);
  assert.equal(grantPass(p, "x.com", NOW), null);
  assert.equal(nextPasses(p, running({ status: "paused", endsAt: null })), p);
  assert.deepEqual(nextPasses(p, running({ mode: "short" })), { used: 0, allow: {} });
  assert.deepEqual(nextPasses(p, running({ status: "idle", endsAt: null })), { used: 0, allow: {} });
});

test("nextWake is the round's end or the next pass to expire", () => {
  assert.equal(nextWake(running(), null, NOW), NOW + 20 * MIN);
  assert.equal(nextWake(running(), grantPass(null, "x.com", NOW), NOW), NOW + PASS_MS);
  assert.equal(nextWake(running({ mode: "short" }), null, NOW), null);
});

test("statusLine reads like the popup", () => {
  const nine = Array.from({ length: 9 }, (_, i) => "s" + i + ".com");
  assert.equal(statusLine(running({ endsAt: NOW + 18 * MIN + 24000 }), nine, NOW), "Blocking 9 sites · 18:24 left");
  assert.equal(statusLine(running({ status: "paused", endsAt: null }), nine, NOW), "Not blocking. Starts with your next focus round.");
  assert.equal(statusLine(running(), ["x.com"], NOW), "Blocking 1 site · 20:00 left");
  assert.equal(clock(61_001), "01:02");
});

test("originalUrl keeps the raw URL and only allows web pages", () => {
  assert.equal(originalUrl(PAGE + "?u=https://example.com/a?b=1&c=2"), "https://example.com/a?b=1&c=2");
  assert.equal(originalUrl(PAGE + "?u=javascript:alert(1)"), null);
  assert.equal(originalUrl(PAGE), null);
});

test("isAppUrl knows the app's origins", () => {
  assert.equal(isAppUrl("https://pomodoro.jbndr.com/?demo=1"), true);
  assert.equal(isAppUrl("http://localhost:8799/"), true);
  assert.equal(isAppUrl("http://pomodoro.jbndr.com/"), false);
  assert.equal(isAppUrl("https://pomodoro.jbndr.com.evil.com/"), false);
});
