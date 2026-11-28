// 중앙은행(MON-5, 순수 계산·숫자). 플레이어가 돈 발행·금리를 조율해 마을 물가를 다루는 규칙. 월드 연결은 World.js(stepBank·sellProcessed·print 등).
//  · 새 돈은 오직 한 길: 플레이어가 누르는 🖨 찍어내기(PRINT_STEPS 50·100·200, 하루 합 PRINT_DAY_MAX까지) → 금고로. 저절로 생기는 새 돈은 0.
//    (MON-4까지는 은행이 상인 가공품을 새 돈으로 사 주고(새 돈의 97.8%), 예금 이자·축하금·창업 자금·저장고 매입·소지품 판매도 새로 찍었음 → 마을 돈은 넘치고 금고는 말랐음)
//  · 은행이 갈매미에게 주는 돈은 모두 금고에서: 가공품 매입(오늘 예산 = 단계 × 마릿수, 금고는 BUY_KEEP × P를 남기고) · 예금 이자(금고 여윳돈만큼, 모자라면 줄임) · 축하금·창업 자금·저장고·소지품.
//  · 저녁 장보기(회수 길): 갈매미 여윳돈의 25% 중 60%는 상인에게(마을 안에서 돎), 40%는 은행 가게 → 금고(예전엔 없어졌음).
//  · 찍은 만큼 돈이 늘어 금고 → 설계비(지을 갈매미에게)·품삯·매입 → 주머니로 돌고, 주머니 돈이 늘면 물가 P가 오름(대가).
//  · 없어지는 돈도 없음(섬 꾸미기 값만 플레이어가 골라 쓰는 몫): 찍지 않으면 돈의 합(금고 + 주머니 + 예금)이 그대로라 마을이 멈추지 않고 천천히 돎.
//  · 물가 P는 '주머니 돈 ÷ 만든 물건'을 천천히 따라감(하루 +3% / −2%, P_MIN ~ 3).
//  · 자동 모드: 물가를 보고 매입 예산 단계를 하루 한 칸씩(찍어내기는 자동으로 하지 않음). 새 섬은 자동으로 시작. 옛 저장은 돈 그대로(안 깎음) + 4일 적응(π = 0) + 자동.
// 설계: scratchpad monetary_design2.md §4(MON-4) + '## 확인' 절 + 사용자 요청 "그냥 찍어내지 말고, 찍어내는 버튼을 따로"(MON-5, 값은 60일 시뮬로 고름).

/** 🧺 하루 가공품 매입 예산 단계(마리당 동전, 금고에서 냄): 멈춤 · 아주 적게 · 적게 · 조금 · 보통 · 많이 */
export const STEPS = [0, 15, 30, 45, 60, 90];
export const STEP_NAME = ["멈춤", "아주 적게", "적게", "조금", "보통", "많이"];
export const STEP_DEFAULT = 60;
/** 🏦 금리(%/마을 하루) 0~5, 기본 1 */
export const RATE_MAX = 5, RATE_DEFAULT = 1;
/** 🖨 찍어내기: 한 번에 찍는 양(동전) · 마을 하루 합 상한 */
export const PRINT_STEPS = [50, 100, 200], PRINT_DAY_MAX = 300;
export const BUY_KEEP = 60;         // 가공품·저장고·소지품 매입·예금 이자·축하금·창업 자금을 내고도 금고에 남기는 돈(× P): 품삯·설계비 몫.
                                    // 60일 시뮬(찍지 않음, 씨앗 3·5·7): 60 → 다 지은 건물 60·금고<1 날 0~1 / 20 → 25·0~1 / 0 → 22·52~55(밀린 품삯 날 4~8). 남기지 않으면 매입이 금고를 비워 공사가 멈춤
export const SHOP = 0.25;           // 저녁 장보기: 여윳돈의 몫
export const SHOP_MERCHANT = 0.6;   // 그중 상인에게 가는 몫(나머지 40%는 은행 가게 → 금고)
export const KEEP = 20;             // 남겨 두는 돈(× P, 세금 TAX_KEEP과 같은 값)
export const MERCHANT_KEEP = 100;   // 상인 밑천(× P): 맡기거나 장보는 데 쓰지 않음
export const ICAP = 60;             // 이자가 붙는 예금 상한(한 마리, × P). 설계 150 → 60: 금리 5% 고정 판의 긴 오름(확인-2)을 60일 시뮬로 견줘 고름(5%에서 9마리 하루 최대 27 × P, 이제 금고에서 냄)
export const WARE_KEEP = 30;        // 은행 가게가 창고 가공품을 쓸 때 공사용으로 남기는 개수
export const STICK = 0.5;           // 예금: 하루에 목표와의 차이 중 이만큼만 옮김
export const RREF = 4, LAM = 0.35, WY = 0.5, YPG = 70;   // 물가 식 계수(§4-5)
export const PI_UP = 0.03, PI_DN = -0.02;                // 하루 물가 변화 한계
export const P_MIN = 0.7, P_MAX = 3;                     // 물가 바닥·천장. 바닥 0.5 → 0.7: 디플레가 금고에 공짜 이득이 되지 않게(확인-3)
export const ADAPT_DAYS = 4;        // 새 섬·옛 저장: 처음 이만큼 마을 날은 물가가 안 움직임
export const GIFT_PER = 10;         // 🎁 축하 나눠주기 한 마리 몫(× P, 금고에서)
export const AUTO_USED = 0.8;       // 자동: 어제 매입이 한도의 이만큼 이상일 때만 단계를 올림(와인드업 방지, 확인-6)
export const HIST_DAYS = 7;
/** 만든 물건 실물 값(물가 안 곱함): 갈매미가 얻은 나무·돌·철·물고기·음식 */
export const MADE_VAL = { wood: 2, stone: 3, iron: 6, fish: 2, food: 3 };
/** 만족도 덧줄(roads.js)·마을 점수(rank.js) */
export const SAT_SHOP = 3, SAT_INTEREST = 2, SAT_PRICEUP = -5, SAT_JOBLESS = -5, PRICEUP_AT = 0.02, JOBLESS_SECS = 150;
export const STABLE_PI = 0.01, STABLE_DAYS = 3, STABLE_SCORE = 10;

