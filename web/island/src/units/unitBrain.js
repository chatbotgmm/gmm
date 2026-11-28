// 갈매미 유닛 AI(지시서 4-3 + web/village의 마을 생활). 순수 로직: 상태(UnitAIState)만 바꾸고,
// 뷰는 u.anim(틀 애니메이션 이름)·u.tool(손에 든 도구)·u.emoteText(말풍선)·u.fishing(찌 위치)을 읽어 그린다.
//
// 할 일이 없으면(Idle) 성격(PERSONA) 비중으로 하나를 고른다:
//   쉬기(피곤할 때만: 기력 50 아래) · 산책 · 씨앗 먹기 · 친구에게 가서 인사 · 신나서 뛰기 · 벌목 · 채광 · 낚시 · 집 짓기(공사장) · 건물 들어가기
// 반사 행동: 겁 많은 갈매미(미니)는 큰 갈매미가 다가오면 도망, 혼자 있고 싶은 갈매미(그림자)는 쉬다가 붐비면 자리를 피함.
import { UnitState as US } from "../data/types.js";
import { UNIT_SPEED, WATER_Y, MAX_STEP } from "../config.js";
import { PERSONA, BUILDINGS } from "../data/catalog.js";
import * as J from "../world/jobs.js";
import { findPath, nearestWalkable } from "../world/pathfinding.js";
import * as M from "./mind.js";
import { areNeighbors } from "../world/wishes.js";
import * as E from "../world/economy.js";
import * as F from "../world/furniture.js";
import * as HM from "../world/homes.js";
import * as IM from "../world/improve.js";
import * as RA from "../world/roadAsk.js";
import * as FM from "../world/farming.js";
import { FURNITURE, CLOTHES } from "../data/catalog.js";
import * as CLO from "../world/clothes.js";
import * as HL from "../world/health.js";
import { FESTIVAL_JOIN_CHANCE, FESTIVAL_FUN, FESTIVAL_PAL } from "../world/festival.js";
import { STASH_SELL_AT, stashSellable } from "../world/belongings.js";
import * as CLIM from "../world/climate.js";
import * as CH from "./chrono.js";

// 애니메이션 한 번의 길이와 타격 시점(초). 모델을 불러오면 뷰가 u.clip에 실제 값을 넣는다.
const DEFAULT_CLIP = { Chop: { len: 1, hit: 0.5 }, Mine: { len: 1, hit: 0.5 }, Build: { len: 0.6, hit: 0.25 },
  FishCast: { len: 1.2, hit: 1.2 }, FishReel: { len: 1, hit: 0.25 }, Jump: { len: 0.8, hit: 0.4 }, Attack: { len: 0.8, hit: 0.5 },
  Hoe: { len: 1.1, hit: 0.62 }, Pave: { len: 0.9, hit: 0.45 }, Sit: { len: 3, hit: 3 } };   // 새로 만든 동작(모델이 없을 때 길이)
const clip = (u, k) => (u.clip && u.clip[k]) || DEFAULT_CLIP[k];
const cellOf = u => [Math.floor(u.x), Math.floor(u.z)];
const GIVE_UP = 40;                                   // 이 시간(초) 넘게 가는 중이면 포기
const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];
const visible = u => !u.insideBuildingId && u.state !== US.Held;

export function emote(u, text, secs = 1.6) { if (text == null || text === "") return; u.emoteText = String(text); u.emoteT = secs; }
/** 혼잣말 말풍선(기분·일·밥 같은 저절로 나오는 말): 같은 말은 갈매미마다 마을 하루(600초)에 SAME_BUBBLE_DAY번까지만.
 *  한글이 든 말만 셈(✨·♪·💤 같은 짧은 표시는 그대로). 플레이어가 한 일의 대답(선물·들기·톡톡)은 emote를 그대로 써서 늘 보임.
 *  key: 뜻이 같은 말 묶음(배고픔 혼잣말 여러 가지 · 벌목 한마디 여러 가지)은 한 이름으로 셈 — 말만 바꿔 같은 잔소리를 되풀이하지 않게.
 *  센 횟수는 저장 안 함(WeakMap) · 난수 안 씀(마을 진행에 영향 없음). 띄웠으면 true */
export const SAME_BUBBLE_DAY = 3;
const BUBBLE_DAY_SECS = 600, bubbleLog = new WeakMap();
export function chatter(u, text, world, secs, key = null) {
  if (text == null || text === "") return false; text = String(text);
  if (/[가-힣]/.test(text)) {
    const day = Math.floor((world?.time || 0) / BUBBLE_DAY_SECS); let m = bubbleLog.get(u);
    if (!m || m.day !== day) bubbleLog.set(u, m = { day, n: new Map() });
    const id = key || text, k = m.n.get(id) || 0; if (k >= SAME_BUBBLE_DAY) return false; m.n.set(id, k + 1);
  }
  emote(u, text, secs); return true;
}
/** 난수 없이 고르기(갈매미·마을 시간으로 돌아가며): 말풍선만 고를 때 — world.rnd 순서를 바꾸지 않게 */
const vary = (list, u, world) => list[((Number.isFinite(u.unitId) ? u.unitId : 0) + Math.floor((world?.time || 0) / 7)) % list.length];
/** 숫자 말풍선(나무+2 · 🪙+12)은 건설 모드에서만(world.showNumbers = 화면이 넣어 줌). 평소엔 기분 한마디 */
const nums = world => !!world?.showNumbers;
const CHOP_SAY = ["한 짐 했다", "나무 냄새 좋다", "영차, 다 됐다"], MINE_SAY = ["돌 캤다!", "단단하네", "후, 한 덩이"], IRON_SAY = ["철도 나왔다!", "반짝, 철이다"];

// 공사 한 번(망치질 3번)에 드는 재료: 건물마다 cost(없으면 나무 1·돌 1), 3등급 이상 건물은 철 1도.
// 짓는 갈매미 가방(inv: 스스로 캔 것) → 짐(load: 은행 창고에서 꺼내 온 것) 순으로 쓰고, 공식은행이 없는 섬(경제 없음)은 마을 자재(world.res)를 바로 씀.
// 재료 한번에 모으기: 공사를 맡으면 남은 바퀴 × 한 바퀴 재료를 셈(siteNeed) → 가방·짐에 다 있으면 지으러 감 →
//  모자라면 은행 창고에 있는 만큼 한 번에 꺼내 오고(GoFetch), 그래도 모자라면 벌목·채광으로 다 모은 뒤에 감. 한 번에 드는 짐은 LOAD_MAX개까지(넘으면 그만큼 지은 뒤 다시).
export const LOAD_MAX = 16;
const needsIron = b => (BUILDINGS[b.defId].tier || 1) >= 3;
const costOf = b => { const c = { ...(BUILDINGS[b.defId].cost || { wood: 1, stone: 1 }) }; if (needsIron(b)) c.iron = (c.iron || 0) + 1; return c; };
const have = (world, u, k) => (u?.inv?.[k] || 0) + (u?.load?.[k] || 0) + (world.economy ? 0 : world.res[k] || 0);
const hasMaterials = (world, b, u = null) => Object.entries(costOf(b)).every(([k, n]) => have(world, u, k) >= n);
/** 이 공사장을 끝내는 데 남은 재료: 남은 바퀴(망치질 3번 = 한 바퀴, 짓는 갈매미 망치 힘으로) × 한 바퀴 재료.
 *  trip: 이번에 들고 갈 몫(LOAD_MAX개 안에서 바퀴 단위, 적어도 한 바퀴) */
export function siteNeed(b, u = null) {
  const per = costOf(b), unit = Object.values(per).reduce((a, n) => a + n, 0) || 1;
  const cycles = Math.max(0, Math.ceil((b.need - b.hits) / (3 * (u ? J.hammerPower(u) : 1)) - 1e-9)), tripCycles = Math.min(cycles, Math.max(1, Math.floor(LOAD_MAX / unit)));
  const total = {}, trip = {}; for (const [k, n] of Object.entries(per)) { total[k] = n * cycles; trip[k] = n * tripCycles; }
  return { per, cycles, tripCycles, total, trip };
}
/** 이번 몫 중 아직 모자란 것 { k: 개수 }(가방 + 짐 + 은행 없는 섬의 마을 자재로 셈) */
function lackFor(world, b, u) {
  const { trip } = siteNeed(b, u), lack = {};
  for (const [k, n] of Object.entries(trip)) { const l = n - have(world, u, k); if (l > 0) lack[k] = l; }
  return lack;
}
/** 공사장에 보이는 준비 상황(화면용, 저장 안 함): { by 맡은 갈매미, need 이번 몫, got 가방·짐에 든 것, total 끝까지 남은 재료, cycles, step "fetch"|"gather"|"build" } */
function markSupply(world, b, u, step) {
  const { trip, total, cycles } = siteNeed(b, u), got = {}; for (const k of Object.keys(trip)) got[k] = Math.min(trip[k], have(world, u, k));
  b.supply = { by: u.unitId, need: trip, got, total, cycles, step };
}
function useMaterials(world, b, u = null) {
  const fromBag = {}, fromWare = {};
  for (const [k, n] of Object.entries(costOf(b))) {
    let left = n; const mine = Math.min(left, u?.inv?.[k] || 0); if (mine) { u.inv[k] -= mine; left -= mine; }
    const carried = Math.min(left, u?.load?.[k] || 0); if (carried) { u.load[k] -= carried; left -= carried; }   // 은행 창고에서 꺼내 온 짐(창고 몫으로 셈)
    world.res[k] -= left; fromBag[k] = mine; fromWare[k] = left + carried;
  }
  b.used = true; world.releaseFee?.(b);                                                                // 재료를 썼음 → 짓기 되돌리기(↶)는 안 됨(world/buildUndo.js)
  if (b.order) world.orderMaterials(b, u, fromBag, fromWare);                     // 갈매미 주문 공사: 주문한 갈매미가 자재값을 냄(창고 것은 금고로, 가방 것은 짓는 갈매미에게)
  if (u && b.supply) markSupply(world, b, u, "build");
}
/** 모자란 재료를 구하러 감: 나무가 모자라면 벌목, 돌·철이 모자라면 채광(모자란 것부터, 안 되면 다른 것). */
function gatherFor(u, world, b, rnd, lack = lackFor(world, b, u)) {
  const lackWood = (lack.wood || 0) > 0, lackRock = (lack.stone || 0) + (lack.iron || 0) > 0, first = lackWood ? "chop" : "mine", second = first === "chop" ? "mine" : "chop";
  if (startActivity(u, first, world, rnd) || (lackWood && lackRock) && startActivity(u, second, world, rnd)) { u.supplyTrips = (u.supplyTrips || 0) + 1; markSupply(world, b, u, "gather"); emote(u, `재료 모으기 ${lackText(lack)}`); return true; }
  return false;
}
const lackText = lack => Object.entries(lack).map(([k, n]) => `${E.ITEM_ICON[k] || k}${n}`).join(" ");
/** 은행 창고에서 이 갈매미가 꺼낼 수 있는 수: 창고 − 다른 건축가가 가지러 가는 중인 몫(u.fetch = 예약). 두 건축가가 같은 자재를 겹쳐 가지러 가지 않게 */
export function spareStock(world, k, u = null) {
  let n = Math.floor(world.res[k] || 0);
  for (const o of world.units) if (o !== u && o.fetch?.take?.[k]) n -= o.fetch.take[k];
  return Math.max(0, n);
}
/** 은행 창고에 모자란 재료가 있으면 한 번에 꺼내러 감(공식은행이 있을 때만). 정한 몫은 가는 동안 예약(u.fetch)돼 다른 건축가가 못 가져감 */
function fetchFor(u, world, b, lack) {
  const bk = world.bankB(); if (!bk) return false;
  const take = {}; let n = 0;
  for (const [k, l] of Object.entries(lack)) { const t = Math.min(l, spareStock(world, k, u)); if (t > 0) { take[k] = t; n += t; } }
  if (!n || !startPath(u, world, bk.door.x, bk.door.z)) return false;
  u.fetch = { b: b.id, take }; u.state = US.GoFetch; u.supplyTrips = (u.supplyTrips || 0) + 1; markSupply(world, b, u, "fetch"); emote(u, `🏦 자재 가지러 ${lackText(take)}`); return true;
}
/** 은행 문 앞에 닿음: 정한 만큼(그새 줄었으면 있는 만큼) 창고에서 짐으로 옮김 */
function takeFetch(u, world) {
  const f = u.fetch; u.fetch = null; if (!f) return 0;
  let n = 0; u.load ||= {};
  for (const [k, t] of Object.entries(f.take)) { const g = Math.min(t, Math.max(0, Math.floor(world.res[k] || 0))); if (g > 0) { world.res[k] -= g; u.load[k] = (u.load[k] || 0) + g; n += g; } }
  const b = world.buildings.get(f.b); if (b && b.busy === u.unitId) markSupply(world, b, u, "build");
  return n;
}
/** 들고 있던 은행 짐을 창고로 돌려놓음(공사가 끝나 남았거나, 맡은 공사를 내려놓을 때) */
function returnLoad(u, world) {
  if (!u.load || !world) { u.load = null; return; }
  for (const [k, n] of Object.entries(u.load)) if (n > 0) world.res[k] = (world.res[k] || 0) + n;
  u.load = null;
}

/** 찜해 둔 것(나무·광석·씨앗·낚시 자리·공사장)을 놓고 손을 비운다. */
function release(u) {
  const f = u.focus;
  if (f && f.claimed === u.unitId) f.claimed = null;
  if (f && f.busy === u.unitId && u.committed !== f.id) f.busy = null;   // 맡은 공사장(committed)은 끝날 때까지 찜 유지
  u.water = null;                                                       // 물주기 길(물 뜬 것 u.can은 그대로 들고 있음)
  u.fetch = null;                                                       // 은행 자재 예약도 풀림(가는 길에 그만두면 다른 건축가가 가져갈 수 있게)
  u.paidCycle = false; u.focus = null; u.work = null; u.once = null; u.tool = null; u.fishing = null; u.anim = null; u.fishT = undefined; u.bite = u.tugged = false; u.processing = false;
}
/** 맡은 공사를 내려놓음(완공·들어 올림·철거 때). */
export function uncommit(u, world) {
  const b = u.committed && world && world.buildings.get(u.committed);
  if (b && b.busy === u.unitId) { b.busy = null; b.supply = null; }
  u.committed = null; u.fetch = null; returnLoad(u, world);
}
export function setIdle(u, rnd, world = null, secs = null) {
  if (u.activity) { M.learn(u, u.activity, -0.2); u.activity = null; }   // 끝내지 못하고 그만둔 일 = 조금 나쁜 경험
  release(u);
  if (u.improve && world) { for (const [x, z] of u.improve.cells) world.improveClaims?.delete(`${x},${z}`); u.improve = null; }   // 고치던 일을 그만두면 찜 풀기
  if (u.sitOn && world) standUp(u, world);                                // 앉아 있다가 다른 일을 하면 일어남
  u.running = false; u.state = US.Idle; u.timer = secs ?? M.pauseSecs(rnd); u.path = null; u.pathIndex = 0; u.goal = null; if (!u.sailing) u.ferry = null;
  u.targetBuildingId = null; u.moveT = 0; u.lookAt = undefined; u.swimming = false; u.swimGoal = null;   // 물속에서 그만두면 다음 프레임에 가까운 땅으로 올라옴
  if (u.goFor) { u.goFor = null; u.cocoa = false; }                       // 몸 녹이러·쉬러 가던 길도 그만
}

/** 활동을 잘 마침: 보상으로 배우고 쉼. */
function done(u, reward, rnd, world, secs = null) {
  if (u.activity) { M.learn(u, u.activity, reward); u.activity = null; }
  setIdle(u, rnd, world, secs);
}

// ---- 길 다듬기: 격자 길(칸마다 꺾임)에서 곧게 갈 수 있는 중간 칸을 빼서 사선으로 곧게 걷게 함
function lineClear(grid, ax, az, bx, bz) {
  const x0 = ax + 0.5, z0 = az + 0.5, x1 = bx + 0.5, z1 = bz + 0.5, n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.2);
  let px = ax, pz = az;
  for (let i = 1; i <= n; i++) {
    const cx = Math.floor(x0 + (x1 - x0) * i / n), cz = Math.floor(z0 + (z1 - z0) * i / n);
    if (cx === px && cz === pz) continue;
    if (!grid.canStep(px, pz, cx, cz)) return false;
    if (cx !== px && cz !== pz && !(grid.canStep(px, pz, cx, pz) && grid.canStep(px, pz, px, cz))) return false;   // 모서리 가로지르기 금지
    px = cx; pz = cz;
  }
  return true;
}
export function smoothPath(grid, sx, sz, path) {
  const out = []; let ax = sx, az = sz, i = 0;
  while (i < path.length) {
    let j = i;
    while (j + 1 < path.length && j - i < 12 && lineClear(grid, ax, az, path[j + 1][0], path[j + 1][1])) j++;
    out.push(path[j]); [ax, az] = path[j]; i = j + 1;
  }
  return out;
}

