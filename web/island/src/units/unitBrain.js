// 갈매미 유닛 AI(지시서 4-3 + web/village의 마을 생활). 순수 로직: 상태(UnitAIState)만 바꾸고,
// 뷰는 u.anim(틀 애니메이션 이름)·u.tool(손에 든 도구)·u.emoteText(말풍선)·u.fishing(찌 위치)을 읽어 그린다.
//
// 할 일이 없으면(Idle) 성격(PERSONA) 비중으로 하나를 고른다:
//   쉬기 · 산책 · 씨앗 먹기 · 친구에게 가서 인사 · 신나서 뛰기 · 벌목 · 채광 · 낚시 · 집 짓기(공사장) · 건물 들어가기
// 반사 행동: 겁 많은 갈매미(미니)는 큰 갈매미가 다가오면 도망, 혼자 있고 싶은 갈매미(그림자)는 쉬다가 붐비면 자리를 피함.
import { UnitState as US } from "../data/types.js";
import { UNIT_SPEED } from "../config.js";
import { PERSONA } from "../data/catalog.js";
import { findPath, nearestWalkable } from "../world/pathfinding.js";

// 애니메이션 한 번의 길이와 타격 시점(초). 모델을 불러오면 뷰가 u.clip에 실제 값을 넣는다.
const DEFAULT_CLIP = { Chop: { len: 1, hit: 0.5 }, Mine: { len: 1, hit: 0.5 }, Build: { len: 0.6, hit: 0.25 },
  FishCast: { len: 1.2, hit: 1.2 }, FishReel: { len: 1, hit: 0.25 }, Jump: { len: 0.8, hit: 0.4 }, Attack: { len: 0.8, hit: 0.5 } };
const clip = (u, k) => (u.clip && u.clip[k]) || DEFAULT_CLIP[k];
const cellOf = u => [Math.floor(u.x), Math.floor(u.z)];
const GIVE_UP = 40;                                   // 이 시간(초) 넘게 가는 중이면 포기
const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];
const visible = u => !u.insideBuildingId && u.state !== US.Held;

export function emote(u, text, secs = 1.6) { u.emoteText = text; u.emoteT = secs; }

/** 찜해 둔 것(나무·광석·씨앗·낚시 자리·공사장)을 놓고 손을 비운다. */
function release(u) {
  const f = u.focus;
  if (f && f.claimed === u.unitId) f.claimed = null;
  if (f && f.busy === u.unitId && u.committed !== f.id) f.busy = null;   // 맡은 공사장(committed)은 끝날 때까지 찜 유지
  u.focus = null; u.work = null; u.once = null; u.tool = null; u.fishing = null; u.anim = null; u.fishT = undefined;
}
/** 맡은 공사를 내려놓음(완공·들어 올림·철거 때). */
export function uncommit(u, world) {
  const b = u.committed && world && world.buildings.get(u.committed);
  if (b && b.busy === u.unitId) b.busy = null;
  u.committed = null;
}
export function setIdle(u, rnd, world = null, secs = null) {
  release(u);
  u.running = false; u.state = US.Idle; u.timer = secs ?? 1 + rnd() * 3; u.path = null; u.pathIndex = 0; u.goal = null;
  u.targetBuildingId = null; u.moveT = 0; u.lookAt = undefined;
}

function startPath(u, world, gx, gz, run = null) {
  const [sx, sz] = cellOf(u), path = findPath(world.grid, sx, sz, gx, gz);
  if (!path) return false;
  u.path = path; u.pathIndex = 0; u.goal = { x: gx, z: gz }; u.moveT = 0;
  u.running = run ?? (!!u.runSpeed && path.length > 7);           // 먼 길은 달림
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
  const grid = world.grid; let move = (u.running ? u.runSpeed : u.walkSpeed ?? UNIT_SPEED) * dt;
  u.moveT = (u.moveT || 0) + dt;
  while (move > 0 && u.path && u.pathIndex < u.path.length) {
    const [nx, nz] = u.path[u.pathIndex], [cx, cz] = cellOf(u);
    if ((nx !== cx || nz !== cz) && !grid.canStep(cx, cz, nx, nz)) {
      if (!u.goal || !startPath(u, world, u.goal.x, u.goal.z, u.running)) { setIdle(u, rnd, world); return false; }
      continue;
    }
    const tx = nx + 0.5, tz = nz + 0.5, dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
    if (d > 1e-6) u.heading = Math.atan2(dx, dz);
    if (d <= move) { u.x = tx; u.z = tz; move -= d; u.pathIndex++; }
    else { u.x += dx / d * move; u.z += dz / d * move; move = 0; }
  }
  return !!u.path && u.pathIndex >= u.path.length;
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
  u.work.t += dt;
  const n = Math.min(hits, Math.floor((u.work.t - c.hit) / c.len) + 1);
  while (u.work && u.work.done < n) { u.work.done++; onHit(u.work.done); }
  if (u.work && u.work.done >= hits && u.work.t >= hits * c.len) { u.work = null; onEnd(); }
}

