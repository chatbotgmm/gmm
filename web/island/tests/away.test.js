// 다녀온 사이(World.applyAway) · 실제 날짜 쓰다듬기 · 오늘의 첫 인사 시험(three.js 없이)
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import * as N from "../src/world/news.js";
import * as B from "../src/world/bond.js";
import { rewardOf, REWARD_EVENTS } from "../src/ui/rewardFx.js";
import { BUILDINGS } from "../src/data/catalog.js";

const H = 3600000, NOON = new Date("2026-11-28T13:00:00");
const town = () => { const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }); w.setSeason("autumn"); return w; };
const site = (w, defId = "house") => { const c = w.center; for (let r = 4; r < 40; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const x = Math.floor(c.x) + dx, z = Math.floor(c.z) + dz; if (w.check(defId, x, z, 0).ok) return w.placeBuilding(defId, x, z, 0).building; } return null; };
const cash = w => Math.round(w.bank.vault + w.units.reduce((a, u) => a + (u.coins || 0), 0) + [...w.buildings.values()].reduce((a, b) => a + (b.feeHeld ? b.fee || 0 : 0), 0));   // 맡아 둔 설계비(공사가 시작되면 건축가에게)도 셈

test("다녀온 사이 공사: 짓는 갈매미가 해 두고 품삯은 금고에서(새 돈 없음), 금고가 비면 멈추고 밀리지 않음", () => {
  const w = town(), b = site(w); assert.ok(b && !w.isDone(b)); const u = w.units[0]; assert.equal(u.job, "builder");
  const c0 = cash(w), issued0 = w.bank.issued, rnd0 = JSON.stringify([w.rnd(), w.wrnd(), w.sparkRnd()]);
  const v = town(); site(v); v.applyAway(8 * H, seededRandom(5), NOON);
  assert.equal(JSON.stringify([v.rnd(), v.wrnd(), v.sparkRnd()]), rnd0, "마을·날씨·반짝이 난수 순서는 그대로");
  const r = w.applyAway(8 * H, seededRandom(5), NOON);
  assert.ok(w.isDone(b), "8시간이면 작은 집 하나는 다 지음"); assert.deepEqual(r.built.map(x => [x.name, x.done, x.who]), [[BUILDINGS.house.name, true, u.name]]);
  assert.ok(r.money.wages > 0 && r.money.wages % w.wage() === 0); assert.equal(cash(w), c0, "금고 → 갈매미로 옮겨질 뿐"); assert.equal(w.bank.issued, issued0);
  assert.equal(u.wageOwed || 0, 0);
  assert.ok(w.newsLog.some(n => n.text.includes("다 지었어요")), "소식지에도");
  // 금고가 비면 멈춤(품삯이 밀리지 않음)
  const e = town(), eb = site(e); e.bank.vault = 1; const e0 = eb.hits, re = e.applyAway(8 * H, seededRandom(5), NOON);
  assert.equal(eb.hits, e0); assert.equal(re.buildStop, true); assert.equal(e.units[0].wageOwed || 0, 0); assert.equal(e.bank.vault, 1);
  assert.ok(N.awayLetter(re).lines.some(l => l.includes("금고가 모자라")));
  // 10분짜리는 한 바퀴만
  const s = town(), sb = site(s), h0 = sb.hits; s.applyAway(15 * 60000, seededRandom(5), NOON); assert.ok(sb.hits > h0 && sb.hits < sb.need);
});

test("다녀온 사이 세금·숙박비: 규칙대로 갈매미 돈에서 금고로, 밤을 넘겨야 숙박비", () => {
  const w = town(), u = w.units[0]; u.coins = 200; const c0 = cash(w), v0 = w.bank.vault;
  const r = w.applyAway(8 * H, seededRandom(5), NOON);
  assert.equal(r.money.tax, N.awayDuesDays(8) * 8, "하루 8씩 사흘"); assert.equal(w.bank.vault - v0, r.money.tax + r.money.lodging - r.money.wages); assert.equal(cash(w), c0);
  const t = town(); t.units[0].coins = 100; t.units[0].home = null; const r2 = t.applyAway(H, seededRandom(5), NOON);
  assert.equal(r2.money.lodging, 0, "낮 12시 → 13시: 밤을 안 넘김");
  const r3 = t.applyAway(8 * H, seededRandom(5), new Date("2026-11-29T09:00:00")); assert.equal(r3.money.lodging, BUILDINGS.house ? 2 : 0, "어젯밤 빈 집에서 잠");
  const r4 = t.applyAway(8 * H, seededRandom(5), new Date("2026-11-29T09:30:00")); assert.equal(r4.money.lodging, 0, "같은 밤은 한 번만");
});

test("문 앞 선물: 은행 문 둘레에 2~4개, 같은 저장이면 같은 선물, 한도가 차면 주머니로", () => {
  const mk = () => { const w = town(); return [w, w.applyAway(2 * H, seededRandom(5), NOON)]; };
  const [w, r] = mk(), [, r2] = mk(); assert.equal(r.gifts.length, N.awayGiftCount(2)); assert.deepEqual(r.gifts, r2.gifts);
  const door = w.bankB().door;
  for (const g of r.gifts) { const s = w.sparkles.find(x => x.k === g.k); assert.ok(s && Math.max(Math.abs(s.x - door.x), Math.abs(s.z - door.z)) <= 5); }
  assert.equal(N.awayGiftCount(8), 4); assert.equal(N.awayGiftCount(0.2), 2);
  const f = town(); for (let i = 0; i < 6; i++) f.sparkles.push({ id: 900 + i, k: "shell", x: i, z: 0, t: 100 });
  const p0 = f.items.shell || 0, rf = f.applyAway(8 * H, seededRandom(5), NOON); assert.ok(rf.gifts.every(g => g.pocket)); assert.equal(f.sparkles.length, 6);
  assert.equal(Object.values(f.items).reduce((a, b) => a + b, 0) - p0 - 0 >= rf.gifts.length, true);
  assert.ok(N.awayLetter(rf).lines.some(l => l.includes("주머니에")));
});

