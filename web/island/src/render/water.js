// 섬을 감싸는 바다(지시서 3-A). 에메랄드빛 물결 무늬 셰이더, 안개 적용.
import * as THREE from "three";
import { WATER_Y } from "../config.js";

export function createWater(size = 300) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, fog: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uDeep: { value: new THREE.Color(0x1fa69b) }, uShallow: { value: new THREE.Color(0x7fe3d4) },
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
      uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main() {
        vec2 p = vWorld.xz;
        float r = length(p);
        float w = sin(p.x * 0.9 + uTime * 0.8) * 0.5 + sin(p.y * 1.1 - uTime * 0.6) * 0.5 + sin((p.x + p.y) * 0.4 + uTime * 0.5);
        float shore = smoothstep(48.0, 34.0, r);                       // 섬 가까이는 얕은 물빛
        vec3 col = mix(uDeep, uShallow, 0.35 + 0.35 * shore + 0.08 * w);
        float sparkle = smoothstep(1.55, 1.95, w);                     // 물결 꼭대기 반짝임
        col = mix(col, vec3(1.0), sparkle * 0.35);
        gl_FragColor = vec4(col, 0.82 - 0.15 * shore);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = WATER_Y; mesh.renderOrder = 1; mesh.name = "water";
  mesh.userData.tick = t => { mat.uniforms.uTime.value = t; };
  return mesh;
}
