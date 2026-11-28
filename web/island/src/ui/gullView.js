// 갈매미 카드(따라가기 카드) · 선물 판 · 도장 가게의 글(순수: DOM을 모름 → node 시험 가능).
//  · STATE_LABEL · stateLabelOf: 지금 하는 일 글귀(모든 UnitState)
//  · gullFlags: 접힌 카드 머리 앞에 붙는 상태 아이콘(🤧 아픔 · 🥶 꽁꽁/추움 · 💸 밀린 품삯)
//  · bodyTempOf: 체온 줄(숫자 · 막대 · 색 상태 — 39° 이하 cold · 41° 이상 hot)
//  · gullChips: 펼친 카드 칩 줄(개인 돈 · 집/대출 · 밀린 품삯 · 입은 옷 · 병 · 공사 짐). 없는 칸은 빈 글(숨김)
//  · gullMoreHtml: [자세히 보기] 안쪽(만족도 내역 · 소지품 · 가방 · 가진 옷 · 면역 · 좋아하는 일·단짝)
//  · giftPickHtml: 🎁 선물 판(내 주머니 개수 · 취향 · 주머니 목록 — 좋아하는 것 ♥ 먼저, 도장 선물 ⭐ 정 ×2)
//  · stampShopHtml · stampBuyText: 📋 도장 가게(🎁 귀한 선물 8 · 🛋 한정 가구 4)와 산 뒤 안내 글
import { UnitState } from "../data/types.js";
import { BUILDINGS, FURNITURE, PERSONA, CLOTHES, CLOTHES_ORDER } from "../data/catalog.js";
import { residentsOf } from "../world/homes.js";
import { personaOf, formOf, DISP_INFO, DISPS, GROWTH_LABEL, topGrowth, isCalling, formJob, BASE_FORM } from "../world/evolve.js";
import { JOBS } from "../data/catalog.js";
import { newsDay } from "../world/news.js";
/** 둘이 사는 집이면 같이 사는 갈매미 이름(" · 💞 같이 사는 A") */
const housemate = (u, b, world) => { const o = residentsOf(b).filter(id => id !== u.unitId).map(id => world.units?.find(x => x.unitId === id)?.name).filter(Boolean); return o.length ? ` · 같이 사는 ${o.join(", ")}` : ""; };
import { SICK, secsLeft } from "../world/health.js";
import { bodyState, COLD_AT, HOT_AT } from "../world/climate.js";
import { GIFT_CAT_NAME, giftables, pocketCount, giftTier, bondStage, giftDef, STAMP_GIFT_BOND } from "../world/bond.js";
import { stashList } from "../world/belongings.js";
import { ITEMS_ORDER, ITEM_ICON } from "../world/economy.js";
import { STAMP_SHOP, STAMP_GIFTS, stampCost } from "../world/daily.js";
import { valueRows } from "./hudParts.js";
import { VIEW, leftWord } from "./viewPrefs.js";

// 갈매미가 지금 하는 일(카드·목록). 모든 UnitState 키가 있어야 함(시험으로 고정) — 영문 상태 이름이 화면에 나오지 않게
export const STATE_LABEL = { [UnitState.Forage]: "씨앗 찾는 중", [UnitState.Eat]: "냠냠", [UnitState.Visit]: "친구에게 가는 중", [UnitState.Greet]: "인사 중",
  [UnitState.Zoomies]: "신나서 뛰는 중", [UnitState.Flee]: "도망치는 중", [UnitState.Avoid]: "혼자 있고 싶어",
  [UnitState.GoChop]: "숲으로 가는 중", [UnitState.Chop]: "나무 베는 중", [UnitState.GoMine]: "광산으로 가는 중", [UnitState.Mine]: "광석 캐는 중",
  [UnitState.GoFish]: "낚시터로 가는 중", [UnitState.Fish]: "낚시 중", [UnitState.GoBuild]: "공사장으로 가는 중", [UnitState.Build]: "집 짓는 중",
  [UnitState.Idle]: "쉬는 중", [UnitState.Wander]: "산책 중", [UnitState.GoToBuilding]: "건물로 가는 중",
  [UnitState.Sleep]: "자는 중", [UnitState.Curious]: "구경하러 가는 중", [UnitState.GoSwim]: "헤엄치러 가는 중", [UnitState.Swim]: "헤엄치는 중", [UnitState.GoBank]: "은행에 팔러 가는 중", [UnitState.GoMarket]: "시장 가는 중", [UnitState.GoShore]: "바닷가로 먹이 잡으러", [UnitState.GoImprove]: "동네 고치러 가는 중", [UnitState.Improve]: "동네 고치는 중", [UnitState.GoSit]: "벤치로 가는 중", [UnitState.Sit]: "벤치에 앉아 쉬는 중", [UnitState.Faint]: "😵 쓰러져 있어요",
  [UnitState.GoTrade]: "시장으로 가는 중", [UnitState.Trade]: "장사 중", [UnitState.GoFarm]: "밭으로 가는 중", [UnitState.Farm]: "밭일 중",
  [UnitState.GoFest]: "축제 광장으로 가는 중", [UnitState.GoGather]: "등대 앞으로 가는 중", [UnitState.Inside]: "건물 안", [UnitState.GoToFurniture]: "가구로 가는 중", [UnitState.Interact]: "가구 쓰는 중", [UnitState.Held]: "들려 있음",
  [UnitState.GoFetch]: "공사 재료 가지러 은행 가는 중", [UnitState.GoWater]: "물 뜨러 가는 중", [UnitState.Water]: "밭에 물 주는 중" };
