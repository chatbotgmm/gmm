// 그림체(툰·클레이)로 바꾼 재질의 출신 기록(순수 로직, three.js 없이 시험 가능).
// 섬(Toon)과 방(Toon)은 따로 있지만 갈매미 복제(SkeletonUtils.clone)는 재질을 나눠 씀 — 섬이 이미 바꾼 재질이 방으로 들어옴.
// 그 재질을 방이 「원래 재질」로 알고 한 번 더 바꾸면 셰이더 수정(클레이 노이즈·눈)이 두 번 붙어 셰이더가 깨짐(그림자만 남고 몸이 안 그려짐).
// 그래서 어느 Toon이 만든 재질이든 여기 적어 두고, 바꿀 때·되돌릴 때 늘 원래 재질에서 시작함.
const MADE = new WeakMap();                                                    // 바꾼 재질 → 원래 재질(모든 Toon 공용)
/** Toon이 원래 재질 src로 새 재질 t를 만들었음 */
export function markToonMade(t, src) { MADE.set(t, origin(src)); return t; }
/** 원래 재질: 어느 Toon이 만든 재질이면 그 원래 재질, 아니면 그대로 */
export function origin(m) { return (m && MADE.get(m)) || m; }
/** 어느 Toon이 만든 재질인가 */
export function isToonMade(m) { return !!m && MADE.has(m); }