function startPath(u, world, gx, gz, run = null) {
  const [sx, sz] = cellOf(u);
  // 다른 섬(걸어서 안 이어진 땅): 선착장이 있으면 배를 타고, 없으면 바로 포기(넓은 지도에서 헛된 길찾기를 하지 않게)
  if (world.compAt && world.grid.isWalkable(sx, sz) && world.compAt(sx, sz) !== world.compAt(gx, gz)) {
    const fr = world.ferryRoute?.(sx, sz, gx, gz); if (!fr) return false;
    const rawA = findPath(world.grid, sx, sz, fr.A.door.x, fr.A.door.z, 30000); if (!rawA) return false;
    u.path = rawA; u.pathIndex = 0; u.goal = { x: fr.A.door.x, z: fr.A.door.z }; u.moveT = 0; u.running = !!u.runSpeed;
    u.ferry = { A: fr.A.id, B: fr.B.id, gx, gz }; u.giveUp = 9999; return true;
  }
  u.ferry = null;
  const raw = findPath(world.grid, sx, sz, gx, gz, 30000);
  if (!raw) return false;
  const path = smoothPath(world.grid, sx, sz, raw);
  if (Math.hypot(u.x - (sx + 0.5), u.z - (sz + 0.5)) > 0.2) path.unshift([sx, sz]);   // 칸 모서리에 서 있으면 먼저 칸 가운데로
  u.path = path; u.pathIndex = 0; u.goal = { x: gx, z: gz }; u.moveT = 0;
  u.running = run ?? (!!u.runSpeed && raw.length > 7);            // 먼 길은 달림
  const speed = (u.running ? u.runSpeed : u.walkSpeed) || UNIT_SPEED;
  u.giveUp = Math.max(GIVE_UP, raw.length / speed * 1.6 + 5);    // 먼 길·느린 갈매미(미니)는 그만큼 오래 기다림
  return true;
}
const AROUND8 = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
/** 나무·광석(대상 칸)을 캘 때 설 수 있는 이웃 칸: 걸을 수 있고 문 앞이 아니며, 서는 높이가 대상 칸 땅 높이와 걸어서 오르내리는 한 단(MAX_STEP) 안.
 *  절벽 위(2층)에서 아래(1층) 광석을 캐거나 그 반대가 되지 않게(길찾기 canStep과 같은 기준). 없으면 빈 목록 → 그 대상은 못 캠 */
export function workCells(grid, tx, tz) {
  const c = grid.get(tx, tz); if (!c) return [];
  const near = (a, b) => Math.abs(a - b) <= MAX_STEP + 1e-6;
  // 대각선 칸은 사이 두 칸 중 하나라도 대상·서는 칸과 같은 높이여야 함(절벽 모서리 너머로만 닿으면 안 됨: 길찾기의 모서리 가로지르기 금지와 같은 뜻)
  const side = (x, z, h) => { const s = grid.get(x, z); return !!s && near(s.elevation, c.elevation) && near(s.elevation, h); };
  return AROUND8.map(([dx, dz]) => [tx + dx, tz + dz]).filter(([x, z]) => { const h = grid.walkHeight(x, z); return h !== null && !grid.doorOwner(x, z) && near(h, c.elevation) && (x === tx || z === tz || side(x, tz, h) || side(tx, z, h)); });
}
/** 걸어서(또는 배로) 닿을 수 있는 칸인가: 이어진 땅 덩어리(compAt)로 싸게 봄. 못 재면 닿는다고 봄 */
function canReach(u, world, x, z) {
  if (!world.compAt) return true;
  const a = world.compAt(Math.floor(u.x), Math.floor(u.z)), b = world.compAt(x, z);
  return a < 0 || (b >= 0 && (a === b || !!world.ferryRoute?.(Math.floor(u.x), Math.floor(u.z), x, z)));
}
/** (tx,tz) 칸 바로 옆의 걸을 수 있는 칸으로 가는 길. 가까운 칸부터 시도. sameLevel: 대상과 같은 높이(한 단 안)의 칸만(나무·광석, workCells) */
function pathBeside(u, world, tx, tz, sameLevel = false) {
  const g = world.grid, around = (sameLevel ? workCells(g, tx, tz) : AROUND8.map(([dx, dz]) => [tx + dx, tz + dz]).filter(([x, z]) => g.isWalkable(x, z) && !g.doorOwner(x, z)))
    .sort((a, b) => Math.hypot(a[0] + 0.5 - u.x, a[1] + 0.5 - u.z) - Math.hypot(b[0] + 0.5 - u.x, b[1] + 0.5 - u.z));
  for (const [x, z] of around.slice(0, 4)) if (startPath(u, world, x, z)) return true;
  return false;
}
function nearest(u, list, at) {
  let best = null, bd = Infinity;
  for (const it of list) { const [x, z] = at(it), d = Math.hypot(x + 0.5 - u.x, z + 0.5 - u.z); if (d < bd) { bd = d; best = it; } }
  return best;
}
function face(u, x, z) { u.heading = Math.atan2(x - u.x, z - u.z); }

/** 경로를 따라 한 프레임 이동. 도착하면 true. 앞 칸이 막히면 같은 목적지로 다시 길을 찾는다. */
function followPath(u, dt, world, rnd) {
  const grid = world.grid; let move = (u.running ? u.runSpeed ?? UNIT_SPEED * 1.6 : u.walkSpeed ?? UNIT_SPEED) * dt;   // 모델 정보가 없으면(시험) 기본 속도
  { const c = grid.get(Math.floor(u.x), Math.floor(u.z)); if (c && (c.groundType === "Cobble" || c.groundType === "WoodDeck")) move *= 1.2; }   // 포장도로 위에선 20% 빨리
  u.moveT = (u.moveT || 0) + dt;
  const want = move, x0 = u.x, z0 = u.z;
  let guard = 0;
  while (move > 0 && u.path && u.pathIndex < u.path.length && guard++ < 20) {
    const [nx, nz] = u.path[u.pathIndex], [cx, cz] = cellOf(u);
    const tx = nx + 0.5, tz = nz + 0.5, dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
    const stepLen = Math.min(d, move, 0.45), ex = d > 1e-6 ? u.x + dx / d * stepLen : tx, ez = d > 1e-6 ? u.z + dz / d * stepLen : tz;
    const [ncx, ncz] = [Math.floor(ex), Math.floor(ez)];
    if ((ncx !== cx || ncz !== cz) && !(grid.canStep(cx, cz, ncx, ncz) && (ncx === cx || ncz === cz || (grid.canStep(cx, cz, ncx, cz) && grid.canStep(cx, cz, cx, ncz))))) {
      // 대각선 다음 칸으로 가다 모서리(한쪽 옆이 턱)에서 막힘: 지나갈 수 있는 옆 칸을 거쳐 감(제자리 왔다 갔다 방지)
      if (Math.abs(nx - cx) === 1 && Math.abs(nz - cz) === 1) {
        const via = [[nx, cz], [cx, nz]].find(([ox, oz]) => grid.canStep(cx, cz, ox, oz) && grid.canStep(ox, oz, nx, nz));
        if (via) { u.path.splice(u.pathIndex, 0, via); continue; }
      }
      // 앞이 막힘(새 건물·물 등) → 같은 목적지로 다시 길 찾기. 계속 막히면 포기.
      u.repaths = (u.repaths || 0) + 1;
      const tries = u.repaths, t0 = u.moveT;
      if (tries > 5 || !u.goal || !startPath(u, world, u.goal.x, u.goal.z, u.running)) { u.repaths = 0; setIdle(u, rnd, world); return false; }
      u.repaths = tries; u.moveT = t0;                                       // 다시 찾아도 포기 시계는 이어감
      continue;
    }
    if (d > 1e-6) u.heading = Math.atan2(dx, dz);
    u.x = ex; u.z = ez; move -= stepLen; u.repaths = 0;
    if (stepLen >= d - 1e-9) { u.x = tx; u.z = tz; u.pathIndex++; }
  }
  // 멈춤 감지: 2초 넘게 가야 할 거리의 20%도 못 가면 → 목적지 바로 앞이면 도착, 아니면 길을 다시 찾음
  if (u.path && u.pathIndex < u.path.length) {
    u.stallT = Math.hypot(u.x - x0, u.z - z0) < want * 0.2 ? (u.stallT || 0) + dt : 0;
    if (u.stallT > 2) {
      u.stallT = 0;
      const last = u.path[u.path.length - 1];
      if (Math.hypot(last[0] + 0.5 - u.x, last[1] + 0.5 - u.z) < 0.7) { u.pathIndex = u.path.length; return true; }
      if (!u.goal || !startPath(u, world, u.goal.x, u.goal.z, u.running)) { setIdle(u, rnd, world); return false; }
    }
  }
  if (!!u.path && u.pathIndex >= u.path.length && u.ferry) return sail(u, dt, world);   // 선착장에 닿음 → 배 타기
  return !!u.path && u.pathIndex >= u.path.length;
}
/** 배 타기: 선착장 A 앞 물에서 뱃길을 따라 B 앞까지 → B 문 앞에 내려 원래 목적지로 걸어감. 가는 동안 false */
function sail(u, dt, world) {
  const A = world.buildings.get(u.ferry.A), B = world.buildings.get(u.ferry.B);
  if (!A || !B) { u.ferry = null; u.sailing = null; return false; }
  if (!u.sailing) { const a = world.berth(A), b = world.berth(B); u.sailing = { pts: world.seaPath(a, b), i: 0 }; u.x = a.x + 0.5; u.z = a.z + 0.5; }
  const s = u.sailing, speed = 4.5 * dt;                                          // 배는 1초에 4.5칸
  u.y = WATER_Y + 0.1;
  let left = speed;
  while (left > 0 && s.i < s.pts.length) {
    const [px, pz] = s.pts[s.i], tx = px + 0.5, tz = pz + 0.5, d = Math.hypot(tx - u.x, tz - u.z);
    if (d > 1e-6) u.heading = Math.atan2(tx - u.x, tz - u.z);
    if (d <= left) { u.x = tx; u.z = tz; left -= d; s.i++; } else { u.x += (tx - u.x) / d * left; u.z += (tz - u.z) / d * left; left = 0; }
  }
  if (s.i < s.pts.length) return false;
  const { gx, gz } = u.ferry; u.sailing = null; u.ferry = null; u.x = B.door.x + 0.5; u.z = B.door.z + 0.5; u.y = world.standHeight(u.x, u.z);
  const raw = findPath(world.grid, B.door.x, B.door.z, gx, gz, 30000); if (!raw) { u.path = null; return true; }
  u.path = raw; u.pathIndex = 0; u.goal = { x: gx, z: gz }; u.giveUp = Math.max(GIVE_UP, raw.length + 10);
  return raw.length === 0;
}
const moving = u => !!u.path && u.pathIndex < u.path.length;

/** 한 번만 하는 동작(점프·쪼기·던지기·감기). hit 시점에 onHit, 끝나면 then. */
function doOnce(u, key, onHit, then, hitAt = null) {
  const c = clip(u, key); u.anim = key; u.once = { key, t: 0, len: c.len, hit: hitAt ?? c.hit, onHit, then };
}
/** 반복 동작(도끼질·곡괭이질·망치질): 한 바퀴 돌 때마다 hit 시점에 onHit, hits번 끝나면 onEnd. */
function workLoop(u, dt, key, hits, onHit, onEnd) {
  const c = clip(u, key); u.anim = key;
  if (!u.work) u.work = { t: 0, done: 0 };
  u.work.t += dt * (u.eff ?? 1);                                         // 배고프면 느리게, 든든하면 빠르게
  const n = Math.min(hits, Math.floor((u.work.t - c.hit) / c.len) + 1);
  while (u.work && u.work.done < n) { u.work.done++; onHit(u.work.done); }
  if (u.work && u.work.done >= hits && u.work.t >= hits * c.len) { u.work = null; onEnd(); }
}

// ---------------------------------------------------------------- 활동 시작
function reach(u) { return 4 + 6 * Math.sqrt(u.scale || 1); }

