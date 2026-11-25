// 갈매미 유닛 AI(지시서 4-3 + web/village의 마을 생활). 순수 로직: 상태(UnitAIState)만 바꾸고,
// 뷰는 u.anim(틀 애니메이션 이름)·u.tool(손에 든 도구)·u.emoteText(말풍선)·u.fishing(찌 위치)을 읽어 그린다.
//
// 할 일이 없으면(Idle) 성격(PERSONA) 비중으로 하나를 고른다:
//   쉬기(피곤할 때만: 기력 50 아래) · 산책 · 씨앗 먹기 · 친구에게 가서 인사 · 신나서 뛰기 · 벌목 · 채광 · 낚시 · 집 짓기(공사장) · 건물 들어가기
// 반사 행동: 겁 많은 갈매미(미니)는 큰 갈매미가 다가오면 도망, 혼자 있고 싶은 갈매미(그림자)는 쉬다가 붐비면 자리를 피함.
import { UnitState as US } from "../data/types.js";
import { UNIT_SPEED, WATER_Y } from "../config.js";
import { PERSONA, BUILDINGS } from "../data/catalog.js";
import * as J from "../world/jobs.js";
import { findPath, nearestWalkable } from "../world/pathfinding.js";
import * as M from "./mind.js";
import { areNeighbors } from "../world/wishes.js";
import * as E from "../world/economy.js";
import * as F from "../world/furniture.js";
import * as IM from "../world/improve.js";
import { FURNITURE } from "../data/catalog.js";
import { FESTIVAL_JOIN_CHANCE, FESTIVAL_FUN, FESTIVAL_PAL } from "../world/festival.js";
import { STASH_SELL_AT, stashSellable } from "../world/belongings.js";

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

// 공사 한 번(망치질 3번)에 드는 재료: 건물마다 cost(없으면 나무 1·돌 1), 3등급 이상 건물은 철 1도.
// 짓는 갈매미 가방에 있는 것부터 쓰고, 모자라면 은행 창고(마을 자재)에서.
const needsIron = b => (BUILDINGS[b.defId].tier || 1) >= 3;
const costOf = b => { const c = { ...(BUILDINGS[b.defId].cost || { wood: 1, stone: 1 }) }; if (needsIron(b)) c.iron = (c.iron || 0) + 1; return c; };
const have = (world, u, k) => (u?.inv?.[k] || 0) + (world.res[k] || 0);
const hasMaterials = (world, b, u = null) => Object.entries(costOf(b)).every(([k, n]) => have(world, u, k) >= n);
function useMaterials(world, b, u = null) {
  const fromBag = {}, fromWare = {};
  for (const [k, n] of Object.entries(costOf(b))) { let left = n; const mine = Math.min(left, u?.inv?.[k] || 0); if (mine) { u.inv[k] -= mine; left -= mine; } world.res[k] -= left; fromBag[k] = mine; fromWare[k] = left; }
  if (b.order) world.orderMaterials(b, u, fromBag, fromWare);                     // 갈매미 주문 공사: 주문한 갈매미가 자재값을 냄(창고 것은 금고로, 가방 것은 짓는 갈매미에게)
}
/** 모자란 재료를 구하러 감: 나무가 모자라면 벌목, 돌·철이 모자라면 채광. */
function gatherFor(u, world, b, rnd) {
  const c = costOf(b), lackWood = have(world, u, "wood") < (c.wood || 0), first = lackWood ? "chop" : "mine", second = first === "chop" ? "mine" : "chop";
  if (startActivity(u, first, world, rnd) || (!lackWood || (c.stone || c.iron)) && startActivity(u, second, world, rnd)) { emote(u, "재료 구하러!"); return true; }
  return false;
}