/** 새 중앙은행 기록. old = 옛 저장(적응 4일 + 자동) */
export const newMon = (old = false) => ({
  P: 1, pi: 0, Pstar: 1,               // 물가 · 오늘 변화 · 목표 물가
  step: STEP_DEFAULT, rate: RATE_DEFAULT, auto: true,
  left: null,                          // 오늘 남은 매입 한도(null = 아직 안 채움 → 처음 쓸 때 채움)
  cap: 0, used: 0,                     // 오늘 한도 · 오늘 매입한 돈
  made: 0, Yd: [],                     // 오늘 만든 물건 · 최근 3일
  adapt: ADAPT_DAYS, days: 0,          // 남은 적응 날 · 지난 마을 날 수
  giftDay: 0, printDay: 0, printed: 0,   // 🎁 나눠 준 날 · 🖨 마지막으로 찍은 날 · 그날 찍은 합
  jlShare: 0, stableRun: 0, downRun: 0,
  flags: { infl: 0, defl: 0, stable: 0, cap: 0 },
  hist: [],                            // 최근 7일 [{ d, P, pi, step, rate, A, saved }]
  started: old ? 0 : 1,                // 0 = 옛 저장에 처음 생김(소식 한 번)
});
const monNum = (v, d = 0) => Number.isFinite(+v) && v !== null && v !== "" ? +v : d;
const monClamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** 저장에서 읽은 중앙은행. 없으면(옛 저장) 새 기록 + 적응 4일 + 자동 */
export function monFromSave(j) {
  if (!j || typeof j !== "object") return newMon(true);
  const m = newMon();
  m.P = monClamp(monNum(j.P, 1), P_MIN, P_MAX); m.pi = monClamp(monNum(j.pi), PI_DN, PI_UP); m.Pstar = Math.max(0, monNum(j.Pstar, 1));
  m.step = STEPS.includes(+j.step) ? +j.step : STEP_DEFAULT; m.rate = monClamp(Math.round(monNum(j.rate, RATE_DEFAULT)), 0, RATE_MAX); m.auto = j.auto !== false;
  m.left = j.left == null ? null : Math.max(0, monNum(j.left)); m.cap = Math.max(0, monNum(j.cap)); m.used = Math.max(0, monNum(j.used)); m.made = Math.max(0, monNum(j.made));
  m.Yd = (Array.isArray(j.Yd) ? j.Yd : []).map(x => Math.max(0, monNum(x))).slice(-3);
  m.adapt = monClamp(Math.floor(monNum(j.adapt)), 0, ADAPT_DAYS); m.days = Math.max(0, Math.floor(monNum(j.days)));
  m.giftDay = Math.max(0, Math.floor(monNum(j.giftDay))); m.printDay = Math.max(0, Math.floor(monNum(j.printDay))); m.printed = Math.max(0, monNum(j.printed)); m.jlShare = monClamp(monNum(j.jlShare), 0, 1);
  m.stableRun = Math.max(0, Math.floor(monNum(j.stableRun))); m.downRun = Math.max(0, Math.floor(monNum(j.downRun)));
  for (const k of Object.keys(m.flags)) m.flags[k] = j.flags?.[k] ? 1 : 0;
  m.hist = (Array.isArray(j.hist) ? j.hist : []).filter(e => e && e.d >= 1).slice(-HIST_DAYS).map(e => ({ d: e.d | 0, P: monNum(e.P, 1), pi: monNum(e.pi), step: monNum(e.step, STEP_DEFAULT), rate: monNum(e.rate, RATE_DEFAULT), A: monNum(e.A), saved: monNum(e.saved) }));
  m.started = 1; return m;
}

