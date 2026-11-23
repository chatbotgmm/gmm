// 오토타일링(지시서 3-B-3). 돌길·나무 데크·흙길은 상하좌우 같은 종류 칸을 비트마스크로 보고
// 가운데/끝/직선/모서리/T자/십자 조각을 고른다. 1단계는 조각을 사각형으로 그리고(tilePieces),
// 나중에 Tripo 타일 모델을 쓸 때는 tileVariant의 kind·rot으로 모델을 고르면 된다.
import { GroundType } from "../data/types.js";

export const PATH_TYPES = new Set([GroundType.Cobble, GroundType.WoodDeck, GroundType.Dirt]);
export const N = 1, E = 2, S = 4, W = 8;          // N = z-1, E = x+1, S = z+1, W = x-1

function same(grid, x, z, type) { const c = grid.get(x, z); return !!c && c.groundType === type; }

export function connectMask(grid, x, z) {
  const t = grid.get(x, z).groundType; let m = 0;
  if (same(grid, x, z - 1, t)) m |= N;
  if (same(grid, x + 1, z, t)) m |= E;
  if (same(grid, x, z + 1, t)) m |= S;
  if (same(grid, x - 1, z, t)) m |= W;
  return m;
}

// 16가지 마스크 → 조각 종류와 회전(90° 단위, 시계 방향, 기준: end는 N으로 열림, corner는 N+E, tee는 N 없이 E+S+W).
const TABLE = (() => {
  const t = new Array(16);
  t[0] = { kind: "isolated", rot: 0 }; t[15] = { kind: "cross", rot: 0 };
  [N, E, S, W].forEach((b, r) => { t[b] = { kind: "end", rot: r }; });
  t[N | S] = { kind: "straight", rot: 0 }; t[E | W] = { kind: "straight", rot: 1 };
  [N | E, E | S, S | W, W | N].forEach((b, r) => { t[b] = { kind: "corner", rot: r }; });
  [E | S | W, S | W | N, W | N | E, N | E | S].forEach((b, r) => { t[b] = { kind: "tee", rot: r }; });
  return t;
})();
export function tileVariant(mask) { return TABLE[mask]; }

/** 한 칸 안에 칠할 사각형들 [x0, z0, x1, z1] (칸 안 좌표 0~1). 이웃과 이어지는 쪽은 칸 끝까지 뻗는다. */
export function tilePieces(grid, x, z, m = 0.14) {
  const t = grid.get(x, z).groundType, mask = connectMask(grid, x, z), out = [[m, m, 1 - m, 1 - m]];
  if (mask & N) out.push([m, 0, 1 - m, m]);
  if (mask & S) out.push([m, 1 - m, 1 - m, 1]);
  if (mask & W) out.push([0, m, m, 1 - m]);
  if (mask & E) out.push([1 - m, m, 1, 1 - m]);
  // 모서리는 두 변과 대각선 칸까지 같은 종류일 때만 채운다(넓은 면은 빈틈 없이, L자 안쪽은 홈이 남음).
  if ((mask & N) && (mask & W) && same(grid, x - 1, z - 1, t)) out.push([0, 0, m, m]);
  if ((mask & N) && (mask & E) && same(grid, x + 1, z - 1, t)) out.push([1 - m, 0, 1, m]);
  if ((mask & S) && (mask & W) && same(grid, x - 1, z + 1, t)) out.push([0, 1 - m, m, 1]);
  if ((mask & S) && (mask & E) && same(grid, x + 1, z + 1, t)) out.push([1 - m, 1 - m, 1, 1]);
  return out;
}
