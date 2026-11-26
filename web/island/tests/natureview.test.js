// 건설 모드 '🌳 자연·지형' 도구의 글(ui/natureView.js, 순수 — DOM 없이 글만 봄) + 미리보기(dry)가 섬을 바꾸지 않는지
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { NATURE_TOOLS, natureAction, natureToolsFor, natureCard, natureHover, strokeText, undoText, redoText, moveInfo, moveHtml } from "../src/ui/natureView.js";

const fresh = () => World.create(7, seededRandom(3), { wild: true });
/** 나무를 심을 수 있는 잔디 칸 */
const grassSpot = (w, kind = "tree") => { const c = w.center;
  for (let r = 3; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + Math.sin(a) * r);
    if (w.placeNature(kind, x, z, { dry: true }).ok && w.grid.get(x, z).groundType !== "Sand") return [x, z]; }
  return null; };

test("자연 도구: arg → 할 일 · 넓은 섬엔 부두·방파제 카드가 없고 동굴·등대는 있음", () => {
  assert.deepEqual(natureAction("auto"), { kind: "place", what: "auto" });
  assert.deepEqual(natureAction("bush"), { kind: "decor", what: "bush" });
  assert.deepEqual(natureAction("clear"), { kind: "clear" });
  assert.deepEqual(natureAction("dig"), { kind: "dig" });
  assert.deepEqual(natureAction("move:cave"), { kind: "move", what: "cave" });
  const w = fresh(), info = w.customInfo(), args = natureToolsFor(info).map(t => t.arg);
  assert.ok(args.includes("move:cave") && args.includes("move:lighthouse"));
  assert.ok(!args.includes("move:pier") && !args.includes("move:breakwater"), "넓은 섬에는 부두·방파제가 없음");
  assert.equal(new Set(NATURE_TOOLS.map(t => t.arg)).size, NATURE_TOOLS.length);
});

test("카드 아래 글: 값은 customCost와 같고, 심기는 한도(나무 n/260), 금고보다 비싸면 short", () => {
  const w = fresh(), info = w.customInfo();
  for (const t of natureToolsFor(info)) {
    const m = natureCard(t, info), want = t.op === "dig" || t.op === "fill" ? w.customCost(t.op) : w.customCost(t.op, t.kind);
    assert.equal(m.cost, want, t.arg); if (!m.off) assert.ok(m.meta.startsWith(`🪙${want}`), `${t.arg}: ${m.meta}`);
  }
  assert.equal(natureCard(NATURE_TOOLS[0], info).meta, `🪙2 · ${w.trees.length}/260`);
  w.bank.vault = 3; const poor = w.customInfo();
  assert.equal(natureCard(NATURE_TOOLS.find(t => t.arg === "ore"), poor).short, true, "광석 4 > 금고 3");
  assert.equal(natureCard(NATURE_TOOLS.find(t => t.arg === "bush"), poor).short, false);
  const pier = natureCard(NATURE_TOOLS.find(t => t.arg === "move:pier"), info); assert.equal(pier.off, true); assert.equal(pier.meta, "이 섬에는 없어요");
});

test("미리보기(dry)는 섬을 바꾸지 않음: grid.version·금고·나무 수 그대로, 상태 줄은 '나무 심기 · 🪙2 · 금고 60 → 58'", () => {
  const w = fresh(), [x, z] = grassSpot(w), v0 = w.grid.version, n0 = w.trees.length, vault = w.bank.vault;
  const r = w.placeNature("auto", x, z, { dry: true });
  assert.ok(r.ok); assert.equal(w.grid.version, v0); assert.equal(w.trees.length, n0); assert.equal(w.bank.vault, vault);
  assert.equal(natureHover("auto", r, vault), `🌳 나무 심기 · 🪙2 · 금고 🪙${vault} → 🪙${vault - 2}`);
  const d = w.digCells([[x, z], [x + 1, z]], { dry: true }); assert.equal(w.grid.version, v0, "파기 미리보기도");
  assert.match(natureHover("dig", d, vault), /🕳 \d칸 파기 · 🪙\d/);
  const cave = w.landmark("cave"), m = w.moveLandmark("cave", cave.cells[0][0] + 1, cave.cells[0][1], cave.rot, { dry: true }); assert.equal(w.grid.version, v0, "옮기기 미리보기도");
  assert.equal(natureHover("auto", { ok: false, reason: "물 위에는 심을 수 없어요" }, vault), "🚫 물 위에는 심을 수 없어요");
  void m;
});