test("편지: 한 일을 하나하나 적고, 정말 아무 일 없을 때만 「별일 없이」", () => {
  const w = town(); site(w); const r = w.applyAway(20 * H, seededRandom(5), NOON), L = N.awayLetter(r).lines;
  assert.ok(L.some(l => /🔨 기본이 작은 집을 다 지었어요/.test(l)), L.join("\n")); assert.ok(L.some(l => l.startsWith("🎁 누군가 문 앞에")));
  assert.ok(L.some(l => l.startsWith("🏦 은행 앞에서 기본이 기다려요")), "다 지은 갈매미가 은행 앞에서 자랑");
  assert.ok(!L.some(l => /조용한/.test(l))); assert.ok(L.some(l => /8시간 동안 한 일까지만/.test(l)));
  assert.ok(!L.some(l => /\(|\)/.test(l)), "한 줄 글에 괄호 없음");
  const u = w.units[0]; assert.ok(Math.max(Math.abs(Math.floor(u.x) - w.bankB().door.x), Math.abs(Math.floor(u.z) - w.bankB().door.z)) <= 4, "은행 문 옆에 서 있음");
  assert.ok(N.awayLetter({ ms: H, hours: 1, ripened: 0, catches: [] }).lines.some(l => /조용한/.test(l)));
  assert.ok(!N.awayLetter({ ms: H, hours: 1, ripened: 0, catches: [], gifts: [{ k: "shell", name: "조개껍데기" }] }).lines.some(l => /조용한/.test(l)));
  const part = N.awayLetter({ ms: H, hours: 1, ripened: 0, catches: [], built: [{ who: "목수", name: "시장", from: 0, to: 40, done: false }], money: { tax: 5, lodging: 2, wages: 4 } }).lines;
  assert.ok(part.includes("🔨 목수가 시장 공사를 0%에서 40%까지 해 뒀어요.")); assert.ok(part.includes("🏦 금고에 🪙+7 들어왔어요. 세금과 숙박비예요.")); assert.ok(part.includes("🔨 품삯으로 금고에서 🪙4 나갔어요."));
});

test("쓰다듬기는 실제 날짜로 하루 5번: 마을 날이 바뀌어도 그대로, 날짜가 바뀌면 다시 · 저장해도 그대로", () => {
  assert.equal(B.PET_DAILY, 5);
  const w = town(), u = w.units[0]; u.insideBuildingId = null; w.setDay("2026-11-28");
  for (let i = 0; i < 5; i++) assert.equal(w.pet(u).ok, true); assert.equal(w.pet(u).reason, "cap");
  w.time += N.NEWS_DAY_SECS * 3; assert.equal(w.pet(u).ok, false, "켜 두고 마을 하루가 지나도 그대로");
  const w2 = World.fromJSON(JSON.parse(JSON.stringify(w.serialize(1))), seededRandom(1)), u2 = w2.units[0]; u2.insideBuildingId = null; w2.setDay("2026-11-28");
  assert.equal(u2.petDay, "2026-11-28"); assert.equal(w2.pet(u2).ok, false, "불러와도 오늘은 다 씀");
  w.setDay("2026-11-29"); assert.equal(w.pet(u).ok, true, "다음 날은 다시");
  assert.equal(B.petsLeft({ petDay: 3, petN: 2 }, "2026-11-29"), 5, "예전 저장의 마을 날짜는 새 날로 봄");
});

test("오늘의 첫 인사: 실제 날짜마다 한 번, 같은 날·같은 섬이면 같은 갈매미와 물건, 저장해도 다시 안 줌", () => {
  const w = town(), seen = []; w.on("greet", e => seen.push(e)); const p0 = Object.values(w.items).reduce((a, b) => a + b, 0), rnd0 = JSON.stringify([w.rnd(), w.sparkRnd()]);
  const g = w.greetToday("2026-11-28"); assert.ok(g && g.item && g.item.sparkle); assert.equal(seen.length, 1);
  assert.equal(Object.values(w.items).reduce((a, b) => a + b, 0), p0 + 1); assert.equal(w.greetToday("2026-11-28"), null, "하루 한 번");
  const v = town(); v.greetToday("2026-11-28"); assert.equal(JSON.stringify([v.rnd(), v.sparkRnd()]), rnd0, "마을·반짝이 난수를 쓰지 않음");
  const x = town().greetToday("2026-11-28"); assert.deepEqual([x.u.name, x.item.id, x.say], [g.u.name, g.item.id, g.say]);
  const w2 = World.fromJSON(JSON.parse(JSON.stringify(w.serialize(1))), seededRandom(1)); assert.equal(w2.greetDay, "2026-11-28"); assert.equal(w2.greetToday("2026-11-28"), null);
  assert.ok(w2.greetToday("2026-11-29"), "다음 날은 또");
  assert.equal(World.create(7, seededRandom(3), { wild: true }).greetToday("2026-11-28"), null, "갈매미가 없으면 없음");
  const rw = rewardOf("greet", g, w); assert.equal(rw.tier, "medium"); assert.ok(rw.line.includes("오늘의 첫 인사")); assert.ok(REWARD_EVENTS.includes("greet"));
  assert.ok(!/\(|\)/.test(rw.title + rw.line + g.say));
  const days = new Set(); for (let d = 1; d <= 20; d++) days.add(town().greetToday(`2026-12-${String(d).padStart(2, "0")}`).item.id); assert.ok(days.size >= 3, "날마다 물건이 바뀜");
});
