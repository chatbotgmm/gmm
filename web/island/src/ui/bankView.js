// 🏦 은행 앱 화면(순수: DOM을 모름 → node 시험 가능). hud.js refreshApp이 HTML을 받아 바뀐 때만 넣음.
//  맨 위: 내 금고(큰 숫자·상태 색) + 오늘 들어온 돈/나간 돈 + 물가 한 줄.
//  접기(처음엔 모두 닫힘): 오늘 장부 · 최근 7일 · 대출 · 마을에 도는 돈(열쇠 bank.town — 위쪽 🪙 칩이 펼친 채로 엶) · 은행이 사는 가공품·물가.
//  금고 항등식: 금고 변화 = 세금 + 돌아온 돈 + 돌려받은 설계비 − 설계비 − 품삯 − 꾸미기. 빌려준 돈은 집값으로 바로 돌아오므로 금고에서 나가지 않음(따로 보임).
import * as E from "../world/economy.js";
import * as BK from "../world/bank.js";
import { newsDay } from "../world/news.js";
import { RANKS } from "../world/rank.js";
import { BUILDINGS } from "../data/catalog.js";
import { sumHead, moreBox, valueRows, fmtNum } from "./hudParts.js";

const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/** 들어온 돈 몫 이름(장부 칸 → 글자). 'other' = returned − 몫 합(주문 장식 자재값 등) */
export const IN_NAMES = { tax: "🧾 세금", house: "🏠 집값(계약금)", repay: "💳 대출 상환", clinic: "🏥 진료·약", clothes: "🧣 옷", shop: "☕ 코코아·저장고·가구", other: "📦 그 밖(주문 자재값 등)", refunds: "↩️ 설계비 환불(공사 취소)" };
export const OUT_NAMES = { fees: "📐 설계비", wages: "🔨 품삯", custom: "🌳 섬 꾸미기" };

/** 하루 장부 → { inRows, outRows, inSum, outSum, lent }. 꾸미기 환불이 쓴 돈보다 많아 custom이 음수면 들어온 돈 쪽으로 */
export function dayFlow(e) {
  const d = e || BK.ledgerDay(0), parts = BK.LEDGER_PARTS.reduce((s, k) => s + (d[k] || 0), 0);
  const inV = { tax: d.tax || 0, ...Object.fromEntries(BK.LEDGER_PARTS.map(k => [k, d[k] || 0])), other: Math.max(0, (d.returned || 0) - parts), refunds: d.refunds || 0 };
  const outV = { fees: d.fees || 0, wages: d.wages || 0, custom: Math.max(0, d.custom || 0) };
  if ((d.custom || 0) < 0) inV.customBack = -d.custom;
  const inRows = Object.entries(inV).map(([k, v]) => [k === "customBack" ? "🌳 꾸미기 되돌려 받음" : IN_NAMES[k], v]);
  const outRows = Object.entries(outV).map(([k, v]) => [OUT_NAMES[k], v]);
  const sum = rows => rows.reduce((s, r) => s + r[1], 0);
  return { inRows, outRows, inSum: sum(inRows), outSum: sum(outRows), lent: d.lent || 0 };
}
/** 오늘 장부 칸(오늘 아직 아무 일이 없으면 빈 칸) */
export const todayOf = w => { const L = w.bank?.ledger || [], e = L[L.length - 1], d = newsDay(w.time); return e && e.day === d ? e : BK.ledgerDay(d); };
/** 최근 날들: [{ day, inSum, outSum, end }] 오래된 날부터. end(날 끝 금고)는 지금 금고에서 거꾸로 셈(오늘은 지금 금고) */
export function weekRows(w) {
  const L = w.bank?.ledger || [], today = newsDay(w.time), list = L.filter(e => e.day <= today).map(e => ({ day: e.day, ...dayFlow(e) }));
  let end = Math.floor(w.bank?.vault || 0);
  for (let i = list.length - 1; i >= 0; i--) { list[i].end = end; end -= list[i].inSum - list[i].outSum; }
  return list;
}

