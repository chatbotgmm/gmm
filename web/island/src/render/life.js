// 마을 생활 그림: 나무 흔들림·쓰러짐·그루터기·다시 자람, 광석 흔들림·불꽃·사라짐, 씨앗, 말풍선, 구역 이름.
// 월드 이벤트(treeHit, treeFell, …)를 받아 움직임을 만들고, 매 프레임 update(dt)로 진행한다.
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";
import { PROPS } from "../data/catalog.js";
import { modelFor, rawModel } from "./assets.js";
import { terrainHeight } from "../world/terrain.js";

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
    const swap = c => { if (!this.cropModels || c.g.userData.model) return; c.g.clear(); const k = (c.p.x + c.p.z) % 2, src = this.cropModels[k], m = src.clone(true); m.scale.setScalar(k ? 0.6 : 0.62); c.g.add(m); c.g.userData.model = true; };
    Promise.all(["assets/props/carrot_{T}.glb", "assets/props/cabbage_{T}.glb"].map(u => rawModel(u))).then(ms => { this.cropModels = ms; this.crops.forEach(swap); }).catch(() => {});
    this.swapCrop = swap;
    world.plots.forEach(addCrop);
    world.on("plotAdded", addCrop);                                                  // 목수가 지은 밭
    world.on("plotRemoved", p => { const i = this.crops.findIndex(c => c.p === p); if (i >= 0) { scene.remove(this.crops[i].g); this.crops.splice(i, 1); } });
    // 말풍선(유닛마다 하나)과 구역 이름
    this.emotes = [];                                                              // 갈매미마다 말풍선(소환되면 그때 만듦)
    this.emoteFor = i => this.emotes[i] ||= (() => { const e = document.createElement("div"); e.className = "emote"; e.hidden = true; overlay.appendChild(e); return e; })();
    this.zoneEls = world.zones.map(z => { const e = document.createElement("div"); e.className = "zone"; e.textContent = z.label; overlay.appendChild(e); return { z, e }; });
    this.showZones = true;
  }
  attachModules(map) { this.objs = map; for (const [id, o] of map) o.userData.base = { scale: o.scale.x, x: o.position.x, y: o.position.y, z: o.position.z }; }

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
      s.position.set(toWorldX(tree.x + 0.5), terrainHeight(this.world.grid, tree.x + 0.5, tree.z + 0.5), toWorldZ(tree.z + 0.5));
      this.scene.add(s); this.stumps.set(tree.id, s);
    }
    if (s) s.visible = on && !tree.alive;
  }
  vanish(id) { const o = this.objs.get(id); if (o) this.anims.push({ kind: "vanish", o, t: 0 }); }
  grow(id) {
    const o = this.objs.get(id); if (!o) return;
    const tree = this.world.trees.find(t => t.id === id); if (tree) this.showStump(tree, false);
    o.visible = true; o.rotation.x = 0; o.rotation.z = 0; this.anims.push({ kind: "grow", o, t: 0 });
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
  spark(o) {
    const y = terrainHeight(this.world.grid, o.x + 0.5, o.z + 0.5) + 0.2;
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(this.sparkGeo, this.sparkMat); m.position.set(toWorldX(o.x + 0.5), y, toWorldZ(o.z + 0.5)); this.scene.add(m);
      this.sparks.push({ m, v: new THREE.Vector3(Math.random() * 2 - 1, 1.2 + Math.random(), Math.random() * 2 - 1), t: 0.5 });
    }
  }

  update(dt, camera, w, h, tmp = new THREE.Vector3()) {
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
        a.t = Math.min(1, a.t + dt * 0.7); o.scale.setScalar(base.scale * (0.15 + 0.85 * a.t));
        if (a.t >= 1) { o.scale.setScalar(base.scale); this.anims.splice(i, 1); }
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]; s.t -= dt; s.v.y -= (s.leaf ? 0.9 : 9.8) * dt; if (s.leaf) { s.v.y = Math.max(s.v.y, -0.6); s.m.rotation.x += dt * 3; s.m.rotation.z += dt * 2; } s.m.position.addScaledVector(s.v, dt);   // 잎은 천천히 팔랑
      if (s.t <= 0) { this.scene.remove(s.m); this.sparks.splice(i, 1); }
    }
    for (const { p, g } of this.crops) {
      const grow = p.stage === "growing" ? 1 - Math.max(0, p.t) / (p.grow || 40) : p.stage === "ripe" ? 1 : 0;
      g.visible = p.stage !== "empty"; g.scale.setScalar(0.25 + 0.75 * grow);
      if (!g.userData.model) for (const m of g.children) m.material = p.stage === "ripe" ? this.cropRipe : this.cropGreen;
      else g.position.y = this.world.standHeight(p.x + 0.5, p.z + 0.5) + 0.06 - (p.stage === "ripe" ? 0 : 0.05 * (1 - grow));   // 모델: 자라며 커지고 땅 위로
    }
    // 말풍선
    this.world.units.forEach((u, i) => {
      const e = this.emoteFor(i), show = u.emoteT > 0 && !!u.emoteText && !u.insideBuildingId; e.hidden = !show; if (!show) { e.dataset.t = ""; return; }
      tmp.set(toWorldX(u.x), u.y + (u.height ?? 0.8) + 0.12, toWorldZ(u.z));
      const dist = camera.position.distanceTo(tmp); tmp.project(camera);
      if (tmp.z > 1 || dist > 75) { e.hidden = true; return; }                    // 너무 멀면 숨김(화면이 어지럽지 않게)
      if (e.dataset.t !== u.emoteText) {                                          // 새 말: 모양 고르고 톡 튀어나오게
        e.dataset.t = u.emoteText; e.textContent = u.emoteText;
        const t = u.emoteText, think = t.startsWith("💭"), icon = [...t].length <= 2 || /^(…|zZ…|!\?)$/.test(t);
        e.className = "emote" + (think ? " think" : icon ? " icon" : ""); void e.offsetWidth; e.classList.add("pop");
      }
      const sc = THREE.MathUtils.clamp(1.15 - dist / 90, 0.6, 1.1);                // 멀수록 작게
      e.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`; e.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`;
      e.style.setProperty("--s", sc.toFixed(2)); e.style.opacity = Math.min(1, u.emoteT / 0.3).toFixed(2);   // 끝날 때 살짝 사라짐
    });
    for (const { z, e } of this.zoneEls) {
      tmp.set(toWorldX(z.x + 0.5), 2.6, toWorldZ(z.z + 0.5)).project(camera);
      e.hidden = !this.showZones || tmp.z > 1;
      e.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`; e.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`;
    }
  }
}
