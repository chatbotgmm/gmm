// 일반 건물 카드(#houseCard 안쪽 칸)의 글(순수: DOM을 모름 → node 시험 가능).
//  · bldKindOf: 누른 건물이 어떤 카드인가 — site(짓는 중) · house(다 지은 집, 예전 집 카드 그대로) · field(밭) · clinic(의원) · shop(잡화점) · null(카드 없음)
//  · siteStepOf: 공사장 준비 단계 한 줄(🪵 3/5 모으는 중 · 🏦 재료 가지러 가는 중 · 🔨 짓는 중 · ⏳ 일꾼을 기다려요 · 🚧 길이 막혔어요)
//  · siteCardOf · fieldCardOf · clinicCardOf · shopCardOf: { title, sub, parts } — title·sub는 카드를 열 때 한 번(b·span.dim: noPower가 span 뒤에 까닭을 덧붙임),
//    parts는 따로따로 다시 그리는 칸들의 HTML(값이 같은 칸은 hud가 손대지 않음 → 당번 목록 단추를 누르는 중에 환자 시간이 바뀌어도 누름이 사라지지 않음)
//  · 접기(자세히)는 more(key, title, html, opts)를 받아 씀(hud.more = 이번 실행 동안 펼침 기억)
import { BUILDINGS, JOBS, CLOTHES, CLOTHES_ORDER, FURNITURE, SHOP_FURNITURE } from "../data/catalog.js";
import { ITEM_ICON } from "../world/economy.js";
import { siteNeed } from "../units/unitBrain.js";
import { waterFactor, waterEdges, DRY_BELOW, MOIST_OK } from "../world/farming.js";
import { DOCTOR_WAGE, SICK } from "../world/health.js";
import { owns } from "../world/furniture.js";
import { newsDay } from "../world/news.js";
import { fmtLeft, sickLeftOf, stateLabelOf, sickLeftText } from "./gullView.js";
import { VIEW, leftWord } from "./viewPrefs.js";
import { sumHead, moreBox, fmtNum } from "./hudParts.js";
/** 밭이 다 자라기까지: 쉬운 보기는 낱말, 🔧 자세히 보기는 분·초 */
const growLeft = s => VIEW.adv ? `${fmtLeft(s)} 남음` : { "곧": "곧 다 자라요", "조금 더": "조금 더 자라야 해요", "한참": "한참 자라야 해요" }[leftWord(s)];

const bdEsc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const bdMore = (key, title, html, opts) => moreBox(key, title, html, opts);
const bdIcon = k => ITEM_ICON[k] || k;
const bdUnit = (w, id) => (id == null ? null : w.units.find(u => u.unitId === id) || null);

/** 누른 건물의 카드 종류. 짓는 중이면 무엇이든 공사장 카드 */
export function bldKindOf(b, w) {
  const def = b && BUILDINGS[b.defId]; if (!def) return null;
  if (!w.isDone(b)) return "site";
  if (def.house) return "house";
  if (def.field) return "field";
  if (def.clinic) return "clinic";
  if (b.defId === "shop") return "shop";
  return null;
}

