// 돌리기 단추의 그림과 나침반 셈(순수: DOM·three를 모름 → node 시험 가능). hud.js · render/room.js가 씀.
//  · 화면 돌리기(카메라): 땅 마름모 위로 도는 화살표 + 가운데 나침반 — 흰 알약 하나에 왼쪽·오른쪽 반쪽(#turnBox 둘러보기 · #ebar 건설 모드)
//  · 건물 돌리기(물체): 작은 집 둘레를 시계 방향으로 도는 고리, 주황 — 확인 카드 #cfRot · 방 가구
//  두 그림은 모양(땅 + 호 / 집 + 둘레 고리)과 색(먹색 / 주황)이 달라 서로 헷갈리지 않게.
const ROT_DEG = 180 / Math.PI;
const rotSvg = (cls, body) => `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** 화면 돌리기 ⟲(dir −1) · ⟳(+1): 땅(마름모) 위를 넘어가는 호 + 화살촉. 오른쪽은 왼쪽을 거울로 */
export function camTurnSvg(dir) {
  const body = `<path class="ground" d="M12 13.6 19.4 17.2 12 20.8 4.6 17.2Z" fill="currentColor" fill-opacity=".16" stroke-width="1.7"/>`
    + `<g class="arc"><path d="M19.6 12.4C18.9 7.6 15.8 4.6 12 4.6S5.1 7.6 4.4 12.4"/><path d="M1.9 9.6 4.4 12.6 7.2 10.2"/></g>`;
  return rotSvg(`rotIco cam${dir > 0 ? " flip" : ""}`, dir > 0 ? `<g transform="matrix(-1 0 0 1 24 0)">${body}</g>` : body);
}
/** 나침반: 빨간 끝이 북쪽(미니맵의 위). 바늘 묶음(.needle)을 CSS 변수 --hd로 돌림 */
export function compassSvg() {
  return `<svg class="compass" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">`
    + `<circle cx="12" cy="12" r="10.2" fill="#fffdf8" stroke="currentColor" stroke-opacity=".28" stroke-width="1.4"/>`
    + `<g class="needle"><path d="M12 3.6 15 12H9Z" fill="#c0392b"/><path d="M9 12H15L12 20.4Z" fill="currentColor" fill-opacity=".38"/><circle cx="12" cy="12" r="1.5" fill="#fffdf8" stroke="currentColor" stroke-opacity=".5" stroke-width=".9"/></g></svg>`;
}
/** 건물(물체) 돌리기: 가운데 작은 집 + 둘레를 시계 방향으로 도는 고리(.ring — 돌릴 때마다 CSS가 한 번 휙 돌림) */
export function objTurnSvg() {
  return rotSvg("rotIco obj", `<g class="ring"><path d="M17.4 6.6A7.9 7.9 0 1 1 12 4.6"/><path d="M9.6 2 12.4 4.6 9.6 7.2"/></g>`
    + `<path d="M8.6 10.6 12 8l3.4 2.6v5.4H8.6Z" fill="currentColor" fill-opacity=".22" stroke-width="1.5"/><path d="M11 16v-2.4h2V16" stroke-width="1.3"/>`);
}

/** 카메라 방위(라디안, viewCam의 yaw: 0 = +z 쪽에서 −z를 봄) → 북쪽(−z, 미니맵 위)이 화면에서 위에서 시계 방향으로 몇 도인지 */
export const northDeg = yaw => ((yaw * ROT_DEG) % 360 + 360) % 360;
/** 나침반 읽어 주기(aria-label): 가장 가까운 여덟 방위 */
export function northLabel(yaw) {
  const k = Math.round(northDeg(yaw) / 45) % 8;
  return `북쪽: ${["위", "오른쪽 위", "오른쪽", "오른쪽 아래", "아래", "왼쪽 아래", "왼쪽", "왼쪽 위"][k]}`;
}
/** 건물 돌리기 단추를 한 번 휙 돌릴지: 확인 카드가 이미 떠 있는 채로 방향(rot)만 바뀌었을 때(새로 자리를 정한 때는 아님) */
export const rotChanged = (live, seen, rot) => !!live && seen != null && seen !== rot;
