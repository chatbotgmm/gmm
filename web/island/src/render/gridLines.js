// 건설 모드 격자선: 바닥 청크 재질에 셰이더로 칸 경계(정수 격자 좌표)를 그림 → 물체·그리기 호출 0, 경사·단차를 그대로 따라감.
// seasonalGround(seasons.js)의 onBeforeCompile 뒤에 이어 붙이고(체인), 툰·클레이 복사본은 toon.js가 이 함수를 그대로 옮김.
// 켜고 끄기는 유니폼 uGrid(0~1) 세기만 바꿈(셰이더 다시 만들지 않음). 0이면 셰이더가 계산을 건너뜀.
import { CELL, GRID_W, GRID_H, SEA_LEVEL } from "../config.js";

export const GRID_LINE_U = { uGrid: { value: 0 } };
const glf = n => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** 땅 재질 하나에 격자선을 붙임(이미 붙은 onBeforeCompile·customProgramCacheKey는 먼저 부르고 이어서) */
export function gridGround(mat) {
  if (mat.userData.gridLines) return mat; mat.userData.gridLines = true;
  const prev = Object.prototype.hasOwnProperty.call(mat, "onBeforeCompile") ? mat.onBeforeCompile : null, prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r); Object.assign(sh.uniforms, GRID_LINE_U);
    sh.vertexShader = "varying vec3 vGridW; varying float vGridUp;\n" + sh.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\n vGridW = (modelMatrix * vec4(transformed, 1.0)).xyz; vGridUp = normalize(mat3(modelMatrix) * objectNormal).y;");
    // 바닥 색이 다 정해진 뒤(계절·눈 다음), 빛 계산 전: Standard·Toon 둘 다 emissivemap_fragment가 그 자리
    sh.fragmentShader = "uniform float uGrid; varying vec3 vGridW; varying float vGridUp;\n" + sh.fragmentShader.replace("#include <emissivemap_fragment>", `if (uGrid > 0.001) {
        vec2 gp = vGridW.xz / ${glf(CELL)} + vec2(${glf(GRID_W / 2)}, ${glf(GRID_H / 2)});   // 격자 좌표: 칸 경계 = 정수
        vec2 fw = max(fwidth(gp), vec2(1e-4));
        vec2 dl = abs(fract(gp - 0.5) - 0.5) / fw;                                       // 가까운 칸 경계까지 화면 픽셀 수
        float line = 1.0 - smoothstep(0.35, 1.25, min(dl.x, dl.y));                      // 1픽셀 남짓, 계단 없이
        float far = 1.0 - smoothstep(0.12, 0.33, max(fw.x, fw.y));                       // 칸이 3~8픽셀보다 작아지면 옅게(무늬 깨짐 방지)
        far *= 1.0 - smoothstep(40.0, 95.0, distance(vGridW, cameraPosition));           // 카메라에서 멀수록 옅게
        float up = smoothstep(0.45, 0.75, vGridUp);                                     // 위를 보는 면만(절벽 벽에는 안 그림)
        float land = smoothstep(${glf(SEA_LEVEL - 0.02)}, ${glf(SEA_LEVEL + 0.03)}, vGridW.y);   // 물 밑(바다·연못 바닥)엔 안 그림
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 ink = mix(min(diffuseColor.rgb + 0.35, vec3(1.0)), diffuseColor.rgb * 0.5, smoothstep(0.16, 0.3, lum));   // 밝은 바닥(눈·모래·잔디)은 어둡게, 아주 어두운 바닥은 밝게
        diffuseColor.rgb = mix(diffuseColor.rgb, ink, clamp(line * far * up * land * uGrid * 0.6, 0.0, 1.0));
      }
      #include <emissivemap_fragment>`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : "") + "-grid";
  mat.needsUpdate = true;
  return mat;
}

/** 매 프레임: 보일지(want)에 따라 세기를 빠르게(약 0.15초) 바꿈 */
export function stepGridLines(dt, want) {
  const u = GRID_LINE_U.uGrid, goal = want ? 1 : 0;
  u.value += (goal - u.value) * Math.min(1, dt * 14); if (Math.abs(goal - u.value) < 0.002) u.value = goal;
  return u.value;
}
