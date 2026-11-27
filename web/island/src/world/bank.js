// 은행 금고(순수 계산·숫자). 금고(bank.vault) = 플레이어의 돈. 갈매미 각자의 돈(u.coins)은 그 갈매미 것.
//  · 금고로 들어오는 돈: 갈매미가 은행에 낸 돈(집 계약금·대출 상환·저장고 음식·가구 = bank.returned) + 세금(마을 하루마다, 가진 돈의 일부).
//  · 금고에서 나가는 돈: 플레이어가 놓는 건물의 설계비(놓을 때) + 공사 품삯(망치질 한 바퀴마다). 갈매미 돈은 건설에 쓰지 않음.
//  · 새로 찍는 돈(bank.issued)은 그대로: 상인 가공품·저장고 매입·소지품 판매·창업 자금·축하금(마을 경제가 멈추지 않게).
//  · 집: 집값을 다 못 가진 갈매미는 계약금(LOAN_DOWN)을 내고 나머지를 금고에서 빌림(이자 없음, 마을 하루마다 나눠 갚음).
//  · 금고가 바닥나면: 대출 거절(집 없이 지냄·만족도 −10) · 품삯 밀림(일은 계속, 만족도 −10, 돈이 들어오면 나눠 갚음) · 말풍선·소식지.
import { newsDay } from "./news.js";
import { newMon, monFromSave } from "./monetary.js";

export const VAULT_START = 300;      // 새 섬 금고 기본 돈(사용자 요청 "처음에 주는 조개 넉넉히" → 60에서 300. 집 한 채 = 설계비 10 + 품삯 약 10 → 처음 열다섯 채 몫. 첫 집 한 채는 섬에 지어져 있음)
export const VAULT_LEGACY = 100;     // 금고가 생기기 전 저장을 불러올 때의 금고(예전 새 섬 값 그대로)
export const VAULT_LOW = 30;         // 이보다 적으면 "얼마 안 남음" 알림(규칙은 그대로)
export const VAULT_REARM = 60;       // 이만큼 다시 차면 "얼마 안 남음"을 또 알릴 수 있음
export const LOAN_DOWN = 0.4;        // 계약금 비율(작은 집 30 → 12 + 대출 18)
export const LOAN_DAYS = 5;          // 대출은 마을 5일에 나눠 갚음
export const LOAN_RESERVE = 20;      // 빌려주고도 금고에 이만큼 남아야 빌려줌(품삯 열 번 몫)
export const REPAY_KEEP = 10;        // 갚고도 갈매미에게 이만큼은 남김(밥 두 끼 값)
export const TAX_RATE = 0.05, TAX_KEEP = 20, TAX_CAP = 8;   // 세금: (돈 − 20) × 5%, 한 마리 하루 8까지
export const LEDGER_DAYS = 7;        // 장부는 최근 7일
/** 장부 칸 중 returned(돌아온 돈) 안의 몫: 집값(계약금) · 대출 상환 · 진료·약 · 옷 · 가게(코코아·저장고 음식·가구) · 숙박(빈 집 손님 숙박비). 몫 합 ≤ returned, 나머지는 '그 밖'(주문 장식 자재값 등) */
export const LEDGER_PARTS = ["house", "repay", "clinic", "clothes", "shop", "lodging"];
/** 손님 숙박비(🪙): 집 없는 갈매미가 주인 없는 빈 집에서 자면 마을 하루에 한 번 → 금고. 가진 만큼, 없으면 무료(진료비와 같은 방식).
 *  2 = 품삯(E.WAGE) 한 바퀴 · 밥 한 끼(FOOD_PRICE 3)보다 싸고 진료비(3)보다 쌈. 작은 집 30이면 15박 값 → 오래 묵느니 집을 사는 게 낫게 */
export const LODGING_FEE = 2;
/** 중앙은행(monetary.js) 장부 칸: seig 발행 수수료(새 돈 → 금고) · retired 은행 가게에서 거둬 없앤 돈 · interest 예금 이자(새 돈 → 예금) */
export const LEDGER_MON = ["seig", "retired", "interest"];
const LEDGER_KEYS = ["tax", "returned", "fees", "wages", "lent", "refunds", "custom", ...LEDGER_PARTS, ...LEDGER_MON];
/** 하루치 빈 장부 칸 */
export const ledgerDay = day => Object.fromEntries([["day", day], ...LEDGER_KEYS.map(k => [k, 0])]);
export const FEE_UNKNOWN = 5;        // 표에 없는 건물의 설계비

