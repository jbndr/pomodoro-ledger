export type Feature = { id: string; title: string; blurb: string };
export type Area = { key: string; title: string; lede: string; shipped: Feature[] };

export const AREAS: Area[] = [
  {
    key: "timer", title: "The timer", lede: "Focus, short and long breaks, or Flow — one calm dial that gets out of the way.",
    shipped: [
      { id: "timer-card-redesign", title: "Calm clock", blurb: "Controls appear when you need them. The rounds start over on a new day or after a long pause." },
      { id: "flow-sessions", title: "Flow sessions", blurb: "Count up instead of down, stop when you're done, and get a break sized to the session." },
      { id: "flow-overtime", title: "Keep going past the bell", blurb: "One key keeps counting as overtime or adds five minutes — and it all lands in the ledger." },
      { id: "oklch-phase-morph", title: "Phase colours", blurb: "The timer shifts colour between focus and breaks, so you know where you are at a glance." },
    ]
  },
  {
    key: "session", title: "During a session", lede: "Small things that keep a round honest.",
    shipped: [
      { id: "soundscape-mixer", title: "Soundscapes and mixes", blurb: "Rain, ocean, fire and brown noise, generated in the browser. Layer them and save your mixes." },
      { id: "site-blocker", title: "Site blocker extension", blurb: "Blocks the sites you choose while a focus round runs, with a calm page instead." },
      { id: "body-break-nudges", title: "Body break nudges", blurb: "Each break carries one small nudge: rest your eyes, stretch, drink some water." },
    ]
  },
  {
    key: "planning", title: "Tasks and planning", lede: "Estimate in rounds, plan the day, and let the leftovers come along.",
    shipped: [
      { id: "quick-add", title: "Quick add", blurb: "Press N anywhere: type the title, date, rounds, #label and a // note in one line." },
      { id: "recurring-tasks", title: "Recurring tasks", blurb: "Daily, weekdays, chosen days, every two weeks, monthly — a fresh copy shows up in Today." },
      { id: "rollover", title: "Roll over unfinished tasks", blurb: "On a new day, move yesterday's leftovers into today — always, never, or ask." },
      { id: "weekly-plan-review", title: "Weekly plan and review", blurb: "Look back, deal with the leftovers, and set a few objectives for the week ahead." },
      { id: "bulk-edit", title: "Bulk edit", blurb: "Select several tasks and change their label or date, move them to the top, or finish them together." },
      { id: "command-palette", title: "Command palette", blurb: "⌘K finds every action: timer, views, labels, soundscapes, rooms and settings." },
    ]
  },
  {
    key: "insights", title: "The ledger", lede: "Every minute of focus is written down, per task and per label.",
    shipped: [
      { id: "weekly-recap", title: "Weekly recap", blurb: "Total focus, best day, top labels, tasks finished and your streak, against the week before." },
      { id: "best-time-of-day", title: "Best time of day", blurb: "When your focus actually happens, by hour and weekday, with your strongest window named." },
      { id: "year-in-focus", title: "Year in Focus", blurb: "A story of your year: hours, top labels, biggest month and longest streak." },
    ]
  },
  {
    key: "rooms", title: "Rooms", lede: "Focus alongside other people. Everyone sees the room; nobody sees your tasks.",
    shipped: [
      { id: "scheduled-rooms", title: "Scheduled public sessions", blurb: "Recurring sessions like deep work 9–12 on weekdays that anyone can plan to join." },
      { id: "push-reminders", title: "Session reminders", blurb: "A notification when a session you planned is starting, even with the app closed." },
      { id: "room-reactions", title: "Reactions", blurb: "A quick 👋 or 🎉 to the room, without breaking anyone's focus." },
    ]
  },
  {
    key: "data", title: "Your data", lede: "Works without an account. Syncs between devices when you want it to.",
    shipped: [
      { id: "local-export", title: "Export and import", blurb: "Back up everything to a file and restore it — no account needed." },
      { id: "backup-reminder", title: "Backup reminder", blurb: "If you never sign in, a gentle reminder now and then to save a copy." },
    ]
  },
];
