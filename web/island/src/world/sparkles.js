// ✨ 반짝이(순수 계산: 화면을 모름, 난수는 받아서 씀).
// 마을 하루 두 번 바닷가·마을 땅에 반짝이는 것(조개껍데기·바다 유리·엽서·꽃가지…)이 생기고, 플레이어가 탭해서 주우면 내 주머니(world.items)로.
// 갈매미가 잡은 것(u.stash)과 따로인 플레이어 몫 선물거리. 위치·종류는 마을 난수(world.rnd)가 아닌 따로 굴리는 난수(world.sparkRnd)만 씀
// → 반짝이가 생겨도 다른 일(낚시·날씨·하늘)의 난수 순서가 바뀌지 않음.
import { BUILDINGS, ITEMS } from "../data/catalog.js";
import { GroundType } from "../data/types.js";
import { STORY_WAVE_SECS } from "../data/story.js";

// 빈도(「바닥에 떨어지는 게 너무 잦아」 → 마을 하루 2개): 예전 200초마다 2개(하루 6개)·동시 6개·밤 3개 → 300초마다 1개(하루 2개)·동시 2개·밤 1개.
//  이야기 차례(storyEvent "wave")는 보통 반짝이 회차와 따로 예전처럼 STORY_WAVE_SECS(200초)마다(World.waveClock) → 이야기 빠르기는 그대로
export const SPARKLE_EVERY = 300;   // 마을 시간 300초마다 한 번(마을 하루 600초 → 하루 두 번)
export const SPARKLE_WAVE = 1;      // 한 번에 1개: 바닷가·마을을 회차마다 번갈아(world.sparkNext, 저장됨 — 새 마을은 마을 먼저: 첫 반짝이가 화면 안에)
export const SPARKLE_MAX = 2;       // 지도에 동시에 많아야 2개(꽉 차면 그 회차는 건너뜀)
export const SPARKLE_LIFE = 600;    // 생긴 뒤 마을 하루(600초)가 지나면 사라짐
export const SPARKLE_GAP = 3;       // 다른 반짝이와 3칸 넘게 떨어진 칸만
export const SPARKLE_NEAR = 10;     // "마을" = 다 지은 건물(다리·부두·선착장·계단·밭 빼고) 둘레 10칸 안
export const SPARKLE_FIRST = 20;    // 새 마을·불러온 마을의 첫 반짝이는 20초 뒤(바로 보이게)
export const SPARKLE_PICK_R = 1.2;  // 화면에서 누른 자리에서 이 거리(칸) 안의 반짝이를 주움
export const SPARKLE_WHERE = ["beach", "village"];
/** 새 마을·예전 저장의 첫 회차가 찾는 곳: 마을(건물 둘레 — 처음 보는 화면 안. 바닷가는 대개 40칸 넘게 떨어져 화면 밖) */
export const SPARKLE_FIRST_WHERE = "village";
// 🌙 밤 반짝이(ITEMS의 sparkleTime: "night"): 밤(world.isNight, 기기 시계)에만 생기고, 낮 반짝이는 밤엔 안 생김.
//  · 칸 수 나누기: 낮 반짝이는 SPARKLE_MAX(2)까지, 밤 반짝이는 따로 SPARKLE_NIGHT_MAX(1)까지(서로의 자리를 막지 않음 — 해 질 녘 낮 반짝이가 꽉 차도 밤 반짝이가 생김)
//  · 수명: 밤은 실제로 몇 시간이라 마을 하루(600초)로는 짧음 → SPARKLE_NIGHT_LIFE(마을 사흘). 대신 해가 뜨면 SPARKLE_DAWN_FADE초 안에 옅어지며 사라짐(밤 전용)
//  · 자리: 전기가 들어오는 다 지은 가로등 둘레 SPARKLE_LAMP_R칸을 먼저(가로등 아래에서 깜빡임), 없으면 보통 바닷가·마을 칸
//  · 해가 지면 첫 밤 반짝이는 SPARKLE_FIRST초 뒤(밤에 켜자마자 찾을 게 보이게) · 회차는 낮과 같은 시계(300초마다 1개)
export const SPARKLE_NIGHT_MAX = 1;
export const SPARKLE_NIGHT_LIFE = 1800;
export const SPARKLE_DAWN_FADE = 20;
export const SPARKLE_LAMP_R = 3;
// 🌟 드문 반짝이: 생길 때 SPARKLE_RARE 확률로 바탕 반짝이 대신 ITEMS의 rareOf 물건(색이 다른 조개·이름 있는 엽서…)이 됨.
//  따로 난수를 굴리지 않고 종류를 고른 난수 한 번의 나머지(r × 종류 수의 소수 부분, 종류와 상관없이 고르게 0~1)로 정함
//  → 반짝이 난수(world.sparkRnd)의 순서·자리·종류가 예전과 똑같음. 지도에는 { k: 바탕 id, rare: true }로 두고 주울 때 드문 물건으로 바꿈
//  확률: 하루 6개 × 5%(하루 0.3개)였던 것을 반짝이를 하루 2개로 줄이며 15%로 → 하루에 만나는 드문 반짝이 수(0.3개)는 그대로
export const SPARKLE_RARE = 0.15;
const RARE_OF = Object.fromEntries(ITEMS.filter(i => i.rareOf).map(i => [i.rareOf, i]));
/** 이 반짝이(바탕 id)의 드문 모습(ITEMS 줄) 또는 null */
export const rareSparkleOf = k => RARE_OF[k] || null;
const NIGHT_IDS = new Set(ITEMS.filter(i => i.sparkle && i.sparkleTime === "night").map(i => i.id));
/** 밤 반짝이인가(반짝이 { k } 또는 물건 id) */
export const isNightSparkle = s => NIGHT_IDS.has(typeof s === "string" ? s : s?.k);
/** 반짝이 수명 상한(초): 밤 반짝이는 SPARKLE_NIGHT_LIFE, 낮 반짝이는 SPARKLE_LIFE */
export const sparkleLife = k => isNightSparkle(k) ? SPARKLE_NIGHT_LIFE : SPARKLE_LIFE;
/** 이번 회차에 더 생길 수 있는 수: 낮엔 낮 반짝이끼리 SPARKLE_MAX, 밤엔 밤 반짝이끼리 SPARKLE_NIGHT_MAX */
export const sparkleRoom = (existing, night = false) => night ? SPARKLE_NIGHT_MAX - existing.filter(isNightSparkle).length : SPARKLE_MAX - existing.filter(s => !isNightSparkle(s)).length;

