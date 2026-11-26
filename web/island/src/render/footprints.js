// 발자국: 눈 쌓인 땅(겨울)과 모래사장에 갈매미가 걸을 때마다 물갈퀴 발자국을 찍고 25초에 걸쳐 사라짐.
// 판 하나짜리 InstancedMesh를 돌려 씀(그리기 호출 1번). 개수는 그래픽 설정(성능 우선 0 = 끔). 물·다리·포장도로·집 안에선 안 찍음.
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";

const LIFE = 25, FADE = 5, CAP_MAX = 500;
function printTex() {                                                            // 세 발가락 물갈퀴 발자국(흰색 + 투명 배경)
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); g.fillStyle = "#fff";
  g.beginPath(); g.moveTo(32, 54); g.lineTo(10, 18); g.quadraticCurveTo(20, 12, 24, 20); g.lineTo(32, 10); g.lineTo(40, 20); g.quadraticCurveTo(44, 12, 54, 18); g.closePath(); g.fill();
  g.globalCompositeOperation = "destination-out"; g.beginPath(); g.moveTo(32, 46); g.lineTo(19, 24); g.lineTo(32, 18); g.lineTo(45, 24); g.closePath(); g.globalAlpha = 0.45; g.fill();   // 물갈퀴는 옅게
  const t = new THREE.CanvasTexture(c); return t;
}
export class Footprints {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(0.17, 0.2).rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: printTex(), transparent: true, depthWrite: false, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }), CAP_MAX);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; this.mesh.userData.noToon = true; scene.add(this.mesh);
    this.mesh.setColorAt(0, new THREE.Color()); this.prints = []; this.next = 0; this.cap = 200; this.last = new Map();
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.up = new THREE.Vector3(0, 1, 0); this.col = new THREE.Color(); this.v1 = new THREE.Vector3(); this.v2 = new THREE.Vector3();
  }
  setCapacity(n) { this.cap = Math.min(CAP_MAX, n ?? 200); if (this.prints.length > this.cap) this.prints.length = this.cap; this.next %= Math.max(1, this.cap); this.mesh.visible = this.cap > 0; }
  /** 이 칸에 발자국이 남는가: 'snow'(눈) / 'sand'(모래) / null */
  surface(world, x, z) {
    const c = world.grid.get(Math.floor(x), Math.floor(z)); if (!c || c.occupiedId || world.grid.isWater(Math.floor(x), Math.floor(z))) return null;
    if (c.groundType === "Cobble" || c.groundType === "WoodDeck") return null;
    if (world.snow > 0.25 && c.elevation > -0.06) return "snow";
    return c.groundType === "Sand" ? "sand" : null;
  }
  stamp(world, u, side) {
    const s = u.scale || 1, h = u.heading || 0, lx = Math.cos(h) * 0.065 * s * side, lz = -Math.sin(h) * 0.065 * s * side;   // 왼발·오른발 옆으로 벌림
    if (!this.cap) return; const x = u.x + lx, z = u.z + lz, kind = this.surface(world, x, z); if (!kind) return;
    const p = { x, z, y: world.standHeight(x, z) + 0.012, h, s: 0.8 + 0.4 * s, t: LIFE, kind };
    if (this.prints.length < this.cap) this.prints.push(p); else { this.prints[this.next] = p; this.next = (this.next + 1) % this.cap; }
  }
  update(dt, world) {
    if (!this.cap && !this.onStep) { this.mesh.count = 0; return; }
    for (const u of world.units) {                                                // 걸은 거리로 발 디딤(0.32 m × 몸 크기마다 번갈아)
      const cur = this.last.get(u); if (!cur) { this.last.set(u, { x: u.x, z: u.z, side: 1, acc: 0 }); continue; }
      const d = Math.hypot(u.x - cur.x, u.z - cur.z); cur.x = u.x; cur.z = u.z;       // 갈매미마다 기록 하나를 고쳐 씀(매 프레임 새로 만들지 않음)
      if (u.insideBuildingId || u.swimming || u.sailing || u.state === "Held" || d > 1.5) continue;   // 옮겨진 것(순간 이동)은 빼고
      cur.acc += d;
      if (cur.acc > 0.32 * (u.scale || 1)) { cur.acc = 0; cur.side = -cur.side; this.stamp(world, u, cur.side); if (u.running ? cur.side > 0 : true) this.onStep?.(u, this.surface(world, u.x, u.z)); }
    }
    let n = 0, dead = 0;
    for (let i = 0; i < this.prints.length; i++) {
      const p = this.prints[i]; p.t -= dt; if (p.t <= 0) { dead++; continue; }
      const k = Math.min(1, p.t / FADE);                                            // 마지막 5초 동안 작아지며 사라짐
      this.q.setFromAxisAngle(this.up, p.h); this.m4.compose(this.v1.set(toWorldX(p.x), p.y, toWorldZ(p.z)), this.q, this.v2.set(p.s * k, 1, p.s * k));
      this.mesh.setMatrixAt(n, this.m4); this.mesh.setColorAt(n, this.col.setHex(p.kind === "snow" ? 0x7088aa : 0x9a7a4a)); n++;
    }
    if (dead) { this.prints = this.prints.filter(p => p.t > 0); this.next = this.prints.length % Math.max(1, this.cap); }
    if (!n && !this.mesh.count) return;                                             // 발자국이 없으면 GPU로 다시 올리지 않음
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
