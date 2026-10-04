import { describe, expect, it } from "vitest";
import { timerMessage } from "./extension";

describe("timerMessage", () => {
  it("sends the end time of a running phase", () => {
    expect(timerMessage({ mode: "focus", status: "running", endsAt: 1000 }, "Write the report")).toEqual({
      source: "pomodoro-ledger", type: "timer", mode: "focus", status: "running", endsAt: 1000, task: "Write the report",
    });
  });
  it("sends no end time while paused or idle", () => {
    expect(timerMessage({ mode: "focus", status: "paused", endsAt: 1000 })).toMatchObject({ status: "paused", endsAt: null, task: null });
    expect(timerMessage({ mode: "short", status: "idle", endsAt: 0 })).toMatchObject({ mode: "short", status: "idle", endsAt: null });
  });
  it("treats a running timer without an end as idle", () => {
    expect(timerMessage({ mode: "focus", status: "running", endsAt: 0 })).toMatchObject({ status: "idle", endsAt: null });
  });
  it("drops a blank task name", () => expect(timerMessage({ mode: "focus", status: "idle", endsAt: 0 }, "  ").task).toBeNull());
});