/** 지금 하는 일 글: 물 들고 가면 "밭에 물 주러 가는 중", 물가에서 뜨는 중이면 "물 뜨는 중" */
export function stateLabelOf(u) {
  const has = (u.can || 0) > 0;
  if (u.state === UnitState.GoWater && has) return "밭에 물 주러 가는 중";
  if (u.state === UnitState.Water && !has) return "물 뜨는 중";
  return STATE_LABEL[u.state] || "무언가 하는 중";
}

const gvEsc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const gvHex = n => "#" + (n >>> 0).toString(16).padStart(6, "0");
/** 남은 초 → "2분" · "40초"(1분 넘으면 분으로 올림) */
export const fmtLeft = s => { const v = Math.max(0, Math.ceil(s || 0)); return v >= 60 ? `${Math.ceil(v / 60)}분` : `${v}초`; };
/** 병이 낫기까지: 쉬운 보기는 "곧 나아요 · 조금 더 쉬어야 해요 · 한참 쉬어야 해요", 🔧 자세히 보기는 "2분 남음" */
export const sickLeftText = s => VIEW.adv ? `${fmtLeft(s)} 남음` : { "곧": "곧 나아요", "조금 더": "조금 더 쉬어야 해요", "한참": "한참 쉬어야 해요" }[leftWord(s)];
/** 일 속도(능률 u.eff) → 낱말. 🔧 자세히 보기는 ×1.07 */
export const effText = eff => { const e = eff ?? 1; return VIEW.adv ? `능률 ×${e.toFixed(2)}` : `일 속도: ${e >= 1.08 ? "빨라요" : e >= 0.92 ? "보통이에요" : "느려요"}`; };

/** 지금 있는 곳의 회복 자리(unitBrain healthTick과 같은 판정): out · inside · bed · clinic · doctor */
export function recoverWhereOf(u, world) {
  const b = u.insideBuildingId && world.buildings?.get(u.insideBuildingId); if (!b) return "out";
  if (BUILDINGS[b.defId]?.clinic) return world.doctorIn?.(b) ? "doctor" : "clinic";
  return u.insideAct === "sleep" || (u.useFurni && FURNITURE[u.useFurni.id]?.use === "sleep") ? "bed" : "inside";
}
/** 병이 다 낫기까지 남은 초(지금 있는 곳 기준) */
export const sickLeftOf = (u, world) => u.sick ? secsLeft(u.sick, recoverWhereOf(u, world)) : 0;

/** 접힌 카드 머리 앞 아이콘: 🤧(아픔) · 🥶(체온 39° 이하) · 💸(밀린 품삯) */
export function gullFlags(u) {
  const st = Number.isFinite(u.bodyT) ? bodyState(u.bodyT) : null;
  return `${u.sick ? (SICK[u.sick.kind] || SICK.cold).icon : ""}${st === "freeze" || st === "cold" ? "🥶" : ""}${(u.wageOwed || 0) > 0 ? "💸" : ""}`;
}

/** 체온 줄: { text: "38.6°", pct(막대 0~100: 37°→0 · 42°→100), tone: cold|hot|null, word } — 체온을 모르면 null */
export function bodyTempOf(u) {
  if (!Number.isFinite(u.bodyT)) return null;
  const t = Math.round(u.bodyT * 10) / 10, st = bodyState(t);
  const tone = st === "freeze" || st === "cold" ? "cold" : st === "hot" ? "hot" : null;
  const word = st === "freeze" ? "꽁꽁" : st === "cold" ? "추워요" : st === "hot" ? "더워요" : "";
  return { text: `${t.toFixed(1)}°`, pct: Math.round(Math.max(0, Math.min(1, (t - 37) / 5)) * 100), tone, word, cold: COLD_AT, hot: HOT_AT };
}