function startActivity(u, kind, world, rnd) {
  const ok = startActivityInner(u, kind, world, rnd);
  if (ok && !(kind === "build" && u.state !== US.GoBuild)) u.activity = kind;   // 재료 구하러 간 경우는 그 일(벌목·채광)로 기억
  return ok;
}
function startActivityInner(u, kind, world, rnd) {
  const g = world.grid, persona = PERSONA[u.name] || PERSONA["기본"];
  switch (kind) {
    case "rest": {                                                                // 쉬기 = 잠깐 숨 돌리기: 가까운 빈 벤치가 있으면 앉고(M.benchSecs), 없으면 서서(M.breathSecs). 기력을 채우는 건 잠
      u.breathAt = world.time || 0;
      if (sitBench(u, world)) return true;
      setIdle(u, rnd, world, M.breathSecs(rnd)); if (rnd() < 0.3) emote(u, pick(["…", "♪", "z"], rnd)); return true;
    }
    case "sleep": return startSleep(u, world, rnd);                              // 지치면 잠(밤낮과 상관없이): 내 집 → 빈 집 손님 → 밖
    case "wander": {
      const [sx, sz] = cellOf(u), r = Math.round(reach(u));
      for (let k = 0; k < 12; k++) {
        const gx = sx + Math.round((rnd() * 2 - 1) * r), gz = sz + Math.round((rnd() * 2 - 1) * r);
        if (g.isWalkable(gx, gz) && startPath(u, world, gx, gz, !!persona.timid && rnd() < 0.6)) { u.state = US.Wander; return true; }
      }
      return false;
    }
    case "zoomies": {
      if (!startActivityInner(u, "wander", world, rnd)) return false;
      u.state = US.Zoomies; u.running = true; u.chain = 3; emote(u, "✨"); return true;
    }
    case "forage": {
      const far = (u.full ?? 80) < J.HUNGRY ? 999 : reach(u) * 1.8;                 // 배고프면 멀어도 감
      const s = nearest(u, world.seeds.filter(s => !s.claimed && Math.hypot(s.x - u.x, s.z - u.z) < far), s => [s.x, s.z]);
      if (!s || !startPath(u, world, s.x, s.z, !!persona.timid)) return false;
      s.claimed = u.unitId; u.focus = s; u.state = US.Forage; return true;
    }
    case "visit": {
      // 가깝고 친한 친구일수록 먼저(호감 1당 6칸 거리만큼 더 가도 감)
      const cands = world.units.filter(o => o !== u && visible(o) && !(PERSONA[o.name] || {}).loner && [US.Idle, US.Wander, US.Sit, US.Fish, US.Trade].includes(o.state) && !o.once && M.affinity(u, o) > -2);   // 쉬거나 산책·벤치·낚시·장사 중인 친구(한자리에 있는 친구)
      const f = cands.sort((a, b) => (Math.hypot(a.x - u.x, a.z - u.z) - 6 * M.affinity(u, a)) - (Math.hypot(b.x - u.x, b.z - u.z) - 6 * M.affinity(u, b)))[0];
      if (!f) return false;
      const [fx, fz] = cellOf(f);
      if (!pathBeside(u, world, fx, fz)) return false;
      u.focus = f; u.state = US.Visit; emote(u, "?"); return true;
    }
    case "chop": case "mine": {
      // 같은 높이에서 설 칸(workCells)이 있는 것 중 가까운 것부터 3개까지: 길이 없으면(절벽 너머 등) 다음 것
      const list = kind === "chop" ? world.trees : world.ores, d = t => Math.hypot(t.x + 0.5 - u.x, t.z + 0.5 - u.z);
      const t = list.filter(t => t.alive && !t.claimed && workCells(g, t.x, t.z).length).sort((a, b) => d(a) - d(b)).slice(0, 3).find(t => pathBeside(u, world, t.x, t.z, true));
      if (!t) return false;
      t.claimed = u.unitId; u.focus = t; u.state = kind === "chop" ? US.GoChop : US.GoMine; return true;
    }
    case "fish": {
      if ((world.fx?.fish ?? 1) <= 0) return false;                                // 폭풍엔 낚시 안 감
      const s = nearest(u, world.spots.filter(s => !s.claimed && g.isWalkable(s.x, s.z)), s => [s.x, s.z]);
      if (!s || !startPath(u, world, s.x, s.z)) return false;
      s.claimed = u.unitId; u.focus = s; u.state = US.GoFish; return true;
    }
    case "build": {
      if (u.sick && !u.committed) return false;                                    // 아프면 새 공사를 맡지 않음
      // 맡은 공사장이 있으면 그곳, 없으면 남이 안 맡은 공사장 중 많이 지어진 곳. 한 번 맡으면 100%까지 맡는다.
      let b = u.committed ? world.buildings.get(u.committed) : null;
      if (b && (world.isDone(b) || (b.busy && b.busy !== u.unitId))) { uncommit(u, world); b = null; }
      if (!b) b = [...world.buildings.values()].filter(b => !world.isDone(b) && !b.busy && J.canBuild(u, BUILDINGS[b.defId]) && world.workSpot(b) && !(u.noWay?.[b.id] > world.time))   // 방금 길이 없던 공사장은 잠깐 건너뜀(그 한 곳 때문에 다른 공사가 다 멈추지 않게)
        .sort((a, c) => c.hits / c.need - a.hits / a.need)[0];
      if (!b) return false;
      u.committed = b.id; b.busy = u.unitId;
      const spot = world.workSpot(b); if (!spot) { uncommit(u, world); return false; }   // 다리: 땅이나 다 지은 다리에 붙은 칸부터
      if (!canReach(u, world, spot.x, spot.z)) { (u.noWay ||= {})[b.id] = world.time + 60; uncommit(u, world); return false; }   // 문 앞이 막힌 공사장은 재료부터 모으지 않음(헛걸음 방지)
      // 계획 → 재료 확인 → 이번 몫을 한 번에 모으기(은행 창고 → 벌목·채광) → 다 모이면 지으러 감. 모을 길이 없으면 한 바퀴 몫이라도 있을 때 그것으로 지음
      const lack = lackFor(world, b, u);
      if (Object.keys(lack).length && (fetchFor(u, world, b, lack) || gatherFor(u, world, b, rnd, lack))) return true;
      if (!hasMaterials(world, b, u)) { markSupply(world, b, u, "gather"); return false; }
      if (!startPath(u, world, spot.x, spot.z)) { (u.noWay ||= {})[b.id] = world.time + 60; uncommit(u, world); return false; }
      u.focus = b; u.state = US.GoBuild; markSupply(world, b, u, "build"); return true;
    }
    case "eat": {                                                                 // 음식이 있으면 그 자리에서 먹고, 없으면 씨앗을 찾음
      if (world.economy) {                                                         // 경제: 내 가방 → 시장에서 사기 → 물물교환 → 씨앗
        if (E.meals(u) <= 0) {
          // 돈이 있으면 농부·어부에게서 사고, 없으면 자재를 들고 아무에게나 물물교환, 그것도 안 되면 씨앗
          if (world.granary > 0 && ((u.coins || 0) >= world.foodPrice() || (u.full ?? 80) < E.RATION_FULL) && startActivity(u, "granary", world, rnd)) { emote(u, "저장고로!"); return true; }   // 저장고에 음식이 있으면 먼저(겨울 대비)
          const buy = (u.coins || 0) >= (world.foodPrice?.() ?? E.FOOD_PRICE);
          const host = nearest(u, world.units.filter(o => o !== u && visible(o) && (buy ? E.isProducer(o) && E.meals(o) > E.FOOD_KEEP : E.meals(o) >= E.FOOD_KEEP)), o => [o.x, o.z]);
          if (host && (buy || E.spare(u))) { const [fx, fz] = cellOf(host); if (pathBeside(u, world, fx, fz)) { u.focus = host; u.state = US.Visit; u.wantFood = buy ? "buy" : "barter"; emote(u, buy ? "음식 사러!" : "배고파…"); return true; } }
          return startActivity(u, "forage", world, rnd) || startActivity(u, "shore", world, rnd);   // 넓은 섬엔 씨앗이 없어 바닷가로
        }
      } else if (world.res.food < 1) return startActivity(u, "forage", world, rnd);
      setIdle(u, rnd, world); u.state = US.Eat;
      doOnce(u, "Attack", () => { if (world.eatFood(u)) chatter(u, J.isLazy(u) ? "배불러…" : "냠냠", world); }, () => done(u, 1, rnd, world));
      return true;
    }
    case "shore": {                                                               // 바닷가에서 직접 먹이 잡기(먹을 것도 살 곳도 없을 때)
      const [sx, sz] = cellOf(u); let best = null;
      for (let r = 1; r < 40 && !best; r++) for (let dz = -r; dz <= r && !best; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = sx + dx, z = sz + dz; if (!g.isWalkable(x, z) || g.get(x, z)?.occupiedId) continue;
        const w2 = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([ax, az]) => g.isWater(x + ax, z + az)); if (w2) { best = [x, z, w2]; break; }
      }
      if (!best || !startPath(u, world, best[0], best[1])) return false;
      u.state = US.GoShore; u.shoreDir = best[2]; chatter(u, "바다로 먹이 잡으러", world); return true;
    }
    case "deposit": {                                                             // 상인: 가공품을 공식은행에 팔러
      const bk = world.bankB(); if (!bk || E.total(u.goods) <= 0) return false;
      if (!startPath(u, world, bk.door.x, bk.door.z)) return false;
      u.state = US.GoBank; return true;
    }
    case "sell": {                                                                // 원자재를 시장(상인)에 팔러
      const m = world.merchantU(), mk = world.marketB(); if (!mk || !m || m === u || (m.coins || 0) < 2 || E.total(E.rawOf(u)) <= 0) return false;
      if (!startPath(u, world, mk.door.x, mk.door.z)) return false;
      u.state = US.GoMarket; u.shop = { kind: "sell" }; return true;
    }
    case "peddle": {                                                              // 소지품(잡거나 주운 것)을 시장에 팔러. 상인 자신도 됨
      const mk = world.marketB(); if (!mk || !world.merchantU()) return false;
      if (!startPath(u, world, mk.door.x, mk.door.z)) return false;
      u.state = US.GoMarket; u.shop = { kind: "peddle" }; return true;
    }
    case "process": {                                                             // 상인: 사 들인 원자재를 시장에서 가공
      const mk = world.marketB(); if (!mk || u.job !== "merchant" || E.total(u.raw) <= 0) return false;
      if (!startPath(u, world, mk.door.x, mk.door.z)) return false;
      u.state = US.GoMarket; u.shop = { kind: "process" }; return true;
    }
    case "stock": case "granary": {                                               // 저장고: 남는 음식 팔기 / 배고플 때 음식 얻기
      const gr = world.granaryB(); if (!gr || !startPath(u, world, gr.door.x, gr.door.z)) return false;
      u.state = US.GoMarket; u.shop = { kind: kind }; return true;
    }
    case "market": {                                                              // 시장 문 앞으로(무엇을 살지는 u.shop)
      const mk = world.marketB(); if (!mk) return false;
      if (!startPath(u, world, mk.door.x, mk.door.z)) return false;
      u.state = US.GoMarket; return true;
    }
    case "trade": {                                                               // 상인: 가판대 앞으로
      if (world.economy) {                                                         // 경제: 가공할 것이 있으면 가공, 없으면 시장 앞에서 원자재 사들이기
        if (E.total(u.raw) > 0) return startActivityInner(u, "process", world, rnd);
        const mk = world.marketB(); if (!mk || u.job !== "merchant" || !startPath(u, world, mk.door.x, mk.door.z)) return false;
        u.state = US.GoTrade; return true;
      }
      const st = world.stall; if (!st || u.job !== "merchant") return false;
      if (!startPath(u, world, st.standX, st.standZ)) return false;
      u.state = US.GoTrade; return true;
    }
    case "farm": {                                                                // 농부: 다 자란 밭 거두기 → 목마른 밭 물주기 → 빈 밭 심기 → 마른 밭 물주기
      if (u.job !== "farmer") return false;
      const free = world.plots.filter(p => !p.claimed), at = p => [p.x, p.z];
      const goFarm = pl => { if (!pl || !startPath(u, world, pl.x, pl.z)) return false; pl.claimed = u.unitId; u.focus = pl; u.state = US.GoFarm; return true; };
      return goFarm(nearest(u, free.filter(p => p.stage === "ripe"), at)) || startWatering(u, world, free.filter(p => p.stage === "growing" && (p.moisture ?? 1) < FM.DRY_BELOW))
        || goFarm(nearest(u, free.filter(p => p.stage === "empty"), at)) || startWatering(u, world, free.filter(FM.needsWater));
    }
    case "swim": {                                                                // 물가 땅까지 걸어간 뒤 얕은 물로 들어가 헤엄
      const [sx, sz] = cellOf(u), r = Math.round(reach(u) * 1.5), shores = [];
      for (let z = sz - r; z <= sz + r; z++) for (let x = sx - r; x <= sx + r; x++) {
        if (!g.isWalkable(x, z) || g.get(x, z)?.occupiedId) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g.inBounds(x + dx, z + dz) && g.isWater(x + dx, z + dz) && g.isWater(x + 2 * dx, z + 2 * dz)) { shores.push([x, z, x + dx, z + dz]); break; }
      }
      shores.sort((a, b) => Math.hypot(a[0] - u.x, a[1] - u.z) - Math.hypot(b[0] - u.x, b[1] - u.z));
      for (const s of shores.slice(0, 4).sort(() => rnd() - 0.5)) {
        if (!startPath(u, world, s[0], s[1])) continue;
        u.swim = { sx: s[0], sz: s[1], wx: s[2], wz: s[3] }; u.state = US.GoSwim; return true;
      }
      return false;
    }
    case "enter": {
      const done = [...world.buildings.values()].filter(b => world.canEnter(u, b));
      if (!done.length) return false;
      const b = pick(done, rnd);
      if (!startPath(u, world, b.door.x, b.door.z)) return false;
      u.state = US.GoToBuilding; u.targetBuildingId = b.id; return true;
    }
  }
  return false;
}

/** 끌어다 놓은 갈매미: 놓은 자리 가까이(R칸 안) 있는 것 중 가장 가까운 것과 바로 상호작용한다.
 *  나무→벌목, 광석→채광, 낚시 자리→낚시, 짓는 중인 건물→공사(지을 수 있는 등급일 때), 밭→밭일(직업 무관, 직접 시킨 일이라),
 *  가판대→장사(상인만), 씨앗→줍기, 다른 갈매미→놀러 가기. 할 게 없으면 null. prefer: 먼저 고를 대상(놓은 칸의 공사장 등). */
export function interactNear(u, world, rnd = Math.random, R = 2.6, prefer = null) {
  const g = world.grid, cands = [];
  const add = (kind, obj, x, z, label) => { const d = Math.hypot(x - u.x, z - u.z); if (d <= R || obj === prefer) cands.push({ kind, obj, d: obj === prefer ? -1 : d, label }); };
  for (const t of world.trees) if (t.alive && !t.claimed) add("chop", t, t.x + 0.5, t.z + 0.5, "나무를 베러 가요");
  for (const t of world.ores) if (t.alive && !t.claimed) add("mine", t, t.x + 0.5, t.z + 0.5, "광석을 캐러 가요");
  for (const s of world.spots) if (!s.claimed && g.isWalkable(s.x, s.z)) add("fish", s, s.x + 0.5, s.z + 0.5, "낚시하러 가요");
  for (const b of world.buildings.values()) if (!world.isDone(b) && (!b.busy || b.busy === u.unitId) && J.canBuild(u, BUILDINGS[b.defId])) add("build", b, b.door.x + 0.5, b.door.z + 0.5, "공사를 도우러 가요");
  for (const p of world.plots) if (!p.claimed && (p.stage === "empty" || p.stage === "ripe")) add("farm", p, p.x + 0.5, p.z + 0.5, p.stage === "ripe" ? "밭을 거두러 가요" : "씨를 심으러 가요");
  if (world.stall && u.job === "merchant") add("trade", world.stall, world.stall.standX + 0.5, world.stall.standZ + 0.5, "장사하러 가요");
  for (const s of world.seeds) if (!s.claimed) add("forage", s, s.x, s.z, "씨앗을 주우러 가요");
  for (const o of world.units) if (o !== u && visible(o) && o.state !== US.Held) add("visit", o, o.x, o.z, `${o.name}에게 놀러 가요`);
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands) {
    const o = c.obj; let ok = false;
    switch (c.kind) {
      case "chop": case "mine":
        if (pathBeside(u, world, o.x, o.z, true)) { o.claimed = u.unitId; u.focus = o; u.state = c.kind === "chop" ? US.GoChop : US.GoMine; ok = true; } break;
      case "fish": if (startPath(u, world, o.x, o.z)) { o.claimed = u.unitId; u.focus = o; u.state = US.GoFish; ok = true; } break;
      case "farm": if (startPath(u, world, o.x, o.z)) { o.claimed = u.unitId; u.focus = o; u.state = US.GoFarm; ok = true; } break;
      case "trade": ok = startActivityInner(u, "trade", world, rnd); break;
      case "forage": if (startPath(u, world, o.x, o.z)) { o.claimed = u.unitId; u.focus = o; u.state = US.Forage; ok = true; } break;
      case "build": uncommit(u, world); u.committed = o.id; ok = startActivityInner(u, "build", world, rnd); if (!ok) uncommit(u, world); break;
      case "visit": { const [fx, fz] = cellOf(o); if (pathBeside(u, world, fx, fz)) { u.focus = o; u.state = US.Visit; ok = true; } break; }
    }
    if (ok) { u.activity = c.kind === "build" && u.state !== US.GoBuild ? u.activity : c.kind; emote(u, "!"); return { kind: c.kind, label: c.label }; }
  }
  return null;
}

/** 밭 물주기 시작: 가까운 마른 밭을 찜하고, 물을 들고 있으면(u.can) 바로 밭으로, 없으면 그 밭에서 가까운 물가(FM.waterEdges)로 먼저 감. 물가가 없거나 못 가면 false */
function startWatering(u, world, list) {
  // 가까운 밭부터 3칸까지: 가장 가까운 밭이 물가에서 멀거나(24칸 밖) 물가로 가는 길이 없으면 다음 밭(그 한 칸 때문에 다른 밭 물주기가 다 멈추지 않게)
  const d = p => Math.hypot(p.x + 0.5 - u.x, p.z + 0.5 - u.z), g = world.grid;
  const pl = list.slice().sort((a, b) => d(a) - d(b)).slice(0, 3).find(pl => {
    if ((u.can || 0) > 0) return startPath(u, world, pl.x, pl.z);
    if (!pl._ws || pl._ws.v !== g.version) pl._ws = { v: g.version, list: FM.waterEdges(g, pl.x, pl.z).slice(0, 3) };   // 물가 찾기는 땅이 바뀔 때만 다시
    const edge = pl._ws.list.find(e => startPath(u, world, e.x, e.z)); if (!edge) return false;
    u.water = { fill: edge }; return true;
  });
  if (!pl) return false;
  u.water ||= {}; pl.claimed = u.unitId; u.focus = pl; u.state = US.GoWater; emote(u, (u.can || 0) > 0 ? "💧 물 주러" : "🪣 물 뜨러", 1.8); return true;
}
/** 물주기 길에 닿음: 물가면 물을 뜨고(쪼기 동작) 밭으로, 밭이면 붓고(쪼그려 톡톡) 남은 물로 가까운(6칸 안) 마른 밭을 이어서 */
function arriveWater(u, world, rnd) {
  const wt = u.water, pl = u.focus;
  if (wt.fill) {
    const e = wt.fill; face(u, e.x + 0.5 + e.dir[0], e.z + 0.5 + e.dir[1]); u.state = US.Water; u.tool = "can";
    doOnce(u, "Attack", () => { u.can = FM.CAN_SIZE; emote(u, "🪣 물 뜨기"); }, () => {
      wt.fill = null; if (!world.plots.includes(pl) || !startPath(u, world, pl.x, pl.z)) { done(u, 0.2, rnd, world); return; }
      u.state = US.GoWater; u.water = wt;
    });
    return;
  }
  face(u, pl.x + 0.5, pl.z + 0.5); u.state = US.Water; u.tool = "can";
  doOnce(u, "Pave", () => { world.waterPlot(pl, u); u.can = Math.max(0, (u.can || 0) - 1); emote(u, "💧"); }, () => {
    const next = u.can > 0 && nearest(u, world.plots.filter(p => !p.claimed && FM.needsWater(p) && Math.hypot(p.x - pl.x, p.z - pl.z) <= 6), p => [p.x, p.z]);
    if (next && startPath(u, world, next.x, next.z)) { pl.claimed = null; next.claimed = u.unitId; u.focus = next; u.state = US.GoWater; u.water = {}; return; }
    u.tool = null; done(u, 0.7, rnd, world);
  });
}
/** 길 부탁(roadAsk.js): 바라는 길이 있고 차례가 됐으면 멈춰 서서 말풍선으로 부탁하고, 깔기 좋은 길을 world.roadAsks에 둠("roadAsk" 알림).
 *  길이 이어졌거나 바랄 게 없어지면 부탁을 지움. 처음 바라게 되면 0~ASK_FIRST_MAX초 뒤로 차례를 잡음(난수는 바랄 때만 씀) */
