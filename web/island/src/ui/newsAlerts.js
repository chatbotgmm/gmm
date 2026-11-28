// 알림 줄 표(순수: DOM·소리·타이머를 모름 → node 시험 가능).
// 소식 문장은 news.js(newsFor)가 만들고, 이 표는 "알림 줄에서 어떻게 보일지"만 정함: 색(kind) · 소리 이름(snd) · 거르기 · 하루 예산.
// main.js가 표를 한 번 돌며 world.on을 걸고, 소리 이름을 실제 효과음으로 바꿈.
//  · daily: 마을 하루(newsDay)에 한 번만(마을 전체에서)
//  · every + 같은 갈매미: 그 갈매미의 같은 알림은 마을 시간 every초에 한 번만
//  · batch: 짧은 사이(BATCH_MS)에 여러 번 오면 한 줄로 묶음(batchText)
//  · now: 플레이어가 누른 일의 대답 → 차례를 기다리지 않고 바로 보임(소환 단추·반짝이 줍기)
import { newsDay, newsFor, NEWS_DAY_SECS } from "../world/news.js";

export const BATCH_MS = 400;   // 묶음 알림: 이 사이에 온 같은 알림은 한 줄로(밀린 품삯을 한꺼번에 치를 때 등)
export const WAGE_GAP = 30;    // 같은 갈매미의 "품삯이 밀렸어요"는 마을 시간 30초에 한 번만

/** 이벤트 → 알림 줄 모양. 한 줄에 일 하나만: 덧말(길안내·조언·금고 잔액)은 붙이지 않음 — 줄을 누르면 그 갈매미·건물로 감(hud data-go)
 *  app: 갈매미·건물이 없는 소식(금고·물가)은 누르면 그 📱 앱으로(bank = 은행 금고 탭, mon = 중앙은행 탭) — 예전 덧말 "(📱 은행 · 🏛 중앙은행)" 대신 */
export const ALERTS = {
  vaultShort: { kind: "warn", snd: "low", app: "bank" },
  vaultOk: { kind: "good", snd: "coins" },
  vaultLow: { kind: "warn", app: "bank" },
  wageOwed: { kind: "warn", every: WAGE_GAP },
  wagePaid: { kind: "good", batch: true, snd: "coins" },
  loanRefused: { kind: "warn" },
  loanPaid: { kind: "good", snd: "bell" },
  summonBlocked: { kind: "warn", now: true },
  sparkle: { kind: "good", snd: "glint", now: true },
  stashSale: { kind: "info", snd: "coins" },
  chill: { kind: "info", daily: true },
  cocoa: { kind: "info", batch: true },
  dress: { kind: "info", batch: true },
  buyClothes: { kind: "good", snd: "bag" },
  sick: { kind: "warn", snd: "sneeze" },
  healed: { kind: "good" },
  doctor: { kind: "good" },
  faint: { kind: "warn" },
  upgradeStart: { kind: "info", snd: "bell" },
  upgraded: { kind: "good", snd: "bell" },
  roadAsk: { kind: "info", every: NEWS_DAY_SECS },   // 갈매미 길 부탁: 같은 갈매미는 마을 하루에 한 번만
  // 🏛 중앙은행: 물가 사태(world가 사태마다 한 번만 냄) · 옛 저장에 판이 처음 생김
  inflation: { kind: "warn", app: "mon" },
  deflation: { kind: "warn", app: "mon" },
  priceStable: { kind: "good", snd: "bell" },
  monStart: { kind: "info", app: "mon" },
};
/** 일부러 알림 줄에 안 띄우는 소식(소식지에는 실림): 세금·숙박비 영수증은 금고 칩의 작은 +N(rewardFx small)과 소식지로 충분 · 설계비는 건설 도구가 상태 줄에 이미 씀 · 병원 접수·쓰러져 실려 감은 소식지만(쓰러짐 알림 한 줄이 이미 알림) */
export const SILENT = ["tax", "lodging", "fee", "clinicVisit", "faintCarried", "monIssue", "monRate", "monGift", "monPrint", "capFull", "monAuto"];   // 중앙은행 손잡이(찍기·예산·금리·축하)는 플레이어가 누른 일 → 판의 상태 줄이 대답(hud.bankClick), 예산 참·자동 바꿈은 잦아서 소식지에만