// ---- 공사장
/** 공사장 준비 단계 한 줄(배지·카드 같이). supply가 없으면(맡은 이 없음) 기다림 */
export function siteStepOf(b, w) {
  const s = b.supply, by = s && bdUnit(w, s.by);
  if (!s || !by) return siteBlocked(b, w) ? { step: "blocked", text: "🚧 길이 막혔어요" } : { step: "wait", text: "⏳ 일꾼을 기다려요" };   // 일꾼이 문 앞까지 못 와서 못 맡은 것이면 기다림 대신 그 까닭을 바로
  if (s.step === "fetch") return { step: "fetch", text: "🏦 재료 가지러 가는 중" };
  if (s.step === "gather") {
    const parts = Object.keys(s.need).filter(k => s.need[k] > 0).map(k => `${bdIcon(k)} ${s.got[k] || 0}/${s.need[k]}`);
    return { step: "gather", text: `${parts.join(" · ")} 모으는 중` };
  }
  const n = s.cycles || 0;
  return { step: "build", text: `🔨 짓는 중${n > 0 ? ` · 망치질 ${n}번 남음` : ""}` };
}
/** 문 앞까지 길이 없어 일꾼이 못 오는 공사장인가(갈매미가 길찾기에 실패해 잠깐 적어 둔 noWay) */
export const siteBlocked = (b, w) => w.units.some(u => u.noWay?.[b.id] > w.time);
/** 재료 준비 n/m(이번 몫): 가방·짐에 든 것 합 / 이번 몫 합. 맡은 이가 없으면 null */
export function siteReadyOf(b) {
  const s = b.supply; if (!s) return null;
  let got = 0, need = 0; for (const k of Object.keys(s.need)) { need += s.need[k] || 0; got += Math.min(s.need[k] || 0, s.got[k] || 0); }
  return { got, need };
}
export function siteCardOf(b, w, more = bdMore) {
  const def = BUILDINGS[b.defId], pct = Math.floor(Math.max(0, Math.min(1, b.hits / (b.need || 1))) * 100);
  const st = siteStepOf(b, w), by = b.supply && bdUnit(w, b.supply.by), ready = siteReadyOf(b), job = JOBS[def.builtBy] || JOBS.builder;
  const head = sumHead({ icon: "🔨", big: `${pct}%`, label: "지어짐", lineHtml: `<b>${bdEsc(st.text)}</b>`, bar: pct / 100, tone: st.step === "wait" || st.step === "blocked" ? "warn" : null });
  const who = by ? `<button type="button" class="bc-who" data-act="follow" data-id="${bdEsc(by.unitId)}">👷 ${bdEsc(by.name)} 맡음 · 따라가기</button>`
    : `<p class="bc-note">맡은 갈매미가 없어요. ${job.icon} ${bdEsc(job.name)}가 틈나면 와서 지어요</p>`;
  const blocked = siteBlocked(b, w);
  const lead = (ready && ready.need ? `<p class="bc-line">📦 이번에 쓸 재료 <b>${ready.got}/${ready.need}</b></p>` : "") +
    (blocked ? `<p class="bc-warn">🚧 문 앞까지 길이 없어서 일꾼이 못 와요. 길을 이어 주세요</p>` : "");
  // 자세히: 이번 몫 재료 표 · 끝까지 남은 재료 · 낸 설계비
  const s = b.supply, total = s?.total || siteNeed(b).total, cycles = s ? s.cycles : siteNeed(b).cycles;
  const trip = s ? Object.keys(s.need).filter(k => s.need[k] > 0).map(k => `<tr><td>${bdIcon(k)} 이번에 쓸 것</td><td>${s.got[k] || 0} / ${s.need[k]}</td></tr>`).join("") : "";
  const left = Object.keys(total).filter(k => total[k] > 0).map(k => `${bdIcon(k)} ${total[k]}`).join(" · ") || "없음";
  const fee = b.fee > 0 ? `🪙${fmtNum(b.fee)}, 다 짓기 전에 철거하면 돌려받아요` : "없음";
  const body = `<table class="tbl bc-tbl">${trip}<tr><td>끝까지 남은 재료</td><td>${left}</td></tr><tr><td>남은 망치질</td><td>${cycles}번</td></tr><tr><td>낸 설계비</td><td>${fee}</td></tr></table>`;
  return { title: `🔨 ${def.name}`, sub: "공사장", parts: [head, who + lead, more(`site.more`, "📦 재료·설계비", body)] };
}

