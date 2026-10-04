import type { Entry } from "../lib/palette";

export interface Command extends Entry {
  /** SVG markup, or any small inline HTML such as a label dot. */
  icon?: string;
  /** The shortcut, one key per entry. */
  keys?: string[];
  /** Muted text after the title, such as the current state. */
  hint?: string;
  /** Marks the current choice among siblings. */
  on?: boolean;
  /** What Enter does, for the footer; "Run" when unset. */
  verb?: string;
  /** What ⌘↵ does, if anything; `run` then gets `true`. */
  alt?: string;
  run(alt?: boolean): void;
}

export type Source = () => Command[];

const sources: Source[] = [];

/** Adds a source of commands; it's asked afresh each time the palette opens, and groups appear in the order first seen. */
export const addCommands = (source: Source) => { sources.push(source); };

export const commands = (): Command[] => sources.flatMap((source) => {
  try { return source(); } catch (e) { console.error(e); return []; }
});
