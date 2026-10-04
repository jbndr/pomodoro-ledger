import { describe, expect, it } from "vitest";
import { cleanSettings } from "./backup";
import {
  choose, deleteMix, describeMix, matchMix, MAX_SAVED, mixCode, mixLabel, mixLevels, parseMix, phaseMix, PRESETS, renameMix,
  SAME, saveMix, savedMixes, scapePlan, setLevel, storedChoice, toggleLayer, type MixSettings,
} from "./mix";

describe("parseMix", () => {
  it("reads layers in a fixed order", () => {
    expect(parseMix("fire:40,rain:70")).toEqual([{ kind: "rain", level: 70 }, { kind: "fire", level: 40 }]);
  });
  it("reads a single soundscape from before mixes at full level, café as ocean", () => {
    expect(parseMix("brown")).toEqual([{ kind: "brown", level: 100 }]);
    expect(parseMix("cafe")).toEqual([{ kind: "ocean", level: 100 }]);
  });
  it("drops junk, repeats, silent layers and a fourth layer", () => {
    expect(parseMix("rain:50,rain:20,wind:30,fire:0,ocean:x")).toEqual([{ kind: "rain", level: 50 }]);
    expect(parseMix("rain:10,ocean:20,fire:30,brown:40")).toHaveLength(3);
    expect(parseMix("rain:400")).toEqual([{ kind: "rain", level: 100 }]);
    for (const v of [undefined, null, "", "off", 3, {}]) expect(parseMix(v)).toEqual([]);
  });
});

describe("mixCode", () => {
  it("is the same for mixes that sound the same", () => {
    expect(mixCode(parseMix("fire:40,rain:70"))).toBe("rain:70,fire:40");
    expect(mixCode(parseMix("rain"))).toBe(mixCode([{ kind: "rain", level: 100 }]));
    expect(mixCode([])).toBe("");
  });
});

describe("editing layers", () => {
  const two = parseMix("rain:70,fire:40");
  it("turns a sound on at a gentle level and off again", () => {
    const on = toggleLayer(two, "brown");
    expect(on.find((l) => l.kind === "brown")?.level).toBe(60);
    expect(toggleLayer(on, "brown")).toEqual(two);
  });
  it("stops at three layers", () => {
    const three = toggleLayer(two, "ocean");
    expect(toggleLayer(three, "brown")).toBe(three);
  });
  it("keeps a level audible and in range", () => {
    expect(setLevel(two, "fire", 0)[1].level).toBe(5);
    expect(setLevel(two, "fire", 130)[1].level).toBe(100);
    expect(setLevel(two, "fire", 33.4)).toEqual([{ kind: "rain", level: 70 }, { kind: "fire", level: 33 }]);
  });
  it("describes and scales levels", () => {
    expect(describeMix(two)).toBe("Rain 70% · Fire 40%");
    expect(mixLevels(two)).toEqual({ rain: 0.7, fire: 0.4 });
  });
});

describe("presets", () => {
  it("are distinct, valid mixes of two or three layers", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(PRESETS.map((p) => p.mix)).size).toBe(PRESETS.length);
    for (const p of PRESETS) {
      expect(mixCode(parseMix(p.mix))).toBe(p.mix);
      expect(parseMix(p.mix).length).toBeGreaterThanOrEqual(2);
    }
    expect(PRESETS[0]).toMatchObject({ name: "Stormy cabin", mix: "rain:70,fire:40" });
  });
});

