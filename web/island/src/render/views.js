// 월드 상태를 따라 그리는 뷰: 건물, 해안 모듈, 유닛. 월드는 그림을 모르고, 뷰가 이벤트와 매 프레임 상태를 읽는다.
import * as THREE from "three";
import { toWorldX, toWorldZ, WATER_Y } from "../config.js";
import { BUILDINGS, MODULES } from "../data/catalog.js";
import { stairCount } from "../world/World.js";
import { modelFor, rawModel } from "./assets.js";
import { buildingPlaceholder, modulePlaceholder } from "./placeholders.js";
import { tintRoofs } from "./roofTint.js";
import { terrainHeight } from "../world/terrain.js";
import { poolFor } from "./instances.js";
import { placeEl, showEl, textEl } from "../util.js";
import { siteStepOf } from "../ui/bldView.js";
import { fountainWater } from "./fountain.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { instanceChar } from "./charInstance.js";
import { formOf } from "../world/evolve.js";

const _badgeP = new THREE.Vector3(), _badgeQ = new THREE.Vector3(), _lineP = new THREE.Vector3(), _tipP = new THREE.Vector3();
const SITE_NEAR = 34;                                                            // 공사장 배지 둘째 줄은 카메라에서 이 거리(m) 안에서만(전기 없음 배지와 같은 거리)

