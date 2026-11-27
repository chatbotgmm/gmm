// 갈매폰 나머지 앱 화면(화면 연결 10단계 · 가독성 마무리). 순수: DOM을 모름 → node 시험 가능. hud.js가 HTML을 받아 바뀐 때만 넣음.
//  앱마다 맨 위에 핵심 요약(sumHead: 큰 숫자·굵은 한 줄·막대) + 한눈 칸(factRow), 세부(표·규칙 설명·목록)는 자세히 보기 접기(more)로.
//  · 마을: 지금 등급 · 다음 등급까지 남은 점수 막대 · 겨울까지 며칠 · 저장고(비면 경고색) · 축제 → 접기: 점수 내역(큰 순·0점 흐리게) · 다음 등급 · 축제 · 겨울 대비 · 등급별 건물
//  · 시장: 음식 값 · 팔리는 집 수 · 상인 돈 → 접기: 시세 · 팔리는 집 · 음식 · 집 주인
//  · 소원: 오늘의 부탁 n/3 · 도장 · 소원 수(머리) / 소원 목록은 짧게, 들어주는 법(힌트)은 접기
//  · 집 꾸미기: 다 지은 집 수 · 가장 아늑한 집 → 접기: 꾸미는 법
//  · 관계도: 단짝 수 → 접기: 범례·읽는 법
//  · 도감: 물고기 n/N · 기증 · 하늘 · 가방 → 묶음마다 접기
//  · 소식지: 오늘 머리기사 크게 → 나머지 기사·지난 날짜는 날짜마다 접기
//  · 토스트: toastParts — 아이콘 + 핵심 낱말 굵게, 마을 소식의 긴 꼬리말은 지난 알림에서만
import * as E from "../world/economy.js";
import { BUILDINGS, JOBS, FISH, ITEMS } from "../data/catalog.js";
import { RANKS, RANK_REWARD, rankScore, unlockName } from "../world/rank.js";
import { FESTIVAL_RANK, FESTIVAL_NEED, FESTIVAL_RADIUS, festivalOf, festivalGift, festivalPlaza, festivalStamps } from "../world/festival.js";
import { SEASONS } from "../world/season.js";
import { WISH_BY_ID, WISH_REWARD, wishText } from "../world/wishes.js";
import { DONATE_KINDS, donatedCount } from "../world/aquarium.js";
import { medalCounts } from "../world/medals.js";
import { SKY_EVENTS } from "../world/skywatch.js";
import { newsDay, newsPages, NEWS_HEADLINES, NEWS_KEEP_DAYS } from "../world/news.js";
import { sumHead, moreBox, valueRows, factRow, fmtNum } from "./hudParts.js";

