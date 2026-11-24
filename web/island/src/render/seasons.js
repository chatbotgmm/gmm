// 계절 그림: 나무 잎 색(봄 연두·벚꽃 / 여름 그대로 / 가을 단풍 / 겨울 눈 덮임), 땅(봄 연두, 가을 누런 잔디, 겨울 눈 쌓임),
// 덤불 색, 그리고 봄 꽃잎·가을 낙엽이 흩날리는 입자. 계절은 world.season(기기 날짜 또는 설정에서 고른 값).
import * as THREE from "three";
import { OBJ_SNOW } from "./toon.js";

// 땅 셰이더 값(모든 땅 재질·툰 재질이 같은 값을 씀). 계절이 바뀌면 몇 초에 걸쳐 바뀜
const U = { uSnow: { value: 0 }, uAutumn: { value: 0 }, uSpring: { value: 0 } };
const TARGET = { spring: { uSnow: 0, uAutumn: 0, uSpring: 1 }, summer: { uSnow: 0, uAutumn: 0, uSpring: 0 }, autumn: { uSnow: 0, uAutumn: 1, uSpring: 0 }, winter: { uSnow: 0.85, uAutumn: 0.35, uSpring: 0 } };
// 잎 색(잎 재질은 텍스처 × 색). 나무마다 고르는 색 목록, 바늘잎나무(leafsDark)는 따로
const LEAF = {
  spring: [0xb8ec8c, 0xa6e27e, 0xffc6d8, 0xc4f09a],                            // 셋째는 벚꽃
  summer: null,                                                                     // 원래 색
  autumn: [0xffa04a, 0xf2683a, 0xffd45a, 0xe9a640, 0xd9542f],
  winter: [0xf1f5f8, 0xe6edf2],
};
const PINE = { spring: null, summer: null, autumn: 0x5fb8b0, winter: 0xbfe0de };
const BUSH = { spring: [0xffffff, 0x000000], summer: [0xe6f2d8, 0x000000], autumn: [0xffb066, 0x000000], winter: [0xffffff, 0x8f99a3] };   // [색 곱, 빛남(눈처럼 희게)]

