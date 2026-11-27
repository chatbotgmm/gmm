// 편의성 점검 8번(3묶음): 짓기 되돌리기 = 철거 + 설계비 전액 환불(장부까지 놓기 전과 같게) · 철거 확인 글. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { NEWS_DAY_SECS } from "../src/world/news.js";
import * as BK from "../src/world/bank.js";
import { undoBlock, feeUndoLedger } from "../src/world/buildUndo.js";
import { buildUndoText, demolishAsk } from "../src/ui/buildUndoView.js";

const spotFor = (w, d) => {
  const c = w.center, v = w.bank.vault; w.bank.vault = 1e9;
  try { for (let r = 4; r < 60; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + 6 + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; }
  finally { w.bank.vault = v; }
};
const place = (w, d) => { const s = spotFor(w, d); return w.placeBuilding(d, s[0], s[1], 0); };
function town(vault = 100) {
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }); w.instantBuild = true;
  for (const n of ["목수", "미니", "황금"]) w.addUnitByName(n);
  w.bank.vault = 1e6; assert.ok(place(w, "market").ok); w.instantBuild = false;
  Object.assign(w.bank, { vault, fees: 0, ledger: [], low: 0 });
  return w;
}
const money = w => ({ vault: w.bank.vault, fees: w.bank.fees, owed: w.bank.owed, refunds: w.bank.ledger.reduce((n, e) => n + e.refunds, 0), dayFees: w.bank.ledger.reduce((n, e) => n + e.fees, 0) });

test("되돌리기 규칙: 플레이어가 놓았고 망치질·재료 쓰기 전인 공사장만", () => {
  assert.equal(undoBlock(null), "이미 없어요");
  assert.match(undoBlock({ hits: 0 }), /되돌릴 수 없는 건물/, "불러온 건물·주문 공사·업그레이드는 undoable 없음");
  assert.match(undoBlock({ undoable: true, hits: 0 }, true), /다 지어져/);
  assert.match(undoBlock({ undoable: true, hits: 1 }), /공사가 시작돼서/);
  assert.match(undoBlock({ undoable: true, hits: 0, used: true }), /공사가 시작돼서/, "재료를 썼으면 안 됨");
  assert.equal(undoBlock({ undoable: true, hits: 0 }), "");
});

test("장부: 같은 날이면 설계비 칸에서 빼고, 날이 바뀌었으면 오늘 환불 칸에", () => {
  assert.deepEqual(feeUndoLedger(10, 3, 3), { key: "fees", n: -10 });
  assert.deepEqual(feeUndoLedger(10, 3, 4), { key: "refunds", n: 10 });
  assert.deepEqual(feeUndoLedger(10, undefined, 4), { key: "refunds", n: 10 }, "놓은 날을 모르면 환불 칸");
});

test("놓고 바로 되돌리면 금고·설계비 누계·장부가 놓기 전과 똑같음", () => {
  const w = town(100), before = money(w);
  const r = place(w, "house"); assert.ok(r.ok); const b = r.building, fee = b.fee;
  assert.ok(fee > 0); assert.equal(w.bank.vault, 100 - fee); assert.equal(w.bank.ledger.at(-1).fees, fee);
  const u = w.undoBuild(b.id);
  assert.ok(u.ok); assert.equal(u.refund, fee);
  assert.equal(w.buildings.has(b.id), false, "건물은 없어짐");
  assert.equal(w.bank.vault, 100, "금고: 놓기 전 == 되돌린 뒤");
  assert.deepEqual(money(w), before, "금고·설계비 누계·밀린 품삯·장부(설계비·환불 칸) 모두 놓기 전과 같음");
  assert.equal(w.bank.fees, 0); assert.equal(w.bank.ledger.at(-1).fees, 0); assert.equal(w.bank.ledger.at(-1).refunds, 0, "같은 날은 환불 칸이 아니라 설계비 칸에서 뺌");
  assert.equal(w.undoBuild(b.id).ok, false, "한 번만");
  assert.equal(w.bank.vault, 100, "두 번 돌려주지 않음");
});

