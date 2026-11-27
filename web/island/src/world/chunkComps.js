// 걸어서 이어진 땅 덩어리 번호(오픈월드 1-B). 끝없는 세계에는 "격자 전체"가 없어서, 물어본 칸의 덩어리만 그때 센다(늘 답이 있음).
//  · at(x, z): 걸을 수 없거나 한계 밖이면 −1, 아니면 덩어리 번호(물어본 순서대로 0, 1, 2… — 같은지 다른지만 뜻이 있음).
//  · 한 덩어리는 처음 물어볼 때 4방향 canStep으로 끝까지 퍼져 센다. 퍼지는 동안 만지는 청크는 ChunkGrid가 처음 만질 때 만든다
//    → "안 올라온 곳 = 못 닿음"이 없다(unitBrain이 그곳을 배 길로 착각하지 않음). 땅은 바다로 둘러싸여 있어 퍼짐은 섬(과 다리) 안에서 끝난다.
//  · 보통 Grid(옛 64칸 섬)는 Int32Array, ChunkGrid는 Map(칸 번호 Smi → 덩어리 번호)에 적는다.
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class CompLabels {
  constructor(grid) {
    this.g = grid; this.next = 0; this.cells = 0;
    if (grid.cells) { this.arr = new Int32Array(grid.cells.length).fill(-2); this.map = null; } else { this.arr = null; this.map = new Map(); }
  }
  get(i) { if (this.arr) { const v = this.arr[i]; return v === -2 ? undefined : v; } return this.map.get(i); }
  set(i, v) { if (this.arr) this.arr[i] = v; else this.map.set(i, v); }
  at(x, z) {
    const g = this.g; if (!g.inBounds(x, z)) return -1;
    const s = g.index(x, z), v = this.get(s); if (v !== undefined) return v;
    if (!g.isWalkable(x, z)) { this.set(s, -1); return -1; }
    const id = this.next++, q = [s]; this.set(s, id);
    while (q.length) {
      const i = q.pop(), cx = g.xOf(i), cz = g.zOf(i); this.cells++;
      for (const [dx, dz] of N4) {
        const nx = cx + dx, nz = cz + dz; if (!g.inBounds(nx, nz)) continue;
        const ni = g.index(nx, nz), o = this.get(ni); if (o !== undefined && o >= 0) continue;
        if (!g.canStep(cx, cz, nx, nz)) continue;
        this.set(ni, id); q.push(ni);
      }
    }
    return id;
  }
}
/** 잠깐 바꾼 칸 상태에서 미리 센 점들의 덩어리(바꾼 것을 되돌린 뒤에도 그 점들만 물어봄) */
export class FrozenComps {
  constructor(grid, vals) { this.g = grid; this.vals = vals; }
  at(x, z) { if (!this.g.inBounds(x, z)) return -1; return this.vals.get(this.g.index(x, z)) ?? -1; }
}