/** 반짝이 난수의 씨앗: 섬 씨앗 + 저장된 마을 시간(하늘 난수 skySeed와 같은 방식, 다른 수를 섞어 다른 순서) */
export const sparkleSeed = (seed, time = 0) => ((+seed || 0) * 15485863 + 977 + Math.floor(+time || 0) * 104723) >>> 0;
/** 그 곳·계절·낮밤에 생기는 반짝이 종류(ITEMS 줄). 계절을 모르면(시험) 여름으로 봄 · night: 밤 반짝이만(아니면 낮 반짝이만) */
export function sparkleKinds(where, season, night = false) {
  const s = season || "summer";
  return ITEMS.filter(i => i.sparkle === where && (!i.sparkleSeason || i.sparkleSeason === s) && (i.sparkleTime === "night") === !!night);
}
/** 반짝이를 둘 수 있는 칸인가(곳은 따지지 않음): 땅·걸을 수 있음·비어 있음(건물·모듈·나무 없음)·밭·문 앞이 아님 */
export function sparkleCellFree(world, x, z) {
  const g = world.grid, c = g.get(x, z);
  return !!c && !g.isWater(x, z) && !c.occupiedId && g.isWalkable(x, z) && !world.isPlot(x, z) && g.doorOwner(x, z) == null;
}
const villageCore = (world, b) => { const d = BUILDINGS[b.defId]; return !!d && world.isDone(b) && !b.ramp && !d.stairs && !d.bridge && !d.pier && !d.dock && !d.field; };
/** 반짝이 후보 칸: { beach: [[x,z]], village: [[x,z]], lamp: { beach, village } } (바닷가 = 모래, 마을 = 모래가 아니고 건물 둘레 SPARKLE_NEAR칸 안,
 *  lamp = 그중 전기가 들어오는 다 지은 가로등에서 SPARKLE_LAMP_R칸 안 — 밤 반짝이가 먼저 고르는 칸) */
