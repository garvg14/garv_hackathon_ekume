# WattWatch — Hostel Energy Games

A gamified dashboard that tracks electricity usage per hostel room, ranks rooms
on a public leaderboard, and rewards low-usage rooms with badges and coupons.
Plain HTML/CSS/JS — no build step, no backend required to run it.

## Features

- **Room profile** — name, room number, number of roommates.
- **Usage logging** — manual daily kWh entry via the dashboard's log form
  (swap this for real smart-meter input later — see "Next steps").
- **Analog power gauge** — the dashboard's centerpiece; needle position and
  fill color reflect today's usage per person.
- **Leaderboard** — ranks all rooms by 7-day average kWh **per person** (not
  raw total), so a 3-person room isn't unfairly compared to a single room.
- **Daily & weekly challenges** — progress bars against configurable targets.
- **Badges** — First Reading, Energy Saver, Streak Master, Eco Champion,
  Week Warrior — unlock automatically and can hand out a coupon.
- **Coupons** — canteen discounts / campus event passes, each with a random
  redeemable code, shown in the Badges & Coupons tab.
- **Wastage alerts** — if a day's usage is 1.4× (configurable) a room's own
  recent average, a banner appears and a notification fires.
- **Browser notifications** — motivational nudges, wastage alerts, and badge
  unlocks, via the `Notification` API (permission requested from the bell
  icon in the header).

## Files

```
index.html   structure / markup
style.css    design system + layout (all CSS variables at the top)
script.js    state, ranking logic, rendering, events
README.md    this file
```

## Running it

No build tools needed. Either:

- Open `index.html` directly in a browser, or
- Serve the folder locally, e.g. `python3 -m http.server`, then visit
  `http://localhost:8000`.

To publish on GitHub Pages: push this folder to a repo, then in
**Settings → Pages** set the source to the branch/root containing these
files.

## How the data works

Everything lives in `localStorage` under the key `wattwatch_state_v1`, as one
JSON blob: a list of rooms, each with its logged entries, unlocked badges,
and coupons. On first load, five demo rooms are seeded with a week of random
history so the leaderboard isn't empty. Open devtools → Application →
Local Storage to inspect or reset it (or use "Switch room" in the header,
which only clears the *active* room pointer, not the data).

This is intentionally simple so the project runs with zero setup. The real
logic — ranking, streaks, badge rules, alert thresholds — lives in
`script.js` and is decoupled from storage, so swapping `localStorage` for a
real API is mostly a matter of replacing `loadState()` / `saveState()`.

## Extending toward a real deployment

- **Backend & shared leaderboard**: right now each browser only sees its own
  data plus the seeded demo rooms — there's no shared server, so two
  students on two laptops won't see each other. Add a small API (e.g.
  Node/Express + a database) and point `loadState`/`saveState` at it.
- **Real smart-meter input**: replace the manual log form with a scheduled
  job that pulls readings from your hostel's meters/IoT devices and posts
  them to the same API.
- **True push notifications**: the current implementation uses the
  `Notification` API, which only fires while the tab is open. For
  notifications that arrive even when the site is closed, you'd add a
  service worker and the Push API, backed by a server that can send push
  messages (e.g. via `web-push`).
- **Auth**: there's no login — anyone can create a room profile. Add
  student ID / hostel login if this goes into real use.

## Tuning the game

All the game-balance numbers are in one place at the top of `script.js`:

```js
const RULES = {
  gaugeMaxPerPerson: 4.0,     // kWh/person that fills the dial to 100%
  dailyTargetPerPerson: 2.0,  // daily challenge target
  weeklyTargetPerPerson: 12,  // weekly challenge target
  wastageMultiplier: 1.4,     // usage vs own avg that triggers a wastage alert
  streakForBadge: 5,          // days for the Streak Master badge
  topRankForBadge: 3          // leaderboard position for Eco Champion
};
```

## A note on academic submissions

If you're submitting this for coursework, read through `script.js` and
`style.css` and rewrite the parts you don't fully understand in your own
words/structure before turning it in — that's what actually keeps you clear
of a plagiarism flag, rather than trying to defeat detection tools. I didn't
build in anything to evade AI-content detection, and won't.
