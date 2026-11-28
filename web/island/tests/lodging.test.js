// 빈 집 손님 숙박비(World.lodge): 집 없는 갈매미가 주인 없는 빈 집에서 자면 하룻밤(BK.stayKey)에 한 번 BK.LODGING_FEE → 금고(가진 만큼, 없으면 무료).
// 같은 밤 다시 자도 한 번 · 경제 없는 섬·자기 집은 무료 · 장부 '숙박' 칸(저장 호환) · 아침에 그 밤 합계 소식 한 줄. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { newsFor } from "../src/world/news.js";
import { BUILDINGS } from "../src/data/catalog.js";
import * as BK from "../src/world/bank.js";
import { dayFlow, IN_NAMES } from "../src/ui/bankView.js";

const spare = w => [...w.buildings.values()].find(b => BUILDINGS[b.defId].house && !b.owner);
/** 넓은 섬(경제) + 첫 갈매미(집 없음, 지쳐서 기력 10 → 밤낮과 상관없이 자러 감) · 첫 집은 주인 없음. 2026-11-27 밤 10시(화면 시계 world.clock) */
function isle(seed = 4) {
  const w = World.create(7, seededRandom(seed), { wild: true, firstGull: true }); w.instantBuild = true; at(w, 2026, 11, 27, 22, true);
  w.units[0].needs.energy = 10;
  return { w, u: w.units[0], h: spare(w) };
}
/** 빈 집에 들어가 잘 때까지 돌림 → 들어간 시각(초) 또는 −1 */
function sleepIn(w, u, h, secs = 120) { for (let t = 0; t < secs; t += 0.1) { u.full = 90; w.update(0.1); if (u.insideBuildingId === h.id && u.insideAct === "sleep") return t; } return -1; }
/** 화면 시계를 그 시각으로(달은 1부터) · 밤인지 */
function at(w, y, mo, d, h, night) { w.clock = new Date(y, mo - 1, d, h, 0); w.isNight = night; w.stepLodging(); }
/** 다음 날 아침 7시(밤이 끝남) → 그날 밤 10시 */
function nextNight(w) { const c = w.clock, d = new Date(c.getFullYear(), c.getMonth(), c.getDate() + 1); at(w, d.getFullYear(), d.getMonth() + 1, d.getDate(), 7, false); at(w, d.getFullYear(), d.getMonth() + 1, d.getDate(), 22, true); }

test("손님 숙박비: 빈 집에 자러 들어가면 갈매미 돈 −2, 금고 +2, 장부 lodging 칸 · 말풍선", () => {
  const { w, u, h } = isle(); assert.ok(w.economy); assert.equal(u.home, null); assert.ok(h);
  u.coins = 10; const v0 = w.bank.vault;
  assert.ok(sleepIn(w, u, h) >= 0, "빈 집에서 손님으로 잠");
  assert.equal(u.coins, 10 - BK.LODGING_FEE); assert.equal(w.bank.vault - v0, BK.LODGING_FEE);
  const e = w.bank.ledger.at(-1); assert.equal(e.lodging, BK.LODGING_FEE); assert.equal(e.returned, BK.LODGING_FEE);
  assert.equal(u.lodgeSay, "잘 잤다, 고마워", "나올 때 보일 기분 한마디(평소엔 숫자 없음)");
  const b = isle(); b.w.showNumbers = true; b.u.coins = 10; assert.equal(b.w.lodge(b.u, b.h), BK.LODGING_FEE);
  assert.equal(b.u.emoteText, `🏠 숙박비 🪙${BK.LODGING_FEE}`, "건설 모드에서는 숫자 말풍선"); assert.equal(b.u.lodgeSay, b.u.emoteText);
  assert.equal(h.owner ?? null, null, "주인이 되지 않음");
});