export function sparkleCells(world) {
  const g = world.grid, near = new Set(), lit = new Set(), out = { beach: [], village: [], lamp: { beach: [], village: [] } };   // 칸 번호 모음(끝없는 세계라 상자 배열 대신)
  for (const b of world.buildings.values()) {
    if (b.defId !== "streetlamp" || !world.isDone(b) || !world.powered?.(b)) continue;
    for (const [bx, bz] of b.cells) for (let z = bz - SPARKLE_LAMP_R; z <= bz + SPARKLE_LAMP_R; z++) for (let x = bx - SPARKLE_LAMP_R; x <= bx + SPARKLE_LAMP_R; x++) if (g.inBounds(x, z)) lit.add(g.index(x, z));
  }
  for (const b of world.buildings.values()) {
    if (!villageCore(world, b)) continue;
    for (const [bx, bz] of b.cells) for (let z = bz - SPARKLE_NEAR; z <= bz + SPARKLE_NEAR; z++) for (let x = bx - SPARKLE_NEAR; x <= bx + SPARKLE_NEAR; x++) if (g.inBounds(x, z)) near.add(g.index(x, z));
  }
  // 후보 칸: 상주 칸(시작 섬 + 바뀐·지은 청크)을 칸 번호 순서로(같은 섬 → 같은 순서 → 같은 씨앗이면 같은 자리)
  //  마을·가로등 둘레 칸은 상주 청크 밖으로 삐져나와도 넣는다(상주 여부와 상관없이 같은 후보)
  g.unpinStale?.();                                                               // 되돌아간 청크는 상주에서 뺌 → 바닷가 후보 = 지금 칸 상태만의 함수(저장 전후 같음)
  const cand = [], seen = new Set(); g.eachCell((c, x, z) => { if (c.groundType === GroundType.Sand) { const i = g.index(x, z); cand.push(i); seen.add(i); } });
  for (const s of [near, lit]) for (const i of s) if (!seen.has(i)) { seen.add(i); cand.push(i); }
  cand.sort((p, q) => g.zOf(p) - g.zOf(q) || g.xOf(p) - g.xOf(q));
  for (const i of cand) {
    const x = g.xOf(i), z = g.zOf(i), c = g.get(x, z), sand = c.groundType === GroundType.Sand, nr = near.has(i), lt = lit.has(i);
    if (!sand && !nr && !lt) continue;
    if (!sparkleCellFree(world, x, z)) continue;
    const where = sand ? "beach" : "village";
    if (lt) out.lamp[where].push([x, z]);
    if (sand || nr) out[where].push([x, z]);
  }
  return out;
}
const farFrom = (list, x, z) => list.every(s => Math.max(Math.abs(s.x - x), Math.abs(s.z - z)) > SPARKLE_GAP);
/** 한 회차에 생길 반짝이를 고름: [{ k, x, z, where, rare? }]. 하나 고를 때마다 rnd를 딱 두 번(칸·종류) 씀(드문 모습은 종류 난수의 나머지로 — 위 SPARKLE_RARE).
 *  existing: 지금 지도에 있는 반짝이(간격·한도 셈) · cells: sparkleCells 결과 · night: 밤 반짝이를 고름(가로등 둘레 칸 먼저)
 *  first: 이번 회차 첫 반짝이가 먼저 찾는 곳(그다음부터 번갈아, 자리가 없으면 다른 곳). 기본 바닷가 = 예전 차례 */
