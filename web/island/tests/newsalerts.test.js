// 알림 줄 표(ui/newsAlerts.js): news.js에 문장이 있는 이벤트가 모두 알림 줄에 연결됐는지 · 거르기(하루 한 번·같은 갈매미 30초) · 묶음 글
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NEWS_EVENTS, newsFor } from "../src/world/news.js";
import { ALERTS, SILENT, WAGE_GAP, batchText, makeGate, alertLine } from "../src/ui/newsAlerts.js";
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
  assert.equal(Object.keys(ALERTS).length, 20, "20개(업그레이드 시작·완료 포함) + 일부러 뺀 2개 = 22개");
  assert.match(MAIN, /Object\.entries\(ALERTS\)/, "main.js가 표를 돌며 연결");
});

test("tax·chill은 마을 하루에 한 번만, wageOwed는 같은 갈매미 30초에 한 번(다른 갈매미는 따로)", () => {
  const pass = makeGate(), a = { u: { unitId: 1 } }, b = { u: { unitId: 2 } };
  assert.equal(pass("tax", {}, 10), true); assert.equal(pass("tax", {}, 500), false); assert.equal(pass("tax", {}, 610), true, "다음 날");
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

test("덧말: 반짝이는 지금 내 주머니 수, 세금은 금고, 병은 의원 유무에 따라", () => {
  const w = World.create(7, seededRandom(3), { wild: true }); w.summon(); const u = w.units[0];
  w.spawnSparkles(); const s = w.sparkles[0]; let line = null; w.on("sparkle", e => { line = alertLine("sparkle", e, w); });
  assert.ok(s, "반짝이가 생김"); w.pickSparkle(s.id);
  assert.match(line, /^✨ .+ 주웠어요 \(🎁 내 주머니 1\)$/);
  assert.match(alertLine("tax", { total: 5, n: 1 }, w), new RegExp(`금고 🪙${Math.floor(w.bank.vault)}$`));
  assert.equal(alertLine("tax", { total: 0, n: 0 }, w), null, "세금 0이면 알림 없음");
  assert.match(alertLine("sick", { u, first: true }, w), /병원이 있으면 빨리 나아요\)$/);
  assert.match(alertLine("summonBlocked", w.summonInfo(), w), /^🥚 .+ · 📱 소환$/);
  for (const ev of Object.keys(ALERTS)) assert.equal(typeof ALERTS[ev].kind, "string", ev);
  assert.equal(newsFor("fee", { b: { defId: "house" }, fee: 10 }, w).weight, 0, "설계비는 소식지에도 안 실림(알림 줄은 tools 상태 줄)");
});
