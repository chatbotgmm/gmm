// 체질(아침형·야행성)과 잠: 잠은 밤이라서가 아니라 피곤해서 잔다.
//  · 기력(u.needs.energy = 100 − 피로)이 SLEEP_BELOW(20, 체질·밤낮과 상관없이 하나) 이하면 잘 곳(내 집 → 빈 집 손님 → 밖)에 가서 자고, WAKE_AT(피로 0)까지 차면 밤이어도 일어나
//    배고프면 먹고·추우면 몸 녹이고·아프면 쉬고·아니면 일함(unitBrain chooseNext).
//  · 체질: 아침형(기본 갈매미 대부분)은 밤에, 야행성(PERSONA.nocturnal: 불씨·그림자)은 낮에 피로가 OFF_FATIGUE배로 쌓임(기력이 닳는 쪽만, 회복 속도는 같음).
//    그래서 아침형은 낮에·야행성은 밤에 더 오래 깨어 일하게 되지만 강제는 아님.
//  · world.isNight를 모르면(시험 받침·화면 없음) 체질 효과 없음.
import { PERSONA } from "../data/catalog.js";

/** 이 기력 이하면 자러 감(사용자 결정: "기력이 20이하로 떨어지면 자러가고"). 체질과 상관없이 하나 — 어긋난 시간엔 피로가 OFF_FATIGUE배로 쌓여 더 빨리 닿을 뿐.
 *  (예전엔 어긋난 시간 문턱 30이 따로 있었음.) 20~30은 피곤함: 가끔 잠깐 숨만 돌림(mind.js TIRED·BREATH_EVERY) */
export const SLEEP_BELOW = 20;
/** 기력이 이 값 이하로 떨어지면(0에 가까움) 그 자리에서 쓰러짐(사용자 결정: "0에 가까워지면 쓰러지고 병원에 감").
 *  잠 문턱 20의 1/10: 20에서 자러 나선 갈매미가 집까지 걷는 동안(걷기 −0.15/초, 어긋난 시간 ×1.5, 감기 ×1.5 → 최대 −0.34/초) 18을 다 쓰려면 53초 넘게 걸어야 함 → 드묾 */
export const FAINT_AT = 2;
/** 쓰러진 채 누워 있는 초: 그 뒤 빈 침대가 있는 병원으로 실려 가고(진료비는 health.js CLINIC_FEE, 가진 만큼), 없으면 그 자리에서 잠 */
export const FAINT_LIE = 6;
/** 이 기력이면 피로 0으로 보고 깸(기력은 0~100으로 잘려 100에 닿으므로 소수 오차만 봐 줌) */
export const WAKE_AT = 99.5;
/** 체질과 어긋난 시간(아침형의 밤·야행성의 낮)에 피로가 쌓이는 배율 */
export const OFF_FATIGUE = 1.5;
/** 자는 중엔 포만감이 이 아래로 떨어져야 배고파서 깸(깨어 있을 땐 jobs.js HUNGRY 35에서 먹으러 감).
 *  35에서 깨면 느린 잠 회복(mind.js SLEEP_GAIN 0.08~0.16/초) 때문에 거의 모든 잠이 기력이 차기 전에 끝났음.
 *  20 = 능률이 반(0.5)으로 떨어지는 선(jobs.js efficiency)이자 저장고 나눔(economy.js RATION_FULL 25) 아래: 깨자마자 돈이 없어도 먹을 수 있고,
 *  일을 멈추고 먹으러 가는 12보다 위라 굶주림 쪽으로 넘어가지 않음 */
export const SLEEP_HUNGRY = 20;
/** 자는 동안 배고파지는 배율(깨어 있을 때 jobs.js HUNGER_PER_SEC 0.25에 곱함 → 0.05/초).
 *  잠든 몸은 덜 씀. 55에서 잠들면 20까지 (55 − 20) / 0.05 = 700초: 침대(기력 30 → 99.5에 69.5 / 0.16 ≈ 434초)·건물 안(≈ 579초)은
 *  배고프기 전에 다 차고, 밖(≈ 869초)은 대개 조금 덜 차서 깸 */
export const SLEEP_HUNGER = 0.2;

export const isNocturnal = u => !!(PERSONA[u?.name] || {}).nocturnal;
/** 체질과 어긋난 시간인가(아침형의 밤 · 야행성의 낮). 밤낮을 모르면 false */
export const offHours = (u, world) => world?.isNight == null ? false : (isNocturnal(u) ? !world.isNight : !!world.isNight);
/** 지금 피로가 쌓이는 배율(기력이 닳을 때만 곱함) */
export const fatigueMult = (u, world) => offHours(u, world) ? OFF_FATIGUE : 1;
/** 자러 가는 기력 문턱(이 값 이하면 잠) — 체질·밤낮과 상관없이 SLEEP_BELOW */
export const sleepBelow = () => SLEEP_BELOW;
/** 카드 표시: 체질 이름 */
export const chronoLabel = u => isNocturnal(u) ? "🌙 야행성" : "🌅 아침형";
/** 카드 표시: 지금 피로 영향(어긋난 시간일 때만, 아니면 빈 글) */
export const chronoNote = (u, world) => !offHours(u, world) ? "" : isNocturnal(u) ? "낮이라 더 빨리 지쳐요" : "밤이라 더 빨리 지쳐요";