function askRoad(u, world, rnd) {
  const want = RA.roadWant(world, u);
  if (!want) { if (u.roadAskAt != null) { u.roadAskAt = null; world.roadAsks?.delete(u.unitId); } return false; }
  const t = world.time || 0;
  if (u.roadAskAt == null) { u.roadAskAt = t + rnd() * RA.ASK_FIRST_MAX; return false; }
  if (!RA.canAsk(u, t, world.roadAskLast ?? -Infinity)) return false;
  u.roadAskAt = t + RA.nextGap(rnd); world.roadAskLast = t;
  const route = RA.routeFor(world, want.home, want.target);
  const ask = { u, target: want.target, label: want.label, cells: route?.cells || [], regular: !!route?.regular, todo: route?.todo ?? 0, t };
  (world.roadAsks ||= new Map()).set(u.unitId, ask);
  emote(u, RA.askBubble(want.label, rnd), RA.ASK_SECS); world.emit("roadAsk", ask);
  setIdle(u, rnd, world, RA.ASK_SECS * 0.7); return true;                      // 잠깐 멈춰 서서 말함
}
/** 동네 고치기 시작: 계획을 세우고 첫 칸으로 감 */
function startImprove(u, world, rnd) {
  const plan = IM.planImprovement(world, u); if (!plan) return false;
  const home = world.buildings.get(u.home);
  if (plan.kind === "deco") { const b = IM.orderDeco(world, home, rnd, u); if (!b) return false; emote(u, `🌷 ${BUILDINGS[b.defId].name} 주문!${b.order ? ` 🪙${b.order.left}` : ""}`, 2.5); world.emit("improve", { u, kind: "deco", b }); done(u, 0.6, rnd, world); return true; }
  world.improveClaims ||= new Set(); for (const [x, z] of plan.cells) world.improveClaims.add(`${x},${z}`);
  u.improve = { ...plan, i: 0 };
  if (!improveNext(u, world)) { endImprove(u, world); return false; }
  emote(u, "🏡 마당 고르기!", 2.2); u.activity = "build"; return true;
}
function improveNext(u, world) {
  const im = u.improve; while (im && im.i < im.cells.length) { const [x, z] = im.cells[im.i]; if (pathBeside(u, world, x, z) || startPath(u, world, x, z)) { u.state = US.GoImprove; return true; } im.i++; }
  return false;
}
function endImprove(u, world) { const im = u.improve; if (im) for (const [x, z] of im.cells) world.improveClaims?.delete(`${x},${z}`); u.improve = null; u.tool = null; }
/** 한 칸 고치기: 마당을 문 높이로 높이거나 낮춤(높이만 — 땅 종류는 바꾸지 않음. 길은 플레이어가 칠하고 갈매미는 부탁만: roadAsk.js) */
function improveCell(u, world) {
  const im = u.improve, [x, z] = im.cells[im.i]; if (im.kind !== "yard") return false;
  if (world.canReshape(x, z)) world.reshape(x, z, "flatten", im.target, 1);
  world.emit("improve", { u, kind: im.kind, x, z }); return true;
}
/** 쉴 때 가까운(16칸 안) 빈 벤치에 가서 앉음. 몸이 너무 큰 갈매미(자이언트)는 안 앉음 */
function sitBench(u, world) {
  if ((u.scale || 1) > 1.5) return false;
  const b = nearest(u, [...world.buildings.values()].filter(b => b.defId === "bench" && world.isDone(b) && !b.sitter && Math.hypot(b.door.x - u.x, b.door.z - u.z) < 16), b => [b.door.x, b.door.z]);
  if (!b || !startPath(u, world, b.door.x, b.door.z)) return false;
  b.sitter = u.unitId; u.sitOn = b.id; u.state = US.GoSit; u.activity = "rest"; return true;
}
function standUp(u, world) {
  const b = u.sitOn && world.buildings.get(u.sitOn); if (b) { if (b.sitter === u.unitId) b.sitter = null; if (u.state === US.Sit) { u.x = b.door.x + 0.5; u.z = b.door.z + 0.5; } }
  u.sitOn = null; u.sitY = null;
}
// 체질(chrono.js: 아침형·야행성). 잠은 밤낮이 아니라 기력으로(CH.SLEEP_BELOW 이하면 자고 CH.WAKE_AT이면 깸, CH.FAINT_AT 아래면 쓰러짐)
/** 더 잘까: 기력이 아직 가득(피로 0)이 아니고, 아주 배고프지 않고(CH.SLEEP_HUNGRY — 깨어 있을 때 문턱 J.HUNGRY보다 낮음), 축제에 갈 만큼 깨어 있지 않음 */
const keepSleeping = (u, world) => (u.needs?.energy ?? 100) < CH.WAKE_AT && (u.full ?? 80) >= CH.SLEEP_HUNGRY && !festAwake(u, world);
/** 자는 중인가(밖 잠·조는 중·건물 안 잠) */
const asleep = u => u.state === US.Sleep || u.state === US.Faint || (!!u.insideBuildingId && u.insideAct === "sleep");
/** 집에 가는 길이 막혔을 때 그 자리에서 졸며 집 길을 다시 보는 간격(초): 아직 막혔으면 계속 졸고, 뚫렸으면 깨서 집으로(매 프레임 길찾기·상태 떨림 없게) */
export const BLOCKED_NAP = 20;
/** 잠자리(밤잠·지쳐서 자는 잠 모두):
 *  · 다 지은 내 집이 있으면 늘 내 집(멀어도). 길이 막혀 못 가면 그 자리에서 졸며(u.nap) BLOCKED_NAP초마다 집 길을 다시 봄(뚫리면 깨서 집으로)
 *  · 집이 없으면(아직 못 삼) 주인 없는 다 지은 빈 집에서 손님으로(가까운 3채 중 갈 수 있는 곳, 주인은 안 됨)
 *  · 그것도 없으면 밖에서 잠: 말풍선 + 만족도 하락(u.sleptOutAt → roads.js ROUGH_SAT, ROUGH_SECS 동안)
 *  남의 집·카페 같은 다른 건물에서는 자지 않음. 늘 true */
function startSleep(u, world, rnd) {
  const home = u.home && world.buildings.get(u.home), d = b => Math.hypot(b.door.x - u.x, b.door.z - u.z);
  const go = (b, say) => { u.state = US.GoToBuilding; u.targetBuildingId = b.id; u.sleepy = true; chatter(u, say, world, 2.4); return true; };
  if (home && world.isDone(home)) {
    if (startPath(u, world, home.door.x, home.door.z)) return go(home, CH.offHours(u, world) ? (CH.isNocturnal(u) ? "해가 떴네… 자야지" : "졸려… 집에 가야지") : "졸려… 집에 가서 자야지");
    setIdle(u, rnd, world, BLOCKED_NAP); u.state = US.Sleep; u.nap = true; emote(u, "🏠 집에 가는 길이 막혔어… 잠깐만 졸자", 2.6); return true;
  }
  const spare = [...world.buildings.values()].filter(b => b.id !== u.home && !b.owner && BUILDINGS[b.defId].house && world.isDone(b) && world.canFit(u, b)).sort((a, b) => d(a) - d(b)).slice(0, 3);   // "집"은 BUILDINGS.house(경제 없는 섬의 isHouse는 의원·시장·카페까지 들어가 손님 잠자리로 고르면 안 됨)
  for (const b of spare) if (startPath(u, world, b.door.x, b.door.z)) return go(b, "🏠 빈 집에서 하룻밤 신세 좀 질게");
  setIdle(u, rnd, world, 10 + rnd() * 6); u.state = US.Sleep; u.nap = false;
  if (world.economy) u.sleptOutAt = world.time || 0;
  emote(u, "🌙 집이 없으니 밖에서 자야지…", 2.6); return true;
}
// ---------------------------------------------------------------- 쓰러짐(chrono.js FAINT_AT·FAINT_LIE)
/** 쓰러질까: 깨어 밖에 있고(건물 안·잠·들림·배·헤엄 아님) 기력이 FAINT_AT 이하. 한 번 쓰러지면 기력이 잠 문턱(20) 위로 올라와야 다시 쓰러질 수 있음
 *  (배고파 깬 갈매미가 기력 2 근처에서 먹으러 가다 곧장 또 쓰러지지 않게. 저장 안 함 — 불러오면 처음부터) */
const canFaint = u => !!u.needs && u.needs.energy <= CH.FAINT_AT && u.faintArm !== false && !u.insideBuildingId && !asleep(u) && u.state !== US.Held && !u.sailing && !u.swimming;
/** 그 자리에서 쓰러짐: 하던 일·맡은 공사를 내려놓고(은행 짐은 창고로) FAINT_LIE초 누워 있음(😵). 알림 한 줄(world "faint") */
function faintNow(u, world) {
  uncommit(u, world); setIdle(u, null, world, CH.FAINT_LIE);
  u.state = US.Faint; u.faintArm = false; u.sleepy = false; u.activity = null;
  emote(u, "😵", CH.FAINT_LIE); world.emit?.("faint", { u, clinic: !!world.clinicFor?.(u) });
}
/** 누워 있다 깨어나는 대신: 빈 침대가 있는 병원이 있으면 실려 가(문 앞으로 옮겨져 바로 들어감) 침대에서 잠(진료비 World.faintCarried),
 *  없으면 그 자리에서 잠(밖 잠: 기력이 가득 찰 때까지, 배고프면 깸 — 보통 잠과 같음) */
function afterFaint(u, world, rnd) {
  const b = world.clinicFor?.(u);
  if (b) {
    setIdle(u, rnd, world, 0); u.x = b.door.x + 0.5; u.z = b.door.z + 0.5; u.y = world.grid.walkHeight?.(b.door.x, b.door.z) ?? u.y;
    u.sleepy = true; enterBuilding(u, b, rnd, world); u.carried = true; world.faintCarried?.(u, b); return;
  }
  setIdle(u, rnd, world, 10 + rnd() * 6); u.state = US.Sleep; u.nap = false; emote(u, "💤", 2.5);
}
/** 축제 모이기: 광장 둘레(1.5~4칸)의 빈 자리로 걸어감. 갈 수 있으면 true */
function startGather(u, world, rnd) {
  const f = world.festival;
  for (let k = 0; k < 6; k++) {
    const a = rnd() * Math.PI * 2, d = 1.5 + rnd() * 2.5, spot = nearestWalkable(world.grid, Math.floor(f.x + Math.cos(a) * d), Math.floor(f.z + Math.sin(a) * d), 2);
    if (spot && !world.grid.doorOwner(spot[0], spot[1]) && startPath(u, world, spot[0], spot[1])) { u.state = US.GoFest; return true; }
  }
  return false;
}
/** 광장에 닿음: 함께한 갈매미로 적고, 광장을 보며 폴짝 뛰고(♪·🎉), 재미·친구 욕구가 차고, 곁에 있는 축제 친구와 조금 친해짐. 가끔은 신나서 뛰어다님 */
function partyAt(u, world, rnd) {
  const f = world.festival; if (!f.who.includes(u.unitId)) f.who.push(u.unitId);
  u.path = null; face(u, f.x, f.z); u.state = US.Greet;
  if (u.needs) { u.needs.fun = Math.min(100, u.needs.fun + FESTIVAL_FUN); u.needs.social = Math.min(100, u.needs.social + FESTIVAL_FUN); }
  const pal = nearest(u, world.units.filter(o => o !== u && visible(o) && f.who.includes(o.unitId) && Math.hypot(o.x - u.x, o.z - u.z) < 4), o => [o.x - 0.5, o.z - 0.5]);
  if (!(pal && world.befriend(u, pal, FESTIVAL_PAL))) emote(u, pick(["♪", "🎉", "✨", "♪♪", "축제다!"], rnd), 2);   // 사이가 한 단계 올랐으면 그 말풍선을 그대로 둠
  doOnce(u, "Jump", null, () => { setIdle(u, rnd, world, 0.6 + rnd() * 1.8); if (rnd() < 0.3) startActivity(u, "zoomies", world, rnd); });
}
/** 🗝 이야기 모임(world.gather: 엔딩 연출·엔딩 뒤 노을 모임): 등대 앞 둘레 자리로 걸어감. 난수를 쓰지 않음(갈매미 차례로 자리를 나눔). 갈 수 있으면 true */
function startStoryGather(u, world) {
  const g = world.gather, i = Math.max(0, world.units.indexOf(u)), n = Math.max(1, world.units.length); u.gathered = g.id;
  for (let k = 0; k < 4; k++) {
    const a = Math.atan2(g.lz - g.z, g.lx - g.x) + Math.PI + ((i + 0.5) / n - 0.5) * Math.PI * 1.2 + k * 0.4, d = 2 + (i % 3) * 0.8 + k * 0.5;   // 등대 앞(바다를 등지지 않게 뒤쪽 반원)
    const spot = nearestWalkable(world.grid, Math.floor(g.x + Math.cos(a) * d), Math.floor(g.z + Math.sin(a) * d), 2);
    if (spot && !world.grid.doorOwner(spot[0], spot[1]) && startPath(u, world, spot[0], spot[1])) { u.state = US.GoGather; return true; }
  }
  return false;
}
/** 모임 자리에 닿음: 수평선을 보며 "매앰!" 하고 모임이 끝날 때까지 서 있음 */
function gatherAt(u, world, rnd) {
  const g = world.gather; u.path = null; face(u, g.lx, g.lz);
  setIdle(u, rnd, world, Math.max(2, Math.min(25, g.t))); face(u, g.lx, g.lz); emote(u, g.kind === "ending" ? "매앰!" : world.units.indexOf(u) % 2 ? "매앰~" : "🌅", 3);
}
// ---------------------------------------------------------------- 추위(climate.js)
/** 들어가 몸을 녹일 수 있는 공공건물(다 지은 것): 은행·시장·저장고·카페·잡화점·우체국·수족관·병원 */
const SHELTER = new Set(["bank", "market", "storehouse", "cafe", "shop", "post", "aquarium", "clinic", "hospital"]);
/** 추우면 몸 녹이러: 집이 있으면 집, 카페가 더 가깝고 돈이 있으면 카페에서 코코아(2🪙 → 금고, 체온 +0.6), 집이 없으면 가까운 공공건물(무료).
 *  맡은 공사는 그대로 둠(녹고 나면 바로 돌아감). 난수를 쓰지 않음. 갈 수 있으면 true */
