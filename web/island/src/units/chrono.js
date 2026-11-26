// 체질(아침형·야행성)과 잠: 잠은 밤이라서가 아니라 피곤해서 잔다.
//  · 기력(u.needs.energy = 100 − 피로)이 SLEEP_BELOW(체질과 어긋난 시간엔 SLEEP_BELOW_OFF) 아래면 잘 곳(내 집 → 빈 집 손님 → 밖)에 가서 자고, WAKE_AT(피로 0)까지 차면 밤이어도 일어나
//    배고프면 먹고·추우면 몸 녹이고·아프면 쉬고·아니면 일함(unitBrain chooseNext).
//  · 체질: 아침형(기본 갈매미 대부분)은 밤에, 야행성(PERSONA.nocturnal: 불씨·그림자)은 낮에 피로가 OFF_FATIGUE배로 쌓임(기력이 닳는 쪽만, 회복 속도는 같음).
//    그래서 아침형은 낮에·야행성은 밤에 더 오래 깨어 일하게 되지만 강제는 아님.
//  · world.isNight를 모르면(시험 받침·화면 없음) 체질 효과 없음.
import { PERSONA } from "../data/catalog.js";

/** 이 기력 아래면 잠(예전 '지치면 잠' 문턱과 같음 — 20~30은 서서 쉬기, mind.js TIRED) */
export const SLEEP_BELOW = 20;
/** 체질과 어긋난 시간(아침형의 밤·야행성의 낮)엔 피곤하면(mind.js TIRED 30 아래) 서서 쉬지 않고 바로 잠 */
export const SLEEP_BELOW_OFF = 30;
/** 이 기력이면 피로 0으로 보고 깸(기력은 0~100으로 잘려 100에 닿으므로 소수 오차만 봐 줌) */
export const WAKE_AT = 99.5;
/** 체질과 어긋난 시간(아침형의 밤·야행성의 낮)에 피로가 쌓이는 배율 */
export const OFF_FATIGUE = 1.5;

export const isNocturnal = u => !!(PERSONA[u?.name] || {}).nocturnal;
/** 체질과 어긋난 시간인가(아침형의 밤 · 야행성의 낮). 밤낮을 모르면 false */
export const offHours = (u, world) => world?.isNight == null ? false : (isNocturnal(u) ? !world.isNight : !!world.isNight);
/** 지금 피로가 쌓이는 배율(기력이 닳을 때만 곱함) */
export const fatigueMult = (u, world) => offHours(u, world) ? OFF_FATIGUE : 1;
/** 지금 자러 가는 기력 문턱 */
export const sleepBelow = (u, world) => offHours(u, world) ? SLEEP_BELOW_OFF : SLEEP_BELOW;
/** 카드 표시: 체질 이름 */
export const chronoLabel = u => isNocturnal(u) ? "🌙 야행성" : "🌅 아침형";
/** 카드 표시: 지금 피로 영향(어긋난 시간일 때만, 아니면 빈 글) */
export const chronoNote = (u, world) => !offHours(u, world) ? "" : isNocturnal(u) ? "낮이라 더 빨리 지쳐요" : "밤이라 더 빨리 지쳐요";
