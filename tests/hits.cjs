const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const strip = (f) => fs.readFileSync(f, 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '');
const clock = { now: null };
const FakeDate = class extends Date {
  constructor(...a) { super(...(a.length ? a : [clock.now ?? Date.now()])); }
  static now() { return clock.now ?? Date.now(); }
};
const mod = vm.runInNewContext(
  `const { accessEmail, syncConfigured } = (() => { ${strip('src/sync.js')}; return { accessEmail, syncConfigured }; })();\n${strip('src/hits.js')}\n({ Counts, hit, stats })`,
  {
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketRequestResponsePair: class {}, crypto: webcrypto, Date: FakeDate, Response, URL, TextEncoder, TextDecoder, atob, JSON,
    fetch: async () => { throw new Error('no network in tests'); },
  },
);

function sqlStorage() {
  const db = new DatabaseSync(':memory:');
  return {
    exec(query, ...binds) {
      const stmt = db.prepare(query);
      const rows = /^\s*select/i.test(query) ? stmt.all(...binds).map((r) => ({ ...r })) : (stmt.run(...binds), []);
      return { toArray: () => rows, one: () => rows[0] };
    },
  };
}

const ORIGIN = 'https://pomodoro.example';
function setup(vars = {}) {
  const counts = new mod.Counts({ storage: { sql: sqlStorage() } }, {});
  const env = { COUNTS: { idFromName: () => 'site', get: () => counts }, DEV_USER_EMAIL: 'me@example.test', STATS_EMAILS: 'Me@Example.test', ...vars };
  const send = async (p, e, init = {}) => {
    const url = new URL(ORIGIN + '/api/hit?' + new URLSearchParams({ p, e }));
    const pending = [];
    const res = mod.hit(new Request(url, { method: 'POST', headers: { Origin: ORIGIN }, ...init }), env, url, { waitUntil: (x) => pending.push(x) });
    await Promise.all(pending);
    return res;
  };
  const read = async (query = '', vars2 = {}) => {
    const url = new URL(ORIGIN + '/api/sync/stats' + query);
    return mod.stats(new Request(url), { ...env, ...vars2 }, url);
  };
  return { counts, send, read };
}

const at = (iso) => { clock.now = Date.parse(iso); };

test('allowlisted views and clicks are counted per UTC day', async () => {
  const { counts, send } = setup();
  at('2026-10-09T23:59:00Z');
  await send('/', 'view');
  at('2026-10-10T00:01:00Z');
  for (const e of ['view', 'view', 'open-app:hero', 'try-here:live']) assert.equal((await send('/', e)).status, 204);
  await send('/features', 'open-app:end');
  const key = (r) => [r.day, r.page, r.event].join(' ');
  assert.deepEqual(counts.since('2026-10-01').sort((a, b) => key(a).localeCompare(key(b))), [
    { day: '2026-10-09', page: '/', event: 'view', n: 1 },
    { day: '2026-10-10', page: '/', event: 'open-app:hero', n: 1 },
    { day: '2026-10-10', page: '/', event: 'try-here:live', n: 1 },
    { day: '2026-10-10', page: '/', event: 'view', n: 2 },
    { day: '2026-10-10', page: '/features', event: 'open-app:end', n: 1 },
  ].sort((a, b) => key(a).localeCompare(key(b))));
  clock.now = null;
});

test('unknown events, other pages, other origins and GETs are ignored', async () => {
  const { counts, send } = setup();
  const ignored = [
    send('/', 'open-app:sidebar'),
    send('/', 'try-here:live\u0000'),
    send('/features', 'try-here:live'),
    send('/app/', 'view'),
    send('/changelog', 'view'),
    send('/', 'view', { headers: { Origin: 'https://evil.example' } }),
    send('/', 'view', { headers: {} }),
    send('/', 'view', { method: 'GET' }),
    send('/', 'constructor'),
    send('__proto__', 'view'),
  ];
  for (const res of await Promise.all(ignored)) assert.equal(res.status, 204);
  assert.deepEqual(counts.since('2000-01-01'), []);
});

test('stats need an Access email listed in STATS_EMAILS', async () => {
  const { read } = setup();
  assert.equal((await read('', { STATS_EMAILS: undefined })).status, 403);
  assert.equal((await read('', { STATS_EMAILS: 'someone@example.test' })).status, 403);
  assert.equal((await read('', { STATS_EMAILS: '' })).status, 403);
  assert.equal((await read('', { DEV_USER_EMAIL: '' })).status, 404);
  assert.equal((await read('', { ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud' })).status, 401);
  const ok = await read('', { STATS_EMAILS: 'other@example.test, me@example.test' });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type'), /text\/html/);
  assert.match(await ok.text(), /Landing page/);
});

test('json has 30 zero-filled days, newest first, and full-day weekly totals', async () => {
  const { send, read } = setup();
  at('2026-10-02T10:00:00Z');
  await send('/', 'view');
  at('2026-10-09T10:00:00Z');
  await send('/', 'view');
  await send('/', 'view');
  await send('/', 'open-app:hero');
  at('2026-10-10T10:00:00Z');
  await send('/', 'view');
  const data = await (await read('?format=json')).json();
  clock.now = null;
  assert.equal(data.tz, 'UTC');
  assert.equal(data.today, '2026-10-10');
  assert.deepEqual(Object.keys(data.pages), ['/', '/features']);
  const home = data.pages['/'];
  assert.equal(home.days.length, 30);
  assert.equal(home.days[0].day, '2026-10-10');
  assert.equal(home.days.at(-1).day, '2026-09-11');
  assert.deepEqual(Object.keys(home.days[0]), ['day', 'view', 'open-app:header', 'open-app:hero', 'open-app:end', 'open-app:footer', 'try-demo:hero', 'try-demo:live', 'try-demo:end', 'try-demo:footer', 'try-here:live']);
  assert.equal(home.days[0].view, 1);
  assert.equal(home.days[1]['open-app:hero'], 1);
  assert.equal(home.last7.view, 2);
  assert.equal(home.last7['open-app:hero'], 1);
  assert.equal(home.prev7.view, 1);
  assert.deepEqual(Object.keys(data.pages['/features'].last7), ['view', 'open-app:header', 'open-app:end', 'open-app:footer', 'try-demo:end', 'try-demo:footer']);
});
