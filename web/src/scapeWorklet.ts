import { makeScape } from "./lib/scapeSynth";
import type { Scape } from "./lib/soundscape";

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor { readonly port: MessagePort; }

class ScapeProcessor extends AudioWorkletProcessor {
  private render; private done = false;
  constructor(o: { processorOptions: { kind: Scape } }) {
    super();
    this.render = makeScape(o.processorOptions.kind, sampleRate);
    this.port.onmessage = () => { this.done = true; };
  }
  process(_in: Float32Array[][], out: Float32Array[][]) {
    const [l, r] = out[0];
    this.render(l, r || new Float32Array(l.length));
    return !this.done;
  }
}

registerProcessor("scape", ScapeProcessor);
