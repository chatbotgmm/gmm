// 카메라 각도 계산(three.js 없이, 시험하기 쉽게): 카메라 − 보는 점 벡터 ↔ { 거리 · 방위각 · 수직에서 기운 각 }.
// viewCam.js(평소·건설 모드 같은 시점)가 씀. 예전엔 건설 모드 고정 쿼터뷰(QuarterCam)도 여기 있었으나, 건설 모드도 플레이 시점을 그대로 쓰게 되어 뺌.
const QUARTER_TURN = Math.PI * 2;

/** 각도를 0 ~ 2π로 */
export const quarterNorm = a => ((a % QUARTER_TURN) + QUARTER_TURN) % QUARTER_TURN;
/** from → to로 가는 가장 짧은 회전(−π ~ π] */
export function quarterDelta(from, to) { const d = quarterNorm(to - from); return d > Math.PI ? d - QUARTER_TURN : d; }
/** 카메라 − 보는 점 벡터 → { r 거리, yaw 방위각, pitch 수직에서 기운 각 } */
export function quarterOrbit(off) { const r = Math.hypot(off.x, off.y, off.z) || 1; return { r, yaw: quarterNorm(Math.atan2(off.x, off.z)), pitch: Math.acos(Math.max(-1, Math.min(1, off.y / r))) }; }
/** 거리·방위각·기운 각 → 카메라 − 보는 점 벡터 */
export function quarterOffset(r, yaw, pitch) { const s = Math.sin(pitch) * r; return { x: s * Math.sin(yaw), y: Math.cos(pitch) * r, z: s * Math.cos(yaw) }; }
