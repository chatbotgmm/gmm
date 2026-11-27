// 빈 집 손님 숙박비(World.lodge): 집 없는 갈매미가 주인 없는 빈 집에서 자면 마을 하루에 한 번 BK.LODGING_FEE → 금고(가진 만큼, 없으면 무료).
// 같은 날 다시 자도 한 번 · 경제 없는 섬·자기 집은 무료 · 장부 '숙박' 칸(저장 호환) · 하루 합계 소식 한 줄. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { newsDay, NEWS_DAY_SECS, newsFor } from "../src/world/news.js";
import { BUILDINGS } from "../src/data/catalog.js";
import * as BK from "../src/world/bank.js";
import { dayFlow, IN_NAMES } from "../src/ui/bankView.js";

const spare = w => [...w.buildings.values()].find(b => BUILDINGS[b.defId].house && !b.owner);
/** 넓은 섬(경제) + 첫 갈매미(집 없음, 지쳐서 기력 10 → 밤낮과 상관없이 자러 감) · 첫 집은 주인 없음. 밤 */
function isle(seed = 4) {
  const w = World.create(7, seededRandom(seed), { wild: true, firstGull: true }); w.instantBuild = true; w.isNight = true;
  w.units[0].needs.energy = 10;
  return { w, u: w.units[0], h: spare(w) };
}
/** 빈 집에 들어가 잘 때까지 돌림 → 들어간 시각(초) 또는 −1 */
function sleepIn(w, u, h, secs = 120) { for (let t = 0; t < secs; t += 0.1) { u.full = 90; w.update(0.1); if (u.insideBuildingId === h.id && u.insideAct === "sleep") return t; } return -1; }
const nextDay = w => { w.time = newsDay(w.time) * NEWS_DAY_SECS + 1; w.stepBank(); };

test("손님 숙박비: 빈 집에 자러 들어가면 갈매미 돈 −2, 금고 +2, 장부 lodging 칸 · 말풍선", () => {
  const { w, u, h } = isle(); assert.ok(w.economy); assert.equal(u.home, null); assert.ok(h);
  u.coins = 10; const v0 = w.bank.vault;
  assert.ok(sleepIn(w, u, h) >= 0, "빈 집에서 손님으로 잠");
  assert.equal(u.coins, 10 - BK.LODGING_FEE); assert.equal(w.bank.vault - v0, BK.LODGING_FEE);
  const e = w.bank.ledger.at(-1); assert.equal(e.lodging, BK.LODGING_FEE); assert.equal(e.returned, BK.LODGING_FEE);
  assert.equal(u.emoteText, `🏠 숙박비 🪙${BK.LODGING_FEE}`); assert.equal(u.lodgeSay, u.emoteText, "나올 때 다시 보일 말풍선");
  assert.equal(h.owner ?? null, null, "주인이 되지 않음");
});

test("같은 마을 하루에 깼다 다시 자도 한 번만 · 다음 날 다시 자면 또 냄", () => {
  const { w, u, h } = isle(); u.coins = 20;
  assert.equal(w.lodge(u, h), 2); assert.equal(w.lodge(u, h), -1, "같은 날 두 번째는 안 걷음"); assert.equal(u.coins, 18);
  assert.equal(w.bank.ledger.at(-1).lodging, 2);
  nextDay(w); assert.equal(w.lodge(u, h), 2, "다음 날은 또"); assert.equal(u.coins, 16);
  // 실제 걸음으로: 들어가 자다 나와서 같은 날 다시 들어가도 한 번
  const g = isle(6); g.u.coins = 20; assert.ok(sleepIn(g.w, g.u, g.h) >= 0);
  g.u.needs.energy = 95;                                                      // 건물 안 잠 초당 +0.12: 95 → 99.5에 약 38초(같은 마을 하루 안에 깨게)
  for (let t = 0; t < 120 && g.u.insideBuildingId; t += 0.1) { g.u.full = 90; g.w.update(0.1); }
  assert.equal(g.u.insideBuildingId ?? null, null, "기력이 가득 차 밤인데도 나옴"); assert.equal(g.u.emoteText, "🏠 숙박비 🪙2", "나올 때 숙박비 말풍선");
  g.u.needs.energy = 10; g.u.state = "Idle"; g.u.timer = 0; assert.ok(sleepIn(g.w, g.u, g.h) >= 0, "다시 지쳐 들어가 잠");
  assert.equal(newsDay(g.w.time), 1); assert.equal(g.u.coins, 18, "같은 날이라 한 번만");
});