export class BuildingViews {
  constructor(scene, world, overlay) {
    this.scene = scene; this.world = world; this.views = new Map(); this.overlay = overlay; this.economy = () => world.economy;
    world.on("buildingAdded", b => this.add(b));
    world.on("buildingRemoved", b => this.remove(b.id));
    this.ready = Promise.allSettled([...world.buildings.values()].map(b => this.add(b)));   // 처음 있던 건물들을 다 그렸을 때
  }
  async add(b) {
    const def = BUILDINGS[b.defId], holder = new THREE.Group();
    holder.position.set(toWorldX(b.x + (b.rot % 2 ? def.footprint.d : def.footprint.w) / 2), b.elevation ?? 0,
                        toWorldZ(b.z + (b.rot % 2 ? def.footprint.w : def.footprint.d) / 2));
    holder.rotation.y = b.rot * Math.PI / 2; holder.userData.buildingId = b.id;
    const badge = document.createElement("div"); badge.className = "badge"; badge.hidden = true; badge.innerHTML = `<span class="b1"></span><span class="b2" hidden></span>`; this.overlay.appendChild(badge);
    badge.b1 = badge.firstChild; badge.b2 = badge.lastChild;                        // 첫 줄(🔨 40% · 🐦 2 · 🪧 🪙42) · 둘째 줄(공사장 준비 단계, 가까울 때만)
    const v = { holder, badge, building: b, height: def.height + 0.4 }; this.views.set(b.id, v); this.scene.add(holder);
    const model = await buildingModel(def, { ramp: b.ramp, season: this.world.season });
    if (this.views.get(b.id) !== v) return;                                       // 불러오는 사이 철거됐으면 버림
    holder.add(model); v.model = model; v.baseY = model.scale.y;
    if (def.field && def.prop) poolFor(this.scene).add(model);                      // 밭 틀(칸마다 같은 모델)은 묶어 그림
    if (def.id === "bench") {                                                       // 좌판 높이를 모델에서 직접 잼(앉을 때 엉덩이를 맞춤): 칸 가운데(앞쪽으로 0.12)에서 위→아래 광선
      holder.updateMatrixWorld(true); const o = new THREE.Vector3(0, 5, 0.2).applyMatrix4(holder.matrixWorld);
      const hit = new THREE.Raycaster(o, new THREE.Vector3(0, -1, 0)).intersectObject(model, true)[0]; if (hit) b.seatY = hit.point.y;
    }
    holder.updateWorldMatrix(true, false);                                          // 모델이 이미 받아져 있으면(불러오기·같은 건물 또 짓기) 아직 한 번도 안 그려져 holder의 월드 행렬이 비어 있음 → 먼저 맞춤
    const box = new THREE.Box3().setFromObject(model); v.height = box.max.y - holder.position.y + 0.35;   // 🐦 표시는 실제 지붕 위에(holder 기준 높이)
    if (def.asset) {                                                                // 밑동 그늘: 건물·소품이 땅에 떠 보이지 않게 둘레에 옅은 그늘 판(모두 묶어 그리기 1번, 그림자를 끈 설정에서도 보임)
      const g = v.ground = new THREE.Mesh(GROUND_GEO, groundShadeMat()); g.renderOrder = 1; g.userData.noToon = true;
      g.position.set((box.min.x + box.max.x) / 2, holder.position.y + 0.025, (box.min.z + box.max.z) / 2); g.scale.set((box.max.x - box.min.x) * 1.4, 1, (box.max.z - box.min.z) * 1.4);
      this.scene.add(g); poolFor(this.scene).add(g);
    }
  }
  /** 공사 중인 건물은 진행만큼 아래에서부터 솟아오르고, 반투명한 비계 상자가 둘러싼다. */
  updateConstruction(dt, focus = null) {
    this.animating = false;                                                         // 그림자가 바뀌는 중인지(솟아오르는 공사 · 보는 곳 근처의 풍차 날개) → main이 그림자 다시 그리기 간격을 정함
    for (const v of this.views.values()) {
      const b = v.building, p = Math.min(1, b.hits / b.need);
      if (!v.model) continue;
      v.shown = v.shown ?? p; if (Math.abs(p - v.shown) > 0.002) this.animating = true; v.shown += (p - v.shown) * Math.min(1, dt * 4);
      v.model.scale.y = v.baseY * Math.max(0.04, 0.08 + 0.92 * v.shown);
      if (p < 1 && !v.scaffold) {
        const def = BUILDINGS[b.defId], box = new THREE.Box3().setFromObject(v.model), size = box.getSize(new THREE.Vector3());
        v.scaffold = new THREE.Mesh(new THREE.BoxGeometry(def.footprint.w * 0.95, Math.max(0.6, v.height - 0.3), def.footprint.d * 0.95),
          new THREE.MeshBasicMaterial({ color: 0xc8955a, wireframe: true, transparent: true, opacity: 0.55 }));
        v.scaffold.position.y = Math.max(0.6, v.height - 0.3) / 2; v.holder.add(v.scaffold); void size;
      }
      if (v.scaffold) v.scaffold.visible = p < 1;
      if (!v.spin) { v.spin = []; v.fx = []; v.model.traverse(o => { if (o.userData.fx) v.fx.push(o); else if (o.name === "windBlades" || o.name === "fountainWater") v.spin.push(o); }); }   // 움직이는 부분은 한 번만 찾아 둠(매 프레임 모델 전체를 훑지 않게)
      if (p >= 1) for (const o of v.spin) { if (o.name === "windBlades") o.rotation.z += dt * 1.6; else o.scale.y = 1 + Math.sin(performance.now() / 300) * 0.12; }   // 풍차 날개 돌기 · 분수 물(모델을 못 받았을 때의 코드 분수)
      for (const o of v.fx) o.visible = p >= 1;                                      // 분수 물(셰이더가 움직임, render/fountain.js): 다 지은 뒤에만. 그림자를 안 드리워 animating에 넣지 않음
      if (p >= 1 && v.spin.length && focus && Math.abs(v.holder.position.x - focus.x) < 34 && Math.abs(v.holder.position.z - focus.z) < 34) this.animating = true;
    }
    // 전기가 들어온 집: 창가 불빛(밤에만 보임 — daylight.js가 houseGlow 세기를 정함). 2초마다 확인
    // 불빛 크기는 발자국 × 0.85: 반지름이 높이(1.3 m)보다 크면 땅에 묻혀 아래가 칼처럼 잘리고 풀 위에 누런 네모 빛이 번졌음(예전 × 1.3)
    if ((this.glowT = (this.glowT || 0) - dt) > 0) return; this.glowT = 2;
    for (const v of this.views.values()) {
      const b = v.building, def = BUILDINGS[b.defId]; if (!def.house || !v.model) continue;
      const on = this.world.isDone(b) && !!this.world.powered?.(b);
      if (on && !v.glow) { v.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffc070, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); v.glow.name = "houseGlow"; v.glow.userData.noToon = true; v.glow.renderOrder = 3;
        v.glow.scale.setScalar(Math.max(def.footprint.w, def.footprint.d) * 0.85); v.glow.position.set(0, Math.min(1.3, v.height * 0.5), def.footprint.d / 2 + 0.05); v.holder.add(v.glow); }
      if (v.glow) v.glow.userData.on = on;
    }
  }
  remove(id) { const v = this.views.get(id); if (!v) return; this.scene.remove(v.holder); if (v.ground) this.scene.remove(v.ground); v.badge.remove(); this.views.delete(id); }
  setHighlight(id) {                                                              // 철거 도구가 가리키는 건물을 붉게
    for (const [bid, v] of this.views) v.holder.traverse(o => { if (o.isMesh) {
      if (!o.userData.baseMat) o.userData.baseMat = o.material;
      if (bid === id && !o.userData.redMat) {                                      // 붉은 재질은 처음 가리킬 때 한 번만 만듦(지붕 색 셰이더도 그대로)
        const base = o.userData.baseMat, red = Object.assign(base.clone(), { onBeforeCompile: base.onBeforeCompile, customProgramCacheKey: base.customProgramCacheKey });
        if (base.emissive) { red.emissive = new THREE.Color(0xd9433a); red.emissiveIntensity = 0.55; }
        else if (red.color) red.color.lerp(new THREE.Color(0xd9433a), 0.55);         // 빛을 안 받는 재질(공사 비계·기본색 모델)은 emissive가 없음 → 넣으면 그릴 때 오류가 나서 화면이 멈췄음. 색을 붉게 섞음
        o.userData.redMat = red;
      }
      o.material = bid === id ? o.userData.redMat : o.userData.baseMat;
    } });
  }
  // 건물 위 표시: 안에 있는 갈매미 수(건물 밖에서도 안의 상태가 유지됨을 보여 줌)
  updateBadges(camera, w, h) {
    const tmp = _badgeP;
    for (const v of this.views.values()) {
      const b = v.building, n = b.occupants.length, building = b.hits < b.need, def = BUILDINGS[b.defId];
      const forSale = !building && def.house && !b.owner && this.economy?.();         // 다 지었는데 주인이 없는 집 = 시장 매물
      if (n === 0 && !building && !forSale) { showEl(v.badge, false); continue; }
      tmp.set(v.holder.position.x, v.holder.position.y + v.height, v.holder.position.z).project(camera);
      if (tmp.z > 1 || Math.abs(tmp.x) > 1.2 || Math.abs(tmp.y) > 1.2) { showEl(v.badge, false); continue; }   // 카메라 뒤·화면 밖은 숨기고 건드리지 않음
      textEl(v.badge.b1, building ? `🔨 ${Math.round(b.hits / b.need * 100)}%` : n ? `🐦 ${n}` : `🪧 🪙${this.world.housePrice(b)}`);   // 매물 값은 물가를 따름(시장 앱과 같은 값)
      const near = building && camera.position.distanceTo(_badgeQ.set(v.holder.position.x, v.holder.position.y + v.height, v.holder.position.z)) < SITE_NEAR;
      if (near) textEl(v.badge.b2, siteStepOf(b, this.world).text); showEl(v.badge.b2, near);   // 공사장 둘째 줄: 🪵 3/5 · 🪨 0/5 모으는 중 · 🏦 재료 가지러 가는 중 · 🔨 짓는 중 · 2바퀴 남음 · ⏳ 일꾼을 기다려요
      showEl(v.badge, true);
      const key = v.badge.b1._txt + "|" + (near ? v.badge.b2._txt : ""); if (v.badge._key !== key || !v.badge._w) { v.badge._key = key; v.badge._w = v.badge.offsetWidth; }   // 폭은 글이 바뀔 때만 잼(방 안이라 겹이 숨어 0으로 쟀으면 다음에 다시)
      const half = v.badge._w / 2 + 4, x = Math.min(Math.max((tmp.x * 0.5 + 0.5) * w, half), Math.max(half, w - half));   // 화면 가장자리에서 잘리지 않게 안쪽으로(두 줄 배지는 폭이 넓음)
      placeEl(v.badge, x, (-tmp.y * 0.5 + 0.5) * h);                               // 글자·자리는 바뀔 때만 씀(util.js)
    }
  }
}