test("같은 밤에 깼다 다시 자도 한 번만 · 다음 밤에 다시 자면 또 냄", () => {
  const { w, u, h } = isle(); u.coins = 20;
  assert.equal(w.lodge(u, h), 2); assert.equal(w.lodge(u, h), -1, "같은 밤 두 번째는 안 걷음"); assert.equal(u.coins, 18);
  at(w, 2026, 11, 28, 3, true); assert.equal(w.lodge(u, h), -1, "자정 넘어 새벽 3시도 같은 밤(키는 밤이 시작된 27일)"); assert.equal(u.lodgeNight, "2026-11-27");
  w.time += 3 * 600; assert.equal(w.lodge(u, h), -1, "마을 하루(600초)가 몇 번 지나도 같은 밤이면 한 번"); assert.equal(u.coins, 18);
  assert.equal(w.bank.ledger.reduce((a, e) => a + (e.lodging || 0), 0), 2);
  nextNight(w); assert.equal(w.lodge(u, h), 2, "다음 밤은 또"); assert.equal(u.coins, 16); assert.equal(u.lodgeNight, "2026-11-29", "새벽 3시(28일)에서 넘긴 다음 밤 = 29일 밤");
  // 실제 걸음으로: 들어가 자다 나와서 같은 밤 다시 들어가도 한 번
  const g = isle(6); g.u.coins = 20; assert.ok(sleepIn(g.w, g.u, g.h) >= 0);
  g.u.needs.energy = 95;                                                      // 건물 안 잠 초당 +0.12: 95 → 99.5에 약 38초
  for (let t = 0; t < 120 && g.u.insideBuildingId; t += 0.1) { g.u.full = 90; g.w.update(0.1); }
  assert.equal(g.u.insideBuildingId ?? null, null, "기력이 가득 차 밤인데도 나옴"); assert.equal(g.u.emoteText, "잘 잤다, 고마워", "나올 때 기분 말풍선");
  g.w.time += 600;                                                           // 마을 하루가 바뀌어도
  g.u.needs.energy = 10; g.u.state = "Idle"; g.u.timer = 0; assert.ok(sleepIn(g.w, g.u, g.h) >= 0, "다시 지쳐 들어가 잠");
  assert.equal(g.u.coins, 18, "같은 밤이라 한 번만");
});

test("하룻밤 키(BK.stayKey): 해 질 녘~다음 아침이 한 밤, 키는 밤이 시작된 날 · 낮잠은 그날 밤과 같은 키 · 달·해 바뀜", () => {
  const k = (y, mo, d, h, n) => BK.stayKey(new Date(y, mo - 1, d, h, 30), n);
  assert.equal(k(2026, 11, 27, 18, true), "2026-11-27"); assert.equal(k(2026, 11, 27, 23, true), "2026-11-27");
  assert.equal(k(2026, 11, 28, 0, true), "2026-11-27"); assert.equal(k(2026, 11, 28, 6, true), "2026-11-27", "새벽은 전날 밤");
  assert.equal(k(2026, 11, 28, 7, false), "2026-11-28", "아침이 되면 새 키");
  assert.equal(k(2026, 11, 28, 14, false), "2026-11-28"); assert.equal(k(2026, 11, 28, 19, true), "2026-11-28", "낮잠 키 = 그날 밤 키");
  assert.equal(k(2026, 12, 1, 2, true), "2026-11-30"); assert.equal(k(2027, 1, 1, 3, true), "2026-12-31");
});

test("낮잠: 그날 낮에 빈 집에서 자면 한 번 내고, 그날 밤엔 또 안 냄(24시간에 최대 한 번) · 야행성 낮잠도 한 번", () => {
  const { w, u, h } = isle(); u.coins = 20;
  at(w, 2026, 11, 28, 14, false); assert.equal(w.lodge(u, h), 2, "낮잠 처음"); assert.equal(w.lodge(u, h), -1);
  at(w, 2026, 11, 28, 21, true); assert.equal(w.lodge(u, h), -1, "같은 날 밤은 이미 낸 셈");
  at(w, 2026, 11, 29, 13, false); assert.equal(w.lodge(u, h), 2, "다음 날 낮잠은 또"); assert.equal(u.coins, 16);
});

test("시간 배수(빨리 감기): 화면 시계가 며칠을 몇 초 만에 지나도 밤마다 한 번 · 시계를 모르면 기기 시계", () => {
  const { w, u, h } = isle(); u.coins = 100; let paid = 0;
  const t0 = new Date(2026, 10, 27, 12, 0).getTime();
  for (let m = 0; m < 5 * 24 * 60; m += 7) {                                  // 7분 걸음(×86400이면 30fps 한 프레임 ≈ 48분 — 그보다 촘촘)
    w.clock = new Date(t0 + m * 60e3); const hh = w.clock.getHours(); w.isNight = hh < 6 || hh >= 18; w.stepLodging();
    if (w.isNight && w.lodge(u, h) > 0) paid++;
  }
  assert.equal(paid, 5, "닷새 밤 = 다섯 번"); assert.equal(u.coins, 90);
  const g = isle(); g.w.clock = null; g.u.coins = 10; assert.equal(g.w.lodge(g.u, g.h), 2); assert.match(g.u.lodgeNight, /^\d{4}-\d\d-\d\d$/);
});