test("돈이 모자라면 가진 만큼, 0이면 공짜로 재우고 말풍선", () => {
  const { w, u, h } = isle(); const v0 = w.bank.vault;
  u.coins = 1; assert.equal(w.lodge(u, h), 1); assert.equal(u.coins, 0); assert.equal(w.bank.vault - v0, 1);
  nextDay(w); const v1 = w.bank.vault;
  assert.equal(w.lodge(u, h), 0); assert.equal(u.coins, 0); assert.equal(w.bank.vault, v1, "금고 그대로");
  assert.match(u.emoteText, /재워 준대요/);
  u.coins = 0.7; nextDay(w); assert.equal(w.lodge(u, h), 0, "소수 조개는 버림(진료비와 같음)"); assert.equal(u.coins, 0.7);
});

test("무료: 경제 없는 섬 · 자기 집 · 주인 있는 집 · 집이 아닌 건물", () => {
  const old = World.create(3, seededRandom(3), {}); assert.equal(old.economy, false);
  const ou = old.units[0], oh = spare(old); ou.coins = 30; assert.equal(old.lodge(ou, oh), -1); assert.equal(ou.coins, 30);
  const { w, u, h } = isle(); u.coins = 30; const v0 = w.bank.vault;
  h.owner = u.unitId; u.home = h.id; assert.equal(w.lodge(u, h), -1, "자기 집");
  const o = w.addUnitByName("미니") || w.units.at(-1); h.owner = u.unitId; o.coins = 30; assert.equal(w.lodge(o, h), -1, "남의 집(주인 있음)");
  assert.equal(w.bank.vault, v0); assert.equal(u.coins, 30);
  // 실제 걸음으로: 자기 집에서 자면 안 걷음
  const g = isle(5); g.h.owner = g.u.unitId; g.u.home = g.h.id; g.u.coins = 30; const gv = g.w.bank.vault;
  assert.ok(sleepIn(g.w, g.u, g.h) >= 0, "자기 집에서 잠"); assert.equal(g.u.coins, 30); assert.equal(g.w.bank.vault, gv); assert.equal(g.w.bank.ledger.at(-1)?.lodging || 0, 0);
});

test("장부·은행 앱·저장: '숙박' 칸이 돌아온 돈 내역에 · 저장/불러오기 그대로 · 예전 저장은 0 · lodgeDay도 저장", () => {
  const { w, u, h } = isle(); u.coins = 10; w.lodge(u, h);
  const f = dayFlow(w.bank.ledger.at(-1)); assert.ok(f.inRows.some(([k, v]) => k === IN_NAMES.lodging && v === 2), JSON.stringify(f.inRows));
  assert.ok(!f.inRows.some(([k, v]) => k === IN_NAMES.other && v > 0), "'그 밖'으로 새지 않음");
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())));
  assert.equal(back.bank.ledger.at(-1).lodging, 2); assert.equal(back.units[0].lodgeDay, newsDay(w.time));
  assert.equal(back.lodge(back.units[0], spare(back)), -1, "불러온 뒤 같은 날 다시 안 걷음");
  assert.equal(BK.bankFromSave({ ledger: [{ day: 2, returned: 9, clinic: 3 }] }).ledger[0].lodging, 0, "예전 장부는 0");
});

test("하루 합계 소식: 날이 바뀔 때 지난 하루 숙박비 한 줄(손님마다 띄우지 않음)", () => {
  const { w, u, h } = isle(); const o = w.addUnitByName("미니") || w.units.at(-1); u.coins = 10; o.coins = 0;
  const got = []; w.on("lodging", a => got.push(a));
  w.lodge(u, h); w.lodge(o, h); assert.equal(got.length, 0, "자러 들어갈 때는 소식 없음");
  nextDay(w); assert.deepEqual(got, [{ total: 2, n: 2, free: 1 }]);
  assert.match(newsFor("lodging", got[0]).text, /숙박비 🪙2.*2마리 · 공짜 1/);
  nextDay(w); assert.equal(got.length, 1, "손님 없는 날은 조용");
  w.lodge(o, h); nextDay(w); assert.equal(got.length, 1, "모두 공짜(들어온 돈 0)인 날도 조용 — 매일 🪙0 줄이 뜨지 않게");
  assert.equal(newsFor("lodging", { total: 0, n: 1, free: 1 }), null);
});
