// 해 위치(순수 계산, three.js 없이 시험 가능). 태양 적위 + 균시차 + 경도 보정으로 높이·방위를 구함(오차 수 분 수준).
// 기기 위치는 모르므로 위도는 서울(북위 37.5°)로 가정. 경도는 기기 시간대에서 짐작: 한국 시간(UTC+9)이면 서울 동경 127°, 그 밖에는 시간대 중심(15°×시차).
const RAD = Math.PI / 180;
export const LAT = 37.5, LON = 127;
/** 날짜 → { elev(도), azim(도, 북=0 동=90 남=180) } */
export function sunPosition(date = new Date(), lat = LAT, lon = null) {
  const start = new Date(date.getFullYear(), 0, 0), N = Math.floor((date - start) / 864e5);
  const decl = 23.44 * Math.sin(2 * Math.PI * (284 + N) / 365);
  const B = 2 * Math.PI * (N - 81) / 364, eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);   // 균시차(분)
  const tzHours = -date.getTimezoneOffset() / 60;
  if (lon === null) lon = tzHours === 9 ? LON : 15 * tzHours;
  const clock = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const solar = clock + (4 * (lon - 15 * tzHours) + eot) / 60;                    // 태양시(시)
  const H = ((15 * (solar - 12)) % 360 + 540) % 360 - 180;                     // 시간각(-180~180°): 자정 지나 태양 자정(서울 약 0시 30분) 전까지 방위가 동서로 뒤집혀 달빛 방향이 툭 튀던 것
  const sinE = Math.sin(lat * RAD) * Math.sin(decl * RAD) + Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(H * RAD);
  const elev = Math.asin(sinE) / RAD;
  const cosA = (Math.sin(decl * RAD) - Math.sin(elev * RAD) * Math.sin(lat * RAD)) / (Math.cos(elev * RAD) * Math.cos(lat * RAD));
  let azim = Math.acos(Math.max(-1, Math.min(1, cosA))) / RAD; if (H > 0) azim = 360 - azim;
  return { elev, azim };
}
