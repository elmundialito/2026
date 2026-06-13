# Mundialito 2026 — Project Summary for Claude

## What this is
A World Cup 2026 family pool tracker app. Features: snake draft, group stage score entry, knockout bracket, standings, Firebase sync, 4-letter pool codes, host password, push notifications, profile pics, player colours, theme colours. Family pool across Singapore, El Salvador, Bali, Sydney.

## Live URL
https://elmundialito.github.io/2026/

## GitHub Repo
https://github.com/elmundialito/2026
- `src/App.jsx` — entire app (~1200 lines, all logic in one file)
- `index.html` — entry point with OneSignal SDK + app icon
- `package.json` — dependencies (react, react-dom, firebase)
- `vite.config.js` — base: '/2026/'
- `.github/workflows/deploy.yml` — builds on push to main, deploys to gh-pages
- `icon.svg` — trophy app icon (navy/gold)
- `CLAUDE.md` — this file

## How to deploy changes
1. Edit `src/App.jsx` here in Claude
2. Upload to GitHub repo src folder
3. GitHub Actions builds automatically (~2 mins)
4. No terminal needed ever

## Architecture

### Firebase Firestore
- Project: mundialito2026
- App ID: cc413549-cd70-4710-ae6f-de41d69f5b26 (safe to be public)
- Database: asia-southeast1 (Singapore)
- **IMPORTANT: Test mode expires ~July 13 2026 — update Firestore rules before then**
- Fix: Firebase console → Firestore → Rules → open read/write, set expiry Aug 2026
- Pool document `pools/CS26` fields: `state` (encoded), `password`, `updatedAt`, `profiles` (map of playerIdx→base64 photo), `playerColors` (map of playerIdx→hex color)
- Functions: `savePool(code, state, password)`, `loadPool(code)`, `checkPassword(code, password)`, `saveProfilePicToFirestore(playerIdx, dataUrl)`, `loadProfilePics(code)`, `savePlayerColor(playerIdx, color)`, `loadPlayerColors(code)`

### Pool code system
- Host taps 📋 Share Update → first time: chooses code (CS26) + password → saves to Firebase
- Auto-saves to Firebase every time a score is entered (no manual share needed for scores)
- Spectators auto-load CS26 on return visits (saved in localStorage: `mundi_spectator_code`)
- Host auto-loads on return visits (saved in localStorage: `mundi_v11`)
- ⏏ button top-left resets everything

### Live sync
- Spectators have Firebase `onSnapshot` listener — updates push automatically when host saves
- No refresh needed — scores appear in real time

### Host mode switching
- Load CS26 → 🎙️ Host mode button → enter password → full edit access
- Switching to host saves state to localStorage so it persists on that device

### Push notifications — OneSignal
- App ID: cc413549-cd70-4710-ae6f-de41d69f5b26
- SDK in index.html, service worker in repo root
- Permission requested 3 seconds after spectator loads pool
- 🔔 Notify button (host only) → NotifyModal with presets + custom message

### Cloudflare Worker (notification backend)
- URL: https://mundialito-notify.byroncristol.workers.dev
- Receives POST {message} → adds OneSignal REST API key → sends push
- API key stored as Cloudflare secret `ONESIGNAL_API_KEY`

## User identity system
- On first load after joining CS26, spectators see "Select your name" screen
- Grid of all 8 players, tap yours → profile setup screen
- Profile setup: optional photo upload (resized to 120px, stored in Firestore), colour picker
- Identity saved to localStorage: `mundi_my_player` (index)
- "👤 Change user" button at bottom of standings tab
- Photos stored in Firestore `pools/CS26/profiles` — everyone sees everyone's photos

## Theme & colours
- **Player colour**: each player picks from 20 colours, saved to Firestore, seen by everyone. Used for initials chips in group stage and avatar circles in standings. Taken colours show 🔒.
- **Theme accent colour**: personal preference, device only, saved to localStorage `mundi_accent`. Changes all gold (#c9a84c) elements to chosen colour. 12 options. 🎨 button in header.
- CSS variable `--accent` injected on `<html>` element for global theming.
- In-memory caches: `picCache` (photos), `colorCache` (player colours)

## Match data
### Group stage — GM array (72 matches)
- `{id: "G01"-"G72", g: group, d: UTC date, t: [team1, team2], v: venue, ko: UTC time}`
- All 72 times verified against official SGT schedule
- Matches grouped by user's LOCAL date (not UTC date) using `fmtKickoff(d, ko)`
- 12hr format display (e.g. "3am", "7:30pm")

### Knockout — KM array (32 matches, K73-K104)
- `{id, round, n, sA, sB, v, ko, d}` — round: "r32"|"r16"|"qf"|"sf"|"3rd"|"final"
- All times verified from Wikipedia knockout stage page

## Draft
- 8 players, snake draft (manual or auto Sorteo with animation)
- Teams split into tiers by odds
- Each player gets 6 teams
- **TODO**: group-aware draft (no player gets 2 teams from same group) — works perfectly for 8 players

## Design
- Fonts: Bebas Neue (headings), DM Sans (body)
- Base colors: navy #0a1628 bg, various blue-greys for cards/text
- Accent: var(--accent), default #c9a84c gold
- App icon: navy/gold trophy SVG, home screen name "Mundialito ⚽🏆"

## Current pool
- Code: CS26
- 8 players, draft completed June 13 2026
- Host password set by Byron

## TODO / Future features discussed
1. **Firebase rules update** — before ~July 13 2026 (critical)
2. **Group-aware draft** — prevent 2 teams from same group per player
3. **Automated daily notifications** — Cloudflare cron, morning fixtures + evening results
4. **Engagement features brainstormed** (not built):
   - "Your team is playing!" banner when teams kick off soon
   - Score predictions before each match
   - Emoji reactions on match results
   - Live match countdown timer
   - "Who benefits from this result?" tooltip
   - Weekly matchday summary notification
