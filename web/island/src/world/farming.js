// 밭 물주기(순수 계산). 밭 칸마다 촉촉함(p.moisture 0~1)이 있고, 마을 시간이 흐르면 마른다(여름·맑은 날 빨리, 겨울·흐린 날 천천히).
// 비·폭풍이 오면 저절로 젖고, 눈이 오면 조금씩 젖는다. 마른 밭은 죽지 않고 천천히 자랄 뿐(물 준 밭의 1/4 빠르기까지).
// 농부는 물가(바다·연못 옆 칸, 밭에서 WATER_RANGE칸 안)에서 물을 떠(한 번에 CAN_SIZE칸 몫) 마른 밭에 붓는다.
//  · 마을 하루 = 600초(DAY_SECS). 맑은 가을에 다 젖은 밭(1)은 하루면 다 마름(0) → 물 준 빠르기(MOIST_OK 위)는 하루의 0.65쯤 이어짐.
export const DAY_SECS = 600;
export const MOIST_OK = 0.35;          // 이만큼 촉촉하면 제 빠르기로 자람
export const MOIST_SLOW = 0.25;        // 다 말랐을 때(0) 자라는 빠르기 배수
export const WATER_BELOW = 0.45;       // 농부가 이보다 마른 밭에 물을 줌
export const DRY_BELOW = 0.2;          // 이보다 마르면 급함(심기보다 먼저 물주기) · 화면에서 "목말라요" 표시
export const CAN_SIZE = 3;             // 물 한 번 뜨면 밭 3칸
export const WATER_RANGE = 24;         // 밭에서 이 거리(칸) 안의 물가에서만 물을 뜸(멀면 비만 기다림 → 우물·연못 짓기는 다음 일)
export const MOIST_START = 0.6;        // 새 밭(밭을 다 지었을 때) 촉촉함
// 마르는 빠르기(하루에 줄어드는 촉촉함) = 1 × 계절 × 날씨. 비·폭풍·눈은 마르지 않고 젖음(하루에 늘어나는 양)
export const DRY_SEASON = { spring: 1, summer: 1.5, autumn: 0.9, winter: 0.4 };
export const DRY_WEATHER = { clear: 1, cloudy: 0.6, rain: 0, storm: 0, snow: 0 };
export const WET_WEATHER = { rain: 10, storm: 15, snow: 2 };   // 비: 한 시간(마을 하루의 1/10)이면 다 젖음

/** 1초 동안 바뀌는 촉촉함(+ 젖음, − 마름) */
export function moistRate(season, weather) {
  const wet = WET_WEATHER[weather] || 0; if (wet) return wet / DAY_SECS;
  return -(DRY_SEASON[season] ?? 1) * (DRY_WEATHER[weather] ?? 1) / DAY_SECS;
}
/** 촉촉함에 따른 자라는 빠르기 배수: MOIST_OK 이상 1, 다 마르면 MOIST_SLOW(멈추거나 죽지 않음) */
export const waterFactor = m => (m ?? 1) >= MOIST_OK ? 1 : MOIST_SLOW + (1 - MOIST_SLOW) * Math.max(0, m ?? 1) / MOIST_OK;
/** 밭 한 칸의 촉촉함을 dt초만큼 바꿈(0~1). 예전 저장·시험이 넣은 촉촉함 없는 밭은 다 젖은 것으로 침 */
export function stepMoisture(p, dt, season, weather) {
  p.moisture = Math.max(0, Math.min(1, (p.moisture ?? 1) + moistRate(season, weather) * dt));
  return p.moisture;
}
export const needsWater = p => (p.moisture ?? 1) < WATER_BELOW && p.stage !== "ripe";
/** 물을 뜰 수 있는 물가 칸: 걸을 수 있고 건물·문 앞이 아니며 바로 옆(상하좌우)이 걸을 수 없는 물. (x,z)에서 가까운 것부터 r칸 안 */
export function waterEdges(grid, x, z, r = WATER_RANGE) {
  const out = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const cx = x + dx, cz = z + dz, d = Math.hypot(dx, dz); if (d > r || !grid.isWalkable(cx, cz) || grid.get(cx, cz)?.occupiedId || grid.doorOwner(cx, cz)) continue;
    const w = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([ax, az]) => grid.inBounds(cx + ax, cz + az) && grid.isWater(cx + ax, cz + az) && !grid.isWalkable(cx + ax, cz + az));
    if (w) out.push({ x: cx, z: cz, dir: w, d });
  }
  return out.sort((a, b) => a.d - b.d);
}