function startWarm(u, world) {
  const d = b => Math.hypot(b.door.x + 0.5 - u.x, b.door.z + 0.5 - u.z), all = [...world.buildings.values()].filter(b => world.isDone(b));
  const home = u.home && world.buildings.get(u.home), homeOk = home && world.canEnter(u, home) ? home : null;
  const cafe = all.filter(b => b.defId === "cafe").sort((a, b) => d(a) - d(b))[0], rich = (u.coins || 0) >= CLIM.COCOA_PRICE;
  const order = [], cafeFirst = cafe && rich && (!homeOk || d(cafe) < d(homeOk));
  if (cafeFirst) order.push([cafe, true]);
  if (homeOk) order.push([homeOk, false]);
  // 집 문까지 길이 끊겼으면(시뮬 마을에서 씨앗마다 1~2채) 카페 코코아 → 가까운 공공건물로 이어서 찾음(예전엔 집이 있으면 집 하나만 보고 포기해 겨울 내내 밖에서 떨었음)
  if (cafe && rich && !cafeFirst) order.push([cafe, true]);
  for (const b of all.filter(b => SHELTER.has(b.defId) && !(rich && b === cafe)).sort((a, b) => d(a) - d(b)).slice(0, 3)) order.push([b, false]);
  for (const [b, cocoa] of order) if (startPath(u, world, b.door.x, b.door.z)) {
    u.state = US.GoToBuilding; u.targetBuildingId = b.id; u.goFor = "warm"; u.cocoa = cocoa;
    emote(u, cocoa ? "🥶 코코아 마시러" : b === homeOk ? "🥶 집에서 몸 녹여야지" : "🥶 몸 녹이러", 2.2); return true;
  }
  return false;
}
/** 지금 밖에 나가 있으면 추워질까(체온 목표가 추움 문턱 이하): 체질과 어긋난 시간(아침형의 밤)에 몸 녹이는 중이면 기력이 가득 찰 때까지 안에서 쉼 */
const outdoorCold = (u, world) => CLIM.bodyTarget(CLIM.feelTemp(world.air ?? world.airNow?.() ?? CLIM.NEUTRAL_AIR, { warmth: world.warmthOf?.(u) ?? 0, name: u.name })) <= CLIM.COLD_AT;
// ---------------------------------------------------------------- 병(health.js)
/** 아프면 쉬러: 빈 침대가 있는 의원 → 내 집 → 가까운 공공건물. 피곤하면(기력 TIRED 아래) 맡은 공사도 내려놓음(은행 짐은 창고로). 난수 안 씀. 갈 수 있으면 true */
function startSickRest(u, world) {
  if (u.committed && (u.needs?.energy ?? 100) < M.TIRED) uncommit(u, world);
  const home = u.home && world.buildings.get(u.home), homeOk = home && world.canEnter(u, home) ? home : null;
  const d = b => Math.hypot(b.door.x + 0.5 - u.x, b.door.z + 0.5 - u.z);
  const shelters = [...world.buildings.values()].filter(b => world.isDone(b) && SHELTER.has(b.defId) && !BUILDINGS[b.defId].clinic).sort((a, b) => d(a) - d(b)).slice(0, 3);   // 의원·집에 못 가면(집 문까지 길이 끊김 등) 가까운 공공건물에서
  for (const b of [world.clinicFor?.(u), homeOk, ...shelters]) if (b && startPath(u, world, b.door.x, b.door.z)) {
    u.state = US.GoToBuilding; u.targetBuildingId = b.id; u.goFor = "sick"; emote(u, BUILDINGS[b.defId].clinic ? "🤧 병원에 가 볼래…" : b === homeOk ? "🤧 집에서 쉬어야지" : "🤧 따뜻한 데서 쉬어야지", 2.2); return true;
  }
  return false;
}
/** 당번 의사: 맡은 의원에 누운 환자가 있으면 의원으로 */
function startDoctor(u, world) {
  const b = !u.sick && world.dutyClinic?.(u); if (!b || !world.patientsIn(b) || !startPath(u, world, b.door.x, b.door.z)) return false;
  u.state = US.GoToBuilding; u.targetBuildingId = b.id; u.goFor = "doctor"; emote(u, "🩺 진료하러!", 2.2); return true;
}
/** 회복: 있는 곳에 따라 left를 깎고(밖 0.5 · 건물 안 1 · 잠 2 · 의원 3 · 의원+당번 의사 4.5, 약 ×1.5), 다 깎으면 나음. 면역 시간도 줄임 */
function healthTick(u, dt, world) {
  if (u.immune > 0) u.immune = Math.max(0, u.immune - dt);
  const s = u.sick; if (!s) return;
  const b = u.insideBuildingId && world.buildings.get(u.insideBuildingId);
  const where = !b ? "out" : BUILDINGS[b.defId].clinic ? (world.doctorIn?.(b) ? "doctor" : "clinic")
    : u.insideAct === "sleep" || (u.useFurni && FURNITURE[u.useFurni.id]?.use === "sleep") ? "bed" : "inside";
  if ((s.left -= HL.recoverRate(where, s.med) * dt) <= 0) world.heal?.(u, where);
}
/** 건물 안에 더 있을 까닭(몸 녹이는 중 · 앓는 중 · 당번 진료 중). 배고프면 나와서 먹음 */
function keepInside(u, world) {
  if ((u.full ?? 80) < J.HUNGRY) return false;
  if (u.insideAct === "sick") return !!u.sick;
  if (u.insideAct === "doctor") { const b = world.buildings.get(u.insideBuildingId); return !!b && !u.sick && world.patientsIn(b) > 0; }
  if (u.insideAct === "warm") return (u.bodyT ?? CLIM.BODY_NORMAL) < CLIM.WARM_DONE || (CH.offHours(u, world) && (u.needs?.energy ?? 100) < CH.WAKE_AT && outdoorCold(u, world));
  return false;
}
/** 지쳤을 때 먹기보다 잠을 먼저 하는 포만감: 자는 중 배고파 깨는 문턱(CH.SLEEP_HUNGRY 20)보다 5 위 — 잠들자마자(8초 확인마다) 배고파 깨는 떨림이 없게.
 *  25에서 잠들면 자는 중 배고픔(0.25 × 0.2 = 0.05/초)으로 20까지 100초는 잠 */
export const SLEEP_EAT_FIRST = CH.SLEEP_HUNGRY + 5;
/** 기력이 잠 문턱 아래로 떨어지면 멈추고 자러 가는 상태(일·일하러 가는 길·놀이) */
const SLEEP_STOPS = new Set([US.Build, US.Chop, US.Mine, US.Fish, US.Farm, US.Trade, US.GoBuild, US.GoChop, US.GoMine, US.GoFish, US.GoFarm, US.GoTrade, US.Wander, US.Visit, US.Zoomies, US.Curious, US.GoSwim, US.GoImprove, US.Improve, US.Forage]);
const WORKING = new Set(["Chop", "Mine", "Build", "Farm", "Trade", "Fish", "Improve"]);   // 일하는 중(체감 +2) = 욕구의 "일"과 같은 상태
/** 체온 한 걸음: 밖이면 공기 기온, 안이면 실내 기온(늘 쾌적) + 옷 + 일 + 종족 덤 + 축제 광장 열기. 처음 추워지면 feltCold +1, 마을 하루 한 번 chill 알림 */
function bodyTick(u, dt, world) {
  const air = world.air ?? CLIM.NEUTRAL_AIR, inside = !!u.insideBuildingId, f = world.festival;
  const extra = !inside && f && Math.hypot(f.x - u.x, f.z - u.z) <= CLIM.FEST_HEAT_R ? CLIM.FEST_HEAT : 0;
  const working = !inside && WORKING.has(u.state), feel = CLIM.feelTemp(inside ? CLIM.indoorTemp(air) : air, { warmth: world.warmthOf?.(u) ?? 0, working, name: u.name, extra });
  u.chilly = !inside && feel - (working ? CLIM.WORK_HEAT : 0) < HL.CHILL_DAY;     // 추운 날 밖(일하는 열은 빼고): 젖음·과로 감기 굴림의 조건
  u.wet = HL.stepWet(u.wet, { inside, weather: world.weather?.kind, chilly: u.chilly }, dt); u.workRun = HL.stepWorkRun(u.workRun, { inside, working, chilly: u.chilly }, dt);
  const was = u.bodyT ?? CLIM.BODY_NORMAL, now = CLIM.stepBody(was, CLIM.bodyTarget(feel), dt, CLIM.bodyTau(u.name)); u.bodyT = now;
  if (was > CLIM.COLD_AT && now <= CLIM.COLD_AT) world.noteChill?.(u);
}
/** 축제가 열려 있고 너무 지치지 않았는가(이럴 땐 자다가도 깨어 광장에 감. 지쳤으면 그대로 잠) */
const festAwake = (u, world) => !!world.festival && (u.needs?.energy ?? 100) > CH.SLEEP_BELOW;
function chooseNext(u, world, rnd) {
  // 배고프면 먼저 먹음. 음식이 넉넉하면(30 넘게) 배가 덜 고파도 먹어서 너무 부를 수 있음.
  // 다만 지쳤고(기력 20 이하) 아주 배고프진 않으면(포만감 SLEEP_EAT_FIRST 이상) 잠부터: 먹을 것 찾으러 가는 길(바닷가)에 기력이 바닥나 쓰러지지 않게
  const sleepFirst = u.needs && u.needs.energy <= CH.SLEEP_BELOW && (u.full ?? 80) >= SLEEP_EAT_FIRST;
  if (!sleepFirst && ((u.full ?? 80) < J.HUNGRY || (world.res.food > 30 && (u.full ?? 80) < 75))) { if (startActivity(u, "eat", world, rnd)) return; }
  // 아프면 쉬러(의원 → 집), 추우면(체온 39.0 이하) 몸부터 녹임: 집 · 카페 코코아 · 공공건물(난수 안 씀 → 안 추운 계절엔 예전과 똑같음)
  if (u.sick && startSickRest(u, world)) return;
  if (CLIM.isCold(u.bodyT) && startWarm(u, world)) return;
  // 축제의 날: 맡은 공사가 없고 너무 지치지 않았으면 광장에 모여 놂
  if (festAwake(u, world) && !u.committed && rnd() < FESTIVAL_JOIN_CHANCE && startGather(u, world, rnd)) return;
  // 🗝 이야기 모임(엔딩·노을): 맡은 공사가 없고 지치지 않았으면 등대 앞으로(한 모임에 한 번, 난수 안 씀)
  if (world.gather && u.gathered !== world.gather.id && !u.committed && (u.needs?.energy ?? 100) > CH.SLEEP_BELOW && startStoryGather(u, world)) return;
  // (예전 '밤이면 무조건 잠'은 없음: 밤에도 기력이 남아 있으면 일함. 잠은 아래 '지치면 잠'(기력 CH.SLEEP_BELOW 이하) 하나)
  if (startDoctor(u, world)) return;                                               // 당번 의사: 맡은 의원에 환자가 있으면 진료하러(난수 안 씀)
  if (u.committed && !(u.needs && u.needs.energy <= CH.SLEEP_BELOW) && startActivity(u, "build", world, rnd)) return;   // 맡은 공사가 먼저(지쳤으면 아래에서 잠부터 — 공사는 맡은 채)
  // 피곤하면(기력 TIRED 아래) 심부름(가공·은행·시장·저장고·장보기)을 새로 시작하지 않고 아래에서 먼저 쉼: 상인이 가공 → 은행을 쉬지 않고 이어 가다 기력이 바닥나지 않게
  if (world.economy && (u.needs?.energy ?? 100) >= M.TIRED) {
    if (u.job === "merchant") {                                                  // 상인: 가공품은 은행에, 원자재는 가공
      if (E.total(u.goods) > 0 && (world.bankCanBuy?.(u) ?? true) && startActivity(u, "deposit", world, rnd)) return;   // 오늘 한도로 못 파는 가공품만 있으면 은행에 가지 않음(헛걸음 없음, 다음 날 팖)
      if (E.total(u.raw) >= 3 && startActivity(u, "process", world, rnd)) return;
    }
    if (E.isProducer(u) && world.granaryB() && E.meals(u) >= E.FOOD_KEEP + 5 && world.granary < E.GRANARY_MAX && (world.granaryCanBuy?.() ?? true) && startActivity(u, "stock", world, rnd)) return;   // 남는 음식은 저장고에(은행이 못 사는 날은 안 감)
    const n = E.total(E.rawOf(u));
    if (!u.committed && (n >= E.CARRY || (n >= 2 && rnd() < 0.2)) && startActivity(u, "sell", world, rnd)) return;   // 원자재가 모이면 시장(상인)에 팖
    if (!u.committed && E.total(stashSellable(u)) >= STASH_SELL_AT && (world.stashCanSell?.(u) ?? true) && startActivity(u, "peddle", world, rnd)) return;   // 팔 소지품이 모이면 시장에 팖(좋아하는 건 하나씩 간직, 난수 안 씀). 은행이 못 사는 날은 안 감(헛걸음 되풀이 방지)
    if (!u.home && world.marketB()) {                                            // 집이 없고 돈이 모이면 시장에서 집을 삼(단짝과 같은 집·옆집이 있으면 그 집부터, 다음은 싼 집)
      const pal = M.bestieOf(u, world.units), palHome = pal?.home ? world.buildings.get(pal.home) : null, nearPal = b => b === palHome ? 2 : areNeighbors(b, palHome) ? 1 : 0;
      const deals = world.housesForSale(u).map(b => [b, world.houseDeal(u, b)]);   // 집값을 다 가졌거나, 계약금이 있고 금고가 빌려줄 수 있으면(bank.js)
      const shares = (world.housesToShare?.(u) || []).map(b => [b, world.shareDeal(u, b)]);   // 자리가 남은 2층집에 같이 살기(집값 절반을 주인에게, homes.js)
      if (!deals.some(([, d]) => d.ok) && !shares.some(([, d]) => d.ok)) { const v = deals.find(([, d]) => d.reason === "vault"); if (v) world.refuseLoan(u, v[1]); }   // 금고가 비어 대출 거절(한 사태에 한 번 말풍선)
      const cost = ([b, d]) => d.share ?? BUILDINGS[b.defId].price;
      const h = [...deals, ...shares].filter(([, d]) => d.ok).sort((a, c) => nearPal(c[0]) - nearPal(a[0]) || cost(a) - cost(c))[0];
      if (h && startActivity(u, "market", world, rnd)) { const share = h[1].share != null; u.shop = { kind: share ? "share" : "house", b: h[0].id }; emote(u, share ? "같이 살 집 구하러!" : "집 사러!"); return; }
    }
    const home = u.home && world.buildings.get(u.home), shop = world.shopB();
    // 추웠던 적이 있으면 잡화점에서 옷을 삼(목도리 → 외투, 밥값 두 번어치는 남김). 난수를 안 써서 안 추운 계절엔 예전과 똑같음
    const cw = shop && (u.feltCold || 0) >= 1 ? CLO.nextClothes(u) : null, cdef = cw && CLOTHES[cw];
    if (cdef && (u.coins || 0) >= cdef.price + 2 * world.foodPrice() && startPath(u, world, shop.door.x, shop.door.z)) { u.state = US.GoMarket; u.shop = { kind: "clothes", id: cw }; emote(u, `추웠으니 ${cdef.name} 사야지 ${cdef.icon}`, 2.4); return; }
    if (home && shop && rnd() < 0.35) {                                           // 집이 있으면 남는 돈으로 잡화점에서 가구를 삼(밥값 두 번어치는 남김)
      const want = F.nextWant(home), price = want && FURNITURE[want].price;
      if (want && (u.coins || 0) >= price + 2 * world.foodPrice() && startPath(u, world, shop.door.x, shop.door.z)) { u.state = US.GoMarket; u.shop = { kind: "furnish", id: want }; emote(u, `${FURNITURE[want].name} 사러!`); return; }
    }
  }
  // 만족도가 낮으면(75 아래) 스스로 동네를 고침: 집 앞 마당 고르기 · 장식 주문. 낮을수록 더 자주(길은 깔지 않고 부탁만 — 아래 askRoad)
  if (askRoad(u, world, rnd)) return;                                         // 집이 시장·은행과 길로 안 이어졌으면 가끔 멈춰 서서 길을 부탁(말풍선)
  if (world.economy && (u.sat ?? 100) < 75 && !u.committed && (u.needs?.energy ?? 100) >= M.TIRED && rnd() < (75 - (u.sat ?? 75)) / 75 + 0.12 && startImprove(u, world, rnd)) return;
  if (J.isLazy(u) && rnd() < 0.5) { startActivity(u, "rest", world, rnd); chatter(u, pick(["z", "배불러…", "…"], rnd), world); return; }   // 너무 불러서 뒹굴
  if (u.needs && u.needs.energy <= CH.sleepBelow(u, world) && startActivity(u, "sleep", world, rnd)) return;   // 지치면 잠(밤낮·체질 상관없이 기력 20 이하)
  // 피곤하면(기력 TIRED 아래) 잠깐 숨 돌림 — BREATH_EVERY초에 한 번만: 매번 쉬면 숨 돌리기가 기력을 30 가까이 붙잡아 잠 문턱 20까지 안 내려감
  if (u.needs && u.needs.energy < M.TIRED && !((world.time || 0) - (u.breathAt ?? -1e9) < M.BREATH_EVERY)) { startActivity(u, "rest", world, rnd); chatter(u, pick(["🥱 좀 쉬자", "😮‍💨 피곤해", "후…"], rnd), world); return; }
  // 성격 + 직업 특기 × 욕구(급한 욕구를 채우는 일) × 배운 취향(해 보니 좋았던 일)
  let opts = J.activityWeights(u).map(([k, w]) => [k, w * M.needMult(u, k) * M.prefMult(u, k)]);
  if (u.sick) opts = opts.map(([k, w]) => [k, w * HL.sickWeight(u, k)]);       // 아프면 일 ×0.5 · 집 구경 ×3(집도 의원도 못 가는 갈매미)
  if ((world.time || 0) - (u.breathAt ?? -1e9) < M.BREATH_EVERY) opts = opts.map(([k, w]) => [k, k === "rest" ? 0 : w]);   // 방금 숨 돌렸으면 쉬기는 BREATH_EVERY초 뒤에(기력 30~50에서 숨 돌리기가 거듭돼 잠 문턱을 막지 않게)
  // 고른 일을 못 하면(공사장 없음·자리 없음…) 그 일을 빼고 다시 뽑음. 제 직업 일이 안 되면 먼저 대신 도울 일(J.helpJobs)을 해 봄.
  // 끝내 할 일이 없으면 쉬지 않고 산책(안 피곤한데 서서 쉬지 않게), 그것도 안 되면 잠깐 숨만 고르고 다시 고름.
  const skill = J.jobOf(u)?.skill; let helped = false;
  while (opts.length) {
    let r = rnd() * opts.reduce((s, [, w]) => s + w, 0), i = opts.length - 1;
    for (let k = 0; k < opts.length; k++) if ((r -= opts[k][1]) <= 0) { i = k; break; }
    const kind = opts[i][0];
    if (startActivity(u, kind, world, rnd)) return;
    opts.splice(i, 1);
    if (kind === skill && !helped) { helped = true; if (helpOut(u, world, rnd)) return; }
  }
  if (!helped && helpOut(u, world, rnd)) return;
  if (startActivity(u, "wander", world, rnd)) return;
  setIdle(u, rnd, world);
}
/** 제 일거리가 없을 때 다른 일을 도움(일손 돕기). 시작했으면 true */
function helpOut(u, world, rnd) {
  for (const k of J.helpJobs(u, world.res)) if (startActivity(u, k, world, rnd)) { chatter(u, pick(HELP_SAY[k] || ["일손 돕기!"], rnd), world, 2); return true; }
  return false;
}
const HELP_SAY = { chop: ["🪓 나무 해 올게!", "일손 돕기!"], mine: ["⛏ 돌 캐 올게!", "일손 돕기!"], fish: ["🎣 낚시 도울게!", "일손 돕기!"] };

