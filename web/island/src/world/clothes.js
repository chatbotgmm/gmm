// 옷(순수 계산: 난수를 모름). 갈매미가 가진 옷 u.clothes = ["scarf", …] · 입은 옷 u.wear = { neck, body, head }(자리마다 옷 id 또는 null).
// 입기는 난수 없이: 밖으로 나설 때·30초마다 공기 기온을 보고 정함(털목도리 14°C 이하 · 누빔 외투 4°C 이하). 없는 옷은 못 입음.
// 사기: 잡화점에서 자기 돈으로(낸 돈은 금고로). 추웠던 적(u.feltCold ≥ 1)이 있고 밥값 두 번어치를 남길 수 있을 때, CLOTHES_ORDER 순서로 하나씩.
// 산 뒤에는 feltCold를 0으로 → 다음 옷(외투)은 목도리를 두르고도 다시 추워 봐야 삼.
import { CLOTHES, CLOTHES_ORDER } from "../data/catalog.js";

export const DRESS_EVERY = 30;           // 몇 초마다 옷을 다시 고르는가
export const SLOTS = ["neck", "body", "head"];
export const emptyWear = () => ({ neck: null, body: null, head: null });

/** 입은 옷의 보온 합(°C) */
export function warmthOf(u) {
  const w = u.wear; if (!w) return 0;
  let s = 0; for (const k of SLOTS) { const c = w[k] && CLOTHES[w[k]]; if (c) s += c.warmth || 0; }
  return s;
}
/** 이 기온에 입을 옷(자리마다): 가진 옷 중 below 이하인 것. 같은 자리에 둘이면 보온이 큰 것 */
export function outfitFor(u, air) {
  const out = emptyWear();
  for (const id of u.clothes || []) { const c = CLOTHES[id]; if (!c || air > c.below) continue; const cur = out[c.slot] && CLOTHES[out[c.slot]]; if (!cur || c.warmth > cur.warmth) out[c.slot] = id; }
  return out;
}
/** 옷 갈아입기: 바뀐 자리의 새 옷 id 목록(벗기만 했으면 빈 목록이지만 changed는 true) */
export function dress(u, air) {
  const want = outfitFor(u, air), was = u.wear || emptyWear(), put = []; let changed = false;
  for (const k of SLOTS) if ((was[k] || null) !== want[k]) { changed = true; if (want[k]) put.push(want[k]); }
  if (changed || !u.wear) u.wear = want;
  return { changed, put };
}
/** 잡화점에서 다음에 살 옷(없으면 null) */
export const nextClothes = u => CLOTHES_ORDER.find(id => !(u.clothes || []).includes(id)) || null;
/** 저장에서 읽기(예전 저장엔 없음 → 빈 옷장) */
export const clothesFromSave = list => [...new Set((Array.isArray(list) ? list : []).filter(id => CLOTHES[id]))];
export function wearFromSave(w, clothes) {
  const out = emptyWear(); if (!w || typeof w !== "object") return out;
  for (const k of SLOTS) { const id = w[k]; if (id && CLOTHES[id]?.slot === k && clothes.includes(id)) out[k] = id; }
  return out;
}
