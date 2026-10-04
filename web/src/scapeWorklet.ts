import type { Levels } from "./lib/mix";
import { Mixer } from "./lib/scapeSynth";

declare const sampleRate: number, currentTime: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor { readonly port: MessagePort; }

export type ScapeMsg = "stop" | { levels: Levels; glide: number; at?: number };

class ScapeProcessor extends AudioWorkletProcessor {
  private mix = new Mixer(sampleRate); private done = false; private next: Exclude<ScapeMsg, "stop"> | null = null;
  constructor(o: { processorOptions: { levels: Levels } }) {
    super();
    this.mix.set(o.processorOptions.levels, 0);
    this.port.onmessage = ({ data }: MessageEvent<ScapeMsg>) => {
      if (data === "stop") this.done = true;
      else if ((data.at ?? 0) > currentTime) this.next = data;
      else { this.next = null; this.mix.set(data.levels, data.glide); }
    };
  }
  process(_in: Float32Array[][], out: Float32Array[][]) {
    if (this.next && currentTime >= this.next.at!) { this.mix.set(this.next.levels, this.next.glide); this.next = null; }
    const [l, r] = out[0];
    this.mix.render(l, r || new Float32Array(l.length));
    return !this.done;
  }
}

registerProcessor("scape", ScapeProcessor);