/** 오늘 매입 한도(동전) = 단계 × 마릿수 */
export const capOf = (step, n) => Math.max(0, step) * Math.max(1, n);
/** 금리 r(소수) → 예금 목표 비율: 0% 10% · 1% 20% · 3% 40% · 5% 60% */
export const saveShare = r => Math.min(0.6, 0.1 + 10 * r);
/** 금리 r → 집 계약금 비율(기본 40% + 4r, 최대 60%) */
export const downShare = (r, base = 0.4) => Math.min(0.6, base + 4 * r);
/** 하루 예금 이자(금고에서 냄, payableOf로 줄일 수 있음): 한 마리 ICAP × P까지만 */
export const interestOf = (saved, r, P = 1, icap = ICAP) => Math.floor(Math.min(Math.max(0, saved || 0), icap * P) * r);
/** 금고가 갈매미에게 내줄 수 있는 돈(가공품 매입·이자): 금고 − BUY_KEEP × P, want를 넘지 않음 */
export const payableOf = (want, vault, P = 1) => Math.max(0, Math.min(Math.max(0, want || 0), Math.floor((vault || 0) - BUY_KEEP * P)));
/** 오늘 더 찍을 수 있는 양(그날 찍은 합 printed) */
export const printLeftOf = printed => Math.max(0, PRINT_DAY_MAX - Math.max(0, printed || 0));
/** 이만큼 찍어도 되나 */
export const canPrint = (n, printed) => PRINT_STEPS.includes(n) && n <= printLeftOf(printed);
/** 남겨 둘 돈(장보기·예금에 안 씀) */
export const keepOf = (P, merchant = false) => (KEEP + (merchant ? MERCHANT_KEEP : 0)) * P;
/** 오늘 예금을 얼마나 옮길지(+ 맡김, − 꺼냄): 목표 = 여윳돈 × saveShare(r), 하루에 차이의 STICK만. 맡기는 건 주머니에 있는 만큼만 */
export function saveMove(coins, saved, r, P = 1, merchant = false) {
  coins = Math.max(0, coins || 0); saved = Math.max(0, saved || 0);
  const target = Math.floor(Math.max(0, coins + saved - keepOf(P, merchant)) * saveShare(r)), next = Math.round(saved + (target - saved) * STICK);
  return Math.max(-saved, Math.min(next - saved, coins));
}
/** 저녁 장보기 돈 { x 쓰는 돈, toM 상인에게, rest 은행 가게 → 금고 } (hasMerchant: 상인이 있고 자기가 상인이 아님) */
export function shopOf(coins, P = 1, merchant = false, hasMerchant = true) {
  const x = Math.floor(Math.max(0, (coins || 0) - keepOf(P, merchant)) * SHOP), toM = hasMerchant ? Math.floor(x * SHOP_MERCHANT) : 0;
  return { x, toM, rest: x - toM };
}
/** 만든 물건(최근 3일 평균)을 갈매미 수 기준과 반씩 섞은 값: √(Ȳ × 70 × 마릿수) */
export const yEff = (Ybar, n) => Math.pow(Math.max(1, Ybar), WY) * Math.pow(Math.max(1, n) * YPG, 1 - WY);
/** 목표 물가 P* = 주머니 돈 ÷ (RREF × Yeff) */
export const targetP = (A, Yeff) => Math.max(0, A) / (RREF * Math.max(1, Yeff));
/** 물가 변화 π = monClamp(LAM × ln(P* / P), −2%, +3%) */
export const piOf = (Pstar, P) => monClamp(LAM * Math.log(Math.max(1e-3, Pstar) / Math.max(1e-3, P)), PI_DN, PI_UP);
/** 다음 물가 */
export const nextP = (P, pi) => monClamp(P * (1 + pi), P_MIN, P_MAX);
/** 기본값 × 물가(최소 lo) */
export const scaleP = (base, P, lo = 1) => Math.max(lo, Math.round(base * P));
/** 자동 모드: 단계 칸 i(STEPS 번호) → 내일 칸. 물가가 오르면 한 칸 내림, 내리면(또는 일감 없음이 많으면) 한 칸 올림.
 *  올림은 어제 매입이 한도의 AUTO_USED 이상일 때만(한도가 남는데 값이 내리면 돈이 아니라 물건이 모자란 것 → 쓰지 않을 한도를 감아 두지 않음). 칸은 1(아주 적게) ~ 맨 위 */
export function autoStep(i, pi, P, jl = 0, usedShare = 1) {
  const gap = Math.log(Math.max(1e-3, P)); let k = i;
  if (pi > 0.008 || (gap > 0.05 && pi > -0.005)) k = i - 1;
  else if ((pi < -0.008 || (gap < -0.05 && pi < 0.005) || (jl > 0.2 && pi < 0.01)) && usedShare >= AUTO_USED) k = i + 1;
  return monClamp(k, 1, STEPS.length - 1);
}
/** 물가 안정한 날인가 */
export const stableDay = pi => Math.abs(pi) < STABLE_PI;
/** 화면용 '물가 100' */
export const priceIndex = P => Math.round(P * 100);
