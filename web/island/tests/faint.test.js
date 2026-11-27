// 쓰러짐(사용자 결정: "기력이 20이하로 떨어지면 자러가고, 0에 가까워지면 쓰러지고 병원에 감").
// 기력 FAINT_AT(2) 이하 → 그 자리에서 쓰러짐(😵 · 알림 한 줄 · 하던 일·맡은 공사 내려놓음 · 들 수 없음) → FAINT_LIE(6)초 뒤
// 빈 침대가 있는 병원이 있으면 실려 가 침대에서 잠(진료비 가진 만큼), 없으면 그 자리에서 잠. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { BUILDINGS } from "../src/data/catalog.js";
import * as CH from "../src/units/chrono.js";
import * as M from "../src/units/mind.js";
import * as HL from "../src/world/health.js";
import { newsFor } from "../src/world/news.js";
import { alertLine } from "../src/ui/newsAlerts.js";

const placeAt = (w, defId, x0, z0, r0 = 0, r1 = 40) => { for (let r = r0; r < r1; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); const q = w.placeBuilding(defId, x, z, 0, null, 1e9); if (q.ok) return q.building; } return null; };
/** 넓은 섬 + 기본 하나(첫 집은 남의 집 → 잘 곳 없음). clinic: 일반병원(침대 3)을 지어 둠 */
function isle({ clinic = false, seed = 4 } = {}) {
  const w = World.create(7, seededRandom(seed), { wild: true, firstGull: true }); w.instantBuild = true; w.isNight = false;
  for (const b of w.buildings.values()) if (BUILDINGS[b.defId].house) b.owner = 999;
  const u = w.units[0], c = clinic ? placeAt(w, "clinic", u.x + 4, u.z + 4, 2) : null;
  return { w, u, c };
}
/** 나무 베는 동작에 묶어 둠(한 동작이 끝나지 않게) → 기력이 초당 0.55씩 닳음 */
const holdChop = o => { o.state = "Chop"; o.once = { key: "Attack", t: 0, len: 1e9, hit: 1e9, onHit: null, then: null }; };

test("값: 잠 문턱 20 · 쓰러짐 2(잠 문턱의 1/10) · 누워 있는 6초", () => {
  assert.equal(CH.SLEEP_BELOW, 20); assert.equal(CH.FAINT_AT, 2); assert.equal(CH.FAINT_LIE, 6);
  assert.ok(CH.FAINT_AT < CH.SLEEP_BELOW / 5, "쓰러짐은 잠 문턱보다 훨씬 아래(0에 가까움)");
});

test("기력이 2 이하로 떨어지면 그 자리에서 쓰러짐: 😵 · 알림 · 하던 일을 놓고 맡은 공사도 내려놓음 · 누워 있는 동안 들 수 없고 일을 안 맡음", () => {
  const { w, u } = isle(); const seen = []; w.on("faint", e => seen.push(e));
  const site = placeAt(w, "house", u.x + 6, u.z, 3); site.hits = 0; site.busy = u.unitId; u.committed = site.id;   // 맡은 공사
  holdChop(u); u.needs.energy = 3; u.full = 90; const x0 = u.x, z0 = u.z;
  let t = 0; for (; t < 5 && u.state !== "Faint"; t += 0.1) { u.full = 90; w.update(0.1); }
  assert.equal(u.state, "Faint", "쓰러짐"); assert.ok(Math.abs(t - 1 / 0.55) < 0.25, `기력 3 → 2까지 일 1.8초쯤(${t.toFixed(1)}초)`);
  assert.ok(u.needs.energy <= CH.FAINT_AT); assert.equal(u.emoteText, "😵");
  assert.equal(seen.length, 1); assert.equal(seen[0].u, u); assert.equal(seen[0].clinic, false);
  assert.equal(u.committed, null, "맡은 공사를 내려놓음"); assert.equal(site.busy, null, "공사장 찜도 풀림"); assert.equal(u.once, null, "하던 동작 그만");
  assert.equal(w.pickUpUnit(u), false, "쓰러진 갈매미는 들 수 없음");
  for (let k = 0; k < 50; k++) { u.full = 90; w.update(0.1); assert.equal(u.state, "Faint", "6초 동안 누워 있음"); assert.equal(u.committed, null, "누워 있는 동안 공사를 안 맡음"); }
  assert.ok(Math.hypot(u.x - x0, u.z - z0) < 0.6, "그 자리에서");
  const n = newsFor("faint", seen[0], w); assert.match(n.text, /쓰러졌어요/); assert.match(alertLine("faint", seen[0], w), /그 자리에서 자요/);
});

