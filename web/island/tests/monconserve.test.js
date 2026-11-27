// 돈의 합 보존(중앙은행 MON-5 × 편의성·2층집·쓰러짐·숙박비·보상): 돈의 합 M = 금고 + 주머니 + 예금 + 주문 공사 맡긴 돈 + 금고가 맡아 둔 설계비(feesHeld)는
// 🖨 찍어내기(+)와 섬 꾸미기 값(−, payCustom)으로만 바뀜. 밀린 품삯(wageOwed)은 돈이 아니라 금고의 빚이라 M에 넣지 않음(갚을 때 금고 → 주머니).
// 짓기 되돌리기(↶)는 공사가 시작되기 전에만 되므로 설계비가 아직 금고에 맡겨져 있음 → 금고·장부가 놓기 전과 정확히 같음. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { UNITS, BUILDINGS } from "../src/data/catalog.js";
import { NEWS_DAY_SECS } from "../src/world/news.js";
import { findPath } from "../src/world/pathfinding.js";
import { checkPlacement } from "../src/world/placement.js";
import { todayOf } from "../src/ui/bankView.js";

const spotFor = (w, d) => { const c = w.center, bk = w.bankB().door;
  for (let r = 4; r < 50; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + 6 + Math.cos(a) * r), z = Math.floor(c.z + 9 + Math.sin(a) * r), ck = checkPlacement(w.grid, BUILDINGS[d], x, z, 0, w.units); if (ck.ok && findPath(w.grid, bk.x, bk.z, ck.door.x, ck.door.z)) return [x, z]; }
  return null; };
const M = w => w.bank.vault + w.units.reduce((a, u) => a + (u.coins || 0) + (u.saved || 0), 0)
  + [...w.buildings.values()].reduce((a, b) => a + (b.order?.left || 0), 0) + w.feesHeld();

function town() {
  const w = World.create(7, seededRandom(11), { wild: true, firstGull: true }); for (const d of UNITS) w.addUnitByName(d.name);
  w.instantBuild = true; w.bank.vault = 1e6; w.rank = 3;
  for (const d of ["market", "storehouse", "clinic", "cottage", "cottage", "house"]) { const s = spotFor(w, d); assert.ok(s, d); assert.ok(w.placeBuilding(d, s[0], s[1], 0).ok, d); }
  w.instantBuild = false; w.bank.vault = 3000;
  for (const b of w.buildings.values()) if (BUILDINGS[b.defId].house) b.owner = null;
  return w;
}

