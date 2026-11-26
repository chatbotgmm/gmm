// 건설 확인창(#cfInfo)·건물 갤러리 카드 아래 글(순수: DOM을 모름 → node 시험 가능). hud.js가 HTML을 받아 넣음.
//  · planInfo: 정해 둔 자리 하나의 설계비·금고·재료·짓는 이·집값·못 짓는 까닭(world.check 결과 r를 받음)
//  · bridgeInfo: 다리 줄(칸마다 설계비) — 금고가 모자라면 앞 몇 칸만 놓이는지
//  · planHtml: 두 줄(핵심 한 줄 크게 + 재료·짓는 이 작게). 못 지으면 '🚫 착공 불가' 띠 + 까닭
//  · cardMeta: 갤러리 카드 아래 글 '🪙10 · 🪵1'(금고보다 비싸면 빨간 숫자)
import { BUILDINGS } from "../data/catalog.js";
import * as BK from "../world/bank.js";
import { ITEM_ICON } from "../world/economy.js";
import { siteNeed } from "../units/unitBrain.js";
import { fmtNum } from "./hudParts.js";

const bvEsc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const bvWhoOf = def => def.builtBy === "carpenter" ? "🪚 목수" : "🔨 건축가";
/** 돈만 모자랄 때 덧붙이는 한 줄 */
export const MONEY_HINT = "세금·집값이 금고에 들어오면 지을 수 있어요";

/** 공사 끝까지 드는 재료(가장 느린 건축가 기준): [[아이콘, 드는 수, 창고에 있는 수], …] */
export function materialsOf(w, defId, times = 1) {
  const def = BUILDINGS[defId], b = { defId, hits: 0, need: 3 * (def.work ?? def.footprint.w * def.footprint.d) };
  return Object.entries(siteNeed(b).total).filter(([, n]) => n > 0).map(([k, n]) => [ITEM_ICON[k] ?? k, n * times, Math.floor(w.res?.[k] || 0)]);
}
/** 설계비가 0인 까닭(없으면 ""): 첫 시장 · 집이 모자라 은행이 대신 냄 */
function bvFreeWhy(w, defId, fee) {
  if (!w.economy || fee > 0) return "";
  const base = BK.scaled(BK.feeOf(defId), w.priceMult());
  if (base <= 0) return "";
  return BUILDINGS[defId].market ? "첫 시장이라 설계비가 없어요" : defId === "house" ? "집이 모자라 은행이 대신 내요" : "";
}

/** 건물 한 채 자리의 확인 정보. r = world.check(defId, …) 결과({ ok, reason, fee? }) */
export function planInfo(w, defId, r) {
  const def = BUILDINGS[defId], eco = !!w.economy, vault = Math.floor(w.bank?.vault || 0);
  const fee = eco ? (r?.fee ?? w.feeFor(defId)) : 0;
  return {
    kind: "one", name: def.name, eco, fee, vault, after: vault - fee, ok: !!r?.ok, reason: r?.ok ? "" : r?.reason || "",
    moneyShort: eco && !r?.ok && r?.fee != null && r.fee > vault, freeWhy: bvFreeWhy(w, defId, fee),
    mats: materialsOf(w, defId), who: bvWhoOf(def), sell: eco && def.house && !def.forUnit ? w.housePrice(defId) : null,
  };
}
/** 다리 줄. okN = 놓을 수 있는(물·자리·설계비를 통과한) 칸 수 · waterN = 줄 안의 물 칸 수 */
export function bridgeInfo(w, okN, waterN) {
  const eco = !!w.economy, vault = Math.floor(w.bank?.vault || 0), fee = eco ? w.feeFor("bridge") : 0;
  const moneyShort = eco && okN === 0 && waterN > 0 && fee > vault;
  const k = fee > 0 ? Math.min(okN, Math.floor(vault / fee)) : okN;                 // 칸마다 금고에서 내므로 앞 k칸만
  const reason = moneyShort ? BK.feeReason(fee, vault) : okN === 0 ? "놓을 수 있는 물 칸이 없어요" : "";
  return { kind: "bridge", name: "다리", eco, fee, n: okN, k, total: fee * k, vault, after: vault - fee * k, ok: k > 0, reason, moneyShort,
    mats: k ? materialsOf(w, "bridge", k) : [], who: bvWhoOf(BUILDINGS.bridge) };
}

/** #cfInfo 안쪽 HTML(두 줄 + 못 지으면 띠) */
export function planHtml(info) {
  const coin = n => `🪙${fmtNum(n)}`;
  let main;
  const nw = t => `<span class="cf-nw">${t}</span>`;   // 좁은 폭에서 '🪙'과 숫자, '금고 60 → 50'이 줄 사이로 갈라지지 않게(덩어리째 다음 줄로)
  if (info.kind === "bridge") main = `<b>🌉 다리 ${info.n}칸</b>` + (info.eco ? ` · ${nw(`설계비 합 <b>${coin(info.total)}</b>`)} · ${nw(`금고 ${coin(info.vault)}${info.k ? ` → <b>${coin(info.after)}</b>` : ""}`)}` : "");
  else main = `<b>${bvEsc(info.name)}</b>` + (info.eco ? ` · ${nw(`설계비 <b>${coin(info.fee)}</b>`)} · ${nw(`금고 ${coin(info.vault)}${info.ok ? ` → <b>${coin(info.after)}</b>` : ""}`)}` : "");
  const mats = info.mats.length ? `재료 ${info.mats.map(([ic, n, have]) => `${ic}${n}${info.eco ? `<span class="cf-have">(창고 ${have})</span>` : ""}`).join(" ")}` : "";
  const sub = [mats, info.who, info.sell ? `다 지으면 🪙${fmtNum(info.sell)}에 팔려요` : "", info.freeWhy ? `설계비 🪙0: ${info.freeWhy}` : "",
    info.kind === "bridge" && info.k && info.k < info.n ? `금고가 모자라 앞 ${info.k}칸만 놓여요` : ""].filter(Boolean).join(" · ");
  const lack = info.fee - info.vault;   // 돈만 모자랄 때: 숫자는 위 줄에 있으니 모자란 만큼만(긴 까닭 글은 상태 줄에 그대로 뜸)
  const why = info.moneyShort ? `금고가 🪙${fmtNum(lack)} 모자라요` : bvEsc(info.reason);
  const bad = info.ok ? "" : `<div class="cf-bad"><b>🚫 착공 불가</b> · ${why}${info.moneyShort ? `<span class="cf-hint"> · ${MONEY_HINT}</span>` : ""}</div>`;
  return `<div class="cf-main">${main}</div>${bad}${sub ? `<div class="cf-sub">${sub}</div>` : ""}`;
}

/** 갤러리 카드 아래 글: { html, text, short }. 경제가 없으면 재료만 */
export function cardMeta(w, def) {
  const cost = Object.entries(def.cost || {}).filter(([, n]) => n > 0).map(([k, n]) => `${ITEM_ICON[k] ?? k}${n}`).join(" ") || "재료 없음";
  if (!w.economy) return { html: bvEsc(cost), text: cost, short: false, fee: 0 };
  const fee = w.feeFor(def.id), short = fee > Math.floor(w.bank?.vault || 0);
  return { html: `<b class="${short ? "fee-short" : "fee"}">🪙${fmtNum(fee)}</b> · ${bvEsc(cost)}`, text: `설계비 🪙${fee}${short ? "(금고 모자람)" : ""} · 재료 ${cost}`, short, fee };
}
