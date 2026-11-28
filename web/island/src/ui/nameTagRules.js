// 머리 위 이름표 규칙(순수: DOM·three를 모름). 갈매미 이름표(render/nameTags.js)가 쓰고, 나중에 손님 같은 다른 머리 위 표시도 같은 규칙을 씀.
// 보이기 갈래(기기 설정 galmaemiman-uiprefs의 tags): near 가까이 볼 때(기본) · always 항상 · off 끄기
// · 거리: 카메라에서 머리까지(m). 가까운 비스듬히 기본 거리(폰 30 m · 넓은 화면 26 m)에서는 다 보이고, 멀어지면 옅어지다 사라짐
// · 수: 화면이 어지럽지 않게 가까운 것부터 TAG_CAP개까지, 화면에서 서로 겹치면 가까운 쪽만(따라가는 갈매미는 늘 먼저)
// · 크기: 멀수록 작게(TAG_SCALE 범위 안)
export const TAG_MODES = ["near", "always", "off"];
export const TAG_MODE_DEFAULT = "near";
export const TAG_MODE_LABEL = { near: "가까이 볼 때", always: "항상", off: "끄기" };
/** [다 보이는 거리, 사라지는 거리](m) */
export const TAG_FADE = Object.freeze({ near: Object.freeze([42, 56]), always: Object.freeze([70, 92]) });
export const TAG_CAP = Object.freeze({ portrait: 8, landscape: 8, medium: 12, wide: 16 });
export const TAG_SCALE = Object.freeze([0.86, 1.08]);
export const TAG_BUILD_DIM = 0.5;                                              // 건설 모드: 지우지 않고 옅게(어느 갈매미가 어디 있는지는 보이게)
export const TAG_GAP = 3;                                                      // 겹침 판정 여유(px)

export const tagMode = v => TAG_MODES.includes(v) ? v : TAG_MODE_DEFAULT;
export const tagCap = form => TAG_CAP[form] ?? TAG_CAP.wide;
/** 거리(m) → 크기 배율 */
export const tagScale = d => Math.min(TAG_SCALE[1], Math.max(TAG_SCALE[0], 1.2 - (d || 0) / 110));
/** 거리·갈래 → 목표 투명도(0~1). focus: 따라가는 갈매미(끄기가 아니면 늘 보임) · build: 건설 모드 */
export function tagAlpha(d, mode, focus = false, build = false) {
  const m = tagMode(mode); if (m === "off") return 0;
  const [full, end] = TAG_FADE[m];
  const a = focus ? 1 : d <= full ? 1 : d >= end ? 0 : 1 - (d - full) / (end - full);
  return build ? a * TAG_BUILD_DIM : a;
}
/** 이름표 글: 이름(없으면 빈 글 → 안 띄움). 화면에는 textContent로만 넣음(이름은 바꿀 수 있어서 HTML로 넣지 않음) */
export const tagText = u => typeof u?.name === "string" ? u.name.trim().slice(0, 16) : "";

/** 누구를 띄울지 고름(자리를 새로 만들지 않음 — 부르는 쪽이 배열을 한 번 만들어 계속 씀).
 *  n개 후보: x·y = 이름표 아래 가운데(px), w·h = 크기(px, 배율 적용), d = 거리, focus = 1이면 따라가는 갈매미.
 *  order(길이 ≥ n)는 정렬에 쓰는 일감 배열. skip[i] = 1이면 이번엔 안 띄움(남의 말풍선 밑 — 수·겹침 자리도 차지하지 않음). 결과는 show[i] = 1/0. 띄운 수를 돌려줌 */
export function pickTags(n, x, y, w, h, d, focus, cap, order, show, skip = null) {
  for (let i = 0; i < n; i++) { order[i] = i; show[i] = 0; }
  for (let i = 1; i < n; i++) {                                                // 끼워 넣기 정렬(후보는 수십 개 이하): 따라가는 것 먼저, 그다음 가까운 순
    const k = order[i]; let j = i - 1;
    while (j >= 0 && before(k, order[j], d, focus)) { order[j + 1] = order[j]; j--; }
    order[j + 1] = k;
  }
  let shown = 0;
  for (let a = 0; a < n && shown < cap; a++) {
    const i = order[a]; let hit = false; if (skip && skip[i]) continue;
    if (!focus[i]) for (let b = 0; b < a; b++) {
      const j = order[b]; if (!show[j]) continue;
      if (Math.abs(x[i] - x[j]) * 2 < w[i] + w[j] + TAG_GAP * 2 && y[i] - h[i] < y[j] + TAG_GAP && y[j] - h[j] < y[i] + TAG_GAP) { hit = true; break; }
    }
    if (!hit) { show[i] = 1; shown++; }
  }
  return shown;
}
const before = (a, b, d, focus) => focus[a] !== focus[b] ? focus[a] > focus[b] : d[a] < d[b];

/** 다른 것(남의 말풍선)에 가리는가: 이름표(아래 가운데 x·y, 크기 w·h)가 nb개 가림 칸(bx0·by0·bx1·by1, 주인 bown) 가운데 주인이 own이 아닌 것과 겹치면 true.
 *  말풍선은 이름표보다 잠깐이라 말풍선이 이김(그동안 남의 이름표가 옅어짐) */
export function blockedBy(x, y, w, h, own, nb, bx0, by0, bx1, by1, bown) {
  for (let j = 0; j < nb; j++) if (bown[j] !== own && x + w / 2 > bx0[j] && x - w / 2 < bx1[j] && y > by0[j] && y - h < by1[j]) return true;
  return false;
}
