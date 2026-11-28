// 변신 분포 몬테카를로(순수): 성향 8 × 직업 7 × 무작위 하루 활동 → 모습 분포. node tools/evosim.mjs [마리수] 로 숫자를 봄
import { seededRandom } from "../src/util.js";
import { DISPS, GROWTH_KEYS, JOB_GROWTH, growthAdd, pickForm, FORMS } from "../src/world/evolve.js";
const JOBS = ["builder", "carpenter", "lumberjack", "miner", "fisher", "farmer", "merchant"];
/** 성향이 한가할 때 고르는 활동이 올리는 카운터(대략) */
export const DISP_FREE = { sea: ["sea"], night: ["night"], craft: ["craft"], green: ["green"], shiny: ["shiny", "social"], big: ["big"], timid: ["timid"], easy: ["warm", "social", "alone"] };
/** 한 마리 키우기: days일 동안 직업 일·성향 활동·잡일·(가끔) 플레이어 손길 */
export function raise(u, rnd, days = 4, playerKey = undefined) {
  for (let d = 0; d < days; d++) {
    growthAdd(u, JOB_GROWTH[u.job], 4 + rnd() * 6, "job", d);                     // 직업 일(하루 내내 → ×0.4 · 상한 3)
    for (const k of DISP_FREE[u.disp]) growthAdd(u, k, 0.6 + rnd() * 2.4 / DISP_FREE[u.disp].length * 1.5, "free", d);   // 성향이 이끄는 한가한 활동
    for (let j = 0; j < 2; j++) growthAdd(u, GROWTH_KEYS[Math.floor(rnd() * GROWTH_KEYS.length)], rnd() * 1.6, "free", d);   // 잡일·우연
    const pk = playerKey === undefined ? (rnd() < 0.45 ? GROWTH_KEYS[Math.floor(rnd() * 7)] : null) : playerKey;   // 플레이어가 미는 쪽(반쯤)
    if (pk) growthAdd(u, pk, 1 + rnd() * 4, "player", d);
  }
  return u;
}
export function simulate(n = 1000, seed = 1, days = 4) {
  const r = seededRandom(seed), out = Object.fromEntries(FORMS.map(f => [f, 0]));
  for (let i = 0; i < n; i++) {
    const u = { unitId: `u${i + 10}`, disp: DISPS[i % 8], job: JOBS[Math.floor(i / 8) % 7], growth: {}, evo: null };
    raise(u, r, days); out[pickForm(u, seed).form]++;
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const n = +process.argv[2] || 1000, res = simulate(n, 1, +process.argv[3] || 4);
  for (const [f, c] of Object.entries(res)) console.log(f.padEnd(5), String(c).padStart(5), (c / n * 100).toFixed(1) + "%");
}
