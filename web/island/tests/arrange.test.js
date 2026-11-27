// 생각하는 가구 배치(world/arrange.js + furniture.js autoPlace·relayout)
import { test } from "node:test";
import assert from "node:assert/strict";
import * as F from "../src/world/furniture.js";
import * as A from "../src/world/arrange.js";
import { FURNITURE } from "../src/data/catalog.js";

const lcg = s => () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
const shuffle = (a, r) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const W = () => ({ emit() {}, items: {}, units: [] });
const furnish = (def, order) => { const b = { defId: def, interior: {} }, w = W(); let left = 0; for (const id of order) if (!F.autoPlace(w, b, id)) left++; return { b, left }; };
const cellsOf = o => { const s = F.size(o.id, o.rot), out = []; for (let dz = 0; dz < s.d; dz++) for (let dx = 0; dx < s.w; dx++) out.push([o.x + dx, o.z + dz]); return out; };
const WALL = ["bed", "bookshelf", "wardrobe", "oven"];

/** 층 하나가 '생각한 배치'인지: 못 쓰는 가구 없음 · 문·계단이 한 길 · 벽 가구는 벽을 등짐 · 의자는 탁자를 봄 */
function checkLevel(L, tag) {
  const sc = A.arrScan(L);
  assert.equal(sc.bad.size, 0, `${tag}: 앞이 막히거나 못 가는 가구 ${[...sc.bad].map(o => o.id)}`);
  assert.ok(sc.entriesOk, `${tag}: 문·계단 길이 끊김`);
  for (const o of L.furniture) {
    const k = A.arrKind(o.id);
    if (WALL.includes(k)) assert.ok(A.backToWall(L, o), `${tag}: ${o.id} 벽을 등지지 않음`);
    if (k === "chair" && L.furniture.some(t => A.arrKind(t.id) === "table")) {
      const tc = new Set(L.furniture.filter(t => A.arrKind(t.id) === "table").flatMap(cellsOf).map(String));
      assert.ok(A.arrFrontCells(o).some(c => tc.has(String(c))), `${tag}: 의자가 탁자를 안 봄`);
    }
  }
}

test("모든 집 구조 × 갈매미가 사는 차례(+랜덤 12가지): 앞면 막힘 0 · 문에서 모두 감 · 벽 등짐 · 의자→탁자", () => {
  const orders = [["chair", "table", ...F.WANT_ORDER.filter(x => x !== "chair" && x !== "table")], F.WANT_ORDER];
  for (let s = 1; s <= 12; s++) orders.push(shuffle(F.WANT_ORDER, lcg(s * 31)));
  for (const def of Object.keys(F.LAYOUTS)) for (const order of orders) {
    const { b, left } = furnish(def, order);
    if (def !== "house") assert.equal(left, 0, `${def} 다 놓임`);
    F.levels(b).forEach(L => checkLevel(L, `${def}/${L.name}/${order.join(",")}`));
  }
});

test("층 고르기: 침대·옷장은 침실, 오븐은 부엌, 소파는 아래층 · 원룸 침대는 문에서 먼 구석", () => {
  const { b } = furnish("cottage", F.WANT_ORDER), ls = F.levels(b), where = id => ls.findIndex(L => L.furniture.some(o => o.id === id));
  assert.equal(where("bed"), 1); assert.equal(where("wardrobe"), 1); assert.equal(where("oven"), 2); assert.equal(where("sofa"), 0);
  const h = furnish("house", ["bed"]).b, bed = F.levels(h)[0].furniture[0], door = F.doorCell(F.levels(h)[0], F.levels(h)[0].doors[0]);
  assert.ok(Math.min(...cellsOf(bed).map(([x, z]) => Math.abs(x - door[0]) + Math.abs(z - door[1]))) >= 4, "문(왼쪽 아래)에서 먼 구석");
  assert.equal([bed.x === 0, bed.z === 0, bed.x + F.size("bed", bed.rot).w === 5, bed.z + F.size("bed", bed.rot).d === 4].filter(Boolean).length, 2, "두 벽에 닿는 구석");
});

test("결정적: 같은 차례면 같은 배치, 사는 차례가 달라도 다 놓이면 같은 배치(층마다 다시 생각)", () => {
  const a = JSON.stringify(F.levels(furnish("manor", F.WANT_ORDER).b).map(L => L.furniture));
  assert.equal(JSON.stringify(F.levels(furnish("manor", F.WANT_ORDER).b).map(L => L.furniture)), a);
  const pos = b => F.levels(b).map(L => L.furniture.map(o => `${o.id}@${o.x},${o.z},${o.rot}`).sort().join(" "));
  assert.deepEqual(pos(furnish("giantHouse", F.WANT_ORDER).b), pos(furnish("giantHouse", shuffle(F.WANT_ORDER, lcg(5))).b));
});

