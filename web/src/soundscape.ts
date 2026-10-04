import { mixLevels, scapePlan, type Layer, type Levels } from "./lib/mix";
import { FADE_OUT, PHASE_FADE, previewRamp, scapeRamp, scapeVolume, swapRamp, type Ramp } from "./lib/soundscape";
import type { ScapeMsg } from "./scapeWorklet";
import workletUrl from "./scapeWorklet?worker&url";
import { S, T } from "./state";

// One AudioWorklet mixes every layer, so it never loops and keeps going in background tabs.
// Fades ride on a gain node's automation, which runs on the audio clock even while timers are throttled.
type Voice = {
  gain: GainNode; node?: AudioWorkletNode; levels: Levels; key: string; mix: string; phase: string; target: number;
  /** Audio time when a scheduled phase-end fade reaches silence, or 0. */
  endAt: number;
  bye?: number; done?: boolean;
};
const GLIDE = 0.8;
const loaded = new WeakMap<BaseAudioContext, Promise<void>>();
let cur: Voice | null = null, trial: Voice | null = null, clock = "";

export async function scapeNode(ac: BaseAudioContext, levels: Levels) {
  let p = loaded.get(ac);
  if (!p) { p = ac.audioWorklet.addModule(workletUrl); loaded.set(ac, p); }
  await p;
  return new AudioWorkletNode(ac, "scape", { numberOfInputs: 0, outputChannelCount: [2], processorOptions: { levels } });
}

const post = (node: AudioWorkletNode | undefined, msg: ScapeMsg) => node?.port.postMessage(msg);

function voice(ac: AudioContext, levels: Levels): Voice {
  const gain = ac.createGain(), v: Voice = { gain, levels, key: "", mix: "", phase: "", target: 0, endAt: 0 };
  gain.gain.value = 0; gain.connect(ac.destination);
  scapeNode(ac, levels).then((node) => {
    if (v.done) { post(node, "stop"); return; }
    v.node = node; node.connect(gain);
    if (v.levels !== levels) post(node, { levels: v.levels, glide: 0 });
  }).catch(() => {});
  return v;
}

/** Glides the layers to new levels, now or at an audio time. */
function relevel(v: Voice, levels: Levels, glide: number, at = 0) {
  v.levels = levels;
  post(v.node, { levels, glide, at });
}

function ramp(v: Voice, pts: Ramp) {
  const p = v.gain.gain, now = v.gain.context.currentTime, from = p.value;
  p.cancelScheduledValues(now); p.setValueAtTime(from, now);
  for (const [t, g] of pts) p.linearRampToValueAtTime(g, now + t);
}

function end(v: Voice) {
  v.done = true; clearTimeout(v.bye);
  try { post(v.node, "stop"); v.node?.disconnect(); v.gain.disconnect(); } catch {}
  if (cur === v) cur = null;
  if (trial === v) trial = null;
}

const endIn = (v: Voice, secs: number) => { clearTimeout(v.bye); v.bye = window.setTimeout(() => end(v), secs * 1000 + 300); };

function fadeOut(v: Voice, secs = FADE_OUT) {
  ramp(v, scapeRamp(v.gain.gain.value, 0, { quick: secs < FADE_OUT }));
  endIn(v, secs);
}

/** Starts, fades, remixes or retunes the soundscape to match the timer and settings. */
export function syncScape(ac: AudioContext | null) {
  if (!ac) return;
  if (ac.state !== clock) { clock = ac.state; if (cur) cur.key = ""; }
  if (ac.state !== "running") return;
  const now = Date.now(), plan = scapePlan(S.settings, T, now);
  const key = plan ? [plan.phase, plan.mix, plan.gain, plan.fadeAt, plan.duckAt].join(":") : "";
  if (cur && !cur.bye && cur.key === key) return;
  if (!plan) {
    if (!cur || cur.bye) return;
    // A phase that just ended keeps its gentle fade rather than cutting to a quicker one.
    const left = cur.endAt ? cur.endAt - ac.currentTime : Infinity;
    if (left <= PHASE_FADE + 0.25) endIn(cur, Math.max(0, left)); else fadeOut(cur);
    return;
  }
  cancelScapePreview();
  const secs = (at: number) => (at ? (at - now) / 1000 : undefined), times = { fadeAt: secs(plan.fadeAt), duckAt: secs(plan.duckAt) };
  if (!cur) {
    cur = voice(ac, plan.levels);
    ramp(cur, scapeRamp(0, plan.gain, times));
  } else {
    const v = cur, fading = !!v.bye, from = v.gain.gain.value;
    clearTimeout(v.bye); v.bye = undefined;
    if (v.mix === plan.mix) ramp(v, scapeRamp(from, plan.gain, { quick: !fading && v.target !== plan.gain, ...times }));
    else if (v.phase === plan.phase && !fading) {
      relevel(v, plan.levels, GLIDE);
      ramp(v, scapeRamp(from, plan.gain, { quick: v.target !== plan.gain, ...times }));
    } else {
      const swap = swapRamp(from, v.target, plan.gain, times, fading ? FADE_OUT : PHASE_FADE);
      relevel(v, plan.levels, 0.05, ac.currentTime + swap.at);
      ramp(v, swap.ramp);
    }
  }
  Object.assign(cur, { key, mix: plan.mix, phase: plan.phase, target: plan.gain, endAt: plan.fadeAt ? ac.currentTime + times.fadeAt! + PHASE_FADE : 0 });
}

export const scapePlaying = () => !!scapePlan(S.settings, T, Date.now());

/** Plays a mix for a few seconds; called again while it plays, it glides to the new mix and holds a little longer. */
export function previewScape(ac: AudioContext, layers: Layer[]) {
  const gain = scapeVolume(S.settings.soundscapeVolume) / 100;
  if (!layers.length || !gain) { cancelScapePreview(); return; }
  const levels = mixLevels(layers);
  if (trial) relevel(trial, levels, GLIDE); else trial = voice(ac, levels);
  const v = trial;
  ramp(v, previewRamp(gain, v.gain.gain.value));
  endIn(v, 8);
}

export function cancelScapePreview() { if (trial) { fadeOut(trial, 0.3); trial = null; } }
