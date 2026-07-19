import { useState, useMemo, useEffect, useRef, createContext, useContext } from "react";

// ── Firebase ──────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA-tdvChprSHgpq2a8u_zz25iYxWqxdrEw",
  authDomain: "mundialito2026-c1c81.firebaseapp.com",
  projectId: "mundialito2026-c1c81",
  storageBucket: "mundialito2026-c1c81.firebasestorage.app",
  messagingSenderId: "881830828469",
  appId: "1:881830828469:web:48c3b78104d6f1beb6a1fc"
};

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);

// Global context so every PlayerAvatar reacts when pics/colours load
const PicContext = createContext(0);
const PicBumpContext = createContext(null); // exposes bumpPics to any component

// Generate a random 4-letter code
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function savePool(code, state, password) {
  try {
    const data = { state: encode(state), updatedAt: Date.now() };
    if (password) data.password = password;
    await setDoc(doc(db, 'pools', code), data, { merge: true });
    return true;
  } catch(e) { console.error('Save failed:', e); return false; }
}

async function checkPassword(code, password) {
  try {
    const snap = await getDoc(doc(db, 'pools', code.toUpperCase()));
    if (!snap.exists()) return false;
    return snap.data().password === password;
  } catch(e) { return false; }
}

async function loadPool(code) {
  try {
    const snap = await getDoc(doc(db, 'pools', code.toUpperCase()));
    if (!snap.exists()) return null;
    const data = snap.data();
    const decoded = decode(data.state);
    if (!decoded) return null;
    // Attach pics/colours so caller can populate cache from same fetch
    decoded._profiles = data.profiles || {};
    decoded._playerColors = data.playerColors || {};
    return decoded;
  } catch(e) { console.error('Load failed:', e); return null; }
}


const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&display=swap');`;
const LOCAL_KEY = "mundi_v11";

const encode = s => {
  try {
    const slim = {
      c: { n: s.config.playerCount, p: s.config.playerNames, f: s.config.entryFee||"", k: s.config.koPoints },
      sl: s.setupLocked||false, dl: s.draftLocked||false,
      do: s.draftOrder||null, dm: s.draftMode||null,
      pk: (s.picks||[]).map(p=>({t:p.team,i:p.playerIdx})),
      mr: s.matchResults||{}, kr: s.koResults||{}, ko: s.koOverrides||{},
    };
    return "M2:"+btoa(unescape(encodeURIComponent(JSON.stringify(slim))));
  } catch { return null; }
};

const decode = c => {
  try {
    if (c.startsWith("M2:")) {
      const s = JSON.parse(decodeURIComponent(escape(atob(c.slice(3)))));
      return {
        config:{ playerCount:s.c.n, playerNames:s.c.p, entryFee:s.c.f||"", koPoints:s.c.k },
        setupLocked:s.sl||false, draftLocked:s.dl||false,
        draftOrder:s.do||null, draftMode:s.dm||null,
        picks:(s.pk||[]).map((p,i)=>({team:p.t,playerIdx:p.i,pickNumber:i})),
        matchResults:s.mr||{}, koResults:s.kr||{}, koOverrides:s.ko||{},
      };
    }
    if (c.startsWith("MUNDI:")) return JSON.parse(decodeURIComponent(escape(atob(c.slice(6)))));
    return null;
  } catch { return null; }
};

// ── OneSignal notifications ───────────────────────────────────
async function sendNotification(message) {
  try {
    const resp = await fetch("https://mundialito-notify.byroncristol.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    return resp.ok;
  } catch(e) { return false; }
}

async function requestNotificationPermission() {
  try {
    if(window.OneSignalDeferred) {
      window.OneSignalDeferred.push(async (OneSignal) => {
        await OneSignal.Notifications.requestPermission();
      });
      return true;
    }
  } catch(e) {}
  return false;
}


// ── URL sync ──────────────────────────────────────────────────
const getUrlCode = () => {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get("d") || null;
  } catch { return null; }
};

const setUrlCode = (code) => {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("d", code);
    window.history.replaceState({}, "", url.toString());
  } catch {}
};

const clearUrlCode = () => {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("d");
    window.history.replaceState({}, "", url.toString());
  } catch {}
};

const getShareUrl = (code) => {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("d", code);
    return url.toString();
  } catch { return code; }
};


const PLAYER_COUNTS = [2,3,4,6,8];
const DEFAULT_KO = { r32:4, r16:6, qf:8, sf:10, third:5, final:12 };
const KO_LABELS = { r32:"Round of 32", r16:"Round of 16", qf:"Quarterfinals", sf:"Semifinals", final:"Final", third:"3rd Place" };
const ROUND_ORDER = ["r32","r16","qf","sf","third","final"];
const PC = ["var(--accent)","#d97757","#61a978","#6b9bd1","#b67ad6","#d65b87","#e0b834","#5fb3b3"];
const TABS = [
  {id:"setup",    label:"Setup",       icon:"⚙️",  unlockMsg:null},
  {id:"draft",    label:"Draft",       icon:"🎯",  unlockMsg:"Complete Setup first."},
  {id:"group",    label:"Group Stage", icon:"⚽",  unlockMsg:"Complete the Draft first."},
  {id:"knockout", label:"Knockout",    icon:"🏆",  unlockMsg:"Knockout unlocks once at least one group is fully played."},
  {id:"standings",label:"Leaderboard",   icon:"📊",  unlockMsg:"Complete the Draft first."},
];

const EMPTY = {
  config:{ playerCount:4, playerNames:["","","",""], entryFee:"", koPoints:{...DEFAULT_KO} },
  setupLocked:false, draftLocked:false, draftOrder:null, draftMode:null, picks:[],
  matchResults:{}, koResults:{}, koOverrides:{}, groupOrderOverride:{},
};

function mergeState(base, loaded) {
  if (!loaded) return base;
  return {
    ...base, ...loaded,
    config:{
      ...base.config, ...(loaded.config||{}),
      playerNames: Array.isArray(loaded.config?.playerNames) ? loaded.config.playerNames : base.config.playerNames,
      koPoints: {...(loaded.config?.koPoints||{}), ...DEFAULT_KO},
    },
    picks: Array.isArray(loaded.picks) ? loaded.picks : [],
    matchResults: (loaded.matchResults && typeof loaded.matchResults==="object") ? loaded.matchResults : {},
    koResults: (loaded.koResults && typeof loaded.koResults==="object") ? loaded.koResults : {},
    koOverrides: (loaded.koOverrides && typeof loaded.koOverrides==="object") ? loaded.koOverrides : {},
    groupOrderOverride: (loaded.groupOrderOverride && typeof loaded.groupOrderOverride==="object") ? loaded.groupOrderOverride : {},
    draftOrder: Array.isArray(loaded.draftOrder) ? loaded.draftOrder : null,
    draftMode: loaded.draftMode||null,
  };
}

function nameToInitial(n) {
  const clean = (n||"").trim().toUpperCase().replace(/&/g," ").replace(/[^A-Z0-9\s]/g,"").replace(/\s+/g," ").trim();
  const words = clean.split(" ").filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0,2) || "?";
  return words.map(w=>w[0]).join("");
}
function getInitials(names) { return (names||[]).map(n => nameToInitial(n||"")); }

// ── Language / i18n ───────────────────────────────────────────
const COUNTRY_ES = {
  "SPAIN":"ESPAÑA","FRANCE":"FRANCIA","ENGLAND":"INGLATERRA","BRAZIL":"BRASIL",
  "PORTUGAL":"PORTUGAL","ARGENTINA":"ARGENTINA","GERMANY":"ALEMANIA",
  "NETHERLANDS":"PAÍSES BAJOS","NORWAY":"NORUEGA","BELGIUM":"BÉLGICA",
  "COLOMBIA":"COLOMBIA","JAPAN":"JAPÓN","MOROCCO":"MARRUECOS","MEXICO":"MÉXICO",
  "URUGUAY":"URUGUAY","USA":"EEUU","CROATIA":"CROACIA",
  "SWITZERLAND":"SUIZA","TÜRKIYE":"TURQUÍA","ECUADOR":"ECUADOR","CANADA":"CANADÁ",
  "SENEGAL":"SENEGAL","SWEDEN":"SUECIA","AUSTRIA":"AUSTRIA","PARAGUAY":"PARAGUAY",
  "SCOTLAND":"ESCOCIA","CZECHIA":"CHEQUIA","EGYPT":"EGIPTO","IVORY COAST":"COSTA DE MARFIL",
  "BOSNIA AND HERZEGOVINA":"BOSNIA Y HERZEGOVINA","ALGERIA":"ARGELIA","GHANA":"GHANA",
  "SOUTH KOREA":"COREA DEL SUR","AUSTRALIA":"AUSTRALIA","IRAN":"IRÁN","TUNISIA":"TÚNEZ",
  "DR CONGO":"RD CONGO","SAUDI ARABIA":"ARABIA SAUDITA","SOUTH AFRICA":"SUDÁFRICA",
  "IRAQ":"IRAK","PANAMA":"PANAMÁ","UZBEKISTAN":"UZBEKISTÁN","CAPE VERDE":"CABO VERDE",
  "QATAR":"CATAR","HAITI":"HAITÍ","JORDAN":"JORDANIA","NEW ZEALAND":"NUEVA ZELANDA",
  "CURAÇAO":"CURAZAO","HAITI":"HAITÍ",
};

const SHORT_ES = {
  "SOUTH KOREA":"C.Sur","SOUTH AFRICA":"S.África","SAUDI ARABIA":"A.Saudita",
  "BOSNIA AND HERZEGOVINA":"B&H","IVORY COAST":"C.Marfil","NEW ZEALAND":"N.Zelanda",
  "CAPE VERDE":"C.Verde","DR CONGO":"RD Congo","CURAÇAO":"Curazao","NETHERLANDS":"P.Bajos",
  "ESTADOS UNIDOS":"EE.UU.","PAÍSES BAJOS":"P.Bajos","ARABIA SAUDITA":"A.Saudita",
  "COREA DEL SUR":"C.Sur","COSTA DE MARFIL":"C.Marfil","NUEVA ZELANDA":"N.Zelanda",
  "CABO VERDE":"C.Verde","BOSNIA Y HERZEGOVINA":"B&H",
};

const FIXTURE_ES = {
  "USA":"EEUU",
  "SOUTH KOREA":"COREA DEL SUR",
  "SOUTH AFRICA":"SUDÁFRICA",
  "SAUDI ARABIA":"ARABIA SAUDITA",
  "BOSNIA AND HERZEGOVINA":"BOSNIA",
  "NEW ZEALAND":"NUEVA ZELANDA",
  "CAPE VERDE":"CABO VERDE",
  "DR CONGO":"RD CONGO",
  "IVORY COAST":"COSTA DE MARFIL",
  "CURAÇAO":"CURAZAO",
  "SWITZERLAND":"SUIZA",
  "UZBEKISTAN":"UZBEKIS­TÁN",
  "NETHERLANDS":"PAÍSES BAJOS",
};

const UI = {
  en: {
    setup:"Setup", draft:"Draft", group:"Group Stage", knockout:"Knockout", leaderboard:"Leaderboard",
    setupUnlock:null, draftUnlock:"Complete Setup first.", groupUnlock:"Complete the Draft first.",
    knockoutUnlock:"Knockout unlocks once at least one group is fully played.", standingsUnlock:"Complete the Draft first.",
    host:"HOST", spectator:"SPECTATOR", load:"📥 Load", notify:"🔔 Notify",
    shareCode:"📋 SHARE POOL CODE", syncBtn:"☁️ sync", saving:"saving…", saved:"✓ saved",
    players:"PLAYERS", matchSchedule:"Match Schedule", groupStandings:"Group Standings",
    today:"TODAY", draw:"DRAW", yourTeam:"YOUR TEAM", yourTeams:"YOUR TEAMS",
    leaderboardTitle:"LEADERBOARD", prizePool:"🏆 Prize pool", winnerTakesAll:"winner takes all",
    points:"points", group2:"Group", knockout2:"Knockout", pastR32:"Past R32", total:"Total",
    teamBreakdown:"TEAM BREAKDOWN", tiebreaker:"Tiebreaker: Most teams in Round of 32 → Goal difference → Goals for → Head to head record → Draft order",
    changeUser:"👤 Change user", howItWorks:"HOW IT WORKS",
    looksGood:"LOOKS GOOD →", skipForNow:"SKIP FOR NOW →", addPhoto:"📷 ADD YOUR PHOTO",
    changePhoto:"📷 CHANGE PHOTO", yourColour:"YOUR COLOUR", yourProfile:"YOUR PROFILE",
    tapToChange:"Tap to change photo or colour", photoCaption:"Your photo shows on the standings for everyone in the pool.",
    photoCaptionDone:"Looking good! It'll show on everyone's standings.",
    cropPhoto:"CROP YOUR PHOTO", dragReposition:"Drag to reposition · Use slider to zoom",
    back:"BACK", usePhoto:"USE THIS PHOTO ✓",
    selectName:"SELECT YOUR NAME", tapYourName:"Tap your name so we can personalise your experience.",
    thatSMe:"THAT'S ME →",
    round32:"Round of 32", round16:"Round of 16", quarterfinals:"Quarterfinals",
    semifinals:"Semifinals", final:"Final", thirdPlace:"3rd Place",
    win:"Win", matchday:"matchday",
    draftComplete:"DRAFT COMPLETE", allTeamsClaimed:"All 48 teams claimed.",
    lockDraft:"LOCK DRAFT → BEGIN GROUP STAGE", watchDraw:"🎬 Watch the draw",
    picksLive:"ROSTERS · LIVE", teamsOdds:"TEAMS · SORTED BY ODDS",
    roundOrder:"ROUND ORDER", pick:"PICK", undo:"↶ Undo",
    draftOrderTitle:"DRAFT ORDER", spinBtn:"SPIN", spinning:"SPINNING…",
    orderSet:"ORDER SET →", orderLocked:"Order locked — continue below",
    spinTo:"Spin to land on pick",
    manualPicks:"MANUAL PICKS", manualDesc:"Each player picks their own teams in snake draft order.",
    autoAssign:"AUTO ASSIGN", autoDesc:"Teams randomly assigned by odds. Revealed by El Presidente.",
    teamBreakdownLabel:"TEAM BREAKDOWN", out:"OUT",
    rulesTitle1:"The Goal", rulesBody1:"Draft a roster of World Cup teams. Score points based on how your teams perform. Highest total takes the pot.",
    rulesTitle2:"The Draft", rulesBody2:"Take turns picking teams in a snake draft — direction reverses each round. Everyone ends up with the same number of teams (48 ÷ players).",
    rulesTitle3:"Group Stage", rulesBody3:"Your teams play 3 group games each. You earn 3 pts per win, 1 pt per draw. Losses = 0.",
    rulesTitle4:"Knockout Stage", rulesBody4:"Bonus points every time one of your teams wins a KO match. Stakes rise each round: R32=4, R16=6, QF=8, SF=10, 3rd Place=5, Final=12.",
    rulesTitle5:"Winning", rulesBody5:"Highest TOTAL (Group + Knockout) takes the pot. Tiebreaks: most teams in Round of 32 → goal difference → goals scored → Head to head record → draft order.",
    tapToContinue:"Tap to continue",
    hostAccess:"HOST ACCESS", hostPwPlaceholder:"Host password",
    unlockHost:"UNLOCK HOST ACCESS", checking:"CHECKING…", cancel:"Cancel",
    hostPwDesc:"Enter your host password to unlock full edit access on this device.",
    notifyAll:"Notify everyone", notifyMsg:"Message", send:"Send",
    players2:"Players", entryFee:"Entry fee $",
    presetPhrases:["Unlucky 😂","Told you so 👑","Let's go!! 🙌","Too easy 😏","Robbed!! 😤","What a game 🔥"],
  },
  es: {
    setup:"Config.", draft:"Sorteo", group:"Fase de Grupos", knockout:"Eliminatorias", leaderboard:"Clasificación",
    setupUnlock:null, draftUnlock:"Completa la configuración primero.", groupUnlock:"Completa el sorteo primero.",
    knockoutUnlock:"Se desbloquea cuando al menos un grupo termine.", standingsUnlock:"Completa el sorteo primero.",
    host:"ANFITRIÓN", spectator:"ESPECTADOR", load:"📥 Cargar", notify:"🔔 Avisar",
    shareCode:"📋 COMPARTIR CÓDIGO", syncBtn:"☁️ sync", saving:"guardando…", saved:"✓ guardado",
    players:"JUGADORES", matchSchedule:"Calendario", groupStandings:"Grupos",
    today:"HOY", draw:"EMPATE", yourTeam:"TU EQUIPO", yourTeams:"TUS EQUIPOS",
    leaderboardTitle:"CLASIFICACIÓN", prizePool:"🏆 Premio total", winnerTakesAll:"el primero se lo lleva todo",
    points:"puntos", group2:"Grupos", knockout2:"KO", pastR32:"R32", total:"Total",
    teamBreakdown:"TUS EQUIPOS", tiebreaker:"Desempate: Más equipos en Ronda de 32 → Diferencia de goles → Goles a favor → Récord H2H → Orden de sorteo",
    changeUser:"👤 Cambiar usuario", howItWorks:"CÓMO FUNCIONA",
    looksGood:"¡LISTO! →", skipForNow:"OMITIR POR AHORA →", addPhoto:"📷 AÑADIR FOTO",
    changePhoto:"📷 CAMBIAR FOTO", yourColour:"TU COLOR", yourProfile:"TU PERFIL",
    tapToChange:"Toca para cambiar foto o color", photoCaption:"Tu foto aparece en la clasificación para todos.",
    photoCaptionDone:"¡Qué bien! Aparecerá en la clasificación de todos.",
    cropPhoto:"RECORTAR FOTO", dragReposition:"Arrastra para reposicionar · Desliza para zoom",
    back:"VOLVER", usePhoto:"USAR ESTA FOTO ✓",
    selectName:"SELECCIONA TU NOMBRE", tapYourName:"Toca tu nombre para personalizar tu experiencia.",
    thatSMe:"¡SOY YO! →",
    round32:"Ronda de 32", round16:"Ronda de 16", quarterfinals:"Cuartos de final",
    semifinals:"Semifinales", final:"Final", thirdPlace:"3er Puesto",
    win:"Gana", matchday:"jornada",
    draftComplete:"SORTEO COMPLETADO", allTeamsClaimed:"Los 48 equipos han sido asignados.",
    lockDraft:"CONFIRMAR SORTEO → COMENZAR FASE DE GRUPOS", watchDraw:"🎬 Ver el sorteo",
    picksLive:"EQUIPOS · EN VIVO", teamsOdds:"EQUIPOS · POR PROBABILIDAD",
    roundOrder:"ORDEN DE RONDA", pick:"ELEGIR", undo:"↶ Deshacer",
    draftOrderTitle:"ORDEN DEL SORTEO", spinBtn:"GIRAR", spinning:"GIRANDO…",
    orderSet:"ORDEN FIJADO →", orderLocked:"Orden fijado — continúa abajo",
    spinTo:"Gira para el pick",
    manualPicks:"SELECCIÓN MANUAL", manualDesc:"Cada jugador elige sus equipos en orden de serpiente.",
    autoAssign:"ASIGNACIÓN AUTO", autoDesc:"Equipos asignados al azar por probabilidad. Revelados por El Presidente.",
    teamBreakdownLabel:"DESGLOSE DE EQUIPOS", out:"ELIMINADO",
    rulesTitle1:"El Objetivo", rulesBody1:"Elige un equipo de selecciones del Mundial. Ganas puntos según su rendimiento. El que más tenga se lleva el premio.",
    rulesTitle2:"El Sorteo", rulesBody2:"Eligen equipos por turnos en orden de serpiente — la dirección cambia cada ronda. Todos terminan con el mismo número de equipos (48 ÷ jugadores).",
    rulesTitle3:"Fase de Grupos", rulesBody3:"Tus equipos juegan 3 partidos de grupo. Ganas 3 pts por victoria, 1 pt por empate. Las derrotas = 0.",
    rulesTitle4:"Fase Eliminatoria", rulesBody4:"Puntos extra cada vez que uno de tus equipos gana un partido eliminatorio. Las apuestas suben cada ronda: R32=4, R16=6, CF=8, SF=10, 3er Puesto=5, Final=12.",
    rulesTitle5:"Ganar", rulesBody5:"El TOTAL más alto (Grupos + Eliminatorias) se lleva el premio. Desempate: más equipos en Ronda de 32 → diferencia de goles → goles a favor → récord H2H → sorteo.",
    tapToContinue:"Toca para continuar",
    hostAccess:"ACCESO ANFITRIÓN", hostPwPlaceholder:"Contraseña del anfitrión",
    unlockHost:"DESBLOQUEAR ACCESO", checking:"VERIFICANDO…", cancel:"Cancelar",
    hostPwDesc:"Ingresa tu contraseña para acceder como anfitrión en este dispositivo.",
    notifyAll:"Notificar a todos", notifyMsg:"Mensaje", send:"Enviar",
    players2:"Jugadores", entryFee:"Cuota $",
    presetPhrases:["Qué mala suerte 😂","Te lo dije 👑","¡Vamos!! 🙌","Pan comido 😏","¡Nos robaron!! 😤","¡Qué partidazo! 🔥"],
  },
};

// Detect language from browser, fall back to saved preference
function detectLang() {
  try {
    const saved = window.localStorage?.getItem("mundi_lang");
    if(saved) return saved;
    const bl = navigator.language||"en";
    return bl.startsWith("es") ? "es" : "en";
  } catch { return "en"; }
}

function t(lang, key) { return UI[lang]?.[key] || UI.en[key] || key; }

function countryName(name, lang) {
  if(lang==="es") return COUNTRY_ES[name] || name;
  return name;
}
function countryShort(name, lang) {
  if(lang==="es"){const es=COUNTRY_ES[name]||name;return SHORT_ES[es]||SHORT_ES[name]||es;}
  return SHORT[name]||name;
}
function countryFixture(name, lang) {
  if(lang==="es"){const es=COUNTRY_ES[name]||name;return (FIXTURE_ES[name]||es).toUpperCase();}
  return FIXTURE_NAME[name]||name.toUpperCase();
}


// Keep these as language-aware wrappers — components pass lang down
const SHORT = {"SOUTH KOREA":"S.Korea","SOUTH AFRICA":"S.Africa","SAUDI ARABIA":"S.Arabia","BOSNIA AND HERZEGOVINA":"B&H","IVORY COAST":"Ivory Cst","NEW ZEALAND":"N.Zealand","CAPE VERDE":"C.Verde","DR CONGO":"DR Congo","CURAÇAO":"Curaçao","NETHERLANDS":"Neth."};
const shortName = n => SHORT[n]||n;
const btnName = n => { const s=SHORT[n]||n; return s.length>10?s.slice(0,10)+"…":s; };
const FIXTURE_NAME = {"SOUTH KOREA":"SOUTH KOREA","SOUTH AFRICA":"SOUTH AFRICA","SAUDI ARABIA":"SAUDI ARABIA","BOSNIA AND HERZEGOVINA":"BOSNIA","NEW ZEALAND":"NEW ZEALAND","CAPE VERDE":"CAPE VERDE","DR CONGO":"DR CONGO","IVORY COAST":"IVORY COAST","CURAÇAO":"CURAÇAO","SWITZERLAND":"SWITZER­LAND","UZBEKISTAN":"UZBEK­ISTAN","NETHERLANDS":"NETHER­LANDS"};
const fixtureName = n => FIXTURE_NAME[n] || n.toUpperCase();

// Language context — available to all components
const LangContext = createContext("en");
const CODE3 = {"SPAIN":"ESP","FRANCE":"FRA","ENGLAND":"ENG","BRAZIL":"BRA","PORTUGAL":"POR","ARGENTINA":"ARG","GERMANY":"GER","NETHERLANDS":"NED","NORWAY":"NOR","BELGIUM":"BEL","COLOMBIA":"COL","JAPAN":"JPN","MOROCCO":"MAR","MEXICO":"MEX","URUGUAY":"URU","USA":"USA","CROATIA":"CRO","SWITZERLAND":"SUI","TÜRKIYE":"TUR","ECUADOR":"ECU","CANADA":"CAN","SENEGAL":"SEN","SWEDEN":"SWE","AUSTRIA":"AUT","PARAGUAY":"PAR","SCOTLAND":"SCO","CZECHIA":"CZE","EGYPT":"EGY","IVORY COAST":"CIV","BOSNIA AND HERZEGOVINA":"BIH","ALGERIA":"ALG","GHANA":"GHA","SOUTH KOREA":"KOR","AUSTRALIA":"AUS","IRAN":"IRN","TUNISIA":"TUN","DR CONGO":"COD","SAUDI ARABIA":"KSA","SOUTH AFRICA":"RSA","IRAQ":"IRQ","PANAMA":"PAN","UZBEKISTAN":"UZB","CAPE VERDE":"CPV","QATAR":"QAT","HAITI":"HAI","JORDAN":"JOR","NEW ZEALAND":"NZL","CURAÇAO":"CUW"};
const code3 = n => CODE3[n]||n.slice(0,3);
const fmtOdds = n => n<100 ? n.toFixed(2) : new Intl.NumberFormat("en-US",{minimumFractionDigits:2}).format(n);
const DAYS_ES = ["DOM","LUN","MAR","MIÉ","JUE","VIE","SÁB"];
const MONTHS_ES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

const fmtDate = (dateStr, lang="en") => {
  const d = new Date(dateStr+"T12:00:00");
  if(lang==="es") {
    const day=DAYS_ES[d.getDay()];
    const month=MONTHS_ES[d.getMonth()];
    return `${day} · ${month} ${d.getDate()}`;
  }
  return d.toLocaleDateString("en-US",{weekday:"short"}).toUpperCase()+" · "+d.toLocaleDateString("en-US",{month:"short",day:"numeric"}).toUpperCase();
};

// ── Pre-match odds [home%, draw%, away%] — all sum to exactly 100 ──
const MATCH_ODDS = {
  // Group A
  G01:[68,21,11], G02:[38,31,31], G25:[55,25,20], G28:[49,28,23], G53:[26,24,50], G54:[16,24,60],
  // Group B
  G03:[54,27,19], G05:[6,12,82],  G26:[62,23,15], G27:[77,16,7],  G49:[38,31,31], G50:[66,19,15],
  // Group C
  G06:[59,25,16], G07:[16,22,62], G30:[17,26,57], G31:[88,8,4],   G51:[12,19,69], G52:[81,13,6],
  // Group D
  G04:[47,30,23], G08:[17,26,57], G29:[62,21,17], G32:[48,28,24], G59:[28,23,49], G60:[34,42,24],
  // Group E
  G09:[93,5,2],   G11:[29,33,38], G34:[64,20,16], G35:[88,8,4],   G55:[6,12,82],   G56:[27,24,49],
  // Group F
  G10:[49,27,24], G12:[51,28,21], G33:[58,23,19], G36:[13,23,64], G57:[49,27,24], G58:[4,12,84],
  // Group G
  G14:[66,21,13], G16:[55,27,18], G38:[70,19,11], G40:[15,26,59], G65:[40,34,26], G66:[7,13,80],
  // Group H
  G13:[90,7,3],   G15:[11,21,68], G37:[89,7,4],   G39:[63,23,14], G63:[40,27,33], G64:[14,23,63],
  // Group I
  G17:[67,21,12], G18:[5,12,83],  G42:[86,10,4],  G43:[45,28,27], G61:[23,25,52], G62:[73,18,9],
  // Group J
  G19:[71,20,9],  G20:[73,17,10], G41:[58,25,17], G44:[16,23,61], G71:[9,13,78],  G72:[31,34,35],
  // Group K
  G21:[77,16,7],  G24:[9,19,72],  G45:[80,14,6],  G48:[63,22,15], G69:[26,27,47], G70:[45,27,28],
  // Group L
  G22:[57,25,18], G23:[43,29,28], G46:[79,14,7],  G47:[14,23,63], G67:[10,13,77], G68:[59,24,17],
};

// KO stage odds (to qualify, no draw) — [home%, away%] summing to 100
// Source: bet365 decimal odds, vig-normalised. Home team = sA side of the match.
const KO_ODDS = {
  K73:[28,72],  // South Africa vs Canada (3.50/1.30)
  K74:[72,28],  // Brazil vs Japan (1.33/3.40)
  K75:[79,21],  // Germany vs Paraguay (1.20/4.50)
  K76:[60,40],  // Netherlands vs Morocco (1.53/2.50)
  K77:[36,64],  // Ivory Coast vs Norway (2.50/1.53)
  K78:[84,16],  // France vs Sweden (1.12/6.00)
  K79:[62,38],  // Mexico vs Ecuador (1.53/2.50)
  K80:[85,15],  // England vs DR Congo (1.11/6.50)
  K81:[64,36],  // Belgium vs Senegal (1.50/2.62)
  K82:[81,19],  // USA vs Bosnia (1.16/5.00)
  K83:[85,15],  // Spain vs Austria (1.11/6.50)
  K84:[70,30],  // Portugal vs Croatia (1.36/3.20)
  K85:[68,32],  // Switzerland vs Algeria (1.40/3.00)
  K86:[43,57],  // Australia vs Egypt (2.20/1.66)
  K87:[89,11],  // Argentina vs Cape Verde (1.071/9.00)
  K88:[75,25],  // Colombia vs Ghana (1.28/3.75)
  // R16
  K89:[11,89],  // Paraguay vs France
  K90:[32,68],  // Canada vs Morocco
  K91:[68,32],  // Brazil vs Norway
  K92:[43,57],  // Mexico vs England
  K93:[34,66],  // Portugal vs Spain
  K94:[50,50],  // USA vs Belgium
  K95:[83,17],  // Argentina vs Egypt
  K96:[41,59],  // Switzerland vs Colombia
  // QF
  K97:[76,24],  // France vs Morocco (1.25/4.00)
  K98:[73,27],  // Spain vs Belgium (1.30/3.50)
  K99:[34,66],  // Norway vs England (2.75/1.44)
  K100:[72,28], // Argentina vs Switzerland (1.33/3.40)
  // SF
  K101:[59,41],  // France vs Spain (1.61/2.30)
  K102:[55,45],  // England vs Argentina (1.72/2.10)
  // 3rd Place & Final
  K103:[58,42],  // France vs England 3rd place (1.61/2.20)
  K104:[59,41],  // Spain vs Argentina Final (1.61/2.30)
};

const fmtKickoff = (dateStr, timeUTC) => {
  if(!timeUTC) return "";
  try {
    const d = new Date(dateStr+"T"+timeUTC+":00Z");
    const h = d.getHours(), m = d.getMinutes();
    const ampm = h >= 12 ? "pm" : "am";
    const h12 = h % 12 || 12;
    return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,"0")}${ampm}`;
  } catch(e) { return timeUTC; }
};

const TEAMS = [
  {name:"SPAIN",flag:"🇪🇸",odds:5.5},{name:"FRANCE",flag:"🇫🇷",odds:6.0},{name:"ENGLAND",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",odds:7.5},{name:"BRAZIL",flag:"🇧🇷",odds:9.0},{name:"PORTUGAL",flag:"🇵🇹",odds:9.0},{name:"ARGENTINA",flag:"🇦🇷",odds:10.0},{name:"GERMANY",flag:"🇩🇪",odds:15.0},{name:"NETHERLANDS",flag:"🇳🇱",odds:21.0},{name:"NORWAY",flag:"🇳🇴",odds:26.0},{name:"BELGIUM",flag:"🇧🇪",odds:34.0},{name:"COLOMBIA",flag:"🇨🇴",odds:34.0},{name:"JAPAN",flag:"🇯🇵",odds:51.0},{name:"MOROCCO",flag:"🇲🇦",odds:51.0},{name:"MEXICO",flag:"🇲🇽",odds:67.0},{name:"URUGUAY",flag:"🇺🇾",odds:67.0},{name:"USA",flag:"🇺🇸",odds:67.0},{name:"CROATIA",flag:"🇭🇷",odds:81.0},{name:"SWITZERLAND",flag:"🇨🇭",odds:81.0},{name:"TÜRKIYE",flag:"🇹🇷",odds:81.0},{name:"ECUADOR",flag:"🇪🇨",odds:101.0},{name:"CANADA",flag:"🇨🇦",odds:126.0},{name:"SENEGAL",flag:"🇸🇳",odds:126.0},{name:"SWEDEN",flag:"🇸🇪",odds:126.0},{name:"AUSTRIA",flag:"🇦🇹",odds:151.0},{name:"PARAGUAY",flag:"🇵🇾",odds:151.0},{name:"SCOTLAND",flag:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",odds:251.0},{name:"CZECHIA",flag:"🇨🇿",odds:301.0},{name:"EGYPT",flag:"🇪🇬",odds:301.0},{name:"IVORY COAST",flag:"🇨🇮",odds:301.0},{name:"BOSNIA AND HERZEGOVINA",flag:"🇧🇦",odds:351.0},{name:"ALGERIA",flag:"🇩🇿",odds:401.0},{name:"GHANA",flag:"🇬🇭",odds:401.0},{name:"SOUTH KOREA",flag:"🇰🇷",odds:401.0},{name:"AUSTRALIA",flag:"🇦🇺",odds:501.0},{name:"IRAN",flag:"🇮🇷",odds:501.0},{name:"TUNISIA",flag:"🇹🇳",odds:501.0},{name:"DR CONGO",flag:"🇨🇩",odds:751.0},{name:"SAUDI ARABIA",flag:"🇸🇦",odds:1001.0},{name:"SOUTH AFRICA",flag:"🇿🇦",odds:1001.0},{name:"IRAQ",flag:"🇮🇶",odds:1501.0},{name:"PANAMA",flag:"🇵🇦",odds:1501.0},{name:"UZBEKISTAN",flag:"🇺🇿",odds:1501.0},{name:"CAPE VERDE",flag:"🇨🇻",odds:2001.0},{name:"QATAR",flag:"🇶🇦",odds:2001.0},{name:"HAITI",flag:"🇭🇹",odds:2501.0},{name:"JORDAN",flag:"🇯🇴",odds:2501.0},{name:"NEW ZEALAND",flag:"🇳🇿",odds:2501.0},{name:"CURAÇAO",flag:"🇨🇼",odds:3501.0},
].sort((a,b)=>a.odds-b.odds||a.name.localeCompare(b.name));
const TBN = Object.fromEntries(TEAMS.map(t=>[t.name,t]));

const GROUPS = {
  A:["MEXICO","SOUTH AFRICA","SOUTH KOREA","CZECHIA"],B:["CANADA","BOSNIA AND HERZEGOVINA","QATAR","SWITZERLAND"],C:["BRAZIL","MOROCCO","SCOTLAND","HAITI"],D:["USA","PARAGUAY","AUSTRALIA","TÜRKIYE"],E:["GERMANY","CURAÇAO","IVORY COAST","ECUADOR"],F:["NETHERLANDS","JAPAN","TUNISIA","SWEDEN"],G:["BELGIUM","EGYPT","IRAN","NEW ZEALAND"],H:["SPAIN","CAPE VERDE","SAUDI ARABIA","URUGUAY"],I:["FRANCE","SENEGAL","IRAQ","NORWAY"],J:["ARGENTINA","ALGERIA","AUSTRIA","JORDAN"],K:["PORTUGAL","COLOMBIA","UZBEKISTAN","DR CONGO"],L:["ENGLAND","CROATIA","GHANA","PANAMA"],
};

const GM = [
  {id:"G01",g:"A",d:"2026-06-11",t:["MEXICO","SOUTH AFRICA"],v:"Mexico City",ko:"19:00"},{id:"G02",g:"A",d:"2026-06-12",t:["SOUTH KOREA","CZECHIA"],v:"Guadalajara",ko:"02:00"},{id:"G03",g:"B",d:"2026-06-12",t:["CANADA","BOSNIA AND HERZEGOVINA"],v:"Toronto",ko:"19:00"},{id:"G04",g:"D",d:"2026-06-13",t:["USA","PARAGUAY"],v:"Los Angeles",ko:"01:00"},{id:"G05",g:"B",d:"2026-06-13",t:["QATAR","SWITZERLAND"],v:"San Francisco",ko:"19:00"},{id:"G06",g:"C",d:"2026-06-13",t:["BRAZIL","MOROCCO"],v:"New York/NJ",ko:"22:00"},{id:"G07",g:"C",d:"2026-06-14",t:["HAITI","SCOTLAND"],v:"Boston",ko:"01:00"},{id:"G08",g:"D",d:"2026-06-14",t:["AUSTRALIA","TÜRKIYE"],v:"Vancouver",ko:"04:00"},{id:"G09",g:"E",d:"2026-06-14",t:["GERMANY","CURAÇAO"],v:"Houston",ko:"17:00"},{id:"G10",g:"F",d:"2026-06-14",t:["NETHERLANDS","JAPAN"],v:"Dallas",ko:"20:00"},{id:"G11",g:"E",d:"2026-06-14",t:["IVORY COAST","ECUADOR"],v:"Philadelphia",ko:"23:00"},{id:"G12",g:"F",d:"2026-06-15",t:["SWEDEN","TUNISIA"],v:"Monterrey",ko:"02:00"},{id:"G13",g:"H",d:"2026-06-15",t:["SPAIN","CAPE VERDE"],v:"Atlanta",ko:"16:00"},{id:"G14",g:"G",d:"2026-06-15",t:["BELGIUM","EGYPT"],v:"Seattle",ko:"19:00"},{id:"G15",g:"H",d:"2026-06-15",t:["SAUDI ARABIA","URUGUAY"],v:"Miami",ko:"22:00"},{id:"G16",g:"G",d:"2026-06-16",t:["IRAN","NEW ZEALAND"],v:"Los Angeles",ko:"01:00"},{id:"G17",g:"I",d:"2026-06-16",t:["FRANCE","SENEGAL"],v:"New York/NJ",ko:"19:00"},{id:"G18",g:"I",d:"2026-06-16",t:["IRAQ","NORWAY"],v:"Boston",ko:"22:00"},{id:"G19",g:"J",d:"2026-06-17",t:["ARGENTINA","ALGERIA"],v:"Kansas City",ko:"01:00"},{id:"G20",g:"J",d:"2026-06-17",t:["AUSTRIA","JORDAN"],v:"San Francisco",ko:"04:00"},{id:"G21",g:"K",d:"2026-06-17",t:["PORTUGAL","DR CONGO"],v:"Houston",ko:"17:00"},{id:"G22",g:"L",d:"2026-06-17",t:["ENGLAND","CROATIA"],v:"Dallas",ko:"20:00"},{id:"G23",g:"L",d:"2026-06-17",t:["GHANA","PANAMA"],v:"Toronto",ko:"23:00"},{id:"G24",g:"K",d:"2026-06-18",t:["UZBEKISTAN","COLOMBIA"],v:"Mexico City",ko:"02:00"},{id:"G25",g:"A",d:"2026-06-18",t:["CZECHIA","SOUTH AFRICA"],v:"Atlanta",ko:"16:00"},{id:"G26",g:"B",d:"2026-06-18",t:["SWITZERLAND","BOSNIA AND HERZEGOVINA"],v:"Los Angeles",ko:"19:00"},{id:"G27",g:"B",d:"2026-06-18",t:["CANADA","QATAR"],v:"Vancouver",ko:"22:00"},{id:"G28",g:"A",d:"2026-06-19",t:["MEXICO","SOUTH KOREA"],v:"Guadalajara",ko:"01:00"},{id:"G29",g:"D",d:"2026-06-19",t:["USA","AUSTRALIA"],v:"Seattle",ko:"19:00"},{id:"G30",g:"C",d:"2026-06-19",t:["SCOTLAND","MOROCCO"],v:"Boston",ko:"22:00"},{id:"G31",g:"C",d:"2026-06-20",t:["BRAZIL","HAITI"],v:"Philadelphia",ko:"00:30"},{id:"G32",g:"D",d:"2026-06-20",t:["TÜRKIYE","PARAGUAY"],v:"San Francisco",ko:"03:00"},{id:"G33",g:"F",d:"2026-06-20",t:["NETHERLANDS","SWEDEN"],v:"Houston",ko:"17:00"},{id:"G34",g:"E",d:"2026-06-20",t:["GERMANY","IVORY COAST"],v:"Toronto",ko:"20:00"},{id:"G35",g:"E",d:"2026-06-21",t:["ECUADOR","CURAÇAO"],v:"Kansas City",ko:"00:00"},{id:"G36",g:"F",d:"2026-06-21",t:["TUNISIA","JAPAN"],v:"Monterrey",ko:"04:00"},{id:"G37",g:"H",d:"2026-06-21",t:["SPAIN","SAUDI ARABIA"],v:"Atlanta",ko:"16:00"},{id:"G38",g:"G",d:"2026-06-21",t:["BELGIUM","IRAN"],v:"Los Angeles",ko:"19:00"},{id:"G39",g:"H",d:"2026-06-21",t:["URUGUAY","CAPE VERDE"],v:"Miami",ko:"22:00"},{id:"G40",g:"G",d:"2026-06-22",t:["NEW ZEALAND","EGYPT"],v:"Vancouver",ko:"01:00"},{id:"G41",g:"J",d:"2026-06-22",t:["ARGENTINA","AUSTRIA"],v:"Dallas",ko:"17:00"},{id:"G42",g:"I",d:"2026-06-22",t:["FRANCE","IRAQ"],v:"Philadelphia",ko:"21:00"},{id:"G43",g:"I",d:"2026-06-23",t:["NORWAY","SENEGAL"],v:"New York/NJ",ko:"00:00"},{id:"G44",g:"J",d:"2026-06-23",t:["JORDAN","ALGERIA"],v:"San Francisco",ko:"03:00"},{id:"G45",g:"K",d:"2026-06-23",t:["PORTUGAL","UZBEKISTAN"],v:"Houston",ko:"17:00"},{id:"G46",g:"L",d:"2026-06-23",t:["ENGLAND","GHANA"],v:"Boston",ko:"20:00"},{id:"G47",g:"L",d:"2026-06-23",t:["PANAMA","CROATIA"],v:"Toronto",ko:"23:00"},{id:"G48",g:"K",d:"2026-06-24",t:["COLOMBIA","DR CONGO"],v:"Guadalajara",ko:"02:00"},{id:"G49",g:"B",d:"2026-06-24",t:["SWITZERLAND","CANADA"],v:"Vancouver",ko:"19:00"},{id:"G50",g:"B",d:"2026-06-24",t:["BOSNIA AND HERZEGOVINA","QATAR"],v:"Seattle",ko:"19:00"},{id:"G51",g:"C",d:"2026-06-24",t:["SCOTLAND","BRAZIL"],v:"Miami",ko:"22:00"},{id:"G52",g:"C",d:"2026-06-24",t:["MOROCCO","HAITI"],v:"Atlanta",ko:"22:00"},{id:"G53",g:"A",d:"2026-06-25",t:["CZECHIA","MEXICO"],v:"Mexico City",ko:"01:00"},{id:"G54",g:"A",d:"2026-06-25",t:["SOUTH AFRICA","SOUTH KOREA"],v:"Monterrey",ko:"01:00"},{id:"G55",g:"E",d:"2026-06-25",t:["CURAÇAO","IVORY COAST"],v:"Philadelphia",ko:"20:00"},{id:"G56",g:"E",d:"2026-06-25",t:["ECUADOR","GERMANY"],v:"New York/NJ",ko:"20:00"},{id:"G57",g:"F",d:"2026-06-25",t:["JAPAN","SWEDEN"],v:"Dallas",ko:"23:00"},{id:"G58",g:"F",d:"2026-06-25",t:["TUNISIA","NETHERLANDS"],v:"Kansas City",ko:"23:00"},{id:"G59",g:"D",d:"2026-06-26",t:["TÜRKIYE","USA"],v:"Los Angeles",ko:"02:00"},{id:"G60",g:"D",d:"2026-06-26",t:["PARAGUAY","AUSTRALIA"],v:"San Francisco",ko:"02:00"},{id:"G61",g:"I",d:"2026-06-26",t:["NORWAY","FRANCE"],v:"Boston",ko:"19:00"},{id:"G62",g:"I",d:"2026-06-26",t:["SENEGAL","IRAQ"],v:"Toronto",ko:"19:00"},{id:"G63",g:"H",d:"2026-06-27",t:["CAPE VERDE","SAUDI ARABIA"],v:"Houston",ko:"00:00"},{id:"G64",g:"H",d:"2026-06-27",t:["URUGUAY","SPAIN"],v:"Guadalajara",ko:"00:00"},{id:"G65",g:"G",d:"2026-06-27",t:["EGYPT","IRAN"],v:"Seattle",ko:"03:00"},{id:"G66",g:"G",d:"2026-06-27",t:["NEW ZEALAND","BELGIUM"],v:"Vancouver",ko:"03:00"},{id:"G67",g:"L",d:"2026-06-27",t:["PANAMA","ENGLAND"],v:"New York/NJ",ko:"21:00"},{id:"G68",g:"L",d:"2026-06-27",t:["CROATIA","GHANA"],v:"Philadelphia",ko:"21:00"},{id:"G69",g:"K",d:"2026-06-27",t:["COLOMBIA","PORTUGAL"],v:"Miami",ko:"23:30"},{id:"G70",g:"K",d:"2026-06-27",t:["DR CONGO","UZBEKISTAN"],v:"Atlanta",ko:"23:30"},{id:"G71",g:"J",d:"2026-06-28",t:["JORDAN","ARGENTINA"],v:"Dallas",ko:"02:00"},{id:"G72",g:"J",d:"2026-06-28",t:["ALGERIA","AUSTRIA"],v:"Kansas City",ko:"02:00"},
];

const KM = [
  // R32 — n values match FIFA official match numbers (chronological order differs from FIFA numbering)
  {id:"K73",round:"r32",n:73,sA:"2nd A",sB:"2nd B",v:"Los Angeles",ko:"19:00",d:"2026-06-28"},{id:"K74",round:"r32",n:76,sA:"1st C",sB:"2nd F",v:"Houston",ko:"17:00",d:"2026-06-29"},{id:"K75",round:"r32",n:74,sA:"1st E",sB:"3rd A/B/C/D/F",v:"Boston",ko:"20:30",d:"2026-06-29"},{id:"K76",round:"r32",n:75,sA:"1st F",sB:"2nd C",v:"Monterrey",ko:"01:00",d:"2026-06-30"},{id:"K77",round:"r32",n:78,sA:"2nd E",sB:"2nd I",v:"Dallas",ko:"17:00",d:"2026-06-30"},{id:"K78",round:"r32",n:77,sA:"1st I",sB:"3rd C/D/F/G/H",v:"New York/NJ",ko:"21:00",d:"2026-06-30"},{id:"K79",round:"r32",n:79,sA:"1st A",sB:"3rd C/E/F/H/I",v:"Mexico City",ko:"01:00",d:"2026-07-01"},{id:"K80",round:"r32",n:80,sA:"1st L",sB:"3rd E/H/I/J/K",v:"Atlanta",ko:"16:00",d:"2026-07-01"},{id:"K81",round:"r32",n:82,sA:"1st G",sB:"3rd A/E/H/I/J",v:"Seattle",ko:"20:00",d:"2026-07-01"},{id:"K82",round:"r32",n:81,sA:"1st D",sB:"3rd B/E/F/I/J",v:"San Francisco",ko:"00:00",d:"2026-07-02"},{id:"K83",round:"r32",n:84,sA:"1st H",sB:"2nd J",v:"Los Angeles",ko:"19:00",d:"2026-07-02"},{id:"K84",round:"r32",n:83,sA:"2nd K",sB:"2nd L",v:"Toronto",ko:"23:00",d:"2026-07-02"},{id:"K85",round:"r32",n:85,sA:"1st B",sB:"3rd D/E/I/J/L",v:"Vancouver",ko:"03:00",d:"2026-07-03"},{id:"K86",round:"r32",n:88,sA:"2nd D",sB:"2nd G",v:"Dallas",ko:"18:00",d:"2026-07-03"},{id:"K87",round:"r32",n:86,sA:"1st J",sB:"2nd H",v:"Miami",ko:"22:00",d:"2026-07-03"},{id:"K88",round:"r32",n:87,sA:"1st K",sB:"3rd D/E/I/J/L",v:"Kansas City",ko:"01:30",d:"2026-07-04"},
  // R16 — slot labels use FIFA official match numbers; resolver looks up by n value
  {id:"K89",round:"r16",n:89,sA:"Win M74",sB:"Win M77",v:"Philadelphia",ko:"21:00",d:"2026-07-04"},{id:"K90",round:"r16",n:90,sA:"Win M73",sB:"Win M75",v:"Houston",ko:"17:00",d:"2026-07-04"},{id:"K91",round:"r16",n:91,sA:"Win M76",sB:"Win M78",v:"New York/NJ",ko:"20:00",d:"2026-07-05"},{id:"K92",round:"r16",n:92,sA:"Win M79",sB:"Win M80",v:"Mexico City",ko:"00:00",d:"2026-07-06"},{id:"K93",round:"r16",n:93,sA:"Win M83",sB:"Win M84",v:"Dallas",ko:"19:00",d:"2026-07-06"},{id:"K94",round:"r16",n:94,sA:"Win M81",sB:"Win M82",v:"Seattle",ko:"00:00",d:"2026-07-07"},{id:"K95",round:"r16",n:95,sA:"Win M86",sB:"Win M88",v:"Atlanta",ko:"16:00",d:"2026-07-07"},{id:"K96",round:"r16",n:96,sA:"Win M85",sB:"Win M87",v:"Vancouver",ko:"20:00",d:"2026-07-07"},
  // QF — dates/times verified via Al Jazeera direct GMT + CBS/ESPN/Yahoo ET cross-checks. Slot labels unchanged.
  {id:"K97",round:"qf",n:97,sA:"Win M89",sB:"Win M90",v:"Boston",ko:"20:00",d:"2026-07-09"},{id:"K98",round:"qf",n:98,sA:"Win M93",sB:"Win M94",v:"Los Angeles",ko:"19:00",d:"2026-07-10"},{id:"K99",round:"qf",n:99,sA:"Win M91",sB:"Win M92",v:"Miami",ko:"21:00",d:"2026-07-11"},{id:"K100",round:"qf",n:100,sA:"Win M95",sB:"Win M96",v:"Kansas City",ko:"01:00",d:"2026-07-12"},
  // SF / Third / Final — dates/times verified via ESPN/CBS/Yahoo ET cross-checks. Slot labels unchanged.
  {id:"K101",round:"sf",n:101,sA:"Win M97",sB:"Win M98",v:"Dallas",ko:"19:00",d:"2026-07-14"},{id:"K102",round:"sf",n:102,sA:"Win M99",sB:"Win M100",v:"Atlanta",ko:"19:00",d:"2026-07-15"},
  {id:"K103",round:"third",n:103,sA:"Loss M101",sB:"Loss M102",v:"Miami",ko:"21:00",d:"2026-07-18"},{id:"K104",round:"final",n:104,sA:"Win M101",sB:"Win M102",v:"New York/NJ",ko:"19:00",d:"2026-07-19"},
];

// FIFA Annex C lookup table: 8-letter sorted group key -> which 3rd place group goes into each slot
// Cols: 1A=K79, 1B=K85, 1D=K81, 1E=K75(K74), 1G=K82, 1I=K77, 1K=K87, 1L=K80
// Source: Wikipedia 2026 FIFA World Cup knockout stage + FIFA Regulations Annex C
const FIFA_THIRD_PLACE_TABLE={
"EFGHIJKL":{K79:"E",K85:"J",K82:"I",K75:"F",K81:"H",K78:"G",K88:"L",K80:"K"},
"DFGHIJKL":{K79:"H",K85:"G",K82:"I",K75:"D",K81:"J",K78:"F",K88:"L",K80:"K"},
"DEGHIJKL":{K79:"E",K85:"J",K82:"I",K75:"D",K81:"H",K78:"G",K88:"L",K80:"K"},
"DEFHIJKL":{K79:"E",K85:"J",K82:"I",K75:"D",K81:"H",K78:"F",K88:"L",K80:"K"},
"DEFGIJKL":{K79:"E",K85:"G",K82:"I",K75:"D",K81:"J",K78:"F",K88:"L",K80:"K"},
"DEFGHJKL":{K79:"E",K85:"G",K82:"J",K75:"D",K81:"H",K78:"F",K88:"L",K80:"K"},
"DEFGHIKL":{K79:"E",K85:"G",K82:"I",K75:"D",K81:"H",K78:"F",K88:"L",K80:"K"},
"DEFGHIJL":{K79:"E",K85:"G",K82:"J",K75:"D",K81:"H",K78:"F",K88:"L",K80:"I"},
"DEFGHIJK":{K79:"E",K85:"G",K82:"J",K75:"D",K81:"H",K78:"F",K88:"I",K80:"K"},
"CFGHIJKL":{K79:"H",K85:"G",K82:"I",K75:"C",K81:"J",K78:"F",K88:"L",K80:"K"},
"CEGHIJKL":{K79:"E",K85:"J",K82:"I",K75:"C",K81:"H",K78:"G",K88:"L",K80:"K"},
"CEFHIJKL":{K79:"E",K85:"J",K82:"I",K75:"C",K81:"H",K78:"F",K88:"L",K80:"K"},
"CEFGIJKL":{K79:"E",K85:"G",K82:"I",K75:"C",K81:"J",K78:"F",K88:"L",K80:"K"},
"CEFGHJKL":{K79:"E",K85:"G",K82:"J",K75:"C",K81:"H",K78:"F",K88:"L",K80:"K"},
"CEFGHIKL":{K79:"E",K85:"G",K82:"I",K75:"C",K81:"H",K78:"F",K88:"L",K80:"K"},
"CEFGHIJL":{K79:"E",K85:"G",K82:"J",K75:"C",K81:"H",K78:"F",K88:"L",K80:"I"},
"CEFGHIJK":{K79:"E",K85:"G",K82:"J",K75:"C",K81:"H",K78:"F",K88:"I",K80:"K"},
"CDGHIJKL":{K79:"H",K85:"G",K82:"I",K75:"C",K81:"J",K78:"D",K88:"L",K80:"K"},
"CDFHIJKL":{K79:"C",K85:"J",K82:"I",K75:"D",K81:"H",K78:"F",K88:"L",K80:"K"},
"CDFGIJKL":{K79:"C",K85:"G",K82:"I",K75:"D",K81:"J",K78:"F",K88:"L",K80:"K"},
"CDFGHJKL":{K79:"C",K85:"G",K82:"J",K75:"D",K81:"H",K78:"F",K88:"L",K80:"K"},
"CDFGHIKL":{K79:"C",K85:"G",K82:"I",K75:"D",K81:"H",K78:"F",K88:"L",K80:"K"},
"CDFGHIJL":{K79:"C",K85:"G",K82:"J",K75:"D",K81:"H",K78:"F",K88:"L",K80:"I"},
"CDFGHIJK":{K79:"C",K85:"G",K82:"J",K75:"D",K81:"H",K78:"F",K88:"I",K80:"K"},
"CDEHIJKL":{K79:"E",K85:"J",K82:"I",K75:"C",K81:"H",K78:"D",K88:"L",K80:"K"},
"CDEGIJKL":{K79:"E",K85:"G",K82:"I",K75:"C",K81:"J",K78:"D",K88:"L",K80:"K"},
"CDEGHJKL":{K79:"E",K85:"G",K82:"J",K75:"C",K81:"H",K78:"D",K88:"L",K80:"K"},
"CDEGHIKL":{K79:"E",K85:"G",K82:"I",K75:"C",K81:"H",K78:"D",K88:"L",K80:"K"},
"CDEGHIJL":{K79:"E",K85:"G",K82:"J",K75:"C",K81:"H",K78:"D",K88:"L",K80:"I"},
"CDEGHIJK":{K79:"E",K85:"G",K82:"J",K75:"C",K81:"H",K78:"D",K88:"I",K80:"K"},
"CDEFIJKL":{K79:"C",K85:"J",K82:"E",K75:"D",K81:"I",K78:"F",K88:"L",K80:"K"},
"CDEFHJKL":{K79:"C",K85:"J",K82:"E",K75:"D",K81:"H",K78:"F",K88:"L",K80:"K"},
"CDEFHIKL":{K79:"C",K85:"E",K82:"I",K75:"D",K81:"H",K78:"F",K88:"L",K80:"K"},
"CDEFHIJL":{K79:"C",K85:"J",K82:"E",K75:"D",K81:"H",K78:"F",K88:"L",K80:"I"},
"CDEFHIJK":{K79:"C",K85:"J",K82:"E",K75:"D",K81:"H",K78:"F",K88:"I",K80:"K"},
"CDEFGJKL":{K79:"C",K85:"G",K82:"E",K75:"D",K81:"J",K78:"F",K88:"L",K80:"K"},
"CDEFGIKL":{K79:"C",K85:"G",K82:"E",K75:"D",K81:"I",K78:"F",K88:"L",K80:"K"},
"CDEFGIJL":{K79:"C",K85:"G",K82:"E",K75:"D",K81:"J",K78:"F",K88:"L",K80:"I"},
"CDEFGIJK":{K79:"C",K85:"G",K82:"E",K75:"D",K81:"J",K78:"F",K88:"I",K80:"K"},
"CDEFGHKL":{K79:"C",K85:"G",K82:"E",K75:"D",K81:"H",K78:"F",K88:"L",K80:"K"},
"CDEFGHJL":{K79:"C",K85:"G",K82:"J",K75:"D",K81:"H",K78:"F",K88:"L",K80:"E"},
"CDEFGHJK":{K79:"C",K85:"G",K82:"J",K75:"D",K81:"H",K78:"F",K88:"E",K80:"K"},
"CDEFGHIL":{K79:"C",K85:"G",K82:"E",K75:"D",K81:"H",K78:"F",K88:"L",K80:"I"},
"CDEFGHIK":{K79:"C",K85:"G",K82:"E",K75:"D",K81:"H",K78:"F",K88:"I",K80:"K"},
"CDEFGHIJ":{K79:"C",K85:"G",K82:"J",K75:"D",K81:"H",K78:"F",K88:"E",K80:"I"},
"BFGHIJKL":{K79:"H",K85:"J",K82:"B",K75:"F",K81:"I",K78:"G",K88:"L",K80:"K"},
"BEGHIJKL":{K79:"E",K85:"J",K82:"I",K75:"B",K81:"H",K78:"G",K88:"L",K80:"K"},
"BEFHIJKL":{K79:"E",K85:"J",K82:"B",K75:"F",K81:"I",K78:"H",K88:"L",K80:"K"},
"BEFGIJKL":{K79:"E",K85:"J",K82:"B",K75:"F",K81:"I",K78:"G",K88:"L",K80:"K"},
"BEFGHJKL":{K79:"E",K85:"J",K82:"B",K75:"F",K81:"H",K78:"G",K88:"L",K80:"K"},
"BEFGHIKL":{K79:"E",K85:"G",K82:"B",K75:"F",K81:"I",K78:"H",K88:"L",K80:"K"},
"BEFGHIJL":{K79:"E",K85:"J",K82:"B",K75:"F",K81:"H",K78:"G",K88:"L",K80:"I"},
"BEFGHIJK":{K79:"E",K85:"J",K82:"B",K75:"F",K81:"H",K78:"G",K88:"I",K80:"K"},
"BDGHIJKL":{K79:"H",K85:"J",K82:"B",K75:"D",K81:"I",K78:"G",K88:"L",K80:"K"},
"BDFHIJKL":{K79:"H",K85:"J",K82:"B",K75:"D",K81:"I",K78:"F",K88:"L",K80:"K"},
"BDFGIJKL":{K79:"I",K85:"G",K82:"B",K75:"D",K81:"J",K78:"F",K88:"L",K80:"K"},
"BDFGHJKL":{K79:"H",K85:"G",K82:"B",K75:"D",K81:"J",K78:"F",K88:"L",K80:"K"},
"BDFGHIKL":{K79:"H",K85:"G",K82:"B",K75:"D",K81:"I",K78:"F",K88:"L",K80:"K"},
"BDFGHIJL":{K79:"H",K85:"G",K82:"B",K75:"D",K81:"J",K78:"F",K88:"L",K80:"I"},
"BDFGHIJK":{K79:"H",K85:"G",K82:"B",K75:"D",K81:"J",K78:"F",K88:"I",K80:"K"},
"BDEHIJKL":{K79:"E",K85:"J",K82:"B",K75:"D",K81:"I",K78:"H",K88:"L",K80:"K"},
"BDEGIJKL":{K79:"E",K85:"J",K82:"B",K75:"D",K81:"I",K78:"G",K88:"L",K80:"K"},
"BDEGHJKL":{K79:"E",K85:"J",K82:"B",K75:"D",K81:"H",K78:"G",K88:"L",K80:"K"},
"BDEGHIKL":{K79:"E",K85:"G",K82:"B",K75:"D",K81:"I",K78:"H",K88:"L",K80:"K"},
"BDEGHIJL":{K79:"E",K85:"J",K82:"B",K75:"D",K81:"H",K78:"G",K88:"L",K80:"I"},
"BDEGHIJK":{K79:"E",K85:"J",K82:"B",K75:"D",K81:"H",K78:"G",K88:"I",K80:"K"},
"BDEFIJKL":{K79:"E",K85:"J",K82:"B",K75:"D",K81:"I",K78:"F",K88:"L",K80:"K"},
"BDEFHJKL":{K79:"E",K85:"J",K82:"B",K75:"D",K81:"H",K78:"F",K88:"L",K80:"K"},
"BDEFHIKL":{K79:"E",K85:"I",K82:"B",K75:"D",K81:"H",K78:"F",K88:"L",K80:"K"},
"BDEFHIJL":{K79:"E",K85:"J",K82:"B",K75:"D",K81:"H",K78:"F",K88:"L",K80:"I"},
"BDEFHIJK":{K79:"E",K85:"J",K82:"B",K75:"D",K81:"H",K78:"F",K88:"I",K80:"K"},
"BDEFGJKL":{K79:"E",K85:"G",K82:"B",K75:"D",K81:"J",K78:"F",K88:"L",K80:"K"},
"BDEFGIKL":{K79:"E",K85:"G",K82:"B",K75:"D",K81:"I",K78:"F",K88:"L",K80:"K"},
"BDEFGIJL":{K79:"E",K85:"G",K82:"B",K75:"D",K81:"J",K78:"F",K88:"L",K80:"I"},
"BDEFGIJK":{K79:"E",K85:"G",K82:"B",K75:"D",K81:"J",K78:"F",K88:"I",K80:"K"},
"BDEFGHKL":{K79:"E",K85:"G",K82:"B",K75:"D",K81:"H",K78:"F",K88:"L",K80:"K"},
"BDEFGHJL":{K79:"H",K85:"G",K82:"B",K75:"D",K81:"J",K78:"F",K88:"L",K80:"E"},
"BDEFGHJK":{K79:"H",K85:"G",K82:"B",K75:"D",K81:"J",K78:"F",K88:"E",K80:"K"},
"BDEFGHIL":{K79:"E",K85:"G",K82:"B",K75:"D",K81:"H",K78:"F",K88:"L",K80:"I"},
"BDEFGHIK":{K79:"E",K85:"G",K82:"B",K75:"D",K81:"H",K78:"F",K88:"I",K80:"K"},
"BDEFGHIJ":{K79:"H",K85:"G",K82:"B",K75:"D",K81:"J",K78:"F",K88:"E",K80:"I"},
"ABDEFGIL":{K79:"E",K85:"G",K82:"B",K75:"D",K81:"A",K78:"F",K88:"L",K80:"I"},
"ABDEFGIK":{K79:"E",K85:"G",K82:"B",K75:"D",K81:"A",K78:"F",K88:"I",K80:"K"},
"ABDEFGIJ":{K79:"E",K85:"G",K82:"B",K75:"D",K81:"A",K78:"F",K88:"I",K80:"J"},
"ABCDEFGI":{K79:"C",K85:"G",K82:"B",K75:"D",K81:"A",K78:"F",K88:"E",K80:"I"},
};

function resolveThirdPlaceSlots(mr, kov, groupOverrides={}) {
  const allGroupsDone=Object.keys(GROUPS).every(g=>GM.filter(m=>m.g===g).every(m=>mr[m.id]!=null));
  // Get 3rd-place teams from completed groups only
  const confirmed3rds=get3rdPlaceTeams(mr,groupOverrides);
  if(confirmed3rds.length===0) return {};
  const confirmedGroups=confirmed3rds.map(t=>t.group);

  if(allGroupsDone) {
    // Full resolution: exact key lookup
    const top8=confirmed3rds.slice(0,8);
    const qualGroups=top8.map(t=>t.group).sort().join('');
    const mapping=FIFA_THIRD_PLACE_TABLE[qualGroups];
    if(!mapping) return {};
    const result={};
    Object.entries(mapping).forEach(([matchId,grp])=>{
      if(kov[matchId]?.b!=null) return;
      const team=top8.find(t=>t.group===grp)?.team||null;
      if(team) result[matchId]=team;
    });
    return result;
  }

  // Partial resolution: only place teams that are mathematically guaranteed in the top 8.
  // A team currently ranked r (1-indexed) among completed groups is guaranteed if:
  //   r + remainingGroups <= 8
  // because even if every remaining group produces a better 3rd-place team, they
  // can only be pushed down by that many positions.
  const completedGroupCount=Object.keys(GROUPS).filter(g=>GM.filter(m=>m.g===g).every(m=>mr[m.id]!=null)).length;
  const remainingGroups=Object.keys(GROUPS).length-completedGroupCount;
  const maxGuaranteedRank=8-remainingGroups;
  if(maxGuaranteedRank<1) return {};
  const guaranteedTeams=confirmed3rds.slice(0,maxGuaranteedRank);
  const guaranteedGroups=guaranteedTeams.map(t=>t.group);

  const matchingCombos=Object.entries(FIFA_THIRD_PLACE_TABLE).filter(([key])=>
    guaranteedGroups.every(g=>key.includes(g))
  );
  if(matchingCombos.length===0) return {};

  const slots=["K79","K85","K82","K75","K81","K78","K88","K80"];
  const result={};
  for(const slot of slots) {
    if(kov[slot]?.b!=null) continue; // host override takes priority
    const vals=[...new Set(matchingCombos.map(([,m])=>m[slot]))];
    if(vals.length===1) {
      // All remaining combos agree — place this team now
      const team=guaranteedTeams.find(t=>t.group===vals[0])?.team||null;
      if(team) result[slot]=team;
    }
  }
  return result;
}

function getMatchOutcome(r) {
  if (!r||r.home==null||r.away==null) return null;
  if (r.home>r.away) return "A"; if (r.away>r.home) return "B"; return "D";
}

// koResults can be legacy "A"/"B" string, or new {home,away,winner,pens} object — this normalises to the winner side
function koWinner(r) {
  if (!r) return null;
  if (typeof r === "string") return r;
  return r.winner || null;
}

function isInR32Bracket(team, bracket) {
  return KM.some(m=>m.round==="r32"&&bracket[m.id]&&(bracket[m.id].a===team||bracket[m.id].b===team));
}

function groupStandings(grp, res, override) {
  const s = Object.fromEntries(GROUPS[grp].map(t=>[t,{P:0,W:0,D:0,L:0,GF:0,GA:0,GD:0,Pts:0}]));
  const grpMatches = GM.filter(m=>m.g===grp);
  grpMatches.forEach(m=>{
    const r=res[m.id]; const out=getMatchOutcome(r); if(!out)return;
    const[a,b]=m.t; s[a].P++;s[b].P++;s[a].GF+=r.home;s[a].GA+=r.away;s[a].GD+=r.home-r.away;s[b].GF+=r.away;s[b].GA+=r.home;s[b].GD+=r.away-r.home;
    if(out==="A"){s[a].W++;s[a].Pts+=3;s[b].L++;}else if(out==="B"){s[b].W++;s[b].Pts+=3;s[a].L++;}else{s[a].D++;s[a].Pts++;s[b].D++;s[b].Pts++;}
  });
  // Host manual override (e.g. yellow cards / FIFA ranking tiebreaker the app can't calculate) takes priority,
  // but only while the snapshot of completed matches it was based on hasn't changed — a new result auto-clears it
  const completedCount=grpMatches.filter(m=>res[m.id]!=null).length;
  if(override&&Array.isArray(override.order)&&override.order.length===GROUPS[grp].length&&override.order.every(t=>GROUPS[grp].includes(t))&&override.matchesPlayedAtSet===completedCount){
    return override.order.map(t=>({team:t,...s[t]}));
  }
  // H2H mini-table among tied teams (FIFA tiebreaker: H2H pts → H2H GD → H2H GF, before overall GD/GF)
  const h2h=(a,b)=>{
    let aPts=0,bPts=0,aGD=0,bGD=0,aGF=0,bGF=0;
    grpMatches.forEach(m=>{
      const r=res[m.id]; if(!r||r.home==null||r.away==null) return;
      const[t1,t2]=m.t;
      if(t1===a&&t2===b){aGF+=r.home;bGF+=r.away;aGD+=(r.home-r.away);bGD+=(r.away-r.home);if(r.home>r.away)aPts+=3;else if(r.away>r.home)bPts+=3;else{aPts++;bPts++;}}
      else if(t1===b&&t2===a){aGF+=r.away;bGF+=r.home;aGD+=(r.away-r.home);bGD+=(r.home-r.away);if(r.away>r.home)aPts+=3;else if(r.home>r.away)bPts+=3;else{aPts++;bPts++;}}
    });
    return{aPts,bPts,aGD,bGD,aGF,bGF};
  };
  return GROUPS[grp].map(t=>({team:t,...s[t]})).sort((a,b)=>{
    if(b.Pts!==a.Pts)return b.Pts-a.Pts;
    const{aPts,bPts,aGD,bGD,aGF,bGF}=h2h(a.team,b.team);
    if(bPts!==aPts)return bPts-aPts;
    if(bGD!==aGD)return bGD-aGD;
    if(bGF!==aGF)return bGF-aGF;
    if(b.GD!==a.GD)return b.GD-a.GD;
    if(b.GF!==a.GF)return b.GF-a.GF;
    return a.team.localeCompare(b.team);
  });
}

function get3rdPlaceTeams(mr, overrides={}) {
  const out=[];
  Object.keys(GROUPS).forEach(g=>{
    if(!GM.filter(m=>m.g===g).every(m=>mr[m.id]!=null))return;
    const s=groupStandings(g,mr,overrides[g]); if(s[2])out.push({team:s[2].team,group:g,pts:s[2].Pts,gd:s[2].GD,gf:s[2].GF});
  });
  return out.sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf);
}

// Live version — shows CURRENT 3rd place from each group regardless of completeness,
// as long as that group has played at least one match. Used for the live tracking table.
function getLive3rdPlaceTeams(mr, overrides={}) {
  const out=[];
  Object.keys(GROUPS).forEach(g=>{
    const grpMatches=GM.filter(m=>m.g===g);
    const anyPlayed=grpMatches.some(m=>mr[m.id]!=null);
    if(!anyPlayed)return;
    const s=groupStandings(g,mr,overrides[g]);
    if(s[2])out.push({team:s[2].team,group:g,P:s[2].P,W:s[2].W,D:s[2].D,L:s[2].L,GF:s[2].GF,GA:s[2].GA,gd:s[2].GD,pts:s[2].Pts});
  });
  return out.sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.GF-a.GF);
}

function resolveKOBracket(mr, kr, kov, groupOverrides={}) {
  const st={}; Object.keys(GROUPS).forEach(g=>{st[g]=groupStandings(g,mr,groupOverrides[g]);});
  const a3=resolveThirdPlaceSlots(mr, kov, groupOverrides);
  const bk={};
  KM.forEach(m=>{
    const res=(slot,side)=>{
      const ov=kov[m.id]?.[side]; if(ov!==undefined)return ov;
      if(/^1st [A-L]$/.test(slot)){const g=slot[4];if(!GM.filter(m=>m.g===g).every(m=>mr[m.id]!=null))return null;return st[g]?.[0]?.team||null;}
      if(/^2nd [A-L]$/.test(slot)){const g=slot[4];if(!GM.filter(m=>m.g===g).every(m=>mr[m.id]!=null))return null;return st[g]?.[1]?.team||null;}
      if(/^Win M(\d+)$/.test(slot)){const n=parseInt(slot.replace("Win M",""));const km=KM.find(x=>x.n===n);if(!km)return null;const w=koWinner(kr[km.id]);if(!w)return null;return w==="A"?bk[km.id]?.a:bk[km.id]?.b;}
      if(/^Loss M(\d+)$/.test(slot)){const n=parseInt(slot.replace("Loss M",""));const km=KM.find(x=>x.n===n);if(!km)return null;const w=koWinner(kr[km.id]);if(!w)return null;return w==="A"?bk[km.id]?.b:bk[km.id]?.a;}
      if(side==="b"&&a3[m.id])return a3[m.id];
      return null;
    };
    bk[m.id]={a:res(m.sA,"a"),b:res(m.sB,"b")};
  });
  return bk;
}

// Returns the current stage label and status for a team
function getTeamStage(team, bracket, koResults, matchResults) {
  const ROUNDS=['r32','r16','qf','sf'];
  const LABELS={r32:'R32',r16:'R16',qf:'QF',sf:'SF'};
  for(const round of ROUNDS){
    const matches=KM.filter(m=>m.round===round);
    for(const m of matches){
      const bk=bracket?.[m.id];
      if(!bk)continue;
      if(bk.a!==team&&bk.b!==team)continue;
      const w=koWinner(koResults?.[m.id]);
      if(!w)return{stage:LABELS[round],eliminated:false};
      const won=(w==="A"&&bk.a===team)||(w==="B"&&bk.b===team);
      if(!won){
        if(round==='sf'){
          // Check if 3rd place match already has a result
          const third=KM.find(m=>m.round==="third");
          const thirdBk=bracket?.[third?.id];
          if(thirdBk&&(thirdBk.a===team||thirdBk.b===team)){
            const tw=koWinner(koResults?.[third.id]);
            if(tw){
              const twon=(tw==="A"&&thirdBk.a===team)||(tw==="B"&&thirdBk.b===team);
              return twon?{stage:"🥉 3RD",eliminated:false,finished:true}:{stage:"4TH",eliminated:true,finished:true};
            }
          }
          return{stage:'3v4',eliminated:false};
        }
        return{stage:LABELS[round],eliminated:true};
      }
    }
  }
  const third=KM.find(m=>m.round==="third");
  const final=KM.find(m=>m.round==="final");
  const thirdBk=bracket?.[third?.id];
  const finalBk=bracket?.[final?.id];
  if(thirdBk&&(thirdBk.a===team||thirdBk.b===team)){
    const w=koWinner(koResults?.[third.id]);
    if(!w)return{stage:"3RD",eliminated:false};
    const won=(w==="A"&&thirdBk.a===team)||(w==="B"&&thirdBk.b===team);
    return won?{stage:"🥉 3RD",eliminated:false,finished:true}:{stage:"4TH",eliminated:true,finished:true};
  }
  if(finalBk&&(finalBk.a===team||finalBk.b===team)){
    const w=koWinner(koResults?.[final.id]);
    if(!w)return{stage:"FINAL",eliminated:false};
    const won=(w==="A"&&finalBk.a===team)||(w==="B"&&finalBk.b===team);
    return won?{stage:"🥇 1ST",eliminated:false,finished:true}:{stage:"🥈 2ND",eliminated:false,finished:true};
  }
  // Not in KO bracket — check group stage elimination
  const grp=Object.entries(GROUPS).find(([,ts])=>ts.includes(team))?.[0];
  if(grp){
    const allPlayed=GM.filter(m=>m.g===grp).every(m=>matchResults?.[m.id]!=null);
    if(allPlayed){
      const s=groupStandings(grp,matchResults);
      const pos=s.findIndex(r=>r.team===team);
      if(pos===3){
        // 4th place — always eliminated
        return{stage:"GROUP",eliminated:true};
      }
      if(pos===2){
        // 3rd place — only eliminated once all R32 slots are filled and they're not in one
        const r32Matches=KM.filter(m=>m.round==="r32");
        const allR32Filled=r32Matches.every(m=>bracket?.[m.id]?.a&&bracket?.[m.id]?.b);
        if(allR32Filled&&!isInR32Bracket(team,bracket||{})){
          return{stage:"GROUP",eliminated:true};
        }
      }
    }
  }
  return{stage:null,eliminated:false};
}

function playerGSPts(pi, picks, mr) {
  const mine=new Set(picks.filter(p=>p.playerIdx===pi).map(p=>p.team));
  let pts=0;
  GM.forEach(m=>{const out=getMatchOutcome(mr[m.id]);if(!out)return;const[a,b]=m.t;if(mine.has(a)){if(out==="A")pts+=3;else if(out==="D")pts+=1;}if(mine.has(b)){if(out==="B")pts+=3;else if(out==="D")pts+=1;}});
  return pts;
}

function playerKOPts(pi, picks, bk, kr, kp) {
  const mine=new Set(picks.filter(p=>p.playerIdx===pi).map(p=>p.team));
  let pts=0;
  KM.forEach(m=>{const w=koWinner(kr[m.id]);if(!w)return;const b=bk[m.id];if(!b)return;const team=w==="A"?b.a:b.b;if(team&&mine.has(team))pts+=(kp[m.round]||0);});
  return pts;
}

function teamGSPts(team,mr){let pts=0;GM.filter(m=>m.t.includes(team)).forEach(m=>{const out=getMatchOutcome(mr[m.id]);if(!out)return;const h=m.t[0]===team;if(h&&out==="A")pts+=3;else if(!h&&out==="B")pts+=3;else if(out==="D")pts+=1;});return pts;}
function teamKOPts(team,bk,kr,kp){let pts=0;KM.forEach(m=>{const w=koWinner(kr[m.id]);if(!w)return;const b=bk[m.id];if(!b)return;const winTeam=w==="A"?b.a:b.b;if(winTeam===team)pts+=(kp[m.round]||0);});return pts;}
function isEliminated(team,bk,kr,mr,groupOverrides){
  // Eliminated in group stage: finished 4th in a completed group (and not in any R32 slot via override)
  if(mr){
    const grp=Object.entries(GROUPS).find(([,ts])=>ts.includes(team))?.[0];
    if(grp){
      const grpMatches=GM.filter(m=>m.g===grp);
      const allPlayed=grpMatches.every(m=>mr[m.id]!=null);
      if(allPlayed){
        const s=groupStandings(grp,mr,groupOverrides?.[grp]);
        const pos=s.findIndex(r=>r.team===team);
        // 4th place (pos===3) and not manually placed in bracket via override
        if(pos===3&&!isInR32Bracket(team,bk||{}))return true;
      }
    }
  }
  // Eliminated in KO stage: lost a match
  let inB=false;
  for(const m of KM){const b=bk?.[m.id];if(!b)continue;if(b.a===team||b.b===team)inB=true;const w=koWinner(kr[m.id]);if(!w)continue;const l=w==="A"?b.b:b.a;if(l===team)return true;}
  // Eliminated if not in bracket once all 32 R32 slots are fully filled (both sides of all 16 R32 matches)
  const r32Matches=KM.filter(m=>m.round==="r32");
  const allR32Filled=r32Matches.length>0&&r32Matches.every(m=>bk?.[m.id]?.a&&bk?.[m.id]?.b);
  if(allR32Filled&&!inB)return true;
  return false;
}

function generateAutoAssignment(draftOrder, teams) {
  const N=draftOrder.length; const picks=[]; const tr=Math.ceil(teams.length/N);
  for(let round=0;round<tr;round++){const tier=[...teams.slice(round*N,(round+1)*N)].sort(()=>Math.random()-0.5);const order=round%2===0?[...draftOrder]:[...draftOrder].reverse();order.forEach((pi,i)=>{if(tier[i])picks.push({team:tier[i].name,playerIdx:pi,pickNumber:picks.length});});}
  return picks;
}

function getCurrentPicker(n,order){const N=order.length,round=Math.floor(n/N),pos=n%N;return round%2===0?order[pos]:order[N-1-pos];}

let _audioCtx=null;
function getAudioCtx(){
  if(!_audioCtx){try{_audioCtx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){return null;}}
  return _audioCtx;
}
// Warm up the AudioContext on first user interaction so subsequent plays are instant
if(typeof window!=="undefined"){
  const warm=()=>{const ctx=getAudioCtx();if(ctx&&ctx.state==="suspended")ctx.resume();};
  ["touchstart","touchend","mousedown","keydown"].forEach(e=>window.addEventListener(e,warm,{once:false,passive:true}));
}
function playDrawAudio(type) {
  try {
    const ctx=getAudioCtx(); if(!ctx)return;
    const play=()=>{
      const t=ctx.currentTime;
      if(type==="drumroll"){for(let i=0;i<18;i++){const buf=ctx.createBuffer(1,Math.floor(ctx.sampleRate*0.025),ctx.sampleRate);const d=buf.getChannelData(0);for(let j=0;j<d.length;j++)d[j]=(Math.random()*2-1)*Math.exp(-j/(ctx.sampleRate*0.006));const src=ctx.createBufferSource();src.buffer=buf;const g=ctx.createGain();g.gain.value=0.1+i*0.007;src.connect(g);g.connect(ctx.destination);src.start(t+i*0.05);}const cb=ctx.createBuffer(1,Math.floor(ctx.sampleRate*1.1),ctx.sampleRate);const cd=cb.getChannelData(0);for(let i=0;i<cd.length;i++)cd[i]=(Math.random()*2-1)*0.04*Math.min(i/(ctx.sampleRate*0.2),1);const cn=ctx.createBufferSource();cn.buffer=cb;const cf=ctx.createBiquadFilter();cf.type="bandpass";cf.frequency.value=700;cf.Q.value=0.5;cn.connect(cf);cf.connect(ctx.destination);cn.start(t);}
      if(type==="fanfare"){[392,523,659,784,1047].forEach((f,i)=>{const o=ctx.createOscillator();const g=ctx.createGain();o.frequency.value=f;o.type="triangle";g.gain.setValueAtTime(0,t+i*0.08);g.gain.linearRampToValueAtTime(0.07,t+i*0.08+0.07);g.gain.exponentialRampToValueAtTime(0.001,t+i*0.08+2.2);o.connect(g);g.connect(ctx.destination);o.start(t+i*0.08);o.stop(t+i*0.08+2.5);});const cb=ctx.createBuffer(1,Math.floor(ctx.sampleRate*2.5),ctx.sampleRate);const cd=cb.getChannelData(0);for(let i=0;i<cd.length;i++){const sw=Math.min(i/(ctx.sampleRate*0.25),1)*Math.exp(-i/(ctx.sampleRate*1.6));cd[i]=(Math.random()*2-1)*sw;}const cs=ctx.createBufferSource();cs.buffer=cb;const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=1200;bp.Q.value=0.6;const cg=ctx.createGain();cg.gain.value=0.12;cs.connect(bp);bp.connect(cg);cg.connect(ctx.destination);cs.start(t);}
    };
    if(ctx.state==="suspended")ctx.resume().then(play);else play();
  }catch(e){}
}

const SL = ({children}) => <div style={{fontFamily:"'Bebas Neue'",fontSize:15,letterSpacing:2.5,color:"#5a6a8a",marginBottom:10,textTransform:"uppercase"}}>{children}</div>;

function Modal({open,onClose,title,children}) {
  if(!open)return null;
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(5,12,24,0.85)",backdropFilter:"blur(4px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"}}>
      <div onClick={e=>e.stopPropagation()} style={{maxWidth:560,width:"100%",background:"linear-gradient(165deg,#0f1e38,#0a1628)",borderRadius:18,border:"1px solid rgba(201,168,76,0.3)",padding:"28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:24,color:"var(--accent)",letterSpacing:3}}>{title}</div>
          <button onClick={onClose} style={{width:32,height:32,borderRadius:8,border:"1px solid #2a3a5c",background:"transparent",color:"#8899b4",fontSize:16,cursor:"pointer"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function OwnerChip({playerIdx,initials,size=18,playerName=""}) {
  const [show,setShow]=useState(false);
  useEffect(()=>{
    if(!show)return;
    const dismiss=()=>setShow(false);
    document.addEventListener("touchstart",dismiss,{once:true,passive:true});
    document.addEventListener("mousedown",dismiss,{once:true});
    return()=>{document.removeEventListener("touchstart",dismiss);document.removeEventListener("mousedown",dismiss);};
  },[show]);
  if(playerIdx==null)return null;
  const color=getPlayerColor(playerIdx,PC[playerIdx]);
  return(
    <div style={{position:"relative",flexShrink:0}} onClick={e=>{e.stopPropagation();setShow(o=>!o);}}>
      <div style={{width:size,height:size,borderRadius:4,background:color,color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:size-6,display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1,cursor:"pointer"}}>{initials[playerIdx]}</div>
      {show&&playerName&&(
        <div style={{position:"absolute",bottom:"calc(100% + 4px)",left:"50%",transform:"translateX(-50%)",background:"#0a1628",border:`1px solid ${color}`,borderRadius:8,padding:"4px 10px",whiteSpace:"nowrap",fontFamily:"'DM Sans'",fontSize:playerName.length>14?9:playerName.length>10?10:11,fontWeight:600,color,zIndex:200,boxShadow:"0 2px 8px rgba(0,0,0,0.5)"}}
          onClick={e=>e.stopPropagation()}>
          {playerName}
        </div>
      )}
    </div>
  );
}

const RULES_DATA = [
  {n:"1",title:"The Goal",body:"Draft a roster of World Cup teams. Score points based on how your teams perform. Highest total takes the pot."},
  {n:"2",title:"The Draft",body:"Take turns picking teams in a snake draft — direction reverses each round. Everyone ends up with the same number of teams (48 ÷ players)."},
  {n:"3",title:"Group Stage",body:"Your teams play 3 group games each. You earn 3 pts per win, 1 pt per draw. Losses = 0."},
  {n:"4",title:"Knockout Stage",body:"Bonus points every time one of your teams wins a KO match. Stakes rise each round: R32=4, R16=6, QF=8, SF=10, 3rd Place=6, Final=12."},
  {n:"5",title:"Winning",body:"Highest TOTAL (Group + Knockout) takes the pot. Tiebreaks: most teams in Round of 32 → goal difference → goals scored → Head to head record → draft order."},
];

function RulesList() {
  const lang=useContext(LangContext);
  const rules=[1,2,3,4,5].map(n=>({n:String(n),title:t(lang,`rulesTitle${n}`),body:t(lang,`rulesBody${n}`)}));
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {rules.map(r=>(
        <div key={r.n} style={{display:"flex",gap:12}}>
          <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,background:"rgba(201,168,76,0.15)",color:"var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Bebas Neue'",fontSize:16}}>{r.n}</div>
          <div><div style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:600,color:"#e0dcd4",marginBottom:2}}>{r.title}</div><div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",lineHeight:1.55}}>{r.body}</div></div>
        </div>
      ))}
    </div>
  );
}

function SyncModal({open,onClose,st,poolCode,setPoolCode}) {
  const [status,setStatus]=useState("idle"); // idle | choosing | saving | done | error
  const [customCode,setCustomCode]=useState("");
  const [password,setPassword]=useState("");
  const [showPw,setShowPw]=useState(false);
  const [copied,setCopied]=useState(false);

  // Load saved password from localStorage
  const [savedPw,setSavedPw]=useState(()=>{try{return window.localStorage?.getItem("mundi_host_pw")||"";}catch(e){return "";}});

  useEffect(()=>{
    if(open){
      if(poolCode&&savedPw){
        doSave(poolCode, savedPw);
      } else {
        setStatus("choosing");
      }
    }
  },[open]);

  const doSave=async(code, pw)=>{
    setStatus("saving");
    const ok=await savePool(code, st, pw||undefined);
    if(ok){
      setPoolCode(code);
      try{window.localStorage?.setItem("mundi_pool_code",code);}catch(e){}
      setStatus("done");
    } else {
      setStatus("error");
    }
  };

  const handleChoose=()=>{
    const code=customCode.trim().toUpperCase();
    if(code.length<2)return;
    if(!password.trim())return;
    try{window.localStorage?.setItem("mundi_host_pw",password.trim());}catch(e){}
    setSavedPw(password.trim());
    doSave(code, password.trim());
  };

  if(!open)return null;
  return(
    <Modal open={open} onClose={()=>{setStatus("idle");setCustomCode("");setPassword("");onClose();}} title="SHARE UPDATE">
      {status==="choosing"&&(
        <>
          <div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",marginBottom:16,lineHeight:1.6}}>
            Set a code and password for your pool. Your family uses the code to load scores. The password lets you switch to host mode on any device.
          </div>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:11,letterSpacing:2,color:"#5a6a8a",marginBottom:6}}>POOL CODE (2–6 CHARACTERS)</div>
          <input
            value={customCode}
            onChange={e=>setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6))}
            placeholder="e.g. CS26"
            maxLength={6}
            style={{width:"100%",padding:"14px",borderRadius:10,border:"1.5px solid #2a3a5c",background:"rgba(10,22,40,0.7)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:32,letterSpacing:8,outline:"none",boxSizing:"border-box",textAlign:"center",marginBottom:14}}
          />
          <div style={{fontFamily:"'Bebas Neue'",fontSize:11,letterSpacing:2,color:"#5a6a8a",marginBottom:6}}>HOST PASSWORD</div>
          <div style={{position:"relative",marginBottom:16}}>
            <input
              type={showPw?"text":"password"}
              value={password}
              onChange={e=>setPassword(e.target.value)}
              placeholder="Choose a password"
              style={{width:"100%",padding:"12px 44px 12px 14px",borderRadius:10,border:"1.5px solid #2a3a5c",background:"rgba(10,22,40,0.7)",color:"#e0dcd4",fontFamily:"'DM Sans'",fontSize:15,outline:"none",boxSizing:"border-box"}}
            />
            <button onClick={()=>setShowPw(s=>!s)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",color:"#5a6a8a",cursor:"pointer",fontSize:16}}>{showPw?"🙈":"👁"}</button>
          </div>
          <button onClick={handleChoose} disabled={customCode.trim().length<2||!password.trim()} style={{width:"100%",padding:"14px 0",borderRadius:10,border:"none",background:customCode.trim().length>=2&&password.trim()?"linear-gradient(135deg,var(--accent),var(--accent-dark))":"rgba(26,39,68,0.5)",color:customCode.trim().length>=2&&password.trim()?"#0a1628":"#3d5070",fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:3,cursor:customCode.trim().length>=2&&password.trim()?"pointer":"default"}}>
            SAVE & SHARE →
          </button>
        </>
      )}
      {status==="saving"&&(
        <div style={{textAlign:"center",padding:"24px 0",fontFamily:"'Bebas Neue'",fontSize:18,color:"var(--accent)",letterSpacing:2}}>Saving…</div>
      )}
      {status==="done"&&poolCode&&(
        <>
          <div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",marginBottom:16,lineHeight:1.6}}>
            Send this code to your group. They go to <strong style={{color:"var(--accent)"}}>elmundialito.github.io/2026</strong>, tap <strong style={{color:"#6b9bd1"}}>📥 Load update</strong> and type it in. <strong style={{color:"#e0dcd4"}}>Same code every time.</strong>
          </div>
          <div style={{textAlign:"center",padding:"20px 0",fontFamily:"'Bebas Neue'",fontSize:56,color:"var(--accent)",letterSpacing:12,background:"rgba(201,168,76,0.08)",borderRadius:14,border:"2px solid rgba(201,168,76,0.3)",marginBottom:16}}>
            {poolCode}
          </div>
          <button onClick={()=>{navigator.clipboard?.writeText(poolCode);setCopied(true);setTimeout(()=>setCopied(false),2000);}} style={{width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:"linear-gradient(135deg,var(--accent),var(--accent-dark))",color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,cursor:"pointer",marginBottom:8}}>
            {copied?"✓ COPIED!":"📋 COPY CODE"}
          </button>
          <button onClick={()=>{try{window.localStorage?.removeItem("mundi_pool_code");window.localStorage?.removeItem("mundi_host_pw");}catch(e){}setPoolCode(null);setCustomCode("");setPassword("");setSavedPw("");setStatus("choosing");}} style={{width:"100%",padding:"9px 0",borderRadius:10,border:"1px solid #2a3a5c",background:"transparent",color:"#5a6a8a",fontFamily:"'DM Sans'",fontSize:12,cursor:"pointer"}}>
            Change code / password
          </button>
        </>
      )}
      {status==="error"&&(
        <>
          <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#d97757",marginBottom:16}}>Something went wrong. Check your connection and try again.</div>
          <button onClick={()=>doSave(poolCode||customCode.trim().toUpperCase(), savedPw||password.trim())} style={{width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:"#d97757",color:"white",fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,cursor:"pointer"}}>TRY AGAIN</button>
        </>
      )}
    </Modal>
  );
}


function LoadModal({open,onClose,onLoad,onHostLoad}) {
  const [val,setVal]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  if(!open)return null;

  const doLoad=async()=>{
    const code=val.trim().toUpperCase();
    if(!code)return;
    setLoading(true);setErr("");
    const data=await loadPool(code);
    setLoading(false);
    if(!data){setErr("Code not found — check it and try again.");return;}
    const e=onLoad(data, code);
    if(e){setErr(e);return;}
    setVal("");setErr("");onClose();
  };

  return(
    <Modal open={open} onClose={onClose} title="LOAD UPDATE">
      <div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",marginBottom:16,lineHeight:1.6}}>
        Enter your pool code to load the latest scores.
      </div>
      <input
        value={val}
        onChange={e=>{setVal(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6));setErr("");}}
        placeholder="e.g. CS26"
        maxLength={6}
        style={{width:"100%",padding:"16px",borderRadius:10,border:err?"1.5px solid #d97757":"1.5px solid #2a3a5c",background:"rgba(10,22,40,0.7)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:36,letterSpacing:8,outline:"none",boxSizing:"border-box",textAlign:"center",marginBottom:err?6:16}}
      />
      {err&&<div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#d97757",marginBottom:12}}>{err}</div>}
      <button onClick={doLoad} disabled={val.trim().length<2||loading} style={{width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:val.trim().length>=2?"linear-gradient(135deg,var(--accent),var(--accent-dark))":"rgba(26,39,68,0.5)",color:val.trim().length>=2?"#0a1628":"#3d5070",fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,cursor:val.trim().length>=2?"pointer":"default",marginBottom:8}}>
        {loading?"LOADING…":"LOAD UPDATE"}
      </button>
      <button onClick={onClose} style={{width:"100%",padding:"10px 0",borderRadius:10,border:"1px solid #2a3a5c",background:"transparent",color:"#8899b4",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer"}}>Cancel</button>
    </Modal>
  );
}

function StadiumSpin({playerNames,onComplete,onBack,replayOrder}) {
  const N=playerNames.length;
  const [remaining,setRemaining]=useState(playerNames.map((_,i)=>i));
  const [results,setResults]=useState([]);
  const [rotation,setRotation]=useState(0);
  const [spinning,setSpinning]=useState(false);
  const [justWon,setJustWon]=useState(null);
  const allDone=results.length===N;

  useEffect(()=>{if(remaining.length===1&&results.length===N-1&&!spinning){setTimeout(()=>{setResults(r=>[...r,remaining[0]]);setRemaining([]);},800);}},[remaining,results,N,spinning]);
  useEffect(()=>{if(!replayOrder||spinning||allDone||remaining.length<=1)return;const next=replayOrder[results.length];if(next===undefined||!remaining.includes(next))return;const t=setTimeout(()=>spin(next),results.length===0?700:1300);return()=>clearTimeout(t);},[replayOrder,spinning,results.length,allDone,remaining.length]);
  useEffect(()=>{if(!replayOrder||!allDone)return;const t=setTimeout(()=>onComplete(replayOrder),1600);return()=>clearTimeout(t);},[replayOrder,allDone]);

  const spin=(forced)=>{
    if(spinning||remaining.length<=1)return;
    const wi=forced!==undefined?remaining.indexOf(forced):Math.floor(Math.random()*remaining.length);
    if(wi<0)return;
    const wp=remaining[wi];const wd=360/remaining.length;const wc=wd*wi+wd/2;
    const fr=rotation+360*5+((360-wc)-(rotation%360)+360)%360;
    setSpinning(true);setRotation(fr);
    setTimeout(()=>{setResults(r=>[...r,wp]);setJustWon(wp);setTimeout(()=>{setRemaining(r=>r.filter((_,i)=>i!==wi));setJustWon(null);setSpinning(false);},1000);},3000);
  };

  const cx=130,cy=130,r=110,wd=remaining.length>0?360/remaining.length:360;
  const wpath=i=>{const sa=(wd*i-90)*Math.PI/180,ea=(wd*(i+1)-90)*Math.PI/180,x1=cx+r*Math.cos(sa),y1=cy+r*Math.sin(sa),x2=cx+r*Math.cos(ea),y2=cy+r*Math.sin(ea);return`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${wd>180?1:0} 1 ${x2} ${y2} Z`;};
  const lpos=i=>({x:cx+r*0.65*Math.cos((wd*i+wd/2-90)*Math.PI/180),y:cy+r*0.65*Math.sin((wd*i+wd/2-90)*Math.PI/180)});

  return(
    <div style={{maxWidth:720,margin:"0 auto",padding:"0 16px",textAlign:"center"}}>
      <style>{`@keyframes spinPop{0%{transform:scale(0.6);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>
      <div style={{fontFamily:"'Bebas Neue'",fontSize:28,color:"var(--accent)",letterSpacing:4,marginBottom:4}}>DRAFT ORDER</div>
      <div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",marginBottom:18}}>{!allDone?`Spin to land on pick #${results.length+1}`:"Order locked — continue below"}</div>
      <div style={{position:"relative",width:280,height:290,margin:"0 auto 18px"}}>
        <div style={{position:"absolute",left:"50%",top:-2,transform:"translateX(-50%)",width:0,height:0,zIndex:2,borderLeft:"12px solid transparent",borderRight:"12px solid transparent",borderTop:"20px solid var(--accent)"}}/>
        <svg width="260" height="260" viewBox="0 0 260 260" style={{position:"absolute",top:10,left:10,transform:`rotate(${rotation}deg)`,transition:spinning?"transform 3s cubic-bezier(0.16,1,0.3,1)":"none"}}>
          <circle cx={cx} cy={cy} r={r+8} fill="#0a1628" stroke="var(--accent)" strokeWidth="2"/>
          {remaining.map((pi,i)=>{const pos=lpos(i);const label=nameToInitial(playerNames[pi]||"");return(<g key={pi}><path d={wpath(i)} fill={PC[pi]} stroke="#0a1628" strokeWidth="2"/><text x={pos.x} y={pos.y} fill="#0a1628" fontFamily="'Bebas Neue'" fontSize={N>4?12:14} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${wd*i+wd/2} ${pos.x} ${pos.y})`}>{label}</text></g>);})}
          <circle cx={cx} cy={cy} r="22" fill="#0a1628" stroke="var(--accent)" strokeWidth="2"/>
          <circle cx={cx} cy={cy} r="8" fill="var(--accent)"/>
        </svg>
      </div>
      {justWon!==null&&<div style={{fontFamily:"'Bebas Neue'",fontSize:20,color:PC[justWon],letterSpacing:2,marginBottom:12,animation:"spinPop 0.4s ease-out"}}>{results.length}. {(playerNames[justWon]||"").toUpperCase()}</div>}
      {!replayOrder&&!allDone&&<button onClick={()=>spin(undefined)} disabled={spinning||remaining.length<=1} style={{padding:"12px 32px",borderRadius:10,border:"none",background:spinning||remaining.length<=1?"rgba(26,39,68,0.5)":"linear-gradient(135deg,var(--accent),var(--accent-dark))",color:spinning||remaining.length<=1?"#3d5070":"#0a1628",fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:3,cursor:spinning||remaining.length<=1?"default":"pointer",marginBottom:16}}>{spinning?"SPINNING…":`SPIN #${results.length+1}`}</button>}
      {replayOrder&&!allDone&&<div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#5a6a8a",fontStyle:"italic",marginBottom:16}}>Replaying draw #{results.length+1} of {N}…</div>}
      {results.length>0&&<div style={{display:"flex",justifyContent:"center",gap:6,flexWrap:"wrap",marginBottom:14}}>{results.map((pi,slot)=>(<div key={slot} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:20,background:`${PC[pi]}22`,border:`1px solid ${PC[pi]}66`}}><span style={{fontFamily:"'Bebas Neue'",fontSize:12,color:PC[pi],letterSpacing:1}}>{slot+1}</span><span style={{fontFamily:"'DM Sans'",fontSize:12,fontWeight:600,color:PC[pi]}}>{playerNames[pi]}</span></div>))}</div>}
      <div style={{display:"flex",gap:8,justifyContent:"center"}}>
        {!replayOrder&&<button onClick={onBack} style={{padding:"9px 18px",borderRadius:8,border:"1px solid #2a3a5c",background:"transparent",color:"#5a6a8a",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer"}}>← Back</button>}
        {replayOrder&&<button onClick={()=>onComplete(replayOrder)} style={{padding:"9px 18px",borderRadius:8,border:"1px solid #2a3a5c",background:"transparent",color:"#5a6a8a",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer"}}>SKIP →</button>}
        {allDone&&!replayOrder&&<button onClick={()=>onComplete(results)} style={{padding:"9px 24px",borderRadius:8,border:"none",background:"linear-gradient(135deg,var(--accent),var(--accent-dark))",color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:15,letterSpacing:2,cursor:"pointer"}}>ORDER SET →</button>}
      </div>
    </div>
  );
}

function SorteoScene({armOut,armRaised,animating,ballPositions,nextPlayerName,nextPlayerColor,remaining}) {
  const ws={transformOrigin:"430px 238px",animation:animating?"bowlWob 0.55s ease-in-out":"none"};
  return(
    <svg viewBox="0 0 620 340" style={{width:"100%",display:"block",background:"#05101e"}}>
      <defs><radialGradient id="pg" cx="50%" cy="100%" r="55%"><stop offset="0%" stopColor="#0d3a1a" stopOpacity="0.8"/><stop offset="100%" stopColor="#05101e" stopOpacity="0"/></radialGradient></defs>
      {[{r:310,op:0.5,sw:28},{r:268,op:0.4,sw:22},{r:226,op:0.32,sw:18},{r:184,op:0.25,sw:14}].map((t,i)=>(<ellipse key={i} cx="310" cy="390" rx={t.r} ry={t.r*0.38} fill="none" stroke={`rgba(90,130,210,${t.op})`} strokeWidth={t.sw}/>))}
      <rect x="0" y="290" width="620" height="50" fill="url(#pg)"/>
      <rect x="50" y="308" width="520" height="28" rx="5" fill="rgba(18,85,18,0.45)" stroke="rgba(60,160,60,0.3)" strokeWidth="1.5"/>
      <rect x="155" y="12" width="310" height="52" rx="8" fill={nextPlayerName?`${nextPlayerColor||"#c9a84c"}22`:"rgba(201,168,76,0.12)"} stroke={nextPlayerName?(nextPlayerColor||"#c9a84c"):"var(--accent)"} strokeWidth="1.5"/>
      {nextPlayerName?(<><text x="310" y="30" textAnchor="middle" fill={`${nextPlayerColor||"#c9a84c"}99`} fontFamily="'DM Sans'" fontSize="9" letterSpacing="3">NOW DRAWING FOR</text><text x="310" y="53" textAnchor="middle" fill={nextPlayerColor||"#c9a84c"} fontFamily="'Bebas Neue'" fontSize="22" letterSpacing="2">{(nextPlayerName||"").toUpperCase()}</text></>):(<><text x="310" y="32" textAnchor="middle" fill="var(--accent)" fontFamily="'Bebas Neue'" fontSize="16" letterSpacing="5">SORTEO OFICIAL</text><text x="310" y="53" textAnchor="middle" fill="var(--accent)" fontFamily="'DM Sans'" fontSize="10" letterSpacing="3">MUNDIALITO 2026</text></>)}
      <rect x="141" y="220" width="17" height="74" rx="8.5" fill="#1a2f5c" transform="rotate(4,149,220)"/>
      <ellipse cx="150" cy="296" rx="13" ry="11" fill="#f0b896" transform="rotate(4,150,296)"/>
      <rect x="150" y="312" width="24" height="20" rx="5" fill="#152548"/><rect x="178" y="312" width="24" height="20" rx="5" fill="#152548"/>
      <rect x="146" y="326" width="32" height="10" rx="5" fill="#0a0f1a"/><rect x="176" y="326" width="32" height="10" rx="5" fill="#0a0f1a"/>
      <rect x="147" y="210" width="76" height="108" rx="10" fill="#1a2f5c"/>
      <polygon points="185,215 200,215 203,255 183,255" fill="white"/>
      <polygon points="191,218 198,218 194,262" fill="var(--accent)"/>
      <polygon points="185,215 168,229 183,255 185,240" fill="#152548"/>
      <polygon points="200,215 217,229 203,255 200,240" fill="#152548"/>
      {[262,272,282].map(y=><circle key={y} cx="193" cy={y} r="2.5" fill="#2a3a5c"/>)}
      <rect x="156" y="228" width="22" height="14" rx="3" fill="var(--accent)" opacity="0.9"/><text x="167" y="239" textAnchor="middle" fill="#0a1628" fontFamily="'Bebas Neue'" fontSize="8">FIFA</text>
      <g style={ws}><ellipse cx="430" cy="200" rx="100" ry="22" fill="rgba(140,200,255,0.07)" stroke="rgba(140,200,255,0.32)" strokeWidth="2"/></g>
      <g style={ws}>{[0,1,2].map(ri=>ballPositions.filter(b=>b.ri===ri).map((b,i)=>{const t=TBN[b.team];const clr=PC[b.pi];return(<g key={`${ri}-${i}`}><circle cx={b.cx+2} cy={b.cy+3} r={b.r} fill="rgba(0,0,0,0.4)"/><circle cx={b.cx} cy={b.cy} r={b.r} fill={clr}/><circle cx={b.cx-b.r*0.28} cy={b.cy-b.r*0.28} r={b.r*0.4} fill="rgba(255,255,255,0.3)"/><text x={b.cx} y={b.cy+b.r*0.38} textAnchor="middle" dominantBaseline="middle" fontSize={b.r*1.5}>{t?.flag||"⚽"}</text></g>);}))}</g>
      <g style={{transformOrigin:"210px 212px",transform:armOut?(armRaised?"rotate(-2deg)":"rotate(15deg)"):"rotate(-6deg)",transition:"transform 0.5s cubic-bezier(0.34,1.56,0.64,1)"}}>
        <rect x="210" y="205" width="80" height="18" rx="9" fill="#1a2f5c"/>
        <circle cx="290" cy="214" r="10" fill="#1a2f5c"/>
        <rect x="286" y="207" width="78" height="14" rx="7" fill="#1a2f5c"/>
        <ellipse cx="366" cy="214" rx="18" ry="13" fill="#f0b896"/>
        <path d="M 360 206 Q 375 202 378 211" fill="none" stroke="#e0a07a" strokeWidth="2.5" strokeLinecap="round"/>
      </g>
      <g style={ws}>
        <rect x="330" y="200" width="200" height="82" fill="rgba(140,200,255,0.04)"/>
        <line x1="330" y1="200" x2="330" y2="282" stroke="rgba(140,200,255,0.2)" strokeWidth="1.5"/>
        <line x1="530" y1="200" x2="530" y2="282" stroke="rgba(140,200,255,0.2)" strokeWidth="1.5"/>
        <ellipse cx="430" cy="282" rx="100" ry="22" fill="rgba(140,200,255,0.14)" stroke="rgba(140,200,255,0.38)" strokeWidth="2.5"/>
        <rect x="405" y="282" width="50" height="14" rx="5" fill="#3a4a6a"/>
        <ellipse cx="430" cy="296" rx="60" ry="10" fill="#2a3a5c"/>
      </g>
      <ellipse cx="185" cy="162" rx="44" ry="48" fill="#f0b896"/>
      <ellipse cx="141" cy="169" rx="13" ry="17" fill="#f0b896"/><ellipse cx="144" cy="169" rx="7" ry="11" fill="#e0a07a"/>
      <ellipse cx="229" cy="169" rx="13" ry="17" fill="#f0b896"/><ellipse cx="226" cy="169" rx="7" ry="11" fill="#e0a07a"/>
      <ellipse cx="171" cy="136" rx="16" ry="9" fill="rgba(255,255,255,0.24)" transform="rotate(-25,171,136)"/>
      <path d="M 164 154 Q 175 148 186 154" fill="none" stroke="#5a3010" strokeWidth="4" strokeLinecap="round"/>
      <path d="M 184 154 Q 195 148 206 154" fill="none" stroke="#5a3010" strokeWidth="4" strokeLinecap="round"/>
      <ellipse cx="175" cy="163" rx="8" ry="7" fill="white"/><ellipse cx="195" cy="163" rx="8" ry="7" fill="white"/>
      <circle cx="177" cy="164" r="4.5" fill="#3a2010"/><circle cx="197" cy="164" r="4.5" fill="#3a2010"/>
      <circle cx="178.5" cy="162" r="1.5" fill="white"/><circle cx="198.5" cy="162" r="1.5" fill="white"/>
      <ellipse cx="158" cy="176" rx="12" ry="8" fill="rgba(220,80,60,0.22)"/><ellipse cx="212" cy="176" rx="12" ry="8" fill="rgba(220,80,60,0.22)"/>
      <ellipse cx="185" cy="179" rx="10" ry="8" fill="#e0a07a"/>
      <circle cx="179" cy="181" r="3.5" fill="#d07858" opacity="0.6"/><circle cx="191" cy="181" r="3.5" fill="#d07858" opacity="0.6"/>
      <path d={armOut?"M 164 191 Q 185 216 206 191":"M 166 193 Q 185 214 204 193"} fill="white" stroke="#b87060" strokeWidth="2"/>
      <path d={armOut?"M 164 191 Q 185 206 206 191":"M 166 193 Q 185 207 204 193"} fill="#b87060"/>
      <rect x={armOut?"167":"169"} y="191" width={armOut?"36":"32"} height="9" rx="3" fill="white"/>
      {(armOut?[175,184,193,202,211]:[177,185,193,201]).map(x=><line key={x} x1={x} y1="191" x2={x} y2="200" stroke="#ddd" strokeWidth="1"/>)}
      <text x="310" y="336" textAnchor="middle" fill="#5a6a8a" fontFamily="'DM Sans'" fontSize="10" letterSpacing="1">{remaining>0?`${remaining} REMAINING`:"ALL ASSIGNED ✓"}</text>
    </svg>
  );
}

function AutoReveal({config,draftOrder,initials,onComplete,onSkip,precomputedPicks,autoStart}) {
  const assignment=useMemo(()=>precomputedPicks||generateAutoAssignment(draftOrder||[],TEAMS),[draftOrder,precomputedPicks]);
  const [rc,setRc]=useState(0);
  const [animating,setAnimating]=useState(false);
  const [currentPick,setCurrentPick]=useState(null);
  const [armOut,setArmOut]=useState(false);
  const [armRaised,setArmRaised]=useState(false);
  const [autoPlay,setAutoPlay]=useState(!!autoStart);
  const [speed,setSpeed]=useState(1);
  const speedRef=useRef(1);
  const done=rc>=assignment.length;
  const remaining=assignment.length-rc;

  const doReveal=()=>{
    if(animating||done)return;
    const pick=assignment[rc];
    setAnimating(true);setArmOut(true);playDrawAudio("drumroll");
    const m=speedRef.current;
    setTimeout(()=>setArmRaised(true),Math.round(1400/m));
    setTimeout(()=>{playDrawAudio("fanfare");setCurrentPick(pick);},Math.round(1650/m));
    setTimeout(()=>{setRc(c=>c+1);setCurrentPick(null);setArmOut(false);setArmRaised(false);setAnimating(false);},Math.round(5650/m));
  };

  useEffect(()=>{if(!autoPlay||animating||done)return;const t=setTimeout(doReveal,rc===0?500:600);return()=>clearTimeout(t);},[autoPlay,animating,rc,done]);
  useEffect(()=>{if(rc===config.playerCount&&speed===1){speedRef.current=2;setSpeed(2);}},[rc]);

  const rosters=useMemo(()=>{const r=Array.from({length:config.playerCount},()=>[]);assignment.slice(0,rc).forEach(p=>{if(p.playerIdx!=null)r[p.playerIdx].push(p.team);});return r;},[rc,assignment,config.playerCount]);
  const nextPick=!done?assignment[rc]:null;
  const queue=assignment.slice(rc+(currentPick?1:0),rc+(currentPick?1:0)+19);
  const ROWS=[{y:212,count:6,r:10,startX:360,spacing:28},{y:234,count:7,r:13,startX:355,spacing:25},{y:258,count:6,r:15,startX:360,spacing:28}];
  let qi=0;const bp=[];
  ROWS.forEach((row,ri)=>{for(let i=0;i<row.count&&qi<queue.length;i++,qi++){bp.push({cx:row.startX+i*row.spacing,cy:row.y,r:row.r,ri,pi:queue[qi].playerIdx,team:queue[qi].team});}});

  return(
    <div style={{maxWidth:720,margin:"0 auto",padding:"0 16px",textAlign:"center"}}>
      <style>{`@keyframes bowlWob{0%,100%{transform:rotate(0)}18%{transform:rotate(-5deg)}48%{transform:rotate(5deg)}74%{transform:rotate(-2.5deg)}90%{transform:rotate(1deg)}}@keyframes revealSlide{0%{opacity:0;transform:translateY(-8px)}100%{opacity:1;transform:translateY(0)}}@keyframes rosterIn{0%{opacity:0;transform:scale(0)}100%{opacity:1;transform:scale(1)}}`}</style>
      <div style={{position:"relative",borderRadius:16,overflow:"hidden",border:"1px solid #2a3a5c",marginBottom:8}}>
        {speed<3&&rc>0&&<div style={{position:"absolute",top:8,right:8,zIndex:20}}><button onClick={()=>{const s=speed===1?2:3;speedRef.current=s;setSpeed(s);}} style={{padding:"4px 10px",borderRadius:8,border:"1px solid var(--accent)",background:"rgba(5,16,30,0.85)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:13,cursor:"pointer"}}>⚡ {speed===1?"2×":"3×"}</button></div>}
        <SorteoScene armOut={armOut} armRaised={armRaised} animating={animating} ballPositions={bp} remaining={remaining} nextPlayerName={nextPick?config.playerNames[nextPick.playerIdx]:null} nextPlayerColor={nextPick?PC[nextPick.playerIdx]:null}/>
      </div>

      <div style={{height:62,marginBottom:8,display:"flex",alignItems:"center"}}>
        {currentPick?(
          <div style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:`${PC[currentPick.playerIdx]}18`,border:`1.5px solid ${PC[currentPick.playerIdx]}99`,borderRadius:12,animation:"revealSlide 0.3s ease-out"}}>
            <span style={{fontSize:30,lineHeight:1,flexShrink:0}}>{TBN[currentPick.team]?.flag}</span>
            <div style={{flex:1,minWidth:0,textAlign:"left"}}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:20,color:PC[currentPick.playerIdx],letterSpacing:1.5,lineHeight:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentPick.team}</div>
              <div style={{fontFamily:"'DM Sans'",fontSize:11,color:`${PC[currentPick.playerIdx]}aa`,marginTop:2}}>→ {config.playerNames[currentPick.playerIdx]}</div>
            </div>
            <div style={{width:34,height:34,borderRadius:8,background:PC[currentPick.playerIdx],color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{initials[currentPick.playerIdx]}</div>
          </div>
        ):(
          <div style={{width:"100%",height:50,borderRadius:12,border:"1px dashed #1e2f50",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#3d5070",fontStyle:"italic"}}>{done?"All teams assigned ✓":"Waiting for next draw…"}</span>
          </div>
        )}
      </div>

      <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:14}}>
        {!done?(<>
          <button onClick={doReveal} disabled={animating} style={{padding:"12px 28px",borderRadius:10,border:"none",background:animating?"rgba(26,39,68,0.5)":"linear-gradient(135deg,var(--accent),var(--accent-dark))",color:animating?"#3d5070":"#0a1628",fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,cursor:animating?"default":"pointer"}}>{animating?"DRAWING…":`DRAW PICK #${rc+1} OF ${assignment.length}`}</button>
          <button onClick={()=>setAutoPlay(a=>!a)} style={{padding:"12px 16px",borderRadius:10,border:`1px solid ${autoPlay?"var(--accent)":"#2a3a5c"}`,background:autoPlay?"rgba(201,168,76,0.1)":"transparent",color:autoPlay?"var(--accent)":"#5a6a8a",fontFamily:"'DM Sans'",fontSize:12,fontWeight:600,cursor:"pointer"}}>{autoPlay?"⏸ Pause":"▶ Auto"}</button>
        </>):(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,width:"100%"}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:"var(--accent)",letterSpacing:3}}>✓ SORTEO COMPLETE</div>
          <button onClick={()=>onComplete(assignment)} style={{padding:"14px 40px",borderRadius:12,border:"none",background:"linear-gradient(135deg,var(--accent),var(--accent-dark))",color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:3,cursor:"pointer"}}>🏆 LOCK IN TEAMS →</button>
        </div>)}
      </div>
      {!done&&<button onClick={onSkip||onComplete} style={{width:"100%",marginTop:6,padding:"11px 0",borderRadius:10,border:"1px solid #2a3a5c",background:"transparent",color:"#5a6a8a",fontFamily:"'Bebas Neue'",fontSize:15,letterSpacing:2,cursor:"pointer"}}>SKIP → GO TO GROUP STAGE</button>}
      <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(config.playerCount,3)},1fr)`,gap:10}}>
        {rosters.map((teams,i)=>(
          <div key={i} style={{background:`${getPlayerColor(i,PC[i])}10`,border:`1px solid ${PC[i]}33`,borderRadius:10,padding:"10px 12px"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <div style={{width:20,height:20,borderRadius:5,background:getPlayerColor(i,PC[i]),color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>{initials[i]}</div>
              <span style={{fontFamily:"'DM Sans'",fontSize:12,fontWeight:600,color:getPlayerColor(i,PC[i])}}>{config.playerNames[i]}</span>
              <span style={{fontFamily:"'Bebas Neue'",fontSize:10,color:`${PC[i]}77`,marginLeft:"auto"}}>{teams.length}/{Math.round(48/config.playerCount)}</span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:3}}>{teams.map(tn=><span key={tn} style={{fontSize:15,animation:"rosterIn 0.3s ease-out"}} title={tn}>{TBN[tn]?.flag}</span>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DraftReplay({config,picks,draftOrder,initials,onClose}) {
  const [phase,setPhase]=useState(draftOrder&&draftOrder.length>0?"order":"teams");
  return(
    <div style={{maxWidth:720,margin:"0 auto",padding:"0 16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:20,color:"var(--accent)",letterSpacing:3}}>🎬 {phase==="order"?"DRAW ORDER":"SORTEO REPLAY"}</div>
        <button onClick={onClose} style={{padding:"5px 12px",borderRadius:8,border:"1px solid #2a3a5c",background:"transparent",color:"#5a6a8a",fontFamily:"'DM Sans'",fontSize:12,cursor:"pointer"}}>✕ Close</button>
      </div>
      {phase==="order"&&draftOrder&&draftOrder.length>0
        ?<StadiumSpin playerNames={config.playerNames} replayOrder={draftOrder} onComplete={()=>setPhase("teams")} onBack={onClose}/>
        :<AutoReveal config={config} draftOrder={null} initials={initials} precomputedPicks={picks} autoStart={true} onComplete={onClose}/>}
    </div>
  );
}

function RosterCard({name,color,initial,teams,isCurrent,total,expanded,lang="en"}) {
  const show=expanded?teams:teams.slice(-4);
  return(
    <div style={{background:isCurrent?`${color}18`:"rgba(26,39,68,0.3)",border:`1px solid ${color}${isCurrent?"88":"33"}`,borderRadius:10,padding:"10px 12px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:24,height:24,borderRadius:6,background:color,color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{initial}</div>
          <span style={{fontFamily:"'DM Sans'",fontSize:13,fontWeight:700,color}}>{name}</span>
        </div>
        <span style={{fontFamily:"'Bebas Neue'",fontSize:12,color:`${color}99`,letterSpacing:1}}>{teams.length}{total?`/${total}`:""}</span>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
        {show.length===0?<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#3d5070",fontStyle:"italic"}}>{lang==="es"?"sin picks":"no picks yet"}</span>
          :show.map(tn=>{const tm=TBN[tn];return(<span key={tn} style={{padding:"2px 6px",borderRadius:5,background:`${color}11`,fontSize:13,display:"inline-flex",alignItems:"center",gap:4,fontFamily:"'DM Sans'",color:"#e0dcd4"}}><span>{tm?.flag}</span><span style={{fontSize:11,fontWeight:500}}>{countryName(tn,lang)}</span></span>);})}
        {!expanded&&teams.length>4&&<span style={{padding:"2px 6px",fontFamily:"'DM Sans'",fontSize:11,color:`${color}99`,fontStyle:"italic"}}>+{teams.length-4} more</span>}
      </div>
    </div>
  );
}

function SetupScreen({config,setConfig,onLock,readOnly}) {
  const lang=useContext(LangContext);
  const canLock=config.playerNames.filter(n=>n.trim()).length===config.playerCount;
  return(
    <div style={{maxWidth:720,margin:"0 auto",padding:"0 16px"}}>
      <div style={{background:"rgba(26,39,68,0.25)",borderRadius:12,border:"1px solid #1e2f50",marginBottom:28,overflow:"hidden"}}>
        <div style={{padding:"14px 20px 14px",borderBottom:"1px solid #1e2f50"}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:15,letterSpacing:2.5,color:"var(--accent)"}}>HOW MUNDIALITO WORKS</div>
        </div>
        <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:10}}>
          {RULES_DATA.map(r=><div key={r.n} style={{display:"flex",gap:10}}><div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,background:"rgba(201,168,76,0.15)",color:"var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Bebas Neue'",fontSize:13}}>{r.n}</div><div><span style={{fontFamily:"'DM Sans'",fontSize:13,fontWeight:600,color:"#e0dcd4"}}>{r.title}: </span><span style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4"}}>{r.body}</span></div></div>)}
        </div>
      </div>
      <SL>{lang==="es"?"¿Cuántos jugadores?":"How many players?"}</SL>
      <div style={{display:"flex",gap:8,marginBottom:32}}>
        {PLAYER_COUNTS.map(n=>(
          <button key={n} disabled={readOnly} onClick={()=>!readOnly&&setConfig(c=>({...c,playerCount:n,playerNames:Array.from({length:n},(_,i)=>c.playerNames[i]||"")}))} style={{flex:1,padding:"14px 0",borderRadius:10,border:config.playerCount===n?"2px solid var(--accent)":"2px solid #2a3a5c",background:config.playerCount===n?"rgba(201,168,76,0.12)":"rgba(26,39,68,0.5)",color:config.playerCount===n?"var(--accent)":"#8899b4",fontFamily:"'Bebas Neue'",fontSize:26,letterSpacing:2,cursor:readOnly?"default":"pointer",opacity:readOnly&&config.playerCount!==n?0.4:1}}>
            {n}<div style={{fontFamily:"'DM Sans'",fontSize:11,letterSpacing:0.5,marginTop:2,opacity:0.7,fontWeight:400}}>{48/n} teams</div>
          </button>
        ))}
      </div>
      <SL>{lang==="es"?"Nombres de jugadores":"Player names"}</SL>
      <div style={{display:"grid",gridTemplateColumns:config.playerCount<=4?"1fr 1fr":"1fr 1fr 1fr",gap:10,marginBottom:32}}>
        {config.playerNames.map((name,i)=>(
          <div key={i} style={{position:"relative"}}>
            <span style={{position:"absolute",left:12,top:11,fontFamily:"'Bebas Neue'",fontSize:13,color:getPlayerColor(i,PC[i]),letterSpacing:1.5,fontWeight:700}}>P{i+1}</span>
            <input value={name} readOnly={readOnly} onChange={e=>{if(readOnly)return;const nn=[...config.playerNames];nn[i]=e.target.value;setConfig(c=>({...c,playerNames:nn}));}} placeholder={`Player ${i+1}`} style={{width:"100%",padding:"10px 12px 10px 42px",borderRadius:8,border:"1.5px solid #2a3a5c",background:"rgba(10,22,40,0.7)",color:"#e0dcd4",fontFamily:"'DM Sans'",fontSize:15,outline:"none",boxSizing:"border-box"}} onFocus={e=>!readOnly&&(e.target.style.borderColor=PC[i])} onBlur={e=>e.target.style.borderColor="#2a3a5c"}/>
          </div>
        ))}
      </div>
      <SL>{lang==="es"?"Cuota por jugador":"Entry fee per player"}</SL>
      <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:24}}>
        <span style={{color:"#5a6a8a",fontSize:22}}>$</span>
        <input type="number" value={config.entryFee||""} readOnly={readOnly} onChange={e=>!readOnly&&setConfig(c=>({...c,entryFee:e.target.value}))} placeholder="0" style={{width:120,padding:"10px 14px",borderRadius:8,border:"1.5px solid #2a3a5c",background:"rgba(10,22,40,0.7)",color:"#e0dcd4",fontFamily:"'Bebas Neue'",fontSize:24,letterSpacing:2,outline:"none"}} onFocus={e=>!readOnly&&(e.target.style.borderColor="var(--accent)")} onBlur={e=>e.target.style.borderColor="#2a3a5c"}/>
        <span style={{color:"#5a6a8a",fontSize:13}}> × {config.playerCount} {lang==="es"?"jugadores":"players"}</span>
      </div>
      {config.entryFee&&<div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:"var(--accent)",letterSpacing:2,marginBottom:32}}>{lang==="es"?"Premio total":"Total pot"}: ${(parseFloat(config.entryFee)||0)*config.playerCount} · {lang==="es"?"el primero se lo lleva todo":"winner takes all"}</div>}
      {!readOnly&&(
        <button onClick={onLock} disabled={!canLock} style={{width:"100%",padding:"16px 0",borderRadius:12,border:"none",background:canLock?"linear-gradient(135deg,var(--accent),var(--accent-dark))":"rgba(26,39,68,0.5)",color:canLock?"#0a1628":"#3d5070",fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:3,cursor:canLock?"pointer":"default",marginBottom:8}}>
          {canLock?"LOCK SETUP → BEGIN DRAFT":`ENTER ALL ${config.playerCount} NAMES TO CONTINUE`}
        </button>
      )}
    </div>
  );
}

function DraftScreen({config,draftOrder,setDraftOrder,picks,setPicks,onLockDraft,readOnly,initials,draftMode,setDraftMode}) {
  const lang=useContext(LangContext);
  const [orderStep,setOrderStep]=useState(null);
  const [pickFlash,setPickFlash]=useState(null);
  const [watching,setWatching]=useState(false);
  const done=picks.length===48;
  const curIdx=draftOrder&&!done&&draftMode==="manual"?getCurrentPicker(picks.length,draftOrder):null;
  const rosters=useMemo(()=>{const r=Array.from({length:config.playerCount},()=>[]);(picks||[]).forEach(p=>{if(p.playerIdx!=null)r[p.playerIdx].push(p.team);});return r;},[picks,config.playerCount]);

  const addPick=(teamName,playerIdx)=>{
    if(playerIdx==null)return;
    setPicks(p=>[...p,{team:teamName,playerIdx,pickNumber:p.length}]);
    setPickFlash({team:teamName,playerIdx});
    setTimeout(()=>setPickFlash(null),1400);
  };

  if(watching)return <DraftReplay config={config} picks={picks} draftOrder={draftOrder} initials={initials} onClose={()=>setWatching(false)}/>;
  if(readOnly&&!draftOrder)return <div style={{textAlign:"center",padding:"60px 24px 0"}}><div style={{fontSize:56,opacity:0.4,marginBottom:16}}>🎯</div><div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:3,color:"#5a6a8a"}}>DRAFT HASN'T STARTED YET</div></div>;

  if(!draftMode)return(
    <div style={{maxWidth:680,margin:"0 auto",padding:"0 16px",textAlign:"center"}}>
      <div style={{fontFamily:"'Bebas Neue'",fontSize:38,color:"var(--accent)",letterSpacing:4,marginBottom:8}}>DRAFT DAY</div>
      <div style={{fontFamily:"'DM Sans'",fontSize:14,color:"#8899b4",marginBottom:32}}>How would you like teams to be assigned?</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,maxWidth:520,margin:"0 auto"}}>
        {[{id:"manual",icon:"🧠",label:"MANUAL PICKS",desc:"Each player picks their own teams in snake draft order."},{id:"auto",icon:"⚽",label:"AUTO ASSIGN",desc:"Teams randomly assigned by odds tier. Revealed by El Presidente."}].map(opt=>(
          <button key={opt.id} onClick={()=>{setDraftMode(opt.id);setOrderStep("spin");}} style={{padding:"24px 16px",borderRadius:14,border:"2px solid #2a3a5c",background:"rgba(26,39,68,0.4)",cursor:"pointer",textAlign:"center"}} onMouseEnter={e=>e.currentTarget.style.borderColor="var(--accent)"} onMouseLeave={e=>e.currentTarget.style.borderColor="#2a3a5c"}>
            <div style={{fontSize:38,marginBottom:10}}>{opt.icon}</div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:2,color:"var(--accent)",marginBottom:6}}>{opt.label}</div>
            <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#5a6a8a",lineHeight:1.5}}>{opt.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );

  if(orderStep==="spin")return <StadiumSpin playerNames={config.playerNames} onComplete={o=>{setDraftOrder(o);setOrderStep(null);}} onBack={()=>{setOrderStep(null);setDraftMode(null);}}/>;
  if(draftMode==="auto"&&!done)return <AutoReveal config={config} draftOrder={draftOrder||[]} initials={initials} onComplete={allPicks=>{setPicks(allPicks);onLockDraft();}}/>;

  if(done)return(
    <div style={{maxWidth:920,margin:"0 auto",padding:"0 16px"}}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:32,color:"var(--accent)",letterSpacing:4}}>{t(lang,"draftComplete")}</div>
        <div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",marginTop:6}}>{readOnly?t(lang,"allTeamsClaimed"):t(lang,"allTeamsClaimed")+" "+( lang==="es"?"Bloquea para comenzar la Fase de Grupos.":"Lock to begin Group Stage.")}</div>
        <button onClick={()=>setWatching(true)} style={{marginTop:10,padding:"7px 18px",borderRadius:10,border:"1px solid #c9a84c55",background:"rgba(201,168,76,0.08)",color:"var(--accent)",fontFamily:"'DM Sans'",fontSize:12,fontWeight:600,cursor:"pointer"}}>{t(lang,"watchDraw")}</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:12,marginBottom:28}}>{rosters.map((teams,idx)=><RosterCard key={idx} name={config.playerNames[idx]} color={getPlayerColor(idx,PC[idx])} initial={initials[idx]} teams={teams} expanded lang={lang}/>)}</div>
      {!readOnly&&<button onClick={onLockDraft} style={{width:"100%",padding:"16px 0",borderRadius:12,border:"none",background:"linear-gradient(135deg,var(--accent),var(--accent-dark))",color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:3,cursor:"pointer"}}>{t(lang,"lockDraft")}</button>}
    </div>
  );

  const curColor=curIdx!=null?PC[curIdx]:"var(--accent)";
  const curName=curIdx!=null?config.playerNames[curIdx]:"";
  const round=Math.floor((picks.length||0)/config.playerCount)+1;
  const totalRounds=48/config.playerCount;

  return(
    <div style={{maxWidth:920,margin:"0 auto",padding:"0 16px"}}>
      <style>{`@keyframes flashIn{0%{transform:scale(0.7) translateY(-10px);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1) translateY(0);opacity:1}}`}</style>
      {pickFlash&&(
        <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:200,textAlign:"center",animation:"flashIn 0.3s ease-out",pointerEvents:"none"}}>
          <div style={{background:`linear-gradient(135deg,${PC[pickFlash.playerIdx]}33,rgba(10,22,40,0.97))`,border:`2px solid ${PC[pickFlash.playerIdx]}`,borderRadius:20,padding:"24px 36px"}}>
            <div style={{fontSize:56,marginBottom:8}}>{TBN[pickFlash.team]?.flag}</div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:26,color:PC[pickFlash.playerIdx],letterSpacing:2}}>{countryName(pickFlash.team,lang)}</div>
          </div>
        </div>
      )}
      <div style={{background:`linear-gradient(135deg,${curColor}33,${curColor}11)`,border:`2px solid ${curColor}`,borderRadius:14,padding:"14px 22px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontFamily:"'DM Sans'",fontSize:11,color:curColor,letterSpacing:2,fontWeight:600,marginBottom:2}}>PICK {(picks.length||0)+1} OF 48 · {t(lang,"roundOrder")} {round}/{totalRounds}</div>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:28,color:curColor,letterSpacing:2,lineHeight:1}}>{(curName||"").toUpperCase()}'S TURN</div>
        </div>
        {(picks.length||0)>0&&<button onClick={()=>setPicks(p=>p.slice(0,-1))} style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${curColor}66`,background:"transparent",color:curColor,fontFamily:"'DM Sans'",fontSize:12,cursor:"pointer"}}>{t(lang,"undo")}</button>}
      </div>
      <div style={{height:5,background:"rgba(26,39,68,0.6)",borderRadius:3,marginBottom:12,overflow:"hidden"}}><div style={{height:"100%",width:`${((picks.length||0)/48)*100}%`,background:"linear-gradient(90deg,var(--accent),#d97757)",transition:"width 0.3s"}}/></div>
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.6fr) minmax(0,1fr)",gap:14}}>
        <div>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:13,letterSpacing:2,color:"#5a6a8a",marginBottom:8}}>{t(lang,"teamsOdds")}</div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {TEAMS.map(team=>{
              const pick=(picks||[]).find(p=>p.team===team.name);const picked=!!pick;
              const oc=picked?PC[pick.playerIdx]:null;const oi=picked?initials[pick.playerIdx]:null;
              return(
                <div key={team.name} onClick={()=>!picked&&addPick(team.name,curIdx)} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 12px",borderRadius:8,background:picked?`${oc}15`:"rgba(26,39,68,0.4)",border:picked?`1px solid ${oc}55`:"1px solid #1e2f50",borderLeft:picked?`4px solid ${oc}`:"4px solid transparent",cursor:picked?"default":"pointer",opacity:picked?0.65:1,transition:"all 0.1s"}} onMouseEnter={e=>{if(!picked){e.currentTarget.style.background="rgba(201,168,76,0.08)";e.currentTarget.style.borderLeft=`4px solid ${curColor}`;}} } onMouseLeave={e=>{if(!picked){e.currentTarget.style.background="rgba(26,39,68,0.4)";e.currentTarget.style.borderLeft="4px solid transparent";}}}>
                  <span style={{fontSize:20,lineHeight:1,flexShrink:0}}>{team.flag}</span>
                  <span style={{fontFamily:"'DM Sans'",fontSize:13,fontWeight:600,color:picked?oc:"#e0dcd4",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{countryName(team.name,lang)}</span>
                  <span style={{fontFamily:"'DM Sans'",fontSize:11,color:picked?`${oc}88`:"#8899b4",flexShrink:0}}>{fmtOdds(team.odds)}</span>
                  {picked?<div style={{width:20,height:20,borderRadius:4,background:oc,color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{oi}</div>
                    :<button onClick={e=>{e.stopPropagation();addPick(team.name,curIdx);}} style={{padding:"3px 9px",borderRadius:5,border:`1px solid ${curColor}`,background:`${curColor}22`,color:curColor,fontFamily:"'Bebas Neue'",fontSize:11,letterSpacing:1.5,cursor:"pointer",flexShrink:0}}>{t(lang,"pick")}</button>}
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:13,letterSpacing:2,color:"#5a6a8a",marginBottom:8}}>{t(lang,"picksLive")}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>{rosters.map((teams,idx)=><RosterCard key={idx} name={config.playerNames[idx]} color={getPlayerColor(idx,PC[idx])} initial={initials[idx]} teams={teams} isCurrent={idx===curIdx} total={48/config.playerCount} lang={lang}/>)}</div>
          <div style={{marginTop:14}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:12,letterSpacing:2,color:"#5a6a8a",marginBottom:6}}>{t(lang,"roundOrder")} {round}</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{(draftOrder||[]).length>0&&(round%2===1?draftOrder:[...draftOrder].reverse()).map((pi,slot)=>{const past=slot<((picks.length||0)%config.playerCount);const now=slot===((picks.length||0)%config.playerCount);return(<div key={slot} style={{padding:"2px 7px",borderRadius:6,background:now?`${PC[pi]}33`:"transparent",border:`1px solid ${PC[pi]}${now?"":"44"}`,color:PC[pi],opacity:past?0.4:1,fontFamily:"'DM Sans'",fontSize:11,fontWeight:600}}>{config.playerNames[pi]}</div>);})}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreEntry({matchId,result,onSet,readOnly,teamA,teamB,ownership,initials}) {
  const lang=useContext(LangContext);
  const [hv,setHv]=useState(result?.home??"");
  const [av,setAv]=useState(result?.away??"");
  useEffect(()=>{setHv(result?.home??"");setAv(result?.away??"");},[result?.home,result?.away]);
  const trySet=(h,a)=>{const hi=h===""?null:parseInt(h);const ai=a===""?null:parseInt(a);if(hi!=null&&ai!=null&&!isNaN(hi)&&!isNaN(ai))onSet(matchId,{home:Math.max(0,hi),away:Math.max(0,ai)});else if(h===""&&a==="")onSet(matchId,undefined);};
  const inp=(val,setVal,side)=><input type="number" min="0" max="20" value={val} readOnly={readOnly} onChange={e=>{const v=e.target.value;setVal(v);trySet(side==="home"?v:hv,side==="away"?v:av);}} style={{width:40,padding:"6px 0",textAlign:"center",borderRadius:8,border:"1.5px solid #2a3a5c",background:"rgba(10,22,40,0.6)",color:"#e0dcd4",fontFamily:"'Bebas Neue'",fontSize:22,outline:"none",cursor:readOnly?"default":"text"}} onFocus={e=>!readOnly&&(e.target.style.borderColor="var(--accent)")} onBlur={e=>e.target.style.borderColor="#2a3a5c"}/>;
  const plainNum=(val)=><span style={{width:40,textAlign:"center",color:"#e0dcd4",fontFamily:"'Bebas Neue'",fontSize:24,display:"inline-block"}}>{val!==""?val:""}</span>;
  const out=getMatchOutcome(result);
  const winTeam=out==="A"?teamA:out==="B"?teamB:null;
  const winOwner=winTeam&&ownership?ownership[winTeam]:null;
  const winFlag=winTeam?TBN[winTeam]?.flag:null;
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center",flexShrink:0}}>
      {readOnly?plainNum(hv):inp(hv,setHv,"home")}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:36}}>
        <span style={{fontFamily:"'Bebas Neue'",fontSize:14,color:"#5a6a8a",letterSpacing:1}}>–</span>
        {out&&(out==="D"?(
          <div style={{fontFamily:"'Bebas Neue'",fontSize:10,color:"#8899b4",letterSpacing:1}}>{t(lang,"draw")}</div>
        ):(
          winOwner!=null&&initials&&<div style={{width:18,height:18,borderRadius:4,background:getPlayerColor(winOwner.playerIdx,PC[winOwner.playerIdx]),color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center"}}>{initials[winOwner.playerIdx]}</div>
        ))}
      </div>
      {readOnly?plainNum(av):inp(av,setAv,"away")}
    </div>
  );
}

// ── GroupMatchCard — owner chips pinned to far edges ──────────
function OddsPopup({matchId, teamA, teamB, flagA, flagB, lang, hasResult}) {
  const [open,setOpen]=useState(false);
  const odds=MATCH_ODDS[matchId];
  if(!odds)return null;
  const [h,d,a]=odds;
  const nameA=countryName(teamA,lang)||teamA;
  const nameB=countryName(teamB,lang)||teamB;
  const label=hasResult
    ?(lang==="es"?"Pronóstico pre-partido":"Pre-match odds")
    :(lang==="es"?"Pronóstico":"Most likely");
  return(
    <div style={{display:"inline-flex",flexDirection:"column",alignItems:"flex-end"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:10,border:`1px solid ${open?"rgba(107,155,209,0.4)":"rgba(107,155,209,0.2)"}`,background:open?"rgba(107,155,209,0.15)":"rgba(107,155,209,0.06)",color:"#6b9bd1",cursor:"pointer",fontSize:12,fontFamily:"'DM Sans'"}}>
        🔮
      </button>
      {open&&(
        <div style={{position:"absolute",zIndex:30,marginTop:28,right:0,background:"#0a1628",border:"1px solid rgba(107,155,209,0.25)",borderRadius:10,padding:"10px 12px",minWidth:190,boxShadow:"0 4px 20px rgba(0,0,0,0.5)"}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:10,letterSpacing:1.5,color:"#5a6a8a",marginBottom:8}}>{label.toUpperCase()}</div>
          {[[flagA,nameA,h,"#61a978"],["—",lang==="es"?"Empate":"Draw",d,"#5a6a8a"],[flagB,nameB,a,"#6b9bd1"]].map(([flag,name,pct,col])=>(
            <div key={name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{fontSize:12,width:18,textAlign:"center",flexShrink:0}}>{flag}</span>
              <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#8899b4",flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}</span>
              <div style={{width:60,height:4,background:"#1a2d4a",borderRadius:4,overflow:"hidden",flexShrink:0}}>
                <div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:4}}/>
              </div>
              <span style={{fontFamily:"'DM Sans'",fontSize:11,fontWeight:700,color:col,minWidth:28,textAlign:"right"}}>{pct}%</span>
            </div>
          ))}
          <div style={{fontFamily:"'DM Sans'",fontSize:9,color:"#3d5070",marginTop:6,borderTop:"1px solid #1a2d4a",paddingTop:6}}>pre-match odds</div>
        </div>
      )}
    </div>
  );
}

function GroupMatchCard({match,result,ownership,onSet,readOnly,initials,myTeams=new Set(),onOpenChat,chatCount=0,hasReactions=false,onOpenPredict,matchPredictions={},myPlayerIdx,playerCount=8,playerNames=[]}) {
  const lang=useContext(LangContext);
  const [a,b]=match.t;const ta=TBN[a],tb=TBN[b];const oa=ownership[a],ob=ownership[b];const out=getMatchOutcome(result);
  const isMyMatch=myTeams.has(a)||myTeams.has(b);
  const myHasHome=myTeams.has(a),myHasAway=myTeams.has(b),myBoth=myHasHome&&myHasAway;
  const resultBg="rgba(10,22,40,0.4)";
  const resultBorder=isMyMatch?"1px solid rgba(201,168,76,0.5)":"1px solid #1e2f50";
  const resultShadow="none";
  const teamRow=(name,flag,owner,isHome)=>{
    const winning=out&&((isHome&&out==="A")||(!isHome&&out==="B"));
    const losing=out&&((isHome&&out==="B")||(!isHome&&out==="A"));
    const color=owner!=null?PC[owner]:null;
    const fn=countryFixture(name,lang);
    const fs=fn.length>9?9:10;
    return(
      <div style={{flex:1,display:"flex",alignItems:"center",minWidth:0,opacity:losing?0.5:1,flexDirection:isHome?"row-reverse":"row",gap:4}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:0,width:72,background:winning&&color?`${color}15`:"transparent",border:winning&&color?`1px solid ${color}44`:"1px solid transparent",borderRadius:6,padding:"3px 5px"}}>
          <span style={{fontSize:15,lineHeight:1,flexShrink:0,display:"block",textAlign:"center"}}>{flag}</span>
          <span style={{fontFamily:"'DM Sans'",fontSize:fs,fontWeight:600,color:color||"#e0dcd4",lineHeight:1.2,textAlign:"center",hyphens:"manual",marginTop:2,display:"block",minHeight:24}} dangerouslySetInnerHTML={{__html:fn}}/>
        </div>
        <div style={{flex:1,minWidth:0}}/>
        {owner!=null
          ?<OwnerChip playerIdx={owner.playerIdx} initials={initials} size={20} playerName={playerNames[owner.playerIdx]||""}/>          :<div style={{width:20,height:20,flexShrink:0}}/>}
      </div>
    );
  };
  const centreLabel=()=>{
    if(!isMyMatch) return null;
    const badge=<span style={{fontFamily:"'Bebas Neue'",fontSize:10,color:"var(--accent)",letterSpacing:1,background:"rgba(201,168,76,0.15)",padding:"1px 6px",borderRadius:4,whiteSpace:"nowrap"}}>{myBoth?`⭐ ${t(lang,"yourTeams")} ⭐`:myHasHome?`⭐ ${t(lang,"yourTeam")}`:(`${t(lang,"yourTeam")} ⭐`)}</span>;
    return <div style={{display:"flex",alignItems:"center",justifyContent:"center"}}>{badge}</div>;
  };
  const isPreKickoff=match.ko&&!result&&Date.now()<new Date(match.d+"T"+match.ko+":00Z").getTime();
  return(
    <div style={{background:resultBg,borderRadius:10,padding:"10px 12px",border:resultBorder,boxShadow:resultShadow,marginBottom:6,position:"relative"}}>
      <div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#5a6a8a",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative"}}>
        <span style={{background:"rgba(138,153,180,0.12)",padding:"1px 6px",borderRadius:4,fontFamily:"'Bebas Neue'",letterSpacing:1,fontSize:11,color:"#8899b4"}}>GRP {match.g}</span>
        {match.ko&&!result&&<span style={{position:"absolute",left:"50%",transform:"translateX(-50%)",fontFamily:"'Bebas Neue'",fontSize:11,color:"var(--accent)",letterSpacing:1,whiteSpace:"nowrap"}}>{fmtKickoff(match.d,match.ko)}</span>}
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          {MATCH_ODDS[match.id]&&<button onClick={onOpenPredict} style={{display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:10,border:`1px solid ${matchPredictions[myPlayerIdx]!=null?"rgba(107,155,209,0.4)":"rgba(107,155,209,0.2)"}`,background:matchPredictions[myPlayerIdx]!=null?"rgba(107,155,209,0.15)":"rgba(107,155,209,0.06)",color:"#6b9bd1",cursor:"pointer",fontSize:12,fontFamily:"'DM Sans'",flexShrink:0}}>🔮{Object.keys(matchPredictions).length>0&&<span style={{fontSize:10,fontWeight:600}}>{Object.keys(matchPredictions).length}</span>}</button>}
          {match.ko&&(()=>{
            const kickoffUTC=new Date(match.d+"T"+match.ko+":00Z");
            if(Date.now()<kickoffUTC.getTime()+2.5*60*60*1000) return null;
            const query=encodeURIComponent(`${a} vs ${b} 2026 World Cup highlights`);
            return(
              <a href={`https://www.youtube.com/results?search_query=${query}`} target="_blank" rel="noopener noreferrer"
                style={{display:"flex",alignItems:"center",padding:"2px 7px",borderRadius:10,border:"1px solid rgba(255,80,80,0.3)",background:"rgba(255,80,80,0.08)",color:"#ff6b6b",fontSize:12,textDecoration:"none"}}>
                🎬
              </a>
            );
          })()}
          <button onClick={onOpenChat} style={{display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:10,border:`1px solid ${(chatCount>0||hasReactions)?"rgba(201,168,76,0.3)":"#2a3a5c"}`,background:(chatCount>0||hasReactions)?"rgba(201,168,76,0.08)":"transparent",color:(chatCount>0||hasReactions)?"var(--accent)":"#5a6a8a",cursor:"pointer",fontSize:12}}>
            💬{chatCount>0&&<span style={{fontFamily:"'DM Sans'",fontSize:10,fontWeight:600}}>{chatCount}</span>}
          </button>
        </div>
      </div>
      {centreLabel()&&<div style={{display:"flex",justifyContent:"center",marginBottom:4}}>{centreLabel()}</div>}
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        {teamRow(a,ta?.flag,oa?.playerIdx!=null?oa:null,true)}
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <ScoreEntry matchId={match.id} result={result} onSet={onSet} readOnly={readOnly} teamA={a} teamB={b} ownership={ownership} initials={initials}/>
        </div>
        {teamRow(b,tb?.flag,ob?.playerIdx!=null?ob:null,false)}
      </div>
    </div>
  );
}

function ShareStandingsModal({onClose,matchResults,ownership,initials,config,lang,groupOrderOverride={}}) {
  const [selected,setSelected]=useState([]);
  const [sharing,setSharing]=useState(false);
  const groups=Object.keys(GROUPS);

  const toggle=g=>setSelected(prev=>prev.includes(g)?prev.filter(x=>x!==g):[...prev,g].slice(0,4));

  const generate=async()=>{
    if(!selected.length)return;
    setSharing(true);
    try{
      const W=420,PAD=16,HEADER=56,ROW=34,TABLE_HEADER=26,GROUP_GAP=12;
      const groupH=TABLE_HEADER+ROW*4+GROUP_GAP;
      const H=HEADER+10+selected.length*groupH+16;
      const canvas=document.createElement("canvas");
      const DPR=2;
      canvas.width=W*DPR;canvas.height=H*DPR;
      const ctx=canvas.getContext("2d");
      ctx.scale(DPR,DPR);

      // Background
      const bg=ctx.createLinearGradient(0,0,0,H);
      bg.addColorStop(0,"#0a1628");bg.addColorStop(1,"#0f1e38");
      ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);

      // Load fonts
      await document.fonts.ready;

      // Header
      ctx.fillStyle="rgba(201,168,76,0.08)";ctx.fillRect(0,0,W,HEADER);
      ctx.fillStyle="rgba(201,168,76,0.25)";ctx.fillRect(0,HEADER-1,W,1);
      ctx.textAlign="left";ctx.letterSpacing="2px";
      ctx.font="bold 20px 'Bebas Neue'";ctx.fillStyle="#c9a84c";
      ctx.fillText("⚽ MUNDIALITO 2026",PAD,36);
      ctx.font="500 10px 'DM Sans'";ctx.fillStyle="#5a6a8a";ctx.letterSpacing="1px";
      ctx.fillText("GROUP STANDINGS",PAD,HEADER-8);

      // Layout constants
      // Columns shifted left, Pts well inside right edge
      const CARD_L=PAD-4, CARD_W=W-PAD*2+8; // card bounds
      const COL_P=W-PAD-150, COL_W=W-PAD-122, COL_D=W-PAD-94,
            COL_L=W-PAD-66, COL_GD=W-PAD-36, COL_PTS=W-PAD-8;
      const CARD_PAD=10;

      let y=HEADER+10;
      for(const g of selected){
        const s=groupStandings(g,matchResults,groupOrderOverride[g]);
        const allPlayed=GM.filter(m=>m.g===g).every(m=>matchResults[m.id]!=null);
        const CARD_TOP=y;
        const CARD_H=TABLE_HEADER+ROW*4;

        // Card background
        ctx.fillStyle="rgba(26,39,68,0.35)";
        ctx.beginPath();ctx.roundRect(PAD-4,CARD_TOP,W-PAD*2+8,CARD_H,6);ctx.fill();
        ctx.strokeStyle="rgba(201,168,76,0.18)";ctx.lineWidth=1;
        ctx.beginPath();ctx.roundRect(PAD-4,CARD_TOP,W-PAD*2+8,CARD_H,6);ctx.stroke();

        // Group letter + col headers on same line
        ctx.textAlign="left";ctx.letterSpacing="2px";
        ctx.font="bold 13px 'Bebas Neue'";ctx.fillStyle="#c9a84c";
        ctx.fillText(`GROUP ${g}`,PAD+CARD_PAD,CARD_TOP+TABLE_HEADER-6);

        // Column headers
        ctx.font="bold 9px 'DM Sans'";ctx.fillStyle="#5a6a8a";ctx.letterSpacing="0px";
        [[COL_P,"P"],[COL_W,"W"],[COL_D,"D"],[COL_L,"L"],[COL_GD,"GD"],[COL_PTS,"Pts"]].forEach(([x,label])=>{
          ctx.textAlign="center";ctx.fillText(label,x,CARD_TOP+TABLE_HEADER-6);
        });

        // Divider under header
        ctx.fillStyle="rgba(138,153,180,0.15)";
        ctx.fillRect(CARD_L,CARD_TOP+TABLE_HEADER,CARD_W,1);

        y=CARD_TOP+TABLE_HEADER;

        s.forEach((row,i)=>{
          const tm=TBN[row.team];
          const o=ownership[row.team];
          const pcolor=o?getPlayerColor(o.playerIdx,PC[o.playerIdx]):"#e0dcd4";
          const isTop2=i<2;
          const rowY=y;

          // Row tint — always show gold for top 2, always show grey for 4th
          if(isTop2){
            ctx.fillStyle="rgba(201,168,76,0.10)";
            ctx.fillRect(CARD_L,rowY,CARD_W,ROW);
          } else if(i===3){
            ctx.fillStyle="rgba(8,14,30,0.7)";
            ctx.fillRect(CARD_L,rowY,CARD_W,ROW);
          }

          const mid=rowY+ROW/2+4;
          const is4th=i===3; // always show 4th treatment regardless of group completion

          // Position
          ctx.font="bold 10px 'Bebas Neue'";ctx.textAlign="center";ctx.letterSpacing="0px";
          ctx.fillStyle=isTop2?"#c9a84c":is4th?"#3d5070":"#5a6a8a";
          ctx.fillText(String(i+1),PAD+10,mid);

          // Flag
          ctx.font="14px serif";ctx.textAlign="left";
          const flagX=PAD+22;
          ctx.fillText(tm?.flag||"🏳️",flagX,mid+1);

          // Full country name
          const nameX=flagX+20;
          const CHIP_X=nameX+110; // fixed chip column position
          ctx.font=`${is4th?"normal":"600"} 11px 'DM Sans'`;
          ctx.fillStyle=is4th?"#3d5070":isTop2?"#c9a84c":pcolor;
          ctx.textAlign="left";ctx.letterSpacing="0px";
          let displayName=countryName(row.team,"en").toUpperCase();
          if(row.team==="BOSNIA AND HERZEGOVINA")displayName="BOSNIA";
          // Truncate if overflows into chip column
          const maxNameW=CHIP_X-nameX-6;
          while(ctx.measureText(displayName).width>maxNameW&&displayName.length>3)displayName=displayName.slice(0,-1)+"…";
          ctx.fillText(displayName,nameX,mid);

          // Owner chip — fixed column position
          if(o){
            const chipY=rowY+ROW/2-8, chipW=22, chipH=16;
            ctx.fillStyle=pcolor;
            ctx.beginPath();ctx.roundRect(CHIP_X,chipY,chipW,chipH,3);ctx.fill();
            ctx.font="bold 9px 'Bebas Neue'";ctx.fillStyle="#0a1628";
            ctx.textAlign="center";
            ctx.fillText(initials[o.playerIdx]||"?",CHIP_X+chipW/2,chipY+11);
          }

          // Stats
          const gdVal=row.GD>0?"+"+row.GD:String(row.GD);
          const statTextColor=is4th?"#3d5070":"#8899b4";
          [[COL_P,String(row.P)],[COL_W,String(row.W)],[COL_D,String(row.D)],[COL_L,String(row.L)]].forEach(([x,v])=>{
            ctx.font="400 11px 'DM Sans'";ctx.fillStyle=statTextColor;ctx.textAlign="center";ctx.letterSpacing="0px";
            ctx.fillText(v,x,mid);
          });
          // GD
          ctx.font="600 11px 'DM Sans'";
          ctx.fillStyle=is4th?"#3d5070":row.GD>0?"#61a978":row.GD<0?"#d97757":"#8899b4";
          ctx.textAlign="center";ctx.fillText(gdVal,COL_GD,mid);
          // Pts
          ctx.font="bold 13px 'Bebas Neue'";
          ctx.fillStyle=is4th?"#3d5070":isTop2?"#c9a84c":"#e0dcd4";
          ctx.textAlign="center";ctx.fillText(String(row.Pts),COL_PTS,mid);

          // Row divider (not after last row)
          if(i<3){
            ctx.fillStyle="rgba(138,153,180,0.08)";
            ctx.fillRect(CARD_L,rowY+ROW,CARD_W,1);
          }
          y+=ROW;
        });

        y+=GROUP_GAP; // gap between groups
      }

      // Footer
      ctx.font="400 9px 'DM Sans'";ctx.fillStyle="#3d5070";ctx.textAlign="center";ctx.letterSpacing="0px";
      ctx.fillText("elmundialito.github.io/2026",W/2,H-8);

      canvas.toBlob(async blob=>{
        try{
          await navigator.share({files:[new File([blob],"standings.png",{type:"image/png"})]});
        }catch{
          const url=URL.createObjectURL(blob);
          const a=document.createElement("a");a.href=url;a.download="standings.png";a.click();
          URL.revokeObjectURL(url);
        }
        setSharing(false);
      },"image/png");
    }catch(e){console.error(e);setSharing(false);}
  };

  return(
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:520,background:"linear-gradient(165deg,#0a1628,#0f1e38)",borderRadius:"16px 16px 0 0",border:"1px solid rgba(201,168,76,0.25)",borderBottom:"none",padding:"20px 18px 32px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:2,color:"var(--accent)"}}>📊 {lang==="es"?"COMPARTIR GRUPOS":"SHARE STANDINGS"}</div>
          <button onClick={onClose} style={{width:28,height:28,borderRadius:7,border:"1px solid #2a3a5c",background:"transparent",color:"#5a6a8a",fontSize:16,cursor:"pointer"}}>×</button>
        </div>
        <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#5a6a8a",marginBottom:12}}>{lang==="es"?"Selecciona hasta 4 grupos":"Select up to 4 groups"} ({selected.length}/4)</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginBottom:20}}>
          {groups.map(g=>{
            const sel=selected.includes(g);
            return(
              <button key={g} onClick={()=>toggle(g)} style={{padding:"10px 0",borderRadius:8,border:sel?"2px solid var(--accent)":"2px solid #2a3a5c",background:sel?"rgba(201,168,76,0.12)":"rgba(26,39,68,0.4)",color:sel?"var(--accent)":"#5a6a8a",fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:1,cursor:selected.length>=4&&!sel?"default":"pointer",opacity:selected.length>=4&&!sel?0.4:1}}>{g}</button>
            );
          })}
        </div>
        <button onClick={generate} disabled={!selected.length||sharing} style={{width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:selected.length?"var(--accent)":"#2a3a5c",color:selected.length?"#0a1628":"#5a6a8a",fontFamily:"'Bebas Neue'",fontSize:15,letterSpacing:2,cursor:selected.length?"pointer":"default"}}>
          {sharing?"...":(lang==="es"?"COMPARTIR":"SHARE")} {selected.length>0?`(${selected.join(", ")})`:""}
        </button>
      </div>
    </div>
  );
}

function GroupStandingsAccordion({g,res,ownership,initials,isHost,groupOverride,setGroupOverride}) {
  const lang=useContext(LangContext);
  const [open,setOpen]=useState(false);
  const [reordering,setReordering]=useState(false);
  const completedCount=useMemo(()=>GM.filter(m=>m.g===g).filter(m=>res[m.id]!=null).length,[g,res]);
  const isOverridden=!!(groupOverride&&Array.isArray(groupOverride.order)&&groupOverride.order.length===4&&groupOverride.matchesPlayedAtSet===completedCount);
  const s=useMemo(()=>groupStandings(g,res,groupOverride),[g,res,groupOverride]);
  const autoOrder=useMemo(()=>groupStandings(g,res).map(r=>r.team),[g,res]);
  const [draftOrder,setDraftOrder]=useState(null);
  const startReorder=()=>{setDraftOrder(isOverridden?[...groupOverride.order]:[...autoOrder]);setReordering(true);};
  const moveTeam=(idx,dir)=>{
    setDraftOrder(prev=>{
      const arr=[...prev];const swapIdx=idx+dir;
      if(swapIdx<0||swapIdx>=arr.length)return arr;
      [arr[idx],arr[swapIdx]]=[arr[swapIdx],arr[idx]];
      return arr;
    });
  };
  // Clean up stale override from saved state once a new match makes it invalid (host only)
  useEffect(()=>{
    if(isHost&&groupOverride&&Array.isArray(groupOverride.order)&&groupOverride.matchesPlayedAtSet!==completedCount&&setGroupOverride){
      setGroupOverride(g,null);
    }
  },[completedCount,isHost]);
  return(
    <div style={{background:"rgba(26,39,68,0.2)",borderRadius:10,border:"1px solid #1e2f50",marginBottom:6,overflow:"hidden"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%",padding:"11px 14px",border:"none",background:"transparent",display:"flex",alignItems:"center",gap:10,cursor:"pointer",textAlign:"left"}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:"var(--accent)",letterSpacing:2,width:22,textAlign:"center",flexShrink:0}}>{g}</div>
        <div style={{flex:1,display:"flex",gap:4,flexWrap:"wrap"}}>
          {s.map(({team},i)=>{const tm=TBN[team];const o=ownership[team];return(<span key={team} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 6px",borderRadius:4,background:i<2?"rgba(97,169,120,0.1)":"transparent",fontSize:11,fontFamily:"'DM Sans'",color:o?PC[o.playerIdx]:(i<2?"#61a978":"#8899b4"),fontWeight:500}}><span style={{fontSize:12}}>{tm?.flag}</span><span>{countryName(team,lang)}</span>{o&&<OwnerChip playerIdx={o.playerIdx} initials={initials} size={16}/>}</span>);})}
        </div>
        {isOverridden&&<span title={lang==="es"?"Orden manual":"Manual order"} style={{fontSize:11,flexShrink:0}}>✋</span>}
        <span style={{fontSize:11,color:"#5a6a8a",transform:open?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
      </button>
      {open&&(
        <div style={{padding:"0 12px 12px"}}>
          {isHost&&!reordering&&(
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              <button onClick={startReorder} style={{flex:1,padding:"6px 0",borderRadius:6,border:"1px solid #2a3a5c",background:"rgba(26,39,68,0.5)",color:"#8899b4",fontFamily:"'DM Sans'",fontSize:11,cursor:"pointer"}}>↕ {lang==="es"?"Ordenar manualmente":"Manual reorder"}</button>
              {isOverridden&&<button onClick={()=>setGroupOverride(g,null)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid #d97757",background:"transparent",color:"#d97757",fontFamily:"'DM Sans'",fontSize:11,cursor:"pointer"}}>{lang==="es"?"Quitar":"Clear"}</button>}
            </div>
          )}
          {isHost&&reordering&&draftOrder&&(
            <div style={{background:"rgba(201,168,76,0.06)",border:"1px solid rgba(201,168,76,0.25)",borderRadius:8,padding:"10px",marginBottom:10}}>
              <div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#8899b4",marginBottom:8}}>{lang==="es"?"Usa las flechas para fijar el orden final (ej. por tarjetas amarillas o ranking FIFA)":"Use arrows to set the final order (e.g. by yellow cards or FIFA ranking)"}</div>
              {draftOrder.map((team,i)=>{const tm=TBN[team];const o=ownership[team];return(
                <div key={team} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderTop:i>0?"1px solid rgba(26,39,68,0.5)":"none"}}>
                  <span style={{fontFamily:"'Bebas Neue'",fontSize:12,color:i<2?"#61a978":"#5a6a8a",width:14,textAlign:"center"}}>{i+1}</span>
                  <span style={{fontSize:14}}>{tm?.flag}</span>
                  <span style={{flex:1,fontFamily:"'DM Sans'",fontSize:12,fontWeight:500,color:o?PC[o.playerIdx]:"#e0dcd4"}}>{countryName(team,lang)}</span>
                  <button onClick={()=>moveTeam(i,-1)} disabled={i===0} style={{width:26,height:26,borderRadius:6,border:"1px solid #2a3a5c",background:"rgba(10,22,40,0.6)",color:i===0?"#3d5070":"#8899b4",cursor:i===0?"default":"pointer"}}>▲</button>
                  <button onClick={()=>moveTeam(i,1)} disabled={i===draftOrder.length-1} style={{width:26,height:26,borderRadius:6,border:"1px solid #2a3a5c",background:"rgba(10,22,40,0.6)",color:i===draftOrder.length-1?"#3d5070":"#8899b4",cursor:i===draftOrder.length-1?"default":"pointer"}}>▼</button>
                </div>
              );})}
              <div style={{display:"flex",gap:6,marginTop:10}}>
                <button onClick={()=>{setGroupOverride(g,{order:draftOrder,matchesPlayedAtSet:completedCount});setReordering(false);}} style={{flex:1,padding:"7px 0",borderRadius:6,border:"none",background:"var(--accent)",color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:12,letterSpacing:1.5,cursor:"pointer"}}>SAVE</button>
                <button onClick={()=>setReordering(false)} style={{padding:"7px 12px",borderRadius:6,border:"1px solid #2a3a5c",background:"transparent",color:"#5a6a8a",fontSize:11,cursor:"pointer"}}>{lang==="es"?"Cancelar":"Cancel"}</button>
              </div>
            </div>
          )}
          <div style={{background:"rgba(10,22,40,0.4)",borderRadius:8,padding:"10px 12px",border:"1px solid #1e2f50"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 28px 28px 28px 28px 40px 36px",gap:4,fontFamily:"'DM Sans'",fontSize:9,color:"#5a6a8a",fontWeight:600,letterSpacing:1,textTransform:"uppercase",padding:"0 2px 6px"}}><span>{lang==="es"?"Equipo":"Team"}</span><span style={{textAlign:"center"}}>P</span><span style={{textAlign:"center"}}>{lang==="es"?"V":"W"}</span><span style={{textAlign:"center"}}>{lang==="es"?"E":"D"}</span><span style={{textAlign:"center"}}>{lang==="es"?"D":"L"}</span><span style={{textAlign:"center"}}>GD</span><span style={{textAlign:"center"}}>Pts</span></div>
            {s.map((row,i)=>{const tm=TBN[row.team];const o=ownership[row.team];return(<div key={row.team} style={{display:"grid",gridTemplateColumns:"1fr 28px 28px 28px 28px 40px 36px",gap:4,padding:"4px 2px",borderTop:i>0?"1px solid rgba(26,39,68,0.5)":"none",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontFamily:"'Bebas Neue'",fontSize:10,color:i<2?"#61a978":"#5a6a8a",width:10,textAlign:"center"}}>{i+1}</span><span style={{fontSize:13}}>{tm?.flag}</span><span style={{fontFamily:"'DM Sans'",fontSize:11,fontWeight:500,color:o?PC[o.playerIdx]:"#e0dcd4",whiteSpace:"nowrap"}}>{code3(row.team)}</span>{o&&<OwnerChip playerIdx={o.playerIdx} initials={initials} size={16}/>}</div>{[row.P,row.W,row.D,row.L].map((v,j)=><span key={j} style={{textAlign:"center",fontFamily:"'DM Sans'",fontSize:11,color:"#8899b4"}}>{v}</span>)}<span style={{textAlign:"center",fontFamily:"'DM Sans'",fontSize:12,fontWeight:600,color:row.GD>0?"#61a978":row.GD<0?"#d97757":"#8899b4"}}>{row.GD>0?"+":""}{row.GD}</span><span style={{textAlign:"center",fontFamily:"'Bebas Neue'",fontSize:14,color:"var(--accent)",letterSpacing:1}}>{row.Pts}</span></div>);})}
          </div>
        </div>
      )}
    </div>
  );
}

function Live3rdPlaceTable({matchResults,ownership,initials,lang,groupOrderOverride={}}) {
  const allTeamsPlayed=useMemo(()=>{
    const played=new Set();
    GM.forEach(m=>{if(matchResults[m.id]!=null)m.t.forEach(team=>played.add(team));});
    return TEAMS.every(t=>played.has(t.name));
  },[matchResults]);
  const rows=useMemo(()=>getLive3rdPlaceTeams(matchResults,groupOrderOverride),[matchResults,groupOrderOverride]);
  if(!allTeamsPlayed||rows.length===0)return null;
  return(
    <div style={{background:"rgba(26,39,68,0.2)",borderRadius:10,border:"1px solid #1e2f50",marginTop:14,marginBottom:6,overflow:"hidden",padding:"12px 14px"}}>
      <div style={{fontFamily:"'Bebas Neue'",fontSize:15,letterSpacing:2,color:"var(--accent)",marginBottom:3}}>{lang==="es"?"MEJORES TERCEROS":"BEST 3RD PLACE TEAMS"}</div>
      <div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#5a6a8a",marginBottom:10}}>{lang==="es"?"Los 8 mejores avanzan a octavos · en vivo":"Top 8 advance to Round of 32 · live"}</div>
      <div style={{display:"grid",gridTemplateColumns:"16px 1fr 24px 22px 22px 22px 36px 32px",gap:3,fontFamily:"'DM Sans'",fontSize:9,color:"#5a6a8a",fontWeight:600,letterSpacing:1,textTransform:"uppercase",padding:"0 2px 6px"}}>
        <span></span><span>{lang==="es"?"Equipo":"Team"}</span><span style={{textAlign:"center"}}>P</span><span style={{textAlign:"center"}}>{lang==="es"?"V":"W"}</span><span style={{textAlign:"center"}}>{lang==="es"?"E":"D"}</span><span style={{textAlign:"center"}}>{lang==="es"?"D":"L"}</span><span style={{textAlign:"center"}}>GD</span><span style={{textAlign:"center"}}>Pts</span>
      </div>
      {rows.map((row,i)=>{
        const tm=TBN[row.team];const o=ownership[row.team];const inTop8=i<8;
        return(<div key={row.team}>
          <div style={{display:"grid",gridTemplateColumns:"16px 1fr 24px 22px 22px 22px 36px 32px",gap:3,padding:"5px 2px",alignItems:"center",opacity:inTop8?1:0.55}}>
            <span style={{fontFamily:"'Bebas Neue'",fontSize:11,color:inTop8?"#61a978":"#5a6a8a",textAlign:"center"}}>{i+1}</span>
            <div style={{display:"flex",alignItems:"center",gap:5,minWidth:0}}>
              <span style={{fontSize:13,flexShrink:0}}>{tm?.flag}</span>
              <span style={{fontFamily:"'DM Sans'",fontSize:11,fontWeight:500,color:o?PC[o.playerIdx]:"#e0dcd4",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{code3(row.team)}</span>
              {o&&<OwnerChip playerIdx={o.playerIdx} initials={initials} size={16}/>}
            </div>
            <span style={{textAlign:"center",fontFamily:"'DM Sans'",fontSize:11,color:"#8899b4"}}>{row.P}</span>
            <span style={{textAlign:"center",fontFamily:"'DM Sans'",fontSize:11,color:"#8899b4"}}>{row.W}</span>
            <span style={{textAlign:"center",fontFamily:"'DM Sans'",fontSize:11,color:"#8899b4"}}>{row.D}</span>
            <span style={{textAlign:"center",fontFamily:"'DM Sans'",fontSize:11,color:"#8899b4"}}>{row.L}</span>
            <span style={{textAlign:"center",fontFamily:"'DM Sans'",fontSize:11,fontWeight:600,color:row.gd>0?"#61a978":row.gd<0?"#d97757":"#8899b4"}}>{row.gd>0?"+":""}{row.gd}</span>
            <span style={{textAlign:"center",fontFamily:"'Bebas Neue'",fontSize:13,color:inTop8?"var(--accent)":"#5a6a8a",letterSpacing:1}}>{row.pts}</span>
          </div>
          {i===7&&rows.length>8&&<div style={{borderTop:"2px dashed rgba(201,168,76,0.3)",margin:"2px 0 4px"}}/>}
        </div>);
      })}
    </div>
  );
}

function ShareDayModal({open,onClose,dates,today,matchesByDate,matchResults,ownership,initials,config,lang}) {
  const [selectedDate,setSelectedDate]=useState(today);
  if(!open)return null;

  const generateAndShare=async()=>{
    try{
      const bebas=new FontFace("BebasNeue","url(https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXoo9WdhyyTh89ZNpQ.woff2)");
      const dm=new FontFace("DMSans","url(https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZa4ET-DNl0.woff2)");
      await Promise.all([bebas.load(),dm.load()]);
      document.fonts.add(bebas);document.fonts.add(dm);
    }catch(e){}

    const matches=(matchesByDate.find(([d])=>d===selectedDate)||[,])[1]||[];
    const W=420,HEADER=90,MH=90,PAD=14,FOOT=40;
    const H=HEADER+MH*matches.length+FOOT;
    const canvas=document.createElement("canvas");
    const DPR=2;canvas.width=W*DPR;canvas.height=H*DPR;
    const ctx=canvas.getContext("2d");ctx.scale(DPR,DPR);

    // Background
    const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,"#0a1628");bg.addColorStop(0.5,"#0f1e38");bg.addColorStop(1,"#0a1628");
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#c9a84c";ctx.fillRect(0,0,W,4);

    // Header
    ctx.fillStyle="#c9a84c";ctx.font=`700 32px BebasNeue,Arial`;ctx.textAlign="center";
    ctx.fillText("⚽ MUNDIALITO 2026 🏆",W/2,42);
    ctx.fillStyle="#4a5a7a";ctx.font=`400 12px DMSans,Arial`;
    const d=new Date(selectedDate+"T12:00:00");
    ctx.fillText(d.toLocaleDateString(lang==="es"?"es-ES":"en-AU",{weekday:"long",day:"numeric",month:"long"}),W/2,62);
    ctx.fillStyle="#c9a84c";ctx.globalAlpha=0.2;
    ctx.fillRect(PAD*2,74,W-PAD*4,1);ctx.globalAlpha=1;

    // Matches
    for(let mi=0;mi<matches.length;mi++){
      const m=matches[mi];
      const y=HEADER+mi*MH;
      const result=matchResults[m.id];
      const [a,b]=m.t;
      const ta=TBN[a],tb=TBN[b];
      const oa=ownership[a],ob=ownership[b];
      const out=getMatchOutcome(result);

      // Card bg
      ctx.fillStyle="rgba(26,39,68,0.5)";
      ctx.strokeStyle="#2a3a5c";ctx.lineWidth=1;
      ctx.beginPath();
      ctx.roundRect?ctx.roundRect(PAD,y+4,W-PAD*2,MH-8,8):ctx.rect(PAD,y+4,W-PAD*2,MH-8);
      ctx.fill();ctx.stroke();

      // Group badge — centred at top
      ctx.fillStyle="#1e2f50";
      const badgeW=52,badgeH=16,badgeX=W/2-badgeW/2;
      ctx.beginPath();ctx.roundRect?ctx.roundRect(badgeX,y+8,badgeW,badgeH,4):ctx.rect(badgeX,y+8,badgeW,badgeH);ctx.fill();
      ctx.fillStyle="#8899b4";ctx.font=`700 10px BebasNeue,Arial`;ctx.textAlign="center";
      ctx.fillText(`GRP ${m.g}`,W/2,y+20);

      // Content shifted down 6px for balance under the centred badge
      const OFFSET=6;

      // Score or kickoff — dead centre
      ctx.textAlign="center";
      if(result&&result.home!=null&&result.away!=null){
        ctx.font=`700 30px BebasNeue,Arial`;
        ctx.fillStyle="#e0dcd4";
        ctx.fillText(`${result.home} – ${result.away}`,W/2,y+MH/2+10+OFFSET);
      } else if(m.ko){
        ctx.font=`700 16px BebasNeue,Arial`;ctx.fillStyle="#c9a84c";
        ctx.fillText(fmtKickoff(m.d,m.ko),W/2,y+MH/2+2+OFFSET);
        ctx.font=`400 9px DMSans,Arial`;ctx.fillStyle="#4a5a7a";
        ctx.fillText("SGT",W/2,y+MH/2+14+OFFSET);
      } else {
        ctx.font=`700 20px BebasNeue,Arial`;ctx.fillStyle="#4a5a7a";
        ctx.fillText("–",W/2,y+MH/2+8+OFFSET);
      }

      // Draw each team — flag above name close to score, initials on outer edge
      const drawTeam=(name,flag,owner,isHome,ptsEarned)=>{
        const isWin=out&&((isHome&&out==="A")||(!isHome&&out==="B"));
        const isLoss=out&&((isHome&&out==="B")||(!isHome&&out==="A"));
        const col=owner!=null?getPlayerColor(owner.playerIdx,PC[owner.playerIdx]):"#8899b4";
        ctx.globalAlpha=isLoss?0.4:1;

        // Outer initials chip
        if(owner!=null){
          const chipColor=getPlayerColor(owner.playerIdx,PC[owner.playerIdx]);
          const chipX=isHome?PAD+6:W-PAD-6-26;
          const chipY=y+MH/2-13+OFFSET;
          ctx.fillStyle=chipColor;
          ctx.beginPath();ctx.roundRect?ctx.roundRect(chipX,chipY,26,26,5):ctx.rect(chipX,chipY,26,26);ctx.fill();
          ctx.fillStyle="#0a1628";ctx.font=`700 13px BebasNeue,Arial`;ctx.textAlign="center";
          ctx.fillText((initials[owner.playerIdx]||"?"),chipX+13,chipY+18);
          if(ptsEarned>0){
            ctx.globalAlpha=1;
            ctx.fillStyle=chipColor;ctx.font=`700 10px DMSans,Arial`;
            ctx.textAlign=isHome?"left":"right";
            ctx.fillText(`+${ptsEarned}`,isHome?chipX+30:chipX-4,chipY+18);
          }
        }

        // Flag centred above name, close to score boxes
        const cx=isHome?W/2-72:W/2+72;
        ctx.globalAlpha=isLoss?0.4:1;
        ctx.font=`400 22px Arial`;ctx.textAlign="center";
        ctx.fillText(flag||"",cx,y+MH/2-6+OFFSET);

        // Country name below flag
        ctx.fillStyle=isWin?(col||"#e0dcd4"):"#c8c0b0";
        ctx.font=`600 10px DMSans,Arial`;
        const fn=countryFixture(name,lang);
        ctx.fillText(fn,cx,y+MH/2+10+OFFSET);
        ctx.globalAlpha=1;
      };

      // Calculate pts earned per team
      const ptsA=out?(out==="A"?3:out==="D"?1:0):0;
      const ptsB=out?(out==="B"?3:out==="D"?1:0):0;
      drawTeam(a,ta?.flag,oa?.playerIdx!=null?oa:null,true,ptsA);
      drawTeam(b,tb?.flag,ob?.playerIdx!=null?ob:null,false,ptsB);

      // Divider
      if(mi<matches.length-1){
        ctx.fillStyle="#1e2f50";ctx.globalAlpha=0.5;
        ctx.fillRect(PAD+20,y+MH-1,W-PAD*2-40,1);ctx.globalAlpha=1;
      }
    }

    // Footer
    ctx.fillStyle="#2a3a5c";ctx.font=`400 11px DMSans,Arial`;ctx.textAlign="center";
    ctx.fillText("elmundialito.github.io/2026",W/2,HEADER+MH*matches.length+24);

    canvas.toBlob(async blob=>{
      if(!blob)return;
      const file=new File([blob],"mundialito-results.png",{type:"image/png"});
      if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
        try{await navigator.share({files:[file],title:"Mundialito Results"});}catch(e){}
      } else {
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");a.href=url;a.download="mundialito-results.png";a.click();
        URL.revokeObjectURL(url);
      }
    },"image/png");
    onClose();
  };

  return(
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",background:"linear-gradient(165deg,#0a1628,#0f1e38)",borderRadius:"20px 20px 0 0",padding:"20px 16px 36px",border:"1px solid #2a3a5c"}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:3,color:"var(--accent)",marginBottom:16,textAlign:"center"}}>
          📤 {lang==="es"?"COMPARTIR DÍA":"SHARE DAY"}
        </div>
        <div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",marginBottom:12}}>
          {lang==="es"?"Selecciona el día:":"Select day:"}
        </div>
        <select value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}
          style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1px solid #2a3a5c",background:"rgba(26,39,68,0.8)",color:"#e0dcd4",fontFamily:"'DM Sans'",fontSize:14,marginBottom:16,outline:"none"}}>
          {dates.map(d=>{
            const dt=new Date(d+"T12:00:00");
            const label=dt.toLocaleDateString(lang==="es"?"es-ES":"en-AU",{weekday:"short",day:"numeric",month:"short"});
            const isToday=d===today;
            return <option key={d} value={d}>{isToday?(lang==="es"?"HOY":"TODAY")+" · "+label:label}</option>;
          })}
        </select>
        <button onClick={generateAndShare} style={{width:"100%",padding:"14px 0",borderRadius:12,border:"none",background:"linear-gradient(135deg,var(--accent),#b8923c)",color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:3,cursor:"pointer"}}>
          {lang==="es"?"GENERAR Y COMPARTIR":"GENERATE & SHARE"} 📤
        </button>
      </div>
    </div>
  );
}

function ScheduleView({matchesByDate,today,todaySGT,matchResults,ownership,onSet,readOnly,initials,myTeams,setOpenChatId,setOpenPredictId,matchChat,predictions,myPlayerIdx,config,lang,showPast,setShowPast,collapsedDays={},setCollapsedDays,myTeamsOnly=false}) {
  const filteredByDate=useMemo(()=>{
    if(!myTeamsOnly)return matchesByDate;
    return matchesByDate.map(([date,matches])=>[date,matches.filter(m=>myTeams.has(m.t[0])||myTeams.has(m.t[1]))]).filter(([,matches])=>matches.length>0);
  },[matchesByDate,myTeamsOnly,myTeams]);
  const yesterday=new Date(Date.now()-86400000).toLocaleDateString("en-CA");
  const tomorrow=new Date(Date.now()+86400000).toLocaleDateString("en-CA");
  const scrollTargetRef=useRef(null);

  // Last fully completed day = last day where ALL matches have scores
  // Collapse threshold: the latest day that has at least one score entered.
  // Everything before that day collapses — as soon as a new matchday starts, previous days collapse.
  const lastActiveDay=useMemo(()=>{
    let last=null;
    for(const [date,matches] of matchesByDate){
      const anyScored=matches.some(m=>matchResults[m.id]!=null);
      if(anyScored)last=date;
    }
    return last;
  },[matchesByDate,matchResults]);

  const pastDates=lastActiveDay?filteredByDate.filter(([date])=>date<lastActiveDay):[];
  const presentFutureDates=lastActiveDay?filteredByDate.filter(([date])=>date>=lastActiveDay):filteredByDate;

  // Auto-scroll to today on mount
  useEffect(()=>{
    const t=setTimeout(()=>{
      if(scrollTargetRef.current){
        const rect=scrollTargetRef.current.getBoundingClientRect();
        window.scrollTo({top:window.scrollY+rect.top-90,behavior:"smooth"});
      }
    },150);
    return()=>clearTimeout(t);
  },[]);
  const totalPastScored=pastDates.reduce((acc,[,matches])=>acc+matches.filter(m=>matchResults[m.id]!=null).length,0);
  const totalPastMatches=pastDates.reduce((acc,[,matches])=>acc+matches.length,0);
  return(<>
    {pastDates.length>0&&(
      <div style={{marginBottom:12,marginTop:4}}>
        <button onClick={()=>setShowPast(o=>!o)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:10,border:"1px solid #1e2f50",background:"rgba(26,39,68,0.3)",cursor:"pointer"}}>
          <span style={{fontFamily:"'Bebas Neue'",fontSize:13,letterSpacing:2,color:"#5a6a8a"}}>{showPast?"▲":"▼"} {lang==="es"?"PARTIDOS ANTERIORES":"PAST MATCHES"}</span>
          <span style={{fontFamily:"'DM Sans'",fontSize:10,color:"#3d5070",marginLeft:"auto"}}>{totalPastScored}/{totalPastMatches}</span>
        </button>
        {showPast&&pastDates.map(([date,matches])=>(
          <PastDayRow key={date} date={date} matches={matches} matchResults={matchResults} ownership={ownership} onSet={onSet} readOnly={readOnly} initials={initials} myTeams={myTeams} openChat={setOpenChatId} openPredict={setOpenPredictId} matchChat={matchChat} predictions={predictions} myPlayerIdx={myPlayerIdx} playerCount={config.playerCount} lang={lang} playerNames={config.playerNames||[]}/>
        ))}
      </div>
    )}
    {presentFutureDates.map(([date,matches])=>{
      const isToday=date===today;
      const isYesterday=date===yesterday;
      const isTomorrow=date===tomorrow;
      const scored=matches.filter(m=>matchResults[m.id]!=null).length;
      const isCollapsed=!!collapsedDays[date];
      const toggleCollapse=()=>setCollapsedDays(p=>({...p,[date]:!p[date]}));
      const isScrollTarget=date===today;
      return(
        <div key={date} ref={isScrollTarget?scrollTargetRef:null} style={{marginBottom:isCollapsed?4:18,marginTop:8,borderRadius:isToday?10:0,border:isToday?"1px solid rgba(201,168,76,0.2)":"none",background:isToday?"rgba(201,168,76,0.03)":"transparent",padding:isToday?"10px":"0"}}>
          <div onClick={toggleCollapse} style={{display:"flex",alignItems:"center",gap:10,marginBottom:isCollapsed?0:10,paddingTop:4,cursor:"pointer"}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:isToday?22:18,letterSpacing:3,color:isToday?"var(--accent)":isYesterday?"#8899b4":"#c8c0b0"}}>{fmtDate(date,lang)}</div>
            {isToday&&<div style={{padding:"2px 10px",borderRadius:10,background:"rgba(201,168,76,0.25)",border:"1px solid rgba(201,168,76,0.5)",fontFamily:"'Bebas Neue'",fontSize:11,color:"var(--accent)",letterSpacing:2}}>⚡ {t(lang,"today")}</div>}
            {isYesterday&&<div style={{padding:"2px 8px",borderRadius:10,background:"rgba(138,153,180,0.1)",border:"1px solid rgba(138,153,180,0.2)",fontFamily:"'Bebas Neue'",fontSize:10,color:"#5a6a8a",letterSpacing:1}}>{lang==="es"?"AYER":"YESTERDAY"}</div>}
            {isTomorrow&&<div style={{padding:"2px 8px",borderRadius:10,background:"rgba(138,153,180,0.1)",border:"1px solid rgba(138,153,180,0.2)",fontFamily:"'Bebas Neue'",fontSize:10,color:"#5a6a8a",letterSpacing:1}}>{lang==="es"?"MAÑANA":"TOMORROW"}</div>}
            <div style={{flex:1,height:isToday?2:1,background:isToday?"rgba(201,168,76,0.4)":"rgba(138,153,180,0.2)"}}/>
            <span style={{fontFamily:"'DM Sans'",fontSize:10,color:isToday?"var(--accent)":"#5a6a8a",fontWeight:isToday?600:400}}>{scored}/{matches.length} {isCollapsed?"▼":"▲"}</span>
          </div>
          {!isCollapsed&&matches.map(m=><GroupMatchCard key={m.id} match={m} result={matchResults[m.id]} ownership={ownership} onSet={onSet} readOnly={readOnly} initials={initials} myTeams={myTeams} onOpenChat={()=>setOpenChatId(m.id)} chatCount={(matchChat[m.id]?.messages||[]).length} hasReactions={Object.values(matchChat[m.id]?.reactions||{}).some(a=>a.length>0)} onOpenPredict={()=>setOpenPredictId(m.id)} matchPredictions={predictions[m.id]||{}} myPlayerIdx={myPlayerIdx} playerCount={config.playerCount} playerNames={config.playerNames||[]}/>)}
        </div>
      );
    })}
  </>);
}

function PastDayRow({date,matches,matchResults,ownership,onSet,readOnly,initials,myTeams,openChat,openPredict,matchChat,predictions,myPlayerIdx,playerCount,lang,playerNames=[]}) {
  const [open,setOpen]=useState(false);
  const scored=matches.filter(m=>matchResults[m.id]!=null).length;
  return(
    <div style={{marginTop:6}}>
      <div onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 4px",cursor:"pointer"}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:3,color:"#5a6a8a"}}>{fmtDate(date,lang)}</div>
        <div style={{flex:1,height:1,background:"rgba(26,39,68,0.8)"}}/>
        <span style={{fontFamily:"'DM Sans'",fontSize:10,color:"#3d5070",background:"rgba(26,39,68,0.6)",padding:"1px 8px",borderRadius:8}}>{scored}/{matches.length} {open?"▲":"▼"}</span>
      </div>
      {open&&matches.map(m=><GroupMatchCard key={m.id} match={m} result={matchResults[m.id]} ownership={ownership} onSet={onSet} readOnly={readOnly} initials={initials} myTeams={myTeams} onOpenChat={()=>openChat(m.id)} chatCount={(matchChat[m.id]?.messages||[]).length} hasReactions={Object.values(matchChat[m.id]?.reactions||{}).some(a=>a.length>0)} onOpenPredict={()=>openPredict(m.id)} matchPredictions={predictions[m.id]||{}} myPlayerIdx={myPlayerIdx} playerCount={playerCount} playerNames={playerNames||[]}/>)}
    </div>
  );
}

function GroupStageScreen({config,picks,matchResults,setMatchResults,readOnly,initials,myPlayerIdx,onPicsLoaded,onPredictionsUpdate,bracket={},koResults={},playerRankings=[],groupOrderOverride={},setGroupOrderOverride}) {
  const lang=useContext(LangContext);
  const bumpPicsCtx=useContext(PicBumpContext);
  const [matchChat,setMatchChat]=useState({});
  const [predictions,setPredictions]=useState({});
  const [openChatId,setOpenChatId]=useState(null);
  const [openPredictId,setOpenPredictId]=useState(null);
  const [showShareDay,setShowShareDay]=useState(false);
  const [showShareStandings,setShowShareStandings]=useState(false);
  const poolCode=window.localStorage?.getItem("mundi_pool_code")||window.localStorage?.getItem("mundi_spectator_code");

  // Load profile pics as soon as this screen mounts
  useEffect(()=>{
    if(!poolCode)return;
    loadProfilePics(poolCode).then(()=>{
      if(bumpPicsCtx)bumpPicsCtx();
      if(onPicsLoaded)onPicsLoaded();
    });
  },[]);

  // Subscribe to matchChat via onSnapshot — also grab pics/colours from same document
  useEffect(()=>{
    if(!poolCode)return;
    let picsLoadedFromChat=false;
    const unsub=onSnapshot(doc(db,"pools",poolCode),(snap)=>{
      if(snap.exists()){
        setMatchChat(snap.data().matchChat||{});
        const preds=snap.data().predictions||{};
        setPredictions(preds);
        if(onPredictionsUpdate)onPredictionsUpdate(preds);
        // First snapshot — populate pic cache from same document fetch
        if(!picsLoadedFromChat){
          picsLoadedFromChat=true;
          const data=snap.data();
          const profiles=data.profiles||{};
          Object.keys(profiles).forEach(k=>{picCache[parseInt(k)]=profiles[k];});
          const colors=data.playerColors||{};
          Object.keys(colors).forEach(k=>{colorCache[parseInt(k)]=colors[k];});
          saveCaches();
          if(bumpPicsCtx) bumpPicsCtx();
          else if(onPicsLoaded) onPicsLoaded();
        }
      }
    });
    return()=>unsub();
  },[poolCode]);
  const [flash,setFlash]=useState(null);
  const [view,setView]=useState("schedule");
  const [showPast,setShowPast]=useState(false);
  const [collapsedDays,setCollapsedDays]=useState({});
  const [myTeamsOnly,setMyTeamsOnly]=useState(false);
  const ownership=useMemo(()=>{const o={};(picks||[]).forEach(p=>{o[p.team]={playerIdx:p.playerIdx,name:config.playerNames[p.playerIdx]};});return o;},[picks,config.playerNames]);
  const myTeams=useMemo(()=>myPlayerIdx!==null?new Set((picks||[]).filter(p=>p.playerIdx===myPlayerIdx).map(p=>p.team)):new Set(),[picks,myPlayerIdx]);
  const playerPts=useMemo(()=>Array.from({length:config.playerCount},(_,i)=>playerGSPts(i,picks||[],matchResults)),[config.playerCount,picks,matchResults]);
  const matchesByDate=useMemo(()=>{
    const g={};
    GM.forEach(m=>{
      let localDate=m.d;
      if(m.ko){
        try{
          const utcDt=new Date(m.d+"T"+m.ko+":00Z");
          localDate=utcDt.toLocaleDateString("en-CA");
        }catch(e){}
      }
      if(!g[localDate])g[localDate]=[];
      g[localDate].push(m);
    });
    return Object.entries(g).sort(([a],[b])=>a.localeCompare(b));
  },[]);
  const recorded=useMemo(()=>Object.keys(matchResults).filter(id=>matchResults[id]!=null).length,[matchResults]);
  const today=new Date().toLocaleDateString("en-CA");
  // Collapse threshold uses Singapore time (UTC+8) so all players see same collapsed/expanded state
  const todaySGT=new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10);

  // Find the last date that has at least one score entered
  const onSet=(matchId,val)=>{
    if(readOnly)return;
    const match=GM.find(m=>m.id===matchId);
    if(match&&val){const out=getMatchOutcome(val);const fp=[];const[a,b]=match.t;const oA=ownership[a],oB=ownership[b];if(out==="A"&&oA)fp.push(`+3 pts · ${config.playerNames[oA.playerIdx]}`);else if(out==="B"&&oB)fp.push(`+3 pts · ${config.playerNames[oB.playerIdx]}`);else if(out==="D"){if(oA)fp.push(`+1 · ${config.playerNames[oA.playerIdx]}`);if(oB)fp.push(`+1 · ${config.playerNames[oB.playerIdx]}`);}if(fp.length){setFlash(fp.join("  ·  "));setTimeout(()=>setFlash(null),2500);}}
    setMatchResults(r=>{
      const newResults=val==null?{...r,[matchId]:undefined}:{...r,[matchId]:val};
      return newResults;
    });
  };

  return(
    <div style={{maxWidth:920,margin:"0 auto",padding:"0 16px"}}>
      <div style={{background:"linear-gradient(135deg,rgba(201,168,76,0.06),rgba(26,39,68,0.4))",border:"1px solid rgba(201,168,76,0.15)",borderRadius:12,padding:"10px 14px",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontFamily:"'Bebas Neue'",fontSize:12,letterSpacing:2,color:"#5a6a8a"}}>{t(lang,"players")}</span>
          <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#5a6a8a"}}>{recorded}/72</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
        {playerRankings.map(({name:n,idx:i,total})=>{
          const pcolor=getPlayerColor(i,PC[i]);
          return(
          <div key={i} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 8px",borderRadius:8,background:`${pcolor}12`,border:`1px solid ${pcolor}33`}}>
            <div style={{width:18,height:18,borderRadius:4,background:pcolor,color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{initials[i]}</div>
            <span style={{fontFamily:"'DM Sans'",fontSize:11,fontWeight:600,color:pcolor,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n}</span>
            <span style={{fontFamily:"'Bebas Neue'",fontSize:13,color:pcolor,letterSpacing:1,flexShrink:0}}>{total}<span style={{fontSize:8,color:`${pcolor}99`,marginLeft:1}}>pts</span></span>
          </div>
          );
        })}
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:16,alignItems:"center"}}>
        {[{id:"schedule",icon:"📅",labelKey:"matchSchedule"},{id:"standings",icon:"📊",labelKey:"groupStandings"}].map(v=>{const active=v.id===view;return <button key={v.id} onClick={()=>setView(v.id)} style={{padding:"9px 16px",borderRadius:8,border:active?"2px solid var(--accent)":"2px solid #2a3a5c",background:active?"rgba(201,168,76,0.1)":"rgba(26,39,68,0.4)",color:active?"var(--accent)":"#5a6a8a",fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:1.5,cursor:"pointer"}}>{v.icon} {t(lang,v.labelKey)}</button>;})}
        <button onClick={()=>view==="standings"?setShowShareStandings(true):setShowShareDay(true)} style={{marginLeft:"auto",padding:"9px 12px",borderRadius:8,border:"1px solid rgba(201,168,76,0.3)",background:"rgba(201,168,76,0.06)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:13,letterSpacing:1,cursor:"pointer",flexShrink:0}}>📤</button>
      </div>
      {view==="schedule"&&<ScheduleView matchesByDate={matchesByDate} today={today} todaySGT={todaySGT} matchResults={matchResults} ownership={ownership} onSet={onSet} readOnly={readOnly} initials={initials} myTeams={myTeams} setOpenChatId={setOpenChatId} setOpenPredictId={setOpenPredictId} matchChat={matchChat} predictions={predictions} myPlayerIdx={myPlayerIdx} config={config} lang={lang} showPast={showPast} setShowPast={setShowPast} collapsedDays={collapsedDays} setCollapsedDays={setCollapsedDays} myTeamsOnly={myTeamsOnly}/>}
      {view==="schedule"&&myTeams.size>0&&(
        <button onClick={()=>setMyTeamsOnly(o=>!o)} style={{position:"fixed",bottom:28,left:16,zIndex:100,padding:"8px 14px",borderRadius:20,background:myTeamsOnly?"rgba(201,168,76,0.95)":"rgba(10,22,40,0.95)",border:"1px solid rgba(201,168,76,0.5)",color:myTeamsOnly?"#0a1628":"var(--accent)",fontSize:13,fontFamily:"'Bebas Neue'",letterSpacing:1.5,cursor:"pointer",display:"flex",alignItems:"center",gap:5,backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",boxShadow:"0 2px 16px rgba(0,0,0,0.5)"}}>
          ⭐ {myTeamsOnly?(lang==="es"?"TODOS":"ALL GAMES"):(lang==="es"?"MIS EQUIPOS":"MY TEAMS")}
        </button>
      )}
      {view==="standings"&&Object.keys(GROUPS).map(g=><GroupStandingsAccordion key={g} g={g} res={matchResults} ownership={ownership} initials={initials} isHost={!readOnly} groupOverride={groupOrderOverride[g]||null} setGroupOverride={(grp,order)=>setGroupOrderOverride&&setGroupOrderOverride(grp,order)}/>)}
      {view==="standings"&&<Live3rdPlaceTable matchResults={matchResults} ownership={ownership} initials={initials} lang={lang} groupOrderOverride={groupOrderOverride}/>}
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {flash&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"rgba(10,22,40,0.95)",border:"1px solid rgba(201,168,76,0.4)",borderRadius:30,padding:"10px 22px",fontFamily:"'DM Sans'",fontSize:13,fontWeight:600,color:"var(--accent)",whiteSpace:"nowrap",zIndex:200,animation:"slideUp 0.3s ease-out"}}>⚽ {flash}</div>}
      {showShareDay&&(()=>{
        const dates=matchesByDate.map(([d])=>d);
        return(
          <ShareDayModal
            open={true}
            onClose={()=>setShowShareDay(false)}
            dates={dates}
            today={today}
            matchesByDate={matchesByDate}
            matchResults={matchResults}
            ownership={ownership}
            initials={initials}
            config={config}
            lang={lang}
          />
        );
      })()}
      {showShareStandings&&<ShareStandingsModal onClose={()=>setShowShareStandings(false)} matchResults={matchResults} ownership={ownership} initials={initials} config={config} lang={lang} groupOrderOverride={groupOrderOverride}/>}
      {openChatId&&(()=>{const m=GM.find(x=>x.id===openChatId);return m?<MatchChatModal open={true} onClose={()=>setOpenChatId(null)} match={m} poolCode={poolCode} myPlayerIdx={myPlayerIdx} playerNames={config.playerNames} initials={initials} matchChat={matchChat[openChatId]||{}}/>:null;})()}
      {openPredictId&&(()=>{const m=GM.find(x=>x.id===openPredictId);return m?<PredictModal open={true} onClose={()=>setOpenPredictId(null)} match={m} result={matchResults[openPredictId]} poolCode={poolCode} myPlayerIdx={myPlayerIdx} playerNames={config.playerNames} initials={initials} matchPredictions={predictions[openPredictId]||{}}/>:null;})()}
    </div>
  );
}

function KoTeamDisplay({team,slot,owner,initials,isWinner,hasResult,isHome,playerNames=[]}) {
  const lang=useContext(LangContext);
  const t=team?TBN[team]:null;const color=owner!=null?getPlayerColor(owner.playerIdx,PC[owner.playerIdx]):null;const faded=hasResult&&!isWinner;
  const fn=team?countryFixture(team,lang):"";
  const fs=fn.length>9?9:10;
  return(
    <div style={{flex:1,display:"flex",alignItems:"center",minWidth:0,opacity:faded?0.5:1,flexDirection:isHome?"row-reverse":"row",gap:4}}>
      {team?(<>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:0,width:72,background:isWinner?"rgba(97,169,120,0.15)":"transparent",border:isWinner?"1px solid rgba(97,169,120,0.45)":"1px solid transparent",borderRadius:6,padding:"3px 5px"}}>
          <span style={{fontSize:15,lineHeight:1,flexShrink:0,display:"block",textAlign:"center"}}>{t?.flag}</span>
          <span style={{fontFamily:"'DM Sans'",fontSize:fs,fontWeight:600,color:"#e0dcd4",lineHeight:1.2,textAlign:"center",hyphens:"manual",marginTop:2,display:"block"}} dangerouslySetInnerHTML={{__html:fn}}/>
        </div>
        <div style={{flex:1,minWidth:0}}/>
        {owner!=null
          ?<OwnerChip playerIdx={owner.playerIdx} initials={initials} size={20} playerName={playerNames[owner.playerIdx]||""}/>
          :<div style={{width:20,height:20,flexShrink:0}}/>}
      </>):(
        <div style={{flex:1,display:"flex",justifyContent:isHome?"flex-end":"flex-start"}}>
          <span style={{fontFamily:"'DM Sans'",fontSize:10,color:"#3d5070",fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{slot}</span>
        </div>
      )}
    </div>
  );
}

function PenaltyModal({open,onClose,teamA,teamB,onPick}) {
  if(!open)return null;
  const ta=TBN[teamA],tb=TBN[teamB];
  const lang=useContext(LangContext);
  return(
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:340,background:"linear-gradient(165deg,#0a1628,#0f1e38)",borderRadius:16,border:"1px solid #2a3a5c",padding:"20px 18px",textAlign:"center"}}>
        <div style={{fontSize:26,marginBottom:6}}>🥅</div>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,color:"var(--accent)",marginBottom:4}}>{lang==="es"?"EMPATE — PENALES":"DRAW — PENALTIES"}</div>
        <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#8899b4",marginBottom:18}}>{lang==="es"?"¿Quién avanzó?":"Who advanced?"}</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>onPick("A")} style={{flex:1,padding:"16px 8px",borderRadius:12,border:"1.5px solid rgba(97,169,120,0.4)",background:"rgba(97,169,120,0.08)",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <span style={{fontSize:26}}>{ta?.flag}</span>
            <span style={{fontFamily:"'DM Sans'",fontSize:12,fontWeight:600,color:"#e0dcd4"}}>{teamA}</span>
          </button>
          <button onClick={()=>onPick("B")} style={{flex:1,padding:"16px 8px",borderRadius:12,border:"1.5px solid rgba(107,155,209,0.4)",background:"rgba(107,155,209,0.08)",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <span style={{fontSize:26}}>{tb?.flag}</span>
            <span style={{fontFamily:"'DM Sans'",fontSize:12,fontWeight:600,color:"#e0dcd4"}}>{teamB}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function KoScoreEntry({matchId,teamA,teamB,result,onSetResult,readOnly}) {
  const [hv,setHv]=useState(result?.home??"");
  const [av,setAv]=useState(result?.away??"");
  useEffect(()=>{setHv(result?.home??"");setAv(result?.away??"");},[result?.home,result?.away]);
  const [showPenalty,setShowPenalty]=useState(false);
  const inp=(val,setVal,side)=><input type="number" min="0" max="20" value={val} readOnly={readOnly} onChange={e=>{
    const v=e.target.value;setVal(v);
    const h=side==="home"?v:hv, a=side==="away"?v:av;
    const hi=h===""?null:parseInt(h), ai=a===""?null:parseInt(a);
    if(hi!=null&&ai!=null&&!isNaN(hi)&&!isNaN(ai)){
      if(hi===ai){setShowPenalty(true);}
      else{onSetResult({home:hi,away:ai,winner:hi>ai?"A":"B",pens:false});}
    } else if(h===""&&a===""){
      onSetResult(undefined);
    }
  }} style={{width:40,padding:"6px 0",textAlign:"center",borderRadius:8,border:"1.5px solid #2a3a5c",background:"rgba(10,22,40,0.6)",color:"#e0dcd4",fontFamily:"'Bebas Neue'",fontSize:22,outline:"none",cursor:readOnly?"default":"text"}} onFocus={e=>!readOnly&&(e.target.style.borderColor="var(--accent)")} onBlur={e=>e.target.style.borderColor="#2a3a5c"}/>;
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center",flexShrink:0}}>
      {inp(hv,setHv,"home")}
      <span style={{fontFamily:"'Bebas Neue'",fontSize:14,color:"#5a6a8a",letterSpacing:1}}>–</span>
      {inp(av,setAv,"away")}
      <PenaltyModal open={showPenalty} onClose={()=>setShowPenalty(false)} teamA={teamA} teamB={teamB} onPick={side=>{
        const hi=parseInt(hv),ai=parseInt(av);
        onSetResult({home:hi,away:ai,winner:side,pens:true});
        setShowPenalty(false);
      }}/>
    </div>
  );
}

function KoMatchCard({match,teamA,teamB,result,onSetOverride,onSetResult,ownership,initials,readOnly,playerNames=[],myTeams=new Set(),onOpenChat,chatCount=0,hasReactions=false,matchPredictions={},myPlayerIdx,poolCode,onOpenPredict,overrideMode=false}) {
  const lang=useContext(LangContext);
  const w=koWinner(result);
  const winA=w==="A";const winB=w==="B";const hasResult=!!w;
  const hasScore=result&&typeof result==="object"&&result.home!=null&&result.away!=null;
  const wasPens=hasScore&&result.pens;
  const oA=teamA?ownership[teamA]:null;const oB=teamB?ownership[teamB]:null;
  const [editOpen,setEditOpen]=useState(false);const [editA,setEditA]=useState("");const [editB,setEditB]=useState("");
  useEffect(()=>{if(overrideMode){setEditA(teamA||"");setEditB(teamB||"");setEditOpen(true);}else{setEditOpen(false);};},[overrideMode]);
  const winColor=winA?(oA?getPlayerColor(oA.playerIdx):"#61a978"):winB?(oB?getPlayerColor(oB.playerIdx):"#6b9bd1"):null;
  const isMyMatch=teamA&&teamB&&(myTeams.has(teamA)||myTeams.has(teamB));
  const myHasA=myTeams.has(teamA),myHasB=myTeams.has(teamB),myBoth=myHasA&&myHasB;
  const cardBg="rgba(10,22,40,0.4)";
  const cardBorder=isMyMatch?"1px solid rgba(201,168,76,0.5)":"1px solid #1e2f50";
  const cardShadow="none";
  const bothConfirmed=!!(teamA&&teamB);
  const predCount=Object.keys(matchPredictions).length;
  return(
    <div style={{background:cardBg,borderRadius:10,padding:"10px 12px",border:cardBorder,boxShadow:cardShadow,marginBottom:6,position:"relative"}}>
      <div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#5a6a8a",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative"}}>
        <span style={{background:"rgba(138,153,180,0.12)",padding:"1px 6px",borderRadius:4,fontFamily:"'Bebas Neue'",letterSpacing:1,fontSize:11,color:"#8899b4"}}>M{match.n}</span>
        {match.ko&&!hasResult&&<span style={{position:"absolute",left:"50%",transform:"translateX(-50%)",fontFamily:"'Bebas Neue'",fontSize:11,color:"var(--accent)",letterSpacing:1,whiteSpace:"nowrap"}}>{fmtKickoff(match.d,match.ko)}</span>}
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          {/* 🔮 predictions — show when both teams confirmed */}
          {bothConfirmed&&KO_ODDS[match.id]&&onOpenPredict&&(()=>{const myPred=myPlayerIdx!=null?matchPredictions[myPlayerIdx]:null;const predCount=Object.keys(matchPredictions).length;return(<button onClick={onOpenPredict} style={{display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:10,border:`1px solid ${myPred!=null?"rgba(107,155,209,0.4)":"rgba(107,155,209,0.2)"}`,background:myPred!=null?"rgba(107,155,209,0.15)":"rgba(107,155,209,0.06)",color:"#6b9bd1",cursor:"pointer",fontSize:12,fontFamily:"'DM Sans'",flexShrink:0}}>🔮{predCount>0&&<span style={{fontSize:10,fontWeight:600}}>{predCount}</span>}</button>);})()}
          {/* 🎬 highlights — 2.5hrs after kickoff */}
          {bothConfirmed&&match.ko&&(()=>{
            const kickoffUTC=new Date(match.d+"T"+match.ko+":00Z");
            if(Date.now()<kickoffUTC.getTime()+2.5*60*60*1000)return null;
            const query=encodeURIComponent(`${teamA} vs ${teamB} 2026 World Cup highlights`);
            return(
              <a href={`https://www.youtube.com/results?search_query=${query}`} target="_blank" rel="noopener noreferrer"
                style={{display:"flex",alignItems:"center",padding:"2px 7px",borderRadius:10,border:"1px solid rgba(255,80,80,0.3)",background:"rgba(255,80,80,0.08)",color:"#ff6b6b",fontSize:12,textDecoration:"none"}}>🎬</a>
            );
          })()}
          {/* 💬 chat — show when both teams confirmed */}
          {bothConfirmed&&onOpenChat&&<button onClick={onOpenChat} style={{display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:10,border:`1px solid ${(chatCount>0||hasReactions)?"rgba(201,168,76,0.3)":"#2a3a5c"}`,background:(chatCount>0||hasReactions)?"rgba(201,168,76,0.08)":"transparent",color:(chatCount>0||hasReactions)?"var(--accent)":"#5a6a8a",cursor:"pointer",fontSize:12}}>💬{chatCount>0&&<span style={{fontFamily:"'DM Sans'",fontSize:10,fontWeight:600}}>{chatCount}</span>}</button>}
          {/* edit handled by clicking the score boxes directly, host only */}
        </div>
      </div>
      {editOpen&&overrideMode&&(
        <div style={{background:"rgba(26,39,68,0.6)",borderRadius:8,padding:"10px",marginBottom:8,border:"1px solid #2a3a5c"}}>
          {["a","b"].map(side=>(
            <div key={side} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
              <span style={{fontSize:10,color:"#5a6a8a",width:12}}>{side.toUpperCase()}</span>
              <select value={side==="a"?editA:editB} onChange={e=>side==="a"?setEditA(e.target.value):setEditB(e.target.value)} style={{flex:1,padding:"5px 8px",borderRadius:6,border:"1px solid #2a3a5c",background:"rgba(10,22,40,0.8)",color:"#e0dcd4",fontSize:11,outline:"none"}}>
                <option value="">Keep auto ({side==="a"?match.sA:match.sB})</option>
                {TEAMS.map(tm=><option key={tm.name} value={tm.name}>{tm.name}</option>)}
              </select>
            </div>
          ))}
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>{if(editA)onSetOverride(match.id,"a",editA);if(editB)onSetOverride(match.id,"b",editB);setEditOpen(false);}} style={{flex:1,padding:"6px 0",borderRadius:6,border:"none",background:"var(--accent)",color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:12,letterSpacing:1.5,cursor:"pointer"}}>SAVE</button>
            <button onClick={()=>setEditOpen(false)} style={{padding:"6px 12px",borderRadius:6,border:"1px solid #2a3a5c",background:"transparent",color:"#5a6a8a",fontSize:11,cursor:"pointer"}}>Cancel</button>
            {(teamA||teamB)&&<button onClick={()=>{onSetOverride(match.id,"a",undefined);onSetOverride(match.id,"b",undefined);setEditOpen(false);}} style={{padding:"6px 10px",borderRadius:6,border:"1px solid #d97757",background:"transparent",color:"#d97757",fontSize:11,cursor:"pointer"}}>Clear</button>}
          </div>
        </div>
      )}
      {/* YOUR TEAM badge */}
      {isMyMatch&&<div style={{display:"flex",justifyContent:"center",marginBottom:4}}><span style={{fontFamily:"'Bebas Neue'",fontSize:10,color:"var(--accent)",letterSpacing:1,background:"rgba(201,168,76,0.15)",padding:"1px 6px",borderRadius:4,whiteSpace:"nowrap"}}>{myBoth?`⭐ ${t(lang,"yourTeams")} ⭐`:myHasA?`⭐ ${t(lang,"yourTeam")}`:(`${t(lang,"yourTeam")} ⭐`)}</span></div>}
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <KoTeamDisplay team={teamA} slot={match.sA} owner={oA} initials={initials} isWinner={winA} hasResult={hasResult} isHome={true} playerNames={playerNames}/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,minWidth:88}}>
          {!(teamA||teamB)?(
            <span style={{fontFamily:"'DM Sans'",fontSize:9,color:"#3d5070",fontStyle:"italic",textAlign:"center"}}>TBD</span>
          ):readOnly&&hasResult?(
            <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center",flexShrink:0}}>
              <span style={{width:40,textAlign:"center",color:"#e0dcd4",fontFamily:"'Bebas Neue'",fontSize:24,display:"inline-block"}}>{result.home!=null?result.home:""}</span>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:36}}>
                <span style={{fontFamily:"'Bebas Neue'",fontSize:14,color:"#5a6a8a",letterSpacing:1}}>–</span>
                {(winA||winB)&&(()=>{const wo=winA?oA:oB;return wo!=null?<div style={{width:18,height:18,borderRadius:4,background:getPlayerColor(wo.playerIdx,PC[wo.playerIdx]),color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center"}}>{initials[wo.playerIdx]}</div>:null;})()}
              </div>
              <span style={{width:40,textAlign:"center",color:"#e0dcd4",fontFamily:"'Bebas Neue'",fontSize:24,display:"inline-block"}}>{result.away!=null?result.away:""}</span>
            </div>
          ):(
            <KoScoreEntry matchId={match.id} teamA={teamA} teamB={teamB} result={result} onSetResult={val=>!readOnly&&onSetResult(match.id,val)} readOnly={readOnly}/>
          )}
        </div>
        <KoTeamDisplay team={teamB} slot={match.sB} owner={oB} initials={initials} isWinner={winB} hasResult={hasResult} isHome={false} playerNames={playerNames}/>
      </div>
      {wasPens&&(()=>{const winTeam=winA?teamA:teamB;const winFlag=TBN[winTeam]?.flag||"";return(
        <div style={{textAlign:"center",marginTop:4}}>
          <span style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",display:"inline-flex",alignItems:"center",gap:5}}><span style={{fontSize:20}}>{winFlag}</span> {lang==="es"?"ganó en penales":"won on penalties"}</span>
        </div>
      );})()}
    </div>
  );
}

function TournamentWinnerWidget({ownership,initials,lang,playerNames=[],bracket={},koResults={}}) {
  const [open,setOpen]=useState(false);
  const [odds,setOdds]=useState(null);
  const [loading,setLoading]=useState(false);
  const [lastFetched,setLastFetched]=useState(null);
  const [err,setErr]=useState(null);

  const POLY_TO_TEAM={
    'France':'FRANCE','Spain':'SPAIN','Argentina':'ARGENTINA','England':'ENGLAND',
    'Portugal':'PORTUGAL','Germany':'GERMANY','Brazil':'BRAZIL','Netherlands':'NETHERLANDS',
    'USA':'USA','Norway':'NORWAY','Japan':'JAPAN','Morocco':'MOROCCO',
    'Colombia':'COLOMBIA','Mexico':'MEXICO','Belgium':'BELGIUM','Switzerland':'SWITZERLAND',
    'Senegal':'SENEGAL','Croatia':'CROATIA','Uruguay':'URUGUAY','Ecuador':'ECUADOR',
    'Austria':'AUSTRIA','Canada':'CANADA','Australia':'AUSTRALIA','South Korea':'SOUTH KOREA',
    'Sweden':'SWEDEN','Scotland':'SCOTLAND','Ivory Coast':'IVORY COAST',
    "Côte d'Ivoire":'IVORY COAST',"Cote d'Ivoire":'IVORY COAST',
    'DR Congo':'DR CONGO','Cape Verde':'CAPE VERDE','Saudi Arabia':'SAUDI ARABIA',
    'New Zealand':'NEW ZEALAND','Paraguay':'PARAGUAY','Iraq':'IRAQ',
    'Algeria':'ALGERIA','Tunisia':'TUNISIA','Iran':'IRAN','Panama':'PANAMA',
    'Ghana':'GHANA','Qatar':'QATAR','Bosnia-Herzegovina':'BOSNIA AND HERZEGOVINA',
    'Bosnia and Herzegovina':'BOSNIA AND HERZEGOVINA','Czechia':'CZECHIA',
    'Egypt':'EGYPT','Uzbekistan':'UZBEKISTAN','Turkey':'TÜRKIYE','Turkiye':'TÜRKIYE',
    'Jordan':'JORDAN','Haiti':'HAITI','Curacao':'CURAÇAO','Curaçao':'CURAÇAO',
    'South Africa':'SOUTH AFRICA',
  };

  const fetchOdds=async()=>{
    setLoading(true);setErr(null);
    try{
      const res=await fetch('https://gamma-api.polymarket.com/events?slug=world-cup-winner');
      const data=await res.json();
      const markets=data[0]?.markets||[];
      const allTeams=markets.map(m=>{
        let price=0;
        try{const prices=JSON.parse(m.outcomePrices||'[]');price=parseFloat(prices[0])||0;}catch(e){}
        const name=(m.groupItemTitle||m.question||'').replace(/Will (.+) win.*/i,'$1').trim();
        return{name,pct:Math.round(price*100),rawPct:price*100};
      });
      const POLY_MAP={'France':'FRANCE','Spain':'SPAIN','Argentina':'ARGENTINA','England':'ENGLAND','Portugal':'PORTUGAL','Germany':'GERMANY','Brazil':'BRAZIL','Netherlands':'NETHERLANDS','USA':'USA','United States':'USA','Norway':'NORWAY','Japan':'JAPAN','Morocco':'MOROCCO','Colombia':'COLOMBIA','Mexico':'MEXICO','Belgium':'BELGIUM','Switzerland':'SWITZERLAND','Canada':'CANADA','Egypt':'EGYPT','Paraguay':'PARAGUAY','Australia':'AUSTRALIA','South Korea':'SOUTH KOREA','Sweden':'SWEDEN','Croatia':'CROATIA','Senegal':'SENEGAL','Ecuador':'ECUADOR','Austria':'AUSTRIA','Ivory Coast':'IVORY COAST',"Côte d'Ivoire":'IVORY COAST','DR Congo':'DR CONGO','Cape Verde':'CAPE VERDE','Saudi Arabia':'SAUDI ARABIA','South Africa':'SOUTH AFRICA','Ghana':'GHANA','Bosnia-Herzegovina':'BOSNIA AND HERZEGOVINA','Uruguay':'URUGUAY'};
      // Build surviving teams: start with all R16 entrants, remove losers from each round
      const eliminated=new Set();
      const surviving=new Set();
      // First, add all R16 teams
      KM.filter(m=>m.round==='r16').forEach(m=>{
        const bk=bracket[m.id];
        if(bk?.a)surviving.add(bk.a);
        if(bk?.b)surviving.add(bk.b);
      });
      // Then remove losers from each subsequent round
      ['r16','qf','sf','third','final'].forEach(r=>{
        KM.filter(m=>m.round===r).forEach(m=>{
          const bk=bracket[m.id];
          if(!bk?.a&&!bk?.b)return;
          const result=koResults[m.id];
          if(result){
            const w=koWinner(result);
            if(w==='A'){eliminated.add(bk.b);}
            else if(w==='B'){eliminated.add(bk.a);}
          }
        });
      });
      eliminated.forEach(t=>surviving.delete(t));
      let teams;
      if(surviving.size>0){
        teams=[...surviving].map(internalName=>{
          const polyName=Object.entries(POLY_MAP).find(([,v])=>v===internalName)?.[0];
          const found=allTeams.find(t=>t.name===polyName||POLY_MAP[t.name]===internalName);
          return{name:internalName,pct:found?.rawPct>=1?Math.round(found.rawPct):null,rawPct:found?.rawPct||0};
        }).sort((a,b)=>b.rawPct-a.rawPct);
      } else {
        teams=allTeams.filter(t=>t.pct>=1).sort((a,b)=>b.pct-a.pct);
      }
      setOdds(teams);setLastFetched(new Date());
    }catch(e){setErr(lang==="es"?"No se pudieron cargar. Intenta de nuevo.":"Could not load odds. Try again.");}
    setLoading(false);
  };

  const handleOpen=()=>{setOpen(true);fetchOdds();};
  const fmtTime=d=>d?d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):null;

  return(<>
    {/* Tappable banner */}
    <button onClick={handleOpen} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",background:"linear-gradient(135deg,rgba(201,168,76,0.08),rgba(26,39,68,0.5))",border:"1px solid rgba(201,168,76,0.25)",borderRadius:12,padding:"12px 16px",marginBottom:14,cursor:"pointer",textAlign:"left"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:20}}>🏆</span>
        <div>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:15,letterSpacing:2,color:"var(--accent)"}}>{lang==="es"?"MÁS PROBABLE GANADOR":"MOST LIKELY TO WIN"}</div>
          <div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#5a6a8a"}}>Polymarket · {lang==="es"?"probabilidad en vivo":"live probability"}</div>
        </div>
      </div>
      <span style={{fontFamily:"'Bebas Neue'",fontSize:12,color:"var(--accent)",letterSpacing:1,flexShrink:0}}>TAP TO VIEW →</span>
    </button>

    {/* Modal */}
    {open&&(
      <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:"0 0 0 0"}} onClick={()=>setOpen(false)}>
        <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:520,maxHeight:"85vh",background:"linear-gradient(165deg,#0a1628,#0f1e38)",borderRadius:"16px 16px 0 0",border:"1px solid rgba(201,168,76,0.25)",borderBottom:"none",display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {/* Header */}
          <div style={{padding:"16px 18px 12px",borderBottom:"1px solid #1e2f50",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
            <div>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:2,color:"var(--accent)"}}>🏆 {lang==="es"?"MÁS PROBABLE GANADOR":"MOST LIKELY TO WIN"}</div>
              <div style={{fontFamily:"'DM Sans'",fontSize:9,color:"#5a6a8a",marginTop:2}}>
                Polymarket · {lang==="es"?"probabilidad en vivo":"live probability"}
                {lastFetched&&<span> · {lang==="es"?"actualizado":"updated"} {fmtTime(lastFetched)}</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={e=>{e.stopPropagation();fetchOdds();}} disabled={loading} style={{padding:"5px 10px",borderRadius:7,border:"1px solid rgba(201,168,76,0.4)",background:"rgba(201,168,76,0.08)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:11,letterSpacing:1,cursor:loading?"default":"pointer",opacity:loading?0.6:1}}>
                {loading?"...":"↻"}
              </button>
              <button onClick={()=>setOpen(false)} style={{width:28,height:28,borderRadius:7,border:"1px solid #2a3a5c",background:"transparent",color:"#5a6a8a",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
          </div>
          {/* Content */}
          <div style={{overflowY:"auto",padding:"12px 18px 20px",flex:1}}>
            {err&&<div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#d97757",marginBottom:8}}>{err}</div>}
            {loading&&!odds&&<div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#5a6a8a",textAlign:"center",padding:"20px 0"}}>Loading...</div>}
            {odds&&(
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {odds.map((team,i)=>{
                  const internalName=POLY_TO_TEAM[team.name]||team.name.toUpperCase();
                  const tm=TBN[internalName];
                  const o=ownership[internalName];
                  const pcolor=o?getPlayerColor(o.playerIdx,PC[o.playerIdx]):"#8899b4";
                  const barColor=o?pcolor:"rgba(201,168,76,0.5)";
                  const barW=Math.round((team.rawPct||team.pct||0)/(odds[0]?.rawPct||odds[0]?.pct||1)*100);
                  const displayPct=team.pct!=null?`${team.pct}%`:"<1%";
                  return(
                    <div key={team.name} style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontFamily:"'Bebas Neue'",fontSize:10,color:"#5a6a8a",width:16,textAlign:"right",flexShrink:0}}>{i+1}</span>
                      <span style={{fontSize:14,flexShrink:0}}>{tm?.flag||"🏳️"}</span>
                      <span style={{fontFamily:"'DM Sans'",fontSize:12,fontWeight:600,color:pcolor,width:95,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tm?countryName(internalName,lang):team.name}</span>
                      {o&&<OwnerChip playerIdx={o.playerIdx} initials={initials} size={16} playerName={playerNames[o.playerIdx]||""}/>}
                      <div style={{flex:1,height:6,borderRadius:3,background:"rgba(26,39,68,0.8)",overflow:"hidden"}}>
                        <div style={{height:"100%",width:barW+"%",borderRadius:3,background:barColor,transition:"width 0.4s"}}/>
                      </div>
                      <span style={{fontFamily:"'Bebas Neue'",fontSize:13,color:pcolor,width:32,textAlign:"right",flexShrink:0}}>{displayPct}</span>
                    </div>
                  );
                })}

              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </>);
}

// KO prediction button — opens full-screen modal matching group stage design
function KoOddsPopup({matchId,teamA,teamB,lang,hasResult,myPlayerIdx,playerNames=[],initials,matchPredictions={},poolCode,koOdds=null}) {
  const [open,setOpen]=useState(false);
  const predCount=Object.keys(matchPredictions).length;
  const myPred=myPlayerIdx!=null?matchPredictions[myPlayerIdx]:null;
  if(!koOdds)return null;
  return(
    <>
      <button onClick={()=>setOpen(true)} style={{display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:10,border:`1px solid ${myPred!=null?"rgba(107,155,209,0.4)":"rgba(107,155,209,0.2)"}`,background:myPred!=null?"rgba(107,155,209,0.15)":"rgba(107,155,209,0.06)",color:"#6b9bd1",cursor:"pointer",fontSize:12,fontFamily:"'DM Sans'",flexShrink:0}}>
        🔮{predCount>0&&<span style={{fontSize:10,fontWeight:600}}>{predCount}</span>}
      </button>
      {open&&<KoPredictModal matchId={matchId} teamA={teamA} teamB={teamB} koOdds={koOdds} poolCode={poolCode} myPlayerIdx={myPlayerIdx} playerNames={playerNames} initials={initials} matchPredictions={matchPredictions} hasResult={hasResult} onClose={()=>setOpen(false)}/>}
    </>
  );
}

function KoPredictModal({matchId,teamA,teamB,koOdds,poolCode,myPlayerIdx,playerNames=[],initials,matchPredictions={},hasResult,koWinnerSide=null,onClose}) {
  const lang=useContext(LangContext);
  const picVersion=useContext(PicContext);
  const ta=TBN[teamA],tb=TBN[teamB];
  const [homeP,awayP]=koOdds;
  const myPick=myPlayerIdx!=null?matchPredictions[String(myPlayerIdx)]:null;
  const isLocked=hasResult;
  // Map A/B winner to home/away for button colouring
  const winKey=koWinnerSide==="A"?"home":koWinnerSide==="B"?"away":null;

  const getColor=(key)=>{
    if(winKey&&winKey===key)return "#61a978";
    if(winKey)return "#3d5070";
    return "#6b9bd1";
  };

  const doPick=async(outcome)=>{
    if(isLocked||myPlayerIdx===null)return;
    const code=poolCode||window.localStorage?.getItem("mundi_pool_code")||window.localStorage?.getItem("mundi_spectator_code");
    if(!code)return;
    await savePrediction(code,matchId,myPlayerIdx,outcome);
  };

  const outcomes=[
    {key:"home",flag:ta?.flag||"🏳️",name:countryName(teamA,lang)||teamA,pct:homeP},
    {key:"away",flag:tb?.flag||"🏳️",name:countryName(teamB,lang)||teamB,pct:awayP},
  ];

  const byOutcome={home:[],away:[]};
  Object.entries(matchPredictions).forEach(([idx,outcome])=>{
    if(byOutcome[outcome])byOutcome[outcome].push(parseInt(idx));
  });

  return(
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxHeight:"80vh",background:"linear-gradient(165deg,#0a1628,#0f1e38)",borderRadius:"20px 20px 0 0",display:"flex",flexDirection:"column",overflow:"hidden",border:"1px solid #2a3a5c"}}>
        {/* Header */}
        <div style={{padding:"14px 16px 10px",borderBottom:"1px solid #1e2f50",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:22}}>{ta?.flag}</span>
            <span style={{fontFamily:"'Bebas Neue'",fontSize:16,color:"#8899b4",letterSpacing:1}}>vs</span>
            <span style={{fontSize:22}}>{tb?.flag}</span>
            <span style={{fontFamily:"'DM Sans'",fontSize:13,fontWeight:600,color:"#e0dcd4",marginLeft:4}}>{countryName(teamA,lang)} · {countryName(teamB,lang)}</span>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#5a6a8a",fontSize:20,cursor:"pointer",padding:"0 4px"}}>✕</button>
        </div>

        <div style={{overflowY:"auto",padding:"14px 16px 24px",display:"flex",flexDirection:"column",gap:14}}>
          {/* Odds section */}
          <div style={{background:"rgba(10,22,40,0.5)",borderRadius:12,padding:"14px 16px",border:"1px solid #1a2d4a"}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:11,letterSpacing:1.5,color:"#5a6a8a",marginBottom:12}}>{lang==="es"?"PRONÓSTICO PREVIO":"PRE-MATCH ODDS"}</div>
            {outcomes.map(({key,flag,name,pct})=>{
              const col=getColor(key);
              return(
                <div key={key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:key==="away"?0:10}}>
                  <span style={{fontSize:18,width:24,textAlign:"center",flexShrink:0}}>{flag}</span>
                  <span style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:500,color:"#c8c0b0",flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}</span>
                  <div style={{width:90,height:6,background:"#1a2d4a",borderRadius:4,overflow:"hidden",flexShrink:0}}>
                    <div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:4}}/>
                  </div>
                  <span style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:700,color:col,minWidth:36,textAlign:"right"}}>{pct}%</span>
                </div>
              );
            })}
          </div>

          {/* Pick section */}
          <div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:11,letterSpacing:1.5,color:"#5a6a8a",marginBottom:10}}>
              {isLocked?(lang==="es"?"PREDICCIONES":"PREDICTIONS"):(lang==="es"?"¿QUIÉN PASA?":"WHO GOES THROUGH?")}
              {isLocked&&<span style={{fontFamily:"'DM Sans'",fontSize:9,color:"#3d5070",marginLeft:8,fontWeight:400,letterSpacing:0}}>· {lang==="es"?"bloqueado":"locked at kickoff"}</span>}
            </div>
            <div style={{display:"flex",gap:8}}>
              {outcomes.map(({key,flag,name})=>{
                const picked=myPick===key;
                const iHaveOne=myPick!==null;
                const col=getColor(key);
                const isWinner=winKey===key;
                return(
                  <div key={key} style={{flex:1,display:"flex",flexDirection:"column",gap:6,alignItems:"center"}}>
                    <button
                      onClick={()=>doPick(key)}
                      disabled={isLocked}
                      style={{
                        width:"100%",padding:"14px 4px",borderRadius:12,
                        border:`2px solid ${picked?col:isWinner?col:`${col}44`}`,
                        background:picked?`${col}22`:isWinner?"rgba(97,169,120,0.08)":"rgba(26,39,68,0.4)",
                        color:picked?col:isWinner?col:"#8899b4",
                        cursor:isLocked?"default":"pointer",
                        display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                        opacity:isLocked&&!picked&&iHaveOne&&!isWinner?0.4:1,
                        transition:"all 0.15s"
                      }}>
                      <span style={{fontSize:28}}>{flag}</span>
                      <span style={{fontFamily:"'DM Sans'",fontSize:12,fontWeight:600,textAlign:"center",lineHeight:1.2}}>{name}</span>
                      {picked&&<span style={{fontSize:10,color:col,fontFamily:"'DM Sans'",fontWeight:700}}>✓ {lang==="es"?"tu voto":"your pick"}</span>}
                      {isWinner&&!picked&&<span style={{fontSize:10,color:"#61a978",fontFamily:"'DM Sans'",fontWeight:700}}>✓ {lang==="es"?"resultado":"result"}</span>}
                    </button>
                    {byOutcome[key].length>0&&(
                      <div style={{display:"flex",flexWrap:"wrap",gap:3,justifyContent:"center"}}>
                        {byOutcome[key].map(idx=>(
                          <AvatarWithName key={idx} idx={idx} name={playerNames[idx]||`P${idx+1}`} size={24} picVersion={picVersion}/>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {!isLocked&&myPlayerIdx===null&&(
              <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#5a6a8a",textAlign:"center",marginTop:8}}>
                {lang==="es"?"Selecciona tu jugador para predecir":"Select your player to make a prediction"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Share KO matches (stage or day) as canvas image
function ShareKOMatchesModal({onClose,matches,bracket,koResults,ownership,initials,lang,roundLabel,isStage,shareDate,config}) {
  const [generating,setGenerating]=useState(false);
  const generate=async()=>{
    setGenerating(true);
    try{
      const bebas=new FontFace("BebasNeue","url(https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXoo9WdhyyTh89ZNpQ.woff2)");
      const dm=new FontFace("DMSans","url(https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZa4ET-DNl0.woff2)");
      await Promise.all([bebas.load(),dm.load()]);
      document.fonts.add(bebas);document.fonts.add(dm);
    }catch(e){}
    const W=420,HEADER=90,MH=90,PAD=14,FOOT=40;
    const H=HEADER+MH*matches.length+FOOT;
    const canvas=document.createElement("canvas");
    const DPR=2;canvas.width=W*DPR;canvas.height=H*DPR;
    const ctx=canvas.getContext("2d");ctx.scale(DPR,DPR);
    const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,"#0a1628");bg.addColorStop(0.5,"#0f1e38");bg.addColorStop(1,"#0a1628");
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#c9a84c";ctx.fillRect(0,0,W,4);
    ctx.fillStyle="#c9a84c";ctx.font=`700 32px BebasNeue,Arial`;ctx.textAlign="center";
    ctx.fillText("⚽ MUNDIALITO 2026 🏆",W/2,42);
    ctx.fillStyle="#4a5a7a";ctx.font=`400 12px DMSans,Arial`;
    ctx.fillText(roundLabel.toUpperCase(),W/2,62);
    ctx.fillStyle="#c9a84c";ctx.globalAlpha=0.2;ctx.fillRect(PAD*2,74,W-PAD*4,1);ctx.globalAlpha=1;
    for(let mi=0;mi<matches.length;mi++){
      const m=matches[mi];
      const y=HEADER+mi*MH;
      const bk=bracket[m.id]||{};
      const a=bk.a||null,b=bk.b||null;
      const ta=a?TBN[a]:null,tb=b?TBN[b]:null;
      const oa=a?ownership[a]:null,ob=b?ownership[b]:null;
      const result=koResults[m.id];
      const w=result?koWinner(result):null;
      ctx.fillStyle="rgba(26,39,68,0.5)";ctx.strokeStyle="#2a3a5c";ctx.lineWidth=1;
      ctx.beginPath();ctx.roundRect?ctx.roundRect(PAD,y+4,W-PAD*2,MH-8,8):ctx.rect(PAD,y+4,W-PAD*2,MH-8);ctx.fill();ctx.stroke();
      // Match badge
      ctx.fillStyle="#1e2f50";const badgeW=52,badgeH=16,badgeX=W/2-badgeW/2;
      ctx.beginPath();ctx.roundRect?ctx.roundRect(badgeX,y+8,badgeW,badgeH,4):ctx.rect(badgeX,y+8,badgeW,badgeH);ctx.fill();
      ctx.fillStyle="#8899b4";ctx.font=`700 10px BebasNeue,Arial`;ctx.textAlign="center";
      // Stage view: show date; Day view: show round label
      const ROUND_ABBR={"Round of 32":"R32","Round of 16":"R16","Quarter-finals":"QF","Semi-finals":"SF","Final":"FINAL","3rd Place":"3RD"};
      const badgeText=isStage?(()=>{try{const d=new Date(m.d+"T"+(m.ko||"12:00")+":00Z");return d.toLocaleDateString("en-AU",{day:"numeric",month:"short"}).toUpperCase();}catch(e){return m.d;}})():(ROUND_ABBR[roundLabel]||roundLabel.toUpperCase().slice(0,5));
      ctx.fillText(badgeText,W/2,y+20);
      const OFFSET=6;
      if(result&&result.home!=null&&result.away!=null){
        ctx.font=`700 30px BebasNeue,Arial`;ctx.fillStyle="#e0dcd4";ctx.textAlign="center";
        ctx.fillText(`${result.home} – ${result.away}`,W/2,y+MH/2+10+OFFSET);
        if(result.pens){
          const w=result.winner==="A"?a:b;
          const wName=w?(TBN[w]?.name||w).toUpperCase():"";
          ctx.font=`600 9px DMSans,Arial`;ctx.fillStyle="#e0dcd4";
          ctx.fillText(`${wName} won on penalties`,W/2,y+MH/2+22+OFFSET);
        }
      } else if(m.ko){
        ctx.font=`700 16px BebasNeue,Arial`;ctx.fillStyle="#c9a84c";ctx.textAlign="center";
        ctx.fillText(fmtKickoff(m.d,m.ko),W/2,y+MH/2+2+OFFSET);
        ctx.font=`400 9px DMSans,Arial`;ctx.fillStyle="#4a5a7a";ctx.fillText("SGT",W/2,y+MH/2+14+OFFSET);
      } else {
        ctx.font=`700 20px BebasNeue,Arial`;ctx.fillStyle="#4a5a7a";ctx.textAlign="center";ctx.fillText("–",W/2,y+MH/2+8+OFFSET);
      }
      const drawSide=(name,flag,owner,isHome,isWinner)=>{
        const isLoser=w&&!isWinner;
        const col=owner!=null?getPlayerColor(owner.playerIdx,PC[owner.playerIdx]):"#8899b4";
        ctx.globalAlpha=isLoser?0.4:1;
        if(owner!=null){
          const chipX=isHome?PAD+6:W-PAD-32;const chipY=y+MH/2-13+OFFSET;
          ctx.fillStyle=col;ctx.beginPath();ctx.roundRect?ctx.roundRect(chipX,chipY,26,26,5):ctx.rect(chipX,chipY,26,26);ctx.fill();
          ctx.fillStyle="#0a1628";ctx.font=`700 13px BebasNeue,Arial`;ctx.textAlign="center";
          ctx.fillText(initials[owner.playerIdx]||"?",chipX+13,chipY+18);
        }
        const cx=isHome?W/2-72:W/2+72;
        ctx.font=`400 22px Arial`;ctx.textAlign="center";ctx.fillText(flag||"❓",cx,y+MH/2-6+OFFSET);
        ctx.fillStyle="#e0dcd4";ctx.font=`600 10px DMSans,Arial`;
        ctx.fillText(name?(countryFixture(name,lang)||name):(m.sA&&isHome?m.sA:m.sB&&!isHome?m.sB:"TBD"),cx,y+MH/2+10+OFFSET);
        ctx.globalAlpha=1;
      };
      drawSide(a,ta?.flag,oa?.playerIdx!=null?oa:null,true,w==="A");
      drawSide(b,tb?.flag,ob?.playerIdx!=null?ob:null,false,w==="B");
    }
    ctx.fillStyle="#2a3a5c";ctx.font=`400 11px DMSans,Arial`;ctx.textAlign="center";
    ctx.fillText("elmundialito.github.io/2026",W/2,HEADER+MH*matches.length+24);
    const blob=await new Promise(res=>canvas.toBlob(res,"image/png"));
    setGenerating(false);
    if(!blob)return;
    const file=new File([blob],"mundialito-ko.png",{type:"image/png"});
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
      try{await navigator.share({files:[file],title:"Mundialito KO"});}catch(e){}
    } else {const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="mundialito-ko.png";a.click();URL.revokeObjectURL(url);}
    onClose();
  };
  return(
    <div style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",background:"#0a1628",borderRadius:"20px 20px 0 0",border:"1px solid #2a3a5c",padding:"20px 16px 32px"}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:2,color:"#8899b4",marginBottom:6}}>SHARE · {roundLabel.toUpperCase()}</div>
        <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#5a6a8a",marginBottom:20}}>{matches.length} matches</div>
        <button onClick={generate} disabled={generating} style={{width:"100%",padding:"14px",borderRadius:10,border:"1px solid rgba(201,168,76,0.4)",background:"rgba(201,168,76,0.1)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:15,letterSpacing:1.5,cursor:"pointer",marginBottom:10}}>
          {generating?"GENERATING...":"GENERATE & SHARE 📤"}
        </button>
        <button onClick={onClose} style={{width:"100%",padding:"12px",borderRadius:10,border:"none",background:"transparent",color:"#5a6a8a",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer"}}>Cancel</button>
      </div>
    </div>
  );
}

// Share full bracket as canvas image — proper tree geometry
function ShareKOBracketModal({onClose,bracket,koResults,ownership,initials,lang,config,canShare=true}) {
  const [generating,setGenerating]=useState(false);
  const [imgUrl,setImgUrl]=useState(null);
  const [blobReady,setBlobReady]=useState(false);
  const blobRef=useRef(null);

  const buildCanvas=async()=>{
    try{
      const bebas=new FontFace("BebasNeue","url(https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXoo9WdhyyTh89ZNpQ.woff2)");
      const dm=new FontFace("DMSans","url(https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZa4ET-DNl0.woff2)");
      await Promise.all([bebas.load(),dm.load()]);
      document.fonts.add(bebas);document.fonts.add(dm);
    }catch(e){}

    // Content-driven layout — no fixed slot grid, positions calculated from content
    // CH=26 (large readable chips), tight gaps between matches
    const CH=30,INNER_GAP=5,MATCH_GAP=22;
    const matchH=CH*2+INNER_GAP; // 56px per match pair
    const HEADER=66,FOOTER=26;
    const totalContent=8*matchH+7*MATCH_GAP; // 644px
    const H=totalContent+HEADER+FOOTER; // 736px
    const W=840,DPR=2;
    const canvas=document.createElement("canvas");
    canvas.width=W*DPR;canvas.height=H*DPR;
    const ctx=canvas.getContext("2d");ctx.scale(DPR,DPR);

    const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,"#080f1e");bg.addColorStop(0.5,"#0a1628");bg.addColorStop(1,"#080f1e");
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#c9a84c";ctx.fillRect(0,0,W,3);
    ctx.fillStyle="#c9a84c";ctx.font=`700 26px BebasNeue,Arial`;ctx.textAlign="center";
    ctx.fillText("⚽  MUNDIALITO 2026  🏆",W/2,34);
    ctx.fillStyle="#3d5070";ctx.font=`400 10px DMSans,Arial`;
    ctx.fillText("KNOCKOUT BRACKET",W/2,50);
    ctx.fillStyle="#c9a84c";ctx.globalAlpha=0.15;ctx.fillRect(20,58,W-40,1);ctx.globalAlpha=1;

    // Column layout: 9 cols [R32,R16,QF,SF,FINAL,SF,QF,R16,R32]
    const CW=[112,88,76,68,76,68,76,88,112];
    const CGAP=5;
    const totalCW=CW.reduce((a,b)=>a+b)+CGAP*8;
    const margin=(W-totalCW)/2;
    const colX=[margin];
    for(let i=1;i<9;i++)colX.push(colX[i-1]+CW[i-1]+CGAP);
    const colCX=i=>colX[i]+CW[i]/2;

    // Column headers
    const colLabels=["R32","R16","QF","SF","FINAL","SF","QF","R16","R32"];
    colLabels.forEach((lbl,i)=>{
      ctx.fillStyle=lbl==="FINAL"?"#c9a84c":"#2a3a5c";
      ctx.font=`700 9px BebasNeue,Arial`;ctx.textAlign="center";
      ctx.fillText(lbl,colCX(i),63);
    });

    // Calculate Y centre of each R32 match (0-7, top to bottom)
    const r32Y=i=>HEADER+i*(matchH+MATCH_GAP)+matchH/2;

    // Left R32 match order (top→bottom): K73,K76,K75,K78,K82,K81,K84,K83
    // Right R32 match order (top→bottom): K74,K77,K79,K80,K87,K86,K85,K88
    const leftR32= ["K73","K76","K75","K78","K82","K81","K84","K83"];
    const rightR32=["K74","K77","K79","K80","K87","K86","K85","K88"];

    // R16 centres = midpoint between their two R32 feeders
    // K90=mid(K73,K76), K89=mid(K75,K78), K94=mid(K82,K81), K93=mid(K84,K83)
    const lR16Y=[
      (r32Y(0)+r32Y(1))/2, // K90
      (r32Y(2)+r32Y(3))/2, // K89
      (r32Y(4)+r32Y(5))/2, // K94
      (r32Y(6)+r32Y(7))/2, // K93
    ];
    const rR16Y=[
      (r32Y(0)+r32Y(1))/2, // K91
      (r32Y(2)+r32Y(3))/2, // K92
      (r32Y(4)+r32Y(5))/2, // K95
      (r32Y(6)+r32Y(7))/2, // K96
    ];
    // QF
    const lQFY=[(lR16Y[0]+lR16Y[1])/2,(lR16Y[2]+lR16Y[3])/2]; // K97,K98
    const rQFY=[(rR16Y[0]+rR16Y[1])/2,(rR16Y[2]+rR16Y[3])/2]; // K99,K100
    // SF
    const lSFY=(lQFY[0]+lQFY[1])/2; // K101
    const rSFY=(rQFY[0]+rQFY[1])/2; // K102
    // Final
    const finY=(lSFY+rSFY)/2; // K104

    // All match Y positions keyed by ID
    const matchY={};
    leftR32.forEach((id,i)=>{matchY[id]=r32Y(i);});
    rightR32.forEach((id,i)=>{matchY[id]=r32Y(i);});
    const matchCol={};
    leftR32.forEach(id=>{matchCol[id]=0;});
    rightR32.forEach(id=>{matchCol[id]=8;});
    [["K90",1,lR16Y[0]],["K89",1,lR16Y[1]],["K94",1,lR16Y[2]],["K93",1,lR16Y[3]],
     ["K91",7,rR16Y[0]],["K92",7,rR16Y[1]],["K95",7,rR16Y[2]],["K96",7,rR16Y[3]],
     ["K97",2,lQFY[0]],["K98",2,lQFY[1]],["K99",6,rQFY[0]],["K100",6,rQFY[1]],
     ["K101",3,lSFY],["K102",5,rSFY],["K104",4,finY],
    ].forEach(([id,col,y])=>{matchCol[id]=col;matchY[id]=y;});

    // Draw connection lines (behind chips)
    const connections=[
      ["K73","K90"],["K76","K90"],["K75","K89"],["K78","K89"],
      ["K82","K94"],["K81","K94"],["K84","K93"],["K83","K93"],
      ["K90","K97"],["K89","K97"],["K94","K98"],["K93","K98"],
      ["K97","K101"],["K98","K101"],["K101","K104"],["K102","K104"],
      ["K74","K91"],["K77","K91"],["K79","K92"],["K80","K92"],
      ["K87","K95"],["K86","K95"],["K85","K96"],["K88","K96"],
      ["K91","K99"],["K92","K99"],["K95","K100"],["K96","K100"],
      ["K99","K102"],["K100","K102"],
    ];
    ctx.strokeStyle="#1e3060";ctx.lineWidth=1;
    connections.forEach(([from,to])=>{
      const fc=matchCol[from],tc=matchCol[to];
      const isLeft=fc<4;
      const fw=CW[fc],tw=CW[tc];
      const fx=colCX(fc),fy=matchY[from];
      const tx2=colCX(tc),ty2=matchY[to];
      const edgeX=isLeft?fx+fw/2:fx-fw/2;
      const targetX=isLeft?tx2-tw/2:tx2+tw/2;
      const midX=(edgeX+targetX)/2;
      ctx.beginPath();ctx.moveTo(edgeX,fy);ctx.lineTo(midX,fy);
      ctx.lineTo(midX,ty2);ctx.lineTo(targetX,ty2);ctx.stroke();
    });

    // Helpers
    const abbr3=(team)=>{
      if(!team)return"TBD";
      const n=(TBN[team]?.name||team).toUpperCase();
      const MAP={
        "SPAIN":"ESP","FRANCE":"FRA","ENGLAND":"ENG","BRAZIL":"BRA","PORTUGAL":"POR",
        "ARGENTINA":"ARG","GERMANY":"GER","NETHERLANDS":"NED","NORWAY":"NOR","BELGIUM":"BEL",
        "COLOMBIA":"COL","JAPAN":"JPN","MOROCCO":"MAR","MEXICO":"MEX","CANADA":"CAN",
        "SENEGAL":"SEN","SWEDEN":"SWE","AUSTRIA":"AUT","PARAGUAY":"PAR","EGYPT":"EGY",
        "IVORY COAST":"CIV","BOSNIA AND HERZEGOVINA":"BIH","ALGERIA":"ALG","GHANA":"GHA",
        "AUSTRALIA":"AUS","SOUTH KOREA":"KOR","DR CONGO":"COD","SAUDI ARABIA":"KSA",
        "SOUTH AFRICA":"RSA","CAPE VERDE":"CPV","NEW ZEALAND":"NZL","SWITZERLAND":"SUI",
        "UNITED STATES":"USA","CROATIA":"CRO","ECUADOR":"ECU","SCOTLAND":"SCO",
        "URUGUAY":"URU","IRAN":"IRN","TURKEY":"TUR","TÜRKIYE":"TUR","QATAR":"QAT",
        "IRAQ":"IRQ","PANAMA":"PAN","UZBEKISTAN":"UZB","JORDAN":"JOR","HAITI":"HAI",
      };
      return MAP[n]||n.replace(/[^A-Z]/g,"").slice(0,3);
    };
    const fullName=(team)=>{
      if(!team)return"TBD";
      const n=(TBN[team]?.name||team).toUpperCase();
      const MAP={"BOSNIA AND HERZEGOVINA":"BOSNIA","UNITED STATES":"USA",
        "DR CONGO":"DR CONGO","IVORY COAST":"IVORY CST","CAPE VERDE":"C. VERDE",
        "SOUTH AFRICA":"S. AFRICA","SAUDI ARABIA":"SAUDI ARB","NEW ZEALAND":"N. ZEALAND"};
      return MAP[n]||n;
    };

    // Draw all matches
    const allMatches=[...leftR32,...rightR32,
      "K90","K89","K94","K93","K91","K92","K95","K96",
      "K97","K98","K99","K100","K101","K102","K104"];

    allMatches.forEach(id=>{
      const col=matchCol[id];
      const cy=matchY[id];
      const bk=bracket[id]||{};
      const cx=colCX(col);
      const isR32=(col===0||col===8);
      const isRight=col>=5;
      const isFinal=col===4;
      const chipW=CW[col]-4;
      const chipX=cx-chipW/2;
      const aY=cy-CH-INNER_GAP/2;
      const bY=cy+INNER_GAP/2;
      const result=koResults[id];
      const w=result?koWinner(result):null;
      const winCol="#61a978"; // standard green for all winners

      const drawChip=(team,side,yPos)=>{
        const isWin=w===side.toUpperCase();
        const isLoss=w&&!isWin;
        const tm=team?TBN[team]:null;
        const owner=team?ownership[team]:null;
        const pcol=owner!=null?getPlayerColor(owner.playerIdx,PC[owner.playerIdx]):"#2a3a5c";
        ctx.globalAlpha=isLoss?0.3:1;
        ctx.fillStyle=isWin?`${winCol}26`:isFinal?"rgba(20,35,65,0.95)":"rgba(12,22,45,0.9)";
        ctx.strokeStyle=isWin?winCol:isFinal?"#c9a84c55":"#1e3060";
        ctx.lineWidth=isWin?1.5:1;
        ctx.beginPath();ctx.roundRect?ctx.roundRect(chipX,yPos,chipW,CH,3):ctx.rect(chipX,yPos,chipW,CH);
        ctx.fill();ctx.stroke();
        if(team){
          const label=isR32?fullName(team):abbr3(team);
          const fsize=isR32?(label.length>8?12:14):13;
          if(isRight){
            // right: owner | name | flag
            if(owner!=null){ctx.fillStyle=pcol;ctx.font=`700 11px BebasNeue,Arial`;ctx.textAlign="left";ctx.fillText(initials[owner.playerIdx]||"?",chipX+4,yPos+CH/2+5);}
            ctx.fillStyle=isWin?"#e0dcd4":"#c8c0b0";
            ctx.font=`700 ${fsize}px BebasNeue,Arial`;ctx.textAlign="center";
            ctx.fillText(label,cx+(owner?3:-5),yPos+CH/2+6);
            ctx.font=`400 18px Arial`;ctx.textAlign="right";
            ctx.fillText(tm?.flag||"",chipX+chipW-1,yPos+CH/2+8);
          } else {
            // left + final: flag | name | owner
            ctx.font=`400 18px Arial`;ctx.textAlign="left";ctx.fillText(tm?.flag||"",chipX+2,yPos+CH/2+8);
            ctx.fillStyle=isWin?"#e0dcd4":"#c8c0b0";
            ctx.font=`700 ${fsize}px BebasNeue,Arial`;ctx.textAlign="center";
            ctx.fillText(label,cx+(owner?-3:5),yPos+CH/2+6);
            if(owner!=null){ctx.fillStyle=pcol;ctx.font=`700 11px BebasNeue,Arial`;ctx.textAlign="right";ctx.fillText(initials[owner.playerIdx]||"?",chipX+chipW-3,yPos+CH/2+5);}
          }
        } else {
          const km=KM.find(x=>x.id===id);
          const slotLabel=(side==="a"?km?.sA:km?.sB)||"TBD";
          ctx.fillStyle="#2a3a5c";ctx.font=`400 9px DMSans,Arial`;ctx.textAlign="center";
          ctx.fillText(slotLabel.replace("Win ",""),cx,yPos+CH/2+3);
        }
        ctx.globalAlpha=1;
      };
      drawChip(bk.a,"a",aY);
      drawChip(bk.b,"b",bY);
    });


    // Champion box — above Final, gold border
    // Final pair top chip is at finY - CH - INNER_GAP/2
    // Place champion box above that with 14px gap
    const finY2=matchY["K104"];
    const finalTopChipY=finY2-CH-INNER_GAP/2;
    const champH=CH+4;
    const champY=finalTopChipY-champH-14;
    const champW=CW[4]+20;
    const champX=colCX(4)-champW/2;
    const finalBk=bracket["K104"]||{};
    const champion=(()=>{const w=koResults["K104"]?koWinner(koResults["K104"]):null;if(!w)return null;return w==="A"?finalBk.a:finalBk.b;})();
    const champTm=champion?TBN[champion]:null;
    const champCol="#c9a84c";
    // gold glow bg
    ctx.fillStyle=champion?`${champCol}22`:"rgba(20,35,65,0.95)";
    ctx.strokeStyle="#c9a84c";ctx.lineWidth=1.5;
    ctx.beginPath();ctx.roundRect?ctx.roundRect(champX,champY,champW,champH,4):ctx.rect(champX,champY,champW,champH);
    ctx.fill();ctx.stroke();
    ctx.font=`400 18px Arial`;ctx.textAlign="center";
    ctx.fillText("🏆",colCX(4),champY+champH/2+7);
    if(champion&&champTm){
      ctx.font=`400 14px Arial`;ctx.textAlign="left";ctx.fillText(champTm.flag||"",champX+4,champY+(CH+4)/2+6);
      ctx.fillStyle=champCol;ctx.font=`700 12px BebasNeue,Arial`;ctx.textAlign="center";
      ctx.fillText(fullName(champion),colCX(4),champY+champH/2+6);
    } else {
      ctx.fillStyle="#3d5070";ctx.font=`700 10px BebasNeue,Arial`;ctx.textAlign="center";
      ctx.fillText("CHAMPION",colCX(4),champY+champH/2+5);
    }

    ctx.fillStyle="#1e2f50";ctx.font=`400 9px DMSans,Arial`;ctx.textAlign="center";
    ctx.fillText("elmundialito.github.io/2026",W/2,H-8);
    return canvas;
  };

  useEffect(()=>{
    buildCanvas().then(async canvas=>{
      if(!canvas)return;
      const blob=await new Promise(res=>canvas.toBlob(res,"image/png"));
      if(!blob)return;
      blobRef.current=blob;
      setBlobReady(true);
      setImgUrl(URL.createObjectURL(blob));
    });
  },[]);

  // Share: regenerate fresh on tap (same pattern as working share modals — iOS gesture chain)
  const generate=async()=>{
    setGenerating(true);
    try{
      const canvas=await buildCanvas();
      if(!canvas){setGenerating(false);return;}
      canvas.toBlob(async blob=>{
        setGenerating(false);
        if(!blob)return;
        const file=new File([blob],"mundialito-bracket.png",{type:"image/png"});
        if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
          try{await navigator.share({files:[file],title:"Mundialito 2026 Bracket"});}catch(e){}
        } else {
          const url=URL.createObjectURL(blob);
          const a=document.createElement("a");a.href=url;a.download="mundialito-bracket.png";a.click();
          URL.revokeObjectURL(url);
        }
      },"image/png");
    }catch(e){setGenerating(false);}
  };
  const imgRef=useRef(null);
  const containerRef=useRef(null);
  const zoomState=useRef({scale:1,tx:0,ty:0,lastDist:null,lastMid:null,pointers:{}});

  const clamp=(val,min,max)=>Math.min(Math.max(val,min),max);
  const clampTranslation=(tx,ty,scale)=>{
    if(!imgRef.current||!containerRef.current)return{tx,ty};
    const img=imgRef.current;
    const con=containerRef.current;
    const cW=con.clientWidth, cH=con.clientHeight;
    const iW=img.clientWidth*scale, iH=img.clientHeight*scale;
    // max pan = half the overflow on each side
    const maxX=Math.max(0,(iW-cW)/2);
    const maxY=Math.max(0,(iH-cH)/2);
    return{tx:clamp(tx,-maxX,maxX),ty:clamp(ty,-maxY,maxY)};
  };

  const applyTransform=()=>{
    if(!imgRef.current)return;
    const z=zoomState.current;
    const {tx,ty}=clampTranslation(z.tx,z.ty,z.scale);
    z.tx=tx;z.ty=ty;
    imgRef.current.style.transform=`translate(${tx}px,${ty}px) scale(${z.scale})`;
  };
  const onPointerDown=e=>{
    e.currentTarget.setPointerCapture(e.pointerId);
    zoomState.current.pointers[e.pointerId]={x:e.clientX,y:e.clientY};
  };
  const onPointerMove=e=>{
    const pts=zoomState.current.pointers;
    if(!pts[e.pointerId])return;
    pts[e.pointerId]={x:e.clientX,y:e.clientY};
    const ids=Object.keys(pts);
    if(ids.length===2){
      const [a,b]=[pts[ids[0]],pts[ids[1]]];
      const dist=Math.hypot(b.x-a.x,b.y-a.y);
      const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      const z=zoomState.current;
      if(z.lastDist!==null){
        const scaleDelta=dist/z.lastDist;
        const newScale=Math.min(Math.max(z.scale*scaleDelta,1),5);
        // adjust translation so zoom centres on pinch midpoint
        z.tx=(z.tx-mid.x)*scaleDelta+mid.x+(mid.x-z.lastMid.x);
        z.ty=(z.ty-mid.y)*scaleDelta+mid.y+(mid.y-z.lastMid.y);
        z.scale=newScale;
      }
      z.lastDist=dist;z.lastMid=mid;
    } else if(ids.length===1){
      // single finger pan when zoomed in
      const z=zoomState.current;
      if(z.scale>1&&z.lastMid){
        z.tx+=e.clientX-z.lastMid.x;
        z.ty+=e.clientY-z.lastMid.y;
      }
      z.lastMid={x:e.clientX,y:e.clientY};
    }
    applyTransform();
  };
  const onPointerUp=e=>{
    delete zoomState.current.pointers[e.pointerId];
    const ids=Object.keys(zoomState.current.pointers);
    if(ids.length<2){zoomState.current.lastDist=null;zoomState.current.lastMid=null;}
    if(ids.length===0){
      // reset translation if zoomed back to 1
      if(zoomState.current.scale<=1){zoomState.current.tx=0;zoomState.current.ty=0;applyTransform();}
    }
  };
  const onDblClick=()=>{
    const z=zoomState.current;
    if(z.scale>1){z.scale=1;z.tx=0;z.ty=0;}else{z.scale=2.5;z.tx=0;z.ty=0;}
    applyTransform();
  };

  return(
    <div style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,0.92)",display:"flex",flexDirection:"column"}}>
      {/* tap outside image area to close */}
      <div style={{position:"absolute",inset:0}} onClick={onClose}/>
      <div
        ref={containerRef}
        style={{flex:1,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",touchAction:"none",userSelect:"none"}}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {imgUrl
          ?<img ref={imgRef} src={imgUrl} onDoubleClick={onDblClick} style={{maxWidth:"100%",height:"auto",borderRadius:8,transformOrigin:"center center",willChange:"transform",pointerEvents:"auto",display:"block"}} onClick={e=>e.stopPropagation()}/>
          :<div style={{color:"#5a6a8a",fontFamily:"'DM Sans'",fontSize:14,position:"relative",zIndex:1}}>Generating bracket…</div>}
        {imgUrl&&<div style={{position:"absolute",bottom:72,left:"50%",transform:"translateX(-50%)",fontFamily:"'DM Sans'",fontSize:11,color:"rgba(255,255,255,0.3)",whiteSpace:"nowrap",pointerEvents:"none"}}>Pinch to zoom · double-tap to fit</div>}
      </div>
      <div style={{flexShrink:0,background:"#0a1628",borderTop:"1px solid #1e3060",padding:"12px 16px",display:"flex",gap:8,alignItems:"center"}}>
        {canShare&&<button onClick={generate} disabled={generating} style={{flex:1,padding:"12px",borderRadius:10,border:"1px solid rgba(201,168,76,0.4)",background:"rgba(201,168,76,0.1)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:1.5,cursor:"pointer"}}>
          {generating?"GENERATING...":"SHARE 📤"}
        </button>}
        <button onClick={onClose} style={{flex:canShare?0:1,padding:"12px 20px",borderRadius:10,border:"1px solid #2a3a5c",background:"transparent",color:"#8899b4",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer"}}>{canShare?"Close":"Done"}</button>
      </div>
    </div>
  );
}

function KnockoutScreen({config,picks,matchResults,bracket,koResults,koOverrides,setKoOverride,setKoResults,readOnly,isPreview=false,playerRankings=[],groupOrderOverride={},poolCode,myPlayerIdx,allPredictions={}}) {
  const lang=useContext(LangContext);
  const [activeRound,setActiveRound]=useState(()=>{
    const now=Date.now();
    const ADVANCE_MS=14*60*60*1000;
    // First check: has 14h passed since the last kickoff of any round? If so, advance to next.
    let timeBasedRound="r32";
    for(const r of ROUND_ORDER){
      const matches=KM.filter(m=>m.round===r);
      if(!matches.length)continue;
      const lastKickoff=Math.max(...matches.map(m=>{
        try{return new Date(m.d+"T"+(m.ko||"12:00")+":00Z").getTime();}catch{return 0;}
      }));
      const nextIdx=ROUND_ORDER.indexOf(r)+1;
      if(nextIdx<ROUND_ORDER.length&&now>lastKickoff+ADVANCE_MS){
        timeBasedRound=ROUND_ORDER[nextIdx];
      }
    }
    // If time-based rule says we should be in a later round than where results exist, use it
    const latestWithResults=ROUND_ORDER.reduce((found,r)=>{
      if(KM.filter(m=>m.round===r).some(m=>koResults[m.id]))return r;
      return found;
    },"r32");
    // Use whichever is further along
    const timeIdx=ROUND_ORDER.indexOf(timeBasedRound);
    const resultsIdx=ROUND_ORDER.indexOf(latestWithResults);
    return ROUND_ORDER[Math.max(timeIdx,resultsIdx)];
  });
  const [matchChat,setMatchChat]=useState({});
  const [predictions,setPredictions]=useState({});
  const [openChatId,setOpenChatId]=useState(null);
  const [openPredictId,setOpenPredictId]=useState(null);
  const [myTeamsOnly,setMyTeamsOnly]=useState(false);
  const [shareKO,setShareKO]=useState(null);
  const [shareKODate,setShareKODate]=useState(null);
  const [overrideMode,setOverrideMode]=useState(false);

  // On mount, scroll to today's date if it has a result, otherwise latest date with a result
  useEffect(()=>{
    const todaySGT=new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10);
    const allDates=[...new Set(KM.filter(m=>m.d).map(m=>{
      try{const d=new Date(m.d+"T"+(m.ko||"12:00")+":00Z");return new Date(d.getTime()+8*60*60*1000).toISOString().slice(0,10);}catch{return m.d;}
    }))].sort();
    const dateHasResult=(d)=>KM.filter(m=>{
      try{const dt=new Date(m.d+"T"+(m.ko||"12:00")+":00Z");return new Date(dt.getTime()+8*60*60*1000).toISOString().slice(0,10)===d;}catch{return false;}
    }).some(m=>koResults[m.id]);
    // Prefer today if it has a result
    let targetDate=null;
    if(dateHasResult(todaySGT)){
      targetDate=todaySGT;
    } else {
      // Fall back to latest date with a result
      for(const d of [...allDates].reverse()){
        if(dateHasResult(d)){targetDate=d;break;}
      }
    }
    if(!targetDate)return;
    setTimeout(()=>{
      const el=document.getElementById(`ko-date-${targetDate}`);
      if(el){
        const rect=el.getBoundingClientRect();
        window.scrollTo({top:window.scrollY+rect.top-100,behavior:"smooth"});
      }
    },150);
  },[]);
  // Merge internal predictions (host onSnapshot) with allPredictions prop (spectator top-level onSnapshot)
  const effectivePredictions=useMemo(()=>({...allPredictions,...predictions}),[allPredictions,predictions]);

  const myTeams=useMemo(()=>myPlayerIdx!=null?new Set((picks||[]).filter(p=>p.playerIdx===myPlayerIdx).map(p=>p.team)):new Set(),[picks,myPlayerIdx]);

  // Subscribe to chat + predictions from Firebase
  useEffect(()=>{
    if(!poolCode)return;
    const unsub=onSnapshot(doc(db,"pools",poolCode),(snap)=>{
      if(snap.exists()){
        setMatchChat(snap.data().matchChat||{});
        setPredictions(snap.data().predictions||{});
      }
    });
    return()=>unsub();
  },[poolCode]);
  const roundMatches=useMemo(()=>{const m={};ROUND_ORDER.forEach(r=>m[r]=[]);KM.forEach(k=>m[k.round]&&m[k.round].push(k));return m;},[]);
  const ownership=useMemo(()=>{const o={};(picks||[]).forEach(p=>{o[p.team]={playerIdx:p.playerIdx};});return o;},[picks]);
  const playerTotals=useMemo(()=>Array.from({length:config.playerCount},(_,i)=>({gs:playerGSPts(i,picks||[],matchResults),ko:playerKOPts(i,picks||[],bracket,koResults,config.koPoints)})),[config,picks,matchResults,bracket,koResults]);
  const recorded=Object.values(koResults).filter(Boolean).length;
  const allGroupsDone=Object.keys(GROUPS).every(g=>GM.filter(m=>m.g===g).every(m=>matchResults[m.id]!=null));
  const top8=useMemo(()=>get3rdPlaceTeams(matchResults,groupOrderOverride).slice(0,8),[matchResults,groupOrderOverride]);
  const koInitials=(config.playerNames||[]).map(n=>nameToInitial(n||""));
  return(
    <div style={{maxWidth:920,margin:"0 auto",padding:"0 16px"}}>
      {isPreview&&(
        <div style={{background:"rgba(201,168,76,0.1)",border:"1px solid rgba(201,168,76,0.35)",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:14}}>👀</span>
          <span style={{fontFamily:"'DM Sans'",fontSize:12,color:"var(--accent)",fontWeight:600}}>Host preview — players can't see this tab yet. Bracket fills in as group stage completes.</span>
        </div>
      )}
      <TournamentWinnerWidget ownership={ownership} initials={koInitials} lang={lang} playerNames={config.playerNames||[]} bracket={bracket} koResults={koResults}/>
      {/* Always-visible action bar: bracket viewer + share */}
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <button onClick={()=>setShareKO("bracket_view")} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 12px",borderRadius:8,border:"1px solid #2a3a5c",background:"rgba(26,39,68,0.5)",color:"#c8c0b0",fontFamily:"'Bebas Neue'",fontSize:13,letterSpacing:1,cursor:"pointer"}}>🏆 BRACKET</button>
        <button onClick={()=>setShareKO("menu")} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 12px",borderRadius:8,border:"1px solid rgba(201,168,76,0.3)",background:"rgba(201,168,76,0.06)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:13,letterSpacing:1,cursor:"pointer"}}>📤 SHARE</button>
      </div>
      <div ref={el=>{if(el){const active=el.querySelector('[data-active="true"]');if(active){const left=active.offsetLeft-el.clientWidth/2+active.clientWidth/2;el.scrollTo({left,behavior:'smooth'}); }}}} style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto",alignItems:"center",scrollbarWidth:"none"}}>
        {ROUND_ORDER.map(r=>{const active=activeRound===r;const cnt=roundMatches[r]?.length||0;const done=roundMatches[r]?.filter(m=>koResults[m.id]).length||0;return(<button data-active={active} key={r} onClick={()=>setActiveRound(r)} style={{padding:"7px 12px",borderRadius:8,border:active?"2px solid var(--accent)":"2px solid #2a3a5c",background:active?"rgba(201,168,76,0.1)":"rgba(26,39,68,0.4)",color:active?"var(--accent)":"#5a6a8a",fontFamily:"'Bebas Neue'",fontSize:13,letterSpacing:1.5,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>{KO_LABELS[r]}<span style={{fontFamily:"'DM Sans'",fontSize:9,color:active?"#c9a84c88":"#3d5070",marginLeft:5}}>{done}/{cnt}</span></button>);})}
      </div>
      <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#5a6a8a",textAlign:"center",marginBottom:12}}>Win = <span style={{color:"var(--accent)",fontWeight:700}}>{config.koPoints[activeRound]} pts</span></div>
      {(()=>{
        const today=new Date().toLocaleDateString("en-CA");
        const byDate={};
        (roundMatches[activeRound]||[]).forEach(m=>{
          let localDate=m.d;
          if(m.ko){
            try{
              const utcDt=new Date(m.d+"T"+m.ko+":00Z");
              localDate=utcDt.toLocaleDateString("en-CA");
            }catch(e){}
          }
          (byDate[localDate]=byDate[localDate]||[]).push(m);
        });
        const dates=Object.keys(byDate).sort();
        const yesterday=new Date(Date.now()-86400000).toLocaleDateString("en-CA");
        const tomorrow=new Date(Date.now()+86400000).toLocaleDateString("en-CA");
        return dates.map(date=>{
          const matches=byDate[date];
          const isToday=date===today;
          const isYesterday=date===yesterday;
          const isTomorrow=date===tomorrow;
          const scored=matches.filter(m=>koResults[m.id]).length;
          return(
            <div key={date} id={`ko-date-${date}`} style={{marginBottom:18,marginTop:8,borderRadius:isToday?10:0,border:isToday?"1px solid rgba(201,168,76,0.2)":"none",background:isToday?"rgba(201,168,76,0.03)":"transparent",padding:isToday?"10px":"0"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,paddingTop:4}}>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:isToday?22:18,letterSpacing:3,color:isToday?"var(--accent)":isYesterday?"#8899b4":"#c8c0b0"}}>{fmtDate(date,lang)}</div>
                {isToday&&<div style={{padding:"2px 10px",borderRadius:10,background:"rgba(201,168,76,0.25)",border:"1px solid rgba(201,168,76,0.5)",fontFamily:"'Bebas Neue'",fontSize:11,color:"var(--accent)",letterSpacing:2}}>⚡ {t(lang,"today")}</div>}
                {isTomorrow&&<div style={{padding:"2px 8px",borderRadius:10,background:"rgba(107,155,209,0.15)",border:"1px solid rgba(107,155,209,0.3)",fontFamily:"'Bebas Neue'",fontSize:10,color:"#6b9bd1",letterSpacing:1}}>TOMORROW</div>}
                <div style={{flex:1,height:isToday?2:1,background:isToday?"rgba(201,168,76,0.4)":"rgba(138,153,180,0.2)"}}/>
                <button onClick={()=>{setShareKODate(date);setShareKO("day");}} style={{padding:"3px 7px",borderRadius:6,border:"1px solid rgba(201,168,76,0.2)",background:"rgba(201,168,76,0.04)",color:"var(--accent)",fontSize:11,cursor:"pointer",flexShrink:0,fontFamily:"'Bebas Neue'",letterSpacing:0.5}}>📤</button>
                <span style={{fontFamily:"'DM Sans'",fontSize:10,color:isToday?"var(--accent)":"#5a6a8a",fontWeight:isToday?600:400}}>{scored}/{matches.length}</span>
              </div>
              {matches.map(m=>{const bk=bracket[m.id];const mTeamA=bk?.a||null;const mTeamB=bk?.b||null;const bothConfirmed=!!(mTeamA&&mTeamB);const isMyKoMatch=myTeams.has(mTeamA)||myTeams.has(mTeamB);if(myTeamsOnly&&!isMyKoMatch)return null;return(<KoMatchCard key={m.id} match={m} teamA={mTeamA} teamB={mTeamB} result={koResults[m.id]} onSetOverride={(mid,side,val)=>setKoOverride(mid,side,val)} onSetResult={(mid,val)=>setKoResults(r=>({...r,[mid]:val}))} ownership={ownership} initials={koInitials} readOnly={readOnly} playerNames={config.playerNames||[]} myTeams={myTeams} onOpenChat={bothConfirmed?()=>setOpenChatId(m.id):null} chatCount={(matchChat[m.id]?.messages||[]).length||0} hasReactions={Object.values(matchChat[m.id]?.reactions||{}).some(a=>a.length>0)} matchPredictions={effectivePredictions[m.id]||{}} myPlayerIdx={myPlayerIdx} poolCode={poolCode} onOpenPredict={bothConfirmed&&KO_ODDS[m.id]?()=>setOpenPredictId(m.id):null} overrideMode={overrideMode}/>);})}
            </div>
          );
        });
      })()}
      {(()=>{
        const nextRoundIdx=ROUND_ORDER.indexOf(activeRound)+1;
        const nextRound=nextRoundIdx<ROUND_ORDER.length?ROUND_ORDER[nextRoundIdx]:null;
        const nextLabel=nextRound?KO_LABELS[nextRound]:null;
        if(!nextRound)return null;
        return(
          <div style={{textAlign:"center",marginTop:8,marginBottom:20}}>
            <button onClick={()=>{setActiveRound(nextRound);setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);}} style={{padding:"12px 28px",borderRadius:10,border:"1px solid var(--accent)",background:"rgba(201,168,76,0.1)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:8}}>
              NEXT STAGE: {nextLabel} →
            </button>
          </div>
        );
      })()}
      {!readOnly&&(
        <div style={{textAlign:"center",marginBottom:12,marginTop:4}}>
          <button onClick={()=>setOverrideMode(o=>!o)} style={{padding:"6px 16px",borderRadius:8,border:`1px solid ${overrideMode?"rgba(217,119,87,0.5)":"#2a3a5c"}`,background:overrideMode?"rgba(217,119,87,0.1)":"transparent",color:overrideMode?"#d97757":"#5a6a8a",fontFamily:"'Bebas Neue'",fontSize:12,letterSpacing:1,cursor:"pointer"}}>
            {overrideMode?"✕ DONE OVERRIDING":"✎ OVERRIDE TEAMS"}
          </button>
        </div>
      )}
      <div style={{background:"linear-gradient(135deg,rgba(201,168,76,0.06),rgba(26,39,68,0.4))",border:"1px solid rgba(201,168,76,0.15)",borderRadius:12,padding:"10px 14px",marginTop:8,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontFamily:"'Bebas Neue'",fontSize:12,letterSpacing:2,color:"#5a6a8a"}}>{t(lang,"players")}</span>
          <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#5a6a8a"}}>{recorded}/{KM.length}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
        {playerRankings.map(({name:n,idx:i,total})=>{
          const pcolor=getPlayerColor(i,PC[i]);
          return(
          <div key={i} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 8px",borderRadius:8,background:`${pcolor}12`,border:`1px solid ${pcolor}33`}}>
            <div style={{width:18,height:18,borderRadius:4,background:pcolor,color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{nameToInitial(n||"")}</div>
            <span style={{fontFamily:"'DM Sans'",fontSize:11,fontWeight:600,color:pcolor,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n}</span>
            <span style={{fontFamily:"'Bebas Neue'",fontSize:13,color:pcolor,letterSpacing:1,flexShrink:0}}>{total}<span style={{fontSize:8,color:`${pcolor}99`,marginLeft:1}}>pts</span></span>
          </div>
          );
        })}
        </div>
      </div>
      {/* MY TEAMS floating filter — only for r32 and r16, rendered via portal so position:fixed works */}
      {(activeRound==="r32"||activeRound==="r16")&&myTeams.size>0&&<button onClick={()=>setMyTeamsOnly(o=>!o)} style={{position:"fixed",bottom:28,left:16,zIndex:100,padding:"8px 14px",borderRadius:20,background:myTeamsOnly?"rgba(201,168,76,0.95)":"rgba(10,22,40,0.95)",border:"1px solid rgba(201,168,76,0.5)",color:myTeamsOnly?"#0a1628":"var(--accent)",fontSize:13,fontFamily:"'Bebas Neue'",letterSpacing:1.5,cursor:"pointer",display:"flex",alignItems:"center",gap:5,backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",boxShadow:"0 2px 16px rgba(0,0,0,0.5)"}}>
          ⭐ {myTeamsOnly?(lang==="es"?"TODOS":"ALL GAMES"):(lang==="es"?"MIS EQUIPOS":"MY TEAMS")}
        </button>}
      {openChatId&&(()=>{const m=KM.find(x=>x.id===openChatId);const bk=bracket[openChatId];return m&&bk?<MatchChatModal open={true} onClose={()=>setOpenChatId(null)} match={{...m,t:[bk.a||"TBD",bk.b||"TBD"]}} poolCode={poolCode} myPlayerIdx={myPlayerIdx} playerNames={config.playerNames} initials={koInitials} matchChat={matchChat[openChatId]||{}}/>:null;})()}
      {openPredictId&&(()=>{const m=KM.find(x=>x.id===openPredictId);const bk=bracket[openPredictId];if(!m||!bk?.a||!bk?.b||!KO_ODDS[openPredictId])return null;const w=koWinner(koResults[openPredictId]);return(<KoPredictModal matchId={openPredictId} teamA={bk.a} teamB={bk.b} koOdds={KO_ODDS[openPredictId]} poolCode={poolCode} myPlayerIdx={myPlayerIdx} playerNames={config.playerNames||[]} initials={koInitials} matchPredictions={effectivePredictions[openPredictId]||{}} hasResult={!!w} koWinnerSide={w} onClose={()=>setOpenPredictId(null)}/>);})()}
      {shareKO==="menu"&&(
        <div style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"flex-end"}} onClick={()=>setShareKO(null)}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",background:"#0a1628",borderRadius:"20px 20px 0 0",border:"1px solid #2a3a5c",padding:"20px 16px 32px"}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:2,color:"#8899b4",marginBottom:16}}>SHARE KO STAGE</div>
            {[["stage",`📋 All ${KO_LABELS[activeRound]} Fixtures`],["bracket","🏆 Full Bracket"]].map(([key,label])=>(
              <button key={key} onClick={()=>setShareKO(key)} style={{width:"100%",padding:"14px 16px",borderRadius:10,border:"1px solid #2a3a5c",background:"rgba(26,39,68,0.6)",color:"#e0dcd4",fontFamily:"'DM Sans'",fontSize:14,fontWeight:600,cursor:"pointer",textAlign:"left",marginBottom:8,display:"block"}}>{label}</button>
            ))}
            <button onClick={()=>setShareKO(null)} style={{width:"100%",padding:"12px",borderRadius:10,border:"none",background:"transparent",color:"#5a6a8a",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer",marginTop:4}}>Cancel</button>
          </div>
        </div>
      )}
      {shareKO==="bracket_view"&&<ShareKOBracketModal onClose={()=>setShareKO(null)} bracket={bracket} koResults={koResults} ownership={ownership} initials={koInitials} lang={lang} config={config} viewOnly={!readOnly===false&&true} canShare={!readOnly}/>}
      {(shareKO==="stage"||shareKO==="day")&&<ShareKOMatchesModal onClose={()=>setShareKO(null)} matches={shareKO==="stage"?roundMatches[activeRound]||[]:KM.filter(m=>{if(!m.d||!m.ko)return false;try{const d=new Date(m.d+"T"+m.ko+":00Z");return d.toLocaleDateString("en-CA")===shareKODate;}catch(e){return false;}})} bracket={bracket} koResults={koResults} ownership={ownership} initials={koInitials} lang={lang} roundLabel={KO_LABELS[activeRound]} isStage={shareKO==="stage"} shareDate={shareKODate} config={config}/>}
    </div>
  );
}

function PredictionRecap({allPredictions,matchResults,koResults={},playerNames,playerCount,initials,lang,playerDataWithRanks=[]}) {
  const [open,setOpen]=useState(false);
  const picVersion=useContext(PicContext);

  // Build main leaderboard rank lookup (lower = better)
  const mainRank=useMemo(()=>{
    const r={};
    playerDataWithRanks.forEach((p,i)=>{r[p.idx]=i;});
    return r;
  },[playerDataWithRanks]);

  const stats=useMemo(()=>{
    return Array.from({length:playerCount},(_,i)=>{
      let correct=0,total=0;
      // Group stage
      GM.forEach(m=>{
        const pick=allPredictions[m.id]?.[String(i)];
        const result=matchResults[m.id];
        if(!pick||!result)return;
        const out=getMatchOutcome(result);
        if(!out)return;
        total++;
        const pickOutcome=pick==="home"?"A":pick==="away"?"B":"D";
        if(pickOutcome===out)correct++;
      });
      // KO stage — "home"=A side wins, "away"=B side wins (no draw)
      KM.forEach(m=>{
        const pick=allPredictions[m.id]?.[String(i)];
        const result=koResults[m.id];
        if(!pick||!result)return;
        const w=koWinner(result);
        if(!w)return;
        total++;
        if((pick==="home"&&w==="A")||(pick==="away"&&w==="B"))correct++;
      });
      return{idx:i,correct,total,pct:total>0?Math.round(correct/total*100):null};
    }).filter(p=>playerNames[p.idx]).sort((a,b)=>{
      // 1. Most correct picks
      if(b.correct!==a.correct)return b.correct-a.correct;
      // 2. Highest %
      const ap=a.pct??-1, bp=b.pct??-1;
      if(bp!==ap)return bp-ap;
      // 3. Main leaderboard rank (lower index = better)
      const ar=mainRank[a.idx]??99, br=mainRank[b.idx]??99;
      return ar-br;
    });
  },[allPredictions,matchResults,koResults,playerCount,mainRank]);

  if(stats.length===0)return null;

  return(
    <div style={{marginTop:16,borderRadius:12,border:"1px solid #1e2f50",overflow:"hidden"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%",padding:"12px 16px",background:"rgba(26,39,68,0.3)",border:"none",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}>
        <span style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,color:"var(--accent)"}}>🔮 {lang==="es"?"PREDICCIONES":"PREDICTION ACCURACY"}</span>
        <span style={{fontSize:11,color:"#5a6a8a",transform:open?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
      </button>
      {open&&(
        <div style={{padding:"8px 12px 12px"}}>
          <div style={{display:"flex",alignItems:"center",fontFamily:"'DM Sans'",fontSize:9,color:"#5a6a8a",fontWeight:600,letterSpacing:1,textTransform:"uppercase",padding:"4px 4px 8px",borderBottom:"1px solid #1a2d4a",marginBottom:6}}>
            <span style={{flex:1}}>{lang==="es"?"JUGADOR":"Player"}</span>
            <span style={{width:52,textAlign:"center"}}>✓</span>
            <span style={{width:52,textAlign:"center"}}>#</span>
            <span style={{width:40,textAlign:"center"}}>%</span>
          </div>
          {stats.map((p,rank)=>{
            const color=getPlayerColor(p.idx,PC[p.idx]);
            const isTop=rank===0;
            return(
              <div key={p.idx} style={{display:"flex",alignItems:"center",padding:"6px 4px",borderBottom:rank<stats.length-1?"1px solid rgba(26,39,68,0.5)":"none"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                  <span style={{fontFamily:"'Bebas Neue'",fontSize:12,color:isTop?"var(--accent)":"#3d5070",width:14,flexShrink:0}}>{rank+1}</span>
                  <PlayerAvatar idx={p.idx} name={playerNames[p.idx]||""} size={26} refresh={picVersion}/>
                  <span style={{fontFamily:"'DM Sans'",fontSize:12,fontWeight:600,color,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{playerNames[p.idx]||`P${p.idx+1}`}</span>
                  {isTop&&p.pct!==null&&<span style={{fontSize:10,flexShrink:0}}>🏆</span>}
                </div>
                <span style={{fontFamily:"'Bebas Neue'",fontSize:16,color,width:52,textAlign:"center",flexShrink:0}}>{p.correct}</span>
                <span style={{fontFamily:"'DM Sans'",fontSize:12,color:"#5a6a8a",width:52,textAlign:"center",flexShrink:0}}>{p.total}</span>
                <span style={{fontFamily:"'Bebas Neue'",fontSize:16,color:isTop&&p.pct!==null?"var(--accent)":color,width:40,textAlign:"center",flexShrink:0}}>{p.pct!==null?`${p.pct}%`:"—"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StandingsScreen({config,picks,matchResults,bracket,koResults,initials,myPlayerIdx,onChangeUser,onEditProfile,onSuggestions,picRefresh=0,allPredictions={},draftOrder=[],groupOrderOverride={}}) {
  const lang=useContext(LangContext);
  const [expandedIdx,setExpandedIdx]=useState(null);
  const today=new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10);
  const playerData=useMemo(()=>{
    return Array.from({length:config.playerCount},(_,i)=>{
      const gsPts=playerGSPts(i,picks||[],matchResults);
      const koPts=playerKOPts(i,picks||[],bracket,koResults,config.koPoints);
      const r32=KM.filter(m=>m.round==="r32").filter(m=>{const w0=koWinner(koResults[m.id]);if(!w0)return false;const b=bracket[m.id];if(!b)return false;const w=w0==="A"?b.a:b.b;return w&&(picks||[]).filter(p=>p.playerIdx===i).map(p=>p.team).includes(w);}).length;
      const myTeams=(picks||[]).filter(p=>p.playerIdx===i).map(p=>p.team);
      const teamBreakdown=myTeams.map(t=>{
        const tgs=teamGSPts(t,matchResults);
        const tko=teamKOPts(t,bracket,koResults,config.koPoints);
        // Calculate GD and GF for this team
        let tgd=0,tgf=0;
        GM.filter(m=>m.t.includes(t)).forEach(m=>{
          const r=matchResults[m.id];if(!r||r.home==null||r.away==null)return;
          const isHome=m.t[0]===t;
          if(isHome){tgf+=r.home;tgd+=(r.home-r.away);}
          else{tgf+=r.away;tgd+=(r.away-r.home);}
        });
        return{team:t,gsPts:tgs,koPts:tko,pts:tgs+tko,gd:tgd,gf:tgf,eliminated:isEliminated(t,bracket,koResults,matchResults,groupOrderOverride)};
      }).sort((a,b)=>{
        // Stage reached tiebreaker first (higher stage = higher priority)
        const stageOrder=(team)=>{
          const{stage,eliminated}=getTeamStage(team,bracket,koResults,matchResults);
          if(!stage)return 0;
          const map={"GROUP":0,"R32":eliminated?1:2,"R16":eliminated?3:4,"QF":eliminated?5:6,"SF":eliminated?7:8,"FINAL":9,"🥉 3RD":10,"4TH":9,"🥈 2ND":11,"🥇 1ST":12};
          return map[stage]??0;
        };
        return b.pts-a.pts||stageOrder(b.team)-stageOrder(a.team)||b.gd-a.gd||b.gf-a.gf||a.team.localeCompare(b.team);
      });
      let gd=0,gf=0;
      myTeams.forEach(team=>{
        GM.forEach(m=>{
          const r=matchResults[m.id];if(!r||r.home==null||r.away==null)return;
          const isHome=m.t[0]===team,isAway=m.t[1]===team;
          if(isHome){gf+=r.home;gd+=(r.home-r.away);}
          else if(isAway){gf+=r.away;gd+=(r.away-r.home);}
        });
        KM.forEach(m=>{
          const r=koResults[m.id];if(!r||typeof r==="string"||r.home==null||r.away==null)return;
          const bk=bracket[m.id];if(!bk)return;
          const isHome=bk.a===team,isAway=bk.b===team;
          if(isHome){gf+=r.home;gd+=(r.home-r.away);}
          else if(isAway){gf+=r.away;gd+=(r.away-r.home);}
        });
      });
      // Today's points — compare using SGT kickoff date (UTC+8)
      let todayPts=0;
      myTeams.forEach(team=>{
        // Group stage today points
        GM.filter(m=>m.t.includes(team)&&m.ko).forEach(m=>{
          const kickoffUTC=new Date(m.d+"T"+m.ko+":00Z");
          const sgtDate=new Date(kickoffUTC.getTime()+8*60*60*1000).toISOString().slice(0,10);
          if(sgtDate!==today)return;
          const r=matchResults[m.id];
          const out=getMatchOutcome(r);if(!out)return;
          const isHome=m.t[0]===team;
          if((isHome&&out==="A")||(!isHome&&out==="B"))todayPts+=3;
          else if(out==="D")todayPts+=1;
        });
        // KO stage today points
        KM.filter(m=>m.ko).forEach(m=>{
          const bk=bracket[m.id]||{};
          const isA=bk.a===team,isB=bk.b===team;
          if(!isA&&!isB)return;
          const kickoffUTC=new Date(m.d+"T"+m.ko+":00Z");
          const sgtDate=new Date(kickoffUTC.getTime()+8*60*60*1000).toISOString().slice(0,10);
          if(sgtDate!==today)return;
          const r=koResults[m.id];
          const w=koWinner(r);if(!w)return;
          const won=(isA&&w==="A")||(isB&&w==="B");
          if(won){const pts=(DEFAULT_KO[m.round]||4);todayPts+=pts;}
        });
      });
      // Count teams currently sitting in any R32 slot — covers group winners/runners-up once
      // their group is complete, 3rd-place qualifiers, AND host-overridden teams placed early
      const pastGroups=myTeams.filter(team=>isInR32Bracket(team,bracket)).length;
      const color=getPlayerColor(i,PC[i]);
      // Check if all teams are eliminated from KO stage
      const koTeams=myTeams.filter(team=>isInR32Bracket(team,bracket));
      const finalResult=koResults["K104"];
      const finalDone=!!koWinner(finalResult);
      const allEliminated=!finalDone&&koTeams.length>0&&koTeams.every(team=>{
        const status=getTeamStage(team,bracket,koResults,matchResults);
        return status?.eliminated===true||status?.finished===true;
      });
      // Check if this player owns the world champion
      const finalWinnerSide=koWinner(finalResult);
      const finalBk=bracket["K104"]||{};
      const champion=finalWinnerSide==="A"?finalBk.a:finalWinnerSide==="B"?finalBk.b:null;
      const isChampion=champion?myTeams.includes(champion):false;
      return{idx:i,name:config.playerNames[i],gsPts,koPts,total:gsPts+koPts,r32,pastGroups,teamBreakdown,color,gd,gf,todayPts,myTeams,allEliminated,isChampion,finalDone};
    }).sort((a,b)=>{
      if(b.total!==a.total)return b.total-a.total;
      if(b.pastGroups!==a.pastGroups)return b.pastGroups-a.pastGroups;
      if(b.gd!==a.gd)return b.gd-a.gd;
      if(b.gf!==a.gf)return b.gf-a.gf;
      // H2H: find matches (group + knockout) where one player's team played the other's
      let aWins=0,bWins=0,aH2HGD=0,bH2HGD=0,aH2HGF=0,bH2HGF=0;
      GM.forEach(m=>{
        const r=matchResults[m.id];if(!r||r.home==null||r.away==null)return;
        const aHome=a.myTeams.includes(m.t[0]),aAway=a.myTeams.includes(m.t[1]);
        const bHome=b.myTeams.includes(m.t[0]),bAway=b.myTeams.includes(m.t[1]);
        if(aHome&&bAway){
          aH2HGF+=r.home;bH2HGF+=r.away;
          aH2HGD+=(r.home-r.away);bH2HGD+=(r.away-r.home);
          if(r.home>r.away)aWins++;else if(r.away>r.home)bWins++;
        } else if(aAway&&bHome){
          aH2HGF+=r.away;bH2HGF+=r.home;
          aH2HGD+=(r.away-r.home);bH2HGD+=(r.home-r.away);
          if(r.away>r.home)aWins++;else if(r.home>r.away)bWins++;
        }
      });
      KM.forEach(m=>{
        const r=koResults[m.id];if(!r||typeof r==="string"||r.home==null||r.away==null)return;
        const bk=bracket[m.id];if(!bk)return;
        const aHome=a.myTeams.includes(bk.a),aAway=a.myTeams.includes(bk.b);
        const bHome=b.myTeams.includes(bk.a),bAway=b.myTeams.includes(bk.b);
        if(aHome&&bAway){
          aH2HGF+=r.home;bH2HGF+=r.away;
          aH2HGD+=(r.home-r.away);bH2HGD+=(r.away-r.home);
          if(r.home>r.away)aWins++;else if(r.away>r.home)bWins++;
        } else if(aAway&&bHome){
          aH2HGF+=r.away;bH2HGF+=r.home;
          aH2HGD+=(r.away-r.home);bH2HGD+=(r.home-r.away);
          if(r.away>r.home)aWins++;else if(r.home>r.away)bWins++;
        }
      });
      if(aWins!==bWins)return bWins-aWins;
      if(aH2HGD!==bH2HGD)return bH2HGD-aH2HGD;
      if(aH2HGF!==bH2HGF)return bH2HGF-aH2HGF;
      // Final fallback: draft order
      const aPick=draftOrder.indexOf(a.idx);const bPick=draftOrder.indexOf(b.idx);if(aPick!==-1&&bPick!==-1)return aPick-bPick;return a.idx-b.idx;
    });
  },[config,picks,matchResults,bracket,koResults,picRefresh,draftOrder]);

  // Track rank movements — compare live ranking vs ranking excluding today's SGT results
  const playerDataWithRanks=useMemo(()=>{
    const todaySGT=new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
    // Build matchResults excluding today's SGT games
    const yesterdayResults={};
    Object.entries(matchResults).forEach(([id,r])=>{
      const m=GM.find(x=>x.id===id);
      if(!m||!m.ko)return;
      const kickoffUTC=new Date(m.d+"T"+m.ko+":00Z");
      const sgtDate=new Date(kickoffUTC.getTime()+8*60*60*1000).toISOString().slice(0,10);
      if(sgtDate!==todaySGT) yesterdayResults[id]=r;
    });
    // Build koResults excluding today's SGT games
    const yesterdayKoResults={};
    Object.entries(koResults).forEach(([id,r])=>{
      const m=KM.find(x=>x.id===id);
      if(!m||!m.ko)return;
      const kickoffUTC=new Date(m.d+"T"+m.ko+":00Z");
      const sgtDate=new Date(kickoffUTC.getTime()+8*60*60*1000).toISOString().slice(0,10);
      if(sgtDate!==todaySGT) yesterdayKoResults[id]=r;
    });
    // Calculate yesterday's ranking
    const yesterdayRanks=Array.from({length:config.playerCount},(_,i)=>{
      const gs=playerGSPts(i,picks||[],yesterdayResults);
      const ko=playerKOPts(i,picks||[],bracket,yesterdayKoResults,config.koPoints);
      const myTeams=(picks||[]).filter(p=>p.playerIdx===i).map(p=>p.team);
      let gd=0,gf=0;
      myTeams.forEach(team=>{
        GM.forEach(m=>{
          const r=yesterdayResults[m.id];if(!r||r.home==null||r.away==null)return;
          const isHome=m.t[0]===team,isAway=m.t[1]===team;
          if(isHome){gf+=r.home;gd+=(r.home-r.away);}
          else if(isAway){gf+=r.away;gd+=(r.away-r.home);}
        });
      });
      const pastGroups=myTeams.filter(team=>{
        const grp=Object.entries(GROUPS).find(([,ts])=>ts.includes(team))?.[0];
        if(!grp)return false;
        const grpMatches=GM.filter(m=>m.g===grp);
        const allPlayed=grpMatches.every(m=>yesterdayResults[m.id]!=null);
        if(!allPlayed)return false;
        const standings=groupStandings(grp,yesterdayResults);
        const pos=standings.findIndex(s=>s.team===team);
        return pos<=1;
      }).length;
      const r32=KM.filter(m=>m.round==="r32").filter(m=>{const w0=koWinner(koResults[m.id]);if(!w0)return false;const b=bracket[m.id];if(!b)return false;const w=w0==="A"?b.a:b.b;return w&&myTeams.includes(w);}).length;
      return{idx:i,total:gs+ko,pastGroups,r32,gd,gf};
    }).sort((a,b)=>b.total-a.total||b.pastGroups-a.pastGroups||b.gd-a.gd||b.gf-a.gf||a.idx-b.idx);
    const yesterdayRankMap={};
    yesterdayRanks.forEach((p,ri)=>{yesterdayRankMap[p.idx]=ri;});
    return playerData.map((p,ri)=>({
      ...p,
      prevRank:yesterdayRankMap[p.idx]!=null?yesterdayRankMap[p.idx]:ri,
      movement:yesterdayRankMap[p.idx]!=null?yesterdayRankMap[p.idx]-ri:0,
    }));
  },[playerData,matchResults,config,picks,bracket,koResults]);
  const pot=(parseFloat(config.entryFee||0))*config.playerCount;
  const barMax=Math.max(...playerData.map(x=>x.total))||1;
  return(
    <div style={{maxWidth:720,margin:"0 auto",padding:"8px 16px 0"}}>
      <div style={{fontFamily:"'Bebas Neue'",fontSize:32,letterSpacing:4,color:"var(--accent)",textAlign:"center",marginBottom:6}}>{t(lang,"leaderboardTitle")}</div>
      <div style={{marginBottom:10}}/>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {playerData.map((p,rank)=>{
          const color=p.color;const isFirst=rank===0;const expanded=expandedIdx===p.idx;
          const dead=p.allEliminated;
          const champion=p.isChampion&&p.finalDone;
          return(
            <div key={p.idx} style={{background:isFirst?`linear-gradient(135deg,${color}18,rgba(26,39,68,0.5))`:"rgba(26,39,68,0.3)",borderRadius:14,padding:"16px 20px",border:`1px solid ${color}${isFirst?"66":"33"}`,position:"relative",overflow:"hidden",opacity:dead?0.55:1}}>
              {isFirst&&<div style={{position:"absolute",top:0,right:0,fontFamily:"'Bebas Neue'",fontSize:70,color:`${color}08`,letterSpacing:-2,lineHeight:1,padding:"0 10px"}}>1ST</div>}
              <div style={{display:"flex",alignItems:"center",gap:16,position:"relative",zIndex:1,cursor:"pointer"}} onClick={()=>setExpandedIdx(expanded?null:p.idx)}>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:38,color,letterSpacing:1,width:36,textAlign:"center",flexShrink:0}}>#{rank+1}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <PlayerAvatar idx={p.idx} name={p.name} size={44} style={{borderRadius:"50%",flexShrink:0}} refresh={picRefresh}/>
                    <div style={{fontFamily:"'DM Sans'",fontSize:16,fontWeight:champion?900:700,color,display:"flex",alignItems:"center",gap:6}}>{p.name}{dead&&<span style={{fontSize:14}}>❌</span>}{champion&&<span style={{fontSize:16}}>🏆</span>}{!champion&&isFirst&&p.finalDone&&<span style={{fontSize:14}}>🏆</span>}{myPlayerIdx===p.idx&&<span style={{fontSize:10,color:"var(--accent)",background:"rgba(201,168,76,0.15)",padding:"1px 7px",borderRadius:8,fontFamily:"'DM Sans'",fontWeight:600}}>{lang==="es"?"yo":"you"}</span>}</div>
                    <span style={{fontFamily:"'DM Sans'",fontSize:11,color:`${color}88`,marginLeft:"auto"}}>{expanded?"▲":"▼"}</span>
                  </div>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontFamily:"'DM Sans'",fontSize:9,color:"#5a6a8a",letterSpacing:1,textTransform:"uppercase"}}>{t(lang,"total")}</div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:34,color,letterSpacing:1,lineHeight:1}}>{p.total}</div>
                  <div style={{fontFamily:"'DM Sans'",fontSize:9,color:"#5a6a8a",marginTop:2}}>{lang==="es"?(p.total===1?"punto":"puntos"):(p.total===1?"point":"points")}</div>
                </div>
              </div>
              <div style={{height:4,background:"rgba(26,39,68,0.6)",borderRadius:2,marginTop:12,overflow:"hidden"}}><div style={{height:"100%",width:`${(p.total/barMax)*100}%`,background:`linear-gradient(90deg,${color},${color}99)`,transition:"width 0.5s"}}/></div>
              {expanded&&(
                <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid rgba(26,39,68,0.6)"}}>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:12,letterSpacing:2,color:`${color}99`,marginBottom:8}}>{t(lang,"teamBreakdownLabel")}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {p.teamBreakdown.map(({team,gsPts,koPts})=>{
                      const tm=TBN[team];const tp=gsPts+koPts;const displayName=countryName(team,lang);
                      const{stage,eliminated,finished}=getTeamStage(team,bracket,koResults,matchResults);
                      const isAlive=!eliminated;
                      const isMedal=stage&&(stage.includes("🥇")||stage.includes("🥈")||stage.includes("🥉"));
                      const stageBg=eliminated?"rgba(26,39,68,0.5)":isMedal?"rgba(201,168,76,0.15)":"transparent";
                      const stageColor=eliminated?"#5a6a8a":isMedal?"#c9a84c":"#61a978";
                      const stageBorder=eliminated?"rgba(60,80,110,0.5)":isMedal?"rgba(201,168,76,0.3)":"rgba(97,169,120,0.3)";
                      return(
                        <div key={team} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:7,background:"rgba(10,22,40,0.3)"}}>
                          <span style={{fontSize:15,flexShrink:0}}>{tm?.flag}</span>
                          <span style={{fontFamily:"'DM Sans'",fontSize:11,fontWeight:500,flex:1,color:eliminated&&!isMedal?"#6b7a90":"#e0dcd4",textDecoration:eliminated&&!isMedal?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{displayName}</span>
                          {stage&&<span style={{fontFamily:"'Bebas Neue'",fontSize:9,color:stageColor,background:stageBg,border:`1px solid ${stageBorder}`,padding:"1px 5px",borderRadius:4,flexShrink:0,letterSpacing:1,whiteSpace:"nowrap",textDecoration:eliminated&&!isMedal?"line-through":"none"}}>{stage}</span>}
                          <div style={{textAlign:"right",flexShrink:0}}>
                            <div style={{fontFamily:"'Bebas Neue'",fontSize:15,color:color,letterSpacing:1,lineHeight:1}}>{tp}<span style={{fontSize:8,opacity:0.7}}>pts</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{marginTop:8}}>
                    <span style={{fontFamily:"'DM Sans'",fontSize:8,color:"#3d5070",textTransform:"uppercase",letterSpacing:0.5,fontWeight:600}}>Tiebreakers: </span>
                    <span style={{fontFamily:"'DM Sans'",fontSize:9,color:"#3d5070"}}>{p.pastGroups} in R32 · GD {p.gd>=0?"+":""}{p.gd} · GF {p.gf}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#5a6a8a",textAlign:"center",marginTop:20,lineHeight:1.7,fontStyle:"italic"}}>{t(lang,"tiebreaker")}</div>
      <PredictionRecap allPredictions={allPredictions} matchResults={matchResults} koResults={koResults} playerNames={config.playerNames} playerCount={config.playerCount} initials={initials} lang={lang} playerDataWithRanks={playerDataWithRanks}/>
      <button onClick={async()=>{
        try {
          const bebas=new FontFace("BebasNeue","url(https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXoo9WdhyyTh89ZNpQ.woff2)");
          const dm=new FontFace("DMSans","url(https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZa4ET-DNl0.woff2)");
          await Promise.all([bebas.load(),dm.load()]);
          document.fonts.add(bebas);document.fonts.add(dm);
        } catch(e){}

        const W=420,HEADER=92,ROW=68,PAD=14,FOOT=36;
        const H=HEADER+ROW*playerDataWithRanks.length+FOOT;
        const canvas=document.createElement("canvas");
        const DPR=2;
        canvas.width=W*DPR;canvas.height=H*DPR;
        const ctx=canvas.getContext("2d");
        ctx.scale(DPR,DPR);

        // Background
        const bg=ctx.createLinearGradient(0,0,0,H);
        bg.addColorStop(0,"#0a1628");bg.addColorStop(0.5,"#0f1e38");bg.addColorStop(1,"#0a1628");
        ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);

        // Gold gradient top bar
        const topBar=ctx.createLinearGradient(0,0,W,0);
        topBar.addColorStop(0,"#c9a84c");topBar.addColorStop(0.5,"#e8c96a");topBar.addColorStop(1,"#c9a84c");
        ctx.fillStyle=topBar;ctx.fillRect(0,0,W,4);

        // Title
        ctx.fillStyle="#c9a84c";
        ctx.font=`700 38px BebasNeue,Arial`;
        ctx.textAlign="center";
        ctx.fillText("⚽ MUNDIALITO 2026 🏆",W/2,52);

        // Subtitle
        ctx.fillStyle="#4a5a7a";
        ctx.font=`400 11px DMSans,Arial`;
        const now=new Date();
        ctx.fillText(`${lang==="es"?"CLASIFICACIÓN":"LEADERBOARD"} · ${now.toLocaleDateString(lang==="es"?"es-ES":"en-AU",{day:"numeric",month:"short"}).toUpperCase()}`,W/2,70);

        // Divider
        ctx.fillStyle="#c9a84c";ctx.globalAlpha=0.2;
        ctx.fillRect(PAD*3,82,W-PAD*6,1);
        ctx.globalAlpha=1;

        for(let ri=0;ri<playerDataWithRanks.length;ri++){
          const p=playerDataWithRanks[ri];
          const y=HEADER+ri*ROW;
          const color=p.color||"#c9a84c";
          const isFirst=ri===0;
          const isTop3=ri<3;
          const dead=p.allEliminated;
          const champion=p.isChampion&&p.finalDone;
          ctx.globalAlpha=dead?0.55:1;
          ctx.font=`${champion?900:700} ${isFirst?18:16}px DMSans,Arial`;

          // Row background — subtle tint for 1st, transparent for rest
          if(isFirst){
            ctx.fillStyle=`${color}18`;
            ctx.beginPath();
            ctx.roundRect?ctx.roundRect(PAD,y+2,W-PAD*2,ROW-4,8):ctx.rect(PAD,y+2,W-PAD*2,ROW-4);
            ctx.fill();
          }

          // Row divider
          ctx.fillStyle=isTop3?`${color}22`:"rgba(20,35,65,0.9)";
          ctx.fillRect(PAD,y+ROW-1,W-PAD*2,1);

          // Rank
          if(isTop3){
            const medals=["🥇","🥈","🥉"];
            ctx.font=`400 ${isFirst?22:18}px Arial`;
            ctx.textAlign="center";
            ctx.fillText(medals[ri],PAD+22,y+ROW/2+8);
          } else {
            ctx.font=`700 14px BebasNeue,Arial`;
            ctx.fillStyle="#2a3a5a";
            ctx.textAlign="center";
            ctx.fillText(`#${ri+1}`,PAD+22,y+ROW/2+5);
          }

          // Movement
          const movement=p.movement||0;
          if(movement!==0){
            ctx.font=`700 8px DMSans,Arial`;
            ctx.fillStyle="#556070";
            ctx.textAlign="center";
            ctx.fillText(`${movement>0?"▲":"▼"}${Math.abs(movement)}`,PAD+22,y+ROW/2+18);
          }

          // Avatar — bigger for top 3, glow effect
          const ax=PAD+64,ay=y+ROW/2;
          const AR=isTop3?20:17;
          ctx.save();
          if(isTop3){
            // Glow ring
            ctx.beginPath();ctx.arc(ax,ay,AR+4,0,Math.PI*2);
            ctx.fillStyle=color;ctx.globalAlpha=0.2;ctx.fill();ctx.globalAlpha=1;
          }
          ctx.beginPath();ctx.arc(ax,ay,AR,0,Math.PI*2);
          ctx.fillStyle=color;ctx.fill();ctx.clip();
          const pic=getProfilePic(p.idx);
          if(pic){
            try{
              await new Promise((res,rej)=>{
                const img=new Image();
                img.onload=()=>{ctx.drawImage(img,ax-AR,ay-AR,AR*2,AR*2);res();};
                img.onerror=rej;img.src=pic;
              });
            }catch{
              ctx.font=`700 ${AR*0.7}px BebasNeue,Arial`;
              ctx.fillStyle="#0a1628";ctx.textAlign="center";
              ctx.fillText((initials[p.idx]||"?"),ax,ay+AR*0.25);
            }
          } else {
            ctx.font=`700 ${AR*0.7}px BebasNeue,Arial`;
            ctx.fillStyle="#0a1628";ctx.textAlign="center";
            ctx.fillText((initials[p.idx]||"?"),ax,ay+AR*0.25);
          }
          ctx.restore();

          // Player name — bigger, in their colour. Centre the [name + pts-line] block on the avatar's vertical centre
          const nameSize=isFirst?20:18;
          ctx.textAlign="left";
          ctx.font=`700 ${nameSize}px DMSans,Arial`;
          ctx.fillStyle=color;
          let name=p.name;
          const nameX=PAD+98;
          const maxNameW=W-PAD-nameX-60;
          while(ctx.measureText(name).width>maxNameW&&name.length>3) name=name.slice(0,-1)+"…";
          const blockCenterY=y+ROW/2;
          const nameY=p.todayPts>0?blockCenterY-5:blockCenterY+6;
          ctx.fillText(name+(dead?" ❌":"")+(champion?" 🏆":""),nameX,nameY);
          if(p.todayPts>0){
            ctx.font=`600 9px DMSans,Arial`;
            ctx.fillStyle=`${color}99`;
            ctx.fillText(`+${p.todayPts} ${lang==="es"?"hoy":"today"}`,nameX,nameY+15);
          }

          // Points
          const ptSize=isFirst?32:isTop3?26:21;
          ctx.textAlign="right";
          ctx.font=`700 ${ptSize}px BebasNeue,Arial`;
          ctx.fillStyle=color;
          ctx.fillText(p.total,W-PAD-8,y+ROW/2+8);
          ctx.font=`400 9px DMSans,Arial`;
          ctx.fillStyle=`${color}77`;
          ctx.fillText(lang==="es"?(p.total===1?"punto":"puntos"):(p.total===1?"pt":"pts"),W-PAD-8,y+ROW/2+19);
          ctx.globalAlpha=1;
        }

        // Footer
        ctx.fillStyle="#1e2f50";
        ctx.font=`400 10px DMSans,Arial`;
        ctx.textAlign="center";
        ctx.fillText("elmundialito.github.io/2026",W/2,HEADER+ROW*playerDataWithRanks.length+26);

        ctx.fillStyle="#c9a84c";ctx.globalAlpha=0.15;
        ctx.fillRect(PAD*3,H-5,W-PAD*6,1);
        ctx.globalAlpha=1;

        canvas.toBlob(async blob=>{
          if(!blob)return;
          const file=new File([blob],"mundialito-leaderboard.png",{type:"image/png"});
          if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
            try{await navigator.share({files:[file],title:"Mundialito Leaderboard"});}catch(e){}
          } else {
            const url=URL.createObjectURL(blob);
            const a=document.createElement("a");a.href=url;a.download="mundialito-leaderboard.png";a.click();
            URL.revokeObjectURL(url);
          }
        },"image/png");
      }} style={{width:"100%",marginTop:10,padding:"12px 0",borderRadius:10,border:"1px solid rgba(201,168,76,0.3)",background:"rgba(201,168,76,0.06)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,cursor:"pointer"}}>
        📤 {lang==="es"?"COMPARTIR CLASIFICACIÓN":"SHARE LEADERBOARD"}
      </button>
    </div>
  );
}

function SpectatorIntro({st,initials,onComplete}) {
  const [phase,setPhase]=useState("rules");
  const picks=st.picks||[];
  const rosters=useMemo(()=>{const r=Array.from({length:st.config.playerCount},()=>[]);picks.forEach(p=>{if(p.playerIdx!=null)r[p.playerIdx].push(p.team);});return r;},[picks,st.config.playerCount]);
  if(phase==="rules") return(<><style>{FONTS}</style><div style={{minHeight:"100vh",background:"linear-gradient(165deg,#0a1628,#0f1e38,#0a1628)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><div style={{maxWidth:480,width:"100%",background:"linear-gradient(165deg,#0f1e38,#0a1628)",borderRadius:20,border:"1px solid rgba(201,168,76,0.35)",padding:"32px 28px"}}><div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:48,marginBottom:8}}>⚽</div><div style={{fontFamily:"'Bebas Neue'",fontSize:30,color:"var(--accent)",letterSpacing:4,marginBottom:4}}>MUNDIALITO 2026</div><div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",lineHeight:1.6}}>Welcome to the pool! Here's how it works.</div></div><RulesList/><div style={{display:"flex",gap:10,marginTop:28}}><button onClick={()=>{try{window.localStorage?.setItem("mundi_intro_seen","1");}catch(e){}onComplete();}} style={{flex:1,padding:"14px 0",borderRadius:12,border:"1px solid #2a3a5c",background:"transparent",color:"#8899b4",fontFamily:"'Bebas Neue'",fontSize:15,letterSpacing:2,cursor:"pointer"}}>SKIP →</button><button onClick={()=>setPhase("spin")} style={{flex:1,padding:"14px 0",borderRadius:12,border:"none",background:"linear-gradient(135deg,var(--accent),var(--accent-dark))",color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:15,letterSpacing:2,cursor:"pointer"}}>WATCH DRAW 🎡</button></div></div></div></>);
  if(phase==="spin") return(<><style>{FONTS}</style><div style={{minHeight:"100vh",background:"linear-gradient(165deg,#0a1628,#0f1e38,#0a1628)",padding:"32px 16px"}}><div style={{textAlign:"center",marginBottom:20}}><div style={{fontFamily:"'Bebas Neue'",fontSize:14,color:"#5a6a8a",letterSpacing:3,marginBottom:4}}>STEP 1 OF 2</div><div style={{fontFamily:"'Bebas Neue'",fontSize:28,color:"var(--accent)",letterSpacing:4}}>DRAFT ORDER DRAW</div><div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",marginTop:4}}>This is the order players were drawn to pick their teams</div></div><StadiumSpin playerNames={st.config.playerNames} replayOrder={st.draftOrder||[]} onComplete={()=>setPhase("sorteo")} onBack={()=>setPhase("rules")}/></div></>);
  if(phase==="sorteo") return(<><style>{FONTS}</style><div style={{minHeight:"100vh",background:"linear-gradient(165deg,#0a1628,#0f1e38,#0a1628)",padding:"32px 16px"}}><div style={{textAlign:"center",marginBottom:20}}><div style={{fontFamily:"'Bebas Neue'",fontSize:14,color:"#5a6a8a",letterSpacing:3,marginBottom:4}}>STEP 2 OF 2</div><div style={{fontFamily:"'Bebas Neue'",fontSize:28,color:"var(--accent)",letterSpacing:4}}>EL SORTEO OFICIAL</div><div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",marginTop:4}}>Watch El Presidente draw each player's teams</div></div><AutoReveal config={st.config} draftOrder={st.draftOrder||[]} initials={initials} precomputedPicks={picks} autoStart={true} onComplete={()=>setPhase("recap")} onSkip={()=>{try{window.localStorage?.setItem("mundi_intro_seen","1");}catch(e){}onComplete();}}/></div></>);
  if(phase==="recap") return(<><style>{FONTS}</style><div style={{minHeight:"100vh",background:"linear-gradient(165deg,#0a1628,#0f1e38,#0a1628)",padding:"32px 16px"}}><div style={{textAlign:"center",marginBottom:24}}><div style={{fontFamily:"'Bebas Neue'",fontSize:32,color:"var(--accent)",letterSpacing:4,marginBottom:4}}>🏆 FINAL ROSTERS</div><div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4"}}>Here's who got what. May the best team win!</div></div><div style={{maxWidth:720,margin:"0 auto",display:"grid",gridTemplateColumns:`repeat(${Math.min(st.config.playerCount,2)},1fr)`,gap:14,marginBottom:28}}>{rosters.map((teams,i)=>(<div key={i} style={{background:`${getPlayerColor(i,PC[i])}10`,border:`1px solid ${PC[i]}44`,borderRadius:12,padding:"14px 16px"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,paddingBottom:8,borderBottom:`1px solid ${PC[i]}33`}}><div style={{width:26,height:26,borderRadius:7,background:getPlayerColor(i,PC[i]),color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>{initials[i]}</div><span style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:700,color:getPlayerColor(i,PC[i])}}>{st.config.playerNames[i]}</span><span style={{fontFamily:"'DM Sans'",fontSize:11,color:`${getPlayerColor(i,PC[i])}66`,marginLeft:"auto"}}>{teams.length} teams</span></div><div style={{display:"flex",flexDirection:"column",gap:3}}>{picks.filter(p=>p.playerIdx===i).map((p,j)=>{const t=TBN[p.team];return(<div key={p.team} style={{display:"flex",alignItems:"center",gap:7,padding:"2px 4px"}}><span style={{fontFamily:"'Bebas Neue'",fontSize:10,color:`${getPlayerColor(i,PC[i])}55`,width:16,textAlign:"right"}}>{j+1}</span><span style={{fontSize:14}}>{t?.flag}</span><span style={{fontFamily:"'DM Sans'",fontSize:12,fontWeight:500,color:"#e0dcd4",flex:1}}>{p.team}</span></div>);})}</div></div>))}</div><div style={{maxWidth:720,margin:"0 auto"}}><button onClick={()=>{try{window.localStorage?.setItem("mundi_intro_seen","1");}catch(e){}onComplete();}} style={{width:"100%",padding:"16px 0",borderRadius:12,border:"none",background:"linear-gradient(135deg,var(--accent),var(--accent-dark))",color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:3,cursor:"pointer"}}>⚽ LET'S PLAY →</button></div></div></>);
  return null;
}

function JoinScreen({onJoin,onBack}) {
  const [val,setVal]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);

  const doJoin=async()=>{
    const code=val.trim().toUpperCase();
    if(!code)return;
    setLoading(true);setErr("");
    const data=await loadPool(code);
    setLoading(false);
    if(!data){setErr("Code not found — check it and try again.");return;}
    const e=onJoin(data, code);
    if(e){setErr(e);return;}
  };

  return(
    <><style>{FONTS}</style>
    <div style={{minHeight:"100vh",background:"linear-gradient(165deg,#0a1628,#0f1e38,#0a1628)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{maxWidth:420,width:"100%",background:"linear-gradient(165deg,#0f1e38,#0a1628)",borderRadius:20,border:"1px solid rgba(201,168,76,0.35)",padding:"32px 28px",textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12}}>⚽</div>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:26,color:"var(--accent)",letterSpacing:3,marginBottom:8}}>LOAD POOL</div>
        <div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",marginBottom:24,lineHeight:1.6}}>
          Enter the code your host sent you.
        </div>
        <input
          value={val}
          onChange={e=>{setVal(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6));setErr("");}}
          onKeyDown={e=>e.key==="Enter"&&doJoin()}
          placeholder="e.g. CS26"
          maxLength={6}
          autoFocus
          style={{width:"100%",padding:"16px",borderRadius:10,border:err?"1.5px solid #d97757":"1.5px solid #2a3a5c",background:"rgba(10,22,40,0.7)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:36,letterSpacing:8,outline:"none",boxSizing:"border-box",textAlign:"center",marginBottom:err?6:20}}
        />
        {err&&<div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#d97757",marginBottom:16,textAlign:"left"}}>{err}</div>}
        <div style={{display:"flex",gap:8}}>
          <button onClick={onBack} style={{padding:"12px 16px",borderRadius:10,border:"1px solid #2a3a5c",background:"transparent",color:"#5a6a8a",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer"}}>← Back</button>
          <button onClick={doJoin} disabled={val.trim().length<2||loading} style={{flex:1,padding:"12px 0",borderRadius:10,border:"none",background:val.trim().length>=2?"linear-gradient(135deg,var(--accent),var(--accent-dark))":"rgba(26,39,68,0.5)",color:val.trim().length>=2?"#0a1628":"#3d5070",fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,cursor:val.trim().length>=2?"pointer":"default"}}>
            {loading?"LOADING…":"LOAD POOL"}
          </button>
        </div>
      </div>
    </div></>
  );
}

function SwitchToHostModal({open,onClose,onSuccess,poolCode}) {
  const lang=useContext(LangContext);
  const [pw,setPw]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const [showPw,setShowPw]=useState(false);
  if(!open)return null;

  const doSwitch=async()=>{
    if(!pw.trim())return;
    setLoading(true);setErr("");
    const ok=await checkPassword(poolCode,pw.trim());
    setLoading(false);
    if(!ok){setErr("Wrong password — try again.");return;}
    // Save password AND pool code locally so auto-save and pic loading work
    try{window.localStorage?.setItem("mundi_host_pw",pw.trim());}catch(e){}
    try{window.localStorage?.setItem("mundi_pool_code",poolCode);}catch(e){}
    setPw("");setErr("");onSuccess();
  };

  return(
    <Modal open={open} onClose={()=>{setPw("");setErr("");onClose();}} title={t(lang,"hostAccess")}>
      <div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",marginBottom:16,lineHeight:1.6}}>
        {t(lang,"hostPwDesc")}
      </div>
      <div style={{position:"relative",marginBottom:err?6:16}}>
        <input
          type={showPw?"text":"password"}
          value={pw}
          onChange={e=>{setPw(e.target.value);setErr("");}}
          onKeyDown={e=>e.key==="Enter"&&doSwitch()}
          placeholder={t(lang,"hostPwPlaceholder")}
          autoFocus
          style={{width:"100%",padding:"12px 44px 12px 14px",borderRadius:10,border:err?"1.5px solid #d97757":"1.5px solid #2a3a5c",background:"rgba(10,22,40,0.7)",color:"#e0dcd4",fontFamily:"'DM Sans'",fontSize:15,outline:"none",boxSizing:"border-box"}}
        />
        <button onClick={()=>setShowPw(s=>!s)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",color:"#5a6a8a",cursor:"pointer",fontSize:16}}>{showPw?"🙈":"👁"}</button>
      </div>
      {err&&<div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#d97757",marginBottom:12}}>{err}</div>}
      <button onClick={doSwitch} disabled={!pw.trim()||loading} style={{width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:pw.trim()?"linear-gradient(135deg,var(--accent),var(--accent-dark))":"rgba(26,39,68,0.5)",color:pw.trim()?"#0a1628":"#3d5070",fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,cursor:pw.trim()?"pointer":"default",marginBottom:8}}>
        {loading?t(lang,"checking"):t(lang,"unlockHost")}
      </button>
      <button onClick={()=>{setPw("");setErr("");onClose();}} style={{width:"100%",padding:"10px 0",borderRadius:10,border:"1px solid #2a3a5c",background:"transparent",color:"#8899b4",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer"}}>{t(lang,"cancel")}</button>
    </Modal>
  );
}


function NotifyModal({open,onClose}) {
  const lang=useContext(LangContext);
  const [status,setStatus]=useState("idle");
  const [custom,setCustom]=useState("");

  useEffect(()=>{
    if(open) requestNotificationPermission();
  },[open]);

  const presets=lang==="es"?[
    "⚽ ¡Partido terminado — revisa los marcadores!",
    "🏁 ¡Actualización de grupos — la clasificación cambió!",
    "🏆 ¡Resultado eliminatorio — mira quién avanzó!",
    "📊 ¡Marcadores actualizados — revisa la clasificación!",
  ]:[
    "⚽ Match just finished — check the scores!",
    "🏁 Group stage update — standings have changed!",
    "🏆 Knockout result in — see who's through!",
    "📊 Scores updated — check the standings!",
  ];

  const send=async(msg)=>{
    setStatus("sending");
    const ok=await sendNotification(msg);
    if(ok){
      setStatus("done");
      setTimeout(()=>{setStatus("idle");onClose();},2000);
    } else {
      setStatus("error");
    }
  };

  if(!open)return null;
  return(
    <Modal open={open} onClose={onClose} title={lang==="es"?"NOTIFICAR GRUPO":"NOTIFY GROUP"}>
      {status==="sending"&&<div style={{textAlign:"center",padding:"24px 0",fontFamily:"'Bebas Neue'",fontSize:18,color:"var(--accent)",letterSpacing:2}}>{lang==="es"?"Enviando…":"Sending…"}</div>}
      {status==="done"&&<div style={{textAlign:"center",padding:"24px 0",fontFamily:"'Bebas Neue'",fontSize:18,color:"#61a978",letterSpacing:2}}>✓ {lang==="es"?"¡Enviado!":"Sent!"}</div>}
      {status==="error"&&<div style={{textAlign:"center",padding:"24px 0"}}><div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:"#d97757",letterSpacing:2,marginBottom:12}}>{lang==="es"?"Error al enviar":"Failed to send"}</div><button onClick={()=>setStatus("idle")} style={{padding:"10px 20px",borderRadius:8,border:"none",background:"#d97757",color:"white",fontFamily:"'Bebas Neue'",fontSize:14,cursor:"pointer"}}>{lang==="es"?"REINTENTAR":"TRY AGAIN"}</button></div>}
      {status==="idle"&&(
        <>
          <div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",marginBottom:16,lineHeight:1.6}}>{lang==="es"?"Envía una notificación a todos los que tienen alertas activadas.":"Send a push notification to everyone who has enabled alerts."}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            {presets.map((p,i)=>(
              <button key={i} onClick={()=>send(p)} style={{padding:"11px 14px",borderRadius:10,border:"1px solid #2a3a5c",background:"rgba(26,39,68,0.4)",color:"#e0dcd4",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer",textAlign:"left"}}>
                {p}
              </button>
            ))}
          </div>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:11,letterSpacing:2,color:"#5a6a8a",marginBottom:6}}>{lang==="es"?"O MENSAJE PERSONALIZADO":"OR CUSTOM MESSAGE"}</div>
          <div style={{display:"flex",gap:8}}>
            <input value={custom} onChange={e=>setCustom(e.target.value)} placeholder={lang==="es"?"Escribe un mensaje…":"Type a message…"} style={{flex:1,padding:"10px 12px",borderRadius:8,border:"1px solid #2a3a5c",background:"rgba(10,22,40,0.7)",color:"#e0dcd4",fontFamily:"'DM Sans'",fontSize:13,outline:"none"}}/>
            <button onClick={()=>custom.trim()&&send(custom.trim())} disabled={!custom.trim()} style={{padding:"10px 16px",borderRadius:8,border:"none",background:custom.trim()?"linear-gradient(135deg,var(--accent),var(--accent-dark))":"rgba(26,39,68,0.5)",color:custom.trim()?"#0a1628":"#3d5070",fontFamily:"'Bebas Neue'",fontSize:13,letterSpacing:1,cursor:custom.trim()?"pointer":"default"}}>{lang==="es"?"ENVIAR":"SEND"}</button>
          </div>
        </>
      )}
    </Modal>
  );
}


// ── Profile helpers ───────────────────────────────────────────
const PLAYER_COLORS = ["#c9a84c","#6b9bd1","#61a978","#d97757","#a855f7","#ec4899","#14b8a6","#f59e0b"];

// In-memory cache — pics are too large for localStorage so we use memory only
// Colors are small so we persist those
const picCache = {};
const colorCache = (() => {
  try { return JSON.parse(window.localStorage?.getItem("mundi_color_cache")||"{}"); } catch { return {}; }
})();

function saveCaches() {
  try {
    // Only persist colours — pics are base64 jpegs, too large for localStorage
    window.localStorage?.setItem("mundi_color_cache", JSON.stringify(colorCache));
  } catch(e) {}
}

function getPlayerColor(playerIdx, fallback) {
  return colorCache[playerIdx] || fallback || PLAYER_COLORS[playerIdx % PLAYER_COLORS.length];
}

function getProfilePic(playerIdx) {
  return picCache[playerIdx] || null;
}

async function saveProfilePicToFirestore(playerIdx, dataUrl) {
  try {
    picCache[playerIdx] = dataUrl;
    const code = window.localStorage?.getItem("mundi_pool_code") ||
                 window.localStorage?.getItem("mundi_spectator_code");
    if (!code) return;
    const profiles = {};
    profiles[String(playerIdx)] = dataUrl;
    await setDoc(doc(db, "pools", code), { profiles }, { merge: true });
  } catch(e) { console.error("pic save failed", e); }
}

async function loadProfilePics(code) {
  if(!code) return {};
  try {
    const snap = await getDoc(doc(db, "pools", code.toUpperCase()));
    if (!snap.exists()) return {};
    const data = snap.data();
    const profiles = data.profiles || {};
    Object.keys(profiles).forEach(k => {
      picCache[parseInt(k)] = profiles[k];
    });
    const colors = data.playerColors || {};
    Object.keys(colors).forEach(k => {
      colorCache[parseInt(k)] = colors[k];
    });
    saveCaches();
    return colors;
  } catch(e) { return {}; }
}

// Call this after loadProfilePics to guarantee avatars re-render
// Bumps multiple times with increasing delays to catch any render timing gaps
function bumpPics(setPicRefresh) {
  setPicRefresh(n=>n+1);
  setTimeout(()=>setPicRefresh(n=>n+1), 200);
  setTimeout(()=>setPicRefresh(n=>n+1), 800);
  setTimeout(()=>setPicRefresh(n=>n+1), 2000);
}

function PlayerAvatar({idx, name, size=36, style={}, refresh=0}) {
  const picVersion = useContext(PicContext);
  // picVersion and refresh are render triggers — reading them here forces re-render when they change
  const _trigger = picVersion + refresh;
  const pic = getProfilePic(idx);
  const color = getPlayerColor(idx, PC[idx]);
  const initials = nameToInitial(name||"");
  if(pic) return (
    <div style={{width:size,height:size,borderRadius:"50%",overflow:"hidden",flexShrink:0,...style}}>
      <img src={pic} style={{width:"100%",height:"100%",objectFit:"cover"}} />
    </div>
  );
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.33,fontWeight:900,color:"#0a1628",flexShrink:0,...style,opacity:_trigger>=0?1:0}}>
      {initials}
    </div>
  );
}

// ── Match Chat ────────────────────────────────────────────────
const PRESET_REACTIONS = ["🔥","😭","😱","🥳","😤","🙃"];
// Preset phrases are now defined in the UI translation object

// ── Suggestion Box ────────────────────────────────────────────
async function addSuggestion(poolCode, playerIdx, playerName, text) {
  try {
    const ref=doc(db,"pools",poolCode);
    const snap=await getDoc(ref);
    const suggestions=(snap.exists()?snap.data().suggestions:[])||[];
    suggestions.push({id:Date.now(),playerIdx,playerName,text,votes:{up:[],down:[]},ts:Date.now()});
    await setDoc(ref,{suggestions},{merge:true});
  } catch(e){console.error("suggestion failed",e);}
}

async function voteSuggestion(poolCode, suggestionId, playerIdx, type) {
  try {
    const ref=doc(db,"pools",poolCode);
    const snap=await getDoc(ref);
    if(!snap.exists())return;
    const suggestions=(snap.data().suggestions||[]).map(s=>{
      if(s.id!==suggestionId)return s;
      const votes={...s.votes};
      const other=type==="up"?"down":"up";
      // Remove from other side if exists
      votes[other]=(votes[other]||[]).filter(i=>i!==playerIdx);
      // Toggle on this side
      if((votes[type]||[]).includes(playerIdx)){
        votes[type]=(votes[type]||[]).filter(i=>i!==playerIdx);
      } else {
        votes[type]=[...(votes[type]||[]),playerIdx];
      }
      return{...s,votes};
    });
    await setDoc(ref,{suggestions},{merge:true});
  } catch(e){}
}

async function toggleReaction(poolCode, matchId, emoji, playerIdx) {
  try {
    const ref = doc(db, "pools", poolCode);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const chat = data.matchChat || {};
    const matchChat = chat[matchId] || {};
    const reactions = matchChat.reactions || {};
    const current = reactions[emoji] || [];
    const updated = current.includes(playerIdx)
      ? current.filter(i => i !== playerIdx)
      : [...current, playerIdx];
    await setDoc(ref, {
      matchChat: { [matchId]: { reactions: { [emoji]: updated } } }
    }, { merge: true });
  } catch(e) { console.error("reaction failed", e); }
}

async function sendChatMessage(poolCode, matchId, playerIdx, playerName, text) {
  try {
    const ref = doc(db, "pools", poolCode);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const chat = data.matchChat || {};
    const matchChat = chat[matchId] || {};
    const messages = matchChat.messages || [];
    messages.push({ playerIdx, playerName, text, ts: Date.now() });
    await setDoc(ref, {
      matchChat: { [matchId]: { messages } }
    }, { merge: true });
  } catch(e) { console.error("chat failed", e); }
}

function SuggestionModal({open, onClose, poolCode, myPlayerIdx, playerNames, initials}) {
  const lang=useContext(LangContext);
  const [suggestions,setSuggestions]=useState([]);
  const [input,setInput]=useState("");
  const [sending,setSending]=useState(false);
  const messagesEndRef=useRef(null);
  const myName=playerNames?.[myPlayerIdx]||`Player ${(myPlayerIdx||0)+1}`;
  const code=poolCode||window.localStorage?.getItem("mundi_pool_code")||window.localStorage?.getItem("mundi_spectator_code");

  useEffect(()=>{
    if(!open||!code)return;
    const unsub=onSnapshot(doc(db,"pools",code),(snap)=>{
      if(snap.exists()) setSuggestions(snap.data().suggestions||[]);
    });
    return()=>unsub();
  },[open,code]);

  useEffect(()=>{
    if(open) setTimeout(()=>messagesEndRef.current?.scrollIntoView({behavior:"smooth"}),100);
  },[open,suggestions.length]);

  if(!open)return null;

  const doSend=async()=>{
    if(!input.trim()||!code||myPlayerIdx===null)return;
    setSending(true);
    await addSuggestion(code,myPlayerIdx,myName,input.trim());
    setSending(false);
    setInput("");
  };

  const doVote=(id,type)=>{
    if(!code||myPlayerIdx===null)return;
    voteSuggestion(code,id,myPlayerIdx,type);
  };

  const sorted=[...suggestions].sort((a,b)=>((b.votes?.up||[]).length-(b.votes?.down||[]).length)-((a.votes?.up||[]).length-(a.votes?.down||[]).length));

  return(
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxHeight:"82vh",background:"linear-gradient(165deg,#0a1628,#0f1e38)",borderRadius:"20px 20px 0 0",display:"flex",flexDirection:"column",overflow:"hidden",border:"1px solid #2a3a5c"}}>
        {/* Header */}
        <div style={{padding:"14px 16px 10px",borderBottom:"1px solid #1e2f50",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:3,color:"var(--accent)"}}>💡 {lang==="es"?"SUGERENCIAS":"SUGGESTIONS"}</div>
            <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#5a6a8a",marginTop:2}}>{lang==="es"?"¿Qué te gustaría ver en la app?":"What features would you like to see?"}</div>
          </div>
          <button onClick={onClose} style={{width:28,height:28,borderRadius:"50%",border:"1px solid #2a3a5c",background:"transparent",color:"#5a6a8a",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

        {/* Suggestions list */}
        <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:10}}>
          {sorted.length===0&&(
            <div style={{textAlign:"center",color:"#3a4a6a",fontFamily:"'DM Sans'",fontSize:13,fontStyle:"italic",marginTop:24}}>
              {lang==="es"?"Sé el primero en sugerir algo 💡":"Be the first to suggest something 💡"}
            </div>
          )}
          {sorted.map(s=>{
            const color=getPlayerColor(s.playerIdx,PC[s.playerIdx]||"#c9a84c");
            const upCount=(s.votes?.up||[]).length;
            const downCount=(s.votes?.down||[]).length;
            const myUp=myPlayerIdx!==null&&(s.votes?.up||[]).includes(myPlayerIdx);
            const myDown=myPlayerIdx!==null&&(s.votes?.down||[]).includes(myPlayerIdx);
            const score=upCount-downCount;
            return(
              <div key={s.id} style={{background:"rgba(26,39,68,0.5)",borderRadius:12,padding:"12px 14px",border:"1px solid #1e2f50"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <div style={{width:22,height:22,borderRadius:6,background:color,color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{(initials?.[s.playerIdx]||"?")}</div>
                  <span style={{fontFamily:"'DM Sans'",fontSize:12,fontWeight:600,color}}>{s.playerName}</span>
                  <span style={{fontFamily:"'DM Sans'",fontSize:10,color:"#3a4a6a",marginLeft:"auto"}}>{new Date(s.ts).toLocaleDateString([],{day:"numeric",month:"short"})}</span>
                </div>
                <div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#e0dcd4",lineHeight:1.5,marginBottom:10}}>{s.text}</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <button onClick={()=>doVote(s.id,"up")} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:16,border:`1.5px solid ${myUp?"#61a978":"#2a3a5c"}`,background:myUp?"rgba(97,169,120,0.15)":"transparent",color:myUp?"#61a978":"#5a6a8a",fontFamily:"'DM Sans'",fontSize:12,cursor:"pointer"}}>
                    👍 {upCount>0&&<span style={{fontWeight:600}}>{upCount}</span>}
                  </button>
                  <button onClick={()=>doVote(s.id,"down")} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:16,border:`1.5px solid ${myDown?"#d97757":"#2a3a5c"}`,background:myDown?"rgba(217,119,87,0.15)":"transparent",color:myDown?"#d97757":"#5a6a8a",fontFamily:"'DM Sans'",fontSize:12,cursor:"pointer"}}>
                    👎 {downCount>0&&<span style={{fontWeight:600}}>{downCount}</span>}
                  </button>
                  {score!==0&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:score>0?"#61a978":"#d97757",marginLeft:"auto",fontWeight:600}}>{score>0?"+":""}{score}</span>}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef}/>
        </div>

        {/* Input */}
        <div style={{padding:"10px 16px 28px",borderTop:"1px solid #1e2f50",display:"flex",gap:8,flexShrink:0}}>
          <input
            value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&doSend()}
            placeholder={lang==="es"?"Escribe tu sugerencia…":"Type your suggestion…"}
            style={{flex:1,padding:"10px 14px",borderRadius:20,border:"1px solid #2a3a5c",background:"rgba(26,39,68,0.6)",color:"#e0dcd4",fontFamily:"'DM Sans'",fontSize:13,outline:"none"}}
          />
          <button onClick={doSend} disabled={!input.trim()||sending} style={{width:40,height:40,borderRadius:"50%",border:"none",background:input.trim()?"var(--accent)":"#2a3a5c",color:"#0a1628",fontSize:18,cursor:input.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>➤</button>
        </div>
      </div>
    </div>
  );
}

function ReactionRow({reactions, allEmojis, myPlayerIdx, playerNames, onReact}) {
  const [popover, setPopover] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const longPressTimer = useRef(null);
  const EXTRA_EMOJIS = ["😂","😭","🙌","🤬","😱","🥳","👏","🤝","🫡","💀","🐐","🥹","😬","🤡","🎯","🍿","⚡","💥","🤯","🤔"];

  const handlePressStart = (emoji) => {
    longPressTimer.current = setTimeout(() => setPopover(emoji), 400);
  };
  const handlePressEnd = (emoji, didLongPress) => {
    if(longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  return(
    <div style={{position:"relative"}}>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
        {allEmojis.map(emoji=>{
          const who=reactions[emoji]||[];
          const mine=myPlayerIdx!==null&&who.includes(myPlayerIdx);
          return(
            <div key={emoji} style={{position:"relative"}}>
              <button
                onClick={()=>{if(popover===emoji){setPopover(null);return;}onReact(emoji);}}
                onMouseDown={()=>handlePressStart(emoji)}
                onMouseUp={()=>handlePressEnd(emoji)}
                onTouchStart={()=>handlePressStart(emoji)}
                onTouchEnd={()=>handlePressEnd(emoji)}
                style={{display:"flex",alignItems:"center",gap:3,padding:"4px 8px",borderRadius:16,border:`1.5px solid ${mine?"var(--accent)":"#2a3a5c"}`,background:mine?"rgba(201,168,76,0.15)":"rgba(26,39,68,0.5)",cursor:"pointer",transition:"all 0.15s"}}
              >
                <span style={{fontSize:17,lineHeight:1}}>{emoji}</span>
                {who.length>0&&<span onClick={e=>{e.stopPropagation();setPopover(popover===emoji?null:emoji);}} style={{fontFamily:"'DM Sans'",fontSize:11,fontWeight:700,color:mine?"var(--accent)":"#8899b4",minWidth:10}}>{who.length}</span>}
              </button>
              {popover===emoji&&who.length>0&&(
                <div style={{position:"absolute",bottom:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)",background:"#0f1e38",border:"1px solid #2a3a5c",borderRadius:10,padding:"8px 10px",zIndex:300,minWidth:120,boxShadow:"0 4px 20px rgba(0,0,0,0.5)"}}>
                  <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#5a6a8a",marginBottom:5,letterSpacing:1}}>{emoji} reacted</div>
                  {who.map(idx=>(
                    <div key={idx} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0"}}>
                      <div style={{width:18,height:18,borderRadius:5,background:getPlayerColor(idx,PC[idx]),color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{(playerNames[idx]||"").slice(0,2).toUpperCase()}</div>
                      <span style={{fontFamily:"'DM Sans'",fontSize:12,color:"#e0dcd4"}}>{playerNames[idx]||`Player ${idx+1}`}</span>
                    </div>
                  ))}
                  <div style={{position:"absolute",bottom:-5,left:"50%",transform:"translateX(-50%)",width:8,height:8,background:"#0f1e38",border:"1px solid #2a3a5c",borderTop:"none",borderLeft:"none",rotate:"45deg"}}/>
                </div>
              )}
            </div>
          );
        })}
        <button onClick={()=>setShowPicker(o=>!o)} style={{width:30,height:30,borderRadius:"50%",border:`1px solid ${showPicker?"var(--accent)":"#2a3a5c"}`,background:showPicker?"rgba(201,168,76,0.15)":"rgba(26,39,68,0.5)",color:showPicker?"var(--accent)":"#5a6a8a",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>➕</button>
      </div>
      {showPicker&&(
        <div style={{marginTop:8,padding:10,borderRadius:10,background:"#0a1628",border:"1px solid #1e2f50",display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {EXTRA_EMOJIS.map(emoji=>(
            <button key={emoji} onClick={()=>{onReact(emoji);setShowPicker(false);}} style={{background:"transparent",border:"none",fontSize:20,padding:"5px 0",cursor:"pointer",borderRadius:6}}>{emoji}</button>
          ))}
        </div>
      )}
      {popover&&<div style={{position:"fixed",inset:0,zIndex:299}} onClick={()=>setPopover(null)}/>}
    </div>
  );
}

function AvatarWithName({idx,name,size,picVersion}) {
  const [show,setShow]=useState(false);
  const color=getPlayerColor(idx,PC[idx]);
  useEffect(()=>{
    if(!show)return;
    const dismiss=()=>setShow(false);
    document.addEventListener("touchstart",dismiss,{once:true,passive:true});
    document.addEventListener("mousedown",dismiss,{once:true});
    return()=>{document.removeEventListener("touchstart",dismiss);document.removeEventListener("mousedown",dismiss);};
  },[show]);
  return(
    <div style={{position:"relative"}} onClick={e=>{e.stopPropagation();setShow(o=>!o);}}>
      <PlayerAvatar idx={idx} name={name} size={size} refresh={picVersion}/>
      {show&&(
        <div style={{position:"absolute",bottom:"calc(100% + 4px)",left:"50%",transform:"translateX(-50%)",background:"#0a1628",border:`1px solid ${color}`,borderRadius:8,padding:"3px 8px",whiteSpace:"nowrap",fontFamily:"'DM Sans'",fontSize:name.length>14?9:name.length>10?10:11,fontWeight:600,color,zIndex:300,boxShadow:"0 2px 8px rgba(0,0,0,0.5)"}}
          onClick={e=>e.stopPropagation()}>
          {name}
        </div>
      )}
    </div>
  );
}

async function savePrediction(poolCode, matchId, playerIdx, outcome) {
  try {
    await setDoc(doc(db,"pools",poolCode),{predictions:{[matchId]:{[String(playerIdx)]:outcome}}},{merge:true});
  } catch(e){console.error("savePrediction failed",e);}
}

function PredictModal({open,onClose,match,result,poolCode,myPlayerIdx,playerNames,initials,matchPredictions={}}) {
  const lang=useContext(LangContext);
  const picVersion=useContext(PicContext);
  if(!open)return null;
  const [a,b]=match.t;const ta=TBN[a],tb=TBN[b];
  const odds=MATCH_ODDS[match.id];
  const kickoffUTC=match.ko?new Date(match.d+"T"+match.ko+":00Z"):null;
  const isLocked=kickoffUTC?Date.now()>=kickoffUTC.getTime():false;
  const myPick=myPlayerIdx!==null?matchPredictions[String(myPlayerIdx)]:null;

  // Determine winning outcome from result for post-match colouring
  const out=getMatchOutcome(result);
  const winKey=out==="A"?"home":out==="B"?"away":out==="D"?"draw":null;

  const getColor=(key)=>{
    if(winKey&&winKey===key) return "#61a978"; // winner = green
    if(winKey) return "#3d5070"; // other outcomes = muted after result
    // pre-match: all same neutral blue
    return "#6b9bd1";
  };

  const doPick=async(outcome)=>{
    if(isLocked||myPlayerIdx===null||!poolCode)return;
    await savePrediction(poolCode,match.id,myPlayerIdx,outcome);
  };

  const outcomes=[
    {key:"home",flag:ta?.flag||"🏳️",name:countryName(a,lang)||a,pct:odds?odds[0]:null},
    {key:"draw",flag:"🤝",name:lang==="es"?"Empate":"Draw",pct:odds?odds[1]:null},
    {key:"away",flag:tb?.flag||"🏳️",name:countryName(b,lang)||b,pct:odds?odds[2]:null},
  ];

  // Group players by their pick
  const byOutcome={home:[],draw:[],away:[]};
  Object.entries(matchPredictions).forEach(([idx,outcome])=>{
    if(byOutcome[outcome])byOutcome[outcome].push(parseInt(idx));
  });

  return(
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxHeight:"80vh",background:"linear-gradient(165deg,#0a1628,#0f1e38)",borderRadius:"20px 20px 0 0",display:"flex",flexDirection:"column",overflow:"hidden",border:"1px solid #2a3a5c"}}>
        {/* Header */}
        <div style={{padding:"14px 16px 10px",borderBottom:"1px solid #1e2f50",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:22}}>{ta?.flag}</span>
            <span style={{fontFamily:"'Bebas Neue'",fontSize:16,color:"#8899b4",letterSpacing:1}}>vs</span>
            <span style={{fontSize:22}}>{tb?.flag}</span>
            <span style={{fontFamily:"'DM Sans'",fontSize:13,fontWeight:600,color:"#e0dcd4",marginLeft:4}}>{countryName(a,lang)} · {countryName(b,lang)}</span>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#5a6a8a",fontSize:20,cursor:"pointer",padding:"0 4px"}}>✕</button>
        </div>

        <div style={{overflowY:"auto",padding:"14px 16px 24px",display:"flex",flexDirection:"column",gap:14}}>

          {/* Odds section */}
          {odds&&(
            <div style={{background:"rgba(10,22,40,0.5)",borderRadius:12,padding:"14px 16px",border:"1px solid #1a2d4a"}}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:11,letterSpacing:1.5,color:"#5a6a8a",marginBottom:12}}>{(lang==="es"?"PRONÓSTICO PREVIO":"PRE-MATCH ODDS").toUpperCase()}</div>
              {outcomes.map(({key,flag,name,pct})=>{
                const col=getColor(key);
                return(
                <div key={key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:key==="away"?0:10}}>
                  <span style={{fontSize:18,width:24,textAlign:"center",flexShrink:0}}>{flag}</span>
                  <span style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:500,color:winKey?(winKey===key?"#c8c0b0":"#4a5a7a"):"#c8c0b0",flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}</span>
                  <div style={{width:90,height:6,background:"#1a2d4a",borderRadius:4,overflow:"hidden",flexShrink:0}}>
                    <div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:4}}/>
                  </div>
                  <span style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:700,color:col,minWidth:36,textAlign:"right"}}>{pct}%</span>
                </div>
              );})}
            </div>
          )}

          {/* Pick section */}
          <div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:11,letterSpacing:1.5,color:"#5a6a8a",marginBottom:10}}>
              {isLocked?(lang==="es"?"PREDICCIONES":"PREDICTIONS"):(lang==="es"?"¿QUIÉN GANA?":"WHO WINS?")}
              {isLocked&&<span style={{fontFamily:"'DM Sans'",fontSize:9,color:"#3d5070",marginLeft:8,fontWeight:400,letterSpacing:0}}>· {lang==="es"?"bloqueado":"locked at kickoff"}</span>}
            </div>
            <div style={{display:"flex",gap:8}}>
              {outcomes.map(({key,flag,name})=>{
                const picked=myPick===key;
                const iHaveOne=myPick!==null;
                const col=getColor(key);
                const isWinner=winKey===key;
                return(
                  <div key={key} style={{flex:1,display:"flex",flexDirection:"column",gap:6,alignItems:"center"}}>
                    <button
                      onClick={()=>doPick(key)}
                      disabled={isLocked}
                      style={{
                        width:"100%",padding:"14px 4px",borderRadius:12,
                        border:`2px solid ${picked?col:isWinner?col:`${col}44`}`,
                        background:picked?`${col}22`:isWinner?"rgba(97,169,120,0.08)":"rgba(26,39,68,0.4)",
                        color:picked?col:isWinner?col:"#8899b4",
                        cursor:isLocked?"default":"pointer",
                        display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                        opacity:isLocked&&!picked&&iHaveOne&&!isWinner?0.4:1,
                        transition:"all 0.15s"
                      }}>
                      <span style={{fontSize:28}}>{flag}</span>
                      <span style={{fontFamily:"'DM Sans'",fontSize:12,fontWeight:600,textAlign:"center",lineHeight:1.2}}>{name}</span>
                      {picked&&<span style={{fontSize:10,color:col,fontFamily:"'DM Sans'",fontWeight:700}}>✓ {lang==="es"?"tu voto":"your pick"}</span>}
                      {isWinner&&!picked&&<span style={{fontSize:10,color:"#61a978",fontFamily:"'DM Sans'",fontWeight:700}}>✓ {lang==="es"?"resultado":"result"}</span>}
                    </button>
                    {/* Avatars of people who picked this */}
                    {byOutcome[key].length>0&&(
                      <div style={{display:"flex",flexWrap:"wrap",gap:3,justifyContent:"center"}}>
                        {byOutcome[key].map(idx=>(
                          <AvatarWithName key={idx} idx={idx} name={playerNames[idx]||`P${idx+1}`} size={24} picVersion={picVersion}/>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {!isLocked&&myPlayerIdx===null&&(
              <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#5a6a8a",textAlign:"center",marginTop:8}}>
                {lang==="es"?"Selecciona tu jugador para predecir":"Select your player to make a prediction"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchChatModal({open, onClose, match, poolCode, myPlayerIdx, playerNames, initials, matchChat={}}) {
  const lang = useContext(LangContext);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const reactions = matchChat.reactions || {};
  const messages = matchChat.messages || [];
  const [a, b] = match.t;
  const ta = TBN[a], tb = TBN[b];

  useEffect(() => {
    if(open) setTimeout(() => messagesEndRef.current?.scrollIntoView({behavior:"smooth"}), 100);
  }, [open, messages.length]);

  if(!open) return null;

  const myName = playerNames[myPlayerIdx] || `Player ${myPlayerIdx+1}`;
  const code = poolCode || window.localStorage?.getItem("mundi_pool_code") || window.localStorage?.getItem("mundi_spectator_code");

  const doReaction = (emoji) => {
    if(myPlayerIdx===null||!code) return;
    toggleReaction(code, match.id, emoji, myPlayerIdx);
  };

  const doSend = async (text) => {
    if(!text.trim()||!code||myPlayerIdx===null) return;
    setSending(true);
    await sendChatMessage(code, match.id, myPlayerIdx, myName, text.trim());
    setSending(false);
    setInput("");
  };

  // All unique emojis used (presets + custom)
  const allEmojis = [...new Set([...PRESET_REACTIONS, ...Object.keys(reactions).filter(e=>!PRESET_REACTIONS.includes(e))])];

  return (
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxHeight:"80vh",background:"linear-gradient(165deg,#0a1628,#0f1e38)",borderRadius:"20px 20px 0 0",display:"flex",flexDirection:"column",overflow:"hidden",border:"1px solid #2a3a5c"}}>
        {/* Header */}
        <div style={{padding:"14px 16px 10px",borderBottom:"1px solid #1e2f50",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:22}}>{ta?.flag}</span>
            <span style={{fontFamily:"'Bebas Neue'",fontSize:16,color:"#8899b4",letterSpacing:1}}>vs</span>
            <span style={{fontSize:22}}>{tb?.flag}</span>
            <span style={{fontFamily:"'DM Sans'",fontSize:13,fontWeight:600,color:"#e0dcd4",marginLeft:4}}>{countryName(a,lang)} · {countryName(b,lang)}</span>
          </div>
          <button onClick={onClose} style={{width:28,height:28,borderRadius:"50%",border:"1px solid #2a3a5c",background:"transparent",color:"#5a6a8a",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

        {/* Reactions */}
        <div style={{padding:"12px 16px",borderBottom:"1px solid #1e2f50",flexShrink:0}}>
          <ReactionRow reactions={reactions} allEmojis={allEmojis} myPlayerIdx={myPlayerIdx} playerNames={playerNames} onReact={doReaction}/>
        </div>

        {/* Messages */}
        <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:10}}>
          {messages.length===0&&(
            <div style={{textAlign:"center",color:"#3a4a6a",fontFamily:"'DM Sans'",fontSize:13,fontStyle:"italic",marginTop:20}}>
              {lang==="es"?"Sé el primero en reaccionar 👇":"Be the first to react 👇"}
            </div>
          )}
          {messages.map((msg,i)=>{
            const color=getPlayerColor(msg.playerIdx,PC[msg.playerIdx]);
            const isMe=msg.playerIdx===myPlayerIdx;
            const time=new Date(msg.ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
            return(
              <div key={i} style={{display:"flex",gap:8,flexDirection:isMe?"row-reverse":"row",alignItems:"flex-end"}}>
                <div style={{width:28,height:28,borderRadius:8,background:color,color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{initials[msg.playerIdx]}</div>
                <div style={{maxWidth:"72%"}}>
                  {!isMe&&<div style={{fontFamily:"'DM Sans'",fontSize:10,color:color,fontWeight:600,marginBottom:2}}>{msg.playerName}</div>}
                  <div style={{background:isMe?`${color}22`:"rgba(26,39,68,0.6)",border:`1px solid ${isMe?color+"44":"#2a3a5c"}`,borderRadius:isMe?"12px 12px 4px 12px":"12px 12px 12px 4px",padding:"7px 11px"}}>
                    <span style={{fontFamily:"'DM Sans'",fontSize:13,color:"#e0dcd4",lineHeight:1.4}}>{msg.text}</span>
                  </div>
                  <div style={{fontFamily:"'DM Sans'",fontSize:9,color:"#3a4a6a",marginTop:2,textAlign:isMe?"right":"left"}}>{time}</div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef}/>
        </div>

        {/* Pre-set phrases */}
        <div style={{padding:"8px 16px 4px",borderTop:"1px solid #1e2f50",flexShrink:0}}>
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
            {(UI[lang]?.presetPhrases||UI.en.presetPhrases).map(phrase=>(
              <button key={phrase} onClick={()=>doSend(phrase)} style={{padding:"5px 10px",borderRadius:16,border:"1px solid #2a3a5c",background:"rgba(26,39,68,0.5)",color:"#8899b4",fontFamily:"'DM Sans'",fontSize:11,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                {phrase}
              </button>
            ))}
          </div>
        </div>

        {/* Text input */}
        <div style={{padding:"8px 16px 24px",display:"flex",gap:8,flexShrink:0}}>
          <input
            value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&doSend(input)}
            placeholder={lang==="es"?"Escribe algo...":"Say something..."}
            style={{flex:1,padding:"10px 14px",borderRadius:20,border:"1px solid #2a3a5c",background:"rgba(26,39,68,0.6)",color:"#e0dcd4",fontFamily:"'DM Sans'",fontSize:13,outline:"none"}}
          />
          <button onClick={()=>doSend(input)} disabled={!input.trim()||sending} style={{width:40,height:40,borderRadius:"50%",border:"none",background:input.trim()?"var(--accent)":"#2a3a5c",color:"#0a1628",fontSize:18,cursor:input.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>➤</button>
        </div>
      </div>
    </div>
  );
}

function SelectNameModal({open, onClose, onSelect, playerNames, picks}) {
  const lang=useContext(LangContext);
  const [selected, setSelected] = useState(null);
  if(!open) return null;
  const names = playerNames||[];
  return(
    <Modal open={open} onClose={onClose} title={t(lang,"selectName")}>
      <div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",marginBottom:16,lineHeight:1.6}}>
        {t(lang,"tapYourName")}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {names.map((name,i)=>{
          const color=PLAYER_COLORS[i%PLAYER_COLORS.length];
          const initials=name?name.slice(0,2).toUpperCase():"??";
          const teamCount=(picks||[]).filter(p=>p.playerIdx===i).length;
          return(
            <div key={i} onClick={()=>setSelected(i)} style={{background:selected===i?"rgba(201,168,76,0.1)":"rgba(26,39,68,0.6)",border:`1.5px solid ${selected===i?"var(--accent)":"#2a3a5c"}`,borderRadius:14,padding:"14px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,cursor:"pointer"}}>
              <PlayerAvatar idx={i} name={name} size={48}/>
              <div style={{fontFamily:"'DM Sans'",fontSize:12,fontWeight:700,color:"#e0dcd4",textAlign:"center"}}>{name||`Player ${i+1}`}</div>
              <div style={{fontFamily:"'DM Sans'",fontSize:9,color:"#5a6a8a"}}>{teamCount} teams</div>
            </div>
          );
        })}
      </div>
      <button onClick={()=>{if(selected!==null)onSelect(selected);}} disabled={selected===null} style={{width:"100%",padding:"14px 0",borderRadius:12,border:"none",background:selected!==null?"linear-gradient(135deg,var(--accent),var(--accent-dark))":"rgba(26,39,68,0.5)",color:selected!==null?"#0a1628":"#3d5070",fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:3,cursor:selected!==null?"pointer":"default"}}>
        {t(lang,"thatSMe")}
      </button>
    </Modal>
  );
}

async function savePlayerColor(playerIdx, color) {
  try {
    colorCache[playerIdx] = color;
    saveCaches();
    const code = window.localStorage?.getItem("mundi_pool_code") ||
                 window.localStorage?.getItem("mundi_spectator_code");
    if (!code) return;
    const colors = {};
    colors[String(playerIdx)] = color;
    await setDoc(doc(db, "pools", code), { playerColors: colors }, { merge: true });
  } catch(e) {}
}

async function loadPlayerColors(code) {
  try {
    const snap = await getDoc(doc(db, "pools", code));
    if (!snap.exists()) return {};
    return snap.data().playerColors || {};
  } catch(e) { return {}; }
}

function ProfileSetupModal({open, onClose, playerIdx, playerName, onDone, currentColor, onColorChange, onPicSaved}) {
  const lang=useContext(LangContext);
  const bump=useContext(PicBumpContext);
  const [pic, setPic] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null); // null = no selection yet
  const [takenColors, setTakenColors] = useState([]);
  const [cropSrc, setCropSrc] = useState(null); // raw image src for crop UI
  const [cropScale, setCropScale] = useState(1);
  const [cropOffset, setCropOffset] = useState({x:0,y:0});
  const [dragStart, setDragStart] = useState(null);
  const fileRef = useRef(null);
  const cropImgRef = useRef(null);
  const CROP_SIZE = 220;

  useEffect(()=>{
    if(!open||playerIdx===null) return;
    setPic(getProfilePic(playerIdx));
    setCropSrc(null);
    setSelectedColor(null);
    // Use colorCache immediately (already populated from Firebase on load)
    const takenFromCache=Object.entries(colorCache)
      .filter(([k])=>parseInt(k)!==playerIdx)
      .map(([,v])=>v);
    setTakenColors(takenFromCache);
    // Also refresh from Firebase in case cache is stale
    const code = window.localStorage?.getItem("mundi_pool_code")||window.localStorage?.getItem("mundi_spectator_code");
    if(code){
      loadProfilePics(code).then(()=>{
        setPic(getProfilePic(playerIdx));
        if(bump) bump(); // bump all avatars globally
      });
      loadPlayerColors(code).then(colors=>{
        const taken = Object.entries(colors).filter(([k])=>parseInt(k)!==playerIdx).map(([,v])=>v);
        setTakenColors(taken);
      });
    }
  },[open,playerIdx]);

  if(!open||playerIdx===null) return null;

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropSrc(ev.target.result);
      setCropScale(1);
      setCropOffset({x:0,y:0});
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value="";
  };

  const confirmCrop = () => {
    const img = cropImgRef.current;
    if(!img) return;
    const canvas = document.createElement("canvas");
    const OUT = 240;
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    ctx.beginPath(); ctx.arc(OUT/2,OUT/2,OUT/2,0,Math.PI*2); ctx.clip();
    // Image is rendered as CROP_SIZE x CROP_SIZE with object-fit:cover then scaled+offset
    // Reverse that to find what portion of the natural image is visible
    const nw = img.naturalWidth, nh = img.naturalHeight;
    // object-fit:cover scale: fill CROP_SIZE square
    const coverScale = Math.max(CROP_SIZE/nw, CROP_SIZE/nh);
    // rendered size at scale 1
    const rw = nw * coverScale, rh = nh * coverScale;
    // with cropScale applied
    const sw = rw * cropScale, sh = rh * cropScale;
    // top-left corner of rendered image in crop window coords
    const ix = (CROP_SIZE - sw) / 2 + cropOffset.x;
    const iy = (CROP_SIZE - sh) / 2 + cropOffset.y;
    // map crop window to natural image coords
    const sx = (-ix / cropScale) / coverScale;
    const sy = (-iy / cropScale) / coverScale;
    const sWidth = (CROP_SIZE / cropScale) / coverScale;
    const sHeight = (CROP_SIZE / cropScale) / coverScale;
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, OUT, OUT);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    saveProfilePicToFirestore(playerIdx, dataUrl);
    setPic(dataUrl);
    setCropSrc(null);
    onPicSaved&&onPicSaved();
  };

  const onMouseDown = (e) => { e.preventDefault(); setDragStart({x:e.clientX-cropOffset.x, y:e.clientY-cropOffset.y}); };
  const onMouseMove = (e) => { if(!dragStart) return; setCropOffset({x:e.clientX-dragStart.x, y:e.clientY-dragStart.y}); };
  const onMouseUp = () => setDragStart(null);
  const onTouchStart = (e) => { const t=e.touches[0]; setDragStart({x:t.clientX-cropOffset.x, y:t.clientY-cropOffset.y}); };
  const onTouchMove = (e) => { e.preventDefault(); if(!dragStart) return; const t=e.touches[0]; setCropOffset({x:t.clientX-dragStart.x, y:t.clientY-dragStart.y}); };

  // Crop UI
  if(cropSrc) return(
    <Modal open={open} onClose={()=>setCropSrc(null)} title={t(lang,"cropPhoto")}>
      <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#8899b4",textAlign:"center",marginBottom:12}}>{t(lang,"dragReposition")}</div>
      <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
        <div
          style={{width:CROP_SIZE,height:CROP_SIZE,borderRadius:"50%",overflow:"hidden",border:"3px solid var(--accent)",cursor:"grab",position:"relative",touchAction:"none",flexShrink:0,background:"#0a1628"}}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onMouseUp}
          onWheel={e=>{e.preventDefault();setCropScale(s=>Math.min(3,Math.max(1,s-e.deltaY*0.002)));}}
        >
          <img ref={cropImgRef} src={cropSrc} draggable={false}
            style={{
              position:"absolute",
              left:"50%", top:"50%",
              width:CROP_SIZE+"px",
              height:CROP_SIZE+"px",
              objectFit:"cover",
              transform:`translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px)) scale(${cropScale})`,
              transformOrigin:"center center",
              userSelect:"none", pointerEvents:"none"
            }}
          />
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <span style={{fontSize:14}}>🔍</span>
        <input type="range" min="1" max="3" step="0.05" value={cropScale}
          onChange={e=>setCropScale(parseFloat(e.target.value))}
          style={{flex:1,accentColor:"var(--accent)"}}/>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>setCropSrc(null)} style={{flex:1,padding:"12px 0",borderRadius:10,border:"1px solid #2a3a5c",background:"transparent",color:"#8899b4",fontFamily:"'Bebas Neue'",fontSize:15,letterSpacing:2,cursor:"pointer"}}>{t(lang,"back")}</button>
        <button onClick={confirmCrop} style={{flex:2,padding:"12px 0",borderRadius:10,border:"none",background:"linear-gradient(135deg,var(--accent),var(--accent-dark))",color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,cursor:"pointer"}}>{t(lang,"usePhoto")}</button>
      </div>
    </Modal>
  );

  return(
    <Modal open={open} onClose={onClose} title={t(lang,"yourProfile")}>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,marginBottom:20}}>
        <PlayerAvatar idx={playerIdx} name={playerName} size={88} refresh={pic?1:0}/>
        <div style={{fontFamily:"'DM Sans'",fontSize:15,fontWeight:700,color:"#e0dcd4"}}>{playerName}</div>
      </div>
      {!pic?(
        <button onClick={()=>fileRef.current?.click()} style={{width:"100%",padding:"16px 0",borderRadius:12,border:"none",background:"linear-gradient(135deg,var(--accent),var(--accent-dark))",color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:3,cursor:"pointer",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
          {t(lang,"addPhoto")}
        </button>
      ):(
        <button onClick={()=>fileRef.current?.click()} style={{width:"100%",padding:"13px 0",borderRadius:12,border:"1.5px solid var(--accent)",background:"rgba(201,168,76,0.08)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,cursor:"pointer",marginBottom:8}}>
          {t(lang,"changePhoto")}
        </button>
      )}
      <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#5a6a8a",textAlign:"center",marginBottom:20,lineHeight:1.5}}>
        {pic?t(lang,"photoCaptionDone"):t(lang,"photoCaption")}
      </div>
      <div style={{marginBottom:20}}>
        <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#5a6a8a",letterSpacing:1,marginBottom:10}}>{t(lang,"yourColour")}</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {PLAYER_PICK_COLORS.map(c=>{
            const taken=takenColors.includes(c)&&c!==selectedColor;
            return(
              <div key={c} onClick={()=>{if(!taken){setSelectedColor(c);onColorChange&&onColorChange(c);savePlayerColor(playerIdx,c);}}}
                style={{width:32,height:32,borderRadius:8,background:taken?"#1a2744":"transparent",border:`3px solid ${selectedColor===c?"white":taken?"#2a3a5c":c}`,cursor:taken?"not-allowed":"pointer",position:"relative",overflow:"hidden"}}>
                {!taken&&<div style={{width:"100%",height:"100%",background:c,borderRadius:5}}/>}
                {taken&&<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🔒</div>}
              </div>
            );
          })}
        </div>
      </div>
      <button onClick={()=>{if(!selectedColor)return;onColorChange&&onColorChange(selectedColor);savePlayerColor(playerIdx,selectedColor);onDone();}} style={{width:"100%",padding:"13px 0",borderRadius:12,border:"none",background:selectedColor?(pic?`linear-gradient(135deg,${selectedColor},${selectedColor}cc)`:`linear-gradient(135deg,${selectedColor},${selectedColor}cc)`):"rgba(26,39,68,0.6)",color:selectedColor?"#0a1628":"#3d5070",fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:3,cursor:selectedColor?"pointer":"default"}}>
        {pic?t(lang,"looksGood"):t(lang,"skipForNow")}
      </button>
    </Modal>
  );
}


const PLAYER_PICK_COLORS = [
  "#c9a84c","#e879a0","#a855f7","#14b8a6","#3b82f6","#22c55e","#f97316","#ef4444",
  "#6b9bd1","#61a978","#d97757","#ec4899","#f59e0b","#06b6d4","#84cc16","#8b5cf6",
  "#ff6b6b","#6ee7b7","#fbbf24","#94a3b8",
];

const THEME_COLORS = [
  {name:"Gold",value:"#c9a84c"},
  {name:"Pink",value:"#e879a0"},
  {name:"Purple",value:"#a855f7"},
  {name:"Teal",value:"#14b8a6"},
  {name:"Blue",value:"#3b82f6"},
  {name:"Green",value:"#22c55e"},
  {name:"Orange",value:"#f97316"},
  {name:"Red",value:"#ef4444"},
  {name:"Coral",value:"#ff6b6b"},
  {name:"Mint",value:"#6ee7b7"},
  {name:"Lavender",value:"#c4b5fd"},
  {name:"Rose",value:"#fb7185"},
];

function FinaleSequence({playerData, bracket, koResults, matchResults, config, initials, picRefresh, lang, onDone}) {
  // Phase 1: final score splash, Phase 2: leaderboard reveal (8→1)
  const [phase, setPhase] = useState('splash'); // 'splash' | 'reveal' | 'summary'
  const [revealIdx, setRevealIdx] = useState(0); // 0=8th place, 7=1st place
  const [cardPhase, setCardPhase] = useState('enter'); // 'enter' | 'hold' | 'exit'
  const [splashPhase, setSplashPhase] = useState('in'); // 'in' | 'hold' | 'out'
  const [summaryPhase, setSummaryPhase] = useState('in');

  const finalResult = koResults["K104"];
  const finalW = koWinner(finalResult);
  const finalBk = bracket["K104"] || {};
  const winner = finalW === "A" ? finalBk.a : finalBk.b;
  const loser = finalW === "A" ? finalBk.b : finalBk.a;
  const winnerTm = TBN[winner] || {};
  const loserTm = TBN[loser] || {};
  const winnerFlag = winnerTm.flag || "🏆";
  const loserFlag = loserTm.flag || "";
  const finalScore = finalResult ? `${finalResult.home} – ${finalResult.away}` : "? – ?";

  // Sort players 8th to 1st for reveal
  // Sort players 8th to 1st for reveal — handled below at line of use

  // Splash animation
  useEffect(() => {
    if(phase !== 'splash') return;
    const t1 = setTimeout(() => setSplashPhase('hold'), 400);
    const t2 = setTimeout(() => setSplashPhase('out'), 4500);
    const t3 = setTimeout(() => { setPhase('reveal'); setCardPhase('enter'); }, 5200);
    return () => [t1,t2,t3].forEach(clearTimeout);
  }, [phase]);

  // Card flip cycle — revealIdx 0=8th place, 7=1st place
  useEffect(() => {
    if(phase !== 'reveal') return;
    if(cardPhase === 'enter') {
      const t = setTimeout(() => setCardPhase('hold'), 400);
      return () => clearTimeout(t);
    }
    if(cardPhase === 'hold') {
      const t = setTimeout(() => setCardPhase('exit'), 3600);
      return () => clearTimeout(t);
    }
    if(cardPhase === 'exit') {
      const t = setTimeout(() => {
        if(revealIdx < playerData.length - 1) {
          setRevealIdx(i => i + 1);
          setCardPhase('enter');
        } else {
          setPhase('summary');
          setSummaryPhase('in');
          setTimeout(() => setSummaryPhase('hold'), 50);
        }
      }, 500);
      return () => clearTimeout(t);
    }
  }, [phase, cardPhase, revealIdx]);

  // revealOrder: index 0=last place, index 7=1st place
  const revealOrder = [...playerData].reverse();
  const p = revealOrder[revealIdx];
  const rank = playerData.length - revealIdx; // 8,7,6...1

  // Build team breakdown for current player, sorted by pts desc
  const teamBreakdown = p ? (p.myTeams || []).map(team => {
    const tgs = (() => {
      let pts = 0;
      GM.forEach(m => {
        const r = matchResults[m.id]; if(!r||r.home==null)return;
        const isHome=m.t[0]===team,isAway=m.t[1]===team;
        if(!isHome&&!isAway)return;
        const out = r.home>r.away?"A":r.away>r.home?"B":"D";
        if((isHome&&out==="A")||(isAway&&out==="B"))pts+=3;
        else if(out==="D")pts+=1;
      }); return pts;
    })();
    const tko = teamKOPts(team, bracket, koResults, config.koPoints);
    const {stage} = getTeamStage(team, bracket, koResults, matchResults);
    return {team, pts: tgs+tko, stage, flag: TBN[team]?.flag||"🏳️"};
  }).sort((a,b) => b.pts - a.pts) : [];

  const isWinner = rank === 1;
  const cardRotate = cardPhase === 'enter' ? 'rotateY(90deg)' : cardPhase === 'exit' ? 'rotateY(-90deg)' : 'rotateY(0deg)';
  const cardOpacity = cardPhase === 'hold' ? 1 : 0;

  const splashOpacity = splashPhase === 'hold' ? 1 : 0;
  const splashScale = splashPhase === 'hold' ? 'scale(1)' : splashPhase === 'in' ? 'scale(0.85)' : 'scale(1.05)';

  const rankLabels = ['','🥇','🥈','🥉','4th','5th','6th','7th','8th'];

  return (
    <div style={{position:"fixed",inset:0,zIndex:1000,background:"linear-gradient(165deg,#020810,#050f20)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <style>{`
        @keyframes goldPulse{0%,100%{opacity:0.6}50%{opacity:1}}
        @keyframes starFloat{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(-120vh) rotate(720deg);opacity:0}}
        @keyframes confettiBurst{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(-110vh) rotate(900deg);opacity:0}}
        @keyframes splashPop{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
      `}</style>

      {/* Gold star particles always in bg */}
      {Array.from({length:20},(_,i)=>(
        <div key={i} style={{position:"absolute",left:`${5+i*4.5}%`,bottom:-20,fontSize:10+Math.random()*8,animation:`starFloat ${4+Math.random()*6}s ${Math.random()*4}s linear infinite`,opacity:0.4}}>⭐</div>
      ))}

      {/* === PHASE 1: SPLASH === */}
      {phase === 'splash' && (
        <div style={{textAlign:"center",transition:"opacity 0.4s, transform 0.5s",opacity:splashOpacity,transform:splashScale}}>
          {/* Winner confetti */}
          {splashPhase==='hold'&&Array.from({length:30},(_,i)=>(
            <div key={i} style={{position:"absolute",left:`${Math.random()*100}%`,top:-20,width:8+Math.random()*6,height:8+Math.random()*6,background:['#c9a84c','#ffd700','#fff0a0','#e0b834','#f5d060'][i%5],borderRadius:2,animation:`confettiBurst ${2+Math.random()*2}s ${Math.random()*0.8}s linear forwards`,transform:`rotate(${Math.random()*360}deg)`}}/>
          ))}
          <div style={{fontSize:60,marginBottom:8}}>🏆</div>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:"#c9a84c",letterSpacing:4,marginBottom:16}}>WORLD CUP 2026 CHAMPION</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:20,marginBottom:16}}>
            <span style={{fontSize:56}}>{winnerFlag}</span>
            <div style={{textAlign:"center"}}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:52,color:"#e0dcd4",letterSpacing:4,lineHeight:1}}>{finalScore}</div>
              {finalResult?.pens && <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#8899b4",marginTop:4}}>{winner} won on penalties</div>}
            </div>
            <span style={{fontSize:56,opacity:0.4}}>{loserFlag}</span>
          </div>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:28,color:"#c9a84c",letterSpacing:6,animation:"goldPulse 1.5s ease-in-out infinite"}}>{countryName(winner,"en")}</div>
          <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#3d5070",marginTop:12,letterSpacing:2}}>ARE WORLD CHAMPIONS</div>
        </div>
      )}

      {/* === PHASE 2: LEADERBOARD REVEAL === */}
      {phase === 'reveal' && p && (
        <>
          {/* Header */}
          <div style={{position:"absolute",top:24,textAlign:"center",width:"100%"}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:13,color:"#c9a84c",letterSpacing:4,opacity:0.7}}>FINAL STANDINGS</div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:11,color:"#3d5070",letterSpacing:3}}>{revealIdx+1} of {playerData.length}</div>
          </div>

          {/* Card */}
          <div style={{width:"calc(100% - 48px)",maxWidth:400,transition:"transform 0.4s ease-in-out, opacity 0.25s",transform:cardRotate,opacity:cardOpacity,perspective:1000}}>
            <div style={{background:isWinner?"linear-gradient(165deg,#1a1200,#2a2000)":"linear-gradient(165deg,#0a1628,#0f1e38)",borderRadius:16,padding:"20px 20px 16px",border:isWinner?"2px solid #c9a84c":"1px solid #1e3060",boxShadow:isWinner?"0 0 40px rgba(201,168,76,0.3)":"0 4px 24px rgba(0,0,0,0.6)"}}>
              {/* Rank + name + score */}
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:isWinner?48:36,color:isWinner?"#c9a84c":p.color,letterSpacing:1,minWidth:56,textAlign:"center",lineHeight:1}}>
                  {rankLabels[rank]||`#${rank}`}
                </div>
                <PlayerAvatar idx={p.idx} name={p.name} size={isWinner?52:44} refresh={picRefresh} style={{borderRadius:"50%",flexShrink:0,border:isWinner?"2px solid #c9a84c":"2px solid #1e3060"}}/>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"'DM Sans'",fontSize:isWinner?20:17,fontWeight:900,color:p.color,display:"flex",alignItems:"center",gap:6}}>
                    {p.name}
                    {isWinner&&<span style={{fontSize:16}}>🏆</span>}
                    {p.allEliminated&&!p.finalDone&&<span style={{fontSize:12}}>❌</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"baseline",gap:4,marginTop:2}}>
                    <span style={{fontFamily:"'Bebas Neue'",fontSize:isWinner?36:28,color:isWinner?"#c9a84c":p.color,lineHeight:1}}>{p.total}</span>
                    <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#5a6a8a"}}>pts</span>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div style={{height:1,background:`${p.color}22`,marginBottom:12}}/>

              {/* Country breakdown */}
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {teamBreakdown.map(({team,pts,stage,flag})=>(
                  <div key={team} style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:14,flexShrink:0}}>{flag}</span>
                    <span style={{fontFamily:"'DM Sans'",fontSize:11,fontWeight:600,color:"#c8c0b0",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{countryName(team,"en")}</span>
                    <span style={{fontFamily:"'Bebas Neue'",fontSize:11,color:"#5a6a8a",background:"rgba(26,39,68,0.8)",padding:"1px 5px",borderRadius:3,flexShrink:0,letterSpacing:0.5}}>{stage}</span>
                    <span style={{fontFamily:"'Bebas Neue'",fontSize:13,color:pts>0?p.color:"#3d5070",width:32,textAlign:"right",flexShrink:0}}>{pts}</span>
                  </div>
                ))}
              </div>

              {/* Winner special glow */}
              {isWinner&&<div style={{textAlign:"center",marginTop:14,fontFamily:"'Bebas Neue'",fontSize:12,color:"#c9a84c",letterSpacing:3,animation:"goldPulse 1.5s ease-in-out infinite"}}>🏆 MUNDIALITO CHAMPION 🏆</div>}
            </div>
          </div>

          {/* Skip */}
          <button onClick={onDone} style={{position:"absolute",bottom:24,right:20,fontFamily:"'DM Sans'",fontSize:11,color:"#3d5070",background:"transparent",border:"none",cursor:"pointer",letterSpacing:1}}>SKIP ›</button>
        </>
      )}

      {/* === PHASE 3: SUMMARY === */}
      {phase === 'summary' && (
        <>
          <div style={{width:"calc(100% - 32px)",maxWidth:420,transition:"opacity 0.6s, transform 0.6s",opacity:summaryPhase==='hold'?1:0,transform:summaryPhase==='hold'?'translateY(0)':'translateY(30px)'}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:14,color:"#c9a84c",letterSpacing:4}}>🏆 FINAL STANDINGS 🏆</div>
              <div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#3d5070",letterSpacing:2}}>MUNDIALITO 2026</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {playerData.map((p,i)=>{
                const isFirst=i===0;
                const medals=['🥇','🥈','🥉'];
                return(
                  <div key={p.idx} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:10,background:isFirst?"linear-gradient(135deg,rgba(201,168,76,0.15),rgba(201,168,76,0.05))":"rgba(26,39,68,0.4)",border:isFirst?"1px solid rgba(201,168,76,0.4)":"1px solid #1e2f50"}}>
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:i<3?18:14,color:p.color,width:28,textAlign:"center",flexShrink:0}}>{medals[i]||`#${i+1}`}</div>
                    <PlayerAvatar idx={p.idx} name={p.name} size={32} refresh={picRefresh} style={{borderRadius:"50%",flexShrink:0}}/>
                    <div style={{fontFamily:"'DM Sans'",fontSize:13,fontWeight:700,color:p.color,flex:1}}>{p.name}{p.isChampion&&p.finalDone?' 🏆':''}</div>
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:isFirst?"#c9a84c":p.color}}>{p.total}<span style={{fontFamily:"'DM Sans'",fontSize:9,color:"#5a6a8a",marginLeft:2}}>pts</span></div>
                  </div>
                );
              })}
            </div>
          </div>
          <button onClick={async()=>{
            try{
              const bebas=new FontFace("BebasNeue","url(https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXoo9WdhyyTh89ZNpQ.woff2)");
              const dm=new FontFace("DMSans","url(https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZa4ET-DNl0.woff2)");
              await Promise.all([bebas.load(),dm.load()]);
              document.fonts.add(bebas);document.fonts.add(dm);
            }catch(e){}
            const W=420,HEADER=110,ROW=64,PAD=14,FOOT=44;
            const H=HEADER+ROW*playerData.length+FOOT;
            const canvas=document.createElement("canvas");
            const DPR=2;canvas.width=W*DPR;canvas.height=H*DPR;
            const ctx=canvas.getContext("2d");ctx.scale(DPR,DPR);
            // Background
            const bg=ctx.createLinearGradient(0,0,0,H);
            bg.addColorStop(0,"#020810");bg.addColorStop(0.5,"#050f20");bg.addColorStop(1,"#020810");
            ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
            // Gold top bar
            const bar=ctx.createLinearGradient(0,0,W,0);
            bar.addColorStop(0,"#c9a84c");bar.addColorStop(0.5,"#e8c96a");bar.addColorStop(1,"#c9a84c");
            ctx.fillStyle=bar;ctx.fillRect(0,0,W,5);
            // Trophy + title
            ctx.font=`400 36px Arial`;ctx.textAlign="center";ctx.fillText("🏆",W/2,48);
            ctx.fillStyle="#c9a84c";ctx.font=`700 32px BebasNeue,Arial`;ctx.fillText("MUNDIALITO 2026",W/2,78);
            ctx.fillStyle="#4a5a7a";ctx.font=`400 10px DMSans,Arial`;ctx.fillText("FINAL STANDINGS · WORLD CUP 2026",W/2,94);
            ctx.fillStyle="#c9a84c";ctx.globalAlpha=0.2;ctx.fillRect(PAD*3,102,W-PAD*6,1);ctx.globalAlpha=1;
            // Rows
            for(let ri=0;ri<playerData.length;ri++){
              const p=playerData[ri];const y=HEADER+ri*ROW;
              const color=p.color||"#c9a84c";const isFirst=ri===0;const isTop3=ri<3;
              const champion=p.isChampion&&p.finalDone;
              // Row bg
              if(isFirst){
                const rowBg=ctx.createLinearGradient(0,y,W,y);
                rowBg.addColorStop(0,`${color}22`);rowBg.addColorStop(1,"transparent");
                ctx.fillStyle=rowBg;ctx.beginPath();
                ctx.roundRect?ctx.roundRect(PAD,y+2,W-PAD*2,ROW-4,8):ctx.rect(PAD,y+2,W-PAD*2,ROW-4);
                ctx.fill();
              }
              // Divider
              ctx.fillStyle="rgba(20,35,65,0.9)";ctx.fillRect(PAD,y+ROW-1,W-PAD*2,1);
              // Rank
              const medals=["🥇","🥈","🥉"];
              if(isTop3){ctx.font=`400 ${isFirst?24:19}px Arial`;ctx.textAlign="center";ctx.fillText(medals[ri],PAD+22,y+ROW/2+9);}
              else{ctx.font=`700 13px BebasNeue,Arial`;ctx.fillStyle="#2a3a5a";ctx.textAlign="center";ctx.fillText(`#${ri+1}`,PAD+22,y+ROW/2+5);}
              // Avatar
              const ax=PAD+62,ay=y+ROW/2,AR=isTop3?19:16;
              ctx.save();
              if(isFirst){ctx.beginPath();ctx.arc(ax,ay,AR+4,0,Math.PI*2);ctx.fillStyle=color;ctx.globalAlpha=0.25;ctx.fill();ctx.globalAlpha=1;}
              ctx.beginPath();ctx.arc(ax,ay,AR,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.clip();
              const pic=getProfilePic(p.idx);
              if(pic){try{await new Promise((res,rej)=>{const img=new Image();img.onload=()=>{ctx.drawImage(img,ax-AR,ay-AR,AR*2,AR*2);res();};img.onerror=rej;img.src=pic;});}catch{ctx.font=`700 ${AR*0.7}px BebasNeue,Arial`;ctx.fillStyle="#0a1628";ctx.textAlign="center";ctx.fillText(initials[p.idx]||"?",ax,ay+AR*0.25);}}
              else{ctx.font=`700 ${AR*0.7}px BebasNeue,Arial`;ctx.fillStyle="#0a1628";ctx.textAlign="center";ctx.fillText(initials[p.idx]||"?",ax,ay+AR*0.25);}
              ctx.restore();
              // Name + champion badge
              const nameX=PAD+92;
              ctx.textAlign="left";
              ctx.font=`${champion?900:700} ${isFirst?20:17}px DMSans,Arial`;
              ctx.fillStyle=color;
              ctx.fillText(p.name+(champion?" 🏆":""),nameX,y+ROW/2+(isFirst?2:3));
              // Score
              ctx.textAlign="right";
              ctx.font=`700 ${isFirst?32:26}px BebasNeue,Arial`;
              ctx.fillStyle=isFirst?"#c9a84c":color;
              ctx.fillText(p.total,W-PAD-4,y+ROW/2+9);
              ctx.font=`400 9px DMSans,Arial`;ctx.fillStyle="#3a4a6a";
              ctx.fillText("pts",W-PAD-4,y+ROW/2+20);
            }
            // Footer
            ctx.fillStyle="#2a3a5a";ctx.font=`400 10px DMSans,Arial`;ctx.textAlign="center";
            ctx.fillText("elmundialito.github.io/2026",W/2,H-14);
            // Share
            canvas.toBlob(async blob=>{
              if(!blob)return;
              const file=new File([blob],"mundialito-final.png",{type:"image/png"});
              if(navigator.canShare&&navigator.canShare({files:[file]})){
                try{await navigator.share({files:[file],title:"Mundialito 2026 Final Standings"});return;}catch{}
              }
              const url=URL.createObjectURL(blob);
              const a=document.createElement("a");a.href=url;a.download="mundialito-final.png";a.click();
              setTimeout(()=>URL.revokeObjectURL(url),2000);
            },"image/png");
          }} style={{marginTop:16,width:"100%",padding:"12px",borderRadius:10,border:"1px solid rgba(201,168,76,0.5)",background:"rgba(201,168,76,0.1)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:15,letterSpacing:2,cursor:"pointer"}}>
            📤 SHARE FINAL STANDINGS
          </button>
          <button onClick={onDone} style={{marginTop:10,width:"100%",padding:"10px",borderRadius:10,border:"1px solid #1e2f50",background:"transparent",color:"#5a6a8a",fontFamily:"'Bebas Neue'",fontSize:13,letterSpacing:2,cursor:"pointer"}}>
            CLOSE
          </button>
        </>
      )}
    </div>
  );
}

function ResultOverlay({results, onDone}) {
  // results = [{team, flag, outcome: "W"|"D"|"L", opponent, opponentFlag, score}]
  const lang=useContext(LangContext);
  const [idx,setIdx]=useState(0);
  const [phase,setPhase]=useState("in"); // in | hold | out
  const current=results[idx];

  useEffect(()=>{
    setPhase("in");
    const t1=setTimeout(()=>setPhase("hold"),400);
    const t2=setTimeout(()=>setPhase("out"),2600);
    const t3=setTimeout(()=>{
      if(idx<results.length-1){setIdx(i=>i+1);}
      else{onDone();}
    },3100);
    return()=>{clearTimeout(t1);clearTimeout(t2);clearTimeout(t3);};
  },[idx]);

  if(!current)return null;
  const isWin=current.outcome==="W";
  const isLoss=current.outcome==="L";
  const isDraw=current.outcome==="D";
  const isKO=current.isKO||false;
  const isFinal=current.isFinal||false;
  const pens=current.pens||false;

  const bg=isWin
    ?(isFinal?"linear-gradient(165deg,#1a1200,#2a2000)":"linear-gradient(165deg,#0a2010,#0f3820)")
    :isLoss?"linear-gradient(165deg,#200a0a,#380f0f)":"linear-gradient(165deg,#0a1020,#0f1a30)";
  const accent=isWin?(isFinal?"#c9a84c":"#61a978"):isLoss?"#d97757":"#6b9bd1";
  const emoji=isFinal&&isWin?"🏆":isKO&&isWin?"🎉":isKO&&isLoss?"😭":isWin?"🎉":isLoss?"😢":"🤷";

  // KO messages
  const roundLabel={r32:"Round of 32",r16:"Round of 16",qf:"Quarter-Final",sf:"Semi-Final",third:"3rd Place",final:"Final"}[current.round]||"";
  const pensSuffix=pens?" (on penalties)":"";
  const pensES=pens?" (en penales)":"";
  const msgEN=isFinal&&isWin
    ?`🏆 ${countryName(current.team,"en")} ARE WORLD CHAMPIONS!`
    :isKO&&isWin
    ?`${countryName(current.team,"en")} PROGRESS!${pensSuffix}`
    :isKO&&isLoss
    ?`${countryName(current.team,"en")} ELIMINATED${pensSuffix}`
    :isWin?`${countryName(current.team,"en")} WIN!`:isLoss?`${countryName(current.team,"en")} LOSE`:"DRAW";
  const msgES=isFinal&&isWin
    ?`🏆 ¡${countryName(current.team,"es")} SON CAMPEONES!`
    :isKO&&isWin
    ?`¡${countryName(current.team,"es")} AVANZA!${pensES}`
    :isKO&&isLoss
    ?`${countryName(current.team,"es")} ELIMINADO${pensES}`
    :isWin?`¡${countryName(current.team,"es")} GANA!`:isLoss?`${countryName(current.team,"es")} PIERDE`:"EMPATE";
  const msg=lang==="es"?msgES:msgEN;

  // Sub-label for KO round
  const subLabel=isKO&&!isFinal?roundLabel:"";

  const score=`${current.score.home} – ${current.score.away}`;
  const opacity=phase==="in"?0:phase==="hold"?1:0;
  const scale=phase==="in"?0.8:phase==="hold"?1:0.9;

  const confettiColors=isWin&&isFinal
    ?["#c9a84c","#ffd700","#fff0a0","#e0b834","#f5d060","#c9a84c"]
    :["#61a978","#c9a84c","#6b9bd1","#d97757","#b67ad6","#e0b834"];
  const confetti=isWin?Array.from({length:isFinal?40:28},(_,i)=>({
    id:i, x:Math.random()*100, delay:Math.random()*0.6,
    color:confettiColors[i%confettiColors.length],
    size:6+Math.random()*8, rotation:Math.random()*360,
  })):[];

  return(
    <div style={{position:"fixed",inset:0,zIndex:999,background:bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",transition:"opacity 0.4s, transform 0.4s",opacity,transform:`scale(${scale})`}}>
      <style>{`
        @keyframes confettiFall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}
        @keyframes sadFall{0%{transform:translateY(-20px);opacity:0}20%{opacity:1}100%{transform:translateY(110vh);opacity:0}}
        @keyframes shrug{0%,100%{transform:rotate(0deg)}25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}
        @keyframes resultPop{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
      `}</style>

      {/* Falling particles */}
      {isWin&&confetti.map(c=>(
        <div key={c.id} style={{position:"absolute",left:`${c.x}%`,top:-20,width:c.size,height:c.size,background:c.color,borderRadius:2,animation:`confettiFall ${1.8+Math.random()*1.2}s ${c.delay}s linear forwards`,transform:`rotate(${c.rotation}deg)`}}/>
      ))}
      {isLoss&&Array.from({length:8},(_,i)=>(
        <div key={i} style={{position:"absolute",left:`${10+i*11}%`,top:-20,fontSize:28,animation:`sadFall ${2+i*0.15}s ${i*0.15}s linear forwards`}}>{isKO?"😭":"😢"}</div>
      ))}

      {/* Main content */}
      <div style={{textAlign:"center",animation:"resultPop 0.4s ease-out forwards",padding:"0 32px"}}>
        {subLabel&&<div style={{fontFamily:"'Bebas Neue'",fontSize:13,color:accent,letterSpacing:3,marginBottom:8,opacity:0.8}}>{subLabel}</div>}
        <div style={{fontSize:isDraw?64:isFinal&&isWin?88:72,marginBottom:12,animation:isDraw?"shrug 0.8s ease-in-out 0.4s 2":"none"}}>{emoji}</div>
        <div style={{fontSize:20,marginBottom:8,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
          <span style={{fontSize:36}}>{current.flag}</span>
          <span style={{fontSize:24}}>vs</span>
          <span style={{fontSize:36}}>{current.opponentFlag}</span>
        </div>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:52,color:accent,letterSpacing:4,lineHeight:1,marginBottom:8}}>{score}</div>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:isFinal&&isWin?28:24,color:"#e0dcd4",letterSpacing:3,lineHeight:1.3}}>{msg}</div>
        {results.length>1&&<div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#5a6a8a",marginTop:12}}>{idx+1} / {results.length}</div>}
      </div>

      <div style={{position:"absolute",bottom:40,fontFamily:"'DM Sans'",fontSize:12,color:"#3a4a6a"}}>{t(lang,"tapToContinue")}</div>
      <div style={{position:"absolute",inset:0}} onClick={()=>{setPhase("out");setTimeout(()=>{if(idx<results.length-1)setIdx(i=>i+1);else onDone();},300);}}/>
    </div>
  );
}

function ThemeModal({open, onClose, currentAccent, onSelect}) {
  if(!open) return null;
  return(
    <Modal open={open} onClose={onClose} title="CHOOSE YOUR THEME">
      <div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",marginBottom:16,lineHeight:1.6}}>
        Pick an accent colour. Only you will see this change — it won't affect anyone else's app.
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
        {THEME_COLORS.map(({name,value})=>(
          <div key={value} onClick={()=>{onSelect(value);onClose();}} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,cursor:"pointer"}}>
            <div style={{width:48,height:48,borderRadius:12,background:value,border:`3px solid ${currentAccent===value?"white":"transparent"}`,boxShadow:currentAccent===value?"0 0 0 2px "+value:"none"}}/>
            <div style={{fontFamily:"'DM Sans'",fontSize:10,color:currentAccent===value?"#e0dcd4":"#5a6a8a"}}>{name}</div>
          </div>
        ))}
      </div>
      <button onClick={onClose} style={{width:"100%",padding:"10px 0",borderRadius:10,border:"1px solid #2a3a5c",background:"transparent",color:"#8899b4",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer"}}>Close</button>
    </Modal>
  );
}


function SetupLockedScreen({config, onRename, onColorChange, onUnlock}) {
  const lang=useContext(LangContext);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [colorPickerIdx, setColorPickerIdx] = useState(null);
  const inputRef = useRef(null);

  const startEdit = (i) => {
    setEditingIdx(i);
    setEditVal(config.playerNames[i]||"");
    setTimeout(()=>inputRef.current?.focus(), 50);
  };

  const confirmEdit = () => {
    if(editingIdx!==null && editVal.trim()) {
      onRename(editingIdx, editVal.trim());
    }
    setEditingIdx(null);
  };

  return(
    <div style={{maxWidth:720,margin:"0 auto",padding:"0 16px"}}>
      <div style={{background:"rgba(201,168,76,0.08)",borderRadius:14,padding:"20px 24px",border:"1px solid rgba(201,168,76,0.2)"}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:2,color:"var(--accent)",marginBottom:4,textAlign:"center"}}>✓ SETUP LOCKED</div>
        <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#5a6a8a",textAlign:"center",marginBottom:16}}>Rename or change colours for any player</div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
          {(config.playerNames||[]).map((n,i)=>{
            const color=getPlayerColor(i,PC[i]);
            return(
            <div key={i}>
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,background:`${color}11`,border:`1px solid ${color}44`}}>
                {/* Colour swatch — tap to open picker */}
                <div onClick={()=>setColorPickerIdx(colorPickerIdx===i?null:i)} style={{width:28,height:28,borderRadius:7,background:color,color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer",border:"2px solid rgba(255,255,255,0.2)"}}>{nameToInitial(n||"")}</div>
                {editingIdx===i?(
                  <input
                    ref={inputRef}
                    value={editVal}
                    onChange={e=>setEditVal(e.target.value)}
                    onBlur={confirmEdit}
                    onKeyDown={e=>{if(e.key==="Enter")confirmEdit();if(e.key==="Escape")setEditingIdx(null);}}
                    style={{flex:1,padding:"4px 8px",borderRadius:6,border:`1.5px solid ${color}`,background:"rgba(10,22,40,0.6)",color:"#e0dcd4",fontFamily:"'DM Sans'",fontSize:14,fontWeight:600,outline:"none"}}
                  />
                ):(
                  <span style={{flex:1,fontFamily:"'DM Sans'",fontSize:14,fontWeight:600,color}}>{n}</span>
                )}
                {editingIdx===i?(
                  <button onClick={confirmEdit} style={{padding:"4px 10px",borderRadius:6,border:"none",background:color,color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:12,cursor:"pointer"}}>SAVE</button>
                ):(
                  <button onClick={()=>startEdit(i)} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${color}44`,background:"transparent",color,fontFamily:"'DM Sans'",fontSize:11,cursor:"pointer"}}>✏️</button>
                )}
              </div>
              {/* Inline colour picker */}
              {colorPickerIdx===i&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:6,padding:"10px 14px",background:"rgba(10,22,40,0.5)",borderRadius:"0 0 10px 10px",border:`1px solid ${color}44`,borderTop:"none"}}>
                  {PLAYER_PICK_COLORS.map(c=>{
                    const takenByOther=(config.playerNames||[]).some((_,j)=>j!==i&&getPlayerColor(j,PC[j])===c);
                    return(
                      <div key={c} onClick={()=>{if(!takenByOther){onColorChange(i,c);setColorPickerIdx(null);}}}
                        style={{width:28,height:28,borderRadius:7,background:takenByOther?"#1a2744":c,border:`3px solid ${color===c?"white":takenByOther?"#2a3a5c":c}`,cursor:takenByOther?"not-allowed":"pointer",opacity:takenByOther?0.4:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {takenByOther&&<span style={{fontSize:10}}>🔒</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}
        </div>
        <div style={{background:"rgba(107,155,209,0.08)",borderRadius:10,padding:"12px 16px",marginBottom:14,border:"1px solid rgba(107,155,209,0.2)"}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:12,letterSpacing:2,color:"#6b9bd1",marginBottom:4}}>SHARING</div>
          <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#8899b4",lineHeight:1.6}}>Scores auto-save to Firebase. Tap <span style={{color:"var(--accent)",fontWeight:600}}>📋 Share Pool Code</span> at the bottom to share with your group.</div>
        </div>
        <button onClick={onUnlock} style={{padding:"8px 20px",borderRadius:8,border:"1px solid #2a3a5c",background:"transparent",color:"#5a6a8a",fontFamily:"'DM Sans'",fontSize:12,cursor:"pointer"}}>Unlock &amp; Edit everything</button>
      </div>
    </div>
  );
}


function NotifBell() {
  const [status, setStatus] = useState("unknown");

  useEffect(()=>{
    if("Notification" in window) setStatus(Notification.permission);
  },[]);

  const handleTap = async () => {
    if(status === "granted") return;
    try {
      // Call native permission directly — must be synchronous from user tap for iOS
      const result = await Notification.requestPermission();
      setStatus(result);
      // Now register with OneSignal
      if(result === "granted" && window.OneSignalDeferred) {
        window.OneSignalDeferred.push(async (OneSignal) => {
          await OneSignal.Notifications.requestPermission();
        });
      }
    } catch(e) {}
  };

  if(status === "granted") return (
    <div style={{width:26,height:26,borderRadius:"50%",border:"1px solid rgba(97,169,120,0.4)",background:"rgba(97,169,120,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>🔔</div>
  );

  return (
    <button onClick={handleTap} style={{width:26,height:26,borderRadius:"50%",border:"1px solid #2a3a5c",background:"rgba(26,39,68,0.5)",color:"#5a6a8a",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>🔔</button>
  );
}

export default function Mundialito() {
  const [appState,setAppState]=useState("loading");
  const [isHost,setIsHost]=useState(false);
  const [st,setSt]=useState(EMPTY);
  const [activeTab,setActiveTab]=useState("knockout");
  const [lang,setLang]=useState(detectLang);
  const setLanguage=(l)=>{setLang(l);try{window.localStorage?.setItem("mundi_lang",l);}catch(e){}};
  const [showRules,setShowRules]=useState(false);
  const [showSync,setShowSync]=useState(false);
  const [showLoad,setShowLoad]=useState(false);
  const [showHostSwitch,setShowHostSwitch]=useState(false);
  const [showNotify,setShowNotify]=useState(false);
  const [showTheme,setShowTheme]=useState(false);
  const [showSuggestions,setShowSuggestions]=useState(false);
  const [scrolled,setScrolled]=useState(false);
  useEffect(()=>{
    const onFirstTouch=()=>{
      const code=window.localStorage?.getItem("mundi_pool_code")||window.localStorage?.getItem("mundi_spectator_code");
      if(code)loadProfilePics(code).then(()=>bumpPics(setPicRefresh));
      window.removeEventListener("pointerdown",onFirstTouch);
    };
    window.addEventListener("pointerdown",onFirstTouch,{once:true,passive:true});
    return()=>window.removeEventListener("pointerdown",onFirstTouch);
  },[]);
  useEffect(()=>{
    const onScroll=()=>setScrolled(window.scrollY>300);
    window.addEventListener("scroll",onScroll,{passive:true});
    return()=>window.removeEventListener("scroll",onScroll);
  },[]);
  const [picRefresh,setPicRefresh]=useState(0);
  const [saveStatus,setSaveStatus]=useState(null);
  const [resultOverlay,setResultOverlay]=useState(null); // array of result objects to show
  const [showFinale,setShowFinale]=useState(false);
  // Player data for finale — computed at top level
  const [myPlayerIdx,setMyPlayerIdx]=useState(()=>{try{const v=window.localStorage?.getItem("mundi_my_player");return v!==null?parseInt(v):null;}catch(e){return null;}});
  const [playerColors,setPlayerColors]=useState({});
  const [showSelectName,setShowSelectName]=useState(false);
  const [showProfileSetup,setShowProfileSetup]=useState(false);
  const [profileSetupIdx,setProfileSetupIdx]=useState(null);
  const [spectatorPoolCode,setSpectatorPoolCode]=useState(()=>{try{return window.localStorage?.getItem('mundi_spectator_code')||null;}catch(e){return null;}});
  const [allPredictions,setAllPredictions]=useState({});

  // Live sync for spectators
  useEffect(()=>{
    if(!spectatorPoolCode||appState!=="spectator")return;
    let picsLoaded=false;
    const unsub=onSnapshot(doc(db,'pools',spectatorPoolCode),(snap)=>{
      if(!snap.exists())return;
      try{
        const data=snap.data();
        const decoded=decode(data.state);
        if(decoded) setSt(mergeState(EMPTY,decoded));
        setAllPredictions(data.predictions||{});
        // Extract pics/colours directly from snapshot — no extra getDoc needed
        if(!picsLoaded){
          picsLoaded=true;
          const profiles=data.profiles||{};
          Object.keys(profiles).forEach(k=>{picCache[parseInt(k)]=profiles[k];});
          const colors=data.playerColors||{};
          Object.keys(colors).forEach(k=>{colorCache[parseInt(k)]=colors[k];});
          saveCaches();
          setPlayerColors(colors);
          bumpPics(setPicRefresh);
        }
      }catch(e){}
    });
    return ()=>unsub();
  },[spectatorPoolCode,appState]);
  const [showPoolMgr,setShowPoolMgr]=useState(false);
  const [pools,setPools]=useState([{id:"default",name:"My Pool"}]);
  const [activePoolId,setActivePoolId]=useState("default");
  const [activePoolName,setActivePoolName]=useState("My Pool");
  const [poolCode,setPoolCode]=useState(()=>{try{return window.localStorage?.getItem("mundi_pool_code")||null;}catch(e){return null;}});
  const [accentColor,setAccentColor]=useState(()=>{try{return window.localStorage?.getItem("mundi_accent")||"#c9a84c";}catch(e){return "#c9a84c";}});

  // Keep allPredictions live for host regardless of which tab is active
  useEffect(()=>{
    if(!poolCode)return;
    const unsub=onSnapshot(doc(db,'pools',poolCode),(snap)=>{
      if(snap.exists())setAllPredictions(snap.data().predictions||{});
    });
    return()=>unsub();
  },[poolCode]);

  // Inject accent colour as CSS variable
  useEffect(()=>{
    document.documentElement.style.setProperty("--accent", accentColor);
    // Derive darker shade for gradients
    document.documentElement.style.setProperty("--accent-dark", accentColor+"cc");
  },[accentColor]);

  const setAccent = (color) => {
    setAccentColor(color);
    try{window.localStorage?.setItem("mundi_accent", color);}catch(e){}
  };

  useEffect(()=>{
    // Check URL for shared code first
    const urlCode=getUrlCode();
    if(urlCode){
      try{
        const decoded=decode(urlCode);
        if(decoded){
          const merged=mergeState(EMPTY,decoded);
          setSt(merged);setIsHost(false);
          clearUrlCode();
          if(merged.draftLocked){
            const seen=window.localStorage?.getItem("mundi_intro_seen");
            if(seen){setAppState("spectator");setActiveTab("knockout");}
            else{setAppState("spectator_intro");}
          }else if(merged.setupLocked){setAppState("spectator");setActiveTab("draft");}
          else{setAppState("spectator");setActiveTab("setup");}
          return;
        }
      }catch(e){}
    }
    // Fall back to localStorage for host — load local state immediately for speed,
    // then fetch fresh from Firebase in background
    try{const raw=window.localStorage?.getItem(LOCAL_KEY);if(raw){const saved=JSON.parse(raw);setSt(mergeState(EMPTY,saved.st));setPools(saved.pools||[{id:"default",name:"My Pool"}]);setActivePoolId(saved.activePoolId||"default");setActivePoolName(saved.activePoolName||"My Pool");setIsHost(true);setAppState("host");setActiveTab("knockout");
    setTimeout(()=>requestNotificationPermission(), 2000);
    const code=window.localStorage?.getItem("mundi_pool_code")||window.localStorage?.getItem("mundi_spectator_code");
    if(code){
      // Single Firebase call — loadPool returns both game state AND pics/colours
      loadPool(code).then(fresh=>{
        if(fresh){
          // Load pics and colours from the same document fetch
          if(fresh._profiles){Object.keys(fresh._profiles).forEach(k=>{picCache[parseInt(k)]=fresh._profiles[k];});}
          if(fresh._playerColors){Object.keys(fresh._playerColors).forEach(k=>{colorCache[parseInt(k)]=fresh._playerColors[k];});saveCaches();}
          setPlayerColors(fresh._playerColors||{});
          setSt(prev=>{
          const localResults = prev.matchResults||{};
          const freshResults = fresh.matchResults||{};
          const localCount = Object.values(localResults).filter(v=>v!=null).length;
          const freshCount = Object.values(freshResults).filter(v=>v!=null).length;
          const merged = mergeState(prev, fresh);
          merged.matchResults = freshCount > localCount ? {...freshResults, ...localResults} : {...localResults, ...freshResults};
          merged.config = {...merged.config, playerNames: prev.config.playerNames};
          return merged;
          });
          bumpPics(setPicRefresh);
        }
      });
    }
    return;}}catch(e){}
    // Check for saved spectator code — auto-load their pool
    try{
      const savedCode=window.localStorage?.getItem("mundi_spectator_code");
      if(savedCode){
        setAppState("loading");
        loadPool(savedCode).then(data=>{
          if(data){
            // Load pics from same fetch response — populate BEFORE setSt then bump
            if(data._profiles){Object.keys(data._profiles).forEach(k=>{picCache[parseInt(k)]=data._profiles[k];});}
            if(data._playerColors){Object.keys(data._playerColors).forEach(k=>{colorCache[parseInt(k)]=data._playerColors[k];});saveCaches();}
            setPlayerColors(data._playerColors||{});
            const merged=mergeState(EMPTY,data);
            setSt(merged);setIsHost(false);
            setSpectatorPoolCode(savedCode);
            bumpPics(setPicRefresh);
            setTimeout(()=>requestNotificationPermission(), 2000);
            if(merged.draftLocked){
              const seen=window.localStorage?.getItem("mundi_intro_seen");
              if(seen){setAppState("spectator");setActiveTab("knockout");}
              else{setAppState("spectator_intro");}
            }else if(merged.setupLocked){setAppState("spectator");setActiveTab("draft");}
            else{setAppState("spectator");setActiveTab("setup");}
          } else {
            // Code no longer valid, go to welcome
            window.localStorage?.removeItem("mundi_spectator_code");
            setAppState("welcome");
          }
        }).catch(()=>setAppState("welcome"));
        return;
      }
    }catch(e){}
    setAppState("welcome");
  },[]);
  useEffect(()=>{if(appState!=="host")return;try{window.localStorage?.setItem(LOCAL_KEY,JSON.stringify({st,pools,activePoolId,activePoolName}));}catch(e){};},[st,appState,pools,activePoolId,activePoolName]);

  // picRefresh is bumped inside the loadPool.then() callback above — no extra effect needed

  // Keep a ref to latest st so the debounced save always sends fresh data
  const stRef=useRef(st);
  useEffect(()=>{stRef.current=st;},[st]);

  // Detect new results for this player's teams and show overlay
  const seenResultsRef=useRef(null);
  useEffect(()=>{
    if(myPlayerIdx===null||!st.draftLocked)return;
    const myTeams=new Set((st.picks||[]).filter(p=>p.playerIdx===myPlayerIdx).map(p=>p.team));
    if(myTeams.size===0)return;
    // Build key of all current results for my teams
    const currentSeen={};
    GM.forEach(m=>{
      const r=st.matchResults[m.id];
      if(!r||r.home==null||r.away==null)return;
      if(!myTeams.has(m.t[0])&&!myTeams.has(m.t[1]))return;
      currentSeen[m.id]=`${r.home}-${r.away}`;
    });
    // On first run, load from localStorage so we know what was seen last session
    if(seenResultsRef.current===null){
      try{
        const saved=window.localStorage?.getItem("mundi_seen_results");
        seenResultsRef.current=saved?JSON.parse(saved):{};
      }catch{seenResultsRef.current={};}
    }
    // Find newly seen results (not in localStorage from previous sessions)
    const newResults=[];
    Object.entries(currentSeen).forEach(([matchId,score])=>{
      if(seenResultsRef.current[matchId]===score)return; // already seen
      const match=GM.find(m=>m.id===matchId);
      if(!match)return;
      const r=st.matchResults[matchId];
      const isHomeTeam=myTeams.has(match.t[0]);
      const myTeamName=isHomeTeam?match.t[0]:match.t[1];
      const opponentName=isHomeTeam?match.t[1]:match.t[0];
      const myScore=isHomeTeam?r.home:r.away;
      const oppScore=isHomeTeam?r.away:r.home;
      const outcome=myScore>oppScore?"W":myScore<oppScore?"L":"D";
      newResults.push({
        team:myTeamName, flag:TBN[myTeamName]?.flag||"⚽",
        opponent:opponentName, opponentFlag:TBN[opponentName]?.flag||"⚽",
        outcome, score:{home:myScore,away:oppScore},
        matchId, // keep for chronological sort
      });
    });
    // Update seen ref and persist to localStorage
    seenResultsRef.current={...seenResultsRef.current,...currentSeen};
    try{window.localStorage?.setItem("mundi_seen_results",JSON.stringify(seenResultsRef.current));}catch{}
    if(newResults.length>0){
      // Sort chronologically by match order in GM fixture list
      newResults.sort((a,b)=>GM.findIndex(m=>m.id===a.matchId)-GM.findIndex(m=>m.id===b.matchId));
      // Only show animations for results within the last 72 hours
      const cutoff=Date.now()-(48*60*60*1000);
      const recent=newResults.filter(r=>{
        const match=GM.find(m=>m.id===r.matchId);
        if(!match)return false;
        try{
          const matchTime=match.ko
            ?new Date(match.d+"T"+match.ko+":00Z").getTime()
            :new Date(match.d+"T12:00:00Z").getTime();
          return matchTime>=cutoff;
        }catch{return false;}
      });
      if(recent.length>0) setResultOverlay(recent);
    }
  },[st.matchResults, myPlayerIdx]);




  // Auto-save to Firebase whenever host changes scores — debounced 800ms
  const autoSaveTimerRef=useRef(null);
  useEffect(()=>{
    if(appState!=="host")return;
    const code=window.localStorage?.getItem("mundi_pool_code")||poolCode||window.localStorage?.getItem("mundi_spectator_code");
    if(!code)return;
    setSaveStatus("saving");
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current=setTimeout(()=>{
      const pw=window.localStorage?.getItem("mundi_host_pw")||undefined;
      savePool(code,stRef.current,pw).then(ok=>{
        if(ok&&code!==poolCode){
          try{window.localStorage?.setItem("mundi_pool_code",code);}catch(e){}
          setPoolCode(code);
        }
        setSaveStatus(ok?"saved":null);
        if(ok)setTimeout(()=>setSaveStatus(null),2000);
      });
    },800);
    return()=>clearTimeout(autoSaveTimerRef.current);
  },[st.matchResults,st.koResults,st.koOverrides,appState,poolCode]);

  const initials=useMemo(()=>getInitials(st.config.playerNames||[]),[st.config.playerNames]);
  const anyGroupDone=useMemo(()=>Object.keys(GROUPS).some(g=>GM.filter(m=>m.g===g).every(m=>st.matchResults[m.id]!=null)),[st.matchResults]);
  const resolvedBracket=useMemo(()=>resolveKOBracket(st.matchResults,st.koResults,st.koOverrides,st.groupOrderOverride||{}),[st.matchResults,st.koResults,st.koOverrides,st.groupOrderOverride]);

  const finalePlayerData=useMemo(()=>{
    return Array.from({length:st.config.playerCount},(_,i)=>{
      const gsPts=playerGSPts(i,st.picks||[],st.matchResults);
      const koPts=playerKOPts(i,st.picks||[],resolvedBracket,st.koResults,st.config.koPoints);
      const myTeams=(st.picks||[]).filter(p=>p.playerIdx===i).map(p=>p.team);
      const color=getPlayerColor(i,PC[i]);
      const finalResult=st.koResults["K104"];
      const finalDone=!!koWinner(finalResult);
      const finalWinnerSide=koWinner(finalResult);
      const finalBk=resolvedBracket["K104"]||{};
      const champ=finalWinnerSide==="A"?finalBk.a:finalWinnerSide==="B"?finalBk.b:null;
      const isChampion=champ?myTeams.includes(champ):false;
      return{idx:i,name:st.config.playerNames[i],total:gsPts+koPts,myTeams,color,isChampion,finalDone};
    }).sort((a,b)=>b.total-a.total);
  },[st.config,st.picks,st.matchResults,resolvedBracket,st.koResults]);

  // KO result overlay — fires every time the app opens, for any of my team's KO results
  // within 12 hours after kickoff. No "seen" tracking — always show while within the window.
  const shownKOThisSessionRef=useRef(new Set());
  useEffect(()=>{
    if(myPlayerIdx===null)return;
    const myTeams=new Set((st.picks||[]).filter(p=>p.playerIdx===myPlayerIdx).map(p=>p.team));
    if(myTeams.size===0)return;
    const newResults=[];
    KM.forEach(m=>{
      const r=st.koResults[m.id];
      if(!r||typeof r==="string")return;
      const w=koWinner(r);if(!w)return;
      const bk=resolvedBracket[m.id];if(!bk?.a||!bk?.b)return;
      if(!myTeams.has(bk.a)&&!myTeams.has(bk.b))return;
      if(shownKOThisSessionRef.current.has(m.id))return; // already shown this session
      // Only show within 12h after kickoff
      try{
        const kickoff=m.ko?new Date(m.d+"T"+m.ko+":00Z").getTime():new Date(m.d+"T12:00:00Z").getTime();
        const windowEnd=kickoff+(12*60*60*1000);
        if(Date.now()>windowEnd)return;
      }catch{return;}
      const myTeamIsA=myTeams.has(bk.a);
      const myTeamName=myTeamIsA?bk.a:bk.b;
      const opponentName=myTeamIsA?bk.b:bk.a;
      const myScore=myTeamIsA?r.home:r.away;
      const oppScore=myTeamIsA?r.away:r.home;
      const won=(myTeamIsA&&w==="A")||(!myTeamIsA&&w==="B");
      const pens=!!(r.pens);
      const isFinal=m.round==="final";
      newResults.push({
        team:myTeamName, flag:TBN[myTeamName]?.flag||"⚽",
        opponent:opponentName, opponentFlag:TBN[opponentName]?.flag||"⚽",
        outcome:won?"W":"L", score:{home:myScore,away:oppScore},
        matchId:m.id, pens, isFinal, isKO:true, round:m.round,
      });
      shownKOThisSessionRef.current.add(m.id);
    });
    if(newResults.length>0){
      newResults.sort((a,b)=>KM.findIndex(m=>m.id===a.matchId)-KM.findIndex(m=>m.id===b.matchId));
      setResultOverlay(prev=>prev?[...prev,...newResults]:newResults);
    }
  },[st.koResults, myPlayerIdx, resolvedBracket]);

  // Finale sequence — fires whenever koResults loads with K104 result, within 24h
  useEffect(()=>{
    const finalResult=st.koResults["K104"];
    if(!koWinner(finalResult))return;
    try{
      const finalMatch=KM.find(m=>m.id==="K104");
      if(finalMatch){
        const kickoff=new Date(finalMatch.d+"T"+(finalMatch.ko||"19:00")+":00Z").getTime();
        if(Date.now()>kickoff+24*60*60*1000)return;
      }
    }catch{}
    const t=setTimeout(()=>setShowFinale(true),3000);
    return()=>clearTimeout(t);
  },[st.koResults]);
  const playerRankings=useMemo(()=>{return Array.from({length:st.config.playerCount},(_,i)=>{const gsPts=playerGSPts(i,st.picks||[],st.matchResults);const koPts=playerKOPts(i,st.picks||[],resolvedBracket,st.koResults,st.config.koPoints);const myTeams=(st.picks||[]).filter(p=>p.playerIdx===i).map(p=>p.team);let gd=0,gf=0;myTeams.forEach(team=>{GM.forEach(m=>{const r=st.matchResults[m.id];if(!r||r.home==null||r.away==null)return;const isHome=m.t[0]===team,isAway=m.t[1]===team;if(isHome){gf+=r.home;gd+=(r.home-r.away);}else if(isAway){gf+=r.away;gd+=(r.away-r.home);}});KM.forEach(m=>{const r=st.koResults[m.id];if(!r||typeof r==="string"||r.home==null||r.away==null)return;const bk=resolvedBracket[m.id];if(!bk)return;const isHome=bk.a===team,isAway=bk.b===team;if(isHome){gf+=r.home;gd+=(r.home-r.away);}else if(isAway){gf+=r.away;gd+=(r.away-r.home);}});});const pastGroups=myTeams.filter(team=>isInR32Bracket(team,resolvedBracket)).length;const r32=KM.filter(m=>m.round==="r32").filter(m=>{const w0=koWinner(st.koResults[m.id]);if(!w0)return false;const bk=resolvedBracket[m.id];if(!bk)return false;const w=w0==="A"?bk.a:bk.b;return w&&myTeams.includes(w);}).length;return{idx:i,name:st.config.playerNames[i],total:gsPts+koPts,pastGroups,r32,gd,gf,myTeams};}).sort((a,b)=>{if(b.total!==a.total)return b.total-a.total;if(b.pastGroups!==a.pastGroups)return b.pastGroups-a.pastGroups;if(b.gd!==a.gd)return b.gd-a.gd;if(b.gf!==a.gf)return b.gf-a.gf;let aWins=0,bWins=0,aGD=0,bGD=0,aGF=0,bGF=0;GM.forEach(m=>{const r=st.matchResults[m.id];if(!r||r.home==null||r.away==null)return;const aH=a.myTeams.includes(m.t[0]),aA=a.myTeams.includes(m.t[1]),bH=b.myTeams.includes(m.t[0]),bA=b.myTeams.includes(m.t[1]);if(aH&&bA){aGF+=r.home;bGF+=r.away;aGD+=(r.home-r.away);bGD+=(r.away-r.home);if(r.home>r.away)aWins++;else if(r.away>r.home)bWins++;}else if(aA&&bH){aGF+=r.away;bGF+=r.home;aGD+=(r.away-r.home);bGD+=(r.home-r.away);if(r.away>r.home)aWins++;else if(r.home>r.away)bWins++;}});KM.forEach(m=>{const r=st.koResults[m.id];if(!r||typeof r==="string"||r.home==null||r.away==null)return;const bk=resolvedBracket[m.id];if(!bk)return;const aH=a.myTeams.includes(bk.a),aA=a.myTeams.includes(bk.b),bH=b.myTeams.includes(bk.a),bA=b.myTeams.includes(bk.b);if(aH&&bA){aGF+=r.home;bGF+=r.away;aGD+=(r.home-r.away);bGD+=(r.away-r.home);if(r.home>r.away)aWins++;else if(r.away>r.home)bWins++;}else if(aA&&bH){aGF+=r.away;bGF+=r.home;aGD+=(r.away-r.home);bGD+=(r.home-r.away);if(r.away>r.home)aWins++;else if(r.home>r.away)bWins++;}});if(aWins!==bWins)return bWins-aWins;if(aGD!==bGD)return bGD-aGD;if(aGF!==bGF)return bGF-aGF;const draftOrd=st.draftOrder||[];const aPick=draftOrd.indexOf(a.idx);const bPick=draftOrd.indexOf(b.idx);if(aPick!==-1&&bPick!==-1)return aPick-bPick;return a.idx-b.idx;});},[st.config,st.picks,st.matchResults,resolvedBracket,st.koResults]);
  const syncCode=useMemo(()=>encode(st),[st]);
  const readOnly=!isHost;

  const isUnlocked=id=>{if(id==="setup")return true;if(id==="draft")return st.setupLocked;if(id==="knockout")return (st.draftLocked&&anyGroupDone)||(isHost&&st.draftLocked);return st.draftLocked;};
  const setKoOverride=(matchId,side,val)=>setSt(prev=>{const curr=prev.koOverrides[matchId]||{};const updated=val===undefined?{...curr,[side]:undefined}:{...curr,[side]:val};return{...prev,koOverrides:{...prev.koOverrides,[matchId]:updated}};});

  const handleBeHost=()=>{const id="pool_"+Date.now();setPools([{id,name:"My Pool"}]);setActivePoolId(id);setActivePoolName("My Pool");setSt(EMPTY);setIsHost(true);setAppState("host");};

  const handleFirebaseLoad=(decoded, code)=>{
    try{
      const merged=mergeState(EMPTY,decoded);
      setSt(merged);setIsHost(false);
      const upperCode=code?code.toUpperCase():null;
      if(upperCode){
        setSpectatorPoolCode(upperCode);
        try{window.localStorage?.setItem("mundi_spectator_code",upperCode);}catch(e){}
        // Load profile pics and player colours from Firestore
        loadProfilePics(upperCode).then(colors=>{setPlayerColors(colors);bumpPics(setPicRefresh);});
        // Ask for notification permission now that they've joined
        setTimeout(()=>requestNotificationPermission(), 3000);
        // Show select name if they haven't chosen yet
        try{
          const v=window.localStorage?.getItem("mundi_my_player");
          if(v===null)setTimeout(()=>setShowSelectName(true),500);
        }catch(e){}
      }
      if(merged.draftLocked){
        const seen=window.localStorage?.getItem("mundi_intro_seen");
        if(seen){setAppState("spectator");setActiveTab("knockout");}
        else{setAppState("spectator_intro");}
      }else if(merged.setupLocked){setAppState("spectator");setActiveTab("draft");}
      else{setAppState("spectator");setActiveTab("setup");}
      return null;
    }catch(e){return "Something went wrong.";}
  };

  const handleJoinAttempt=(decodedOrCode, code)=>{
    // Accepts either a pre-decoded object (from Firebase) or legacy M2: string
    try{
      let decoded = decodedOrCode;
      let poolC = code;
      if(typeof decodedOrCode === "string"){
        decoded = decode(decodedOrCode.trim());
        if(!decoded) return "Invalid code — make sure you copied the full code starting with M2:";
      }
      return handleFirebaseLoad(decoded, poolC);
    }catch(e){return "Something went wrong.";}
  };

  if(appState==="loading")return(<><style>{FONTS}</style><div style={{minHeight:"100vh",background:"linear-gradient(165deg,#0a1628,#0f1e38,#0a1628)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}><div style={{fontFamily:"'Bebas Neue'",fontSize:48,color:"var(--accent)",letterSpacing:10}}>MUNDIALITO</div><div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#5a6a8a"}}>Loading…</div></div></>);
  if(appState==="welcome")return(<><style>{FONTS}</style><div style={{minHeight:"100vh",background:"linear-gradient(165deg,#0a1628,#0f1e38,#0a1628)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><div style={{maxWidth:420,width:"100%",background:"linear-gradient(165deg,#0f1e38,#0a1628)",borderRadius:20,border:"1px solid rgba(201,168,76,0.35)",padding:"32px 28px",textAlign:"center"}}><div style={{fontSize:52,marginBottom:12}}>⚽</div><div style={{fontFamily:"'Bebas Neue'",fontSize:32,color:"var(--accent)",letterSpacing:4,marginBottom:6}}>MUNDIALITO</div><div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",marginBottom:28,lineHeight:1.6}}>Welcome! Are you running this pool or joining to watch?</div><div style={{display:"flex",flexDirection:"column",gap:10}}><button onClick={()=>setAppState("join")} style={{padding:"16px 0",borderRadius:12,border:"none",background:"linear-gradient(135deg,var(--accent),var(--accent-dark))",color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:3,cursor:"pointer"}}>👀 I'M WATCHING — JOIN POOL</button><button onClick={handleBeHost} style={{padding:"14px 0",borderRadius:12,border:"2px solid #2a3a5c",background:"transparent",color:"#8899b4",fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,cursor:"pointer"}}>🎙️ I'M THE HOST</button></div></div></div></>);
  if(appState==="spectator_intro")return(<SpectatorIntro st={st} initials={initials} onComplete={()=>{setAppState("spectator");setActiveTab("group");}}/>);
  if(appState==="join")return <JoinScreen onJoin={handleJoinAttempt} onBack={()=>setAppState("welcome")}/>;

  const tabContent=()=>{
    const tab=TABS.find(t=>t.id===activeTab);
    if(!isUnlocked(activeTab))return(<div style={{maxWidth:480,margin:"0 auto",padding:"60px 24px 0",textAlign:"center"}}><div style={{fontSize:56,marginBottom:16,opacity:0.3,filter:"grayscale(1)"}}>{tab?.icon}</div><div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:3,color:"#5a6a8a",marginBottom:12}}>{tab?.label.toUpperCase()} — LOCKED</div><div style={{fontFamily:"'DM Sans'",fontSize:14,color:"#5a6a8a",lineHeight:1.6}}>{tab?.unlockMsg}</div></div>);
    if(activeTab==="setup"){if(st.setupLocked&&!readOnly)return(<SetupLockedScreen config={st.config} onRename={(i,name)=>{setSt(p=>{const updated={...p,config:{...p.config,playerNames:p.config.playerNames.map((n,j)=>j===i?name:n)}};const code=window.localStorage?.getItem("mundi_pool_code")||poolCode||window.localStorage?.getItem("mundi_spectator_code");const pw=window.localStorage?.getItem("mundi_host_pw")||undefined;if(code)savePool(code,updated,pw).then(ok=>{if(ok&&code!==poolCode){try{window.localStorage?.setItem("mundi_pool_code",code);}catch(e){}setPoolCode(code);}});return updated;});}} onColorChange={(i,color)=>{colorCache[i]=color;saveCaches();savePlayerColor(i,color);bumpPics(setPicRefresh);}} onUnlock={()=>setSt(p=>({...p,setupLocked:false,draftOrder:null,draftMode:null,picks:[],draftLocked:false,matchResults:{},koResults:{},koOverrides:{}}))}/>);
      return <SetupScreen config={st.config} setConfig={c=>setSt(p=>({...p,config:typeof c==="function"?c(p.config):c}))} onLock={()=>{setSt(p=>({...p,setupLocked:true}));setActiveTab("draft");}} readOnly={readOnly}/>;}
    if(activeTab==="draft")return <DraftScreen config={st.config} draftOrder={st.draftOrder} setDraftOrder={o=>setSt(p=>({...p,draftOrder:o}))} picks={st.picks} setPicks={v=>setSt(p=>({...p,picks:typeof v==="function"?v(p.picks):v}))} onLockDraft={()=>{setSt(p=>({...p,draftLocked:true}));setActiveTab("group");}} readOnly={readOnly} initials={initials} draftMode={st.draftMode} setDraftMode={v=>setSt(p=>({...p,draftMode:v}))}/>;
    if(activeTab==="group")return <GroupStageScreen config={st.config} picks={st.picks} matchResults={st.matchResults} setMatchResults={v=>setSt(p=>({...p,matchResults:typeof v==="function"?v(p.matchResults):v}))} readOnly={readOnly} initials={initials} myPlayerIdx={myPlayerIdx} onPicsLoaded={()=>setPicRefresh(n=>n+1)} onPredictionsUpdate={p=>setAllPredictions(p)} bracket={resolvedBracket} koResults={st.koResults} playerRankings={playerRankings} groupOrderOverride={st.groupOrderOverride||{}} setGroupOrderOverride={(grp,order)=>setSt(p=>{const next={...(p.groupOrderOverride||{})};if(order)next[grp]=order;else delete next[grp];return{...p,groupOrderOverride:next};})}/>;
    if(activeTab==="knockout")return <KnockoutScreen config={st.config} picks={st.picks} matchResults={st.matchResults} bracket={resolvedBracket} koResults={st.koResults} koOverrides={st.koOverrides} setKoOverride={setKoOverride} setKoResults={v=>setSt(p=>({...p,koResults:typeof v==="function"?v(p.koResults):v}))} readOnly={readOnly} isPreview={isHost&&!anyGroupDone} playerRankings={playerRankings} groupOrderOverride={st.groupOrderOverride||{}} poolCode={poolCode||spectatorPoolCode} myPlayerIdx={myPlayerIdx} allPredictions={allPredictions}/>;
    if(activeTab==="standings")return <StandingsScreen config={st.config} picks={st.picks} matchResults={st.matchResults} bracket={resolvedBracket} koResults={st.koResults} initials={initials} myPlayerIdx={myPlayerIdx} onChangeUser={()=>setShowSelectName(true)} onEditProfile={()=>{if(myPlayerIdx!==null){setProfileSetupIdx(myPlayerIdx);setShowProfileSetup(true);}}} onSuggestions={()=>setShowSuggestions(true)} picRefresh={picRefresh} allPredictions={allPredictions} draftOrder={st.draftOrder||[]} groupOrderOverride={st.groupOrderOverride||{}}/>;
    return null;
  };

  const PoolMgrModal=()=>{
    const [creating,setCreating]=useState(false);const [newName,setNewName]=useState("");const [renaming,setRenaming]=useState(false);const [renameVal,setRenameVal]=useState("");
    if(!showPoolMgr)return null;
    return(<Modal open={true} onClose={()=>setShowPoolMgr(false)} title="POOLS"><div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#8899b4",marginBottom:16}}>Manage your pools. Each has its own setup, draft and results.</div>{pools.map(p=>{const isActive=p.id===activePoolId;return(<div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:10,background:isActive?"rgba(201,168,76,0.1)":"rgba(26,39,68,0.3)",border:`1px solid ${isActive?"rgba(201,168,76,0.4)":"#2a3a5c"}`,marginBottom:8}}><span style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:isActive?700:400,color:isActive?"var(--accent)":"#e0dcd4",flex:1}}>{p.name}</span>{isActive&&<span style={{fontFamily:"'Bebas Neue'",fontSize:11,color:"var(--accent)",letterSpacing:1,background:"rgba(201,168,76,0.15)",padding:"2px 8px",borderRadius:10}}>ACTIVE</span>}{pools.length>1&&<button onClick={()=>{if(window.confirm(`Delete "${p.name}"?`)){const rem=pools.filter(x=>x.id!==p.id);setPools(rem);if(p.id===activePoolId){setActivePoolId(rem[0].id);setActivePoolName(rem[0].name);setSt(EMPTY);}}}} style={{padding:"5px 8px",borderRadius:6,border:"1px solid #3d5070",background:"transparent",color:"#5a6a8a",fontSize:11,cursor:"pointer"}}>✕</button>}</div>);})}{!renaming&&!creating&&(<div style={{display:"flex",gap:8,marginTop:16}}><button onClick={()=>{setRenaming(true);setRenameVal(activePoolName);}} style={{flex:1,padding:"9px 0",borderRadius:8,border:"1px solid #2a3a5c",background:"transparent",color:"#8899b4",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer"}}>Rename</button><button onClick={()=>setCreating(true)} style={{flex:1,padding:"9px 0",borderRadius:8,border:"1px solid #c9a84c44",background:"rgba(201,168,76,0.08)",color:"var(--accent)",fontFamily:"'DM Sans'",fontSize:13,fontWeight:600,cursor:"pointer"}}>+ New pool</button></div>)}{renaming&&(<div style={{marginTop:14}}><input value={renameVal} onChange={e=>setRenameVal(e.target.value)} autoFocus style={{width:"100%",padding:"10px 14px",borderRadius:8,border:"1.5px solid var(--accent)",background:"rgba(10,22,40,0.7)",color:"#e0dcd4",fontFamily:"'DM Sans'",fontSize:14,outline:"none",boxSizing:"border-box",marginBottom:8}}/><div style={{display:"flex",gap:8}}><button onClick={()=>{if(renameVal.trim()){setActivePoolName(renameVal.trim());setPools(ps=>ps.map(x=>x.id===activePoolId?{...x,name:renameVal.trim()}:x));setRenaming(false);setShowPoolMgr(false);}}} style={{flex:1,padding:"9px 0",borderRadius:8,border:"none",background:"linear-gradient(135deg,var(--accent),var(--accent-dark))",color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:1.5,cursor:"pointer"}}>SAVE</button><button onClick={()=>setRenaming(false)} style={{padding:"9px 16px",borderRadius:8,border:"1px solid #2a3a5c",background:"transparent",color:"#8899b4",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer"}}>Cancel</button></div></div>)}{creating&&(<div style={{marginTop:14}}><input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Pool name…" autoFocus style={{width:"100%",padding:"10px 14px",borderRadius:8,border:"1.5px solid var(--accent)",background:"rgba(10,22,40,0.7)",color:"#e0dcd4",fontFamily:"'DM Sans'",fontSize:14,outline:"none",boxSizing:"border-box",marginBottom:8}}/><div style={{display:"flex",gap:8}}><button onClick={()=>{if(newName.trim()){const id="pool_"+Date.now();setPools(ps=>[...ps,{id,name:newName.trim()}]);setActivePoolId(id);setActivePoolName(newName.trim());setSt(EMPTY);setNewName("");setCreating(false);setShowPoolMgr(false);}}} style={{flex:1,padding:"9px 0",borderRadius:8,border:"none",background:"linear-gradient(135deg,var(--accent),var(--accent-dark))",color:"#0a1628",fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:1.5,cursor:"pointer"}}>CREATE</button><button onClick={()=>setCreating(false)} style={{padding:"9px 16px",borderRadius:8,border:"1px solid #2a3a5c",background:"transparent",color:"#8899b4",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer"}}>Cancel</button></div></div>)}</Modal>);
  };

  return(
    <LangContext.Provider value={lang}>
    <PicContext.Provider value={picRefresh}>
    <PicBumpContext.Provider value={()=>bumpPics(setPicRefresh)}>
    <><style>{FONTS}</style>
    <div style={{minHeight:"100vh",background:"linear-gradient(165deg,#0a1628 0%,#0f1e38 40%,#0a1628 100%)",color:"#e0dcd4",fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{position:"relative",textAlign:"center",padding:"26px 20px 4px"}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:42,letterSpacing:10,color:"var(--accent)",lineHeight:1}}>MUNDIALITO</div>
        <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#4a5a7a",marginTop:6,letterSpacing:2,textTransform:"uppercase"}}>{lang==="es"?"Copa Mundial 2026":"World Cup 2026"} · 🇨🇦 🇺🇸 🇲🇽</div>
        <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#4a5a7a",marginTop:2,letterSpacing:1,textTransform:"uppercase"}}>{lang==="es"?"11 de junio – 19 de julio":"June 11 – July 19"}</div>
        {/* Right: 🌐 on top, 🎨 below */}
        <div style={{position:"absolute",top:14,right:14,display:"flex",flexDirection:"column",gap:4}}>
          <button onClick={()=>setLanguage(lang==="en"?"es":"en")} style={{width:26,height:26,borderRadius:"50%",border:"1px solid #2a3a5c",background:"rgba(26,39,68,0.5)",color:"#5a6a8a",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>🌐</button>
          <button onClick={()=>setShowTheme(true)} style={{width:26,height:26,borderRadius:"50%",border:"1px solid #2a3a5c",background:"rgba(26,39,68,0.5)",color:"#5a6a8a",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>🎨</button>
          <NotifBell/>
        </div>
        {/* Left: ⏏ and ? stacked */}
        <div style={{position:"absolute",top:14,left:14,display:"flex",flexDirection:"column",gap:4}}>
          <button onClick={()=>{if(window.confirm("Leave this pool and go back to the home screen?")){try{window.localStorage?.removeItem(LOCAL_KEY);window.localStorage?.removeItem("mundi_pool_code");window.localStorage?.removeItem("mundi_host_pw");window.localStorage?.removeItem("mundi_intro_seen");window.localStorage?.removeItem("mundi_spectator_code");}catch(e){}window.location.reload();}}} style={{width:26,height:26,borderRadius:"50%",border:"1px solid #2a3a5c",background:"rgba(26,39,68,0.5)",color:"#5a6a8a",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>⏏</button>
          <button onClick={()=>setShowRules(true)} style={{width:26,height:26,borderRadius:"50%",border:"1px solid #2a3a5c",background:"rgba(26,39,68,0.5)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>?</button>
          <button onClick={()=>window.location.reload()} style={{width:26,height:26,borderRadius:"50%",border:"1px solid #2a3a5c",background:"rgba(26,39,68,0.5)",color:"#5a6a8a",fontFamily:"'DM Sans'",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>↻</button>
        </div>
      </div>

      {/* Slim status + profile row */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px 0",gap:6}}>
        {/* Left: compact buttons */}
        <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0,flexWrap:"wrap"}}>
          {/* Mode icon — 🎙️ host (tap to switch to spectator), 👀 spectator (tap for info) */}
          {isHost?(
            <button onClick={()=>{if(window.confirm(lang==="es"?"¿Cambiar a modo espectador?":"Switch to spectator mode?")){setIsHost(false);setAppState("spectator");}}} style={{width:28,height:28,borderRadius:"50%",background:"rgba(201,168,76,0.1)",border:"1px solid rgba(201,168,76,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,cursor:"pointer"}}>🎙️</button>
          ):(
            <button onClick={()=>{
              if(window.confirm(lang==="es"?"Estás en modo espectador 👀\n\nContacta al anfitrión del juego con cualquier cambio necesario.\n\n¿Cambiar a modo anfitrión?":"You're in spectator mode 👀\n\nContact the game host with any changes needed.\n\nSwitch to host mode?")){
                setShowHostSwitch(true);
              }
            }} style={{width:28,height:28,borderRadius:"50%",background:"rgba(107,155,209,0.08)",border:"1px solid rgba(107,155,209,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,cursor:"pointer",outline:"none"}}>👀</button>
          )}
          {/* Save status or ☁️ sync (host only, no label) */}
          {isHost&&saveStatus&&(
            <span style={{fontFamily:"'DM Sans'",fontSize:11,color:saveStatus==="saved"?"#61a978":"#8899b4"}}>
              {saveStatus==="saving"?t(lang,"saving"):t(lang,"saved")}
            </span>
          )}
          {isHost&&!saveStatus&&(
            <button onClick={()=>{
              const code=window.localStorage?.getItem("mundi_pool_code")||poolCode||window.localStorage?.getItem("mundi_spectator_code");
              const pw=window.localStorage?.getItem("mundi_host_pw")||undefined;
              if(!code){alert("No pool code found — tap Share Pool Code at the bottom first.");return;}
              setSaveStatus("saving");
              savePool(code,stRef.current,pw).then(ok=>{
                if(ok){try{window.localStorage?.setItem("mundi_pool_code",code);}catch(e){}setPoolCode(code);}
                setSaveStatus(ok?"saved":null);
                if(ok)setTimeout(()=>setSaveStatus(null),2000);
              });


            }} style={{width:28,height:28,borderRadius:"50%",border:"1px solid #2a3a5c",background:"transparent",color:"#5a6a8a",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>☁️</button>
          )}
          {/* Host only: 🔔 Notify */}
          {isHost&&<button onClick={()=>setShowNotify(true)} style={{width:28,height:28,borderRadius:"50%",border:"1px solid rgba(97,169,120,0.4)",background:"rgba(97,169,120,0.1)",color:"#61a978",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>🔔</button>}
          {/* Spectator: 📥 info popup */}
          {!isHost&&<button onClick={()=>{const code=window.localStorage?.getItem("mundi_spectator_code")||window.localStorage?.getItem("mundi_pool_code");alert((lang==="es"?"Liga: ":"League: ")+(activePoolName||"Mundialito")+"\n"+(lang==="es"?"Código: ":"Code: ")+(code||"—"));}} style={{width:28,height:28,borderRadius:"50%",border:"1px solid rgba(107,155,209,0.3)",background:"rgba(107,155,209,0.06)",color:"#6b9bd1",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>📥</button>}
          {/* 💡 Suggestions — everyone */}
          <button onClick={()=>setShowSuggestions(true)} style={{width:28,height:28,borderRadius:"50%",border:"1px solid rgba(107,155,209,0.3)",background:"rgba(107,155,209,0.06)",color:"#6b9bd1",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>💡</button>
        </div>
        {/* Right: avatar — always visible, opens profile */}
        {myPlayerIdx!==null&&(()=>{const pc=getPlayerColor(myPlayerIdx,PC[myPlayerIdx]);return(
          <div onClick={()=>{setProfileSetupIdx(myPlayerIdx);setShowProfileSetup(true);}} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 10px 4px 6px",borderRadius:20,border:`1px solid ${pc}55`,background:`${pc}11`,cursor:"pointer",flexShrink:0}} title="Edit your profile">
            <PlayerAvatar idx={myPlayerIdx} name={(st.config?.playerNames||[])[myPlayerIdx]||""} size={28} refresh={picRefresh}/>
            <span style={{fontFamily:"'DM Sans'",fontSize:12,fontWeight:600,color:pc,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(st.config?.playerNames||[])[myPlayerIdx]||""}</span>
            <span style={{fontSize:10,color:`${pc}88`}}>✏️</span>
          </div>
        );})()}
      </div>
      <div style={{position:"sticky",top:0,zIndex:50,background:"linear-gradient(180deg,rgba(10,22,40,0.97) 0%,rgba(15,30,56,0.97) 100%)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",borderBottom:"1px solid rgba(201,168,76,0.12)",display:"flex",justifyContent:"center",gap:2,padding:"10px 12px 0",marginBottom:0}}>
        {TABS.map(tab=>{const active=activeTab===tab.id;const open=isUnlocked(tab.id);const tabLabel=t(lang,tab.id==="standings"?"leaderboard":tab.id);return(<button key={tab.id} onClick={()=>{if(open){setActiveTab(tab.id);if(tab.id!=="group")setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);if(tab.id==="standings"){const code=window.localStorage?.getItem("mundi_pool_code")||window.localStorage?.getItem("mundi_spectator_code");if(code)loadProfilePics(code).then(()=>bumpPics(setPicRefresh));}}}} style={{padding:"7px 6px 10px",flex:1,maxWidth:110,border:"none",borderBottom:active?"2px solid var(--accent)":"2px solid transparent",background:"transparent",cursor:open?"pointer":"default",opacity:active?1:open?0.5:0.25,filter:open?"none":"grayscale(1)",transition:"all 0.2s"}}><div style={{fontSize:18,marginBottom:3}}>{tab.icon}</div><div style={{fontFamily:"'DM Sans'",fontSize:11,fontWeight:active?600:400,color:active?"var(--accent)":open?"#5a6a8a":"#3d5070",letterSpacing:0.5}}>{tabLabel}</div></button>);})}
      </div>
      <div style={{paddingBottom:48,paddingTop:20}}>{tabContent()}
        <div style={{maxWidth:720,margin:"0 auto",padding:"24px 16px 0"}}>
          <button onClick={()=>setShowSuggestions(true)} style={{width:"100%",padding:"10px 0",borderRadius:10,border:"1px solid rgba(107,155,209,0.3)",background:"rgba(107,155,209,0.06)",color:"#6b9bd1",fontFamily:"'DM Sans'",fontSize:12,cursor:"pointer"}}>
            💡 {lang==="es"?"Sugerir una función":"Suggest a feature"}
          </button>
        </div>
        {isHost&&(
          <div style={{maxWidth:920,margin:"24px auto 0",padding:"0 16px 32px",display:"flex",gap:8}}>
            <button onClick={()=>setShowSync(true)} style={{flex:1,padding:"12px 0",borderRadius:10,border:"1px solid rgba(201,168,76,0.3)",background:"rgba(201,168,76,0.06)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:2,cursor:"pointer"}}>{t(lang,"shareCode")}</button>
            <button onClick={()=>setShowPoolMgr(true)} style={{padding:"12px 14px",borderRadius:10,border:"1px solid #2a3a5c",background:"rgba(26,39,68,0.4)",color:"#8899b4",fontFamily:"'DM Sans'",fontSize:12,cursor:"pointer"}}>🏆 {activePoolName}</button>
          </div>
        )}
        <div style={{maxWidth:720,margin:"0 auto",padding:isHost?"0 16px":"24px 16px 0"}}>
          <button onClick={()=>setShowSelectName(true)} style={{width:"100%",padding:"10px 0",borderRadius:10,border:"1px solid #2a3a5c",background:"transparent",color:"#5a6a8a",fontFamily:"'DM Sans'",fontSize:12,cursor:"pointer"}}>
            {t(lang,"changeUser")}
          </button>
        </div>
      </div>
      <Modal open={showRules} onClose={()=>setShowRules(false)} title={t(lang,"howItWorks")}><RulesList/></Modal>
      <SyncModal open={showSync} onClose={()=>setShowSync(false)} st={st} poolCode={poolCode} setPoolCode={setPoolCode}/>
      <LoadModal open={showLoad} onClose={()=>setShowLoad(false)} onLoad={handleFirebaseLoad}/>
        <NotifyModal open={showNotify} onClose={()=>setShowNotify(false)}/>
        <ThemeModal open={showTheme} onClose={()=>setShowTheme(false)} currentAccent={accentColor} onSelect={setAccent}/>
        <SelectNameModal
          open={showSelectName}
          onClose={()=>setShowSelectName(false)}
          playerNames={st.config?.playerNames||[]}
          picks={st.pk||[]}
          onSelect={(idx)=>{
            setMyPlayerIdx(idx);
            try{window.localStorage?.setItem("mundi_my_player",String(idx));}catch(e){}
            setShowSelectName(false);
            setProfileSetupIdx(idx);
            setShowProfileSetup(true);
          }}
        />
        <ProfileSetupModal
          open={showProfileSetup}
          onClose={()=>setShowProfileSetup(false)}
          playerIdx={profileSetupIdx}
          playerName={profileSetupIdx!==null?(st.config?.playerNames||[])[profileSetupIdx]:""}
          onDone={()=>setShowProfileSetup(false)}
          onPicSaved={()=>setPicRefresh(n=>n+1)}
        />
        <SwitchToHostModal open={showHostSwitch} onClose={()=>setShowHostSwitch(false)} poolCode={spectatorPoolCode} onSuccess={()=>{
          setIsHost(true);
          setShowHostSwitch(false);
          setAppState("host");
          if(spectatorPoolCode){
            setPoolCode(spectatorPoolCode);
            loadProfilePics(spectatorPoolCode).then(()=>bumpPics(setPicRefresh));
          }
          try{window.localStorage?.setItem(LOCAL_KEY,JSON.stringify({st,pools,activePoolId,activePoolName}));}catch(e){}
        }}/>
      <PoolMgrModal/>
      {resultOverlay&&<ResultOverlay results={resultOverlay} onDone={()=>setResultOverlay(null)}/>}
      {showFinale&&finalePlayerData.length>0&&<FinaleSequence playerData={finalePlayerData} bracket={resolvedBracket} koResults={st.koResults} matchResults={st.matchResults} config={st.config} initials={initials} picRefresh={picRefresh} lang={lang} onDone={()=>setShowFinale(false)}/>}
      {isHost&&koWinner(st.koResults["K104"])&&!showFinale&&(
        <button onClick={()=>setShowFinale(true)} style={{position:"fixed",bottom:72,right:16,zIndex:90,padding:"6px 12px",borderRadius:8,border:"1px solid rgba(201,168,76,0.4)",background:"rgba(10,22,40,0.95)",color:"var(--accent)",fontFamily:"'Bebas Neue'",fontSize:11,letterSpacing:1.5,cursor:"pointer"}}>🎬 PREVIEW</button>
      )}
      {showSuggestions&&<SuggestionModal open={true} onClose={()=>setShowSuggestions(false)} poolCode={poolCode||window.localStorage?.getItem("mundi_pool_code")||window.localStorage?.getItem("mundi_spectator_code")} myPlayerIdx={myPlayerIdx} playerNames={st.config?.playerNames||[]} initials={initials}/>}
      {scrolled&&<button onClick={()=>window.scrollTo({top:0,behavior:"smooth"})} style={{position:"fixed",bottom:28,right:16,zIndex:100,padding:"8px 14px",borderRadius:20,background:"rgba(10,22,40,0.95)",border:"1px solid rgba(201,168,76,0.5)",color:"var(--accent)",fontSize:13,fontFamily:"'Bebas Neue'",letterSpacing:1.5,cursor:"pointer",display:"flex",alignItems:"center",gap:5,backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",boxShadow:"0 2px 16px rgba(0,0,0,0.5)"}}>↑ TOP</button>}
    </div></>{/* end app */}</PicBumpContext.Provider></PicContext.Provider></LangContext.Provider>
  );
}
