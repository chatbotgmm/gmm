// 지형 높이(순수 함수): 칸마다 높이(elevation)는 하나지만, 보이는 땅은 격자 꼭짓점 높이로 부드럽게 잇는다.
// 꼭짓점 높이 = 그 꼭짓점을 둘러싼 칸 중 이 칸과 경사로 이어진 칸(높이 차 한 단 이하, 물가)의 평균.
// 한 단보다 높이 차가 큰 이웃과는 평균을 내지 않음 → 올린 땅은 평평한 단이 되고, 그 사이는 그림에서 벽(절벽)으로 메움.
// 그림(groundChunks)과 갈매미가 서는 높이(유닛 이동)가 같은 함수를 써서 발이 땅에 붙는다.
import { MAX_STEP } from "../config.js";

const EPS = 1e-6;
const BUMP = 0.55;                 // 칸 가운데 볼록의 세기(1이면 칸 가운데가 정확히 칸 높이, 크면 비탈에 잔물결이 생김)
/** 두 칸이 경사로 이어지는가. */
export function joined(grid, a, b, ax, az, bx, bz) {
  if (!a || !b) return false;
  const d = Math.abs(a.elevation - b.elevation);
  if ((a.groundType === "Rock" || b.groundType === "Rock") && d <= ROCK_JOIN) return true;   // 바위산은 가팔라도 매끈한 비탈로 그림(걷기는 grid.canStep이 따로 막음)
  return d <= MAX_STEP + EPS || grid.isWater(ax, az) || grid.isWater(bx, bz);
}
const ROCK_JOIN = 1.6;

/** 칸 (x,z)의 꼭짓점 높이. cx, cz는 0(왼쪽·위) 또는 1(오른쪽·아래). 꼭짓점을 둘러싼 칸 중 이 칸과 이어진 칸들의 평균. */
export function cornerHeight(grid, x, z, cx, cz) {
  const home = grid.get(x, z); let sum = 0, n = 0;
  for (let dz = cz - 1; dz <= cz; dz++) for (let dx = cx - 1; dx <= cx; dx++) {
    const c = grid.get(x + dx, z + dz);
    if (c && (c === home || joined(grid, home, c, x, z, x + dx, z + dz))) { sum += c.elevation; n++; }
  }
  return n ? sum / n : home ? home.elevation : 0;
}

/** 칸의 네 꼭짓점 높이 [왼위, 오위, 왼아래, 오아래]. */
export function corners(grid, x, z) {
  return [cornerHeight(grid, x, z, 0, 0), cornerHeight(grid, x, z, 1, 0), cornerHeight(grid, x, z, 0, 1), cornerHeight(grid, x, z, 1, 1)];
}

/** 칸 안 (u,v∈0~1) 위치의 높이(네 꼭짓점 쌍선형). */
export function bilinear(c, u, v) { return (c[0] * (1 - u) + c[1] * u) * (1 - v) + (c[2] * (1 - u) + c[3] * u) * v; }
/** 칸 안 높이: 꼭짓점 쌍선형 + 가운데 볼록(칸 높이 − 꼭짓점 평균, 가장자리에서 0) → 틈 없이 이어지면서 칸 가운데는 그 칸 높이. */
export function heightIn(c, e, u, v) {
  return bilinear(c, u, v) + BUMP * (e - (c[0] + c[1] + c[2] + c[3]) / 4) * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
}

/** 격자 좌표(칸 단위, 연속) 위치의 땅 높이. */
export function terrainHeight(grid, gx, gz) {
  const x = Math.floor(gx), z = Math.floor(gz);
  if (!grid.inBounds(x, z)) return -1.5;
  return heightIn(corners(grid, x, z), grid.get(x, z).elevation, gx - x, gz - z);
}
