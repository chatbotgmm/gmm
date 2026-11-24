// 경제(공식은행·시장·물물교환)의 숫자와 순수 계산. 갈매미마다 가방(inv)과 돈(coins)을 가진다.
//  · 일해서 얻은 물건은 가방에 담고, CARRY개가 모이면 공식은행에 판다 → 은행이 새 돈을 찍어 주고(발행), 산 물건은 은행 창고(공사 재료)로.
//  · 건축가·목수는 공사 한 바퀴(망치질 3번)마다 은행에서 품삯(WAGE)을 받는다(발행).
//  · 시장(목수가 지음)에서 집(값 price)과 음식(MARKET_FOOD)을 산다 → 낸 돈은 은행으로 돌아감(회수). 상인이 시장에 있으면 1개 값의 몫을 받음.
//  · 시장이 없거나 돈이 없으면 만난 갈매미와 물물교환(먹을 것 ↔ 나무·돌 등).
export const BANK_BUY = { wood: 2, stone: 3, iron: 6, fish: 2, food: 2 };   // 은행이 1개당 쳐 주는 값(새로 찍는 돈)
export const MARKET_FOOD = 3;                                                  // 시장에서 음식 1개 값
export const CARRY = 6;                                                        // 가방에 이만큼(먹을 것 남김분 제외) 모이면 은행에 팔러 감
export const FOOD_KEEP = 2;                                                    // 음식·물고기는 이만큼 남겨 둠(먹을 것)
export const WAGE = 2;                                                         // 공사 한 바퀴 품삯
export const COMMISSION = 1;                                                   // 시장에서 한 번 팔릴 때 상인 몫
export const ITEMS_ORDER = ["wood", "stone", "iron", "fish", "food"];
export const ITEM_NAME = { wood: "나무", stone: "돌", iron: "철", fish: "물고기", food: "음식" };
export const ITEM_ICON = { wood: "🪵", stone: "🪨", iron: "⛓", fish: "🐟", food: "🍗" };

export const newBag = () => ({ wood: 0, stone: 0, iron: 0, fish: 0, food: 0 });
/** 은행에 팔 것: 자재는 전부, 음식·물고기는 합쳐서 FOOD_KEEP개를 남기고. */
export function sellable(u) {
  const b = u.inv || newBag(), out = { wood: b.wood, stone: b.stone, iron: b.iron, fish: 0, food: 0 };
  let keep = FOOD_KEEP;
  for (const k of ["food", "fish"]) { const stay = Math.min(b[k], keep); keep -= stay; out[k] = b[k] - stay; }
  return out;
}
export const count = items => ITEMS_ORDER.reduce((s, k) => s + (items[k] || 0), 0);
export const valueOf = items => ITEMS_ORDER.reduce((s, k) => s + (items[k] || 0) * BANK_BUY[k], 0);
/** 먹을 것(음식·물고기) 개수 */
export const meals = u => (u.inv?.food || 0) + (u.inv?.fish || 0);
/** 물물교환에 내놓을 수 있는 것(자재 중 가장 많은 것) */
export function spare(u) {
  const b = u.inv || newBag(); let best = null;
  for (const k of ["wood", "stone", "iron"]) if (b[k] > 0 && (!best || b[k] > b[best])) best = k;
  return best;
}

// ---- 시장·가공·식량(2단계 흐름)
//  나무꾼·광부 → (원자재를 시장에서 상인에게 팖: 상인 돈) → 상인이 가공(목재·석재·철괴) → 공식은행에 팖(새 돈, 은행 창고 = 공사 재료)
//  → 번 돈으로 농부·어부에게서 음식을 삼. 건축가·목수는 공사 품삯을 은행에서 받음.
export const RAW = ["wood", "stone", "iron"];
export const MARKET_BUY = { wood: 2, stone: 3, iron: 6 };                       // 상인이 원자재 1개를 사 주는 값(상인 돈)
export const BANK_PROCESSED = { wood: 4, stone: 5, iron: 10 };                  // 은행이 가공품 1개를 사 주는 값(새로 찍는 돈). 시장 값이 오르내려도 상인이 손해 보지 않게 넉넉히
export const PROCESSED_NAME = { wood: "목재", stone: "석재", iron: "철괴" };
export const FOOD_PRICE = 3;                                                   // 농부·어부에게서 음식 1개 값
export const MERCHANT_START = 40;                                              // 상인 창업 자금(은행이 소환 때 찍어 줌)
export const rawOf = u => ({ wood: u.inv?.wood || 0, stone: u.inv?.stone || 0, iron: u.inv?.iron || 0 });
export const isProducer = u => u.job === "farmer" || u.job === "fisher";
export const total = o => Object.values(o || {}).reduce((s, n) => s + (n || 0), 0);

// ---- 가격 변동: 상인 창고에 많이 쌓인 원자재는 싸게, 모자라면 비싸게 사 줌(은행 가공품 값보다 1 아래까지)
//  배수 = 1.3 − 0.04 × 창고 개수 (0.5 ~ 1.3). 예) 나무(기본 2): 창고 0개 2×1.3=2.6→3, 8개 2×0.98→2, 20개 이상 2×0.5→1
export function marketPrice(k, stock) {
  const f = Math.max(0.5, Math.min(1.3, 1.3 - 0.04 * stock));
  return Math.max(1, Math.min(BANK_PROCESSED[k] - 1, Math.round(MARKET_BUY[k] * f)));
}
// 음식 값: 기본 3. 농부·어부가 내놓을 수 있는 음식이 모자라면(3개 미만) +1, 넘치면(15개 넘게) −1, 배고픈 갈매미가 많으면 +1, 겨울 +1. 2 ~ 5
export function foodPriceFor(spareFood, hungryShare, seasonExtra = 0) {
  let p = FOOD_PRICE + (spareFood < 3 ? 1 : spareFood > 15 ? -1 : 0) + (hungryShare > 0.4 ? 1 : 0) + seasonExtra;
  return Math.max(2, Math.min(5, p));
}
