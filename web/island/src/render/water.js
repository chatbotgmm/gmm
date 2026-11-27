// 섬을 감싸는 바다. 섬 높이(격자)를 텍스처로 받아 물 깊이에 따라 색을 바꿈:
// 얕은 곳 = 밝은 청록, 깊은 곳 = 진한 파랑. 안개 적용.
// 해안 파도(5.5초 주기): 바다 쪽에서 마루 띠가 해안으로 밀려오며 얕은 곳에서 넓어지고 흰 거품으로 부서짐(water 판) →
// 모래사장 위로 얇은 물이 거품 테두리를 달고 쓸려 올라왔다 빠지고(swash 판, 모래 위에 얹은 얇은 메쉬) → 물이 빠진 자리는 잠깐 젖은 모래(어둡고 반짝).
// 바위·절벽 해안은 부서지는 흰 물보라만, 바다와 이어지지 않은 연못·좁은 물길은 파도 없이 잔물결만.
// 텍스처(칸마다 1화소, RGBA): R 물 깊이 · G 해안선까지 거리(땅 +, 물 −) · B 가장 가까운 땅이 모래사장인가 · A 파도 세기(바다와 이어지고 탁 트인 곳 1)
import * as THREE from "three";
import { WATER_Y, toWorldX, toWorldZ } from "../config.js";
import { terrainHeight } from "../world/terrain.js";
import { shoreData, swashCells, SD_SCALE } from "../world/shore.js";

export const WAVE_T = 5.5;                 // 파도 한 주기(초)
const SWASH_SUB = 4;                       // 쓸려 올라오는 물 판: 칸당 조각(땅 상세도 4와 같은 자리에서 높이를 재서 모래에 붙음)

// 두 판이 같이 쓰는 파도 시계·잡음. u: 이번 파도 진행(0~1), k: 이번 파도 세기(0.5~1, 파도마다·자리마다 다름)
const COMMON = /* glsl */`
  uniform float uTime; uniform float uLight; uniform sampler2D uDepth; uniform vec2 uOrigin; uniform vec2 uSize;
  uniform vec3 uShallow; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uNight;
  varying vec3 vWorld;
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0)), f.x), f.y); }
  vec4 shoreAt(vec2 p) { return texture2D(uDepth, clamp((p - uOrigin) / uSize, vec2(0.0), vec2(1.0))); }
  float sdOf(vec4 s) { return (s.g * 255.0 - 128.0) / ${SD_SCALE.toFixed(1)}; }
  void waveClock(vec2 p, out float u, out float k) {
    // 해안을 따라 차례로 밀려오게 자리마다 위상 차. 위상이 공간에서 너무 빨리 바뀌면 마루 띠가 해안과 거의 직각인 흰 줄로 바다 쪽에 뻗어 보임
    // (마루는 주기 반 동안 4.45칸 움직이므로 1주기 ≈ 8.9칸: 위상 기울기 최대 0.7×1.5×0.04 + 0.08×1.5×0.21 ≈ 0.07주기/m → 마루가 해안선에서 최대 약 30° 기움)
    float c = uTime / ${WAVE_T.toFixed(2)} + vnoise(p * 0.04) * 0.7 + vnoise(p * 0.21) * 0.08;
    u = fract(c);
    float id = floor(c);
    k = 0.5 + 0.5 * vnoise(p * 0.09 + vec2(id * 5.31, id * 1.73));                                // 큰 파도·작은 파도가 섞여 옴
  }
  // 쓸려 올라오는 물 가장자리(쉬는 물가 너머 칸 비율): 0.45~0.64 올라옴 → 0.64~0.92 빠짐
  float runup(float u) { return smoothstep(0.45, 0.64, u) * (1.0 - smoothstep(0.64, 0.92, u)); }
`;

