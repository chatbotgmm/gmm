// Tripo3D 에셋 자리(지시서 2장). 카탈로그 def.asset에 .glb/.gltf/.fbx 경로가 있으면 불러와
// 바닥 정중앙 피벗으로 옮기고 차지 칸 크기에 맞춘다. 경로가 없거나 불러오기에 실패하면 임시 도형을 쓴다.
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { CELL } from "../config.js";
import { loadGLB, loadProgress } from "./characters.js";

const cache = new Map();

// 경로 후보: 적힌 그대로, 그리고 앞의 village 폴더 부분을 뗀 것(아티팩트처럼 한 폴더에 모아 올린 경우). .glb는 .glb.json(base64)도 받는다.
/** 소품 모델 단계(그래픽 설정): 경로의 {T}를 텍스처 해상도 4k(최고·높음, 원본 4096px) · 2k(보통) · 1k(낮음·성능 우선)로 바꿈.
 *  사용자 제공 소품은 면 수를 줄이지 않고 텍스처만 단계별로 둔다(나무만 면 수도 7,080 → 4,034). 바뀐 뒤 새로 만들어지는 모델부터 */
export const PROP_LOD = { level: 0, aniso: 1 };   // aniso: 비스듬히 보이는 면(지붕·바닥 쪽)의 텍스처 선명도(이방성 필터). main이 기기 한도 안에서 정함(보통 이상 4, 낮음 2, 성능 우선 1)
function load(url) {
  url = url.replace("{T}", ["4k", "2k", "1k", "1k"][PROP_LOD.level] ?? "4k");
  if (!cache.has(url)) {
    const fbx = /\.fbx$/i.test(url), tries = [url, url.replace(/^\.\.\/village\//, "")].filter((u, i, a) => a.indexOf(u) === i);
    cache.set(url, (async () => {
      let err;
      for (const [i, u] of tries.entries()) {
        try { const r = fbx ? await new FBXLoader().loadAsync(u) : (await loadGLB(u)).scene; loadProgress.failed -= i;
          if (PROP_LOD.aniso > 1) r.traverse(o => { for (const m of [].concat(o.material || [])) if (m.map) m.map.anisotropy = PROP_LOD.aniso; });   // GPU에 올리기 전에 정함(올린 뒤 바꾸면 통째로 다시 올림)
          return r; } catch (e) { err = e; }   // 다른 경로로 받았으면 앞의 실패는 셈에서 뺌
      }
      throw err;
    })());
  }
  return cache.get(url);
}

/** 모델을 바닥 정중앙에 두고 가로·세로가 (w, d) m 안에 들어가게 맞춘 그룹. */
export function normalize(obj, w, d) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true;
    for (const m of [].concat(o.material)) if ("metalness" in m) m.metalness = 0; } });   // glTF 기본 metal=1은 환경맵 없이 검게 보임
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  obj.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
  const wrap = new THREE.Group(); wrap.add(obj);
  const s = Math.min(w / Math.max(size.x, 1e-6), d / Math.max(size.z, 1e-6)); wrap.scale.setScalar(s);
  return wrap;
}

/** 크기를 바꾸지 않은 모델 복사본(그림자 켬, 금속도 0). 계단·밭 틀·작물처럼 직접 맞출 때 */
export async function rawModel(url) {
  const o = (await load(url)).clone(true);
  o.traverse(m => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; for (const mt of [].concat(m.material)) if ("metalness" in mt) mt.metalness = 0; } });
  return o;
}
/** def.asset이 있으면 그 모델, 없으면 makePlaceholder(). 항상 Promise<Object3D>. */
export async function modelFor(def, makePlaceholder, asset = def.asset) {
  if (!asset) return makePlaceholder();
  try {
    const src = await load(asset), fp = def.fit || def.footprint || { w: 1, d: 1 };   // fit: 칸보다 작게 보일 것(가로등 등)
    const quarter = Math.abs(Math.sin(def.modelYaw ?? 0)) > 0.5;                  // 모델을 ±90° 돌려 놓으면(views.js) 원본 x가 칸의 d, 원본 z가 칸의 w 쪽이 됨
    return normalize(src.clone(true), (quarter ? fp.d : fp.w) * CELL * 0.95, (quarter ? fp.w : fp.d) * CELL * 0.95);
  } catch (e) {
    console.warn(`에셋을 못 불러와 임시 도형을 씁니다: ${asset}`, e);
    return makePlaceholder();
  }
}