/** 칩 줄: { coin, home, wage, wear, sick, load } — 글이 빈 칸은 숨김. economy가 없는 예전 섬은 돈·집 칸을 비움 */
export function gullChips(u, world) {
  const eco = !!world.economy, homeB = u.home && world.buildings?.get(u.home), loan = eco ? world.loanInfo?.(u) : null;
  const wear = Object.values(u.wear || {}).filter(id => id && CLOTHES[id]).map(id => CLOTHES[id].icon).join("");
  const sd = u.sick && (SICK[u.sick.kind] || SICK.cold);
  const load = ITEMS_ORDER.filter(k => (u.load?.[k] || 0) > 0).map(k => `${ITEM_ICON[k]}${u.load[k]}`).join(" ");
  return {
    coin: eco ? `🪙 ${Math.floor(u.coins || 0)}` : "",
    home: !eco ? "" : loan ? (VIEW.adv ? `🏠 집값 ${loan.left} 남음` : "🏠 집값 갚는 중") : homeB ? `🏠 ${BUILDINGS[homeB.defId]?.name ?? "집"}${housemate(u, homeB, world)}` : "🏠 집 없음",
    wage: (u.wageOwed || 0) > 0 ? (VIEW.adv ? `💸 밀린 품삯 ${u.wageOwed}` : "💸 품삯이 밀렸어요") : "",
    wear: wear ? `${wear} 입음` : "",
    sick: sd ? `${sd.icon} ${sd.name}${u.sick.med ? " · 💊" : ""} · ${sickLeftText(sickLeftOf(u, world))}` : "",
    load: load ? `📦 짐 ${load}` : "",
  };
}