test("금고가 바닥이 돼 '얼마 안 남음'이 켜져도 되돌리면 다시 참(놓기 전 상태)", () => {
  const w = town(BK.VAULT_LOW + 5); const b = place(w, "house").building;
  assert.ok(b.fee > 5); assert.equal(w.bank.low, 1); w.undoBuild(b.id); assert.equal(w.bank.low, 0); assert.equal(w.bank.vault, BK.VAULT_LOW + 5);
});

test("날이 바뀐 뒤 되돌리면 지난 날 설계비는 그대로, 오늘 칸에 환불 · 금고는 그대로 돌아옴", () => {
  const w = town(100), b = place(w, "house").building, fee = b.fee;
  w.time = NEWS_DAY_SECS + 5; assert.ok(w.undoBuild(b.id).ok);
  assert.deepEqual(w.bank.ledger.map(e => [e.day, e.fees, e.refunds]), [[1, fee, 0], [2, 0, fee]]);
  assert.equal(w.bank.vault, 100); assert.equal(w.bank.fees, 0);
});

test("공사가 시작되면(망치질·재료) 되돌리기는 안 되고 금고도 그대로 · 다 지은 건물·불러온 건물도 안 됨", () => {
  const w = town(100), a = place(w, "house").building;
  a.hits = 1; const r = w.undoBuild(a.id); assert.equal(r.ok, false); assert.match(r.reason, /공사가 시작돼서/); assert.ok(w.buildings.has(a.id)); assert.equal(w.bank.vault, 100 - a.fee);
  const b = place(w, "house").building; b.used = true; assert.equal(w.undoBuild(b.id).ok, false);
  w.instantBuild = true; const c = place(w, "house").building; w.instantBuild = false; assert.equal(w.undoBuild(c.id).ok, false, "⚡ 바로 완공은 다 지은 것");
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize()))), site = [...back.buildings.values()].find(o => !back.isDone(o));
  assert.equal(back.undoBuild(site.id).ok, false, "불러온 공사장은 되돌리기 없음(🧹 철거는 됨)");
});

test("여러 채를 놓고 거꾸로 되돌리면 낸 설계비를 다 합쳐 돌려받고 금고는 처음과 같음", () => {
  const w = town(100), b1 = place(w, "house").building, b2 = place(w, "cottage").building, paid = b1.fee + b2.fee;
  assert.equal(w.bank.vault, 100 - paid);
  const back = [b2, b1].reduce((n, b) => n + w.undoBuild(b.id).refund, 0);
  assert.equal(back, paid); assert.equal(w.bank.vault, 100); assert.equal(w.bank.fees, 0); assert.equal(w.bank.ledger.at(-1).fees, 0);
});

test("글: 되돌린 알림 · 철거 확인", () => {
  assert.equal(buildUndoText({ name: "작은 집", n: 1, refund: 10 }), "↶ 작은 집을 되돌렸어요 · 설계비 🪙10 돌려받음");
  assert.equal(buildUndoText({ name: "다리", n: 2, total: 3, refund: 2, fails: ["공사가 시작돼서 되돌릴 수 없어요"] }), "↶ 다리 2칸을 되돌렸어요 · 설계비 🪙2 돌려받음 · 1칸은 못 되돌렸어요(공사가 시작돼서 되돌릴 수 없어요)");
  assert.equal(buildUndoText({ n: 0, fails: ["다 지어져서 되돌릴 수 없어요"] }), "🚫 다 지어져서 되돌릴 수 없어요");
  const a = demolishAsk({ name: "카페", done: false, fee: 12 });
  assert.equal(a.title, "🧹 카페를 철거할까요?"); assert.match(a.body, /설계비\(🪙12\)는 금고로 돌려받아요/); assert.equal(a.ok, "🧹 철거");
  const h = demolishAsk({ name: "작은 집", done: true, owner: "미니", loan: 8 });
  assert.match(h.body, /되돌릴 수 없어요/); assert.match(h.body, /미니는 집을 잃어요\(남은 빚 🪙8은 없어져요\)/);
});
