import { FADE_OUT, previewRamp, scapeOf, scapePlan, scapeRamp, scapeVolume, type Ramp, type Scape } from "./lib/soundscape";
import workletUrl from "./scapeWorklet?worker&url";
import { S, T } from "./state";

// Each soundscape runs in an AudioWorklet, so it never loops and keeps going in background tabs.
type Voice = { kind: Scape; gain: GainNode; node?: AudioWorkletNode; key: string; target: number; bye?: number; done?: boolean };
const loaded = new WeakMap<BaseAudioContext, Promise<void>>();
let cur: Voice | null = null, trial: Voice | null = null, clock = "";

export async function scapeNode(ac: BaseAudioContext, kind: Scape) {
  let p = loaded.get(ac);
  if (!p) { p = ac.audioWorklet.addModule(workletUrl); loaded.set(ac, p); }
  await p;
  return new AudioWorkletNode(ac, "scape", { numberOfInputs: 0, outputChannelCount: [2], processorOptions: { kind } });
}

function voice(ac: AudioContext, kind: Scape): Voice {
  const gain = ac.createGain(), v: Voice = { kind, gain, key: "", target: 0 };
  gain.gain.value = 0; gain.connect(ac.destination);
  scapeNode(ac, kind).then((node) => {
    if (v.done) node.port.postMessage(0);
    else { v.node = node; node.connect(gain); }
  }).catch(() => {});
  return v;
}

function ramp(v: Voice, pts: Ramp) {
  const p = v.gain.gain, now = v.gain.context.currentTime, from = p.value;
  p.cancelScheduledValues(now); p.setValueAtTime(from, now);
  for (const [t, g] of pts) p.linearRampToValueAtTime(g, now + t);
}

function end(v: Voice) {
  v.done = true; clearTimeout(v.bye);
  try { v.node?.port.postMessage(0); v.node?.disconnect(); v.gain.disconnect(); } catch {}
  if (cur === v) cur = null;
  if (trial === v) trial = null;
}

function fadeOut(v: Voice, secs = FADE_OUT) {
  ramp(v, scapeRamp(v.gain.gain.value, 0, { quick: secs < FADE_OUT }));
  clearTimeout(v.bye); v.bye = window.setTimeout(() => end(v), secs * 1000 + 300);
}

/** Starts, fades or retunes the soundscape to match the timer and settings. */
export function syncScape(ac: AudioContext | null) {
  if (!ac) return;
  if (ac.state !== clock) { clock = ac.state; if (cur) cur.key = ""; }
  if (ac.state !== "running") return;
  const now = Date.now(), plan = scapePlan(S.settings, T, now), key = plan ? [plan.kind, plan.gain, plan.fadeAt, plan.duckAt].join(":") : "";
  if (cur && !cur.bye && cur.key === key) return;
  if (!plan) { if (cur && !cur.bye) fadeOut(cur); return; }
  if (cur && plan.kind !== cur.kind) { if (!cur.bye) fadeOut(cur); cur = null; }
  cancelScapePreview();
  const steady = !!cur && !cur.bye && cur.target !== plan.gain;
  if (!cur) cur = voice(ac, plan.kind);
  clearTimeout(cur.bye); cur.bye = undefined;
  const secs = (at: number) => (at ? (at - now) / 1000 : undefined);
  ramp(cur, scapeRamp(cur.gain.gain.value, plan.gain, { quick: steady, fadeAt: secs(plan.fadeAt), duckAt: secs(plan.duckAt) }));
  cur.key = key; cur.target = plan.gain;
}

export const scapePlaying = () => !!scapePlan(S.settings, T, Date.now());

/** Plays the chosen soundscape for a few seconds. */
export function previewScape(ac: AudioContext) {
  const kind = scapeOf(S.settings.soundscape);
  cancelScapePreview();
  if (!kind) return;
  trial = voice(ac, kind);
  ramp(trial, previewRamp(scapeVolume(S.settings.soundscapeVolume) / 100));
  const v = trial;
  v.bye = window.setTimeout(() => end(v), 8300);
}

export function cancelScapePreview() { if (trial) { fadeOut(trial, 0.3); trial = null; } }
