import type { Repeat } from "./lib/repeat";
import type { Task } from "./state";

export interface PopItem { id: string; title: string; key?: string }

export interface PopUI { open(anchor: Element, items: PopItem[], cur: string, pick: (id: string) => void): void; close(refocus?: boolean): void }
export interface WhenUI { open(anchor: Element, t: Partial<Task>, pick?: (g: string) => void, repeat?: (r: Repeat | null) => void): void; close(refocus?: boolean): void }
export interface LabelUI {
  open(key: string, find: () => Element | null | undefined, value: string, pick: (name: string) => void): void;
  close(refocus?: boolean): void; refresh(): void; place(): void; anchor(): Element | null | undefined;
  key(e: KeyboardEvent): void; filter(q: string): number;
}
export interface SettingsUI { fill(): void; open(tab?: string): void; close(): void; renderSync(): void }
export interface Sheet { open(): void; close(): void }
export interface PaletteUI extends Sheet { toggle(): void }
export interface RecapUI { open(week?: number): void; close(): void; maybeOpen(): void }
export interface ListUI { moveTask(id: string, up: boolean, far: boolean): { from: string; to: string } | null; dragging(): boolean }

/** What the mounted components expose; set during boot. */
export const ui: { pop?: PopUI; when?: WhenUI; label?: LabelUI; settings?: SettingsUI; keys?: Sheet; room?: Sheet; list?: ListUI; recap?: RecapUI; palette?: PaletteUI; plan?: Sheet } = {};

export const openPop: PopUI["open"] = (...a) => ui.pop!.open(...a);
export const closePop = (refocus?: boolean) => ui.pop?.close(refocus);
export const openWhen: WhenUI["open"] = (...a) => ui.when!.open(...a);
export const closeWhen = (refocus?: boolean) => ui.when?.close(refocus);
export const openLabelPop: LabelUI["open"] = (...a) => ui.label!.open(...a);
export const closeLabelPop = (refocus?: boolean) => ui.label?.close(refocus);
export const refreshLabelPop = () => ui.label?.refresh();
export const fillSettings = () => ui.settings!.fill();
export const openSettings = (tab?: string) => ui.settings!.open(tab);
export const closeSettings = () => ui.settings!.close();
export const renderSyncTab = () => ui.settings!.renderSync();
export const openKeys = () => ui.keys!.open();
export const closeKeys = () => ui.keys!.close();
export const openRoom = () => ui.room!.open();
export const closeRoom = () => ui.room!.close();
export const openRecap = (week?: number) => ui.recap!.open(week);
export const closeRecap = () => ui.recap!.close();
export const openPalette = () => ui.palette!.open();
export const togglePalette = () => ui.palette?.toggle();
export const openPlan = () => ui.plan!.open();