/** 같은 집 안에서 다른 갈매미가 쓰는 가구(둘이 사는 2층집에서 한 침대에 둘이 눕지 않게) */
const busyIn = (u, b, world) => (world?.units || []).filter(o => o !== u && o.insideBuildingId === b.id && o.useFurni).map(o => o.useFurni);
export function enterBuilding(u, b, rnd, world = null) {
  release(u);
  const act = u.activity, sleepy = u.sleepy, go = u.goFor; u.activity = null; u.sleepy = false; u.goFor = null;
  release(u);
  u.state = US.Inside; u.insideBuildingId = b.id; u.timer = sleepy ? 15 + rnd() * 10 : 6 + rnd() * 8; u.path = null; u.goal = null; u.running = false;
  u.insideAct = sleepy ? "sleep" : go || act;                                     // go: 몸 녹이러("warm") 들어온 것
  u.useFurni = HM.livesIn(b, u) ? F.pickUse(b, sleepy || go === "sick", rnd, busyIn(u, b, world)) : null;   // 자기 집(주인·같이 사는 갈매미)이면 가구를 씀(침대에서 낮잠 등, 아프면 침대에서 쉼). 남이 쓰는 침대는 피함
  if (u.useFurni && FURNITURE[u.useFurni.id].use === "sleep") u.timer += 6;
  if (!b.occupants.includes(u.unitId)) b.occupants.push(u.unitId);
}
export function exitBuilding(u, world, rnd) {
  const b = world.buildings.get(u.insideBuildingId);
  if (b) b.occupants = b.occupants.filter(id => id !== u.unitId);
  const spot = b ? nearestWalkable(world.grid, b.door.x, b.door.z) : nearestWalkable(world.grid, Math.floor(u.x), Math.floor(u.z));
  if (spot) { u.x = spot[0] + 0.5; u.z = spot[1] + 0.5; }
  u.insideBuildingId = null; u.activity = u.insideAct || null; u.insideAct = null; u.useFurni = null; u.dressT = 0; u.carried = false;   // 나서면 바로 옷을 고름 · 병원에 실려 왔던 것도 끝
  done(u, 0.7, rnd, world);                                                // 집 구경·잠 = 좋은 경험
  if (u.lodgeSay) { chatter(u, u.lodgeSay, world, 2.4); u.lodgeSay = null; }        // 빈 집에서 자고 나오면 숙박비 말풍선(안에 있을 땐 바깥 화면에 말풍선이 안 보임)
}

/** 건물을 옮겼을 때(world/relocate.js): 그 건물로 가던 갈매미는 새 문으로, 짓던 갈매미는 새 공사장 옆으로 길을 다시 찾음(못 찾으면 그만둠).
 *  망치질하던 갈매미는 이번 바퀴 재료를 이미 썼으므로 도착하면 재료를 또 쓰지 않고 바로 망치질(u.paidCycle) */
