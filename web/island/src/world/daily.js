// 오늘의 부탁(순수 계산: 화면·기기 시계를 모름).
// 실제 날짜 열쇠 "YYYY-MM-DD"(화면이 기기 날짜로 넣어 줌)마다 부탁 DAILY_COUNT개를 고름. 고르는 난수는 날짜 열쇠로만 만듦(월드 난수를 쓰지 않음).
// 부탁은 내가 직접 할 수 있는 일만: 월드가 알리는 일(emit)을 세어서 나아감. 이 마을에서 아직 할 수 없는 부탁(ok가 false)은 고르지 않음.
// 모두 들어주면 도장 하나(world.stamps)와 금고에 🪙STAMP_COINS → 도장 가게에서 한정 가구(STAMP_SHOP)나 귀한 선물(STAMP_GIFTS)로 바꿈. 날짜가 바뀌면 새 부탁으로(못 끝낸 부탁은 사라짐).
import { BUILDINGS, FISH, ITEMS, UNITS } from "../data/catalog.js";
import { seededRandom } from "../util.js";
import { PAVED } from "./roads.js";
import { giftables } from "./bond.js";
import { rankNeed } from "./rank.js";
import { available } from "./furniture.js";

export const DAILY_COUNT = 3;            // 하루에 고르는 부탁 수
export const STAMP_COINS = 20;           // 도장을 받을 때 금고에 함께 들어오는 동전(World.vaultBonus — 금고가 말라도 손쓸 길)

/** 손으로 놓을 가구가 있는 다 지은 집이 있나(그 집 창고 또는 마을 가방) — 없으면 「가구 놓기」 부탁은 못 들어주니 고르지 않음(편의성 점검 10번) */
const furniReady = w => [...w.buildings.values()].some(b => BUILDINGS[b.defId].house && w.isDone(b) && Object.keys(available(w, b)).length > 0);
const canFish = w => w.spots.length > 0 && w.units.some(u => u.job === "fisher");
const seasonFish = w => FISH.filter(f => f.season && f.season === w.season);
/** 지금 지을 수 있는 장식(건설 메뉴에 있고, 등급·계절이 맞고, 지어 줄 갈매미가 있음) */
const decoNow = w => Object.values(BUILDINGS).filter(d => d.deco && d.menu !== false && rankNeed(d) <= w.rank && (!d.winterOnly || w.season === "winter") && !!w.builderFor(d));

// 부탁 목록. need: 채울 횟수 · ok(w): 지금 이 마을에서 할 수 있는가 · hit(ev, arg, w): 이 일이 부탁을 몇 번 채우는가 · group: 같은 묶음에서는 하루에 하나만
export const DAILY_POOL = [
  { id: "pet", icon: "♥", need: 3, text: () => "갈매미 3번 쓰다듬기",
    ok: w => w.units.length > 0, hit: ev => ev === "pet" ? 1 : 0 },
  { id: "gift", icon: "🎁", need: 1, text: () => "갈매미에게 선물 하나 주기",
    ok: w => w.units.length > 0 && giftables(w).length > 0, hit: ev => ev === "gift" ? 1 : 0 },
  { id: "wish", icon: "💭", need: 1, text: () => "소원 하나 들어주기",
    ok: w => w.wishes.length > 0, hit: ev => ev === "wishDone" ? 1 : 0 },
  { id: "road", icon: "🖌", need: 5, text: () => "돌길이나 나무 데크 5칸 깔기",
    ok: () => true, hit: (ev, e) => ev === "ground" && PAVED.has(e?.type) ? 1 : 0 },
  { id: "deco", icon: "🏮", need: 1, text: w => `장식 하나 짓기(${decoNow(w).slice(0, 3).map(d => d.name).join("·")} 등)`,
    ok: w => decoNow(w).length > 0, hit: (ev, b, w) => (ev === "buildingDone" || (ev === "buildingAdded" && w.isDone(b))) && BUILDINGS[b?.defId]?.deco ? 1 : 0 },
  { id: "furniture", icon: "🛋", need: 1, text: () => "아무 집에나 가구 하나 놓기",
    ok: furniReady, hit: (ev, e) => ev === "furniture" && e?.kind === "place" ? 1 : 0 },
  { id: "summon", icon: "🥚", need: 1, text: () => "새 갈매미 한 마리 부르기",
    ok: w => w.units.length > 0 && w.units.length < Math.min(4, UNITS.length) && (w.summonInfo?.().can ?? true), hit: ev => ev === "unitAdded" ? 1 : 0 },   // 갈매미가 없는 새 섬은 고르지 않음: 첫 갈매미는 처음 안내에서 부르니 저절로 끝나 버림
  { id: "seasonFish", icon: "🎣", need: 1, group: "fish", text: w => `제철 물고기 한 마리 낚기(${seasonFish(w).map(f => f.name).join("·")})`,
    ok: w => canFish(w) && seasonFish(w).length > 0, hit: (ev, e) => ev === "fish" && e?.fish?.season ? 1 : 0 },
  { id: "fish3", icon: "🐟", need: 3, group: "fish", text: () => "물고기 3마리 낚기",
    ok: canFish, hit: ev => ev === "fish" ? 1 : 0 },
  { id: "tug", icon: "❗", need: 2, group: "fish", text: () => "낚시하는 갈매미와 찌 2번 같이 당기기",
    ok: canFish, hit: ev => ev === "tug" ? 1 : 0 },
  // 🌙 밤 부탁: 부탁을 고르는 때가 저녁 밤(기기 시계, 해가 진 뒤 ~ 자정)일 때만 고름 → 저녁에 켠 사람에게만(그날 밤이 자정까지 남아 있음).
  //  자정~새벽은 고르지 않음: 자정에 날짜가 바뀌며 고른 부탁이 그날 낮까지 남아, 낮에만 하는 사람의 도장을 막지 않게(hour를 모르면 밤만 봄)
  { id: "nightSparkle", icon: "🌙", need: 2, text: () => "밤에 가로등 둘레에서 반짝이 2개 줍기",
    ok: w => w.isNight === true && !(Number.isFinite(w.hour) && w.hour < 12), hit: (ev, e) => ev === "sparkle" && e?.item?.sparkleTime === "night" ? 1 : 0 },
];
const DAILY_BY_ID = Object.fromEntries(DAILY_POOL.map(d => [d.id, d]));

