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
import { announce } from "./extension";
import { autoFloatHandler, floatBtn, initFloat } from "./float";
import { esc, fmtClock, fmtDate, fmtDur, plural } from "./format";
import { ICON } from "./icons";
import { MOD, onKey, setHover } from "./keys";
import { initLayout, measure, setOverlay, sizeTimer, timerLayout } from "./layout";
import { addDays, dayKey, keyTime, sod } from "./lib/dates";
import { normCode } from "./lib/room";
import { scheduleOf } from "./lib/schedule";
import { cyclesOf, labelHue, projectOf, timeOf } from "./lib/tasks";
import { MODES } from "./lib/timer";
import { initPages } from "./pages";
import "./palette/commands";
import "./year/commands";
import Palette from "./palette/Palette.svelte";
import { commands } from "./palette/registry";
import { goalLookup, planDue, plans, savePlan, stopOffering, waveOff, weekGoals } from "./plan/actions";
import "./plan/commands";
import PlanPrompt from "./plan/PlanPrompt.svelte";
import PlanSheet from "./plan/PlanSheet.svelte";
import LabelPop from "./popovers/LabelPop.svelte";
import Pop from "./popovers/Pop.svelte";
import { pop } from "./popovers/state.svelte";
import WhenPop from "./popovers/WhenPop.svelte";
import { deleteSession, labelSession, moveItems, moveSession } from "./progress/actions";
import Progress from "./progress/Progress.svelte";
import Recap from "./progress/Recap.svelte";
import { renderAll, renderEstPick, renderPill, renderStats, renderTasks, renderTimer, rethemeFloat } from "./render";
import Together from "./room/Together.svelte";
import RoomStrip from "./room/RoomStrip.svelte";
import { followRoom, reactionsChanged, reactionsOn, reactWait, renderRoom, RM, roomConnect, roomCreate, roomEnter, roomInStep, roomList, roomReact, roomReset, roomSend } from "./room/net";
import { Sched, watchReminders } from "./room/sched";
import { exportLedger, importLedger, planImport } from "./settings/backup";
import Settings from "./settings/Settings.svelte";
import { bellPending, cancelEnd, cancelTickPreview, ensureAudio, playSound, previewSoundscape, previewTicking, scheduleEnd, syncTicking } from "./sound";
import { cancelScapePreview, scapePlaying } from "./soundscape";
import { DEMO, EMBED, ls, S, ss, T, type Task } from "./state";
import { Labels, Store } from "./store";
import { addSection, addSubtasks, addTask, commitPlacements, pauseRepeat, resumeRepeat, completeTask, completing, deleteSubtask, deleteTask, deleteTasks, dismissCard, editSubtask, finishTasks, focusOnTask, focusRow, labelTask, labelTasks, moveSection, moveTasksToTop, moveToTomorrow, removeSection, renameSection, renameSubtask, reopenTask, saveField, schedTask, schedTasks, scheduleTask, setActive, setEstimate, setRepeat, toggleCard } from "./tasks/actions";
import { bucketOf, dayName, enterDemo, filterLabel, groupName, guardPreview, inProject, isToday, labelChipName, labelHidden, listHead, markStarted, openOf, preview, sections, shortDay, subsOf, todayKey, viewTasks } from "./tasks/derived";
import ListFoot from "./tasks/ListFoot.svelte";
import ListHead from "./tasks/ListHead.svelte";
import { leaveAsked, leftoverPrompt, moveAsked, newDay } from "./tasks/rollover";
import BulkBar from "./tasks/BulkBar.svelte";
import TaskList from "./tasks/TaskList.svelte";
import TaskViews from "./tasks/TaskViews.svelte";
import { adjust, arm, buzz, canKeepGoing, complete, dur, flushPartial, freshRounds, keepGoing, nudgeDone, readyFlow, resetRounds, setMode, skip, tick, toggle, wakeOn } from "./timer/engine";
import TimerCard from "./timer/TimerCard.svelte";
import { closeKeys, closeLabelPop, closePop, closeRecap, closeRoom, closeSettings, closeWhen, openKeys, openLabelPop, openPalette, openPlan, openPop, openRecap, openRoom, toggleRoom, openSettings, openShare, openWhen, openYear, renderSyncTab, ui, type LabelUI, type ListUI, type PaletteUI, type PopUI, type RecapUI, type RoomUI, type SettingsUI, type ShareUI, type Sheet, type WhenUI, type YearUI } from "./ui";
import Year from "./year/Year.svelte";
import ShareSheet from "./year/ShareSheet.svelte";
import { fsEl, setZen, toggleZen } from "./zen";

