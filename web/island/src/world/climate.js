// 기온 · 체감 · 체온(순수 계산: 화면·난수를 모름). 설계: health_climate_design.md 1~2장.
//  · 공기(바깥) 기온 airTemp: 계절 기본 + 하루 변화(시각을 알면 오후 3시가 가장 따뜻, 모르면 낮 +2 · 밤 −3) + 날씨 + 쌓인 눈.
//  · 실내 기온 indoorTemp: 18 + 0.25 × (바깥 − 18) + 난방. 바깥이 −10~36°C여도 11~22.5°C → 집 안은 늘 쾌적 범위.
//  · 체감 feel: 공기(밖) 또는 실내 + 옷 보온 + 일하는 중 +2 + 종족 덤 + 축제 열기.
//  · 체온 bodyT: 쾌적 범위(10~26)면 목표 40.0, 벗어나면 1°C마다 0.15씩 내려가거나 오름. 목표로 시간 상수 60초(미니 40초)에 지수 접근.
//  계절을 모르면(시험·예전 받침) 늘 쾌적한 15°C로 봄 → 체온이 40에서 움직이지 않음(기존 규칙 그대로).

export const SEASON_BASE = { spring: 14, summer: 26, autumn: 15, winter: 1 };
export const NEUTRAL_AIR = 15;                          // 계절을 모를 때
export const DAY_AMP = { spring: 4, summer: 4, autumn: 4, winter: 3 };
export const DAY_WARM = 2, NIGHT_COLD = -3;             // 시각을 모를 때: 낮 +2 · 밤 −3 (world.isNight를 모르면 0)
export const WEATHER_TEMP = { clear: 0, cloudy: -1, rain: -3, storm: -5, snow: -2 };
export const SUMMER_SUN = 2;                            // 여름 맑은 날 땡볕(낮에만)
export const SNOW_COOL = -2;                            // 쌓인 눈 1.0당
export const INDOOR_BASE = 18, INDOOR_PASS = 0.25, HEAT_POWER = 3;
export const COMFORT_LO = 10, COMFORT_HI = 26;
export const BODY_NORMAL = 40, BODY_SLOPE = 0.15, BODY_TAU = 60, BODY_TAU_SMALL = 40;
export const COLD_AT = 39.0, FREEZE_AT = 38.3, HOT_AT = 41.0, WARM_DONE = 39.6;
export const WORK_HEAT = 2;                              // 일하는 중 체감 +2
export const FEST_HEAT = 6, FEST_HEAT_R = 6;            // 축제 광장 6칸 안 "축제 열기" +6
// 종족 덤(체감 °C): 불씨(불의 정령) +4 · 자이언트(큰 몸) +2 · 미니(작은 몸) −2. PERSONA에 넣지 않음(PERSONA의 숫자 칸은 활동 비중으로 읽힘)
export const WARM_BONUS = { "불씨": 4, "자이언트": 2, "미니": -2 };
export const COLD_EFF = 0.85, COLD_HUNGER = 1.1, HOT_EFF = 0.9;
export const COLD_SAT = -8, HOT_SAT = -5;
export const COCOA_PRICE = 2, COCOA_WARM = 0.6;          // 카페 코코아: 2🪙(금고로) → 체온 즉시 +0.6

const r1 = v => Math.round(v * 10) / 10;

/** 바깥 공기 기온(°C, 소수 한 자리). hour: 0~24 기기 시각(모르면 null) · isNight: 시각을 모를 때 낮/밤(모르면 null → 0) · bias: 섬별 치우침(나중에) */
export function airTemp(season, weather, snow = 0, hour = null, isNight = null, bias = 0) {
  if (!(season in SEASON_BASE)) return NEUTRAL_AIR + bias;
  let t = SEASON_BASE[season];
  if (Number.isFinite(hour)) t += DAY_AMP[season] * Math.cos(2 * Math.PI * (hour - 15) / 24);
  else if (isNight === true) t += NIGHT_COLD; else if (isNight === false) t += DAY_WARM;
  const day = Number.isFinite(hour) ? hour >= 7 && hour < 19 : isNight !== true;
  t += WEATHER_TEMP[weather] ?? 0;
  if (season === "summer" && weather === "clear" && day) t += SUMMER_SUN;
  t += SNOW_COOL * Math.max(0, Math.min(1, snow || 0));
  return r1(t + bias);
}
/** 실내 기온: 바깥을 4분의 1만 따라가고 18°C 쪽으로. heat: 난방(전기 들어온 집 +3) */
export const indoorTemp = (air, heat = 0) => r1(INDOOR_BASE + INDOOR_PASS * (air - INDOOR_BASE) + heat);
/** 체감(°C): base = 공기 또는 실내 기온, warmth = 옷 보온, working = 일하는 중, name = 갈매미 이름(종족 덤), extra = 축제 열기 등 */
export const feelTemp = (base, { warmth = 0, working = false, name = null, extra = 0 } = {}) => base + warmth + (working ? WORK_HEAT : 0) + (WARM_BONUS[name] || 0) + extra;
/** 체감 → 체온 목표 */
export function bodyTarget(feel) {
  if (feel < COMFORT_LO) return BODY_NORMAL - BODY_SLOPE * (COMFORT_LO - feel);
  if (feel > COMFORT_HI) return BODY_NORMAL + BODY_SLOPE * (feel - COMFORT_HI);
  return BODY_NORMAL;
}
export const bodyTau = name => name === "미니" ? BODY_TAU_SMALL : BODY_TAU;
/** 체온 한 걸음(지수 접근, dt가 커도 넘치지 않게) */
export const stepBody = (bodyT, target, dt, tau = BODY_TAU) => bodyT + (target - bodyT) * Math.min(1, dt / tau);
/** 체온 → 상태: "freeze"(꽁꽁) | "cold"(추움) | "hot"(더움) | null */
export const bodyState = t => t <= FREEZE_AT ? "freeze" : t <= COLD_AT ? "cold" : t >= HOT_AT ? "hot" : null;
export const isCold = t => (t ?? BODY_NORMAL) <= COLD_AT;
/** 목표 체온으로 갈 때 문턱(th)까지 걸리는 초(닿지 않으면 Infinity) */
export function secsTo(from, target, th, tau = BODY_TAU) {
  if ((from - th) * (target - th) > 0 || target === th) return from === th ? 0 : Infinity;
  return tau * Math.log((target - from) / (target - th));
}
