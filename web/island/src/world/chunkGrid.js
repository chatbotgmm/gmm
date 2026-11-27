// 시뮬 격자(오픈월드 1-B): 끝없는 세계를 32×32칸 데이터 청크로 담는다. 길찾기·짓기·갈매미·덩어리 계산이 쓴다(그리기는 render/viewGrid.js).
//  · Grid와 같은 API(get/inBounds/index/isWater/walkHeight/canStep/occupy/release/doors/setGround/setElevation/markDirty/takeDirty/version).
//    w·h·cells는 없다. 시작 섬 상자는 box({x0,z0,x1,z1}), 칸 번호 → 좌표는 xOf/zOf.
//  · 청크는 카메라와 상관없이 **처음 만질 때** 만든다(생성 + 저장 델타는 불러올 때 이미 상주 청크에 들어 있음). 그래서 카메라를 어디 두든 시뮬 결과가 같다.
//  · 시작 섬(칸 0..191 = 청크 0..5)은 처음부터 끝까지 올라와 있다(fixed). 바뀐 칸·차지한 칸·문이 있는 청크는 상주(pinned)한다.
//    상주하지 않는 청크만 LRU(lruMax개)로 내린다. 내릴 때 다시 한 번 생성 결과와 견주어 다르면(직접 쓴 칸) 상주로 돌린다.
//  · 청크를 올리고 내리는 일은 version을 올리지 않는다(덩어리 캐시가 version으로 지워짐). 걷기 가능 여부가 바뀔 때만 올린다.
//  · 칸 번호는 Smi: (z+16384)*32768 + (x+16384). 소프트 한계 ±16384칸(밖은 get = null, 지도 밖과 같음).
//  · 높이는 생성 결과 Int16(×1000)을 double로 풀어 Cell에 넣는다(Float32 금지). 저장 델타도 ×1000(saveDelta.js).
import { CHUNK } from "../config.js";
import { createCell, GROUND_TYPES } from "../data/types.js";
import { Grid } from "./Grid.js";
import { genChunk, GEN_WORLD_V, WCH, WCH_SHIFT, WCH_MASK } from "./worldGen.js";

export const SOFT = 16384;
const NC = WCH * WCH;
const ckey = (cx, cz) => (cz + 512) * 1024 + (cx + 512);   // 청크 열쇠(Smi): 청크 ±512 = 칸 ±16384

export class ChunkGrid {
  /** seed: 바깥 생성 씨앗 · genV: 생성 판(저장에 적음, 없으면 1) · box: 시작 섬 상자 · lruMax: 상주하지 않는 청크를 몇 개까지 둘지 */
  constructor(seed, { genV = GEN_WORLD_V, box = { x0: 0, z0: 0, x1: 192, z1: 192 }, lruMax = 64, chunk = CHUNK } = {}) {
    this.seed = seed ?? 7; this.genV = genV; this.box = box; this.chunk = chunk; this.lruMax = lruMax;
    this.fixed = new Map(); this.pinned = new Map(); this.lru = new Map(); this.all = new Map();   // all: 올라온 청크 모두(찾기는 한 번에)
    this.occupants = new Map(); this.occCells = new Map(); this.doors = new Map(); this.dirtyChunks = new Set();
    this.version = 0; this.clock = 0; this.loads = 0; this.evicts = 0; this.visited = new Set();
    this._lk = NaN; this._lc = null;
  }
  inBounds(x, z) { return x >= -SOFT && z >= -SOFT && x < SOFT && z < SOFT; }
  index(x, z) { return (z + SOFT) * 32768 + (x + SOFT); }
  xOf(i) { return (i & 32767) - SOFT; }
  zOf(i) { return (i >> 15) - SOFT; }
  chunkKey(x, z) { return `${Math.floor(x / this.chunk)},${Math.floor(z / this.chunk)}`; }
  inBox(x, z) { const b = this.box; return x >= b.x0 && z >= b.z0 && x < b.x1 && z < b.z1; }
  /** 시작 섬 그리기 조각(16칸) 수 — 그리기(GroundChunks)가 처음에 다 그리는 범위 */
  get chunksX() { return Math.ceil((this.box.x1 - this.box.x0) / this.chunk); }
  get chunksZ() { return Math.ceil((this.box.z1 - this.box.z0) / this.chunk); }

