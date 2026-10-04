/** Bytes of a base64url string, or null when it isn't one. */
export function keyBytes(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(s)) return null;
  try { return Uint8Array.from(atob(s.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)); } catch { return null; }
}

/** Whether a subscription was made with this server key, so a rotated key means subscribing again. */
export function sameKey(had: ArrayBuffer | null | undefined, key: Uint8Array) {
  if (!had || had.byteLength !== key.length) return false;
  const a = new Uint8Array(had);
  return a.every((x, i) => x === key[i]);
}
