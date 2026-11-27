// 해 그림자 범위(순수 계산, three.js 없이 시험 가능): 보는 곳을 따라가는 그림자 지도의 반경과 중심.
//  · 반경: 카메라가 멀어지면 넓게(가까이 18 m ~ 멀리 36 m, 4 m 단위로만 바뀜 → 줌 중에 그림자 크기가 계속 흔들리지 않음).
//    전에는 늘 ±26 m라 멀리서 섬을 보면 화면 절반의 건물·나무에 그림자가 없었음
//  · 중심: 그림자 지도 한 칸(텍셀) 단위로 맞춤. 해 쪽에서 본 평면(그림자 카메라의 가로·세로 축)에 보는 곳을 투영해 텍셀 크기로 반올림 →
//    중심이 옮겨져도 그림자 가장자리 계단이 그대로라 반짝이지(떨리지) 않음. 전에는 월드 x·z를 2 m 단위로 반올림해서, 해가 비스듬하면 옮길 때마다 가장자리가 툭 바뀌었음
//  · 옮기기: 보는 곳이 step m 넘게 벗어날 때만(그림자 지도를 매 프레임 다시 그리지 않게 — 낮음 화질의 그림자 간격을 지킴)

/** 카메라 거리(m) → 그림자 반경(m) */
export function shadowRadius(dist, hi = 36, lo = 18, step = 4) {
  const r = Math.ceil(dist * 0.62 / step) * step;
  return Math.max(lo, Math.min(hi, r));
}
/** 해 방향 dir(단위, 해 쪽을 가리킴)에서 본 그림자 카메라의 가로(x)·세로(y) 축: three.js lookAt(위 = +y)과 같은 방식 */
export function lightAxes(d) {
  let xx = d[2], xz = -d[0], l = Math.hypot(xx, xz);                              // x = 위(0,1,0) × z(= dir)
  if (l < 1e-6) { xx = 1; xz = 0; l = 1; }                                        // 해가 바로 머리 위(그럴 일은 거의 없음)
  const x = [xx / l, 0, xz / l];
  const y = [d[1] * x[2], d[2] * x[0] - d[0] * x[2], -d[1] * x[0]];               // y = z × x
  return { x, y };
}
/** 점 p(월드)를 그림자 카메라 평면에서 텍셀(texel m) 단위로 맞춘 점. 해 방향(깊이)으로는 움직이지 않음 */
export function snapToTexels(p, d, texel) {
  const { x, y } = lightAxes(d), u = p[0] * x[0] + p[1] * x[1] + p[2] * x[2], v = p[0] * y[0] + p[1] * y[1] + p[2] * y[2];
  const du = Math.round(u / texel) * texel - u, dv = Math.round(v / texel) * texel - v;
  return [p[0] + du * x[0] + dv * y[0], p[1] + du * x[1] + dv * y[1], p[2] + du * x[2] + dv * y[2]];
}
/** 그림자 중심을 옮길지: 지난 중심(c, 평면 x·z)에서 보는 곳(t)이 step m 넘게 벗어났으면 true */
export const needsRecenter = (c, t, step) => !c || Math.hypot(t[0] - c[0], t[2] - c[2]) > step;