/** 건물 종류 하나의 모델(문 = +z, 바닥 가운데가 원점). 섬에 놓인 건물과 건설 갤러리 사진(thumbs.js)이 같은 것을 씀.
 *  ramp: 계단 높이({ h0, h1 }), season: 계절 장식의 모습 */
export async function buildingModel(def, { ramp = null, season = null } = {}) {
  const model = def.stairs ? await stairsProp(def, ramp) : def.field ? await fieldProp(def) : def.dock ? dockModel() : def.bridge ? bridgeModel() : def.pier ? pierModel() : def.decoShape && !def.asset ? decoModel(def.decoShape, season) : await modelFor(def, () => def.power ? windmillModel() : def.decoShape ? decoModel(def.decoShape, season) : buildingPlaceholder(def));   // 풍차·분수: 사용자 모델, 못 받으면 코드로 만든 풍차·분수
  if (def.fountainFx && model.children.length === 1 && !model.getObjectByName("fountainWater")) { const fx = fountainWater(); fx.position.copy(model.children[0].position); model.add(fx); }   // 분수 모델(normalize한 wrap 안, 원본 좌표) 위에 셰이더 물·물줄기·물방울
  if (def.asset) { tintRoofs(model, def.roof); model.rotation.y = def.modelYaw ?? 0; model.position.x += def.modelShift ?? 0; }   // 지붕 초록 → 테라코타·하늘색, 정문을 +z로, 문이 문 칸 앞에 오게 옆으로(modelShift m, 칸 안에서)
  return model;
}

// 밑동 그늘 판: 가운데는 진하고(건물에 가려짐) 가장자리로 갈수록 옅어지는 둥근 네모
const GROUND_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
let GROUND_MAT = null;
function groundShadeMat() {
  if (GROUND_MAT) return GROUND_MAT;
  const N = 64, c = document.createElement("canvas"); c.width = c.height = N; const g = c.getContext("2d"), img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = Math.abs((x + 0.5) / N * 2 - 1), w = Math.abs((y + 0.5) / N * 2 - 1), d = Math.pow(u ** 4 + w ** 4, 0.25), t = Math.min(1, Math.max(0, (d - 0.55) / 0.45)), i = (y * N + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * (1 - t * t * (3 - 2 * t)));
  }
  g.putImageData(img, 0, 0);
  return (GROUND_MAT = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: 0x1d2b14, transparent: true, opacity: 0.34, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
}

