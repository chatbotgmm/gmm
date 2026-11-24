// 포장도로와 만족도(순수 계산).
//  · 포장도로 = 돌길(Cobble)·나무 데크(WoodDeck) 칸, 다 지은 다리. 흙길(Dirt)은 포장이 아님.
//  · 건물 문 앞 칸(또는 그 둘레 4칸)이 포장도로에 닿으면 그 도로망에 붙은 것. 같은 도로망이면 "길로 이어짐".
//  · 갈매미 만족도(0~100): 기본 40 + 배부름 + 내 집 + 집 아늑함 + 집이 시장·공식은행과 포장도로로 이어짐.
//    만족도가 높으면 일을 조금 더 빨리 하고(능률 ×0.85~1.15), 마을 등급 점수에 들어감. 포장도로 위에선 20% 빨리 걸음.
import { GroundType } from "../data/types.js";
import { BUILDINGS } from "../data/catalog.js";
import { comfort } from "./furniture.js";

export const PAVED = new Set([GroundType.Cobble, GroundType.WoodDeck]);
export function isPaved(world, x, z) {
  const c = world.grid.get(x, z); if (!c) return false;
  if (c.occupiedId) { const b = world.buildings.get(c.occupiedId); return !!b && BUILDINGS[b.defId].bridge && world.isDone(b); }
  return PAVED.has(c.groundType);
}
/** 포장도로 칸마다 도로망 번호(8방향 — 모서리로 닿아도 이어짐, 갈매미가 대각선으로도 걸으니까). -1 = 포장 아님 */
export function roadNet(world) {
  const g = world.grid, W = g.w, net = new Int32Array(W * g.h).fill(-1); let id = 0;
  for (let s = 0; s < net.length; s++) {
    if (net[s] >= 0 || !isPaved(world, s % W, (s / W) | 0)) continue;
    const q = [s]; net[s] = id;
    while (q.length) { const i = q.pop(), x = i % W, z = (i / W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nx = x + dx, nz = z + dz; if (!g.inBounds(nx, nz)) continue; const ni = nz * W + nx; if (net[ni] < 0 && isPaved(world, nx, nz)) { net[ni] = id; q.push(ni); } } }
    id++;
  }
  return net;
}
/** 이 건물 문이 닿는 도로망 번호들 */
export function netsAt(world, net, b) {
  const W = world.grid.w, out = new Set(), d = b.door;
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = d.x + dx, z = d.z + dz; if (world.grid.inBounds(x, z) && net[z * W + x] >= 0) out.add(net[z * W + x]); }
  return out;
}
const linked = (a, b) => [...a].some(n => b.has(n));
/** 만족도와 이유(화면용 줄들) */
export function satisfaction(world, u, net = world.roads?.net) {
  const parts = [["기본", 40]], full = u.full ?? 80;
  if (full >= 60) parts.push(["배부름", 10]); else if (full < 35) parts.push(["배고픔", -15]);
  const home = u.home && world.buildings.get(u.home);
  if (home) {
    parts.push(["내 집", 10]);
    const cz = Math.min(10, comfort(home)); if (cz) parts.push(["집 아늑함", cz]);
    if (net) {
      const hn = netsAt(world, net, home), mk = world.marketB(), bk = world.bankB();
      if (hn.size && mk && linked(hn, netsAt(world, net, mk))) parts.push(["🛣 집-시장 포장도로", 15]);
      if (hn.size && bk && linked(hn, netsAt(world, net, bk))) parts.push(["🛣 집-은행 포장도로", 15]);
    }
    const near = (b, r) => Math.hypot(b.door.x - home.door.x, b.door.z - home.door.z) <= r;
    const deco = [...world.buildings.values()].filter(b => BUILDINGS[b.defId].deco && world.isDone(b) && near(b, 6)).length;
    if (deco) parts.push(["🌷 집 근처 장식", Math.min(10, deco * 2)]);
    if ([...world.buildings.values()].some(b => b.defId === "cafe" && world.isDone(b) && near(b, 30))) parts.push(["☕ 가까운 카페", 5]);
    if (world.powered?.(home)) parts.push(["⚡ 전기", 8]);
  }
  return { value: Math.max(0, Math.min(100, parts.reduce((s, p) => s + p[1], 0))), parts };
}
/** 포장도로로 시장이나 은행과 이어진 집 수 */
export function linkedHouses(world, net = world.roads?.net) {
  if (!net) return 0; const mk = world.marketB(), bk = world.bankB(), mn = mk ? netsAt(world, net, mk) : new Set(), bn = bk ? netsAt(world, net, bk) : new Set();
  return [...world.buildings.values()].filter(b => BUILDINGS[b.defId].house && world.isDone(b)).filter(b => { const h = netsAt(world, net, b); return h.size && (linked(h, mn) || linked(h, bn)); }).length;
}
