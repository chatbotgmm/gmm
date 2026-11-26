// 인구 = 집 수(순수 계산: 난수·화면을 모름). 공식은행이 있는 섬(경제)에서는 다 지은 집 한 채당 갈매미 한 마리까지만 🥚 소환할 수 있음.
//  · 보통 갈매미: (마을의 보통 갈매미 수) < (다 지은 보통 집 수)일 때만 옴. 보통 집 = 전용 집이 아닌 집(작은 집·2층집·큰 집). 주인이 있든 없든, 누가 사든 한 채는 한 자리.
//  · 전용 집이 있는 갈매미(자이언트): 다 지었고 주인 없는 그 전용 집(자이언트의 집)이 있어야 옴. 전용 집은 보통 갈매미 자리로 세지 않고, 자이언트도 보통 집 자리를 쓰지 않음.
//  · 짓는 중인 집은 세지 않음. 집을 철거해 자리가 모자라져도 이미 온 갈매미는 떠나지 않고, 새 소환만 막힘(예전 저장에서 갈매미가 집보다 많을 때도 같음).
//  · 막히지 않게: 집을 짓는 건축가가 마을에 하나도 없으면 건축가(기본)는 집 수와 상관없이 올 수 있음(갈매미 0마리·집 0채인 섬도 다시 시작할 수 있게).
//  · 오는 순서: 꼭 필요한 직업이 마을에 없으면 그 갈매미부터(건축가 = 집 → 목수 = 시장 → 상인 = 새 돈이 도는 길), 그다음은 올 수 있는 갈매미 중 무작위.
//  · 공식은행이 없는 예전 섬(경제 없음)은 예전 그대로: 집 수와 상관없이 아무나 무작위.
import { BUILDINGS, UNITS, UNIT_JOBS } from "../data/catalog.js";

/** 전용 집이 있는 갈매미: { 갈매미 이름: 전용 집 건물 id } (자이언트 → giantHouse) */
export const SPECIAL_HOME = Object.fromEntries(Object.values(BUILDINGS).filter(d => d.house && d.forUnit).map(d => [d.forUnit, d.id]));
/** 먼저 불러야 하는 직업 순서(그 직업의 갈매미가 마을에 없을 때) */
export const SUMMON_FIRST = ["builder", "carpenter", "merchant"];
const jobOfName = name => (UNIT_JOBS[name] || [])[1] || "builder";
export const REASON_HOUSE = "집이 모자라요 — 집을 한 채 더 지으면 부를 수 있어요";
export const REASON_GIANT = "자이언트는 '자이언트의 집'을 다 지어야 와요";
export const REASON_ALL = "모두 모였어요";

/** 다 지은 보통 집 수(전용 집 빼고) */
export const houseSlots = done => done.filter(b => BUILDINGS[b.defId]?.house && !BUILDINGS[b.defId].forUnit).length;
/** 보통 갈매미 수(전용 집이 있는 갈매미 빼고) */
export const ordinaryGulls = units => units.filter(u => !SPECIAL_HOME[u.name]).length;

/** 소환 판단. units: 마을 갈매미 · done: 다 지은 건물들 · gated: 집 수 규칙을 쓰는 섬인가(공식은행이 있음) */
export function summonInfoFor(units, done, gated = true) {
  const here = new Set(units.map(u => u.name)), absent = UNITS.map(d => d.name).filter(n => !here.has(n));
  const houses = houseSlots(done), gulls = ordinaryGulls(units), free = Math.max(0, houses - gulls);
  const specialFree = n => done.some(b => b.defId === SPECIAL_HOME[n] && !b.owner);
  const hasJob = job => units.some(u => (u.job || jobOfName(u.name)) === job);
  let candidates = !gated ? absent : absent.filter(n => SPECIAL_HOME[n] ? specialFree(n) : free > 0);
  const rescue = gated && !hasJob("builder") ? absent.find(n => jobOfName(n) === "builder" && !SPECIAL_HOME[n]) : null;   // 건축가가 없으면 집을 못 지음 → 건축가는 언제나 올 수 있음
  if (rescue && !candidates.includes(rescue)) candidates = [rescue, ...candidates];
  let next = null;
  if (gated) for (const job of SUMMON_FIRST) { if (hasJob(job)) continue; const n = candidates.find(c => jobOfName(c) === job); if (n) { next = n; break; } }
  if (gated && !next && candidates.length === 1) next = candidates[0];   // 예전 섬(gated 아님)은 한 마리 남아도 난수를 한 번 씀(예전 그대로)
  const can = candidates.length > 0;
  const ordAbsent = absent.filter(n => !SPECIAL_HOME[n]).length, specialNow = absent.filter(n => SPECIAL_HOME[n] && specialFree(n)).length;
  const count = !gated ? absent.length : Math.max(Math.min(free, ordAbsent), rescue ? 1 : 0) + specialNow;   // 지금 부를 수 있는 수(한 마리씩 부를 때마다 하나씩 줄어듦)
  const needHouse = gated && !can && absent.some(n => !SPECIAL_HOME[n]);                 // 보통 갈매미가 남았는데 집 자리가 없음
  const needGiantHouse = gated && absent.some(n => SPECIAL_HOME[n] && !specialFree(n));  // 자이언트가 아직 안 왔고 빈 자이언트의 집이 없음
  const reason = can ? "" : !absent.length ? REASON_ALL : needHouse ? `${REASON_HOUSE} (집 ${houses}채 · 갈매미 ${gulls}마리)` : REASON_GIANT;
  return { can, count, reason, houses, gulls, free, left: absent.length, next, candidates, needHouse, needGiantHouse, gated };
}
