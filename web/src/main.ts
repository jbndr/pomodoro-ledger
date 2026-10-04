import { mount } from "svelte";
import BackupPrompt from "./chrome/BackupPrompt.svelte";
import { maybeRemind } from "./chrome/backupNudge.svelte";
import BarTools from "./chrome/BarTools.svelte";
import Keys from "./chrome/Keys.svelte";
import { toast } from "./chrome/notice.svelte";
import PreviewBanner from "./chrome/PreviewBanner.svelte";
import Tip from "./chrome/Tip.svelte";
import Toast from "./chrome/Toast.svelte";
import { Cloud } from "./cloud";
import Composer from "./composer/Composer.svelte";
import { $, calm } from "./dom";
import { autoFloatHandler, floatBtn, initFloat } from "./float";
import { esc, fmtClock, fmtDate, fmtDur, plural } from "./format";
import { ICON } from "./icons";
import { onKey, setHover } from "./keys";
import { initLayout, measure, setOverlay, sizeTimer, timerLayout } from "./layout";
import { addDays, dayKey, keyTime, sod } from "./lib/dates";
import { normCode } from "./lib/room";
import { cyclesOf, labelHue, projectOf, timeOf } from "./lib/tasks";
import { MODES } from "./lib/timer";
import { initPages } from "./pages";
import LabelPop from "./popovers/LabelPop.svelte";
import Pop from "./popovers/Pop.svelte";
import { pop } from "./popovers/state.svelte";
import WhenPop from "./popovers/WhenPop.svelte";
import { deleteSession, labelSession, moveItems, moveSession } from "./progress/actions";
import Progress from "./progress/Progress.svelte";
import Recap from "./progress/Recap.svelte";
import { renderAll, renderEstPick, renderPill, renderStats, renderTasks, renderTimer, rethemeFloat } from "./render";
import RoomDialog from "./room/RoomDialog.svelte";
import RoomStrip from "./room/RoomStrip.svelte";
import { followRoom, reactionsChanged, reactionsOn, reactWait, renderRoom, RM, roomConnect, roomCreate, roomEnter, roomInStep, roomList, roomReact, roomReset, roomSend } from "./room/net";
import { exportLedger, importLedger, planImport } from "./settings/backup";
import Settings from "./settings/Settings.svelte";
import { bellPending, cancelEnd, cancelTickPreview, ensureAudio, playSound, previewTicking, scheduleEnd, syncTicking } from "./sound";
import { DEMO, ls, S, ss, T } from "./state";
import { Store } from "./store";
import { addSection, addSubtasks, addTask, commitPlacements, completeTask, completing, deleteSubtask, deleteTask, dismissCard, editSubtask, focusOnTask, focusRow, labelTask, moveSection, moveToTomorrow, removeSection, renameSection, renameSubtask, reopenTask, saveField, schedTask, scheduleTask, setActive, setEstimate, setRepeat, toggleCard } from "./tasks/actions";
import { bucketOf, dayName, enterDemo, filterLabel, groupName, guardPreview, inProject, isToday, labelChipName, labelHidden, listHead, markStarted, openOf, preview, sections, shortDay, subsOf, todayKey, viewTasks } from "./tasks/derived";
import ListFoot from "./tasks/ListFoot.svelte";
import ListHead from "./tasks/ListHead.svelte";
import { leaveAsked, leftoverPrompt, moveAsked, newDay } from "./tasks/rollover";
import TaskList from "./tasks/TaskList.svelte";
import TaskViews from "./tasks/TaskViews.svelte";
import { adjust, arm, buzz, complete, dur, flushPartial, setMode, skip, tick, toggle, wakeOn } from "./timer/engine";
import TimerCard from "./timer/TimerCard.svelte";
import { closeLabelPop, closePop, openKeys, openLabelPop, openPop, openRecap, openRoom, openSettings, openWhen, renderSyncTab, ui, type LabelUI, type ListUI, type PopUI, type RecapUI, type SettingsUI, type Sheet, type WhenUI } from "./ui";
import { fsEl, setZen, toggleZen } from "./zen";