// ---------------------------------------------------------------- 활동 시작
function reach(u) { return 4 + 6 * Math.sqrt(u.scale || 1); }

function startActivity(u, kind, world, rnd) {
  const g = world.grid, persona = PERSONA[u.name] || PERSONA["기본"];
  switch (kind) {
    case "rest": setIdle(u, rnd, world, 2 + rnd() * 4); if (rnd() < 0.3) emote(u, pick(["…", "♪", "z"], rnd)); return true;
    case "wander": {
      const [sx, sz] = cellOf(u), r = Math.round(reach(u));
      for (let k = 0; k < 12; k++) {
        const gx = sx + Math.round((rnd() * 2 - 1) * r), gz = sz + Math.round((rnd() * 2 - 1) * r);
        if (g.isWalkable(gx, gz) && startPath(u, world, gx, gz, !!persona.timid && rnd() < 0.6)) { u.state = US.Wander; return true; }
      }
      return false;
    }
    case "zoomies": {
      if (!startActivity(u, "wander", world, rnd)) return false;
      u.state = US.Zoomies; u.running = true; u.chain = 3; emote(u, "✨"); return true;
    }
    case "forage": {
      const s = nearest(u, world.seeds.filter(s => !s.claimed && Math.hypot(s.x - u.x, s.z - u.z) < reach(u) * 1.8), s => [s.x, s.z]);
      if (!s || !startPath(u, world, s.x, s.z, !!persona.timid)) return false;
      s.claimed = u.unitId; u.focus = s; u.state = US.Forage; return true;
    }
    case "visit": {
      const f = nearest(u, world.units.filter(o => o !== u && visible(o) && !(PERSONA[o.name] || {}).loner && [US.Idle, US.Wander].includes(o.state)), o => cellOf(o));
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
      const s = nearest(u, world.spots.filter(s => !s.claimed && g.isWalkable(s.x, s.z)), s => [s.x, s.z]);
      if (!s || !startPath(u, world, s.x, s.z)) return false;
      s.claimed = u.unitId; u.focus = s; u.state = US.GoFish; return true;
    }
    case "build": {
      // 맡은 공사장이 있으면 그곳, 없으면 남이 안 맡은 공사장 중 많이 지어진 곳. 한 번 맡으면 100%까지 맡는다.
      let b = u.committed ? world.buildings.get(u.committed) : null;
      if (b && (world.isDone(b) || (b.busy && b.busy !== u.unitId))) { uncommit(u, world); b = null; }
      if (!b) b = [...world.buildings.values()].filter(b => !world.isDone(b) && !b.busy).sort((a, c) => c.hits / c.need - a.hits / a.need)[0];
      if (!b) return false;
      u.committed = b.id; b.busy = u.unitId;
      if (world.res.wood < 1 || world.res.stone < 1) {                            // 재료가 없으면 구하러 갔다가 이 공사장으로 돌아옴
        if (startActivity(u, world.res.wood <= world.res.stone ? "chop" : "mine", world, rnd)) { emote(u, "재료 구하러!"); return true; }
        if (startActivity(u, world.res.wood <= world.res.stone ? "mine" : "chop", world, rnd)) { emote(u, "재료 구하러!"); return true; }
        return false;
      }
      if (!startPath(u, world, b.door.x, b.door.z)) return false;
      u.focus = b; u.state = US.GoBuild; return true;
    }
    case "enter": {
      const done = [...world.buildings.values()].filter(b => world.isDone(b));
      if (!done.length) return false;
      const b = pick(done, rnd);
      if (!startPath(u, world, b.door.x, b.door.z)) return false;
      u.state = US.GoToBuilding; u.targetBuildingId = b.id; return true;
    }
  }
  return false;
}