/** 설계비(🪙, 금고에서 놓을 때 냄). 집은 집값의 약 ⅓, 장식 2, 다리는 칸마다 1, 눈사람·은행 0 */
export const FEE = {
  stairs: 2, bench: 2, flowerbed: 2, bunting: 2, festLantern: 2, seasonDeco: 2, streetlamp: 3, snowman: 0,
  bridge: 1, dock: 3, pier: 4, field: 5, fountain: 8, storehouse: 12, market: 15, windmill: 15,
  cafe: 20, clinic: 20, hospital: 40, shop: 25, post: 30, aquarium: 30,
  house: 10, cottage: 15, giantHouse: 15, manor: 30, bank: 0,
};
export const feeOf = defId => FEE[defId] ?? FEE_UNKNOWN;
/** 금고가 모자랄 때 놓기 실패 사유(tools.js가 상태 줄에 그대로 띄움) */
export const feeReason = (fee, vault) => `🏦 금고에 조개가 모자라요 (설계비 🪙${fee} · 금고 🪙${Math.floor(vault)})`;

// ---- 물가(값 오름): 마을이 커질수록 설계비·집값이 오름(갈매미 돈과 세금이 늘어 금고가 금방 넘치지 않게)
//  배수 = 1 + 0.15 × (마을 등급 − 1, 0 이상) + 0.06 × (다 지은 집·시설 수 − 8, 0 이상), 최대 3. 소수 둘째 자리에서 반올림.
//  · 등급: 갯마을·어촌 +0, 항구 마을 +0.15, 섬 도시 +0.3.
//  · 집·시설 = 다 지은 건물 중 장식·계단·다리·은행이 아닌 것(집·시장·밭·낚시터·저장고·카페 등). 8채까지는 +0, 그 뒤 한 채마다 +0.06.
//  · 새 섬(어촌 이하, 집·시설 8채 이하)은 1배 그대로. 값 = 반올림(기본값 × 배수)(1 이상), 기본값 0(눈사람·은행·첫 시장)은 그대로 0.
//  예) 항구 마을 · 집·시설 12채 → 1 + 0.15 + 0.24 = 1.39 → 집 설계비 10 → 14, 작은 집 값 30 → 42(계약금 17 · 대출 25)
export const PRICE_RANK = 0.15, PRICE_RANK_FROM = 1, PRICE_PER = 0.06, PRICE_FREE = 8, PRICE_CAP = 3;
export const rankPartOf = rank => PRICE_RANK * Math.max(0, (rank || 0) - PRICE_RANK_FROM);
export const buildPartOf = n => PRICE_PER * Math.max(0, (n || 0) - PRICE_FREE);
export const priceMult = (rank, n) => Math.round(Math.min(PRICE_CAP, 1 + rankPartOf(rank) + buildPartOf(n)) * 100) / 100;
export const scaled = (base, mult) => base > 0 ? Math.max(1, Math.round(base * mult)) : 0;
/** 물가에 세는 건물인가(다 지은 집·시설): 장식·계단·다리·하나뿐인 건물(은행)은 빼고 */
export const growthCounts = def => !!def && !def.deco && !def.stairs && !def.bridge && !def.fixed && !def.bank;

export const downOf = (price, rate = LOAN_DOWN) => Math.ceil(price * rate);
export const perOf = loan => Math.ceil(loan / LOAN_DAYS);
/** 이 돈을 가진 갈매미의 하루 세금 */
export const taxOf = coins => Math.min(TAX_CAP, Math.floor(Math.max(0, (coins || 0) - TAX_KEEP) * TAX_RATE));
/** 오늘 갚을 돈: 하루 몫과 남은 빚 중 적은 것, 단 REPAY_KEEP은 남김(못 갚으면 0, 벌 없음) */
export const repayOf = (loan, coins) => loan ? Math.max(0, Math.min(loan.per, loan.left, (coins || 0) - REPAY_KEEP)) : 0;

/** 집 거래 판단(난수 안 씀): { ok, price, down, loan, reason: "coins" | "vault" | null }.
 *  집값을 다 가졌으면 현금(금고가 비어도 됨). 아니면 계약금이 있고 금고에 대출금 + LOAN_RESERVE가 있어야 함. 경제가 없으면 현금만 */
export function houseDealFor(price, coins, vault, economy = true, downRate = LOAN_DOWN) {
  coins = coins || 0;
  if (coins >= price) return { ok: true, price, down: price, loan: 0, reason: null };
  if (!economy) return { ok: false, price, down: price, loan: 0, reason: "coins" };
  const down = downOf(price, downRate), loan = price - down;
  if (coins < down) return { ok: false, price, down, loan, reason: "coins" };
  if (vault < loan + LOAN_RESERVE) return { ok: false, price, down, loan, reason: "vault" };
  return { ok: true, price, down, loan, reason: null };
}