["pointerdown", "keydown", "touchstart"].forEach((ev) => addEventListener(ev, ensureAudio, { passive: true, capture: true }));
["fullscreenchange", "webkitfullscreenchange"].forEach((ev) => document.addEventListener(ev, () => { if (!fsEl()) setZen(false); }));
initFloat();
document.addEventListener("pointerdown", dismissCard);
document.addEventListener("keydown", onKey);
initPages();
setInterval(tick, 250);
setInterval(() => { newDay(); freshRounds(); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { sizeTimer(); tick(); if (T.status === "running") wakeOn(); if (RM.code && !RM.ws) roomConnect(); Cloud.wake(); newDay(); freshRounds(); } });
mount(PreviewBanner, { target: $(".app"), anchor: $("main.top"), props: { api: { DEMO, EMBED, preview, markStarted } } });
mount(BackupPrompt, { target: $(".app"), anchor: $("main.top"), props: { api: { exportLedger, toast } } });
mount(PlanPrompt, { target: $(".app"), anchor: $("main.top"), props: { api: { planDue, waveOff, stopOffering, openPlan } } });
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
  deleteSession, labelSession, moveSession, moveItems, openLabelPop, openPop, closePop, popHidden: () => pop.hidden, reopen: reopenTask, openRecap, openPlan, weekGoals, openYear,
} } });
const roomApi = { RM, S, ls, esc, invite, setOverlay, sizeTimer, roomSend, roomReset, roomEnter, roomCreate, roomList, followRoom, inStep: roomInStep, openRoom, sched: Sched,
  roomReact, reactWait, reactionsOn };