test("병원(빈 침대)이 있으면: 6초 누워 있다 병원으로 실려 가 침대에서 잠 · 진료비 3(가진 만큼, 금고로) · 침대 빠르기 0.16/초로 차서 가득 차면 나옴", () => {
  const { w, u, c } = isle({ clinic: true }); assert.ok(c && w.isDone(c));
  const fx = []; w.on("faint", e => fx.push(e)); const car = []; w.on("faintCarried", e => car.push(e));
  u.coins = 10; const v0 = w.bank.vault; holdChop(u); u.needs.energy = 2.5; u.full = 90;
  let tFaint = -1, tIn = -1; for (let t = 0; t < 20 && tIn < 0; t += 0.1) { u.full = 90; w.update(0.1); if (tFaint < 0 && u.state === "Faint") tFaint = t; if (u.insideBuildingId === c.id) tIn = t; }
  assert.ok(tFaint >= 0 && tIn > tFaint, "쓰러진 뒤 병원에 들어감"); assert.ok(Math.abs(tIn - tFaint - CH.FAINT_LIE) < 0.25, `누워 있던 시간 ${(tIn - tFaint).toFixed(1)}초`);
  assert.equal(fx[0].clinic, true); assert.match(alertLine("faint", fx[0], w), /병원으로 옮겨요/);
  assert.equal(u.insideAct, "sleep"); assert.equal(u.carried, true);
  assert.equal(car.length, 1); assert.equal(car[0].fee, HL.CLINIC_FEE); assert.equal(u.coins, 10 - HL.CLINIC_FEE); assert.equal(w.bank.vault - v0, HL.CLINIC_FEE, "진료비는 금고로");
  assert.match(newsFor("faintCarried", car[0], w).text, /실려 가 누웠어요 · 진료비 🪙3/);
  assert.equal(w.bedsFree(c), BUILDINGS.clinic.beds - 1, "침대 하나를 씀");
  const e0 = u.needs.energy; for (let k = 0; k < 500; k++) { u.full = 90; w.update(0.1); }
  assert.ok(Math.abs(u.needs.energy - e0 - 50 * M.SLEEP_GAIN.bed) < 0.1, `50초에 +${(u.needs.energy - e0).toFixed(2)}(침대 0.16/초)`);
  let out = -1; for (let t = 0; t < 900 && out < 0; t += 0.1) { u.full = 90; w.update(0.1); if (!u.insideBuildingId) out = t; }
  assert.ok(out >= 0, "기력이 가득 차면 나옴"); assert.ok(u.needs.energy >= CH.WAKE_AT - 1, `나올 때 기력 ${u.needs.energy.toFixed(1)}`);
  assert.equal(u.carried, false); assert.equal(w.bedsFree(c), BUILDINGS.clinic.beds, "침대 비움");
  // 돈이 없으면 무료
  const g = isle({ clinic: true, seed: 5 }); g.u.coins = 0; holdChop(g.u); g.u.needs.energy = 2.2; const fee = []; g.w.on("faintCarried", e => fee.push(e.fee));
  for (let t = 0; t < 12 && !fee.length; t += 0.1) { g.u.full = 90; g.w.update(0.1); }
  assert.deepEqual(fee, [0], "조개가 없으면 진료비 0");
});

