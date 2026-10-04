const { test } = require('node:test');
const assert = require('node:assert/strict');
const { receiver, decrypt, vapidEnv, verifyJwt } = require('./receiver.cjs');

const load = import('../src/push.js');
const bytes = (s) => new Uint8Array(Buffer.from(s.replace(/\s/g, ''), 'base64url'));

test('encryption matches the RFC 8291 example', async () => {
  const { encrypt, importPrivate } = await load;
  const asPublic = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
  const local = {
    privateKey: await importPrivate('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', asPublic, 'ECDH'),
    publicKey: await crypto.subtle.importKey('raw', bytes(asPublic), { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  };
  const out = await encrypt('When I grow up, I want to be a watermelon',
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg', bytes('DGv6ra1nlYgDCS1FRnbzlw'), local);
  const expected = Buffer.concat([
    bytes('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'),
    bytes('8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ'),
  ]);
  assert.equal(Buffer.from(out).toString('base64url'), expected.toString('base64url'));
});

test('a payload decrypts with the subscription keys', async () => {
  const { encrypt, pushBody } = await load;
  const r = receiver(), text = pushBody('Deep work', 1759647600000, 'LABCQR');
  const body = await encrypt(text, r.keys.p256dh, r.keys.auth), out = decrypt(r, body);
  assert.deepEqual(out, { rs: 4096, idlen: 65, delimiter: 2, text });
  assert.deepEqual(JSON.parse(out.text), { title: 'Deep work', start: 1759647600000, code: 'LABCQR' });
  assert.ok(body.length < 200);
  assert.throws(() => decrypt(receiver(), body));
  assert.notDeepEqual(await encrypt(text, r.keys.p256dh, r.keys.auth), body);
});

test('the VAPID token is ES256, for the push service origin, and expires within a day', async () => {
  const { vapidJwt, vapidClaims, importPrivate } = await load;
  const env = await vapidEnv(), now = Date.parse('2026-10-05T07:00:00Z');
  const claims = vapidClaims('https://fcm.googleapis.com/fcm/send/abc:def', env.VAPID_SUBJECT, now);
  assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: now / 1000 + 12 * 3600, sub: 'mailto:owner@example.com' });
  const jwt = await vapidJwt(claims, await importPrivate(env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY, 'ECDSA'));
  const v = verifyJwt(jwt, env.VAPID_PUBLIC_KEY);
  assert.equal(v.ok, true);
  assert.deepEqual(v.header, { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(v.claims, claims);
  assert.equal(verifyJwt(jwt, (await vapidEnv()).VAPID_PUBLIC_KEY).ok, false);
});

test('sending posts an encrypted body with TTL, urgency and VAPID auth', async () => {
  const { sendPush } = await load;
  const env = await vapidEnv(), r = receiver(), seen = [], real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { seen.push({ url, init }); return new Response(null, { status: 201 }); };
  try {
    const status = await sendPush({ endpoint: 'https://web.push.apple.com/QGuQ', ...r.keys }, '{"title":"x"}', env, { ttl: 900 });
    assert.equal(status, 201);
  } finally { globalThis.fetch = real; }
  const [{ url, init }] = seen;
  assert.equal(url, 'https://web.push.apple.com/QGuQ');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.TTL, '900');
  assert.equal(init.headers.Urgency, 'high');
  assert.equal(init.headers['Content-Encoding'], 'aes128gcm');
  const [, jwt, k] = init.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, env.VAPID_PUBLIC_KEY);
  assert.equal(verifyJwt(jwt, k).claims.aud, 'https://web.push.apple.com');
  assert.equal(decrypt(r, init.body).text, '{"title":"x"}');
});

test('subscriptions are checked and trimmed to the endpoint and keys', async () => {
  const { readSub } = await load;
  const { keys } = receiver();
  const ok = (endpoint, k = keys) => readSub({ endpoint, keys: k, expirationTime: null, extra: 'x'.repeat(5000) });
  assert.deepEqual(ok('https://fcm.googleapis.com/fcm/send/abc'), { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: keys.p256dh, auth: keys.auth });
  for (const host of ['web.push.apple.com', 'updates.push.services.mozilla.com', 'wns2-par02p.notify.windows.com']) assert.ok(ok('https://' + host + '/x'));
  for (const bad of [
    'http://fcm.googleapis.com/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x', 'https://notfcm.googleapis.com/x',
    'https://127.0.0.1/x', 'https://fcm.googleapis.com:8443/x', 'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com/' + 'a'.repeat(1024), 'not a url', '',
  ]) assert.equal(ok(bad), null, bad);
  assert.equal(ok('https://fcm.googleapis.com/x', { p256dh: keys.p256dh }), null);
  assert.equal(ok('https://fcm.googleapis.com/x', { p256dh: keys.p256dh, auth: 'AAAA' }), null);
  assert.equal(ok('https://fcm.googleapis.com/x', { p256dh: keys.auth, auth: keys.auth }), null);
  assert.equal(ok('https://fcm.googleapis.com/x', { p256dh: keys.p256dh + '!', auth: keys.auth }), null);
  for (const v of [null, 'x', 1, [], { endpoint: 5 }]) assert.equal(readSub(v), null);
  assert.equal(ok('https://fcm.googleapis.com/x', { p256dh: keys.p256dh + '=', auth: keys.auth + '==' }).auth, keys.auth);
});

test('base64url round trips and rejects junk', async () => {
  const { b64u, unb64u } = await load;
  for (let n = 0; n < 40; n++) {
    const b = crypto.getRandomValues(new Uint8Array(n));
    assert.deepEqual(unb64u(b64u(b)), b);
    assert.equal(b64u(b), Buffer.from(b).toString('base64url'));
  }
  for (const bad of ['a+b', 'a/b', 'abc$', 'a', 5, null]) assert.equal(unb64u(bad), null, String(bad));
});

test('push is on only with a valid key pair and subject', async () => {
  const { pushReady } = await load;
  const env = await vapidEnv();
  assert.equal(pushReady(env), true);
  assert.equal(pushReady({ ...env, VAPID_SUBJECT: 'https://pomodoro.example' }), true);
  for (const k of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) assert.equal(pushReady({ ...env, [k]: '' }), false, k);
  assert.equal(pushReady({ ...env, VAPID_SUBJECT: 'owner@example.com' }), false);
  assert.equal(pushReady({ ...env, VAPID_PRIVATE_KEY: env.VAPID_PUBLIC_KEY }), false);
  assert.equal(pushReady({}), false);
  assert.equal(pushReady(undefined), false);
});
