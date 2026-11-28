// 건물 배치 규칙(지시서 4-1). 순수 함수: 미리보기(고스트)와 실제 짓기가 같은 판정을 쓴다.
import { MAX_STEP, BRIDGE_Y } from "../config.js";

/** 회전(90° 단위)을 넣은 차지 칸 수. */
export function rotatedSize(def, rot) { const { w, d } = def.footprint; return rot % 2 ? { w: d, d: w } : { w, d }; }

/** 가리킨 칸이 건물 가운데에 오도록 하는 왼쪽 위(최소) 칸. */
export function anchorFor(def, hx, hz, rot) { const s = rotatedSize(def, rot); return { x: hx - Math.floor((s.w - 1) / 2), z: hz - Math.floor((s.d - 1) / 2) }; }

/**
 * 차지 칸과 문 앞 칸. 건물 모델의 문은 회전 전 기준 +z 쪽 면 가운데에 있다.
 * three.js의 rotation.y = θ와 같은 식으로 돌린다: (x, z) → (x cosθ + z sinθ, −x sinθ + z cosθ).
 */
export function footprint(def, ax, az, rot) {
  const { w, d } = def.footprint, s = rotatedSize(def, rot), cx = ax + s.w / 2, cz = az + s.d / 2;
  const th = rot * Math.PI / 2, c = Math.round(Math.cos(th)), sn = Math.round(Math.sin(th));
  const turn = (lx, lz) => [Math.floor(cx + lx * c + lz * sn + 1e-6), Math.floor(cz - lx * sn + lz * c + 1e-6)];
  const cells = [];
  for (let lz = 0; lz < d; lz++) for (let lx = 0; lx < w; lx++) cells.push(turn(lx + 0.5 - w / 2, lz + 0.5 - d / 2));
  const [doorX, doorZ] = turn(Math.floor(w / 2) + 0.5 - w / 2, d / 2 + 0.5);
  return { cells, door: { x: doorX, z: doorZ }, center: { x: cx, z: cz }, size: s, angle: th };
}

/**
 * 지을 수 있는지 판정. units: 유닛 목록(서 있는 칸에는 짓지 않음, 건물 안 유닛은 상관없음).
 * @returns {{ ok: boolean, reason: string, cells, door, center, size, angle, elevation: number }}
 */
export function checkPlacement(grid, def, ax, az, rot, units = []) {
  const fp = footprint(def, ax, az, rot), fail = reason => ({ ...fp, ok: false, reason, elevation: 0 });
  if (!fp.cells.every(([x, z]) => grid.inBounds(x, z))) return fail("섬 밖이에요");
  if (def.bridge) {                                                          // 다리: 물 칸에만, 문 없음
    if (fp.cells.some(([x, z]) => !grid.isWater(x, z))) return fail("다리는 물 위에만 놓아요");
    if (fp.cells.some(([x, z]) => grid.get(x, z).occupiedId)) return fail("이미 다리가 있어요");
    const inFp0 = new Set(fp.cells.map(([x, z]) => `${x},${z}`));
    if (units.some(u => !u.insideBuildingId && inFp0.has(`${Math.floor(u.x)},${Math.floor(u.z)}`))) return fail("갈매미가 있어요");
    return { ...fp, ok: true, reason: "", elevation: BRIDGE_Y, ramp: null };
  }
  if (fp.cells.some(([x, z]) => grid.isWater(x, z))) return fail("바다에는 지을 수 없어요");
  if (fp.cells.some(([x, z]) => grid.get(x, z).occupiedId)) return fail("다른 건물·시설과 겹쳐요");
  // 계단 이어 놓기: 아래 계단의 위쪽 칸에, 같은 방향으로 놓는 계단은 괜찮음(아래 계단 → 이 계단으로 바로 이어짐)
  const [s0x, s0z] = fp.cells[0], upDx = s0x - fp.door.x, upDz = s0z - fp.door.z;
  const rampOf = id => id && grid.occupants.get(id)?.ramp;
  const continues = (x, z) => { const r = rampOf(grid.doorOwner(x, z)); return def.stairs && r && r.bx === x && r.bz === z && r.dx === upDx && r.dz === upDz; };
  if (fp.cells.some(([x, z]) => grid.doorOwner(x, z) && !continues(x, z))) return fail("다른 건물의 문 앞이에요");
  const e = grid.get(fp.cells[0][0], fp.cells[0][1]).elevation;
  if (fp.cells.some(([x, z]) => Math.abs(grid.get(x, z).elevation - e) > 1e-6)) return fail("바닥이 평평하지 않아요");
  const below = def.stairs && rampOf(grid.get(fp.door.x, fp.door.z)?.occupiedId);   // 문(입구) 칸이 아래 계단이면 그 계단 꼭대기 높이
  const dh = below ? (below.dx === upDx && below.dz === upDz ? below.h1 : null) : grid.walkHeight(fp.door.x, fp.door.z);
  if (dh === null || Math.abs(dh - e) > MAX_STEP + 1e-6) return fail("문 앞이 막혀 있어요");
  let ramp = null;
  if (def.stairs) {                                                          // 계단: 문(입구) 반대쪽 칸이 올라갈 곳
    const [sx, sz] = fp.cells[0], bx = 2 * sx - fp.door.x, bz = 2 * sz - fp.door.z, top = grid.walkHeight(bx, bz);
    if (top === null || grid.get(bx, bz)?.occupiedId || grid.doorOwner(bx, bz)) return fail("계단으로 올라갈 곳이 막혀 있어요");
    if (top - e < 0.1) return fail("계단 뒤쪽이 더 높아야 해요. R로 방향을 돌려 봐요");
    if (top - e > 1.5 + 1e-6) return fail("계단 하나로는 1.5 m까지만 올라가요");
    ramp = { dx: bx - sx, dz: bz - sz, bx, bz, h0: e, h1: top };
  }
  if (def.dock || def.pier) {                                                // 낚시터·선착장: 문 반대쪽 칸이 물이어야 함
    const [sx, sz] = fp.cells[0], bx = 2 * sx - fp.door.x, bz = 2 * sz - fp.door.z;
    if (!grid.inBounds(bx, bz) || !grid.isWater(bx, bz)) return fail(`${def.name} 앞쪽이 물이어야 해요. R로 방향을 돌려 봐요`);
  }
  const inFp = new Set(fp.cells.map(([x, z]) => `${x},${z}`));
  if (units.some(u => !u.insideBuildingId && inFp.has(`${Math.floor(u.x)},${Math.floor(u.z)}`))) return fail("갈매미가 서 있어요");
  return { ...fp, ok: true, reason: "", elevation: e, ramp };
}
