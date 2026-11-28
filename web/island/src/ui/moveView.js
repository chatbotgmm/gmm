// 🏠 건설 모드 '↔ 옮기기' 도구의 글(순수: DOM·three를 모름 → node 시험 가능). tools.js·hud.js가 씀. 규칙은 world/relocate.js.
//  · relocInfo / relocHtml: 확인 카드(#cfInfo) — 이름 · 공짜 · 못 놓는 까닭 · 돌리기·되돌리기 안내
//  · relocStatus: 상태 줄 한 줄(고르기 → 들기 → 옮김 · 그만둠)
import { BUILDINGS } from "../data/catalog.js";
import { josa } from "../util.js";

const relocEsc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** 확인 카드 자료. r = world.moveBuilding(…, { dry: true }) */
export function relocInfo(w, b, r) {
  const def = b && BUILDINGS[b.defId];
  const home = !r?.ok && r?.reason === "지금 자리와 같아요";                         // 막 든 참(제자리): 까닭 대신 할 일을 알려 줌
  return { name: def?.name || "건물", ok: !!r?.ok, home, reason: r?.ok || home ? "" : r?.reason || "" };
}
export function relocHtml(info) {
  const nw = t => `<span class="cf-nw">${t}</span>`;
  const main = `<b>↔ ${relocEsc(info.name)} 옮기기</b> · ${nw("공짜예요")}`;
  const bad = info.ok ? "" : info.home ? `<div class="cf-sub">${nw("옮길 자리를 땅에서 톡 눌러요")}</div>` : `<div class="cf-bad"><b>🚫 못 놓아요</b> · ${relocEsc(info.reason)}</div>`;
  const sub = `${nw("돌리기로 방향을 바꿔요")} · ${nw("↶ 되돌릴 수 있어요")}`;
  return `<div class="cf-main">${main}</div>${bad}<div class="cf-sub">${sub}</div>`;
}
/** 상태 줄. phase: pick(고를 건물) · picked(들었음) · done(옮김) · cancel(내려놓음) · undo(↶ 제자리) · redo(↷) */
export function relocStatus(name, phase, extra = "") {
  switch (phase) {
    case "pick": return "↔ 옮길 건물을 톡 눌러요. 끌면 화면이 움직여요";
    case "picked": return `↔ ${josa(name, "을", "를")} 들었어요. 옮길 자리를 눌러요`;
    case "done": return `↔ ${josa(name, "을", "를")} 옮겼어요. ↶ 누르면 제자리로`;
    case "cancel": return `${josa(name, "은", "는")} 제자리에 그대로 있어요`;
    case "undo": return extra ? `🚫 ${extra}` : `↶ ${josa(name, "을", "를")} 제자리로 돌려놨어요`;
    case "redo": return extra ? `🚫 ${extra}` : `↷ ${josa(name, "을", "를")} 다시 옮겼어요`;
    default: return "";
  }
}
