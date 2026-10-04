const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const { transformSync } = require('esbuild');

const schedule = transformSync(fs.readFileSync('web/src/lib/schedule.ts', 'utf8'), { loader: 'ts' }).code.replace(/^export /gm, '');
const source = fs.readFileSync('src/worker.js', 'utf8')
  .replace(/^(import|export \{).*$/gm, '')
  .replace('export default', 'const worker =')
  .replace(/^export class /gm, 'class ');
const clock = { now: null };
const FakeDate = class extends Date { static now() { return clock.now ?? Date.now(); } };
const { Room, Lobby, worker } = vm.runInNewContext(schedule + source + '\n({ Room, Lobby, worker })', {
  DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
  WebSocketRequestResponsePair: class {}, crypto: webcrypto, Date: FakeDate, Intl, Request, JSON, URL,
  Response: class extends Response { constructor(body, init = {}) { super(body, init.status === 101 ? { status: 200 } : init); } },
  WebSocketPair: class { constructor() { this[0] = {}; this[1] = { accept() {}, close(code) { this.closed = code; } }; } },
});
const { nextSession, sessionCode } = vm.runInNewContext(schedule + '\n({ nextSession, sessionCode })', { Date, Intl });

const storage = (data) => ({
  get: async (k) => data.get(k), put: async (k, v) => data.set(k, v),
  delete: async (k) => [].concat(k).forEach((x) => data.delete(x)), setAlarm: async () => {},
  list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix))),
});

function setup(cfg) {
  const data = new Map([['ownerToken', 'private-creator-token']]);
  if (cfg) data.set('cfg', cfg);
  const sockets = [], reports = [];
  const ctx = { setWebSocketAutoResponse() {}, getWebSockets: () => sockets, storage: storage(data) };
  const env = { LOBBY: { idFromName: () => 'lobby', get: () => ({ fetch: async (_, init) => { reports.push(JSON.parse(init.body)); } }) } };
  const room = new Room(ctx, env);
  const socket = () => {
    const ws = {
      attachment: null, messages: [], closed: null,
      deserializeAttachment() { return this.attachment; },
      serializeAttachment(a) { this.attachment = a; },
      send(m) { this.messages.push(JSON.parse(m)); },
      close(code) { this.closed = code; },
    };
    sockets.push(ws);
    return ws;
  };
  const leave = async (ws) => { await room.webSocketClose(ws); sockets.splice(sockets.indexOf(ws), 1); };
  const send = (ws, message) => room.webSocketMessage(ws, JSON.stringify(message));
  const hello = async (id, ownerToken) => {
    const ws = socket();
    await send(ws, { t: 'hello', id, name: id, ownerToken });
    return ws;
  };
  return { room, data, send, hello, leave, reports };
}

test('only creator token grants removal permission; reconnect preserves it', async () => {
  const { hello, send } = setup();
  const host = await hello('host', 'private-creator-token');
  const guest = await hello('guest', 'wrong-token');
  assert.equal(host.attachment.owner, true);
  assert.equal(guest.attachment.owner, false);
  await send(guest, { t: 'kick', id: host.attachment.pub });
  assert.equal(host.closed, null);
  assert.equal(JSON.stringify(guest.messages).includes('private-creator-token'), false);
  const reconnect = await hello('host', 'private-creator-token');
  assert.equal(host.closed, 4001);
  assert.equal(reconnect.attachment.owner, true);
  await send(reconnect, { t: 'kick', id: guest.attachment.pub });
  assert.equal(guest.closed, 4005);
  assert.equal(guest.attachment, null);
  assert.equal(reconnect.messages.at(-1).members.length, 1);
});

test('removing proposer clears sync request and notifies remaining members', async () => {
  const { hello, send, data } = setup();
  const host = await hello('host', 'private-creator-token');
  const guest = await hello('guest');
  const guestId = guest.attachment.pub;
  data.set('prop', { by: guestId, yes: [guestId], ends: Date.now() + 30000 });
  await send(host, { t: 'kick', id: guestId });
  assert.equal(data.has('prop'), false);
  assert.equal(host.messages.at(-1).prop, null);
});

test('existing rooms without creator token grant no owner permission', async () => {
  const { hello, data } = setup();
  data.delete('ownerToken');
  const guest = await hello('guest');
  assert.equal(guest.attachment.owner, false);
});

const pub = { pub: true, house: false, code: 'KXR4TZ', title: 'Thesis writing', rhythm: '50/10', max: 12 };

