// 격자 길찾기(A*, 8방향, 모서리 가로지르기 없음). 바다·건물·높은 턱은 grid.canStep이 막는다.
//  · 포장도로(paved: 포장 칸 번호 모음 — world.roads.net, roads.js isPaved: 돌길·나무 데크·다 지은 다리)를 넘기면
//    포장 칸으로 들어가는 걸음 값이 ROAD_COST배라서, 조금 돌아가더라도 길로 감(갈매미가 길 위로 다님).
//    길로 돌아가는 길도 찾도록 어림값(h)을 ROAD_H배로 줄임(ROAD_COST까지 줄이면 늘 가장 싼 길이지만 넓은 들판에서 훑는 칸이 크게 늚).
//  · 포장 칸이 없거나, 포장 칸을 감싼 네모가 출발~도착 네모(+ROAD_NEAR칸 + 거리의 1/4)와 안 겹치면 예전과 똑같이 찾음.
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

class Heap {                                   // f 값이 가장 작은 칸을 먼저 꺼내는 이진 힙
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let s = i;
        if (l < a.length && a[l].f < a[s].f) s = l; if (r < a.length && a[r].f < a[s].f) s = r;
        if (s === i) break; [a[s], a[i]] = [a[i], a[s]]; i = s; } }
    return top; }
}

export const ROAD_COST = 0.6, ROAD_H = 0.8, ROAD_NEAR = 8;
const boxes = new WeakMap();
/** 포장 칸 모음을 감싼 네모 [x0, z0, x1, z1](모음마다 한 번만 셈 — world.roads.net은 2초마다 새로 만들어짐. 넘긴 모음을 나중에 고치지 말 것) */
function pavedBox(grid, paved) {
  let b = boxes.get(paved); if (b) return b;
  b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const i of paved.keys()) { const x = grid.xOf(i), z = grid.zOf(i); if (x < b[0]) b[0] = x; if (z < b[1]) b[1] = z; if (x > b[2]) b[2] = x; if (z > b[3]) b[3] = z; }
  boxes.set(paved, b); return b;
}
/** 이 길찾기에 포장도로를 셈할까: 포장 칸이 있고, 그 네모가 출발~도착 네모(+여유)와 겹침 */
function roadsNear(grid, paved, sx, sz, gx, gz) {
  if (!paved || !paved.size) return false;
  const b = pavedBox(grid, paved), m = ROAD_NEAR + Math.max(Math.abs(gx - sx), Math.abs(gz - sz)) / 4;
  return b[0] <= Math.max(sx, gx) + m && b[2] >= Math.min(sx, gx) - m && b[1] <= Math.max(sz, gz) + m && b[3] >= Math.min(sz, gz) - m;
}

/** (sx,sz)에서 (gx,gz)까지 칸 목록(출발 칸 제외). 못 가면 null. paved: 포장 칸 번호 모음({ has, size, keys }, 없으면 걸음 값이 다 같음) */
export function findPath(grid, sx, sz, gx, gz, maxNodes = 6000, paved = null) {
  if (!grid.inBounds(gx, gz) || !grid.isWalkable(gx, gz)) return null;
  if (sx === gx && sz === gz) return [];
  const road = roadsNear(grid, paved, sx, sz, gx, gz), hw = road ? ROAD_H : 1;
  const h = (x, z) => { const dx = Math.abs(x - gx), dz = Math.abs(z - gz); return hw * (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)); };
  const g = new Map(), from = new Map(), open = new Heap(), start = grid.index(sx, sz), goal = grid.index(gx, gz);
  g.set(start, 0); open.push({ i: start, x: sx, z: sz, f: h(sx, sz) });
  let seen = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur.i === goal) {
      const path = []; let i = goal;
      while (i !== start) { path.push([grid.xOf(i), grid.zOf(i)]); i = from.get(i); }
      return path.reverse();
    }
    if (++seen > maxNodes) return null;
    const cg = g.get(cur.i);
    if (cur.f > cg + h(cur.x, cur.z) + 1e-9) continue;          // 이미 더 짧은 길로 처리한 칸
    for (const [dx, dz, cost] of DIRS) {
      const nx = cur.x + dx, nz = cur.z + dz;
      if (!grid.canStep(cur.x, cur.z, nx, nz)) continue;
      if (dx && dz && !(grid.canStep(cur.x, cur.z, nx, cur.z) && grid.canStep(cur.x, cur.z, cur.x, nz))) continue;
      const ni = grid.index(nx, nz), ng = cg + (road && paved.has(ni) ? cost * ROAD_COST : cost);
      if (ng < (g.get(ni) ?? Infinity)) { g.set(ni, ng); from.set(ni, cur.i); open.push({ i: ni, x: nx, z: nz, f: ng + h(nx, nz) }); }
    }
  }
  return null;
}

/** (x,z)에서 가장 가까운 걸을 수 있는 칸(너비 우선). 없으면 null. */
export function nearestWalkable(grid, x, z, maxR = 12) {
  if (grid.isWalkable(x, z)) return [x, z];
  const seen = new Set([grid.index(x, z)]), q = [[x, z, 0]];
  while (q.length) {
    const [cx, cz, d] = q.shift(); if (d > maxR) break;
    for (const [dx, dz] of DIRS) {
      const nx = cx + dx, nz = cz + dz; if (!grid.inBounds(nx, nz)) continue;
      const i = grid.index(nx, nz); if (seen.has(i)) continue; seen.add(i);
      if (grid.isWalkable(nx, nz)) return [nx, nz];
      q.push([nx, nz, d + 1]);
    }
  }
  return null;
}