/** 땅 재질에 계절 셰이더를 붙임(툰으로 바뀌어도 toon.js가 그대로 옮김) */
export function seasonalGround(mat) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = "varying vec3 vSeasonW; varying vec3 vSeasonN;\n" + sh.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\n vSeasonW = (modelMatrix * vec4(transformed, 1.0)).xyz; vSeasonN = normalize(mat3(modelMatrix) * objectNormal);");
    sh.fragmentShader = "uniform float uSnow; uniform float uAutumn; uniform float uSpring; varying vec3 vSeasonW; varying vec3 vSeasonN;\n" + sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      float green = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) * 5.0, 0.0, 1.0);          // 잔디처럼 초록인 곳
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.92, 1.1, 0.82), uSpring * green);   // 봄: 연두
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.32, 0.98, 0.5), uAutumn * green);   // 가을: 누런 잔디
      float up = smoothstep(0.55, 0.85, vSeasonN.y), land = smoothstep(-0.07, -0.015, vSeasonW.y);   // 바닷가 모래(0보다 낮은 비탈)엔 눈이 안 쌓임
      float n = fract(sin(dot(floor(vSeasonW.xz * 1.7), vec2(12.9898, 78.233))) * 43758.5453);              // 칸마다 조금씩 다르게(얼룩진 눈)
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.97, 1.0), clamp(uSnow * up * land * (0.9 + 0.12 * n), 0.0, 1.0));`);
  };
  mat.customProgramCacheKey = () => "seasonGround"; mat.userData.noSnow = true;   // 땅은 자체 눈
  return mat;
}

export class SeasonLook {
  constructor(toon) { this.toon = toon; this.cache = new Map(); this.season = null; }
  /** 매 프레임: 땅 값을 목표로 천천히(눈 오는 날엔 눈이 더 쌓임) */
  update(dt, season, weather, snow = null) {
    const t = TARGET[season] || TARGET.summer, k = Math.min(1, dt * 0.6);
    for (const key of Object.keys(U)) { const goal = key === "uSnow" && snow !== null ? snow : t[key]; U[key].value += (goal - U[key].value) * k; }   // 땅 눈 = 쌓인 눈 깊이
    OBJ_SNOW.value += (Math.max(0, (snow ?? 0) - 0.1) / 0.9 - OBJ_SNOW.value) * k;   // 물체 위 눈은 조금 쌓인 뒤부터
  }
  /** 잎 재질 하나를 이 계절 색으로 바꾼 복사본(계절·색마다 한 번만 만듦) */
  leafMat(base, season, i, pine) {
    const list = pine ? PINE[season] : LEAF[season]; if (list == null) return base;
    const hex = Array.isArray(list) ? list[i % list.length] : list, key = `${base.uuid}|${hex}`;
    let m = this.cache.get(key); if (!m) { m = base.clone(); m.color.setHex(hex); m.userData = { ...base.userData, seasonBase: base }; delete m.userData.src; this.cache.set(key, m); }
    return m;
  }
  /** 나무들(모듈 id → 물체)에 계절 색을 입힘 */
  applyTrees(world, objs, season) {
    for (const t of world.modules) {
      if (t.defId !== "tree") continue; const o = objs.get(t.id); if (!o) continue;
      const i = Math.abs(((t.cells[0][0] * 73856093) ^ (t.cells[0][1] * 19349663)) >>> 0);   // 나무마다 같은 색이 나오게
      o.traverse(x => {
        if (!x.isMesh) return;
        const cur = x.material, std = cur.userData.src || cur, base = x.userData.leafBase || std.userData.seasonBase || std;
        if (!/^leafs/.test(base.name)) return;
        x.userData.leafBase = base;
        const want = this.leafMat(base, season, i, base.name === "leafsDark");
        x.material = this.toon?.on ? this.toon.convert(want) : want;
      });
    }
  }
  /** 덤불 색(툰 복사본도 같이) */
  applyDecor(decor, season) {
    const m = decor?.meshes?.bush?.material; if (!m) return; const [c, e] = BUSH[season] || BUSH.summer;
    for (const x of [m, this.toon?.toToon.get(m)]) if (x) { x.color.setHex(c); x.emissive?.setHex(e); }
  }
}

// 봄 꽃잎·가을 낙엽: 보는 곳 둘레에서 천천히 흩날림(비·눈·폭풍 때는 쉼)
const LEAF_BOX = 50, LEAF_TOP = 14, LEAF_MAX = 420;
export class FallingLeaves {
  constructor(scene) {
    const pos = new Float32Array(LEAF_MAX * 3), col = new Float32Array(LEAF_MAX * 3), g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const cv = document.createElement("canvas"); cv.width = cv.height = 32; const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.beginPath(); c.ellipse(16, 16, 14, 8, 0.6, 0, 6.29); c.fill();
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.32, vertexColors: true, map: new THREE.CanvasTexture(cv), transparent: true, alphaTest: 0.3, fog: true }));
    this.pts.frustumCulled = false; this.pts.visible = false; this.pts.userData.noToon = true; scene.add(this.pts);
    this.p = Array.from({ length: LEAF_MAX }, () => [Math.random() * LEAF_BOX - LEAF_BOX / 2, Math.random() * LEAF_TOP, Math.random() * LEAF_BOX - LEAF_BOX / 2, Math.random() * 6.28]);
    this.amount = 1; this.season = null;
  }
  setAmount(f) { this.amount = Math.max(0.15, f); }
  update(dt, season, weather, target) {
    const on = (season === "spring" || season === "autumn") && (weather === "clear" || weather === "cloudy"); this.pts.visible = on; if (!on) return;
    if (season !== this.season) {                                                  // 색 다시 칠하기
      this.season = season; const col = this.pts.geometry.attributes.color.array, pal = season === "spring" ? [0xffc6d8, 0xffe0ea, 0xffffff] : [0xf2683a, 0xffa04a, 0xffd45a, 0xb5651d];
      const cc = new THREE.Color(); for (let i = 0; i < LEAF_MAX; i++) { cc.setHex(pal[i % pal.length]); col.set([cc.r, cc.g, cc.b], i * 3); }
      this.pts.geometry.attributes.color.needsUpdate = true;
    }
    const n = Math.floor(LEAF_MAX * this.amount), a = this.pts.geometry.attributes.position.array, cx = Math.round(target.x / 4) * 4, cz = Math.round(target.z / 4) * 4;
    for (let i = 0; i < n; i++) {
      const q = this.p[i]; q[1] -= 0.7 * dt; q[3] += dt * 1.3; q[0] += 0.6 * dt;      // 바람에 동쪽으로 살짝
      if (q[1] < 0 || q[0] > LEAF_BOX / 2) { q[1] = LEAF_TOP; q[0] = Math.random() * LEAF_BOX - LEAF_BOX / 2; q[2] = Math.random() * LEAF_BOX - LEAF_BOX / 2; }
      a[i * 3] = cx + q[0] + Math.sin(q[3]) * 0.6; a[i * 3 + 1] = q[1]; a[i * 3 + 2] = cz + q[2] + Math.cos(q[3] * 0.7) * 0.5;
    }
    this.pts.geometry.setDrawRange(0, n); this.pts.geometry.attributes.position.needsUpdate = true;
  }
}