test('public rooms have no owner and ignore kicks and sync requests', async () => {
  const { hello, send, data } = setup(pub);
  const host = await hello('host', 'private-creator-token');
  const guest = await hello('guest');
  assert.equal(host.attachment.owner, false);
  await send(host, { t: 'kick', id: guest.attachment.pub });
  assert.equal(guest.closed, null);
  await send(guest, { t: 'state', s: { mode: 'focus', status: 'running', remaining: 60000, total: 60000 } });
  await send(guest, { t: 'propose' });
  assert.equal(data.has('prop'), false);
  assert.deepEqual(host.messages.at(-1).pub, { title: 'Thesis writing', rhythm: '50/10', house: false, max: 12 });
  assert.equal(host.messages.at(-1).members.find((m) => m.name === 'guest').s.status, 'running');
});

test('public rooms report who is in them to the lobby', async () => {
  const { hello, leave, reports } = setup(pub);
  const a = await hello('ana');
  await hello('ben');
  assert.deepEqual(reports.at(-1), { code: 'KXR4TZ', title: 'Thesis writing', rhythm: '50/10', house: false, max: 12, names: ['ana', 'ben'] });
  await leave(a);
  assert.deepEqual(reports.at(-1).names, ['ben']);
});

test('private rooms stay off the lobby', async () => {
  const { hello, reports } = setup();
  const host = await hello('host');
  assert.equal(reports.length, 0);
  assert.equal(host.messages.at(-1).pub, null);
});

