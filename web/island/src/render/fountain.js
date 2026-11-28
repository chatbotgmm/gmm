// 분수 물(사용자 모델 fountain_{T}.glb 위에 얹는 진짜 물, 2026-11-28). 모델 텍스처엔 물이 없음(웅덩이 바닥이 회색 돌) → 셰이더로 채움.
//  · 웅덩이 3개(아래 큰 물받이 · 가운데 단 · 위 단): 잔물결 · 물빛 무늬 · 비스듬히 볼수록 하늘빛(프레넬) · 반투명 · 물줄기가 떨어지는 자리에 흰 거품.
//    색은 바다(water.js)의 얕은 물·중간 물 색. 밤에는 바다처럼 어둡고 남색으로(빛나지 않음)
//  · 물줄기: 가운데 기둥 꼭대기 아래 물구멍 4개에서 위 단으로 휘는 줄기 + 위 단 테 넘어 가운데 단으로 4장 + 가운데 단 테 넘어 큰 물받이로 4장(흘러내리는 무늬가 아래로 흐름)
//  · 물방울: 분수 하나에 점(Points) 하나, 최대 144알. 물구멍 물보라 · 물줄기에서 튀는 방울 · 떨어진 자리의 작은 튐. 위치는 셰이더가 시간으로 계산(CPU가 알마다 움직이지 않음)
// 그리기 호출: 분수 하나에 3번 더(웅덩이 1 · 물줄기 1 · 물방울 1, 그림자 없음). 모양·재질은 모든 분수가 같이 씀(분수마다 시간 차는 자리로 정함).
// 좌표는 원본 모델 좌표(높이 −0.306~0.306, 폭 1.0) — views.js가 모델과 같은 자리·크기로 붙임. 물 높이는 모델 면을 위→아래 광선으로 재서 정함:
//   큰 물받이 바닥 −0.167 · 테 위 −0.14(안쪽 반지름 0.36) / 가운데 단 바닥 −0.094 · 테 위 −0.071(바깥 0.193) / 위 단 바닥 0.038 · 테 위 0.06(바깥 0.134) / 기둥 반지름 0.05, 꼭대기 0.096
import * as THREE from "three";

const FOUNT_POOLS = [   // [수면 높이, 반지름(테 속으로 조금 들어감), 물 떨어지는 자리 반지름, 그 자리 각도(첫째, 90°마다)]
  [-0.150, 0.372, 0.214, 0], [-0.081, 0.178, 0.150, Math.PI / 4], [0.051, 0.122, 0.101, Math.PI / 4]];
const FOUNT_SPOUT = { r: 0.052, y: 0.086, land: 0.101, up: 0.08 };            // 기둥 물구멍(반지름·높이) → 위 단 수면에 떨어지는 반지름, 위로 솟는 정도
const FOUNT_LIPS = [   // 테를 넘는 물: [테 반지름, 테 높이, 떨어지는 웅덩이 수면, 바깥으로 나가는 거리, 폭(m, 원본 좌표), 첫 각도]
  [0.128, 0.061, -0.081, 0.024, 0.05, Math.PI / 4], [0.190, -0.070, -0.150, 0.026, 0.066, 0]];
export const FOUNT_MAX = 144;                                                 // 물방울 최대 수(설정마다 앞에서부터 이만큼: 최고·높음 144 · 보통 96 · 낮음 48 · 성능 우선 0)