// ---- 밭
/** 밭 한 칸의 자라는 단계: empty · sprout(0~0.33) · half(0.33~0.8) · grown(0.8~) · ripe */
export function plotPhaseOf(p) {
  if (p.stage === "ripe") return "ripe";
  if (p.stage !== "growing") return "empty";
  const g = 1 - Math.max(0, p.t) / (p.grow || 1);
  return g < 0.33 ? "sprout" : g < 0.8 ? "half" : "grown";
}
export const PLOT_PHASE = { empty: "🟫 빈 칸", sprout: "🌱 새싹", half: "🌿 반쯤 자람", grown: "🥬 거의 다 자람", ripe: "🌾 다 자람" };
/** 이 밭(건물)의 칸들: 칸 좌표로 찾음(저장에는 p.field가 없어서) */
export const fieldPlotsOf = (b, w) => { const set = new Set(b.cells.map(([x, z]) => `${x},${z}`)); return w.plots.filter(p => set.has(`${p.x},${p.z}`)); };
/** 다 자라기까지 남은 초(지금 빠르기: 계절·날씨 × 촉촉함) */
export const plotLeftOf = (p, w) => p.stage === "growing" ? Math.max(0, p.t) / Math.max(0.01, (w.fx?.grow ?? 1) * waterFactor(p.moisture)) : 0;
export function fieldSummaryOf(plots) {
  const n = { ripe: 0, thirsty: 0, growing: 0, empty: 0 };
  for (const p of plots) { if (p.stage === "ripe") n.ripe++; else if (p.stage === "growing") n.growing++; else n.empty++; if (p.stage !== "ripe" && (p.moisture ?? 1) < DRY_BELOW) n.thirsty++; }
  return n;
}
const bdNearWater = new Map();                                                 // 밭 id → { v: grid.version, ok } (물가 찾기는 49×49칸이라 땅이 바뀔 때만 다시)
export function fieldNearWater(b, w) {
  const v = w.grid.version, c = bdNearWater.get(b.id); if (c && c.v === v) return c.ok;
  const xs = b.cells.map(q => q[0]), zs = b.cells.map(q => q[1]), cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2), cz = Math.round((Math.min(...zs) + Math.max(...zs)) / 2);
  const ok = waterEdges(w.grid, cx, cz).length > 0; bdNearWater.set(b.id, { v, ok }); return ok;
}
export function fieldCardOf(b, w, more = bdMore) {
  const plots = fieldPlotsOf(b, w), n = fieldSummaryOf(plots);
  const line = [n.ripe ? `🌾 다 자람 ${n.ripe}` : "", n.growing ? `🌱 자라는 중 ${n.growing}` : "", n.empty ? `🟫 빈 칸 ${n.empty}` : ""].filter(Boolean).join(" · ") || "칸이 없어요";
  const head = sumHead({ icon: "🌱", big: `${plots.length}칸`, label: "밭", line, tone: n.thirsty ? "warn" : null, toneText: n.thirsty ? `💧 목마름 ${n.thirsty}` : "" });
  const farmers = [...new Set(plots.map(p => p.claimed).filter(id => id != null))].map(id => bdUnit(w, id)).filter(Boolean);
  const hasFarmer = w.units.some(u => u.job === "farmer");
  const who = farmers.length ? `<p class="bc-line">🌾 지금 일하는 농부: <b>${farmers.map(u => bdEsc(u.name)).join(", ")}</b></p>`
    : hasFarmer ? `<p class="bc-note">🌾 농부가 틈나면 와서 심고 거두고 물을 줘요</p>` : `<p class="bc-warn">🌾 농부 갈매미가 있어야 심고 거둬요</p>`;
  const dry = fieldNearWater(b, w) ? "" : `<p class="bc-warn">🌧 물가가 멀어서 물을 못 길어요. 비가 와야 젖어요</p>`;
  const rows = plots.map((p, i) => {
    const m = Math.round(Math.max(0, Math.min(1, p.moisture ?? 1)) * 20) * 5, ph = plotPhaseOf(p), left = plotLeftOf(p, w);
    const tone = (p.moisture ?? 1) < DRY_BELOW ? "dry" : (p.moisture ?? 1) < MOIST_OK ? "low" : "ok";
    return `<tr><td>${i + 1}. ${PLOT_PHASE[ph]}</td><td><span class="bc-moist" data-tone="${tone}"><i style="width:${m}%"></i></span> 💧${VIEW.adv ? `${m}%` : { dry: "말랐어요", low: "목말라요", ok: "촉촉해요" }[tone]}</td><td>${ph === "empty" || ph === "ripe" ? "" : growLeft(left)}</td></tr>`;
  }).join("");
  const body = `<table class="tbl bc-tbl bc-plots">${rows}</table><p class="bc-note">💧 ${Math.round(MOIST_OK * 100)}% 아래로 마르면 천천히 자라요. 시들지는 않아요</p>`;
  return { title: "🌱 밭", sub: `${plots.length}칸`, parts: [head, who + dry, more("field.plots", "칸별 촉촉함·남은 시간", body, { note: n.thirsty ? `목마름 ${n.thirsty}` : "" })] };
}

