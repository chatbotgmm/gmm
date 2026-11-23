// 섬 전체 상태: 격자, 해안 모듈, 자원(나무·광석·씨앗·낚시 자리), 건물, 유닛.
// 그림과 입력은 모르고, 바뀐 일을 이벤트(on/emit)로 알린다. 뷰가 이벤트와 매 프레임 상태를 읽어 그린다.
import { BUILDINGS, MODULES, UNITS, RARITY, FISH, ITEMS, PRICES } from "../data/catalog.js";
import * as J from "./jobs.js";
import { createBuildingData, createUnitAIState, UnitState } from "../data/types.js";
import { Grid } from "./Grid.js";
import { generateIsland } from "./islandGen.js";
import { checkPlacement } from "./placement.js";
import { terrainHeight } from "./terrain.js";
import { nearestWalkable } from "./pathfinding.js";
import { updateUnit, exitBuilding, enterBuilding, setIdle, emote, uncommit } from "../units/unitBrain.js";
import { initMind } from "../units/mind.js";
import { seededRandom } from "../util.js";

export const SPEED_BOOST = 1.6;        // 섬은 마을보다 넓어서 걷기·달리기를 이만큼 빠르게(애니메이션도 같은 배율로 빨라짐)
const START_WOOD = 6, START_STONE = 6;

