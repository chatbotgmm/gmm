// 마을 생활 그림: 나무 흔들림·쓰러짐·그루터기·다시 자람, 광석 흔들림·불꽃·사라짐, 씨앗, 말풍선, 구역 이름.
// 월드 이벤트(treeHit, treeFell, …)를 받아 움직임을 만들고, 매 프레임 update(dt)로 진행한다.
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";
import { PROPS } from "../data/catalog.js";
import { modelFor } from "./assets.js";
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
    world.on("treeHit", t => this.shake(t.id, 0.35, "z"));
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
      scene.add(g); this.crops.push({ p, g });
    };
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
    const d = Math.hypot(dir[0], dir[1]) || 1;
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
      const s = this.sparks[i]; s.t -= dt; s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt);
      if (s.t <= 0) { this.scene.remove(s.m); this.sparks.splice(i, 1); }
    }
    for (const { p, g } of this.crops) {
      const grow = p.stage === "growing" ? 1 - Math.max(0, p.t) / (p.grow || 40) : p.stage === "ripe" ? 1 : 0;
      g.visible = p.stage !== "empty"; g.scale.setScalar(0.25 + 0.75 * grow);
      for (const m of g.children) m.material = p.stage === "ripe" ? this.cropRipe : this.cropGreen;
    }
    // 말풍선
    this.world.units.forEach((u, i) => {
      const e = this.emoteFor(i), show = u.emoteT > 0 && !u.insideBuildingId; e.hidden = !show; if (!show) return;
      tmp.set(toWorldX(u.x), u.y + (u.height ?? 0.8) + 0.12, toWorldZ(u.z)).project(camera);
      if (tmp.z > 1) { e.hidden = true; return; }
      e.textContent = u.emoteText; e.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`; e.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`;
    });
    for (const { z, e } of this.zoneEls) {
      tmp.set(toWorldX(z.x + 0.5), 2.6, toWorldZ(z.z + 0.5)).project(camera);
      e.hidden = !this.showZones || tmp.z > 1;
      e.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`; e.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`;
    }
  }
}