test("돈의 합: 찍기·짓기·↶ 되돌리기·철거·2층집 같이 살기·쓰러져 병원·숙박비·보상·꾸미기를 섞어 마을 6일 → M은 찍은 돈 − 꾸미기 값만큼만 바뀜", () => {
  const w = town(), m0 = M(w), p0 = w.bank.printed, c0 = w.bank.custom || 0, iss0 = w.bank.issued;
  let adj = 0; const put = (u, k, n) => { adj += n - (u[k] || 0); u[k] = n; };   // 시험 받침으로 넣은·뺀 돈(게임이 만든 돈이 아님)은 따로 셈
  const expect = msg => assert.equal(M(w) - m0 - adj, (w.bank.printed - p0) - ((w.bank.custom || 0) - c0), msg);
  expect("시작");

  // 🖨 찍어내기 100 → 금고 +100(유일한 새 돈)
  const v = w.bank.vault; assert.equal(w.print(100), 100); assert.equal(w.bank.vault, v + 100); assert.equal(M(w) - m0, 100); expect("찍기");

  // 짓기 → ↶ 되돌리기: 설계비는 공사가 시작될 때까지 금고가 맡아 둠 → 되돌리면 금고·장부·갈매미 주머니가 놓기 전과 정확히 같음
  const pocket = () => w.units.map(u => u.coins || 0).join(",");
  const v1 = w.bank.vault, f1 = todayOf(w).fees, k1 = pocket(), s = spotFor(w, "house"), h = w.placeBuilding("house", s[0], s[1], 0).building, fee = h.fee;
  assert.ok(fee > 0 && h.feeHeld && h.undoable); assert.equal(w.bank.vault, v1 - fee); assert.equal(pocket(), k1, "놓기만 해서는 아무 갈매미 주머니도 안 바뀜"); expect("짓기");
  const r = w.undoBuild(h.id); assert.ok(r.ok, r.reason); assert.equal(r.refund, fee);
  assert.equal(w.bank.vault, v1, "금고 정확히 그대로"); assert.equal(todayOf(w).fees, f1, "그날 설계비 칸도 그대로"); assert.equal(pocket(), k1); expect("되돌리기");

  // 짓기 → 첫 망치질(공사 시작 = 건축가에게 설계비) → ↶는 안 됨 → 철거: 그 건축가가 가진 만큼만 되돌려 받음(새 돈 없음)
  const s2 = spotFor(w, "house"), h2 = w.placeBuilding("house", s2[0], s2[1], 0).building, boss = w.units.find(u => u.job === "builder"), bc = boss.coins || 0, hf = h2.fee;
  w.hammer(h2, boss); assert.equal(boss.coins - bc, hf, "공사 시작 → 건축가"); assert.equal(h2.feeTo, boss.name); expect("공사 시작");
  assert.ok(!w.undoBuild(h2.id).ok, "공사가 시작돼서 되돌릴 수 없음");
  put(boss, "coins", 4); const vb = w.bank.vault; w.removeBuilding(h2.id); assert.equal(h2.refunded, Math.min(hf, 4), "가진 만큼만"); assert.equal(w.bank.vault, vb + h2.refunded); expect("철거");

  // 2층집 같이 살기: 주인 ← 같이 살 갈매미(집값 절반) — 옮김. 현금이 모자라면 예금도 씀(집 사기와 같음)
  const [cot, cot2] = [...w.buildings.values()].filter(b => b.defId === "cottage");
  const [own, mate, own2, mate2] = w.units.filter(u => !u.home && w.canFit(u, cot)).slice(0, 4);
  own.home = cot.id; cot.owner = own.unitId; own2.home = cot2.id; cot2.owner = own2.unitId;
  const deal = w.shareDeal(mate, cot); put(mate, "coins", deal.share + 5); put(mate, "saved", 0); const oc = own.coins || 0;
  assert.ok(w.moveIn(mate, cot)); assert.equal(own.coins - oc, deal.share); assert.equal(mate.coins, 5); expect("같이 살기");
  const d2 = w.shareDeal(mate2, cot2); put(mate2, "coins", 1); put(mate2, "saved", d2.share + 3); assert.ok(w.shareDeal(mate2, cot2).ok, "예금 포함");
  assert.ok(w.moveIn(mate2, cot2)); assert.equal(mate2.saved, 0); assert.equal(mate2.coins, 4); expect("예금으로 같이 살기");

  // 쓰러져 병원(진료비 → 금고) · 숙박비(→ 금고): 옮김
  const clinic = [...w.buildings.values()].find(b => b.defId === "clinic"), guest = w.units.find(u => !u.home); put(guest, "coins", 10);
  assert.equal(w.faintCarried(guest, clinic), 3); assert.equal(guest.coins, 7); expect("쓰러져 병원");
  const spare = [...w.buildings.values()].find(b => b.defId === "house" && !b.owner); w.clock = new Date(2026, 10, 27, 22, 0); w.isNight = true;
  assert.equal(w.lodge(guest, spare), 2); expect("숙박비");

  // 보상: 마을 등급·축하 나눠주기(🎁 금고에서) — 새 돈 0
  w.stepRank(); w.giftAll(); expect("보상");
  // 꾸미기 값(−): 금고에서 나가 없어짐
  const mc = M(w); w.payCustom(7); assert.equal(M(w), mc - 7); expect("꾸미기 −7");

  // 마을 6일: 날마다 찍기 50, 이틀마다 짓기(↶ 섞음) — 품삯·장보기·세금·대출·이자·매입·숙박이 저절로 돎
  for (let day = 0; day < 6; day++) {
    w.print(50);
    if (day % 2 === 0) { const q = spotFor(w, "house"), b = q && w.placeBuilding("house", q[0], q[1], 0).building; if (b && day === 2) assert.ok(w.undoBuild(b.id).ok); }
    for (let t = 0; t < NEWS_DAY_SECS; t += 0.1) w.update(0.1);
    expect(`${day + 1}일째`);
  }
  assert.ok(w.bank.wages > 0, "품삯이 실제로 돌았음");
  assert.equal(w.bank.seig, 0); assert.equal(w.bank.retired, 0); assert.equal(w.bank.issued - iss0, w.bank.printed - p0, "새 돈 = 찍은 돈뿐");
});

