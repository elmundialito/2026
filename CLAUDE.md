# Mundialito 2026 — Project Context for Claude

## First Steps in New Conversation

1. Read this file fully
1. Read the transcript at `/mnt/transcripts/` (latest file)
1. Working file is ALWAYS `/mnt/user-data/outputs/App.jsx`
1. Copy to `/home/claude/App.jsx` before editing, present back when done
1. Always syntax check: `node -e "const fs=require('fs');const src=fs.readFileSync('App.jsx','utf8');let o=0,c=0;for(const ch of src){if(ch==='{')o++;if(ch==='}')c++;}console.log('Braces:'+(o-c));"`

-----

## Project Overview

- **Live URL:** <https://elmundialito.github.io/2026/>
- **Repo:** github.com/elmundialito/2026 — all logic in `src/App.jsx` (~3400 lines)
- **Deploy:** Push to main → GitHub Actions → gh-pages (~2 mins)
- **Firebase:** Project `mundialito2026-c1c81`, pool doc `pools/CS26`
- **Firebase rules expire ~July 13 2026** — update before then
- **User:** Byron (host), 8-player World Cup pool, players in Singapore/Sydney/El Salvador

-----

## CRITICAL — Profile Pic Loading (DO NOT CHANGE THIS PATTERN)

This has been broken and fixed many times. The working pattern is:

### How it works

- `picCache` = module-level JS object, in-memory only (pics are base64, too large for localStorage)
- `colorCache` = module-level JS object, persisted to `mundi_color_cache` localStorage
- `PicContext` = React context with value `picRefresh` (integer counter)
- `PicBumpContext` = React context exposing `()=>bumpPics(setPicRefresh)`
- `PlayerAvatar` is **stateless** — reads from `picCache` directly on every render, re-renders when `picVersion` (from PicContext) changes

### The working load sequence (HOST)

```js
// Single Firebase call — loadPool returns both game state AND _profiles/_playerColors
loadPool(code).then(fresh => {
  if(fresh) {
    if(fresh._profiles) Object.keys(fresh._profiles).forEach(k => { picCache[parseInt(k)] = fresh._profiles[k]; });
    if(fresh._playerColors) Object.keys(fresh._playerColors).forEach(k => { colorCache[parseInt(k)] = fresh._playerColors[k]; saveCaches(); });
    setPicRefresh(n => n+1); // bump AFTER cache is populated
    setSt(prev => { ... }); // update game state
  }
});
```

### The working load sequence (SPECTATOR)

- `onSnapshot` listener reads `data.profiles` and `data.playerColors` directly from snapshot
- Populates `picCache` and `colorCache` then calls `bumpPics(setPicRefresh)`
- `picsLoaded` flag prevents re-fetching on every snapshot update

### loadPool function

Always uppercases the code. Returns `_profiles` and `_playerColors` alongside decoded state.

### loadProfilePics function

Always uppercases the code. Used in ProfileSetupModal on open.

### PlayerAvatar

```jsx
function PlayerAvatar({idx, name, size=36, style={}, refresh=0}) {
  const picVersion = useContext(PicContext);
  const _trigger = picVersion + refresh; // MUST use picVersion in render output
  const pic = getProfilePic(idx);
  const color = getPlayerColor(idx, PC[idx]);
  // _trigger used in opacity so React tracks the dependency
  if(pic) return <div>...</div>;
  return <div style={{..., opacity: _trigger>=0?1:0}}>initials</div>;
}
```

### RULES — never break these:

- NEVER add useState/useEffect to PlayerAvatar
- NEVER call loadProfilePics AND loadPool simultaneously (causes race condition)
- NEVER call bumpPics before Firebase has responded
- ALWAYS use `setPicRefresh(n=>n+1)` directly, not `bumpPics()`, after Firebase responds
- `bumpPics` fires 4 times (0, 200, 800, 2000ms) — use only as secondary safety net

-----

## Architecture

### State Management

- Host: localStorage (`mundi_v11`) + Firebase background sync
- Spectator: Firebase `onSnapshot` listener
- Auto-save: debounced 800ms using `stRef` (avoids stale closure)

### Key localStorage keys

- `mundi_v11` — full host state
- `mundi_pool_code` — pool code (always uppercase e.g. “CS26”)
- `mundi_host_pw` — host password
- `mundi_spectator_code` — spectator pool code
- `mundi_my_player` — player index (0-7)
- `mundi_color_cache` — JSON of `{playerIdx: colorHex}`
- `mundi_accent` — chosen accent colour
- `mundi_lang` — “en” or “es”
- `mundi_intro_seen` — “1” if spectator has seen intro
- `mundi_seen_results` — JSON of seen match results for overlay

### Contexts

- `LangContext` — “en” or “es”
- `PicContext` — picRefresh integer (triggers PlayerAvatar re-renders)
- `PicBumpContext` — function to bump picRefresh

-----

## Key Components

### Mundialito() — main component

- `appState`: “loading” | “welcome” | “join” | “host” | “spectator” | “spectator_intro”
- `isHost`: boolean
- `picRefresh` / `setPicRefresh`: pic loading trigger
- `myPlayerIdx`: which player this device is (0-7)
- `poolCode`: Firebase pool code
- `spectatorPoolCode`: for spectator onSnapshot listener

### GroupStageScreen

- `matchesByDate`: matches grouped by SGT local date
- Auto-scrolls to last scored date on mount
- Has `showShareDay` modal for sharing fixtures/results
- Has `openChatId` for match chat modal
- **TODO: Add sticky tab bar** (next task)

### StandingsScreen