// 도장 가게: 도장으로만 바꾸는 한정 가구(ITEMS의 stamp = 도장 값). 사면 내 가방(world.items)으로 → 🏠 집 꾸미기에서 아무 집에나 놓음
export const STAMP_SHOP = ITEMS.filter(i => i.stamp > 0);
// 도장 선물: 도장으로 사는 귀한 선물(ITEMS의 stampGift = 도장 값). 사면 내 주머니로 → 갈매미에게 주면 정이 두 배(bond.js STAMP_GIFT_BOND).
// STAMP_SHOP(가구)과 따로 둠: 화면(hud.js)이 STAMP_SHOP을 가구로 읽음
export const STAMP_GIFTS = ITEMS.filter(i => i.stampGift > 0);
/** 도장 가게에서 파는 것 하나의 도장 값(가구·선물 모두). 모르는 것은 0 */
export const stampCost = item => item?.stamp || item?.stampGift || 0;

/** 날짜 → 오늘의 부탁 열쇠 "YYYY-MM-DD"(기기의 그 날짜 그대로) */
export const dailyKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
/** 글자 → 32비트 수(FNV-1a). 날짜 열쇠로 난수 씨앗을 만듦 */
export function hashText(s) { let h = 0x811c9dc5; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193); } return h >>> 0; }

/** 그날의 부탁을 고름: 날짜 열쇠로 목록을 섞고, 지금 할 수 있는 것을 앞에서부터(같은 묶음은 하나만) DAILY_COUNT개.
 *  돌려주는 값: { key, reqs: [{ id, icon, text, need, have }], stamped: 도장을 받았는가 } (할 수 있는 게 모자라면 그만큼만) */
export function rollDaily(key, w) {
  const rnd = seededRandom(hashText(key)), list = [...DAILY_POOL], reqs = [], groups = new Set();
  for (let i = list.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [list[i], list[k]] = [list[k], list[i]]; }
  for (const d of list) {
    if (reqs.length >= DAILY_COUNT) break;
    if ((d.group && groups.has(d.group)) || !d.ok(w)) continue;
    if (d.group) groups.add(d.group);
    reqs.push({ id: d.id, icon: d.icon, text: d.text(w), need: d.need, have: 0 });
  }
  return { key, reqs, stamped: false };
}
/** 월드가 알린 일 하나를 부탁에 셈. 돌려주는 값: 이번에 막 끝난 부탁들 */
export function dailyNote(daily, ev, arg, w) {
  const done = []; if (!daily) return done;
  for (const r of daily.reqs) {
    if (r.have >= r.need) continue;
    const n = DAILY_BY_ID[r.id]?.hit(ev, arg, w) || 0; if (!n) continue;
    r.have = Math.min(r.need, r.have + n); if (r.have >= r.need) done.push(r);
  }
  return done;
}
/** 오늘 부탁을 모두 들어줬는가(부탁이 하나도 없는 날은 아님) */
export const dailyAllDone = daily => !!daily && daily.reqs.length > 0 && daily.reqs.every(r => r.have >= r.need);

/** 저장에서 읽은 오늘의 부탁(예전 저장엔 없음 → null, 화면이 날짜를 넣어 줄 때 새로 고름). 아는 부탁만, 모양이 맞는 것만 */
export function dailyFromSave(j) {
  if (!j || typeof j.key !== "string" || !Array.isArray(j.reqs)) return null;
  const reqs = j.reqs.filter(r => r && DAILY_BY_ID[r.id] && typeof r.text === "string").slice(0, DAILY_COUNT).map(r => { const d = DAILY_BY_ID[r.id];
    return { id: d.id, icon: d.icon, text: r.text, need: d.need, have: Math.max(0, Math.min(d.need, r.have | 0)) }; });
  return { key: j.key, reqs, stamped: !!j.stamped };
}
/** 저장에서 읽은 도장 가게에서 산 것(예전 저장엔 없음 → 빈 것): { 물건 id: 산 개수 } */
export const stampBoughtFromSave = j => Object.fromEntries(STAMP_SHOP.concat(STAMP_GIFTS).map(s => [s.id, Math.max(0, (j && typeof j === "object" ? j[s.id] : 0) | 0)]).filter(([, n]) => n > 0));