/** 찜해 둔 것(나무·광석·씨앗·낚시 자리·공사장)을 놓고 손을 비운다. */
function release(u) {
  const f = u.focus;
  if (f && f.claimed === u.unitId) f.claimed = null;
  if (f && f.busy === u.unitId && u.committed !== f.id) f.busy = null;   // 맡은 공사장(committed)은 끝날 때까지 찜 유지
  u.focus = null; u.work = null; u.once = null; u.tool = null; u.fishing = null; u.anim = null; u.fishT = undefined; u.bite = u.tugged = false; u.processing = false;
}
/** 맡은 공사를 내려놓음(완공·들어 올림·철거 때). */
export function uncommit(u, world) {
  const b = u.committed && world && world.buildings.get(u.committed);
  if (b && b.busy === u.unitId) b.busy = null;
  u.committed = null;
}
export function setIdle(u, rnd, world = null, secs = null) {
  if (u.activity) { M.learn(u, u.activity, -0.2); u.activity = null; }   // 끝내지 못하고 그만둔 일 = 조금 나쁜 경험
  release(u);
  if (u.improve && world) { for (const [x, z] of u.improve.cells) world.improveClaims?.delete(`${x},${z}`); u.improve = null; }   // 고치던 일을 그만두면 찜 풀기
  if (u.sitOn && world) standUp(u, world);                                // 앉아 있다가 다른 일을 하면 일어남
  u.running = false; u.state = US.Idle; u.timer = secs ?? M.pauseSecs(rnd); u.path = null; u.pathIndex = 0; u.goal = null; if (!u.sailing) u.ferry = null;
  u.targetBuildingId = null; u.moveT = 0; u.lookAt = undefined; u.swimming = false; u.swimGoal = null;   // 물속에서 그만두면 다음 프레임에 가까운 땅으로 올라옴
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
/** (tx,tz) 칸 바로 옆의 걸을 수 있는 칸으로 가는 길. 가까운 칸부터 시도. */
function pathBeside(u, world, tx, tz) {
  const g = world.grid, around = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]
    .map(([dx, dz]) => [tx + dx, tz + dz]).filter(([x, z]) => g.isWalkable(x, z) && !g.doorOwner(x, z))
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
    case "rest": {                                                                // 쉬기: 가까운 빈 벤치가 있으면 앉고, 없으면 서서. 피곤하면 기력이 REST_UNTIL까지 찰 때까지
      if (sitBench(u, world)) return true;
      const lack = M.REST_UNTIL - (u.needs?.energy ?? 100);
      setIdle(u, rnd, world, lack > 0 ? Math.min(30, Math.max(2, lack / (0.6 + M.REST_GAIN))) : 2 + rnd() * 4); if (rnd() < 0.3) emote(u, pick(["…", "♪", "z"], rnd)); return true;
    }
    case "sleep": {                                                               // 지치면: 가까운 완성된 집에 들어가 자거나, 그 자리에서 잠
      const home = nearest(u, [...world.buildings.values()].filter(b => world.canEnter(u, b) && Math.hypot(b.door.x - u.x, b.door.z - u.z) < 14), b => [b.door.x, b.door.z]);
      if (home && startPath(u, world, home.door.x, home.door.z)) { u.state = US.GoToBuilding; u.targetBuildingId = home.id; u.sleepy = true; emote(u, "졸려…"); return true; }
      setIdle(u, rnd, world, 10 + rnd() * 6); u.state = US.Sleep; emote(u, "💤", 3); return true;
    }
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
      const list = kind === "chop" ? world.trees : world.ores;
      const t = nearest(u, list.filter(t => t.alive && !t.claimed), t => [t.x, t.z]);
      if (!t || !pathBeside(u, world, t.x, t.z)) return false;
      t.claimed = u.unitId; u.focus = t; u.state = kind === "chop" ? US.GoChop : US.GoMine; return true;
    }
    case "fish": {
      if ((world.fx?.fish ?? 1) <= 0) return false;                                // 폭풍엔 낚시 안 감
      const s = nearest(u, world.spots.filter(s => !s.claimed && g.isWalkable(s.x, s.z)), s => [s.x, s.z]);
      if (!s || !startPath(u, world, s.x, s.z)) return false;
      s.claimed = u.unitId; u.focus = s; u.state = US.GoFish; return true;
    }
    case "build": {
      // 맡은 공사장이 있으면 그곳, 없으면 남이 안 맡은 공사장 중 많이 지어진 곳. 한 번 맡으면 100%까지 맡는다.
      let b = u.committed ? world.buildings.get(u.committed) : null;
      if (b && (world.isDone(b) || (b.busy && b.busy !== u.unitId))) { uncommit(u, world); b = null; }
      if (!b) b = [...world.buildings.values()].filter(b => !world.isDone(b) && !b.busy && J.canBuild(u, BUILDINGS[b.defId]) && world.workSpot(b) && !(u.noWay?.[b.id] > world.time))   // 방금 길이 없던 공사장은 잠깐 건너뜀(그 한 곳 때문에 다른 공사가 다 멈추지 않게)
        .sort((a, c) => c.hits / c.need - a.hits / a.need)[0];
      if (!b) return false;
      u.committed = b.id; b.busy = u.unitId;
      if (!hasMaterials(world, b, u)) return gatherFor(u, world, b, rnd);          // 재료가 없으면 구하러 갔다가 이 공사장으로 돌아옴
      const spot = world.workSpot(b); if (!spot) { uncommit(u, world); return false; }   // 다리: 땅이나 다 지은 다리에 붙은 칸부터
      if (!startPath(u, world, spot.x, spot.z)) { (u.noWay ||= {})[b.id] = world.time + 60; uncommit(u, world); return false; }
      u.focus = b; u.state = US.GoBuild; return true;
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
      doOnce(u, "Attack", () => { if (world.eatFood(u)) emote(u, J.isLazy(u) ? "배불러…" : "냠냠"); }, () => done(u, 1, rnd, world));
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
      u.state = US.GoShore; u.shoreDir = best[2]; emote(u, "바다로 먹이 잡으러"); return true;
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
    case "farm": {                                                                // 농부: 비었거나 다 자란 밭
      if (u.job !== "farmer") return false;
      const pl = nearest(u, world.plots.filter(p => !p.claimed && (p.stage === "empty" || p.stage === "ripe")), p => [p.x, p.z]);
      if (!pl || !startPath(u, world, pl.x, pl.z)) return false;
      pl.claimed = u.unitId; u.focus = pl; u.state = US.GoFarm; return true;
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
        if (pathBeside(u, world, o.x, o.z)) { o.claimed = u.unitId; u.focus = o; u.state = c.kind === "chop" ? US.GoChop : US.GoMine; ok = true; } break;
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

/** 동네 고치기 시작: 계획을 세우고 첫 칸으로 감 */
function startImprove(u, world, rnd) {
  const plan = IM.planImprovement(world, u); if (!plan) return false;
  const home = world.buildings.get(u.home);
  if (plan.kind === "deco") { const b = IM.orderDeco(world, home, rnd, u); if (!b) return false; emote(u, `🌷 ${BUILDINGS[b.defId].name} 주문!${b.order ? ` 🪙${b.order.left}` : ""}`, 2.5); world.emit("improve", { u, kind: "deco", b }); done(u, 0.6, rnd, world); return true; }
  world.improveClaims ||= new Set(); for (const [x, z] of plan.cells) world.improveClaims.add(`${x},${z}`);
  u.improve = { ...plan, i: 0, paved: 0 };
  if (!improveNext(u, world)) { endImprove(u, world); return false; }
  emote(u, plan.kind === "pave" ? "🛣 길 깔러!" : "🏡 마당 고르기!", 2.2); u.activity = "build"; return true;
}
function improveNext(u, world) {
  const im = u.improve; while (im && im.i < im.cells.length) { const [x, z] = im.cells[im.i]; if (pathBeside(u, world, x, z) || startPath(u, world, x, z)) { u.state = US.GoImprove; return true; } im.i++; }
  return false;
}
function endImprove(u, world) { const im = u.improve; if (im) for (const [x, z] of im.cells) world.improveClaims?.delete(`${x},${z}`); u.improve = null; u.tool = null; }
/** 한 칸 고치기: 길은 돌길로 칠하고(돌: 가방 → 은행 창고), 마당은 문 높이로 높이거나 낮춤 */
function improveCell(u, world) {
  const im = u.improve, [x, z] = im.cells[im.i];
  if (im.kind === "pave" && world.canPaint(x, z)) {
    if (im.paved % IM.STONE_PER === 0) { if ((u.inv?.stone || 0) > 0) u.inv.stone--; else if ((world.res.stone || 0) > 0) world.res.stone--; else return false; }
    world.paint(x, z, "Cobble"); im.paved++;
  } else if (im.kind === "yard" && world.canReshape(x, z)) { world.reshape(x, z, "flatten", im.target, 1); }
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
/** 잘 시간인가: 보통 갈매미는 밤, 야행성(그림자·불씨)은 낮. world.isNight는 화면(해 높이)이 알려 줌 */
export const isNocturnal = u => !!(PERSONA[u.name] || {}).nocturnal;
export const sleepTime = (u, world) => world.isNight == null ? false : (isNocturnal(u) ? !world.isNight : world.isNight);
/** 잠자리: 내 집(있으면) → 아니면 그 자리에서 */
function goToBed(u, world, rnd) {
  const home = u.home && world.buildings.get(u.home);
  if (home && world.isDone(home) && startPath(u, world, home.door.x, home.door.z)) { u.state = US.GoToBuilding; u.targetBuildingId = home.id; u.sleepy = true; emote(u, isNocturnal(u) ? "해가 떴네… 자야지" : "졸려… 집에 가야지", 2.4); return true; }
  return startActivityInner(u, "sleep", world, rnd);
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
/** 축제가 열려 있고 너무 지치지 않았는가(이럴 땐 잘 시간에도 깨어 광장에 감. 지쳤으면 그대로 잠) */
const festAwake = (u, world) => !!world.festival && (u.needs?.energy ?? 100) >= 20;
function chooseNext(u, world, rnd) {
  // 배고프면 먼저 먹음. 음식이 넉넉하면(30 넘게) 배가 덜 고파도 먹어서 너무 부를 수 있음.
  if ((u.full ?? 80) < J.HUNGRY || (world.res.food > 30 && (u.full ?? 80) < 75)) { if (startActivity(u, "eat", world, rnd)) return; }
  // 축제의 날: 맡은 공사가 없고 너무 지치지 않았으면 광장에 모여 놂(이날만은 잘 시간에도 늦게까지)
  if (festAwake(u, world) && !u.committed && rnd() < FESTIVAL_JOIN_CHANCE && startGather(u, world, rnd)) return;
  if (sleepTime(u, world) && (u.full ?? 80) >= J.HUNGRY) { if (goToBed(u, world, rnd)) return; }   // 잘 시간: 집에 가서 잠(야행성은 낮에)
  if (u.committed && startActivity(u, "build", world, rnd)) return;          // 맡은 공사가 먼저
  // 피곤하면(기력 TIRED 아래) 심부름(가공·은행·시장·저장고·장보기)을 새로 시작하지 않고 아래에서 먼저 쉼: 상인이 가공 → 은행을 쉬지 않고 이어 가다 기력이 바닥나지 않게
  if (world.economy && (u.needs?.energy ?? 100) >= M.TIRED) {
    if (u.job === "merchant") {                                                  // 상인: 가공품은 은행에, 원자재는 가공
      if (E.total(u.goods) > 0 && startActivity(u, "deposit", world, rnd)) return;
      if (E.total(u.raw) >= 3 && startActivity(u, "process", world, rnd)) return;
    }
    if (E.isProducer(u) && world.granaryB() && E.meals(u) >= E.FOOD_KEEP + 5 && world.granary < E.GRANARY_MAX && startActivity(u, "stock", world, rnd)) return;   // 남는 음식은 저장고에
    const n = E.total(E.rawOf(u));
    if (!u.committed && (n >= E.CARRY || (n >= 2 && rnd() < 0.2)) && startActivity(u, "sell", world, rnd)) return;   // 원자재가 모이면 시장(상인)에 팖
    if (!u.committed && E.total(stashSellable(u)) >= STASH_SELL_AT && startActivity(u, "peddle", world, rnd)) return;   // 팔 소지품이 모이면 시장에 팖(좋아하는 건 하나씩 간직, 난수 안 씀)
    if (!u.home && world.marketB()) {                                            // 집이 없고 돈이 모이면 시장에서 집을 삼(단짝 옆집이 있으면 그 집부터, 다음은 싼 집)
      const pal = M.bestieOf(u, world.units), palHome = pal?.home ? world.buildings.get(pal.home) : null, nearPal = b => areNeighbors(b, palHome) ? 1 : 0;
      const deals = world.housesForSale(u).map(b => [b, world.houseDeal(u, b)]);   // 집값을 다 가졌거나, 계약금이 있고 금고가 빌려줄 수 있으면(bank.js)
      if (!deals.some(([, d]) => d.ok)) { const v = deals.find(([, d]) => d.reason === "vault"); if (v) world.refuseLoan(u, v[1]); }   // 금고가 비어 대출 거절(한 사태에 한 번 말풍선)
      const h = deals.filter(([, d]) => d.ok).map(([b]) => b).sort((a, c) => nearPal(c) - nearPal(a) || BUILDINGS[a.defId].price - BUILDINGS[c.defId].price)[0];
      if (h && startActivity(u, "market", world, rnd)) { u.shop = { kind: "house", b: h.id }; emote(u, "집 사러!"); return; }
    }
    const home = u.home && world.buildings.get(u.home), shop = world.shopB();
    if (home && shop && rnd() < 0.35) {                                           // 집이 있으면 남는 돈으로 잡화점에서 가구를 삼(밥값 두 번어치는 남김)
      const want = F.nextWant(home), price = want && FURNITURE[want].price;
      if (want && (u.coins || 0) >= price + 2 * world.foodPrice() && startPath(u, world, shop.door.x, shop.door.z)) { u.state = US.GoMarket; u.shop = { kind: "furnish", id: want }; emote(u, `${FURNITURE[want].name} 사러!`); return; }
    }
  }
  // 만족도가 낮으면(75 아래) 스스로 동네를 고침: 집 앞 마당 고르기 · 시장/은행까지 돌길 · 장식 주문. 낮을수록 더 자주
  if (world.economy && (u.sat ?? 100) < 75 && !u.committed && (u.needs?.energy ?? 100) >= M.TIRED && rnd() < (75 - (u.sat ?? 75)) / 75 + 0.12 && startImprove(u, world, rnd)) return;
  if (J.isLazy(u) && rnd() < 0.5) { startActivity(u, "rest", world, rnd); emote(u, pick(["z", "배불러…", "…"], rnd)); return; }   // 너무 불러서 뒹굴
  if (u.needs && u.needs.energy < 20 && startActivity(u, "sleep", world, rnd)) return;   // 지치면 잠
  if (u.needs && u.needs.energy < M.TIRED) { startActivity(u, "rest", world, rnd); emote(u, pick(["🥱 좀 쉬자", "😮‍💨 피곤해", "후…"], rnd)); return; }   // 피곤하면 쉼(기력이 찰 때까지)
  // 성격 + 직업 특기 × 욕구(급한 욕구를 채우는 일) × 배운 취향(해 보니 좋았던 일)
  const opts = J.activityWeights(u).map(([k, w]) => [k, w * M.needMult(u, k) * M.prefMult(u, k)]);
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
  for (const k of J.helpJobs(u, world.res)) if (startActivity(u, k, world, rnd)) { emote(u, pick(HELP_SAY[k] || ["일손 돕기!"], rnd), 2); return true; }
  return false;
}
const HELP_SAY = { chop: ["🪓 나무 해 올게!", "일손 돕기!"], mine: ["⛏ 돌 캐 올게!", "일손 돕기!"], fish: ["🎣 낚시 도울게!", "일손 돕기!"] };

export function enterBuilding(u, b, rnd) {
  release(u);
  const act = u.activity, sleepy = u.sleepy; u.activity = null; u.sleepy = false;
  release(u);
  u.state = US.Inside; u.insideBuildingId = b.id; u.timer = sleepy ? 15 + rnd() * 10 : 6 + rnd() * 8; u.path = null; u.goal = null; u.running = false;
  u.insideAct = sleepy ? "sleep" : act;
  u.useFurni = b.owner === u.unitId ? F.pickUse(b, sleepy, rnd) : null;            // 자기 집이면 가구를 씀(침대에서 낮잠 등)
  if (u.useFurni && FURNITURE[u.useFurni.id].use === "sleep") u.timer += 6;
  if (!b.occupants.includes(u.unitId)) b.occupants.push(u.unitId);
}
export function exitBuilding(u, world, rnd) {
  const b = world.buildings.get(u.insideBuildingId);
  if (b) b.occupants = b.occupants.filter(id => id !== u.unitId);
  const spot = b ? nearestWalkable(world.grid, b.door.x, b.door.z) : nearestWalkable(world.grid, Math.floor(u.x), Math.floor(u.z));
  if (spot) { u.x = spot[0] + 0.5; u.z = spot[1] + 0.5; }
  u.insideBuildingId = null; u.activity = u.insideAct || null; u.insideAct = null; u.useFurni = null;
  done(u, 0.7, rnd, world);                                                // 집 구경·잠 = 좋은 경험
}

// ---------------------------------------------------------------- 매 프레임
/** 기분 말풍선: 20~40초마다(갈매미마다 엇갈리게), 다른 말풍선이 없을 때 지금 기분을 보여 줌. 난수(rnd)는 안 씀(마을 진행에 영향 없음) */
const MOODS = { sleep: ["💤", "zZ…"], hungry: ["😫 배고파", "🐟 먹고 싶다…"], tired: ["😮‍💨 피곤해", "🥱 쉬고 싶다"], happy: ["😊", "♪", "☺️ 좋다", "🌸 기분 좋아"], sit: ["☕ 편하다", "😌", "♪ 쉬는 중"], read: ["📖 재밌다", "📚 음…", "💭 그렇구나"], sad: ["😞", "😟 별로야…"], cold: ["🥶 추워", "❄️ 으슬으슬"] };
export function moodBubble(u, dt, world) {
  const id = Number.isFinite(u.unitId) ? u.unitId : 0;
  if ((u.moodT = (u.moodT ?? 8 + (id * 7) % 20) - dt) > 0 || u.emoteT > 0 || u.state === US.Held) return;
  u.moodT = 20 + ((id * 13 + Math.floor(world.time || 0)) % 21);
  const n = u.needs, sat = u.sat ?? 50, k = u.state === US.Sleep || u.sleeping || u.useFurni && FURNITURE[u.useFurni.id]?.use === "sleep" ? "sleep"
    : (u.full ?? 80) < J.HUNGRY ? "hungry" : n && n.energy < 20 ? "tired"
    : u.useFurni && u.insideBuildingId ? (FURNITURE[u.useFurni.id]?.use === "read" ? "read" : FURNITURE[u.useFurni.id]?.use === "sit" ? "sit" : null) : world.season === "winter" && (world.snow ?? 0) > 0.3 && !u.insideBuildingId && (u.unitId + Math.floor(world.time || 0)) % 3 === 0 ? "cold"
    : sat >= 80 ? "happy" : sat < 30 ? "sad" : null;
  if (!k) return; const list = MOODS[k]; emote(u, list[(id + Math.floor((world.time || 0) / 7)) % list.length] || list[0], 2.4);
}
export function updateUnit(u, dt, world, rnd = Math.random) {
  u.timer -= dt; if (u.emoteT > 0) u.emoteT -= dt;
  moodBubble(u, dt, world);
  u.full = Math.max(0, (u.full ?? 80) - J.HUNGER_PER_SEC * (world.hungerScale ?? 1) * (world.fx?.hunger ?? 1) * dt); u.eff = J.efficiency(u.full);   // 배고파짐 → 능률
  M.tickNeeds(u, dt, u.state, !!u.insideBuildingId);
  if (u.useFurni && u.insideBuildingId && u.needs) {                              // 집 가구 쓰기: 침대 = 기력 회복 두 배, 앉기 = 조금 더, 책장 = 재미
    const k = FURNITURE[u.useFurni.id]?.use, n = u.needs;
    if (k === "sleep") n.energy = Math.min(100, n.energy + 3 * dt); else if (k === "sit") n.energy = Math.min(100, n.energy + 1 * dt); else if (k === "read") n.fun = Math.min(100, n.fun + 1.5 * dt);
  }
  if (u.insideBuildingId && u.needs && world.buildings.get(u.insideBuildingId)?.defId === "cafe") { u.needs.fun = Math.min(100, u.needs.fun + 2 * dt); u.needs.social = Math.min(100, u.needs.social + 1.5 * dt); }   // 카페: 재미·친구
  if (u.insideBuildingId && u.needs && world.buildings.get(u.insideBuildingId)?.defId === "aquarium") u.needs.fun = Math.min(100, u.needs.fun + 2.5 * dt);   // 수족관 구경: 재미
  if (u.needs && u.needs.energy < 15) u.eff *= 0.8;                       // 너무 지치면 일도 느림
  u.eff *= 0.85 + 0.3 * (u.sat ?? 50) / 100;                             // 만족도가 높으면 조금 더 빨리(0.85~1.15)
  if (u.state === US.Held) return;                                       // 들려 있는 동안은 입력이 위치를 정함
  if (u.sailing) { sail(u, dt, world); return; }                          // 배 타는 중: 배가 닿을 때까지 다른 일은 안 함(닿으면 원래 하던 일의 길을 이어 감)
  if (!u.swimming && !u.insideBuildingId && world.grid.isWater(...cellOf(u)) && !world.grid.isWalkable(...cellOf(u))) {   // 헤엄 중이 아닌데 물에 있으면(헤엄을 그만둠 등) 가까운 땅으로(부두 위는 그대로)
    const spot = nearestWalkable(world.grid, ...cellOf(u)); if (spot) { u.x = spot[0] + 0.5; u.z = spot[1] + 0.5; u.anim = null; emote(u, "푸하!"); }
  }
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
  // 반사 행동
  if (p.timid && visible(u) && ![US.Flee, US.Fish, US.GoFish, US.Inside, US.GoToBuilding, US.Swim].includes(u.state)) {
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
      emote(u, { building: "오!", tree: "와!", fish: "우와!", drop: "?", site: "뭐 짓지?" }[c.kind] || "!");
      if (rnd() < 0.4 && pathBeside(u, world, Math.floor(c.x), Math.floor(c.z))) { u.state = US.Curious; u.curiousAt = c; }
    }
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
      if (u.timer <= 0 && sleepTime(u, world) && (u.full ?? 80) >= J.HUNGRY && !festAwake(u, world)) { u.timer = 8; break; }   // 집이 없으면 밖에서 계속 잠
      if (u.timer <= 0 || ((u.needs?.energy ?? 100) >= 95 && !sleepTime(u, world))) { u.activity = "sleep"; done(u, 1, rnd, world); emote(u, "잘 잤다!"); }
      break;
    case US.GoFest:                                                                 // 축제 광장으로 가는 중(그사이 축제가 끝나면 그만둠)
      if (!world.festival) { setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) partyAt(u, world, rnd);
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
        () => { emote(u, t.alive ? "💪" : chop ? `나무+${t.lastYield}` : `돌+${t.lastYield}${t.lastIron ? " 철+1" : ""}`);
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
    case US.GoBuild: {
      const b = u.focus;
      if (!world.buildings.has(b.id) || world.isDone(b)) { setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) {
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
        if (world.isDone(b)) { world.payWage(u, b); uncommit(u, world); done(u, 2, rnd, world); return; }
        M.learn(u, "build", 0.8);                                               // 한 바퀴 지을 때마다 보람
        world.payWage(u, b);                                                    // 한 바퀴 품삯(금고에서, 모자라면 밀림. 갈매미 주문 공사는 주문한 갈매미 돈에서)
        if (hasMaterials(world, b, u)) { useMaterials(world, b, u); return; }         // u.work가 비었으니 다음 바퀴부터 다시
        u.activity = null;
        emote(u, "재료가 없어!"); setIdle(u, rnd, world, 0.3);
      });
      break;
    }
    case US.GoSwim:
      if (followPath(u, dt, world, rnd)) { u.state = US.Swim; u.swimming = true; u.timer = 8 + rnd() * 7; u.swimGoal = null; u.anim = "Swim"; emote(u, pick(["첨벙!", "♪", "시원해~"], rnd)); }
      break;
    case US.Swim: swimStep(u, dt, world, rnd); break;
    case US.GoToBuilding: {
      const b = world.buildings.get(u.targetBuildingId);
      if (!b) { setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) enterBuilding(u, b, rnd);
      break;
    }
    case US.Inside:
      if (u.timer <= 0) { if (u.insideAct === "sleep" && sleepTime(u, world) && (u.full ?? 80) >= J.HUNGRY && !festAwake(u, world)) { u.timer = 8; if (u.useFurni?.id && !/bed/i.test(u.useFurni.id)) { const b = world.buildings.get(u.insideBuildingId); u.useFurni = b ? F.pickUse(b, true, rnd) : u.useFurni; } } else exitBuilding(u, world, rnd); }   // 아직 잘 시간이면 계속 잠(축제가 열리면 집에서 자다가도 나옴)
      break;
    case US.GoTrade:
      if (world.economy && followPath(u, dt, world, rnd)) {                         // 경제: 시장 앞에서 한동안 손님을 기다림
        u.state = US.Trade; u.timer = 8 + rnd() * 6; emote(u, "어서 오세요!"); u.tradeStart = u.coins || 0; break;
      }
      if (world.economy) break;
      if (followPath(u, dt, world, rnd)) {
        u.state = US.Trade; face(u, world.stall.x + 0.5, world.stall.z + 0.5);
        doOnce(u, "Attack", () => { const l = world.trade(u); u.lastReward = l.sold > 0 ? 1 + Math.min(1, l.sold / 50) : l.bought > 0 ? 0.7 : 0.1;
            emote(u, l.sold || l.bought ? `🐚 +${l.sold}${l.bought ? ` −${l.bought}` : ""}` : "손님이 없네", 2.2); },
          () => done(u, u.lastReward ?? 0.5, rnd, world, 1 + rnd()));
      }
      break;
    case US.GoFarm: {
      const pl = u.focus;
      if (followPath(u, dt, world, rnd)) {
        u.state = US.Farm; const planting = pl.stage === "empty"; if (planting) u.tool = "hoe";   // 심을 땐 괭이질, 거둘 땐 쪼기
        doOnce(u, planting ? "Hoe" : "Attack", () => { const r = world.farmPlot(pl, u); u.lastReward = r === "harvest" ? 1.3 : r === "plant" ? 0.6 : 0;
            emote(u, r === "plant" ? "🌱" : r === "harvest" ? `🌾+${pl.lastYield}` : "…"); },
          () => { u.tool = null; done(u, u.lastReward ?? 0.5, rnd, world); });
      }
      break;
    }
    case US.Trade:                                                                // 경제: 시장 앞에서 시간이 다 되면 번 만큼 보람
      if (world.economy && u.processing) { u.anim = "Build"; if (u.timer <= 0) { const n = world.processRaw(u); u.processing = false; emote(u, `📦 가공품 ${n}개`); done(u, 0.6 + n / 10, rnd, world); } break; }
      if (world.economy && !u.once && u.timer <= 0) { const got = (u.coins || 0) - (u.tradeStart || 0); emote(u, got > 0 ? `🪙+${got}` : "오늘은 한산하네"); done(u, 0.4 + got / 4, rnd, world); }
      break;
    case US.GoShore:                                                              // 바닷가: 물 쪽을 보고 쪼아 먹이를 잡음(쪼기 3번, 포만감 +18)
      if (followPath(u, dt, world, rnd)) {
        const d = u.shoreDir || [0, 1]; face(u, u.x + d[0], u.z + d[1]); u.state = US.Eat;
        doOnce(u, "Attack", () => { u.full = Math.min(J.FULL_MAX, (u.full ?? 80) + 18); const it = world.beachcomb?.(u); emote(u, it ? `✨ ${it.name}!` : pick(["🐟 냠", "🦐 냠", "🐚 냠"], rnd), it ? 2.6 : 1.6); world.emit("ate", u); }, () => done(u, 0.6, rnd, world));
      }
      break;
    case US.GoBank:                                                               // 공식은행: 가방의 물건을 팔고 새 돈을 받음
      if (followPath(u, dt, world, rnd)) {
        const r = world.sellProcessed(u); emote(u, r.coins ? `🏦 가공품 🪙+${r.coins}` : "팔 게 없네", 2.2); done(u, 0.4 + r.coins / 20, rnd, world);
      }
      break;
    case US.GoMarket: {                                                           // 시장: 음식 또는 집을 삼
      if (!followPath(u, dt, world, rnd)) break;
      const shop = u.shop || {}; u.shop = null;
      if (shop.kind === "sell") {
        const r = world.sellToMarket(u); emote(u, r.coins ? `🐚 원자재 🪙+${r.coins}` : "상인이 돈이 없대…", 2.2); done(u, r.coins ? 0.5 + r.coins / 20 : 0.1, rnd, world);
      } else if (shop.kind === "peddle") {                                         // 소지품 팔기(조개는 내 것, 상인은 1개에 1조개)
        const r = world.sellStash(u); emote(u, r.coins ? `🐚 소지품 ${r.n}개 🪙+${r.coins - r.cut}` : r.donated.length ? "🐠 수족관에 기증!" : "오늘은 안 팔래", 2.2); done(u, r.coins ? 0.5 + r.coins / 30 : 0.1, rnd, world);
      } else if (shop.kind === "process") {                                        // 가공: 개수만큼 망치질하는 시간
        const n = E.total(u.raw); u.state = US.Trade; u.processing = true; u.timer = 1.5 + n * 0.6; u.tool = "hammer"; u.anim = "Build"; emote(u, `🔨 가공 중(${n})`);
      } else if (shop.kind === "food") {
        if (world.buyFood(u)) { emote(u, "🛒 음식"); world.eatFood(u); done(u, 0.8, rnd, world); } else { emote(u, "다 팔렸네…"); setIdle(u, rnd, world); }
      } else if (shop.kind === "furnish") {
        if (world.buyFurniture(u, shop.id)) { emote(u, `🛋 ${FURNITURE[shop.id].name}!`, 2.6); done(u, 1.5, rnd, world); } else { emote(u, "돈이 모자라…"); setIdle(u, rnd, world); }
      } else if (shop.kind === "stock") {
        const n = world.stockFood(u); emote(u, n ? `🏚 저장고에 ${n}개 🪙+${n * E.GRANARY_BUY}` : "저장고가 꽉 찼네", 2.2); done(u, n ? 0.6 : 0.1, rnd, world);
      } else if (shop.kind === "granary") {
        const r = world.takeFood(u); if (r) { world.eatFood(u); emote(u, r === "buy" ? "🏚 저장고 음식 냠" : "🏚 나눠 받았어요", 2.2); done(u, 0.8, rnd, world); } else { emote(u, "저장고가 비었네…"); setIdle(u, rnd, world); }
      } else if (shop.kind === "house") {
        const b = world.buildings.get(shop.b);
        if (b && world.buyHouse(u, b)) { emote(u, "🏠 내 집!", 3); world.notice(u.x, u.z, "building", u); done(u, 2.5, rnd, world); } else { emote(u, b && world.houseDeal(u, b).reason === "vault" ? "은행에 돈이 없대…" : "놓쳤다…"); setIdle(u, rnd, world); }
      } else setIdle(u, rnd, world);
      break;
    }
    case US.GoSit: {
      const b = world.buildings.get(u.sitOn); if (!b) { standUp(u, world); setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) {
        const [cx, cz] = b.cells[0]; u.state = US.Sit; u.timer = Math.min(30, Math.max(7 + rnd() * 7, (M.REST_UNTIL - (u.needs?.energy ?? 100)) / (0.6 + M.BENCH_GAIN))); u.path = null;   // 피곤하면 기력이 찰 때까지
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
      if (followPath(u, dt, world, rnd)) { const [x, z] = u.improve.cells[u.improve.i]; face(u, x + 0.5, z + 0.5); u.state = US.Improve; u.tool = u.improve.kind === "pave" ? "hammer" : "hoe"; }
      break;
    case US.Improve:
      if (!u.improve) { setIdle(u, rnd, world); break; }
      workLoop(u, dt, u.improve.kind === "pave" ? "Pave" : "Hoe", 2, () => {}, () => {   // 길 = 쪼그려 톡톡, 마당 = 괭이질
        const ok = improveCell(u, world); u.improve.i++;
        if (!ok || u.improve.i >= u.improve.cells.length || !improveNext(u, world)) { const kind = u.improve.kind; endImprove(u, world); emote(u, kind === "pave" ? "🛣 길 완성!" : "🏡 마당 끝!", 2.2); M.learn(u, "build", 0.8); done(u, 1.4, rnd, world); }
      });
      break;
    case US.Greet: case US.Eat: case US.Farm: break;          // doOnce가 끝나면 풀림
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
  u.state = US.Swim; u.swimming = true; u.timer = 8 + rnd() * 7; u.swimGoal = null; u.anim = "Swim"; u.activity = "swim"; emote(u, "첨벙!");
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
    if (goal.land) { u.swimming = false; u.swim = null; u.anim = null; emote(u, pick(["휴~ 상쾌!", "♪", "부르르"], rnd)); done(u, 0.6 + (100 - (u.needs?.fun ?? 100)) / 200, rnd, world); }
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
