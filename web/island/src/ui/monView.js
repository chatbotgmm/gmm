// 🏛 중앙은행 판(은행 앱 두 번째 탭, 순수: DOM을 모름 → tests/monview.test.js). 규칙은 world/monetary.js(MON-5)·World.js(print·setRate·setIssue·setAuto·giftAll).
//  맨 위: 핵심 숫자 넷(🏦 금고 · 🪙 마을 돈 · 📈 물가와 화살표 · 🏦 금리) 크게.
//  그 아래: 🖨 찍어내기(50·100·200 고르기 + 큰 단추, 누르면 확인창 — 글은 printAsk) · 금리 고르기 · 🧺 가공품 매입 예산(자동/직접) · 🎁 축하 나눠주기.
//  접기: 최근 며칠 물가·마을 돈·금고 작은 막대 · 돈이 어디서 오고 가는지(최근 7일 합) · 규칙 설명.
//  단추는 data-mon="pstep|print|rate|issue|auto|gift" + data-v(값) → hud.js bankClick.
import * as MON from "../world/monetary.js";
import { moreBox, valueRows, fmtNum, TONE_ICON, sumHead } from "./hudParts.js";
import { dayFlow, bankHtml, todayOf, weekRows } from "./bankView.js";
import { VIEW } from "./viewPrefs.js";

const mvEsc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/** 물가 변화 π(하루) → 화살표·글·색 상태. ±0.2% 안은 →(그대로) */
export function monArrow(pi, adapt = 0) {
  if (adapt > 0) return { icon: "⏸", text: `적응 중 ${adapt}일`, tone: "flat" };
  const p = Math.round((pi || 0) * 1000) / 10;
  if (pi > 0.002) return { icon: "▲", text: `+${p}%/일`, tone: "up" };
  if (pi < -0.002) return { icon: "▼", text: `−${Math.abs(p)}%/일`, tone: "down" };
  return { icon: "→", text: "그대로", tone: "flat" };
}
/** 찍기 전 예상: 마을 돈 A에 n이 다 풀리면 목표 물가가 몇 % 오르나(P* = A ÷ (4 × 만든 물건)이라 A에 비례). A가 0이면 null */
export const printRise = (n, A) => A > 0 ? Math.round(n / A * 1000) / 10 : null;
/** 🖨 확인창 글 { title, body, ok }. 쉬운 보기(자세히 보기 끔)면 물가 셈 없이 한 문장 */
export function printAsk(n, info, { easy = !VIEW.adv } = {}) {
  if (easy) return { title: `🖨 동전 🪙${n}을 찍을까요?`, body: "찍은 동전은 금고에 들어와요. 너무 많이 찍으면 물건값이 조금씩 올라요.", ok: `🖨 🪙${n} 찍기` };
  const A = Math.floor(info.pocket || 0), rise = printRise(n, A), after = Math.max(0, (info.printLeft || 0) - n);
  return {
    title: `🖨 새 동전 🪙${n}을 찍을까요?`,
    body: `찍은 동전은 금고로 들어와요. 설계비와 품삯으로 마을에 풀리면 물가가 오를 수 있어요.` +
      (rise === null ? "" : ` 예상: 마을 돈이 🪙${fmtNum(A)}에서 🪙${fmtNum(A + n)}까지 ${rise}% 늘면, 물가도 하루에 조금씩 그만큼 올라가요.`) +
      ` 찍고 나면 오늘 더 찍을 수 있는 돈 🪙${after}이 남아요.`,
    ok: `🖨 🪙${n} 찍기`,
  };
}
/** 고른 단계가 오늘 남은 양보다 크면 찍을 수 있는 가장 큰 단계로(없으면 null) */
export const printPick = (want, left) => MON.PRINT_STEPS.includes(want) && want <= left ? want : ([...MON.PRINT_STEPS].reverse().find(s => s <= left) ?? null);

const mvKpi = (label, value, sub, tone = "") => `<div class="mon-kpi"${tone ? ` data-tone="${tone}"` : ""}><span class="mon-kl">${label}</span><b class="mon-kv">${value}</b>${sub ? `<span class="mon-ks">${sub}</span>` : ""}</div>`;
const mvSeg = (cls, label, items) => `<div class="seg ${cls}" role="group" aria-label="${mvEsc(label)}">${items.map(it =>
  `<button data-mon="${it.act}" data-v="${it.v}"${it.on ? ` class="on" aria-pressed="true"` : ` aria-pressed="false"`}${it.off ? " disabled" : ""}>${it.html}</button>`).join("")}</div>`;

