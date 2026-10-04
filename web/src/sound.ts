import { previewScape, syncScape } from "./soundscape";
import { S, T } from "./state";

// Sound: the end-of-phase bell is scheduled on the audio clock when a phase starts,
// so it rings on time even when the browser throttles timers in a background tab.
let AC: AudioContext | null = null, pending: OscillatorNode[] = [], pendingAt = 0;

export function ensureAudio() {
  try {
    if (!AC) { AC = new (window.AudioContext || window.webkitAudioContext!)(); AC.onstatechange = () => syncScape(AC); }
    if (AC.state === "suspended") AC.resume().catch(() => {});
  } catch {}
  syncTicking();
}

const SOUNDS = {
  focus: { notes: [784, 988, 1175, 1568], gap: 0.17, vol: 0.32, len: 1.9 },
  break: { notes: [1175, 880, 784], gap: 0.22, vol: 0.3, len: 1.7 },
  task: { notes: [1047, 1568], gap: 0.11, vol: 0.24, len: 1.1 },
};

export function playSound(kind: keyof typeof SOUNDS, delay = 0) {
  if (!S.settings.sound) return [];
  ensureAudio();
  const ac = AC;
  if (!ac) return [];
  const spec = SOUNDS[kind], nodes: OscillatorNode[] = [];
  try {
    const master = ac.createGain(); master.gain.value = spec.vol; master.connect(ac.destination);
    spec.notes.forEach((f, i) => {
      const t0 = ac.currentTime + Math.max(0, delay) + i * spec.gap;
      [[1, 1], [2.01, 0.32], [3.02, 0.12]].forEach(([mult, amp]) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = f * mult;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(amp, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.len / mult);
        o.connect(g).connect(master); o.start(t0); o.stop(t0 + spec.len + 0.05);
        nodes.push(o);
      });
    });
  } catch {}
  return nodes;
}

export function cancelEnd() {
  pending.forEach((n) => { try { n.stop(0); } catch {} try { n.disconnect(); } catch {} });
  pending = []; pendingAt = 0;
}

export function scheduleEnd() {
  cancelEnd();
  if (T.status !== "running" || !S.settings.sound) return;
  const d = (T.endsAt - Date.now()) / 1000;
  if (d < 0.05) return;
  pending = playSound(T.mode === "focus" ? "focus" : "break", d);
  if (pending.length) pendingAt = T.endsAt;
}

export const bellPending = () => pending.length > 0;

/** Whether the scheduled bell rang for a phase ending at `at`; it's left to finish either way. */
export function releaseBell(at: number) {
  const rang = !!pendingAt && Math.abs(pendingAt - at) < 2000;
  pending = []; pendingAt = 0;
  return rang;
}

// A looping audio buffer keeps a soft rhythm without background-tab timer bursts.
type Ticker = { source: AudioBufferSourceNode; gain: GainNode };
let ticking: Ticker | null = null, tickingKey = "", tickPreview: Ticker | null = null;

function stopTickingNode(node: Ticker | null) {
  if (!node || !AC) return;
  try {
    const now = AC.currentTime;
    node.gain.gain.cancelScheduledValues(now);
    node.gain.gain.setTargetAtTime(0, now, .008);
    node.source.stop(now + .04);
  } catch {}
}

export function cancelTickPreview() { stopTickingNode(tickPreview); tickPreview = null; }

function tickingNode(seconds: number): Ticker | null {
  if (!AC) return null;
  const pace = [1, 2, 4].includes(+S.settings.tickPace) ? +S.settings.tickPace : 2;
  const volume = Math.max(0, Math.min(100, +S.settings.tickVolume || 0)) / 100;
  if (!volume || seconds <= 0) return null;
  const buffer = AC.createBuffer(1, Math.ceil(AC.sampleRate * pace), AC.sampleRate);
  const samples = buffer.getChannelData(0);
  // Rounded attack and low sine harmonics avoid the sharp click of a clock.
  for (let i = 0; i < Math.min(samples.length, AC.sampleRate * .18); i++) {
    const t = i / AC.sampleRate, envelope = Math.min(1, t / .008) * Math.exp(-t * 38);
    samples[i] = .16 * envelope * (Math.sin(2 * Math.PI * 480 * t) + .18 * Math.sin(2 * Math.PI * 960 * t));
  }
  const source = AC.createBufferSource(), gain = AC.createGain();
  source.buffer = buffer; source.loop = true;
  gain.gain.value = volume;
  source.connect(gain).connect(AC.destination);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
  source.start(AC.currentTime + .03);
  source.stop(AC.currentTime + seconds);
  return { source, gain };
}

export function previewTicking() { tickPreview = tickingNode(6); }

export function previewSoundscape() { ensureAudio(); try { if (AC) previewScape(AC); } catch {} }

/** Keeps the ticking and the soundscape in step with the timer. */
export function syncTicking() {
  try { syncScape(AC); } catch {}
  const on = AC && S.settings.ticking && T.mode === "focus" && T.status === "running" && T.endsAt > Date.now();
  const key = on ? [T.endsAt, S.settings.tickVolume, S.settings.tickPace].join(":") : "";
  if (key === tickingKey) return;
  stopTickingNode(ticking); ticking = null; tickingKey = "";
  if (on) {
    cancelTickPreview();
    try { ticking = tickingNode((T.endsAt - Date.now()) / 1000); if (ticking) tickingKey = key; } catch {}
  }
}