test("돈이 모자라면 가진 만큼, 0이면 공짜로 재우고 말풍선", () => {
  const { w, u, h } = isle(); const v0 = w.bank.vault;
  u.coins = 1; assert.equal(w.lodge(u, h), 1); assert.equal(u.coins, 0); assert.equal(w.bank.vault - v0, 1);
  nextNight(w); const v1 = w.bank.vault;
  assert.equal(w.lodge(u, h), 0); assert.equal(u.coins, 0); assert.equal(w.bank.vault, v1, "금고 그대로");
  assert.match(u.lodgeSay, /공짜로 재워 줬다/);
  u.coins = 0.7; nextNight(w); assert.equal(w.lodge(u, h), 0, "소수 조개는 버림(진료비와 같음)"); assert.equal(u.coins, 0.7);
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

test("장부·은행 앱·저장: '숙박' 칸이 돌아온 돈 내역에 · 저장/불러오기 그대로 · 예전 저장은 0 · lodgeNight도 저장(옛 lodgeDay는 무시)", () => {
  const { w, u, h } = isle(); u.coins = 10; w.lodge(u, h);
  const f = dayFlow(w.bank.ledger.at(-1)); assert.ok(f.inRows.some(([k, v]) => k === IN_NAMES.lodging && v === 2), JSON.stringify(f.inRows));
  assert.ok(!f.inRows.some(([k, v]) => k === IN_NAMES.other && v > 0), "'그 밖'으로 새지 않음");
  const js = JSON.parse(JSON.stringify(w.serialize())), back = World.fromJSON(js); back.clock = w.clock; back.isNight = true;
  assert.equal(back.bank.ledger.at(-1).lodging, 2); assert.equal(back.units[0].lodgeNight, "2026-11-27");
  assert.equal(back.lodge(back.units[0], spare(back)), -1, "불러온 뒤 같은 밤 다시 안 걷음");
  assert.equal(BK.bankFromSave({ ledger: [{ day: 2, returned: 9, clinic: 3 }] }).ledger[0].lodging, 0, "예전 장부는 0");
  delete js.units[0].lodgeNight; js.units[0].lodgeDay = 3; const old = World.fromJSON(js); old.clock = w.clock; old.isNight = true; old.units[0].coins = 10;
  assert.equal(old.units[0].lodgeNight, null, "예전 저장의 lodgeDay(마을 하루 번호)는 버림"); assert.equal(old.lodge(old.units[0], spare(old)), 2);
});

test("합계 소식: 밤이 끝날 때(아침) 그 밤 숙박비 한 줄(손님마다 띄우지 않음, 마을 하루가 바뀌어도 아님)", () => {
  const { w, u, h } = isle(); const o = w.addUnitByName("미니") || w.units.at(-1); u.coins = 10; o.coins = 0;
  const got = []; w.on("lodging", a => got.push(a));
  w.lodge(u, h); w.lodge(o, h); assert.equal(got.length, 0, "자러 들어갈 때는 소식 없음");
  w.time += 600; w.update(0.1); assert.equal(got.length, 0, "마을 하루가 바뀌어도 밤 중엔 조용");
  at(w, 2026, 11, 28, 4, true); assert.equal(got.length, 0, "새벽도 같은 밤");
  at(w, 2026, 11, 28, 7, false); assert.deepEqual(got, [{ total: 2, n: 2, free: 1 }], "아침에 한 번");
  at(w, 2026, 11, 28, 8, false); assert.equal(got.length, 1, "한 번만");
  assert.match(newsFor("lodging", got[0]).text, /지난밤 손님 2마리가 빈 집에 묵고 숙박비 🪙2/);
  nextNight(w); at(w, 2026, 11, 30, 7, false); assert.equal(got.length, 1, "손님 없는 밤은 조용");
  at(w, 2026, 11, 30, 22, true); w.lodge(o, h); at(w, 2026, 12, 1, 7, false); assert.equal(got.length, 1, "모두 공짜(들어온 돈 0)인 밤도 조용 — 매일 🪙0 줄이 뜨지 않게");
  assert.equal(newsFor("lodging", { total: 0, n: 1, free: 1 }), null);
});
