(() => {
  const ext = globalThis.browser ?? globalThis.chrome;
  document.documentElement.dataset.plExtension = ext.runtime.getManifest().version;
  addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || typeof d !== "object" || d.source !== "pomodoro-ledger" || d.type !== "timer") return;
    const { mode, status, endsAt, task } = d;
    try { ext.runtime.sendMessage({ type: "timer", mode, status, endsAt, task }).catch(() => {}); } catch {}
  });
})();