// 모든 분수가 같이 쓰는 값: 시간 · 밝기 · 해 방향과 빛 색 · 밤(daylight.js setFountainSky) · 화면 높이(점 크기)
const FOUNT_U = {
  uTime: { value: 0 }, uLight: { value: 1 }, uNight: { value: 0 }, uSunDir: { value: new THREE.Vector3(-0.6, 0.55, 0.32).normalize() }, uSunCol: { value: new THREE.Color(0xfff2d8) },
  uShallow: { value: new THREE.Color(0x8ff0de) }, uMid: { value: new THREE.Color(0x2fbfc4) }, uSky: { value: new THREE.Color(0xd8f2f6) }, uViewH: { value: 800 },
};
const FOUNT_COMMON = /* glsl */`
  uniform float uTime; uniform float uLight; uniform float uNight; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uShallow; uniform vec3 uMid; uniform vec3 uSky;
  float fHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float fNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), f.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0)), f.x), f.y); }
  vec3 fNightTint(vec3 c) { return mix(c, c * vec3(0.42, 0.52, 0.92), uNight * 0.85) * uLight; }   // 바다(water.js)와 같은 밤빛
`;
// 분수마다 다른 시간 차(놓인 자리로) — 여러 분수가 똑같이 뛰지 않게
const FOUNT_PHASE = /* glsl */`float fPhase = fHash(floor(vec2(modelMatrix[3].x, modelMatrix[3].z) * 2.0)) * 37.0;`;

let fountGeo = null, fountMat = null;
/** 원 판 하나(가운데 + 고리 6줄 × 40조각): uv = (x, z) / 반지름, aPool = (반지름, 떨어지는 자리 반지름, 첫 각도) */
function fountDisc(P, I, A, U, [y, R, impR, impA]) {
  const base = P.length / 3, RINGS = 6, SEG = 40;
  P.push(0, y, 0); U.push(0, 0); A.push(R, impR, impA);
  for (let r = 1; r <= RINGS; r++) for (let s = 0; s < SEG; s++) {
    const a = s / SEG * Math.PI * 2, k = r / RINGS; P.push(Math.cos(a) * R * k, y, Math.sin(a) * R * k); U.push(Math.cos(a) * k, Math.sin(a) * k); A.push(R, impR, impA);
  }
  for (let s = 0; s < SEG; s++) I.push(base, base + 1 + (s + 1) % SEG, base + 1 + s);
  for (let r = 1; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
    const a = base + 1 + (r - 1) * SEG + s, b = base + 1 + (r - 1) * SEG + (s + 1) % SEG, c = a + SEG, d = b + SEG; I.push(a, b, d, a, d, c);
  }
}
/** 물줄기 띠 하나: path(v) → [반지름, 높이], 각도 a0 둘레로 폭 w(가로 방향) · uv.x 가로(0~1), uv.y 내려온 정도(0 위 → 1 아래), aLen = 띠 길이(무늬가 길이에 맞게 흐름) */
function fountRibbon(P, I, U, L, path, a0, w, len, arc = false) {
  const base = P.length / 3, NU = 4, NV = 10;
  for (let j = 0; j <= NV; j++) { const v = j / NV, [r, y] = path(v);
    for (let i = 0; i <= NU; i++) { const u = i / NU;
      if (arc) { const a = a0 + (u - 0.5) * w / r; P.push(Math.cos(a) * r, y, Math.sin(a) * r); }   // 테를 넘는 물: 테를 따라 휜 장막
      else { const t = (u - 0.5) * w; P.push(Math.cos(a0) * r - Math.sin(a0) * t, y, Math.sin(a0) * r + Math.cos(a0) * t); }   // 물구멍 줄기: 가로로 납작한 띠
      U.push(u, v); L.push(len);
    } }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = base + j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; I.push(a, c, b, b, c, d); }
}
const fountJet = (v, s = FOUNT_SPOUT) => [s.r + (s.land - s.r) * v, s.y + s.up * v - (s.up + s.y - FOUNT_POOLS[2][0]) * v * v];   // 물구멍 줄기: 바깥으로 고르게 · 위로 솟았다 떨어짐
const fountFall = (v, [r0, y0, y1, out]) => [r0 + out * Math.sqrt(v) + 0.004 * Math.sin(v * 3.1), y0 + 0.006 * Math.sin(v * Math.PI) * (1 - v) - (y0 - y1 + 0.003) * v * v];   // 테를 넘어 둥글게 떨어짐(끝은 수면 조금 아래)

