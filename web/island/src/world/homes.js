// 한 집에 사는 갈매미(순수 계산: 난수·화면을 모름). 사용자 요청 "2층집은 2인이 사는거로 하자."
//  · 집마다 살 수 있는 수 = BUILDINGS[id].residents(없으면 1). 지금은 2층집만 2(작은 집·큰 집·자이언트의 집은 1).
//  · 첫 갈매미는 예전처럼 시장에서 집을 삼(b.owner = 주인). 자리가 남은 집에는 집 없는 갈매미가 같이 살러 들어옴(b.mates = [unitId], 같이 사는 갈매미).
//  · 같이 살기 값(SHARE_PART): 지금 집값의 절반(내림)을 같이 사는 갈매미가 주인에게 줌 — 주인이 낸 집값을 반씩 나눠 낸 셈. 갈매미끼리 주고받으므로
//    새로 생기거나 사라지는 돈이 없음(금고·대출은 안 씀, 현금만). 같이 사는 갈매미도 자기 집이라 숙박비를 안 내고 침대에서 잠.
//  · 집을 철거하면 주인·같이 사는 갈매미 모두 집 없음(주인의 남은 빚은 예전처럼 없애 줌). 주인이 마을에 없으면(예전 저장 등) 같이 사는 갈매미가 주인이 됨.
import { BUILDINGS } from "../data/catalog.js";

/** 같이 살기 값 비율: 집값 × ½(내림, 1 이상) → 주인에게 */
export const SHARE_PART = 0.5;
/** 이 집(건물 또는 def 또는 id)에 살 수 있는 갈매미 수 */
export const homeCap = d => { const def = typeof d === "string" ? BUILDINGS[d] : d?.defId ? BUILDINGS[d.defId] : d; return def?.house ? Math.max(1, def.residents | 0 || 1) : 0; };
/** 사는 갈매미 unitId 목록(주인이 먼저) */
export const residentsOf = b => !b ? [] : [...(b.owner != null ? [b.owner] : []), ...(b.mates || [])];
/** 이 갈매미가 이 집에 사나(주인이거나 같이 사는 갈매미) */
export const livesIn = (b, u) => !!b && !!u && (b.owner === u.unitId || (b.mates || []).includes(u.unitId));
/** 남은 자리 */
export const roomLeft = b => Math.max(0, homeCap(b) - residentsOf(b).length);
/** 같이 살기 값(지금 집값에서) */
export const shareOf = price => Math.max(1, Math.floor((price || 0) * SHARE_PART));
/** 저장에서 읽은 같이 사는 갈매미 목록(예전 저장엔 없음 → 빈 목록) */
export const matesFromSave = m => Array.isArray(m) ? m.filter(x => x != null && x !== "") : [];
/** 카드에 쓰는 글: 한 명 집 "주인 A" · 두 명 집 "주민 2/2 · 주인 A · 같이 사는 B". units = 마을 갈매미 */
export function residentsText(b, units) {
  const name = id => units.find(u => u.unitId === id)?.name, owner = name(b.owner), mates = (b.mates || []).map(name).filter(Boolean), cap = homeCap(b);
  const who = owner ? `주인 ${owner}` : "주인 없음";
  if (cap <= 1) return who;
  return `주민 ${residentsOf(b).length}/${cap} · ${who}${mates.length ? ` · 같이 사는 ${mates.join(", ")}` : ""}`;
}