export function createWater(size = 480) {
  const depthTex = new THREE.DataTexture(new Uint8Array([0, 128, 0, 0]), 1, 1, THREE.RGBAFormat); depthTex.needsUpdate = true;
  const shared = {
    uTime: { value: 0 }, uLight: { value: 1 }, uShallow: { value: new THREE.Color(0x8ff0de) },
    uDepth: { value: depthTex }, uOrigin: { value: new THREE.Vector2(-48, -48) }, uSize: { value: new THREE.Vector2(96, 96) },
    uSunDir: { value: new THREE.Vector3(-0.6, 0.55, 0.32).normalize() }, uSunCol: { value: new THREE.Color(0xfff2d8) }, uNight: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true, fog: true, depthWrite: false, defines: {},
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...shared,
      uDeep: { value: new THREE.Color(0x1d8fb0) }, uMid: { value: new THREE.Color(0x2fbfc4) }, uHor: { value: new THREE.Color(0xcfe8f0) }, uRain: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uHor; uniform float uRain;
      ${COMMON}
      #include <fog_pars_fragment>
      void main() {
        vec2 p = vWorld.xz;
        vec4 sh = shoreAt(p);
        float far = max(0.0, max(abs(p.x), abs(p.y)) - (uSize.x * 0.5 - 6.0));             // 지도 끝 바깥으로 갈수록 깊게(지도 안은 섬 높이 텍스처가 정함)
        float depth = sh.r * 3.0 + far * 0.035;                                           // 물 깊이(m)
        float s = -sdOf(sh) + far;                                                        // 해안선에서 바다 쪽으로 몇 칸
        float beach = sh.b, power = sh.a;                                                 // 모래사장 쪽인가 · 파도 세기(연못 0)
        float w = sin(p.x * 0.9 + uTime * 0.8) * 0.5 + sin(p.y * 1.1 - uTime * 0.6) * 0.5 + sin((p.x + p.y) * 0.4 + uTime * 0.5);
        vec3 col = mix(uShallow, uMid, smoothstep(0.05, 0.45, depth));
        col = mix(col, uDeep, smoothstep(0.5, 1.6, depth));
        col *= 0.96 + 0.05 * w;
        vec3 V = normalize(cameraPosition - vWorld);
      #ifndef WATER_LITE
        // 얕은 곳 물빛 무늬(바닥에 어른거리는 밝은 그물)
        float cau = abs(sin(p.x * 2.1 + sin(p.y * 1.7 + uTime * 0.6) * 1.3) * sin(p.y * 2.3 + sin(p.x * 1.3 - uTime * 0.5) * 1.3));
        col += vec3(0.07, 0.09, 0.07) * smoothstep(0.55, 0.85, cau) * (1.0 - smoothstep(0.15, 0.9, depth)) * smoothstep(0.03, 0.12, depth);
      #endif
        // ---- 파도: 마루 띠가 바다 쪽 4.5칸에서 해안으로(u 0~0.5), 1.8칸 안에서 부서져 흰 거품, 해안에 닿은 뒤 남은 거품이 퍼지며 사라짐
        float u, k; waveClock(p, u, k);
        float cs = mix(4.5, 0.05, clamp(u / 0.5, 0.0, 1.0));                              // 마루 자리(해안에서 칸)
        float brk = 1.0 - smoothstep(0.6, 1.8, cs);                                        // 부서지는 정도
        float x = s - cs, wid = mix(0.32, 0.85, brk) * (0.8 + 0.4 * k);
        float crest = (x < 0.0 ? exp(-x * x / 0.03) : exp(-x * x / (wid * wid))) * (1.0 - smoothstep(0.42, 0.52, u)) * smoothstep(0.0, 0.08, u);
        crest *= power * smoothstep(-0.2, 0.3, s) * (1.0 - smoothstep(4.0, 5.0, s));
        float fn = vnoise(p * 2.6 + vec2(uTime * 0.35, 0.0)) * 0.6 + vnoise(p * 6.0 - uTime * 0.2) * 0.4;   // 거품 덩어리 모양
        col = mix(col, col * 1.12 + 0.08, crest * (1.0 - brk) * 0.8);                     // 아직 안 부서진 마루: 밝은 물빛
        float foam = crest * brk * smoothstep(0.47, 0.53, fn * 0.7 + 0.45 * crest);             // 가장자리가 또렷한 거품(로우폴리 톤)
        float left = smoothstep(0.42, 0.5, u) * (1.0 - smoothstep(0.6, 0.95, u)) * power;           // 해안에 남은 거품: 물가에서 0.3~1칸 띠가 바다 쪽으로 풀리며 사라짐
        float lw = (0.35 + 0.6 * k) * (0.6 + 0.8 * smoothstep(0.5, 0.95, u));
        foam = max(foam, left * step(s, lw) * smoothstep(0.47, 0.52, fn + 0.25 - 0.45 * s / lw));
        // 바위·절벽 해안: 마루가 닿을 때 흰 물보라가 튐
        float burst = smoothstep(0.4, 0.5, u) * (1.0 - smoothstep(0.52, 0.75, u)) * (1.0 - smoothstep(0.0, 0.7 + 0.5 * k, s)) * power * (1.0 - beach);
        foam = max(foam, burst * smoothstep(0.42, 0.48, fn + 0.2));
        foam = max(foam, (1.0 - smoothstep(0.0, 0.06, depth)) * (0.45 + 0.35 * (1.0 - power)));   // 물가 얇은 테두리(연못은 이것만)
        col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.9);
        float sparkle = smoothstep(1.6, 1.95, w) * smoothstep(0.4, 1.5, depth);           // 깊은 곳 물결 반짝임
        col = mix(col, vec3(1.0), sparkle * 0.25);
      #ifndef WATER_LITE
        // 각진 잔물결 반짝임 + 해·달 빛길: 칸마다 기울어진 작은 면(로우폴리 물결)이 해 쪽으로 빛을 튕김
        vec2 fc = floor(p * 1.7), fr = fract(p * 1.7);
        float ph = hash12(fc) * 6.283 + uTime * (0.8 + hash12(fc + 7.0) * 0.6);
        vec3 N = normalize(vec3(sin(ph) * 0.22, 1.0, cos(ph * 1.3) * 0.22));
        float spec = pow(max(dot(reflect(-V, N), normalize(uSunDir)), 0.0), 90.0) * step(0.06, fr.y - fr.x) * step(0.06, min(fr.x, 1.0 - fr.y));   // 칸을 대각선으로 자른 세모 면만
        col += uSunCol * spec * (0.9 + 0.4 * uNight) * smoothstep(0.2, 0.8, depth);
        // 비: 수면에 퍼지는 작은 동그라미
        if (uRain > 0.01) {
          vec2 rc = floor(p * 1.6), rf = fract(p * 1.6) - 0.5; float rh = hash12(rc), rt = fract(uTime * 1.3 + rh);
          float ring = 1.0 - smoothstep(0.0, 0.05, abs(length(rf + (vec2(hash12(rc + 3.1), hash12(rc + 5.7)) - 0.5) * 0.4) - rt * 0.42));
          col = mix(col, col + 0.22, ring * (1.0 - rt) * uRain * step(0.35, rh));
        }
      #endif
        // 먼 바다는 하늘빛으로 밝게(비스듬히 볼수록), 밤엔 남색·달빛
        float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
        col = mix(col, uHor * 1.05, fres * 0.55 * smoothstep(0.6, 2.0, depth));
        col = mix(col, col * vec3(0.42, 0.52, 0.92), uNight * 0.85);
        col *= uLight;                                                                   // 밤에는 어둡게(daylight.js)
        gl_FragColor = vec4(col, mix(0.62, 0.9, smoothstep(0.0, 1.0, depth)) + foam * 0.1);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = WATER_Y; mesh.renderOrder = 1; mesh.name = "water";

  // ---- 모래사장 위로 쓸려 올라오는 물(해안선 둘레 칸만 덮는 얇은 메쉬, 그리기 호출 1)
  const swashMat = new THREE.ShaderMaterial({
    transparent: true, fog: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...shared },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vWorld = position;
        vec4 mvPosition = viewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      ${COMMON}
      #include <fog_pars_fragment>
      void main() {
        vec2 p = vWorld.xz;
        vec4 sh = shoreAt(p);
        float power = sh.a * sh.b;
        if (power < 0.02) discard;
        float u, k; waveClock(p, u, k);
        float R = mix(0.35, 1.1, k) * power;                                              // 이번 파도가 쉬는 물가 너머로 올라오는 칸 수
        float d = sdOf(sh) - 0.3 + (vnoise(p * 1.3) - 0.5) * 0.35;                        // 쉬는 물가(0)에서 땅 쪽으로 칸(물가가 곧지 않게)
        float r = R * runup(u);
        if (d > R + 0.1) discard;
        float e = r - d;                                                                  // 물 가장자리에서 안쪽으로
        float fn = vnoise(p * 4.0 + vec2(0.0, uTime * 0.4)) * 0.6 + vnoise(p * 9.0) * 0.4;
        vec4 o = vec4(0.0);
        if (e > 0.0) {
          float thin = smoothstep(0.0, 0.5, e);
          vec3 sheet = mix(uShallow * 1.04, vec3(1.0), 0.18 + 0.25 * step(0.62, fn));      // 얇은 물(속에 작은 거품)
          float rim = (1.0 - smoothstep(0.0, 0.1 + 0.12 * fn, e)) * smoothstep(0.02, 0.15, r); // 거품 테두리
          o = vec4(mix(sheet, vec3(1.0), rim), max((0.42 * thin + 0.1) * (d < 0.0 ? 0.35 + 0.65 * smoothstep(0.0, 0.3, r) : 1.0), rim * 0.95) * smoothstep(-0.8, -0.3, d));   // 바다 쪽은 물 판과 이어지게 옅게
        } else if (d < R && u > 0.6) {                                                    // 물이 빠진 자리: 젖은 모래(어둡게 + 반짝)
          float wet = (1.0 - smoothstep(0.7, 1.0, u)) * smoothstep(R, R - 0.25, d);
          vec2 gc = floor(p * 6.0), gf = fract(p * 6.0) - 0.5;                              // 작은 반짝 점(칸마다 드물게, 깜박)
          float glint = step(0.9, hash12(gc + floor(uTime * 2.5))) * (1.0 - smoothstep(0.08, 0.16, abs(gf.x) + abs(gf.y)));
          o = vec4(mix(vec3(0.16, 0.12, 0.07), vec3(1.0), glint), wet * (0.24 + 0.4 * glint));
        }
        if (o.a < 0.004) discard;
        vec3 col = mix(o.rgb, o.rgb * vec3(0.42, 0.52, 0.92), uNight * 0.85) * uLight;
        gl_FragColor = vec4(col, o.a);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const swash = new THREE.Mesh(new THREE.BufferGeometry(), swashMat);
  swash.name = "swash"; swash.renderOrder = 2; swash.frustumCulled = false; swash.userData.noToon = true; swash.raycast = () => {};
  swash.matrixAutoUpdate = false;
  mesh.add(swash); mesh.updateMatrix(); swash.matrix.copy(mesh.matrix).invert();          // 물 판(눕힌 판) 아래에 달되 세계 좌표 그대로
  mesh.userData.swash = swash;

  mesh.userData.tick = t => { shared.uTime.value = t; };
  mesh.userData.setLight = v => { shared.uLight.value = v; };
  /** 해·달 방향과 빛 색, 지평선 색, 밤(0~1): daylight.js가 0.5초마다 */
  mesh.userData.setSky = (dir, sunCol, hor, night) => {
    shared.uSunDir.value.copy(dir); shared.uSunCol.value.copy(sunCol); mat.uniforms.uHor.value.copy(hor); shared.uNight.value = night;
  };
  /** 비·폭풍이면 수면에 빗방울 동그라미(1~2초에 걸쳐 켜지고 꺼짐) */
  mesh.userData.setRain = (on, dt = 0.016) => { const r = mat.uniforms.uRain; r.value += ((on ? 1 : 0) - r.value) * Math.min(1, dt * 0.8); };
  /** 화질 낮음·성능 우선: 물빛 무늬·각진 반짝임·빗방울을 빼고 가볍게(파도는 그대로) */
  mesh.userData.setLite = lite => {
    const has = "WATER_LITE" in mat.defines; if (has === !!lite) return;
    if (lite) mat.defines.WATER_LITE = ""; else delete mat.defines.WATER_LITE; mat.needsUpdate = true;
  };
  /** 섬 높이로 물 깊이·해안 거리 텍스처와 쓸려 올라오는 물 판을 (다시) 만듦. */
  mesh.userData.setGrid = grid => {
    const { data, W, H, sd } = shoreData(grid);
    let tex = shared.uDepth.value;
    if (tex.image.width !== W || tex.image.height !== H) {
      tex.dispose(); tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; shared.uDepth.value = tex;
    } else tex.image.data.set(data);
    tex.needsUpdate = true;
    shared.uOrigin.value.set(toWorldX(0), toWorldZ(0)); shared.uSize.value.set(W, H);
    swash.geometry.dispose(); swash.geometry = swashGeometry(grid, data, sd);
  };
  return mesh;
}

/** 고른 칸마다 4×4 조각(물속 칸은 1장). 높이 = 땅 + 2.5 cm(물 위로는 물 판 바로 위 6 mm) — 모래에 붙어 올라옴. */
function swashGeometry(grid, data, sd) {
  const W = grid.w, pick = swashCells(grid, data, sd), pos = [], idx = [], low = WATER_Y + 0.006 - 0.025;
  for (let i = 0; i < pick.length; i++) {
    if (!pick[i]) continue;
    const x = i % W, z = (i / W) | 0, base = pos.length / 3;
    const flat = sd[i] < 0 && terrainHeight(grid, x, z) < low && terrainHeight(grid, x + 1, z) < low && terrainHeight(grid, x, z + 1) < low && terrainHeight(grid, x + 1, z + 1) < low && terrainHeight(grid, x + 0.5, z + 0.5) < low;
    const S = flat ? 1 : SWASH_SUB;                                                    // 물속 칸은 평평한 한 장(삼각형 2)
    for (let b = 0; b <= S; b++) for (let a = 0; a <= S; a++) {
      const gx = x + a / S, gz = z + b / S;
      pos.push(toWorldX(gx), Math.max(terrainHeight(grid, gx, gz) + 0.025, WATER_Y + 0.006), toWorldZ(gz));
    }
    for (let b = 0; b < S; b++) for (let a = 0; a < S; a++) { const v = base + b * (S + 1) + a; idx.push(v, v + S + 1, v + 1, v + 1, v + S + 1, v + S + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : idx);
  return g;
}