/** 밑동 그늘 세기(0~1): 밤에는 옅게(가로등 빛 웅덩이를 어둡게 덮지 않게). snow(0~1): 눈 덮인 땅에서는 풀빛(어두운 초록)이 아니라 그림자처럼 푸르스름한 회색 */
const SHADE_GRASS = new THREE.Color(0x1d2b14), SHADE_SNOW = new THREE.Color(0x3a4a66);
export function setGroundShade(k, snow = 0) {
  if (!GROUND_MAT) return; GROUND_MAT.opacity = 0.34 * k;
  const s = Math.round(Math.min(1, Math.max(0, snow)) * 50) / 50; if (GROUND_MAT.userData.snow !== s) { GROUND_MAT.userData.snow = s; GROUND_MAT.color.copy(SHADE_GRASS).lerp(SHADE_SNOW, s); }
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

let GLOW = null;
function glowTex() { if (GLOW) return GLOW; const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.4, "rgba(255,255,255,.4)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return (GLOW = new THREE.CanvasTexture(c)); }
const DM = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
const dpart = (g, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
/** 장식: 벤치·꽃밭·분수·눈사람(상자·원기둥 모양) */
function decoModel(shape, season = null) {
  const g = new THREE.Group();
  // 축제 장식: 깃발 줄(기둥 둘 + 세모 깃발) · 축제 등불(빛나는 등) · 계절 장식(지을 때의 계절 모습)
  const FLAG = [0xff6b8a, 0xffd23f, 0x6fc8e8, 0x7fd08a, 0xb07cff];
  if (shape === "bunting") { const wood = DM(0xb98352);
    for (const x of [-0.42, 0.42]) { dpart(g, new THREE.CylinderGeometry(0.03, 0.04, 1.5, 6), wood, x, 0.75, 0); dpart(g, new THREE.SphereGeometry(0.05, 8, 6), DM(0xffd23f), x, 1.52, 0); }
    dpart(g, new THREE.BoxGeometry(0.84, 0.015, 0.015), DM(0xf7f2e8), 0, 1.4, 0);
    for (let i = 0; i < 5; i++) { const f = dpart(g, new THREE.ConeGeometry(0.075, 0.17, 3), DM(FLAG[i]), -0.3 + i * 0.15, 1.31 - Math.sin((i + 0.5) / 5 * Math.PI) * 0.05, 0); f.rotation.x = Math.PI; f.scale.z = 0.25; } }
  if (shape === "festLantern") { const glow = new THREE.MeshStandardMaterial({ color: 0xffb35c, emissive: 0xff8a2a, emissiveIntensity: 0.9, roughness: 0.5 });
    dpart(g, new THREE.CylinderGeometry(0.16, 0.2, 0.08, 10), DM(0x8a6a45), 0, 0.04, 0); dpart(g, new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6), DM(0x8a6a45), 0, 0.42, 0);
    const l = dpart(g, new THREE.SphereGeometry(0.2, 12, 10), glow, 0, 0.98, 0); l.scale.y = 1.15; l.castShadow = false;
    for (const y of [0.76, 1.2]) dpart(g, new THREE.CylinderGeometry(0.1, 0.1, 0.05, 10), DM(0x7b3b2e), 0, y, 0); }
  if (shape === "seasonDeco") {
    if (season === "winter") return decoModel("snowman");                             // 겨울: 눈사람
    if (season === "summer") { dpart(g, new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), DM(0xf7f2e8), 0, 0.6, 0);   // 여름: 파라솔 + 돗자리
      for (let i = 0; i < 8; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.24, 8, 1, true, i * Math.PI / 4, Math.PI / 4), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffffff : 0xff6b6b, roughness: 0.85, side: THREE.DoubleSide })); c.position.y = 1.2; c.castShadow = true; g.add(c); }
      dpart(g, new THREE.BoxGeometry(0.7, 0.02, 0.4), DM(0x6fc8e8), 0, 0.01, 0.2); }
    else if (season === "autumn") { const pk = DM(0xf08a2a);                          // 가을: 호박 더미
      for (const [x, y, z, r] of [[-0.18, 0.17, 0.05, 0.2], [0.2, 0.14, 0.1, 0.16], [0.02, 0.13, -0.2, 0.15], [0, 0.4, 0.02, 0.14]]) { dpart(g, new THREE.SphereGeometry(r, 10, 8), pk, x, y, z).scale.y = 0.78; dpart(g, new THREE.CylinderGeometry(0.015, 0.02, 0.07, 5), DM(0x5a7a2e), x, y + r * 0.78, z); }
      dpart(g, new THREE.BoxGeometry(0.8, 0.03, 0.8), DM(0xd9b56a), 0, 0.015, 0); }
    else { const vine = DM(0x5aa845), arch = dpart(g, new THREE.TorusGeometry(0.4, 0.035, 6, 14, Math.PI), vine, 0, 0.7, 0); arch.castShadow = true;   // 봄(계절을 모르면 이 모습): 꽃 아치
      for (const x of [-0.4, 0.4]) dpart(g, new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6), vine, x, 0.35, 0);
      for (let i = 0; i < 9; i++) { const a = i / 8 * Math.PI; dpart(g, new THREE.SphereGeometry(0.065, 6, 5), DM(i % 2 ? 0xffb7cf : 0xffffff), Math.cos(a) * 0.4, 0.7 + Math.sin(a) * 0.4, i % 2 ? 0.04 : -0.04); } } }
  if (shape === "bench") { const w = DM(0xb98352), iron = DM(0x4a4a4a);
    for (let i = 0; i < 3; i++) dpart(g, new THREE.BoxGeometry(0.85, 0.04, 0.09), w, 0, 0.38, -0.1 + i * 0.1);
    for (let i = 0; i < 2; i++) dpart(g, new THREE.BoxGeometry(0.85, 0.08, 0.035), w, 0, 0.55 + i * 0.12, -0.2).rotation.x = -0.15;
    for (const x of [-0.36, 0.36]) { dpart(g, new THREE.BoxGeometry(0.05, 0.38, 0.3), iron, x, 0.19, 0); dpart(g, new THREE.BoxGeometry(0.05, 0.4, 0.04), iron, x, 0.55, -0.2); } }
  if (shape === "flowerbed") { dpart(g, new THREE.BoxGeometry(0.9, 0.16, 0.9), DM(0x9a6b45), 0, 0.08, 0); dpart(g, new THREE.BoxGeometry(0.8, 0.04, 0.8), DM(0x5a3d26), 0, 0.17, 0);
    const cols = [0xff6b8a, 0xffd23f, 0xffffff, 0xb07cff, 0xff9f45], ball = new THREE.SphereGeometry(0.06, 6, 4), stem = DM(0x4f9a3f);
    for (let i = 0; i < 12; i++) { const x = -0.3 + (i % 4) * 0.2, z = -0.27 + Math.floor(i / 4) * 0.27; dpart(g, new THREE.CylinderGeometry(0.01, 0.01, 0.16, 4), stem, x, 0.27, z); dpart(g, ball, DM(cols[i % cols.length]), x, 0.36, z); } }
  if (shape === "fountain") { const st = DM(0xc9c2b4);
    dpart(g, new THREE.CylinderGeometry(0.85, 0.9, 0.35, 20), st, 0, 0.17, 0); dpart(g, new THREE.CylinderGeometry(0.72, 0.72, 0.05, 20), new THREE.MeshStandardMaterial({ color: 0x6fd0e8, roughness: 0.2, emissive: 0x2a7fa0, emissiveIntensity: 0.3 }), 0, 0.34, 0);
    dpart(g, new THREE.CylinderGeometry(0.12, 0.16, 0.7, 10), st, 0, 0.65, 0); dpart(g, new THREE.CylinderGeometry(0.35, 0.25, 0.12, 14), st, 0, 1.0, 0);
    const w = dpart(g, new THREE.ConeGeometry(0.28, 0.4, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xbfefff, transparent: true, opacity: 0.6, emissive: 0x6fc8e8, emissiveIntensity: 0.4 }), 0, 1.2, 0); w.name = "fountainWater"; w.rotation.x = Math.PI; }
  if (shape === "snowman") { const sn = DM(0xf7fbff);
    dpart(g, new THREE.SphereGeometry(0.3, 12, 10), sn, 0, 0.28, 0); dpart(g, new THREE.SphereGeometry(0.22, 12, 10), sn, 0, 0.68, 0); dpart(g, new THREE.SphereGeometry(0.15, 12, 10), sn, 0, 0.98, 0);
    dpart(g, new THREE.ConeGeometry(0.03, 0.14, 6), DM(0xff8a2a), 0, 0.98, 0.18).rotation.x = Math.PI / 2;
    for (const x of [-0.05, 0.05]) dpart(g, new THREE.SphereGeometry(0.018, 6, 4), DM(0x222222), x, 1.03, 0.13);
    dpart(g, new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), DM(0xd9574b), 0, 0.84, 0); }
  return g;
}
/** 풍차 발전소(모델을 못 받았을 때): 돌 몸통 + 지붕 + 돌아가는 날개 4장(정면 +z) */
function windmillModel() {
  const g = new THREE.Group();
  dpart(g, new THREE.CylinderGeometry(0.6, 0.85, 3.0, 12), DM(0xf3ead8), 0, 1.5, 0);
  const roof = dpart(g, new THREE.ConeGeometry(0.75, 0.9, 12), DM(0xb5794a), 0, 3.45, 0); void roof;
  dpart(g, new THREE.BoxGeometry(0.35, 0.6, 0.06), DM(0x9a6b45), 0, 0.3, 0.8);
  const hub = new THREE.Group(); hub.name = "windBlades"; hub.position.set(0, 3.0, 0.75); g.add(hub);
  dpart(hub, new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8), DM(0x6b4a2e), 0, 0, 0).rotation.x = Math.PI / 2;
  for (let k = 0; k < 4; k++) { const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; hub.add(arm);
    dpart(arm, new THREE.BoxGeometry(0.06, 1.5, 0.04), DM(0x7a5236), 0, 0.8, 0); dpart(arm, new THREE.BoxGeometry(0.34, 1.1, 0.02), DM(0xf6f1e4), 0.18, 0.95, 0.02); }
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

