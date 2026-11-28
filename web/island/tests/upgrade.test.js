// 건물 업그레이드(일반병원 → 종합병원, def.upgradeTo / upgradeFrom) 시험. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { BUILDINGS } from "../src/data/catalog.js";
import { RANKS, unlockName } from "../src/world/rank.js";
import * as BK from "../src/world/bank.js";
import { upgradeButtonInfo, upgradeAsk, canShowUpgrade, mountUpgrade, hideUpgrade } from "../src/ui/upgradeView.js";

/** 넓은 섬 + 기본 갈매미 + 목수 · 항구 마을 · 바로 완공 끔 */
function town(seed = 21) {
  const w = World.create(7, seededRandom(seed), { wild: true, firstGull: true }); w.isNight = false;
  const doc = w.addUnitByName("목수"); w.rank = 2; w.rankClock = -1e9;
  return { w, u: w.units[0], doc };
}
/** 다 지은 일반병원을 넓힐 자리까지 비어 있는 곳에 놓음 */
function clinicWithRoom(w) {
  const c = w.center;
  for (let r = 4; r < 60; r++) for (let k = 0; k < 48; k++) {
    const a = k / 48 * 6.283, x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + Math.sin(a) * r), q = w.placeBuilding("clinic", x, z, k % 4, null, 1e9);
    if (!q.ok) continue;
    const s = w.upgradeSpot(q.building); if (s && s.extra.every(([ex, ez]) => !w.upgradeBlock(q.building, ex, ez, q.building.elevation ?? 0))) return q.building;
    w.removeBuilding(q.building.id);
  }
  return null;
}

test("규칙: 일반병원(id clinic 그대로)·종합병원(침대 6, 항구 마을, 업그레이드로만) · 설계비 40 · 등급 해금 목록에 '종합병원(일반병원 업그레이드)'", () => {
  const C = BUILDINGS.clinic, H = BUILDINGS.hospital;
  assert.deepEqual([C.name, C.beds, C.rank, C.upgradeTo, C.clinic], ["일반병원", 3, 1, "hospital", true]);
  assert.deepEqual([H.name, H.beds, H.rank, H.upgradeFrom, H.clinic, H.builtBy], ["종합병원", 6, 2, "clinic", true, "carpenter"]);
  assert.deepEqual(H.footprint, { w: 5, d: 4 }); assert.equal(BK.feeOf("hospital"), 40);
  assert.ok(RANKS[2].unlock.includes("hospital")); assert.equal(unlockName("hospital"), "일반병원 → 종합병원"); assert.equal(unlockName("shop"), "잡화점");
  const { w } = town(); const c = w.center, r = w.check("hospital", Math.floor(c.x) + 8, Math.floor(c.z) + 8, 0);
  assert.equal(r.ok, false); assert.match(r.reason, /일반병원을 업그레이드해서 지어요/, "건설 메뉴에서 바로 못 놓음");
});

test("업그레이드 못 함: 업그레이드 길 없음 · 짓는 중 · 등급 · 목수 없음 · 금고 모자람 · 넓힐 칸이 막힘(무엇이 막는지)", () => {
  const { w, doc } = town(); const cl = clinicWithRoom(w); assert.ok(cl, "넓힐 자리가 있는 병원");
  const house = [...w.buildings.values()].find(b => b.defId === "house");
  assert.match(w.upgradeCheck(house).reason, /업그레이드할 수 없는 건물/);
  assert.equal(w.upgradeCheck(cl).ok, true, w.upgradeCheck(cl).reason);
  cl.hits = 0; assert.match(w.upgradeCheck(cl).reason, /일반병원을 다 지은 뒤에/); cl.hits = cl.need;
  w.rank = 1; assert.match(w.upgradeCheck(cl).reason, /⚓ 항구 마을이 되면 업그레이드할 수 있어요/); w.rank = 2;
  doc.job = "fisher"; assert.match(w.upgradeCheck(cl).reason, /목수 갈매미가 있어야/); doc.job = "carpenter";
  const fee = w.upgradeCheck(cl).fee; assert.equal(fee, BK.scaled(40, w.priceMult()), "설계비 40 × 물가");
  w.bank.vault = fee - 1; const r = w.upgradeCheck(cl); assert.equal(r.ok, false); assert.equal(r.reason, BK.feeReason(fee, fee - 1)); w.bank.vault = 500;
  // 넓힐 칸에 벤치 → 그 이름으로 거절, 치우면 다시 됨
  const [ex, ez] = w.upgradeSpot(cl).extra[0]; const bench = w.placeBuilding("bench", ex, ez, 0, null, 1e9);
  assert.ok(bench.ok, bench.reason); const rb = w.upgradeCheck(cl);
  assert.equal(rb.ok, false); assert.match(rb.reason, /옆 칸에 벤치가 있어요\. 종합병원은 5×4칸이라 옆과 뒤로 넓혀요/);
  assert.equal(w.startUpgrade(cl.id).ok, false, "막혀 있으면 시작도 안 됨"); assert.equal(w.buildings.get(cl.id).defId, "clinic"); assert.equal(w.bank.vault, 500, "돈도 그대로");
  w.removeBuilding(bench.building.id); assert.equal(w.upgradeCheck(cl).ok, true);
});

