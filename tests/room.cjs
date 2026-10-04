const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync('src/worker.js', 'utf8')
  .replace(/^(import|export \{).*$/gm, '')
  .replace('export default', 'const worker =')
  .replace(/^export class /gm, 'class ');
const { Room, Lobby, worker } = vm.runInNewContext(source + '\n({ Room, Lobby, worker })', {
  DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
  WebSocketRequestResponsePair: class {}, crypto: webcrypto, Date, Response, JSON, URL,
});

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
  const put = (r) => l.fetch({ method: 'POST', json: async () => r });
  const list = async () => JSON.parse(await (await l.fetch({ method: 'GET' })).text());
  return { data, put, list };
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