/** 최근 며칠 작은 막대(값이 클수록 높게). rows = [{ d, v, txt }] */
function mvBars(title, rows, cls) {
  if (!rows.length) return "";
  const hi = Math.max(1, ...rows.map(r => r.v)), lo = Math.min(...rows.map(r => r.v)), base = cls === "price" ? lo * 0.9 : 0;   // 물가는 작은 차이가 보이게 바닥을 조금 올림
  return `<div class="mon-chart"><b class="mon-ct">${title}</b><div class="mon-bars">${rows.map(r =>
    `<div class="mon-col"><span class="mon-cv">${r.txt}</span><i class="${cls}" style="height:${Math.max(4, Math.round((r.v - base) / Math.max(1e-9, hi - base) * 100))}%"></i></div>`).join("")}</div>` +
    `<div class="mon-days">${rows.map(r => `<span>${r.d}일</span>`).join("")}</div></div>`;
}
/** 최근 7일 돈 흐름 합(장부) → { neu, back, out, gone } 각 [[이름, 값]] */
export function flowWeek(w) {
  const L = w.bank?.ledger || [], s = {};
  for (const e of L) { const f = dayFlow(e); for (const [k, v] of Object.entries({ ...f.inV, ...f.outV })) s[k] = (s[k] || 0) + v; }
  const g = k => s[k] || 0;
  return {
    days: L.length,
    neu: [["🖨 새로 찍은 동전", g("printed")]],
    back: [["🧾 세금", g("tax")], ["🧺 은행 가게 저녁 장보기", g("evening")], ["🏠 집 계약금", g("house")], ["💳 대출 상환", g("repay")], ["🛏 숙박", g("lodging")],
      ["🏥 진료·약", g("clinic")], ["🧣 옷", g("clothes")], ["☕ 코코아와 가게", g("shop")], ["📦 그 밖", g("other") + g("refunds") + g("customBack") + g("seig")]],
    out: [["📐 설계비", g("fees")], ["🔨 품삯", g("wages")], ["🧺 가공품·저장고·소지품 매입", g("buy")], ["🐷 예금 이자", g("interest")], ["🎁 축하금·창업 자금", g("grant")]],
    gone: [["🌳 섬 꾸미기", g("custom")]],
  };
}

