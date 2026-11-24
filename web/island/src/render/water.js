// 섬을 감싸는 바다. 섬 높이(격자)를 텍스처로 받아 물 깊이에 따라 색을 바꿈:
// 얕은 곳 = 밝은 청록, 깊은 곳 = 진한 파랑, 해안선 = 흰 물거품(밀려왔다 빠지는 띠). 안개 적용.
import * as THREE from "three";
import { WATER_Y, toWorldX, toWorldZ } from "../config.js";

export function createWater(size = 300) {
  const depthTex = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RedFormat); depthTex.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    transparent: true, fog: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uDeep: { value: new THREE.Color(0x1d8fb0) }, uMid: { value: new THREE.Color(0x2fbfc4) }, uShallow: { value: new THREE.Color(0x8ff0de) },
      uDepth: { value: depthTex }, uOrigin: { value: new THREE.Vector2(-48, -48) }, uSize: { value: new THREE.Vector2(96, 96) },
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
      uniform float uTime; uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uShallow; varying vec3 vWorld;
      uniform sampler2D uDepth; uniform vec2 uOrigin; uniform vec2 uSize;
      #include <fog_pars_fragment>
      void main() {
        vec2 p = vWorld.xz, uv = (p - uOrigin) / uSize;
        vec2 cuv = clamp(uv, vec2(0.0), vec2(1.0));
        float far = max(0.0, length(p) - 36.0);                                          // 섬 중심에서 36 m 넘게 떨어진 만큼(둥글게, 격자 끝에서 끊기지 않게)
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
        gl_FragColor = vec4(col, mix(0.62, 0.9, smoothstep(0.0, 1.0, depth)));
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = WATER_Y; mesh.renderOrder = 1; mesh.name = "water";
  mesh.userData.tick = t => { mat.uniforms.uTime.value = t; };
  /** 섬 높이로 물 깊이 텍스처를 (다시) 만듦. 칸마다 1화소, 선형 보간으로 부드럽게. */
  mesh.userData.setGrid = grid => {
    const W = grid.w, H = grid.h, data = new Uint8Array(W * H);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const e = grid.get(x, z).elevation, d = Math.max(0, Math.min(3, WATER_Y - e));
      data[z * W + x] = Math.round(d / 3 * 255);
    }
    let tex = mat.uniforms.uDepth.value;
    if (tex.image.width !== W || tex.image.height !== H) {
      tex.dispose(); tex = new THREE.DataTexture(data, W, H, THREE.RedFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; mat.uniforms.uDepth.value = tex;
    } else tex.image.data.set(data);
    tex.needsUpdate = true;
    mat.uniforms.uOrigin.value.set(toWorldX(0), toWorldZ(0)); mat.uniforms.uSize.value.set(W, H);
  };
  return mesh;
}
