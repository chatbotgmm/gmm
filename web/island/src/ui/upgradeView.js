// 건물 업그레이드 단추(일반병원 → 종합병원 등, def.upgradeTo). 판정은 world.upgradeCheck 하나만 씀.
//  · upgradeButtonInfo: 단추 글·꺼짐·사유(순수: DOM을 모름 → node 시험 가능)
//  · upgradeAsk: 확인창 제목·본문
//  · mountUpgrade: 카드(지금은 hud.js houseCard) 안에 단추 하나를 붙이거나 숨김 — 다른 카드로 옮길 때 이 함수만 부르면 됨
//  · runUpgrade: 누르면 확인 → world.startUpgrade → 실패면 상태 줄에 사유
import { BUILDINGS } from "../data/catalog.js";
import { fmtNum } from "./hudParts.js";
import { materialsOf } from "./buildView.js";

const UP_ICON = { hospital: "🏥" };

/** 이 건물에 업그레이드 단추를 보일까(업그레이드 길이 있는 건물만) */
export const canShowUpgrade = b => !!b && !!BUILDINGS[b.defId]?.upgradeTo;

/** 단추 상태: { show, disabled, text, why, fee, to }. r = world.upgradeCheck(b) */
export function upgradeButtonInfo(w, b, r = w.upgradeCheck(b)) {
  if (!canShowUpgrade(b)) return { show: false, disabled: true, text: "", why: "", fee: 0, to: null };
  const to = r.to || BUILDINGS[BUILDINGS[b.defId].upgradeTo], fee = r.fee || 0;
  const text = `${UP_ICON[to.id] || "⬆"} ${to.name}으로 업그레이드${w.economy ? ` · 설계비 🪙${fmtNum(fee)}` : ""}`;
  return { show: true, disabled: !r.ok, text, why: r.ok ? "" : r.reason, fee, to };
}

/** 확인창 글: { title, body, ok } */
export function upgradeAsk(w, b, r = w.upgradeCheck(b)) {
  const from = BUILDINGS[b.defId], to = r.to, fp = to.footprint;
  const body = [w.economy ? `설계비 🪙${fmtNum(r.fee)}을 금고에서 내요. 금고는 🪙${fmtNum(Math.floor(w.bank.vault - r.fee))}이 남아요.` : "",
    `${fp.w}×${fp.d}칸으로 넓혀 다시 지어요. 재료 ${materialsOf(w, to.id).map(([ic, n]) => `${ic}${n}`).join(" ")}은 목수가 모아 와요.`,
    `공사하는 동안 ${from.name}은 문을 닫고 누워 있던 환자는 나와요. 당번 의사는 그대로예요.`,
    to.beds ? `다 지으면 침대 ${BUILDINGS[b.defId].beds || 0} → ${to.beds}개.` : ""].filter(Boolean).join(" ");
  return { title: `${UP_ICON[to.id] || "⬆"} ${to.name}으로 업그레이드할까요?`, body, ok: "업그레이드" };
}

/** 누르면: 확인창(hud.confirm) → 시작. 결과 { ok, reason } */
export async function runUpgrade(hud, w, b) {
  const r = w.upgradeCheck(b);
  if (!r.ok) { hud.status?.(r.reason, { kind: "warn" }); return { ok: false, reason: r.reason }; }
  if (hud.confirm && !await hud.confirm(upgradeAsk(w, b, r))) return { ok: false, reason: "취소" };
  const res = w.startUpgrade(b.id);
  if (!res.ok) hud.status?.(res.reason, { kind: "warn" });
  return res;
}

/** 카드를 다른 건물(풍차·가로등·집 등)에 쓰거나 닫을 때: 업그레이드 단추·사유를 숨김(남아 있으면 그 카드에서 예전 병원을 업그레이드하게 됨) */
export function hideUpgrade(card) { for (const e of card.querySelectorAll(".upg, .upgWhy")) e.hidden = true; }

/** 카드 안에 업그레이드 단추(.upg)와 사유 글(.upgWhy)을 붙이거나 숨김. after: 이 요소 뒤에(없으면 카드 끝, 닫기 단추 앞) */
export function mountUpgrade(card, hud, w, b, after = null) {
  let btn = card.querySelector(".upg"), why = card.querySelector(".upgWhy");
  const info = upgradeButtonInfo(w, b);
  if (!info.show) { if (btn) btn.hidden = true; if (why) why.hidden = true; return info; }
  if (!btn) {
    btn = document.createElement("button"); btn.className = "upg";   // .go를 붙이지 않음: 카드의 querySelector(".go")(꾸미기 단추 — hud·powerRange·noPower)가 이 단추를 잡지 않게(색은 index.html #houseCard .upg)
    why = document.createElement("span"); why.className = "upgWhy dim";
    const ref = after?.nextSibling || card.querySelector(".hx"); card.insertBefore(btn, ref); card.insertBefore(why, ref);
  }
  btn.hidden = false; btn.textContent = info.text; btn.disabled = info.disabled;
  btn.setAttribute("aria-label", info.disabled ? `${info.text}. 못 하는 까닭: ${info.why}` : info.text);
  why.textContent = info.why; why.hidden = !info.why;
  btn.onclick = async () => { const res = await runUpgrade(hud, w, b); if (res.ok) card.hidden = true; };
  return info;
}
