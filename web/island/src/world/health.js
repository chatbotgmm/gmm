// 병(감기)과 갈매미 의원(순수 계산: 숫자·판단만. 굴림은 world.hrnd로 World가 함). 설계: health_climate_design.md 4~5장 + 사용자 결정(2026-11-26).
//  · 아늑하게: 아무도 죽거나 떠나지 않음. 병은 한 번에 하나(u.sick = { kind, left, med }), 회복 점수 left를 다 깎으면 나음.
//  · 걸림: 30초마다 한 번(HEALTH_EVERY) 꽁꽁(체온 ≤ 38.3, 밖)인 갈매미가 FREEZE_CHANCE(5%, 설계 8%에서 시뮬로 낮춤)로 감기. 아니면 젖음·과로(아래).
//  · 옮음(전염): 30초마다 밖에 있는 감기 갈매미의 CONTAGION_R칸 안, 밖에 있는 건강한 갈매미가 CONTAGION_P로(목도리를 두르면 절반). 같은 건물 안(의원 빼고)은 INDOOR_P.
//    마을이 멈추지 않게: 나은 뒤 IMMUNE_SECS 동안은 다시 안 걸림 · 동시에 앓는 갈매미는 갈매미 수의 1/3(내림, 적어도 1)까지.
//  · 회복(초당 left 감소): 밖 0.5 · 건물 안 1 · 잠(침대) 2 · 의원 침대 3 · 의원 + 당번 의사 4.5 · 약을 먹으면 바로 −120, 그 뒤 ×1.5.
//  · 의원: 진료비 3🪙(가진 만큼, 없으면 무료) · 약 4🪙(의사가 있을 때만, 가진 만큼) → 금고(돌아온 돈, 장부 clinic 칸).
//    당번 의사(플레이어가 world.setDoctor로 정함)는 환자가 나을 때마다 품삯 2🪙(금고에서, 모자라면 밀림 = 공사 품삯과 같은 규칙).
export const HEALTH_EVERY = 30;
export const FREEZE_CHANCE = 0.05;
export const CONTAGION_R = 2, CONTAGION_P = 0.08, SCARF_GUARD = 0.5;   // 2% → 8%: 겨울 5일 시뮬 20판에서 밖 2칸 안 마주침이 14번뿐이라 2%면 옮음이 거의 안 보임(설계 문서 '빈도 조정 결과')
export const IMMUNE_SECS = 600;          // 나은 뒤 마을 하루 동안은 다시 안 걸림
// 걸리는 길 둘 더(사용자 결정 2 "가끔 보이게": 옷 없는 겨울 9마리 마을에서 며칠에 한두 번). 확률은 겨울 5일 시뮬로 맞춤(설계 문서 '빈도 조정 결과').
//  · "추운 날" = 일하는 열(+2)을 뺀 바깥 체감(옷·종족 덤·축제 열기 포함)이 CHILL_DAY(10°C) 아래. 가을 낮은 안 들어옴(가장 추운 폭풍도 15 − 5 = 10, 낮 +2),
//    가을·봄 밤 비·폭풍(가을 15 − 3 − 5 = 7)은 들어옴 — 그래도 체온이 39.0까지 안 내려가 젖음 감기는 없고 과로만 굴림.
//  · 젖음 u.wet(0~1, 저장): 추운 날 밖에서 비 1/30초 · 폭풍 1/15초 · 눈 1/120초로 차오름. 건물 안 1/20초 · 밖 맑음·흐림 1/60초로 마름.
//    젖은 채(WET_AT 이상) 추우면(체온 ≤ 39.0, 밖) 30초마다 WET_CHANCE — 옷을 입어 안 추우면 안 걸림.
//  · 과로 u.workRun(초, 저장 안 함): 추운 날 밖에서 일하는 동안 쌓이고 건물에 들어가면 0. OVERWORK_SECS 넘으면 30초마다 OVERWORK_CHANCE.
//  · 실내 전염: 같은 건물(의원 빼고) 안에 감기 갈매미와 함께 있으면 30초마다 INDOOR_P(목도리 절반 없음 — 실내에선 벗음).
export const CHILL_DAY = 10;
export const WET_RATE = { rain: 1 / 30, storm: 1 / 15, snow: 1 / 120 }, DRY_IN = 1 / 20, DRY_OUT = 1 / 60;
export const WET_AT = 0.5, WET_CHANCE = 0.1;
export const OVERWORK_SECS = 90, OVERWORK_CHANCE = 0.02;
export const INDOOR_P = 0.15;
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
/** 젖음 한 걸음. inside: 건물 안 · weather: 날씨 종류 · chilly: 추운 날(체감 < CHILL_DAY). 따뜻한 날 비는 그대로 둠(차지도 마르지도 않음) */
export function stepWet(wet, { inside = false, weather = "clear", chilly = false } = {}, dt = 0) {
  wet = wet || 0;
  if (inside) return Math.max(0, wet - DRY_IN * dt);
  const r = WET_RATE[weather];
  if (r) return chilly ? Math.min(1, wet + r * dt) : wet;
  return Math.max(0, wet - DRY_OUT * dt);
}
/** 과로 시간 한 걸음: 추운 날 밖에서 일하면 쌓이고, 건물 안이면 0, 그 밖엔 그대로(일 사이 걷는 길은 이어서 셈) */
export const stepWorkRun = (run, { inside = false, working = false, chilly = false } = {}, dt = 0) => inside ? 0 : working && chilly ? (run || 0) + dt : run || 0;
/** 30초 굴림 하나에 쓸 감기 까닭과 확률: 젖은 채 추움(체온 ≤ 39.0) → "wet", 추운 날 오래 일함 → "overwork", 둘 다 아니면 null. 꽁꽁은 따로(FREEZE_CHANCE) */
export function chillRisk(u, coldAt = 39.0) {
  if ((u.wet || 0) >= WET_AT && (u.bodyT ?? 40) <= coldAt) return { why: "wet", p: WET_CHANCE };
  if (u.chilly && (u.workRun || 0) >= OVERWORK_SECS) return { why: "overwork", p: OVERWORK_CHANCE };
  return null;
}
/** 저장에서 읽기(예전 저장엔 없음 → 건강) */
export function sickFromSave(j) {
  if (!j || typeof j !== "object" || !SICK[j.kind]) return null;
  const left = Math.max(0, Math.min(SICK[j.kind].left, +j.left || 0)); return left > 0 ? { kind: j.kind, left, med: !!j.med } : null;
}
