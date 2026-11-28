// 🥚 소환 페이지(순수: DOM을 모름 → node 시험 가능). 인구 = 집 수(world/population.js summonInfoFor)를 화면 글로 바꿈.
//  · 머리: 지금 부를 수 있는 마릿수(크게) + 🏠 집 n채 · 🐦 갈매미 n마리 + 막대(갈매미/집)
//  · 단추: 부를 수 있으면 켜짐, 아니면 꺼짐 + 까닭(info.reason 그대로)
//  · 새 친구는 모두 🥚 기본 갈매미로 옴 · 다음 친구가 맡을 일 · 🔍 성향 안내 · 모습 도감(9칸, 안 본 모습은 "?")
//  · 자이언트가 된 갈매미가 집을 기다리면 안내 + [자이언트의 집 지으러 가기] · 자세히: 소환 규칙
import { JOBS } from "../data/catalog.js";
import { sumHead, moreBox } from "./hudParts.js";
import { SPECIAL_HOME } from "../world/population.js";
import { FORMS, RARE_FORMS, formOf } from "../world/evolve.js";

const svEsc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/** 먼저 오는 직업이 마을에 주는 것 */
export const NEXT_WHY = { builder: "집을 지을 수 있어요", carpenter: "시장을 지을 수 있어요", merchant: "시장에 새 돈이 돌아요", farmer: "밭에서 음식을 길러요", fisher: "물고기를 낚아요" };
export const RULES = ["다 지은 집 한 채에 갈매미 한 마리, 🏡 2층집은 두 마리", "새 친구는 모두 🥚 기본 갈매미로 와요. 며칠 지내면 한 번 변신해요", "짓는 중인 집은 세지 않아요",
  "🗿 자이언트가 된 갈매미는 자이언트의 집이 있어야 들어가 살아요", "온 갈매미는 떠나지 않아요"];
export const FORM_ICON = { "기본": "🥚", "물방울": "💧", "그림자": "🌑", "불씨": "🔥", "목수": "🪚", "꽃": "🌼", "황금": "👑", "자이언트": "🗿", "미니": "🐣" };
export const SEARCH_TIP = "갈매미마다 타고난 성향이 있어요. 하는 짓을 잘 보세요";

/** 소환 단추 상태: { disabled, text, why } */
export function summonButton(info) {
  if (info.can) return { disabled: false, text: "🥚 소환", why: "" };
  return { disabled: true, text: info.left ? "🥚 소환 못 함" : "🥚 마을이 꽉 찼어요", why: info.reason };
}
/** 모습 도감 9칸(본 모습 = 아이콘·이름, 안 본 모습 = 실루엣 "?") */
export function dexHtml(seen = new Set()) {
  const s = seen instanceof Set ? seen : new Set(seen || []);
  return `<div class="sm-dex" aria-label="모습 도감">${FORMS.map(f => s.has(f) ? `<span class="on${RARE_FORMS.has(f) ? " rare" : ""}" title="${svEsc(f)}"><i>${FORM_ICON[f]}</i>${svEsc(f)}</span>` : `<span class="off"><i>?</i>???</span>`).join("")}</div>`;
}

/** 페이지 위쪽(머리 + 다음 친구 + 도감 + 자이언트 안내)·아래쪽(자세히) HTML. units = 마을 갈매미 · seen = 본 모습(world.formsSeen) · buildings = 마을 건물들(자이언트 집 안내) */
export function summonHtml(info, units, more = (k, t, h, o) => moreBox(k, t, h, o), seen = null, buildings = null) {
  let head;
  if (!info.left) head = sumHead({ icon: "🥚", big: `${units.length}마리`, label: "마을이 꽉 찼어요", tone: "ok", toneText: "꽉 참", line: `🐦 갈매미 ${units.length}마리 · 더 부르려면 화질 설정을 높여요` });
  else if (!info.gated) head = sumHead({ icon: "🥚", big: `${info.count}마리`, label: "더 부를 수 있어요", line: "이 섬은 집 수와 상관없이 불러요" });
  else head = sumHead({ icon: "🥚", big: `${info.count}마리`, label: info.can ? "지금 부를 수 있어요" : "지금은 못 불러요", tone: info.can ? "ok" : "warn",
    toneText: info.can ? "부를 수 있어요" : "집이 모자라요",
    lineHtml: `🏠 집 <b>${info.homes ?? info.houses}</b>채${info.homes != null && info.homes !== info.houses ? ` (자리 <b>${info.houses}</b>)` : ""} · 🐦 갈매미 <b>${info.gulls}</b>마리`, bar: info.houses ? Math.min(1, info.gulls / info.houses) : 1 });
  const lines = [`<p class="sm-next">새 친구는 모두 <b>🥚 기본 갈매미</b>로 와요. 지내는 동안 무엇이 될지 몰라요</p>`];
  if (info.can && info.nextJob) { const j = JOBS[info.nextJob] || JOBS.builder, why = NEXT_WHY[j.id]; lines.push(`<p class="sm-next">다음 친구는 <b>${j.icon} ${svEsc(j.name)}</b> 일을 맡아요${why ? ` — ${why}` : ""}</p>`); }
  if (units.length <= 1) lines.push(`<p class="sm-tip">🔍 ${svEsc(SEARCH_TIP)}</p>`);
  lines.push(dexHtml(seen || new Set(units.map(formOf))));
  const homeOf = u => buildings?.find?.(b => b.id === u.home);
  const waiting = units.filter(u => SPECIAL_HOME[formOf(u)] && homeOf(u)?.defId !== SPECIAL_HOME[formOf(u)]);
  const giantBtn = waiting.length > 0;
  if (giantBtn) lines.push(`<div class="sm-giant"><p>🗿 ${waiting.map(u => svEsc(u.name)).join(", ")}에게 맞는 '자이언트의 집'이 필요해요</p><button class="sm-go" data-act="giantHouse">🏗 자이언트의 집 지으러 가기</button></div>`);
  const rules = `<ul class="sm-rules">${RULES.map(r => `<li>${svEsc(r)}</li>`).join("")}</ul>`;
  const bottom = more("summon.rules", "소환 규칙", info.gated ? rules : `<p>이 섬은 공식은행이 없어 집 수와 상관없이 ${info.cap ?? 9}마리까지 와요.</p>`);
  return { head, mid: lines.join(""), bottom, giantBtn, giantOnly: false };
}