describe("choices per phase, and settings from before mixes", () => {
  it("maps a single soundscape to a one-layer focus mix and keeps breaks quiet", () => {
    const s: MixSettings = { soundscape: "rain", soundscapeVolume: 30 };
    expect(phaseMix(s, "focus")).toEqual([{ kind: "rain", level: 100 }]);
    expect(phaseMix(s, "break")).toEqual([]);
  });
  it("maps 'also during breaks' to breaks that follow focus", () => {
    const s: MixSettings = { soundscape: "cafe", soundscapeBreaks: true };
    expect(storedChoice(s, "break")).toBe(SAME);
    expect(phaseMix(s, "break")).toEqual([{ kind: "ocean", level: 100 }]);
  });
  it("reads off, unset and junk as quiet", () => {
    for (const s of [{}, { soundscape: "off" }, { soundscape: "off", soundscapeBreaks: true }, { scapeFocus: "nope" }] as MixSettings[]) {
      expect(phaseMix(s, "focus")).toEqual([]);
      expect(phaseMix(s, "break")).toEqual([]);
    }
  });
  it("prefers mixes over the old setting once chosen", () => {
    const s: MixSettings = { soundscape: "rain", soundscapeBreaks: true, scapeFocus: "ocean:50,fire:20", scapeBreak: "" };
    expect(mixCode(phaseMix(s, "focus"))).toBe("ocean:50,fire:20");
    expect(phaseMix(s, "break")).toEqual([]);
  });
  it("pins both phases on the first choice, so the other keeps sounding as before", () => {
    const s: MixSettings = { soundscape: "fire", soundscapeBreaks: true };
    choose(s, "focus", "rain:70,fire:40");
    expect(s).toMatchObject({ scapeFocus: "rain:70,fire:40", scapeBreak: SAME });
    const t: MixSettings = { soundscape: "fire" };
    choose(t, "break", "ocean:60");
    expect(t).toMatchObject({ scapeFocus: "fire", scapeBreak: "ocean:60" });
    expect(phaseMix(t, "focus")).toEqual([{ kind: "fire", level: 100 }]);
  });
  it("labels each phase", () => {
    const s: MixSettings = { scapeFocus: "rain:70,fire:40", scapeBreak: SAME, scapeMixes: [{ id: "a", name: "Mine", mix: "ocean:20" }] };
    expect(mixLabel(s, "focus")).toBe("Stormy cabin");
    expect(mixLabel(s, "break")).toBe("Same as focus");
    expect(mixLabel({ ...s, scapeFocus: "ocean:20" }, "focus")).toBe("Mine");
    expect(mixLabel({ ...s, scapeFocus: "ocean:21" }, "focus")).toBe("Ocean");
    expect(mixLabel({ ...s, scapeFocus: "ocean:21,brown:3" }, "focus")).toBe("Custom mix");
    expect(mixLabel({}, "break")).toBe("Off");
  });
});

describe("saved mixes", () => {
  const layers = parseMix("rain:30,brown:50");
  it("saves, renames and deletes", () => {
    let list = saveMix([], "  Late   night ", layers, "a");
    expect(list).toEqual([{ id: "a", name: "Late night", mix: "rain:30,brown:50" }]);
    list = renameMix(list, "a", "Night shift");
    expect(list[0].name).toBe("Night shift");
    expect(renameMix(list, "a", "   ")).toBe(list);
    expect(deleteMix(list, "a")).toEqual([]);
  });
  it("saves over a mix of the same name, and ignores empty names or mixes", () => {
    const list = saveMix([], "Mine", layers, "a");
    expect(saveMix(list, "mine", parseMix("fire:20"), "b")).toEqual([{ id: "a", name: "mine", mix: "fire:20" }]);
    expect(saveMix(list, " ", layers)).toBe(list);
    expect(saveMix(list, "Other", [])).toBe(list);
  });
  it("keeps a bounded number", () => {
    let list = saveMix([], "0", layers, "x0");
    for (let i = 1; i < MAX_SAVED + 3; i++) list = saveMix(list, String(i), layers, "x" + i);
    expect(list).toHaveLength(MAX_SAVED);
  });
  it("cleans a stored list", () => {
    expect(savedMixes([
      { id: "a", name: "Fine", mix: "fire:40,rain:70" }, { id: "a", name: "Repeat", mix: "rain:1" }, { id: "b", name: " ", mix: "rain:1" },
      { id: "c", name: "Silent", mix: "" }, null, "x", { name: "No id", mix: "rain:1" },
    ])).toEqual([{ id: "a", name: "Fine", mix: "rain:70,fire:40" }]);
    expect(savedMixes(undefined)).toEqual([]);
  });
  it("matches a mix by how it sounds", () => {
    expect(matchMix(parseMix("fire:40,rain:70"), PRESETS)?.name).toBe("Stormy cabin");
    expect(matchMix([], PRESETS)).toBeNull();
  });
  it("survive a settings import", () => {
    const list = saveMix([], "Mine", layers, "a"), def = { scapeMixes: [] as unknown[], sound: true };
    expect(cleanSettings({ scapeMixes: list, scapeFocus: "rain:70", scapeBreak: SAME }, def)).toEqual({ scapeMixes: list, scapeFocus: "rain:70", scapeBreak: SAME });
  });
});

