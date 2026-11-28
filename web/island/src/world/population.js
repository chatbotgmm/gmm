// 인구 = 집 수(순수 계산: 난수·화면을 모름). 공식은행이 있는 섬(경제)에서는 다 지은 보통 집 자리 하나에 갈매미 한 마리까지만 🥚 소환할 수 있음.
//  · 소환은 언제나 🥚 기본 모습(evolve.js). 같은 모습이 여럿이어도 되고, 모습 수(9)에 묶이지 않음 → 상한은 집 자리와 성능 상한(maxGulls)뿐.
//  · 보통 집 = 전용 집이 아닌 집(작은 집·2층집·큰 집). 집마다 자리는 homeCap(2층집 = 2자리). 짓는 중인 집은 세지 않음.
//  · 자이언트로 변신해 '자이언트의 집'으로 이사한 갈매미는 보통 집 자리를 세지 않음(아직 이사 못 한 자이언트는 옛 집을 쓰니 보통으로 셈).
//  · 막히지 않게: 집을 짓는 건축가가 마을에 하나도 없으면 집 수와 상관없이 하나 부를 수 있음(rescue).
//  · 직업은 필요한 것부터(jobForSummon): 건축가 → 목수 → (시장) 상인 → (밭) 농부 → (낚시터) 낚시꾼 → 나무꾼·광부 → 가장 적은 직업.
//  · 공식은행이 없는 예전 섬(경제 없음): 집 수와 상관없이 UNGATED_CAP(9)마리까지.
import { BUILDINGS } from "../data/catalog.js";
import { homeCap } from "./homes.js";
import { formOf } from "./evolve.js";

/** 전용 집이 있는 모습: { 모습 이름: 전용 집 건물 id } (자이언트 → giantHouse) */
export const SPECIAL_HOME = Object.fromEntries(Object.values(BUILDINGS).filter(d => d.house && d.forUnit).map(d => [d.forUnit, d.id]));
export const REASON_HOUSE = "집이 모자라요 — 집을 한 채 더 지으면 부를 수 있어요";
export const REASON_FULL = "마을이 꽉 찼어요";
/** 공식은행이 없는 예전 섬의 상한(예전엔 모습 수 9) · 성능 상한 기본값(화질 설정 quality.cfg.maxGulls가 덮어씀) */
export const UNGATED_CAP = 9, MAX_GULLS = 20;

const ordinaryHouses = done => done.filter(b => BUILDINGS[b.defId]?.house && !BUILDINGS[b.defId].forUnit);
/** 다 지은 보통 집 자리 수(전용 집 빼고, 2층집은 2자리) */
export const houseSlots = done => ordinaryHouses(done).reduce((s, b) => s + homeCap(b), 0);
/** 다 지은 보통 집 채 수(전용 집 빼고) */
export const houseCount = done => ordinaryHouses(done).length;
/** 전용 집에 사는가(자이언트가 자이언트의 집에) */
const inSpecial = (u, done) => { const id = SPECIAL_HOME[formOf(u)]; if (!id || !u.home) return false; const b = done?.find?.(x => x.id === u.home); return !!b && b.defId === id; };
/** 보통 갈매미 수(전용 집으로 이사한 갈매미 빼고) */
export const ordinaryGulls = (units, done = []) => units.filter(u => !inSpecial(u, done)).length;

/** 다음 갈매미가 맡을 직업(순수). has: 마을에 있는 시설 { market, field, dock } */
export function jobForSummon(units, has = {}) {
  const n = job => units.filter(u => u.job === job).length;
  if (!n("builder")) return "builder";
  if (!n("carpenter")) return "carpenter";
  if (has.market && !n("merchant")) return "merchant";
  if (has.field && !n("farmer")) return "farmer";
  if (has.dock && !n("fisher")) return "fisher";
  if (!n("lumberjack")) return "lumberjack";
  if (!n("miner")) return "miner";
  const all = ["builder", "carpenter", "lumberjack", "miner", "fisher", "farmer", "merchant"].filter(j => (j !== "merchant" || has.market) && (j !== "farmer" || has.field));
  return all.reduce((best, j) => n(j) < n(best) ? j : best, "builder");
}
/** 다 지은 건물들 → jobForSummon의 has */
export const placesOf = done => ({ market: done.some(b => BUILDINGS[b.defId]?.market), field: done.some(b => BUILDINGS[b.defId]?.field), dock: done.some(b => BUILDINGS[b.defId]?.dock) });

/** 소환 판단. units: 마을 갈매미 · done: 다 지은 건물들 · gated: 집 수 규칙을 쓰는 섬인가(공식은행이 있음) · maxGulls: 성능 상한 */
export function summonInfoFor(units, done, gated = true, maxGulls = MAX_GULLS) {
  const houses = houseSlots(done), homes = houseCount(done), gulls = ordinaryGulls(units, done), free = Math.max(0, houses - gulls);
  const cap = gated ? maxGulls : Math.min(maxGulls, UNGATED_CAP), room = Math.max(0, cap - units.length);
  const rescue = gated && !units.some(u => u.job === "builder");
  const count = Math.min(room, !gated ? room : Math.max(free, rescue ? 1 : 0));
  const can = count > 0, nextJob = can ? jobForSummon(units, placesOf(done)) : null;
  const needHouse = gated && !can && room > 0;
  const reason = can ? "" : !room ? `${REASON_FULL} (${units.length}/${cap}마리)` : `${REASON_HOUSE} (집 ${homes}채${homes !== houses ? `(자리 ${houses})` : ""} · 갈매미 ${gulls}마리)`;
  return { can, count, reason, houses, homes, gulls, free, left: room, cap, next: can ? "기본" : null, nextJob, candidates: can ? ["기본"] : [], needHouse, needGiantHouse: false, gated, rescue };
}