function fountBuild() {
  if (fountGeo) return;
  // 웅덩이 3개 → 메쉬 하나
  const P = [], I = [], A = [], U = [];
  for (const p of FOUNT_POOLS) fountDisc(P, I, A, U, p);
  const pools = new THREE.BufferGeometry(); pools.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); pools.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  pools.setAttribute("aPool", new THREE.Float32BufferAttribute(A, 3)); pools.setIndex(I); pools.computeBoundingSphere();
  // 물줄기: 물구멍 4 + 위 단 테 4 + 가운데 단 테 4 → 메쉬 하나
  const P2 = [], I2 = [], U2 = [], L2 = [];
  for (let k = 0; k < 4; k++) fountRibbon(P2, I2, U2, L2, fountJet, FOUNT_POOLS[2][3] + k * Math.PI / 2, 0.011, 0.07);
  for (const lip of FOUNT_LIPS) for (let k = 0; k < 4; k++) fountRibbon(P2, I2, U2, L2, v => fountFall(v, lip), lip[5] + k * Math.PI / 2, lip[4], lip[1] - lip[2], true);
  const falls = new THREE.BufferGeometry(); falls.setAttribute("position", new THREE.Float32BufferAttribute(P2, 3)); falls.setAttribute("uv", new THREE.Float32BufferAttribute(U2, 2));
  falls.setAttribute("aLen", new THREE.Float32BufferAttribute(L2, 1)); falls.setIndex(I2); falls.computeBoundingSphere();
  // 물방울: 알마다 (종류, 물줄기 번호, 난수 2) — 종류 0 물구멍 물보라 · 1 테에서 떨어지는 방울 · 2 떨어진 자리 튐. 앞에서부터 잘라 써도 섞이게 번갈아 둠
  const S = new Float32Array(FOUNT_MAX * 4), dummy = new Float32Array(FOUNT_MAX * 3);
  for (let i = 0; i < FOUNT_MAX; i++) { const r1 = (Math.sin(i * 12.9898) * 43758.5453) % 1, r2 = (Math.sin(i * 78.233) * 12543.1234) % 1;
    S.set([i % 3, Math.floor(i / 3) % 8, Math.abs(r1), Math.abs(r2)], i * 4); }
  const drops = new THREE.BufferGeometry(); drops.setAttribute("position", new THREE.BufferAttribute(dummy, 3)); drops.setAttribute("aSeed", new THREE.BufferAttribute(S, 4));
  drops.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -0.05, 0), 0.45);   // 자리는 셰이더가 정하므로 둘레를 직접 적음(화면 밖이면 안 그림)
  fountGeo = { pools, falls, drops };

  const common = { uniforms: FOUNT_U, transparent: true, depthWrite: false, fog: false };
  fountMat = {
    pools: new THREE.ShaderMaterial({ ...common, polygonOffset: true, polygonOffsetFactor: -1,
      vertexShader: /* glsl */`
        attribute vec3 aPool; varying vec2 vUv; varying vec3 vPool; varying vec3 vWorld; varying float vPhase;
        float fHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main() { vUv = uv; vPool = aPool; ${FOUNT_PHASE} vPhase = fPhase;
          vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`
        ${FOUNT_COMMON}
        varying vec2 vUv; varying vec3 vPool; varying vec3 vWorld; varying float vPhase;
        void main() {
          float t = uTime + vPhase, R = vPool.x, rr = length(vUv), r = rr * R;           // r: 가운데에서 거리(원본 좌표)
          vec2 p = vUv * R * 40.0;
          // 물 떨어지는 자리(90°마다 4곳)까지 거리 → 거기서 퍼지는 동그라미 물결 + 흰 거품
          float ang = atan(vUv.y, vUv.x) - vPool.z, seg = 1.5707963;
          float a = mod(ang + seg * 0.5, seg) - seg * 0.5;
          vec2 q = vec2(r * cos(a) - vPool.y, r * sin(a));
          float di = length(q);
          // 물결 높이 h(q, 원본 좌표) → 기울기로 면 방향(화면 미분 dFdx를 쓰면 삼각형 모양 얼룩이 생겨 직접 두 번 더 잼)
          #define FOUNT_H(pp) (fNoise((pp) * 22.0 + vec2(t * 0.35, -t * 0.27)) + fNoise((pp) * 52.0 - vec2(t * 0.5, t * 0.21)) * 0.5)
          vec2 lp = vUv * R, e = vec2(0.004, 0.0);
          float n0 = FOUNT_H(lp), nx = FOUNT_H(lp + e.xy), nz = FOUNT_H(lp + e.yx);
          vec2 radial = lp / max(r, 1e-4), impD = q / max(di, 1e-4);
          vec2 grad = vec2(nx - n0, nz - n0) * 0.9                                         // 잔잔한 잔물결
                    + radial * cos(r * 120.0 - t * 2.4) * 0.12                              // 가운데에서 퍼지는 물결
                    + impD * cos(di * 260.0 - t * 7.0) * exp(-di * 30.0) * 0.5;             // 물 떨어지는 자리의 동그라미 물결(방향은 대략 — 각도 회전은 무시)
          vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(V, N), 0.0), 3.0);
          vec3 col = mix(uShallow, uMid, 0.35 + 0.35 * smoothstep(0.2, 1.0, rr));
          col *= 0.95 + 0.1 * n0;
        #ifndef FOUNT_LITE
          vec2 cp = lp * 62.0;
          float cau = abs(sin(cp.x + sin(cp.y * 0.8 + t * 0.9) * 1.6) * sin(cp.y * 1.1 + sin(cp.x * 0.7 - t * 0.8) * 1.6));
          col += vec3(0.06, 0.085, 0.07) * smoothstep(0.62, 0.95, cau);                     // 바닥에 어른거리는 물빛 그물
        #endif
          col = mix(col, uSky * (1.0 - 0.5 * uNight), clamp(fres * 0.8 + 0.06, 0.0, 0.7));
          vec3 H = normalize(uSunDir + V);
          col += uSunCol * pow(max(dot(N, H), 0.0), 120.0) * 0.8 * (1.0 - 0.6 * uNight);   // 해(달) 반짝임
          float foam = smoothstep(0.035, 0.0, di) * (0.55 + 0.45 * fNoise(p * 2.2 + t * 3.0));
          foam += smoothstep(0.93, 1.0, rr) * 0.25 * fNoise(p * 1.7 - t);                 // 테에 닿는 물가
          col = mix(col, vec3(0.97, 1.0, 1.0), clamp(foam, 0.0, 0.9));
          float alpha = clamp(0.86 + fres * 0.12 + foam * 0.2, 0.0, 0.97);
          gl_FragColor = vec4(fNightTint(col) * (1.0 - 0.2 * uNight), alpha);
        }` }),
    falls: new THREE.ShaderMaterial({ ...common, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        attribute float aLen; varying vec2 vUv; varying float vLen; varying vec3 vWorld; varying float vPhase;
        float fHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main() { vUv = uv; vLen = aLen; ${FOUNT_PHASE} vPhase = fPhase;
          vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`
        ${FOUNT_COMMON}
        varying vec2 vUv; varying float vLen; varying vec3 vWorld; varying float vPhase;
        void main() {
          float t = uTime + vPhase;
          float y = vUv.y * vLen * 60.0 - t * 2.6;                                         // 아래로 흐르는 무늬(길이에 맞춰 같은 빠르기)
          float streak = fNoise(vec2(vUv.x * 7.0, y)) * 0.6 + fNoise(vec2(vUv.x * 15.0 + 3.0, y * 1.8)) * 0.4;
          float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);       // 양옆은 옅게
          float top = smoothstep(0.0, 0.08, vUv.y);
          float foot = smoothstep(0.72, 1.0, vUv.y);                                        // 떨어지는 끝은 하얗게 부서짐
          vec3 col = mix(uShallow, vec3(1.0), 0.35 + 0.45 * smoothstep(0.45, 0.85, streak) + foot * 0.4);
          vec3 V = normalize(cameraPosition - vWorld);
          col += uSunCol * 0.25 * smoothstep(0.7, 0.95, streak) * (0.4 + 0.6 * max(uSunDir.y, 0.0));
          float alpha = (0.42 + 0.4 * streak + foot * 0.25) * edge * top;
          gl_FragColor = vec4(fNightTint(col), clamp(alpha, 0.0, 0.9));
          if (gl_FragColor.a < 0.02) discard;
        }` }),
    drops: new THREE.ShaderMaterial({ ...common, uniforms: FOUNT_U,
      vertexShader: /* glsl */`
        ${FOUNT_COMMON}
        uniform float uViewH; attribute vec4 aSeed; varying float vA;
        void main() {
          ${FOUNT_PHASE}
          float kind = aSeed.x, k = aSeed.y, r1 = aSeed.z, r2 = aSeed.w;
          float life = kind < 0.5 ? 0.85 : kind < 1.5 ? 0.6 : 0.45;
          float cyc = (uTime + fPhase) / life + r1 * 7.0, ph = fract(cyc), id = floor(cyc);
          float j1 = fHash(vec2(id, r2 * 91.0)), j2 = fHash(vec2(r1 * 53.0, id + 7.0));   // 알마다·바퀴마다 다른 흩어짐
          vec3 p; float size;
          if (kind < 0.5) {                                                                // 물구멍 물보라: 4 줄기를 따라 조금씩 흩어져 위 단으로
            float a = ${(FOUNT_POOLS[2][3]).toFixed(5)} + mod(k, 4.0) * 1.5707963 + (j1 - 0.5) * 0.35;
            float land = ${FOUNT_SPOUT.land.toFixed(4)} + (j2 - 0.5) * 0.03, up = ${FOUNT_SPOUT.up.toFixed(4)} * (0.8 + 0.5 * j2);
            float r = ${FOUNT_SPOUT.r.toFixed(4)} + (land - ${FOUNT_SPOUT.r.toFixed(4)}) * ph;
            float y = ${FOUNT_SPOUT.y.toFixed(4)} + up * ph - (up + ${FOUNT_SPOUT.y.toFixed(4)} - ${FOUNT_POOLS[2][0].toFixed(4)}) * ph * ph;
            p = vec3(cos(a) * r, y, sin(a) * r); size = 0.0065;
          } else {
            float upper = step(mod(k, 2.0), 0.5);                                          // 짝수: 위 단 테 → 가운데 단, 홀수: 가운데 단 테 → 큰 물받이
            float r0 = mix(${FOUNT_LIPS[1][0].toFixed(4)}, ${FOUNT_LIPS[0][0].toFixed(4)}, upper), y0 = mix(${FOUNT_LIPS[1][1].toFixed(4)}, ${FOUNT_LIPS[0][1].toFixed(4)}, upper);
            float y1 = mix(${FOUNT_LIPS[1][2].toFixed(4)}, ${FOUNT_LIPS[0][2].toFixed(4)}, upper), out0 = mix(${FOUNT_LIPS[1][3].toFixed(4)}, ${FOUNT_LIPS[0][3].toFixed(4)}, upper);
            float w = mix(${FOUNT_LIPS[1][4].toFixed(4)}, ${FOUNT_LIPS[0][4].toFixed(4)}, upper) / r0;
            float a = mix(${FOUNT_LIPS[1][5].toFixed(5)}, ${FOUNT_LIPS[0][5].toFixed(5)}, upper) + mod(floor(k / 2.0), 4.0) * 1.5707963 + (j1 - 0.5) * w * 1.1;
            if (kind < 1.5) {                                                              // 장막 앞에서 떨어지는 방울(장막보다 조금 바깥)
              float r = r0 + out0 * (0.6 + 0.9 * j2) * sqrt(ph) + 0.01 * ph;
              float y = y0 - (y0 - y1) * ph * ph;
              p = vec3(cos(a) * r, y, sin(a) * r); size = 0.0055;
            } else {                                                                        // 떨어진 자리에서 튐: 짧게 솟았다 떨어짐
              float r = r0 + out0 + (j2 - 0.3) * 0.03 * ph;
              float h = (0.012 + 0.018 * j2) * 4.0 * ph * (1.0 - ph);
              float sa = a + (j2 - 0.5) * 0.4 * ph;
              p = vec3(cos(sa) * r, y1 + h + 0.002, sin(sa) * r); size = 0.0045;
            }
          }
          vA = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.75, 1.0, ph));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float sc = length(modelMatrix[0].xyz);                                           // 모델 크기 배율(원본 좌표 → m)
          gl_PointSize = clamp(size * sc * uViewH * projectionMatrix[1][1] * 0.5 / -mv.z, 1.0, 14.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        ${FOUNT_COMMON}
        varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5; float r2 = dot(d, d) * 4.0; if (r2 > 1.0) discard;
          float soft = 1.0 - r2;
          vec3 col = mix(uShallow, vec3(1.0), 0.75 + 0.25 * soft);
          gl_FragColor = vec4(fNightTint(col), vA * soft * 0.85);
        }` }),
  };
}

/** 분수 물 한 벌(원본 모델 좌표). 이름 fountainWater — views.js가 찾아 공사 중엔 숨김. 움직임은 셰이더(tickFountains가 시간만 넘김) */
export function fountainWater() {
  fountBuild();
  const g = new THREE.Group(); g.name = "fountainWater"; g.userData.fx = true;
  const add = (o, order) => { o.renderOrder = order; o.castShadow = o.receiveShadow = false; o.userData.noToon = true; o.raycast = () => {}; g.add(o); return o; };
  add(new THREE.Mesh(fountGeo.pools, fountMat.pools), 2);
  add(new THREE.Mesh(fountGeo.falls, fountMat.falls), 3);
  const pts = add(new THREE.Points(fountGeo.drops, fountMat.drops), 4); pts.name = "fountainDrops";
  return g;
}

let fountCount = FOUNT_MAX, fountCalm = false, fountT = 0;
/** 그래픽 설정: 물방울 수 · 가벼운 물(물빛 무늬 뺌) */
export function setFountainQuality(c) {
  fountCount = c.fountainDrops ?? FOUNT_MAX; fountBuild();
  fountGeo.drops.setDrawRange(0, fountCount); fountMat.drops.visible = fountCount > 0 && !fountCalm;
  const m = fountMat.pools, lite = !!c.waterLite; if (("FOUNT_LITE" in m.defines) !== lite) { if (lite) m.defines.FOUNT_LITE = ""; else delete m.defines.FOUNT_LITE; m.needsUpdate = true; }
}
/** 매 프레임(views.js): dt만큼 시간을 흘림. 움직임 줄이기(html[data-motion="reduce"])면 물방울을 끄고 물결은 천천히. viewH: 그리는 화면 높이(px, 물방울 크기) */
export function tickFountains(dt, viewH) {
  if (!fountMat) return;
  const calm = typeof document !== "undefined" && document.documentElement.dataset.motion === "reduce";
  if (calm !== fountCalm) { fountCalm = calm; fountMat.drops.visible = fountCount > 0 && !calm; }
  fountT = (fountT + Math.min(dt, 0.1) * (calm ? 0.3 : 1)) % 3600; FOUNT_U.uTime.value = fountT;
  if (viewH) FOUNT_U.uViewH.value = viewH;
}
/** 밝기·해(달) 방향과 빛 색·밤(0~1): daylight.js가 바다와 같이 넘김 */
export function setFountainSky(light, dir, sunCol, night) {
  FOUNT_U.uLight.value = light; FOUNT_U.uSunDir.value.copy(dir); FOUNT_U.uSunCol.value.copy(sunCol); FOUNT_U.uNight.value = night;
}
/** 건물 사진(thumbs.js): 밤에 찍어도 분수 물은 낮 밝기로, 물방울 크기는 사진 높이(px)로 — fn을 부르는 동안만 */
export function withFountainDay(viewH, fn) {
  const u = FOUNT_U, keep = [u.uLight.value, u.uNight.value, u.uSunDir.value.clone(), u.uSunCol.value.clone(), u.uViewH.value];
  u.uLight.value = 1; u.uNight.value = 0; u.uSunDir.value.set(-0.6, 0.55, 0.32).normalize(); u.uSunCol.value.setHex(0xfff2d8); u.uViewH.value = viewH;
  try { return fn(); } finally { [u.uLight.value, u.uNight.value] = keep; u.uSunDir.value.copy(keep[2]); u.uSunCol.value.copy(keep[3]); u.uViewH.value = keep[4]; }
}