/** 등대 모델: 임시 몸통(lighthouseBody)을 사용자 모델로 바꾸고, 램프·빛줄기(이름 그대로 — daylight.js가 밤에 켬)를 모델의 등불 방 높이로 옮김.
 *  램프는 유리 칸을 감싸는 빛 껍질(더하기 색, 발광 세기만큼 밝아짐). 모델을 못 받으면 임시 등대 그대로 */
async function lighthouseModel(obj, def) {
  const m = await rawModel(def.model), body = obj.getObjectByName("lighthouseBody"), t = body.parent, lamp = obj.getObjectByName("lighthouseLamp"), beam = obj.getObjectByName("lighthouseBeam");
  const bx = new THREE.Box3().setFromObject(m), H = def.modelH, s = H / (bx.max.y - bx.min.y), turn = new THREE.Group();
  m.scale.setScalar(s); m.position.set(-(bx.min.x + bx.max.x) / 2 * s, -bx.min.y * s, -(bx.min.z + bx.max.z) / 2 * s); turn.add(m); turn.rotation.y = def.modelYaw ?? 0;
  t.remove(body); t.add(turn);
  lamp.position.y = beam.position.y = H * def.lampAt;
  lamp.geometry = new THREE.LatheGeometry(def.lampShape.map(([r, y]) => new THREE.Vector2(r * H, (y - def.lampAt) * H)), 24);
  lamp.material = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc24a, emissiveIntensity: 0.9, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false });
  lamp.material.userData.noToon = true; lamp.castShadow = lamp.receiveShadow = false; lamp.renderOrder = 2;
}

export const SAPLING_SCALE = 0.35;                                               // 묘목·빈 광석 바위(꾸미기로 새로 놓아 자라는 중)의 크기
const LANDMARK_MOVE = new Set(["cave", "lighthouse"]);                          // 옮길 때 물체를 다시 만들지 않고 받침만 옮김(등대 모델·불빛이 그대로)
/** 지형지물 받침(landmarkBase)을 칸에 맞춤: 칸들 가운데, 칸 높이(가장 낮은 칸 — 등대는 2 cm 더 묻음), 동굴은 입구 방향(rot)만큼 돌림 */
export function placeLandmark(obj, world, m) {
  const t = obj.getObjectByName("landmarkBase"); if (!t) return false;
  const n = m.cells.length, cx = m.cells.reduce((s, c) => s + c[0], 0) / n, cz = m.cells.reduce((s, c) => s + c[1], 0) / n;
  const e = Math.min(...m.cells.map(([x, z]) => world.grid.get(x, z)?.elevation ?? 0));
  t.position.set(toWorldX(cx + 0.5), m.defId === "lighthouse" ? e - 0.02 : e, toWorldZ(cz + 0.5));
  if (m.defId === "cave") t.rotation.y = (m.rot || 0) * Math.PI / 2;
  return true;
}
/** 돌 색 덮어쓰기(바닷가 바위 모델의 복숭아·청록빛 → 바위 곶 돌벽과 같은 따뜻한 회갈색). 원래 재질마다 복제 하나를 같이 써서 묶어 그리기(instances.js)가 그대로 묶음 */
const STONE_MATS = new Map();
function stoneTint(obj, hex) {
  obj.traverse(o => { if (!o.isMesh) return; o.material = [].concat(o.material).map(m => {
    const k = m.uuid + hex; let c = STONE_MATS.get(k);
    if (!c) { c = m.clone(); if (c.map) c.map = null; c.color.setHex(hex); c.needsUpdate = true; STONE_MATS.set(k, c); }
    return c; }).reduce((a, m, i, arr) => arr.length === 1 ? m : arr, null); });
}
/** 모듈 하나의 그림(장면에는 아직 안 붙임). 나무·야자수·바위·광석 = 모델 하나(칸 가운데·칸 높이), 지형지물 = 칸으로 그리는 임시 도형(+ 등대 모델).
 *  지형지물 물체는 userData.landmark = true(묶어 그리기·거리 숨기기에 넣지 않음 — 등대 불빛은 멀리서도 보여야 함) */
