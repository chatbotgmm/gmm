// 두 손가락 손짓(휴대폰): 한 손가락을 축으로 다른 손가락을 돌리면(두 손가락을 잇는 선이 돌아가면) 화면이 그만큼 돌고,
// 손가락 사이를 벌리거나 오므리면 확대·축소. 두 손가락을 같이 끄는 것만으로는 돌지 않는다.
// (OrbitControls의 두 손가락은 끄고 이것이 맡음 — tools.applyControls에서 touches.TWO = null)
import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);

export class TwoFinger {
  constructor({ dom, camera, controls }) {
    this.camera = camera; this.controls = controls; this.pts = new Map(); this.prev = null;
    dom.addEventListener("pointerdown", e => { if (e.pointerType !== "touch") return; this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.prev = this.measure(); });
    addEventListener("pointermove", e => {
      if (!this.pts.has(e.pointerId)) return;
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const now = this.measure(); if (!now || !this.prev) { this.prev = now; return; }
      let da = now.a - this.prev.a; da = Math.atan2(Math.sin(da), Math.cos(da));       // 두 손가락을 잇는 선이 돈 각도
      this.apply(da, this.prev.d / Math.max(1, now.d)); this.prev = now;
    });
    const end = e => { if (this.pts.delete(e.pointerId)) this.prev = this.measure(); };
    addEventListener("pointerup", end); addEventListener("pointercancel", end);
  }
  /** 두 손가락이면 { a: 잇는 선의 화면 각도, d: 거리 }, 아니면 null */
  measure() {
    if (this.pts.size !== 2) return null;
    const [p, q] = [...this.pts.values()];
    return { a: Math.atan2(q.y - p.y, q.x - p.x), d: Math.hypot(q.x - p.x, q.y - p.y) };
  }
  /** da: 손가락이 돈 각도(화면, 시계 방향 +) → 땅이 같은 방향으로 돌아 보이게 카메라를 반대로 돌림. zoom: 1보다 크면 멀어짐 */
  apply(da, zoom) {
    const t = this.controls.target, off = this.camera.position.clone().sub(t);
    if (Math.abs(da) > 1e-4) off.applyAxisAngle(UP, da);
    const len = THREE.MathUtils.clamp(off.length() * zoom, this.controls.minDistance, this.controls.maxDistance);
    off.setLength(len); this.camera.position.copy(t).add(off);
  }
}
