// 월드 상태를 따라 그리는 뷰: 건물, 해안 모듈, 유닛. 월드는 그림을 모르고, 뷰가 이벤트와 매 프레임 상태를 읽는다.
import * as THREE from "three";
import { toWorldX, toWorldZ, WATER_Y } from "../config.js";
import { BUILDINGS, MODULES } from "../data/catalog.js";
import { stairCount } from "../world/World.js";
import { modelFor, rawModel } from "./assets.js";
import { buildingPlaceholder, modulePlaceholder, unitPlaceholder } from "./placeholders.js";
import { tintRoofs } from "./roofTint.js";
import { terrainHeight } from "../world/terrain.js";

export class BuildingViews {
  constructor(scene, world, overlay) {
    this.scene = scene; this.views = new Map(); this.overlay = overlay; this.economy = () => world.economy;
    world.on("buildingAdded", b => this.add(b));
    world.on("buildingRemoved", b => this.remove(b.id));
    this.ready = Promise.allSettled([...world.buildings.values()].map(b => this.add(b)));   // 처음 있던 건물들을 다 그렸을 때
  }
  async add(b) {
    const def = BUILDINGS[b.defId], holder = new THREE.Group();
    holder.position.set(toWorldX(b.x + (b.rot % 2 ? def.footprint.d : def.footprint.w) / 2), b.elevation ?? 0,
                        toWorldZ(b.z + (b.rot % 2 ? def.footprint.w : def.footprint.d) / 2));
    holder.rotation.y = b.rot * Math.PI / 2; holder.userData.buildingId = b.id;
    const badge = document.createElement("div"); badge.className = "badge"; badge.hidden = true; this.overlay.appendChild(badge);
    const v = { holder, badge, building: b, height: def.height + 0.4 }; this.views.set(b.id, v); this.scene.add(holder);
    const model = def.stairs ? await stairsProp(def, b.ramp) : def.field ? await fieldProp(def) : def.dock ? dockModel() : def.bridge ? bridgeModel() : def.pier ? pierModel() : await modelFor(def, () => buildingPlaceholder(def));
    if (this.views.get(b.id) !== v) return;                                       // 불러오는 사이 철거됐으면 버림
    if (def.asset) { tintRoofs(model, def.roof); model.rotation.y = def.modelYaw ?? 0; }   // 지붕 초록 → 테라코타·하늘색, 정문을 +z로
    holder.add(model); v.model = model; v.baseY = model.scale.y;
    v.height = new THREE.Box3().setFromObject(model).max.y + 0.35;                // 🐦 표시는 실제 지붕 위에
  }
  /** 공사 중인 건물은 진행만큼 아래에서부터 솟아오르고, 반투명한 비계 상자가 둘러싼다. */
  updateConstruction(dt) {
    for (const v of this.views.values()) {
      const b = v.building, p = Math.min(1, b.hits / b.need);
      if (!v.model) continue;
      v.shown = v.shown ?? p; v.shown += (p - v.shown) * Math.min(1, dt * 4);
      v.model.scale.y = v.baseY * Math.max(0.04, 0.08 + 0.92 * v.shown);
      if (p < 1 && !v.scaffold) {
        const def = BUILDINGS[b.defId], box = new THREE.Box3().setFromObject(v.model), size = box.getSize(new THREE.Vector3());
        v.scaffold = new THREE.Mesh(new THREE.BoxGeometry(def.footprint.w * 0.95, Math.max(0.6, v.height - 0.3), def.footprint.d * 0.95),
          new THREE.MeshBasicMaterial({ color: 0xc8955a, wireframe: true, transparent: true, opacity: 0.55 }));
        v.scaffold.position.y = Math.max(0.6, v.height - 0.3) / 2; v.holder.add(v.scaffold); void size;
      }
      if (v.scaffold) v.scaffold.visible = p < 1;
    }
  }
  remove(id) { const v = this.views.get(id); if (!v) return; this.scene.remove(v.holder); v.badge.remove(); this.views.delete(id); }
  setHighlight(id) {                                                              // 철거 도구가 가리키는 건물을 붉게
    for (const [bid, v] of this.views) v.holder.traverse(o => { if (o.isMesh) {
      if (!o.userData.baseMat) o.userData.baseMat = o.material;
      o.material = bid === id ? (o.userData.redMat ||= Object.assign(o.userData.baseMat.clone(), { emissive: new THREE.Color(0xd9433a), emissiveIntensity: 0.55,
        onBeforeCompile: o.userData.baseMat.onBeforeCompile, customProgramCacheKey: o.userData.baseMat.customProgramCacheKey })) : o.userData.baseMat;   // 지붕 색 셰이더도 그대로
    } });
  }
  // 건물 위 표시: 안에 있는 갈매미 수(건물 밖에서도 안의 상태가 유지됨을 보여 줌)
  updateBadges(camera, w, h, tmp = new THREE.Vector3()) {
    for (const v of this.views.values()) {
      const b = v.building, n = b.occupants.length, building = b.hits < b.need, def = BUILDINGS[b.defId];
      const forSale = !building && def.house && !b.owner && this.economy?.();         // 다 지었는데 주인이 없는 집 = 시장 매물
      v.badge.hidden = n === 0 && !building && !forSale; if (v.badge.hidden) continue;
      tmp.set(v.holder.position.x, v.holder.position.y + v.height, v.holder.position.z).project(camera);
      v.badge.textContent = building ? `🔨 ${Math.round(b.hits / b.need * 100)}%` : n ? `🐦 ${n}` : `🪧 🪙${def.price}`; v.badge.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`; v.badge.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`;
      if (tmp.z > 1) v.badge.hidden = true;
    }
  }
}