export function rerouteMoved(u, world, b, rnd) {
  if (u.insideBuildingId || u.state === US.Held) return;
  if (u.state === US.GoToBuilding && u.targetBuildingId === b.id) { if (!startPath(u, world, b.door.x, b.door.z, u.running)) setIdle(u, rnd, world); return; }
  if (u.focus === b && (u.state === US.GoBuild || u.state === US.Build)) {
    const paid = u.state === US.Build || !!u.paidCycle, s = world.workSpot(b);
    if (!s || !startPath(u, world, s.x, s.z)) { setIdle(u, rnd, world); return; }
    u.state = US.GoBuild; u.work = null; u.anim = null; u.tool = null; u.once = null; u.paidCycle = paid;
  }
}
// ---------------------------------------------------------------- 매 프레임
/** 기분 말풍선: 20~40초마다(갈매미마다 엇갈리게), 다른 말풍선이 없을 때 지금 기분을 보여 줌. 난수(rnd)는 안 씀(마을 진행에 영향 없음) */
const MOODS = { sleep: ["💤", "zZ…"], hungry: ["배고파…", "먹고 싶다…", "꼬르륵…"], tired: ["😮‍💨 피곤해", "🥱 쉬고 싶다"], happy: ["😊", "♪", "☺️ 좋다", "🌸 기분 좋아"], sit: ["☕ 편하다", "😌", "♪ 쉬는 중"], read: ["📖 재밌다", "📚 음…", "💭 그렇구나"], sad: ["😞", "😟 별로야…"], cold: ["🥶 추워", "❄️ 으슬으슬"], hot: ["🥵 더워", "🍦 시원한 거…"], sick: ["🤧 에취!", "🤒 으슬으슬…", "🤧 콜록"] };
/** 배고픔 혼잣말: 갈매미마다 3~4가지를 돌려 씀(반말 혼잣말, 초안 — 갈매미 목소리는 사용자가 고쳐 쓰기 좋게 여기 한곳에). 없는 이름은 MOODS.hungry */
export const HUNGRY_SAY = {
  "기본": ["배가 출출하네…", "밥때가 됐나", "뭐 좀 먹을까", "꼬르륵…"],
  "목수": ["배고프면 망치도 무겁지", "한 입만 먹고 하자", "생선 한 마리면 딱인데"],
  "미니": ["배고파아…", "꼬르륵 소리 났다!", "작은 거라도 먹고 싶어", "씨앗 한 톨이라도…"],
  "자이언트": ["배가 텅 비었어…", "큰 물고기 먹고 싶다", "꼬르르르륵…", "한 솥은 먹겠다"],
  "꽃": ["꽃잎 말고 진짜 밥…", "배고파서 힘이 안 나", "따뜻한 거 먹고 싶다"],
  "황금": ["배고파도 장사는 해야지…", "뭐 사 먹을까", "꼬르륵… 이건 손해야"],
  "물방울": ["바다에 뭐 없나?", "물고기 냄새 난다…", "첨벙 해서 잡아 올까"],
  "불씨": ["배고파서 불씨가 꺼지겠어", "뜨끈한 거 먹고 싶어", "꼬르륵… 힘이 안 나"],
  "그림자": ["…배고프다", "조용히 뭐 좀 먹고 싶어", "밤참 생각나…"],
};
export function moodBubble(u, dt, world) {
  const id = Number.isFinite(u.unitId) ? u.unitId : 0;
  if ((u.moodT = (u.moodT ?? 8 + (id * 7) % 20) - dt) > 0 || u.emoteT > 0 || u.state === US.Held || u.state === US.Faint) return;
  u.moodT = 20 + ((id * 13 + Math.floor(world.time || 0)) % 21);
  const n = u.needs, sat = u.sat ?? 50, k = u.state === US.Sleep || u.sleeping || u.useFurni && FURNITURE[u.useFurni.id]?.use === "sleep" ? "sleep"
    : u.sick ? "sick" : (u.full ?? 80) < J.HUNGRY ? "hungry" : n && n.energy < 20 ? "tired"
    : u.useFurni && u.insideBuildingId ? (FURNITURE[u.useFurni.id]?.use === "read" ? "read" : FURNITURE[u.useFurni.id]?.use === "sit" ? "sit" : null) : !u.insideBuildingId && CLIM.isCold(u.bodyT) ? "cold" : !u.insideBuildingId && (u.bodyT ?? 40) >= CLIM.HOT_AT ? "hot"
    : sat >= 80 ? "happy" : sat < 30 ? "sad" : null;
  if (!k) return; const list = k === "hungry" ? HUNGRY_SAY[u.name] || MOODS.hungry : MOODS[k]; chatter(u, list[(id + Math.floor((world.time || 0) / 7)) % list.length] || list[0], world, 2.4, k === "hungry" ? "mood:hungry" : null);
}
export function updateUnit(u, dt, world, rnd = Math.random) {
  u.timer -= dt; if (u.emoteT > 0) u.emoteT -= dt;
  moodBubble(u, dt, world);
  if (u.clothes?.length && !u.insideBuildingId && (u.dressT = (u.dressT ?? 0) - dt) <= 0) { u.dressT = CLO.DRESS_EVERY; world.dressUnit?.(u); }   // 옷 갈아입기(나설 때·30초마다)
  bodyTick(u, dt, world); const cold = CLIM.isCold(u.bodyT);                     // 체온(추우면 배고픔 ×1.1 · 능률 ×0.85. 더위는 말풍선만 — 효과는 2단계)
  u.full = Math.max(0, (u.full ?? 80) - J.HUNGER_PER_SEC * (world.hungerScale ?? 1) * (world.fx?.hunger ?? 1) * dt * (cold ? CLIM.COLD_HUNGER : 1) * (asleep(u) ? CH.SLEEP_HUNGER : 1)); u.eff = J.efficiency(u.full);   // 배고파짐 → 능률
  const e0 = u.needs?.energy; M.tickNeeds(u, dt, u.state, !!u.insideBuildingId);
  if (u.needs && u.needs.energy < e0) {                                          // 기력이 닳을 때만: 아프면 ×1.5(health.js) · 체질과 어긋난 시간이면 ×CH.OFF_FATIGUE(아침형의 밤·야행성의 낮). 회복은 그대로
    const k = (u.sick ? HL.sickDef(u).energy : 1) * CH.fatigueMult(u, world);
    if (k !== 1) u.needs.energy = Math.max(0, u.needs.energy - (e0 - u.needs.energy) * (k - 1));
  }
  if (u.sick || u.immune > 0) healthTick(u, dt, world);
  if (u.useFurni && u.insideBuildingId && u.needs) {                              // 집 가구 쓰기: 침대 = 기력 회복이 M.SLEEP_GAIN.bed가 되게(건물 안 값에 더함), 앉기 = 조금 더, 책장 = 재미
    const k = FURNITURE[u.useFurni.id]?.use, n = u.needs;
    if (k === "sleep") n.energy = Math.min(100, n.energy + (M.SLEEP_GAIN.bed - M.SLEEP_GAIN.inside) * dt); else if (k === "sit") n.energy = Math.min(100, n.energy + 1 * dt); else if (k === "read") n.fun = Math.min(100, n.fun + 1.5 * dt);
  }
  if (u.carried && u.insideBuildingId && u.needs) u.needs.energy = Math.min(100, u.needs.energy + (M.SLEEP_GAIN.bed - M.SLEEP_GAIN.inside) * dt);   // 쓰러져 실려 온 병원 침대 = 침대 잠 빠르기
  if (u.insideBuildingId && u.needs && world.buildings.get(u.insideBuildingId)?.defId === "cafe") { u.needs.fun = Math.min(100, u.needs.fun + 2 * dt); u.needs.social = Math.min(100, u.needs.social + 1.5 * dt); }   // 카페: 재미·친구
  if (u.insideBuildingId && u.needs && world.buildings.get(u.insideBuildingId)?.defId === "aquarium") u.needs.fun = Math.min(100, u.needs.fun + 2.5 * dt);   // 수족관 구경: 재미
  if (u.needs && u.needs.energy < 15) u.eff *= 0.8;                       // 너무 지치면 일도 느림
  u.eff *= 0.85 + 0.3 * (u.sat ?? 50) / 100;                             // 만족도가 높으면 조금 더 빨리(0.85~1.15)
  if (cold) u.eff *= CLIM.COLD_EFF;
  if (u.sick) u.eff *= HL.sickDef(u).eff;                                 // 감기: 능률 ×0.7
  if (u.state === US.Held) return;                                       // 들려 있는 동안은 입력이 위치를 정함
  if (u.fuss?.pin) return;                                                // 깜짝 소동·어질어질(units/fuss.js)이 붙잡아 둔 동안도 그 모듈이 위치를 정함(욕구는 위에서 그대로 닳음)
  if (u.sailing) { sail(u, dt, world); return; }                          // 배 타는 중: 배가 닿을 때까지 다른 일은 안 함(닿으면 원래 하던 일의 길을 이어 감)
  if (!u.swimming && !u.insideBuildingId && world.grid.isWater(...cellOf(u)) && !world.grid.isWalkable(...cellOf(u))) {   // 헤엄 중이 아닌데 물에 있으면(헤엄을 그만둠 등) 가까운 땅으로(부두 위는 그대로)
    const spot = nearestWalkable(world.grid, ...cellOf(u)); if (spot) { u.x = spot[0] + 0.5; u.z = spot[1] + 0.5; u.anim = null; emote(u, "푸하!"); }
  }
  if ((u.needs?.energy ?? 0) > CH.SLEEP_BELOW) u.faintArm = true;
  if (canFaint(u)) faintNow(u, world);                                  // 기력이 0 가까이(FAINT_AT 이하) → 그 자리에서 쓰러짐
  if (u.once) {                                                         // 한 번 하는 동작이 끝날 때까지 기다림
    const o = u.once; o.t += dt;
    if (o.onHit && o.t >= o.hit) { const f = o.onHit; o.onHit = null; f(); }
    if (u.once === o && o.t >= o.len) { u.once = null; u.anim = null; o.then && o.then(); }
    return settle(u, dt, world);
  }
  const p = PERSONA[u.name] || PERSONA["기본"];
  // 너무 배고프면 하던 일(공사·벌목·채광·낚시·밭일·장사)을 멈추고 먼저 먹으러(맡은 공사는 유지)
  if ((u.full ?? 80) < 12 && [US.Build, US.Chop, US.Mine, US.Fish, US.Farm, US.Trade, US.GoBuild, US.GoChop, US.GoMine].includes(u.state) && !u.once) {
    emote(u, "배고파…"); setIdle(u, rnd, world, 0); return settle(u, dt, world);
  }
  // 지치면(기력 20 이하) 하던 일·놀이를 한 동작 끝에 멈추고 자러 감(맡은 공사는 유지): 일 한 바퀴·산책이 길어 20을 한참 지나 잠자리로 나서면
  //  가는 길(넓은 섬에서 평균 31초, 기력 −6)에 쓰러지기 쉬움. 먹으러·몸 녹이러·아파서 가는 길은 그대로
  //  배가 고파(포만감 SLEEP_EAT_FIRST 아래) 먹을 것을 사러·찾으러 가는 길이면 멈추지 않음(chooseNext가 먹기를 먼저 골라 멈추면 다시 그 길로 — 매 프레임 되풀이)
  if (u.needs && u.needs.energy <= CH.SLEEP_BELOW && SLEEP_STOPS.has(u.state) && !u.once && (u.full ?? 80) >= SLEEP_EAT_FIRST) {
    emote(u, "🥱 졸려…"); setIdle(u, rnd, world, 0);   // 곧장 잠자리로(아프면 병원·집, 추우면 몸 녹이러가 먼저 — chooseNext 순서). chooseNext에 맡기면 그 사이 서서 차는 기력(+0.06/프레임)으로
    if (!(u.sick && startSickRest(u, world)) && !(CLIM.isCold(u.bodyT) && startWarm(u, world))) startActivity(u, "sleep", world, rnd);   //  20을 막 넘어 일을 다시 고르고, 일하며 20 아래로 → 또 멈춤(0.1~0.3초마다 되풀이)
    return settle(u, dt, world);
  }
  // 반사 행동
  if (p.timid && visible(u) && ![US.Flee, US.Fish, US.GoFish, US.Inside, US.GoToBuilding, US.Swim, US.Faint].includes(u.state)) {
    const big = world.units.find(o => o !== u && visible(o) && (o.scale || 1) > 1.5 && Math.hypot(o.x - u.x, o.z - u.z) < 1.8);
    if (big) {
      setIdle(u, rnd, world); emote(u, "!"); M.befriend(u, big, -0.3);
      const dx = u.x - big.x, dz = u.z - big.z, d = Math.hypot(dx, dz) || 1;
      const spot = nearestWalkable(world.grid, Math.floor(u.x + dx / d * 4), Math.floor(u.z + dz / d * 4), 3);
      if (spot && startPath(u, world, spot[0], spot[1], true)) { u.state = US.Flee; return settle(u, dt, world); }
    }
  }
  if (p.loner && u.state === US.Idle && world.units.some(o => o !== u && visible(o) && Math.hypot(o.x - u.x, o.z - u.z) < 1.1)) {
    if (startActivity(u, "wander", world, rnd)) { u.state = US.Avoid; emote(u, "…"); }
  }
  if (moving(u) && u.moveT > (u.giveUp || GIVE_UP)) { setIdle(u, rnd, world); return settle(u, dt, world); }
  // 호기심: 근처에서 무슨 일이 생기면(집 완성·나무 쓰러짐·희귀 물고기·누가 옮겨짐) 쳐다보고, 가끔 가서 구경
  if (u.curious && [US.Idle, US.Wander].includes(u.state)) {
    const c = u.curious; u.curious = null;
    if (Math.hypot(c.x - u.x, c.z - u.z) < 9) {
      setIdle(u, rnd, world, 1 + rnd()); face(u, c.x, c.z);
      chatter(u, { building: "오!", tree: "와!", fish: "우와!", drop: "?", site: "뭐 짓지?" }[c.kind] || "!", world);
      if (rnd() < 0.4 && pathBeside(u, world, Math.floor(c.x), Math.floor(c.z))) { u.state = US.Curious; u.curiousAt = c; }
    }
  }

  // 밖에서 벤치에 앉아 있거나 자다가 추워지면 일어나 바로 몸 녹이러 감.
  //  녹일 곳이 없으면(지은 집·공공건물이 없거나 길이 끊김) 자던 갈매미는 그대로 자고(앉아 있던 갈매미는 일어나기만) 10초 뒤에 다시 봄:
  //  예전엔 깨자마자 다시 잠들어 두 프레임마다 깼다 잤다 했음(검토 재현: 녹일 곳 없는 겨울밤 60초에 상태 600번 바뀜)
  if (u.noWarmT > 0) u.noWarmT -= dt;
  if (cold && !u.insideBuildingId && (u.state === US.Sit || u.state === US.Sleep) && !(u.noWarmT > 0)) {
    const was = u.state, left = u.timer; u.anim = null; setIdle(u, rnd, world, 0);   // 벤치에서 일어남(secs를 주어 난수 안 씀)
    if (startWarm(u, world)) return settle(u, dt, world);
    u.noWarmT = 10; if (was === US.Sleep) { u.state = US.Sleep; u.timer = left; } else return settle(u, dt, world);   // 자던 갈매미는 그대로 계속 잠
  }

  switch (u.state) {
    case US.Idle:
      if (rnd() < dt * 0.25) {                                                        // 두리번: 가까이 있는 친구 쪽을 보거나 아무 데나
        const near = world.units.find(o => o !== u && visible(o) && Math.hypot(o.x - u.x, o.z - u.z) < 3);
        u.lookAt = near && rnd() < 0.6 ? Math.atan2(near.x - u.x, near.z - u.z) : u.heading + (rnd() * 2 - 1) * 1.2;
      }
      if (u.activity === "rest" && u.needs) u.needs.energy = Math.min(100, u.needs.energy + M.REST_GAIN * dt);   // 쉬기로 고른 쉼은 더 빨리 참
      if (u.activity === "rest" && u.timer <= 0) { M.learn(u, "rest", 0.3 + (100 - (u.needs?.energy ?? 100)) / 200); u.activity = null; }
      if (u.lookAt !== undefined) { let d = u.lookAt - u.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); u.heading += d * Math.min(1, 1.5 * dt); }
      if (u.timer <= 0) chooseNext(u, world, rnd);
      break;
    case US.Wander: case US.Avoid: case US.Flee:
      if (followPath(u, dt, world, rnd)) done(u, 0.4 + (100 - (u.needs?.fun ?? 100)) / 250, rnd, world); break;
    case US.Curious:
      if (followPath(u, dt, world, rnd)) { face(u, u.curiousAt.x, u.curiousAt.z); emote(u, pick(["오~", "멋지다", "흠흠"], rnd)); setIdle(u, rnd, world, 2 + rnd() * 2); }
      break;
    case US.Sleep:
      if ((u.emoteT ?? 0) <= 0) emote(u, "💤", 2.5);
      if (u.timer <= 0 && !u.nap && keepSleeping(u, world)) { u.timer = 8; break; }   // 집이 없으면 밖에서 기력이 가득 찰 때까지 잠
      if (u.timer <= 0 && u.nap && keepSleeping(u, world)) {                        // 집 길이 막혀 조는 중: BLOCKED_NAP초마다 자면서 집 길을 다시 봄 — 아직 막혔으면 깨지 않고 계속 졺, 뚫렸으면 깨서 집으로
        const home = u.home && world.buildings.get(u.home);                       // (잠 회복이 느려 한 번 졸아선 안 차므로, 깨고 다시 졸면 20초마다 일어났다 눕고 '막혔어' 말풍선이 되풀이됨)
        if (home && world.isDone(home) && !startPath(u, world, home.door.x, home.door.z)) { u.timer = BLOCKED_NAP; break; }
      }
      if (u.timer <= 0 || (u.needs?.energy ?? 100) >= CH.WAKE_AT) { const nap = u.nap; u.nap = false; u.activity = "sleep"; done(u, 1, rnd, world); if (!nap) emote(u, "잘 잤다!"); }   // 피로 0이면 밤이어도 깸
      break;
    case US.Faint:                                                                  // 쓰러져 누움(일·공사 안 맡음, 들 수 없음): FAINT_LIE초 뒤 병원으로 실려 가거나 그 자리에서 잠
      if ((u.emoteT ?? 0) <= 0) emote(u, "😵", 2.5);
      if (u.timer <= 0) afterFaint(u, world, rnd);
      break;
    case US.GoFest:                                                                 // 축제 광장으로 가는 중(그사이 축제가 끝나면 그만둠)
      if (!world.festival) { setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) partyAt(u, world, rnd);
      break;
    case US.GoGather:                                                               // 🗝 등대 앞 모임으로 가는 중(그사이 모임이 끝나면 그만둠)
      if (!world.gather) { setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) gatherAt(u, world, rnd);
      break;
    case US.Zoomies:
      if (followPath(u, dt, world, rnd)) {
        if (--u.chain > 0 && startActivityInner(u, "wander", world, rnd)) { u.state = US.Zoomies; u.running = true; }   // 활동 이름은 그대로(뛰어놀기)
        else { u.state = US.Zoomies; u.path = null; doOnce(u, "Jump", null, () => { emote(u, pick(["♪", "✨"], rnd)); done(u, 0.9, rnd, world); }); }
      }
      break;
    case US.Forage: {
      const s = u.focus;
      if (!world.seeds.includes(s)) { setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) {
        face(u, s.x + s.ox, s.z + s.oz); u.state = US.Eat;
        doOnce(u, "Attack", () => { world.eatSeed(s, u); emote(u, "♥"); }, () => done(u, 0.9, rnd, world));
      }
      break;
    }
    case US.Visit: {
      const f = u.focus;
      // 음식을 사러(얻으러) 가는 길(activity "eat")은 상대가 잠깐 동작 중(밭일·낚시의 한 동작, 인사)이어도 그대로 감: 예전엔 그때마다 그만두고 0.3~1초 뒤 다시 골라 제자리에서 "음식 사러!"만 되풀이함
      if (!visible(f) || f.state === US.Flee || ((f.once || f.state === US.Greet) && u.activity !== "eat")) { setIdle(u, rnd, world); break; }
      const close = Math.hypot(f.x - u.x, f.z - u.z) < 1.6, arrived = followPath(u, dt, world, rnd);
      if (u.state !== US.Visit) break;                                         // 길이 막혀 그만둠
      if (arrived || close) {
        if (!close) { setIdle(u, rnd, world); break; }                        // 가 보니 친구가 떠남
        u.path = null; face(u, f.x, f.z); u.state = US.Greet; const palUp = world.befriend(u, f, 1);         // 인사하면 서로 친해짐
        let swap = null;                                                         // 음식 사기(돈) 또는 물물교환
        if (world.economy && u.wantFood === "buy" && world.buyFoodFrom(u, f)) swap = `🛒 음식 🪙${world.foodPrice()}`;
        else if (world.economy) swap = world.barter(u, f);
        u.wantFood = null;
        const hi = swap || (M.affinity(u, f) >= 4 ? pick(["♥♥", "보고 싶었어!", "단짝!"], rnd) : pick(["♪", "♥", "안녕!"], rnd));
        if (!palUp) emote(u, hi, swap ? 2.4 : undefined);                         // 사이가 한 단계 올랐을 땐 그 말풍선(친구!·단짝!)을 그대로 둠
        if ([US.Idle, US.Wander].includes(f.state)) { setIdle(f, rnd, world, 1.2); f.state = US.Greet; face(f, u.x, u.z); if (!palUp) emote(f, swap ? "🤝" : "!");
          doOnce(f, "Jump", null, () => setIdle(f, rnd, world)); }
        doOnce(u, "Jump", null, () => done(u, 0.8 + (100 - (u.needs?.social ?? 100)) / 120, rnd, world));
        if (u.needs) u.needs.social = Math.min(100, u.needs.social + 35); if (f.needs) f.needs.social = Math.min(100, f.needs.social + 25);
      }
      break;
    }
    // ---- 일
    case US.GoChop: case US.GoMine: {
      const t = u.focus;
      if (!t.alive) { setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) { u.state = u.state === US.GoChop ? US.Chop : US.Mine; u.tool = u.state === US.Chop ? "axe" : "pickaxe"; u.workHits = u.state === US.Chop ? Math.ceil(t.hp / (3 / J.chopsNeeded(u)) - 1e-6) : t.hp; }
      break;
    }
    case US.Chop: case US.Mine: {
      const t = u.focus, chop = u.state === US.Chop; face(u, t.x + 0.5, t.z + 0.5);
      workLoop(u, dt, chop ? "Chop" : "Mine", u.workHits,
        () => { if (chop) world.hitTree(t, u); else world.hitOre(t, u); },
        () => { chatter(u, t.alive ? "💪" : nums(world) ? (chop ? `나무+${t.lastYield}` : `돌+${t.lastYield}${t.lastIron ? " 철+1" : ""}`) : vary(chop ? CHOP_SAY : t.lastIron ? IRON_SAY : MINE_SAY, u, world), world, undefined, t.alive || nums(world) ? null : chop ? "work:chop" : "work:mine");
          done(u, t.alive ? 0.4 : 0.8 + t.lastYield / 5 + (t.lastIron ? 0.5 : 0), rnd, world); });
      break;
    }
    case US.GoFish: {
      const s = u.focus;
      if (followPath(u, dt, world, rnd)) {
        u.state = US.Fish; u.tool = "rod"; face(u, s.x + 0.5 + s.dir[0], s.z + 0.5 + s.dir[1]);
        doOnce(u, "FishCast", null, () => { u.fishT = 3 + rnd() * 4; u.bite = u.tugged = false; u.fishing = { x: s.x + 0.5 + s.dir[0] * 1.6, z: s.z + 0.5 + s.dir[1] * 1.6 }; }, 99);
      }
      break;
    }
    case US.Fish: {
      if (u.fishT === undefined) break;
      u.anim = "FishWait";
      // 찌 당기기: 따라가며 보고 있는 갈매미(world.watchId)만, 기다림의 끝 무렵에 입질(❗). 같이 당기면(world.tugFloat) 바로 낚고 희귀 보너스, 놓쳐도 평소와 똑같이 낚음
      if (!u.bite && u.fishT > 0 && u.fishT <= J.BITE_SECS && world.watchId === u.unitId) { u.bite = true; emote(u, "❗", u.fishT + 0.2); }
      u.fishT -= dt;
      if (u.fishT <= 0) {
        u.fishT = undefined; const bonus = u.tugged ? J.TUG_BONUS : 1; u.bite = u.tugged = false;
        doOnce(u, "FishReel", () => {
          u.fishing = null; const r = world.catchFish(u, bonus);
          u.lastReward = !r ? 0.05 : { common: 0.8, rare: 1.4, epic: 2, legend: 3 }[r.fish.rarity] + (r.item ? 1 : 0);
          if (!r) { emote(u, "💧"); return; }
          const star = { common: "", rare: "✨", epic: "🌟", legend: "👑" }[r.fish.rarity];
          emote(u, r.item ? `🎁 ${r.item.name}!` : `${bonus > 1 ? "🎵" : ""}${star}${r.fish.name}`, r.item || star ? 2.6 : 1.6);
        },
          () => done(u, u.lastReward ?? 0.5, rnd, world));
      }
      break;
    }
    case US.GoFetch:                                                              // 공사 재료를 은행 창고에서 꺼내러(맡은 공사가 없어졌으면 그만)
      if (!u.committed || !world.buildings.has(u.committed)) { u.fetch = null; setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) { const n = takeFetch(u, world); emote(u, n ? `📦 자재 ${n}개` : "창고가 비었네…", 2); done(u, 0.5, rnd, world, 0.2); }
      break;
    case US.GoBuild: {
      const b = u.focus;
      if (!world.buildings.has(b.id) || world.isDone(b)) { setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) {
        if (u.paidCycle) { u.paidCycle = false; u.state = US.Build; u.tool = "hammer"; break; }   // 건물을 옮겨 새 자리로 온 것: 이번 바퀴 재료는 이미 씀
        if (!hasMaterials(world, b, u)) { setIdle(u, rnd, world, 0.2); break; }  // 그새 재료가 떨어짐 → 구하러 감(맡은 건 유지)
        useMaterials(world, b, u);                                             // 도착하면 재료를 씀(가방 → 은행 창고 순)
        u.state = US.Build; u.tool = "hammer";
      }
      break;
    }
    case US.Build: {
      const b = u.focus;
      if (!world.buildings.has(b.id)) { setIdle(u, rnd, world); break; }
      const c = b.cells.reduce((a, [x, z]) => [a[0] + x + 0.5, a[1] + z + 0.5], [0, 0]); face(u, c[0] / b.cells.length, c[1] / b.cells.length);
      // 망치질 3번마다 나무 1·돌 1을 더 써서 그 자리에서 계속. 재료가 없으면 구하러 갔다가 돌아옴. 100%가 되면 끝.
      workLoop(u, dt, "Build", 3, () => world.hammer(b, u), () => {
        if (world.isDone(b)) { world.payWage(u, b); b.supply = null; uncommit(u, world); done(u, 2, rnd, world); return; }
        M.learn(u, "build", 0.8);                                               // 한 바퀴 지을 때마다 보람
        world.payWage(u, b);                                                    // 한 바퀴 품삯(금고에서, 모자라면 밀림. 갈매미 주문 공사는 주문한 갈매미 돈에서)
        if (hasMaterials(world, b, u)) { useMaterials(world, b, u); return; }         // u.work가 비었으니 다음 바퀴부터 다시
        u.activity = null;                                                      // 이번 몫을 다 씀(짐 한도를 넘는 큰 공사) → 다음 몫을 모으러
        emote(u, "다음 재료 가지러!"); setIdle(u, rnd, world, 0.3);
      });
      break;
    }
    case US.GoSwim:
      if (followPath(u, dt, world, rnd)) { u.state = US.Swim; u.swimming = true; u.timer = 8 + rnd() * 7; u.swimGoal = null; u.anim = "Swim"; chatter(u, pick(["첨벙!", "♪", "시원해~"], rnd), world); }
      break;
    case US.Swim: swimStep(u, dt, world, rnd); break;
    case US.GoToBuilding: {
      const b = world.buildings.get(u.targetBuildingId);
      if (!b) { setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) {
        const cocoa = u.cocoa; u.cocoa = false; enterBuilding(u, b, rnd, world); if (cocoa && b.defId === "cafe") world.buyCocoa?.(u);
        if (u.insideAct === "sleep") world.lodge?.(u, b);                         // 빈 집 손님이면 숙박비(하룻밤에 한 번, World.lodge가 가림)
        if (BUILDINGS[b.defId].clinic) { if (u.insideAct === "sick") world.clinicCheckIn?.(u, b); else if (u.insideAct === "doctor") world.doctorArrived?.(u, b); }
      }
      break;
    }
    case US.Inside:
      if (u.timer <= 0 && keepInside(u, world)) { u.timer = 2; break; }       // 몸 녹이는 중(체온 39.6까지, 아침형의 밤에 밖이 추우면 기력이 찰 때까지 안에서 쉼)
      // 자는 중이면 피로 0이 되는 대로 일어남(밤이어도)
      if (u.timer <= 0 || (u.insideAct === "sleep" && (u.needs?.energy ?? 100) >= CH.WAKE_AT)) { const ib = world.buildings.get(u.insideBuildingId), taken = ib && ib.owner != null && !HM.livesIn(ib, u) && world.isHouse(ib);   // 손님으로 자던 빈 집을 누가 샀으면 깨서 나옴(다시 잠자리를 고름). 같이 사는 갈매미는 자기 집
        if (u.insideAct === "sleep" && !taken && keepSleeping(u, world)) { u.timer = 8; if (u.useFurni?.id && !/bed/i.test(u.useFurni.id)) { const b = world.buildings.get(u.insideBuildingId); u.useFurni = b ? F.pickUse(b, true, rnd, busyIn(u, b, world)) : u.useFurni; } } else exitBuilding(u, world, rnd); }   // 기력이 덜 찼으면 계속 잠(배고프거나 축제가 열리면 자다가도 나옴)
      break;
    case US.GoTrade:
      if (world.economy && followPath(u, dt, world, rnd)) {                         // 경제: 시장 앞에서 한동안 손님을 기다림
        u.state = US.Trade; u.timer = 8 + rnd() * 6; emote(u, "자, 구경하고 가!"); u.tradeStart = u.coins || 0; break;
      }
      if (world.economy) break;
      if (followPath(u, dt, world, rnd)) {
        u.state = US.Trade; face(u, world.stall.x + 0.5, world.stall.z + 0.5);
        doOnce(u, "Attack", () => { const l = world.trade(u); u.lastReward = l.sold > 0 ? 1 + Math.min(1, l.sold / 50) : l.bought > 0 ? 0.7 : 0.1;
            chatter(u, l.sold || l.bought ? (nums(world) ? `🪙 +${l.sold}${l.bought ? ` −${l.bought}` : ""}` : l.sold ? "잘 팔렸다!" : "좋은 거 샀다") : "손님이 없네", world, 2.2); },
          () => done(u, u.lastReward ?? 0.5, rnd, world, 1 + rnd()));
      }
      break;
    case US.GoWater:                                                              // 물주기: 물가로 / 밭으로 가는 중(밭이 없어지면 그만)
      if (!u.water || !world.plots.includes(u.focus)) { setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) arriveWater(u, world, rnd);
      break;
    case US.GoFarm: {
      const pl = u.focus;
      if (followPath(u, dt, world, rnd)) {
        u.state = US.Farm; const planting = pl.stage === "empty"; if (planting) u.tool = "hoe";   // 심을 땐 괭이질, 거둘 땐 쪼기
        doOnce(u, planting ? "Hoe" : "Attack", () => { const r = world.farmPlot(pl, u); u.lastReward = r === "harvest" ? 1.3 : r === "plant" ? 0.6 : 0;
            chatter(u, r === "plant" ? "🌱" : r === "harvest" ? (nums(world) ? `🌾+${pl.lastYield}` : "잘 익었다!") : "…", world); },
          () => { u.tool = null; done(u, u.lastReward ?? 0.5, rnd, world); });
      }
      break;
    }
    case US.Trade:                                                                // 경제: 시장 앞에서 시간이 다 되면 번 만큼 보람
      if (world.economy && u.processing) { u.anim = "Build"; if (u.timer <= 0) { const n = world.processRaw(u); u.processing = false; chatter(u, nums(world) ? `📦 가공품 ${n}개` : "다 만들었다!", world); done(u, 0.6 + n / 10, rnd, world); } break; }
      if (world.economy && !u.once && u.timer <= 0) { const got = (u.coins || 0) - (u.tradeStart || 0); chatter(u, got > 0 ? (nums(world) ? `🪙+${got}` : got >= 10 ? "오늘 장사 잘됐다!" : "조금 팔았다") : "오늘은 한산하네", world); done(u, 0.4 + got / 4, rnd, world); }
      break;
    case US.GoShore:                                                              // 바닷가: 물 쪽을 보고 쪼아 먹이를 잡음(쪼기 3번, 포만감 +18)
      if (followPath(u, dt, world, rnd)) {
        const d = u.shoreDir || [0, 1]; face(u, u.x + d[0], u.z + d[1]); u.state = US.Eat;
        doOnce(u, "Attack", () => { u.full = Math.min(J.FULL_MAX, (u.full ?? 80) + 18); const it = world.beachcomb?.(u); chatter(u, it ? `✨ ${it.name}!` : pick(["🐟 냠", "🦐 냠", "🐚 냠"], rnd), world, it ? 2.6 : 1.6); world.emit("ate", u); }, () => done(u, 0.6, rnd, world));
      }
      break;
    case US.GoBank:                                                               // 공식은행: 가방의 물건을 팔고 새 돈을 받음
      if (followPath(u, dt, world, rnd)) {
        const r = world.sellProcessed(u); chatter(u, r.coins ? (nums(world) ? `🏦 가공품 🪙+${r.coins}` : "다 팔았다, 후련해") : "팔 게 없네", world, 2.2); done(u, 0.4 + r.coins / 20, rnd, world);
      }
      break;
    case US.GoMarket: {                                                           // 시장: 음식 또는 집을 삼
      if (!followPath(u, dt, world, rnd)) break;
      const shop = u.shop || {}; u.shop = null;
      if (shop.kind === "sell") {
        const r = world.sellToMarket(u); chatter(u, r.coins ? (nums(world) ? `원자재 🪙+${r.coins}` : "재료 잘 팔았다") : "상인이 돈이 없대…", world, 2.2); done(u, r.coins ? 0.5 + r.coins / 20 : 0.1, rnd, world);
      } else if (shop.kind === "peddle") {                                         // 소지품 팔기(동전은 내 것, 상인은 1개에 1동전)
        const r = world.sellStash(u); chatter(u, r.coins ? (nums(world) ? `소지품 ${r.n}개 🪙+${r.coins - r.cut}` : "소지품 정리 끝!") : r.donated.length ? "🐠 수족관에 기증!" : "오늘은 안 팔래", world, 2.2); done(u, r.coins ? 0.5 + r.coins / 30 : 0.1, rnd, world);
      } else if (shop.kind === "process") {                                        // 가공: 개수만큼 망치질하는 시간
        const n = E.total(u.raw); u.state = US.Trade; u.processing = true; u.timer = 1.5 + n * 0.6; u.tool = "hammer"; u.anim = "Build"; chatter(u, nums(world) ? `🔨 가공 중(${n})` : "뚝딱뚝딱…", world);
      } else if (shop.kind === "food") {
        if (world.buyFood(u)) { emote(u, "🛒 음식"); world.eatFood(u); done(u, 0.8, rnd, world); } else { emote(u, "다 팔렸네…"); setIdle(u, rnd, world); }
      } else if (shop.kind === "furnish") {
        if (world.buyFurniture(u, shop.id)) { emote(u, `🛋 ${FURNITURE[shop.id].name}!`, 2.6); done(u, 1.5, rnd, world); } else { emote(u, "돈이 모자라…"); setIdle(u, rnd, world); }
      } else if (shop.kind === "clothes") {
        if (world.buyClothes(u, shop.id)) { emote(u, `${CLOTHES[shop.id].icon} ${CLOTHES[shop.id].name}!`, 2.6); done(u, 1.2, rnd, world); } else { emote(u, "돈이 모자라…"); setIdle(u, rnd, world); }
      } else if (shop.kind === "stock") {
        const n = world.stockFood(u); chatter(u, n ? (nums(world) ? `🏚 저장고에 ${n}개 🪙+${n * E.GRANARY_BUY}` : "저장고 채웠다!") : "저장고가 꽉 찼네", world, 2.2); done(u, n ? 0.6 : 0.1, rnd, world);
      } else if (shop.kind === "granary") {
        const r = world.takeFood(u); if (r) { world.eatFood(u); emote(u, r === "buy" ? "🏚 저장고 음식 냠" : "🏚 나눠 받았다, 고마워", 2.2); done(u, 0.8, rnd, world); } else { emote(u, "저장고가 비었네…"); setIdle(u, rnd, world); }
      } else if (shop.kind === "share") {                                          // 2층집에 같이 살기(homes.js)
        const b = world.buildings.get(shop.b);
        if (b && world.moveIn(u, b)) { emote(u, "🏡 같이 살자!", 3); world.notice(u.x, u.z, "building", u); done(u, 2.5, rnd, world); } else { emote(u, "놓쳤다…"); setIdle(u, rnd, world); }
      } else if (shop.kind === "house") {
        const b = world.buildings.get(shop.b);
        if (b && world.buyHouse(u, b)) { emote(u, "🏠 내 집!", 3); world.notice(u.x, u.z, "building", u); done(u, 2.5, rnd, world); } else { emote(u, b && world.houseDeal(u, b).reason === "vault" ? "은행에 돈이 없대…" : "놓쳤다…"); setIdle(u, rnd, world); }
      } else setIdle(u, rnd, world);
      break;
    }
    case US.GoSit: {
      const b = world.buildings.get(u.sitOn); if (!b) { standUp(u, world); setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) {
        const [cx, cz] = b.cells[0]; u.state = US.Sit; u.timer = M.benchSecs(rnd); u.path = null;   // 잠깐 앉아 숨 돌리기(기력은 잠으로)
        u.x = cx + 0.5 + (b.door.x - cx) * 0.2; u.z = cz + 0.5 + (b.door.z - cz) * 0.2;   // 좌판 앞쪽(다리가 앞으로 내려오게)
        u.heading = Math.atan2(b.door.x - cx, b.door.z - cz); u.sitY = b.seatY ?? (b.elevation ?? 0) + 0.33;   // 좌판 높이(그림이 모델에서 잰 값). 엉덩이를 여기 맞추는 건 views.js u.anim = "Sit"; emote(u, pick(["후~", "♪", "좋다"], rnd));
      }
      break;
    }
    case US.Sit:
      u.anim = "Sit";
      if (u.needs) { u.needs.energy = Math.min(100, u.needs.energy + M.BENCH_GAIN * dt); u.needs.fun = Math.min(100, u.needs.fun + 0.6 * dt);
        if (world.units.some(o => o !== u && o.state === US.Sit && Math.hypot(o.x - u.x, o.z - u.z) < 2.5)) u.needs.social = Math.min(100, u.needs.social + 1.5 * dt); }   // 옆 벤치 친구와 수다
      if (u.timer <= 0) { u.anim = null; standUp(u, world); done(u, 0.9, rnd, world); }
      break;
    case US.GoImprove:
      if (!u.improve) { setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) { const [x, z] = u.improve.cells[u.improve.i]; face(u, x + 0.5, z + 0.5); u.state = US.Improve; u.tool = "hoe"; }
      break;
    case US.Improve:
      if (!u.improve) { setIdle(u, rnd, world); break; }
      workLoop(u, dt, "Hoe", 2, () => {}, () => {   // 마당 = 괭이질
        const ok = improveCell(u, world); u.improve.i++;
        if (!ok || u.improve.i >= u.improve.cells.length || !improveNext(u, world)) { endImprove(u, world); emote(u, "🏡 마당 끝!", 2.2); M.learn(u, "build", 0.8); done(u, 1.4, rnd, world); }
      });
      break;
    case US.Greet: case US.Eat: case US.Farm: case US.Water: break;          // doOnce가 끝나면 풀림
    default: setIdle(u, rnd, world);
  }
  settle(u, dt, world);
}

