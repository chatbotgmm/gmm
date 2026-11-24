// 그림체(툰·클레이·기본). 툰 셰이딩: 장면의 MeshStandardMaterial을 MeshToonMaterial(빛을 몇 단계로 끊어 칠하는 셰이더)로 바꿈.
// 참고 그림처럼 검은 외곽선 없이 부드러운 4단계 명암. 색·텍스처·꼭짓점 색·발광·투명도·스키닝은 그대로 옮김.
// 새로 생기는 모델(건물·갈매미·소품)도 sweep()을 주기적으로 불러 바꿔 줌. off로 되돌릴 수 있음(설정).
import * as THREE from "three";

function gradient(steps = [0.42, 0.62, 0.82, 1.0]) {
  const data = new Uint8Array(steps.map(v => Math.round(v * 255)));
  const t = new THREE.DataTexture(data, steps.length, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
}
const GRAD = gradient();
// 물체 위 눈: 위를 향한 면에 눈 깊이만큼 흰색(지붕·나무·바위·소품). 땅(자체 계절 셰이더)과 갈매미(noSnow)는 빼고. 값은 seasons.js가 world.snow로 정함
export const OBJ_SNOW = { value: 0 };
function addSnow(sh) {
  sh.uniforms.uObjSnow = OBJ_SNOW;
  sh.vertexShader = "varying vec3 vObjSnowN; varying vec3 vObjSnowW;\n" + sh.vertexShader.replace("#include <begin_vertex>",
    "#include <begin_vertex>\n vObjSnowN = normalize(mat3(modelMatrix) * objectNormal); vObjSnowW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
  sh.fragmentShader = "uniform float uObjSnow; varying vec3 vObjSnowN; varying vec3 vObjSnowW;\n" + sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
    float snowUp = smoothstep(0.45, 0.8, vObjSnowN.y), snowN = fract(sin(dot(floor(vObjSnowW.xz * 3.0), vec2(12.9898, 78.233))) * 43758.5453);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.97, 1.0), clamp(uObjSnow * snowUp * (0.75 + 0.3 * snowN), 0.0, 1.0));`);
}

// 클레이(점토) 느낌: 명암을 끊지 않는 무광 + 손으로 빚은 듯한 잔 울퉁불퉁(노멀 흔들기) + 부드러운 테두리 밝힘(림) + 살짝 진한 색
const CLAY_NOISE = `
float clayH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float clayN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(clayH(i), clayH(i + vec3(1,0,0)), f.x), mix(clayH(i + vec3(0,1,0)), clayH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(clayH(i + vec3(0,0,1)), clayH(i + vec3(1,0,1)), f.x), mix(clayH(i + vec3(0,1,1)), clayH(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
function addClay(sh) {
  sh.vertexShader = "varying vec3 vClayW;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vClayW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
  sh.fragmentShader = "varying vec3 vClayW;\n" + CLAY_NOISE + "\n" + sh.fragmentShader
    .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      { vec3 cp = vClayW * 7.0; vec3 nn = vec3(clayN(cp), clayN(cp + 17.3), clayN(cp + 31.7)) + 0.5 * vec3(clayN(cp * 2.3 + 5.1), clayN(cp * 2.3 + 9.7), clayN(cp * 2.3 + 2.2));
        normal = normalize(normal + (nn / 1.5 - 0.5) * 0.22); }`)
    .replace("#include <opaque_fragment>", `{ float rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
        outgoingLight += diffuseColor.rgb * rim * 0.32;
        float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114)); outgoingLight = max(vec3(0.0), mix(vec3(lum), outgoingLight, 1.1)); }
      #include <opaque_fragment>`);
}

export class Toon {
  constructor(scene, { snow = true } = {}) { this.scene = scene; this.on = true; this.style = "toon"; this.snow = snow; this.toToon = new Map(); this.toStd = new Map(); }   // snow: 물체 위 눈(방 안은 끔)
  /** 그림체: "toon"(단계 명암) · "clay"(점토) · "basic"(원래 재질) */
  setStyle(s) {
    if (s === this.style) return; this.on = false; this.sweep();                // 원래 재질로 되돌린 뒤
    this.toToon.clear(); this.toStd.clear(); this.style = s; this.on = s !== "basic"; this.sweep();
  }   // snow: 물체 위 눈(방 안은 끔)
  convert(m) {
    if (!m || !(m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial) || m.userData.noToon || this.toStd.has(m)) return m;   // 이미 바꾼 재질(클레이는 같은 Standard라 다시 바꾸지 않게)
    let t = this.toToon.get(m);
    if (!t) {
      const base = { color: m.color, map: m.map, vertexColors: m.vertexColors, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, emissiveMap: m.emissiveMap,
        transparent: m.transparent, opacity: m.opacity, side: m.side, alphaTest: m.alphaTest, depthWrite: m.depthWrite, name: m.name };
      const clay = this.style === "clay";
      t = clay ? new THREE.MeshStandardMaterial({ ...base, roughness: 1, metalness: 0 }) : new THREE.MeshToonMaterial({ ...base, gradientMap: GRAD });
      const own = Object.prototype.hasOwnProperty.call(m, "onBeforeCompile") ? m.onBeforeCompile : null, snow = this.snow && !m.userData.noSnow;   // 지붕 색 바꾸기 같은 셰이더 수정도 옮김 + 눈
      if (own || snow || clay) { t.onBeforeCompile = (sh, r) => { own?.call(t, sh, r); if (snow) addSnow(sh); if (clay) addClay(sh); }; t.customProgramCacheKey = () => `${this.style}-${snow ? "snow-" : ""}${own ? m.customProgramCacheKey() : ""}`; }
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