["pointerdown", "keydown", "touchstart"].forEach((ev) => addEventListener(ev, ensureAudio, { passive: true, capture: true }));
["fullscreenchange", "webkitfullscreenchange"].forEach((ev) => document.addEventListener(ev, () => { if (!fsEl()) setZen(false); }));
initFloat();
document.addEventListener("pointerdown", dismissCard);
document.addEventListener("keydown", onKey);
$("#openSettings").addEventListener("click", () => openSettings());
initPages();
setInterval(tick, 250);
setInterval(newDay, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { sizeTimer(); tick(); if (T.status === "running") wakeOn(); if (RM.code && !RM.ws) roomConnect(); Cloud.wake(); newDay(); } });
mount(PreviewBanner, { target: $(".app"), anchor: $("main.top"), props: { api: { DEMO, preview, markStarted } } });
mount(BackupPrompt, { target: $(".app"), anchor: $("main.top"), props: { api: { exportLedger, toast } } });
initLayout();
if ("serviceWorker" in navigator && !DEMO) addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

Store.loadLocal();
if (DEMO) enterDemo();
else if (S.tasks.size) S.started = true;
if (!MODES.includes(T.mode)) T.mode = "focus";
if (!T.saved || typeof T.saved !== "object") T.saved = {};
if (!T.adj || typeof T.adj !== "object") T.adj = {};
arm();
if (T.status === "running" && Date.now() >= T.endsAt) complete(T.endsAt);
if (T.status === "running") addEventListener("pointerdown", () => { if (T.status === "running" && !bellPending()) scheduleEnd(); }, { once: true });
setZen(false);
const invite = normCode(new URLSearchParams(location.search).get("room") || "");
const view = ss.get("pl.taskView");
if (view === "today" || view === "upcoming" || view === "later") S.taskView = view;
mount(Progress, { target: $(".app"), props: { api: {
  S, ICON, esc, viewTasks, labelHidden, guardPreview, fmtDur, fmtDate, fmtClock, plural,
  deleteSession, labelSession, moveSession, moveItems, openLabelPop, openPop, closePop, popHidden: () => pop.hidden, reopen: reopenTask, openRecap,
} } });
const roomApi = { RM, ls, invite, setOverlay, sizeTimer, roomSend, roomReset, roomEnter, roomCreate, roomList, followRoom, inStep: roomInStep, openRoom,
  roomReact, reactWait, reactionsOn };
