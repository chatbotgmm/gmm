// 가로등 발밑 빛 웅덩이(땅 셰이더): 보는 곳에서 가까운 켜진 가로등 LAMP_POOL_MAX개의 자리를 땅 재질 유니폼으로 넘기면, 땅(seasons.js seasonalGround)이
// 그 둘레를 따뜻한 등불 빛으로 칠함. 예전처럼 원판(메쉬)을 덮지 않고 땅 색을 보고 칠함 → 잔디 위에서 연두·올리브 원판이 생기지 않음:
//  · 빛이 닿는 만큼 땅 색을 밝기만 남긴 따뜻한 회색 쪽으로 옮김(최대 LAMP_POOL_DESAT, 반지름 × LAMP_POOL_WIDE까지) — 실제 빛(PointLight)이 비춰도 풀빛 × 주황 = 올리브가 안 됨
//  · 그 색 × 등불 색 × 세기를 발광으로 더함(밝은 돌길·눈은 환하게, 어두운 땅은 덜) → 실제 빛 개수(그래픽 설정, 성능 우선이면 0)와 상관없이 같은 웅덩이
//  · 높이 차가 큰 곳(절벽 아래·위)에는 번지지 않음. 낮에는 개수 0이라 반복문이 바로 끝남(비용 없음)
// 값은 daylight.js streetLamps가 0.5초마다 넣음(xyz = 가로등 발밑 월드 좌표, w = 세기 0~1: 밤 정도)
import * as THREE from "three";

export const LAMP_POOL_MAX = 8, LAMP_POOL_R = 4.2, LAMP_POOL_DESAT = 0.75, LAMP_POOL_WIDE = 1.4;   // 반지름(m) · 땅 색을 빼는 정도 · 색 빼기는 반지름의 이 배수까지(실제 빛이 닿는 가장자리도 올리브가 안 되게)
export const LAMP_POOL_COL = 0xffa860;                                             // 웅덩이 빛 색(따뜻한 주황, 셰이더에선 선형 색 × LAMP_POOL_GAIN)
export const LAMP_POOL_GAIN = 1.2;
export const LAMP_POOL_U = {
  uLampN: { value: 0 }, uLampR: { value: LAMP_POOL_R },
  uLamps: { value: Array.from({ length: LAMP_POOL_MAX }, () => new THREE.Vector4()) },
  uLampCol: { value: new THREE.Color(LAMP_POOL_COL).multiplyScalar(LAMP_POOL_GAIN) },
};
export const LAMP_POOL_PARS = `uniform int uLampN; uniform float uLampR; uniform vec4 uLamps[${LAMP_POOL_MAX}]; uniform vec3 uLampCol;\n`;
/** color_fragment 뒤(땅 색이 정해진 다음)에 넣는 코드. posW: 월드 좌표 varying 이름 */
export const lampPoolFrag = posW => `
      { float lampF = 0.0, lampW = 0.0;
        for (int i = 0; i < ${LAMP_POOL_MAX}; i++) { if (i >= uLampN) break; vec4 lampP = uLamps[i];
          float lampR = length(${posW}.xz - lampP.xz) / uLampR, lampH = lampP.w * (1.0 - smoothstep(1.0, 2.5, abs(${posW}.y - lampP.y)));
          float lampD = clamp(1.0 - lampR, 0.0, 1.0);
          lampF += lampD * lampD * lampH; lampW += clamp(1.0 - lampR / ${LAMP_POOL_WIDE.toFixed(2)}, 0.0, 1.0) * lampH; }
        if (lampW > 0.001) {
          float lampL = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(diffuseColor.rgb, min(vec3(1.0), lampL * vec3(1.12, 0.98, 0.8)), min(1.0, lampW * 1.6) * ${LAMP_POOL_DESAT.toFixed(2)});
          totalEmissiveRadiance += diffuseColor.rgb * uLampCol * min(lampF, 1.4); } }`;
/** 켜진 가로등 발밑 자리들(가까운 순, [THREE.Vector3, ...])과 세기로 유니폼을 채움 */
export function setLampPools(points, strength) {
  const n = strength > 0.005 ? Math.min(LAMP_POOL_MAX, points.length) : 0, L = LAMP_POOL_U.uLamps.value;
  for (let i = 0; i < n; i++) L[i].set(points[i].x, points[i].y, points[i].z, strength);
  LAMP_POOL_U.uLampN.value = n;
}
