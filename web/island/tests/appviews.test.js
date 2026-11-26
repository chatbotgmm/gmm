// 갈매폰 나머지 앱 화면(appViews.js, DOM 없이) — 10단계 가독성 마무리: 앱마다 핵심 요약 머리 + 세부 접기, 0점 흐리게, 토스트 머리 굵게
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { RANKS } from "../src/world/rank.js";
import { NEWS_DAY_SECS } from "../src/world/news.js";
import { FRIEND_STAGES } from "../src/units/mind.js";
import { factRow } from "../src/ui/hudParts.js";
import { townAppHtml, granaryFact, daysToWinter, marketAppHtml, dailyHead, wishListHtml, decorHeadHtml, relHeadHtml, relLegendHtml,
  dexCounts, dexHeadHtml, newsAppHtml, toastParts, toastHtml, TOAST_TAIL_MAX } from "../src/ui/appViews.js";

const fresh = () => World.create(7, seededRandom(3), { wild: true, firstGull: true });
const details = html => [...html.matchAll(/<details class="more" data-more="([^"]+)"( open)?/g)].map(m => [m[1], !!m[2]]);
const first = (html, re) => html.search(re);

test("마을: 머리(등급·점수/다음 점수·남은 점수·막대)가 맨 앞, 한눈 칸(겨울·저장고), 세부는 다섯 접기(처음엔 닫힘)", () => {
  const w = fresh(), html = townAppHtml(w, { today: new Date(2026, 10, 26) });
  assert.equal(first(html, /<div class="sum"/), 0, "맨 앞은 핵심 요약 머리");
  const nxt = RANKS[w.rank + 1];
  assert.match(html, new RegExp(`class="sum-big">\\d+ / ${nxt.need}<`), "큰 숫자: 점수 / 다음 등급 점수");
  assert.match(html, /다음 .+까지 <b>\d+점<\/b>/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /class="facts".*❄️ 겨울까지 5일/, "11월 26일 → 12월 1일까지 5일");
  assert.match(html, /🏚 저장고 없음/);
  assert.deepEqual(details(html).map(d => d[0]), ["town.score", "town.next", "town.fest", "town.winter", "town.ranks"]);
  assert.ok(details(html).every(d => !d[1]), "처음엔 모두 접힘");
  assert.ok(html.indexOf("id=\"festNow\"") > html.indexOf('data-more="town.fest"'), "축제 줄은 접기 안쪽");
  // 점수 내역: 0점 줄은 흐리게(.zero) + 맨 아래
  const sc = html.slice(html.indexOf('data-more="town.score"'), html.indexOf('data-more="town.next"'));
  const rows = [...sc.matchAll(/<tr( class="zero")?><td>[^<]*<\/td><td>[^<]*= (\d+)<\/td>/g)].map(m => [!!m[1], +m[2]]);
  assert.ok(rows.length >= 3);
  for (const [z, v] of rows) assert.equal(z, v === 0, "0점이면 흐리게");
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1][1] >= rows[i][1], "점수 큰 순");
});

test("마을 한눈 칸: 겨울까지 날짜 · 저장고 비면 경고색(🚨) · 4분의 1 밑 얼마 안 남음(⚠️)", () => {
  assert.equal(daysToWinter(new Date(2026, 10, 26), "autumn"), 5);
  assert.equal(daysToWinter(new Date(2026, 0, 3), "winter"), 0);
  const w = fresh(); w.granaryB = () => ({}); w.granary = 0;
  assert.deepEqual(granaryFact(w), { icon: "🏚", text: "저장고 0 / 80", tone: "empty" });
  w.granary = 10; assert.equal(granaryFact(w).tone, "low"); w.granary = 40; assert.equal(granaryFact(w).tone, null);
  const f = factRow([{ icon: "🏚", text: "저장고 0 / 80", tone: "empty" }, null, { icon: "❄️", text: "겨울까지 5일" }]);
  assert.match(f, /data-tone="empty">🚨 🏚 저장고 0 \/ 80</, "색만으로 알리지 않게 🚨");
  assert.equal((f.match(/class="fact"/g) || []).length, 2, "null은 건너뜀");
  assert.equal(factRow([null]), "");
  const html = townAppHtml(Object.assign(fresh(), { granaryB: () => ({}), granary: 0 }), { today: new Date(2026, 10, 26) });
  assert.match(html, /data-tone="empty">🚨 🏚 저장고 0 \/ 80/);
});

test("시장: 시장이 없으면 안내 한 줄, 있으면 머리(음식 값·팔리는 집·상인 돈) + 접기 넷", () => {
  const w = fresh();
  assert.doesNotMatch(marketAppHtml(w), /class="sum"/);
  w.marketB = () => ({}); w.merchantU = () => ({ name: "상인", coins: 1234, raw: {}, goods: {} }); w.housesForSale = () => [];
  const html = marketAppHtml(w);
  assert.equal(first(html, /<div class="sum"/), 0);
  assert.match(html, new RegExp(`sum-big">🪙${w.prices.food}<`));
  assert.match(html, /팔리는 집 <b>0<\/b>채 · 상인 돈 🪙<b>1,234<\/b>/);
  assert.deepEqual(details(html).map(d => d[0]), ["market.price", "market.sale", "market.food", "market.owner"]);
});

