import { describe, expect, it } from "vitest";
import { cleanSettings } from "./backup";
import { describeLook, deleteLook, findLook, MAX_LOOKS, renameLook, saveLook, savedLooks, suggestName, type SavedLook } from "./looks";

const nixie = { face: "nixie", ring: "glow", backdrop: "film" };
const mine = (): SavedLook[] => saveLook([], nixie, "a");

describe("describeLook", () => {
  it("names each part, and says when there's no ring", () => {
    expect(describeLook(nixie)).toBe("Nixie · Glow ring · Film");
    expect(describeLook({ face: "serif", ring: "none", backdrop: "paper" })).toBe("Editorial · No ring · Paper");
  });
});

describe("saveLook", () => {
  it("keeps a new mix under its face's name", () => {
    expect(mine()).toEqual([{ id: "a", name: "Nixie", face: "nixie", ring: "glow", backdrop: "film" }]);
  });

  it("numbers a second look with the same face", () => {
    const list = saveLook(mine(), { ...nixie, backdrop: "stars" }, "b");
    expect(list.map((l) => l.name)).toEqual(["Nixie", "Nixie 2"]);
    expect(suggestName({ ...nixie, backdrop: "plain" }, list)).toBe("Nixie 3");
  });

  it("leaves the list alone for a ready-made look, one you already have, or a full list", () => {
    const list = mine();
    expect(saveLook(list, { face: "serif", ring: "none", backdrop: "paper" })).toBe(list);
    expect(saveLook(list, { ...nixie })).toBe(list);
    let full: SavedLook[] = [];
    for (let i = 0; i < MAX_LOOKS; i++) full = saveLook(full, { face: "classic", ring: "dots", backdrop: ["plain", "paper", "aurora", "sky", "weather", "water", "mesh", "halftone", "wash", "film", "stars", "glow"][i] }, "x" + i);
    expect(full).toHaveLength(MAX_LOOKS);
    expect(saveLook(full, nixie)).toBe(full);
  });
});

describe("findLook", () => {
  it("finds ready-made looks first, then yours", () => {
    expect(findLook({ face: "serif", ring: "none", backdrop: "paper" }, mine())?.id).toBe("notebook");
    expect(findLook(nixie, mine())?.id).toBe("a");
    expect(findLook({ ...nixie, ring: "arc" }, mine())).toBeUndefined();
  });
});

describe("renameLook and deleteLook", () => {
  it("renames with a tidy name and ignores a blank one", () => {
    expect(renameLook(mine(), "a", "  Late   night ")[0].name).toBe("Late night");
    expect(renameLook(mine(), "a", "   ")[0].name).toBe("Nixie");
  });

  it("deletes by id", () => {
    expect(deleteLook(mine(), "a")).toEqual([]);
  });
});

describe("savedLooks", () => {
  it("drops junk, repeats and unnamed looks, and falls back for parts that no longer exist", () => {
    const raw = [null, { id: "a", name: "Mine", face: "nixie", ring: "glow", backdrop: "film" }, { id: "a", name: "Again", face: "lcd" }, { id: "b", name: "Same", face: "nixie", ring: "glow", backdrop: "film" },
      { id: "c", name: " ", face: "lcd" }, { id: "d", name: "Old", face: "sundial", ring: "halo", backdrop: "lava" }, "x"];
    expect(savedLooks(raw)).toEqual([
      { id: "a", name: "Mine", face: "nixie", ring: "glow", backdrop: "film" },
      { id: "d", name: "Old", face: "classic", ring: "arc", backdrop: "glow" },
    ]);
    for (const v of [undefined, null, "", {}, 3]) expect(savedLooks(v)).toEqual([]);
  });

  it("survive a backup", () => {
    expect(cleanSettings({ looks: mine() }, { looks: [] })).toEqual({ looks: mine() });
  });
});