/** 새 섬의 은행 기록. issued·returned는 예전 뜻 그대로(hud가 읽음) */
export const newBank = (time = 0) => ({
  issued: 0, returned: 0,               // 찍은 돈 · 금고로 돌아온 돈(계약금·상환·저장고·가구)
  vault: VAULT_START,                    // 금고(플레이어 돈)
  taxed: 0, fees: 0, wages: 0,           // 누계: 세금 · 설계비(환불 뺌) · 금고에서 나간 품삯
  custom: 0,                             // 누계: 섬 꾸미기(customize.js)에 쓴 돈(되돌리기 환불 뺌)
  owed: 0,                               // 지금 밀린 품삯 합(갈매미별 u.wageOwed의 합)
  lent: 0, repaid: 0, forgiven: 0,       // 누계: 빌려준 돈 · 갚은 돈 · 집이 철거돼 없애 준 빚
  day: newsDay(time),                    // 마지막으로 세금을 걷은 마을 날
  short: 0,                              // 1 = 금고 바닥 사태 진행 중(소식지는 사태마다 한 번)
  need: 0,                               // 거절한 대출이 요구한 금고(대출금 + 여유). 이만큼 차면 거절 표시(u.loanRefused)를 풂(사태 끝남과는 따로)
  low: 0,                                // 1 = "얼마 안 남음"을 이미 알림
  seig: 0, retired: 0, interest: 0,      // 누계(중앙은행): 발행 수수료(새 돈 → 금고) · 은행 가게에서 거둬 없앤 돈 · 예금 이자(새 돈 → 예금)
  mon: newMon(),                         // 중앙은행(monetary.js): 물가 · 발행 단계 · 금리 · 자동 · 오늘 한도
  ledger: [],                            // 최근 7일 [{ day, tax, returned, fees, wages, lent, refunds, custom, house, repay, clinic, clothes, shop, lodging }] (house·repay·clinic·clothes·shop·lodging: returned 안의 몫, LEDGER_PARTS) (custom: 그날 꾸미기에 쓴 돈) (clinic: 그날 의원 진료비·약값, returned 안에 든 몫) (refunds: 그날 공사 취소로 돌려받은 설계비, 놓은 날과 다를 수 있음)
});
const num = v => Number.isFinite(+v) ? +v : 0;
/** 저장에서 읽은 은행. 금고가 없는 예전 저장은 VAULT_LEGACY(100) + 지금까지 돌아온 돈(정의상 플레이어 돈이고 쓴 적이 없음),
 *  세금 날은 불러온 날로(불러오자마자 걷지 않게). 이상한 값은 0 이상으로 */
export function bankFromSave(j, time = 0) {
  const b = newBank(time); b.mon = j && j.mon === null ? null : monFromSave(j?.mon);   // 중앙은행이 없는 옛 저장: 돈은 그대로 + 4일 적응 + 자동(null = 중앙은행을 끈 지금 규칙, 시험 받침)
  if (!j || typeof j !== "object") { b.vault = VAULT_LEGACY; return b; }   // 은행 기록이 아예 없는 예전 저장도 100
  for (const k of ["issued", "returned", "taxed", "fees", "wages", "lent", "repaid", "forgiven", "need", "custom", "seig", "retired", "interest"]) b[k] = Math.max(0, num(j[k]));
  b.vault = "vault" in j ? Math.max(0, num(j.vault)) : VAULT_LEGACY + b.returned;
  if (Number.isFinite(j.day) && j.day >= 1) b.day = Math.floor(j.day);
  b.short = j.short ? 1 : 0; b.low = j.low ? 1 : 0;
  b.ledger = (Array.isArray(j.ledger) ? j.ledger : []).filter(e => e && e.day >= 1).slice(-LEDGER_DAYS)
    .map(e => { const o = ledgerDay(e.day | 0); for (const k of LEDGER_KEYS) o[k] = num(e[k]); return o; });   // 예전 장부엔 없는 칸(몫·custom·refunds) → 0
  return b;
}
/** 저장에서 읽은 갈매미 대출(없으면 null) */
export function loanFromSave(l) {
  const left = Math.max(0, Math.floor(num(l?.left))), per = Math.max(1, Math.floor(num(l?.per)));
  return left > 0 ? { left, per } : null;
}
