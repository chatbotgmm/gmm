// 마을 생활 그림: 나무 흔들림·쓰러짐·그루터기·다시 자람, 광석 흔들림·불꽃·사라짐, 씨앗, 말풍선, 구역 이름.
// 월드 이벤트(treeHit, treeFell, …)를 받아 움직임을 만들고, 매 프레임 update(dt)로 진행한다.
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";
import { PROPS } from "../data/catalog.js";
import { modelFor, rawModel } from "./assets.js";
import { terrainHeight } from "../world/terrain.js";
import { poolFor } from "./instances.js";
import { placeEl, showEl } from "../util.js";
import { DRY_BELOW } from "../world/farming.js";

const _lifeP = new THREE.Vector3(), _lifeM = new THREE.Matrix4(), _lifeC = new THREE.Color();
// 밭 칸: 흙 판(촉촉함 색) · 자라는 단계 3가지 · 목마른 칸 위 💧 · 물 줄 때 물방울
export const SOIL_WET = new THREE.Color(0x4e3420), SOIL_DRY = new THREE.Color(0xc9a46e);   // 촉촉함 WET_AT 이상 짙은 갈색 · DRY_BELOW 아래 밝은 마른 흙(사이는 섞음)
export const SOIL_WET_AT = 0.35, SOIL_Y = 0.13, SOIL_SIZE = 0.8;                // 흙 판 높이(m, 밭 틀 안 흙 위)·크기(칸에 대한 비율)
export const CROP_STAGE = [[0.33, 0.4], [0.8, 0.7], [Infinity, 1]];             // 자란 정도(1 − 남은 시간/자랄 시간) < 앞 값 → 크기: 새싹 0.4 · 반쯤 0.7 · 다 자람 1
export const DROP_SECS = 0.8;                                                   // 물방울이 떨어지는 시간
const SOIL_ICON_NEAR = { portrait: 25, landscape: 25 }, SOIL_ICON_FAR = 40;     // 💧은 폰에서 카메라 25m 안만(넓은 화면 40m)
/** 촉촉함 → 흙 색(out에 씀) */
export function soilColor(m, out) { const k = Math.max(0, Math.min(1, ((m ?? 1) - DRY_BELOW) / (SOIL_WET_AT - DRY_BELOW))); return out.copy(SOIL_DRY).lerp(SOIL_WET, k); }
/** 자란 정도(0~1) → 단계 크기 */
export const cropStageScale = f => CROP_STAGE.find(([lim]) => f < lim)[1];

