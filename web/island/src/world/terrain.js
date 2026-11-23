// 지형 높이(순수 함수): 칸마다 높이(elevation)는 하나지만, 보이는 땅은 칸 꼭짓점 높이로 부드럽게 잇는다.
// - 이웃과 높이 차가 한 단(MAX_STEP) 이하이거나 한쪽이 바다면 "이어진" 칸: 꼭짓점 높이를 평균 → 경사면
// - 그보다 차이가 크면 절벽: 꼭짓점을 따로 둠 → 그 사이에 벽을 세움(groundChunks)
// 그림(groundChunks)과 갈매미가 서는 높이(유닛 이동)가 같은 함수를 써서 발이 땅에 붙는다.
import { MAX_STEP } from "../config.js";

const EPS = 1e-6;
/** 두 칸이 경사로 이어지는가. */
export function joined(grid, a, b, ax, az, bx, bz) {
  if (!a || !b) return false;
  return Math.abs(a.elevation - b.elevation) <= MAX_STEP + EPS || grid.isWater(ax, az) || grid.isWater(bx, bz);
}

/** 칸 (x,z)의 꼭짓점 높이. cx, cz는 0(왼쪽·위) 또는 1(오른쪽·아래). 칸과 이어진 이웃들의 평균. */
export function cornerHeight(grid, x, z, cx, cz) {
  const me = grid.get(x, z); if (!me) return 0;
  let sum = 0, n = 0;
  for (let dz = cz - 1; dz <= cz; dz++) for (let dx = cx - 1; dx <= cx; dx++) {
    const nx = x + dx, nz = z + dz, c = grid.get(nx, nz);
    if (c && (c === me || joined(grid, me, c, x, z, nx, nz))) { sum += c.elevation; n++; }
  }
  return n ? sum / n : me.elevation;
}

/** 칸의 네 꼭짓점 높이 [왼위, 오위, 왼아래, 오아래]. */
export function corners(grid, x, z) {
  return [cornerHeight(grid, x, z, 0, 0), cornerHeight(grid, x, z, 1, 0), cornerHeight(grid, x, z, 0, 1), cornerHeight(grid, x, z, 1, 1)];
}

/** 칸 안 (u,v∈0~1) 위치의 높이(네 꼭짓점 쌍선형). */
export function bilinear(c, u, v) { return (c[0] * (1 - u) + c[1] * u) * (1 - v) + (c[2] * (1 - u) + c[3] * u) * v; }

/** 격자 좌표(칸 단위, 연속) 위치의 땅 높이. */
export function terrainHeight(grid, gx, gz) {
  const x = Math.floor(gx), z = Math.floor(gz);
  if (!grid.inBounds(x, z)) return -1.5;
  return bilinear(corners(grid, x, z), gx - x, gz - z);
}