/** 🏛 중앙은행 판 HTML. more = 펼침을 기억하는 접기(hud.more) · pstep = 고른 찍기 단계 */
export function monHtml(w, { more = (k, t, h, o) => moreBox(k, t, h, o), pstep = 100 } = {}) {
  const mi = w.monInfo?.(); if (!mi) return `<p class="dim">이 섬에는 중앙은행이 없어요.</p>`;
  const bk = w.bank, vault = Math.floor(bk.vault || 0), A = Math.floor(mi.pocket), st = w.vaultState(), ar = monArrow(mi.pi, mi.adapt);
  const ratio = vault > 0 ? A / vault : null;
  const vTone = st === "empty" || st === "low" ? st : "ok";
  const kpis = `<div class="mon-kpis">` +
    mvKpi("🏦 내 금고", `🪙${fmtNum(vault)}`, vTone !== "ok" ? `${TONE_ICON[vTone]} ${vTone === "empty" ? "바닥" : "얼마 안 남음"}` : "✅ 넉넉해요", vTone) +
    mvKpi("🪙 마을 돈", `🪙${fmtNum(A)}`, ratio === null ? "갈매미 주머니 · 금고가 비었어요" : `갈매미 주머니 · 금고의 ${ratio < 10 ? ratio.toFixed(1) : Math.round(ratio)}배`) +
    mvKpi("📈 물가", `${mi.index} <span class="mon-ar" data-dir="${ar.tone}">${ar.icon}</span>`, ar.text, ar.tone === "up" ? "warn" : "") +
    mvKpi("🐷 금리", `${mi.rate}%`, mi.rate >= 3 ? "저금이 늘어요" : mi.rate === 0 ? "저금이 줄어요" : "보통") + `</div>`;

  // 🖨 찍어내기
  const left = mi.printLeft, pick = printPick(pstep, left);
  const steps = mvSeg("mon-psteps", "찍을 양", MON.PRINT_STEPS.map(s => ({ act: "pstep", v: s, on: s === pick, off: s > left, html: `🪙${s}` })));
  const printBox = `<section class="mon-print"><div class="mon-kh"><b>🖨 새 동전 찍기</b><span>새 동전은 여기서만 생겨요</span></div>${steps}` +
    `<button class="go mon-pbtn" data-mon="print" data-v="${pick ?? 0}"${pick ? "" : " disabled"}>${pick ? `🖨 🪙${pick} 찍어 금고에 넣기` : "🖨 오늘은 다 찍었어요"}</button>` +
    `<p class="mon-pleft">오늘 더 찍을 수 있는 돈 <b>🪙${left}</b> / ${MON.PRINT_DAY_MAX}</p></section>`;

  // 금리
  const rateBox = `<section><div class="mon-kh"><b>🐷 금리 ${mi.rate}%</b><span>높이면 갈매미들이 저금을 늘려요. 이자는 금고에서 나가요</span></div>` +
    mvSeg("mon-rates", "금리", Array.from({ length: MON.RATE_MAX + 1 }, (_, r) => ({ act: "rate", v: r, on: r === mi.rate, html: `${r}%` }))) + `</section>`;

  // 🧺 가공품 매입 예산(금고에서)
  const si = Math.max(0, MON.STEPS.indexOf(mi.step));
  const buyBox = `<section><div class="mon-kh"><b>🧺 가공품 매입 예산 · ${MON.STEP_NAME[si]}</b><span>상인 가공품을 금고 돈으로 사요 · 오늘 남은 🪙${fmtNum(Math.min(mi.left, mi.buyLeft))} / ${fmtNum(mi.cap)}${MON.capOf(mi.step, w.units.length) !== mi.cap ? ` · 내일부터 하루 🪙${fmtNum(MON.capOf(mi.step, w.units.length))}` : ""}</span></div>` +
    mvSeg("mon-auto", "매입 예산 정하기", [{ act: "auto", v: 1, on: mi.auto, html: "🏛 은행장에게 맡기기" }, { act: "auto", v: 0, on: !mi.auto, html: "✋ 직접" }]) +
    (mi.auto ? "" : mvSeg("mon-steps", "매입 예산 단계", MON.STEPS.map((s, i) => ({ act: "issue", v: s, on: s === mi.step, html: `${MON.STEP_NAME[i]}<small>마리당 ${s}</small>` })))) +
    (mi.buyLeft < mi.left ? `<p class="mon-note">⚠️ 품삯 줄 돈 🪙${fmtNum(Math.ceil(MON.BUY_KEEP * mi.P))}은 남겨야 해서 오늘은 🪙${fmtNum(mi.buyLeft)}까지만 사요</p>` : "") + `</section>`;

  // 🎁 축하 나눠주기
  //  금고에 품삯 몫(BUY_KEEP × P)이 남을 때만 켬: 매입·이자처럼 축하금도 품삯·설계비 몫까지 헐지 않게(World.giftAll은 금고 ≥ 합계만 봄 — 이 단추가 유일한 호출)
  const per = MON.scaleP(MON.GIFT_PER, mi.P), giftAll = per * w.units.length, keep = Math.ceil(MON.BUY_KEEP * mi.P), giftShort = vault - giftAll < keep;
  const giftOk = !mi.giftDone && w.units.length > 0 && !giftShort;
  const giftBtn = `<button class="mon-gift" data-mon="gift" data-v="1"${giftOk ? "" : " disabled"}>${mi.giftDone ? "🎁 오늘은 나눠 줬어요" : `🎁 모두에게 🪙${per}씩 축하금 주기`}</button>` +
    (!mi.giftDone && w.units.length > 0 && giftShort ? `<p class="mon-note mon-gnote">🎁 축하금 🪙${fmtNum(giftAll)}을 주면 품삯 줄 돈 🪙${fmtNum(keep)}이 모자라서 축하금은 못 줘요</p>` : "");

  // 자세히: 최근 며칠 막대
  const H = (bk.mon?.hist || []).slice(-MON.HIST_DAYS), vEnd = new Map();
  { let end = vault; const L = bk.ledger || []; for (let i = L.length - 1; i >= 0; i--) { vEnd.set(L[i].day, end); const f = dayFlow(L[i]); end -= f.inSum - f.outSum; } }
  const histH = H.length ? mvBars("📈 물가", H.map(h => ({ d: h.d, v: h.P, txt: String(MON.priceIndex(h.P)) })), "price") +
    mvBars("🪙 마을 돈", H.map(h => ({ d: h.d, v: h.A, txt: fmtNum(h.A) })), "money") +
    mvBars("🏦 하루 끝 금고", H.filter(h => vEnd.has(h.d)).map(h => ({ d: h.d, v: vEnd.get(h.d), txt: fmtNum(vEnd.get(h.d)) })), "vault")
    : `<p class="dim">하루가 지나면 여기에 기록이 쌓여요.</p>`;

  // 자세히: 돈이 오고 가는 길(최근 7일 합)
  const fw = flowWeek(w), sum = rows => rows.reduce((a, r) => a + r[1], 0), net = sum(fw.back) - sum(fw.out);
  const flowH = `<p class="mon-fsum">최근 ${fw.days}일: 마을 → 금고 <b class="up">+${fmtNum(sum(fw.back))}</b> · 금고 → 마을 <b class="down">−${fmtNum(sum(fw.out))}</b> · 새 돈 <b class="up">+${fmtNum(sum(fw.neu))}</b></p>` +
    `<h4>🖨 새로 생긴 돈 → 🏦 금고</h4>${valueRows(fw.neu)}<h4>🪙 마을 → 🏦 금고</h4>${valueRows(fw.back)}<h4>🏦 금고 → 🪙 마을</h4>${valueRows(fw.out)}<h4>없어진 돈</h4>${valueRows(fw.gone)}` +
    `<p class="dim">${net >= 0 ? `마을 돈이 금고로 🪙${fmtNum(net)} 더 돌아왔어요.` : `금고 돈이 마을로 🪙${fmtNum(-net)} 더 나갔어요.`} 새로 찍지 않으면 금고와 마을, 예금을 합한 돈은 그대로예요.</p>`;

  const helpH = `<ul class="mon-help"><li>🖨 새 동전은 찍기 단추로만 생겨요. 하루에 🪙${MON.PRINT_DAY_MAX}까지 찍을 수 있어요.</li>` +
    `<li>찍은 동전은 설계비와 품삯, 매입으로 마을에 풀려요. 마을 돈이 만든 물건보다 많아지면 물가가 하루에 조금씩 올라요.</li>` +
    `<li>세금과 집값, 장보기, 진료비 같은 돈이 금고로 돌아와요.</li>` +
    `<li>매입과 이자, 축하금은 모두 금고에서 나가요. 은행은 품삯 줄 돈 🪙${fmtNum(Math.ceil(MON.BUY_KEEP * mi.P))}을 늘 남겨 둬요.</li>` +
    `<li>사흘 내리 값이 그대로면 마을 점수가 올라요.</li></ul>`;

  return `<div class="mon">` + kpis + printBox + rateBox + buyBox + giftBtn +
    more("mon.hist", "📊 최근 며칠 물가 · 마을 돈 · 금고", histH, { note: `${H.length}일` }) +
    more("mon.flow", "🔁 돈이 오고 가는 길", flowH, { note: `7일 합` }) +
    more("mon.help", "❓ 중앙은행은 이렇게 돌아가요", helpH) + `</div>`;
}

