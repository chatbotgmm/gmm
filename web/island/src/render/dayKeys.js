// 하루 빛 키프레임(순수 계산, three.js 없이 시험 가능). 해 높이(도)를 열쇠로 써서 계절마다 해 뜨고 지는 시각에 저절로 맞음.
// 새벽(푸른빛 → 분홍·주황) · 아침(따뜻한 금빛) · 점심(밝고 중립) · 저녁(노을 주황·보라) · 밤(푸른 어둠).
// 아침 표와 저녁 표를 따로 두고 해 방위(동쪽 = 아침, 서쪽 = 저녁)로 부드럽게 섞음. 키 사이는 단조 3차 보간(꺾임·넘침 없음).
// 색은 선형 RGB(three.js 작업 색공간)로 보간: Color.setRGB(r, g, b)에 그대로 넣음.

const ELEV = [-12, -6, -2, 2, 8, 16, 25];                                          // 이 밖은 끝 값 그대로(밤 -12° 아래, 낮 25° 위)
// 한 줄 = 해 높이 하나: [하늘 위, 수평선, 햇빛 색, 하늘빛(위), 땅빛(아래), 햇빛 세기, 하늘빛 세기, 바다 밝기, 노출]
// 햇빛 쉐이딩: 해가 높을수록 하늘빛(채움)을 줄이고 조금 더 푸르게(점심 0.85 → 0.62, 노출 1.12 → 1.0) — 그늘이 서늘하게 가라앉아 햇빛 받은 면이 살아남.
// 아침·저녁(2°·8°)의 햇빛은 툰 정면 단계(92%)만큼 올려 노을빛 세기를 전과 같게
const MORNING = [
  [0x0a1430, 0x1e2c55, 0x9fb6ff, 0x3a4f8a, 0x1b2233, 0.35, 0.35, 0.45, 0.95],     // 밤(전과 같음)
  [0x1a2b5e, 0x50639e, 0xa9b4e8, 0x56619f, 0x272b3a, 0.40, 0.40, 0.55, 0.97],     // 동틀 녘 푸른빛
  [0x34508e, 0xe0a3a6, 0xff9f86, 0x968fc2, 0x4a4038, 0.60, 0.50, 0.70, 1.00],     // 분홍
  [0x5683c6, 0xffbb86, 0xffa865, 0xbab3d6, 0x5f5640, 1.40, 0.60, 0.80, 1.04],     // 주황(해 뜸)
  [0x6aa6dc, 0xffd8a4, 0xffc888, 0xd6d9ea, 0x76714e, 2.65, 0.72, 0.90, 1.09],     // 아침 금빛
  [0x78bae6, 0xeeeedc, 0xffdab0, 0xd2e4f8, 0x858a59, 2.85, 0.66, 0.97, 1.04],
  [0x7fc4ec, 0xe4f3f6, 0xffe2b8, 0xd2e6ff, 0x8a8f5a, 3.00, 0.62, 1.00, 1.00],     // 점심
];
const EVENING = [
  [0x0a1430, 0x1e2c55, 0x9fb6ff, 0x3a4f8a, 0x1b2233, 0.35, 0.35, 0.45, 0.95],     // 밤
  [0x1e2460, 0x4c4888, 0xb0a0d8, 0x5a5598, 0x2a2838, 0.40, 0.40, 0.55, 0.97],     // 보랏빛 땅거미
  [0x3d3e88, 0xc97b8c, 0xff7c58, 0x9a80b8, 0x4a3c3a, 0.60, 0.50, 0.70, 1.00],     // 보라·자주 노을
  [0x5670b6, 0xff9a66, 0xff8c4c, 0xc0a8c8, 0x60523e, 1.40, 0.60, 0.80, 1.04],     // 주황 노을(해 짐)
  [0x6a9cd6, 0xffc690, 0xffb26e, 0xe0d0d8, 0x77704c, 2.65, 0.72, 0.90, 1.09],     // 늦은 오후 금빛
  [0x78b6e4, 0xf2e8d2, 0xffd6a2, 0xd2e2f6, 0x858a59, 2.85, 0.66, 0.97, 1.04],
  [0x7fc4ec, 0xe4f3f6, 0xffe2b8, 0xd2e6ff, 0x8a8f5a, 3.00, 0.62, 1.00, 1.00],     // 점심
];
export const DAY_CHANNELS = 19;                                                    // 색 5개 × 3 + 수 4개
const toLin = c => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));   // three.js SRGBToLinear와 같음
function flatten(rows) {                                                           // 열(채널)마다 키 값 배열
  const ch = Array.from({ length: DAY_CHANNELS }, () => []);
  for (const r of rows) {
    for (let c = 0; c < 5; c++) { const h = r[c]; ch[c * 3].push(toLin((h >> 16 & 255) / 255)); ch[c * 3 + 1].push(toLin((h >> 8 & 255) / 255)); ch[c * 3 + 2].push(toLin((h & 255) / 255)); }
    for (let c = 0; c < 4; c++) ch[15 + c].push(r[5 + c]);
  }
  return ch.map(ys => ({ ys, ms: slopes(ys) }));
}
function slopes(ys) {                                                              // Fritsch–Carlson 단조 3차 기울기: 키 사이에서 값이 넘치거나 되돌아가지 않음
  const n = ys.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (ELEV[i + 1] - ELEV[i]));
  m[0] = 0; m[n - 1] = 0;                                                          // 끝(밤·낮)은 평평하게 들어감: 끝 값으로 이어질 때 꺾이지 않게
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const w1 = 2 * (ELEV[i + 1] - ELEV[i]) + (ELEV[i] - ELEV[i - 1]), w2 = (ELEV[i + 1] - ELEV[i]) + 2 * (ELEV[i] - ELEV[i - 1]);
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return m;
}
const AM = flatten(MORNING), PM = flatten(EVENING);
function hermite(t, e, i) {
  const x0 = ELEV[i], h = ELEV[i + 1] - x0, s = (e - x0) / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * t.ys[i] + (s3 - 2 * s2 + s) * h * t.ms[i] + (-2 * s3 + 3 * s2) * t.ys[i + 1] + (s3 - s2) * h * t.ms[i + 1];
}
/** 해 높이 elev(도)·방위 azim(도, 북 0·동 90·남 180·서 270) → out[19](선형 RGB 색 5개 + 햇빛 세기·하늘빛 세기·바다 밝기·노출). out을 다시 써서 새 배열을 안 만듦 */
export function dayLook(elev, azim, out = new Float32Array(DAY_CHANNELS)) {
  const e = Math.max(ELEV[0], Math.min(ELEV[ELEV.length - 1] - 1e-9, elev));
  let i = 0; while (ELEV[i + 1] < e) i++;
  const am = 0.5 + 0.5 * Math.sin(azim * Math.PI / 180);                          // 1 동쪽(아침) ~ 0 서쪽(저녁). 정남·정북에선 두 표가 같은 값이라 이음매 없음
  for (let c = 0; c < DAY_CHANNELS; c++) { const a = hermite(AM[c], e, i), p = hermite(PM[c], e, i); out[c] = p + (a - p) * am; }
  return out;
}
export const smooth01 = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
/** 해 → 달 바꿈 정도(0 해 ~ 1 달): 해 높이 2° → -6° 동안(밤 판정 night와 같은 구간). 빛 방향·색이 툭 뒤집히지 않고 머리 위로 천천히 넘어감 */
export const moonMix = elev => smooth01((2 - elev) / 8);
/** 밤 판정 값(world.isNight 등에 쓰는 선형 night, 0~1)을 보이는 것(등불·그늘)에 쓸 부드러운 곡선으로: 켜지기·꺼지기가 천천히 시작해서 천천히 끝남 */
export const nightLook = night => smooth01(night);
/** 빛(그림자) 방향에 쓰는 해 높이(도): 30°까지는 그대로, 그 위는 0.4배로 눌러 씀(가을 정오 52° → 39°, 한여름 76° → 48°).
 *  해가 머리 위에 가까우면 위를 향한 면이 다 같은 밝기라 언덕·벽·지붕의 명암이 사라지고 그림자가 발밑에 숨음. 하늘색·세기 계산(dayLook)은 실제 높이 그대로 */
export const lightElev = elev => elev <= 30 ? elev : 30 + (elev - 30) * 0.4;
/** 툰 그늘색(선형 RGB): 하늘빛(dayLook의 9~11번) 색조를 1.6배 진하게 해서 휘도 1로 맞춘 뒤 SHADE배. 달빛(mk)으로 갈수록 덜 진하게.
 *  햇빛 휘도에 곱해 쓰임(toon.js): 햇빛은 따뜻하고 그늘은 하늘처럼 서늘함. out: setRGB가 있는 색이나 [r, g, b] */
export const SHADE = 0.2;
export function shadeTint(k, mk = 0, out = [0, 0, 0]) {
  const r = k[9], g = k[10], b = k[11], lum = Math.max(1e-4, 0.2126 * r + 0.7152 * g + 0.0722 * b), sat = 1.6 - 0.6 * mk;
  const f = c => Math.max(0, SHADE * (1 + (c / lum - 1) * sat));
  if (out.setRGB) out.setRGB(f(r), f(g), f(b)); else { out[0] = f(r); out[1] = f(g); out[2] = f(b); }
  return out;
}
