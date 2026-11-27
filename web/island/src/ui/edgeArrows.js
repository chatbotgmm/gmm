// 화면 밖 ✨ 반짝이 방향 표시(편의성 점검 11번): 계산만(DOM·three.js 없음) — node --test로 시험.
// 반짝이 자리를 화면 좌표(NDC)로 바꾼 값을 받아, 화면 안이면 null, 밖이면 가장자리(HUD를 피한 네모) 위의 점과 가리키는 각도를 돌려줌.

/** 화면 밖 표시를 몇 개까지(가까운 것부터) */
export const EDGE_MAX = 4;

/** ndc = { x, y }(-1~1이 화면 안) · behind = 카메라 뒤(투영하면 x·y가 뒤집혀 나옴) · W·H = 화면 크기(px) · box = 표시를 둘 네모 { l, t, r, b }(px).
 *  → null(화면 안) 또는 { x, y, deg }(deg: 오른쪽 0°, 아래 90° — CSS rotate와 같은 방향) */
export function edgeArrow(ndc, behind, W, H, box) {
  let nx = ndc.x, ny = ndc.y;
  if (!behind && Math.abs(nx) <= 1 && Math.abs(ny) <= 1) return null;
  if (behind) { nx = -nx; ny = -ny; if (Math.abs(nx) < 1e-6 && Math.abs(ny) < 1e-6) ny = -1; }   // 바로 뒤: 아래쪽(뒤로 돌아보라는 뜻)
  const cx = W / 2, cy = H / 2, dx = nx * W / 2, dy = -ny * H / 2;
  const sx = dx > 0 ? (box.r - cx) / dx : dx < 0 ? (box.l - cx) / dx : Infinity;
  const sy = dy > 0 ? (box.b - cy) / dy : dy < 0 ? (box.t - cy) / dy : Infinity;
  const s = Math.max(0, Math.min(sx, sy));
  return { x: cx + dx * s, y: cy + dy * s, deg: Math.atan2(dy, dx) * 180 / Math.PI };
}

/** 화살표끼리 이만큼(px) 안이면 겹친 것으로 봄(단추 40px) — 겹치면 가까운 반짝이 것만 남김(누르기 쉽게 · 주우면 다음 것이 나옴) */
export const EDGE_GAP = 44;

/** 여러 반짝이 가운데 화면 밖 것만, 화면 가운데(보는 점)에서 가까운 것부터 max개(서로 겹치는 화살표는 뺌). list: [{ id, dist, ndc, behind }] */
export function edgeList(list, W, H, box, max = EDGE_MAX, gap = EDGE_GAP) {
  const out = [];
  for (const o of list.map(s => ({ s, a: edgeArrow(s.ndc, s.behind, W, H, box) })).filter(o => o.a).sort((p, q) => p.s.dist - q.s.dist)) {
    if (out.length >= max) break;
    if (out.some(k => Math.hypot(k.x - o.a.x, k.y - o.a.y) < gap)) continue;
    out.push({ id: o.s.id, ...o.a });
  }
  return out;
}
