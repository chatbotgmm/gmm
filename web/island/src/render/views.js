// 월드 상태를 따라 그리는 뷰: 건물, 해안 모듈, 유닛. 월드는 그림을 모르고, 뷰가 이벤트와 매 프레임 상태를 읽는다.
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";
import { BUILDINGS, MODULES } from "../data/catalog.js";
import { modelFor } from "./assets.js";
import { buildingPlaceholder, modulePlaceholder, unitPlaceholder } from "./placeholders.js";
import { tintRoofs } from "./roofTint.js";

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
    const v = { holder, badge, building: b, height: def.height + 0.4 }; this.views.set(b.id, v); this.scene.add(holder);
    const model = await modelFor(def, () => buildingPlaceholder(def));
    if (this.views.get(b.id) !== v) return;                                       // 불러오는 사이 철거됐으면 버림
    if (def.asset) { tintRoofs(model, def.roof); model.rotation.y = def.modelYaw ?? 0; }   // 지붕 초록 → 테라코타·하늘색, 정문을 +z로
    holder.add(model);
    v.height = new THREE.Box3().setFromObject(model).max.y + 0.35;                // 🐦 표시는 실제 지붕 위에
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
      const n = v.building.occupants.length; v.badge.hidden = n === 0; if (!n) continue;
      tmp.set(v.holder.position.x, v.holder.position.y + v.height, v.holder.position.z).project(camera);
      v.badge.textContent = `🐦 ${n}`; v.badge.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`; v.badge.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`;
      if (tmp.z > 1) v.badge.hidden = true;
    }
  }
}

export async function addModuleViews(scene, world) {
  await Promise.all(world.modules.map(async m => {
    const def = MODULES[m.defId], cellsWorld = m.cells.map(([x, z]) => [toWorldX(x + 0.5), toWorldZ(z + 0.5)]);
    const asset = def.assets ? def.assets[(m.variant ?? 0) % def.assets.length] : def.asset;
    if (!asset) { const obj = modulePlaceholder(m.defId, cellsWorld, m.rot); obj.name = m.id; scene.add(obj); return; }
    // 모델 하나짜리(1칸) 모듈: 칸 가운데, 그 칸 높이에 둔다
    const [x, z] = m.cells[0], obj = await modelFor({ footprint: { w: def.viewSize ?? 1, d: def.viewSize ?? 1 } }, () => modulePlaceholder(m.defId, [[0, 0]], 0), asset);
    obj.position.set(cellsWorld[0][0], world.grid.get(x, z).elevation, cellsWorld[0][1]); obj.rotation.y = m.rot * Math.PI / 2;
    obj.name = m.id; scene.add(obj);
  }));
}

export class UnitViews {
  constructor(scene, world) {
    this.world = world; this.chars = [];
    this.views = world.units.map(u => {
      const g = new THREE.Group(), cap = unitPlaceholder(u.scale || 1); g.add(cap); g.userData.unitId = u.unitId; scene.add(g);
      return { g, cap, ch: null };
    });
  }
  /** 기존 갈매미 모델로 바꾼다(i번째 유닛 ↔ chars[i]). 모델을 못 불러온 유닛은 캡슐 그대로. */
  async useCharacters(set, loadCharacter) {
    const results = await Promise.allSettled(this.views.map((v, i) => loadCharacter(set.dir, set.chars[i % set.chars.length])));
    results.forEach((r, i) => {
      const v = this.views[i];
      if (r.status !== "fulfilled") { console.warn("갈매미 모델을 못 불러와 캡슐을 씁니다", r.reason); return; }
      v.g.remove(v.cap); v.g.add(r.value.root); v.ch = r.value;
    });
    return results.filter(r => r.status === "fulfilled").length;
  }
  sync(dt, playAnim, walkScale = 2.2, runScale = 1.5) {
    this.world.units.forEach((u, i) => {
      const { g, cap, ch } = this.views[i]; g.visible = !u.insideBuildingId;
      g.position.set(toWorldX(u.x), u.y, toWorldZ(u.z));
      let d = u.heading - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, dt * 10);   // 몸 돌리기 부드럽게
      const walking = !!u.path && u.pathIndex < u.path.length;
      if (ch) {                                                    // 진짜 모델: Idle / Walk / Run 애니메이션
        if (!walking) playAnim(ch, "Idle", 1); else if (u.running) playAnim(ch, "Run", runScale); else playAnim(ch, "Walk", walkScale);
        if (g.visible) ch.mixer.update(dt);
      } else {
        cap.position.y = walking ? Math.abs(Math.sin(performance.now() / 110 + i)) * 0.05 : 0;   // 캡슐: 걸을 때 콩콩
      }
    });
  }
}