function chooseNext(u, world, rnd) {
  if (u.committed && startActivity(u, "build", world, rnd)) return;          // 맡은 공사가 먼저
  const p = PERSONA[u.name] || PERSONA["기본"];
  const opts = Object.entries(p).filter(([, w]) => typeof w === "number" && w > 0);
  for (let tries = 0; tries < 3; tries++) {
    let r = rnd() * opts.reduce((s, [, w]) => s + w, 0), kind = "rest";
    for (const [k, w] of opts) if ((r -= w) <= 0) { kind = k; break; }
    if (startActivity(u, kind, world, rnd)) return;
  }
  startActivity(u, "rest", world, rnd);
}

export function enterBuilding(u, b, rnd) {
  release(u);
  u.state = US.Inside; u.insideBuildingId = b.id; u.timer = 6 + rnd() * 8; u.path = null; u.goal = null; u.running = false;
  if (!b.occupants.includes(u.unitId)) b.occupants.push(u.unitId);
}
export function exitBuilding(u, world, rnd) {
  const b = world.buildings.get(u.insideBuildingId);
  if (b) b.occupants = b.occupants.filter(id => id !== u.unitId);
  const spot = b ? nearestWalkable(world.grid, b.door.x, b.door.z) : nearestWalkable(world.grid, Math.floor(u.x), Math.floor(u.z));
  if (spot) { u.x = spot[0] + 0.5; u.z = spot[1] + 0.5; }
  u.insideBuildingId = null; setIdle(u, rnd, world);
}