export class LifeViews {
  constructor(scene, world, overlay) {
    this.scene = scene; this.world = world; this.overlay = overlay;
    this.objs = new Map(); this.anims = []; this.sparks = []; this.seedMeshes = new Map(); this.stumps = new Map();
    this.seedGeo = new THREE.SphereGeometry(0.045, 12, 8);
    this.seedMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0xf2b200, emissiveIntensity: 0.3, roughness: 0.4 });
    this.sparkGeo = new THREE.SphereGeometry(0.02, 6, 4); this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
    world.on("seedAdded", s => this.addSeed(s)); world.on("seedRemoved", s => this.removeSeed(s));
    for (const s of world.seeds) this.addSeed(s);
    world.on("treeHit", t => { this.sway(t); this.leaves(t); });                  // 도끼질: 나무가 밑동을 축으로 흔들리고 잎이 떨어짐
    world.on("treeFell", e => this.fell(e.tree, e.dir));
    world.on("treeGrow", t => this.grow(t.id));
    world.on("oreHit", o => { this.shake(o.id, 0.3, "x"); this.spark(o); });
    world.on("oreBroke", o => this.vanish(o.id));
    world.on("oreGrow", o => this.grow(o.id));
    // 밭 작물: 칸마다 싹 4개. 자라는 동안 커지고, 다 자라면 노랗게(거둘 때).
    this.cropGreen = new THREE.MeshStandardMaterial({ color: 0x6fbf55, roughness: 0.8 });
    this.cropRipe = new THREE.MeshStandardMaterial({ color: 0xe8b830, roughness: 0.7 });
    this.cropGeo = new THREE.ConeGeometry(0.07, 0.32, 6).translate(0, 0.16, 0);
    this.crops = [];
    const addCrop = p => {
      const g = new THREE.Group(); g.position.set(toWorldX(p.x + 0.5), world.standHeight(p.x + 0.5, p.z + 0.5) + 0.01, toWorldZ(p.z + 0.5));
      for (const [dx, dz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) {
        const m = new THREE.Mesh(this.cropGeo, this.cropGreen); m.position.set(dx, 0, dz); m.castShadow = true; g.add(m); }
      scene.add(g); const c = { p, g }; this.crops.push(c); this.swapCrop?.(c);
    };
    // 작물 모델(사용자 제공 당근·양배추): 받으면 싹 4개 대신 칸마다 하나(칸 위치로 번갈아)
    const swap = c => { if (!this.cropModels || c.g.userData.model) return; c.g.clear(); const k = (c.p.x + c.p.z) % 2, src = this.cropModels[k], m = src.clone(true); m.scale.setScalar(k ? 0.6 : 0.62); c.g.add(m); c.g.userData.model = true; poolFor(scene).add(m); };
    Promise.all(["assets/props/carrot_{T}.glb", "assets/props/cabbage_{T}.glb"].map(u => rawModel(u))).then(ms => { this.cropModels = ms; this.crops.forEach(swap); }).catch(() => {});
    this.swapCrop = swap;
    world.plots.forEach(addCrop);
    world.on("plotAdded", p => { addCrop(p); this.soilDirty = true; });              // 목수가 지은 밭
    world.on("plotRemoved", p => { const i = this.crops.findIndex(c => c.p === p); if (i >= 0) { scene.remove(this.crops[i].g); this.crops.splice(i, 1); this.soilDirty = true; } });
    // 흙 판: 모든 칸을 InstancedMesh 하나로(그리기 호출 1). 칸 수가 용량을 넘으면 두 배로 다시 만듦. 색은 촉촉함이 바뀐 칸만 씀
    this.soilGeo = new THREE.PlaneGeometry(SOIL_SIZE, SOIL_SIZE).rotateX(-Math.PI / 2);
    this.soilMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }); this.soilMat.userData.noSnow = true;
    this.soil = null; this.soilDirty = true; this.soilIcons = [];
    world.on("plotWater", e => this.splash(e.p, e.u));                               // 물 주기: 물뿌리개 끝(없으면 칸 위)에서 물방울
    this.dropGeo = new THREE.SphereGeometry(0.022, 5, 4); this.dropMat = new THREE.MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.9 });
    this.canTip = null;                                                              // main.js가 줌: 갈매미 → 손의 물뿌리개 끝 월드 좌표(없으면 null)
    // 말풍선(유닛마다 하나)과 구역 이름
    this.emotes = [];                                                              // 갈매미마다 말풍선(소환되면 그때 만듦)
    this.emoteFor = i => this.emotes[i] ||= (() => { const e = document.createElement("div"); e.className = "emote"; e.hidden = true; overlay.appendChild(e); return e; })();
    this.sickEls = [];                                                             // 아픈 갈매미 머리 위 🤧(갈매미마다 하나, 처음 아플 때 만듦)
    this.sickFor = i => this.sickEls[i] ||= (() => { const e = document.createElement("div"); e.className = "sickb"; e.textContent = "🤧"; e.hidden = true; overlay.appendChild(e); return e; })();
    this.zoneEls = world.zones.map(z => { const e = document.createElement("div"); e.className = "zone"; e.textContent = z.label; overlay.appendChild(e); return { z, e }; });
    this.showZones = true;
  }
  attachModules(map) { this.objs = map; for (const [id, o] of map) this.attachModule(id, o); }
  /** 모듈 물체 하나(꾸미기로 새로 놓은 것 포함): 움직임 기준(원래 크기·자리)을 적고 objs에 넣음 */
  attachModule(id, o) { o.userData.base = { scale: o.scale.x, x: o.position.x, y: o.position.y, z: o.position.z }; this.objs.set(id, o); }
  /** 치운 모듈: 움직임·그루터기도 같이 지움(남는 물체 0) */
  detachModule(id) {
    const o = this.objs.get(id); if (o) this.anims = this.anims.filter(a => a.o !== o); this.objs.delete(id);
    const s = this.stumps.get(id); if (s) { this.scene.remove(s); poolFor(this.scene).remove(s); this.stumps.delete(id); }
  }

  addSeed(s) {
    const m = new THREE.Mesh(this.seedGeo, this.seedMat); m.castShadow = true;
    m.position.set(toWorldX(s.x + s.ox), terrainHeight(this.world.grid, s.x + s.ox, s.z + s.oz) + 0.045, toWorldZ(s.z + s.oz));
    this.scene.add(m); this.seedMeshes.set(s.id, m);
  }
  removeSeed(s) { const m = this.seedMeshes.get(s.id); if (m) { this.scene.remove(m); this.seedMeshes.delete(s.id); } }

  shake(id, secs, axis) { const o = this.objs.get(id); if (o) this.anims.push({ kind: "shake", o, t: secs, axis }); }
  fell(tree, dir) {
    const o = this.objs.get(tree.id); if (!o) return;
    const d = Math.hypot(dir[0], dir[1]) || 1; this.anims = this.anims.filter(a => !(a.kind === "sway" && a.o === o));   // 쓰러질 땐 흔들기 멈춤
    this.anims.push({ kind: "fall", o, t: 0, dx: dir[0] / d, dz: dir[1] / d, tree });
  }
  async showStump(tree, on) {
    let s = this.stumps.get(tree.id);
    if (!s && on) {
      s = await modelFor({ footprint: { w: 0.55, d: 0.55 } }, () => new THREE.Group(), PROPS.stump);
      if (tree.removed || this.stumps.has(tree.id)) return;                       // 받는 사이 치움(꾸미기)·이미 만듦
      s.position.set(toWorldX(tree.x + 0.5), terrainHeight(this.world.grid, tree.x + 0.5, tree.z + 0.5), toWorldZ(tree.z + 0.5));
      this.scene.add(s); this.stumps.set(tree.id, s); poolFor(this.scene).add(s);
    }
    if (s) s.visible = on && !tree.alive;
  }
  vanish(id) { const o = this.objs.get(id); if (o) this.anims.push({ kind: "vanish", o, t: 0 }); }
  grow(id) {
    const o = this.objs.get(id); if (!o) return;
    const tree = this.world.trees.find(t => t.id === id); if (tree) this.showStump(tree, false);
    const b = o.userData.base?.scale || 1, from = o.visible ? Math.min(1, o.scale.x / b) : 0.15;   // 묘목(작게 서 있음)은 그 크기에서부터
    o.visible = true; o.rotation.x = 0; o.rotation.z = 0; this.anims.push({ kind: "grow", o, t: 0, from: Math.max(0.15, from) });
  }
  /** 나무 흔들기: 밑동을 축으로 0.75초 동안 줄어들며 출렁(최대 약 9°), 흔들리는 방향은 매번 조금 다르게 */
  sway(t) { const o = this.objs.get(t.id); if (!o) return; this.anims = this.anims.filter(a => !(a.kind === "sway" && a.o === o)); const a = Math.random() * 6.283;
    this.anims.push({ kind: "sway", o, t: 0, dx: Math.cos(a), dz: Math.sin(a) }); }
  /** 잎 몇 장이 떨어짐(계절에 따라 연두·단풍·흰색) */
  leaves(t) {
    const top = terrainHeight(this.world.grid, t.x + 0.5, t.z + 0.5) + 1.1, col = { autumn: 0xf2683a, winter: 0xeef3f6, spring: 0xa6e27e }[this.world.season] ?? 0x5aa845;
    this.leafMat ||= new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide }); this.leafMat.color.setHex(col); this.leafGeo ||= new THREE.PlaneGeometry(0.07, 0.05);
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(this.leafGeo, this.leafMat); m.position.set(toWorldX(t.x + 0.5 + (Math.random() - 0.5) * 0.8), top + Math.random() * 0.5, toWorldZ(t.z + 0.5 + (Math.random() - 0.5) * 0.8)); m.rotation.set(Math.random() * 3, Math.random() * 3, 0); this.scene.add(m);
      this.sparks.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6), t: 1.4, leaf: true }); }
  }
  /** 물 주기 물방울: 물뿌리개 끝(없으면 칸 0.5m 위)에서 칸 쪽으로 6방울, DROP_SECS 뒤 다 사라짐(남는 물체 0) */
  splash(p, u) {
    const gx = toWorldX(p.x + 0.5), gz = toWorldZ(p.z + 0.5), gy = this.world.standHeight(p.x + 0.5, p.z + 0.5) + SOIL_Y, from = (u && this.canTip?.(u)) || _lifeP.set(gx, gy + 0.5, gz);
    const fx = from.x, fy = from.y, fz = from.z;
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(this.dropGeo, this.dropMat); m.position.set(fx, fy, fz); this.scene.add(m);
      const t = DROP_SECS * (0.7 + 0.3 * i / 5), vx = (gx - fx) / t + (Math.random() - 0.5) * 0.4, vz = (gz - fz) / t + (Math.random() - 0.5) * 0.4, vy = (gy - fy) / t + 4.9 * t * 0.5;   // 칸에 닿게 던짐(중력 아래 4.9 m/s²)
      this.sparks.push({ m, v: new THREE.Vector3(vx, vy, vz), t, drop: true });
    }
  }
  /** 흙 판 자리(칸이 바뀌었을 때만)와 색(촉촉함이 바뀐 칸만) */
  syncSoil() {
    const crops = this.crops;
    if (this.soilDirty) {
      this.soilDirty = false;
      if (!this.soil || this.soil.instanceMatrix.count < crops.length) {
        if (this.soil) { this.scene.remove(this.soil); this.soil.dispose(); }
        const cap = Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, crops.length))));
        this.soil = new THREE.InstancedMesh(this.soilGeo, this.soilMat, cap); this.soil.receiveShadow = true; this.soil.name = "soil"; this.soil.frustumCulled = false; this.scene.add(this.soil);
      }
      crops.forEach((c, i) => { _lifeM.makeTranslation(toWorldX(c.p.x + 0.5), this.world.standHeight(c.p.x + 0.5, c.p.z + 0.5) + SOIL_Y, toWorldZ(c.p.z + 0.5)); this.soil.setMatrixAt(i, _lifeM); c.wet = undefined; });
      this.soil.count = crops.length; this.soil.instanceMatrix.needsUpdate = true;
    }
    if (!this.soil) return;
    let changed = false;
    crops.forEach((c, i) => { const m = Math.round((c.p.moisture ?? 1) * 50) / 50; if (c.wet !== m) { c.wet = m; this.soil.setColorAt(i, soilColor(m, _lifeC)); changed = true; } });   // 0.02 단위로만 다시 씀
    if (changed && this.soil.instanceColor) this.soil.instanceColor.needsUpdate = true;
  }
  spark(o) {
    const y = terrainHeight(this.world.grid, o.x + 0.5, o.z + 0.5) + 0.2;
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(this.sparkGeo, this.sparkMat); m.position.set(toWorldX(o.x + 0.5), y, toWorldZ(o.z + 0.5)); this.scene.add(m);
      this.sparks.push({ m, v: new THREE.Vector3(Math.random() * 2 - 1, 1.2 + Math.random(), Math.random() * 2 - 1), t: 0.5 });
    }
  }

  update(dt, camera, w, h) {
    const tmp = _lifeP;
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i], o = a.o, base = o.userData.base || { scale: 1 };
      if (a.kind === "sway") {
        a.t += dt; const k = Math.max(0, 1 - a.t / 0.75), ang = Math.sin(a.t * 20) * 0.16 * k;
        o.rotation.set(a.dz * ang, o.rotation.y, -a.dx * ang, "YXZ");
        if (k <= 0) { o.rotation.set(0, o.rotation.y, 0, "YXZ"); this.anims.splice(i, 1); }
        continue;
      }
      if (a.kind === "shake") {
        a.t -= dt; const v = Math.sin(a.t * 50) * 0.06 * a.t;
        if (a.axis === "z") o.rotation.z = v; else o.position.x = base.x + v * 0.3;
        if (a.t <= 0) { o.rotation.z = 0; if (base.x !== undefined) o.position.x = base.x; this.anims.splice(i, 1); }
      } else if (a.kind === "fall") {                                   // 도끼질 반대쪽으로 쓰러짐
        a.t = Math.min(1, a.t + dt * 1.2); const ang = a.t * a.t * Math.PI / 2;
        o.rotation.set(a.dz * ang, o.rotation.y, -a.dx * ang, "YXZ");
        if (a.t >= 1) { o.visible = false; this.showStump(a.tree, true); this.anims.splice(i, 1); }
      } else if (a.kind === "vanish") {
        a.t = Math.min(1, a.t + dt * 2.5); o.scale.setScalar(base.scale * (1 - a.t));
        if (a.t >= 1) { o.visible = false; o.scale.setScalar(base.scale); this.anims.splice(i, 1); }
      } else if (a.kind === "grow") {
        a.t = Math.min(1, a.t + dt * 0.7); const f0 = a.from ?? 0.15; o.scale.setScalar(base.scale * (f0 + (1 - f0) * a.t));
        if (a.t >= 1) { o.scale.setScalar(base.scale); this.anims.splice(i, 1); }
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]; s.t -= dt; s.v.y -= (s.leaf ? 0.9 : s.drop ? 4.9 : 9.8) * dt; if (s.leaf) { s.v.y = Math.max(s.v.y, -0.6); s.m.rotation.x += dt * 3; s.m.rotation.z += dt * 2; } s.m.position.addScaledVector(s.v, dt);   // 잎은 천천히 팔랑
      if (s.t <= 0) { this.scene.remove(s.m); this.sparks.splice(i, 1); }
    }
    this.syncSoil();
    const phone = SOIL_ICON_NEAR[document.documentElement.dataset.form], iconNear = phone ?? SOIL_ICON_FAR; let nIcon = 0;
    for (const c of this.crops) {
      const { p, g } = c, grow = p.stage === "growing" ? 1 - Math.max(0, p.t) / (p.grow || 40) : p.stage === "ripe" ? 1 : 0, sc = p.stage === "ripe" ? 1 : cropStageScale(grow);   // 자라는 단계 3가지(새싹·반쯤·다 자람)
      g.visible = p.stage !== "empty"; if (c.sc !== sc) { c.sc = sc; g.scale.setScalar(sc); }
      if (!g.userData.model) for (const m of g.children) m.material = p.stage === "ripe" ? this.cropRipe : this.cropGreen;
      else g.position.y = this.world.standHeight(p.x + 0.5, p.z + 0.5) + 0.06 - (p.stage === "ripe" ? 0 : 0.05 * (1 - sc));   // 모델: 단계마다 커지고 땅 위로
      if ((p.moisture ?? 1) >= DRY_BELOW || p.stage === "ripe") continue;          // 목마른 칸(거둘 것은 빼고): 칸 위 💧(가까울 때만)
      tmp.set(toWorldX(p.x + 0.5), this.world.standHeight(p.x + 0.5, p.z + 0.5) + 0.35, toWorldZ(p.z + 0.5));
      if (camera.position.distanceTo(tmp) > iconNear) continue; tmp.project(camera); if (tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) continue;
      const e = this.soilIcons[nIcon] ||= (() => { const d = document.createElement("div"); d.className = "soilw"; d.textContent = "💧"; d.hidden = true; this.overlay.appendChild(d); return d; })();
      if (!e.isConnected) this.overlay.appendChild(e);
      placeEl(e, (tmp.x * 0.5 + 0.5) * w, (-tmp.y * 0.5 + 0.5) * h); showEl(e, true); nIcon++;
    }
    for (let i = nIcon; i < this.soilIcons.length; i++) showEl(this.soilIcons[i], false);
    // 말풍선(자리·크기·투명도는 바뀔 때만 씀 → 가만히 있을 땐 DOM을 건드리지 않음)
    this.world.units.forEach((u, i) => {
      const e = this.emoteFor(i), show = u.emoteT > 0 && !!u.emoteText && !u.insideBuildingId, sick = !!u.sick && !show && !u.insideBuildingId;   // 🤧은 말풍선이 없을 때만(겹치지 않게)
      if (!sick) { if (this.sickEls[i]) showEl(this.sickEls[i], false); }
      if (!show && !sick) { showEl(e, false); if (e.dataset.t) e.dataset.t = ""; return; }
      if (!show) { showEl(e, false); if (e.dataset.t) e.dataset.t = ""; }
      tmp.set(toWorldX(u.x), u.y + (u.height ?? 0.8) + 0.12, toWorldZ(u.z));
      const dist = camera.position.distanceTo(tmp); tmp.project(camera);
      const off = tmp.z > 1 || dist > 75 || Math.abs(tmp.x) > 1.3 || Math.abs(tmp.y) > 1.3;   // 너무 멀거나 화면 밖이면 숨김(화면이 어지럽지 않게)
      if (sick) { const se = this.sickFor(i); if (!se.isConnected) this.overlay.appendChild(se); showEl(se, !off); if (!off) placeEl(se, (tmp.x * 0.5 + 0.5) * w, (-tmp.y * 0.5 + 0.5) * h); return; }
      if (off) { showEl(e, false); return; }
      showEl(e, true);
      if (e.dataset.t !== u.emoteText) {                                          // 새 말: 모양 고르고 톡 튀어나오게
        e.dataset.t = u.emoteText; e.textContent = u.emoteText;
        const t = u.emoteText, think = t.startsWith("💭"), icon = [...t].length <= 2 || /^(…|zZ…|!\?)$/.test(t);
        e.className = "emote" + (think ? " think" : icon ? " icon" : "") + (t === "❗" ? " bite" : ""); void e.offsetWidth; e.classList.add("pop");   // 입질(❗)은 크게
      }
      const sc = THREE.MathUtils.clamp(1.15 - dist / 90, 0.6, 1.1).toFixed(2), op = Math.min(1, u.emoteT / 0.3).toFixed(2);   // 멀수록 작게 · 끝날 때 살짝 사라짐
      placeEl(e, (tmp.x * 0.5 + 0.5) * w, (-tmp.y * 0.5 + 0.5) * h);
      if (e._sc !== sc) { e._sc = sc; e.style.setProperty("--s", sc); } if (e._op !== op) { e._op = op; e.style.opacity = op; }
    });
    for (const { z, e } of this.zoneEls) {
      const zy = z.id === "cave" ? Math.max(0, this.world.grid.get(Math.floor(z.x), Math.floor(z.z))?.elevation ?? 0) : 0;   // 동굴 이름표: 옮긴 자리 높이를 따라감(꾸미기)
      tmp.set(toWorldX(z.x + 0.5), 2.6 + zy, toWorldZ(z.z + 0.5)).project(camera);
      const on = this.showZones && tmp.z <= 1 && Math.abs(tmp.x) < 1.3 && Math.abs(tmp.y) < 1.3; showEl(e, on);
      if (on) placeEl(e, (tmp.x * 0.5 + 0.5) * w, (-tmp.y * 0.5 + 0.5) * h);
    }
  }
}