/** 계단 모델: 문 쪽(+z)이 입구, -z로 올라감. 디딤판 높이는 World.stairStep과 같은 식. 바닥에서부터 꽉 찬 돌계단. */
const STONE = new THREE.MeshStandardMaterial({ color: 0xcfc6b6, roughness: 0.9 }), STONE2 = new THREE.MeshStandardMaterial({ color: 0xbdb3a2, roughness: 0.9 });
function stairsModel(r) {
  const g = new THREE.Group(); if (!r) return g;
  const n = stairCount(r), H = r.h1 - r.h0;
  for (let i = 0; i < n; i++) {
    const top = H * (i + 1) / n, depth = 1 / n, m = new THREE.Mesh(new THREE.BoxGeometry(0.96, top + 0.02, depth + 0.002), i % 2 ? STONE2 : STONE);
    m.position.set(0, (top - 0.02) / 2, 0.5 - (i + 0.5) * depth); m.castShadow = m.receiveShadow = true; g.add(m);
  }
  return g;
}

/** 돌계단 모델(사용자 제공): 모델은 −x 쪽이 높음 → −z(올라가는 쪽)로 돌리고 1칸·계단 높이에 맞춤. 못 받으면 상자 계단 */
async function stairsProp(def, r) {
  if (!def.prop || !r) return stairsModel(r);
  try {
    const m = await rawModel(def.prop), g = new THREE.Group(), H = Math.max(0.15, r.h1 - r.h0);
    m.scale.set(1 / 0.86, H / 0.615, 1 / 0.98); m.rotation.y = -Math.PI / 2; g.add(m); return g;
  } catch { return stairsModel(r); }
}
/** 밭: 칸마다 나무 밭 틀(사용자 제공). 못 받으면 울타리 */
async function fieldProp(def) {
  if (!def.prop) return fieldModel(def);
  try {
    const src = await rawModel(def.prop), g = new THREE.Group(), W = def.footprint.w, D = def.footprint.d;
    for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) { const t = i === 0 && j === 0 ? src : src.clone(true); t.scale.set(1 / 0.9, 1.2, 1 / 0.98); t.position.set(i + 0.5 - W / 2, 0, j + 0.5 - D / 2); g.add(t); }
    return g;
  } catch { return fieldModel(def); }
}
/** 밭: 낮은 나무 울타리 테두리(땅은 흙, 작물은 life.js) */
const FENCE = new THREE.MeshStandardMaterial({ color: 0xa0784e, roughness: 0.9 });
function fieldModel(def) {
  const g = new THREE.Group(), W = def.footprint.w, D = def.footprint.d, h = 0.18;
  for (const [w, d, x, z] of [[W, 0.06, 0, -D / 2], [W, 0.06, 0, D / 2], [0.06, D, -W / 2, 0], [0.06, D, W / 2, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), FENCE); m.position.set(x, h / 2, z); m.castShadow = true; g.add(m);
  }
  return g;
}
/** 낚시터: 물 쪽(-z, 문 반대)으로 뻗은 나무 데크와 기둥 */
const PLANK = new THREE.MeshStandardMaterial({ color: 0xc8955a, roughness: 0.85 }), POST = new THREE.MeshStandardMaterial({ color: 0x7d5634, roughness: 0.9 });
function dockModel() {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 1.9), PLANK); deck.position.set(0, 0.06, -0.45); deck.castShadow = deck.receiveShadow = true; g.add(deck);
  for (const [x, z] of [[-0.4, -1.3], [0.4, -1.3], [-0.4, -0.5], [0.4, -0.5]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), POST); p.position.set(x, -0.45, z); g.add(p); }
  return g;
}

