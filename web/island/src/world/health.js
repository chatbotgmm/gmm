// 병(감기)과 갈매미 의원(순수 계산: 숫자·판단만. 굴림은 world.hrnd로 World가 함). 설계: health_climate_design.md 4~5장 + 사용자 결정(2026-11-26).
//  · 아늑하게: 아무도 죽거나 떠나지 않음. 병은 한 번에 하나(u.sick = { kind, left, med }), 회복 점수 left를 다 깎으면 나음.
//  · 걸림: 30초마다 한 번(HEALTH_EVERY) 꽁꽁(체온 ≤ 38.3, 밖)인 갈매미가 FREEZE_CHANCE(5%, 설계 8%에서 시뮬로 낮춤)로 감기.
//  · 옮음(전염): 30초마다 밖에 있는 감기 갈매미의 CONTAGION_R칸 안, 밖에 있는 건강한 갈매미가 CONTAGION_P로(목도리를 두르면 절반).
//    마을이 멈추지 않게: 나은 뒤 IMMUNE_SECS 동안은 다시 안 걸림 · 동시에 앓는 갈매미는 갈매미 수의 1/3(내림, 적어도 1)까지.
//  · 회복(초당 left 감소): 밖 0.5 · 건물 안 1 · 잠(침대) 2 · 의원 침대 3 · 의원 + 당번 의사 4.5 · 약을 먹으면 바로 −120, 그 뒤 ×1.5.
//  · 의원: 진료비 3🪙(가진 만큼, 없으면 무료) · 약 4🪙(의사가 있을 때만, 가진 만큼) → 금고(돌아온 돈, 장부 clinic 칸).
//    당번 의사(플레이어가 world.setDoctor로 정함)는 환자가 나을 때마다 품삯 2🪙(금고에서, 모자라면 밀림 = 공사 품삯과 같은 규칙).
export const HEALTH_EVERY = 30;
export const FREEZE_CHANCE = 0.05;
export const CONTAGION_R = 2, CONTAGION_P = 0.02, SCARF_GUARD = 0.5;
export const IMMUNE_SECS = 600;          // 나은 뒤 마을 하루 동안은 다시 안 걸림
/** 동시에 앓을 수 있는 갈매미 수(새로 걸리는 것만 막음) */
export const sickCap = n => Math.max(1, Math.floor(n / 3));

export const SICK = {
  cold: { id: "cold", name: "감기", icon: "🤧", left: 300, eff: 0.7, energy: 1.5, sat: -10, work: 0.5, enter: 3 },
};
export const WORK_KINDS = new Set(["chop", "mine", "fish", "build", "trade", "farm"]);
export const RECOVER = { out: 0.5, inside: 1, bed: 2, clinic: 3, doctor: 4.5 };
export const MED_NOW = 120, MED_BOOST = 1.5;
export const CLINIC_FEE = 3, MEDICINE_PRICE = 4, DOCTOR_WAGE = 2;

/** 새 병 */
export const newSick = (kind = "cold") => ({ kind, left: (SICK[kind] || SICK.cold).left, med: false });
export const sickDef = u => u?.sick ? SICK[u.sick.kind] || SICK.cold : null;
/** 걸릴 수 있는가(이미 앓거나 면역이면 아님) */
export const canCatch = u => !u.sick && !((u.immune || 0) > 0);
/** 지금 회복 빠르기(초당 left 감소). where = "out" | "inside" | "bed" | "clinic" | "doctor" */
export const recoverRate = (where, med = false) => (RECOVER[where] ?? RECOVER.out) * (med ? MED_BOOST : 1);
/** 약 먹기: left를 바로 MED_NOW만큼 깎음(한 번 앓을 때 한 번) */
export function takeMedicine(s) { if (!s || s.med) return false; s.med = true; s.left = Math.max(0, s.left - MED_NOW); return true; }
/** 아플 때 활동 비중 배수(일 ×0.5 · 집 구경 ×3) */
export function sickWeight(u, kind) {
  const d = sickDef(u); if (!d) return 1;
  return WORK_KINDS.has(kind) ? d.work : kind === "enter" ? d.enter : 1;
}
/** 회복까지 남은 초(이 빠르기로) */
export const secsLeft = (s, where = "out") => s ? Math.ceil(s.left / recoverRate(where, s.med)) : 0;
/** 저장에서 읽기(예전 저장엔 없음 → 건강) */
export function sickFromSave(j) {
  if (!j || typeof j !== "object" || !SICK[j.kind]) return null;
  const left = Math.max(0, Math.min(SICK[j.kind].left, +j.left || 0)); return left > 0 ? { kind: j.kind, left, med: !!j.med } : null;
}
