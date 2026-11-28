// 진짜 마을에서 변신 분포 보기(헤드리스, 결정적): 넓은 섬을 만들고 집·카페·시장·밭을 지어 둔 뒤 🥚 소환을 며칠에 걸쳐 하고,
// 플레이어 버릇(아무것도 안 함 · 쓰다듬기 · 바다/밭/카페에 내려놓기)대로 날마다 손길을 주며 모두 변신할 때까지 돌림.
// node tools/evoworld.mjs [씨앗들=7,23,31] [마리=12] [버릇=mix]   (버릇: mix | none | pet | sea | field | cafe)
import { World } from "../src/world/World.js";
import { BUILDINGS } from "../src/data/catalog.js";
import { checkPlacement } from "../src/world/placement.js";
import { seededRandom } from "../src/util.js";
import { newsDay } from "../src/world/news.js";
import { FORMS } from "../src/world/evolve.js";

const DAY = 600;
/** 은행 둘레 빈 평지에 다 지은 건물 하나(난수 안 씀). 못 놓으면 null */
function placeDone(w, defId, from = 0, hits = 1e9) {
  const bank = w.bankB(), def = BUILDINGS[defId]; if (!bank || !def) return null;
  const cands = [];
  for (let dz = -26; dz <= 26; dz++) for (let dx = -26; dx <= 26; dx++) { const d = Math.hypot(dx, dz); if (d >= from) cands.push([d, bank.x + dx, bank.z + dz]); }
  cands.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  for (const [, x, z] of cands) {
    const r = checkPlacement(w.grid, def, x, z, 0, w.units); if (!r.ok) continue;
    const p = w.placeBuilding(defId, x, z, 0, null, hits); if (!p.ok || !p.building) continue;
    if (hits >= 1e9) p.building.hits = p.building.need; return p.building;
  }
  return null;
}
/** 바다 칸(가까운 물가)에서 걸을 수 있는 땅 한 칸 */
function shoreSpot(w) {
  const c = w.center; let best = null, bd = 1e9;
  for (let dz = -60; dz <= 60; dz += 1) for (let dx = -60; dx <= 60; dx += 1) {
    const x = Math.floor(c.x + dx), z = Math.floor(c.z + dz);
    if (!w.grid.inBounds(x, z) || !w.grid.isWalkable(x, z) || !w.grid.isWater?.(x + 1, z)) continue;
    const d = Math.hypot(dx, dz); if (d < bd) { bd = d; best = { x: x + 0.5, z: z + 0.5 }; }
  }
  return best;
}
/** 플레이어 버릇: 갈매미 k번째에게 날마다 주는 손길 */
const HABITS = ["none", "pet", "sea", "field", "cafe"];
export function habitOf(mode, k) { return mode === "mix" ? HABITS[k % HABITS.length] : mode; }

