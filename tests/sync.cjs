const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const TEAM = 'team.cloudflareaccess.com';
const AUD = 'test-aud';
let certs = { keys: [] };

const source = fs.readFileSync('src/sync.js', 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/^export /gm, '');
const mod = vm.runInNewContext(source + '\n({ Ledger, accessEmail, handleSync })', {
  DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
  WebSocketRequestResponsePair: class {}, crypto: webcrypto, Date, Response, URL, TextEncoder, TextDecoder, atob, JSON,
  fetch: async () => new Response(JSON.stringify(certs)),
});

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

function setup() {
  const sockets = [];
  const ledger = new mod.Ledger({ storage: { sql: sqlStorage() }, setWebSocketAutoResponse() {}, getWebSockets: () => sockets }, {});
  const socket = () => {
    const ws = { messages: [], send(m) { this.messages.push(JSON.parse(m)); }, close() {} };
    sockets.push(ws);
    return ws;
  };
  const send = (ws, m) => ledger.webSocketMessage(ws, JSON.stringify(m));
  return { ledger, socket, send };
}

const task = (id, at, title = id) => ({ t: 'put', kind: 'task', id, at, body: { id, title, updatedAt: at } });

test('a write reaches other devices but not the sender', async () => {
  const { socket, send } = setup();
  const a = socket(), b = socket();
  await send(a, task('t1', 100, 'Write report'));
  assert.equal(a.messages.length, 0);
  assert.deepEqual(b.messages, [task('t1', 100, 'Write report')]);
});

test('an older write loses and the sender is told what won', async () => {
  const { socket, send } = setup();
  const a = socket(), b = socket();
  await send(a, task('t1', 200, 'new'));
  await send(b, task('t1', 100, 'stale'));
  assert.deepEqual(b.messages.at(-1), task('t1', 200, 'new'));
  assert.equal(a.messages.length, 0);
});

test('a delete wins over older edits and is not resurrected', async () => {
  const { socket, send } = setup();
  const a = socket(), b = socket();
  await send(a, task('t1', 100));
  await send(b, { t: 'del', kind: 'task', id: 't1', at: 300 });
  assert.deepEqual(a.messages.at(-1), { t: 'del', kind: 'task', id: 't1', at: 300 });
  await send(a, task('t1', 200));
  assert.deepEqual(a.messages.at(-1), { t: 'del', kind: 'task', id: 't1', at: 300 });
  await send(a, task('t1', 400, 'edited after delete'));
  assert.deepEqual(b.messages.at(-1), task('t1', 400, 'edited after delete'));
});

test('hello returns live documents and tombstones', async () => {
  const { socket, send } = setup();
  const a = socket();
  await send(a, task('t1', 100));
  await send(a, task('t2', 100));
  await send(a, { t: 'del', kind: 'task', id: 't2', at: 150 });
  await send(a, { t: 'put', kind: 'profile', id: 'profile', at: 120, body: { settings: { focus: 30 } } });
  await send(a, { t: 'hello' });
  const docs = a.messages.at(-1).docs.sort((x, y) => (x.kind + x.id).localeCompare(y.kind + y.id));
  assert.deepEqual(docs, [
    { t: 'put', kind: 'profile', id: 'profile', at: 120, body: { settings: { focus: 30 } } },
    task('t1', 100),
    { t: 'del', kind: 'task', id: 't2', at: 150 },
  ]);
});

test('malformed and unknown messages are ignored', async () => {
  const { socket, send, ledger } = setup();
  const a = socket(), b = socket();
  await send(a, { t: 'put', kind: 'secrets', id: 'x', at: 1, body: {} });
  await send(a, { t: 'put', kind: 'profile', id: 'someone-else', at: 1, body: {} });
  await send(a, { t: 'put', kind: 'task', id: '', at: 1, body: {} });
  await send(a, { t: 'put', kind: 'task', id: 't1', at: 'soon', body: {} });
  await send(a, { t: 'put', kind: 'task', id: 't1', at: 1, body: 'not an object' });
  await ledger.webSocketMessage(a, 'not json');
  assert.equal(b.messages.length, 0);
  await send(a, { t: 'hello' });
  assert.deepEqual(a.messages.at(-1).docs, []);
});

