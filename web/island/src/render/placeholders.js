// 임시 도형(지시서 5장): Tripo 에셋이 들어갈 자리를 상자·원뿔·원기둥·캡슐로 채운다.
// 모두 피벗은 바닥 정중앙(원점), 크기는 칸(1 m) 단위. 건물의 문은 +z 쪽 면.
import * as THREE from "three";
import { CELL } from "../config.js";

const mats = new Map();
export function mat(hex, extra = {}) {
  const key = hex + JSON.stringify(extra);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0, ...extra }));
  return mats.get(key);
}
function box(w, h, d, hex, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex)); m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true; return m;
}

export function buildingPlaceholder(def) {
  const g = new THREE.Group(), p = def.placeholder, W = def.footprint.w * CELL * 0.9, D = def.footprint.d * CELL * 0.9, H = def.height;
  g.add(box(W, H, D, p.wall));
  g.add(box(W + 0.06, 0.12, D + 0.06, 0xd9cdb8));                                  // 바닥 테두리
  if (p.roof_shape === "pyramid") {
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4), mat(p.roof));
    roof.rotation.y = Math.PI / 4; roof.scale.set(W + 0.3, H * 0.6, D + 0.3); roof.position.y = H + H * 0.3;
    roof.castShadow = true; g.add(roof);
  } else {
    g.add(box(W + 0.2, 0.14, D + 0.2, p.roof, 0, H));
  }
  if (p.chimney) g.add(box(0.22, 0.6, 0.22, 0xb8b0a5, W * 0.25, H + 0.2, -D * 0.15));
  const door = box(0.38, 0.72, 0.06, 0x8a5a32, 0, 0, D / 2 + 0.02); door.name = "door"; g.add(door);
  for (const sx of [-1, 1]) {                                                        // 창문
    if (W > 1.2) g.add(box(0.3, 0.3, 0.05, 0x9fd3e6, sx * W * 0.3, H * 0.45, D / 2 + 0.02));
    g.add(box(0.05, 0.3, 0.3, 0x9fd3e6, sx * (W / 2 + 0.02), H * 0.45, 0));
  }
  if (p.awning) {                                                                    // 조개 차양: 문 위 반원통
    const aw = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, Math.min(W * 0.8, 1.4), 12, 1, false, 0, Math.PI), mat(p.awning, { side: THREE.DoubleSide }));
    aw.rotation.z = Math.PI / 2; aw.position.set(0, 0.95, D / 2 + 0.05); aw.castShadow = true; g.add(aw);
  }
  return g;
}

/** 해안 모듈. cells는 차지 칸, origin은 그룹을 둘 칸 중심(월드). 칸별 조각을 그룹 기준 위치에 놓는다. */
export function modulePlaceholder(defId, cellsWorld, rot = 0) {
  const g = new THREE.Group();
  if (defId === "pier") {
    for (const [x, z] of cellsWorld) {
      g.add(box(CELL * 0.98, 0.08, CELL * 0.98, 0xc8955a, x, -0.08, z));
      for (const [px, pz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]])
        g.add(box(0.1, 1.0, 0.1, 0x7d5634, x + px, -1.05, z + pz));
    }
  } else if (defId === "breakwater") {
    cellsWorld.forEach(([x, z], i) => {
      const m = box(CELL * 1.05, 1.35, CELL * 0.9, i % 2 ? 0xa9a59e : 0xb9b5ad, x, -1.1, z);
      m.rotation.y = ((i * 37) % 7 - 3) * 0.04; g.add(m);
    });
  } else if (defId === "lighthouse") {
    const cx = cellsWorld.reduce((s, c) => s + c[0], 0) / cellsWorld.length, cz = cellsWorld.reduce((s, c) => s + c[1], 0) / cellsWorld.length;
    const t = new THREE.Group(); t.position.set(cx, -0.15, cz); g.add(t);
    t.add(box(1.7, 0.3, 1.7, 0xb9b5ad));
    for (let k = 0; k < 4; k++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.55 - k * 0.06, 0.6 - k * 0.06, 0.75, 16), mat(k % 2 ? 0xd9574b : 0xf7f2e8));
      seg.position.y = 0.3 + 0.375 + k * 0.75; seg.castShadow = true; t.add(seg);
    }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.4, 12), mat(0xffe08a, { emissive: 0xffc24a, emissiveIntensity: 0.8 }));
    lamp.position.y = 3.5; t.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 12), mat(0xd9574b)); cap.position.y = 3.95; cap.castShadow = true; t.add(cap);
  } else if (defId === "cave") {
    // 동굴 입구: 바위 덩이들이 둘러싼 검은 아치(+z 쪽으로 열림)
    const cx = cellsWorld.reduce((s, c) => s + c[0], 0) / cellsWorld.length, cz = cellsWorld.reduce((s, c) => s + c[1], 0) / cellsWorld.length;
    const t = new THREE.Group(); t.position.set(cx, 0, cz); g.add(t);
    const rock = (r, x, y, z, col) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(col)); m.position.set(x, y, z); m.rotation.set(x * 3, z * 5, y * 7); m.castShadow = m.receiveShadow = true; t.add(m); };
    rock(1.15, 0, 0.75, -0.35, 0x8d8a84); rock(0.75, -0.85, 0.45, 0.2, 0x9b978f); rock(0.7, 0.9, 0.42, 0.15, 0x86827b); rock(0.55, 0.15, 1.45, -0.1, 0xa29e96);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16, 0, Math.PI), mat(0x15120f)); hole.position.set(0, 0.02, 0.62); t.add(hole);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), mat(0x2a2520)); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.015, 0.75); t.add(floor);
  } else if (defId === "tree") {
    for (const [x, z] of cellsWorld) {
      g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.6, 8), mat(0x8a5a32)), { castShadow: true }).translateX(x).translateY(0.3).translateZ(z));
      g.add(Object.assign(new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 10), mat(0x6fbf73)), { castShadow: true }).translateX(x).translateY(1.0).translateZ(z));
    }
  } else if (defId === "beachRock") {
    for (const [x, z] of cellsWorld) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42), mat(0x9a968f));
      m.scale.set(1.1, 0.7, 0.9); m.position.set(x, 0.1, z); m.rotation.y = rot; m.castShadow = m.receiveShadow = true; g.add(m);
    }
  }
  return g;
}

/** 갈매미 임시 모양: 흰 캡슐 + 노란 볏 + 주황 부리 + 빨간 스카프 + 갈색 가방. 앞쪽은 +z. 키 약 0.8 m. */
export function unitPlaceholder(scale = 1) {
  const g = new THREE.Group(), body = new THREE.Group(); body.scale.setScalar(scale); g.add(body);
  const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.32, 6, 14), mat(0xfbfbf8)); cap.position.y = 0.38; cap.castShadow = true; body.add(cap);
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 8), mat(0xe8c24a)); crest.position.set(0, 0.84, 0.02); crest.castShadow = true; body.add(crest);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 8), mat(0xf0a23a)); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.6, 0.25); body.add(beak);
  for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), mat(0x2b2b2b)); eye.position.set(sx * 0.08, 0.66, 0.2); body.add(eye); }
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 8, 20), mat(0xe0402b)); scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.47; body.add(scarf);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.06), mat(0x8a5a32)); bag.position.set(0.2, 0.27, 0.06); bag.rotation.y = 0.5; body.add(bag);
  return g;
}