test("소원: 머리(오늘의 부탁 n/N · 도장 · 소원 수), 다 들어주면 ✅ ok, 소원 목록은 짧게 + 들어주는 법은 접기", () => {
  const w = fresh();
  w.daily = { key: "k", stamped: false, reqs: [{ id: "a", have: 1, need: 1 }, { id: "b", have: 0, need: 2 }, { id: "c", have: 0, need: 1 }] }; w.stamps = 2;
  let h = dailyHead(w);
  assert.match(h, /sum-big">1 \/ 3</); assert.match(h, /id="stampCount"[^>]*>🏵 도장 2개</); assert.match(h, /aria-valuenow="33"/);
  w.daily.stamped = true; w.daily.reqs.forEach(r => { r.have = r.need; });
  h = dailyHead(w); assert.match(h, /data-tone="ok"/); assert.match(h, /✅ 다 들어줬어요/);
  const l = wishListHtml(w);
  assert.match(l, /이룬 소원 0개/); assert.match(l, /지금은 바라는 게 없어요/); assert.deepEqual(details(l).map(d => d[0]), ["wish.hint"]);
});

test("집 꾸미기·관계도·도감 머리", () => {
  const d = decorHeadHtml([{ name: "작은 집", comfort: 2 }, { name: "2층집(미니)", comfort: 7 }]);
  assert.match(d, /sum-big">2채</); assert.match(d, /가장 아늑한 집: 🏠 <b>2층집\(미니\)<\/b> 🛋 7/); assert.deepEqual(details(d).map(x => x[0]), ["decor.how"]);
  assert.match(decorHeadHtml([]), /아직 다 지은 집이 없어요/);
  const r = relHeadHtml([{ stage: 2 }, { stage: 2 }, { stage: 1 }, { stage: 0 }], 4);
  assert.match(r, /sum-big">2쌍</); assert.match(r, /친구 <b>1<\/b>쌍 · 🐦 갈매미 4마리/);
  assert.match(relLegendHtml(FRIEND_STAGES), /class="rellegend"/);
  const w = fresh(), c = dexCounts(w);
  assert.equal(c.fish, 0); assert.ok(c.fishAll > 0 && c.skyAll > 0 && c.bagAll > 0);
  assert.match(dexHeadHtml(c), new RegExp(`sum-big">0 / ${c.fishAll}<`));
});

test("소식지: 가장 새 날 머리기사 하나만 크게, 그날 나머지·지난 날짜는 날짜마다 접기", () => {
  const w = fresh(); w.time = NEWS_DAY_SECS * 2 + 5;
  assert.match(newsAppHtml(w), /아직 실을 소식이 없어요/);
  w.newsLog = [];
  for (const [day, k] of [[3, 0], [3, 1], [3, 2], [2, 0], [1, 0], [1, 1]]) w.newsLog.push({ day, t: k, weight: 5 - k, icon: "📰", text: `${day}일 소식 ${k}` });
  const html = newsAppHtml(w);
  assert.equal((html.match(/<li class="top">/g) || []).length, 3, "날마다 맨 위 기사는 굵게(지난 날은 접기 안쪽)");
  const lead = html.slice(0, html.indexOf("<details"));
  assert.match(lead, /오늘 <span class="dim">마을 3일째/); assert.match(lead, /3일 소식 0/); assert.doesNotMatch(lead, /3일 소식 1/);
  assert.deepEqual(details(html).map(d => d[0]), ["news.rest.3", "news.day.2", "news.day.1"]);
  assert.match(html, /어제 · 마을 2일째/);
  assert.ok(details(html).every(d => !d[1]));
});

test("토스트: 아이콘 · 머리(굵게) · 꼬리. 마을 소식의 긴 꼬리말은 버림(지난 알림에서만), 대답·까닭은 다 보임", () => {
  assert.deepEqual(toastParts("🎉 미니 등장! (🐧펭귄 종족 · 🪚목수)"), { icon: "🎉", head: "미니 등장!", tail: " (🐧펭귄 종족 · 🪚목수)", cutTail: false });
  assert.deepEqual(toastParts("🚫 금고가 모자라요 · 🪙30 더 필요"), { icon: "🚫", head: "금고가 모자라요", tail: " · 🪙30 더 필요", cutTail: false });
  assert.deepEqual(toastParts("저장했어요(이 브라우저에만)"), { icon: "", head: "저장했어요(이 브라우저에만)", tail: "", cutTail: false });
  assert.equal(toastParts("⚠️ 잠깐 문제가 있었지만 계속할게요").icon, "⚠️");
  const long = "💭 미니: \"꽃밭이 있으면 좋겠어요\" (🏠 건설에서 화단을 마을 가까이 셋 놓아 주세요)";
  const q = toastParts(long, { keepTail: false });
  assert.equal(q.head, "미니: \"꽃밭이 있으면 좋겠어요\""); assert.equal(q.tail, ""); assert.ok(q.cutTail);
  assert.ok(toastParts(long).tail.length > TOAST_TAIL_MAX, "keepTail(기본)이면 꼬리 그대로");
  assert.equal(toastParts("📋 오늘의 부탁 완료 · 1개 남았어요", { keepTail: false }).tail, " · 1개 남았어요", "짧은 꼬리는 남김");
  assert.equal(toastParts("갈매미가 아직 없어요 · 📱 → 🥚 소환을 눌러 불러 보세요", { keepTail: false }).cutTail, false, "꼬리가 22자를 넘어도 한 줄 전체가 40자 안이면 남김");
  const t = toastHtml("<b>🎉 x</b> · y", { count: 3 });
  assert.doesNotMatch(t.html, /<b>🎉/, "글자는 태그로 읽히지 않음");
  assert.match(t.html, /class="t-n"> ×3</);
  const h = toastHtml("🎉 미니 등장! (펭귄)");
  assert.match(h.html, /^<span class="t-ico" aria-hidden="true">🎉<\/span> <span class="t-txt"><b class="t-head">미니 등장!<\/b><span class="t-tail"> \(펭귄\)<\/span>/);
});
