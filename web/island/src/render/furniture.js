// 가구 모양(임시): 모델 파일이 없어 상자·원기둥으로 만듦. 원점 = 가구가 차지하는 칸들의 가운데 바닥, 앞쪽 = +z.
// 나중에 FURNITURE[id].asset을 넣으면 그 모델로 바꾸면 됨.
import * as THREE from "three";
import { FURNITURE } from "../data/catalog.js";

const matCache = new Map();
const fmat = (c, emissive = 0) => { const k = `${c}|${emissive}`; if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, emissive: emissive ? c : 0x000000, emissiveIntensity: emissive })); return matCache.get(k); };
function fbox(g, w, h, d, x, y, z, c, e = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fmat(c, e)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
function fcyl(g, r1, r2, h, x, y, z, c, seg = 12, e = 0) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), fmat(c, e)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
const flegs = (g, w, d, h, c, r = 0.035) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) fcyl(g, r, r, h, sx * (w / 2 - 0.06), h / 2, sz * (d / 2 - 0.06), c, 8); };
const BOOK = [0xd9574b, 0x3d8fb5, 0xf2c14e, 0x5aa845, 0x8e6bbf, 0xf2a49a];

export function furnitureModel(id) {
  const f = FURNITURE[id], g = new THREE.Group(), [c0, c1 = 0xffffff, c2 = c1] = f.colors, shape = f.shape || id;
  switch (shape) {
    case "bed":
      fbox(g, 0.9, 0.25, 1.9, 0, 0.13, 0, c0); fbox(g, 0.84, 0.16, 1.78, 0, 0.33, 0.03, c1); fbox(g, 0.56, 0.1, 0.28, 0, 0.46, -0.68, 0xffffff);
      fbox(g, 0.88, 0.07, 1.05, 0, 0.44, 0.38, c2); fbox(g, 0.92, 0.6, 0.08, 0, 0.42, -0.93, c0); break;
    case "chair":
      flegs(g, 0.48, 0.48, 0.42, c0); fbox(g, 0.5, 0.07, 0.5, 0, 0.45, 0, c0); fbox(g, 0.5, 0.48, 0.06, 0, 0.72, -0.22, c0); break;
    case "table":
      flegs(g, 0.8, 0.8, 0.58, c0, 0.045); fbox(g, 0.86, 0.07, 0.86, 0, 0.62, 0, c0);
      if (id === "coralTable") for (let i = 0; i < 3; i++) fcyl(g, 0.05, 0.08, 0.18, -0.2 + i * 0.2, 0.74, 0.1 * (i - 1), 0xff6f61, 8); break;
    case "sofa":
      fbox(g, 1.8, 0.32, 0.8, 0, 0.2, 0.02, c0); fbox(g, 1.8, 0.5, 0.2, 0, 0.55, -0.3, c0);
      for (const sx of [-1, 1]) fbox(g, 0.18, 0.3, 0.8, sx * 0.81, 0.48, 0.02, c0);
      for (const sx of [-1, 1]) fbox(g, 0.72, 0.1, 0.56, sx * 0.37, 0.41, 0.08, c1); break;
    case "bookshelf": {
      fbox(g, 1.8, 1.5, 0.05, 0, 0.75, -0.2, c0); for (const sx of [-1, 1]) fbox(g, 0.05, 1.5, 0.42, sx * 0.875, 0.75, 0, c0);
      for (let k = 0; k < 4; k++) fbox(g, 1.75, 0.04, 0.4, 0, 0.04 + k * 0.48, 0, c0);
      let n = 0; for (let k = 0; k < 3; k++) for (let x = -0.8; x < 0.78; x += 0.11) { const h = 0.26 + ((n * 37) % 11) / 60; fbox(g, 0.08, h, 0.26, x + 0.04, 0.06 + k * 0.48 + h / 2, 0.02, BOOK[n++ % BOOK.length]); }
      break; }
    case "wardrobe":
      fbox(g, 0.86, 1.7, 0.6, 0, 0.85, 0, c0); fbox(g, 0.01, 1.5, 0.01, 0, 0.88, 0.305, 0x8a7a64);
      for (const sx of [-1, 1]) fcyl(g, 0.025, 0.025, 0.03, sx * 0.06, 0.95, 0.31, 0x6b5a46, 8).rotation.x = Math.PI / 2; break;
    case "rug":
      fbox(g, 1.85, 0.02, 1.85, 0, 0.01, 0, c0); fbox(g, 1.4, 0.025, 1.4, 0, 0.013, 0, c1); fbox(g, 0.9, 0.03, 0.9, 0, 0.015, 0, c0); break;
    case "plant":
      fcyl(g, 0.17, 0.13, 0.3, 0, 0.15, 0, c0); fcyl(g, 0.02, 0.02, 0.25, 0, 0.42, 0, 0x6b8f3a, 6);
      { const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), fmat(c1)); leaf.position.y = 0.66; leaf.castShadow = true; g.add(leaf); } break;
    case "floorLamp":
      fcyl(g, 0.18, 0.2, 0.04, 0, 0.02, 0, c0); fcyl(g, 0.025, 0.025, 1.3, 0, 0.67, 0, c0, 8);
      fcyl(g, 0.14, 0.26, 0.28, 0, 1.38, 0, c1, 16, 0.6).userData.lampShade = true; break;
    case "oven":
      fbox(g, 0.86, 0.9, 0.7, 0, 0.45, 0, c0); fbox(g, 0.6, 0.35, 0.02, 0, 0.42, 0.355, 0x2b2f33);
      for (let i = 0; i < 3; i++) fcyl(g, 0.03, 0.03, 0.03, -0.2 + i * 0.2, 0.78, 0.36, 0x333333, 8).rotation.x = Math.PI / 2; break;
    default: fbox(g, 0.8, f.height, 0.8, 0, f.height / 2, 0, c0);
  }
  g.userData.furniture = id; return g;
}