mount(BarTools, { target: $(".bar-right"), anchor: $(".bar-right").firstChild!, props: { api: {
  RM, ls, S, Cloud, DEMO, preview, openRoom, openKeys,
  openSync: () => { if (!DEMO) openSettings("sync"); },
  themed: rethemeFloat,
} } });
mount(RoomStrip, { target: $(".app"), anchor: $(".bar").nextSibling!, props: { api: roomApi } });
timerLayout.observe($("#roomStrip"));
mount(Tip, { target: document.body });
mount(Toast, { target: document.body });
ui.room = mount(RoomDialog, { target: document.body, props: { api: roomApi } }) as Sheet;
ui.keys = mount(Keys, { target: document.body, props: { api: { setOverlay } } }) as Sheet;
ui.recap = mount(Recap, { target: document.body, props: { api: {
  S, T, Store, DEMO, preview, viewTasks, setOverlay, fmtDur, fmtDate, plural,
  overlayHidden: () => !document.querySelector(".overlay:not([hidden])"), syncing: () => Cloud.state === "connecting",
} } }) as RecapUI;
if (invite) {
  try { history.replaceState(null, "", location.pathname); } catch {}
  if (invite.length === 6 && invite !== RM.code) {
    roomReset();
    openRoom();
  } else if (RM.code) roomConnect();
} else if (RM.code) roomConnect();
ui.settings = mount(Settings, { target: document.body, props: { api: {
  S, Store, Cloud, ls, toast, setOverlay, floatable: !floatBtn.hidden, T,
  ensureAudio, playSound, scheduleEnd, cancelEnd, cancelTickPreview, syncTicking, previewTicking,
  autoFloatHandler, renderTimer, renderStats, renderEstPick,
  reactionsChanged, DEMO, backup: { exportLedger, planImport, importLedger },
} } }) as SettingsUI;
mount(TimerCard, { target: $(".timer-card"), props: { api: {
  T, S, ICON, floatBtn, fmtClock, fmtDur, plural, viewTasks, openOf,
  toggle, skip, adjust, setMode, flushPartial, buzz, toggleZen, setActive,
} } });
timerLayout.observe($(".working"));
ui.pop = mount(Pop, { target: document.body, anchor: $("#toast"), props: { api: { ICON } } }) as PopUI;
ui.when = mount(WhenPop, { target: document.body, anchor: $("#toast"), props: { api: { S, todayKey, openOf, isToday, scheduleTask, setRepeat, fmtDate, plural } } }) as WhenUI;
ui.label = mount(LabelPop, { target: document.body, anchor: $("#toast"), props: { api: { S, ICON, renderTasks, saveSettings: () => Store.saveSettings() } } }) as LabelUI;
const panel = $(".top > .panel"), headApi = { S, ss, listHead, plural, fmtDur, fmtClock, preview, guardPreview, filterLabel, renderTasks, moveToTomorrow, leftoverPrompt, moveAsked, leaveAsked };
mount(TaskViews, { target: $(".tasks-head"), props: { api: headApi } });
mount(ListHead, { target: panel, props: { api: headApi } });
mount(ListFoot, { target: panel, props: { api: headApi } });
mount(Composer, { target: panel, anchor: $("#projectFilter"), props: { api: {
  S, ICON, plural, dayName, todayKey, dur, fmtDur, labelChipName, filterLabel, addTask,
  openWhen, openLabelPop, closeLabelPop, labelKey: (e: KeyboardEvent) => ui.label!.key(e), filterLabels: (q: string) => ui.label!.filter(q),
} } });
ui.list = mount(TaskList, { target: panel, anchor: $("#taskFoot"), props: { api: {
  S, ICON, completing, calm, guardPreview,
  todayKey, bucketOf, isToday, sections, openOf, viewTasks, inProject, cyclesOf, timeOf, projectOf, labelHue, labelChipName, subsOf,
  plural, fmtDur, fmtDate, fmtClock, shortDay, dayName, keyTime, dayKey, addDays, sod, dur, groupName,
  renderTasks, commit: commitPlacements, focusRow, hover: setHover,
  open: toggleCard, complete: completeTask, focus: focusOnTask, label: labelTask, sched: schedTask, del: deleteTask, setEst: setEstimate,
  saveField, addSubtasks, subDone: (id: string, subid: string, done: boolean) => editSubtask(id, subid, (s) => { s.done = done; }), renameSub: renameSubtask, deleteSub: deleteSubtask,
  addSection, removeSection, renameSection, moveSection,
} } }) as ListUI;
renderRoom();
renderAll();
measure();
renderSyncTab();
setTimeout(() => ui.recap!.maybeOpen(), 1500);
document.addEventListener("visibilitychange", () => { if (!document.hidden) ui.recap!.maybeOpen(); });
if (!DEMO) Store.connect().then(() => {
  renderPill();
  newDay();
  setTimeout(maybeRemind, 2500);
  setInterval(maybeRemind, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) maybeRemind(); });
  if (!new URLSearchParams(location.search).has("synced")) return;
  history.replaceState(null, "", location.pathname + location.hash);
  if (Cloud.email) toast("Signed in as " + Cloud.email + ". This device now stays in sync.");
});
