export type Feature = { title: string; blurb: string };
export type Area = { key: string; label: string; title: string; lede: string; color: string; items: Feature[] };

export const AREAS: Area[] = [
  {
    key: "timer", label: "Timer", title: "A clock that stays out of the way", color: "var(--tomato)",
    lede: "Focus, short and long breaks, or Flow. One calm dial.",
    items: [
      { title: "Calm clock", blurb: "Controls appear when you need them. Add a minute or five with one tap." },
      { title: "Flow sessions", blurb: "Count up instead of down, stop when you're done, and get a break sized to the session." },
      { title: "Keep going past the bell", blurb: "Keep counting as overtime or add five minutes. It all counts for the task." },
      { title: "Phase colours", blurb: "The timer changes colour between focus and breaks, so you know where you are at a glance." },
      { title: "Floating timer", blurb: "A Picture-in-Picture timer that stays on top of your other windows." },
      { title: "Full screen", blurb: "Just the clock, for when everything else on the screen is the problem." },
      { title: "Fresh rounds", blurb: "The round count starts over on a new day, after a long pause, or when you ask." },
      { title: "Your own rhythm", blurb: "Change the focus, break and long-break lengths, and how often the long break comes." },
    ],
  },
  {
    key: "looks", label: "Looks", title: "A clock you'll like looking at", color: "var(--violet)",
    lede: "Faces, rings and backgrounds, chosen on the timer itself.",
    items: [
      { title: "Fifteen faces", blurb: "Classic, Stacked, Weight, Numerals, Thermostat, Sport, Bedside, Editorial, Split-flap, Odometer, Nixie, VFD, LCD, Dot matrix and In words. Each ticks in its own sound." },
      { title: "Rings", blurb: "An arc, tiles that turn over, LED dots or a glowing filament, or no ring at all, with any face." },
      { title: "Backgrounds", blurb: "Twelve of them, from plain and warm paper to Aurora, Starfield, and Water that fills up as you focus." },
      { title: "Sky and Weather", blurb: "The sky where you are, from dawn to night, or the clouds, rain and snow outside." },
      { title: "Ready-made looks", blurb: "Start from a combination like Notebook or Midnight, or save a mix of your own to switch back to in one tap." },
      { title: "Customize on the timer", blurb: "Right-click the dial or tap the palette. The real timer stays in view, and Cancel puts the old look back." },
    ],
  },
  {
    key: "session", label: "During a session", title: "Small things that keep a round honest", color: "var(--amber)",
    lede: "Sound, nudges and a gentle tick, all optional.",
    items: [
      { title: "Soundscapes", blurb: "Rain, ocean, fire and brown noise, generated in the browser so nothing ever loops." },
      { title: "Mixes", blurb: "Layer up to three sounds, save your mixes, and give breaks a mix of their own." },
      { title: "Break nudges", blurb: "Each break brings one small nudge: rest your eyes, stand up and stretch, or drink some water. Tap it when done." },
      { title: "Your own nudges", blurb: "Write one in plain words, or pick an idea, and choose when it comes up: every few breaks, after a stretch of focus, or at a set time." },
      { title: "Gentle ticking", blurb: "An optional tick during focus, at the pace and volume you like." },
    ],
  },
  {
    key: "planning", label: "Planning", title: "Plan in rounds, not hours", color: "var(--leaf)",
    lede: "Estimate in rounds, plan the day, and let the leftovers come along.",
    items: [
      { title: "Quick add", blurb: "Press N anywhere and type the title, day, rounds, #label and a // note in one line." },
      { title: "Today, Upcoming and Later", blurb: "Plan tasks for today, a day ahead, or someday, and see when today will be done." },
      { title: "Recurring tasks", blurb: "Daily, weekdays, chosen days, every few weeks or monthly. A fresh copy shows up in Today." },
      { title: "Plan around your best time", blurb: "When your biggest task would miss your best hours, Today offers to line it up for then." },
      { title: "Best time in Today", blurb: "Turn it on to see your best hours on a strip of the day, with a tag on the tasks that land in them." },
      { title: "Best time reminder", blurb: "A notification when your best time starts, if you'd like one." },
      { title: "Roll over unfinished tasks", blurb: "On a new day, move yesterday's leftovers into today: always, never, or ask first." },
      { title: "Weekly plan and review", blurb: "Look back, deal with the leftovers, and set a few objectives for the week ahead." },
      { title: "Bulk edit", blurb: "Select several tasks and change their label or day, move them to the top, or finish them together." },
      { title: "Command palette", blurb: "⌘K finds every action: the timer, views, labels, soundscapes, rooms and settings." },
      { title: "Keyboard first", blurb: "Shortcuts for everything you do often. Press ? to see them all." },
    ],
  },
  {
    key: "ledger", label: "The ledger", title: "See where the hours went", color: "var(--sky)",
    lede: "Every minute of focus is written down, per task and per label.",
    items: [
      { title: "Your day", blurb: "One day on four lanes: focus, short breaks, long breaks and idle time. Drag across it to zoom in." },
      { title: "Finished tasks", blurb: "Every finished task, with the rounds you planned against the rounds it took." },
      { title: "Focus by label", blurb: "Hours, share of focus and rounds for each label, over a week, a month or all time." },
      { title: "Weekly recap", blurb: "Total focus, best day, top labels, tasks finished and your streak, against the week before." },
      { title: "Best time of day", blurb: "When your focus actually happens, by hour and weekday, with your strongest window named." },
      { title: "Year in Focus", blurb: "In December, your year as a story made from your own numbers, with the badges you earned along the way." },
    ],
  },
  {
    key: "rooms", label: "Rooms", title: "Focus alongside other people", color: "var(--violet)",
    lede: "Everyone sees who's in the room. Nobody sees your tasks.",
    items: [
      { title: "Public rooms", blurb: "Drop into a room and your timer follows its round, in classic 25/5 or 50/10 deep work." },
      { title: "Private rooms", blurb: "Share a code or an invite link with a team or a study group and keep the same rhythm together." },
      { title: "Sync timers", blurb: "Ask everyone in the room to switch to your timer. It only happens if all of them accept." },
      { title: "Scheduled sessions", blurb: "Recurring public sessions, like deep work 9 to 12 on weekdays, that anyone can plan to join." },
      { title: "Session reminders", blurb: "A notification when a session you planned is starting, even with the app closed." },
      { title: "Reactions", blurb: "A quick 👋 or 🎉 to the room, without breaking anyone's focus." },
    ],
  },
  {
    key: "data", label: "Your data", title: "Yours, in your browser", color: "var(--fg)",
    lede: "No account needed. Nothing to install.",
    items: [
      { title: "No account", blurb: "Your tasks and history are saved in your browser on this device." },
      { title: "Export and import", blurb: "Back up everything to one file and restore it, here or on another device." },
      { title: "Backup reminder", blurb: "A gentle reminder now and then to save a copy." },
      { title: "Works offline", blurb: "Install it from your browser and it opens like an app, with or without a connection." },
    ],
  },
];
