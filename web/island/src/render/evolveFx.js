// 🌟 변신 연출(화면만, world.evoFx를 읽음 · 월드를 바꾸지 않음): 약 2.2초.
//  빙글(World.stepEvoFx가 몸을 돌림) → 흰 빛 공이 커지며 밝아짐 → 가장 밝을 때(절반) 월드가 모습을 바꾸고 views.js가 새 모델로 바꿔 끼움 → 빛이 줄며 반짝이가 터짐.
//  아직 변신 전 예고(evoSoon)인 갈매미 둘레엔 가끔 작은 반짝이.
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";

const GLOW_GEO = new THREE.SphereGeometry(1, 20, 14), SPARK_GEO = new THREE.OctahedronGeometry(0.06, 0);
/** 빛 세기(0~1): t = 남은 시간 비율(1 → 0). 절반에서 가장 밝음 */
export const glowAt = k => Math.max(0, 1 - Math.abs(k - 0.5) * 2) ** 0.7;
export class EvolveFx {
  constructor(scene) { this.scene = scene; this.glows = new Map(); this.sparks = []; }
  burst(x, y, z, n = 26, color = 0xfff2a8) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(SPARK_GEO, new THREE.MeshBasicMaterial({ color: i % 3 ? color : 0xffffff, transparent: true, depthWrite: false }));
      const a = Math.random() * Math.PI * 2, up = 0.6 + Math.random() * 1.6, sp = 0.8 + Math.random() * 1.8;
      m.position.set(x, y, z); m.userData.v = new THREE.Vector3(Math.cos(a) * sp, up * 1.6, Math.sin(a) * sp); m.userData.t = 0.9 + Math.random() * 0.5;
      this.scene.add(m); this.sparks.push(m);
    }
  }
  update(world, dt) {
    const seen = new Set();
    for (const u of world?.units || []) {
      const f = u.evoFx, x = toWorldX(u.x), z = toWorldZ(u.z), h = Math.max(0.6, u.height ?? 0.8 * (u.scale || 1));
      if (f) {
        seen.add(u.unitId); let g = this.glows.get(u.unitId);
        if (!g) { g = new THREE.Mesh(GLOW_GEO, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); g.renderOrder = 5; this.scene.add(g); this.glows.set(u.unitId, g); g.userData.swapped = false; }
        const k = 1 - Math.max(0, f.t) / f.dur, b = glowAt(k); g.position.set(x, u.y + h * 0.55, z); g.scale.setScalar(h * (0.3 + b * 0.62)); g.material.opacity = 0.1 + b * 0.72;
        if (f.swapped && !g.userData.swapped) { g.userData.swapped = true; this.burst(x, u.y + h * 0.6, z, 34); }
        if (Math.random() < dt * 20) this.burst(x, u.y + h * 0.5, z, 1, 0xfff7d0);
      } else if (u.evoSoon != null && !u.evo && !u.insideBuildingId && Math.random() < dt * 0.5) this.burst(x, u.y + h * 0.7, z, 3, 0xbff5c8);   // 전날 예고: 가끔 연둣빛 반짝
    }
    for (const [id, g] of this.glows) if (!seen.has(id)) { this.scene.remove(g); g.material.dispose(); this.glows.delete(id); }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const m = this.sparks[i], v = m.userData.v; m.userData.t -= dt; v.y -= 4.5 * dt; m.position.addScaledVector(v, dt); m.rotation.y += dt * 6; m.material.opacity = Math.max(0, Math.min(1, m.userData.t * 1.6));
      if (m.userData.t <= 0) { this.scene.remove(m); m.material.dispose(); this.sparks.splice(i, 1); }
    }
  }
}
