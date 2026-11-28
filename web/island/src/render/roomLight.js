// 방 조명 판정(순수 계산, three.js·DOM 없이 시험 가능): 바깥 시간대(daylight.glow — 0 낮 ~ 1 밤, 섬 등불과 같은 곡선) × 그 집 전기(0 없음 ~ 1 있음, 바뀔 때 부드럽게)
//  · 낮: 창으로 들어오는 햇빛(전기와 무관) — 전에 늘 쓰던 값(하늘빛 1.1 + 햇빛 1.6) 그대로
//  · 저녁·밤 + 전기 있음: 실내등(따뜻한 빛, 거의 같은 밝기) + 스탠드 불빛 켜짐
//  · 저녁·밤 + 전기 없음: 창으로 드는 청회색 달빛만(섬 밤의 달빛 색 0xbcc0c8·0xc2c6ce, 세기는 섬 밤 0.35에 맞춤) — 스탠드도 꺼짐
// 색은 선형 RGB(three.js Color.setRGB에 그대로). out 객체를 다시 써서 매 프레임 새 객체를 안 만듦
import { POWER_RANGE } from "../world/power.js";

const rlLin = c => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
const rlRGB = h => [rlLin((h >> 16 & 255) / 255), rlLin((h >> 8 & 255) / 255), rlLin((h & 255) / 255)];
// 한 줄 = 조명 하나: 하늘빛(위)·땅빛(아래)·세기, 주 빛(그림자 내는 빛) 색·세기, 창 유리 색·발광 색·발광 세기, 배경, 스탠드(0~1)
const rlKey = (sky, ground, hemi, key, keyI, win, winE, winI, bg, lamp) => ({ sky: rlRGB(sky), ground: rlRGB(ground), hemi, key: rlRGB(key), keyI, win: rlRGB(win), winE: rlRGB(winE), winI, bg: rlRGB(bg), lamp });
export const ROOM_KEYS = {
  day:  rlKey(0xfff4e2, 0x8a7a6a, 1.1,  0xfff0d8, 1.6,  0xbfe4f5, 0x9fd4f0, 0.35, 0x30343c, 0),   // 전에 늘 켜 두던 값
  lamp: rlKey(0xffe4bf, 0x7c6650, 1.2,  0xffd9a8, 1.8,  0x1e2c55, 0x2c3c6e, 0.7,  0x1c2029, 1),   // 실내등: 따뜻한 색(약 2900K 느낌), 밝기는 낮의 약 0.9배(눈 무게 밝기 roomLux)
  moon: rlKey(0xbcc0c8, 0x3c3026, 0.42, 0xc2c6ce, 0.38, 0x2e3446, 0x525a6a, 1.0,  0x14171f, 0),   // 달빛: 섬 밤(dayKeys NIGHT 청회색 하늘빛·따뜻한 땅빛, 달빛 0xc2c6ce)과 같은 색·비슷한 세기, 창은 밤하늘 색으로 빛남
};
/** 방을 그릴 때의 노출(섬 한낮 노출 1.12와 같게 고정 — 섬 노출은 시간·날씨로 바뀌므로 방 밝기가 그것에 끌려가지 않게. 어둠은 위 빛 세기로만) */
export const ROOM_EXPOSURE = 1.12;
/** 전기 없을 때 저녁·밤 방 위 카드에 붙는 까닭 한 줄 */
export const ROOM_DARK_WHY = `⚡ 전기가 없어 불이 안 켜져요 — 풍차를 ${POWER_RANGE}칸 안에`;
/** 까닭 한 줄을 띄울 어둠 정도(glow). 해가 수평선 근처(약 0.4°)로 내려간 뒤부터 — 아직 밝은 늦은 오후에는 안 띄움 */
export const ROOM_DARK_AT = 0.1;
/** 시간대 이름(섬 시계 아이콘과 같은 기준: 해 높이 6° 위 낮 ☀️, −2° 위 저녁 🌇, 그 아래 밤 🌙) */
export function roomPhase(elev) { return elev > 6 ? "day" : elev > -2 ? "dusk" : "night"; }
const rlMix = (o, a, b, t) => { for (let i = 0; i < 3; i++) o[i] = a[i] + (b[i] - a[i]) * t; return o; };
const rlTmp = [0, 0, 0];
const rlClamp = x => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
/** glow: 0 낮 ~ 1 밤(daylight.glow), power: 0 전기 없음 ~ 1 있음 → 조명 세기·색. 밤 = 달빛과 실내등을 전기만큼 섞고, 낮과 밤을 glow만큼 섞음 */
export function roomLight(glow, power, out = { sky: [0, 0, 0], ground: [0, 0, 0], key: [0, 0, 0], win: [0, 0, 0], winE: [0, 0, 0], bg: [0, 0, 0] }) {
  const g = rlClamp(glow), p = rlClamp(power), D = ROOM_KEYS.day, M = ROOM_KEYS.moon, L = ROOM_KEYS.lamp, t = rlTmp;
  for (const k of ["sky", "ground", "key", "win", "winE", "bg"]) rlMix(out[k], D[k], rlMix(t, M[k], L[k], p), g);
  for (const k of ["hemi", "keyI", "winI", "lamp"]) out[k] = D[k] + (M[k] + (L[k] - M[k]) * p - D[k]) * g;
  out.dark = g >= ROOM_DARK_AT && p < 0.5;                                          // 까닭 한 줄: 저녁·밤에 전기가 없을 때만
  return out;
}
/** 밝기 어림(그림자 없는 면이 받는 빛 = 하늘빛 + 주 빛, 색은 사람 눈 무게 Rec.709) — 시험·보고용 */
export function roomLux(o) {
  const y = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return o.hemi * y(o.sky) + o.keyI * y(o.key);
}
