// 툰 셰이딩: 장면의 MeshStandardMaterial을 MeshToonMaterial(빛을 몇 단계로 끊어 칠하는 셰이더)로 바꿈.
// 참고 그림처럼 검은 외곽선 없이 부드러운 4단계 명암. 색·텍스처·꼭짓점 색·발광·투명도·스키닝은 그대로 옮김.
// 새로 생기는 모델(건물·갈매미·소품)도 sweep()을 주기적으로 불러 바꿔 줌. off로 되돌릴 수 있음(설정).
import * as THREE from "three";

function gradient(steps = [0.42, 0.62, 0.82, 1.0]) {
  const data = new Uint8Array(steps.map(v => Math.round(v * 255)));
  const t = new THREE.DataTexture(data, steps.length, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
}
const GRAD = gradient();

export class Toon {
  constructor(scene) { this.scene = scene; this.on = true; this.toToon = new Map(); this.toStd = new Map(); }
  convert(m) {
    if (!m || !(m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial) || m.userData.noToon) return m;
    let t = this.toToon.get(m);
    if (!t) {
      t = new THREE.MeshToonMaterial({
        color: m.color, map: m.map, vertexColors: m.vertexColors, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, emissiveMap: m.emissiveMap,
        transparent: m.transparent, opacity: m.opacity, side: m.side, alphaTest: m.alphaTest, depthWrite: m.depthWrite, gradientMap: GRAD, name: m.name,
      });
      if (Object.prototype.hasOwnProperty.call(m, "onBeforeCompile")) { t.onBeforeCompile = m.onBeforeCompile; t.customProgramCacheKey = () => "toon-" + m.customProgramCacheKey(); }   // 지붕 색 바꾸기 같은 셰이더 수정도 옮김
      t.userData.src = m; this.toToon.set(m, t); this.toStd.set(t, m);
    }
    return t;
  }
  /** 장면을 훑어 아직 안 바뀐 재질을 바꿈(on이면 툰, off면 원래대로). 바꾼 재질 수를 돌려줌. */
  sweep(root = this.scene) {
    let n = 0;
    root.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const swap = m => { const r = this.on ? this.convert(m) : (this.toStd.get(m) || m); if (r !== m) n++; return r; };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
    return n;
  }
  /** 툰 재질의 발광 세기를 원래 재질과 맞춤(등대 램프처럼 밤낮으로 바뀌는 것) */
  syncEmissive() { for (const [s, t] of this.toToon) t.emissiveIntensity = s.emissiveIntensity; }
  set(on) { this.on = on; this.sweep(); }
}