describe("scapePlan", () => {
  const now = 1_000_000, endsAt = now + 25 * 60_000;
  const focus = { mode: "focus" as const, status: "running" as const, endsAt };
  const brk = { ...focus, mode: "short" as const };

  it("plays the focus mix during a running focus round and fades out at its end", () => {
    expect(scapePlan({ scapeFocus: "rain:70,fire:40", soundscapeVolume: 50 }, focus, now)).toEqual({
      phase: "focus", mix: "rain:70,fire:40", levels: { rain: 0.7, fire: 0.4 }, gain: 0.5, fadeAt: endsAt, duckAt: 0,
    });
  });
  it("plays a single soundscape saved before mixes, at the old volume", () => {
    expect(scapePlan({ soundscape: "rain", soundscapeVolume: 50 }, focus, now)).toMatchObject({ mix: "rain:100", levels: { rain: 1 }, gain: 0.5, fadeAt: endsAt });
    expect(scapePlan({ soundscape: "cafe", soundscapeVolume: 30 }, focus, now)).toMatchObject({ levels: { ocean: 1 }, gain: 0.3 });
    expect(scapePlan({ soundscape: "fire" }, focus, now)?.gain).toBe(0.4);
  });
  it("stays quiet when off, muted, paused, idle or past the end", () => {
    const on = { scapeFocus: "rain:50" };
    expect(scapePlan({}, focus, now)).toBeNull();
    expect(scapePlan({ scapeFocus: "" }, focus, now)).toBeNull();
    expect(scapePlan({ ...on, soundscapeVolume: 0 }, focus, now)).toBeNull();
    expect(scapePlan(on, { ...focus, status: "paused" }, now)).toBeNull();
    expect(scapePlan(on, { ...focus, status: "idle" }, now)).toBeNull();
    expect(scapePlan(on, focus, endsAt)).toBeNull();
  });
  it("plays the break mix during breaks, quiet unless one is chosen", () => {
    expect(scapePlan({ scapeFocus: "brown:50" }, brk, now)).toBeNull();
    expect(scapePlan({ soundscape: "brown" }, { ...focus, mode: "long" }, now)).toBeNull();
    expect(scapePlan({ scapeFocus: "brown:50", scapeBreak: "ocean:80" }, brk, now)).toMatchObject({ phase: "break", levels: { ocean: 0.8 }, fadeAt: endsAt });
  });
  it("plays on across phases when both share a mix, dipping under the bell if sounds are on", () => {
    expect(scapePlan({ soundscape: "brown", soundscapeBreaks: true, sound: true }, focus, now)).toMatchObject({ fadeAt: 0, duckAt: endsAt });
    expect(scapePlan({ soundscape: "brown", soundscapeBreaks: true, sound: false }, brk, now)).toMatchObject({ fadeAt: 0, duckAt: 0 });
    expect(scapePlan({ scapeFocus: "rain:70,fire:40", scapeBreak: "fire:40,rain:70", sound: true }, brk, now)).toMatchObject({ fadeAt: 0, duckAt: endsAt });
  });
  it("fades out at the end of focus when the break mix differs", () => {
    expect(scapePlan({ scapeFocus: "rain:70,fire:40", scapeBreak: "ocean:50", sound: true }, focus, now)).toMatchObject({ fadeAt: endsAt, duckAt: 0 });
  });
});
