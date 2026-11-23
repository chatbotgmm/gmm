// 갈매미 유닛 AI(지시서 4-3). 순수 로직: 상태(UnitAIState)만 바꾸고, 그림은 render/views.js가 따라 그린다.
// 1단계: 쉬기(Idle) → 산책(Wander) 또는 건물로 가기(GoToBuilding) → 문으로 들어가 안에 머물기(Inside) → 문으로 나오기.
// 2단계에서 Inside 안에 GoToFurniture / Interact(가구의 InteractionPoint로 가서 Sit·Eat·Work·Rest)를 넣는다.
import { UnitState } from "../data/types.js";
import { UNIT_SPEED } from "../config.js";
import { findPath, nearestWalkable } from "../world/pathfinding.js";

const cellOf = u => [Math.floor(u.x), Math.floor(u.z)];

export function setIdle(u, rnd) {
  u.running = false; u.state = UnitState.Idle; u.timer = 1.5 + rnd() * 4; u.path = null; u.pathIndex = 0; u.goal = null; u.targetBuildingId = null;
}

function startPath(u, world, gx, gz) {
  const [sx, sz] = cellOf(u), path = findPath(world.grid, sx, sz, gx, gz);
  if (!path) return false;
  u.path = path; u.pathIndex = 0; u.goal = { x: gx, z: gz };
  u.running = !!u.runSpeed && path.length > 7;                     // 먼 길은 달림(모델의 Run 동작이 있을 때)
  return true;
}

function chooseNext(u, world, rnd) {
  const buildings = [...world.buildings.values()];
  if (buildings.length && rnd() < 0.45) {
    const b = buildings[Math.floor(rnd() * buildings.length)];
    if (startPath(u, world, b.door.x, b.door.z)) { u.state = UnitState.GoToBuilding; u.targetBuildingId = b.id; return; }
  }
  const [sx, sz] = cellOf(u);
  for (let k = 0; k < 12; k++) {                                   // 근처(반경 9칸) 아무 데나 산책
    const gx = sx + Math.round((rnd() * 2 - 1) * 9), gz = sz + Math.round((rnd() * 2 - 1) * 9);
    if (world.grid.isWalkable(gx, gz) && startPath(u, world, gx, gz)) { u.state = UnitState.Wander; return; }
  }
  setIdle(u, rnd);
}

/** 경로를 따라 한 프레임 이동. 도착하면 true. 앞 칸이 막히면(새 건물 등) 같은 목적지로 다시 길을 찾는다. */
function followPath(u, dt, world, rnd) {
  const grid = world.grid; let move = (u.running ? u.runSpeed : u.walkSpeed ?? UNIT_SPEED) * dt;
  while (move > 0 && u.path && u.pathIndex < u.path.length) {
    const [nx, nz] = u.path[u.pathIndex], [cx, cz] = cellOf(u);
    if ((nx !== cx || nz !== cz) && !grid.canStep(cx, cz, nx, nz)) {
      if (!u.goal || !startPath(u, world, u.goal.x, u.goal.z)) { setIdle(u, rnd); return false; }
      continue;
    }
    const tx = nx + 0.5, tz = nz + 0.5, dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
    if (d > 1e-6) u.heading = Math.atan2(dx, dz);
    if (d <= move) { u.x = tx; u.z = tz; move -= d; u.pathIndex++; }
    else { u.x += dx / d * move; u.z += dz / d * move; move = 0; }
  }
  return !!u.path && u.pathIndex >= u.path.length;
}

export function enterBuilding(u, b, rnd) {
  u.state = UnitState.Inside; u.insideBuildingId = b.id; u.timer = 6 + rnd() * 8; u.path = null; u.goal = null;
  if (!b.occupants.includes(u.unitId)) b.occupants.push(u.unitId);
}

export function exitBuilding(u, world, rnd) {
  const b = world.buildings.get(u.insideBuildingId);
  if (b) { b.occupants = b.occupants.filter(id => id !== u.unitId); }
  const spot = b ? nearestWalkable(world.grid, b.door.x, b.door.z) : nearestWalkable(world.grid, Math.floor(u.x), Math.floor(u.z));
  if (spot) { u.x = spot[0] + 0.5; u.z = spot[1] + 0.5; }
  u.insideBuildingId = null; setIdle(u, rnd);
}

export function updateUnit(u, dt, world, rnd = Math.random) {
  u.timer -= dt;
  switch (u.state) {
    case UnitState.Idle:
      if (u.timer <= 0) chooseNext(u, world, rnd); break;
    case UnitState.Wander:
      if (followPath(u, dt, world, rnd)) setIdle(u, rnd); break;
    case UnitState.GoToBuilding: {
      const b = world.buildings.get(u.targetBuildingId);
      if (!b) { setIdle(u, rnd); break; }                               // 가는 동안 철거됨
      if (followPath(u, dt, world, rnd)) enterBuilding(u, b, rnd);
      break;
    }
    case UnitState.Inside:
      if (u.timer <= 0) exitBuilding(u, world, rnd); break;
    case UnitState.Held: return;                                          // 들려 있는 동안은 아무것도 안 함(위치는 입력이 정함)
    default: setIdle(u, rnd);
  }
  if (!u.insideBuildingId) {                                            // 서 있는 높이를 부드럽게 따라감(계단·부두)
    const [cx, cz] = cellOf(u), h = world.grid.walkHeight(cx, cz);
    if (h !== null) u.y += (h - u.y) * Math.min(1, dt * 10);
  }
}
