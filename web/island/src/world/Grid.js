// 섬 격자(지시서 3-B-1). 칸 상태, 차지(occupied), 걷기 가능 여부, 다시 그릴 청크를 관리한다.
import { GRID_W, GRID_H, CHUNK, SEA_LEVEL, MAX_STEP } from "../config.js";
import { createCell, GROUND_TYPES } from "../data/types.js";

// 한 칸의 모양·색·법선은 둘레 2칸까지의 높이·종류에 따라 달라진다(꼭짓점 평균·경계 섞기·법선)
const AROUND = []; for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) AROUND.push([dx, dz]);

export class Grid {
  constructor(w = GRID_W, h = GRID_H, chunk = CHUNK) {
    this.w = w; this.h = h; this.chunk = chunk;
    this.cells = Array.from({ length: w * h }, () => createCell());
    this.occupants = new Map();     // occupiedId → { kind, walkable, surface }
    this.doors = new Map();         // 칸 번호 → 건물 id. 문 앞 칸은 다른 건물이 막지 못한다.
    this.dirtyChunks = new Set();   // 다시 그려야 할 청크 "cx,cz"
    this.version = 0;               // 걷기 가능 여부가 바뀔 때마다 1씩 오름
    this.box = { x0: 0, z0: 0, x1: w, z1: h };   // 섬 상자(ChunkGrid와 같은 이름: 섬 전체를 훑는 곳이 이 상자만 봄)
  }
  get chunksX() { return Math.ceil(this.w / this.chunk); }
  get chunksZ() { return Math.ceil(this.h / this.chunk); }
  inBounds(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.h; }
  index(x, z) { return z * this.w + x; }
  xOf(i) { return i % this.w; }
  zOf(i) { return Math.floor(i / this.w); }
  inBox(x, z) { return this.inBounds(x, z); }
  /** 칸 모두: fn(cell, x, z) (ChunkGrid는 상주 칸만) */
  eachCell(fn) { const w = this.w; for (let i = 0; i < this.cells.length; i++) fn(this.cells[i], i % w, (i / w) | 0); }
  get(x, z) { return this.inBounds(x, z) ? this.cells[this.index(x, z)] : null; }
  isWater(x, z) { const c = this.get(x, z); return !c || c.elevation < SEA_LEVEL; }
  chunkKey(x, z) { return `${Math.floor(x / this.chunk)},${Math.floor(z / this.chunk)}`; }

  // 한 칸의 모양은 이웃 8칸(오토타일·절벽 옆면)에 따라 달라지므로, 이웃이 다른 청크에 있으면 그 청크도 다시 그린다.
  markDirty(x, z) {
    for (const [dx, dz] of AROUND) { const nx = x + dx, nz = z + dz; if (this.inBounds(nx, nz)) this.dirtyChunks.add(this.chunkKey(nx, nz)); }
  }
  markAllDirty() { for (let cz = 0; cz < this.chunksZ; cz++) for (let cx = 0; cx < this.chunksX; cx++) this.dirtyChunks.add(`${cx},${cz}`); }
  takeDirty() { const d = [...this.dirtyChunks]; this.dirtyChunks.clear(); return d; }

  setGround(x, z, type) {
    const c = this.get(x, z); if (!c || c.groundType === type) return false;
    c.groundType = type; this.markDirty(x, z); return true;
  }
  setElevation(x, z, e) {
    const c = this.get(x, z); if (!c || c.elevation === e) return false;
    c.elevation = e; this.markDirty(x, z); this.version++; return true;
  }

  occupy(cells, id, info) {
    this.occupants.set(id, info);
    for (const [x, z] of cells) this.get(x, z).occupiedId = id;
    this.version++;
  }
  release(id) {
    for (const c of this.cells) if (c.occupiedId === id) c.occupiedId = null;
    for (const [k, v] of this.doors) if (v === id) this.doors.delete(k);
    this.occupants.delete(id); this.version++;
  }
  reserveDoor(x, z, id) { this.doors.set(this.index(x, z), id); }
  doorOwner(x, z) { return this.inBounds(x, z) ? this.doors.get(this.index(x, z)) ?? null : null; }

  /** 유닛이 이 칸에 서는 높이(m). 설 수 없으면 null. */
  walkHeight(x, z) {
    const c = this.get(x, z); if (!c) return null;
    if (c.occupiedId) { const o = this.occupants.get(c.occupiedId); return o && o.walkable ? o.surface : null; }
    return c.elevation < SEA_LEVEL ? null : c.elevation;
  }
  isWalkable(x, z) { return this.walkHeight(x, z) !== null; }
  /** 이웃 쪽(dx, dz)으로 넘어갈 때 이 칸 가장자리의 높이. 계단은 앞(낮은 쪽)·뒤(높은 쪽)로만 드나듦. */
  edgeHeight(x, z, dx, dz) {
    const c = this.get(x, z), o = c?.occupiedId && this.occupants.get(c.occupiedId);
    if (o && o.ramp) {
      if (!o.walkable) return null;
      const r = o.ramp; return dx === r.dx && dz === r.dz ? r.h1 : dx === -r.dx && dz === -r.dz ? r.h0 : null;
    }
    return this.walkHeight(x, z);
  }
  canStep(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, a = this.edgeHeight(ax, az, dx, dz), b = this.edgeHeight(bx, bz, -dx, -dz);
    return a !== null && b !== null && Math.abs(a - b) <= MAX_STEP + 1e-6;
  }

  // 저장: 바닥 종류·높이만. 차지 정보는 건물·모듈 목록으로 다시 만든다.
  serialize() {
    return { w: this.w, h: this.h, chunk: this.chunk,
      ground: this.cells.map(c => GROUND_TYPES.indexOf(c.groundType)),
      elevation: this.cells.map(c => Math.round(c.elevation * 1000) / 1000) };
  }
  static fromJSON(j) {
    const g = new Grid(j.w, j.h, j.chunk);
    g.cells.forEach((c, i) => { c.groundType = GROUND_TYPES[j.ground[i]]; c.elevation = j.elevation[i]; });
    g.markAllDirty(); return g;
  }
}