// ---------------------------------------------------------------- 헤엄
/** 헤엄칠 때 몸 기준 높이: 물 표면에서 키의 30%쯤 잠김. */
export const swimY = u => WATER_Y - 0.3 * (u.height ?? 0.8 * (u.scale || 1));
const SWIM_RANGE = 3.5;                                                   // 들어간 곳에서 이만큼(칸)까지만 헤엄
/** 두 점 사이가 모두 물인지(0.25칸 간격으로 확인). */
function waterLine(grid, ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25);
  for (let i = 1; i <= n; i++) { const t = i / n; if (!grid.isWater(Math.floor(ax + (bx - ax) * t), Math.floor(az + (bz - az) * t))) return false; }
  return true;
}
/** 지금 자리(물 칸)에서 바로 헤엄 시작. 올라올 땅 칸(sx, sz)을 함께 줌. */
export function startSwimHere(u, world, rnd, sx, sz) {
  setIdle(u, rnd, world); u.swim = { sx, sz, wx: Math.floor(u.x), wz: Math.floor(u.z) };
  u.state = US.Swim; u.swimming = true; u.timer = 8 + rnd() * 7; u.swimGoal = null; u.anim = "Swim"; u.activity = "swim"; chatter(u, "첨벙!", world);
}
/** 헤엄: 들어간 물 칸 둘레의 물 위를 천천히 오가다가, 시간이 다 되면 들어간 곳으로 돌아와 땅으로 올라온다. */
function swimStep(u, dt, world, rnd) {
  const g = world.grid, s = u.swim; u.anim = "Swim";
  if (!s) { setIdle(u, rnd, world); return; }
  const home = u.timer <= 0;
  if (home) u.swimGoal = Math.hypot(s.wx + 0.5 - u.x, s.wz + 0.5 - u.z) < 0.3 || u.swimGoal?.land ? { x: s.sx + 0.5, z: s.sz + 0.5, land: true } : { x: s.wx + 0.5, z: s.wz + 0.5 };
  if (!u.swimGoal) {
    for (let k = 0; k < 10 && !u.swimGoal; k++) {
      const a = rnd() * Math.PI * 2, d = 1 + rnd() * SWIM_RANGE, x = s.wx + 0.5 + Math.cos(a) * d, z = s.wz + 0.5 + Math.sin(a) * d;
      if (g.inBounds(Math.floor(x), Math.floor(z)) && waterLine(g, u.x, u.z, x, z)) u.swimGoal = { x, z };
    }
    if (!u.swimGoal) u.swimGoal = { x: s.wx + 0.5, z: s.wz + 0.5 };
  }
  const goal = u.swimGoal, dx = goal.x - u.x, dz = goal.z - u.z, d = Math.hypot(dx, dz), speed = 0.55 * Math.sqrt(u.scale || 1) * dt;
  if (d > 1e-3) { let h = Math.atan2(dx, dz) - u.heading; h = Math.atan2(Math.sin(h), Math.cos(h)); u.heading += h * Math.min(1, dt * 3); }   // 물에서는 천천히 돈다
  if (d <= speed) {
    u.x = goal.x; u.z = goal.z; u.swimGoal = null;
    if (goal.land) { u.swimming = false; u.swim = null; u.anim = null; chatter(u, pick(["휴~ 상쾌!", "♪", "부르르"], rnd), world); done(u, 0.6 + (100 - (u.needs?.fun ?? 100)) / 200, rnd, world); }
    else if (!home) u.timer -= rnd() * 0.5;                                 // 잠깐 떠 있다가 다음 곳으로
    return;
  }
  u.x += dx / d * speed; u.z += dz / d * speed;
  settle(u, dt, world);
}

/** 서 있는 높이를 부드럽게 따라감(계단·부두). */
function settle(u, dt, world) {
  if (u.insideBuildingId) return;
  if (u.swimming) { u.y += (swimY(u) - u.y) * Math.min(1, dt * 6); return; }   // 물에 몸이 반쯤 잠김
  if (u.state === US.Sit && u.sitY != null) { u.y += (u.sitY - u.y) * Math.min(1, dt * 10); return; }   // 벤치 위
  const h = world.standHeight ? world.standHeight(u.x, u.z) : world.grid.walkHeight(...cellOf(u));
  if (h !== null) u.y += (h - u.y) * Math.min(1, dt * 12);              // 경사면·계단을 따라 부드럽게
}
export const _startPathForTest = (...a) => startPath(...a), _followPathForTest = (...a) => followPath(...a);   // 시험용
export const _pokeApi = { doOnce, startActivity };   // 톡톡 콕 찌르기(units/poke.js)의 폴짝·뛰어놀기