const avEsc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const avMore = (k, t, h, o) => moreBox(k, t, h, o);
/** 「(으)로」: 받침이 있으면 「으로」, 받침 없음·ㄹ 받침이면 「로」(어촌으로 · 항구 마을로 · 섬 도시로) */
export const avRo = word => { const c = String(word).charCodeAt(String(word).length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0 && c % 28 !== 8 ? "으로" : "로"; };

// ---- 🏅 마을
/** 겨울(12월 1일, 기상청 겨울 시작)까지 남은 날. 겨울(12~2월이거나 계절이 겨울)이면 0 */
export function daysToWinter(today, season) {
  const d = today || new Date(), m = d.getMonth() + 1;
  return season === "winter" || m === 12 || m <= 2 ? 0 : Math.ceil((new Date(d.getFullYear(), 11, 1) - d) / 86400000);
}
/** 저장고 한눈 칸: 없음 · 비었음(경고) · 4분의 1 밑(얼마 안 남음) · 넉넉 */
export function granaryFact(w) {
  if (!w.granaryB?.()) return { icon: "🏚", text: "저장고 없음", tone: null };
  const n = w.granary || 0, max = E.GRANARY_MAX;
  return { icon: "🏚", text: `저장고 ${fmtNum(n)} / ${max}`, tone: n <= 0 ? "empty" : n < max / 4 ? "low" : null };
}
/** 마을 앱 HTML. today: 기기 날짜(Date) · more: 펼침을 기억하는 접기(hud.more) */
export function townAppHtml(w, { today = new Date(), more = avMore } = {}) {
  const { score, parts } = rankScore(w), cur = RANKS[w.rank], nxt = RANKS[w.rank + 1], BN = unlockName;
  const frac = nxt ? Math.max(0, Math.min(1, (score - cur.need) / (nxt.need - cur.need))) : 1;
  const head = sumHead({ icon: cur.icon, big: nxt && score < nxt.need ? `${fmtNum(score)} / ${fmtNum(nxt.need)}` : fmtNum(score), label: cur.name,
    lineHtml: !nxt ? "가장 높은 등급이에요 🎉" : score >= nxt.need ? `곧 ${avEsc(nxt.icon)} <b>${avEsc(nxt.name)}</b>${avRo(nxt.name)} 올라요 🎉` : `다음 ${avEsc(nxt.icon)} ${avEsc(nxt.name)}까지 <b>${fmtNum(nxt.need - score)}점</b>`, bar: frac });

  const toWinter = daysToWinter(today, w.season), gr = granaryFact(w);
  const fNow = festivalOf(w.festKey), fOn = w.festival && festivalOf(w.festival.id), plaza = festivalPlaza(w), fGift = fNow && festivalGift(fNow.key);
  const fFact = fOn ? { icon: "🎪", text: `축제 중! ${Math.max(0, Math.ceil(w.festival.t))}초`, tone: "ok" }
    : !fNow || w.rank < FESTIVAL_RANK ? null
    : w.festivals[fNow.key] ? { icon: "🎪", text: "올해 축제 ✅", tone: null }
    : { icon: "🎪", text: `장식 ${Math.min(plaza.n, FESTIVAL_NEED)} / ${FESTIVAL_NEED}`, tone: null };
  const facts = factRow([
    { icon: "❄️", text: toWinter > 0 ? `겨울까지 ${toWinter}일` : "지금 겨울", tone: toWinter <= 14 ? "low" : null },
    gr, fFact,
  ]);

  const scoreH = valueRows(parts.map(([name, n, per, pts]) => [name, pts, `${n} × ${per} = ${pts}`])) +
    `<p class="dim">점수가 큰 것부터 · 0점 줄은 흐리게. 갈매미·집·시설·이룬 소원이 늘면 올라요.</p>`;
  const nextH = nxt ? `<p>${nxt.icon} <b>${avEsc(nxt.name)}</b>(${nxt.need}점)이 되면</p><ul class="av-list">${nxt.unlock.map(u => `<li>🔓 ${avEsc(BN(u))} 건설</li>`).join("")}<li>🪙 갈매미마다 축하금 ${RANK_REWARD}</li></ul>` : "";

  const stamps = festivalStamps(w.festivals);
  const fLine = fOn ? `<b>${fOn.def.icon} ${fOn.def.name}</b>가 열리고 있어요! 남은 시간 <b>${Math.max(0, Math.ceil(w.festival.t))}초</b> · 함께한 갈매미 ${w.festival.who.length}마리`
    : !fNow ? `<span class="dim">축제 달력을 읽는 중이에요.</span>`
    : w.festivals[fNow.key] ? `올해 <b>${fNow.def.icon} ${fNow.def.name}</b>는 잘 치렀어요. 다음 계절에 또 만나요!`
    : w.rank < FESTIVAL_RANK ? `<span class="dim">🔒 마을 등급이 ${RANKS[FESTIVAL_RANK].icon} ${RANKS[FESTIVAL_RANK].name}이 되면 계절마다 축제를 열 수 있어요.</span>`
    : `<b>${fNow.def.icon} ${fNow.def.name}</b> 준비 중 · 광장 장식 <b>${Math.min(plaza.n, FESTIVAL_NEED)} / ${FESTIVAL_NEED}</b><br><span class="dim">🏠 건설에서 축제 장식(${Object.values(BUILDINGS).filter(d => d.festive).map(d => d.name).join("·")})을 ${FESTIVAL_RADIUS}칸 안에 ${FESTIVAL_NEED}개 모으면 "축제 하자!" 소원이 이루어져요${plaza.ok ? " · 광장은 다 모였어요! 새 장식을 하나만 더 놓으면 열려요" : ""}${fGift ? ` · 끝나면 🎁 ${fGift.name}` : ""}</span>`;
  const festH = `<p id="festNow">${fLine}</p><div class="stamps" id="festStamps">${stamps.map(x => `<span class="stamp" data-fest="${x.key}">${x.def.icon}<small>${x.year} ${SEASONS[x.season].name}</small></span>`).join("") || `<span class="dim">아직 찍은 축제 도장이 없어요.</span>`}</div>`;
  const fNote = fOn ? "열리는 중" : !fNow || w.rank < FESTIVAL_RANK ? "🔒" : w.festivals[fNow.key] ? "올해 끝" : `${Math.min(plaza.n, FESTIVAL_NEED)}/${FESTIVAL_NEED}`;

  const winterH = `<p>${toWinter > 0 ? `겨울(12월 1일)까지 <b>${toWinter}일</b>` : `<b>지금 겨울이에요</b>`}</p>` +
    `<ul class="av-list"><li>${SEASONS.winter.icon} 밭이 절반 속도로 자라요</li><li>🍗 배가 1.25배 빨리 고파요</li><li>🪙 음식 값이 올라요</li></ul>` +
    (w.granaryB?.() ? `<p>🏚 저장고 음식 <b>${w.granary}</b> / ${E.GRANARY_MAX}</p><p class="dim">농부·어부가 남는 음식을 🪙${E.GRANARY_BUY}에 팔아 쌓고, 배고픈 갈매미는 시세대로 사 가요(돈이 없고 아주 배고프면 나눠 받아요).</p>`
      : `<p class="dim">저장고가 없어요. 🪚 목수가 있으면 🏠 건설에서 <b>저장고</b>를 지을 수 있어요.</p>`);
  const ranksH = `<table class="tbl">${RANKS.slice(1).map((r, i) => `<tr${w.rank >= i + 1 ? "" : ` class="zero"`}><td>${w.rank >= i + 1 ? "✅" : "🔒"} ${r.icon} ${r.name} (${r.need}점)</td><td>${r.unlock.map(BN).join(", ")}</td></tr>`).join("")}</table>`;

  return head + facts +
    more("town.score", "📊 점수 내역", scoreH, { note: `${fmtNum(score)}점` }) +
    (nxt ? more("town.next", "🔓 다음 등급이 되면", nextH, { note: `${nxt.unlock.length + 1}가지` }) : "") +
    more("town.fest", "🎪 계절 축제", festH, { note: fNote }) +
    more("town.winter", "❄️ 겨울 대비", winterH, { note: toWinter > 0 ? `${toWinter}일` : "겨울" }) +
    more("town.ranks", "🏅 등급별 건물", ranksH, { note: `${w.rank} / ${RANKS.length - 1}` });
}

// ---- 🐚 시장
/** 시세 칸: 지금 값 + 지난 기록과 비교한 화살표(▲▼ 글자도 — 색만으로 알리지 않게) + 작은 그래프(20초마다 한 점) */
export function priceCellHtml(w, k) {
  const h = (w.priceHist || []).map(p => p[k]), now = w.prices[k], prev = h.length > 1 ? h[h.length - 2] : now;
  const arrow = now > prev ? `<span class="av-up">▲</span>` : now < prev ? `<span class="av-down">▼</span>` : `<span class="dim">–</span>`;
  let spark = "";
  if (h.length > 1) {
    const lo = Math.min(...h), hi = Math.max(...h), W = 64, Hh = 16, pts = h.map((v, i) => `${(i / (h.length - 1) * W).toFixed(1)},${(Hh - 2 - (hi > lo ? (v - lo) / (hi - lo) : 0.5) * (Hh - 4)).toFixed(1)}`).join(" ");
    spark = ` <svg width="${W}" height="${Hh}" style="vertical-align:middle" aria-label="최근 시세 ${lo}~${hi}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".7"/></svg>`;
  }
  return `🪙<b>${now}</b> ${arrow}${spark}`;
}
export function marketAppHtml(w, { more = avMore, price = k => priceCellHtml(w, k) } = {}) {
  const mk = w.marketB(); if (!mk) return `<p>아직 시장이 없어요. <b>🪚 목수</b>가 있으면 🏠 건설에서 <b>시장</b>을 지을 수 있어요.</p>`;
  const sale = w.housesForSale(), m = w.merchantU(), food = w.units.filter(u => E.isProducer(u)), owners = w.units.filter(u => u.home);
  const head = sumHead({ icon: "🐚", big: `🪙${fmtNum(w.prices.food)}`, label: "음식 한 개 값",
    lineHtml: `🏠 팔리는 집 <b>${sale.length}</b>채 · ${m ? `상인 돈 🪙<b>${fmtNum(m.coins || 0)}</b>` : "상인 없음"}` });
  const priceH = (m ? `<table class="tbl">${E.RAW.map(k => `<tr><td>${E.ITEM_ICON[k]} ${E.ITEM_NAME[k]}</td><td>${price(k)} · 창고 ${(m.raw[k] || 0) + (m.goods[k] || 0)}</td></tr>`).join("")}<tr><td>상인(${avEsc(m.name)}) 돈</td><td>🪙${fmtNum(m.coins || 0)}</td></tr></table>`
    : `<p class="dim">상인 🐚 갈매미가 없어요(소환하면 와요).</p>`) + `<p class="dim">상인 창고에 많이 쌓이면 싸지고, 모자라면 비싸져요.</p>`;
  const saleH = sale.length ? `<table class="tbl">${sale.map(b => `<tr><td>🏠 ${BUILDINGS[b.defId].name}${BUILDINGS[b.defId].forUnit ? ` (${BUILDINGS[b.defId].forUnit} 전용)` : ""}</td><td>🪙${fmtNum(w.housePrice(b))}</td></tr>`).join("")}</table>`
    : `<p class="dim">다 팔렸어요. 건축가가 집을 더 지으면 여기에 나와요.</p>`;
  const foodH = `<p>음식 값 ${price("food")}</p><table class="tbl">${food.map(u => `<tr><td>${JOBS[u.job].icon} ${avEsc(u.name)}</td><td>🍗${u.inv?.food || 0} 🐟${u.inv?.fish || 0}</td></tr>`).join("") || `<tr><td class="dim">농부·어부가 없어요</td><td></td></tr>`}</table>` +
    `<p class="dim">농부·어부가 내놓을 음식이 모자라거나 배고픈 갈매미가 많으면 비싸지고, 겨울엔 더 비싸요.</p>`;
  const ownH = `<table class="tbl">${owners.map(u => `<tr><td>${avEsc(u.name)}</td><td>${BUILDINGS[w.buildings.get(u.home)?.defId]?.name ?? ""}${w.buildings.get(u.home)?.owner === u.unitId || !w.buildings.get(u.home) ? "" : " (같이 삶)"}</td></tr>`).join("") || `<tr><td class="dim">아직 없어요</td><td></td></tr>`}</table>`;
  return head +
    more("market.price", "📈 시세(상인이 사는 값)", priceH, { note: E.RAW.map(k => `${E.ITEM_ICON[k]}${w.prices[k]}`).join(" ") }) +
    more("market.sale", "🏠 팔리는 집", saleH, { note: `${sale.length}채` }) +
    more("market.food", "🍗 음식(농부·어부)", foodH, { note: `${food.length}마리` }) +
    more("market.owner", "🔑 집 주인", ownH, { note: `${owners.length}마리` });
}

// ---- 💭 소원 · 오늘의 부탁
/** 소원 앱 맨 위 머리: 오늘의 부탁 n/N(막대) · 모은 도장(#stampCount) · 지금 소원 수 */
export function dailyHead(w) {
  const d = w.daily, reqs = d?.reqs || [], done = reqs.filter(r => r.have >= r.need).length;
  const stamp = `<span id="stampCount" title="모은 도장">🏵 도장 ${w.stamps}개</span>`;
  if (!reqs.length) return sumHead({ icon: "📋", big: "—", label: "오늘의 부탁", lineHtml: `${stamp} · 💭 소원 ${w.wishes.length}개` });
  return sumHead({ icon: d.stamped ? "✅" : "📋", big: `${done} / ${reqs.length}`, label: "오늘의 부탁", tone: d.stamped ? "ok" : null, toneText: d.stamped ? "다 들어줬어요" : "",
    lineHtml: `${stamp} · 💭 소원 ${w.wishes.length}개`, bar: done / reqs.length });
}
/** 갈매미의 소원 목록(짧게) + 들어주는 법(힌트·축하금)은 접기 */
export function wishListHtml(w, { more = avMore } = {}) {
  const list = w.wishes.map(x => ({ d: WISH_BY_ID[x.id], u: w.units.find(o => o.unitId === x.unitId), x })).filter(r => r.d);
  const rows = list.map(({ d, u, x }) => `<li><span class="ico">${d.icon}</span><span><b>${avEsc(u?.name ?? "")}</b>: ${avEsc(wishText(d, w, u, x))}</span></li>`).join("");
  const hint = (list.length ? `<table class="tbl">${list.map(({ d, u }) => `<tr><td>${d.icon} ${avEsc(u?.name ?? "")}</td><td>${avEsc(d.hint)}</td></tr>`).join("")}</table>` : "") +
    `<p class="dim">갈매미가 가끔 마을에 바라는 것을 말해요. 들어주면 기뻐하고 ${w.economy ? `공식은행이 축하금 🪙${WISH_REWARD}을 줘요` : "배가 조금 불러요"}.</p>`;
  return `<h4 class="av-h">💭 갈매미의 소원 <span class="dim">이룬 소원 ${w.wishDone}개</span></h4>` +
    (rows ? `<ul class="av-wish">${rows}</ul>` : `<p class="dim">지금은 바라는 게 없어요.</p>`) +
    more("wish.hint", "💡 들어주는 법", hint, { note: list.length ? `${list.length}개` : "" });
}

// ---- 🛋 집 꾸미기
/** 머리(다 지은 집 수 · 가장 아늑한 집) + 꾸미는 법 접기. houses: [{ name, comfort }] */
export function decorHeadHtml(houses, { more = avMore } = {}) {
  const best = houses.slice().sort((a, b) => b.comfort - a.comfort)[0];
  const head = sumHead({ icon: "🛋", big: `${houses.length}채`, label: "다 지은 집",
    lineHtml: best && best.comfort > 0 ? `가장 아늑한 집: 🏠 <b>${avEsc(best.name)}</b> 🛋 ${best.comfort}` : houses.length ? "아직 꾸민 집이 없어요 · 집을 눌러 들어가 보세요" : "" });
  return head + more("decor.how", "📖 꾸미는 법", `<p>집에 들어가 가구를 놓고 바닥·벽지를 바꿔요.</p><ul class="av-list"><li>🛏 놓은 가구는 그 집 갈매미가 써요(침대에서 낮잠 등)</li><li>🪙 집주인은 돈이 모이면 잡화점에서 가구를 사 와요</li><li>🛋 아늑함이 높을수록 갈매미가 좋아해요</li></ul>`) +
    (houses.length ? "" : `<p>아직 다 지은 집이 없어요.</p>`);
}

// ---- 💞 관계도
/** 머리: 단짝 n쌍 · 친구 n쌍 · 갈매미 수. links: relationGraph(...).links */
export function relHeadHtml(links, n) {
  const c = s => links.filter(l => l.stage === s).length;
  return sumHead({ icon: "💞", big: `${c(2)}쌍`, label: "단짝", lineHtml: `🧡 친구 <b>${c(1)}</b>쌍 · 🐦 갈매미 ${n}마리` });
}
/** 범례(선 굵기·색) + 읽는 법 — 접기 안쪽. stages: FRIEND_STAGES */
export function relLegendHtml(stages) {
  return `<div class="rellegend">${stages.map(d => `<span><i style="height:${d.width}px;background:${d.color}"></i>${d.name}</span>`).join("")}</div>` +
    `<p class="dim">갈매미를 누르면 누구와 얼마나 친한지 보여 줘요. 만나서 인사할 때마다 조금씩 친해져요(호감 ${stages[1].min}부터 친구, ${stages[2].min}부터 단짝).</p>`;
}

// ---- 📖 도감
/** 도감 수: 물고기 · 가방 · 기증 · 하늘 · 메달(gold·silver·bronze = 그 메달이 가장 좋은 종류 수, fishRecord에서 셈) */
export function dexCounts(w) {
  const sky = Object.keys(SKY_EVENTS);
  return { fish: FISH.filter(f => w.collection[f.id]).length, fishAll: FISH.length, bag: ITEMS.filter(i => w.items[i.id]).length, bagAll: ITEMS.length,
    donated: donatedCount(w.donated || {}), donateAll: DONATE_KINDS.length, sky: sky.filter(k => w.skySeen?.[k]).length, skyAll: sky.length, ...medalCounts(w.fishRecord) };
}
export function dexHeadHtml(c) {
  return sumHead({ icon: "📖", big: `${c.fish} / ${c.fishAll}`, label: "물고기", bar: c.fishAll ? c.fish / c.fishAll : 0,
    line: `🥇 금메달 ${c.gold ?? 0}/${c.fishAll} · 🐠 기증 ${c.donated}/${c.donateAll} · 🌈 하늘 ${c.sky}/${c.skyAll} · 🎁 가방 ${c.bag}/${c.bagAll}` });
}

// ---- 📰 소식지
/** 날짜 이름: 오늘 · 어제 · n일 전 */
const newsDayName = (day, today) => day === today ? "오늘" : day === today - 1 ? "어제" : `${today - day}일 전`;
/** 소식지 HTML: 맨 위 짧은 한 줄 → 가장 새 날의 머리기사(크게) + 그날 나머지 기사 접기 → 지난 날짜는 날짜마다 접기(날짜 묶음 유지) */
export function newsAppHtml(w, { more = avMore } = {}) {
  const today = newsDay(w.time), pages = newsPages(w.newsLog || []);
  const sub = `<p class="av-sub">📰 마을 <b>${today}일째</b> · 하루 큰일 ${NEWS_HEADLINES}건까지 · 최근 ${NEWS_KEEP_DAYS}일</p>`;
  if (!pages.length) return sub + `<p class="dim">아직 실을 소식이 없어요. 집을 짓거나, 소원을 들어주거나, 귀한 물고기를 낚으면 여기에 실려요.</p>`;
  const li = (e, top) => `<li${top ? ` class="top"` : ""}><span class="ico">${e.icon}</span><span>${avEsc(e.text)}</span></li>`;
  const extra = p => p.more ? `<p class="dim">그 밖의 소식 ${p.more}건</p>` : "";
  const [first, ...rest] = pages, others = first.heads.slice(1);
  const lead = `<section class="newsday"><h4>${newsDayName(first.day, today)} <span class="dim">마을 ${first.day}일째</span></h4><ul>${li(first.heads[0], true)}</ul>` +
    (others.length || first.more ? more(`news.rest.${first.day}`, "그 밖의 기사", `<ul>${others.map(e => li(e)).join("")}</ul>${extra(first)}`, { note: `${others.length + first.more}건` }) : "") + `</section>`;
  const old = rest.map(p => more(`news.day.${p.day}`, `${newsDayName(p.day, today)} · 마을 ${p.day}일째`, `<ul class="av-news">${p.heads.map((e, i) => li(e, !i)).join("")}</ul>${extra(p)}`, { note: `${p.heads.length + p.more}건` })).join("");
  return sub + lead + (old ? `<div class="av-olds">${old}</div>` : "");
}

// ---- 알림(토스트)
/** 알림 한 줄 → { icon, head, tail }. 맨 앞 그림 글자(이모지 등)는 icon, 첫 " · " 또는 " (" 앞은 head(굵게), 나머지는 tail.
 *  keepTail = false(마을 소식)면 긴 꼬리말(꼬리 22자 넘고 한 줄 전체 40자 넘음)은 버림 → 지난 알림에서만 봄. 도구·단추의 대답(까닭 글)은 늘 다 보임 */
export const TOAST_TAIL_MAX = 22, TOAST_LINE_MAX = 40;
export function toastParts(text, { keepTail = true } = {}) {
  const s = String(text ?? "").trim(), m = s.match(/^((?:[^\s\p{L}\p{N}"'(“‘]|️|‍)+)\s+/u);
  const icon = m ? m[1] : "", rest = m ? s.slice(m[0].length) : s;
  const cut = [rest.indexOf(" · "), rest.indexOf(" (")].filter(i => i > 0).sort((a, b) => a - b)[0];
  let head = cut == null ? rest : rest.slice(0, cut), tail = cut == null ? "" : rest.slice(cut);
  let cutTail = false;
  if (!keepTail && tail.trim().length > TOAST_TAIL_MAX && (head + tail).length > TOAST_LINE_MAX) { tail = ""; cutTail = true; }
  return { icon, head, tail, cutTail };
}
/** 토스트 HTML(글자는 태그로 읽히지 않게 바꿈) + 보이는 글자 수(머무는 시간 셈) */
export function toastHtml(text, { keepTail = true, count = 1 } = {}) {
  const p = toastParts(text, { keepTail }), n = count > 1 ? ` ×${count}` : "";
  const html = `${p.icon ? `<span class="t-ico" aria-hidden="true">${avEsc(p.icon)}</span> ` : ""}<span class="t-txt"><b class="t-head">${avEsc(p.head)}</b>` +
    `${p.tail ? `<span class="t-tail">${avEsc(p.tail)}</span>` : ""}${p.cutTail ? `<span class="t-tail"> …</span>` : ""}${n ? `<b class="t-n">${n}</b>` : ""}</span>`;
  return { html, len: (p.head + p.tail).length, label: `${p.icon ? p.icon + " " : ""}${p.head}${p.tail}${n}` };
}