// ---- 의원
/** 침대 칸: 누운 환자 먼저, 그다음 오는 중인 환자, 남는 칸은 빈 침대 */
export function clinicBedsOf(b, w) {
  const beds = BUILDINGS[b.defId].beds || 0, inBed = w.units.filter(u => u.sick && u.insideBuildingId === b.id);
  const coming = w.units.filter(u => u.sick && u.insideBuildingId !== b.id && u.targetBuildingId === b.id && u.goFor === "sick");
  const out = [...inBed.map(u => ({ u, coming: false })), ...coming.map(u => ({ u, coming: true }))].slice(0, beds);
  while (out.length < beds) out.push(null);
  return out;
}
export function clinicCardOf(b, w, more = bdMore) {
  const def = BUILDINGS[b.defId], beds = clinicBedsOf(b, w), used = beds.filter(Boolean).length, doc = w.doctorOf(b), docIn = w.doctorIn?.(b);
  const head = sumHead({ icon: "🛏", big: `${used}/${def.beds || 0}`, label: "침대", line: doc ? `🩺 당번 의사: ${doc.name}${docIn ? ", 병원에 있어요" : ""}` : "🩺 당번이 없어도 침대에서 쉬며 나아요" });
  const slots = `<ul class="bc-beds">${beds.map(s => !s ? `<li class="dim">🛏 빈 침대</li>`
    : `<li>${(SICK[s.u.sick.kind] || SICK.cold).icon} <b>${bdEsc(s.u.name)}</b> · ${s.coming ? "오는 중" : sickLeftText(sickLeftOf(s.u, w))}</li>`).join("")}</ul>`;
  const list = [{ id: "", name: "당번 없음", note: "침대만 써요" }, ...w.units.filter(u => !u.sick || u.unitId === b.doctor).map(u => ({ id: u.unitId, name: u.name, note: `${(JOBS[u.job] || {}).icon || ""} ${(JOBS[u.job] || {}).name || ""}` }))];
  const pick = `<p class="bc-note">당번은 환자가 오면 병원에 와서 약을 줘요. 약을 먹으면 더 빨리 나아요. 한 마리 고칠 때마다 금고에서 품삯 🪙${DOCTOR_WAGE}을 줘요</p><div class="bc-pick">` +
    list.map(o => { const on = (o.id === "" && !doc) || (doc && o.id === doc.unitId);
      return `<button type="button" data-act="doctor" data-id="${bdEsc(o.id)}" aria-pressed="${on}"${on ? ` class="on"` : ""}>${on ? "✓ " : ""}${bdEsc(o.name)} <span class="dim">${bdEsc(o.note.trim())}</span></button>`; }).join("") + `</div>`;
  const L = w.bank?.ledger, last = L && L[L.length - 1], today = last && last.day === newsDay(w.time) ? last.clinic || 0 : 0;
  const sick = w.units.filter(u => u.sick).map(u => { const ib = u.insideBuildingId && w.buildings.get(u.insideBuildingId);
    return `<li>${(SICK[u.sick.kind] || SICK.cold).icon} ${bdEsc(u.name)} · ${ib ? `${bdEsc(BUILDINGS[ib.defId].name)} 안` : bdEsc(stateLabelOf(u))} · ${sickLeftText(sickLeftOf(u, w))}</li>`; }).join("");
  const info = `<p class="bc-line">🏦 오늘 진료 수입 <b>🪙${fmtNum(today)}</b> <span class="dim">금고로 들어가요</span></p>` +
    `<b class="bc-sub">아픈 갈매미</b>${sick ? `<ul class="bc-list">${sick}</ul>` : `<p class="dim">지금 아픈 갈매미가 없어요</p>`}` +
    `<p class="bc-note">감기는 밖에서보다 집에서, 집보다 병원 침대에서 훨씬 빨리 나아요.</p>`;
  return { title: `🏥 ${def.name}`, sub: `침대 ${def.beds || 0}개`, parts: [head, slots,
    more("clinic.doc", "🩺 당번 정하기", pick, { note: doc ? doc.name : "없음" }), more("clinic.more", "자세히 보기", info)] };
}

// ---- 잡화점
/** 잡화점 탭 기본값: 목도리 철(14°C 이하)이면 옷, 아니면 가구 */
export const shopTabDefault = w => (w.air ?? 15) <= (CLOTHES.scarf?.below ?? 14) ? "clothes" : "furn";
export const clothesOwners = (w, id) => w.units.filter(u => (u.clothes || []).includes(id)).length;
export function shopCardOf(b, w, tab = shopTabDefault(w)) {
  const tabs = `<div class="bc-tabs" role="tablist">${[["furn", "🛋 가구"], ["clothes", "🧣 옷"]].map(([k, t]) =>
    `<button type="button" role="tab" data-act="tab" data-tab="${k}" aria-selected="${tab === k}"${tab === k ? ` class="on"` : ""}>${t}</button>`).join("")}</div>`;
  const n = w.units.length;
  let body;
  if (tab === "clothes") {
    body = `<ul class="bc-shop">${CLOTHES_ORDER.map(id => { const c = CLOTHES[id];
      return `<li><span class="bc-ico" aria-hidden="true">${c.icon}</span><div><b>${bdEsc(c.name)}</b> <span class="bc-price">🪙${c.price}</span><br><span class="dim">가진 갈매미 ${clothesOwners(w, id)}/${n} · ${c.below}° 아래에서 입어요 · 보온 +${c.warmth}°</span></div></li>`; }).join("")}</ul>` +
      `<p class="bc-note">추위를 겪어 본 갈매미가 돈이 모이면 자기 돈으로 사요</p>` +
      `<button type="button" class="bc-go" data-act="stamp">📋 도장 가게에서 손뜨개 목도리를 선물할 수 있어요</button>`;
  } else {
    const houses = [...w.buildings.values()].filter(h => BUILDINGS[h.defId].house && w.isDone(h));
    body = `<ul class="bc-shop">${SHOP_FURNITURE.map(id => { const f = FURNITURE[id], have = houses.filter(h => owns(h, id)).length;
      return `<li><div><b>${bdEsc(f.name)}</b> <span class="bc-price">🪙${f.price}</span> <span class="dim">· 아늑함 +${f.comfort} · 가진 집 ${have}/${houses.length}</span></div></li>`; }).join("")}</ul>` +
      `<p class="bc-note">집주인이 돈이 모이면 자기 돈으로 사 가요</p>`;
  }
  return { title: "🏪 잡화점", sub: "가구·옷을 팔아요", parts: [tabs, body] };
}
