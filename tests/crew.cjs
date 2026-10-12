const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { transformSync } = require('esbuild');

const ts = (f) => transformSync(fs.readFileSync(f, 'utf8'), { loader: 'ts' }).code.replace(/^export /gm, '');
const push = fs.readFileSync('src/push.js', 'utf8').replace(/^export /gm, '');
const source = fs.readFileSync('src/worker.js', 'utf8')
  .replace(/^(import|export \{).*$/gm, '')
  .replace('export default', 'const worker =')
  .replace(/^export class /gm, 'class ');
const clock = { now: null };
const FakeDate = class extends Date { static now() { return clock.now ?? Date.now(); } };
const sent = [];
const { Crew, Room, worker } = vm.runInNewContext(ts('web/src/lib/schedule.ts') + ts('web/src/lib/crew.ts') + push + source + '\n({ Crew, Room, worker })', {
  DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
  WebSocketRequestResponsePair: class {}, crypto: webcrypto, Date: FakeDate, Intl, Request, JSON, URL, TextEncoder, btoa, atob,
  fetch: async () => { throw new Error('no network in tests'); },
  Response: class extends Response { constructor(body, init = {}) { super(body, init.status === 101 ? { status: 200 } : init); } },
  WebSocketPair: class { constructor() { this[0] = {}; this[1] = { accept() {}, close(code) { this.closed = code; } }; } },
});

const MIN = 60000;
const storage = (data) => {
  const s = {
    alarm: null,
    get: async (k) => data.get(k), put: async (k, v) => data.set(k, v),
    delete: async (k) => [].concat(k).forEach((x) => data.delete(x)),
    deleteAll: async () => data.clear(),
    setAlarm: async (t) => { s.alarm = t; }, getAlarm: async () => s.alarm, deleteAlarm: async () => { s.alarm = null; },
    list: async ({ prefix, limit }) => new Map([...data].filter(([k]) => k.startsWith(prefix)).slice(0, limit ?? Infinity)),
  };
  return s;
};

async function setup() {
  const data = new Map(), sockets = [];
  const ctx = { setWebSocketAutoResponse() {}, getWebSockets: () => sockets, storage: storage(data), acceptWebSocket: (ws) => sockets.push(ws) };
  const c = new Crew(ctx, {});
  await c.fetch(new Request('https://crew/open', { method: 'POST', body: JSON.stringify({ name: 'Thesis group', tz: 'Europe/Berlin', room: 'IABCDE' }) }));
  const socket = () => {
    const ws = {
      attachment: null, messages: [], closed: null,
      deserializeAttachment() { return this.attachment; },
      serializeAttachment(a) { this.attachment = a; },
      send(m) { this.messages.push(JSON.parse(m)); },
      close(code) { this.closed = code; const i = sockets.indexOf(this); if (i >= 0) sockets.splice(i, 1); },
    };
    sockets.push(ws);
    return ws;
  };
  const send = (ws, m) => c.webSocketMessage(ws, JSON.stringify(m));
  const hello = async (cid, name = cid, join = true) => { const ws = socket(); await send(ws, { t: 'hello', cid, name, join }); return ws; };
  const last = (ws) => ws.messages.filter((m) => m.t === 'crew').at(-1);
  const info = async () => (await c.fetch(new Request('https://crew/info'))).json();
  return { c, data, ctx, send, hello, last, info, sockets };
}

test('the first eight people with the link are the crew, and the crew says only its name and size to anyone', async () => {
  const { hello, last, info } = await setup();
  const all = [];
  for (let i = 0; i < 8; i++) all.push(await hello('cid-' + i, 'P' + i));
  const ninth = await hello('cid-9', 'Nine');
  assert.equal(ninth.closed, 4003);
  const seen = last(all[0]);
  assert.deepEqual([seen.crew.name, seen.crew.room, seen.members.length], ['Thesis group', 'IABCDE', 8]);
  assert.equal(JSON.stringify(seen).includes('cid-'), false, 'client ids stay private');
  assert.deepEqual({ ...(await info()) }, { name: 'Thesis group', size: 8, max: 8, slot: null });
  const again = await hello('cid-0', 'P0 renamed');
  assert.equal(again.closed, null, 'a member can come back from another tab');
  assert.equal(last(again).members.length, 8);
  assert.equal(last(again).members[0].name, 'P0 renamed');
});

test('presence: who is here and what their timer is doing, from their newest tab', async () => {
  const { hello, send, last, c } = await setup();
  const ana = await hello('a', 'Ana');
  const ben = await hello('b', 'Ben');
  await send(ben, { t: 'state', s: { mode: 'focus', status: 'running', remaining: 20 * MIN, total: 25 * MIN } });
  let ms = last(ana).members;
  assert.deepEqual(ms.map((m) => [m.name, m.on, m.s && m.s.status]), [['Ana', true, null], ['Ben', true, 'running']]);
  ben.close(1000);
  await c.webSocketClose(ben);
  ms = last(ana).members;
  assert.deepEqual(ms.map((m) => [m.name, m.on]), [['Ana', true], ['Ben', false]]);
});

test('a hidden member looks away to the crew, still sees everyone, and their rounds still count', async () => {
  clock.now = Date.parse('2026-10-14T08:00:00Z');
  try {
    const { hello, send, last, c } = await setup();
    const ana = await hello('a', 'Ana');
    const ben = await hello('b', 'Ben');
    await send(ana, { t: 'hide', on: true });
    assert.equal(last(ana).hide, true);
    assert.equal(last(ben).hide, false);
    assert.deepEqual(last(ben).members.map((m) => [m.name, m.on]), [['Ana', false], ['Ben', true]]);
    assert.deepEqual(last(ana).members.map((m) => [m.name, m.on]), [['Ana', true], ['Ben', true]], 'you still see yourself and the others');
    const heard = ben.messages.length;
    await send(ana, { t: 'state', s: { mode: 'focus', status: 'running', remaining: 25 * MIN, total: 25 * MIN } });
    clock.now += 25 * MIN;
    await send(ana, { t: 'state', s: { mode: 'short', status: 'running', remaining: 5 * MIN, total: 5 * MIN } });
    const tab = await hello('a', 'Ana');
    tab.close(1000);
    await c.webSocketClose(tab);
    assert.equal(ben.messages.length, heard, 'the crew hears nothing while a hidden member works or opens a tab');
    assert.equal(last(ana).members[0].s.mode, 'short');
    assert.equal(last(ana).week.mine, 1);
    await send(ana, { t: 'hide', on: false });
    assert.deepEqual(last(ben).members.map((m) => [m.name, m.on, m.s && m.s.mode]), [['Ana', true, 'short'], ['Ben', true, null]]);
    assert.equal(last(ben).week.n, 1);
  } finally { clock.now = null; }
});

test('finished focus rounds add up per crew week, counted once across tabs', async () => {
  clock.now = Date.parse('2026-10-14T08:00:00Z');
  try {
    const { hello, send, last } = await setup();
    const ana = await hello('a', 'Ana');
    const tab = await hello('a', 'Ana');
    const ben = await hello('b', 'Ben');
    const focus = (rem) => ({ t: 'state', s: { mode: 'focus', status: 'running', remaining: rem, total: 25 * MIN } });
    const rest = { t: 'state', s: { mode: 'short', status: 'running', remaining: 5 * MIN, total: 5 * MIN } };
    for (const ws of [ana, tab]) await send(ws, focus(25 * MIN));
    clock.now += 25 * MIN;
    for (const ws of [ana, tab]) await send(ws, rest);
    assert.deepEqual({ ...last(ben).week }, { n: 1, last: 0, mine: 0 });
    assert.equal(last(ana).week.mine, 1);
    await send(ben, focus(10 * MIN));
    await send(ben, rest);
    assert.equal(last(ana).week.n, 1, 'a skipped round does not count');
    clock.now = Date.parse('2026-10-19T08:00:00Z');
    await send(ben, focus(1000));
    clock.now += 1000;
    await send(ben, rest);
    assert.deepEqual({ ...last(ana).week }, { n: 1, last: 1, mine: 0 }, 'Monday starts a new week in the crew’s time zone');
  } finally { clock.now = null; }
});

test('members rename the crew and set its time; strangers and bad values change nothing', async () => {
  clock.now = Date.parse('2026-10-14T08:00:00Z');
  try {
    const { hello, send, last, sockets } = await setup();
    const ana = await hello('a', 'Ana');
    const stranger = { attachment: null, messages: [], deserializeAttachment() { return this.attachment; }, serializeAttachment(a) { this.attachment = a; }, send(m) { this.messages.push(JSON.parse(m)); }, close() {} };
    sockets.push(stranger);
    await send(stranger, { t: 'name', name: 'Taken over' });
    await send(ana, { t: 'name', name: '  Writing\u0000 club  ' });
    assert.equal(last(ana).crew.name, 'Writing club');
    await send(ana, { t: 'slot', slot: { tz: 'Europe/Berlin', days: [2, 4], from: 19 * 60, to: 21 * 60 } });
    assert.deepEqual({ ...last(ana).crew.slot, days: [...last(ana).crew.slot.days] }, { tz: 'Europe/Berlin', days: [2, 4], from: 1140, to: 1260 });
    await send(ana, { t: 'slot', slot: { tz: 'Mars/Base', days: [2], from: 60, to: 120 } });
    clock.now += 5000;
    await send(ana, { t: 'slot', slot: null });
    assert.equal(last(ana).crew.slot, null);
  } finally { clock.now = null; }
});

test('leaving takes you off the crew everywhere, and the last one out deletes it', async () => {
  const { hello, send, last, data } = await setup();
  const ana = await hello('a', 'Ana');
  const tab = await hello('a', 'Ana');
  const ben = await hello('b', 'Ben');
  await send(ana, { t: 'leave' });
  assert.equal(ana.closed, 4007);
  assert.equal(tab.closed, 4007);
  assert.deepEqual(last(ben).members.map((m) => m.name), ['Ben']);
  const stale = await hello('a', 'Ana', false);
  assert.equal(stale.closed, 4007, 'a tab reconnecting after you left does not put you back');
  assert.deepEqual(last(ben).members.map((m) => m.name), ['Ben']);
  await send(ben, { t: 'leave' });
  assert.equal(data.size, 0);
});

test('only members can ask for crew-time reminders', async () => {
  const { c, hello } = await setup();
  await hello('a', 'Ana');
  const ask = (cid, method = 'POST') => c.fetch(new Request('https://crew/push', { method, body: JSON.stringify({ cid, sub: {} }) }));
  assert.equal((await ask('nobody')).status, 403);
  assert.equal((await ask('a')).status, 503, 'push is off without VAPID keys');
  assert.equal((await ask('a', 'DELETE')).status, 204);
});

test('a crew nobody joins is gone after a day, and an idle one after 90 days', async () => {
  clock.now = Date.parse('2026-10-14T08:00:00Z');
  try {
    const empty = await setup();
    clock.now += 25 * 3600000;
    await empty.c.alarm();
    assert.equal(empty.data.size, 0);
    clock.now = Date.parse('2026-10-14T08:00:00Z');
    const used = await setup();
    const ana = await used.hello('a', 'Ana');
    ana.close(1000);
    clock.now += 30 * 24 * 3600000;
    await used.c.alarm();
    assert.equal(used.data.has('crew'), true);
    clock.now += 61 * 24 * 3600000;
    await used.c.alarm();
    assert.equal(used.data.size, 0);
  } finally { clock.now = null; }
});

test('a crew room opens without an owner and lets in only the crew', async () => {
  const data = new Map(), sockets = [], asked = [];
  const env = { CREW: { idFromName: (c) => c, get: (c) => ({ fetch: async (_, init) => { const b = JSON.parse(init.body); asked.push([c, b.cid, b.room]); return new Response(null, { status: c === 'VCFMP6QK' && b.cid === 'a' ? 204 : 403 }); } }) } };
  const r = new Room({ setWebSocketAutoResponse() {}, getWebSockets: () => sockets, storage: storage(data), acceptWebSocket: (ws) => sockets.push(ws) }, env);
  await r.fetch(new Request('https://x/api/room/IABCDE/ws', { headers: { Upgrade: 'websocket' } }));
  assert.equal(typeof data.get('open'), 'number');
  assert.equal(data.has('cfg'), false);
  assert.equal(data.has('ownerToken'), false);
  sockets.length = 0;
  const knock = async (m) => {
    const ws = { attachment: null, messages: [], closed: null, deserializeAttachment() { return this.attachment; }, serializeAttachment(a) { this.attachment = a; }, send(x) { this.messages.push(JSON.parse(x)); }, close(code) { this.closed = code; } };
    sockets.push(ws);
    await r.webSocketMessage(ws, JSON.stringify({ t: 'hello', id: 'tab-' + Math.random(), name: 'X', ...m }));
    return ws;
  };
  assert.equal((await knock({})).closed, 4008);
  assert.equal((await knock({ crew: 'VCFMP6QK', cid: 'stranger' })).closed, 4008);
  const ana = await knock({ crew: 'VCFMP6QK', cid: 'a' });
  assert.equal(ana.closed, null);
  assert.equal(ana.attachment.owner, false);
  assert.deepEqual(asked.at(-1), ['VCFMP6QK', 'a', 'IABCDE']);
});

test('a crew answers whether someone is a member of its room', async () => {
  const { c, hello } = await setup();
  await hello('a', 'Ana');
  const ask = (cid, room) => c.fetch(new Request('https://crew/member', { method: 'POST', body: JSON.stringify({ cid, room }) }));
  assert.equal((await ask('a', 'IABCDE')).status, 204);
  assert.equal((await ask('a', 'IZZZZZ')).status, 403);
  assert.equal((await ask('b', 'IABCDE')).status, 403);
});

test('quick edits to crew time all land', async () => {
  clock.now = Date.parse('2026-10-14T08:00:00Z');
  try {
    const { hello, send, last } = await setup();
    const ana = await hello('a', 'Ana');
    for (let i = 0; i < 6; i++) { await send(ana, { t: 'slot', slot: { tz: 'Europe/Berlin', days: [2], from: 600 + i * 30, to: 720 + i * 30 } }); clock.now += 600; }
    assert.equal(last(ana).crew.slot.from, 750);
  } finally { clock.now = null; }
});

test('making a crew needs a name and a real time zone', async () => {
  const opened = [];
  const env = {
    CREW: { idFromName: (c) => c, get: () => ({ fetch: async (_, init) => { opened.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); } }) },
    LOBBY: { idFromName: () => 'lobby', get: () => ({ fetch: async () => new Response(null, { status: 204 }) }) },
  };
  const make = (body) => worker.fetch(new Request('https://x/api/crew', { method: 'POST', body: JSON.stringify(body) }), env);
  const ok = await make({ name: 'Thesis group', tz: 'Europe/Berlin' });
  assert.match((await ok.json()).code, /^[A-HJKMNP-Z2-9]{8}$/);
  assert.match(opened[0].room, /^I[A-HJKMNP-Z2-9]{5}$/);
  assert.equal((await make({ name: '', tz: 'Europe/Berlin' })).status, 400);
  assert.equal((await make({ name: 'X', tz: 'Nowhere/Land' })).status, 400);
});