test("업그레이드 시작: 설계비를 금고에서 · 같은 id에 5×4 공사장(문 칸 그대로) · 안의 환자는 나오고 가던 환자는 그만 · 당번 의사는 이어받음 · 공사 중엔 병원 기능 멈춤", () => {
  const { w, u, doc } = town(22); const cl = clinicWithRoom(w); assert.ok(cl);
  w.setDoctor(cl.id, doc.unitId); w.bank.vault = 200;
  const p = w.units.find(o => o !== u && o !== doc) || w.addUnitByName("미니");
  u.sick = { kind: "cold", left: 300, med: false }; u.insideBuildingId = cl.id; u.state = "Inside";
  p.sick = { kind: "cold", left: 300, med: false }; p.state = "GoToBuilding"; p.targetBuildingId = cl.id; p.goFor = "sick";
  const door = { ...cl.door }, oldCells = cl.cells.map(c => c.join(",")), fee = w.upgradeCheck(cl).fee, ev = []; w.on("upgradeStart", e => ev.push(e));
  const res = w.startUpgrade(cl.id); assert.equal(res.ok, true, res.reason);
  const b = w.buildings.get(cl.id); assert.equal(b, res.building); assert.equal(b.defId, "hospital"); assert.equal(b.cells.length, 20); assert.deepEqual(b.door, door);
  assert.ok(oldCells.every(k => b.cells.some(c => c.join(",") === k)), "예전 칸을 모두 덮음"); assert.equal(b.rot, cl.rot);
  assert.equal(w.bank.vault, 200 - fee); assert.equal(b.fee, fee); assert.equal(b.doctor, "목수"); assert.equal(b.upFrom, "clinic");
  assert.equal(w.isDone(b), false); assert.equal(b.need, 3 * BUILDINGS.hospital.work); assert.equal(w.clinics().length, 0, "공사 중엔 병원이 아님");
  assert.equal(u.insideBuildingId, null, "안의 환자는 나옴"); assert.notEqual(p.state, "GoToBuilding", "가던 환자는 그만"); assert.equal(w.canEnter(u, b), false);
  assert.equal(ev.length, 1); assert.equal(w.newsLog.some(n => n.text === `일반병원을 종합병원으로 넓히는 공사를 시작했어요. 설계비 🪙${fee}`), true);
  assert.equal(w.startUpgrade(b.id).ok, false, "공사장은 또 업그레이드 못 함");
  // 공사 중 철거 = 보통 공사 취소처럼 설계비 환불
  const v = w.bank.vault; w.removeBuilding(b.id); assert.equal(w.bank.vault, v + fee);
});

test("다 지으면 종합병원: 침대 6 · upgraded 소식 · 당번 의사 그대로 · 목수가 재료(나무·돌)를 모아 와서 지음", () => {
  const { w, doc } = town(23); const cl = clinicWithRoom(w); assert.ok(cl);
  w.setDoctor(cl.id, doc.unitId); w.bank.vault = 300; w.res.wood = 40; w.res.stone = 40;
  for (const o of w.units) { o.full = 95; o.needs.energy = 95; o.sick = null; }
  const done = []; w.on("upgraded", e => done.push(e));
  assert.ok(w.startUpgrade(cl.id).ok); const b = w.buildings.get(cl.id), w0 = w.res.wood, s0 = w.res.stone;
  for (let t = 0; t < 900 && !w.isDone(b); t += 0.1) { for (const o of w.units) { o.full = 95; o.needs.energy = Math.max(o.needs.energy, 60); } w.update(0.1); }
  assert.ok(w.isDone(b), `다 지음(망치 ${b.hits}/${b.need})`);
  assert.ok(w.res.wood < w0 && w.res.stone < s0, `창고 나무 ${w0}→${w.res.wood} · 돌 ${s0}→${w.res.stone}`);
  assert.equal(done.length, 1); assert.equal(done[0].from, "clinic"); assert.equal(b.upFrom, null);
  assert.equal(w.newsLog.some(n => n.text === "일반병원이 종합병원이 됐어요! 침대 6개"), true);
  assert.deepEqual(w.clinics(), [b]); assert.equal(w.bedsFree(b), 6); assert.equal(b.doctor, "목수"); assert.equal(w.dutyClinic(doc), b);
  assert.equal(w.upgradeCheck(b).ok, false, "종합병원은 더 업그레이드 없음"); assert.equal(canShowUpgrade(b), false);
});

test("⚡ 바로 완공이면 누르자마자 종합병원 · 아픈 갈매미가 종합병원 침대에 누움", () => {
  const { w, u } = town(24); const cl = clinicWithRoom(w); w.instantBuild = true; w.bank.vault = 300;
  const done = []; w.on("upgraded", e => done.push(e));
  const res = w.startUpgrade(cl.id); assert.ok(res.ok, res.reason); const b = res.building;
  assert.ok(w.isDone(b)); assert.equal(b.hits, b.need); assert.equal(done.length, 1);
  u.sick = { kind: "cold", left: 300, med: false }; u.state = "Idle"; u.timer = 0; u.needs.energy = 90; u.coins = 10;
  const visits = []; w.on("clinicVisit", e => visits.push(e));
  for (let t = 0; t < 200 && !visits.length; t += 0.1) { u.full = 90; w.update(0.1); }
  assert.equal(visits.length, 1, "종합병원에 접수"); assert.equal(u.insideBuildingId, b.id);
});

