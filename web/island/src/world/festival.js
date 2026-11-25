// 계절 축제의 날(순수 계산: 화면·기기 시계를 모름).
// 실제 계절마다 한 번(열쇠 = 해 + 계절, 화면이 기기 날짜로 world.festKey에 넣어 줌), 마을 등급이 어촌 이상이면 "축제 하자!" 소원이 생김.
// 축제 장식(BUILDINGS의 festive) FESTIVAL_NEED개가 그중 하나의 둘레 FESTIVAL_RADIUS칸 안에 모이면 거기가 광장 → 축제가 FESTIVAL_SECS초(마을 시간) 열림.
// 축제가 끝나면 함께한 갈매미는 한동안 기분이 좋고(만족도), 마을 가방에 그 계절 한정 가구가 하나 들어옴.
import { BUILDINGS, ITEMS } from "../data/catalog.js";
import { seasonOf } from "./season.js";
import { winterYearOf } from "./skywatch.js";

export const FESTIVAL_RANK = 1;          // 마을 등급이 이 번호(어촌 = 두 번째 등급) 이상이어야 소원이 생김
export const FESTIVAL_NEED = 4;          // 광장이 되려면 모여야 하는 축제 장식 수
export const FESTIVAL_RADIUS = 6;        // 한 장식 둘레 이 칸 수 안에 모여 있어야 함
export const FESTIVAL_SECS = 180;        // 축제가 열리는 시간(마을 시간, 초)
export const FESTIVAL_JOIN_CHANCE = 0.8; // 축제 동안 한가한 갈매미가 다음 할 일로 광장을 고를 확률
export const FESTIVAL_FUN = 18;          // 광장에서 한 번 놀 때마다 오르는 재미·친구 욕구
export const FESTIVAL_PAL = 0.5;         // 광장에서 곁에 있던 갈매미와 친해지는 정도(인사는 1)
export const FESTIVAL_CHEER_SECS = 600;  // 축제가 끝난 뒤 함께한 갈매미의 여운이 이어지는 시간(마을 하루)
export const FESTIVAL_SAT = 10;          // 여운이 남아 있는 동안 만족도 덤

// 계절마다의 축제: gift = 끝나면 마을 가방에 들어오는 계절 한정 가구(ITEMS의 id)
export const FESTIVALS = {
  spring: { name: "봄꽃 축제", icon: "🌸", gift: "festSpring" },
  summer: { name: "여름 바다 축제", icon: "🏖", gift: "festSummer" },
  autumn: { name: "가을 달맞이 축제", icon: "🎃", gift: "festAutumn" },
  winter: { name: "겨울 눈꽃 축제", icon: "⛄", gift: "festWinter" },
};
/** 이 날짜의 축제 열쇠 "해-계절"(겨울은 12월이 든 해: 1~2월은 지난해 겨울과 같은 축제) */
export function festivalKey(date) { const s = seasonOf(date); return `${s === "winter" ? winterYearOf(date) : date.getFullYear()}-${s}`; }
/** 열쇠 → { key, year, season, def }(모양이 다르면 null) */
export function festivalOf(key) {
  const m = /^(\d+)-(\w+)$/.exec(key || ""), def = m && FESTIVALS[m[2]];
  return def ? { key, year: +m[1], season: m[2], def } : null;
}
/** 축제 선물(ITEMS의 한 줄) */
export const festivalGift = key => { const f = festivalOf(key); return (f && ITEMS.find(i => i.id === f.def.gift)) || null; };

const festiveDone = w => [...w.buildings.values()].filter(b => BUILDINGS[b.defId].festive && w.isDone(b));
const midOf = b => { const xs = b.cells.map(c => c[0]), zs = b.cells.map(c => c[1]); return [xs.reduce((a, c) => a + c, 0) / xs.length + 0.5, zs.reduce((a, c) => a + c, 0) / zs.length + 0.5]; };
/** 다 지은 축제 장식 수(마을 전체) */
export const festiveCount = w => festiveDone(w).length;
/** 광장 찾기: 장식 하나를 가운데로 FESTIVAL_RADIUS칸 안에 있는 축제 장식이 가장 많은 무리.
 *  돌려주는 값: { ok: FESTIVAL_NEED개 이상인가, n: 그 무리의 장식 수, x, z: 무리의 한가운데(칸 좌표, 장식이 없으면 null) } */
export function festivalPlaza(w) {
  const pts = festiveDone(w).map(midOf); let best = [];
  for (const [cx, cz] of pts) { const near = pts.filter(([x, z]) => Math.hypot(x - cx, z - cz) <= FESTIVAL_RADIUS); if (near.length > best.length) best = near; }
  const n = best.length;
  return { ok: n >= FESTIVAL_NEED, n, x: n ? best.reduce((s, p) => s + p[0], 0) / n : null, z: n ? best.reduce((s, p) => s + p[1], 0) / n : null };
}
/** 저장에서 읽은 열리는 중인 축제(예전 저장엔 없음 → null): { id, t, x, z, who: [갈매미 id] } */
export function festivalFromSave(f) {
  if (!f || !festivalOf(f.id) || !(f.t > 0) || !Number.isFinite(f.x) || !Number.isFinite(f.z)) return null;
  return { id: f.id, t: Math.min(FESTIVAL_SECS, +f.t), x: f.x, z: f.z, who: (Array.isArray(f.who) ? f.who : []).filter(x => typeof x === "string") };
}
/** 저장에서 읽은 지난 축제 도장(예전 저장엔 없음 → 빈 것): { "해-계절": true } */
export const festivalsFromSave = s => Object.fromEntries(Object.keys(s && typeof s === "object" ? s : {}).filter(k => s[k] && festivalOf(k)).map(k => [k, true]));
/** 도장판: 연 순서대로 [{ key, year, season, def }] */
export const festivalStamps = held => Object.keys(held || {}).map(festivalOf).filter(Boolean)
  .sort((a, b) => a.year - b.year || ["spring", "summer", "autumn", "winter"].indexOf(a.season) - ["spring", "summer", "autumn", "winter"].indexOf(b.season));
