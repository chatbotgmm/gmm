// 🥚 소환 페이지(순수: DOM을 모름 → node 시험 가능). 인구 = 집 수(world/population.js summonInfoFor)를 화면 글로 바꿈.
//  · 머리: 지금 부를 수 있는 마릿수(크게) + 🏠 집 n채 · 🐦 갈매미 n마리 + 막대(갈매미/집)
//  · 단추: 부를 수 있으면 켜짐, 아니면 꺼짐 + 까닭(info.reason 그대로)
//  · 다음에 올 갈매미(정해져 있으면) · 자이언트 안내(빈 '자이언트의 집'이 있어야) + [건설로 가기]
//  · 자세히: 아직 안 온 갈매미 · 규칙
import { UNITS, UNIT_JOBS, JOBS } from "../data/catalog.js";
import { sumHead, moreBox } from "./hudParts.js";
import { SPECIAL_HOME } from "../world/population.js";

const svEsc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/** 먼저 오는 직업이 마을에 주는 것 */
export const NEXT_WHY = { builder: "집을 지을 수 있어요", carpenter: "시장을 지을 수 있어요", merchant: "시장에 새 돈이 돌아요" };
export const RULES = ["다 지은 집 한 채에 갈매미 한 마리(🏡 2층집은 두 마리)", "짓는 중인 집은 세지 않아요", "🗿 자이언트는 빈 '자이언트의 집'에만 와요(보통 집 자리는 안 써요)", "온 갈매미는 떠나지 않아요"];
const svJobOf = name => JOBS[(UNIT_JOBS[name] || [])[1]] || JOBS.builder;

/** 소환 단추 상태: { disabled, text, why } */
export function summonButton(info) {
  if (info.can) return { disabled: false, text: "🥚 소환", why: "" };
  return { disabled: true, text: info.left ? "🥚 소환 못 함" : "🥚 모두 모였어요", why: info.reason };
}

/** 페이지 위쪽(머리 + 다음 갈매미 + 자이언트 안내)·아래쪽(자세히) HTML. units = 마을 갈매미 */
export function summonHtml(info, units, more = (k, t, h, o) => moreBox(k, t, h, o)) {
  const all = UNITS.length, here = new Set(units.map(u => u.name)), absent = UNITS.filter(d => !here.has(d.name)).map(d => d.name);
  let head;
  if (!info.left) head = sumHead({ icon: "🥚", big: `${all}/${all}`, label: "모두 모였어요", tone: "ok", toneText: "다 모임", line: `🐦 갈매미 ${units.length}마리` });
  else if (!info.gated) head = sumHead({ icon: "🥚", big: `${info.left}마리`, label: "아직 안 왔어요", line: "이 섬은 집 수와 상관없이 불러요" });
  else head = sumHead({ icon: "🥚", big: `${info.count}마리`, label: info.can ? "지금 부를 수 있어요" : "지금은 못 불러요", tone: info.can ? "ok" : "warn",
    toneText: info.can ? "부를 수 있어요" : info.needHouse ? "집이 모자라요" : "자이언트의 집이 필요해요",
    lineHtml: `🏠 집 <b>${info.homes ?? info.houses}</b>채${info.homes != null && info.homes !== info.houses ? ` (자리 <b>${info.houses}</b>)` : ""} · 🐦 갈매미 <b>${info.gulls}</b>마리`, bar: info.houses ? Math.min(1, info.gulls / info.houses) : 1 });
  const lines = [];
  if (info.can && info.next) { const j = svJobOf(info.next), why = NEXT_WHY[j.id]; lines.push(`<p class="sm-next">다음: <b>${j.icon} ${svEsc(info.next)}</b> (${svEsc(j.name)}${why ? ` — ${why}` : ""})</p>`); }
  const giant = Object.keys(SPECIAL_HOME).find(n => absent.includes(n));
  const ordLeft = absent.some(n => !SPECIAL_HOME[n]);
  const giantBtn = info.gated && info.needGiantHouse && giant && !ordLeft;           // 보통 갈매미가 다 온 뒤에만 안내 칸(그 전엔 '아직 안 온 갈매미' 목록에 '자이언트의 집 필요'로)
  if (giantBtn) lines.push(`<div class="sm-giant"><p>🗿 ${svEsc(giant)}는 빈 '자이언트의 집'을 다 지어야 와요</p><button class="sm-go" data-act="giantHouse">🏗 자이언트의 집 지으러 가기</button></div>`);
  const list = absent.length ? `<ul class="sm-list">${absent.map(n => { const j = svJobOf(n); return `<li>${j.icon} <b>${svEsc(n)}</b> · ${svEsc(j.name)}${SPECIAL_HOME[n] ? " · 자이언트의 집 필요" : ""}</li>`; }).join("")}</ul>` : `<p class="dim">모두 왔어요.</p>`;
  const rules = `<ul class="sm-rules">${RULES.map(r => `<li>${svEsc(r)}</li>`).join("")}</ul>`;
  const bottom = more("summon.left", "아직 안 온 갈매미", list, { note: `${absent.length}마리` }) + more("summon.rules", "소환 규칙", info.gated ? rules : `<p>이 섬은 공식은행이 없어 집 수와 상관없이 아무나 와요.</p>`);
  return { head, mid: lines.join(""), bottom, giantBtn: !!giantBtn, giantOnly: !!giantBtn && !info.needHouse && !info.can };   // giantOnly: 까닭이 자이언트뿐 → 단추 아래 까닭 줄은 안내 칸과 겹치니 숨김
}
