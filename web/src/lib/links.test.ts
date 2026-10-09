import { describe, expect, it } from "vitest";
import { cleanLink, linkHost, linkLabel, linksOf, takeLinks } from "./links";

describe("links", () => {
  it("keeps only web addresses", () => {
    expect(cleanLink("https://github.com/a/b")).toBe("https://github.com/a/b");
    expect(cleanLink("www.example.com/x")).toBe("https://www.example.com/x");
    expect(cleanLink("javascript:alert(1)")).toBeNull();
    expect(cleanLink("ftp://example.com")).toBeNull();
    expect(cleanLink("https://localhost")).toBeNull();
    expect(cleanLink(42)).toBeNull();
    expect(cleanLink("leetcode.com/problems/two-sum/")).toBeNull();
    expect(cleanLink("leetcode.com/problems/two-sum/", true)).toBe("https://leetcode.com/problems/two-sum/");
    expect(cleanLink("just words", true)).toBeNull();
  });
  it("lifts links out of a title and leaves the words", () => {
    expect(takeLinks("Review PR https://github.com/jbndr/pl/pull/12 today")).toEqual({ text: "Review PR today", links: ["https://github.com/jbndr/pl/pull/12"] });
    expect(takeLinks("Read (https://en.wikipedia.org/wiki/Pomodoro_(technique)).")).toEqual({ text: "Read ().", links: ["https://en.wikipedia.org/wiki/Pomodoro_(technique)"] });
    expect(takeLinks("Two www.a.com and https://b.org, same www.a.com").links).toEqual(["https://www.a.com/", "https://b.org/"]);
    expect(takeLinks("No links here")).toEqual({ text: "No links here", links: [] });
    expect(takeLinks("Learn node.js streams").links).toEqual([]);
  });
  it("reads stored links safely", () => {
    expect(linksOf({ links: ["https://a.com", "javascript:x", "https://a.com", 3] })).toEqual(["https://a.com/"]);
    expect(linksOf({})).toEqual([]);
  });
  it("names a link by its site and enough of its path", () => {
    expect(linkHost("https://www.github.com/x")).toBe("github.com");
    expect(linkLabel("https://leetcode.com/")).toBe("leetcode.com");
    expect(linkLabel("https://leetcode.com/problems/two-sum/")).toBe("leetcode.com/problems/two-sum");
    expect(linkLabel("https://github.com/jbndr/pomodoro-ledger/pull/12")).toBe("github.com/jbndr/…/pull/12");
  });
});