- `playerDataWithRanks`: includes `todayPts`, `movement`, `prevRank`
- `playerDataWithRanks` used in shareable leaderboard canvas
- Today’s pts calculated using SGT timezone (UTC+8)
- Yesterday’s rankings exclude today’s SGT games

### ShareDayModal

- Generates canvas image of day’s fixtures/results
- Flag above country name, initials chips on outer edges
- SGT label on kickoff times
- +pts shown next to initials

-----

## Colour System

- `PC[]` = default colour array (8 colours)
- `PLAYER_PICK_COLORS` = full palette for user selection (20 colours)
- `getPlayerColor(idx, fallback)` = reads from `colorCache` first, then fallback
- `colorCache` persisted to localStorage via `saveCaches()`
- `savePlayerColor(idx, color)` = saves to colorCache + Firebase

-----

## Translations

- `UI.en` and `UI.es` objects with all strings
- `t(lang, key)` helper function
- `lang` from `LangContext`
- Auto-detects from `navigator.language`, persists in `mundi_lang`
- Spanish chat phrases in `UI.es.presetPhrases`

-----

## Shareable Cards

### Leaderboard card (SHARE LEADERBOARD button in StandingsScreen)

- Option A design: bigger names in their colour, glow on top 3 avatars
- Gradient gold top bar
- Medals 🥇🥈🥉 for top 3, #4-8 for rest
- Movement arrows (▲2/▼1) vs yesterday’s standings (excluding today’s SGT games)
- +today pts under name if earned
- Loads Bebas Neue + DM Sans via FontFace API before drawing
- Profile pics from picCache (base64), initials fallback

### Results/Fixtures card (📤 button in GroupStageScreen)

- ShareDayModal with date picker (defaults to today)
- Flag above country name, close to score
- Initials chips on outer edges (26px, equal padding both sides)
- Group badge centred at top
- SGT below kickoff time in muted colour
- +pts next to initials chip

-----

## Notifications (OneSignal)

- App ID: `cc413549-cd70-4710-ae6f-de41d69f5b26`
- Safari web ID: `web.onesignal.auto.40785b5b-169b-4884-a5e0-8aeabe17c634`
- Service worker: `/2026/OneSignalSDKWorker.js`
- Cloudflare Worker: `https://mundialito-notify.byroncristol.workers.dev`
- **Status: PENDING** — subscriptions not showing in OneSignal dashboard
- Bell icon (🔔) in top-right header triggers `Notification.requestPermission()` directly
- iOS requires user gesture — auto-prompt doesn’t work

-----

## Status Bar Layout

- Left: 🎙️ (host, tap to switch to spectator) or 👀 (spectator, tap for info/host switch)
- Then: ☁️ sync (host) or 📥 info (spectator)
- Then: 🔔 Notify (host only)
- Then: 💡 Suggestions (everyone)
- Right: avatar pill (tap to open profile)

## Header Layout

- Top-left stack: ⏏ · ? · ↻
- Top-right stack: 🌐 · 🎨 · 🔔 (NotifBell)

-----

## Features Completed

- ✅ Profile pics & colours with crop UI
- ✅ Win/loss/draw overlay animations (72hr cutoff, SGT-aware)
- ✅ Match chat with reactions + preset phrases
- ✅ Suggestion box (Firebase, upvote/downvote, real-time)
- ✅ Shareable leaderboard card (Option A design)
- ✅ Shareable results/fixtures card
- ✅ Spanish translation (full)
- ✅ Custom theme colour picker
- ✅ Host can change any player’s colour in Setup tab
- ✅ Colour locking (no two players same colour)
- ✅ Auto-scroll to current matchday
- ✅ Date headers (gold=today, muted=past, light=future)
- ✅ 🎬 YouTube highlights button (2.5hrs after kickoff, no score needed)
- ✅ Movement arrows on shareable leaderboard vs yesterday
- ✅ Today’s pts on shareable leaderboard
- ✅ Group/Knockout breakdown hidden until KO points exist
- ✅ Team breakdown tiebreakers (GD → GF → alphabetical)
- ✅ Draft recap uses chosen colours not default PC[]

## NEXT TASK

**Sticky tab bar** — make the tab navigation bar sticky/fixed at top so users don’t need to scroll up to switch tabs. Build for ALL tabs. Tab bar currently rendered with `display:flex` inside the main scrollable div — needs to be pulled out and fixed.

-----

## Pending / Known Issues

- **Profile pics loading slowly** — intermittent, happens on fresh app open. Root cause suspected to be single Firebase call timing. DO NOT add extra Firebase calls or useEffect to PlayerAvatar. If broken, check loadPool().then() sequence.
- **OneSignal notifications** — 0 subscribers despite correct setup. Needs laptop + Chrome DevTools to debug properly.
- **Firebase rules expire July 13 2026** — update Firestore security rules before then.

-----

## Firebase Structure (pools/CS26)

```
{
  state: "M2:..." (encoded game state),
  password: "...",
  profiles: { "0": "data:image/jpeg;base64,...", "1": "..." },
  playerColors: { "0": "#e879a0", "1": "#c9a84c", ... },
  matchChat: { "G01": { messages: [...], reactions: {...} } },
  suggestions: [ { id, playerIdx, playerName, text, votes: {up:[], down:[]}, ts } ],
  updatedAt: timestamp
}
```

-----

## SGT Timezone Notes

- Singapore is UTC+8
- Match dates in `GM` are stored as US local dates
- Always convert: `new Date(m.d+"T"+m.ko+":00Z")` for UTC kickoff
- SGT date: `new Date(kickoffUTC.getTime()+8*60*60*1000).toISOString().slice(0,10)`
- Today’s pts, yesterday’s rankings, date headers all use SGT
