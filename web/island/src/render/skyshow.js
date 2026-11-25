// 드문 하늘 그림: 무지개(반원 띠, 띠 너비 방향으로 일곱 빛깔 그림 + 양 끝·가장자리는 흐리게)와 유성우(꼬리가 사라지는 빛줄기).
// 둘 다 보는 곳(화면 중심) 둘레 먼 하늘에 두고 스르르 나타났다 사라짐. 빛 계산을 안 하는 재질이라 툰·눈과 상관없음(noToon·noSnow).
import * as THREE from "three";

const STREAKS = 16, RAINBOW_SEG = 48;

/** 일곱 빛깔 띠(안쪽 보라 → 바깥 빨강), 양 가장자리는 투명 */
function rainbowTexture() {
  const c = document.createElement("canvas"); c.width = 4; c.height = 128; const g = c.getContext("2d"), grad = g.createLinearGradient(0, 128, 0, 0);
  const cols = ["rgba(150,110,230,0)", "rgba(150,110,230,.85)", "rgba(90,130,240,.9)", "rgba(80,200,230,.9)", "rgba(110,215,120,.9)", "rgba(250,230,100,.9)", "rgba(255,165,80,.9)", "rgba(245,95,95,.85)", "rgba(245,95,95,0)"];
  cols.forEach((col, i) => grad.addColorStop(i / (cols.length - 1), col)); g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class SkyShow {
  constructor(scene) {
    // 무지개: 반지름 1짜리 반원 띠(너비 0.12)를 만들고 크기는 scale로. uv.y = 띠 너비 방향, 꼭짓점 알파 = 땅에 닿는 양 끝을 흐리게
    const geo = new THREE.RingGeometry(0.88, 1, RAINBOW_SEG, 1, 0, Math.PI), pos = geo.attributes.position, uv = geo.attributes.uv, col = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), r = Math.hypot(x, y), up = Math.max(0, y / r);
      uv.setXY(i, 0.5, (r - 0.88) / 0.12); col.set([1, 1, 1, Math.min(1, up * 3.5)], i * 4);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
    this.bow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: rainbowTexture(), vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    // 유성우: 빛줄기마다 선 하나(머리는 밝고 꼬리는 까맣게 → 더하기 색이라 꼬리가 사라져 보임)
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3)); sg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3));
    this.stars = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.streaks = Array.from({ length: STREAKS }, () => ({ life: 0, wait: Math.random() * 3 }));
    for (const o of [this.bow, this.stars]) { o.visible = false; o.frustumCulled = false; o.renderOrder = 1; o.userData.noToon = true; o.material.userData.noSnow = true; scene.add(o); }
    this.kind = null; this.dir = new THREE.Vector3(0, 0, -1); this.reach = 120; this.bowK = 0; this.starK = 0;
  }
  /** sky: world.sky(없으면 null) · target: 보는 곳 · camera: 처음 뜰 때 보는 쪽 하늘에 두려고 */
  update(dt, sky, target, camera) {
    const kind = sky?.kind ?? null;
    if (kind && kind !== this.kind) {                                               // 새로 시작: 지금 카메라가 보는 쪽(수평) 먼 하늘에 자리 잡음
      camera.getWorldDirection(this.dir); this.dir.y = 0; if (this.dir.lengthSq() < 1e-4) this.dir.set(0, 0, -1); this.dir.normalize();
      this.reach = Math.max(60, (camera.far - camera.position.distanceTo(target)) * 0.7);   // 카메라 먼 거리 안쪽
    }
    this.kind = kind;
    // 무지개: 약 3초에 걸쳐 나타나고 사라짐
    this.bowK = Math.max(0, Math.min(1, this.bowK + (kind === "rainbow" ? dt : -dt) / 3)); this.bow.visible = this.bowK > 0.01;
    if (this.bow.visible) {
      const R = this.reach * 0.6; this.bow.scale.setScalar(R); this.bow.material.opacity = 0.8 * this.bowK;
      this.bow.position.copy(target).addScaledVector(this.dir, this.reach).setY(-R * 0.12); this.bow.rotation.y = Math.atan2(-this.dir.x, -this.dir.z);   // 보는 곳을 마주 봄
    }
    // 유성우: 빛줄기가 하나씩 비스듬히 떨어짐
    this.starK = Math.max(0, Math.min(1, this.starK + (kind === "meteor" ? dt : -dt) / 2)); this.stars.visible = this.starK > 0.01;
    if (!this.stars.visible) return;
    this.stars.material.opacity = this.starK;
    const p = this.stars.geometry.attributes.position.array, c = this.stars.geometry.attributes.color.array, side = Math.atan2(this.dir.x, this.dir.z);
    this.streaks.forEach((s, i) => {
      const j = i * 6;
      if (s.life <= 0) {
        if (kind !== "meteor" || (s.wait -= dt) > 0) { c.fill(0, j, j + 6); return; }
        const a = side + (Math.random() * 2 - 1) * 1.9, d = this.reach * (0.55 + Math.random() * 0.4), sp = 55 + Math.random() * 35, slide = a + (Math.random() < 0.5 ? 1 : -1) * (1.2 + Math.random() * 0.6);
        Object.assign(s, { x: target.x + Math.sin(a) * d, y: this.reach * (0.45 + Math.random() * 0.35), z: target.z + Math.cos(a) * d, vx: Math.sin(slide) * sp, vy: -sp * 0.45, vz: Math.cos(slide) * sp, life: 0.7 + Math.random() * 0.5, wait: 0.4 + Math.random() * 3 });
        s.span = s.life;
      }
      s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      const tail = 0.14, k = Math.max(0, Math.sin(Math.PI * Math.max(0, s.life) / s.span));   // 밝아졌다가 사라짐
      p[j] = s.x; p[j + 1] = s.y; p[j + 2] = s.z; p[j + 3] = s.x - s.vx * tail; p[j + 4] = s.y - s.vy * tail; p[j + 5] = s.z - s.vz * tail;
      c[j] = k; c[j + 1] = k; c[j + 2] = 0.85 * k; c[j + 3] = c[j + 4] = c[j + 5] = 0;
    });
    this.stars.geometry.attributes.position.needsUpdate = true; this.stars.geometry.attributes.color.needsUpdate = true;
  }
}
