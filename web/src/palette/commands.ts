import { toast } from "../chrome/notice.svelte";
import { $, calm, taskRow } from "../dom";
import { floatBtn } from "../float";
import { plural } from "../format";
import { ICON } from "../icons";
import { quickAdd } from "../keys";
import { nextTheme, normTheme, themeName } from "../lib/chrome";
import { choose, describeMix, mixCode, parseMix, phaseMix, PRESETS, savedMixes, type SavedMix } from "../lib/mix";
import { labelHue, projectOf } from "../lib/tasks";
import { MODE_NAME, MODES } from "../lib/timer";
import { phone, showPage } from "../pages";
import { renderTasks } from "../render";
import { exportLedger } from "../settings/backup";
import { cancelEnd, cancelTickPreview, previewSoundscape, scheduleEnd, syncTicking } from "../sound";
import { cancelScapePreview, scapePlaying } from "../soundscape";
import { S, ss, T, type View } from "../state";
import { Store } from "../store";
import { focusOnTask, focusRow, toggleCard } from "../tasks/actions";
import { bucketOf, dayName, inProject, listHead, viewTasks } from "../tasks/derived";
import { adjust, flushPartial, setMode, skip, toggle } from "../timer/engine";
import { fillSettings, openKeys, openRecap, openRoom, openSettings } from "../ui";
import { fsEl, toggleZen } from "../zen";
import { addCommands, type Command } from "./registry";

