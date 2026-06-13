# Mundialito 2026 — Project Summary for Claude

## What this is
A World Cup 2026 family pool tracker app. Features: snake draft, group stage score entry, knockout bracket, standings, Firebase sync with 4-letter pool codes, host password protection, push notifications via OneSignal.

## Live URL
https://elmundialito.github.io/2026/

## GitHub Repo
https://github.com/elmundialito/2026
- `src/App.jsx` — entire app (~1100 lines, all logic in one file)
- `index.html` — entry point with OneSignal SDK
- `package.json` — dependencies (react, react-dom, firebase)
- `vite.config.js` — base: '/2026/'
- `.github/workflows/deploy.yml` — GitHub Actions: builds on push to main, deploys to gh-pages branch
- `CLAUDE.md` — this file

## How to deploy changes
1. Edit `src/App.jsx` (and any other files) here in Claude
2. Download and upload to GitHub repo (src folder)
3. GitHub Actions builds automatically — wait ~2 mins for green tick in Actions tab
4. No terminal needed

## Architecture

### State sync — Firebase Firestore
- Project: mundialito2026 (Google Firebase)
- App ID: cc413549-cd70-4710-ae6f-de41d69f5b26 (safe to be public)
- Database: Firestore, asia-southeast1 (Singapore), test mode (expires ~30 days after setup — needs rules update)
- Pool state saved under `pools/{code}` with encoded state + password
- Functions: `savePool(code, state, password)`, `loadPool(code)`, `checkPassword(code, password)`

### Pool code system
- Host taps 📋 Share Update → first time: chooses pool code + password → saves to Firebase
- Pool code stored in `localStorage` key `mundi_pool_code`
- Host password stored in `localStorage` key `mundi_host_pw`
- Spectators enter code → loads pool → code saved to `localStorage` key `mundi_spectator_code`
- Auto-loads on return visit (both host and spectator)
- ⏏ button top-left resets everything and returns to welcome screen

### Host mode switching
- Spectators see 🎙️ Host mode button after loading a pool
- Enter password → `checkPassword()` against Firebase → unlocks full edit access
- `SwitchToHostModal` component handles this flow

### Push notifications — OneSignal
- App ID: cc413549-cd70-4710-ae6f-de41d69f5b26
- SDK loaded in `index.html`
- Service worker file uploaded to GitHub repo root
- Permission requested 3 seconds after spectator loads pool
- 🔔 Notify button in host header → `NotifyModal` component

### Notifications backend — Cloudflare Worker
- URL: https://mundialito-notify.byroncristol.workers.dev
- Receives POST {message}, adds OneSignal API key, forwards to OneSignal
- API key stored as Cloudflare secret `ONESIGNAL_API_KEY`
- `sendNotification(message)` function in App.jsx calls this

## Key app state
- `appState` — "welcome" | "host" | "spectator" | "spectator_intro" | "loading"
- `isHost` — boolean, controls edit access
- `st` — full pool state (draft picks, scores, settings)
- `poolCode` — host's permanent pool code
- `spectatorPoolCode` — spectator's loaded pool code

## Match data
- Group stage: 72 matches in `GM` array, each with `{id, g, d, t, v, ko}`
  - `id`: G01-G72
  - `g`: group letter A-L  
  - `d`: UTC date string
  - `t`: [team1, team2]
  - `v`: venue city
  - `ko`: UTC kick-off time (HH:MM)
- Knockout: 32 matches in `KM` array, each with `{id, round, n, sA, sB, v, ko, d}`
  - `id`: K73-K104
  - `round`: "r32" | "r16" | "qf" | "sf" | "3rd" | "final"
- All times stored in UTC, displayed in user's local timezone via `fmtKickoff(date, utcTime)`
- Format: 12-hour (e.g. "3am", "7:30pm")

## Players & draft
- 8 players in current pool
- Snake draft (manual or auto "Sorteo" with animation)
- Teams split into tiers by odds for fair distribution
- Each player gets 6 teams

## Things discussed but not yet built
- Group-aware draft (no player gets 2 teams from same group) — see conversation for analysis
- Automated daily notifications via Cloudflare cron (morning fixture list, evening results reminder)
- Firebase security rules update (needed before test mode expires ~30 days after DB creation)

## Firebase security rules fix (do before test mode expires)
Go to Firebase console → Firestore → Rules tab → replace with:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /pools/{poolId} {
      allow read: if true;
      allow write: if true;
    }
  }
}
```
Then set expiry date to 2026-08-01 or later.

## Key people in the pool
Family pool — members in Singapore, El Salvador, Bali, Sydney.
Pool code: CS26

## Fonts & design
- Bebas Neue (headings, labels)
- DM Sans (body)
- Navy #0a1628 background, gold #c9a84c accent
- App icon: navy/gold trophy SVG with MUNDIALITO text