/** 다리 한 칸: 판자 + 물속 기둥 */
function bridgeModel() {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 1.0), PLANK); deck.position.y = -0.03; deck.castShadow = deck.receiveShadow = true; g.add(deck);
  for (const x of [-0.45, 0.45]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), POST); p.position.set(x, -0.6, 0); g.add(p); const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.06), POST); r.position.set(x, 0.14, 0); g.add(r); }
  return g;
}
/** 배(선착장에 묶인 배 · 배 타는 갈매미 밑) */
export function boatModel() {
  const g = new THREE.Group(), hull = new THREE.MeshStandardMaterial({ color: 0x9a6b45, roughness: 0.8 }), rim = new THREE.MeshStandardMaterial({ color: 0xe9dcc4, roughness: 0.8 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 1.35), hull); b.position.y = 0.05; b.castShadow = true; g.add(b);
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.375, 0.22, 4, 1), hull); bow.rotation.set(Math.PI / 2, Math.PI / 4, 0); bow.scale.set(1, 1, 0.6); bow.position.set(0, 0.05, 0.8); g.add(bow);
  for (const x of [-0.39, 0.39]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 1.35), rim); s.position.set(x, 0.18, 0); g.add(s); }
  return g;
}
/** 선착장: 낚시터 같은 판자 + 끝에 묶인 배 */
function pierModel() { const g = dockModel(), boat = boatModel(); boat.position.set(0.55, -0.2, -1.5); boat.rotation.y = 0.15; g.add(boat); return g; }

export async function addModuleViews(scene, world) {
  const map = new Map();
  await Promise.all(world.modules.map(async m => {
    const def = MODULES[m.defId], cellsWorld = m.cells.map(([x, z]) => [toWorldX(x + 0.5), toWorldZ(z + 0.5)]);
    const asset = def.assets ? def.assets[(m.variant ?? 0) % def.assets.length] : def.asset;
    if (!asset) { const obj = modulePlaceholder(m.defId, cellsWorld, m.rot); obj.name = m.id; scene.add(obj); return; }
    // 모델 하나짜리(1칸) 모듈: 칸 가운데, 그 칸 높이에 둔다
    const [x, z] = m.cells[0], obj = await modelFor({ footprint: { w: def.viewSize ?? 1, d: def.viewSize ?? 1 } }, () => modulePlaceholder(m.defId, [[0, 0]], 0), asset);
    obj.position.set(cellsWorld[0][0], terrainHeight(world.grid, x + 0.5, z + 0.5), cellsWorld[0][1]); obj.rotation.y = m.rot * Math.PI / 2;
    obj.name = m.id; scene.add(obj); map.set(m.id, obj);
  }));
  return map;
}

const BLOB_GEO = new THREE.CircleGeometry(1, 20);
const WAKE_GEO = new THREE.RingGeometry(0.86, 1, 28);
const WAKE_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: 0x1d2b14, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), sphere = new THREE.Sphere();

