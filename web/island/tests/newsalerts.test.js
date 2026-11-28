// 알림 줄 표(ui/newsAlerts.js): news.js에 문장이 있는 이벤트가 모두 알림 줄에 연결됐는지 · 거르기(하루 한 번·같은 갈매미 30초) · 묶음 글
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NEWS_EVENTS, newsFor } from "../src/world/news.js";
import { ALERTS, SILENT, WAGE_GAP, batchText, makeGate, alertLine, quietAlert, WEATHER_SAY, makeBudget, DAY_LINES, alertTier } from "../src/ui/newsAlerts.js";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";

const MAIN = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const direct = new Set([...MAIN.matchAll(/world\.on\("(\w+)"/g)].map(m => m[1]));
// 소리만 듣는 것(hookSounds의 w.on): 다 지은 건물·갈매미가 산 가구는 소식지에만 싣고 알림 줄에는 안 띄움(계획서 대조 목록 20개 밖, 이번에 안 바꿈)
const SOUND_ONLY = ["buildingDone", "furnitureBought"];

test("news.js에 문장이 있는데 알림 줄(main.js 직접 연결 또는 ALERTS 표)에 없는 이벤트 = 0 (일부러 뺀 fee·clinicVisit 빼고)", () => {
  const missing = NEWS_EVENTS.filter(ev => !direct.has(ev) && !ALERTS[ev] && !SILENT.includes(ev) && !SOUND_ONLY.includes(ev));
  assert.deepEqual(missing, []);
  for (const ev of SOUND_ONLY) assert.match(MAIN, new RegExp(`w\\.on\\("${ev}"`), `${ev}는 소리로 연결돼 있음`);
  assert.deepEqual(SILENT.filter(ev => !NEWS_EVENTS.includes(ev)), [], "일부러 뺀 목록도 news.js에 있는 이름");
  assert.equal(Object.keys(ALERTS).filter(ev => !NEWS_EVENTS.includes(ev)).length, 0, "표의 이벤트는 모두 문장이 있음");
  assert.equal(Object.keys(ALERTS).filter(ev => direct.has(ev)).length, 0, "표와 직접 연결이 겹치지 않음(같은 알림 두 번 방지)");
  assert.equal(Object.keys(ALERTS).length, 25, "25개(업그레이드 시작·완료 · 갈매미 길 부탁 · 쓰러짐 · 중앙은행 물가 사태 3개·판 생김 포함) + 일부러 뺀 11개(세금·숙박비 영수증 · 설계비·병원 접수·쓰러져 실려 감 · 중앙은행 손잡이·예산 참·자동 6개)");
  assert.match(MAIN, /Object\.entries\(ALERTS\)/, "main.js가 표를 돌며 연결");
});

test("chill은 마을 하루에 한 번만, wageOwed는 같은 갈매미 30초에 한 번(다른 갈매미는 따로) · 세금·숙박비는 알림 줄에 안 뜸", () => {
  const pass = makeGate(), a = { u: { unitId: 1 } }, b = { u: { unitId: 2 } };
  assert.equal(pass("tax", {}, 10), false); assert.equal(pass("lodging", {}, 10), false); assert.ok(SILENT.includes("tax") && SILENT.includes("lodging"));
  assert.equal(pass("chill", a, 20), true); assert.equal(pass("chill", b, 21), false, "하루 한 번은 마을 전체");
  assert.equal(pass("wageOwed", a, 100), true); assert.equal(pass("wageOwed", b, 101), true);
  assert.equal(pass("wageOwed", a, 100 + WAGE_GAP - 1), false); assert.equal(pass("wageOwed", a, 100 + WAGE_GAP), true);
  assert.equal(pass("vaultShort", {}, 0), true); assert.equal(pass("vaultShort", {}, 0), true, "규칙 없는 알림은 그대로(사태마다 한 번은 world가 거름)");
  assert.equal(pass("fee", {}, 0), false, "표에 없는 것은 안 띄움");
});

test("묶음 글: 품삯은 마리 수와 합계, 코코아·옷은 마리 수", () => {
  assert.equal(batchText("wagePaid", [{ n: 4 }, { n: 4 }, { n: 2 }]).text, "갈매미 3마리가 밀린 품삯 🪙10을 받았어요");
  assert.match(batchText("cocoa", [{}, {}]).text, /2마리.*코코아/);
  assert.match(batchText("dress", [{}, {}, {}]).text, /3마리.*옷/);
});

test("한 줄에 일 하나: 덧말(길안내·조언·금고 잔액) 없이 소식 문장만 · 감기 조언은 한 번만", () => {
  const w = World.create(7, seededRandom(3), { wild: true }); w.summon(); const u = w.units[0];
  w.spawnSparkles(); const s = w.sparkles[0]; let line = null; w.on("sparkle", e => { line = alertLine("sparkle", e, w); });
  assert.ok(s, "반짝이가 생김"); w.pickSparkle(s.id);
  assert.match(line, /^✨ .+ 주웠어요$/);
  const sick = alertLine("sick", { u, first: true }, w); assert.equal((sick.match(/나아요/g) || []).length, 1, sick);
  assert.doesNotMatch(alertLine("summonBlocked", w.summonInfo(), w), /📱/);
  for (const ev of Object.keys(ALERTS)) { assert.equal(typeof ALERTS[ev].kind, "string", ev); assert.equal(ALERTS[ev].tail, undefined, ev); }
  assert.equal(newsFor("fee", { b: { defId: "house" }, fee: 10 }, w).weight, 0, "설계비는 소식지에도 안 실림(알림 줄은 tools 상태 줄)");
  assert.ok(newsFor("tax", { total: 5, n: 1 }, w).weight > 0 && newsFor("lodging", { total: 2, n: 1 }, w).weight > 0, "세금·숙박비 영수증은 소식지에");
  assert.equal(newsFor("tax", { total: 0, n: 0 }, w), null, "세금 0이면 소식 없음");
});

test("조용히 넘김: 날씨는 폭풍·눈만 · 해변 줍기는 마을에서 처음 주운 물건만(저장해도 기억)", () => {
  for (const k of ["clear", "cloudy", "rain"]) assert.equal(quietAlert("weather", { kind: k }), true, k);
  for (const k of WEATHER_SAY) assert.equal(quietAlert("weather", { kind: k }), false, k);
  assert.equal(quietAlert("beachcomb", { first: true }), false); assert.equal(quietAlert("beachcomb", { first: false }), true);
  const w = World.create(7, seededRandom(3), { wild: true }); w.summon(); w.setSeason("autumn"); const u = w.units[0]; w.rnd = () => 0;
  const got = []; w.on("beachcomb", e => got.push(e.first));
  w.beachcomb(u); w.beachcomb(u); assert.deepEqual(got, [true, false]);
  assert.equal(newsFor("beachcomb", { u, item: { name: "단풍잎 표본" }, first: false }, w).weight, 0, "또 주운 건 소식지에도 안 실림");
  const w2 = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())), seededRandom(4)); assert.equal(w2.beachSeen.maple, 1, "저장·불러오기에도 남음");
  const old = w.serialize(); delete old.beachSeen; assert.deepEqual(World.fromJSON(JSON.parse(JSON.stringify(old)), seededRandom(4)).beachSeen, {}, "예전 저장 → 빈 기록");
});

test("하루 알림 예산 6줄: 이야기 > 관계 > 소원 > 나머지 · 넘치면 지난 알림에만 · 다음 날 다시", () => {
  assert.equal(DAY_LINES, 6);
  assert.equal(alertTier("storySpark"), 0); assert.equal(alertTier("friendship"), 1); assert.equal(alertTier("wish"), 2); assert.equal(alertTier("weather"), 3);
  const take = makeBudget(); const rest = [0, 1, 2, 3, 4, 5].map(i => take("faint", 10 + i));
  assert.deepEqual(rest, [true, true, true, true, false, false], "나머지는 4줄까지(관계·소원 자리를 남김)");
  assert.equal(take("wish", 20), true); assert.equal(take("wish", 21), false, "소원은 5줄까지");
  assert.equal(take("bondStage", 22), true); assert.equal(take("friendship", 23), false, "관계는 6줄까지");
  for (let i = 0; i < 5; i++) assert.equal(take("storyPiece", 30 + i), true, "이야기는 늘 뜸");
  assert.equal(take("faint", 600), true, "다음 날은 처음부터");
  assert.match(MAIN, /makeBudget\(\)/); assert.match(MAIN, /quietAlert\(ev, arg\)/);
});