const svg = (body: string, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const G = {
  skip: svg('<path d="M5 5l10 7-10 7z"/><path d="M19 5v14"/>', 2),
  reset: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>', 2),
  plus: svg('<path d="M12 6v12M6 12h12"/>', 2),
  minus: svg('<path d="M6 12h12"/>', 2),
  focus: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>'),
  cup: svg('<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M9 3.5v2.5M12 3.5v2.5"/>'),
  float: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="11" y="11" width="8" height="7" rx="1" fill="currentColor" stroke="none"/>'),
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>'),
  progress: svg('<path d="M4 20h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/>'),
  recap: svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M8 16v-2M12 16v-3M16 16v-1"/>'),
  later: svg('<rect x="4" y="5" width="16" height="5" rx="1.5"/><path d="M5.5 10v7.5A1.5 1.5 0 0 0 7 19h10a1.5 1.5 0 0 0 1.5-1.5V10M10 14h4"/>'),
  wave: svg('<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>'),
  mute: svg('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  tick: svg('<path d="M8.5 4h7L19 20H5z"/><path d="M12 15l4-8"/>'),
  bell: svg('<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  settings: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  keys: svg('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>'),
  room: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.2c2.2.2 3.6 1.6 4 3.8"/>'),
  theme: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>'),
  download: svg('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/>'),
  sync: svg('<path d="M7 18.5h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 10.6 4 4 0 0 0 7 18.5z"/>'),
  ring: '<i class="pal-ring" aria-hidden="true"></i>',
};
const dot = (name: string) => `<i class="label-dot" style="--h:${labelHue(name)}" aria-hidden="true"></i>`;

const VIEWS: [View, string, string][] = [["today", "Today", ICON.star], ["upcoming", "Upcoming", ICON.cal], ["later", "Later", G.later]];

const smooth = (): ScrollBehavior => (calm() ? "auto" : "smooth");
const click = (sel: string) => document.querySelector<HTMLElement>(sel)?.click();

function showTasks() {
  if (phone()) showPage("tasks");
  else $(".top > .panel").scrollIntoView({ block: "nearest", behavior: smooth() });
}

function openTask(id: string) {
  const t = S.tasks.get(id);
  if (!t) return;
  const view = bucketOf(t);
  if (S.taskView !== view) { S.taskView = view; ss.set("pl.taskView", view); }
  if (!inProject(t)) S.projectFilter = "";
  renderTasks();
  focusRow(taskRow(id));
  if (S.openTask !== id) toggleCard(id);
}

function saveSound(note: string) {
  syncTicking(); Store.saveSettings(); fillSettings();
  toast(note);
}

function setScape(m: SavedMix | null) {
  cancelScapePreview();
  if (!m) { choose(S.settings, "focus", ""); choose(S.settings, "break", ""); saveSound("Soundscape off."); return; }
  choose(S.settings, "focus", m.mix);
  if (!scapePlaying()) previewSoundscape(parseMix(m.mix));
  saveSound(m.name + (scapePlaying() ? " is playing." : " plays while you focus. Here's a taste."));
}

addCommands(() => {
  const running = T.status === "running", idle = T.status === "idle";
  const active = S.activeId ? viewTasks().get(S.activeId) : null;
  const zen = document.body.classList.contains("zen");
  const out: Command[] = [
    {
      id: "timer.toggle", group: "Timer", suggest: true, keys: ["Space"], words: "start pause resume play stop timer",
      title: running ? "Pause" : idle ? "Start " + MODE_NAME[T.mode].toLowerCase() : "Resume " + MODE_NAME[T.mode].toLowerCase(),
      hint: T.mode === "focus" && active && !running ? active.title : "",
      icon: running ? ICON.pause : ICON.play, run: toggle,
    },
    { id: "timer.skip", group: "Timer", suggest: !idle, keys: ["S"], title: T.mode === "focus" ? "Skip to the break" : "Skip to focus", words: "next phase", icon: G.skip, run: skip },
    { id: "timer.reset", group: "Timer", title: "Reset timer", words: "restart", icon: G.reset, run: () => { flushPartial(); setMode(T.mode); } },
    { id: "timer.more", group: "Timer", keys: ["+"], title: "Add a minute", words: "longer extend plus", icon: G.plus, run: () => adjust(1) },
    { id: "timer.less", group: "Timer", keys: ["−"], title: "Take a minute off", words: "shorter minus", icon: G.minus, run: () => adjust(-1) },
    ...MODES.filter((m) => m !== T.mode).map((m): Command => ({
      id: "timer.mode." + m, group: "Timer", title: "Switch to " + MODE_NAME[m].toLowerCase(), words: "mode", icon: m === "focus" ? G.focus : G.cup, run: () => setMode(m, true),
    })),
    { id: "timer.zen", group: "Timer", keys: ["F"], title: zen ? "Leave the full page" : "Fill the page with the timer", words: "zen", icon: zen ? ICON.shrink : ICON.expand, run: () => toggleZen() },
    { id: "timer.full", group: "Timer", keys: ["⇧", "F"], title: fsEl() ? "Exit full screen" : "Full screen", words: "zen", icon: fsEl() ? ICON.shrink : ICON.expand, run: () => toggleZen(true) },
  ];
  if (!floatBtn.hidden) {
    const open = floatBtn.getAttribute("aria-pressed") === "true";
    out.push({ id: "timer.float", group: "Timer", title: open ? "Close the floating timer" : "Open the floating timer", words: "picture in picture pip mini window", icon: G.float, run: () => floatBtn.click() });
  }

  out.push({ id: "task.new", group: "Tasks", suggest: true, keys: ["N"], title: "New task", words: "add create quick", icon: G.plus, run: quickAdd });
  const open = [...viewTasks().values()].filter((t) => !t.done && !t.system);
  const rank = (t: (typeof open)[number]) => (t.id === S.activeId ? 0 : { today: 1, upcoming: 2, later: 3 }[bucketOf(t)]);
  for (const t of open.sort((a, b) => rank(a) - rank(b))) {
    const when = bucketOf(t), label = projectOf(t);
    out.push({
      id: "task:" + t.id, group: "Tasks", searchOnly: true, title: t.title, words: label,
      hint: t.id === S.activeId ? "Working on" : [label, when === "upcoming" && t.plan ? dayName(t.plan) : when === "today" ? "Today" : "Later"].filter(Boolean).join(" · "),
      icon: label ? dot(label) : G.ring, verb: "Focus on it", alt: "Open",
      run: (alt) => (alt ? openTask(t.id) : focusOnTask(t.id)),
    });
  }

  const h = listHead();
  for (const [view, name, icon] of VIEWS) {
    out.push({ id: "go." + view, group: "Go to", title: name, words: "view tasks list", hint: h.byView[view] ? plural(h.byView[view], "open task") : "", on: S.taskView === view, icon,
      run: () => { click(`#taskViews [data-view="${view}"]`); showTasks(); } });
  }
  if (phone()) {
    out.push({ id: "go.timer", group: "Go to", title: "Timer", words: "page", icon: G.timer, run: () => showPage("timer") });
    out.push({ id: "go.tasks", group: "Go to", title: "Tasks", words: "page", icon: ICON.list, run: () => showPage("tasks") });
  }
  out.push({ id: "go.progress", group: "Go to", title: "Progress", words: "stats charts history ledger", icon: G.progress,
    run: () => (phone() ? showPage("progress") : $(".progress").scrollIntoView({ block: "start", behavior: smooth() })) });
  out.push({ id: "go.recap", group: "Go to", title: "Weekly recap", words: "review last week summary", icon: G.recap, run: () => openRecap() });

  if (h.labeled) {
    for (const c of h.chips) {
      out.push({
        id: "label:" + (c.v || "all"), group: "Filter by label", title: c.v ? c.name : "All labels", words: "filter label project show only",
        hint: plural(c.n, "open task"), on: S.projectFilter === c.v, icon: c.hue != null ? dot(c.name) : c.v === "none" ? '<i class="label-dot none" aria-hidden="true"></i>' : ICON.tag,
        run: () => { if (phone()) showPage("tasks"); click(`#projectFilter [data-filter="${CSS.escape(c.v)}"]`); showTasks(); },
      });
    }
  }

  const focusMix = mixCode(phaseMix(S.settings, "focus")), anyMix = focusMix || phaseMix(S.settings, "break").length;
  for (const m of [...PRESETS, ...savedMixes(S.settings.scapeMixes)]) {
    out.push({ id: "sound.scape." + m.id, group: "Sound", title: "Soundscape: " + m.name, words: "soundscape mix ambient noise background music " + describeMix(parseMix(m.mix)),
      on: focusMix === m.mix, icon: G.wave, run: () => setScape(m) });
  }
  if (anyMix) out.push({ id: "sound.scape.off", group: "Sound", title: "Turn the soundscape off", words: "soundscape ambient noise background music mute", icon: G.mute, run: () => setScape(null) });
  out.push({ id: "sound.ticking", group: "Sound", title: S.settings.ticking ? "Turn ticking off" : "Turn ticking on", words: "tick clock metronome", icon: G.tick,
    run: () => { S.settings.ticking = !S.settings.ticking; cancelTickPreview(); saveSound(S.settings.ticking ? "Ticking on. It plays while you focus." : "Ticking off."); } });
  out.push({ id: "sound.bell", group: "Sound", title: S.settings.sound ? "Mute the end sounds" : "Turn the end sounds on", words: "bell chime alert sound mute", icon: S.settings.sound ? G.mute : G.bell,
    run: () => { S.settings.sound = !S.settings.sound; if (S.settings.sound) scheduleEnd(); else cancelEnd(); saveSound(S.settings.sound ? "Sounds on." : "Sounds muted."); } });

  const theme = normTheme(document.documentElement.dataset.theme);
  out.push(
    { id: "app.room", group: "App", suggest: true, title: "Work together", words: "room friends cowork share", icon: G.room, run: () => openRoom() },
    { id: "app.theme", group: "App", title: "Switch theme", hint: themeName(theme) + " → " + themeName(nextTheme(theme)), words: "dark light system appearance mode", icon: G.theme, run: () => click("#themeBtn") },
    { id: "app.settings", group: "App", suggest: true, title: "Settings", words: "preferences options durations", icon: G.settings, run: () => openSettings() },
    { id: "app.keys", group: "App", keys: ["?"], title: "Keyboard shortcuts", words: "keys help hotkeys", icon: G.keys, run: () => openKeys() },
    { id: "app.export", group: "App", title: "Export a backup", words: "download save json data", icon: G.download, run: exportLedger },
    { id: "app.sync", group: "App", title: "Data & sync", words: "import backup account sign in cloud devices", icon: G.sync, run: () => openSettings("sync") },
  );
  return out;
});