/** 한 섬 돌리기. 돌려줌 { forms: {모습: 수}, rows: [{ disp, job, habit, form, age }] } */
export function runVillage(seed, n = 12, mode = "mix", { dt = 0.25, maxDays = 30, only = null } = {}) {
  const w = World.create(seed, seededRandom(seed * 7 + 1), { wild: true, firstGull: false });
  w.vault = 1e6; if (w.bank) w.bank.vault = 1e6;
  w.realNow = () => 1 + w.time * 1000;   // 쓰다듬기 쉬는 시간(실제 시간): 헤드리스라 마을 시간을 1배속 실제 시간으로 봄(결정적)
  for (let i = 0; i < n; i++) placeDone(w, "house");
  const cafe = placeDone(w, "cafe", 8), market = placeDone(w, "market", 8), field = placeDone(w, "field", 6);
  const sea = shoreSpot(w), fieldAt = field ? { x: field.door.x + 0.5, z: field.door.z + 1.5 } : null;
  const habit = new Map();
  let made = 0, guard = 0;
  const summonOne = () => { const u = w.summon(); if (u) { habit.set(u.unitId, only ?? habitOf(mode, made)); made++; } return u; };
  while (!w.units.length && guard++ < 3) summonOne();
  // 밤낮은 기기 시계(main.js가 world.isNight를 넣음): 플레이 시간의 1/3쯤은 밤에 켠다고 봄(실제 1시간 중 마지막 20분)
  const stepTo = t => { while (w.time < t) { w.isNight = w.time % 3600 >= 2400; w.update(dt); } };
  const done = new Map();   // 그날 손길을 준 횟수(갈매미마다 하루 TOUCHES번까지: 안에 있거나 바쁘면 다음에 다시 봄)
  const TOUCHES = 2;
  const touch = () => {
    for (const u of w.units) {
      if (u.evo || u.insideBuildingId || u.evoFx || (done.get(u.unitId) || 0) >= TOUCHES || w.time - (u.dropAt ?? -1e9) < 60) continue;
      const h = habit.get(u.unitId);
      if (h === "none") continue;
      if (h === "pet") { if (w.pet(u).ok) done.set(u.unitId, (done.get(u.unitId) || 0) + 1); continue; }   // 쉬는 중이면 다음에 다시 봄
      const at = h === "sea" ? sea : h === "field" ? fieldAt : h === "cafe" && cafe ? { x: cafe.door.x, z: cafe.door.z } : null;
      if (!at || !w.pickUpUnit(u)) continue;
      const r = w.dropUnit(u, Math.floor(at.x), Math.floor(at.z), h === "cafe" ? null : at);
      if (!r.ok && u.state === "Held") w.dropUnit(u, Math.floor(u.x), Math.floor(u.z));
      done.set(u.unitId, (done.get(u.unitId) || 0) + 1);
    }
  };
  // 소환: 하루 두 마리쯤(집 자리가 있는 플레이어가 며칠에 걸쳐 부르는 셈)
  for (let day = 0; day < maxDays; day++) {
    const d0 = newsDay(w.time);
    Object.assign(w.res, { wood: Math.max(w.res.wood || 0, 40), stone: Math.max(w.res.stone || 0, 40), iron: Math.max(w.res.iron || 0, 10) });
    placeDone(w, "house", 10, 0); placeDone(w, day % 2 ? "bench" : "streetlamp", 10, 0); placeDone(w, day % 2 ? "market" : "field", 10, 0);   // 날마다 새 공사 셋(건축가 일 둘 + 목수 일 하나: 플레이어가 마을을 넓혀 감)
    if (made < n) { summonOne(); if (made < n && day % 3 !== 2) summonOne(); }
    // 플레이어 손길: 낮 동안 자주 들여다보고, 밖에 있는 갈매미에게 하루 두 번까지
    done.clear(); for (let at0 = 0.2; at0 < 0.85; at0 += 0.05) { stepTo((d0 + at0) * DAY); touch(); }
    stepTo((d0 + 1) * DAY + 1);
    if (made >= n && w.units.every(u => u.evo)) break;
  }
  const forms = Object.fromEntries(FORMS.map(f => [f, 0])), rows = [];
  for (const u of w.units) { const f = u.evo ? u.evo.to : "(아직)"; forms[f] = (forms[f] || 0) + 1; rows.push({ id: u.unitId, disp: u.disp, job: u.job, habit: habit.get(u.unitId), form: f, age: u.evo ? u.evo.day - u.bornDay : null, growth: u.growth }); }
  return { forms, rows, days: newsDay(w.time) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = (process.argv[2] || "7,23,31").split(",").map(Number), n = +process.argv[3] || 12, mode = process.argv[4] || "mix";
  const tot = {}, all = [];
  for (const s of seeds) {
    const t0 = Date.now(), r = runVillage(s, n, mode); all.push(...r.rows);
    for (const [f, c] of Object.entries(r.forms)) tot[f] = (tot[f] || 0) + c;
    console.log(`seed ${s}: ${r.days}일, ${Date.now() - t0}ms`, JSON.stringify(r.forms));
    if (process.env.ROWS) for (const x of r.rows) console.log("  ", x.disp.padEnd(6), x.job.padEnd(10), String(x.habit).padEnd(6), x.form, "age", x.age, JSON.stringify(Object.fromEntries(Object.entries(x.growth || {}).map(([k, v]) => [k, Math.round(v * 10) / 10]))));
  }
  const N = all.length; console.log(`합계 ${N}마리`);
  for (const f of [...FORMS, "(아직)"]) if (tot[f] != null) console.log(f.padEnd(5), String(tot[f]).padStart(4), (tot[f] / N * 100).toFixed(1) + "%");
  const ages = all.filter(x => x.age != null).map(x => x.age); console.log("변신 나이", Math.min(...ages), "~", Math.max(...ages), "평균", (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1));
}