export class UnitViews {
  /** pool: 이름 → 갈매미 모델(불러오는 중 화면에서 미리 받아 둔 것, Promise<Map>). 없으면 캡슐. */
  constructor(scene, world, pool = null) {
    this.world = world; this.chars = []; this.scene = scene; this.pool = pool; this.views = [];
    for (const u of world.units) this.add(u);
    world.on("unitAdded", u => this.add(u));                                     // 🥚 소환
  }
  add(u) {
    const scene = this.scene;
      const g = new THREE.Group(), cap = unitPlaceholder(u.scale || 1); g.add(cap); g.userData.unitId = u.unitId; scene.add(g);
      // 누르기용 보이지 않는 원기둥(작은 갈매미도 누르기 쉽게 최소 크기를 둠). 크기는 sync에서 몸에 맞춤.
      const pick = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ visible: false }));
      pick.userData.unitId = u.unitId; g.add(pick);
      cap.traverse(o => { if (o.isMesh) o.castShadow = false; });
      // 발밑 둥근 그림자(가벼움)
      const blob = new THREE.Mesh(BLOB_GEO, BLOB_MAT); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.renderOrder = 1;
      blob.scale.setScalar(0.32 * (u.scale || 1) + 0.08); g.add(blob);
      const v = { g, cap, ch: null, pick, blob }; this.views.push(v);
    this.pool?.then(map => {                                                       // 모델을 붙임(새 섬에서도 같은 모델을 다시 씀)
      const ch = map.get(u.name); if (!ch || !this.views.includes(v)) return;
      ch.root.parent?.remove(ch.root); v.g.remove(v.cap); v.g.add(ch.root); v.ch = ch;
      ch.anim = ""; ch.onceRef = null; for (const t of Object.values(ch.inHand)) t.visible = false;
      ch.root.rotation.set(0, 0, 0); ch.root.position.set(0, 0, 0);
      v.castOn = undefined;                                                         // 그림자는 거리 보고 sync에서 정함
    });
    return v;
  }
  /** 그래픽 설정: 카메라에서 이 거리(m) 안의 갈매미만 실제 그림자, 그 밖은 발밑 원판(0이면 모두 원판) */
  setShadowDist(d) { this.shadowDist = d; for (const v of this.views) v.castOn = undefined; }
  /** 헤엄: 몸이 물 위에서 출렁이고 좌우로 살짝 기울며 앞으로 숙임, 발밑 그림자 대신 물결 고리 두 개가 퍼짐. */
  swimLook(v, u, i, dt, time) {
    const sw = !!u.swimming && !u.insideBuildingId, body = v.ch ? v.ch.root : v.cap, s = u.scale || 1;
    v.swimK = THREE.MathUtils.clamp((v.swimK || 0) + (sw ? dt : -dt) * 2.5, 0, 1);       // 들어가고 나올 때 부드럽게
    const k = v.swimK;
    v.blob.visible = !v.castOn && k < 0.5;                                           // 실제 그림자를 안 드리우는 갈매미(멀거나 설정)는 발밑 원판
    if (body && v.ch?.humanSwim) {                                                       // 사람형: 몸을 앞으로 눕혀 엎드린 자세(자유형), 등이 물 위로 살짝
      const lean = 1.15, h = u.height ?? 0.8 * s;
      body.rotation.x = lean * k; body.rotation.z = 0;
      body.position.z = -Math.sin(lean) * 0.5 * h * k;                                   // 눕히면 몸이 앞으로 가므로 제자리에 오게
      body.position.y = (0.35 * h - 0.5 * h * Math.cos(lean)) * k + Math.sin(time * 3.9 + i) * 0.012 * s * k;
    } else if (body) { body.rotation.x = 0.14 * k; body.rotation.z = Math.sin(time * 1.7 + i) * 0.07 * k; body.position.y = Math.sin(time * 2.4 + i * 1.3) * 0.025 * s * k; body.position.z = 0; }
    if (!v.wake && k > 0) {
      v.wake = [0, 1].map(() => { const m = new THREE.Mesh(WAKE_GEO, WAKE_MAT.clone()); m.rotation.x = -Math.PI / 2; m.renderOrder = 2; v.g.add(m); return m; });
    }
    if (v.wake) v.wake.forEach((m, j) => {
      m.visible = k > 0.05; if (!m.visible) return;
      const ph = ((time * 0.6 + j * 0.5 + i * 0.13) % 1);                                   // 0→1 커지며 옅어짐
      m.position.y = WATER_Y + 0.012 - u.y; m.scale.setScalar((0.25 + ph * 0.55) * (0.6 + 0.4 * s));
      m.material.opacity = 0.55 * (1 - ph) * k;
    });
  }
  /** 매 프레임: 위치·방향, 동작(AI가 정한 u.anim, 아니면 걷기·달리기·서 있기), 손의 도구, 낚싯줄과 찌. */
  sync(dt, playAnim, walkScale = 2.2, runScale = 1.5, speedBoost = 1, time = 0, camera = null) {
    if (camera) { projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projView); }
    this.frameNo = (this.frameNo || 0) + 1;
    this.world.units.forEach((u, i) => {
      const v = this.views[i]; if (!v) return;                                     // 막 소환돼 아직 모습이 안 만들어진 갈매미
      const { g, cap, ch, pick } = v; g.visible = !u.insideBuildingId;
      const h = Math.max(0.6, u.height ?? 0.8 * (u.scale || 1)), r = Math.max(0.32, 0.28 * (u.scale || 1)); pick.scale.set(r, h, r);
      g.position.set(toWorldX(u.x), u.y, toWorldZ(u.z));
      if (v.ch && camera && (v.castOn === undefined || (this.frameNo + i) % 15 === 0)) {   // 가까운 갈매미만 실제 그림자(15프레임마다 확인)
        const want = (this.shadowDist ?? 999) > 0 && camera.position.distanceTo(g.position) < (this.shadowDist ?? 999);
        if (v.castOn !== want) { v.castOn = want; v.ch.root.traverse(o => { if (o.isMesh) o.castShadow = want; }); }
      }
      this.swimLook(v, u, i, dt, time);
      if (u.sailing) { if (!v.boat) { v.boat = boatModel(); v.g.add(v.boat); } v.boat.visible = true; v.boat.position.y = -0.12 + Math.sin(time * 2 + i) * 0.02; }   // 배 타는 중: 밑에 배
      else if (v.boat) v.boat.visible = false;
      let d = u.heading - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, dt * 10);   // 몸 돌리기 부드럽게
      const walking = !!u.path && u.pathIndex < u.path.length && u.state !== "Held";
      if (ch) {
        if (ch.clip && u.clip !== ch.clip) u.clip = ch.clip;                                       // 실제 동작 길이를 AI에 알려 줌
        const restart = !!u.once && ch.onceRef !== u.once; if (u.once) ch.onceRef = u.once;      // 같은 한 번 동작을 다시 시작
        const workSpeed = ["Chop", "Mine", "Build"].includes(u.anim) ? (u.eff ?? 1) : 1;            // 일 동작은 능률만큼 빠르게/느리게
        if (!(u.anim && playAnim(ch, u.anim, workSpeed, 0.12, restart))) {
          if (!walking) playAnim(ch, "Idle", 1); else if (u.running) playAnim(ch, "Run", runScale * speedBoost); else playAnim(ch, "Walk", walkScale * speedBoost);
        }
        for (const [k, t] of Object.entries(ch.inHand)) t.visible = u.tool === k;
        // 애니메이션 계산: 화면 밖이면 건너뛰고, 멀면 두 프레임에 한 번(시간은 모아서)
        sphere.center.copy(g.position); sphere.radius = 1.5 * (u.scale || 1);
        const onScreen = !camera || frustum.intersectsSphere(sphere), far = camera && camera.position.distanceTo(g.position) > 28;
        v.animDt = (v.animDt || 0) + dt;
        if (g.visible && onScreen && (!far || (this.frameNo + i) % 2 === 0)) { ch.mixer.update(v.animDt); v.animDt = 0; }
        else if (v.animDt > 0.5) v.animDt = 0.5;
      } else {
        cap.position.y = walking ? Math.abs(Math.sin(performance.now() / 110 + i)) * 0.05 : 0;   // 캡슐: 걸을 때 콩콩
      }
      // 낚싯줄: 낚싯대 끝 → 찌
      if (!v.line) {
        v.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff }));
        v.bob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe0402b }));
        this.scene.add(v.line, v.bob);
      }
      const fishing = !!u.fishing && g.visible; v.line.visible = v.bob.visible = fishing;
      if (fishing) {
        v.bob.position.set(toWorldX(u.fishing.x), -0.16 + Math.sin(time * 5 + i) * 0.01, toWorldZ(u.fishing.z));
        const tip = ch?.inHand.rod?.getObjectByName("tip"), from = new THREE.Vector3();
        if (tip) tip.getWorldPosition(from); else from.set(g.position.x, g.position.y + h * 0.7, g.position.z);
        v.line.geometry.setFromPoints([from, v.bob.position.clone()]);
      }
    });
  }
}