/** 은행 앱 탭 두 개(🏦 금고 | 🏛 중앙은행): 단추 data-banktab */
export const bankTabs = tab => `<div class="stabs bk-tabs" role="tablist" aria-label="은행 앱">${[["vault", "🏦 금고"], ["mon", "🏛 중앙은행"]].map(([k, t]) =>
  `<button role="tab" data-banktab="${k}" aria-selected="${tab === k}"${tab === k ? ` class="on"` : ""}>${t}</button>`).join("")}</div>`;
/** 쉬운 은행(자세히 보기 끔 · 기본): 내 금고 하나만. 금고 숫자 + 오늘 들고 난 돈 + 🖨 동전 찍기 + 접힌 「어디서 오고 어디에 썼나」.
 *  세금·숙박비·대출·마을에 도는 돈·물가·금리·매입 예산은 화면에서 뺌(규칙은 그대로, ⚙ 설정 → 🔧 자세히 보기를 켜면 보임).
 *  🖨 찍기는 남김: 새 동전은 이 단추로만 생겨서, 금고가 바닥나면 공사를 이어 갈 길이 이것뿐(중앙은행 판과 같은 data-mon="print" → hud.bankClick) */
export function bankEasyHtml(w, more = (k, t, h, o) => moreBox(k, t, h, o), { pstep = 100 } = {}) {
  if (!w.economy) return `<p class="dim">이 섬에는 은행이 없어요.</p>`;
  const bk = w.bank, state = w.vaultState(), t = dayFlow(todayOf(w)), owed = bk.owed || 0;
  const toneText = state === "empty" ? "바닥났어요" : state === "low" ? "얼마 안 남았어요" : "넉넉해요";
  const head = sumHead({ icon: "🏦", big: `🪙${fmtNum(bk.vault)}`, label: "내 금고", tone: state, toneText,
    lineHtml: `오늘 <b class="up">+${fmtNum(t.inSum)}</b> · <b class="down">−${fmtNum(t.outSum)}</b>${owed > 0 ? " · 💸 못 준 품삯이 있어요" : ""}` });
  const sub = `<p class="bk-sub">금고 돈으로 건물을 짓고 섬을 꾸며요. 갈매미들이 장을 보고 집을 사면 다시 들어와요.</p>`;
  const mi = w.monInfo?.(); let printBox = "";
  if (mi) { const left = mi.printLeft, pick = printPick(pstep, left), need = state !== "ok";
    printBox = `<section class="mon-print bk-print"${need ? ` data-need="1"` : ""}><div class="mon-kh"><b>🖨 동전 찍기</b><span>${need ? "금고가 모자라면 동전을 찍어 채워요" : "금고가 모자랄 때 써요"}</span></div>` +
      `<button class="${need ? "go " : ""}mon-pbtn" data-mon="print" data-v="${pick ?? 0}"${pick ? "" : " disabled"}>${pick ? `🖨 🪙${pick} 찍기` : "🖨 오늘은 다 찍었어요"}</button></section>`; }
  const v = t.inV, o = t.outV, back = Object.entries(v).filter(([k]) => !["printed", "refunds", "customBack"].includes(k)).reduce((s, [, n]) => s + n, 0);
  const inRows = [["🛒 갈매미들이 낸 돈", back], ["🖨 찍은 동전", v.printed || 0], ["↩️ 돌려받은 설계비·꾸미기 값", (v.refunds || 0) + (v.customBack || 0)]];
  const outRows = [["📐 설계비", o.fees], ["🔨 품삯", o.wages], ["🌳 섬 꾸미기", o.custom], ["🏛 은행이 쓴 돈", o.buy + o.interest + o.grant]];
  const ledger = `<div class="bk-cols"><div><h4>들어온 돈</h4>${valueRows(inRows)}</div><div><h4>나간 돈</h4>${valueRows(outRows)}</div></div>`;
  const week = weekRows(w), top = Math.max(1, ...week.map(d => Math.max(d.inSum, d.outSum)));
  const bar = (n, cls) => `<i class="${cls}" style="width:${Math.round(n / top * 100)}%"></i>`;
  const weekH = week.length ? `<table class="tbl bk-week">${week.slice().reverse().map(d => `<tr${d.inSum || d.outSum ? "" : ` class="zero"`}><td>${d.day}일째</td><td class="bk-bars">${bar(d.inSum, "up")}${bar(d.outSum, "down")}</td><td>🏦${fmtNum(d.end)}</td></tr>`).join("")}</table>` : `<p class="dim">아직 장부가 없어요.</p>`;
  return head + sub + printBox + more("bank.today", "📒 오늘 어디서 오고 어디에 썼나", ledger) + more("bank.week", "📊 최근 며칠 금고", weekH);
}
/** 은행 앱 전체: 쉬운 보기(기본)는 금고 하나 · 자세히 보기면 중앙은행이 있는 섬은 탭 + 고른 판, 없으면(예전 섬·경제 없음) 금고 판만 */
export function bankAppHtml(w, more = (k, t, h, o) => moreBox(k, t, h, o), { tab = "vault", pstep = 100, adv = VIEW.adv } = {}) {
  if (!adv) return bankEasyHtml(w, more, { pstep });
  if (!w.economy || !w.monInfo?.()) return bankHtml(w, more);
  return bankTabs(tab === "mon" ? "mon" : "vault") + (tab === "mon" ? monHtml(w, { more, pstep }) : bankHtml(w, more));
}