mount(BarTools, { target: $(".bar-right"), props: { api: {
  RM, ls, S, Cloud, DEMO, preview, openRoom: toggleRoom, openKeys, openPalette, openSettings: () => openSettings(),
  openSync: () => { if (!DEMO) openSettings("sync"); },
  themed: rethemeFloat,
} } });
mount(RoomStrip, { target: $(".app"), anchor: $(".bar").nextSibling!, props: { api: roomApi } });
timerLayout.observe($("#roomStrip"));
mount(BulkBar, { target: document.body, props: { api: { S, ICON, shown: (t: Task) => bucketOf(t) === S.taskView && inProject(t), toTop: moveTasksToTop, labelMany: labelTasks, schedMany: schedTasks, finishMany: finishTasks, deleteMany: deleteTasks } } });
mount(Tip, { target: document.body });
mount(Toast, { target: document.body });
ui.room = mount(Together, { target: document.body, props: { api: roomApi } }) as RoomUI;
watchReminders(openRoom);
ui.keys = mount(Keys, { target: document.body, props: { api: { setOverlay, MOD, openPalette } } }) as Sheet;
ui.recap = mount(Recap, { target: document.body, props: { api: {
  S, T, Store, DEMO, preview, viewTasks, setOverlay, fmtDur, fmtDate, plural, toast, openShare,
  overlayHidden: () => !document.querySelector(".overlay:not([hidden])"), syncing: () => Cloud.state === "connecting",
} } }) as RecapUI;
ui.plan = mount(PlanSheet, { target: document.body, props: { api: {
  S, viewTasks, setOverlay, fmtDur, fmtDate, plural, plans, savePlan, addLabel: (name: string) => Labels.add(name),
  overlayHidden: () => !document.querySelector(".overlay:not([hidden])"),
} } }) as Sheet;
ui.year = mount(Year, { target: document.body, props: { api: {
  S, T, Store, DEMO, preview, viewTasks, setOverlay, fmtDur, fmtDate, fmtClock, plural, toast, openShare,
  overlayHidden: () => !document.querySelector(".overlay:not([hidden])"), syncing: () => Cloud.state === "connecting",
} } }) as YearUI;
ui.share = mount(ShareSheet, { target: document.body, props: { api: { setOverlay, toast } } }) as ShareUI;
if (invite) {
  try { history.replaceState(null, "", location.pathname); } catch {}
  if (invite.length === 6 && invite !== RM.code) {
    roomReset();
    if (scheduleOf(invite) && RM.name) roomEnter(invite);
    else openRoom();
  } else if (RM.code) roomConnect();
} else if (RM.code) roomConnect();
ui.settings = mount(Settings, { target: document.body, props: { api: {
  S, Store, Cloud, ls, toast, setOverlay, floatable: !floatBtn.hidden, T, ICON,
  ensureAudio, playSound, scheduleEnd, cancelEnd, cancelTickPreview, syncTicking, previewTicking,
  previewSoundscape, cancelScapePreview, scapePlaying,
  autoFloatHandler, renderTimer, renderStats, renderEstPick,
  reactionsChanged, DEMO, backup: { exportLedger, planImport, importLedger },
} } }) as SettingsUI;
mount(TimerCard, { target: $(".timer-card"), props: { api: {
  T, S, ICON, floatBtn, fmtClock, fmtDur, plural, viewTasks, openOf,
  toggle, skip, adjust, setMode, flushPartial, buzz, toggleZen, setActive, keepGoing, canKeepGoing, nudgeDone, readyFlow, resetRounds,
} } });
ui.pop = mount(Pop, { target: document.body, anchor: $("#toast"), props: { api: { ICON } } }) as PopUI;
ui.when = mount(WhenPop, { target: document.body, anchor: $("#toast"), props: { api: { S, todayKey, openOf, isToday, scheduleTask, setRepeat, pauseRepeat, resumeRepeat, fmtDate, plural } } }) as WhenUI;
ui.label = mount(LabelPop, { target: document.body, anchor: $("#toast"), props: { api: { S, ICON, renderTasks, saveSettings: () => Store.saveSettings(), setLabelHue: (name: string, hue: number) => { Labels.setHue(name, hue); renderAll(); } } } }) as LabelUI;
const panel = $(".top > .panel"), headApi = { S, ss, listHead, plural, fmtDur, fmtClock, preview, guardPreview, filterLabel, renderTasks, moveToTomorrow, leftoverPrompt, moveAsked, leaveAsked };
mount(TaskViews, { target: $(".tasks-head"), props: { api: headApi } });
mount(ListHead, { target: panel, props: { api: headApi } });
mount(ListFoot, { target: panel, props: { api: headApi } });
mount(Composer, { target: panel, anchor: $(".filter-fold"), props: { api: {
  S, ICON, plural, dayName, todayKey, dur, fmtDur, labelChipName, filterLabel, addTask, calm,
  openWhen, openLabelPop, closeLabelPop, labelKey: (e: KeyboardEvent) => ui.label!.key(e), filterLabels: (q: string) => ui.label!.filter(q),
} } });
ui.list = mount(TaskList, { target: panel, anchor: $("#taskFoot"), props: { api: {
  S, ICON, completing, calm, guardPreview,
  todayKey, bucketOf, isToday, sections, openOf, viewTasks, inProject, cyclesOf, timeOf, projectOf, labelHue, labelChipName, subsOf,
  plural, fmtDur, fmtDate, fmtClock, shortDay, dayName, keyTime, dayKey, addDays, sod, dur, groupName,
  renderTasks, commit: commitPlacements, focusRow, hover: setHover, goalLookup,
  open: toggleCard, complete: completeTask, focus: focusOnTask, label: labelTask, sched: schedTask, del: deleteTask, setEst: setEstimate, toTop: moveTasksToTop, buzz,
  saveField, addSubtasks, subDone: (id: string, subid: string, done: boolean) => editSubtask(id, subid, (s) => { s.done = done; }), renameSub: renameSubtask, deleteSub: deleteSubtask,
  addSection, removeSection, renameSection, moveSection,
} } }) as ListUI;
ui.palette = mount(Palette, { target: document.body, props: { api: { ls, setOverlay, commands, MOD, closeOthers: () => {
  closePop(); closeWhen(); closeLabelPop();
  for (const [id, close] of [["#settings", closeSettings], ["#room", closeRoom], ["#keys", closeKeys], ["#recap", closeRecap]] as const) if (!$(id).hidden) close();
} } } }) as PaletteUI;
renderRoom();
renderAll();
announce();
measure();
renderSyncTab();
if (EMBED) document.documentElement.style.scrollbarWidth = "none";
else {
  setTimeout(() => ui.recap!.maybeOpen(), 1500);
  setTimeout(() => ui.year!.maybeOpen(), 2500);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { ui.recap!.maybeOpen(); ui.year!.maybeOpen(); } });
}
if (!DEMO) Store.connect().then(() => {
  renderPill();
  newDay(); freshRounds();
  setTimeout(maybeRemind, 2500);
  setInterval(maybeRemind, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) maybeRemind(); });
  if (!new URLSearchParams(location.search).has("synced")) return;
  history.replaceState(null, "", location.pathname + location.hash);
  if (Cloud.email) toast("Signed in as " + Cloud.email + ". This device now stays in sync.");
});
