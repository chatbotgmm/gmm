// 갈매미 스스로 동네 고치기(만족도가 낮을 때). 순수 계산: 무엇을 고칠지(계획)만 정하고, 실제 일은 unitBrain이 함.
//  · yard: 집 앞 마당(문 둘레 3×3)을 문 높이로 고르게(땅을 높이고 낮춤) → 만족도 "🏡 고른 마당" +5
//  · pave: 집 → 시장(없으면 은행)으로 가는 길을 돌길로(한 번에 최대 8칸, 3칸마다 돌 1) → 만족도 "🛣 포장도로" +15
//  · deco: 집 근처 장식이 2개보다 적으면 벤치·화단 공사장을 놓음(건축가가 지음) → 만족도 "🌷 장식".
//    주문한 갈매미가 값을 냄(플레이어 금고 아님): 놓을 때 orderCost를 공사장에 맡기고, 품삯(한 바퀴 2)·자재값(시장 값, 은행 창고 것은 금고로)을 거기서 냄,
//    다 지으면 남은 돈을 돌려받음(World.payWage·orderMaterials·settleOrder). 맡길 돈 + REPAY_KEEP(밥값)이 없으면 주문하지 않음(돈이 모이면 다음에)
import { BUILDINGS } from "../data/catalog.js";
import { findPath } from "./pathfinding.js";
import { roadNet, netsAt, isPaved } from "./roads.js";
import { WAGE, MARKET_BUY } from "./economy.js";
import { REPAY_KEEP } from "./bank.js";

export const STONE_PER = 3;                                                             // 돌 1개로 포장하는 칸 수
const near = (b, home, r) => Math.hypot(b.door.x - home.door.x, b.door.z - home.door.z) <= r;

/** 집 앞 마당 칸(문 둘레 3×3, 건물·문·물 제외)과 문 높이 */
export function yardCells(world, home) {
  const g = world.grid, d = home.door, e = g.walkHeight(d.x, d.z) ?? 0, out = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const x = d.x + dx, z = d.z + dz; if ((dx || dz) && g.inBounds(x, z) && !g.isWater(x, z) && world.canReshape(x, z)) out.push([x, z]); }
  return { cells: out, target: e };
}
export function yardFlat(world, home) {
  const { cells, target } = yardCells(world, home); return cells.length >= 3 && cells.every(([x, z]) => Math.abs(world.grid.get(x, z).elevation - target) < 0.01);
}
const claimed = (world, x, z) => world.improveClaims?.has(`${x},${z}`);

/** 이 갈매미가 할 일(만족도를 올릴 일). 없으면 null */
export function planImprovement(world, u) {
  const home = u.home && world.buildings.get(u.home); if (!home || !world.isDone(home)) return null;
  const parts = u.satParts || [], has = n => parts.some(p => p[0].includes(n)), plans = [];
  // 1) 길(건축가·목수·광부·나무꾼 — 상인 말고 모두): 시장·은행과 이어지지 않았으면
  const target = world.marketB() || world.bankB();
  if (target && !has("집-시장") && !has("집-은행") && u.job !== "merchant") {
    const p = findPath(world.grid, home.door.x, home.door.z, target.door.x, target.door.z, 30000);
    if (p) { const cells = [[home.door.x, home.door.z], ...p].filter(([x, z]) => !isPaved(world, x, z) && world.canPaint(x, z) && !claimed(world, x, z)).slice(0, 8);
      const stone = (u.inv?.stone || 0) + (world.res.stone || 0);
      if (cells.length && stone * STONE_PER >= cells.length) plans.push({ kind: "pave", cells, w: 3 }); }
  }
  // 2) 마당 고르기
  if (!yardFlat(world, home)) { const { cells, target: t } = yardCells(world, home); const todo = cells.filter(([x, z]) => Math.abs(world.grid.get(x, z).elevation - t) >= 0.01 && !claimed(world, x, z));
    if (todo.length) plans.push({ kind: "yard", cells: todo, target: t, w: 2 }); }
  // 3) 장식 주문(건축가가 있으면)
  const decoN = [...world.buildings.values()].filter(b => BUILDINGS[b.defId].deco && near(b, home, 6)).length;
  if (decoN < 2 && world.units.some(o => o.job === "builder") && !world.decoOrder?.has(home.id) && canOrder(world, u)) plans.push({ kind: "deco", w: 1 });
  if (!plans.length) return null;
  return plans.sort((a, b) => b.w - a.w)[0];
}
export const DECO_IDS = ["flowerbed", "bench"];
const SLOW_HAMMER = 0.6;                                                                // 가장 느린 망치질(jobs.js hammerPower: 건축가 아닌 갈매미 0.6, 보통 건축가 0.8)
/** 갈매미 주문 장식에 맡길 돈: (바퀴 수 + 여유 1) × (품삯 + 한 바퀴 자재의 시장 값). 바퀴 수 = 올림(work ÷ 0.6)(한 바퀴 = 망치질 3번, 필요한 망치질 = 3 × work).
 *  남은 돈은 다 지으면 돌려받음. 벤치·화단(work 1, 나무 1): (2 + 1) × (2 + 2) = 12 — 보통 건축가는 2바퀴(8)를 씀 */
export function orderCost(id) {
  const d = BUILDINGS[id], mat = Object.entries(d.cost || { wood: 1, stone: 1 }).reduce((s, [k, n]) => s + n * (MARKET_BUY[k] || 0), 0);
  return (Math.ceil((d.work ?? 1) / SLOW_HAMMER) + 1) * (WAGE + mat);
}
/** 이 갈매미가 장식을 주문할 돈이 있나(경제가 없으면 늘 됨): 가장 비싼 장식의 맡길 돈 + REPAY_KEEP */
export const canOrder = (world, u) => !world.economy || (u?.coins || 0) >= Math.max(...DECO_IDS.map(orderCost)) + REPAY_KEEP;
/** 장식 공사장 놓기: 집 문에서 2~5칸 안의 빈 땅에 화단 또는 벤치. u(주문한 갈매미)가 있으면 그 갈매미가 값을 맡김(설계비는 늘 없음).
 *  u 없이 부르면 예전처럼 맡긴 돈 없음(품삯은 금고에서) */
export function orderDeco(world, home, rnd, u = null) {
  const id = rnd() < 0.5 ? "flowerbed" : "bench", opt = u && world.economy ? { free: true, order: { u, cost: orderCost(id) } } : { free: true };
  for (let r = 2; r <= 5; r++) for (let k = 0; k < 16; k++) {
    const a = k / 16 * 6.283 + rnd() * 0.3, x = Math.round(home.door.x + Math.cos(a) * r), z = Math.round(home.door.z + Math.sin(a) * r);
    for (let rot = 0; rot < 4; rot++) if (world.check(id, x, z, rot, opt).ok) { const res = world.placeBuilding(id, x, z, rot, null, null, opt); if (res.ok) { (world.decoOrder ||= new Set()).add(home.id); return res.building; } }
  }
  return null;
}
