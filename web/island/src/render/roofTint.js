// 지붕 색 바꾸기. Kenney 건물은 지붕과 마당 덤불이 같은 색표(colormap.png)의 초록을 같이 쓰므로 텍스처를 바꾸면
// 덤불까지 바뀐다. 그래서 모델 높이의 아래 30%는 그대로 두고, 그 위의 초록 픽셀만 셰이더에서 색상(hue)을 돌린다.
// 명암(밝기)은 그대로 두므로 원래 모델의 음영이 유지된다.
import * as THREE from "three";

const HSV = /* glsl */`
vec3 roofRgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y), e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 roofHsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}`;

/** obj 안의 모든 메쉬에서 위쪽 초록을 roof.hue로 바꾼다. obj는 바닥이 y=0인 정규화된 모델. */
export function tintRoofs(obj, roof, cut = 0.3) {
  if (!roof) return;
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), yCut = box.min.y + (box.max.y - box.min.y) * cut, v = new THREE.Vector3();
  obj.traverse(o => {
    if (!o.isMesh || !o.material || !o.material.map) return;
    const g = o.geometry = o.geometry.clone(), pos = g.attributes.position, mask = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) mask[i] = v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).y > yCut ? 1 : 0;
    g.setAttribute("roofMask", new THREE.BufferAttribute(mask, 1));
    const m = o.material = o.material.clone();
    m.onBeforeCompile = sh => {
      sh.uniforms.uRoofHue = { value: roof.hue }; sh.uniforms.uRoofSat = { value: roof.sat ?? 1 };
      sh.vertexShader = "attribute float roofMask;\nvarying float vRoof;\n" +
        sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvRoof = roofMask;");
      sh.fragmentShader = "uniform float uRoofHue;\nuniform float uRoofSat;\nvarying float vRoof;\n" + HSV + "\n" +
        sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
        if (vRoof > 0.5) {
          vec3 hsv = roofRgb2hsv(diffuseColor.rgb);
          if (hsv.y > 0.3 && hsv.x > 0.3 && hsv.x < 0.5) { hsv.x = uRoofHue; hsv.y = clamp(hsv.y * uRoofSat, 0.0, 1.0); diffuseColor.rgb = roofHsv2rgb(hsv); }
        }`);
    };
    m.customProgramCacheKey = () => `roof-${roof.hue}-${roof.sat ?? 1}`;
  });
}
