import { describe, expect, it } from "vitest";
import { keyBytes, sameKey } from "./push";

describe("push keys", () => {
  it("reads base64url, with or without padding", () => {
    expect([...keyBytes("AQID_-8")!]).toEqual([1, 2, 3, 255, 239]);
    expect([...keyBytes("AQID_-8=")!]).toEqual([1, 2, 3, 255, 239]);
    for (const bad of ["", "a+b", "a/b", "ab$", "a"]) expect(keyBytes(bad)).toBeNull();
  });

  it("matches a subscription's server key byte for byte", () => {
    const key = keyBytes("BAEC")!;
    expect(sameKey(new Uint8Array([4, 1, 2]).buffer, key)).toBe(true);
    expect(sameKey(new Uint8Array([4, 1, 3]).buffer, key)).toBe(false);
    expect(sameKey(new Uint8Array([4, 1]).buffer, key)).toBe(false);
    expect(sameKey(null, key)).toBe(false);
  });
});
