// 보기 격자(오픈월드 1-A): 그리기(바닥 메쉬·물 깊이)가 쓰는 끝없는 격자. 시뮬은 그대로 world.grid(시작 섬 192칸)를 쓴다.
//  · 시작 섬 안(world.grid.inBounds)은 world.grid의 칸을 그대로 넘긴다(같은 객체 → 짓기·파기가 바로 보임).
//  · 바깥은 worldGen.genChunk 결과(Int16 높이 + Uint8 바닥 + Uint8 바다 = 청크당 4 KB)를 LRU에 둔다.
//    groundChunks·terrain이 칸 객체(c.elevation, c.groundType)를 읽으므로, 메쉬를 만드는 동안 쓰는 청크만 칸 객체로 풀어 작은 LRU에 둔다.
//  · get()은 null을 돌려주지 않는다. inBounds는 소프트 한계(±16384칸) 안이면 참. 칸 번호(index)는 Smi 범위: (z+16384)*32768 + (x+16384).
//  · 카메라는 이 격자만 움직인다. 시뮬(갈매미 길찾기 등)은 이 격자를 보지 않으므로 카메라 위치가 시뮬 결과를 바꾸지 않는다.
import { SEA_LEVEL, SEABED } from "../config.js";
import { GROUND_TYPES } from "../data/types.js";
import { genChunk, WCH, WCH_SHIFT, WCH_MASK } from "../world/worldGen.js";

export const SOFT = 16384;                       // 소프트 한계(칸): 걷는 속도로 끝까지 약 2시간
const DEEP = Object.freeze({ groundType: "Sand", occupiedId: null, elevation: SEABED });   // 한계 밖은 깊은 바다

export class ViewGrid {
  constructor(inner, seed, { dataChunks = 256, cellChunks = 48 } = {}) {
    this.inner = inner; this.seed = seed ?? 7; this.chunk = inner.chunk;
    this.data = new Map(); this.dataMax = dataChunks;      // 청크 열쇠(Smi) → genChunk 결과
    this.cells = new Map(); this.cellMax = cellChunks;     // 청크 열쇠 → 칸 객체 1024개(그릴 때만)
    this._lk = NaN; this._lc = null;                       // 마지막으로 쓴 칸 객체 청크(같은 청크를 연달아 읽는 일이 대부분)
    this.generated = 0;
  }
  get version() { return this.inner.version; }
  inBounds(x, z) { return x >= -SOFT && z >= -SOFT && x < SOFT && z < SOFT; }
  index(x, z) { return (z + SOFT) * 32768 + (x + SOFT); }
  isInner(x, z) { return this.inner.inBounds(x, z); }
  /** 시작 섬 상자 안의 16칸 그리기 조각인가(그 조각은 지금처럼 world.grid 메쉬로 그림) */
  innerPiece(px, pz) { return px >= 0 && pz >= 0 && px < this.inner.chunksX && pz < this.inner.chunksZ; }
  chunkKey(x, z) { return `${Math.floor(x / this.chunk)},${Math.floor(z / this.chunk)}`; }
  takeDirty() { return this.inner.takeDirty(); }
  markAllDirty() { this.inner.markAllDirty(); }
  markDirty(x, z) { this.inner.markDirty(x, z); }

  /** 데이터 청크(32칸) — 없으면 만든다. LRU: 꺼낼 때마다 맨 뒤로 */
  chunkData(cx, cz) {
    const k = (cz + 512) * 1024 + (cx + 512); let d = this.data.get(k);
    if (d) { this.data.delete(k); this.data.set(k, d); return d; }
    d = genChunk(this.seed, cx, cz); this.generated++;
    this.data.set(k, d);
    if (this.data.size > this.dataMax) this.data.delete(this.data.keys().next().value);
    return d;
  }
  /** 칸 높이(m, 숫자만). 물 깊이 창처럼 칸 객체가 필요 없는 곳이 씀 */
  elev(x, z) {
    if (this.inner.inBounds(x, z)) return this.inner.cells[this.inner.index(x, z)].elevation;
    if (!this.inBounds(x, z)) return SEABED;
    return this.chunkData(x >> WCH_SHIFT, z >> WCH_SHIFT).elev[(z & WCH_MASK) * WCH + (x & WCH_MASK)] / 1000;
  }
  get(x, z) {
    if (this.inner.inBounds(x, z)) return this.inner.cells[this.inner.index(x, z)];
    if (!this.inBounds(x, z)) return DEEP;
    const cx = x >> WCH_SHIFT, cz = z >> WCH_SHIFT, k = (cz + 512) * 1024 + (cx + 512);
    let arr = k === this._lk ? this._lc : this.cells.get(k);
    if (!arr) {
      const d = this.chunkData(cx, cz); arr = new Array(WCH * WCH);
      for (let i = 0; i < arr.length; i++) arr[i] = { groundType: GROUND_TYPES[d.ground[i]], occupiedId: null, elevation: d.elev[i] / 1000 };
      this.cells.set(k, arr);
      if (this.cells.size > this.cellMax) { const old = this.cells.keys().next().value; this.cells.delete(old); }
    }
    this._lk = k; this._lc = arr;
    return arr[(z & WCH_MASK) * WCH + (x & WCH_MASK)];
  }
  isWater(x, z) { return this.get(x, z).elevation < SEA_LEVEL; }
  /** 16칸 그리기 조각 (px, pz)의 바깥 데이터가 둘레 margin칸까지 모두 깊은 바다(−0.95 m 이하)인가 → 그 조각은 메쉬가 필요 없음(물이 불투명하게 덮음) */
  seaOnlyPiece(px, pz, margin = 12) {
    const n = this.chunk, x0 = px * n - margin, z0 = pz * n - margin, x1 = px * n + n - 1 + margin, z1 = pz * n + n - 1 + margin;
    if (!(x1 < 0 || z1 < 0 || x0 >= this.inner.w || z0 >= this.inner.h)) return false;   // 시작 섬 상자에 걸리면 바다뿐이라고 보지 않음
    for (let cz = z0 >> WCH_SHIFT; cz <= z1 >> WCH_SHIFT; cz++) for (let cx = x0 >> WCH_SHIFT; cx <= x1 >> WCH_SHIFT; cx++) if (this.chunkData(cx, cz).top > -950) return false;
    return true;
  }
}