test("한 획 요약·되돌리기 글: 받침에 맞는 조사, 값과 남은 금고, 돌려받은 값", () => {
  assert.equal(strokeText("auto", { done: 3, cost: 6, kinds: ["tree", "tree", "tree"] }, 54), "🌳 나무 3그루를 심었어요 · 🪙6 → 금고 🪙54 · ↶ 되돌리기");
  assert.equal(strokeText("auto", { done: 2, cost: 4, kinds: ["palm", "palm"] }, 56), "🌴 야자수 2그루를 심었어요 · 🪙4 → 금고 🪙56 · ↶ 되돌리기");
  assert.equal(strokeText("auto", { done: 2, cost: 4, kinds: ["palm", "tree"] }, 56), "🌳 나무·야자수 2그루를 심었어요 · 🪙4 → 금고 🪙56 · ↶ 되돌리기");
  assert.equal(strokeText("flower", { done: 1, cost: 1 }, 59), "🌸 꽃 1개를 놓았어요 · 🪙1 → 금고 🪙59 · ↶ 되돌리기");
  assert.equal(strokeText("move:cave", { done: 1, cost: 15 }, 45), "🦇 동굴을 옮겼어요 · 🪙15 → 금고 🪙45 · ↶ 되돌리기");
  assert.equal(strokeText("move:lighthouse", { done: 1, cost: 15 }, 45), "🗼 등대를 옮겼어요 · 🪙15 → 금고 🪙45 · ↶ 되돌리기");
  assert.equal(strokeText("dig", { done: 9, cost: 9, fail: "건물 문 앞은 팔 수 없어요" }, 51), "🕳 9칸을 팠어요 · 🪙9 → 금고 🪙51 · 못 한 곳: 건물 문 앞은 팔 수 없어요 · ↶ 되돌리기");
  assert.equal(strokeText("auto", { done: 0, fail: "갈매미가 서 있어요" }, 60), "🚫 갈매미가 서 있어요");
  assert.equal(strokeText("auto", { done: 1, cost: 0, kinds: ["tree"] }, 0, false), "🌳 나무 1그루를 심었어요 · ↶ 되돌리기", "경제가 없는 섬은 값 없이");
  assert.equal(undoText({ n: 1, refund: 2 }), "↶ 되돌렸어요 · 🪙2 돌려받음");
  assert.equal(undoText({ n: 0, fails: ["그사이 바뀌어서 되돌릴 수 없어요"] }), "🚫 그사이 바뀌어서 되돌릴 수 없어요");
  assert.equal(redoText({ n: 3, cost: 6 }), "↷ 다시 했어요(3) · 🪙6");
});

test("화면 흐름 그대로: 심기 → 되돌리기(applyInverse) → 다시하기(같은 일), 금고 60 → 58 → 60 → 58", () => {
  const w = fresh(), [x, z] = grassSpot(w), v = w.bank.vault, n0 = w.trees.length;
  const r = w.placeNature("auto", x, z, {}); assert.ok(r.ok); assert.equal(w.bank.vault, v - 2); assert.equal(w.trees.length, n0 + 1);
  const u = w.applyInverse(r.inverse); assert.ok(u.ok); assert.equal(u.refund, 2); assert.equal(w.bank.vault, v); assert.equal(w.trees.length, n0);
  assert.equal(w.applyInverse(r.inverse).ok, false, "한 번만");
  const again = w.placeNature(r.kind, x, z, {}); assert.ok(again.ok); assert.equal(w.bank.vault, v - 2);
});

test("옮기기 확인창: 값·금고 → 남는 금고, 못 옮기면 까닭, 돈만 모자라면 모자란 만큼", () => {
  const w = fresh(), cave = w.landmark("cave");
  const bad = moveInfo(w, "cave", { ok: false, reason: "지금 자리와 같아요", cost: 15 });
  assert.match(moveHtml(bad), /🚫 못 옮겨요<\/b> · 지금 자리와 같아요/);
  const ok = moveInfo(w, "cave", { ok: true, cost: 15 });
  assert.deepEqual([ok.cost, ok.vault, ok.after], [15, w.bank.vault, w.bank.vault - 15]);
  assert.match(moveHtml(ok), /🦇 동굴 옮기기<\/b> · <span class="cf-nw"><b>🪙15<\/b><\/span>/); assert.match(moveHtml(ok), /↻ 돌리기로 입구 방향/);
  w.bank.vault = 4; const poor = moveInfo(w, "cave", { ok: false, reason: "🏦 금고에 조개가 모자라요", cost: 15, short: true });
  assert.match(moveHtml(poor), /금고가 🪙11 모자라요/);
  void cave;
});