test("재료를 먼저 쓴 공사(망치질 전)도 공사 시작: 설계비가 건축가에게 감 · 저장/불러오기에 맡아 둔 설계비가 그대로(돈이 사라지지 않음)", () => {
  const w = town(), s = spotFor(w, "house"), h = w.placeBuilding("house", s[0], s[1], 0).building; assert.ok(h.feeHeld);
  const j = JSON.parse(JSON.stringify(w.serialize())), o = World.fromJSON(j, seededRandom(1)), h2 = o.buildings.get(h.id);
  assert.ok(h2.feeHeld, "맡아 둔 설계비 저장"); assert.equal(h2.fee, h.fee); assert.equal(M(o), M(w), "불러와도 돈의 합 그대로");
  const v = o.bank.vault; o.removeBuilding(h2.id); assert.equal(o.bank.vault, v + h.fee, "시작 전 철거는 맡아 둔 설계비 그대로 금고로");
  const boss = w.units.find(u => u.job === "builder"), bc = boss.coins || 0; h.used = true; w.releaseFee(h);
  assert.equal(boss.coins - bc, h.fee); assert.ok(!h.feeHeld);
  const j2 = JSON.parse(JSON.stringify(w.serialize())); assert.equal(j2.buildings.find(b => b.id === h.id).feeTo, boss.name, "받은 갈매미 이름 저장");
});

test("⚡ 바로 완공(finishAll)도 공사 시작: 맡아 둔 설계비가 건축가에게 감 → 다 지은 뒤 철거해도 돈이 사라지지 않음 · 예전 저장(다 지었는데 맡아 둠)은 불러올 때 건축가에게", () => {
  const w = town(), s = spotFor(w, "house"), h = w.placeBuilding("house", s[0], s[1], 0).building, boss = w.units.find(u => u.job === "builder"), bc = boss.coins || 0, m0 = M(w);
  assert.ok(h.feeHeld); w.finishAll(); assert.ok(w.isDone(h)); assert.ok(!h.feeHeld, "완공 = 공사 시작"); assert.equal(boss.coins - bc, h.fee);
  w.removeBuilding(h.id); assert.equal(M(w), m0, "다 지은 건물 철거: 돈의 합 그대로");
  const s2 = spotFor(w, "house"), h2 = w.placeBuilding("house", s2[0], s2[1], 0).building, m1 = M(w);
  const j = JSON.parse(JSON.stringify(w.serialize())), jb = j.buildings.find(b => b.id === h2.id); jb.hits = 1e9; assert.equal(jb.feeHeld, 1);   // 고치기 전 ⚡ 완공으로 생긴 저장
  const o = World.fromJSON(j, seededRandom(1)), o2 = o.buildings.get(h2.id); assert.ok(o.isDone(o2) && !o2.feeHeld, "불러올 때 건축가에게"); assert.equal(M(o), m1);
  o.removeBuilding(o2.id); assert.equal(M(o), m1, "그 뒤 철거해도 그대로");
});
