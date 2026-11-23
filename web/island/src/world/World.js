// 섬 전체 상태: 격자, 해안 모듈, 자원(나무·광석·씨앗·낚시 자리), 건물, 유닛.
// 그림과 입력은 모르고, 바뀐 일을 이벤트(on/emit)로 알린다. 뷰가 이벤트와 매 프레임 상태를 읽어 그린다.
import { BUILDINGS, MODULES, UNITS } from "../data/catalog.js";
import { createBuildingData, createUnitAIState, UnitState } from "../data/types.js";
import { Grid } from "./Grid.js";
import { generateIsland } from "./islandGen.js";
import { checkPlacement } from "./placement.js";
import { nearestWalkable } from "./pathfinding.js";
import { updateUnit, exitBuilding, enterBuilding, setIdle, emote, uncommit } from "../units/unitBrain.js";
import { seededRandom } from "../util.js";

export const SPEED_BOOST = 1.6;        // 섬은 마을보다 넓어서 걷기·달리기를 이만큼 빠르게(애니메이션도 같은 배율로 빨라짐)
const START_WOOD = 6, START_STONE = 6;

export class World {
  constructor(grid, modules, rnd = Math.random, extra = {}) {
    this.grid = grid; this.modules = modules; this.rnd = rnd; this.time = 0;
    this.buildings = new Map(); this.units = []; this.nextId = 1; this.listeners = {}; this.timers = [];
    this.res = { wood: START_WOOD, stone: START_STONE, fish: 0, eaten: 0 };
    this.instantBuild = false;                         // true면 건물을 놓자마자 완공(갈매미 공사 없음)
    this.spots = (extra.spots || []).map(s => ({ ...s, claimed: null }));
    this.zones = extra.zones || [];
    this.trees = []; this.ores = []; this.seeds = []; this.seedId = 1;
    for (const m of modules) {
      const def = MODULES[m.defId];
      grid.occupy(m.cells, m.id, { kind: "module", walkable: def.walkable, surface: def.surface ?? 0 });
      const [x, z] = m.cells[0];
      if (m.defId === "tree") this.trees.push({ id: m.id, x, z, alive: true, hp: 3, claimed: null });
      if (m.defId === "ore") this.ores.push({ id: m.id, x, z, alive: true, hp: 3, claimed: null });
    }
  }
  static create(seed = 7, rnd = Math.random) {
    const g = generateIsland(seed), w = new World(g.grid, g.modules, rnd, g);
    w.seed = seed; w.spawnUnits(); for (let i = 0; i < 14; i++) w.addSeed(); return w;
  }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, arg) { for (const fn of this.listeners[ev] || []) fn(arg); }
  after(secs, fn) { this.timers.push({ t: secs, fn }); }

  spawnUnits() {
    const r = seededRandom(99);
    UNITS.forEach((u, i) => {
      const a = i / UNITS.length * Math.PI * 2, spot = nearestWalkable(this.grid, Math.floor(32 + Math.cos(a) * 5), Math.floor(32 + Math.sin(a) * 5));
      const s = createUnitAIState(`u${i + 1}`, u.name, spot[0] + 0.5, spot[1] + 0.5, 0.5 + r() * 2); s.scale = u.scale;
      this.units.push(s);
    });
  }

  /** 모델 정보(web/village/models/chars.json)로 몸 크기와 걷기·달리기 속도(칸/초)를 맞춘다. */
  applyCharacterProfiles(chars, walkScale, runScale) {
    this.units.forEach((u, i) => { const c = chars[i % chars.length]; if (!c) return;
      u.name = c.name; u.scale = c.scale; u.height = c.height * c.scale;
      u.walkSpeed = c.walk * walkScale * c.scale * SPEED_BOOST; u.runSpeed = c.run * runScale * c.scale * SPEED_BOOST; });
  }

  // ---- 씨앗(잔디밭에서 쪼아 먹음)
  addSeed(x = null, z = null) {
    for (let k = 0; k < 40 && x === null; k++) {                         // 가운데 평야의 빈 잔디 칸
      const gx = Math.floor(22 + this.rnd() * 20), gz = Math.floor(22 + this.rnd() * 20), c = this.grid.get(gx, gz);
      if (c && !c.occupiedId && !this.grid.isWater(gx, gz) && c.elevation === 0 && !this.seeds.some(s => s.x === gx && s.z === gz)) { x = gx; z = gz; }
    }
    if (x === null) return null;
    const s = { id: this.seedId++, x, z, ox: 0.2 + this.rnd() * 0.6, oz: 0.2 + this.rnd() * 0.6, claimed: null };
    this.seeds.push(s); this.emit("seedAdded", s); return s;
  }
  eatSeed(s) {
    const i = this.seeds.indexOf(s); if (i < 0) return false;
    this.seeds.splice(i, 1); this.res.eaten++; this.emit("seedRemoved", s); this.after(2 + this.rnd() * 4, () => this.addSeed());
    return true;
  }

  // ---- 벌목·채광
  hitTree(t, who) {
    if (!t.alive) return;
    t.hp--; this.emit("treeHit", t);
    if (t.hp > 0) return;
    t.alive = false; this.res.wood += 2;
    this.emit("treeFell", { tree: t, dir: [t.x + 0.5 - who.x, t.z + 0.5 - who.z] });
    this.after(25 + this.rnd() * 15, () => { t.alive = true; t.hp = 3; this.emit("treeGrow", t); });
  }
  hitOre(o) {
    if (!o.alive) return;
    o.hp--; this.emit("oreHit", o);
    if (o.hp > 0) return;
    o.alive = false; this.res.stone += 2; this.emit("oreBroke", o);
    this.after(20 + this.rnd() * 12, () => { o.alive = true; o.hp = 3; this.emit("oreGrow", o); });
  }
  catchFish(u) { this.res.fish++; this.emit("fish", u); }

  // ---- 바닥 칠하기(지시서 3-B): 땅 칸이고 건물·시설이 없을 때만
  canPaint(x, z) { const c = this.grid.get(x, z); return !!c && !this.grid.isWater(x, z) && !c.occupiedId; }
  paint(x, z, type) { if (!this.canPaint(x, z)) return false; const ok = this.grid.setGround(x, z, type); if (ok) this.emit("ground", { x, z, type }); return ok; }

  // ---- 건물(지시서 4-1). 놓으면 공사장이 되고, 갈매미가 나무 1·돌 1을 들고 와서 망치질 3번씩 해서 완공한다.
  check(defId, ax, az, rot) { return checkPlacement(this.grid, BUILDINGS[defId], ax, az, rot, this.units); }
  placeBuilding(defId, ax, az, rot, id = null, hits = null) {
    const def = BUILDINGS[defId], r = checkPlacement(this.grid, def, ax, az, rot, this.units);
    if (!r.ok) return { ok: false, reason: r.reason };
    const b = createBuildingData(id || `b${this.nextId++}`, def, ax, az, rot, r.cells, r.door);
    b.elevation = r.elevation; b.need = 3 * def.footprint.w * def.footprint.d; b.hits = hits ?? (this.instantBuild ? b.need : 0); b.busy = null;
    this.grid.occupy(b.cells, b.id, { kind: "building", walkable: false });   // 길찾기 장애물로 반영(grid.version 증가)
    this.grid.reserveDoor(b.door.x, b.door.z, b.id);
    this.buildings.set(b.id, b); this.emit("buildingAdded", b);
    return { ok: true, building: b };
  }
  isDone(b) { return b.hits >= b.need; }
  hammer(b, u) {
    if (this.isDone(b)) return;
    b.hits++; b.lastBuilder = u ? u.unitId : null; this.emit("buildingProgress", b);
    if (this.isDone(b)) { this.emit("buildingDone", b); if (u) emote(u, "🏠!"); }
  }
  finishAll() { for (const b of this.buildings.values()) if (!this.isDone(b)) { b.hits = b.need; this.emit("buildingDone", b); } }
  removeBuilding(id) {
    const b = this.buildings.get(id); if (!b) return false;
    for (const u of this.units) if (u.insideBuildingId === id) exitBuilding(u, this, this.rnd);   // 안에 있던 갈매미는 문 앞으로
    for (const u of this.units) { if (u.focus === b) setIdle(u, this.rnd, this); if (u.committed === id) u.committed = null; }   // 짓던 갈매미는 그만
    this.grid.release(id); this.buildings.delete(id); this.emit("buildingRemoved", b);
    return true;
  }
  buildingAt(x, z) { const c = this.grid.get(x, z); return c && c.occupiedId ? this.buildings.get(c.occupiedId) || null : null; }

  // ---- 갈매미 들어 옮기기(드래그). 건물 안에 있는 갈매미는 보이지 않으므로 들 수 없다.
  pickUpUnit(u) {
    if (!u || u.insideBuildingId || u.state === UnitState.Held) return false;
    uncommit(u, this); setIdle(u, this.rnd, this);                          // 하던 일(찜한 나무·낚시 자리·맡은 공사)을 내려놓음
    u.heldFrom = { x: u.x, z: u.z, y: u.y }; u.state = UnitState.Held;
    return true;
  }
  /** 내려놓기. 완공된 건물이면 들어가고, 걸을 수 있는 칸이면 거기 서고, 아니면(바다·공사 중 등) 원래 자리로 돌아간다. */
  dropUnit(u, x, z) {
    if (!u || u.state !== UnitState.Held) return { ok: false, reason: "" };
    const b = this.grid.inBounds(x, z) ? this.buildingAt(x, z) : null, back = u.heldFrom; u.heldFrom = null;
    if (b && this.isDone(b)) { u.x = b.door.x + 0.5; u.z = b.door.z + 0.5; u.y = this.grid.walkHeight(b.door.x, b.door.z) ?? 0; enterBuilding(u, b, this.rnd); return { ok: true, building: b }; }
    if (!b && this.grid.isWalkable(x, z)) { u.x = x + 0.5; u.z = z + 0.5; u.y = this.grid.walkHeight(x, z); setIdle(u, this.rnd, this); return { ok: true }; }
    u.x = back.x; u.z = back.z; u.y = back.y; setIdle(u, this.rnd, this);
    return { ok: false, reason: b ? "아직 짓는 중인 건물이에요" : this.grid.isWater(x, z) ? "바다에는 내려놓을 수 없어요" : "거기에는 내려놓을 수 없어요" };
  }

  update(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) if ((this.timers[i].t -= dt) <= 0) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
    for (const u of this.units) updateUnit(u, dt, this, this.rnd);
    this.separate();
  }
  // 겹친 갈매미를 살짝 밀어냄. 밀린 자리가 걸을 수 없는 칸이면 밀지 않는다.
  separate() {
    const us = this.units.filter(u => !u.insideBuildingId && u.state !== UnitState.Held);
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
      const A = us[i], B = us[j], dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
      const ra = 0.16 * (A.scale || 1) + 0.08, rb = 0.16 * (B.scale || 1) + 0.08, min = ra + rb;
      if (d >= min || d < 1e-5) continue;
      const push = (min - d) / d, wa = rb / min, wb = ra / min;
      const move = (u, mx, mz) => { const nx = u.x + mx, nz = u.z + mz;
        if (this.grid.isWalkable(Math.floor(nx), Math.floor(nz))) { u.x = nx; u.z = nz; } };
      move(A, -dx * push * wa, -dz * push * wa); move(B, dx * push * wb, dz * push * wb);
    }
  }

  // ---- 저장/불러오기
  serialize() {
    return { version: 2, seed: this.seed ?? null, nextId: this.nextId, grid: this.grid.serialize(), modules: this.modules,
      spots: this.spots.map(({ x, z, dir }) => ({ x, z, dir })), zones: this.zones, res: this.res,
      buildings: [...this.buildings.values()].map(b => ({ id: b.id, defId: b.defId, x: b.x, z: b.z, rot: b.rot, hits: b.hits, interior: b.interior })) };
  }
  static fromJSON(j, rnd = Math.random) {
    if (!j || ![1, 2].includes(j.version)) throw new Error("저장 형식이 달라요");
    const w = new World(Grid.fromJSON(j.grid), j.modules, rnd, j);
    w.seed = j.seed; if (j.res) Object.assign(w.res, j.res);
    for (const s of j.buildings) { const r = w.placeBuilding(s.defId, s.x, s.z, s.rot, s.id, s.hits ?? 1e9); if (r.ok) { r.building.interior = s.interior; r.building.hits = Math.min(r.building.hits, r.building.need); } }
    w.spawnUnits(); for (let i = 0; i < 14; i++) w.addSeed(); w.nextId = j.nextId; return w;
  }
}