// ---- 모습·성향(evolve.js): 카드 머리 아래 한 줄 + 성장 칸(관찰 노트 · 요즘 모습 · 예고 · 성향 맞히기)
export const FORM_ICONS = { "기본": "🥚", "물방울": "💧", "그림자": "🌑", "불씨": "🔥", "목수": "🪚", "꽃": "🌼", "황금": "👑", "자이언트": "🗿", "미니": "🐣" };
/** 모습 줄: 변신 전 "🥚 기본 갈매미, 성향은 아직 몰라요" · 변신 뒤 "💧 물방울 갈매미, 🌊 물가 성향. 낚시꾼 일이 잘 맞아요" · 든든한 기본 */
export function formLineOf(u) {
  const f = formOf(u), icon = FORM_ICONS[f] || "🥚";
  if (!u.evo) return `${icon} ${f} 갈매미, 성향은 아직 몰라요`;
  const d = DISP_INFO[u.disp], fj = JOBS[formJob(f)], disp = d ? `, ${d.icon} ${d.name} 성향` : "";
  if (u.evo.stayed) return `🪨 든든한 기본 갈매미${disp}`;
  return `${icon} ${f} 갈매미${disp}${fj ? `. ${fj.name} 일이 ${isCalling(f, u.job) ? "천직이에요 ✓" : "잘 맞아요"}` : ""}`;
}
/** 성장 칸 HTML(변신 전만): 🌱 예고 · 요즘 모습(가장 많이 쌓인 자란 방식) · 🔍 관찰 노트(최근 단서 3개) · 성향 맞히기 칩(data-guess). 변신했으면 "" */
export function evoBoxHtml(u, world) {
  if (u.evo || !u.disp) return "";
  const out = [], soon = u.evoSoon != null && u.evoSoon === newsDay(world.time || 0);   // 전날 예고(evoJudge가 내일 차례를 표시한 날)
  if (u.evoFx || (world.evoPending || []).includes(u.unitId)) out.push(`<p class="ie-soon">✨ 오늘 무언가 달라질 것 같아요!</p>`);
  else if (soon) out.push(`<p class="ie-soon">🌱 곧 무언가 달라질 것 같아요</p>`);
  const g = topGrowth(u.growth); out.push(`<p class="ie-grow">요즘: ${g ? gvEsc(GROWTH_LABEL[g]) : "아직 별일 없이 지내요"}</p>`);
  const notes = (u.notes || []).slice().reverse();
  out.push(`<div class="ie-notes"><b>🔍 관찰 노트</b>${notes.length ? `<ul>${notes.map(x => `<li>${gvEsc(x.text)}${x.n > 1 ? ` ×${x.n}` : ""}</li>`).join("")}</ul>` : `<p class="dim">하는 짓을 잘 보면 타고난 성향이 보여요</p>`}</div>`);
  out.push(`<div class="ie-guess"><span class="dim">성향 맞히기${u.guess ? "" : " (변신할 때 맞히면 도장 +1)"}</span>${DISPS.map(d => `<button type="button" data-guess="${d}"${u.guess === d ? ` class="on" aria-pressed="true"` : ` aria-pressed="false"`}>${DISP_INFO[d].icon} ${DISP_INFO[d].name}</button>`).join("")}</div>`);
  return out.join("");
}
/** [자세히 보기] 안쪽. extra: { fav: 좋아하는 일 이름, friend: "단짝: 꽃" 같은 글, eff } — 마음(mind.js)은 부르는 쪽이 계산해 넘김 */
export function gullMoreHtml(u, world, extra = {}) {
  const sec = (t, body) => `<div class="gm-sec"><b>${t}</b>${body}</div>`, out = [];
  if (u.satParts?.length && VIEW.adv) out.push(sec("😊 만족도 내역", valueRows(u.satParts.map(([n, v]) => [n, v, `${v > 0 ? "+" : ""}${v}`]))));
  else if (u.satParts?.length) { const good = u.satParts.filter(p => p[1] > 0 && p[0] !== "기본").map(p => gvEsc(p[0])), bad = u.satParts.filter(p => p[1] < 0).map(p => gvEsc(p[0]));   // 쉬운 보기: 점수 없이 좋은 것 · 아쉬운 것만
    out.push(sec("😊 기분", `${good.length ? `<p>👍 ${good.join(" · ")}</p>` : ""}${bad.length ? `<p>👎 ${bad.join(" · ")}</p>` : ""}${good.length || bad.length ? "" : `<p class="dim">그냥 그래요</p>`}`)); }
  const st = stashList(u);
  out.push(sec("🎒 소지품", st.length ? `<p>${st.map(s => `${s.kind === "fish" ? "🐟" : "🎁"} ${gvEsc(s.name)} ×${s.n}${s.furniture ? ", 집에 둠" : ""}`).join(" · ")}</p>` : `<p class="dim">아직 모은 게 없어요</p>`));
  if (world.economy) { const bag = ITEMS_ORDER.filter(k => u.inv?.[k]).map(k => `${ITEM_ICON[k]}${u.inv[k]}`).join(" ");
    out.push(sec("👜 일감 가방", `<p${bag ? "" : ` class="dim"`}>${bag || "비었음"}</p>`)); }
  const has = CLOTHES_ORDER.filter(id => (u.clothes || []).includes(id)).map(id => `${CLOTHES[id].icon} ${CLOTHES[id].name}`);
  out.push(sec("🧣 가진 옷", `<p${has.length ? "" : ` class="dim"`}>${has.length ? has.join(" · ") : "없음 · 추워 보면 잡화점에서 스스로 사요"}</p>`));
  if ((u.immune || 0) > 0) out.push(sec("🛡 면역", `<p>${VIEW.adv ? `${fmtLeft(u.immune)} 동안` : "한동안"} 감기에 안 걸려요</p>`));
  out.push(`<p class="dim gm-foot">좋아하는 일: ${gvEsc(extra.fav || "아직 몰라")}${extra.friend ? ` · ${gvEsc(extra.friend)}` : ""} · ${effText(u.eff)}</p>`);
  return out.join("");
}

/** 이 갈래를 좋아하는 갈매미 이름(PERSONA): best는 "모두" */
export const likersOf = (cat, units = null) => cat === "best" ? ["모두"] : units ? units.filter(u => bondStage(u.bond) >= 1 && personaOf(u).likes?.includes(cat)).map(u => u.name)   // 마을 갈매미 중 아는 사이(♥ 1) 이상인 갈매미만(취향을 알게 된 갈매미)
  : Object.keys(PERSONA).filter(n => PERSONA[n].likes?.includes(cat));

