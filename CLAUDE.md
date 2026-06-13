# Mundialito 2026 — Project Summary for Claude

## What this is
A World Cup 2026 family pool tracker app. Features: snake draft, group stage score entry, knockout bracket, standings, Firebase sync with 4-letter pool codes, host password protection, push notifications via OneSignal. Family pool across Singapore, El Salvador, Bali, Sydney.

## Live URL
https://elmundialito.github.io/2026/

## GitHub Repo
https://github.com/elmundialito/2026
- `src/App.jsx` — entire app (~1100 lines, all logic in one file)
- `index.html` — entry point with OneSignal SDK + app icon
- `package.json` — dependencies (react, react-dom, firebase)
- `vite.config.js` — base: '/2026/'
- `.github/workflows/deploy.yml` — builds on push to main, deploys to gh-pages branch
- `icon.svg` — trophy app icon (navy/gold)
- `manifest.json` — PWA manifest
- `CLAUDE.md` — this file

## How to deploy changes
1. Edit `src/App.jsx` here in Claude
2. Download and upload to GitHub repo (src folder)
3. GitHub Actions builds automatically — wait ~2 mins for green tick in Actions tab
4. No terminal needed ever

## Architecture

### Firebase Firestore
- Project: mundialito2026
- App ID: cc413549-cd70-4710-ae6f-de41d69f5b26 (safe to be public)
- Database: asia-southeast1 (Singapore), started in test mode
- **IMPORTANT: Test mode expires ~30 days after June 13 2026 — update rules before ~July 13**
- Fix: Firebase console → Firestore → Rules → replace with open read/write rules, set expiry Aug 2026
- Pool state saved under `pools/{code}` — fields: `state` (encoded), `password`, `updatedAt`
- Functions: `savePool(code, state, password)`, `loadPool(code)`, `checkPassword(code, password)`

### Pool code system
- Host taps 📋 Share Update → first time: chooses pool code (e.g. CS26) + password → saves to Firebase
- Every subsequent share: auto-saves same code, same password, updated state
- Pool code in localStorage: `mundi_pool_code`
- Host password in localStorage: `mundi_host_pw`
- Spectator code in localStorage: `mundi_spectator_code`
- Auto-loads on return visit for both host and spectator
- ⏏ button top-left clears all localStorage and returns to welcome screen

### Host mode switching (from spectator view)
- Load pool with CS26 → see 🎙️ Host mode button in header
- Enter password → `checkPassword()` → unlocks full edit access on that device
- `SwitchToHostModal` component handles this

### Push notifications — OneSignal
- App ID: cc413549-cd70-4710-ae6f-de41d69f5b26
- SDK loaded in `index.html`
- Service worker file in repo root
- Permission requested 3 seconds after spectator loads pool
- 🔔 Notify button in host header → `NotifyModal` with preset messages + custom

### Cloudflare Worker (notification backend)
- URL: https://mundialito-notify.byroncristol.workers.dev
- Receives POST {message}, adds OneSignal REST API key, forwards to OneSignal
- API key stored as Cloudflare secret `ONESIGNAL_API_KEY`
- `sendNotification(message)` in App.jsx calls this Worker

## App state
- `appState`: "welcome" | "host" | "spectator" | "spectator_intro" | "loading"
- `isHost`: boolean, controls edit access
- `st`: full pool state (draft picks, scores, settings)
- `poolCode`: host's permanent pool code
- `spectatorPoolCode`: spectator's loaded pool code

## Match data
### Group stage — GM array (72 matches)
Each entry: `{id, g, d, t, v, ko}`
- `id`: G01–G72
- `g`: group letter A–L
- `d`: UTC date (YYYY-MM-DD)
- `t`: [team1, team2]
- `v`: venue city
- `ko`: UTC kick-off time (HH:MM)

All 72 times verified against official SGT schedule. Key: UTC date + ko time are used together to compute user's local date/time via `fmtKickoff(d, ko)` which outputs 12hr format (e.g. "3am", "7:30pm"). Match grouping by date also uses local timezone so Singapore users see correct date headers.

### Knockout stage — KM array (32 matches, K73–K104)
Each entry: `{id, round, n, sA, sB, v, ko, d}`
- `round`: "r32" | "r16" | "qf" | "sf" | "3rd" | "final"
- `n`: match number (73–104)
- All times verified from Wikipedia knockout stage page

## Draft
- 8 players in current pool
- Snake draft (manual or auto "Sorteo" with animation + audio)
- Teams split into tiers by odds for fair distribution
- Each player gets 6 teams
- **TODO (discussed, not built):** group-aware draft — prevent player getting 2+ teams from same group. Works perfectly for 8 players (12 groups, 6 teams each = exactly 1 per group). For 6 players mathematically can't fully avoid but can minimise.

## Design
- Fonts: Bebas Neue (headings), DM Sans (body)
- Colors: navy #0a1628 bg, gold #c9a84c accent
- App icon: navy/gold trophy SVG with MUNDIALITO text (Option 3 from mockups)
- Home screen name: "Mundialito ⚽🏆"

## Things still to do / discussed
1. **Firebase rules update** — before ~July 13 2026 (see above)
2. **Group-aware draft** — no player gets 2 teams from same group
3. **Automated daily notifications** — Cloudflare cron, morning fixture list + evening results reminder, requires fetching Firebase pool state in Worker to show player ownership
4. **Firestore test mode expiry** — update rules before it expires

## Current pool
- Code: CS26
- 8 players, draft completed
- Pool started June 13 2026