function lobby() {
  const data = new Map();
  const l = new Lobby({ storage: storage(data) });
  const put = (r) => l.fetch(new Request('https://lobby/rooms', { method: 'POST', body: JSON.stringify(r) }));
  const list = async () => (await l.fetch(new Request('https://lobby/rooms'))).json();
  const call = async (method, path, body, ip = '10.0.0.1') => {
    const res = await l.fetch(new Request('https://lobby' + path, { method, body: body && JSON.stringify(body), headers: { 'x-ip': ip } }));
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  return { data, put, list, call, l };
}

test('lobby always offers one open house room per rhythm', async () => {
  const { list } = lobby();
  const { rooms } = await list();
  assert.deepEqual(rooms.map((r) => [r.code, r.title, r.rhythm, r.house, r.max, r.names.length]), [
    ['OPENPA', 'Pomodoro', '25/5', true, 12, 0],
    ['OPENDA', 'Deep work', '50/10', true, 12, 0],
  ]);
});

test('a full house room spills over into the next one', async () => {
  const { put, list } = lobby();
  await put({ code: 'OPENPA', title: 'Pomodoro', rhythm: '25/5', house: true, max: 12, names: Array.from({ length: 12 }, (_, i) => 'p' + i) });
  const { rooms } = await list();
  assert.deepEqual(rooms.filter((r) => r.rhythm === '25/5').map((r) => [r.code, r.title, r.names.length]), [['OPENPA', 'Pomodoro', 12], ['OPENPB', 'Pomodoro 2', 0]]);
});

test('lobby lists rooms people are in and drops empty or silent ones', async () => {
  const { put, list, data } = lobby();
  await put({ ...pub, names: ['ana'] });
  await put({ ...pub, code: 'QQQQQQ', names: ['ben'] });
  assert.deepEqual((await list()).rooms.filter((r) => !r.house).map((r) => r.code), ['KXR4TZ', 'QQQQQQ']);
  await put({ ...pub, names: [] });
  data.get('r:QQQQQQ').at -= 13 * 60000;
  assert.deepEqual((await list()).rooms.filter((r) => !r.house), []);
  assert.equal(data.size, 0);
});

test('a public room turns people away once it reaches its size', async () => {
  const { hello } = setup({ ...pub, max: 2 });
  await hello('ana');
  const ben = await hello('ben');
  const cy = await hello('cy');
  assert.equal(ben.closed, null);
  assert.equal(cy.closed, 4003);
  assert.equal(ben.messages.at(-1).members.length, 2);
});

test('opening a public room keeps its size between 2 and 12', async () => {
  const opened = [];
  const env = { ROOM: { idFromName: (c) => c, get: () => ({ fetch: async (_, init) => { opened.push(JSON.parse(init.body).cfg); return new Response(null, { status: 204 }); } }) } };
  const open = (body) => worker.fetch(new Request('https://x/api/room', { method: 'POST', body: JSON.stringify(body) }), env);
  for (const max of [1, 0, 7, 40, undefined, 'lots']) await open({ pub: true, title: 'Focus', rhythm: '25/5', max });
  assert.deepEqual(opened.map((c) => c.max), [2, 2, 7, 12, 12, 12]);
  assert.equal((await open({ pub: true, title: 'Focus', rhythm: '30/30', max: 4 })).status, 400);
});

const reactsOf = (ws) => ws.messages.filter((m) => m.t === 'react');
const notesOf = (ws) => ws.messages.filter((m) => m.t === 'note');

test('reactions reach everyone else with only the public id, name and emoji', async () => {
  const { hello, send } = setup();
  const ana = await hello('ana');
  const ben = await hello('ben');
  const cy = await hello('cy');
  await send(ana, { t: 'state', s: { mode: 'focus', status: 'running', remaining: 60000, total: 60000 } });
  await send(ana, { t: 'react', e: '🎉' });
  assert.deepEqual(reactsOf(ben), [{ t: 'react', by: ana.attachment.pub, name: 'ana', e: '🎉' }]);
  assert.deepEqual(reactsOf(cy), reactsOf(ben));
  assert.deepEqual(reactsOf(ana), []);
});

test('reactions only allow the fixed emoji set', async () => {
  const { hello, send } = setup();
  const ana = await hello('ana');
  const ben = await hello('ben');
  for (const e of ['hello there', '💩', '🎉🎉', '', null, ['🎉'], { e: '🎉' }]) await send(ana, { t: 'react', e });
  assert.deepEqual(reactsOf(ben), []);
  assert.equal(ana.attachment.rb, null);
});

test('a burst of reactions is capped, noted once, then refills slowly', async () => {
  const { hello, send } = setup();
  const ana = await hello('ana');
  const ben = await hello('ben');
  for (let i = 0; i < 12; i++) await send(ana, { t: 'react', e: '🔥' });
  assert.equal(reactsOf(ben).length, 5);
  assert.equal(notesOf(ana).length, 1);
  ana.attachment.rb.at -= 4000;
  await send(ana, { t: 'react', e: '👍' });
  await send(ana, { t: 'react', e: '👍' });
  assert.deepEqual(reactsOf(ben).slice(5).map((m) => m.e), ['👍']);
  assert.equal(notesOf(ana).length, 2);
  assert.equal(notesOf(ben).length, 0);
});

test('rejoining keeps the reaction limit', async () => {
  const { hello, send } = setup();
  await hello('ana').then(async (ana) => { for (let i = 0; i < 5; i++) await send(ana, { t: 'react', e: '👋' }); });
  const ben = await hello('ben');
  const again = await hello('ana');
  await send(again, { t: 'react', e: '👋' });
  assert.equal(reactsOf(ben).length, 0);
  assert.equal(notesOf(again).length, 1);
});

test('public rooms carry reactions too', async () => {
  const { hello, send } = setup(pub);
  const ana = await hello('ana');
  const ben = await hello('ben');
  await send(ben, { t: 'react', e: '☕' });
  assert.deepEqual(reactsOf(ana).map((m) => [m.name, m.e]), [['ben', '☕']]);
});

test('reactions need a hello first', async () => {
  const { hello, room } = setup();
  const ben = await hello('ben');
  const stranger = { deserializeAttachment: () => null, send() {}, close() {} };
  await room.webSocketMessage(stranger, JSON.stringify({ t: 'react', e: '🎉' }));
  assert.deepEqual(reactsOf(ben), []);
});

const MIN = 60000, DAY = 24 * 60 * MIN;
const MON_10_BERLIN = Date.parse('2026-10-05T08:00:00Z');
const deepWork = { title: 'Deep work', rhythm: '50/10', max: 8, tz: 'Europe/Berlin', days: [1, 2, 3, 4, 5], from: 9 * 60, to: 12 * 60 };
const at = (t, fn) => async () => { clock.now = t; try { await fn(); } finally { clock.now = null; } };

test('a schedule is upcoming, then a live room for that day, then upcoming again', at(MON_10_BERLIN - 2 * 60 * MIN, async () => {
  const { call, list } = lobby();
  const made = await call('POST', '/schedule', deepWork);
  assert.equal(made.status, 201);
  assert.match(made.body.id, /^[A-Z2-9]{3}$/);
  assert.equal(typeof made.body.token, 'string');
  let { upcoming, rooms } = await list();
  assert.deepEqual(upcoming.map((u) => [u.title, u.start, u.end, u.going]), [['Deep work', Date.parse('2026-10-05T07:00:00Z'), Date.parse('2026-10-05T10:00:00Z'), 0]]);
  assert.equal(JSON.stringify(upcoming).includes(made.body.token), false);
  clock.now = MON_10_BERLIN;
  ({ upcoming, rooms } = await list());
  assert.deepEqual(upcoming, []);
  const live = rooms.find((r) => r.sched);
  assert.deepEqual([live.code, live.title, live.rhythm, live.max, live.names, live.ends], [sessionCode(made.body.id, Date.parse('2026-10-05T07:00:00Z')), 'Deep work', '50/10', 8, [], Date.parse('2026-10-05T10:00:00Z')]);
  clock.now = Date.parse('2026-10-05T10:00:00Z');
  ({ upcoming, rooms } = await list());
  assert.equal(rooms.some((r) => r.sched), false);
  assert.equal(upcoming[0].start, Date.parse('2026-10-06T07:00:00Z'));
}));

test('creating a schedule checks the title, rhythm, size and times', at(MON_10_BERLIN, async () => {
  const { call, data } = lobby();
  const made = await call('POST', '/schedule', { ...deepWork, title: '  Thesis\u0000 writing\n\n with a much longer name than fits ', max: 40 }, 'a');
  assert.equal(made.body.title, 'Thesis writing with a much longe');
  assert.equal(made.body.max, 12);
  for (const bad of [{ title: '\u0007 ' }, { rhythm: '30/30' }, { tz: 'Nowhere/Land' }, { days: [] }, { from: 600, to: 600 }, { from: 0, to: 600 }, { from: 545 }, { rhythm: '50/10', from: 570, to: 690 }]) {
    assert.equal((await call('POST', '/schedule', { ...deepWork, ...bad }, 'b')).status, 400);
  }
  assert.equal([...data.keys()].filter((k) => k.startsWith('s:')).length, 1);
}));

test('each address can create a few schedules, then has to wait', at(MON_10_BERLIN, async () => {
  const { call } = lobby();
  for (let i = 0; i < 3; i++) assert.equal((await call('POST', '/schedule', deepWork, 'a')).status, 201);
  assert.equal((await call('POST', '/schedule', deepWork, 'a')).status, 429);
  assert.equal((await call('POST', '/schedule', deepWork, 'b')).status, 201);
  clock.now += 20 * MIN;
  assert.equal((await call('POST', '/schedule', deepWork, 'a')).status, 201);
  assert.equal((await call('POST', '/schedule', deepWork, 'a')).status, 429);
}));

test('the lobby holds at most 50 schedules', at(MON_10_BERLIN, async () => {
  const { call } = lobby();
  for (let i = 0; i < 50; i++) assert.equal((await call('POST', '/schedule', deepWork, 'ip' + i)).status, 201);
  assert.equal((await call('POST', '/schedule', deepWork, 'another')).status, 507);
}));

test('a schedule nobody uses for three weeks drops off; use keeps it', at(MON_10_BERLIN, async () => {
  const { call, list, put, data } = lobby();
  const a = (await call('POST', '/schedule', deepWork)).body;
  const b = (await call('POST', '/schedule', { ...deepWork, title: 'Writing' })).body;
  const code = (await list()).rooms.find((r) => r.sched === b.id).code;
  clock.now += 14 * DAY;
  const live = sessionCode(b.id, nextSession(deepWork, clock.now).start);
  assert.notEqual(live, code);
  await put({ code: live, title: 'Writing', rhythm: '50/10', house: false, max: 8, names: ['ana'] });
  assert.deepEqual((await list()).rooms.find((r) => r.sched === b.id).names, ['ana']);
  clock.now += 8 * DAY;
  const { rooms, upcoming } = await list();
  assert.deepEqual([...rooms.filter((r) => r.sched), ...upcoming].map((s) => s.sched || s.id), [b.id]);
  assert.equal(data.has('s:' + a.id), false);
}));

test('people who say they will come are counted per session', at(MON_10_BERLIN - 2 * 60 * MIN, async () => {
  const { call, list } = lobby();
  const { id } = (await call('POST', '/schedule', deepWork)).body;
  const going = async (cid, on, ip) => (await call('POST', '/schedule/' + id + '/going', { cid, on }, ip)).body.going;
  assert.equal(await going('ana', true, 'x'), 1);
  assert.equal(await going('ana', true, 'x'), 1);
  assert.equal(await going('ben', true, 'y'), 2);
  assert.equal(await going('ben', false, 'y'), 1);
  assert.equal((await list()).upcoming[0].going, 1);
  clock.now = Date.parse('2026-10-05T11:00:00Z');
  assert.equal((await list()).upcoming[0].going, 0);
  assert.equal((await call('POST', '/schedule/' + id + '/going', { cid: '', on: true })).status, 400);
  assert.equal((await call('POST', '/schedule/NOP/going', { cid: 'ana', on: true })).status, 404);
}));

test('saying you will come is rate limited per address', at(MON_10_BERLIN, async () => {
  const { call } = lobby();
  const { id } = (await call('POST', '/schedule', deepWork)).body;
  for (let i = 0; i < 10; i++) assert.equal((await call('POST', '/schedule/' + id + '/going', { cid: 'c' + i, on: true }, 'z')).status, 200);
  assert.equal((await call('POST', '/schedule/' + id + '/going', { cid: 'c10', on: true }, 'z')).status, 429);
}));

test('only the creator token removes a schedule', at(MON_10_BERLIN, async () => {
  const { call, list } = lobby();
  const { id, token } = (await call('POST', '/schedule', deepWork)).body;
  assert.equal((await call('DELETE', '/schedule/' + id, { token: 'guess' })).status, 403);
  assert.equal((await call('DELETE', '/schedule/' + id, {})).status, 403);
  assert.equal((await call('DELETE', '/schedule/' + id, { token })).status, 204);
  assert.equal((await list()).rooms.some((r) => r.sched), false);
}));

function sessionRoom(l) {
  const data = new Map(), sockets = [];
  const ctx = { setWebSocketAutoResponse() {}, getWebSockets: () => sockets, acceptWebSocket: (ws) => sockets.push(ws), storage: storage(data) };
  const env = { LOBBY: { idFromName: () => 'lobby', get: () => ({ fetch: (url, init) => l.fetch(new Request(url, init)) }) } };
  const room = new Room(ctx, env);
  const open = (code) => room.fetch(new Request('https://room/api/room/' + code + '/ws'));
  return { room, data, sockets, open };
}

test('a session room opens itself only while the session is on', at(MON_10_BERLIN - 2 * 60 * MIN, async () => {
  const { call, l } = lobby();
  const { id } = (await call('POST', '/schedule', deepWork)).body;
  const code = sessionCode(id, Date.parse('2026-10-05T07:00:00Z'));
  const early = sessionRoom(l);
  await early.open(code);
  assert.equal(early.data.has('open'), false);
  clock.now = MON_10_BERLIN;
  const wrongDay = sessionRoom(l);
  await wrongDay.open(sessionCode(id, Date.parse('2026-10-06T07:00:00Z')));
  assert.equal(wrongDay.data.has('open'), false);
  const { data, open } = sessionRoom(l);
  await open(code);
  assert.deepEqual(data.get('cfg'), { pub: true, house: false, code, title: 'Deep work', rhythm: '50/10', max: 8, sched: id });
}));

test('people joining a session land in its room, which the lobby lists under the session', at(MON_10_BERLIN, async () => {
  const { call, l, list } = lobby();
  const { id } = (await call('POST', '/schedule', deepWork)).body;
  const { code } = (await list()).rooms.find((r) => r.sched === id);
  const { room, sockets, open } = sessionRoom(l);
  await open(code);
  sockets.length = 0;
  for (const name of ['ana', 'ben']) {
    const ws = { attachment: null, messages: [], deserializeAttachment() { return this.attachment; }, serializeAttachment(a) { this.attachment = a; }, send(m) { this.messages.push(JSON.parse(m)); }, close() {} };
    sockets.push(ws);
    await room.webSocketMessage(ws, JSON.stringify({ t: 'hello', id: name, name }));
  }
  assert.deepEqual(sockets[1].messages.at(-1).pub, { title: 'Deep work', rhythm: '50/10', house: false, max: 8 });
  const { rooms } = await list();
  assert.deepEqual(rooms.filter((r) => !r.house).map((r) => [r.code, r.names]), [[code, ['ana', 'ben']]]);
}));

test('the Worker passes schedule requests to the lobby with the client address', async () => {
  const seen = [];
  const env = { LOBBY: { idFromName: () => 'lobby', get: () => ({ fetch: async (url, init) => { seen.push([url, init.method, init.headers['x-ip'], init.body]); return new Response('{}'); } }) } };
  await worker.fetch(new Request('https://x/api/schedule', { method: 'POST', body: '{"a":1}', headers: { 'CF-Connecting-IP': '203.0.113.9' } }), env);
  await worker.fetch(new Request('https://x/api/schedule/ABC/going', { method: 'POST', body: '{}' }), env);
  assert.deepEqual(seen, [['https://lobby/schedule', 'POST', '203.0.113.9', '{"a":1}'], ['https://lobby/schedule/ABC/going', 'POST', 'local', '{}']]);
});
