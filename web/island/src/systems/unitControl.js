// 둘러보기 모드에서 갈매미 다루기.
// - 갈매미를 눌렀다 떼면(거의 안 움직이고): 카메라가 그 갈매미를 따라가며 톡 반응(onPoke). 이미 따라가는 갈매미를 누르면 톡만. 빈 땅을 누르면 따라가기 끔.
// - 갈매미를 길게 누르거나(LONG_MS) 누른 채 끌면: 들어 올려 옮기고, 떼면 그 칸에 내려놓음(건물 칸이면 건물로 들어감, 바다면 제자리).
// 갈매미를 누르지 않은 드래그는 OrbitControls(시야 돌리기)가 그대로 받는다.
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";
import { josa } from "../util.js";
import { PICK_PX, nearestOnScreen, ndcToScreen, followZoomLen, followBackLen, overviewGoal } from "./camAssist.js";

const DRAG_PX = 6;
export const LONG_MS = 450;   // 이만큼 누르고 있으면 끌지 않아도 들어 올림(깜짝 소동 🆘 풀기 — units/fuss.js)

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
    addEventListener("pointercancel", () => this.cancel());
    dom.addEventListener("contextmenu", e => { if (this.press?.unit || this.held) e.preventDefault(); });   // 안드로이드 길게 누르기 메뉴가 들기를 끊지 않게
    dom.addEventListener("wheel", () => { this.zoom = null; }, { passive: true });                        // 브라우저가 손짓을 가져가면
  }

  unitAt(cx, cy) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); this.ray.setFromCamera(this.ndc, this.camera);
    const views = this.getUnitViews(), picks = views.views.filter(v => v.g.visible).map(v => v.pick);
    const hit = this.ray.intersectObjects(picks, false)[0];
    return hit ? this.getWorld().units.find(u => u.unitId === hit.object.userData.unitId) : null;
  }
  /** 누르기 판정을 넓힘(탭만, 끌어 옮기기는 정확히 잡은 갈매미만): 누른 곳에서 화면 PICK_PX 안의 가장 가까운 갈매미(몸 가운데 높이) */
  unitNear(cx, cy, r = PICK_PX) {
    const rect = this.dom.getBoundingClientRect(), w = this.getWorld(), v = new THREE.Vector3(), pts = [];
    for (const view of this.getUnitViews().views) {
      if (!view.g.visible) continue;
      const u = w.units.find(o => o.unitId === view.pick?.userData?.unitId); if (!u || u.insideBuildingId) continue;
      v.set(toWorldX(u.x), u.y + (u.height ?? 0.8) * 0.5, toWorldZ(u.z)).project(this.camera);
      const s = ndcToScreen(v, rect); if (s) pts.push({ x: s.x, y: s.y, u });
    }
    return nearestOnScreen(pts, cx, cy, r)?.u || null;
  }

  /** 갈매미 잡기를 취소: 들고 있었으면 원래 자리로, 시야 조작은 다시 켬. */
  cancel() {
    if (!this.press) return;
    clearTimeout(this.press.lt); const u = this.held;
    if (u) { this.getWorld().dropUnit(u, Math.floor(u.heldFrom.x), Math.floor(u.heldFrom.z)); this.onStatus(""); }
    this.press = null; this.held = null; this.heldGoal = null; this.target = null; this.mark.visible = false; this.controls.enabled = true;
  }
  down(e) {
    this.zoom = null;                                                              // 직접 조작하면 가까이 보기를 멈춤
    // 두 번째 손가락이 닿으면(두 손가락 확대·회전) 갈매미 잡기를 취소하고 시야 조작에 넘긴다
    if (!e.isPrimary) { if (this.press) this.cancel(); return; }
    if (this.tools.mode !== "view" || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    const u = this.unitAt(e.clientX, e.clientY);
    this.press = { x: e.clientX, y: e.clientY, unit: u, near: u ? null : this.unitNear(e.clientX, e.clientY) };   // near: 탭으로 끝나면 이 갈매미(끌기는 시야 돌리기 그대로)
    if (u) this.controls.enabled = false;                       // 갈매미를 잡은 누름은 시야 돌리기에 안 씀
    if (u || this.press.near) this.press.lt = setTimeout(() => this.longPress(), LONG_MS);   // 길게 누르기는 손가락 둘레(near) 갈매미도 들어 올림(🆘 소동 풀기가 정확히 맞히지 않아도 되게)
  }
  /** 길게 누름: 끌지 않아도 들어 올림(손가락 아래 칸을 내려놓을 자리로). near(둘레 갈매미)는 손가락이 거의 안 움직였을 때만 — 시야를 끌던 중이면 안 듦 */
  longPress() {
    const p = this.press; if (!p || this.held || this.tools.mode !== "view") return;
    if (!p.unit && p.near && Math.hypot((p.lx ?? p.x) - p.x, (p.ly ?? p.y) - p.y) <= DRAG_PX) { p.unit = p.near; this.controls.enabled = false; }
    if (!p.unit) return;
    if (!this.getWorld().pickUpUnit(p.unit)) return;
    this.held = p.unit; p.long = true; try { navigator.vibrate?.(12); } catch {}
    this.onStatus(`${josa(p.unit.name, "을", "를")} 들었어요. 옮길 곳까지 끌고 가서 놓아요`);
    this.move({ clientX: p.lx ?? p.x, clientY: p.ly ?? p.y, isPrimary: true });
  }
  move(e) {
    const p = this.press; if (!p || !e.isPrimary) return;
    p.lx = e.clientX; p.ly = e.clientY;
    if (p.unit && !this.held && Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_PX) {
      if (this.getWorld().pickUpUnit(p.unit)) { this.held = p.unit; this.onStatus(`${josa(p.unit.name, "을", "를")} 들었어요. 내려놓을 곳에서 손을 떼요`); }
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
    clearTimeout(p.lt); this.press = null; this.controls.enabled = true; this.mark.visible = false;
    const w = this.getWorld();
    if (this.held) {
      const u = this.held, c = this.target || { x: Math.floor(u.heldFrom.x), z: Math.floor(u.heldFrom.z) }; this.held = null; this.target = null;
      const g = this.heldGoal; this.heldGoal = null;
      const r = w.dropUnit(u, c.x, c.z, g?.at && Math.floor(g.at.x) === c.x && Math.floor(g.at.z) === c.z ? g.at : null);
      this.onStatus(r.ok ? (r.building ? `${josa(u.name, "이", "가")} 건물에 들어갔어요` : r.act ? `${u.name}: ${r.act.label}` : `${josa(u.name, "을", "를")} 옮겼어요`) : r.reason);
      return;
    }
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_PX) return;   // 시야를 돌린 드래그
    if (this.onTapFirst?.(e)) { this.lastTap = null; return; }            // 첫 탭 규칙: 꿈방울·반짝이를 누르면 그쪽 먼저(갈매미 따라가기·땅 누르기보다 앞, main.js)
    const pu = p.unit || p.near;                                                // 정확히 맞힌 갈매미, 아니면 손가락 둘레(PICK_PX) 안의 가장 가까운 갈매미 → 그다음이 땅·건물
    // 두 번 누르기(더블클릭·더블탭, 0.35초 안·30픽셀 안): 그곳을 가까이 보기. 갈매미면 따라가며 가까이.
    const now = performance.now(), last = this.lastTap, dbl = last && now - last.t < 350 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30;
    // 첫 탭 규칙: 이미 따라가는 갈매미를 누르면 톡(units/poke.js, 따라가기는 그대로). 따라가기를 막 시작한 탭 바로 다음 탭만 두 번 누르기(가까이 보기)
    if (pu && this.follow === pu && !(dbl && last.started)) { this.lastTap = { t: now, x: e.clientX, y: e.clientY }; this.onPoke?.(pu, false); return; }
    if (dbl) {
      this.lastTap = null;
      if (pu) { this.setFollow(pu); this.zoomIn(null); return; }
      const c = this.tools.pickPoint(e.clientX, e.clientY);
      this.setFollow(null); if (c) this.zoomIn(new THREE.Vector3(toWorldX(c.gx), Math.max(w.standHeight(c.gx, c.gz), -0.18), toWorldZ(c.gz)));
      return;
    }
    this.lastTap = { t: now, x: e.clientX, y: e.clientY, started: !!pu };
    this.setFollow(pu || null);
    if (pu) this.onPoke?.(pu, true);                                        // 따라가지 않던 갈매미 = 따라가기 + 반응
    if (!pu) { const c = this.tools.pickPoint(e.clientX, e.clientY); if (c) this.onTapGround?.(c, e); }   // 땅을 한 번 누름(반짝이면 줍기, 집이면 꾸미기 카드). e: 화면 좌표(반짝이 손가락 판정)
  }
  /** 가까이 보기: 화면 중심을 to로(없으면 따라가는 갈매미), 거리를 줄임(멀면 10 m, 가까우면 0.6배, 최소 거리까지). */
  zoomIn(to) {
    const len = this.camera.position.distanceTo(this.controls.target);
    this.zoom = { to, len: len > 14 ? 10 : Math.max(this.controls.minDistance, len * 0.6) };
  }

  /** 목록·카드·알림 칩에서 따라가기(편의성 점검 1·2번): 늘 따라가기(같은 갈매미를 다시 눌러도 풀지 않음) + 멀리 보고 있었으면 10 m로 다가감.
   *  그만두면(setFollow(null)) 다가가기 전 거리로 돌아감. 갈매미를 끌어 옮기는 중에는 다가가지 않음 */
  followClose(u) {
    if (!u) return;
    if (!this.held) {
      const len = this.camera.position.distanceTo(this.controls.target), to = followZoomLen(len);
      const back = followBackLen(this.backLen, len), rest = back != null && this.backLen == null ? this.restLen?.() : null;
      this.backLen = rest ?? back;                                                 // restLen(main.js): 가까운 비스듬히는 그만두면 기본 거리로(멀리 보던 중이었어도)
      if (to != null) this.zoom = { to: null, len: to };
    }
    if (this.follow !== u) this.setFollow(u);
  }
  /** keepDist: 그만둘 때 거리는 그대로(🏠 집 보기·방 꾸미기·새 섬 — 그곳을 보러 가는 것이라 멀리 물러나지 않음) */
  setFollow(u, keepDist = false) {
    this.follow = u; this.onFollow?.(u);
    if (u) this.onStatus(`${josa(u.name, "을", "를")} 따라가요`);
    else if (this.backLen != null) { if (!this.held && !keepDist) this.zoom = { to: null, len: this.backLen }; this.backLen = null; }   // ✕·Esc·땅 누르기: 다가가기 전 거리로
  }
  /** 🏝 마을 전체 보기(편의성 점검 9번): 따라가기를 풀고 처음 시점(높이·거리·중심)으로 부드럽게. 보던 가로 방향은 그대로.
   *  goal: 목표를 정하는 함수(없으면 camAssist.overviewGoal — 자유 회전의 처음 시점, 가까운 비스듬히는 main.js가 viewCam.overviewGoal을 넘김) */
  overview(portrait, goal = overviewGoal) {
    this.backLen = null; if (this.follow) this.setFollow(null);
    const g = goal(this.camera.position.clone().sub(this.controls.target), portrait);
    this.zoom = { to: new THREE.Vector3(g.target.x, g.target.y, g.target.z), len: g.len, off: new THREE.Vector3(g.off.x, g.off.y, g.off.z) };
  }

  /** 매 프레임: 따라가는 갈매미 쪽으로 카메라 중심을 부드럽게 옮기고 카메라도 같이 옮긴다. */
  update(dt) {
    const h = this.held, g = this.heldGoal;
    if (h && g) {                                                                   // 들고 있는 갈매미: 마우스 아래 점을 빠르게, 부드럽게 따라감
      const a = 1 - Math.exp(-dt * 22);
      h.x += (g.x - h.x) * a; h.z += (g.z - h.z) * a; h.y += (g.y - h.y) * a;
    }
    const z = this.zoom;
    if (z) {                                                                       // 가까이 보기: 부드럽게 다가감
      const a = 1 - Math.exp(-dt * 7), t = this.controls.target, off = this.camera.position.clone().sub(t);
      if (z.to) { const d = z.to.clone().sub(t).multiplyScalar(a); t.add(d); }
      if (z.off) { off.lerp(z.off, a); this.camera.position.copy(t).add(off); if (off.distanceTo(z.off) < 0.05 && (!z.to || z.to.distanceTo(t) < 0.05)) this.zoom = null; }   // 전체 보기: 높이·거리를 같이
      else { const L = off.length(); off.setLength(L + (z.len - L) * a); this.camera.position.copy(t).add(off);
        if (Math.abs(L - z.len) < 0.05 && (!z.to || z.to.distanceTo(t) < 0.05)) this.zoom = null; }
    }
    const u = this.follow; if (!u || this.held === u) return;
    if (!this.getWorld().units.includes(u)) { this.setFollow(null); return; }
    const t = new THREE.Vector3(toWorldX(u.x), u.y + (u.height ?? 0.8) * 0.5, toWorldZ(u.z)), d = t.sub(this.controls.target).multiplyScalar(Math.min(1, 6 * dt));
    this.controls.target.add(d); this.camera.position.add(d);
  }
}
