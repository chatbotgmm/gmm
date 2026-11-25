// 마을 수족관(순수 계산): 물고기 크기(cm)·크기 기록·기증·기증 기념 선물.
// 크기는 마을 난수(world.rnd)를 쓰지 않고 마을 시간·갈매미·지금까지 낚은 수를 섞어 정함
// → 낚시 결과·다른 일의 난수 순서가 예전과 똑같음(같은 저장·같은 씨앗이면 크기도 늘 같음).
import { FISH } from "../data/catalog.js";

/** 난수 없이 0~1 미만의 값: 마을 시간(0.1초 단위)·갈매미 번호·지금까지 낚은 마릿수를 섞음 */
export function sizeNoise(time, unitId, caught) {
  let h = Math.imul(Math.floor((time || 0) * 10) | 0, 73856093) ^ Math.imul((unitId || 0) | 0, 19349663) ^ Math.imul((caught || 0) | 0, 83492791);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** 물고기 크기(cm, 소수 한 자리): 종류마다 정해 둔 범위(cm: [작은, 큰]) 안에서. 큰 놈일수록 드묾(t^1.5) */
export function fishSize(f, t) {
  const [a, b] = f.cm || [10, 30];
  return Math.round((a + (b - a) * Math.min(1, Math.max(0, t)) ** 1.5) * 10) / 10;
}
/** 수족관에 기증하는 물고기: 희귀 이상(흔한 물고기는 밥상으로) */
export const donatable = f => !!f && f.rarity !== "common";
export const DONATE_KINDS = FISH.filter(donatable);
/** 기증한 종류 수 */
export const donatedCount = donated => DONATE_KINDS.filter(f => donated?.[f.id]).length;
export const DONATE_SCORE = 2;                                                    // 마을 등급: 기증한 종류마다 2점
// 기증 기념 선물(가방에 들어가는 낚시 가구, ITEMS의 id): 3종 · 6종 · 전설만 빼고 모두
export const DONATE_GIFTS = [
  { need: 3, item: "chair", label: "3종" },
  { need: 6, item: "table", label: "6종" },
  { need: DONATE_KINDS.filter(f => f.rarity !== "legend").length, noLegend: true, item: "bed", label: "전설만 빼고 모두" },
];
/** 지금까지의 기증으로 받을 수 있는 선물 수(0~3, 차례대로) */
export function giftsEarned(donated) {
  let n = 0;
  for (const g of DONATE_GIFTS) { const have = g.noLegend ? DONATE_KINDS.filter(f => f.rarity !== "legend" && donated?.[f.id]).length : donatedCount(donated); if (have >= g.need) n++; else break; }
  return n;
}
/** 저장에서 읽은 기록(예전 저장엔 없음 → 빈 기록). 아는 물고기의 바른 값만 */
export const donatedFromSave = j => Object.fromEntries(FISH.filter(f => j?.[f.id]).map(f => [f.id, true]));
export const recordsFromSave = j => Object.fromEntries(FISH.filter(f => Number.isFinite(j?.[f.id]) && j[f.id] > 0).map(f => [f.id, j[f.id]]));
