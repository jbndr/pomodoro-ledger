export type Zone = "face" | "ring" | "backdrop";

/** Whether Customize is open, the part of the timer it's changing, and the part pointed at in its panel. */
export const cz = $state({ open: false, zone: "face" as Zone, hover: "" as Zone | "" });

export const ZONES: [Zone, string][] = [["face", "Face"], ["ring", "Ring"], ["backdrop", "Background"]];
