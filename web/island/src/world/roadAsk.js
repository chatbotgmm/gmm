// 갈매미의 길 부탁(순수 계산 — routeFor만 월드 칸을 읽음). 갈매미는 바닥(땅 종류)을 스스로 바꾸지 않음 — 길은 플레이어가 칠함.
//  · 집이 시장(없으면 은행)과 포장도로로 이어지지 않은 갈매미(상인 말고)는 가끔 말풍선으로 길을 부탁함.
//  · 한 갈매미는 ASK_GAP_MIN~MAX초(마을 시간)에 한 번, 마을 전체로도 ASK_GLOBAL_GAP초에 한 번만 → 다 같이 떠들지 않음.
//  · 부탁마다 깔기 좋은 길(suggestRoute)을 함께 알려 줌: 가로·세로로만 곧게, 꺾임은 될 수 있는 대로 적게(ㄱ자 → ㄹ자),
//    그런 길이 없을 때만 길찾기 길. 이 칸들을 world.roadAsks에 두고 "roadAsk" 알림으로 알림 줄에 띄움(같은 갈매미 하루 한 번).

import { isPaved } from "./roads.js";
import { findPath } from "./pathfinding.js";

export const ASK_GAP_MIN = 90, ASK_GAP_MAX = 150;    // 같은 갈매미의 다음 부탁까지(마을 시간 초)
export const ASK_GLOBAL_GAP = 25;                    // 마을 전체에서 부탁 사이 최소 간격(초)
export const ASK_SECS = 3.6;                         // 말풍선이 떠 있는 시간
export const ASK_FIRST_MAX = 40;                     // 처음 부탁은 0~40초 사이 아무 때나(모두 한꺼번에 시작하지 않게)

/** 이 갈매미가 바라는 길: { target: 건물, label: "시장" | "은행" } 또는 null(이미 이어졌거나 바랄 게 없음).
 *  parts = 만족도 줄(roads.js satisfaction). 예전 갈매미 길 깔기와 같은 조건: 다 지은 내 집 · 상인 아님 · 집-시장/집-은행 길 없음 */
export function roadWant(world, u, parts = u.satParts || []) {
  const home = u.home && world.buildings.get(u.home); if (!home || !world.isDone(home) || u.job === "merchant") return null;
  if (parts.some(p => p[0].includes("집-시장") || p[0].includes("집-은행"))) return null;
  const mk = world.marketB?.(), bk = world.bankB?.(), target = mk || bk; if (!target || target === home) return null;
  return { home, target, label: mk ? "시장" : "은행" };
}

const BUBBLES = [l => `🛣 집에서 ${l}까지 길이 있으면 좋겠어`, l => `🛣 ${l} 가는 길, 돌길로 깔아 줄래?`, l => `🛣 ${l}까지 길이 이어지면 좋겠다…`];
/** 말풍선 글(난수 한 번) */
export const askBubble = (label, rnd = Math.random) => BUBBLES[Math.min(BUBBLES.length - 1, Math.floor(rnd() * BUBBLES.length))](label);
/** 알림 줄 글(아이콘 빼고) */
export const askNotice = (name, label) => `${name}: 집에서 ${label}까지 길을 깔아 주세요`;
/** 다음 부탁까지 기다릴 시간(난수 한 번) */
export const nextGap = (rnd = Math.random) => ASK_GAP_MIN + rnd() * (ASK_GAP_MAX - ASK_GAP_MIN);

/** 지금 부탁해도 되나: 이 갈매미의 차례(u.roadAskAt)가 됐고, 마을의 마지막 부탁(lastAny)에서 ASK_GLOBAL_GAP초가 지났나 */
export const canAsk = (u, time, lastAny = -Infinity) => u.roadAskAt != null && time >= u.roadAskAt && time - lastAny >= ASK_GLOBAL_GAP;

