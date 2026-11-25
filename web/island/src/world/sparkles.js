// ✨ 반짝이(순수 계산: 화면을 모름, 난수는 받아서 씀).
// 하루 몇 번 바닷가·마을 땅에 반짝이는 것(조개껍데기·바다 유리·엽서·꽃가지…)이 생기고, 플레이어가 탭해서 주우면 내 주머니(world.items)로.
// 갈매미가 잡은 것(u.stash)과 따로인 플레이어 몫 선물거리. 위치·종류는 마을 난수(world.rnd)가 아닌 따로 굴리는 난수(world.sparkRnd)만 씀
// → 반짝이가 생겨도 다른 일(낚시·날씨·하늘)의 난수 순서가 바뀌지 않음.
import { BUILDINGS, ITEMS } from "../data/catalog.js";
import { GroundType } from "../data/types.js";

export const SPARKLE_EVERY = 200;   // 마을 시간 200초마다 한 번(마을 하루 600초 → 하루 세 번)
export const SPARKLE_WAVE = 2;      // 한 번에 2개: 바닷가 1 + 마을 1 (한쪽에 자리가 없으면 다른 쪽에 2개)
export const SPARKLE_MAX = 6;       // 지도에 동시에 많아야 6개(꽉 차면 그 회차는 건너뜀)
export const SPARKLE_LIFE = 600;    // 생긴 뒤 마을 하루(600초)가 지나면 사라짐
export const SPARKLE_GAP = 3;       // 다른 반짝이와 3칸 넘게 떨어진 칸만
export const SPARKLE_NEAR = 10;     // "마을" = 다 지은 건물(다리·부두·선착장·계단·밭 빼고) 둘레 10칸 안
export const SPARKLE_FIRST = 20;    // 새 마을·불러온 마을의 첫 반짝이는 20초 뒤(바로 보이게)
export const SPARKLE_PICK_R = 1.2;  // 화면에서 누른 자리에서 이 거리(칸) 안의 반짝이를 주움
export const SPARKLE_WHERE = ["beach", "village"];

/** 반짝이 난수의 씨앗: 섬 씨앗 + 저장된 마을 시간(하늘 난수 skySeed와 같은 방식, 다른 수를 섞어 다른 순서) */
export const sparkleSeed = (seed, time = 0) => ((+seed || 0) * 15485863 + 977 + Math.floor(+time || 0) * 104723) >>> 0;
/** 그 곳·계절에 생기는 반짝이 종류(ITEMS 줄). 계절을 모르면(시험) 여름으로 봄 */
export function sparkleKinds(where, season) {
  const s = season || "summer";
  return ITEMS.filter(i => i.sparkle === where && (!i.sparkleSeason || i.sparkleSeason === s));
}
/** 반짝이를 둘 수 있는 칸인가(곳은 따지지 않음): 땅·걸을 수 있음·비어 있음(건물·모듈·나무 없음)·밭·문 앞이 아님 */
export function sparkleCellFree(world, x, z) {
  const g = world.grid, c = g.get(x, z);
  return !!c && !g.isWater(x, z) && !c.occupiedId && g.isWalkable(x, z) && !world.isPlot(x, z) && g.doorOwner(x, z) == null;
}
const villageCore = (world, b) => { const d = BUILDINGS[b.defId]; return !!d && world.isDone(b) && !b.ramp && !d.stairs && !d.bridge && !d.pier && !d.dock && !d.field; };
/** 반짝이 후보 칸: { beach: [[x,z]], village: [[x,z]] } (바닷가 = 모래, 마을 = 모래가 아니고 건물 둘레 SPARKLE_NEAR칸 안) */
export function sparkleCells(world) {
  const g = world.grid, W = g.w, near = new Uint8Array(W * g.h), out = { beach: [], village: [] };
  for (const b of world.buildings.values()) {
    if (!villageCore(world, b)) continue;
    for (const [bx, bz] of b.cells) for (let z = Math.max(0, bz - SPARKLE_NEAR); z <= Math.min(g.h - 1, bz + SPARKLE_NEAR); z++)
      for (let x = Math.max(0, bx - SPARKLE_NEAR); x <= Math.min(W - 1, bx + SPARKLE_NEAR); x++) near[z * W + x] = 1;
  }
  for (let z = 0; z < g.h; z++) for (let x = 0; x < W; x++) {
    const c = g.cells[z * W + x], sand = c.groundType === GroundType.Sand;
    if (!sand && !near[z * W + x]) continue;
    if (!sparkleCellFree(world, x, z)) continue;
    (sand ? out.beach : out.village).push([x, z]);
  }
  return out;
}
const farFrom = (list, x, z) => list.every(s => Math.max(Math.abs(s.x - x), Math.abs(s.z - z)) > SPARKLE_GAP);
/** 한 회차에 생길 반짝이를 고름: [{ k, x, z, where }]. 하나 고를 때마다 rnd를 딱 두 번(칸·종류) 씀.
 *  existing: 지금 지도에 있는 반짝이(간격·한도 셈) · cells: sparkleCells 결과 */
export function rollSparkles(cells, existing, season, rnd, wave = SPARKLE_WAVE) {
  const out = [], room = Math.min(wave, SPARKLE_MAX - existing.length);
  for (let i = 0; i < room; i++) {
    const want = SPARKLE_WHERE[i % SPARKLE_WHERE.length], order = [want, ...SPARKLE_WHERE.filter(w => w !== want)];
    for (const where of order) {
      const kinds = sparkleKinds(where, season), taken = existing.concat(out), cands = (cells[where] || []).filter(([x, z]) => farFrom(taken, x, z));
      if (!kinds.length || !cands.length) continue;
      const [x, z] = cands[Math.floor(rnd() * cands.length)], k = kinds[Math.floor(rnd() * kinds.length)].id;
      out.push({ k, x, z, where }); break;
    }
  }
  return out;
}
/** 저장에서 읽은 반짝이(예전 저장엔 없음 → 빈 것): [{ k, x, z, t }] — 아는 반짝이·정수 칸·0 < t ≤ SPARKLE_LIFE만, 많아야 SPARKLE_MAX개 */
export function sparklesFromSave(list) {
  return (Array.isArray(list) ? list : []).filter(s => s && ITEMS.some(i => i.id === s.k && i.sparkle) && Number.isInteger(s.x) && Number.isInteger(s.z) && s.t > 0 && s.t <= SPARKLE_LIFE)
    .slice(0, SPARKLE_MAX).map(s => ({ k: s.k, x: s.x, z: s.z, t: +s.t }));
}
