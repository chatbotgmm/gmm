// 둘러보기 모드에서 갈매미 다루기.
// - 갈매미를 눌렀다 떼면(거의 안 움직이고): 카메라가 그 갈매미를 따라감. 빈 땅을 누르면 따라가기 끔.
// - 갈매미를 누른 채 끌면: 들어 올려 옮기고, 떼면 그 칸에 내려놓음(건물 칸이면 건물로 들어감, 바다면 제자리).
// 갈매미를 누르지 않은 드래그는 OrbitControls(시야 돌리기)가 그대로 받는다.
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";
import { josa } from "../util.js";

const DRAG_PX = 6;

// 물 칸인데 2칸 안에 걸을 수 있는 땅이 있으면(물가) 내려놓으면 헤엄침
const nearLand = (g, x, z) => { for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.hypot(dx, dz) <= 2.5 && g.isWalkable(x + dx, z + dz)) return true; return false; };

export class UnitControl {
  constructor({ dom, camera, controls, tools, getWorld, getUnitViews, onStatus, onFollow }) {
    Object.assign(this, { dom, camera, controls, tools, getWorld, getUnitViews, onStatus, onFollow });
    this.follow = null; this.press = null; this.held = null;
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    this.mark = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 24), new THREE.MeshBasicMaterial({ color: 0x4fcf78, transparent: true, opacity: 0.85, depthWrite: false }));
    this.mark.rotation.x = -Math.PI / 2; this.mark.visible = false; this.mark.renderOrder = 3; tools.scene.add(this.mark);
    dom.addEventListener("pointerdown", e => this.down(e), { capture: true });      // OrbitControls보다 먼저
    addEventListener("pointermove", e => this.move(e));
    addEventListener("pointerup", e => this.up(e));
    addEventListener("pointercancel", () => this.cancel());                        // 브라우저가 손짓을 가져가면
  }

  unitAt(cx, cy) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); this.ray.setFromCamera(this.ndc, this.camera);
    const views = this.getUnitViews(), picks = views.views.filter(v => v.g.visible).map(v => v.pick);
    const hit = this.ray.intersectObjects(picks, false)[0];
    return hit ? this.getWorld().units.find(u => u.unitId === hit.object.userData.unitId) : null;
  }

  /** 갈매미 잡기를 취소: 들고 있었으면 원래 자리로, 시야 조작은 다시 켬. */
  cancel() {
    if (!this.press) return;
    const u = this.held;
    if (u) { this.getWorld().dropUnit(u, Math.floor(u.heldFrom.x), Math.floor(u.heldFrom.z)); this.onStatus(""); }
    this.press = null; this.held = null; this.heldGoal = null; this.target = null; this.mark.visible = false; this.controls.enabled = true;
  }
  down(e) {
    // 두 번째 손가락이 닿으면(두 손가락 확대·회전) 갈매미 잡기를 취소하고 시야 조작에 넘긴다
    if (!e.isPrimary) { if (this.press) this.cancel(); return; }
    if (this.tools.mode !== "view" || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    const u = this.unitAt(e.clientX, e.clientY);
    this.press = { x: e.clientX, y: e.clientY, unit: u };
    if (u) this.controls.enabled = false;                       // 갈매미를 잡은 누름은 시야 돌리기에 안 씀
  }
  move(e) {
    const p = this.press; if (!p || !e.isPrimary) return;
    if (p.unit && !this.held && Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_PX) {
      if (this.getWorld().pickUpUnit(p.unit)) { this.held = p.unit; this.onStatus(`${josa(p.unit.name, "을", "를")} 들었어요 · 내려놓을 곳에서 떼세요`); }
    }
    if (this.held) {
      const c = this.tools.pickPoint(e.clientX, e.clientY), w = this.getWorld();
      if (c) {
        const b = w.buildingAt(c.x, c.z), ok = !!b || w.grid.isWalkable(c.x, c.z) || !w.grid.isWater(c.x, c.z) || nearLand(w.grid, c.x, c.z);
        // 갈매미 발이 마우스 끝에 오게: 땅에서 0.5 m 띄운 높이의 평면과 마우스 광선이 만나는 점(update에서 부드럽게 따라감)
        const ground = b ? b.elevation ?? 0 : Math.max(w.standHeight(c.gx, c.gz), -0.18), lift = ground + 0.5;
        const q = this.tools.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -lift), new THREE.Vector3());
        this.heldGoal = q ? { x: c.gx + (q.x - toWorldX(c.gx)), z: c.gz + (q.z - toWorldZ(c.gz)), y: lift, at: { x: c.gx, z: c.gz } } : { x: c.gx, z: c.gz, y: lift, at: { x: c.gx, z: c.gz } };
        this.mark.visible = true; this.mark.position.set(toWorldX(c.gx), ground + 0.04, toWorldZ(c.gz));   // 내려놓일 자리(마우스 아래 땅)
        this.mark.material.color.setHex(ok ? 0x4fcf78 : 0xe0574f);
        this.target = c;
      }
    }
  }
  up(e) {
    const p = this.press; if (!p || !e.isPrimary) return;
    this.press = null; this.controls.enabled = true; this.mark.visible = false;
    const w = this.getWorld();
    if (this.held) {
      const u = this.held, c = this.target || { x: Math.floor(u.heldFrom.x), z: Math.floor(u.heldFrom.z) }; this.held = null; this.target = null;
      const g = this.heldGoal; this.heldGoal = null;
      const r = w.dropUnit(u, c.x, c.z, g?.at && Math.floor(g.at.x) === c.x && Math.floor(g.at.z) === c.z ? g.at : null);
      this.onStatus(r.ok ? (r.building ? `${josa(u.name, "이", "가")} 건물에 들어갔어요` : r.act ? `${u.name}: ${r.act.label}` : `${josa(u.name, "을", "를")} 옮겼어요`) : r.reason);
      return;
    }
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_PX) return;   // 시야를 돌린 드래그
    this.setFollow(p.unit && this.follow !== p.unit ? p.unit : null);
  }

  setFollow(u) { this.follow = u; this.onFollow?.(u); if (u) this.onStatus(`${josa(u.name, "을", "를")} 따라가요 · 빈 땅을 누르면 그만`); }

  /** 매 프레임: 따라가는 갈매미 쪽으로 카메라 중심을 부드럽게 옮기고 카메라도 같이 옮긴다. */
  update(dt) {
    const h = this.held, g = this.heldGoal;
    if (h && g) {                                                                   // 들고 있는 갈매미: 마우스 아래 점을 빠르게, 부드럽게 따라감
      const a = 1 - Math.exp(-dt * 22);
      h.x += (g.x - h.x) * a; h.z += (g.z - h.z) * a; h.y += (g.y - h.y) * a;
    }
    const u = this.follow; if (!u || this.held === u) return;
    if (!this.getWorld().units.includes(u)) { this.setFollow(null); return; }
    const t = new THREE.Vector3(toWorldX(u.x), u.y + (u.height ?? 0.8) * 0.5, toWorldZ(u.z)), d = t.sub(this.controls.target).multiplyScalar(Math.min(1, 6 * dt));
    this.controls.target.add(d); this.camera.position.add(d);
  }
}