/** 묶음 한 줄: 같은 이벤트 list(arg 배열, 2개 이상) → { icon, text } */
export function batchText(ev, list) {
  const n = list.length;
  if (ev === "wagePaid") return { icon: "💸", text: `갈매미 ${n}마리가 밀린 품삯 🪙${list.reduce((s, a) => s + (a.n || 0), 0)}을 받았어요` };
  if (ev === "cocoa") return { icon: "☕", text: `갈매미 ${n}마리가 카페에서 코코아로 몸을 녹였어요` };
  if (ev === "dress") return { icon: "🧣", text: `갈매미 ${n}마리가 따뜻한 옷을 챙겨 입었어요` };
  return null;
}

/** 거르기(마을 시간 기준): pass(ev, arg, time) → 이번 알림을 띄울지. daily·every 규칙만 봄(묶음은 main.js 타이머). */
export function makeGate() {
  const days = new Map(), last = new Map();
  return function pass(ev, arg, time) {
    const a = ALERTS[ev]; if (!a) return false;
    if (a.daily) { const d = newsDay(time); if (days.get(ev) === d) return false; days.set(ev, d); }
    if (a.every) { const k = `${ev}:${arg?.u?.unitId ?? arg?.u?.name ?? ""}`, t = last.get(k); if (t != null && time - t < a.every && time >= t) return false; last.set(k, time); }
    return true;
  };
}

/** 한 줄 글. 문장이 없으면(newsFor가 null) null */
export function alertLine(ev, arg, world) {
  const n = newsFor(ev, arg, world); if (!n) return null;
  return `${n.icon} ${n.text}`;
}

// ---- 조용히 넘기는 소식 · 하루 알림 예산
/** 날씨 알림은 이 날씨로 바뀔 때만(맑음·흐림·비는 화면에 보이니 줄을 안 씀). 무지개·첫눈은 드문 하늘(sky·firstSnow)이 따로 알림 */
export const WEATHER_SAY = ["storm", "snow"];
/** 알림 줄에 아예 안 올리는 경우(소식지·지난 알림에도 따로 안 남김 — 소식지는 world가 알아서 실음) */
export function quietAlert(ev, arg) {
  if (ev === "weather") return !WEATHER_SAY.includes(arg?.kind);
  if (ev === "beachcomb") return !arg?.first;                 // 해변 줍기: 그 물건을 마을에서 처음 주웠을 때만
  return false;
}
/** 하루(마을 하루 newsDay) 알림 줄 예산. 넘치면 알림 줄 대신 지난 알림(hud.logNote)에만 — 소식지는 그대로 실림 */
export const DAY_LINES = 6;
/** 우선순위: 0 이야기 > 1 관계·손쓸 일 > 2 소원 > 3 나머지. 낮은 단계는 예산을 다 쓰지 못하게 자리를 남겨 둠(늦게 온 이야기·관계 소식이 밀리지 않게)
 *  손쓸 일(금고 바닥·감기·쓰러짐·물가 사태·대출 거절)은 해변 줍기·물고기 같은 소식에 밀려 지난 알림으로 숨지 않게 관계와 같은 단계 */
const TIER_OF = {
  storySpark: 0, storyPiece: 0, storySeed: 0, storyPostcard: 0, storyRestore: 0, storyEnd: 0, storyBlink: 0, festival: 0, festivalEnd: 0,
  friendship: 1, bondStage: 1,
  vaultShort: 1, sick: 1, faint: 1, inflation: 1, deflation: 1, loanRefused: 1,
  wish: 2, wishDone: 2, wishLost: 2, dailyDone: 2,
};
export const alertTier = ev => TIER_OF[ev] ?? 3;
/** 단계별로 "오늘 띄운 줄 수가 이보다 적을 때만" 띄움: 이야기는 늘, 관계는 6줄까지, 소원은 5줄까지, 나머지는 4줄까지 */
export const TIER_ROOM = [Infinity, DAY_LINES, DAY_LINES - 1, DAY_LINES - 2];
/** take(ev, time) → true면 알림 줄에, false면 지난 알림에만. 플레이어가 누른 일의 대답(now)은 예산 밖 — main.js가 부르지 않음 */
export function makeBudget() {
  let day = -1, used = 0;
  return function take(ev, time) {
    const d = newsDay(time); if (d !== day) { day = d; used = 0; }
    if (used >= TIER_ROOM[alertTier(ev)]) return false;
    used++; return true;
  };
}