  // ---- 청크
  /** 생성(+ 이미 있던 칸 객체 없음) → 새 데이터 청크. base: 생성 결과(Int16 높이×1000, Uint8 바닥) */
  makeChunk(cx, cz, be, bg) {
    const cells = new Array(NC);
    for (let i = 0; i < NC; i++) cells[i] = createCell(GROUND_TYPES[bg[i]], be[i] / 1000);
    return { cx, cz, key: ckey(cx, cz), cells, be, bg, used: 0 };
  }
  load(cx, cz, k) {
    const d = genChunk(this.seed, cx, cz), ch = this.makeChunk(cx, cz, d.elev, d.ground); this.loads++;
    ch.used = ++this.clock;                                                        // 막 만든 청크가 가장 오래된 것으로 보여 바로 내려가지 않게(내려가면 돌려준 칸에 쓴 것이 사라짐)
    this.lru.set(k, ch); this.all.set(k, ch);
    if (this.lru.size > this.lruMax) this.evict(ch);
    return ch;
  }
  /** 가장 오래 안 쓴 청크 하나를 내림. 다르게 바뀐 칸·차지·문이 있으면 내리지 않고 상주로 돌림 */
  evict(keep = null) {
    for (let guard = 0; this.lru.size > this.lruMax && guard < 8; guard++) {
      let old = null; for (const ch of this.lru.values()) if (ch !== this._lc && ch !== keep && (!old || ch.used < old.used)) old = ch;
      if (!old) return;
      this.lru.delete(old.key);
      if (this.resident(old)) { this.pinned.set(old.key, old); continue; }
      this.all.delete(old.key); this.evicts++;
    }
  }
  /** 이 청크를 늘 둬야 하나: 생성 결과와 다른 칸, 차지한 칸, 문 앞 칸이 있음 */
  resident(ch) {
    for (let i = 0; i < NC; i++) { const c = ch.cells[i]; if (c.occupiedId != null || Math.round(c.elevation * 1000) !== ch.be[i] || c.groundType !== GROUND_TYPES[ch.bg[i]]) return true; }
    const x0 = ch.cx * WCH, z0 = ch.cz * WCH;
    for (const i of this.doors.keys()) { const x = this.xOf(i), z = this.zOf(i); if (x >= x0 && z >= z0 && x < x0 + WCH && z < z0 + WCH) return true; }
    return false;
  }
  chunkAt(cx, cz) {
    const k = ckey(cx, cz); if (k === this._lk) return this._lc;
    const ch = this.all.get(k) || this.load(cx, cz, k);
    ch.used = ++this.clock; this._lk = k; this._lc = ch; return ch;
  }
  /** 올라와 있으면 그 청크, 없으면 null(만들지 않음 — 그리기가 씀) */
  loadedChunk(cx, cz) { return this.all.get(ckey(cx, cz)) || null; }
  /** 칸을 바꾸는 일(높이·바닥·차지)이 생긴 청크는 상주로 옮긴다 */
  pin(x, z) {
    const k = ckey(x >> WCH_SHIFT, z >> WCH_SHIFT), ch = this.lru.get(k);
    if (ch) { this.lru.delete(k); this.pinned.set(k, ch); }
  }
  isResidentChunk(cx, cz) { const k = ckey(cx, cz); return this.fixed.has(k) || this.pinned.has(k); }
  get loadedCount() { return this.all.size; }

  // ---- 칸
  get(x, z) {
    if (x < -SOFT || z < -SOFT || x >= SOFT || z >= SOFT) return null;
    const k = ((z >> WCH_SHIFT) + 512) * 1024 + ((x >> WCH_SHIFT) + 512);              // 같은 청크를 연달아 읽는 일이 대부분(마지막 청크 기억)
    const ch = k === this._lk ? this._lc : this.chunkAt(x >> WCH_SHIFT, z >> WCH_SHIFT);
    return ch.cells[((z & WCH_MASK) << WCH_SHIFT) | (x & WCH_MASK)];
  }
  /** 올라온 칸만(없으면 null, 만들지 않음) */
  peek(x, z) {
    if (x < -SOFT || z < -SOFT || x >= SOFT || z >= SOFT) return null;
    const k = ((z >> WCH_SHIFT) + 512) * 1024 + ((x >> WCH_SHIFT) + 512), ch = k === this._lk ? this._lc : this.all.get(k);
    return ch ? ch.cells[((z & WCH_MASK) << WCH_SHIFT) | (x & WCH_MASK)] : null;
  }
  setGround(x, z, type) { const r = Grid.prototype.setGround.call(this, x, z, type); if (r) this.pin(x, z); return r; }
  setElevation(x, z, e) { const r = Grid.prototype.setElevation.call(this, x, z, e); if (r) this.pin(x, z); return r; }
  markAllDirty() { for (let cz = 0; cz < this.chunksZ; cz++) for (let cx = 0; cx < this.chunksX; cx++) this.dirtyChunks.add(`${cx + Math.floor(this.box.x0 / this.chunk)},${cz + Math.floor(this.box.z0 / this.chunk)}`); }

  occupy(cells, id, info) {
    this.occupants.set(id, info);
    const list = this.occCells.get(id) || []; this.occCells.set(id, list);
    for (const [x, z] of cells) { this.get(x, z).occupiedId = id; this.pin(x, z); list.push(this.index(x, z)); }
    this.version++;
  }
  release(id) {
    for (const i of this.occCells.get(id) || []) { const c = this.get(this.xOf(i), this.zOf(i)); if (c && c.occupiedId === id) c.occupiedId = null; }
    this.occCells.delete(id);
    for (const [k, v] of this.doors) if (v === id) this.doors.delete(k);
    this.occupants.delete(id); this.version++;
  }
  reserveDoor(x, z, id) { this.doors.set(this.index(x, z), id); this.pin(x, z); }

