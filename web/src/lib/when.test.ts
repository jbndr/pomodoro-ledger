import { describe, expect, it } from "vitest";
import { addDays, dayKey, keyTime, nextMonday, sod } from "./dates";
import { parseWhen } from "./when";

// Saturday, 3 October 2026, mid-afternoon local time.
const NOW = new Date(2026, 9, 3, 15, 30).getTime();
const when = (q: string, strict = false) => parseWhen(q, strict, NOW);

describe("dates", () => {
  it("round-trips day keys through local midnight", () => {
    expect(dayKey(NOW)).toBe("2026-10-03");
    expect(keyTime("2026-10-03")).toBe(sod(NOW));
    expect(dayKey(addDays(NOW, 30))).toBe("2026-11-02");
  });
  it("finds the next Monday, a full week ahead on a Monday", () => {
    expect(nextMonday(NOW)).toBe("2026-10-05");
    expect(nextMonday(new Date(2026, 9, 5, 9).getTime())).toBe("2026-10-12");
  });
});

describe("parseWhen", () => {
  it.each([
    ["today", "today"], ["tod", "today"], ["heute", "today"],
    ["tom", "2026-10-04"], ["tomorrow", "2026-10-04"], ["morgen", "2026-10-04"], ["tm", "2026-10-04"],
    ["übermorgen", "2026-10-05"],
    ["mon", "2026-10-05"], ["mo", "2026-10-05"], ["fri", "2026-10-09"], ["freitag", "2026-10-09"], ["next fri", "2026-10-09"],
    ["sat", "2026-10-10"], ["sun", "2026-10-04"],
    ["next week", "2026-10-05"], ["nächste woche", "2026-10-05"], ["weekend", "2026-10-10"],
    ["in 3 days", "2026-10-06"], ["3d", "2026-10-06"], ["+5", "2026-10-08"], ["in 2 weeks", "2026-10-17"], ["2w", "2026-10-17"],
    ["12 oct", "2026-10-12"], ["oct 12", "2026-10-12"], ["12.10", "2026-10-12"], ["12.10.", "2026-10-12"],
    ["1.1", "2027-01-01"], ["2026-12-24", "2026-12-24"], ["24 dec 2027", "2027-12-24"],
    ["later", "later"], ["someday", "later"], ["irgendwann", "later"],
    ["on friday", "2026-10-09"], ["am freitag", "2026-10-09"],
  ])("reads %j as %j", (q, expected) => {
    expect(when(q)).toBe(expected);
  });

  it.each(["garbage", "m", "12", "31.2", "30.02."])("rejects %j", (q) => {
    expect(when(q)).toBeUndefined();
  });

  it("returns null for empty input", () => {
    expect(when("   ")).toBeNull();
  });

  describe("strict, for reading titles", () => {
    it.each([["tomorrow", "2026-10-04"], ["friday", "2026-10-09"], ["fri", "2026-10-09"], ["12.10.", "2026-10-12"], ["next week", "2026-10-05"], ["someday", "later"]])(
      "still reads %j",
      (q, expected) => expect(when(q, true)).toBe(expected),
    );
    it.each(["tom", "do", "mo", "1.2", "12.10", "later", "tm", "fr"])("ignores %j", (q) => {
      expect(when(q, true)).toBeUndefined();
    });
  });
});
