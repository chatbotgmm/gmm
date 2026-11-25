// 계절과 날씨(순수 계산). 계절은 기기 날짜로 정함(기상청 관례: 봄 3~5월, 여름 6~8월, 가을 9~11월, 겨울 12~2월).
// 날씨는 게임 안에서 계절별 확률로 몇 분마다 바뀜. 계절·날씨는 밭 자라는 속도, 낚시, 배고파지는 속도에 영향을 줌.
export const SEASONS = {
  spring: { name: "봄", icon: "🌸", grow: 1.25, hunger: 1, harvest: 0, foodPrice: 0, weights: { clear: 5, cloudy: 3, rain: 3, storm: 0.5, snow: 0 } },
  summer: { name: "여름", icon: "🌻", grow: 1.1, hunger: 1, harvest: 0, foodPrice: 0, weights: { clear: 5, cloudy: 2, rain: 3, storm: 1.5, snow: 0 } },
  autumn: { name: "가을", icon: "🍂", grow: 1, hunger: 1, harvest: 1, foodPrice: 0, weights: { clear: 6, cloudy: 3, rain: 2, storm: 1, snow: 0 } },
  winter: { name: "겨울", icon: "❄️", grow: 0.5, hunger: 1.25, harvest: 0, foodPrice: 1, weights: { clear: 4, cloudy: 4, rain: 0, storm: 1, snow: 3 } },
};
export const SEASON_ORDER = ["spring", "summer", "autumn", "winter"];
// grow: 밭 자라는 속도 배수 · fish: 낚시 성공 확률 배수(0이면 낚시 못 함) · hunger: 배고파지는 속도 배수 · light: 햇빛 밝기 배수
export const WEATHER = {
  clear: { name: "맑음", icon: "☀️", grow: 1, fish: 1, hunger: 1, light: 1 },
  cloudy: { name: "흐림", icon: "☁️", grow: 1, fish: 1, hunger: 1, light: 0.8 },
  rain: { name: "비", icon: "🌧", grow: 1.5, fish: 1.2, hunger: 1, light: 0.65 },
  storm: { name: "폭풍", icon: "⛈", grow: 1, fish: 0, hunger: 1.15, light: 0.45 },
  snow: { name: "눈", icon: "🌨", grow: 0.7, fish: 0.9, hunger: 1.1, light: 0.85 },
};
const NEUTRAL = { name: "", icon: "", grow: 1, hunger: 1, harvest: 0, foodPrice: 0, weights: SEASONS.autumn.weights };

export function seasonOf(date) {
  const m = date.getMonth() + 1;
  return m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter";
}
/** 다음 날씨: 계절별 가중치로 뽑음. 폭풍은 두 번 연달아 오지 않음. */
export function pickWeather(season, rnd, prev = null) {
  const w = { ...(SEASONS[season] || NEUTRAL).weights }; if (prev === "storm") w.storm = 0;
  const tot = Object.values(w).reduce((a, b) => a + b, 0); let r = rnd() * tot;
  for (const [k, v] of Object.entries(w)) { if ((r -= v) < 0) return k; }
  return "clear";
}
/** 날씨가 이어지는 시간(초): 폭풍은 짧게 */
export const weatherDuration = (kind, rnd) => kind === "storm" ? 50 + rnd() * 50 : 120 + rnd() * 160;
/** 계절 × 날씨를 합친 효과 */
export function effects(season, weather) {
  const s = SEASONS[season] || NEUTRAL, w = WEATHER[weather] || WEATHER.clear;
  return { grow: s.grow * w.grow, hunger: s.hunger * w.hunger, fish: w.fish, harvest: s.harvest, foodPrice: s.foodPrice, light: w.light, item: 1 };   // item: 물건을 찾을 확률 배수(드문 하늘이 바꿈, World.fx)
}