test("병원이 없거나 침대가 다 찼으면: 6초 누워 있다 그 자리에서 잠(밖 잠) — 기력이 가득 차면 깸", () => {
  { const { w, u } = isle(); holdChop(u); u.needs.energy = 2.2; let slept = -1;
    for (let t = 0; t < 12 && slept < 0; t += 0.1) { u.full = 90; w.update(0.1); if (u.state === "Sleep") slept = t; }
    assert.ok(slept > CH.FAINT_LIE - 0.5, `쓰러졌다가 그 자리에서 잠(${slept.toFixed(1)}초)`); assert.equal(u.insideBuildingId ?? null, null);
    u.needs.energy = 99; let woke = false; for (let t = 0; t < 30 && !woke; t += 0.1) { u.full = 90; w.update(0.1); if (u.state !== "Sleep") woke = true; }
    assert.ok(woke, "가득 차면 깸"); }
  { const { w, u, c } = isle({ clinic: true });
    for (const name of ["목수", "미니", "꽃", "황금", "물방울"].slice(0, BUILDINGS.clinic.beds)) { const o = w.addUnitByName(name); o.sick = HL.newSick(); o.insideBuildingId = c.id; o.state = "Inside"; o.insideAct = "sick"; o.timer = 1e9; c.occupants.push(o.unitId); }
    assert.equal(w.bedsFree(c), 0, "침대가 다 참");
    holdChop(u); u.needs.energy = 2.2; let slept = false; for (let t = 0; t < 12 && !slept; t += 0.1) { u.full = 90; w.update(0.1); for (const o of w.units) if (o !== u) o.full = 90; if (u.state === "Sleep") slept = true; }
    assert.ok(slept, "침대가 없으면 그 자리에서 잠"); assert.equal(u.insideBuildingId ?? null, null); }
});

test("다시 쓰러지려면 기력이 잠 문턱(20) 위로 한 번 올라와야 함 · 건물 안이나 자는 중엔 안 쓰러짐", () => {
  const { w, u } = isle(); let n = 0; w.on("faint", () => n++);
  holdChop(u); u.needs.energy = 2.2;
  for (let t = 0; t < 7; t += 0.1) { u.full = 90; w.update(0.1); }
  assert.equal(n, 1); assert.equal(u.state, "Sleep");
  u.state = "Idle"; u.timer = 999; u.needs.energy = 1; for (let t = 0; t < 2; t += 0.1) { u.full = 90; w.update(0.1); }
  assert.equal(n, 1, "기력이 20 위로 안 올라왔으면 또 안 쓰러짐(배고파 깨서 먹으러 가는 길 등)");
  u.needs.energy = 25; w.update(0.1); u.needs.energy = 1; u.state = "Idle"; u.timer = 999; w.update(0.1);
  assert.equal(n, 2, "20 위로 올라왔다 다시 바닥나면 쓰러짐");
  const g = isle(); let m = 0; g.w.on("faint", () => m++);
  g.u.state = "Sleep"; g.u.timer = 999; g.u.needs.energy = 0.5; for (let t = 0; t < 2; t += 0.1) { g.u.full = 90; g.w.update(0.1); }
  assert.equal(m, 0, "자는 중엔 안 쓰러짐");
});

test("저장 호환: 쓰러진 채 저장해도 새 저장 칸이 없고, 불러오면 보통처럼 다시 움직임", () => {
  const { w, u } = isle(); holdChop(u); u.needs.energy = 2.2;
  for (let t = 0; t < 2 && u.state !== "Faint"; t += 0.1) { u.full = 90; w.update(0.1); }
  assert.equal(u.state, "Faint");
  const save = JSON.parse(JSON.stringify(w.serialize()));
  for (const su of save.units) assert.ok(!Object.keys(su).some(k => /faint|carried/i.test(k)), "새 저장 칸 없음: " + Object.keys(su).join(","));
  const back = World.fromJSON(save); const bu = back.units[0];
  assert.notEqual(bu.state, "Faint"); for (let t = 0; t < 5; t += 0.1) back.update(0.1);
  assert.ok(Number.isFinite(bu.x) && Number.isFinite(bu.needs.energy));
});

