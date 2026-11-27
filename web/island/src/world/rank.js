// 마을 등급: 갈매미·집·시설·이룬 소원·배부름을 점수로 합쳐 등급을 올림(내려가지는 않음). 등급마다 새 건물이 열리고 모두에게 축하금.
import { BUILDINGS } from "../data/catalog.js";
import { comfort } from "./furniture.js";
import { linkedHouses } from "./roads.js";
import { bestiePairs } from "../units/mind.js";
import { donatedCount, DONATE_SCORE } from "./aquarium.js";
import { STABLE_DAYS, STABLE_SCORE } from "./monetary.js";

export const RANKS = [
  { name: "갯마을", icon: "🛖", need: 0, unlock: [] },
  { name: "어촌", icon: "🏘", need: 60, unlock: ["cafe", "clinic"] },
  { name: "항구 마을", icon: "⚓", need: 140, unlock: ["shop", "post", "aquarium", "hospital"] },   // 종합병원은 다 지은 일반병원을 업그레이드해서만(unlockName)
  { name: "섬 도시", icon: "🏙", need: 240, unlock: ["manor"] },
];
export const RANK_REWARD = 5;                                                     // 등급이 오르면 갈매미마다 축하금(중앙은행이 켜진 섬은 금고에서, World.issue)
const FACILITY = d => d.market || d.field || d.dock || d.storehouse || d.power || ["cafe", "shop", "post", "aquarium", "clinic", "hospital"].includes(d.id);

/** 점수와 그 내역(화면에 보여 줄 줄들). 계산식: 갈매미 ×10, 주인 있는 집 ×10, 빈 집 ×4, 시설 ×8(일반병원·종합병원 포함), 계단 ×2(최대 10점), 장식 ×2(최대 10점), 집 아늑함(놓인 가구 comfort 합, 최대 30점), 이룬 소원 ×6, 단짝 쌍 ×3(최대 15점), 수족관 기증 종류 ×2, 평균 포만감 50 이상 +10 */
export function rankScore(w) {
  const done = [...w.buildings.values()].filter(b => w.isDone(b)).map(b => [BUILDINGS[b.defId], b]);
  const owned = done.filter(([d, b]) => d.house && b.owner).length, empty = done.filter(([d, b]) => d.house && !b.owner).length;
  const fac = done.filter(([d]) => FACILITY(d)).length, stairs = done.filter(([d]) => d.id === "stairs").length;
  const cozy = done.filter(([d]) => d.house).reduce((s, [, b]) => s + comfort(b), 0);
  const pals = bestiePairs(w.units);
  const gave = donatedCount(w.donated);
  const deco = done.filter(([d]) => d.deco).length, fed = w.units.length && w.avgFull() >= 50;
  const parts = [
    ["🐦 갈매미", w.units.length, 10, w.units.length * 10],
    ["🏠 주인 있는 집", owned, 10, owned * 10],
    ["🏚 빈 집", empty, 4, empty * 4],
    ["🏪 시설(시장·밭·낚시터·저장고·카페 등)", fac, 8, fac * 8],
    ["🪜 계단(최대 10점)", stairs, 2, Math.min(10, stairs * 2)],
    ["🏮 장식(가로등 등, 최대 10점)", deco, 2, Math.min(10, deco * 2)],
    ["🛋 집 아늑함(가구, 최대 30점)", cozy, 1, Math.min(30, cozy)],
    ["🛣 포장도로로 시장·은행과 이은 집(최대 20점)", linkedHouses(w), 4, Math.min(20, linkedHouses(w) * 4)],
    ["😊 평균 만족도 60 이상", w.units.length && (w.avgSat?.() ?? 0) >= 60 ? 1 : 0, 10, w.units.length && (w.avgSat?.() ?? 0) >= 60 ? 10 : 0],
    ["💭 이룬 소원", w.wishDone || 0, 6, (w.wishDone || 0) * 6],
    ["💞 단짝(쌍, 최대 15점)", pals, 3, Math.min(15, pals * 3)],
    ["🐠 수족관에 기증한 물고기(종류)", gave, DONATE_SCORE, gave * DONATE_SCORE],
    ["😋 평균 포만감 50 이상", fed ? 1 : 0, 10, fed ? 10 : 0],
  ];
  const mon = w.economy && w.bank?.mon;                                             // 중앙은행: 최근 3일 모두 물가 변화 1% 안쪽
  if (mon) { const ok = (mon.stableRun || 0) >= STABLE_DAYS ? 1 : 0; parts.push([`📊 물가 안정(${STABLE_DAYS}일)`, ok, STABLE_SCORE, ok * STABLE_SCORE]); }
  return { score: parts.reduce((s, p) => s + p[3], 0), parts };
}
/** 등급 해금 목록에 보일 이름: 업그레이드로만 생기는 건물은 '종합병원(일반병원 업그레이드)' */
export const unlockName = id => { const d = BUILDINGS[id]; return !d ? id : d.upgradeFrom ? `${d.name}(${BUILDINGS[d.upgradeFrom]?.name || d.upgradeFrom} 업그레이드)` : d.name; };
/** 이 건물을 지으려면 필요한 등급(없으면 0) */
export const rankNeed = def => def.rank || 0;