export async function makeModuleView(world, m) {
  const def = MODULES[m.defId], cellsWorld = m.cells.map(([x, z]) => [toWorldX(x + 0.5), toWorldZ(z + 0.5)]);
  const asset = def.assets ? def.assets[(m.variant ?? 0) % def.assets.length] : def.asset;
  if (!asset) {
    const obj = modulePlaceholder(m.defId, cellsWorld, m.rot); obj.name = m.id; obj.userData.landmark = true; obj.userData.ownGeo = !LANDMARK_MOVE.has(m.defId);
    placeLandmark(obj, world, m);
    if (def.model) await lighthouseModel(obj, def).catch(e => console.warn(`에셋을 못 불러와 임시 도형을 씁니다: ${def.model}`, e));
    return obj;
  }
  // 모델 하나짜리(1칸) 모듈: 칸 가운데, 그 칸 높이에 둔다
  const [x, z] = m.cells[0], obj = await modelFor({ footprint: { w: def.viewSize ?? 1, d: def.viewSize ?? 1 } }, () => modulePlaceholder(m.defId, [[0, 0]], 0), asset);
  obj.position.set(cellsWorld[0][0], terrainHeight(world.grid, x + 0.5, z + 0.5), cellsWorld[0][1]); obj.rotation.y = m.rot * Math.PI / 2;
  if (def.stone) stoneTint(obj, def.stone);
  if (def.vary) { const h = Math.abs(((x * 73856093) ^ (z * 19349663)) >>> 0) / 4294967295; obj.scale.multiplyScalar(0.85 + h * 0.4); obj.rotation.y = h * 6.283 * 7; }   // 나무: 칸마다 크기 0.85~1.25배·방향 제각각
  obj.name = m.id; return obj;
}
/** 섬의 자연·지형지물 그림: 불러올 때 world.modules를 모두 그리고, 꾸미기(moduleAdded·moduleRemoved·moduleMoved)와 파기·메우기(ground)를 따라감.
 *  objs: 모듈 id → 물체(나무·야자수·바위·광석, 같은 Map을 계속 씀 — life.js 움직임·main.js 거리 숨기기·계절 색이 같이 읽음), marks: 지형지물.
 *  모델을 받는 동안 같은 id가 치워지거나 다시 놓이면(되돌리기) 늦게 온 물체는 버림(gen 표). onAdd(m, obj)·onRemove(id, obj): main.js가 이음 */
export class ModuleViews {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.objs = new Map(); this.marks = new Map(); this.gen = new Map(); this.onAdd = null; this.onRemove = null;
    this.ready = Promise.all(world.modules.map(m => this.add(m))).then(() => this.objs);
    world.on("moduleAdded", e => this.add(e.module));
    world.on("moduleRemoved", e => this.remove(e.module.id));
    world.on("moduleMoved", e => this.moved(e.module));
    world.on("ground", e => this.ground(e.x, e.z));
  }
  /** 묘목·빈 광석 바위(남은 자람 시간이 있음) */
  growing(m) { const list = m.defId === "ore" ? this.world.ores : m.defId === "tree" || m.defId === "palm" ? this.world.trees : null, e = list?.find(t => t.id === m.id); return (e ? e.grow : m.grow) > 0; }
  async add(m) {
    const tok = {}; this.gen.set(m.id, tok);
    const obj = await makeModuleView(this.world, m);
    if (this.disposed || this.gen.get(m.id) !== tok || !this.world.modules.includes(m)) { dropOwn(obj); return null; }   // 받는 사이 치워짐·다시 놓임
    this.scene.add(obj);
    if (obj.userData.landmark) { this.marks.set(m.id, obj); return obj; }
    this.objs.set(m.id, obj); poolFor(this.scene).add(obj);   // 나무·야자수·바위: 같은 모델끼리 구역마다 묶어 그림(instances.js)
    this.onAdd?.(m, obj);                                                         // 움직임 기준 크기(life.js)는 다 자란 크기로 적고
    if (this.growing(m)) obj.scale.multiplyScalar(SAPLING_SCALE);                 // 그 다음 작게(treeGrow·oreGrow에서 life.js가 원래 크기로 키움)
    return obj;
  }
  remove(id) {
    this.gen.delete(id);
    const o = this.objs.get(id) || this.marks.get(id); if (!o) return;
    this.scene.remove(o); poolFor(this.scene).remove(o); this.objs.delete(id); this.marks.delete(id);
    this.onRemove?.(id, o); dropOwn(o);
  }
  moved(m) {
    const o = this.marks.get(m.id);
    if (o && LANDMARK_MOVE.has(m.defId) && placeLandmark(o, this.world, m)) return;   // 동굴·등대: 받침만 새 자리·높이·방향으로
    this.remove(m.id); this.add(m);                                               // 부두·방파제: 칸 모양이 돌아가므로 다시 만듦
  }
  /** 파기·메우기·높이 바꾸기: 둘레 칸 모듈의 높이를 다시(모서리 높이가 이웃 칸을 따라 바뀜) */
  ground(x, z) {
    const g = this.world.grid;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const id = g.get(x + dx, z + dz)?.occupiedId; if (!id) continue;
      const o = this.objs.get(id), mk = this.marks.get(id);
      if (mk) { const m = this.world.modules.find(q => q.id === id); if (m) placeLandmark(mk, this.world, m); continue; }
      if (!o) continue; const y = terrainHeight(g, x + dx + 0.5, z + dz + 0.5); o.position.y = y; if (o.userData.base) o.userData.base.y = y;
    }
  }
  dispose() { this.disposed = true; }
}
/** 다시 만드는 지형지물(부두·방파제)의 임시 도형 모양만 반납(재질은 placeholders.js가 같이 씀, 모델 복제본은 모양을 같이 써서 건드리지 않음) */
function dropOwn(o) { if (o?.userData.ownGeo) o.traverse(x => { if (x.isMesh) x.geometry.dispose(); }); }

const WEAR_SLOT = [["neck", "scarf"], ["body", "coat"]];                     // 입은 옷 자리 → 장신구(characters.js fitWear)
const SICK_GLOW = new THREE.Color(0x4a1208), NO_GLOW = new THREE.Color(0x000000);
/** 아픈 갈매미: 몸 재질의 발광 색을 살짝 붉게(툰으로 바꾼 재질과 원래 재질 둘 다 — 그림체를 바꿔도 그대로). 장신구·도구 재질은 건드리지 않음.
 *  원래 발광 색은 원래 재질(std)에만 적어 둠: 아픈 동안 그림체를 바꾸면 새 툰 재질이 붉은 색을 베껴 가므로, 툰 재질에서 재면 나은 뒤에도 붉게 남음 */