// ---- 깔기 좋은 길
export const ROUTE_SPREAD = 4;                       // ㄹ자 길의 가운데 줄은 시작~끝 사이와 그 바깥 4칸까지 찾아봄
/** 가로(x)·세로(z) 곧은 줄 칸들: (ax,az) → (bx,bz) (끝 칸 포함, 시작 칸 뺌) */
function line(ax, az, bx, bz) {
  const out = [], dx = Math.sign(bx - ax), dz = Math.sign(bz - az); let x = ax, z = az;
  while (x !== bx || z !== bz) { x += dx; z += dz; out.push([x, z]); }
  return out;
}
/** 꺾이는 점들(시작 · 꺾임… · 끝)을 이어 칸 목록으로 */
function joinCorners(pts) { const out = [pts[0]]; for (let i = 1; i < pts.length; i++) out.push(...line(...pts[i - 1], ...pts[i])); return out; }
const turnsOf = cells => { let n = 0; for (let i = 2; i < cells.length; i++) { const a = cells[i - 1][0] - cells[i - 2][0], b = cells[i - 1][1] - cells[i - 2][1], c = cells[i][0] - cells[i - 1][0], d = cells[i][1] - cells[i - 1][1]; if (a !== c || b !== d) n++; } return n; };

/** 깔기 좋은 길(시작 칸·끝 칸 포함): 가로·세로로만 곧게 가는 길 가운데 꺾임이 가장 적은 것.
 *  ok(x, z) = 길을 깔 수 있는 칸(이미 포장됐거나 칠할 수 있음), step(ax, az, bx, bz) = 이웃 칸으로 걸어갈 수 있음.
 *  1) ㄱ자(꺾임 한 번, 두 가지) 2) ㄹ자(꺾임 두 번, 가운데 줄은 한가운데에 가까운 것부터, 바깥으로 ROUTE_SPREAD칸까지) 3) 모두 막히면 fallback() 길(길찾기 — 시작 칸 뺀 칸 목록)
 *  돌려주는 값: { cells, turns, regular }(regular = 가로·세로 곧은 길) 또는 null */
export function suggestRoute(from, to, ok, step, fallback = null) {
  const [ax, az] = from, [bx, bz] = to;
  const good = cells => cells.every(([x, z], i) => ok(x, z) && (i === 0 || step(cells[i - 1][0], cells[i - 1][1], x, z)));
  const pick = list => { for (const pts of list) { const c = joinCorners(pts); if (good(c)) return { cells: c, turns: turnsOf(c), regular: true }; } return null; };
  if (ax === bx || az === bz) { const r = pick([[from, to]]); if (r) return r; }
  const one = pick([[from, [bx, az], to], [from, [ax, bz], to]]); if (one) return one;
  const two = [];                                                           // 가운데 줄이 시작~끝 한가운데에 가까운 것부터
  for (let mx = Math.min(ax, bx) - ROUTE_SPREAD; mx <= Math.max(ax, bx) + ROUTE_SPREAD; mx++) if (mx !== ax && mx !== bx) two.push({ k: Math.abs(mx - (ax + bx) / 2), pts: [from, [mx, az], [mx, bz], to] });   // 가로 → 세로 → 가로
  for (let mz = Math.min(az, bz) - ROUTE_SPREAD; mz <= Math.max(az, bz) + ROUTE_SPREAD; mz++) if (mz !== az && mz !== bz) two.push({ k: Math.abs(mz - (az + bz) / 2), pts: [from, [ax, mz], [bx, mz], to] });   // 세로 → 가로 → 세로
  two.sort((p, q) => p.k - q.k);
  const r2 = pick(two.map(t => t.pts)); if (r2) return r2;
  const p = fallback?.(); if (!p) return null;
  const cells = [from, ...p].filter(([x, z]) => ok(x, z));
  return cells.length ? { cells, turns: turnsOf(cells), regular: false } : null;
}

/** 월드에서 집 문 → 목적지 문까지 깔기 좋은 길. 이미 포장된 칸도 길에 들어감(todo = 아직 칠해야 할 칸 수) */
export function routeFor(world, home, target) {
  const g = world.grid, ok = (x, z) => isPaved(world, x, z) || world.canPaint(x, z) || (x === target.door.x && z === target.door.z) || (x === home.door.x && z === home.door.z);
  const r = suggestRoute([home.door.x, home.door.z], [target.door.x, target.door.z], ok, (ax, az, bx, bz) => g.canStep(ax, az, bx, bz),
    () => findPath(g, home.door.x, home.door.z, target.door.x, target.door.z, 30000));
  if (!r) return null;
  return { ...r, todo: r.cells.filter(([x, z]) => !isPaved(world, x, z)).length };
}
