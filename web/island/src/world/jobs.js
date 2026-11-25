// 종족(직업)·희귀도·배고픔 규칙. 순수 함수만 둔다(시험하기 쉽게).
import { JOBS, RARITY, FISH, ITEMS, UNIT_JOBS, PERSONA, BUILD_SPEED } from "../data/catalog.js";

export const jobOf = u => JOBS[u.job] || null;
export const rarityOf = u => RARITY[u.rarity] || RARITY.common;
/** 이 활동에서의 배율: 자기 특기면 희귀도 배율, 아니면 1. */
export const skillMult = (u, skill) => (jobOf(u)?.skill === skill ? rarityOf(u).mult : 1);

/** 직업·희귀도를 붙인다(이름으로 UNIT_JOBS에서 찾음). */
export function assignJob(u) {
  const [tribe, job, rarity] = UNIT_JOBS[u.name] || ["태초", "builder", "common"];
  u.tribe = tribe; u.job = job; u.rarity = rarity;
}

// ---- 포만감(0~120). 100을 넘으면 너무 배불러 게을러진다.
export const FULL_MAX = 120, HUNGRY = 35, OVERFULL = 100;
export const HUNGER_PER_SEC = 0.25;          // 1초에 줄어드는 포만감(80 → 0까지 약 5분 20초)

/** 능률(일 속도 배율): 배고프면 떨어지고, 든든하면 오르고, 너무 부르면 다시 떨어진다. */
export function efficiency(full) {
  if (full < 20) return 0.5;
  if (full < HUNGRY) return 0.75;
  if (full < 60) return 1.0;
  if (full <= OVERFULL) return 1.2;
  return 0.85;
}
export const isLazy = u => u.full > OVERFULL;

/** 활동 고를 때의 비중: 성격 비중 + 특기 보너스. 상인·농부 일은 그 직업만. 너무 부르면 쉬기·산책이 늘어남. */
export function activityWeights(u) {
  const p = { ...(PERSONA[u.name] || PERSONA["기본"]) }, job = jobOf(u);
  p.trade = 0; p.farm = 0;
  if (job) p[job.skill] = (p[job.skill] || 0) * 2 + 4;
  if (isLazy(u)) { p.rest = (p.rest || 1) * 4; p.wander = (p.wander || 1) * 2; for (const k of ["build", "mine", "chop", "fish", "trade", "farm"]) p[k] = (p[k] || 0) * 0.3; }
  return Object.entries(p).filter(([, w]) => typeof w === "number" && w > 0);
}

/** 제 일거리가 없을 때(공사장 없음·낚시 자리 없음·밭이 자라는 중…) 대신 돕는 일. 순서대로 해 봄.
 *  건축가·목수·상인은 창고에 모자란 자재부터(나무·돌), 농부·낚시꾼은 서로의 일(낚시)·벌목, 나무꾼·광부는 서로의 일. */
export const HELP_STOCK = 30;                 // 돕는 일로 모으는 자재는 (은행 창고 + 내 가방)에 이만큼 찰 때까지만(넘치면 돕지 않고 놀거나 산책: 돈을 끝없이 찍지 않게)
export function helpJobs(u, res = {}) {
  const has = k => (res[k] || 0) + (u.inv?.[k] || 0), gather = has("wood") <= has("stone") ? ["chop", "mine"] : ["mine", "chop"];
  const list = { builder: gather, carpenter: gather, merchant: gather, fisher: ["chop"], farmer: ["fish"], lumberjack: ["mine"], miner: ["chop"] }[u.job] || gather;
  return list.filter(k => !(k === "chop" && has("wood") >= HELP_STOCK) && !(k === "mine" && has("stone") >= HELP_STOCK));
}

// ---- 건축
/** 이 갈매미가 이 건물을 지을 수 있나: 1등급은 누구나, 그 위는 그 등급 이상 건축가만. */
export function canBuild(u, def) {
  const tier = def.tier || 1;
  if (def.fixed) return false;
  if (def.builtBy) return u.job === def.builtBy && (tier <= 1 || rarityOf(u).rank >= tier);   // 집·계단 = 건축가, 시설 = 목수
  if (tier <= 1) return true;
  return u.job === "builder" && rarityOf(u).rank >= tier;
}
/** 망치질 한 번에 오르는 진행: 짓는 직업(건축가·목수)은 희귀도별 공사 속도(일반 0.8 · 희귀 1.15 · 영웅 1.5 · 전설 1.9), 그 밖은 0.6 */
export const hammerPower = u => (u.job === "builder" || u.job === "carpenter" ? BUILD_SPEED[u.rarity] ?? BUILD_SPEED.common : 0.6);

// ---- 벌목·채광
export const chopsNeeded = u => Math.max(1, Math.ceil(3 / skillMult(u, "chop")));
export const woodYield = u => Math.round(2 * skillMult(u, "chop"));
export const stoneYield = u => Math.round(2 * skillMult(u, "mine"));
/** 광석을 깨면 철이 나올 확률: 광부는 희귀도에 따라, 다른 갈매미는 조금. */
export const ironChance = u => (u.job === "miner" ? Math.min(0.9, 0.25 * rarityOf(u).rank) : 0.05);

// ---- 낚시
export const catchChance = u => Math.min(0.95, 0.6 * skillMult(u, "fish"));
/** 어떤 물고기를 낚았는지. 낚시꾼은 희귀 이상 물고기 비중이 배율만큼 커진다. */
/** season: 지금 계절(그 계절 한정 물고기만 섞임, 없으면 한정 물고기 없음) */
export const inSeason = (x, season) => !x.season || x.season === season;
/** 찌 당기기(같이 낚시하기): 따라가는 갈매미의 입질 때(기다림의 마지막 BITE_SECS초) 같이 당기면 그 한 번만 희귀 이상 비중이 TUG_BONUS배, 재미 +TUG_FUN */
export const TUG_BONUS = 1.5, BITE_SECS = 1.5, TUG_FUN = 5;
/** bonus: 희귀 이상 비중에 더 곱하는 배율(찌 당기기, 기본 1 = 그대로). 난수는 bonus와 상관없이 똑같이 한 번만 씀 */
export function rollFish(u, rnd, season = null, bonus = 1) {
  const m = skillMult(u, "fish") * bonus;
  const ws = FISH.map(f => inSeason(f, season) ? f.weight * (f.rarity === "common" ? 1 : m) : 0);
  let r = rnd() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < FISH.length; i++) if ((r -= ws[i]) <= 0) return FISH[i];
  return FISH[0];
}
/** 낚시할 때 물건을 건질 확률과 무엇을 건지는지(희귀할수록 드묾). */
export const itemChance = u => 0.02 * skillMult(u, "fish") ** 2;
export function rollItem(u, rnd, season = null, bonus = 1) {
  const w = { common: 50, rare: 30, epic: 15, legend: 5 }, m = skillMult(u, "fish") * bonus;
  const ws = ITEMS.map(i => inSeason(i, season) && !i.sky && !i.fest && !i.stamp && !i.gift ? w[i.rarity] * (i.rarity === "common" ? 1 : m) : 0);
  let r = rnd() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ITEMS.length; i++) if ((r -= ws[i]) <= 0) return ITEMS[i];
  return ITEMS[0];
}

// ---- 농사
export const growSeconds = u => 40 / skillMult(u, "farm");
export const harvestYield = u => 1 + Math.round(2 * skillMult(u, "farm"));