  /** 상주 칸 모두(시작 섬 + 바뀐·차지한 청크): fn(cell, x, z). 마을 둘레 계산(도로망·반짝이)이 섬 전체 대신 이것을 훑는다 */
  eachCell(fn) {
    for (const map of [this.fixed, this.pinned]) for (const ch of map.values()) {
      const x0 = ch.cx * WCH, z0 = ch.cz * WCH;
      for (let i = 0; i < NC; i++) fn(ch.cells[i], x0 + (i & WCH_MASK), z0 + (i >> WCH_SHIFT));
    }
  }
  /** 상주였다가 되돌아간 청크(칠했다 되돌림·건물 철거)를 LRU로 돌림. 그래서 상주 집합 = 지금 칸 상태만의 함수
   *  → 저장해서 다시 불러온 섬(델타·건물·문 청크만 상주)과 같은 칸을 훑는다(반짝이 후보가 저장 전후로 같음) */
  unpinStale() {
    let moved = false;
    for (const [k, ch] of this.pinned) if (!this.resident(ch)) { this.pinned.delete(k); this.lru.set(k, ch); moved = true; }
    if (moved && this.lru.size > this.lruMax) this.evict();
  }
  /** 상주 청크 목록(저장용, 고정 순서: 열쇠 오름차순) */
  residentChunks() { return [...this.fixed.values(), ...this.pinned.values()].sort((a, b) => a.key - b.key); }
  /** 지나온 청크(미니맵·저장용, 카메라가 넣어 줌. 시뮬에는 안 쓰임) */
  visit(cx, cz) { this.visited.add(ckey(cx, cz)); }

  /** 시작 섬 Grid(192칸, islandGen 결과 또는 예전 저장)를 고정 청크로 옮긴다. 그 칸들이 시작 섬 기준(base)이 된다 */
  static fromStart(seed, start, opt = {}) {
    const g = new ChunkGrid(seed, { ...opt, box: { x0: 0, z0: 0, x1: start.w, z1: start.h } });
    const be = new Int16Array(start.w * start.h), bg = new Uint8Array(start.w * start.h);
    start.cells.forEach((c, i) => { be[i] = Math.round(c.elevation * 1000); bg[i] = GROUND_TYPES.indexOf(c.groundType); });
    g.setStartBase(be, bg);
    for (const ch of g.fixed.values()) for (let i = 0; i < NC; i++) {           // 칸 값은 저장 반올림과 같게(×1000) 하지 않고 원래 값 그대로 — 시작 섬 Grid와 같은 결과
      const x = ch.cx * WCH + (i & WCH_MASK), z = ch.cz * WCH + (i >> WCH_SHIFT);
      if (x < start.w && z < start.h) { const s = start.cells[z * start.w + x]; ch.cells[i].elevation = s.elevation; ch.cells[i].groundType = s.groundType; }
    }
    g.markAllDirty(); return g;                                                      // 시작 섬 그리기 조각을 처음에 다 그림
  }
  /** 시작 섬 기준 배열(상자 크기, 행 우선)로 고정 청크를 만듦. 상자 밖으로 삐져나온 청크 칸은 바깥 생성 값 */
  setStartBase(be, bg) {
    const b = this.box, W = b.x1 - b.x0;
    this.startBase = { be, bg };
    for (let cz = b.z0 >> WCH_SHIFT; cz <= (b.z1 - 1) >> WCH_SHIFT; cz++) for (let cx = b.x0 >> WCH_SHIFT; cx <= (b.x1 - 1) >> WCH_SHIFT; cx++) {
      const gen = genChunk(this.seed, cx, cz), ce = new Int16Array(gen.elev), cg = new Uint8Array(gen.ground);
      for (let i = 0; i < NC; i++) { const x = cx * WCH + (i & WCH_MASK), z = cz * WCH + (i >> WCH_SHIFT); if (this.inBox(x, z)) { const j = (z - b.z0) * W + (x - b.x0); ce[i] = be[j]; cg[i] = bg[j]; } }
      const ch = this.makeChunk(cx, cz, ce, cg); this.fixed.set(ch.key, ch); this.lru.delete(ch.key); this.pinned.delete(ch.key); this.all.set(ch.key, ch);
    }
    this._lk = NaN; this._lc = null;
  }
  /** 시작 섬 상자의 지금 칸을 배열로(물가 계산 등): { el: Float64Array, w, h } */
  boxElevations() {
    const b = this.box, w = b.x1 - b.x0, h = b.z1 - b.z0, el = new Float64Array(w * h);
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) el[z * w + x] = this.get(x + b.x0, z + b.z0).elevation;
    return { el, w, h };
  }
}
// Grid와 똑같은 규칙(걷기·계단·물·문·다시 그리기)은 그대로 빌려 씀 — 한 곳만 고치면 둘 다 바뀌게
for (const m of ["isWater", "walkHeight", "isWalkable", "edgeHeight", "canStep", "doorOwner", "markDirty", "takeDirty"]) ChunkGrid.prototype[m] = Grid.prototype[m];
