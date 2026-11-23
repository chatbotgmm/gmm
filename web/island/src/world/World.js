// 섬 전체 상태: 격자, 해안 모듈, 건물, 유닛. 그림과 입력은 모르고, 바뀐 일을 이벤트로 알린다.
import { BUILDINGS, MODULES, UNITS } from "../data/catalog.js";
import { createBuildingData, createUnitAIState } from "../data/types.js";
import { Grid } from "./Grid.js";
import { generateIsland } from "./islandGen.js";
import { checkPlacement } from "./placement.js";
import { nearestWalkable } from "./pathfinding.js";
import { updateUnit, exitBuilding } from "../units/unitBrain.js";
import { seededRandom } from "../util.js";

export class World {
  constructor(grid, modules, rnd = Math.random) {
    this.grid = grid; this.modules = modules; this.rnd = rnd;
    this.buildings = new Map(); this.units = []; this.nextId = 1; this.listeners = {};
    for (const m of modules) { const def = MODULES[m.defId]; grid.occupy(m.cells, m.id, { kind: "module", walkable: def.walkable, surface: def.surface ?? 0 }); }
  }
  static create(seed = 7, rnd = Math.random) {
    const { grid, modules } = generateIsland(seed);
    const w = new World(grid, modules, rnd); w.seed = seed; w.spawnUnits(); return w;
  }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, arg) { for (const fn of this.listeners[ev] || []) fn(arg); }

  spawnUnits() {
    const r = seededRandom(99);
    UNITS.forEach((u, i) => {
      const a = i / UNITS.length * Math.PI * 2, spot = nearestWalkable(this.grid, Math.floor(32 + Math.cos(a) * 5), Math.floor(32 + Math.sin(a) * 5));
      const s = createUnitAIState(`u${i + 1}`, u.name, spot[0] + 0.5, spot[1] + 0.5, 0.5 + r() * 2); s.scale = u.scale;
      this.units.push(s);
    });
  }

  /** 모델 정보(web/village/models/chars.json)로 몸 크기와 걷기·달리기 속도(m/s = 칸/초)를 맞춘다. */
  applyCharacterProfiles(chars, walkScale, runScale) {
    this.units.forEach((u, i) => { const c = chars[i % chars.length]; if (!c) return;
      u.name = c.name; u.scale = c.scale; u.height = c.height * c.scale;
      u.walkSpeed = c.walk * walkScale * c.scale; u.runSpeed = c.run * runScale * c.scale; });
  }

  // ---- 바닥 칠하기(지시서 3-B): 땅 칸이고 건물·시설이 없을 때만
  canPaint(x, z) { const c = this.grid.get(x, z); return !!c && !this.grid.isWater(x, z) && !c.occupiedId; }
  paint(x, z, type) { if (!this.canPaint(x, z)) return false; const ok = this.grid.setGround(x, z, type); if (ok) this.emit("ground", { x, z, type }); return ok; }

  // ---- 건물(지시서 4-1)
  check(defId, ax, az, rot) { return checkPlacement(this.grid, BUILDINGS[defId], ax, az, rot, this.units); }
  placeBuilding(defId, ax, az, rot, id = null) {
    const def = BUILDINGS[defId], r = checkPlacement(this.grid, def, ax, az, rot, this.units);
    if (!r.ok) return { ok: false, reason: r.reason };
    const b = createBuildingData(id || `b${this.nextId++}`, def, ax, az, rot, r.cells, r.door);
    b.elevation = r.elevation;
    this.grid.occupy(b.cells, b.id, { kind: "building", walkable: false });   // 길찾기 장애물로 반영(grid.version 증가)
    this.grid.reserveDoor(b.door.x, b.door.z, b.id);
    this.buildings.set(b.id, b); this.emit("buildingAdded", b);
    return { ok: true, building: b };
  }
  removeBuilding(id) {
    const b = this.buildings.get(id); if (!b) return false;
    for (const u of this.units) if (u.insideBuildingId === id) exitBuilding(u, this, this.rnd);   // 안에 있던 갈매미는 문 앞으로
    this.grid.release(id); this.buildings.delete(id); this.emit("buildingRemoved", b);
    return true;
  }
  buildingAt(x, z) { const c = this.grid.get(x, z); return c && c.occupiedId ? this.buildings.get(c.occupiedId) || null : null; }

  update(dt) { for (const u of this.units) updateUnit(u, dt, this, this.rnd); }

  // ---- 저장/불러오기
  serialize() {
    return { version: 1, seed: this.seed ?? null, nextId: this.nextId, grid: this.grid.serialize(), modules: this.modules,
      buildings: [...this.buildings.values()].map(b => ({ id: b.id, defId: b.defId, x: b.x, z: b.z, rot: b.rot, interior: b.interior })) };
  }
  static fromJSON(j, rnd = Math.random) {
    if (!j || j.version !== 1) throw new Error("저장 형식이 달라요");
    const w = new World(Grid.fromJSON(j.grid), j.modules, rnd); w.seed = j.seed;
    for (const s of j.buildings) { const r = w.placeBuilding(s.defId, s.x, s.z, s.rot, s.id); if (r.ok) r.building.interior = s.interior; }
    w.spawnUnits(); w.nextId = j.nextId; return w;
  }
}