// ---------------------------------------------------------------- 매 프레임
export function updateUnit(u, dt, world, rnd = Math.random) {
  u.timer -= dt; if (u.emoteT > 0) u.emoteT -= dt;
  if (u.state === US.Held) return;                                       // 들려 있는 동안은 입력이 위치를 정함
  if (u.once) {                                                         // 한 번 하는 동작이 끝날 때까지 기다림
    const o = u.once; o.t += dt;
    if (o.onHit && o.t >= o.hit) { const f = o.onHit; o.onHit = null; f(); }
    if (u.once === o && o.t >= o.len) { u.once = null; u.anim = null; o.then && o.then(); }
    return settle(u, dt, world);
  }
  const p = PERSONA[u.name] || PERSONA["기본"];
  // 반사 행동
  if (p.timid && visible(u) && ![US.Flee, US.Fish, US.GoFish, US.Inside, US.GoToBuilding].includes(u.state)) {
    const big = world.units.find(o => o !== u && visible(o) && (o.scale || 1) > 1.5 && Math.hypot(o.x - u.x, o.z - u.z) < 1.8);
    if (big) {
      setIdle(u, rnd, world); emote(u, "!");
      const dx = u.x - big.x, dz = u.z - big.z, d = Math.hypot(dx, dz) || 1;
      const spot = nearestWalkable(world.grid, Math.floor(u.x + dx / d * 4), Math.floor(u.z + dz / d * 4), 3);
      if (spot && startPath(u, world, spot[0], spot[1], true)) { u.state = US.Flee; return settle(u, dt, world); }
    }
  }
  if (p.loner && u.state === US.Idle && world.units.some(o => o !== u && visible(o) && Math.hypot(o.x - u.x, o.z - u.z) < 1.1)) {
    if (startActivity(u, "wander", world, rnd)) { u.state = US.Avoid; emote(u, "…"); }
  }
  if (moving(u) && u.moveT > GIVE_UP) { setIdle(u, rnd, world); return settle(u, dt, world); }

  switch (u.state) {
    case US.Idle:
      if (rnd() < dt * 0.25) u.lookAt = u.heading + (rnd() * 2 - 1) * 1.2;          // 두리번
      if (u.lookAt !== undefined) { let d = u.lookAt - u.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); u.heading += d * Math.min(1, 1.5 * dt); }
      if (u.timer <= 0) chooseNext(u, world, rnd);
      break;
    case US.Wander: case US.Avoid: case US.Flee:
      if (followPath(u, dt, world, rnd)) setIdle(u, rnd, world); break;
    case US.Zoomies:
      if (followPath(u, dt, world, rnd)) {
        if (--u.chain > 0 && startActivity(u, "wander", world, rnd)) { u.state = US.Zoomies; u.running = true; }
        else { u.state = US.Zoomies; u.path = null; doOnce(u, "Jump", null, () => { emote(u, pick(["♪", "✨"], rnd)); setIdle(u, rnd, world); }); }
      }
      break;
    case US.Forage: {
      const s = u.focus;
      if (!world.seeds.includes(s)) { setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) {
        face(u, s.x + s.ox, s.z + s.oz); u.state = US.Eat;
        doOnce(u, "Attack", () => { world.eatSeed(s); emote(u, "♥"); }, () => setIdle(u, rnd, world));
      }
      break;
    }
    case US.Visit: {
      const f = u.focus;
      if (!visible(f) || f.once || [US.Flee, US.Greet].includes(f.state)) { setIdle(u, rnd, world); break; }
      const close = Math.hypot(f.x - u.x, f.z - u.z) < 1.6, arrived = followPath(u, dt, world, rnd);
      if (u.state !== US.Visit) break;                                         // 길이 막혀 그만둠
      if (arrived || close) {
        if (!close) { setIdle(u, rnd, world); break; }                        // 가 보니 친구가 떠남
        u.path = null; face(u, f.x, f.z); u.state = US.Greet; emote(u, pick(["♪", "♥", "안녕!"], rnd));
        if ([US.Idle, US.Wander].includes(f.state)) { setIdle(f, rnd, world, 1.2); f.state = US.Greet; face(f, u.x, u.z); emote(f, "!");
          doOnce(f, "Jump", null, () => setIdle(f, rnd, world)); }
        doOnce(u, "Jump", null, () => setIdle(u, rnd, world));
      }
      break;
    }
    // ---- 일
    case US.GoChop: case US.GoMine: {
      const t = u.focus;
      if (!t.alive) { setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) { u.state = u.state === US.GoChop ? US.Chop : US.Mine; u.tool = u.state === US.Chop ? "axe" : "pickaxe"; u.workHits = t.hp; }
      break;
    }
    case US.Chop: case US.Mine: {
      const t = u.focus, chop = u.state === US.Chop; face(u, t.x + 0.5, t.z + 0.5);
      workLoop(u, dt, chop ? "Chop" : "Mine", u.workHits,
        () => { if (chop) world.hitTree(t, u); else world.hitOre(t); },
        () => { emote(u, t.alive ? "💪" : chop ? "나무+2" : "돌+2"); setIdle(u, rnd, world); });
      break;
    }
    case US.GoFish: {
      const s = u.focus;
      if (followPath(u, dt, world, rnd)) {
        u.state = US.Fish; u.tool = "rod"; face(u, s.x + 0.5 + s.dir[0], s.z + 0.5 + s.dir[1]);
        doOnce(u, "FishCast", null, () => { u.fishT = 3 + rnd() * 4; u.fishing = { x: s.x + 0.5 + s.dir[0] * 1.6, z: s.z + 0.5 + s.dir[1] * 1.6 }; }, 99);
      }
      break;
    }
    case US.Fish: {
      if (u.fishT === undefined) break;
      u.anim = "FishWait"; u.fishT -= dt;
      if (u.fishT <= 0) {
        u.fishT = undefined;
        doOnce(u, "FishReel", () => { u.fishing = null; if (rnd() < 0.7) { world.catchFish(u); emote(u, "🐟"); } else emote(u, "💧"); },
          () => setIdle(u, rnd, world));
      }
      break;
    }
    case US.GoBuild: {
      const b = u.focus;
      if (!world.buildings.has(b.id) || world.isDone(b)) { setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) {
        if (world.res.wood < 1 || world.res.stone < 1) { setIdle(u, rnd, world, 0.2); break; }   // 그새 재료가 떨어짐 → 구하러 감(맡은 건 유지)
        world.res.wood--; world.res.stone--;                                   // 도착하면 나무 1·돌 1을 씀
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
        if (world.isDone(b)) { uncommit(u, world); setIdle(u, rnd, world); return; }
        if (world.res.wood >= 1 && world.res.stone >= 1) { world.res.wood--; world.res.stone--; return; }   // u.work가 비었으니 다음 바퀴부터 다시
        emote(u, "재료가 없어!"); setIdle(u, rnd, world, 0.3);
      });
      break;
    }
    case US.GoToBuilding: {
      const b = world.buildings.get(u.targetBuildingId);
      if (!b) { setIdle(u, rnd, world); break; }
      if (followPath(u, dt, world, rnd)) enterBuilding(u, b, rnd);
      break;
    }
    case US.Inside:
      if (u.timer <= 0) exitBuilding(u, world, rnd); break;
    case US.Greet: case US.Eat: break;                                        // doOnce가 끝나면 풀림
    default: setIdle(u, rnd, world);
  }
  settle(u, dt, world);
}

/** 서 있는 높이를 부드럽게 따라감(계단·부두). */
function settle(u, dt, world) {
  if (u.insideBuildingId) return;
  const [cx, cz] = cellOf(u), h = world.grid.walkHeight(cx, cz);
  if (h !== null) u.y += (h - u.y) * Math.min(1, dt * 10);
}
