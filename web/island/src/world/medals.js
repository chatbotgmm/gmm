// 물고기 메달(순수 계산): 종류마다 가장 큰 기록(world.fishRecord, 이미 저장됨)에서 동·은·금을 셈 → 메달은 따로 저장하지 않음.
// 크기는 fishSize(f, t) = a + (b − a)·t^1.5 (t = sizeNoise, 0~1 고르게)라서 크기에서 t를 거꾸로 셈하면 "상위 몇 %"가 됨.
//   동 = 한 번이라도 낚음 · 은 = 상위 50%(t ≥ 0.5) · 금 = 상위 15%(t ≥ 0.85)
//   계절 물고기는 한 해에 한 계절만 잡히니 금 기준을 상위 30%(t ≥ 0.7)로 낮춤
// 기념 가구: 수족관 기증 선물(DONATE_GIFTS)과 같은 방식 — 금메달 종류 수가 4·8·12에 닿을 때 하나씩 마을 가방으로(받은 수만 저장).
import { FISH, ITEMS } from "../data/catalog.js";
import { fishSize } from "./aquarium.js";

export const MEDALS = [
  null,
  { id: "bronze", icon: "🥉", name: "동메달" },
  { id: "silver", icon: "🥈", name: "은메달" },
  { id: "gold",   icon: "🥇", name: "금메달" },
];
export const MEDAL_T = { silver: 0.5, gold: 0.85, goldSeason: 0.7 };   // t 기준(크기 순위 상위 50% · 15% · 계절 30%)
/** 크기(cm) → t(0~1): fishSize를 거꾸로 셈 */
export function sizeT(f, size) {
  const [a, b] = f.cm || [10, 30];
  return Math.min(1, Math.max(0, (size - a) / (b - a))) ** (1 / 1.5);
}
/** 그 메달(2 = 은, 3 = 금)에 드는 가장 작은 크기(cm). fishSize와 같은 반올림이라 t가 기준 이상이면 크기도 늘 이 값 이상 */
export function medalCut(f, m) {
  return fishSize(f, m >= 3 ? (f.season ? MEDAL_T.goldSeason : MEDAL_T.gold) : MEDAL_T.silver);
}
/** 크기 → 메달 단계(0 = 기록 없음, 1 동, 2 은, 3 금) */
export function fishMedal(f, size) {
  if (!f || !(size > 0)) return 0;
  return size >= medalCut(f, 3) ? 3 : size >= medalCut(f, 2) ? 2 : 1;
}
/** 기록 전체 → 단계마다 몇 종인지 { gold, silver, bronze } (종류마다 가장 좋은 메달 하나) */
export function medalCounts(record) {
  const c = { gold: 0, silver: 0, bronze: 0 };
  for (const f of FISH) { const m = fishMedal(f, record?.[f.id]); if (m) c[MEDALS[m].id]++; }
  return c;
}
// 금메달 기념 가구(ITEMS의 id, medal = 필요한 금메달 종류 수). 4종마다 하나, 12종에서 끝(16종 다 금은 전설까지라 목표로만)
export const MEDAL_GIFTS = ITEMS.filter(i => i.medal > 0).sort((a, b) => a.medal - b.medal).map(i => ({ need: i.medal, item: i.id, label: `금메달 ${i.medal}종` }));
/** 지금 기록으로 받을 수 있는 기념 가구 수(차례대로) */
export const medalGiftsEarned = record => { const g = medalCounts(record).gold; return MEDAL_GIFTS.filter(x => g >= x.need).length; };
/** 저장에서 읽은 받은 수(예전 저장엔 없음 → 0. 다음 기록 때 밀린 것까지 받음) */
export const medalGiftsFromSave = n => Math.max(0, Math.min(MEDAL_GIFTS.length, n | 0));
/** 밀린 기념 가구를 마을 가방에 넣음(알림 없이): world.items·world.medalGifts를 고침. 받은 것들 [{ item, gift }] */
export function grantMedalGifts(world) {
  const out = [];
  for (const n = medalGiftsEarned(world.fishRecord); world.medalGifts < n; world.medalGifts++) {
    const gift = MEDAL_GIFTS[world.medalGifts], item = ITEMS.find(i => i.id === gift.item); if (!item) continue;
    world.items[item.id] = (world.items[item.id] || 0) + 1; out.push({ item, gift });
  }
  return out;
}
/** 도감 칸 두 줄: { now: "🥈 54.2cm", next: "🥇 71cm부터" } (금이면 next = "") */
export function medalLine(f, size) {
  const m = fishMedal(f, size); if (!m) return { now: "", next: "" };
  return { now: `${MEDALS[m].icon} ${size}cm`, next: m < 3 ? `다음 ${MEDALS[m + 1].icon} ${medalCut(f, m + 1)}cm부터` : "" };
}