/** 🎁 선물 판. 하트 1개부터 취향을 알려 주고 좋아하는 것을 ♥ 표시로 앞에. 도장 선물은 ⭐ 정 ×2 */
export function giftPickHtml(u, world) {
  const p = personaOf(u) || {}, know = bondStage(u.bond) >= 1, names = c => c.map(k => GIFT_CAT_NAME[k]).filter(Boolean).join(", ");
  const list = giftables(world).map((g, i) => ({ ...g, i, liked: know && giftTier(u, g.id) === 2 }))
    .sort((a, b) => (b.liked - a.liked) || (a.i - b.i));
  const n = pocketCount(world) + list.filter(g => g.kind === "fish").reduce((s, g) => s + g.n, 0);
  const hint = know && p.likes?.length ? `${gvEsc(u.name)}의 취향: ♥ ${names(p.likes)}${p.dislikes?.length ? ` · 음… ${names(p.dislikes)}` : ""}` : `${gvEsc(u.name)}에게 무엇을 줄까요? 건네 보면 좋아하는 걸 알 수 있어요.`;
  const icon = g => g.clothes ? "🧣" : g.stampGift ? "⭐" : g.kind === "fish" ? "🐟" : "🎁";
  const btn = g => `<button data-gift="${gvEsc(g.id)}">${g.liked ? "♥ " : ""}${icon(g)} ${gvEsc(g.name)} ×${g.n}${g.stampGift ? ` <small>정 ×${STAMP_GIFT_BOND}</small>` : ""}</button>`;
  return `<p class="gp-head"><b>🎁 내 주머니 ${n}개</b></p><p class="dim">${hint}</p>` + (list.length ? `<div class="gifts">${list.map(btn).join("")}</div>`
    : `<p>바닷가·마을의 ✨ 반짝이를 주우면 선물할 수 있어요 · 귀한 선물은 📋 도장 가게에서</p>`);
}

/** 도장 가게 그리기 열쇠(산 수가 바뀌면 다시 그림) */
export const stampShopKey = world => STAMP_SHOP.concat(STAMP_GIFTS).map(s => world.stampBought?.[s.id] || 0).join(",");
/** 📋 도장 가게 안쪽: 🎁 귀한 선물(STAMP_GIFTS) · 🛋 한정 가구(STAMP_SHOP). 단추는 data-stamp(누르면 onStampBuy) */
export function stampShopHtml(world) {
  const stamps = world.stamps || 0, bought = id => world.stampBought?.[id] || 0;
  const row = (s, sw, sub) => { const c = stampCost(s);
    return `<div class="sitem"><i style="background:${sw}"></i><div><b>${gvEsc(s.name)}</b><span class="dim">${sub}${bought(s.id) ? ` · ${bought(s.id)}개 받았어요` : ""}</span></div><button data-stamp="${gvEsc(s.id)}"${stamps < c ? " disabled" : ""}>도장 ${c}개</button></div>`; };
  const GIFT_SW = { letter: "#e8c66a", shiny: "#9fd0ff", plant: "#8fd18a", sea: "#f2a6c0", ice: "#cfe9f7", fish: "#f0b45a", best: "#f7d34a", warm: "#d9534f" };
  const gifts = STAMP_GIFTS.map(s => { const cat = giftDef(s.id)?.cat, who = likersOf(cat, world.units || []);
    const sub = s.clothes ? "따뜻한 옷 · 누구나 고마워해요 · 주면 바로 둘러요 🧣" : `${GIFT_CAT_NAME[cat] || "선물"} · ♥ ${who.length ? who.map(gvEsc).join("·") : "?"} · 정 ×${STAMP_GIFT_BOND}`;
    return row(s, GIFT_SW[cat] || "#ddd", sub); }).join("");
  const furn = STAMP_SHOP.map(s => { const f = FURNITURE[s.furniture]; return row(s, gvHex(f.colors[0]), `가구 · 아늑함 +${f.comfort}`); }).join("");
  return `<div class="sgroups"><div class="sgroup"><h5>🎁 귀한 선물 <span class="dim">🎁 주머니로</span></h5>${gifts}</div>` +
    `<div class="sgroup"><h5>🛋 한정 가구 <span class="dim">🏠 집 꾸미기에서 놓아요</span></h5>${furn}</div></div>`;
}
/** 도장 가게에서 산 뒤 안내 글(가구 · 선물 둘 다). josa: (말, 받침 있을 때, 없을 때) → 말+조사 */
export function stampBuyText(id, ok, josa) {
  if (!ok) return "도장이 모자라요 · 오늘의 부탁을 모두 들어주면 하나 받아요";
  const it = STAMP_SHOP.concat(STAMP_GIFTS).find(s => s.id === id); if (!it) return "도장 가게에 없는 물건이에요";
  const name = josa ? josa(it.name, "을", "를") : it.name;
  return `🏪 도장 가게에서 ${name} 받아 왔어요. ${it.furniture ? "🏠 집에 들어가 놓을 수 있어요" : `🎁 주머니에 넣었어요${it.clothes ? ". 건네면 바로 둘러요 🧣" : ""}`}`;
}
/** 갈매폰 배지: 지금 쓸 수 있는 도장 수(가장 싼 물건 값 이상일 때만, 아니면 0) */
export const stampBadge = world => { const s = world.stamps || 0, min = Math.min(...STAMP_SHOP.concat(STAMP_GIFTS).map(stampCost)); return s >= min ? s : 0; };