test('the running timer syncs as a single document', async () => {
  const { socket, send } = setup();
  const a = socket(), b = socket();
  const timer = { t: 'put', kind: 'timer', id: 'timer', at: 100, body: { T: { mode: 'focus', status: 'running', endsAt: 1500000 }, activeId: 't1' } };
  await send(a, timer);
  assert.deepEqual(b.messages.at(-1), timer);
  await send(a, { ...timer, id: 'other' });
  assert.equal(b.messages.length, 1);
});

test('oversized documents are refused', async () => {
  const { socket, send } = setup();
  const a = socket();
  await send(a, { t: 'put', kind: 'task', id: 't1', at: 1, body: { notes: 'x'.repeat(256 * 1024) } });
  assert.equal(a.messages.at(-1).code, 'too_large');
});

async function signer() {
  const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await webcrypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' };
  const b64 = (b) => Buffer.from(b).toString('base64url');
  const sign = async (claims, header = { alg: 'RS256', kid: 'k1' }) => {
    const data = b64(JSON.stringify(header)) + '.' + b64(JSON.stringify(claims));
    const sig = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(data));
    return data + '.' + b64(sig);
  };
  return { jwk, sign };
}

const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const req = (token) => new Request('https://pomodoro.example/api/sync/me', token ? { headers: { 'Cf-Access-Jwt-Assertion': token } } : {});
const good = () => ({ aud: [AUD], iss: 'https://' + TEAM, email: 'Me@Example.com', exp: Date.now() / 1000 + 600 });

test('a valid Access token yields the lower-cased email', async () => {
  const { jwk, sign } = await signer();
  certs = { keys: [jwk] };
  assert.equal(await mod.accessEmail(req(await sign(good())), env), 'me@example.com');
});

test('tokens with the wrong audience, issuer, expiry, key or signature are rejected', async () => {
  const { jwk, sign } = await signer();
  const other = await signer();
  certs = { keys: [jwk] };
  const now = Date.now() / 1000;
  assert.equal(await mod.accessEmail(req(), env), null);
  assert.equal(await mod.accessEmail(req(await sign({ ...good(), aud: ['other'] })), env), null);
  assert.equal(await mod.accessEmail(req(await sign({ ...good(), iss: 'https://evil.cloudflareaccess.com' })), env), null);
  assert.equal(await mod.accessEmail(req(await sign({ ...good(), exp: now - 10 })), env), null);
  assert.equal(await mod.accessEmail(req(await sign(good(), { alg: 'RS256', kid: 'unknown' })), env), null);
  assert.equal(await mod.accessEmail(req(await sign(good(), { alg: 'none', kid: 'k1' })), env), null);
  assert.equal(await mod.accessEmail(req(await other.sign(good())), env), null);
});

test('the dev identity is ignored once Access is configured', async () => {
  assert.equal(await mod.accessEmail(req(), { DEV_USER_EMAIL: 'dev@example.test' }), 'dev@example.test');
  assert.equal(await mod.accessEmail(req(), { ...env, DEV_USER_EMAIL: 'dev@example.test' }), null);
});

test('without configuration sync reports itself as off', async () => {
  const res = await mod.handleSync(req(), {}, new URL('https://pomodoro.example/api/sync/me'));
  assert.deepEqual(await res.json(), { configured: false });
  const ws = await mod.handleSync(req(), {}, new URL('https://pomodoro.example/api/sync/ws'));
  assert.equal(ws.status, 404);
});

test('signed-out requests cannot reach the ledger', async () => {
  const env2 = { ...env, LEDGER: { idFromName() { throw new Error('must not be called'); } } };
  for (const path of ['/api/sync/ws', '/api/sync/export', '/api/sync/login']) {
    const res = await mod.handleSync(req(), env2, new URL('https://pomodoro.example' + path));
    assert.equal(res.status, 401, path);
  }
});
