// 격자 길찾기(A*, 8방향, 모서리 가로지르기 없음). 바다·건물·높은 턱은 grid.canStep이 막는다.
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

/** (sx,sz)에서 (gx,gz)까지 칸 목록(출발 칸 제외). 못 가면 null. */
export function findPath(grid, sx, sz, gx, gz, maxNodes = 6000) {
  if (!grid.inBounds(gx, gz) || !grid.isWalkable(gx, gz)) return null;
  if (sx === gx && sz === gz) return [];
  const h = (x, z) => { const dx = Math.abs(x - gx), dz = Math.abs(z - gz); return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz); };
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
      const ni = grid.index(nx, nz), ng = cg + cost;
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
