// 섬을 감싸는 바다. 섬 높이(격자)를 텍스처로 받아 물 깊이에 따라 색을 바꿈:
// 얕은 곳 = 밝은 청록, 깊은 곳 = 진한 파랑, 해안선 = 흰 물거품(밀려왔다 빠지는 띠). 안개 적용.
import * as THREE from "three";
import { WATER_Y, toWorldX, toWorldZ } from "../config.js";

export function createWater(size = 480) {
  const depthTex = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RedFormat); depthTex.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    transparent: true, fog: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uLight: { value: 1 }, uDeep: { value: new THREE.Color(0x1d8fb0) }, uMid: { value: new THREE.Color(0x2fbfc4) }, uShallow: { value: new THREE.Color(0x8ff0de) },
      uDepth: { value: depthTex }, uOrigin: { value: new THREE.Vector2(-48, -48) }, uSize: { value: new THREE.Vector2(96, 96) }, uCenter: { value: new THREE.Vector2(0, 0) },
    }]),
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uLight; uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uShallow; varying vec3 vWorld;
      uniform sampler2D uDepth; uniform vec2 uOrigin; uniform vec2 uSize; uniform vec2 uCenter;
      #include <fog_pars_fragment>
      void main() {
        vec2 p = vWorld.xz, uv = (p - uOrigin) / uSize;
        vec2 cuv = clamp(uv, vec2(0.0), vec2(1.0));
        float far = max(0.0, max(abs(p.x - uCenter.x), abs(p.y - uCenter.y)) - (uSize.x * 0.5 - 6.0));   // 깊이 창 끝 바깥으로 갈수록 깊게(창 안은 섬 높이 텍스처가 정함)
        float depth = texture2D(uDepth, cuv).r * 3.0 + far * 0.035;                       // 물 깊이(m): 섬 높이 + 먼 바다일수록 점점 깊게
        float w = sin(p.x * 0.9 + uTime * 0.8) * 0.5 + sin(p.y * 1.1 - uTime * 0.6) * 0.5 + sin((p.x + p.y) * 0.4 + uTime * 0.5);
        vec3 col = mix(uShallow, uMid, smoothstep(0.05, 0.45, depth));
        col = mix(col, uDeep, smoothstep(0.5, 1.6, depth));
        col *= 0.96 + 0.05 * w;
        // 해안 물거품: 아주 얕은 곳에 밀려왔다 빠지는 흰 띠 두 줄
        float shore = 1.0 - smoothstep(0.0, 0.35, depth);
        float band = 0.5 + 0.5 * sin(depth * 28.0 - uTime * 2.2 + sin(p.x * 0.7 + p.y * 0.5) * 1.5);
        float foam = shore * smoothstep(0.55, 0.9, band) + (1.0 - smoothstep(0.0, 0.06, depth)) * 0.9;
        col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.85);
        float sparkle = smoothstep(1.6, 1.95, w) * smoothstep(0.4, 1.5, depth);        // 깊은 곳 물결 반짝임
        col = mix(col, vec3(1.0), sparkle * 0.3);
        col *= uLight;                                                                   // 밤에는 어둡게(daylight.js)
        gl_FragColor = vec4(col, mix(mix(0.62, 0.9, smoothstep(0.0, 1.0, depth)), 1.0, smoothstep(1.3, 1.5, depth)));   // 깊은 곳(1.5 m 넘게)은 불투명: 바다뿐인 바깥 조각은 바닥 메쉬가 없어서
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = WATER_Y; mesh.renderOrder = 1; mesh.name = "water";
  mesh.userData.tick = t => { mat.uniforms.uTime.value = t; };
  mesh.userData.setLight = v => { mat.uniforms.uLight.value = v; };
  /** 섬 높이로 물 깊이 텍스처를 (다시) 만듦. 칸마다 1화소, 선형 보간으로 부드럽게. */
  mesh.userData.setGrid = grid => {
    const W = grid.w, H = grid.h, data = new Uint8Array(W * H);
    // 땅에서 먼 바다일수록 더 깊게(섬 사이 넓은 바다가 진한 파랑): 가장 가까운 땅까지 칸 수(너비 우선)
    const dist = new Int16Array(W * H).fill(-1), q = [];
    for (let i = 0; i < W * H; i++) if (grid.cells[i].elevation >= -0.6) { dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, z = (i / W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue; const ni = nz * W + nx; if (dist[ni] < 0) { dist[ni] = dist[i] + 1; q.push(ni); } } }
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const i = z * W + x, e = grid.cells[i].elevation, d = Math.max(0, Math.min(3, WATER_Y - e + Math.max(0, dist[i]) * 0.07));
      data[i] = Math.round(d / 3 * 255);
    }
    let tex = mat.uniforms.uDepth.value;
    if (tex.image.width !== W || tex.image.height !== H) {
      tex.dispose(); tex = new THREE.DataTexture(data, W, H, THREE.RedFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; mat.uniforms.uDepth.value = tex;
    } else tex.image.data.set(data);
    tex.needsUpdate = true;
    mat.uniforms.uOrigin.value.set(toWorldX(0), toWorldZ(0)); mat.uniforms.uSize.value.set(W, H); mat.uniforms.uCenter.value.set(toWorldX(W / 2), toWorldZ(H / 2));
  };
  /** 보는 곳을 따라가는 깊이 창(render/waterWindow.js가 계산): data = W×W 깊이(0~3 m → 0~255), (ox, oz) = 창 왼위 월드 좌표. 물 판도 창 가운데로 옮김 */
  mesh.userData.setWindow = (data, W, ox, oz) => {
    let tex = mat.uniforms.uDepth.value;
    if (tex.image.width !== W || tex.image.height !== W) { tex.dispose(); tex = new THREE.DataTexture(data, W, W, THREE.RedFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; mat.uniforms.uDepth.value = tex; }
    else tex.image.data.set(data);
    tex.needsUpdate = true;
    mat.uniforms.uOrigin.value.set(ox, oz); mat.uniforms.uSize.value.set(W, W); mat.uniforms.uCenter.value.set(ox + W / 2, oz + W / 2);
    mesh.position.x = ox + W / 2; mesh.position.z = oz + W / 2;
  };
  return mesh;
}
