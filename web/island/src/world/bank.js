// 은행 금고(순수 계산·숫자). 금고(bank.vault) = 플레이어의 돈. 갈매미 각자의 돈(u.coins)은 그 갈매미 것.
//  · 금고로 들어오는 돈: 갈매미가 은행에 낸 돈(집 계약금·대출 상환·저장고 음식·가구 = bank.returned) + 세금(마을 하루마다, 가진 돈의 일부).
//  · 금고에서 나가는 돈: 플레이어가 놓는 건물의 설계비(놓을 때) + 공사 품삯(망치질 한 바퀴마다). 갈매미 돈은 건설에 쓰지 않음.
//  · 새로 찍는 돈(bank.issued)은 그대로: 상인 가공품·저장고 매입·소지품 판매·창업 자금·축하금(마을 경제가 멈추지 않게).
//  · 집: 집값을 다 못 가진 갈매미는 계약금(LOAN_DOWN)을 내고 나머지를 금고에서 빌림(이자 없음, 마을 하루마다 나눠 갚음).
//  · 금고가 바닥나면: 대출 거절(집 없이 지냄·만족도 −10) · 품삯 밀림(일은 계속, 만족도 −10, 돈이 들어오면 나눠 갚음) · 말풍선·소식지.
import { newsDay } from "./news.js";

export const VAULT_START = 100;      // 새 섬 금고(첫날 설계비 ~50 + 품삯 ~54를 계약금·세금과 함께 버팀)
export const VAULT_LOW = 30;         // 이보다 적으면 "얼마 안 남음" 알림(규칙은 그대로)
export const VAULT_REARM = 60;       // 이만큼 다시 차면 "얼마 안 남음"을 또 알릴 수 있음
export const LOAN_DOWN = 0.4;        // 계약금 비율(작은 집 30 → 12 + 대출 18)
export const LOAN_DAYS = 5;          // 대출은 마을 5일에 나눠 갚음
export const LOAN_RESERVE = 20;      // 빌려주고도 금고에 이만큼 남아야 빌려줌(품삯 열 번 몫)
export const REPAY_KEEP = 10;        // 갚고도 갈매미에게 이만큼은 남김(밥 두 끼 값)
export const TAX_RATE = 0.05, TAX_KEEP = 20, TAX_CAP = 8;   // 세금: (돈 − 20) × 5%, 한 마리 하루 8까지
export const LEDGER_DAYS = 7;        // 장부는 최근 7일
export const FEE_UNKNOWN = 5;        // 표에 없는 건물의 설계비

/** 설계비(🪙, 금고에서 놓을 때 냄). 집은 집값의 약 ⅓, 장식 2, 다리는 칸마다 1, 눈사람·은행 0 */
export const FEE = {
  stairs: 2, bench: 2, flowerbed: 2, bunting: 2, festLantern: 2, seasonDeco: 2, streetlamp: 3, snowman: 0,
  bridge: 1, dock: 3, pier: 4, field: 5, fountain: 8, storehouse: 12, market: 15, windmill: 15,
  cafe: 20, shop: 25, post: 30, aquarium: 30,
  house: 10, cottage: 15, giantHouse: 15, manor: 30, bank: 0,
};
export const feeOf = defId => FEE[defId] ?? FEE_UNKNOWN;
/** 금고가 모자랄 때 놓기 실패 사유(tools.js가 상태 줄에 그대로 띄움) */
export const feeReason = (fee, vault) => `🏦 금고에 조개가 모자라요 (설계비 🪙${fee} · 금고 🪙${Math.floor(vault)})`;

export const downOf = price => Math.ceil(price * LOAN_DOWN);
export const perOf = loan => Math.ceil(loan / LOAN_DAYS);
/** 이 돈을 가진 갈매미의 하루 세금 */
export const taxOf = coins => Math.min(TAX_CAP, Math.floor(Math.max(0, (coins || 0) - TAX_KEEP) * TAX_RATE));
/** 오늘 갚을 돈: 하루 몫과 남은 빚 중 적은 것, 단 REPAY_KEEP은 남김(못 갚으면 0, 벌 없음) */
export const repayOf = (loan, coins) => loan ? Math.max(0, Math.min(loan.per, loan.left, (coins || 0) - REPAY_KEEP)) : 0;

