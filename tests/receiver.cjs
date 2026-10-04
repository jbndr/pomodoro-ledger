// A push receiver built on node:crypto, independent of src/push.js.
const crypto = require('node:crypto');

function receiver() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
}

function decrypt({ ecdh, auth }, body) {
  const buf = Buffer.from(body), salt = buf.subarray(0, 16), rs = buf.readUInt32BE(16), idlen = buf[20];
  const as = buf.subarray(21, 21 + idlen), data = buf.subarray(21 + idlen), ua = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(as);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, 'Content-Encoding: aes128gcm\0', 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, 'Content-Encoding: nonce\0', 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(data.subarray(-16));
  const plain = Buffer.concat([d.update(data.subarray(0, -16)), d.final()]);
  const end = plain.lastIndexOf(2);
  return { rs, idlen, delimiter: plain[end], text: plain.subarray(0, end).toString() };
}

async function vapidEnv(subject = 'mailto:owner@example.com') {
  const k = await crypto.webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.webcrypto.subtle.exportKey('jwk', k.privateKey);
  const pub = Buffer.from(await crypto.webcrypto.subtle.exportKey('raw', k.publicKey)).toString('base64url');
  return { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: jwk.d, VAPID_SUBJECT: subject };
}

function verifyJwt(jwt, pub) {
  const [h, p, sig] = jwt.split('.');
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: Buffer.from(pub, 'base64url').subarray(1, 33).toString('base64url'), y: Buffer.from(pub, 'base64url').subarray(33).toString('base64url') }, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from(h + '.' + p), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
  return { ok, header: JSON.parse(Buffer.from(h, 'base64url')), claims: JSON.parse(Buffer.from(p, 'base64url')) };
}

module.exports = { receiver, decrypt, vapidEnv, verifyJwt };