export function rollSparkles(cells, existing, season, rnd, wave = SPARKLE_WAVE, night = false, first = SPARKLE_WHERE[0]) {
  const out = [], room = Math.min(wave, sparkleRoom(existing, night)), f = Math.max(0, SPARKLE_WHERE.indexOf(first));
  for (let i = 0; i < room; i++) {
    const want = SPARKLE_WHERE[(f + i) % SPARKLE_WHERE.length], places = [want, ...SPARKLE_WHERE.filter(w => w !== want)];
    const order = night ? [...places.map(w => [w, cells.lamp?.[w]]), ...places.map(w => [w, cells[w]])] : places.map(w => [w, cells[w]]);
    for (const [where, list] of order) {
      const kinds = sparkleKinds(where, season, night), taken = existing.concat(out), cands = (list || []).filter(([x, z]) => farFrom(taken, x, z));
      if (!kinds.length || !cands.length) continue;
      const [x, z] = cands[Math.floor(rnd() * cands.length)], rk = rnd() * kinds.length, k = kinds[Math.floor(rk)].id;
      out.push(rk - Math.floor(rk) < SPARKLE_RARE && RARE_OF[k] ? { k, x, z, where, rare: true } : { k, x, z, where }); break;
    }
  }
  return out;
}
/** 다음 회차가 먼저 찾을 곳: 이번에 놓인 마지막 반짝이의 반대쪽(놓인 게 없으면 그대로). made: rollSparkles 결과 */
export const sparkleNextWhere = (made, was) => { const last = made?.length ? made[made.length - 1].where : null; return last ? SPARKLE_WHERE.find(w => w !== last) : (SPARKLE_WHERE.includes(was) ? was : SPARKLE_FIRST_WHERE); };
/** 저장에서 읽은 반짝이(예전 저장엔 없음 → 빈 것): [{ k, x, z, t, rare? }] (저장의 r: 1 = 드문 모습) — 아는 반짝이·정수 칸·0 < t ≤ 수명(sparkleLife)만, 낮 반짝이 많아야 SPARKLE_MAX개 · 밤 반짝이 많아야 SPARKLE_NIGHT_MAX개.
 *  예전 저장(낮 6·밤 3까지)은 불러올 때 새 상한으로 줄임: 드문 반짝이 먼저, 그다음 저장 차례(같은 저장 → 늘 같은 것이 남음). 남은 차례는 저장 차례 그대로 */
export function sparklesFromSave(list) {
  const ok = (Array.isArray(list) ? list : []).filter(s => s && ITEMS.some(i => i.id === s.k && i.sparkle) && Number.isInteger(s.x) && Number.isInteger(s.z) && s.t > 0 && s.t <= sparkleLife(s.k));
  const keep = (xs, n) => xs.map((s, i) => [s, i]).sort((a, b) => (!!(b[0].r && RARE_OF[b[0].k]) - !!(a[0].r && RARE_OF[a[0].k])) || a[1] - b[1]).slice(0, n).map(([s]) => s);   // 드문 것 먼저 · 같으면 저장 차례
  const day = keep(ok.filter(s => !isNightSparkle(s)), SPARKLE_MAX), nite = keep(ok.filter(isNightSparkle), SPARKLE_NIGHT_MAX);
  return ok.filter(s => day.includes(s) || nite.includes(s)).map(s => s.r && RARE_OF[s.k] ? { k: s.k, x: s.x, z: s.z, t: +s.t, rare: true } : { k: s.k, x: s.x, z: s.z, t: +s.t });
}
/** 밤낮이 바뀔 때(World.stepSparkles가 매번 부름): 해가 뜨면 밤 반짝이를 SPARKLE_DAWN_FADE초 안에 사라지게 · 해가 지면 밤 반짝이가 없을 때 첫 회차를 SPARKLE_FIRST초 뒤로.
 *  이야기 차례 시계(world.waveClock)도 예전처럼 함께 당김(예전엔 반짝이 회차 = 이야기 차례였음 → 이야기 빠르기가 예전과 똑같게).
 *  밤을 모르면(world.isNight가 true가 아님: 시험 받침·화면 없음) 낮으로 봄. 돌려주는 값: 지금 밤인가 */
export function sparkleDusk(world) {
  const night = world.isNight === true;
  if (!night) for (const s of world.sparkles) if (isNightSparkle(s) && s.t > SPARKLE_DAWN_FADE) s.t = SPARKLE_DAWN_FADE;
  if (night && world.sparkNight !== true && !world.sparkles.some(isNightSparkle)) {
    world.sparkClock = Math.max(world.sparkClock, SPARKLE_EVERY - SPARKLE_FIRST);
    if (Number.isFinite(world.waveClock)) world.waveClock = Math.max(world.waveClock, STORY_WAVE_SECS - SPARKLE_FIRST);
  }
  world.sparkNight = night; return night;
}