export class World {
  constructor(grid, modules, rnd = Math.random, extra = {}) {
    this.grid = grid; this.modules = modules; this.rnd = rnd; this.time = 0;
    this.buildings = new Map(); this.units = []; this.nextId = 1; this.listeners = {}; this.timers = [];
    // 자원: 나무·돌·철(자재), 음식(물고기·작물), 조개(돈). treasures: 팔 수 있는 희귀 물고기, collection: 도감(종류별로 잡은 수), items: 가방
    this.res = { wood: START_WOOD, stone: START_STONE, iron: 0, food: 10, coins: 0, fish: 0, eaten: 0 };
    this.treasures = {}; this.collection = {}; this.items = {};
    this.instantBuild = false;                         // true면 건물을 놓자마자 완공(갈매미 공사 없음)
    this.animateShape = false; this.shaping = new Map(); // 높이 바꾸기를 스르르(화면에서만 켬)
    this.spots = (extra.spots || []).map(s => ({ ...s, claimed: null }));
    this.zones = extra.zones || [];
    this.plots = (extra.plots || []).map(p => ({ x: p.x, z: p.z, stage: p.stage || "empty", t: p.t || 0, grow: p.grow || 40, claimed: null }));
    this.stall = extra.stall || null;
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
  /** 근처 갈매미들이 알아차릴 일(호기심): kind = building | tree | fish | drop | site */
  notice(x, z, kind, src = null) {
    const chance = { building: 0.7, tree: 0.35, fish: 0.6, drop: 0.7, site: 0.5 }[kind] ?? 0.4;
    for (const u of this.units) if (u !== src && !u.insideBuildingId && Math.hypot(u.x - x, u.z - z) < 9 && this.rnd() < chance) u.curious = { x, z, kind };
  }

  spawnUnits() {
    const r = seededRandom(99);
    UNITS.forEach((u, i) => {
      const a = i / UNITS.length * Math.PI * 2, spot = nearestWalkable(this.grid, Math.floor(32 + Math.cos(a) * 5), Math.floor(32 + Math.sin(a) * 5));
      const s = createUnitAIState(`u${i + 1}`, u.name, spot[0] + 0.5, spot[1] + 0.5, 0.5 + r() * 2); s.scale = u.scale;
      J.assignJob(s); s.full = 55 + r() * 35; initMind(s, r);                // 직업·희귀도, 처음 포만감, 욕구·취향·친구
      this.units.push(s);
    });
  }

  /** 모델 정보(web/village/models/chars.json)로 몸 크기와 걷기·달리기 속도(칸/초)를 맞춘다. */
  applyCharacterProfiles(chars, walkScale, runScale) {
    this.units.forEach((u, i) => { const c = chars[i % chars.length]; if (!c) return;
      u.name = c.name; u.scale = c.scale; u.height = c.height * c.scale; J.assignJob(u);
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
  eatSeed(s, u = null) {
    const i = this.seeds.indexOf(s); if (i < 0) return false;
    if (u) u.full = Math.min(J.FULL_MAX, (u.full ?? 80) + 12);
    this.seeds.splice(i, 1); this.res.eaten++; this.emit("seedRemoved", s); this.after(2 + this.rnd() * 4, () => this.addSeed());
    return true;
  }

  // ---- 밥: 음식 1을 먹으면 포만감 +35(음식이 넉넉하면 배가 덜 고파도 먹어서 너무 부를 수 있음)
  eatFood(u) {
    if (this.res.food < 1) return false;
    this.res.food--; u.full = Math.min(J.FULL_MAX, (u.full ?? 80) + 35); this.emit("ate", u); return true;
  }
  avgFull() { return this.units.reduce((a, u) => a + (u.full ?? 80), 0) / Math.max(1, this.units.length); }

  // ---- 벌목·채광(나무꾼은 도끼질이 세서 덜 하고 많이 얻음, 광부는 돌을 많이 얻고 철이 잘 나옴)
  hitTree(t, who) {
    if (!t.alive) return;
    t.hp -= who ? 3 / J.chopsNeeded(who) : 1; this.emit("treeHit", t);
    if (t.hp > 1e-6) return;
    t.alive = false; const got = who ? J.woodYield(who) : 2; this.res.wood += got; t.lastYield = got;
    this.emit("treeFell", { tree: t, dir: [t.x + 0.5 - who.x, t.z + 0.5 - who.z] }); this.notice(t.x + 0.5, t.z + 0.5, "tree", who);
    this.after(25 + this.rnd() * 15, () => { t.alive = true; t.hp = 3; this.emit("treeGrow", t); });
  }
  hitOre(o, who = null) {
    if (!o.alive) return;
    o.hp--; this.emit("oreHit", o);
    if (o.hp > 0) return;
    o.alive = false; const got = who ? J.stoneYield(who) : 2; this.res.stone += got; o.lastYield = got;
    o.lastIron = who && this.rnd() < J.ironChance(who) ? 1 : 0; this.res.iron += o.lastIron;
    this.emit("oreBroke", o);
    this.after(20 + this.rnd() * 12, () => { o.alive = true; o.hp = 3; this.emit("oreGrow", o); });
  }
  /** 낚시 결과: 못 낚음 / 물고기(흔하면 음식, 희귀 이상이면 보물) + 가끔 물건. 도감에 기록. */
  catchFish(u) {
    if (this.rnd() >= J.catchChance(u)) return null;
    const f = J.rollFish(u, this.rnd); this.res.fish++;
    this.collection[f.id] = (this.collection[f.id] || 0) + 1;
    if (f.rarity === "common") this.res.food += f.food; else this.treasures[f.id] = (this.treasures[f.id] || 0) + 1;
    let item = null;
    if (this.rnd() < J.itemChance(u)) { item = J.rollItem(u, this.rnd); this.items[item.id] = (this.items[item.id] || 0) + 1; }
    this.emit("fish", { u, fish: f, item }); if (f.rarity !== "common" || item) this.notice(u.x, u.z, "fish", u);
    return { fish: f, item };
  }

  // ---- 시장(상인만): 남는 자재·음식·보물·물건을 팔고, 공사에 모자란 나무·돌·철을 사 온다. 상인 희귀도만큼 비싸게 팔고 싸게 산다.
  trade(u) {
    const m = J.skillMult(u, "trade"), r = this.res, log = { sold: 0, bought: 0 };
    const sell = (key, keep) => { const n = Math.max(0, r[key] - keep); if (!n) return; r[key] -= n; const c = Math.round(n * PRICES[key] * m); r.coins += c; log.sold += c; };
    sell("wood", 20); sell("stone", 20); sell("iron", 10); sell("food", 30);
    for (const [id, n] of Object.entries(this.treasures)) { const f = FISH.find(f => f.id === id); if (!n || !f) continue; const c = Math.round(n * f.price * m); r.coins += c; log.sold += c; this.treasures[id] = 0; }
    for (const [id, n] of Object.entries(this.items)) { const it = ITEMS.find(i => i.id === id); if (!n || !it || it.furniture) continue; const c = Math.round(n * it.price * m); r.coins += c; log.sold += c; this.items[id] = 0; }   // 가구는 팔지 않고 모음
    const building = [...this.buildings.values()].filter(b => !this.isDone(b));
    const buy = (key, want) => { while (r[key] < want) { const cost = Math.max(1, Math.round(PRICES[key] * 2 / m)); if (r.coins < cost) break; r.coins -= cost; r[key]++; log.bought += cost; } };
    if (building.length) { buy("wood", 4); buy("stone", 4); if (building.some(b => (BUILDINGS[b.defId].tier || 1) >= 3)) buy("iron", 2); }
    if (this.avgFull() < J.HUNGRY + 10) buy("food", 6);
    this.emit("trade", { u, ...log }); return log;
  }

  // ---- 밭(농부만): 빈 밭에 심고, 다 자라면 거둬 음식이 됨
  farmPlot(p, u) {
    if (p.stage === "empty") { p.stage = "growing"; p.grow = J.growSeconds(u); p.t = p.grow; this.emit("plot", p); return "plant"; }
    if (p.stage === "ripe") { const n = J.harvestYield(u); this.res.food += n; p.stage = "empty"; p.t = 0; p.lastYield = n; this.emit("plot", p); return "harvest"; }
    return null;
  }
  /** 격자 좌표(연속)에 서는 높이: 부두처럼 걸을 수 있는 시설 위면 그 높이, 아니면 보이는 땅 높이(경사면 포함). */
  standHeight(gx, gz) {
    const x = Math.floor(gx), z = Math.floor(gz), c = this.grid.get(x, z), o = c?.occupiedId && this.grid.occupants.get(c.occupiedId);
    return o && o.walkable ? o.surface : terrainHeight(this.grid, gx, gz);
  }
  isPlot(x, z) { return this.plots.some(p => p.x === x && p.z === z); }

  /** 이 등급의 건물을 지을 수 있는 건축가가 있나(1등급은 누구나). */
  builderFor(def) { return this.units.find(u => J.canBuild(u, def)) || null; }

  // ---- 바닥 칠하기(지시서 3-B): 땅 칸이고 건물·시설이 없을 때만
  canPaint(x, z) { const c = this.grid.get(x, z); return !!c && !this.grid.isWater(x, z) && !c.occupiedId && !this.isPlot(x, z); }
  paint(x, z, type) { if (!this.canPaint(x, z)) return false; const ok = this.grid.setGround(x, z, type); if (ok) this.emit("ground", { x, z, type }); return ok; }

  // ---- 높이(층·경사·계단·연못): 한 단 = MAX_STEP(0.25 m). 한 단 차이는 걸어 다니는 경사, 두 단 이상은 절벽.
  //      돌길·데크가 깔린 경사는 계단으로 그려짐. 바다 높이 아래로 파면 물이 차서 연못이 됨.
  canReshape(x, z) { const c = this.grid.get(x, z); return !!c && !c.occupiedId && !this.isPlot(x, z) && !this.grid.doorOwner(x, z); }
  /**
   * op: "raise" | "lower" | "flatten"(target 높이로) | "smooth"(이웃과 비슷하게). amount(0~1): 부드러운 붓의 세기(가운데 1, 가장자리로 갈수록 작게).
   * animateShape가 켜져 있으면 높이가 0.2초쯤에 걸쳐 스르르 바뀐다(update). 바뀌면 true.
   */
  reshape(x, z, op, target = 0, amount = 1) {
    if (!this.canReshape(x, z) || amount <= 0) return false;
    const c = this.grid.get(x, z), idx = this.grid.index(x, z), step = 0.25;
    const cur = this.shaping.get(idx)?.target ?? c.elevation;
    let e = cur;
    if (op === "raise") e = cur + step * amount;
    else if (op === "lower") e = cur - step * amount;
    else if (op === "flatten") e = cur + (target - cur) * amount;
    else if (op === "smooth") {
      let sum = 0, n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const o = this.grid.get(x + dx, z + dz); if (o && (dx || dz)) { sum += this.shaping.get(this.grid.index(x + dx, z + dz))?.target ?? o.elevation; n++; } }
      if (n) e = cur + (sum / n - cur) * 0.6 * amount;
    }
    e = Math.max(-1, Math.min(2, Math.round(e * 100) / 100));
    if (op === "raise" && cur < 0 && cur > -step && e > 0 && amount >= 0.99) e = 0;      // 모래사장 비탈(-0.15 등)은 0으로 맞춤
    if (Math.abs(e - cur) < 0.005) return false;
    if (this.animateShape) { this.shaping.set(idx, { x, z, target: e }); return true; }
    return this.applyHeight(x, z, e);
  }
  /** 높이를 실제로 바꾸고, 물에 잠긴 씨앗·갈매미를 정리. */
  applyHeight(x, z, e) {
    const c = this.grid.get(x, z), wasWater = this.grid.isWater(x, z);
    if (!this.grid.setElevation(x, z, e)) return false;
    if (wasWater && !this.grid.isWater(x, z) && c.groundType !== "Sand") c.groundType = "Sand";
    for (const s of [...this.seeds]) if (s.x === x && s.z === z && this.grid.isWater(x, z)) this.eatSeed(s);   // 물에 잠긴 씨앗은 없앰
    for (const u of this.units) if (!u.insideBuildingId && u.state !== UnitState.Held && Math.floor(u.x) === x && Math.floor(u.z) === z && !this.grid.isWalkable(x, z)) {
      const spot = nearestWalkable(this.grid, x, z); if (spot) { u.x = spot[0] + 0.5; u.z = spot[1] + 0.5; } setIdle(u, this.rnd, this);   // 물에 빠지면 가까운 땅으로
    }
    this.emit("ground", { x, z }); return true;
  }
  /** 스르르 바뀌는 중인 칸들을 목표 높이 쪽으로 옮김(초당 1.5 m). */
  stepShaping(dt) {
    for (const [idx, s] of this.shaping) {
      const c = this.grid.get(s.x, s.z), d = s.target - c.elevation, mv = Math.sign(d) * Math.min(Math.abs(d), 1.5 * dt);
      if (Math.abs(d) <= 1.5 * dt + 1e-6) { this.shaping.delete(idx); this.applyHeight(s.x, s.z, s.target); }
      else this.grid.setElevation(s.x, s.z, Math.round((c.elevation + mv) * 1000) / 1000);
    }
  }

  // ---- 건물(지시서 4-1). 놓으면 공사장이 되고, 갈매미가 나무 1·돌 1을 들고 와서 망치질 3번씩 해서 완공한다.
  check(defId, ax, az, rot) {
    const def = BUILDINGS[defId], r = checkPlacement(this.grid, def, ax, az, rot, this.units);
    if (!r.ok) return r;
    if (r.cells.some(([x, z]) => this.isPlot(x, z))) return { ...r, ok: false, reason: "밭에는 지을 수 없어요" };
    if (!this.builderFor(def)) return { ...r, ok: false, reason: `${RARITY[["", "common", "rare", "epic", "legend"][def.tier]].name} 이상 건축가가 있어야 지을 수 있어요` };
    return r;
  }
  placeBuilding(defId, ax, az, rot, id = null, hits = null) {
    const def = BUILDINGS[defId], r = hits !== null ? checkPlacement(this.grid, def, ax, az, rot, this.units) : this.check(defId, ax, az, rot);
    if (!r.ok) return { ok: false, reason: r.reason };
    const b = createBuildingData(id || `b${this.nextId++}`, def, ax, az, rot, r.cells, r.door);
    b.elevation = r.elevation; b.need = 3 * def.footprint.w * def.footprint.d; b.hits = hits ?? (this.instantBuild ? b.need : 0); b.busy = null;
    this.grid.occupy(b.cells, b.id, { kind: "building", walkable: false });   // 길찾기 장애물로 반영(grid.version 증가)
    this.grid.reserveDoor(b.door.x, b.door.z, b.id);
    this.buildings.set(b.id, b); this.emit("buildingAdded", b); if (hits === null) this.notice(b.door.x + 0.5, b.door.z + 0.5, "site");
    return { ok: true, building: b };
  }
  isDone(b) { return b.hits >= b.need; }
  hammer(b, u) {
    if (this.isDone(b)) return;
    b.hits = Math.min(b.need, b.hits + (u ? J.hammerPower(u) : 1));       // 건축가는 한 번에 배율만큼
    b.lastBuilder = u ? u.unitId : null; this.emit("buildingProgress", b);
    if (this.isDone(b)) { this.emit("buildingDone", b); if (u) emote(u, "🏠!"); this.notice(b.door.x + 0.5, b.door.z + 0.5, "building", u); }
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
    u.heldFrom = { x: u.x, z: u.z, y: u.y }; u.state = UnitState.Held; emote(u, "!?");
    return true;
  }
  /** 내려놓기. 완공된 건물이면 들어가고, 걸을 수 있는 칸이면 거기 서고, 아니면(바다·공사 중 등) 원래 자리로 돌아간다. */
  dropUnit(u, x, z) {
    if (!u || u.state !== UnitState.Held) return { ok: false, reason: "" };
    const b = this.grid.inBounds(x, z) ? this.buildingAt(x, z) : null, back = u.heldFrom; u.heldFrom = null;
    if (b && this.isDone(b)) { u.x = b.door.x + 0.5; u.z = b.door.z + 0.5; u.y = this.grid.walkHeight(b.door.x, b.door.z) ?? 0; enterBuilding(u, b, this.rnd); return { ok: true, building: b }; }
    if (!b && this.grid.isWalkable(x, z)) { u.x = x + 0.5; u.z = z + 0.5; u.y = this.standHeight(u.x, u.z); setIdle(u, this.rnd, this); emote(u, "휴…"); this.notice(u.x, u.z, "drop", u); return { ok: true }; }
    u.x = back.x; u.z = back.z; u.y = back.y; setIdle(u, this.rnd, this);
    return { ok: false, reason: b ? "아직 짓는 중인 건물이에요" : this.grid.isWater(x, z) ? "바다에는 내려놓을 수 없어요" : "거기에는 내려놓을 수 없어요" };
  }

  update(dt) {
    this.time += dt;
    if (this.shaping.size) this.stepShaping(dt);
    for (const p of this.plots) if (p.stage === "growing" && (p.t -= dt) <= 0) { p.stage = "ripe"; this.emit("plot", p); }
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
      treasures: this.treasures, collection: this.collection, items: this.items, stall: this.stall,
      plots: this.plots.map(({ x, z, stage, t, grow }) => ({ x, z, stage, t, grow })),
      buildings: [...this.buildings.values()].map(b => ({ id: b.id, defId: b.defId, x: b.x, z: b.z, rot: b.rot, hits: b.hits, interior: b.interior })) };
  }
  static fromJSON(j, rnd = Math.random) {
    if (!j || ![1, 2].includes(j.version)) throw new Error("저장 형식이 달라요");
    const w = new World(Grid.fromJSON(j.grid), j.modules, rnd, j);
    w.seed = j.seed; if (j.res) Object.assign(w.res, j.res);
    Object.assign(w.treasures, j.treasures || {}); Object.assign(w.collection, j.collection || {}); Object.assign(w.items, j.items || {});
    for (const s of j.buildings) { const r = w.placeBuilding(s.defId, s.x, s.z, s.rot, s.id, s.hits ?? 1e9); if (r.ok) { r.building.interior = s.interior; r.building.hits = Math.min(r.building.hits, r.building.need); } }
    w.spawnUnits(); for (let i = 0; i < 14; i++) w.addSeed(); w.nextId = j.nextId; return w;
  }
}