test("지치면(기력 20 이하) 하던 일을 한 동작 끝에 멈추고 자러 감 · 아주 배고프지 않으면(포만감 25 이상) 먹기보다 잠부터", async () => {
  const { SLEEP_EAT_FIRST } = await import("../src/units/unitBrain.js");
  assert.equal(SLEEP_EAT_FIRST, CH.SLEEP_HUNGRY + 5);
  { const { w, u } = isle(); holdChop(u); u.once = null; u.workHits = 99; u.needs.energy = 19.5; u.full = 90;
    let sleepy = false; for (let t = 0; t < 2 && !sleepy; t += 0.1) { u.full = 90; w.update(0.1); sleepy = u.state === "Sleep" || (u.state === "GoToBuilding" && u.sleepy); }
    assert.ok(sleepy, "나무 베다 말고 자러 감"); }
  for (const [full, want] of [[30, "sleep"], [15, "eat"]]) {
    const { w, u } = isle(); u.state = "Idle"; u.timer = 0; u.needs.energy = 19.5; u.full = full; u.activity = null;
    let got = null; for (let t = 0; t < 1 && !got; t += 0.1) { u.full = full; w.update(0.1); if (u.activity === "eat") got = "eat"; else if (u.state === "Sleep" || u.sleepy) got = "sleep"; }
    assert.equal(got, want, `포만감 ${full}: ${want === "sleep" ? "잠부터" : "먹기부터"}`);
  }
});

/** 상태가 바뀐 횟수(깜빡임 확인) */
const runCount = (w, u, secs, each = () => {}) => { let prev = u.state, n = 0; for (let t = 0; t < secs; t += 0.1) { each(); w.update(0.1); if (u.state !== prev) { n++; prev = u.state; } } return n; };

test("지친 갈매미가 잠 문턱 20 언저리에서 일 ↔ 멈춤을 되풀이하지 않음(깜빡임 없음): 멈추면 곧장 잠자리로", () => {
  const { w, u } = isle(); u.state = "Wander"; u.timer = 30; u.path = null; u.needs.energy = 20; u.full = 90;
  const n = runCount(w, u, 10, () => { u.full = 90; });
  assert.ok(n <= 3, `10초에 상태 바뀜 ${n}번`); assert.ok(u.state === "Sleep" || u.insideAct === "sleep" || (u.state === "GoToBuilding" && u.sleepy), `잠자리로(${u.state})`);
});

test("맡은 공사가 있어도 지치면 잠부터(공사는 맡은 채) — 공사장 ↔ 멈춤 되풀이 없음", () => {
  const { w, u } = isle(); w.instantBuild = false;
  const site = placeAt(w, "house", u.x + 8, u.z, 4); site.hits = 0; site.busy = u.unitId; u.committed = site.id;
  u.state = "Idle"; u.timer = 0; u.needs.energy = 15; u.full = 90;
  let slept = -1, prev = u.state, n = 0;
  for (let t = 0; t < 30 && slept < 0; t += 0.1) { u.full = 90; w.update(0.1); if (u.state !== prev) { n++; prev = u.state; } if (u.state === "Sleep" || u.insideAct === "sleep") slept = t; }
  assert.ok(slept >= 0, "잠듦"); assert.ok(n <= 4, `상태 바뀜 ${n}번`); assert.equal(u.committed, site.id, "공사는 맡은 채");
});

test("지쳤어도 배가 아주 고프면(포만감 25 아래) 음식 사러 가는 길을 멈추지 않음 — 사서 먹음", () => {
  const { w, u } = isle(); const h = w.addUnitByName("목수");
  h.job = "fisher"; h.inv.fish = 30; h.x = u.x + 6; h.z = u.z;
  u.inv.food = 0; u.inv.fish = 0; u.coins = 50; u.needs.energy = 15; u.full = 22; u.state = "Idle"; u.timer = 0;
  let ate = false, f0 = u.full, n = 0, prev = u.state;
  for (let t = 0; t < 60 && !ate; t += 0.1) { h.state = "Sleep"; h.timer = 1e9; w.update(0.1); if (u.full > f0 + 1) ate = true; f0 = u.full; if (u.state !== prev) { n++; prev = u.state; } }
  assert.ok(ate, "먹음"); assert.ok(n <= 8, `상태 바뀜 ${n}번`);
});
