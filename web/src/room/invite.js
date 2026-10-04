import { toast } from "../chrome/notice.svelte";

export function copyInvite(code) {
  const link = location.origin + "/?room=" + code;
  const done = () => toast("Invite link copied."), fail = () => toast("Share this code: " + code);
  try { navigator.clipboard.writeText(link).then(done, fail); } catch { fail(); }
}
