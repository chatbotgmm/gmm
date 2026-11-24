// 마을 등급: 갈매미·집·시설·이룬 소원·배부름을 점수로 합쳐 등급을 올림(내려가지는 않음). 등급마다 새 건물이 열리고 모두에게 축하금.
import { BUILDINGS } from "../data/catalog.js";

export const RANKS = [
  { name: "갯마을", icon: "🛖", need: 0, unlock: [] },
  { name: "어촌", icon: "🏘", need: 60, unlock: ["cafe"] },
  { name: "항구 마을", icon: "⚓", need: 140, unlock: ["shop", "post"] },
  { name: "섬 도시", icon: "🏙", need: 240, unlock: ["manor"] },
];
export const RANK_REWARD = 5;                                                     // 등급이 오르면 갈매미마다 축하금(새 돈)
const FACILITY = d => d.market || d.field || d.dock || d.storehouse || ["cafe", "shop", "post"].includes(d.id);

/** 점수와 그 내역(화면에 보여 줄 줄들). 계산식: 갈매미 ×10, 주인 있는 집 ×10, 빈 집 ×4, 시설 ×8, 계단 ×2(최대 10점), 이룬 소원 ×6, 평균 포만감 50 이상 +10 */
export function rankScore(w) {
  const done = [...w.buildings.values()].filter(b => w.isDone(b)).map(b => [BUILDINGS[b.defId], b]);
  const owned = done.filter(([d, b]) => d.house && b.owner).length, empty = done.filter(([d, b]) => d.house && !b.owner).length;
  const fac = done.filter(([d]) => FACILITY(d)).length, stairs = done.filter(([d]) => d.id === "stairs").length;
  const fed = w.units.length && w.avgFull() >= 50;
  const parts = [
    ["🐦 갈매미", w.units.length, 10, w.units.length * 10],
    ["🏠 주인 있는 집", owned, 10, owned * 10],
    ["🏚 빈 집", empty, 4, empty * 4],
    ["🏪 시설(시장·밭·낚시터·저장고·카페 등)", fac, 8, fac * 8],
    ["🪜 계단(최대 10점)", stairs, 2, Math.min(10, stairs * 2)],
    ["💭 이룬 소원", w.wishDone || 0, 6, (w.wishDone || 0) * 6],
    ["😋 평균 포만감 50 이상", fed ? 1 : 0, 10, fed ? 10 : 0],
  ];
  return { score: parts.reduce((s, p) => s + p[3], 0), parts };
}
/** 이 건물을 지으려면 필요한 등급(없으면 0) */
export const rankNeed = def => def.rank || 0;
