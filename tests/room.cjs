const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync('src/worker.js', 'utf8')
  .replace(/^import .*$/m, '')
  .replace('export default', 'const worker =')
  .replace('export class Room', 'class Room');
const Room = vm.runInNewContext(source + '\nRoom', {
  DurableObject: class { constructor(ctx) { this.ctx = ctx; } },
  WebSocketRequestResponsePair: class {}, crypto: webcrypto, Date, Response,
});

function setup() {
  const data = new Map([['ownerToken', 'private-creator-token']]);
  const sockets = [];
  const ctx = {
    setWebSocketAutoResponse() {}, getWebSockets: () => sockets,
    storage: {
      get: async (k) => data.get(k), put: async (k, v) => data.set(k, v),
      delete: async (k) => data.delete(k), setAlarm: async () => {},
    },
  };
  const room = new Room(ctx);
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
  const send = (ws, message) => room.webSocketMessage(ws, JSON.stringify(message));
  const hello = async (id, ownerToken) => {
    const ws = socket();
    await send(ws, { t: 'hello', id, name: id, ownerToken });
    return ws;
  };
  return { room, data, send, hello };
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
