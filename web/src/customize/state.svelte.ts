export type Zone = "face" | "ring" | "backdrop";

/** Whether Customize is open, what it's showing (ready-made looks or one part of the timer), and the part pointed at in its panel. */
export const cz = $state({ open: false, zone: "looks" as Zone | "looks", hover: "" as Zone | "looks" | "" });

export const ZONES: [Zone, string][] = [["face", "Face"], ["ring", "Ring"], ["backdrop", "Background"]];
