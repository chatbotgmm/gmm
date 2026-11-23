// 월드 상태를 따라 그리는 뷰: 건물, 해안 모듈, 유닛. 월드는 그림을 모르고, 뷰가 이벤트와 매 프레임 상태를 읽는다.
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";
import { BUILDINGS, MODULES } from "../data/catalog.js";
import { modelFor } from "./assets.js";
import { buildingPlaceholder, modulePlaceholder, unitPlaceholder } from "./placeholders.js";

export class BuildingViews {
  constructor(scene, world, overlay) {
    this.scene = scene; this.views = new Map(); this.overlay = overlay;
    world.on("buildingAdded", b => this.add(b));
    world.on("buildingRemoved", b => this.remove(b.id));
    for (const b of world.buildings.values()) this.add(b);
  }
  async add(b) {
    const def = BUILDINGS[b.defId], holder = new THREE.Group();
    holder.position.set(toWorldX(b.x + (b.rot % 2 ? def.footprint.d : def.footprint.w) / 2), b.elevation ?? 0,
                        toWorldZ(b.z + (b.rot % 2 ? def.footprint.w : def.footprint.d) / 2));
    holder.rotation.y = b.rot * Math.PI / 2; holder.userData.buildingId = b.id;
    const badge = document.createElement("div"); badge.className = "badge"; badge.hidden = true; this.overlay.appendChild(badge);
    const v = { holder, badge, building: b, height: def.height * 1.7 }; this.views.set(b.id, v); this.scene.add(holder);
    const model = await modelFor(def, () => buildingPlaceholder(def));
    if (this.views.get(b.id) === v) holder.add(model);                           // 불러오는 사이 철거됐으면 버림
  }
  remove(id) { const v = this.views.get(id); if (!v) return; this.scene.remove(v.holder); v.badge.remove(); this.views.delete(id); }
  setHighlight(id) {                                                              // 철거 도구가 가리키는 건물을 붉게
    for (const [bid, v] of this.views) v.holder.traverse(o => { if (o.isMesh) {
      if (!o.userData.baseMat) o.userData.baseMat = o.material;
      o.material = bid === id ? (o.userData.redMat ||= Object.assign(o.userData.baseMat.clone(), { emissive: new THREE.Color(0xd9433a), emissiveIntensity: 0.55 })) : o.userData.baseMat;
    } });
  }
  // 건물 위 표시: 안에 있는 갈매미 수(건물 밖에서도 안의 상태가 유지됨을 보여 줌)
  updateBadges(camera, w, h, tmp = new THREE.Vector3()) {
    for (const v of this.views.values()) {
      const n = v.building.occupants.length; v.badge.hidden = n === 0; if (!n) continue;
      tmp.set(v.holder.position.x, v.holder.position.y + v.height, v.holder.position.z).project(camera);
      v.badge.textContent = `🐦 ${n}`; v.badge.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`; v.badge.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`;
      if (tmp.z > 1) v.badge.hidden = true;
    }
  }
}

export async function addModuleViews(scene, world) {
  for (const m of world.modules) {
    const def = MODULES[m.defId], cellsWorld = m.cells.map(([x, z]) => [toWorldX(x + 0.5), toWorldZ(z + 0.5)]);
    const obj = await modelFor(def.asset ? def : { asset: null }, () => modulePlaceholder(m.defId, cellsWorld, m.rot));
    obj.name = m.id; scene.add(obj);
  }
}

export class UnitViews {
  constructor(scene, world) {
    this.world = world; this.views = world.units.map(u => {
      const g = unitPlaceholder(u.scale || 1); g.userData.unitId = u.unitId; scene.add(g); return g;
    });
  }
  sync() {
    this.world.units.forEach((u, i) => {
      const g = this.views[i]; g.visible = !u.insideBuildingId;
      g.position.set(toWorldX(u.x), u.y, toWorldZ(u.z));
      let d = u.heading - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * 0.25;   // 몸 돌리기 부드럽게
      const walking = u.path && u.pathIndex < u.path.length;
      g.children[0].position.y = walking ? Math.abs(Math.sin(performance.now() / 110 + i)) * 0.05 : 0;     // 걸을 때 콩콩
    });
  }
}
