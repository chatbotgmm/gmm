// 갈매미 소지품(순수 계산: 화면·난수를 모름).
// 갈매미가 잡거나 주운 것(희귀 이상 물고기 · 낚시 덤 물건 · 바닷가 계절 물건 · 별조각)은 마을 가방이 아니라 그 갈매미의 u.stash = { id: 개수 }.
// 플레이어는 이것을 선물로 쓸 수 없음(선물은 내 주머니 = 주운 반짝이·도장 선물·답례). 도감(world.collection)은 마을 기록으로 그대로.
// 갈매미는 좋아하는 갈래(giftTier === 2)는 종류마다 STASH_KEEP_LIKED개 간직하고, 나머지 값 있는 것은 시장에서 스스로 팖(조개는 주인에게).
// 값 없는 것(가구)은 팔지 않음: 집이 있으면 그 집 창고로, 없으면 들고 있다가 집을 사면 옮김(World.buyHouse).
import { FISH, ITEMS } from "../data/catalog.js";
import { giftTier } from "./bond.js";

export const STASH_SELL_AT = 2;      // 팔 수 있는 게 이만큼 모이면 시장에 팔러 감(경제 마을)
export const STASH_KEEP_LIKED = 1;   // 좋아하는 갈래는 종류마다 이만큼 간직
export const STASH_CUT = 1;          // 한 개 팔릴 때 상인 몫(조개)

/** 소지품이 될 수 있는 것의 정의: 희귀 이상 물고기 또는 플레이어 몫(gift)이 아닌 물건. 아니면 null */
export const stashDef = id => FISH.find(f => f.id === id && f.rarity !== "common") || ITEMS.find(i => i.id === id && !i.gift) || null;
/** 한 개 값(조개). 값 없는 것(가구)은 0 → 안 팖 */
export const stashPrice = id => stashDef(id)?.price || 0;
/** 소지품의 가구 id(FURNITURE의 id) 또는 null */
export const stashFurniture = id => ITEMS.find(i => i.id === id && i.furniture)?.furniture || null;
/** 이 갈매미가 지금 팔 것: { id: 개수 } — 값 있는 것만, 좋아하는 갈래는 STASH_KEEP_LIKED개 남김 */
export function stashSellable(u) {
  const out = {};
  for (const [id, n0] of Object.entries(u?.stash || {})) {
    if (!(n0 > 0) || !stashPrice(id)) continue;
    const n = n0 - (giftTier(u.name, id) === 2 ? STASH_KEEP_LIKED : 0); if (n > 0) out[id] = n;
  }
  return out;
}
/** 소지품 총 개수 */
export const stashCount = u => Object.values(u?.stash || {}).reduce((s, n) => s + Math.max(0, n || 0), 0);
/** 화면용 목록: [{ id, name, n, kind: "fish" | "item", furniture? }] (물고기 → 물건 순, 카탈로그 순서) */
export function stashList(u) {
  const s = u?.stash || {}, out = [];
  for (const f of FISH) if (s[f.id] > 0 && f.rarity !== "common") out.push({ id: f.id, name: f.name, n: s[f.id], kind: "fish" });
  for (const i of ITEMS) if (s[i.id] > 0 && !i.gift) out.push({ id: i.id, name: i.name, n: s[i.id], kind: "item", ...(i.furniture ? { furniture: true } : {}) });
  return out;
}
/** 저장에서 읽은 소지품(예전 저장엔 없음 → 빈 것). 아는 것·양의 정수만 */
export function stashFromSave(j) {
  const out = {}; if (!j || typeof j !== "object") return out;
  for (const [id, n] of Object.entries(j)) { const k = Math.floor(+n); if (stashDef(id) && k > 0) out[id] = k; }
  return out;
}
/** 마을 갈매미들이 가진 합: { id: 개수 } (도감 화면용) */
export function stashTotals(world) {
  const out = {};
  for (const u of world?.units || []) for (const [id, n] of Object.entries(u.stash || {})) if (n > 0) out[id] = (out[id] || 0) + n;
  return out;
}
/** 한 개 넣기 */
export const stashAdd = (u, id, n = 1) => { (u.stash ||= {})[id] = (u.stash[id] || 0) + n; };