test("저장·불러오기: 업그레이드 공사 중(up)·당번 이어받음 · 불러온 뒤 다 지으면 upgraded · 예전 저장(up 없음)은 보통 공사 · 다 지은 종합병원 침대 6", () => {
  const { w, doc } = town(25); const cl = clinicWithRoom(w); w.setDoctor(cl.id, doc.unitId); w.bank.vault = 300;
  assert.ok(w.startUpgrade(cl.id).ok);
  const j = JSON.parse(JSON.stringify(w.serialize())), s = j.buildings.find(x => x.id === cl.id);
  assert.equal(s.up, "clinic"); assert.equal(s.defId, "hospital"); assert.equal(s.doctor, "목수");
  const back = World.fromJSON(j, seededRandom(1)), bb = back.buildings.get(cl.id);
  assert.deepEqual([bb.defId, bb.upFrom, bb.doctor, back.isDone(bb), bb.cells.length], ["hospital", "clinic", "목수", false, 20]);
  const ev = []; back.on("upgraded", e => ev.push(e)); back.finishAll(); assert.equal(ev.length, 1); assert.equal(back.clinics()[0], bb); assert.equal(back.bedsFree(bb), 6);
  const old = JSON.parse(JSON.stringify(j)); delete old.buildings.find(x => x.id === cl.id).up;
  const ob = World.fromJSON(old, seededRandom(1)); assert.equal(ob.buildings.get(cl.id).upFrom, null);
  const j2 = JSON.parse(JSON.stringify(back.serialize())), s2 = j2.buildings.find(x => x.id === cl.id); assert.equal(s2.up, undefined, "다 지은 뒤엔 up 없음");
  const b2 = World.fromJSON(j2, seededRandom(1)).buildings.get(cl.id); assert.deepEqual([b2.defId, b2.doctor], ["hospital", "목수"]);
});

test("화면 단추(ui/upgradeView.js): 글·꺼짐·사유 · 확인창 글", () => {
  const { w } = town(26); const cl = clinicWithRoom(w); w.bank.vault = 300;
  const house = [...w.buildings.values()].find(b => b.defId === "house"); assert.equal(upgradeButtonInfo(w, house).show, false);
  const fee = w.upgradeCheck(cl).fee, on = upgradeButtonInfo(w, cl);
  assert.deepEqual([on.show, on.disabled, on.text, on.why], [true, false, `🏥 종합병원으로 업그레이드 · 설계비 🪙${fee}`, ""]);
  w.rank = 1; const off = upgradeButtonInfo(w, cl); assert.equal(off.disabled, true); assert.match(off.why, /항구 마을이 되면/); w.rank = 2;
  const ask = upgradeAsk(w, cl); assert.equal(ask.title, "🏥 종합병원으로 업그레이드할까요?");
  assert.match(ask.body, /5×4칸으로 넓혀/); assert.match(ask.body, /침대 3 → 6개/); assert.match(ask.body, new RegExp(`설계비 🪙${fee}을 금고에서`));
});

test("카드 공유(#houseCard): 업그레이드 단추는 .go가 아님(꾸미기 단추를 querySelector(\".go\")로 찾는 hud·powerRange·noPower가 잘못 잡지 않게) · 다른 건물 카드로 쓰면 숨김", () => {
  const { w } = town(27); const cl = clinicWithRoom(w); w.bank.vault = 300;
  // 아주 작은 가짜 DOM: 카드 = [span, .go(꾸미기), .hx]
  const mk = cls => ({ className: cls, hidden: false, textContent: "", disabled: false, setAttribute() {}, nextSibling: null });
  const span = mk("dim"), go = mk("go"), hx = mk("hx ghost"), kids = [span, go, hx];
  const has = (e, c) => e.className.split(" ").includes(c);
  const card = { hidden: false, querySelector: s => kids.find(e => has(e, s.slice(1))) || null, querySelectorAll: s => kids.filter(e => s.split(",").some(q => has(e, q.trim().slice(1)))),
    insertBefore: (e, ref) => { kids.splice(ref ? kids.indexOf(ref) : kids.length, 0, e); } };
  const g0 = globalThis.document; globalThis.document = { createElement: () => mk("") };
  try {
    span.nextSibling = go; mountUpgrade(card, {}, w, cl, span);
    const up = card.querySelector(".upg"); assert.ok(up && !up.hidden, "병원 카드에 단추");
    assert.equal(card.querySelector(".go"), go, ".go는 여전히 꾸미기 단추"); assert.equal(has(up, "go"), false);
    hideUpgrade(card); assert.equal(up.hidden, true, "닫거나 다른 건물 카드로 쓰면 숨김"); assert.equal(card.querySelector(".upgWhy").hidden, true);
  } finally { globalThis.document = g0; }
});