function sickTint(ch, on) {
  ch.root.traverse(o => { if (!o.isSkinnedMesh) return; for (const m of [].concat(o.material)) { const std = m.userData.src || m; if (!std.emissive) continue;
    std.userData.glow0 ??= std.emissive.getHex(); const c = on ? SICK_GLOW : NO_GLOW.setHex(std.userData.glow0); for (const x of [m, std]) x.emissive?.copy(c); } });
}
const BLOB_GEO = new THREE.CircleGeometry(1, 20);
const WAKE_GEO = new THREE.RingGeometry(0.86, 1, 28);
const WAKE_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: 0x1d2b14, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), sphere = new THREE.Sphere();

export class UnitViews {
  /** pool: 갈매미 모델(불러오는 중 화면에서 한 번 받아 둔 메모리 캐시, gullLoad.js GullPool — get(이름)). 모델이 없는 갈매미는 그리지 않음(캡슐 없음 · 규칙은 그대로 돎) */
  constructor(scene, world, pool = null) {
    this.world = world; this.chars = []; this.scene = scene; this.pool = pool; this.views = [];
    for (const u of world.units) this.add(u);
    world.on("unitAdded", u => this.add(u));                                     // 🥚 소환
  }
  add(u) {
    const scene = this.scene;
      const g = new THREE.Group(); g.userData.unitId = u.unitId; g.visible = false; scene.add(g);
      // 누르기용 보이지 않는 원기둥(작은 갈매미도 누르기 쉽게 최소 크기를 둠). 크기는 sync에서 몸에 맞춤.
      const pick = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ visible: false }));
      pick.userData.unitId = u.unitId; g.add(pick);
      // 발밑 둥근 그림자(가벼움)
      const blob = new THREE.Mesh(BLOB_GEO, BLOB_MAT); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.renderOrder = 1;
      blob.scale.setScalar(0.32 * (u.scale || 1) + 0.08); g.add(blob);
      const v = { g, ch: null, pick, blob }; this.views.push(v);
    this.attach(v, u);
    return v;
  }
  /** 메모리 캐시에 그 갈매미 모델이 있으면 붙임(새 섬에서도 같은 모델을 다시 씀 · 다시 받지 않음). 없으면 sync가 매 프레임 다시 봄 */
  /** 모습(u.form)의 원본을 마리마다 복제해 붙임(charInstance.js: 같은 모습 여럿이 서로 빼앗지 않게, 재질도 마리마다). 변신하면 다시 붙임(옛 복제본은 떼기만 — 지오메트리는 원본과 같이 씀) */
  attach(v, u) {
    const f = formOf(u), proto = this.pool?.get?.(f); if (!proto) return false;
    if (v.ch) { v.ch.mixer?.stopAllAction?.(); v.ch.root.parent?.remove(v.ch.root); }
    const ch = instanceChar(proto, { cloneRoot: SkeletonUtils.clone, Mixer: THREE.AnimationMixer }); this.instances = (this.instances || 0) + 1;
    v.g.add(ch.root); v.ch = ch; v.form = f;
    for (const t of Object.values(ch.inHand)) t.visible = false;
    ch.root.rotation.set(0, 0, 0); ch.root.position.set(0, 0, 0);
    v.castOn = undefined; v.sitBottom = undefined; v.sickOn = undefined; v.tip = undefined;   // 그림자는 거리 보고 sync에서 정함 · 앉은 키·낚싯대 끝은 새 몸으로 다시 잼
    v.blob.scale.setScalar(0.32 * (u.scale || 1) + 0.08);                          // 발밑 그림자도 새 몸 크기로
    return true;
  }
  /** 이 갈매미 손의 물뿌리개 끝(월드 좌표, 보일 때만) — life.js 물방울이 여기서 나옴. 없으면 null */
  canTip(u) {
    const v = this.views[this.world.units.indexOf(u)], can = v?.ch?.inHand.can; if (!can?.visible || !v.g.visible) return null;
    const tip = can.getObjectByName("tip"); return tip ? tip.getWorldPosition(_tipP) : null;
  }
  /** 그래픽 설정: 카메라에서 이 거리(m) 안의 갈매미만 실제 그림자, 그 밖은 발밑 원판(0이면 모두 원판) */
  setShadowDist(d) { this.shadowDist = d; for (const v of this.views) v.castOn = undefined; }
  /** 헤엄: 몸이 물 위에서 출렁이고 좌우로 살짝 기울며 앞으로 숙임, 발밑 그림자 대신 물결 고리 두 개가 퍼짐. */
  swimLook(v, u, i, dt, time) {
    const sw = !!u.swimming && !u.insideBuildingId, body = v.ch?.root, s = u.scale || 1;
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
  /** 앉은 자세에서 엉덩이(몸통 바닥)가 몸 원점보다 얼마나 위에 있는지(m): 골반 뼈 바로 아래(수평 반지름 안)의 가장 낮은 피부 꼭짓점 */
  measureSeat(v) {
    const g = v.g, ch = v.ch; g.updateMatrixWorld(true); let hips = null, mesh = null;
    ch.root.traverse(o => { if (o.isBone && /^(hips|pelvis)$/i.test(o.name)) hips = o; if (o.isSkinnedMesh && !mesh) mesh = o; });
    if (!hips || !mesh) return 0;
    const hp = hips.getWorldPosition(new THREE.Vector3()), pos = mesh.geometry.attributes.position, p = new THREE.Vector3(), s = ch.root.getWorldScale(new THREE.Vector3()).x, R = 0.14 * s;
    let minY = Infinity; for (let i = 0; i < pos.count; i += 2) { mesh.getVertexPosition(i, p); p.applyMatrix4(mesh.matrixWorld); if (Math.hypot(p.x - hp.x, p.z - hp.z) < R) minY = Math.min(minY, p.y); }
    return isFinite(minY) ? minY - g.position.y : 0;
  }
  /** 매 프레임: 위치·방향, 동작(AI가 정한 u.anim, 아니면 걷기·달리기·서 있기), 손의 도구, 낚싯줄과 찌. */
  sync(dt, playAnim, walkScale = 2.2, runScale = 1.5, speedBoost = 1, time = 0, camera = null) {
    if (camera) { projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projView); }
    this.frameNo = (this.frameNo || 0) + 1; this.casting = 0;                       // casting: 실제 그림자를 드리우는(밖에 나와 있는) 갈매미 수
    this.world.units.forEach((u, i) => {
      const v = this.views[i]; if (!v) return;                                     // 막 소환돼 아직 모습이 안 만들어진 갈매미
      if (!v.ch || v.form !== formOf(u)) this.attach(v, u);                        // 모델이 아직 없으면 올 때까지 안 그림 · 변신하면 새 모습으로(월드가 연출의 빛이 가장 밝을 때 form을 바꿈)
      const { g, ch, pick } = v; g.visible = !u.insideBuildingId && !!ch;
      const h = Math.max(0.6, u.height ?? 0.8 * (u.scale || 1)), r = Math.max(0.32, 0.28 * (u.scale || 1)); pick.scale.set(r, h, r);
      g.position.set(toWorldX(u.x), u.y, toWorldZ(u.z));
      if (v.ch && camera && (v.castOn === undefined || (this.frameNo + i) % 15 === 0)) {   // 가까운 갈매미만 실제 그림자(15프레임마다 확인)
        const want = (this.shadowDist ?? 999) > 0 && camera.position.distanceTo(g.position) < (this.shadowDist ?? 999);
        if (v.castOn !== want) { v.castOn = want; v.ch.root.traverse(o => { if (o.isMesh) o.castShadow = want; }); }
      }
      if (v.castOn && g.visible) this.casting++;
      this.swimLook(v, u, i, dt, time);
      if (u.state === "Sit" && v.ch) {                                               // 앉기: 몸통 바닥(엉덩이)이 좌판 높이(u.y)에 오게 모델을 내림. 자세가 잡힌 뒤 한 번 잼
        v.sitT = (v.sitT || 0) + dt;
        if (v.sitT > 0.5 && v.sitBottom === undefined) v.sitBottom = this.measureSeat(v);
        g.position.y = u.y - (v.sitBottom ?? 0);
      } else v.sitT = 0;
      if (u.sailing) { if (!v.boat) { v.boat = boatModel(); v.g.add(v.boat); } v.boat.visible = true; v.boat.position.y = -0.12 + Math.sin(time * 2 + i) * 0.02; }   // 배 타는 중: 밑에 배
      else if (v.boat) v.boat.visible = false;
      let d = u.heading - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, dt * 10);   // 몸 돌리기 부드럽게
      const lie = v.lie = (v.lie || 0) + ((u.state === "Faint" ? 1 : 0) - (v.lie || 0)) * Math.min(1, dt * 6);   // 쓰러짐: 옆으로 눕힘(제 몸 기준 z축) · 몸통을 조금 띄워 땅에 안 묻히게
      g.rotation.z = lie * 1.45; if (lie > 0.01) g.position.y += lie * r * 0.6;
      const walking = !!u.path && u.pathIndex < u.path.length && u.state !== "Held";
      if (ch) {
        if (ch.clip && u.clip !== ch.clip) u.clip = ch.clip;                                       // 실제 동작 길이를 AI에 알려 줌
        const restart = !!u.once && ch.onceRef !== u.once; if (u.once) ch.onceRef = u.once;      // 같은 한 번 동작을 다시 시작
        const workSpeed = ["Chop", "Mine", "Build"].includes(u.anim) ? (u.eff ?? 1) : 1;            // 일 동작은 능률만큼 빠르게/느리게
        if (!(u.anim && playAnim(ch, u.anim, workSpeed, 0.12, restart))) {
          if (!walking) playAnim(ch, "Idle", 1); else if (u.running) playAnim(ch, "Run", runScale * speedBoost); else playAnim(ch, "Walk", walkScale * speedBoost);
        }
        const watering = u.state === "GoWater" || u.state === "Water";               // 물주기 길(물 뜨러·밭으로) 내내 물뿌리개를 듦
        for (const [k, t] of Object.entries(ch.inHand)) { const on = k === "can" ? watering || u.tool === k : u.tool === k && !watering; if (t.visible !== on) t.visible = on; }
        if (ch.wear) for (const [slot, kind] of WEAR_SLOT) { const m = ch.wear[kind], on = u.wear?.[slot] === kind; if (m && m.visible !== on) m.visible = on; }   // 입은 옷(바뀔 때만)
        const sick = !!u.sick; if (v.sickOn !== sick || v.sickOf !== ch) { v.sickOn = sick; v.sickOf = ch; sickTint(ch, sick); }   // 아픈 동안 몸이 살짝 붉게
        // 애니메이션 계산: 화면 밖이면 건너뛰고, 멀면 두 프레임에 한 번(시간은 모아서)
        sphere.center.copy(g.position); sphere.radius = 1.5 * (u.scale || 1);
        const onScreen = !camera || frustum.intersectsSphere(sphere), far = camera && camera.position.distanceTo(g.position) > 28;
        v.animDt = (v.animDt || 0) + dt;
        if (g.visible && onScreen && (!far || (this.frameNo + i) % 2 === 0)) { ch.mixer.update(v.animDt); v.animDt = 0; }
        else if (v.animDt > 0.5) v.animDt = 0.5;
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
        const tip = v.tip === undefined || v.tipOf !== ch ? (v.tipOf = ch, v.tip = ch?.inHand.rod?.getObjectByName("tip") ?? null) : v.tip, from = _lineP;   // 낚싯대 끝은 한 번만 찾음
        if (tip) tip.getWorldPosition(from); else from.set(g.position.x, g.position.y + h * 0.7, g.position.z);
        const lp = v.line.geometry.attributes.position; lp.setXYZ(0, from.x, from.y, from.z); lp.setXYZ(1, v.bob.position.x, v.bob.position.y, v.bob.position.z); lp.needsUpdate = true; v.line.geometry.computeBoundingSphere();
      }
    });
  }
}
