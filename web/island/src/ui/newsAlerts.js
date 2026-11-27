// 알림 줄 표(순수: DOM·소리·타이머를 모름 → node 시험 가능).
// 소식 문장은 news.js(newsFor)가 만들고, 이 표는 "알림 줄에서 어떻게 보일지"만 정함: 색(kind) · 덧말(tail) · 소리 이름(snd) · 거르기.
// main.js가 표를 한 번 돌며 world.on을 걸고, 소리 이름을 실제 효과음으로 바꿈.
//  · daily: 마을 하루(newsDay)에 한 번만(마을 전체에서)
//  · every + 같은 갈매미: 그 갈매미의 같은 알림은 마을 시간 every초에 한 번만
//  · batch: 짧은 사이(BATCH_MS)에 여러 번 오면 한 줄로 묶음(batchText)
//  · now: 플레이어가 누른 일의 대답 → 차례를 기다리지 않고 바로 보임(소환 단추·반짝이 줍기)
import { newsDay, newsFor, NEWS_DAY_SECS } from "../world/news.js";
import { pocketCount } from "../world/bond.js";

export const BATCH_MS = 400;   // 묶음 알림: 이 사이에 온 같은 알림은 한 줄로(밀린 품삯을 한꺼번에 치를 때 등)
export const WAGE_GAP = 30;    // 같은 갈매미의 "품삯이 밀렸어요"는 마을 시간 30초에 한 번만

/** 이벤트 → 알림 줄 모양. tail은 글 또는 (arg, world) → 글 */
export const ALERTS = {
  vaultShort: { kind: "warn", tail: " (📱 은행)", snd: "low" },
  vaultOk: { kind: "good", snd: "coins" },
  vaultLow: { kind: "warn", tail: " (🏦 금고 칩)" },
  wageOwed: { kind: "warn", every: WAGE_GAP },
  wagePaid: { kind: "good", batch: true, snd: "coins" },
  loanRefused: { kind: "warn", tail: " (🏠 집을 못 샀어요)" },
  loanPaid: { kind: "good", snd: "bell" },
  tax: { kind: "info", daily: true, tail: (a, w) => ` · 금고 🪙${Math.floor(w.bank?.vault ?? 0)}`, snd: "coins" },
  lodging: { kind: "info", daily: true },                          // 빈 집 손님 숙박비: 마을 하루에 한 번 지난 하루 합계 한 줄(손님마다 띄우면 너무 잦음)
  summonBlocked: { kind: "warn", tail: " · 📱 소환", now: true },   // 까닭 글 끝에 이미 (집 n채 · 갈매미 n마리)가 있어 괄호를 겹치지 않음
  sparkle: { kind: "good", tail: (a, w) => ` (🎁 내 주머니 ${pocketCount(w)})`, snd: "glint", now: true },
  stashSale: { kind: "info", snd: "coins" },
  chill: { kind: "info", daily: true },
  cocoa: { kind: "info", batch: true },
  dress: { kind: "info", batch: true },
  buyClothes: { kind: "good", snd: "bag" },
  sick: { kind: "warn", tail: (a, w) => w.clinics?.().length ? " (🏥 병원에서 쉬면 빨리 나아요)" : " (🏥 병원이 있으면 빨리 나아요)", snd: "sneeze" },
  healed: { kind: "good" },
  doctor: { kind: "good" },
  upgradeStart: { kind: "info", tail: " (🪚 목수가 재료를 모아 지어요)", snd: "bell" },
  upgraded: { kind: "good", snd: "bell" },
  roadAsk: { kind: "info", every: NEWS_DAY_SECS, tail: " (🖌 바닥 칠하기 → 돌길·데크)" },   // 갈매미 길 부탁: 같은 갈매미는 마을 하루에 한 번만
};
/** 일부러 알림 줄에 안 띄우는 소식(소식지에는 실림): 설계비는 건설 도구가 상태 줄에 이미 씀 · 병원 접수는 소식지만 */
export const SILENT = ["fee", "clinicVisit"];

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

/** 한 줄 글(덧말 포함). 문장이 없으면(newsFor가 null) null */
export function alertLine(ev, arg, world) {
  const n = newsFor(ev, arg, world); if (!n) return null;
  const a = ALERTS[ev], tail = typeof a?.tail === "function" ? a.tail(arg, world) : a?.tail || "";
  return `${n.icon} ${n.text}${tail}`;
}