/** 집 거래 판단(난수 안 씀): { ok, price, down, loan, reason: "coins" | "vault" | null }.
 *  집값을 다 가졌으면 현금(금고가 비어도 됨). 아니면 계약금이 있고 금고에 대출금 + LOAN_RESERVE가 있어야 함. 경제가 없으면 현금만 */
export function houseDealFor(price, coins, vault, economy = true) {
  coins = coins || 0;
  if (coins >= price) return { ok: true, price, down: price, loan: 0, reason: null };
  if (!economy) return { ok: false, price, down: price, loan: 0, reason: "coins" };
  const down = downOf(price), loan = price - down;
  if (coins < down) return { ok: false, price, down, loan, reason: "coins" };
  if (vault < loan + LOAN_RESERVE) return { ok: false, price, down, loan, reason: "vault" };
  return { ok: true, price, down, loan, reason: null };
}

/** 새 섬의 은행 기록. issued·returned는 예전 뜻 그대로(hud가 읽음) */
export const newBank = (time = 0) => ({
  issued: 0, returned: 0,               // 찍은 돈 · 금고로 돌아온 돈(계약금·상환·저장고·가구)
  vault: VAULT_START,                    // 금고(플레이어 돈)
  taxed: 0, fees: 0, wages: 0,           // 누계: 세금 · 설계비(환불 뺌) · 금고에서 나간 품삯
  owed: 0,                               // 지금 밀린 품삯 합(갈매미별 u.wageOwed의 합)
  lent: 0, repaid: 0, forgiven: 0,       // 누계: 빌려준 돈 · 갚은 돈 · 집이 철거돼 없애 준 빚
  day: newsDay(time),                    // 마지막으로 세금을 걷은 마을 날
  short: 0,                              // 1 = 금고 바닥 사태 진행 중(소식지는 사태마다 한 번)
  need: 0,                               // 거절한 대출이 요구한 금고(대출금 + 여유). 이만큼 차면 거절 표시(u.loanRefused)를 풂(사태 끝남과는 따로)
  low: 0,                                // 1 = "얼마 안 남음"을 이미 알림
  ledger: [],                            // 최근 7일 [{ day, tax, returned, fees, wages, lent }]
});
const num = v => Number.isFinite(+v) ? +v : 0;
/** 저장에서 읽은 은행. 금고가 없는 예전 저장은 VAULT_START + 지금까지 돌아온 돈(정의상 플레이어 돈이고 쓴 적이 없음),
 *  세금 날은 불러온 날로(불러오자마자 걷지 않게). 이상한 값은 0 이상으로 */
export function bankFromSave(j, time = 0) {
  const b = newBank(time); if (!j || typeof j !== "object") return b;
  for (const k of ["issued", "returned", "taxed", "fees", "wages", "lent", "repaid", "forgiven", "need"]) b[k] = Math.max(0, num(j[k]));
  b.vault = "vault" in j ? Math.max(0, num(j.vault)) : VAULT_START + b.returned;
  if (Number.isFinite(j.day) && j.day >= 1) b.day = Math.floor(j.day);
  b.short = j.short ? 1 : 0; b.low = j.low ? 1 : 0;
  b.ledger = (Array.isArray(j.ledger) ? j.ledger : []).filter(e => e && e.day >= 1).slice(-LEDGER_DAYS)
    .map(e => ({ day: e.day | 0, tax: num(e.tax), returned: num(e.returned), fees: num(e.fees), wages: num(e.wages), lent: num(e.lent) }));
  return b;
}
/** 저장에서 읽은 갈매미 대출(없으면 null) */
export function loanFromSave(l) {
  const left = Math.max(0, Math.floor(num(l?.left))), per = Math.max(1, Math.floor(num(l?.per)));
  return left > 0 ? { left, per } : null;
}
