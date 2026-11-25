// 계절 축제의 날: 광장 위로 색종이가 흩날림(축제가 열리는 동안만). 보기만 하는 효과라 마을 진행과는 상관없음.
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";

const CONFETTI_MAX = 160, CONFETTI_R = 6, CONFETTI_TOP = 7, CONFETTI_COLS = [0xff6b8a, 0xffd23f, 0x6fc8e8, 0x7fd08a, 0xb07cff, 0xffffff];
export class FestaView {
  constructor(scene) {
    const pos = new Float32Array(CONFETTI_MAX * 3), col = new Float32Array(CONFETTI_MAX * 3), g = new THREE.BufferGeometry(), c = new THREE.Color();
    for (let i = 0; i < CONFETTI_MAX; i++) { c.setHex(CONFETTI_COLS[i % CONFETTI_COLS.length]); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, fog: true }));
    this.pts.frustumCulled = false; this.pts.visible = false; this.pts.userData.noToon = true; scene.add(this.pts);
    // 조각마다 [각도, 광장에서 떨어진 거리, 높이, 흔들림]
    this.p = Array.from({ length: CONFETTI_MAX }, () => [Math.random() * 6.283, Math.sqrt(Math.random()) * CONFETTI_R, Math.random() * CONFETTI_TOP, Math.random() * 6.283]);
    this.amount = 1;
  }
  setAmount(f) { this.amount = Math.max(0.25, Math.min(1, f)); }
  /** festival: world.festival(없으면 숨김) · baseY: 광장 땅 높이 */
  update(dt, festival, baseY = 0) {
    this.pts.visible = !!festival; if (!festival) return;
    const n = Math.floor(CONFETTI_MAX * this.amount), a = this.pts.geometry.attributes.position.array, cx = toWorldX(festival.x), cz = toWorldZ(festival.z);
    for (let i = 0; i < n; i++) {
      const q = this.p[i]; q[2] -= (0.9 + (i % 5) * 0.12) * dt; q[3] += dt * 2.2;
      if (q[2] < 0) { q[2] = CONFETTI_TOP; q[0] = Math.random() * 6.283; q[1] = Math.sqrt(Math.random()) * CONFETTI_R; }
      a[i * 3] = cx + Math.cos(q[0]) * q[1] + Math.sin(q[3]) * 0.25; a[i * 3 + 1] = baseY + q[2]; a[i * 3 + 2] = cz + Math.sin(q[0]) * q[1] + Math.cos(q[3] * 0.8) * 0.25;
    }
    this.pts.geometry.setDrawRange(0, n); this.pts.geometry.attributes.position.needsUpdate = true;
  }
}