const sign = (n, cls) => `<b class="${cls}">${cls === "up" ? "+" : "−"}${fmtNum(n)}</b>`;
/** 은행 앱 HTML. more(key, title, html, opts) = 펼침을 기억하는 접기(hud.more), 없으면 늘 닫힌 moreBox */
export function bankHtml(w, more = (k, t, h, o) => moreBox(k, t, h, o)) {
  if (!w.economy) return `<p class="dim">이 섬에는 공식은행이 없어요(예전 섬).</p>`;
  const bk = w.bank, state = w.vaultState(), owed = bk.owed || 0, t = dayFlow(todayOf(w)), pi = w.priceInfo();
  const toneText = state === "empty" ? "바닥" : state === "low" ? "얼마 안 남음" : "넉넉해요";
  const head = sumHead({ icon: "🏦", big: `🪙${fmtNum(bk.vault)}`, label: "내 금고", tone: state, toneText,
    lineHtml: `오늘 ${sign(t.inSum, "up")} · ${sign(t.outSum, "down")}${owed > 0 ? ` · 💸 밀린 품삯 🪙${fmtNum(owed)}` : ""}` });
  const sub = `<p class="bk-sub">📈 물가 ×${pi.mult.toFixed(2)} · 금고는 건설 설계비·품삯·꾸미기에 써요</p>`;

  const ledger = `<div class="bk-cols"><div><h4>들어온 돈 ${sign(t.inSum, "up")}</h4>${valueRows(t.inRows)}</div>` +
    `<div><h4>나간 돈 ${sign(t.outSum, "down")}</h4>${valueRows(t.outRows)}</div></div>` +
    (t.lent ? `<p class="dim">🏠 오늘 빌려준 집값 🪙${fmtNum(t.lent)} — 바로 집값으로 돌아와 금고는 그대로예요.</p>` : "");

  const week = weekRows(w), top = Math.max(1, ...week.map(d => Math.max(d.inSum, d.outSum)));
  const bar = (v, cls) => `<i class="${cls}" style="width:${Math.round(v / top * 100)}%"></i>`;
  const weekH = week.length ? `<table class="tbl bk-week">${week.slice().reverse().map(d => `<tr${d.inSum || d.outSum ? "" : ` class="zero"`}><td>${d.day}일째</td>` +
    `<td class="bk-bars">${bar(d.inSum, "up")}${bar(d.outSum, "down")}</td><td><span class="up">+${fmtNum(d.inSum)}</span> <span class="down">−${fmtNum(d.outSum)}</span></td><td>🏦${fmtNum(d.end)}</td></tr>`).join("")}</table>`
    : `<p class="dim">아직 장부가 없어요.</p>`;

  const loans = w.units.map(u => ({ u, l: w.loanInfo(u) })).filter(x => x.l).sort((a, b) => b.l.left - a.l.left);
  const owing = w.units.filter(u => u.wageOwed > 0).sort((a, b) => b.wageOwed - a.wageOwed);
  const loanLeft = loans.reduce((s, x) => s + x.l.left, 0);
  const loanH = (loans.length ? `<table class="tbl">${loans.map(({ u, l }) => { const home = w.buildings.get(u.home);
    return `<tr><td>🏠 ${esc(u.name)}${home ? ` <span class="dim">${esc(BUILDINGS[home.defId]?.name ?? "")}</span>` : ""}</td><td>남은 🪙${fmtNum(l.left)} · 하루 ${fmtNum(l.per)} · ${l.days}일</td></tr>`; }).join("")}</table>`
    : `<p class="dim">빌려준 돈이 없어요.</p>`) +
    (owing.length ? `<h4>💸 밀린 품삯</h4><table class="tbl">${owing.map(u => `<tr><td>${esc(u.name)}</td><td>🪙${fmtNum(u.wageOwed)}</td></tr>`).join("")}</table>` : "") +
    `<p class="dim">갈매미는 집값의 일부(계약금)를 모으면 나머지를 금고에서 빌려 집을 사요. 날마다 벌이에서 갚고, 갚은 돈은 금고로 와요.</p>`;

  const supply = w.moneySupply(), gulls = w.units.map(u => [u.name, Math.floor(u.coins || 0), `🪙${fmtNum(u.coins)}`]);
  const townH = `<p class="bk-total">🪙 마을에 도는 돈 <b>${fmtNum(supply)}</b> <span class="dim">(갈매미 ${w.units.length}마리)</span></p>` +
    (gulls.length ? valueRows(gulls) : `<p class="dim">아직 갈매미가 없어요.</p>`) +
    `<table class="tbl"><tr><td>찍어 낸 돈 누계(발행)</td><td>🪙${fmtNum(bk.issued)}</td></tr><tr><td>금고로 돌아온 돈 누계</td><td>🪙${fmtNum(bk.returned)}</td></tr><tr><td>세금 누계</td><td>🪙${fmtNum(bk.taxed)}</td></tr></table>` +
    `<p class="dim">갈매미 돈은 갈매미 것 — 건설비로 쓰지 않아요.</p>`;

  const r = w.res || {}, rk = RANKS[pi.rank];
  const goods = `<table class="tbl">${E.RAW.map(k => `<tr><td>${E.ITEM_ICON[k]} ${E.PROCESSED_NAME[k]}</td><td>창고 ${r[k] || 0}개 · 🪙${E.BANK_PROCESSED[k]}</td></tr>`).join("")}</table>` +
    `<p class="dim">상인이 가공품을 가져오면 은행이 사요(새로 찍는 돈). 창고의 가공품은 공사 재료로 써요.</p>` +
    `<h4>📈 물가 ×${pi.mult.toFixed(2)}</h4><p class="dim">1 + ${esc(rk?.name ?? "마을")} ${pi.rankPart} + 집·시설 ${pi.n}채 ${pi.buildPart}${pi.nextAt ? ` · 다음 오름 ${pi.nextAt}채째` : " · 최대"}. 설계비와 집값에 곱해요.</p>`;

  return head + sub +
    more("bank.today", "📒 오늘 장부", ledger, { note: `+${fmtNum(t.inSum)} · −${fmtNum(t.outSum)}` }) +
    more("bank.week", "📊 최근 7일", weekH, { note: `${week.length}일` }) +
    more("bank.loan", "🏠 대출", loanH, { note: loans.length ? `${loans.length}건 · 남은 🪙${fmtNum(loanLeft)}` : "없음" }) +
    more("bank.town", "🪙 마을에 도는 돈", townH, { note: `🪙${fmtNum(supply)}` }) +
    more("bank.goods", "🐚 가공품 · 물가", goods, { note: `×${pi.mult.toFixed(2)}` });
}
