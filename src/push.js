// Web Push with WebCrypto: VAPID (RFC 8292), aes128gcm payloads (RFC 8291), delivery (RFC 8030).
const enc = new TextEncoder();
const RECORD = 4096;
const JWT_HOURS = 12;
export const MAX_ENDPOINT = 1024;
// Only browser push services, so the Worker can't be pointed at arbitrary hosts.
const HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

export const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function unb64u(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]*={0,2}$/.test(s.trim())) return null;
  try { return Uint8Array.from(atob(s.trim().replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)); } catch { return null; }
}

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

export const pushReady = (env) => !!(env && unb64u(env.VAPID_PUBLIC_KEY)?.length === 65 && unb64u(env.VAPID_PRIVATE_KEY)?.length === 32 && /^(mailto:|https:)/.test(env.VAPID_SUBJECT || ""));

/** The endpoint and keys of a subscription from untrusted input, or null. */
export function readSub(v) {
  if (!v || typeof v !== "object" || typeof v.endpoint !== "string" || v.endpoint.length > MAX_ENDPOINT) return null;
  let url;
  try { url = new URL(v.endpoint); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !HOSTS.some((h) => url.hostname === h || url.hostname.endsWith("." + h))) return null;
  const keys = v.keys || {}, p256dh = unb64u(keys.p256dh), auth = unb64u(keys.auth);
  if (!p256dh || p256dh.length !== 65 || p256dh[0] !== 4 || !auth || auth.length !== 16) return null;
  return { endpoint: url.href, p256dh: b64u(p256dh), auth: b64u(auth) };
}

export const pushBody = (title, start, code) => JSON.stringify({ title, start, code });

export const vapidClaims = (endpoint, subject, now) => ({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + JWT_HOURS * 3600, sub: subject });

export function importPrivate(d, pub, name) {
  const p = unb64u(pub);
  const jwk = { kty: "EC", crv: "P-256", d: b64u(unb64u(d)), x: b64u(p.slice(1, 33)), y: b64u(p.slice(33, 65)) };
  return crypto.subtle.importKey("jwk", jwk, { name, namedCurve: "P-256" }, false, name === "ECDSA" ? ["sign"] : ["deriveBits"]);
}

export async function vapidJwt(claims, key) {
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))) + "." + b64u(enc.encode(JSON.stringify(claims)));
  return head + "." + b64u(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(head)));
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** One aes128gcm record for a subscription's keys; `salt` and `local` are fixed only in tests. */
export async function encrypt(text, p256dh, auth, salt = crypto.getRandomValues(new Uint8Array(16)), local) {
  const ua = unb64u(p256dh);
  local ||= await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const as = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const peer = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, local.privateKey, 256));
  const ikm = await hkdf(unb64u(auth), secret, concat(enc.encode("WebPush: info\0"), ua, as), 32);
  const cek = await crypto.subtle.importKey("raw", await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16), "AES-GCM", false, ["encrypt"]);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cek, concat(enc.encode(text), [2])));
  const head = new Uint8Array(21 + as.length);
  head.set(salt);
  new DataView(head.buffer).setUint32(16, RECORD);
  head[20] = as.length;
  head.set(as, 21);
  return concat(head, data);
}

let signer = null;
const signingKey = (env) => {
  if (!signer || signer.d !== env.VAPID_PRIVATE_KEY) signer = { d: env.VAPID_PRIVATE_KEY, key: importPrivate(env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY, "ECDSA") };
  return signer.key;
};

/** Sends one push and resolves to the push service's status. */
export async function sendPush(sub, text, env, { ttl = 600, urgency = "high", now = Date.now() } = {}) {
  const jwt = await vapidJwt(vapidClaims(sub.endpoint, env.VAPID_SUBJECT, now), await signingKey(env));
  const body = await encrypt(text, sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: { TTL: String(ttl), Urgency: urgency, "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", Authorization: "vapid t=" + jwt + ", k=" + b64u(unb64u(env.VAPID_PUBLIC_KEY)) },
    body,
  });
  return res.status;
}
