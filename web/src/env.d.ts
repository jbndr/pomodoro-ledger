export {};

declare global {
  interface Window {
    /** The host's storage bridge when the app runs embedded; its handles are untyped. */
    claude?: { use(name: string): Promise<any> };
    documentPictureInPicture?: { requestWindow(o: { width: number; height: number }): Promise<Window> };
    webkitAudioContext?: typeof AudioContext;
  }
  interface Document {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void>;
  }
  interface HTMLElement {
    webkitRequestFullscreen?: () => Promise<void>;
  }
}
