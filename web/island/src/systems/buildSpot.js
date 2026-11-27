// 짓기 편의(편의성 점검 4번): three.js 없이 계산만 하는 작은 함수들 — node --test로 시험.
// - 처음 고스트: 🔨로 들어오면 화면 가운데에서 가장 가까운 빈 자리에 미리 놓음 → 땅을 안 눌러도 🔨 건설을 바로 누를 수 있음
// - 헛탭 줄이기: 못 짓는 자리(나무·건물 위)를 누르면 2칸 안의 가장 가까운 빈 자리로 살짝 옮김(없으면 빨간 고스트 + 까닭을 크게)
// - 확인 카드 자리: 고스트가 카드 밑에 숨으면 카드를 반대쪽(위)으로

/** 처음 고스트를 찾는 반지름(칸) · 헛탭을 옮겨 주는 반지름(칸) */
export const PREPLACE_R = 12, SNAP_R = 2;

/** (x, z)에서 가까운 차례로 칸 목록(가운데 포함, 원 안만). 거리가 같으면 위(z 작은 쪽) → 왼쪽 차례(늘 같은 순서) */
export function spiralCells(x, z, r) {
  const out = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const d2 = dx * dx + dz * dz; if (d2 <= r * r) out.push([d2, dz, dx]); }
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return out.map(([, dz, dx]) => ({ x: x + dx, z: z + dz }));
}

/** ok(x, z)가 참인 가장 가까운 칸(r칸 안). 없으면 null. 누른 칸이 되면 그 칸 그대로 */
export function nearestSpot(ok, x, z, r = PREPLACE_R) {
  for (const c of spiralCells(x, z, r)) if (ok(c.x, c.z)) return c;
  return null;
}

/** 확인 카드를 어디에 둘지: "bottom"(평소) · "top"(고스트가 아래 카드에 가려질 때).
 *  g = 고스트 화면 점 { x, y } · bottomRect = 카드가 아래 있을 때 자리 · topRect = 위로 옮겼을 때 자리 · margin = 고스트 둘레 여유(px)
 *  위로 옮겨도 가리면(화면이 아주 낮음) 아래 그대로 */
export function cardSide(g, bottomRect, topRect, margin = 36) {
  if (!g || !bottomRect) return "bottom";
  const hit = r => !!r && g.x > r.left - margin && g.x < r.right + margin && g.y > r.top - margin && g.y < r.bottom + margin;
  if (!hit(bottomRect)) return "bottom";
  return hit(topRect) ? "bottom" : "top";
}