test("손으로 놓은 가구(hand)는 autoPlace·정리하기가 안 건드림 · 자리가 없으면 false(창고로)", () => {
  const b = { defId: "house", interior: {} }, w = W(), it = F.room(b), L = it.levels[0];
  it.stash.sofa = 1; assert.ok(F.place(w, b, "sofa", 1, 1, 0)); const sofa = L.furniture[0]; assert.equal(sofa.hand, true);
  for (const id of F.WANT_ORDER.filter(x => x !== "sofa")) F.autoPlace(w, b, id);
  assert.deepEqual([sofa.x, sofa.z, sofa.rot], [1, 1, 0], "손으로 놓은 소파 그대로");
  F.relayout(w, b); assert.deepEqual([sofa.x, sofa.z, sofa.rot], [1, 1, 0]);
  const sc = A.arrScan(L); for (const o of L.furniture) if (!o.hand) assert.ok(!sc.bad.has(o), `${o.id}`);
  // 원룸을 꽉 채우면 더는 못 놓음(억지로 안 넣음)
  const full = furnish("house", [...F.WANT_ORDER, "bookshelf", "wardrobe", "sofa", "bookshelf"]);
  assert.ok(full.left >= 1, "자리가 없으면 false"); checkLevel(F.levels(full.b)[0], "꽉 찬 원룸");
});

test("옛 저장(엉망 배치, arrangeV 없음): 처음 열 때 한 번 정리 · 손으로 놓은 것은 그대로 · 갈매미가 쓰던 가구 객체 유지", () => {
  const mess = [["chair", 0, 0], ["table", 1, 0], ["bed", 2, 0], ["plant", 3, 0], ["floorLamp", 4, 0], ["bookshelf", 0, 1], ["sofa", 3, 1], ["wardrobe", 0, 2], ["oven", 4, 2]].map(([id, x, z]) => ({ id, x, z, rot: 0 }));
  const b = { defId: "house", interior: { layoutV: F.LAYOUT_V, stash: {}, levels: [{ ...F.LAYOUTS.house[0], stairs: null, walls: [], doors: F.LAYOUTS.house[0].doors.map(d => ({ ...d })), wallH: 2.4, floor: "wood", wallpaper: "cream", furniture: mess }] } };
  const before = A.arrScan(b.interior.levels[0]); assert.ok(before.bad.size >= 3, `옛 배치는 막힌 가구가 많음(${before.bad.size})`);
  const bed = mess[2]; mess[3].hand = true;
  F.room(b); const L = F.levels(b)[0];
  assert.equal(b.interior.arrangeV, F.ARRANGE_V); assert.deepEqual([mess[3].x, mess[3].z], [3, 0], "손으로 놓은 화분 그대로");
  assert.ok(L.furniture.includes(bed), "같은 침대 객체");
  const sc = A.arrScan(L); assert.equal(sc.bad.size, 0); assert.ok(sc.entriesOk);
  const moved = JSON.stringify(L.furniture); F.room(b); assert.equal(JSON.stringify(F.levels(b)[0].furniture), moved, "한 번만");
});

test("방 안 갈매미 쓰기와 맞음: 책장 앞 칸(서서 읽는 자리)·침대 옆(내려오는 자리)이 비고, 침대 머리(베개 −z)는 벽 쪽", () => {
  for (const def of Object.keys(F.LAYOUTS)) {
    const { b } = furnish(def, F.WANT_ORDER);
    for (const L of F.levels(b)) {
      const sc = A.arrScan(L);
      for (const o of L.furniture) {
        const k = A.arrKind(o.id), f = A.ARR_FRONT[o.rot];
        if (FURNITURE[o.id].use === "read") assert.ok(A.arrFrontCells(o).every(c => sc.walk(...c)), `${def} 책장 앞`);
        if (k === "bed") { const s = F.size(o.id, o.rot), head = [o.x + (f[0] === -1 ? s.w : f[0] === 1 ? -1 : 0), o.z + (f[1] === -1 ? s.d : f[1] === 1 ? -1 : 0)];
          assert.ok(head[0] < 0 || head[1] < 0 || head[0] >= L.w || head[1] >= L.d, `${def} 침대 머리 쪽이 벽`); }
      }
    }
  }
});

test("원룸: 갈매미가 사는 가구 10가지는 어느 차례로 사도 모두 놓임(깔개 전 탁자가 가운데를 막아 스탠드·책장이 창고로 가던 것)", () => {
  for (let s = 1; s <= 40; s++) {
    const order = ["chair", "table", ...shuffle(F.WANT_ORDER.filter(x => x !== "chair" && x !== "table"), lcg(s * 977 + 5))];
    const { b, left } = furnish("house", order);
    assert.equal(left, 0, `원룸 ${order.join(",")}: 못 놓은 가구 ${left}`);
    checkLevel(F.levels(b)[0], `원룸/${order.join(",")}`);
  }
});
