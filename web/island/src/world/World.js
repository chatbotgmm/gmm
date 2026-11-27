// 섬 전체 상태: 격자, 해안 모듈, 자원(나무·광석·씨앗·낚시 자리), 건물, 유닛.
// 그림과 입력은 모르고, 바뀐 일을 이벤트(on/emit)로 알린다. 뷰가 이벤트와 매 프레임 상태를 읽어 그린다.
import { BUILDINGS, MODULES, UNITS, RARITY, FISH, ITEMS, PRICES, FURNITURE, CLOTHES } from "../data/catalog.js";
import { WATER_Y, SEA_LEVEL, MAX_STEP } from "../config.js";
import * as J from "./jobs.js";
import { createBuildingData, createUnitAIState, UnitState } from "../data/types.js";
import { Grid } from "./Grid.js";
import { generateIsland, generateWildIsland } from "./islandGen.js";
import { checkPlacement, footprint } from "./placement.js";
import { terrainHeight } from "./terrain.js";
import { nearestWalkable, findPath } from "./pathfinding.js";
import { updateUnit, exitBuilding, enterBuilding, setIdle, emote, uncommit, interactNear, startSwimHere } from "../units/unitBrain.js";
import { isNocturnal } from "../units/chrono.js";
import { initMind, befriend, FRIEND_STAGES, friendStage, affinity, friendsToNames, friendsFromNames } from "../units/mind.js";
import { seededRandom, josa } from "../util.js";
import * as E from "./economy.js";
import * as S from "./season.js";
import { WISHES, WISH_BY_ID, WISH_REWARD } from "./wishes.js";
import { dreamWishId } from "./dreams.js";
import { RANKS, RANK_REWARD, rankScore, rankNeed } from "./rank.js";
import * as F from "./furniture.js";
import * as RD from "./roads.js";
import * as PW from "./power.js";
import { sizeNoise, fishSize, donatable, giftsEarned, DONATE_GIFTS, donatedFromSave, recordsFromSave } from "./aquarium.js";
import { fishMedal, grantMedalGifts, medalGiftsFromSave } from "./medals.js";
import { newsFor, addNews, newsFromSave, awayHours, awayCasts, newsDay } from "./news.js";
import { SKY_EVENTS, skySeed, RAINBOW_CHANCE, METEOR_CHECK_SECS, METEOR_CHANCE, STAR_CHECK_SECS, STAR_CHANCE, STAR_MAX, STAR_ITEM, SKY_LOOK_CHANCE, skySeenFromSave } from "./skywatch.js";
import { FESTIVAL_RANK, FESTIVAL_SECS, FESTIVAL_CHEER_SECS, festivalOf, festivalGift, festivalPlaza, festiveCount, festivalFromSave, festivalsFromSave } from "./festival.js";
import { paintableUnder, matchGround } from "./groundMatch.js";
import { rollDaily, dailyNote, dailyAllDone, dailyFromSave, stampBoughtFromSave, STAMP_SHOP, STAMP_GIFTS, stampCost } from "./daily.js";
import { BOND_MAX, BOND_STAGES, bondStage, GIFT_TIERS, giftDef, giftTier, PET_DAILY, PET_BOND, PET_FUN, petsLeft, thanksFor, keepFromSave, STAMP_GIFT_BOND } from "./bond.js";
import { STASH_CUT, stashDef, stashPrice, stashFurniture, stashSellable, stashFromSave, stashAdd } from "./belongings.js";
import * as BK from "./bank.js";
import { undoBlock, feeUndoLedger } from "./buildUndo.js";
import * as MON from "./monetary.js";
import * as P from "./population.js";
import * as HM from "./homes.js";
import * as FM from "./farming.js";
import * as CU from "./customize.js";
import * as CLIM from "./climate.js";
import * as CLO from "./clothes.js";
import * as HL from "./health.js";
import { SPARKLE_EVERY, SPARKLE_FIRST, SPARKLE_PICK_R, sparkleSeed, sparkleCells, sparkleCellFree, rollSparkles, sparklesFromSave, sparkleRoom, sparkleLife, sparkleDusk } from "./sparkles.js";

/**
 * 새 넓은 섬에 공식은행을 놓음(예전 저장을 불러올 땐 쓰지 않음). 난수를 쓰지 않아 같은 섬 → 같은 자리.
 * 1) 지도 한가운데(예전 자리)에 놓이면 그대로(이미 은행이 있던 섬은 하나도 안 바뀜).
 * 2) 아니면 가운데에서 가까운 순(거리², z, x)으로 반지름 R칸 안에서: 바닥이 높이 0으로 평평하고, 문으로 걸어 들어가며,
 *    은행이 서도 섬의 다른 땅(고지대 비탈 포함)으로 가는 길이 끊기지 않는 자리.
 * 3) 그래도 없으면 같은 순서로 자리를 골라 은행 칸·문 앞 칸의 땅을 높이 0으로 고른 뒤 같은 조건을 봄(안 되면 되돌림).
 * @returns 놓은 은행 건물(끝내 못 놓으면 null)
 */
export function placeTownBank(w, R = 16) {
  const def = BUILDINGS.bank, g = w.grid, mid = { x: g.w / 2, z: g.h / 2 }, ax0 = mid.x - Math.floor(def.footprint.w / 2), az0 = mid.z - Math.floor(def.footprint.d / 2);
  const first = w.placeBuilding("bank", ax0, az0, 0, null, 1e9); if (first.ok) return first.building;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const reach = (sx, sz) => {                                                     // 걸어서 닿는 칸(4방향, grid.canStep)
    const seen = new Uint8Array(g.w * g.h), st = [[sx, sz]]; seen[g.index(sx, sz)] = 1;
    while (st.length) { const [x, z] = st.pop(); for (const [dx, dz] of N4) { const nx = x + dx, nz = z + dz;
      if (!g.inBounds(nx, nz) || seen[g.index(nx, nz)] || !g.canStep(x, z, nx, nz)) continue; seen[g.index(nx, nz)] = 1; st.push([nx, nz]); } }
    return seen;
  };
  const anchors = []; for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dz * dz <= R * R) anchors.push([dx, dz]);
  anchors.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);
  const start = anchors.map(([dx, dz]) => [mid.x + dx, mid.z + dz]).find(([x, z]) => !g.get(x, z)?.occupiedId && g.get(x, z)?.elevation === 0 && g.isWalkable(x, z));
  if (!start) return null;
  const base = reach(start[0], start[1]);                                          // 가운데 평지에서 걸어 닿는 섬 땅
  const fits = (ax, az) => {
    const fp = footprint(def, ax, az, 0);
    if (!fp.cells.every(([x, z]) => g.get(x, z)?.elevation === 0)) return false;
    if (!checkPlacement(g, def, ax, az, 0, w.units).ok) return false;
    const tmp = "__bankSpot"; g.occupants.set(tmp, { kind: "building", walkable: false, surface: 0 }); for (const [x, z] of fp.cells) g.get(x, z).occupiedId = tmp;
    const after = reach(fp.door.x, fp.door.z);
    for (const [x, z] of fp.cells) g.get(x, z).occupiedId = null; g.occupants.delete(tmp);
    const inFp = new Set(fp.cells.map(([x, z]) => g.index(x, z)));
    for (let i = 0; i < base.length; i++) if (base[i] && !after[i] && !inFp.has(i)) return false;   // 은행 때문에 못 가게 되는 땅이 없어야 함
    return true;
  };
  const put = (ax, az) => w.placeBuilding("bank", ax, az, 0, null, 1e9).building;
  for (const [dx, dz] of anchors) if (fits(ax0 + dx, az0 + dz)) return put(ax0 + dx, az0 + dz);
  for (const [dx, dz] of anchors) {                                                // 땅 고르기
    const ax = ax0 + dx, az = az0 + dz, fp = footprint(def, ax, az, 0), cells = [...fp.cells, [fp.door.x, fp.door.z]];
    if (!cells.every(([x, z]) => g.inBounds(x, z) && !g.isWater(x, z) && !g.get(x, z).occupiedId && !g.doorOwner(x, z))) continue;
    const undo = cells.map(([x, z]) => [x, z, g.get(x, z).elevation]);
    for (const [x, z] of cells) g.get(x, z).elevation = 0;
    if (fits(ax, az)) { for (const [x, z] of cells) g.markDirty(x, z); g.version++; return put(ax, az); }
    for (const [x, z, e] of undo) g.get(x, z).elevation = e;
  }
  return null;
}

export const SPEED_BOOST = 1.6;        // 섬은 마을보다 넓어서 걷기·달리기를 이만큼 빠르게(애니메이션도 같은 배율로 빨라짐)
const START_WOOD = 6, START_STONE = 6;

const clampIn = (v, a, b) => Math.min(b, Math.max(a, v));

/** 계단 디딤판: 단 수는 높이 0.12 m에 한 단(3~12단), t(0 입구 → 1 위쪽)에서 밟는 높이. 그림(views.js)과 같은 식. */
export const stairCount = r => Math.max(3, Math.min(12, Math.round((r.h1 - r.h0) / 0.12)));
export const stairStep = (r, t) => { const n = stairCount(r), i = Math.min(n - 1, Math.max(0, Math.floor(t * n))); return r.h0 + (r.h1 - r.h0) * (i + 1) / n; };

export class World {
  constructor(grid, modules, rnd = Math.random, extra = {}) {
    this.grid = grid; this.modules = modules; this.rnd = rnd; this.time = 0;
    this.buildings = new Map(); this.powerRev = 0; this.units = []; this.nextId = 1; this.listeners = {}; this.timers = [];
    // 자원: 나무·돌·철(자재), 음식(물고기·작물), 조개(돈). collection: 도감(종류별로 잡은 수, 마을 기록)
    // items: 내 가방(플레이어 몫: 가구 + 선물거리 = 주운 반짝이·도장 선물·답례 물건). 갈매미가 잡은 것은 각자 u.stash(belongings.js)
    // treasures: 예전 저장에 남은 보물 물고기 칸(새로 들어오는 것 없음. 예전 저장은 불러올 때 갈매미들에게 나눔 → migrateOwnership)
    this.res = { wood: START_WOOD, stone: START_STONE, iron: 0, food: 10, coins: 0, fish: 0, eaten: 0 };
    this.treasures = {}; this.collection = {}; this.items = {};
    this.bank = BK.newBank();                            // 공식은행: 찍은 돈 · 돌아온 돈 · 금고(플레이어 돈) · 세금·설계비·품삯·대출 누계(bank.js)
    this.instantBuild = false;                         // true면 건물을 놓자마자 완공(갈매미 공사 없음)
    this.heightStep = 0.5;                                // 올리기·내리기 한 번에 바뀌는 높이(m). 걸어 오르는 한 단(MAX_STEP)은 0.25
    this.animateShape = false; this.shaping = new Map(); // 높이 바꾸기를 스르르(화면에서만 켬)
    this.spots = (extra.spots || []).map(s => ({ ...s, claimed: null }));
    this.zones = extra.zones || [];
    this.plots = (extra.plots || []).map(p => ({ x: p.x, z: p.z, stage: p.stage || "empty", t: p.t || 0, grow: p.grow || 40, claimed: null, moisture: p.moisture ?? 1 }));   // moisture: 밭 촉촉함 0~1(farming.js, 예전 저장은 다 젖은 것으로)
    this.stall = extra.stall || null;
    this.trees = []; this.ores = []; this.seeds = []; this.seedId = 1;
    // 계절(화면이 기기 날짜로 정해 줌, 없으면 효과 없음)·날씨(따로 굴리는 난수라 다른 일의 순서를 바꾸지 않음)
    this.season = null; this.wrnd = seededRandom(((extra.seed ?? 7) * 7919 + 13) >>> 0);
    this.weather = extra.weather?.kind ? { ...extra.weather } : { kind: "clear", t: 150 };
    // 소원: { id, unitId, base, age } 최대 2개 · 이룬 수
    this.wishes = (extra.wishes || []).map(x => ({ ...x })); this.wishT = 45; this.wishDone = extra.wishDone || 0; this.wishClock = 0;
    // 시세: 상인이 사는 원자재 값·음식 값(5초마다 다시 셈) · 지난 값(20초마다 하나, 48개)
    this.prices = { ...E.MARKET_BUY, food: E.FOOD_PRICE }; this.priceHist = extra.priceHist || []; this.priceClock = 0; this.histClock = 0;
    this.snow = extra.snow || 0;                                                  // 쌓인 눈(0~1): 겨울에 눈이 오면 늘고 봄·비에 녹음
    this.rank = extra.rank || 0; this.rankClock = 0;                               // 마을 등급(오르기만 함)
    this.granary = extra.granary || 0;                                            // 저장고에 쌓인 음식
    // 소식지: 기억할 만한 일 { day, t, icon, text, weight } · 마지막으로 알린 계절 · 저장한 실제 시각(밖에서 넣어 줌, 다녀온 사이 편지용)
    this.newsLog = newsFromSave(extra.newsLog); this.newsSeason = extra.newsSeason ?? null; this.savedAt = Number.isFinite(extra.savedAt) ? extra.savedAt : null;
    // 수족관: 기증한 물고기 종류 { id: true } · 종류별 가장 큰 크기(cm) · 받은 기증 기념 선물 수(예전 저장엔 없음 → 처음부터)
    this.donated = donatedFromSave(extra.donated); this.fishRecord = recordsFromSave(extra.fishRecord); this.donateGifts = Math.max(0, Math.min(DONATE_GIFTS.length, extra.donateGifts | 0));
    this.medalGifts = medalGiftsFromSave(extra.medalGifts);                       // 받은 금메달 기념 가구 수(메달은 fishRecord에서 셈 — medals.js)
    this.keep = keepFromSave(extra.keep);                                         // 간직하기: { 물건·보물 id: true } → 상인이 팔지 않음(예전 저장엔 없음)
    // 드문 하늘: 지금 떠 있는 것 { kind, t 남은 초 }(저장하지 않음 → 불러오면 끝난 것으로) · 본 횟수 · 첫눈을 본 겨울(해, 화면이 winterYear를 넣어 줌)
    this.sky = null; this.skySeen = skySeenFromSave(extra.skySeen); this.firstSnowYear = extra.firstSnowYear ?? null; this.winterYear = null;
    this.skyRnd = seededRandom(skySeed(extra.seed ?? 7, extra.time)); this.skyClock = 0; this.starClock = 0;   // 하늘만 쓰는 난수(다른 일의 순서를 바꾸지 않음. 불러올 때마다 같은 순서로 되풀이되지 않게 마을 시간을 섞음)
    // 계절 축제의 날: 이번 축제 열쇠 "해-계절"(화면이 기기 날짜로 넣어 줌, 저장 안 함) · 열리는 중인 축제 { id, t 남은 초, x, z 광장, who 함께한 갈매미 id } · 지난 축제 도장 { 열쇠: true }
    this.festKey = null; this.festival = festivalFromSave(extra.festival); this.festivals = festivalsFromSave(extra.festivals); this.festClock = 0;
    // 오늘의 부탁: 그날의 부탁 { key 실제 날짜, reqs, stamped }(화면이 setDay로 날짜를 넣어 줄 때 고름. 그 전엔 null) · 모은 도장 · 도장 가게에서 산 것 { id: 개수 }
    this.daily = null; this.stamps = Math.max(0, extra.stamps | 0); this.stampBought = stampBoughtFromSave(extra.stampBought);
    // ✨ 반짝이(sparkles.js): 지도에 있는 것 [{ id, k 물건 id, x, z, t 남은 초 }] · 다음 회차까지 쌓는 시계 · 반짝이만 쓰는 난수(다른 일의 순서를 바꾸지 않음)
    this.sparkles = []; this.sparkId = 1; this.sparkClock = SPARKLE_EVERY - SPARKLE_FIRST;
    this.sparkRnd = seededRandom(sparkleSeed(extra.seed ?? 7, extra.time));
    // 섬 꾸미기(customize.js): 놓은 덤불·꽃과 치운 소품 자리(불러오기는 fromJSON이 건물을 다시 놓은 뒤 채움) · 플레이어가 판 물 칸 · 되돌리기 표(저장 안 함)
    this.decor = CU.newDecor(); this.dug = CU.dugFromSave(extra.dug); this.undo = new Map(); this.undoSeq = 0;
    // 기온(climate.js): 지금 바깥 공기 °C(update마다 셈, 저장 안 함) · 기기 시각(화면이 넣어 주면 하루 변화를 시각으로, 없으면 낮밤만)
    this.air = CLIM.NEUTRAL_AIR; this.hour = null; this.clock = null;           // clock: 화면 시계(daylight.time, Date) — 숙박비 하룻밤 키(BK.stayKey). 없으면 기기 시계
    // 병(health.js): 병만 쓰는 난수(다른 일의 순서를 바꾸지 않음, 저장 안 함) · 30초 굴림 시계 · 기록 { sick: 마을에서 걸린 병 수 }
    this.hrnd = seededRandom(((extra.seed ?? 7) * 104729 + 31 + Math.floor(extra.time || 0)) >>> 0); this.healthClock = 0;
    this.healthStats = { sick: Math.max(0, extra.healthStats?.sick | 0) };
    for (const m of modules) {
      const def = MODULES[m.defId];
      grid.occupy(m.cells, m.id, { kind: "module", walkable: def.walkable, surface: def.surface ?? 0 });
      this.trackModule(m);
    }
  }
  /** empty: 갈매미 없이 시작. wild: 넓은 섬(자연만 + 가운데 공식은행 + 다 지은 작은 집 한 채, 갈매미 없음 → 첫 갈매미는 🥚 소환으로. 게임 화면).
   *  firstGull: 넓은 섬에 기본 갈매미를 미리 불러 둠(시험 받침). 시험은 기본값(예전 섬, 8마리 모두). */
  static create(seed = 7, rnd = Math.random, { empty = false, wild = false, firstGull = false } = {}) {
    const g = wild ? generateWildIsland(seed) : generateIsland(seed), w = new World(g.grid, g.modules, rnd, g);
    w.seed = seed; w.wild = wild; w.sparkRnd = seededRandom(sparkleSeed(seed, 0));   // 반짝이 난수는 섬 씨앗으로(생성 결과 g에는 seed가 없음)
    w.hrnd = seededRandom((seed * 104729 + 31) >>> 0);                            // 병 난수도 섬 씨앗으로
    if (wild) {
      Object.assign(w.res, { wood: 0, stone: 0, iron: 0, food: 0, fish: 0 });     // 은행 창고는 비어서 시작
      w.hungerScale = 0.48; w.seedFood = 20;                                       // 넓은 지도: 오가는 길이 멀어 배고픔을 늦춤(본섬 지름 1.3배 → 0.6 × 0.8)
      placeTownBank(w);                                                           // 가운데가 울퉁불퉁하면 가까운 평평한 자리(없으면 땅을 고름)
      const zb = w.zones.find(z => z.id === "bank"); if (zb) { const c = w.center; zb.x = c.x; zb.z = c.z - 3; }   // 이름표도 은행을 따라감
      w.placeStarterHouse();                                                       // 인구 = 집 수: 첫 갈매미가 올 집 한 채(다 지은 작은 집, 설계비 없음)
      if (firstGull) w.addUnitByName("기본");
    } else if (!empty) w.spawnUnits();
    return w;
  }
  /** 새 섬의 첫 집: 은행 옆(문이 은행 문과 같은 줄)에 가장 가까운 빈 평지에, 은행 문에서 걸어갈 수 있는 자리(난수 안 씀 → 섬 씨앗마다 같은 자리). 못 찾으면 null */
  placeStarterHouse() {
    const bank = this.bankB(), def = BUILDINGS.house; if (!bank) return null;
    const px = bank.x + BUILDINGS.bank.footprint.w + 2, pz = bank.door.z - def.footprint.d, cands = [];   // 바라는 자리: 은행 오른쪽으로 두 칸 띄움
    for (let dz = -14; dz <= 14; dz++) for (let dx = -18; dx <= 14; dx++) cands.push([Math.hypot(dx, dz), px + dx, pz + dz]);
    cands.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
    for (const [, x, z] of cands) {
      const r = checkPlacement(this.grid, def, x, z, 0, this.units); if (!r.ok || Math.abs(r.elevation - bank.elevation) > 1e-6) continue;
      if (r.cells.some(([cx, cz]) => Math.abs(cx - bank.door.x) <= 1 && Math.abs(cz - bank.door.z) <= 1)) continue;   // 은행 문 앞은 비워 둠
      const b = this.placeBuilding("house", x, z, 0, null, 1e9).building; b.hits = b.need;
      if (findPath(this.grid, bank.door.x, bank.door.z, b.door.x, b.door.z)) return b;                               // 은행 문에서 집 문까지 걸어갈 수 있어야 함
      this.removeBuilding(b.id);
    }
    return null;
  }
  /** 마을 가운데: 지도 한가운데. 넓은 섬에서 은행이 가운데에 못 놓여 옆으로 비켜 섰으면 그만큼 옮긴 곳(은행 앞 광장·소환 자리가 은행을 따라감) */
  get center() {
    const c = { x: this.grid.w / 2, z: this.grid.h / 2 }; if (!this.wild) return c;
    for (const b of this.buildings.values()) { const def = BUILDINGS[b.defId]; if (!def.bank) continue;
      c.x += b.x - (this.grid.w / 2 - Math.floor(def.footprint.w / 2)); c.z += b.z - (this.grid.h / 2 - Math.floor(def.footprint.d / 2)); break; }
    return c;
  }
  /** 이름으로 갈매미 하나를 가운데(은행 앞) 근처에 부름. */
  addUnitByName(name) {
    const i = UNITS.findIndex(u => u.name === name); if (i < 0 || this.units.some(o => o.name === name)) return null;
    const c = this.center, spot = nearestWalkable(this.grid, Math.floor(c.x), Math.floor(c.z) + 4, 8) || nearestWalkable(this.grid, Math.floor(c.x), Math.floor(c.z));
    const u = this.addUnit(UNITS[i], i, spot[0] + 0.5, spot[1] + 0.5); u.y = this.standHeight(u.x, u.z);
    this.migrateLate(); this.emit("unitAdded", u); return u;
  }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, arg) { this.noteNews(ev, arg); for (const fn of this.listeners[ev] || []) fn(arg); this.noteDaily(ev, arg); }
  // ---- 오늘의 부탁(daily.js)
  /** 실제 날짜 열쇠(YYYY-MM-DD)를 받음: 날짜가 바뀌었으면(처음이면) 새 부탁을 고름 → 나아간 것은 처음부터, 못 끝낸 부탁은 사라짐. 새로 골랐으면 true */
  setDay(key) { if (!key || this.daily?.key === key) return false; this.daily = rollDaily(key, this); return true; }
  /** 알린 일을 부탁에 셈(듣는 쪽이 다 들은 뒤에 → 부탁 알림이 그 일의 알림 뒤에 옴). 모두 끝나면 도장 하나(하루 한 번) */
  noteDaily(ev, arg) {
    const d = this.daily; if (!d) return;
    for (const req of dailyNote(d, ev, arg, this)) {
      const all = !d.stamped && dailyAllDone(d); if (all) { d.stamped = true; this.stamps++; }
      this.emit("dailyDone", { req, all, stamps: this.stamps, left: d.reqs.filter(r => r.have < r.need).length });
    }
  }
  /** 도장 가게: 도장으로 한정 가구(STAMP_SHOP)나 귀한 선물(STAMP_GIFTS)을 사서 내 가방에 넣음
   *  (가구 → 🏠 집 꾸미기에서 아무 집에나, 선물 → 내 주머니). 샀으면 true */
  buyStamp(id) {
    const item = STAMP_SHOP.concat(STAMP_GIFTS).find(s => s.id === id), cost = stampCost(item); if (!item || !cost || this.stamps < cost) return false;
    this.stamps -= cost; this.items[id] = (this.items[id] || 0) + 1; this.stampBought[id] = (this.stampBought[id] || 0) + 1;
    this.emit("stampBuy", { item }); return true;
  }
  /** 소식지에 적기(news.js가 고른 일만). 계절은 바뀔 때만: 처음 정해질 때·불러온 뒤 같은 계절은 소식이 아님. */
  noteNews(ev, arg) {
    const n = newsFor(ev, arg, this); if (!n) return;
    if (ev === "season") { const was = this.newsSeason; this.newsSeason = arg; if (!was || was === arg) return; }
    addNews(this.newsLog, this.time, n);
  }
  after(secs, fn) { this.timers.push({ t: secs, fn }); }
  /** 근처 갈매미들이 알아차릴 일(호기심): kind = building | tree | fish | drop | site */
  notice(x, z, kind, src = null) {
    const chance = { building: 0.7, tree: 0.35, fish: 0.6, drop: 0.7, site: 0.5 }[kind] ?? 0.4;
    for (const u of this.units) if (u !== src && !u.insideBuildingId && Math.hypot(u.x - x, u.z - z) < 9 && this.rnd() < chance) u.curious = { x, z, kind };
  }

  spawnUnits(names = UNITS.map(u => u.name)) {
    const r = seededRandom(99);
    UNITS.forEach((u, i) => {
      if (!names.includes(u.name)) return;
      const a = i / UNITS.length * Math.PI * 2, c = this.center, spot = nearestWalkable(this.grid, Math.floor(c.x + Math.cos(a) * 5), Math.floor(c.z + Math.sin(a) * 5));
      this.addUnit(u, i, spot[0] + 0.5, spot[1] + 0.5, r);
    });
  }
  addUnit(def, i, x, z, r = this.rnd) {
    const s = createUnitAIState(`u${i + 1}`, def.name, x, z, 0.5 + r() * 2); s.scale = def.scale;
    J.assignJob(s); s.full = 55 + r() * 35; initMind(s, r);                    // 직업·희귀도, 처음 포만감, 욕구·취향·친구
    s.coins = 0; s.inv = E.newBag(); s.home = null; s.stash = {};              // 돈·가방·내 집·소지품(잡거나 주운 것, belongings.js)
    s.loan = null; s.wageOwed = 0; s.loanRefused = false;                       // 집 대출 { left, per } · 밀린 품삯 · 금고가 비어 대출을 거절당함(bank.js)
    s.bond = 0; s.bondGifts = 0; s.petDay = 0; s.petN = 0; s.cheer = 0;                     // 나와의 정 · 받은 답례 수 · 쓰다듬은 날(마을 날짜)과 그날 횟수
    s.raw = { wood: 0, stone: 0, iron: 0 }; s.goods = { wood: 0, stone: 0, iron: 0 };   // 상인: 사 들인 원자재 · 가공한 물건
    s.clothes = []; s.wear = CLO.emptyWear();                                   // 가진 옷 · 입은 옷(clothes.js)
    if (this.economy && s.job === "merchant") this.issue(s, E.MERCHANT_START);  // 상인 창업 자금(중앙은행이 켜진 섬은 금고에서, issue)
    if (this.profiles) this.applyProfile(s);
    this.units.push(s); return s;
  }
  // ---- 인구 = 집 수(population.js): 공식은행이 있는 섬에서는 다 지은 집 한 채당 갈매미 한 마리까지만 부를 수 있음
  /** 화면용: 지금 🥚 소환할 수 있는가와 까닭(난수 안 씀).
   *  { can, count(지금 부를 수 있는 마릿수), reason(못 부를 때 한국어 글, 부를 수 있으면 ""), houses(다 지은 보통 집), gulls(보통 갈매미), free(남은 집 자리), left(아직 안 온 갈매미 수),
   *    next(다음에 올 갈매미 이름, 무작위면 null), candidates(올 수 있는 이름들), needHouse, needGiantHouse, gated(집 수 규칙이 켜진 섬인가) } */
  summonInfo() { return P.summonInfoFor(this.units, [...this.buildings.values()].filter(b => this.isDone(b)), this.economy); }
  /** 🥚 소환: 아직 마을에 없고 지금 올 수 있는(집 자리가 있는) 갈매미 하나를 광장 근처에 부름. 꼭 필요한 직업(건축가 → 목수 → 상인)이 없으면 그 갈매미부터, 아니면 무작위.
   *  못 부르면 null(집이 모자라면 "summonBlocked"를 알리고, 밖에 있는 갈매미 하나가 말풍선으로 알려 줌) */
  summon() {
    const info = this.summonInfo();
    if (!info.can) {
      if (info.left) { const who = this.units.find(u => !u.insideBuildingId); if (who) emote(who, info.needHouse ? "🏠 집이 더 있어야 친구가 와요" : "🏯 자이언트는 큰 집이 있어야 와요", 2.6); this.emit("summonBlocked", info); }
      return null;
    }
    const name = info.next ?? info.candidates[Math.floor(this.rnd() * info.candidates.length)], i = UNITS.findIndex(d => d.name === name), def = UNITS[i];
    let spot = null;
    const c = this.center, d0 = this.wild ? 4 : 1;                                   // 넓은 섬은 은행 앞쪽
    for (let k = 0; k < 20 && !spot; k++) { const a = this.rnd() * Math.PI * 2, d = d0 + this.rnd() * 3; spot = nearestWalkable(this.grid, Math.floor(c.x + Math.cos(a) * d), Math.floor(c.z + 3 + Math.sin(a) * d), 4); }
    if (!spot) return null;
    const u = this.addUnit(def, i, spot[0] + 0.5, spot[1] + 0.5);
    u.y = this.standHeight(u.x, u.z); emote(u, "안녕!", 2.2);
    for (const o of this.units) if (o !== u && !o.insideBuildingId && Math.hypot(o.x - u.x, o.z - u.z) < 9) o.curious = { x: u.x, z: u.z, kind: "drop" };   // 둘레 갈매미가 쳐다봄
    this.migrateLate(); this.emit("unitAdded", u); return u;
  }

  /** 모델 정보(web/village/models/chars.json)로 몸 크기와 걷기·달리기 속도(칸/초)를 맞춘다. */
  applyCharacterProfiles(chars, walkScale, runScale) {
    this.profiles = { chars, walkScale, runScale };                              // 나중에 소환되는 갈매미에도 씀
    this.units.forEach(u => this.applyProfile(u));
  }
  applyProfile(u) {
    const { chars, walkScale, runScale } = this.profiles, i = UNITS.findIndex(d => d.name === u.name);
    const c = chars.find(c => c.name === u.name) || chars[Math.max(0, i) % chars.length]; if (!c) return;
    u.name = c.name; u.scale = c.scale; u.height = c.height * c.scale; J.assignJob(u);
    u.walkSpeed = c.walk * walkScale * c.scale * SPEED_BOOST; u.runSpeed = c.run * runScale * c.scale * SPEED_BOOST;
  }

  // ---- 씨앗(잔디밭에서 쪼아 먹음)
  addSeed(x = null, z = null) {
    return null;                                                                  // 씨앗은 없앰(음식은 농부·어부·바닷가). 아래는 예전 코드
    for (let k = 0; k < 40 && x === null; k++) {                         // 가운데 평야의 빈 잔디 칸
      const span = this.grid.w * (this.wild ? 0.8 : 0.32), gx = Math.floor(this.grid.w / 2 - span / 2 + this.rnd() * span), gz = Math.floor(this.grid.h / 2 - span / 2 + this.rnd() * span), c = this.grid.get(gx, gz);   // 넓은 섬은 섬 전체 잔디밭
      if (c && !c.occupiedId && !this.grid.isWater(gx, gz) && c.elevation === 0 && !this.seeds.some(s => s.x === gx && s.z === gz)) { x = gx; z = gz; }
    }
    if (x === null) return null;
    const s = { id: this.seedId++, x, z, ox: 0.2 + this.rnd() * 0.6, oz: 0.2 + this.rnd() * 0.6, claimed: null };
    this.seeds.push(s); this.emit("seedAdded", s); return s;
  }
  eatSeed(s, u = null) {
    const i = this.seeds.indexOf(s); if (i < 0) return false;
    if (u) u.full = Math.min(J.FULL_MAX, (u.full ?? 80) + (this.seedFood ?? 12));
    this.seeds.splice(i, 1); this.res.eaten++; this.emit("seedRemoved", s);
    return true;
  }

  // ---- 밥: 음식 1을 먹으면 포만감 +35(음식이 넉넉하면 배가 덜 고파도 먹어서 너무 부를 수 있음)
  eatFood(u) {
    if (this.economy && u.inv) {                                                     // 경제가 있으면 자기 가방에서(음식 +35, 물고기 +30)
      const k = u.inv.food > 0 ? "food" : u.inv.fish > 0 ? "fish" : null; if (!k) return false;
      u.inv[k]--; u.full = Math.min(J.FULL_MAX, (u.full ?? 80) + (k === "food" ? 35 : 30)); this.emit("ate", u); return true;
    }
    if (this.res.food < 1) return false;
    this.res.food--; u.full = Math.min(J.FULL_MAX, (u.full ?? 80) + 35); this.emit("ate", u); return true;
  }

  // ---- 경제: 공식은행(발행)·시장(회수)·물물교환
  get economy() { return !!this.bankB(); }
  bankB() { for (const b of this.buildings.values()) if (BUILDINGS[b.defId].bank && this.isDone(b)) return b; return null; }
  marketB() { for (const b of this.buildings.values()) if (BUILDINGS[b.defId].market && this.isDone(b)) return b; return null; }
  /** 얻은 물건: 경제가 있으면 그 갈매미 가방, 없으면(예전 섬) 마을 창고 */
  gain(u, item, n) {
    if (this.economy && u && u.inv) { u.inv[item] = (u.inv[item] || 0) + n; if (n > 0 && MON.MADE_VAL[item] && this.bank.mon) this.bank.mon.made += MON.MADE_VAL[item] * n; }   // 만든 물건(물가 식의 분모, monetary.js)
    else this.res[item] = (this.res[item] || 0) + n;
  }
  /** 은행이 갈매미에게 주는 돈. 중앙은행이 켜진 섬은 새로 찍지 않고 금고에서(있는 만큼, 장부 grant), 꺼진 예전 규칙만 새 돈. 실제로 준 돈을 돌려줌 */
  issue(u, coins) {
    if (this.monOn()) return this.payOut(u, coins, "grant");
    u.coins = (u.coins || 0) + coins; this.bank.issued += coins; return coins;
  }
  /** 금고 → 갈매미. key: 장부 칸 "buy"(물건을 사 줌) | "grant"(축하금 등). keep: 금고에 품삯·설계비 몫(BUY_KEEP × P)을 남기고 그 위로만(플레이어가 누르는 🎁 나눠주기만 false). 실제로 낸 돈 */
  payOut(u, coins, key = "grant", keep = true) {
    const bk = this.bank, n = Math.max(0, Math.min(Math.floor(coins || 0), Math.floor(bk.vault - (keep ? this.vaultKeep() : 0)))); if (!(n > 0)) return 0;
    bk.vault -= n; if (key === "buy") bk.bought += n; else bk.granted += n; this.led(key, n); u.coins = (u.coins || 0) + n; this.checkLow(); return n;
  }
  /** 설계비 내기(b.fee): 금고에서. 중앙은행이 켜진 섬은 지을 갈매미(feeTaker)에게 가서 마을로 돎(MON-5: 없어지면 찍지 않는 섬의 돈이 줄기만 함). 꺼진 예전 규칙은 그냥 나감 */
  payFee(b) {
    if (!b?.fee) return; const bk = this.bank; bk.vault -= b.fee; bk.fees += b.fee; this.led("fees", b.fee);
    if (this.monOn()) { b.feeHeld = true; if (this.isDone(b)) this.releaseFee(b); }   // 중앙은행: 공사가 시작될 때(첫 망치질·첫 재료) 건축가에게 감 — 그 전 ↶ 되돌리기·철거는 맡아 둔 설계비를 그대로 금고로(정확, 갈매미 주머니를 건드리지 않음)
    this.emit("fee", { b, fee: b.fee }); this.checkLow();
  }
  /** 맡아 둔 설계비(b.feeHeld)를 지을 갈매미(feeTaker)에게: 공사가 실제로 시작될 때(hammer · 재료 쓰기 unitBrain.useMaterials · ⚡ 바로 완공). 받은 갈매미 이름은 b.feeTo(철거 때 그 갈매미에게서만 되돌려 받음) */
  releaseFee(b) {
    if (!b?.feeHeld) return; if (!b.fee) { b.feeHeld = false; return; }
    const t = this.feeTaker(b.defId); if (!t) return;                               // 갈매미가 하나도 없으면 계속 맡아 둠(돈이 사라지지 않게)
    t.coins = (t.coins || 0) + b.fee; b.feeTo = t.name; b.feeHeld = false;
  }
  /** 금고가 맡아 둔(아직 건축가에게 안 간) 설계비 합: 돈의 합 M = 금고 + 주머니 + 예금 + 밀린 품삯 + 주문 공사 맡긴 돈 + 이것 */
  feesHeld() { let n = 0; for (const b of this.buildings.values()) if (b.feeHeld) n += b.fee || 0; return n; }
  /** 설계비를 받는 갈매미: 그 건물을 짓는 직업(builtBy) → 건축가·목수 → 첫 갈매미 */
  feeTaker(defId) { const job = BUILDINGS[defId]?.builtBy || "builder"; return this.units.find(u => u.job === job) || this.units.find(u => u.job === "builder" || u.job === "carpenter") || this.units[0] || null; }
  merchantU() { return this.units.find(u => u.job === "merchant") || null; }
  /** 시장: 원자재(나무·돌·철)를 상인에게 팖. 상인 돈이 허락하는 만큼. */
  sellToMarket(u) {
    const m = this.merchantU(), items = { wood: 0, stone: 0, iron: 0 }; let coins = 0;
    if (!this.marketB() || !m || m === u) return { items, coins };
    for (const k of E.RAW) {
      const price = this.prices[k] ?? this.rawBase(k), n = Math.min(u.inv[k] || 0, Math.floor((m.coins || 0) / price)); if (!n) continue;
      const c = n * price; u.inv[k] -= n; m.raw[k] += n; m.coins -= c; u.coins = (u.coins || 0) + c; items[k] = n; coins += c;
    }
    this.emit("market", { u, kind: "sell", items, coins }); return { items, coins };
  }
  /** 상인: 사 들인 원자재를 가공(목재·석재·철괴). 가공한 개수를 돌려줌. */
  processRaw(m) { let n = 0; for (const k of E.RAW) { const c = m.raw[k] || 0; m.raw[k] = 0; m.goods[k] = (m.goods[k] || 0) + c; n += c; } return n; }
  /** 상인: 가공품을 공식은행에 팖 → 새 돈, 은행 창고(공사 재료)로 */
  sellProcessed(m) {
    if (this.monOn()) return this.sellProcessedMon(m);
    let coins = 0; const items = { ...m.goods };
    for (const k of E.RAW) { const n = m.goods[k] || 0; if (!n) continue; coins += n * E.BANK_PROCESSED[k]; this.res[k] = (this.res[k] || 0) + n; m.goods[k] = 0; }
    if (coins) this.issue(m, coins);
    this.emit("bank", { u: m, items, coins }); return { items, coins };
  }
  /** 중앙은행 판 가공품 매입(금고에서 냄, 새로 찍지 않음): 오늘 남은 예산과 금고 여윳돈(금고 − BUY_KEEP × P) 안에서만. 못 사는 가공품은 상인 가방에 남아 다음 날 팖 */
  sellProcessedMon(m) {
    const mon = this.bank.mon, items = { wood: 0, stone: 0, iron: 0 }, left0 = this.monLeft(); let left = this.buyLeft(), coins = 0;
    for (const k of [...E.RAW].sort((a, b) => (this.res[a] || 0) - (this.res[b] || 0))) {   // 창고에 적은 것부터(늘 나무부터 사면 예산이 작은 날 돌이 안 들어와 공사가 멈춤: 검토 시뮬 2일마다 100 찍기 씨앗 17, 25일째 상인 가방 석재 2,765개·창고 돌 0)
      const n = m.goods[k] || 0, price = this.procPrice(k), can = Math.min(n, Math.floor(left / price)); if (!(can > 0)) continue;
      items[k] = can; coins += can * price; left -= can * price; this.res[k] = (this.res[k] || 0) + can; m.goods[k] -= can;
    }
    mon.left = left0 - coins; mon.used += coins;
    if (coins) this.payOut(m, coins, "buy");
    if (!mon.flags.cap && left < Math.min(...E.RAW.map(k => this.procPrice(k)))) { mon.flags.cap = 1; this.emit("capFull", { cap: mon.cap }); }
    this.emit("bank", { u: m, items, coins }); return { items, coins };
  }
  /** 상인 AI(unitBrain chooseNext): 은행에 가도 될까 = 가방의 가공품 중 오늘 남은 예산·금고 여윳돈으로 1개라도 살 수 있는 게 있음(없으면 헛걸음하지 않고 다음 날 팖) */
  bankCanBuy(u) {
    if (!(E.total(u?.goods) > 0)) return false; if (!this.monOn()) return true;
    const left = this.buyLeft(); return E.RAW.some(k => (u.goods[k] || 0) > 0 && this.procPrice(k) <= left);
  }
  /** 금고가 저절로 나가는 돈(매입·이자·축하금)을 내고도 남기는 돈 = BUY_KEEP × P(중앙은행이 꺼졌으면 0) */
  vaultKeep() { return this.monOn() ? MON.BUY_KEEP * this.bank.mon.P : 0; }
  /** 지금 가공품을 살 수 있는 돈 = min(오늘 남은 예산, 금고 − BUY_KEEP × P) */
  buyLeft() { return MON.payableOf(this.monLeft(), this.bank.vault, this.bank.mon.P); }
  /** 농부·어부에게서 음식 1개 사기(파는 쪽은 먹을 것 FOOD_KEEP개는 남김) */
  buyFoodFrom(buyer, seller) {
    const price = this.foodPrice();
    if (!E.isProducer(seller) || seller === buyer || E.meals(seller) <= E.FOOD_KEEP || (buyer.coins || 0) < price) return false;
    const k = seller.inv.food > 0 ? "food" : "fish"; seller.inv[k]--; buyer.inv[k]++;
    buyer.coins -= price; seller.coins = (seller.coins || 0) + price;
    this.emit("foodSale", { buyer, seller, k, price }); return true;
  }
  /** (예전 방식) 공식은행에 팔기: 자재 전부 + 남는 먹을 것 → 새 돈, 물건은 은행 창고로 */
  sellToBank(u) {
    const items = E.sellable(u), coins = E.valueOf(items);
    for (const k of E.ITEMS_ORDER) { if (!items[k]) continue; u.inv[k] -= items[k]; this.res[k] = (this.res[k] || 0) + items[k]; }
    if (coins) this.issue(u, coins);
    this.emit("bank", { u, items, coins }); return { items, coins };
  }
  /** 공사 한 바퀴 품삯: 금고에서(새로 찍지 않음). 금고가 모자라거나 이미 밀린 게 있으면 밀림(일은 계속) → 금고에 돈이 들어오면 나눠 갚음.
   *  b가 갈매미 주문 공사(b.order)면 금고가 아니라 주문한 갈매미 돈에서(payOrder), 다 지었으면 남은 돈을 돌려줌 */
  payWage(u, b = null) {
    if (!this.economy || !u) return;
    const WG = this.wage();                                                        // 품삯 = round(2 × 물가)
    if (b?.order || b?.orderBy != null) { const n = this.payOrder(b, WG); u.coins = (u.coins || 0) + n; if (b.order && this.isDone(b)) this.settleOrder(b); return; }   // 이미 정산된 주문 공사(orderBy)의 마지막 품삯도 금고가 아니라 주문한 갈매미 지갑에서
    this.settleOwed();
    if (this.bank.vault >= WG && !(u.wageOwed > 0)) { this.bank.vault -= WG; this.bank.wages += WG; this.led("wages", WG); u.coins = (u.coins || 0) + WG; this.emit("wage", { u, b, n: WG }); this.checkLow(); return; }   // wage: 금고 칩 −n·공사장 위 🪙−n(ui/vaultFx.js · 밀린 품삯 갚기는 wagePaid)
    u.wageOwed = (u.wageOwed || 0) + WG; this.bank.owed += WG;
    emote(u, "품삯이 밀렸어…", 2); this.emit("wageOwed", { u, n: WG, b }); this.vaultShort("wage", u);
  }
  /** 시장에서 낸 돈: 상인이 가판에 있으면 몫을 주고 나머지는 금고로(회수) */
  pay(u, price, part = null) {
    u.coins -= price; const m = this.units.find(o => o.job === "merchant" && o.state === UnitState.Trade);
    const cut = m && m !== u ? Math.min(price, E.COMMISSION) : 0; if (cut) m.coins = (m.coins || 0) + cut;
    this.deposit(price - cut, "returned", part);
  }

  // ---- 갈매미 주문 공사(improve.js orderDeco): 주문한 갈매미가 놓을 때 맡긴 돈(b.order.left)으로 품삯·자재값을 냄. 금고는 품삯을 내지 않음
  /** 주문 열기: 갈매미 돈에서 cost를 떼어 공사장에 맡김 */
  openOrder(b, u, cost) { cost = Math.max(0, Math.min(cost, u.coins || 0)); u.coins -= cost; b.order = { by: u.unitId, left: cost }; }
  /** 주문 공사에서 n을 냄: 맡긴 돈 먼저, 모자라면 주문한 갈매미 지갑에서(있는 만큼). 실제로 낸 돈을 돌려줌 */
  payOrder(b, n) {
    const o = b.order || (b.orderBy != null ? { by: b.orderBy, left: 0 } : null); if (!o || !(n > 0)) return 0;   // 정산이 끝난 주문(orderBy)은 맡긴 돈 0 → 지갑에서
    let paid = Math.min(n, o.left); o.left -= paid;
    if (paid < n) { const by = this.units.find(x => x.unitId === o.by), more = by ? Math.min(n - paid, Math.max(0, by.coins || 0)) : 0; if (more) { by.coins -= more; paid += more; } }
    if (paid < n) o.unpaid = (o.unpaid || 0) + (n - paid);                    // 거의 안 생김(맡긴 돈에 여유를 둠): 그만큼 덜 받음, 금고는 대신 내지 않음
    return paid;
  }
  /** 주문 공사의 자재값(시장 값 MARKET_BUY): 은행 창고에서 쓴 것은 금고로, 짓는 갈매미 가방에서 쓴 것은 그 갈매미에게 */
  orderMaterials(b, builder, mine = {}, ware = {}) {
    if (!b?.order || !this.economy) return;
    const val = o => E.RAW.reduce((s, k) => s + (o[k] || 0) * E.MARKET_BUY[k], 0);
    const w = this.payOrder(b, val(ware)); if (w) this.deposit(w);
    const m = this.payOrder(b, val(mine)); if (m && builder) builder.coins = (builder.coins || 0) + m;
  }
  /** 주문 끝(다 지음·철거): 남은 맡긴 돈을 주문한 갈매미에게 돌려줌(그 갈매미가 없으면 금고로) */
  settleOrder(b) {
    const o = b.order; if (!o) return; b.order = null; b.orderBy = o.by;       // orderBy: 정산 뒤에 치르는 품삯(다 짓고 마지막 바퀴가 끝나기 전에 날이 바뀐 경우)도 금고가 내지 않게
    if (!(o.left > 0)) return; const by = this.units.find(x => x.unitId === o.by);
    if (by) by.coins = (by.coins || 0) + o.left; else this.deposit(o.left);
  }

  // ---- 은행 금고(bank.js): 금고 = 플레이어 돈
  /** 오늘 장부 칸에 더함(최근 LEDGER_DAYS일) */
  led(key, n) {
    const d = newsDay(this.time), L = this.bank.ledger; let e = L[L.length - 1];
    if (!e || e.day !== d) { e = BK.ledgerDay(d); L.push(e); while (L.length > BK.LEDGER_DAYS) L.shift(); }
    e[key] = (e[key] || 0) + n;
  }
  /** 금고에 돈이 들어옴: kind "returned"(갈매미가 낸 돈) | "tax". part: returned 안의 몫 칸(BK.LEDGER_PARTS — house·repay·clinic·clothes·shop, 없으면 '그 밖'),
   *  장부 화면이 나눠 보이려고 적을 뿐 금고·returned 합은 몫과 상관없이 같음. 들어올 때마다 밀린 품삯부터 갚음 */
  deposit(n, kind = "returned", part = null) {
    if (!(n > 0)) return;
    this.bank.vault += n; if (kind === "tax") { this.bank.taxed += n; this.led("tax", n); } else { this.bank.returned += n; this.led("returned", n); if (BK.LEDGER_PARTS.includes(part)) this.led(part, n); }
    if (this.bank.vault >= BK.VAULT_REARM) this.bank.low = 0;
    this.settleOwed();
  }
  /** 밀린 품삯 갚기: 갈매미 순서대로 금고가 허락하는 만큼(나눠 갚기). 다 갚고 금고가 차면 바닥 사태가 끝남 */
  settleOwed() {
    const bk = this.bank; let paid = 0;
    for (const u of this.units) {
      const n = Math.min(u.wageOwed || 0, Math.floor(bk.vault)); if (!(n > 0)) continue; paid += n;
      bk.vault -= n; bk.wages += n; bk.owed -= n; this.led("wages", n); u.coins = (u.coins || 0) + n; u.wageOwed -= n;
      if (!u.insideBuildingId) emote(u, `밀린 품삯 받았다! 🪙${n}`, 2); this.emit("wagePaid", { u, n });
    }
    if (paid) this.checkLow();                                                     // 밀린 품삯을 갚아 30 아래로 내려가도 알림
    if (bk.need && (bk.vault >= bk.need || !this.units.some(u => u.loanRefused))) { bk.need = 0; for (const u of this.units) u.loanRefused = false; }   // 거절한 대출만큼 차면 다시 빌려줄 수 있음
    if (bk.short && bk.owed <= 0 && bk.vault >= BK.VAULT_LOW) { bk.short = 0; this.emit("vaultOk", { vault: Math.floor(bk.vault) }); }
  }
  /** 금고 바닥 사태(품삯 밀림, 또는 금고가 VAULT_LOW 아래일 때 대출 거절). 소식지는 사태마다 한 번. 밀린 품삯이 없고 금고가 VAULT_LOW만큼 차면 끝남 */
  vaultShort(kind, u = null) {
    const bk = this.bank;
    if (bk.short) return; bk.short = 1; this.emit("vaultShort", { kind, u });
  }
  /** 금고가 줄었을 때: VAULT_LOW 아래로 처음 내려가면 알림(VAULT_REARM만큼 차면 다시 알림) */
  checkLow() { const bk = this.bank; if (this.economy && !bk.low && bk.vault < BK.VAULT_LOW) { bk.low = 1; this.emit("vaultLow", { vault: Math.floor(bk.vault) }); } }
  /** 화면용: "ok" | "low" | "empty" */
  vaultState() { const bk = this.bank; return bk.short || bk.vault < E.WAGE ? "empty" : bk.vault < BK.VAULT_LOW ? "low" : "ok"; }
  /** 화면용: 이 건물을 놓을 때 금고에서 낼 설계비(경제가 없으면 0) */
  feeFor(defId) {
    if (!this.economy) return 0;
    if (BUILDINGS[defId]?.market && ![...this.buildings.values()].some(b => BUILDINGS[b.defId].market)) return 0;   // 첫 시장은 설계비 없음: 금고로 돈이 돌아오는 첫 건물이라, 금고가 바닥나도 빠져나올 길을 남김
    const fee = BK.scaled(BK.feeOf(defId), this.priceMult());
    return this.rescueHouse(defId, fee) ? 0 : fee;
  }
  /** 막힘 풀기(인구 = 집 수): 금고가 작은 집 설계비도 안 되고, 집이 모자라 소환이 막혀 있고, 짓는 중인 보통 집이 없으면 작은 집 한 채는 설계비 없이 놓을 수 있음.
   *  (금고 0 · 갈매미 수 = 집 수에서 영영 못 빠져나오는 일을 막음. 품삯은 그대로 금고에서 → 밀렸다가 돈이 들어오면 갚음) */
  rescueHouse(defId, fee = BK.scaled(BK.feeOf(defId), this.priceMult())) {
    if (defId !== "house" || !this.economy || this.bank.vault >= fee) return false;
    if ([...this.buildings.values()].some(b => !this.isDone(b) && BUILDINGS[b.defId].house && !BUILDINGS[b.defId].forUnit)) return false;
    return this.summonInfo().needHouse;
  }
  /** 물가에 세는 다 지은 집·시설 수(bank.js growthCounts) */
  growthCount() { let n = 0; for (const b of this.buildings.values()) if (this.isDone(b) && BK.growthCounts(BUILDINGS[b.defId])) n++; return n; }
  /** 지금 물가 배수(경제가 없으면 1). 설계비·집값에 곱함 */
  priceMult() { if (!this.economy) return 1; const g = this.growthMult(); return this.monOn() ? Math.round(g * this.bank.mon.P * 100) / 100 : g; }
  /** 마을 성장 배수(등급·집·시설 수)만: 화면의 '마을 성장'(priceInfo). 설계비·집값은 이것 × 물가 P(priceMult) */
  growthMult() { return this.economy ? BK.priceMult(this.rank, this.growthCount()) : 1; }
  /** 화면용 물가 정보: { mult, rank, n, free, rankPart, buildPart, cap, nextAt }. nextAt = 다음 집·시설 몇 채째부터 오르는지(최대면 null) */
  priceInfo() {
    const rank = this.rank || 0, n = this.growthCount(), mult = this.growthMult();
    return { mult, rank, n, free: BK.PRICE_FREE, rankPart: +BK.rankPartOf(rank).toFixed(2), buildPart: +BK.buildPartOf(n).toFixed(2),
      cap: BK.PRICE_CAP, nextAt: mult >= BK.PRICE_CAP ? null : Math.max(n, BK.PRICE_FREE) + 1 };
  }
  /** 지금 집값(물가를 곱한 값). b는 건물 또는 defId */
  housePrice(b) { const def = BUILDINGS[typeof b === "string" ? b : b?.defId]; return BK.scaled(def?.price || 30, this.priceMult()); }
  /** 집 거래 판단 { ok, price, down, loan, reason }(난수 안 씀). 값은 지금 물가로 */
  houseDeal(u, b) {
    if (this.monOn()) return BK.houseDealFor(this.housePrice(b), (u.coins || 0) + (u.saved || 0), this.bank.vault, true, MON.downShare(this.bank.mon.rate / 100, BK.LOAN_DOWN));   // 예금도 집값에 씀 · 계약금 비율은 금리를 따라감
    return BK.houseDealFor(this.economy ? this.housePrice(b) : BUILDINGS[b.defId].price || 30, u.coins, this.bank.vault, this.economy);
  }
  /** 화면용: 갈매미 대출 { left, per, days } 또는 null */
  loanInfo(u) { const l = u?.loan; return l && l.left > 0 ? { left: l.left, per: l.per, days: Math.ceil(l.left / l.per) } : null; }
  /** 대출 거절 표시(금고가 거절한 대출만큼 찰 때까지 한 마리 한 번): 말풍선 · 만족도(roads.js). 금고가 VAULT_LOW보다 적을 때만 바닥 사태(금고가 넉넉한데 비싼 집 하나가 거절된 건 사태가 아님) */
  refuseLoan(u, deal) {
    if (u.loanRefused) return; u.loanRefused = true; const bk = this.bank; bk.need = Math.max(bk.need || 0, deal.loan + BK.LOAN_RESERVE);
    emote(u, "은행에 돈이 없대…", 2.5); this.emit("loanRefused", { u, loan: deal.loan }); if (bk.vault < BK.VAULT_LOW) this.vaultShort("loan", u);
  }
  /** 마을 날이 바뀔 때 한 번(난수 안 씀): 대출 상환을 먼저 받고, 남은 돈으로 세금 */
  stepBank() {
    const bk = this.bank, d = newsDay(this.time); if (d === bk.day) return;
    const prev = bk.day; bk.day = d; if (!this.economy) return;
    const mon = this.monOn() ? bk.mon : null;
    if (mon) for (const u of this.units) if (u.loan && u.loan.left > 0) u.loan.left = Math.ceil(u.loan.left * (1 + mon.rate / 100 + 0.01));   // 대출 이자(금리 + 1%p, 갚을 때 금고로)
    for (const b of this.buildings.values()) if (b.order && this.isDone(b)) this.settleOrder(b);   // 다 지었는데 마지막 품삯 전에 일이 끊긴 주문 공사: 남은 돈 돌려줌
    let total = 0, n = 0;
    for (const u of this.units) {
      const out = !u.insideBuildingId; let said = false;
      if (u.loan) {
        const k = BK.repayOf(u.loan, u.coins);
        if (k) { u.coins -= k; u.loan.left -= k; bk.repaid += k; this.deposit(k, "returned", "repay"); }
        if (u.loan.left <= 0) { u.loan = null; emote(u, "🏠 집값 다 갚았다!", 2.4); said = true; this.emit("loanPaid", { u }); }
        else if (!k && out) { emote(u, "집값은 내일 갚을게…", 2); said = true; }
      }
      const t = BK.taxOf(u.coins); if (!t) continue;
      u.coins -= t; this.deposit(t, "tax"); total += t; n++;
      if (out && !said) emote(u, `🏦 -${t}`, 1.6);
    }
    this.emit("tax", { total, n });
    if (mon) this.stepMon(d);
  }

  // ---- 중앙은행(monetary.js): 물가 P · 🖨 하루 발행(가공품 매입 한도) · 🏦 금리(예금·대출) · 🎁 축하 나눠주기 · 🤖 자동
  /** 중앙은행 규칙이 켜졌나(경제 마을) */
  monOn() { return !!(this.economy && this.bank?.mon); }
  /** 지금 물가(경제가 없으면 1) */
  monP() { return this.monOn() ? this.bank.mon.P : 1; }
  /** 가공품 1개 매입 값(× 물가, 최소 2) */
  procPrice(k) { return this.monOn() ? MON.scaleP(E.BANK_PROCESSED[k], this.bank.mon.P, 2) : E.BANK_PROCESSED[k]; }
  /** 상인이 원자재를 사는 기본값(× 물가) — 시세(E.marketPrice)의 기준 */
  rawBase(k) { return this.monOn() ? MON.scaleP(E.MARKET_BUY[k], this.bank.mon.P, 1) : E.MARKET_BUY[k]; }
  /** 공사·의사 품삯(× 물가) */
  wage() { return this.monOn() ? MON.scaleP(E.WAGE, this.bank.mon.P, 1) : E.WAGE; }
  /** 오늘 남은 매입 한도(처음이면 단계 × 마릿수로 채움) */
  monLeft() { const m = this.bank.mon; if (m.left == null) { m.cap = MON.capOf(m.step, this.units.length); m.left = m.cap; m.used = 0; } return m.left; }
  /** 일감 없음 시간 재기(5초마다): 원자재 CARRY개 이상을 들었는데 상인 돈이 가장 싼 원자재 값보다 적음 */
  tallyJobless(dt) {
    if (!this.monOn()) return; const m = this.merchantU(); if (!m || (m.coins || 0) >= Math.min(this.prices.wood, this.prices.stone)) return;
    for (const u of this.units) if (u !== m && E.total(E.rawOf(u)) >= E.CARRY) u.jlSecs = (u.jlSecs || 0) + dt;
  }
  /** 마을 날이 바뀔 때(stepBank 끝, 난수 안 씀): 예금 이자·옮기기 → 저녁 장보기 → 물가 → (자동이면) 발행 단계 → 오늘 한도 채우기 */
  stepMon(d) {
    const bk = this.bank, mon = bk.mon, n = this.units.length, m = this.merchantU(), r = mon.rate / 100, P = mon.P;
    mon.days++;
    const usedShare = mon.cap > 0 ? mon.used / mon.cap : 1;                        // 어제 한도 중 쓴 몫(자동 와인드업 방지)
    let jl = 0; for (const u of this.units) { if ((u.jlSecs || 0) > MON.JOBLESS_SECS) { u.jlDay = d; jl++; } u.jlSecs = 0; }
    mon.jlShare = jl / Math.max(1, n);
    // 예금: 이자(금고에서, 한 마리 ICAP × P까지. 금고 여윳돈이 모자라면 같은 비율로 줄임) → 목표 쪽으로 하루에 절반씩
    const want = this.units.map(u => MON.interestOf(u.saved, r, P)), wantSum = want.reduce((a, x) => a + x, 0), pay = MON.payableOf(wantSum, bk.vault, P);
    let interest = 0;
    this.units.forEach((u, i) => {
      const it = wantSum > 0 ? Math.floor(want[i] * pay / wantSum) : 0; if (it > 0) { u.saved = (u.saved || 0) + it; interest += it; u.intDay = d; }
      const mv = MON.saveMove(u.coins, u.saved, r, P, u.job === "merchant"); if (mv) { u.saved = (u.saved || 0) + mv; u.coins -= mv; }
    });
    if (interest) { bk.vault -= interest; bk.interest += interest; this.led("interest", interest); this.checkLow(); }
    // 저녁 장보기: 여윳돈의 SHOP. 그중 SHOP_MERCHANT는 상인에게, 나머지는 은행 가게(창고 가공품을 WARE_KEEP개 넘게 있으면 그것부터)에서 → 금고(장부 evening)
    let toVault = 0;
    for (const u of this.units) {
      const s = MON.shopOf(u.coins, P, u.job === "merchant", !!m && m !== u); if (!(s.x > 0)) continue;
      let rest = s.rest, burn = 0;
      for (const k of ["wood", "stone"]) { const price = this.procPrice(k), can = Math.min(Math.floor(rest / price), Math.max(0, (this.res[k] || 0) - MON.WARE_KEEP)); if (can > 0) { this.res[k] -= can; burn += can * price; rest -= can * price; } }
      burn += rest; if (s.toM) m.coins = (m.coins || 0) + s.toM;
      u.coins -= s.toM + burn; toVault += burn; u.shopDay = d;
    }
    this.deposit(toVault, "returned", "evening");
    // 물가: 주머니 돈 ÷ (RREF × 만든 물건)을 천천히 따라감(적응 기간엔 그대로)
    const A = this.moneySupply(); mon.Yd.push(mon.made); mon.made = 0; while (mon.Yd.length > 3) mon.Yd.shift();
    const Ybar = Math.max(1, mon.Yd.reduce((a, x) => a + x, 0) / mon.Yd.length);
    mon.Pstar = MON.targetP(A, MON.yEff(Ybar, n));
    const adapting = mon.adapt > 0; if (adapting) mon.adapt--;
    mon.pi = adapting ? 0 : MON.piOf(mon.Pstar, mon.P); mon.P = MON.nextP(mon.P, mon.pi);
    if (!mon.started) { mon.started = 1; this.emit("monStart", {}); }
    // 자동: 하루 한 칸
    if (mon.auto && !adapting) {
      const i = Math.max(0, MON.STEPS.indexOf(mon.step)), k = MON.autoStep(i, mon.pi, mon.P, mon.jlShare, usedShare);
      if (k !== i) { this.emit("monAuto", { from: mon.step, to: MON.STEPS[k], up: k > i }); mon.step = MON.STEPS[k]; }
    }
    mon.cap = MON.capOf(mon.step, n); mon.left = mon.cap; mon.used = 0; mon.flags.cap = 0; mon.printed = 0;
    // 소식(사태마다 한 번)
    const f = mon.flags;
    if (mon.pi > MON.PRICEUP_AT) { if (!f.infl) { f.infl = 1; this.emit("inflation", { pi: mon.pi, P: mon.P }); } } else if (mon.pi <= MON.STABLE_PI) f.infl = 0;
    mon.downRun = mon.pi <= MON.PI_DN + 1e-9 ? mon.downRun + 1 : 0;
    if (mon.downRun >= 3) { if (!f.defl) { f.defl = 1; this.emit("deflation", { P: mon.P }); } } else if (!mon.downRun) f.defl = 0;
    mon.stableRun = !adapting && MON.stableDay(mon.pi) ? mon.stableRun + 1 : 0;
    if (mon.stableRun >= MON.STABLE_DAYS) { if (!f.stable) { f.stable = 1; this.emit("priceStable", { P: mon.P }); } } else if (!mon.stableRun) f.stable = 0;
    mon.hist.push({ d, P: Math.round(mon.P * 1000) / 1000, pi: Math.round(mon.pi * 10000) / 10000, step: mon.step, rate: mon.rate, A, saved: this.units.reduce((a, u) => a + (u.saved || 0), 0) });
    while (mon.hist.length > MON.HIST_DAYS) mon.hist.shift();
  }
  /** 🖨 하루 발행 단계를 고름(STEPS 값). 고르면 자동은 꺼짐. 다음 마을 날부터 한도에 들어감 */
  setIssue(step) {
    const mon = this.bank.mon; if (!this.monOn() || !MON.STEPS.includes(step)) return false;
    const from = mon.step; mon.step = step; mon.auto = false; if (from !== step) this.emit("monIssue", { from, to: step }); return true;
  }
  /** 🏦 금리(%) 0~RATE_MAX. 다음 마을 날 예금·이자·대출 이자에 들어감 */
  setRate(rate) {
    const mon = this.bank.mon; rate = Math.round(rate); if (!this.monOn() || !(rate >= 0 && rate <= MON.RATE_MAX)) return false;
    const from = mon.rate; mon.rate = rate; if (from !== rate) this.emit("monRate", { from, to: rate }); return true;
  }
  /** 🤖 자동 모드 켜기·끄기 */
  setAuto(on) { if (!this.monOn()) return false; this.bank.mon.auto = !!on; return true; }
  /** 🎁 축하 나눠주기(하루 한 번): 모든 갈매미에게 round(GIFT_PER × P)씩 금고에서(새로 찍지 않음). 금고가 모자라면 안 함. 나눠 준 합계(못 하면 0) */
  giftAll() {
    const mon = this.bank.mon, d = newsDay(this.time); if (!this.monOn() || mon.giftDay === d || !this.units.length) return 0;
    const per = MON.scaleP(MON.GIFT_PER, mon.P); if (this.bank.vault < per * this.units.length) return 0;
    for (const u of this.units) this.payOut(u, per, "grant", false);
    mon.giftDay = d; this.emit("monGift", { per, n: this.units.length }); return per * this.units.length;
  }
  /** 🖨 찍어내기(유일한 새 돈): n(PRINT_STEPS)만큼 금고에. 마을 하루 합 PRINT_DAY_MAX까지. 찍은 양(못 하면 0) */
  print(n) {
    const bk = this.bank, mon = bk?.mon, d = newsDay(this.time); if (!this.monOn()) return 0;
    if (mon.printDay !== d) { mon.printDay = d; mon.printed = 0; }
    if (!MON.canPrint(n, mon.printed)) return 0;
    mon.printed += n; bk.vault += n; bk.issued += n; bk.printed += n; this.led("printed", n);
    if (bk.vault >= BK.VAULT_REARM) bk.low = 0;
    this.emit("monPrint", { n, today: mon.printed, left: MON.printLeftOf(mon.printed) }); this.settleOwed(); return n;
  }
  /** 오늘 더 찍을 수 있는 양 */
  printLeft() { const mon = this.bank?.mon; if (!this.monOn()) return 0; return MON.printLeftOf(mon.printDay === newsDay(this.time) ? mon.printed : 0); }
  /** 화면용 중앙은행 숫자 */
  monInfo() {
    if (!this.monOn()) return null; const mon = this.bank.mon;
    return { P: mon.P, index: MON.priceIndex(mon.P), pi: mon.pi, Pstar: mon.Pstar, step: mon.step, rate: mon.rate, auto: mon.auto, cap: mon.cap, left: this.monLeft(), used: mon.used, adapt: mon.adapt,
      pocket: this.moneySupply(), saved: this.units.reduce((a, u) => a + (u.saved || 0), 0), giftDone: mon.giftDay === newsDay(this.time), stable: mon.stableRun >= MON.STABLE_DAYS,
      buyLeft: this.buyLeft(), printLeft: this.printLeft(), printed: this.bank.printed };
  }
  /** 밤이 끝나면(아침, 숙박 키가 바뀜) 그 밤(+ 그날 낮잠) 숙박비 합계 소식 한 줄. 들어온 돈이 0(모두 공짜)이면 조용 — 조개 없는 첫 갈매미가 손님이면 매일 "🪙0" 줄이 뜸. 합계는 저장 안 함 */
  stepLodging() {
    const t = this.lodgeTally; if (!t || t.key === this.stayKey()) return;
    this.lodgeTally = null; if (t.coins > 0) this.emit("lodging", { total: t.coins, n: t.n, free: t.free });
  }
  canBuyFood() { return false; }                                                   // 음식은 이제 농부·어부에게서 삼(buyFoodFrom)
  buyFood(u) {
    if (!this.canBuyFood(u)) return false;
    const k = (this.res.food || 0) > 0 ? "food" : "fish"; this.res[k]--; u.inv[k]++; this.pay(u, E.MARKET_FOOD);
    this.emit("market", { u, kind: "food" }); return true;
  }
  /** 이 갈매미 몸에 맞는 집인가(자이언트는 자이언트의 집, 다른 갈매미는 일반 집) */
  canFit(u, b) { const only = BUILDINGS[b.defId].forUnit; return only ? only === u.name : !Object.values(BUILDINGS).some(d => d.forUnit === u.name); }
  housesForSale(u = null) { return [...this.buildings.values()].filter(b => BUILDINGS[b.defId].house && this.isDone(b) && !b.owner && (!u || this.canFit(u, b))); }
  /** 집 사기: 집값을 다 가졌으면 현금, 아니면 계약금 + 금고 대출(houseDeal). 금고가 모자라 거절되면 표시하고 false */
  buyHouse(u, b) {
    if (!this.marketB() || b.owner || u.home || !this.canFit(u, b)) return false;
    const deal = this.houseDeal(u, b);
    if (!deal.ok) { if (deal.reason === "vault") this.refuseLoan(u, deal); return false; }
    if (u.saved > 0) { u.coins = (u.coins || 0) + u.saved; u.saved = 0; }             // 집 살 때는 예금을 다 꺼내 씀(중앙은행)
    this.pay(u, deal.down, "house");                                                    // 빌려준 돈은 곧바로 집값으로 돌아오므로 금고에는 계약금만큼 늘어남
    if (deal.loan) { u.loan = { left: deal.loan, per: BK.perOf(deal.loan) }; this.bank.lent += deal.loan; this.led("lent", deal.loan); }
    u.loanRefused = false; b.owner = u.unitId; u.home = b.id;
    for (const [id, n] of Object.entries(u.stash || {})) { const fid = stashFurniture(id); if (!fid || !(n > 0)) continue; const it = F.room(b); it.stash[fid] = (it.stash[fid] || 0) + n; delete u.stash[id]; }   // 들고 다니던 낚시 가구는 새 집 창고로
    this.emit("market", { u, kind: "house", b, down: deal.down, loan: deal.loan }); return true;
  }
  /** 같이 살 수 있는 집(homes.js): 다 지었고 주인이 있고 자리가 남은 집(2층집). u를 주면 그 갈매미 몸에 맞고 아직 집이 없을 때만 */
  housesToShare(u = null) { return u?.home ? [] : [...this.buildings.values()].filter(b => BUILDINGS[b.defId].house && this.isDone(b) && b.owner != null && HM.roomLeft(b) > 0 && (!u || (this.canFit(u, b) && !HM.livesIn(b, u)))); }
  /** 같이 살기 거래 판단(난수 안 씀): { ok, share, reason: "coins" | null }. 지금 집값의 절반(HM.shareOf)을 현금으로(대출 없음) */
  shareDeal(u, b) { const share = HM.shareOf(this.economy ? this.housePrice(b) : BUILDINGS[b.defId].price || 30), has = (u.coins || 0) + (this.monOn() ? u.saved || 0 : 0); return { ok: has >= share, share, reason: has >= share ? null : "coins" }; }   // 중앙은행: 예금도 씀(집 사기와 같음)
  /** 같이 살러 들어감: 같이 살기 값을 갈매미 돈에서 주인 돈으로(금고를 안 거침 → 돈이 생기거나 사라지지 않음). 들고 다니던 낚시 가구는 그 집 창고로 */
  moveIn(u, b) {
    if (!this.marketB() || !b || u.home || b.owner == null || HM.roomLeft(b) <= 0 || !this.canFit(u, b) || !this.isDone(b)) return false;
    const deal = this.shareDeal(u, b); if (!deal.ok) return false;
    const owner = this.units.find(o => o.unitId === b.owner);
    if (u.saved > 0 && (u.coins || 0) < deal.share) { u.coins = (u.coins || 0) + u.saved; u.saved = 0; }   // 현금이 모자라면 예금을 꺼내 씀(집 사기와 같음 · 돈의 합은 그대로)
    u.coins -= deal.share; if (owner) owner.coins = (owner.coins || 0) + deal.share; else this.deposit(deal.share, "returned", "house");   // 주인이 없을 리 없지만(위에서 봄) 그래도 돈은 사라지지 않게
    (b.mates ||= []).push(u.unitId); u.home = b.id;
    for (const [id, n] of Object.entries(u.stash || {})) { const fid = stashFurniture(id); if (!fid || !(n > 0)) continue; const it = F.room(b); it.stash[fid] = (it.stash[fid] || 0) + n; delete u.stash[id]; }
    if (owner) befriend(u, owner, 1);
    this.emit("market", { u, kind: "share", b, share: deal.share, owner }); return true;
  }
  /** 물물교환: 배고픈데 먹을 게 없는 쪽이 자재(없으면 돈)를 내고 상대의 먹을 것 하나를 받음. 일어난 일을 글로 돌려줌. */
  barter(a, b) {
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!x.inv || !y.inv || E.meals(x) > 0 || (x.full ?? 80) > 70 || E.meals(y) <= E.FOOD_KEEP - 1) continue;
      const give = E.spare(x), food = y.inv.food > 0 ? "food" : "fish";
      if (give) { x.inv[give]--; y.inv[give]++; }
      else if ((x.coins || 0) >= E.MARKET_FOOD) { x.coins -= E.MARKET_FOOD; y.coins = (y.coins || 0) + E.MARKET_FOOD; }
      else continue;
      y.inv[food]--; x.inv[food]++;
      const msg = `🔁 ${give ? E.ITEM_NAME[give] : "🪙" + E.MARKET_FOOD}↔${E.ITEM_NAME[food]}`;
      this.emit("barter", { a: x, b: y, give, food }); return msg;
    }
    return null;
  }
  /** 마을 돈 합계(갈매미들이 가진 돈) */
  moneySupply() { return this.units.reduce((s, u) => s + (u.coins || 0), 0); }
  avgFull() { return this.units.reduce((a, u) => a + (u.full ?? 80), 0) / Math.max(1, this.units.length); }

  /** 바닷가에서 먹이를 잡다가 가끔 계절 물건을 주움(그 갈매미 소지품). 주운 물건을 돌려줌 */
  beachcomb(u) {
    if (this.rnd() >= 0.2 * this.fx.item) return null;                               // 무지개가 뜨면 조금 더 잘 주움
    const list = ITEMS.filter(i => i.season && i.season === this.season && !i.gift); if (!list.length) return null;
    const it = list[Math.floor(this.rnd() * list.length)]; stashAdd(u, it.id);
    this.emit("beachcomb", { u, item: it }); this.notice(u.x, u.z, "fish", u); return it;
  }
  // ---- 계절·날씨
  /** 계절 × 날씨 효과 + 드문 하늘(item: 물건을 찾을 확률 배수, 무지개가 떠 있으면 1보다 큼) */
  get fx() { const f = S.effects(this.season, this.weather.kind); if (this.sky) f.item *= SKY_EVENTS[this.sky.kind].item; return f; }
  /** 지금 바깥 공기 기온(°C): 계절·날씨·쌓인 눈·시각(world.hour, 없으면 world.isNight) */
  airNow() { return CLIM.airTemp(this.season, this.weather.kind, this.snow, this.hour, this.isNight ?? null); }
  /** 실내 기온(°C, 화면용): 전기 들어온 집은 난방 +3. 규칙(체온)은 난방과 상관없이 늘 쾌적 범위 */
  indoorTempOf(b) { return CLIM.indoorTemp(this.air, b && this.powered(b) ? CLIM.HEAT_POWER : 0); }
  /** 갈매미가 처음 추워짐(체온이 39.0 아래로): feltCold +1(옷을 살 까닭), 마을 하루에 한 번 chill 알림 */
  noteChill(u) {
    u.feltCold = (u.feltCold || 0) + 1; const day = newsDay(this.time);
    if (u.chillDay !== day) { u.chillDay = day; this.emit("chill", { u }); }
  }
  /** 카페 코코아: 2🪙(금고로) → 체온 즉시 +0.6(40까지). 돈이 모자라면 그냥 몸만 녹임. 샀으면 true */
  buyCocoa(u) {
    const price = CLIM.COCOA_PRICE; if ((u.coins || 0) < price) return false;
    u.coins -= price; this.deposit(price, "returned", "shop"); u.bodyT = Math.min(CLIM.BODY_NORMAL, (u.bodyT ?? CLIM.BODY_NORMAL) + CLIM.COCOA_WARM);
    this.emit("cocoa", { u, price }); return true;
  }
  // ---- 옷(clothes.js): 잡화점에서 자기 돈으로 사거나(금고로) 도장 가게 선물 "손뜨개 목도리"로 받음
  /** 입은 옷의 보온(°C, 체감에 더함) */
  warmthOf(u) { return CLO.warmthOf(u); }
  /** 지금 기온에 맞게 갈아입힘(난수 안 씀). 바꿨으면 dress 알림, 새로 입은 옷이 있으면 말풍선. 바꿨으면 true */
  dressUnit(u) {
    if (!u.clothes?.length && !u.wear) return false;
    const r = CLO.dress(u, this.air); if (!r.changed) return false;
    this.emit("dress", { u, put: r.put }); if (r.put.length && !u.insideBuildingId) emote(u, CLOTHES[r.put[0]].say, 2); return true;
  }
  /** 잡화점에서 옷 사기: 잡화점이 있고 아직 없는 옷이고 돈이 있으면 → 낸 돈은 금고로(돌아온 돈), 추웠던 횟수는 0으로(다음 옷은 다시 추워 봐야 삼), 바로 갈아입음. 샀으면 true */
  buyClothes(u, id) {
    const def = CLOTHES[id]; if (!def || !this.shopB() || (u.clothes || []).includes(id) || (u.coins || 0) < def.price) return false;
    u.coins -= def.price; this.deposit(def.price, "returned", "clothes"); (u.clothes ||= []).push(id); u.feltCold = 0;
    this.emit("buyClothes", { u, id, price: def.price }); this.dressUnit(u); return true;
  }
  /** 옷 선물(손뜨개 목도리): 옷장에 넣고 그 자리에 바로 입혀 줌(날이 따뜻하면 다음 갈아입기 때 벗음). 새로 받았으면 true */
  giveClothes(u, id) {
    const def = CLOTHES[id]; if (!def) return false;
    const fresh = !(u.clothes ||= []).includes(id); if (fresh) u.clothes.push(id);
    u.wear ||= CLO.emptyWear(); u.wear[def.slot] = id; u.dressT = CLO.DRESS_EVERY; this.emit("dress", { u, put: [id], gift: true }); return fresh;
  }
  // ---- 병과 갈매미 의원(health.js)
  clinics() { return [...this.buildings.values()].filter(b => BUILDINGS[b.defId].clinic && this.isDone(b)); }
  /** 의원에 누워 있는 환자 수 */
  patientsIn(b) { return this.units.filter(o => o.insideBuildingId === b.id && o.sick).length; }
  /** 빈 침대: 침대 수 − (누운 환자 + 가는 중인 환자 + 쓰러져 실려 온 갈매미) */
  bedsFree(b, except = null) { return (BUILDINGS[b.defId].beds || 0) - this.units.filter(o => o !== except && (o.sick || o.carried) && (o.insideBuildingId === b.id || (o.sick && o.targetBuildingId === b.id && o.goFor === "sick"))).length; }
  /** 이 갈매미가 갈 의원: 빈 침대가 있는 것 중 가장 가까운 것(없으면 null) */
  clinicFor(u) {
    const d = b => Math.hypot(b.door.x + 0.5 - u.x, b.door.z + 0.5 - u.z);
    return this.clinics().filter(b => this.bedsFree(b, u) > 0).sort((a, b) => d(a) - d(b))[0] || null;
  }
  /** 당번 의사 갈매미(없으면 null) */
  doctorOf(b) { return b?.doctor ? this.units.find(o => o.name === b.doctor) || null : null; }
  /** 당번 의사가 지금 의원 안에 있나(있으면 그 갈매미) */
  doctorIn(b) { const d = this.doctorOf(b); return d && d.insideBuildingId === b.id && !d.sick ? d : null; }
  /** 이 갈매미가 당번인 의원(다 지은 것, 없으면 null) */
  dutyClinic(u) { return this.clinics().find(b => b.doctor === u.name) || null; }
  /** 당번 의사 정하기(플레이어가 의원 카드에서): unitId가 null이면 당번을 비움. 한 갈매미는 한 의원만(다른 의원 당번은 풀림).
   *  돌려주는 값: { ok, reason } */
  setDoctor(clinicId, unitId) {
    const b = this.buildings.get(clinicId); if (!b || !BUILDINGS[b.defId].clinic) return { ok: false, reason: "병원이 아니에요" };
    if (unitId == null) { const was = b.doctor; b.doctor = null; if (was) this.emit("doctor", { b, u: null, was }); return { ok: true, reason: "" }; }
    const u = this.units.find(o => o.unitId === unitId || o.name === unitId); if (!u) return { ok: false, reason: "그런 갈매미가 없어요" };
    for (const o of this.buildings.values()) if (o !== b && o.doctor === u.name) o.doctor = null;
    b.doctor = u.name; emote(u, "🩺 오늘은 내가 당번!", 2.4); this.emit("doctor", { b, u }); return { ok: true, reason: "" };
  }
  /** 병에 걸림(한 번에 하나). from: 옮긴 갈매미(전염) · why: 까닭("freeze" 꽁꽁 · "wet" 젖음 · "overwork" 과로 · "spread" 옮음) */
  makeSick(u, kind = "cold", from = null, why = from ? "spread" : null) {
    if (!HL.canCatch(u)) return false;
    u.sick = HL.newSick(kind); this.healthStats.sick++;
    if (!u.insideBuildingId) emote(u, "🤧 에취!", 2.4);
    this.emit("sick", { u, kind, from, why, first: this.healthStats.sick === 1 }); return true;
  }
  /** 다 나음: 면역(IMMUNE_SECS) · 의원에서 당번 의사가 돌봤으면 의사 품삯(금고에서, 모자라면 밀림) */
  heal(u, where = "out") {
    const s = u.sick; if (!s) return false; u.sick = null; u.immune = HL.IMMUNE_SECS;
    const b = u.insideBuildingId && this.buildings.get(u.insideBuildingId), doc = b && BUILDINGS[b.defId].clinic ? this.doctorIn(b) : null;
    if (doc) this.payWage(doc);                                                    // 공사 품삯과 같은 규칙(E.WAGE = 2🪙)
    if (!u.insideBuildingId) emote(u, "다 나았다! ♪", 2.4);
    this.emit("healed", { u, kind: s.kind, where, doctor: doc?.name || null }); return true;
  }
  /** 지금 숙박 키(BK.stayKey): 화면 시계 · 밤인지(world.isNight, 모르면 18시~6시를 밤으로) */
  stayKey() { const d = this.clock || new Date(), h = d.getHours(); return BK.stayKey(d, this.isNight ?? (h < 6 || h >= 18)); }
  /** 손님 숙박비: 집 없는 갈매미가 주인 없는 다 지은 빈 집(BUILDINGS.house, 자기 집 아님)에 자러 들어옴 → 하룻밤(stayKey)에 한 번 BK.LODGING_FEE를
   *  갈매미 돈에서 금고로(가진 만큼, 없으면 무료 — 진료비와 같음). 같은 밤 깼다 다시 자도 한 번만(u.lodgeNight). 경제 없는 섬·자기 집은 무료. 낸 돈(안 걷으면 −1) */
  lodge(u, b) {
    if (!this.economy || !u || !b || b.owner || b.id === u.home || !BUILDINGS[b.defId]?.house) return -1;
    const key = this.stayKey(); if (u.lodgeNight === key) return -1; u.lodgeNight = key;
    const fee = Math.min(BK.LODGING_FEE, Math.max(0, Math.floor(u.coins || 0))); if (fee) { u.coins -= fee; this.deposit(fee, "returned", "lodging"); }
    const t = this.lodgeTally?.key === key ? this.lodgeTally : (this.lodgeTally = { key, n: 0, free: 0, coins: 0 }); t.n++; t.coins += fee; if (!fee) t.free++;
    u.lodgeSay = fee ? `🏠 숙박비 🪙${fee}` : "🏠 조개가 없어도 재워 준대요 ♪"; emote(u, u.lodgeSay, 2.4);
    return fee;
  }
  /** 의원 접수: 진료비(가진 만큼, 없으면 무료) → 금고, 당번 의사가 있으면 약 */
  clinicCheckIn(u, b) {
    if (!u.sick || !b) return;
    const fee = Math.min(HL.CLINIC_FEE, Math.max(0, Math.floor(u.coins || 0))); if (fee) { u.coins -= fee; this.deposit(fee, "returned", "clinic"); }
    const med = this.doctorIn(b) ? this.giveMedicine(u) : 0;
    this.emit("clinicVisit", { u, fee, medicine: med });
  }
  /** 쓰러져 병원에 실려 옴(unitBrain afterFaint): 진료비는 접수와 같은 규칙(가진 만큼, 없으면 무료) → 금고 · 감기도 앓고 당번 의사가 있으면 약. 낸 진료비 */
  faintCarried(u, b) {
    const fee = Math.min(HL.CLINIC_FEE, Math.max(0, Math.floor(u.coins || 0))); if (fee) { u.coins -= fee; this.deposit(fee, "returned", "clinic"); }
    const med = u.sick && this.doctorIn(b) ? this.giveMedicine(u) : -1;
    this.emit("faintCarried", { u, b, fee, medicine: med }); return fee;
  }
  /** 약(당번 의사가 있을 때, 한 번 앓을 때 한 번): 값은 가진 만큼(없으면 무료) → 금고. 낸 값을 돌려줌(못 먹였으면 −1) */
  giveMedicine(u) {
    if (!u.sick || u.sick.med) return -1;
    const price = Math.min(HL.MEDICINE_PRICE, Math.max(0, Math.floor(u.coins || 0))); if (price) { u.coins -= price; this.deposit(price, "returned", "clinic"); }
    HL.takeMedicine(u.sick); return price;
  }
  /** 당번 의사가 의원에 들어옴: 누운 환자 중 약을 안 먹은 갈매미에게 약 */
  doctorArrived(doc, b) { for (const o of this.units) if (o.insideBuildingId === b.id && o.sick && !o.sick.med) this.giveMedicine(o); emote(doc, "🩺", 2); }
  /** 30초마다(hrnd만 씀): 꽁꽁인 갈매미 감기 굴림 → 밖에 있는 감기 갈매미 둘레 전염 굴림. 동시 환자는 sickCap까지 */
  stepHealth(dt) {
    if ((this.healthClock += dt) < HL.HEALTH_EVERY) return; this.healthClock = 0;
    const cap = HL.sickCap(this.units.length); let n = this.units.filter(u => u.sick).length;
    for (const u of this.units) {
      if (n >= cap) return;
      if (u.insideBuildingId || u.state === UnitState.Held || !HL.canCatch(u)) continue;
      if ((u.bodyT ?? CLIM.BODY_NORMAL) <= CLIM.FREEZE_AT) { if (this.hrnd() < HL.FREEZE_CHANCE && this.makeSick(u, "cold", null, "freeze")) n++; }
      else if (!u.sailing) { const r = HL.chillRisk(u, CLIM.COLD_AT); if (r && this.hrnd() < r.p && this.makeSick(u, "cold", null, r.why)) n++; }   // 젖은 채 · 오래 일해서(추운 날 밖)
    }
    for (const src of this.units.filter(u => u.sick && u.insideBuildingId)) {                      // 같은 건물 안(의원 빼고)에서 조금 옮음
      const b = this.buildings.get(src.insideBuildingId); if (!b || BUILDINGS[b.defId].clinic) continue;
      for (const o of this.units) {
        if (n >= cap) return;
        if (o === src || o.insideBuildingId !== src.insideBuildingId || !HL.canCatch(o)) continue;
        if (this.hrnd() < HL.INDOOR_P && this.makeSick(o, src.sick.kind, src)) n++;
      }
    }
    const out = u => !u.insideBuildingId && !u.sailing && u.state !== UnitState.Held;
    for (const src of this.units.filter(u => u.sick && out(u))) for (const o of this.units) {
      if (n >= cap) return;
      if (o === src || !out(o) || !HL.canCatch(o) || Math.hypot(o.x - src.x, o.z - src.z) > HL.CONTAGION_R) continue;
      if (this.hrnd() < HL.CONTAGION_P * (o.wear?.neck ? HL.SCARF_GUARD : 1) && this.makeSick(o, src.sick.kind, src)) n++;
    }
  }
  setSeason(s) { if (s === this.season) return; if (s !== "winter") this.firstSnowYear = null; this.season = s; this.emit("season", s); }   // 겨울이 지나가면 다음 겨울의 눈이 다시 첫눈
  setWeather(kind) {
    const prev = this.weather.kind; this.weather = { kind, t: S.weatherDuration(kind, this.wrnd) }; this.emit("weather", this.weather);
    if (kind === "snow" && this.season === "winter") this.firstSnow();
    if (kind === "clear" && (prev === "rain" || prev === "storm") && !this.isNight && this.skyRnd() < RAINBOW_CHANCE) this.startSky("rainbow");   // 낮에 비가 갠 뒤
  }
  // ---- 드문 하늘(무지개·유성우·첫눈)
  /** 이번 겨울 첫눈이면 기록하고 알림(겨울마다 한 번). force: 시험용으로 다시 알림. 알렸으면 true */
  firstSnow(force = false) {
    const year = this.winterYear ?? 0;
    if (this.firstSnowYear === "?") this.firstSnowYear = year;                      // 눈이 쌓인 채 넘어온 예전 저장: 이번 겨울 첫눈은 이미 본 것으로
    if (!force && this.firstSnowYear === year) return false;
    this.firstSnowYear = year; this.skySeen.firstSnow++; this.emit("firstSnow", { def: SKY_EVENTS.firstSnow }); this.skyLook(SKY_EVENTS.firstSnow.emote); return true;
  }
  /** 무지개·유성우를 띄움. forced(시험용 손잡이): 낮밤·날씨와 상관없이 시간이 다 될 때까지 떠 있음 */
  startSky(kind, forced = false) {
    const def = SKY_EVENTS[kind]; if (!def?.secs) return false;
    this.sky = { kind, t: def.secs, found: 0 }; if (forced) this.sky.forced = true; this.starClock = 0; this.skyClock = 0;
    this.skySeen[kind]++; this.emit("sky", { kind, def }); this.skyLook(def.emote); return true;
  }
  /** 하늘 일이 시작되면 밖에서 깨어 있는 갈매미가(마리마다 SKY_LOOK_CHANCE) 올려다봄: 쉬거나 산책하던 갈매미는 잠깐 멈춰 서고, 일하던 갈매미는 말풍선만 */
  skyLook(text) {
    for (const u of this.units) {
      if (u.insideBuildingId || u.swimming || u.sailing || [UnitState.Sleep, UnitState.Held].includes(u.state) || this.skyRnd() >= SKY_LOOK_CHANCE) continue;
      if (u.state === UnitState.Idle) u.timer = Math.max(u.timer || 0, 2.5);
      else if (u.state === UnitState.Wander) { u.activity = null; setIdle(u, this.skyRnd, this, 2.5); }   // 산책은 그만둬도 나쁜 경험이 아님
      emote(u, text, 2.5);
    }
  }
  stepSky(dt) {
    const s = this.sky;
    if (!s) {                                                                       // 맑은 밤이 이어지면 가끔 유성우
      if (this.isNight !== true || this.weather.kind !== "clear") { this.skyClock = 0; return; }
      if ((this.skyClock += dt) >= METEOR_CHECK_SECS) { this.skyClock = 0; if (this.skyRnd() < METEOR_CHANCE) this.startSky("meteor"); }
      return;
    }
    const fits = s.forced || this.weather.kind === "clear" && (s.kind === "meteor" ? this.isNight === true : !this.isNight);
    if ((s.t -= dt) <= 0 || !fits) { this.sky = null; this.emit("skyEnd", s); return; }   // 시간이 다 됐거나 날이 흐려짐·낮밤이 바뀜
    if (s.kind !== "meteor" || (this.starClock += dt) < STAR_CHECK_SECS) return;
    this.starClock = 0; const item = ITEMS.find(i => i.id === STAR_ITEM);
    for (const u of this.units) {                                                   // 깨어서 밖에 있는 야행성 갈매미가 별조각을 주움
      if (s.found >= STAR_MAX || !isNocturnal(u) || u.insideBuildingId || [UnitState.Sleep, UnitState.Held].includes(u.state) || this.skyRnd() >= STAR_CHANCE) continue;
      s.found++; stashAdd(u, item.id); emote(u, "⭐", 2.5); this.emit("starPiece", { u, item });   // 주운 갈매미의 소지품
    }
  }
  /** 눈 깊이: 겨울 눈 오는 날 약 80초에 가득, 겨울 맑은 날은 0.55까지 천천히, 비·다른 계절엔 녹음 */
  stepSnow(dt) {
    // 눈은 눈이 올 때만 쌓임(눈 1.0까지 80초, 겨울 폭풍 0.7까지 400초). 맑거나 흐린 겨울날엔 쌓인 눈이 아주 천천히 녹고(1.0이 다 녹는 데 1800초 = 마을 사흘),
    // 겨울비엔 300초, 다른 계절엔 비 30초 · 그 밖 60초에 1.0씩 녹음
    const k = this.weather.kind, winter = this.season === "winter";
    const goal = !winter ? 0 : k === "snow" ? 1 : k === "storm" ? Math.max(0.7, this.snow) : 0;
    const rate = goal > this.snow ? (k === "snow" ? 1 / 80 : 1 / 400) : !winter ? (k === "rain" ? 1 / 30 : 1 / 60) : k === "rain" ? 1 / 300 : 1 / 1800;
    this.snow += Math.sign(goal - this.snow) * Math.min(Math.abs(goal - this.snow), rate * dt);
  }
  stepWeather(dt) { if ((this.weather.t -= dt) <= 0) this.setWeather(S.pickWeather(this.season || "autumn", this.wrnd, this.weather.kind)); }

  // ---- 다리·선착장·배
  /** 공사할 때 서는 칸: 보통은 문 앞, 다리는 이미 걸을 수 있는 이웃 칸(땅이나 다 지은 다리). 없으면 null(아직 못 지음) */
  workSpot(b) {
    if (!BUILDINGS[b.defId].bridge) return b.door;
    const [x, z] = b.cells[0]; for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) if (this.grid.isWalkable(x + dx, z + dz)) return { x: x + dx, z: z + dz };
    return null;
  }
  /** 걸어서 이어진 땅 덩어리 번호(칸마다). 땅·건물이 바뀔 때만 다시 셈 */
  comps() {
    const g = this.grid; if (this._comp && this._compV === g.version) return this._comp;
    const comp = new Int32Array(g.w * g.h).fill(-1); let id = 0;
    for (let s = 0; s < comp.length; s++) {
      if (comp[s] >= 0) continue; const sx = s % g.w, sz = (s / g.w) | 0; if (!g.isWalkable(sx, sz)) continue;
      const q = [s]; comp[s] = id;
      while (q.length) { const i = q.pop(), x = i % g.w, z = (i / g.w) | 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (!g.inBounds(nx, nz)) continue; const ni = nz * g.w + nx; if (comp[ni] >= 0 || !g.canStep(x, z, nx, nz)) continue; comp[ni] = id; q.push(ni); } }
      id++;
    }
    this._comp = comp; this._compV = g.version; return comp;
  }
  compAt(x, z) { return this.grid.inBounds(x, z) ? this.comps()[z * this.grid.w + x] : -1; }
  piers() { return [...this.buildings.values()].filter(b => BUILDINGS[b.defId].pier && this.isDone(b)); }
  /** 배 길: 출발 칸 덩어리의 선착장 → 도착 칸 덩어리의 선착장(가장 가까운 것끼리). 없으면 null */
  ferryRoute(sx, sz, gx, gz) {
    const a0 = this.compAt(sx, sz), b0 = this.compAt(gx, gz); if (a0 < 0 || b0 < 0 || a0 === b0) return null;
    const ps = this.piers(), near = (list, x, z) => list.sort((p, q) => Math.hypot(p.door.x - x, p.door.z - z) - Math.hypot(q.door.x - x, q.door.z - z))[0];
    const A = near(ps.filter(p => this.compAt(p.door.x, p.door.z) === a0), sx, sz), B = near(ps.filter(p => this.compAt(p.door.x, p.door.z) === b0), gx, gz);
    return A && B ? { A, B } : null;
  }
  /** 선착장 앞 물 칸(배를 대는 곳) */
  berth(p) { const [x, z] = p.cells[0]; return { x: 2 * x - p.door.x, z: 2 * z - p.door.z }; }
  /** 두 물 칸 사이 뱃길(물 칸만, 8방향 A*). 못 찾으면 곧은 줄 */
  seaPath(a, b) {
    const g = this.grid, W = g.w, open = [[a.x, a.z, 0]], dist = new Map([[a.z * W + a.x, 0]]), from = new Map();
    const water = (x, z) => g.inBounds(x, z) && g.isWater(x, z) && (!g.get(x, z).occupiedId || BUILDINGS[this.buildings.get(g.get(x, z).occupiedId)?.defId]?.bridge);
    const h = (x, z) => Math.hypot(x - b.x, z - b.z); let n = 0;
    while (open.length && n++ < 40000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][2] + h(open[i][0], open[i][1]) < open[bi][2] + h(open[bi][0], open[bi][1])) bi = i;
      const [x, z, d] = open.splice(bi, 1)[0];
      if (x === b.x && z === b.z) { const out = []; let k = z * W + x; while (k !== undefined) { out.push([k % W, (k / W) | 0]); k = from.get(k); } return out.reverse().filter((_, i, arr) => i % 3 === 0 || i === arr.length - 1); }
      for (const [dx, dz, c] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]]) {
        const nx = x + dx, nz = z + dz; if (!water(nx, nz) && !(nx === b.x && nz === b.z)) continue;
        const k = nz * W + nx, nd = d + c; if (nd < (dist.get(k) ?? Infinity)) { dist.set(k, nd); from.set(k, z * W + x); open.push([nx, nz, nd]); }
      }
    }
    return [[a.x, a.z], [b.x, b.z]];
  }

  // ---- 실내 꾸미기: 잡화점(마을 등급 항구 마을)에서 집주인이 자기 돈으로 가구를 사서 자기 집에 놓음(낸 돈은 은행으로 = 회수)
  shopB() { for (const b of this.buildings.values()) if (b.defId === "shop" && this.isDone(b)) return b; return null; }
  buyFurniture(u, id) {
    const def = FURNITURE[id], home = u.home && this.buildings.get(u.home);
    if (!def?.price || !home || !this.shopB() || (u.coins || 0) < def.price) return false;
    u.coins -= def.price; this.deposit(def.price, "returned", "shop");
    if (!F.autoPlace(this, home, id)) { const it = F.room(home); it.stash[id] = (it.stash[id] || 0) + 1; emote(u, F.NO_ROOM_SAY, 2.4); }   // 자리가 없으면 억지로 안 놓고 창고에
    this.emit("furnitureBought", { u, id, b: home }); return true;
  }

  // ---- 전기(다 지은 풍차 발전소 둘레 POWER_RANGE칸 — 규칙은 world/power.js 한 곳). 가로등·건물 등불·집 창가 불빛·만족도 ⚡가 모두 이것을 봄
  powered(b) { return PW.powered(this, b); }
  poweredAt(x, z) { return PW.poweredAt(this, x, z); }
  aquariumB() { for (const b of this.buildings.values()) if (b.defId === "aquarium" && this.isDone(b)) return b; return null; }
  /** 수족관 기증(알림 없이): 수족관이 있고 아직 기증 안 한 희귀 이상 종류면 한 마리를 기증하고, 기념 선물(낚시 가구)이 있으면 마을 가방에 넣음.
   *  돌려주는 값: 기증했으면 이번에 받은 선물들 [{ item, gift }](없으면 빈 배열), 기증하지 않았으면 null */
  donateFish(f) {
    if (!donatable(f) || this.donated[f.id] || !this.aquariumB()) return null;
    this.donated[f.id] = true; const gifts = [];
    for (const n = giftsEarned(this.donated); this.donateGifts < n; this.donateGifts++) {
      const gift = DONATE_GIFTS[this.donateGifts], item = ITEMS.find(i => i.id === gift.item); if (!item) continue;
      this.items[item.id] = (this.items[item.id] || 0) + 1; gifts.push({ item, gift });
    }
    return gifts;
  }
  /** 기증 알림(알림 줄·소식지): 기증 한 줄 + 선물마다 한 줄. kept: 갈매미가 아껴 둔(소지품의) 물고기를 기증 */
  tellDonation(u, fish, gifts, size = null, kept = false) { this.emit("donate", { u, fish, size, kept }); for (const g of gifts) this.emit("donateGift", { ...g, count: Object.keys(this.donated).length }); }
  /** 이 갈매미가 아껴 둔(소지품의) 아직 기증 안 한 희귀 이상 물고기를 종류마다 한 마리씩 기증(수족관이 있을 때). 기증한 물고기들을 돌려줌 */
  donateFromStash(u) {
    const out = []; if (!u?.stash || !this.aquariumB()) return out;
    for (const f of FISH) {
      if (!(u.stash[f.id] > 0) || this.donated[f.id]) continue;
      const gifts = this.donateFish(f); if (!gifts) continue;
      if (!--u.stash[f.id]) delete u.stash[f.id];
      this.tellDonation(u, f, gifts, null, true); out.push(f);
    }
    return out;
  }
  /** 모든 갈매미가 아껴 둔 물고기를 기증(수족관이 다 지어졌을 때) */
  donateStashes() { for (const u of this.units) this.donateFromStash(u); }
  /** 갈매미 AI: 시장에 소지품을 팔러 가도 될까. 중앙은행이 켜진 섬은 금고 − BUY_KEEP × P로 팔 것 하나라도 살 수 있을 때만(못 사는데 가면 0개 팔고 돌아와 또 가는 헛걸음이 되풀이되어 공사를 안 맡음. 60일 시뮬 찍지 않음 씨앗 3·5·7: 이 조건이 없으면 다 지은 건물 29·짓는 중 26·물가 2.20, 있으면 60·0.67·0.70) */
  stashCanSell(u) { if (!this.monOn()) return true; const budget = this.bank.vault - this.vaultKeep(); return Object.keys(stashSellable(u)).some(id => stashPrice(id) <= budget); }
  /** 갈매미가 스스로 소지품을 팖: 먼저 수족관 기증, 그다음 팔 것(belongings.js stashSellable)을 카탈로그 값에 팖.
   *  조개는 주인에게(상인 몫 STASH_CUT/개, 상인 자신이 팔 땐 없음). 경제 마을이면 은행이 사들임(중앙은행이 켜진 섬은 금고 돈으로, 금고가 허락하는 만큼; 꺼진 예전 규칙은 새 돈)(물건은 마을 밖으로).
   *  시장(경제가 없으면 가판대)이나 상인이 없으면 아무 일 없음. 돌려주는 값: { n 판 개수, coins 판 값, cut 상인 몫, items [{ id, n }], donated [물고기] } */
  sellStash(u) {
    const m = this.merchantU(), place = this.economy ? this.marketB() : this.stall;
    if (!u || !place || !m) return { n: 0, coins: 0, cut: 0, items: [], donated: [] };
    const donated = this.donateFromStash(u), items = []; let n = 0, coins = 0;
    const mon = this.monOn(); let budget = mon ? Math.max(0, Math.floor(this.bank.vault - this.vaultKeep())) : Infinity;   // 중앙은행: 은행이 금고 돈으로 사 줌(금고 − BUY_KEEP × P 만큼만, 나머지는 소지품에 남음)
    for (const [id, k0] of Object.entries(stashSellable(u))) { const p = stashPrice(id), k = Math.min(k0, p > 0 ? Math.floor(budget / p) : k0); if (!(k > 0)) continue; budget -= p * k; coins += p * k; n += k; if (!(u.stash[id] -= k)) delete u.stash[id]; items.push({ id, n: k }); }
    const cut = m !== u ? Math.min(coins, STASH_CUT * n) : 0;
    if (cut) m.coins = (m.coins || 0) + cut;
    if (mon) { const bk = this.bank; bk.vault -= coins; bk.bought += coins; if (coins) this.led("buy", coins); this.checkLow(); }
    u.coins = (u.coins || 0) + coins - cut; if (this.economy && !mon) this.bank.issued += coins;
    if (n) this.emit("stashSale", { u, m, items, coins, cut });
    return { n, coins, cut, items, donated };
  }
  postB() { for (const b of this.buildings.values()) if (b.defId === "post" && this.isDone(b)) return b; return null; }
  // ---- 포장도로·만족도(2초마다 다시 셈)
  updateRoads() {
    const net = RD.roadNet(this); this.roads = { net };
    for (const u of this.units) { const s = RD.satisfaction(this, u, net); u.sat = s.value; u.satParts = s.parts; }
  }
  avgSat() { return this.units.reduce((a, u) => a + (u.sat ?? 50), 0) / Math.max(1, this.units.length); }
  // ---- 마을 등급
  score() { return rankScore(this); }
  stepRank() {
    const s = rankScore(this).score;
    while (this.rank < RANKS.length - 1 && s >= RANKS[this.rank + 1].need) {
      this.rank++; if (this.economy) for (const u of this.units) this.issue(u, RANK_REWARD);
      this.emit("rank", { rank: this.rank, def: RANKS[this.rank] });
    }
  }

  // ---- 저장고(겨울 대비): 은행이 남는 음식을 사서 쌓아 두고, 배고픈 갈매미에게 시세대로 팔거나(돈 없고 아주 배고프면) 나눠 줌
  granaryB() { for (const b of this.buildings.values()) if (BUILDINGS[b.defId].storehouse && this.isDone(b)) return b; return null; }
  /** 갈매미 AI: 저장고에 음식을 팔러 가도 될까. 중앙은행이 켜진 섬은 금고 − BUY_KEEP × P로 1개(GRANARY_BUY)라도 살 수 있을 때만(못 사는데 가면 0개 팔고 문 앞에서 또 가기를 되풀이: MON-5 검토 60일 찍지 않음 씨앗 11·13·17에서 stockFood 호출 약 7만 번 중 99.9%가 0개) */
  granaryCanBuy() { return !this.monOn() || this.bank.vault - this.vaultKeep() >= E.GRANARY_BUY; }
  /** 농부·어부: 먹을 것 FOOD_KEEP+2개를 남기고 나머지를 저장고에 팖(1개 🪙GRANARY_BUY, 중앙은행이 켜진 섬은 금고에서·꺼진 예전 규칙은 새로 찍음) */
  stockFood(u) {
    let n = Math.min(E.meals(u) - (E.FOOD_KEEP + 2), E.GRANARY_MAX - this.granary); if (this.monOn()) n = Math.min(n, Math.floor(Math.max(0, this.bank.vault - this.vaultKeep()) / E.GRANARY_BUY));   // 중앙은행: 금고 돈으로 삼(금고 − BUY_KEEP × P 만큼)
    if (!this.granaryB() || n <= 0) return 0;
    const sold = n;
    for (const k of ["fish", "food"]) { const t = Math.min(u.inv[k], n); u.inv[k] -= t; n -= t; }
    this.granary += sold; if (this.monOn()) this.payOut(u, sold * E.GRANARY_BUY, "buy"); else this.issue(u, sold * E.GRANARY_BUY); this.emit("granary", { u, kind: "stock", n: sold }); return sold;
  }
  /** 저장고에서 음식 하나: 돈이 있으면 시세대로 사고(은행으로 돌아감), 없고 아주 배고프면(포만감 E.RATION_FULL 아래) 나눠 받음 */
  takeFood(u) {
    if (!this.granaryB() || this.granary <= 0) return null;
    const price = this.foodPrice();
    if ((u.coins || 0) >= price) { u.coins -= price; this.deposit(price, "returned", "shop"); this.granary--; u.inv.food++; this.emit("granary", { u, kind: "buy" }); return "buy"; }
    if ((u.full ?? 80) < E.RATION_FULL) { this.granary--; u.inv.food++; this.emit("granary", { u, kind: "free" }); return "free"; }
    return null;
  }

  // ---- 시세
  foodPrice() { return this.prices.food; }
  updatePrices() {
    const m = this.merchantU();
    for (const k of E.RAW) this.prices[k] = E.marketPrice(k, m ? (m.raw[k] || 0) + (m.goods[k] || 0) : 0, this.rawBase(k), this.procPrice(k));
    const spare = this.units.filter(E.isProducer).reduce((s, u) => s + Math.max(0, E.meals(u) - E.FOOD_KEEP), 0);
    const hungry = this.units.filter(u => (u.full ?? 80) < J.HUNGRY + 10).length / Math.max(1, this.units.length);
    this.prices.food = E.foodPriceFor(spare, hungry, this.fx.foodPrice);
    if (this.monOn()) this.prices.food = MON.scaleP(this.prices.food, this.bank.mon.P);   // 음식 값 × 물가
  }

  // ---- 친구 사이
  /** 서로 친해짐(amt만큼). 사이 단계가 오르면(서먹 → 친구 → 단짝) 둘 다 말풍선을 띄우고 알림. */
  befriend(a, b, amt) {
    const top = (this.palTop ??= {}), key = [a.name, b.name].sort().join("|"), was = Math.max(top[key] ?? 0, friendStage(affinity(a, b)));
    const stage = befriend(a, b, amt); top[key] = Math.max(was, stage);
    if (stage <= was) return 0;                                                 // 겁먹어 잠깐 멀어졌다 다시 친해진 사이는 또 알리지 않음
    const d = FRIEND_STAGES[stage]; emote(a, `${d.icon} ${d.name}!`, 3); emote(b, `${d.icon} ${d.name}!`, 3);
    this.emit("friendship", { a, b, stage }); return stage;
  }

  // ---- 나와의 정: 간직하기 · 선물 · 쓰다듬기 · 답례(bond.js)
  /** 간직하기 켜고 끄기(선물할 수 있는 물건·보물만). 켜 두면 상인이 팔지 않음. 바뀐 뒤의 값을 돌려줌 */
  toggleKeep(id) { if (!giftDef(id)) return false; if (this.keep[id]) delete this.keep[id]; else this.keep[id] = true; return !!this.keep[id]; }
  /** 정을 올리고, 하트 단계에 처음 닿았으면 답례를 남김(단계마다 한 번). 돌려주는 값: 이번에 받은 답례들 [{ stage, gift }] */
  addBond(u, amt) {
    u.bond = Math.min(BOND_MAX, (u.bond || 0) + amt); const got = [];
    for (const top = bondStage(u.bond); (u.bondGifts || 0) < top;) {
      const stage = u.bondGifts = (u.bondGifts || 0) + 1, home = u.home && this.buildings.get(u.home), gift = thanksFor(stage, !!home);
      if (gift?.kind === "furniture") { const it = F.room(home); it.stash[gift.id] = (it.stash[gift.id] || 0) + 1; gift.where = BUILDINGS[home.defId].name; }
      else if (gift) { this.items[gift.id] = (this.items[gift.id] || 0) + 1; if (giftDef(gift.id)) this.keep[gift.id] = true; }   // 답례로 받은 물건은 팔리지 않게 간직
      got.push({ stage, gift }); this.emit("bondStage", { u, stage, gift });
    }
    return got;
  }
  /** 선물 주기: 내 주머니의 선물거리(가구 빼고)나 예전 저장에 남은 보물 물고기 하나를 건넴 → 정·재미가 오르고 취향에 따라 세 가지 반응.
   *  도장 선물(ITEMS의 stampGift)이면 오르는 정이 STAMP_GIFT_BOND배.
   *  돌려주는 값: { item, tier(0 꺼림 · 1 보통 · 2 좋아함), say, bond, thanks } 또는 null(줄 수 없음) */
  giveGift(u, id) {
    const item = giftDef(id), bag = item?.kind === "fish" ? this.treasures : this.items;
    if (!u || !item || !this.units.includes(u) || !((bag[id] || 0) > 0)) return null;
    bag[id]--; if (!bag[id]) delete this.keep[id];                            // 마지막 하나를 건넸으면 간직 표시도 지움(가방에 없으면 끌 단추가 안 보이므로)
    const tier = giftTier(u.name, id), t = GIFT_TIERS[tier];
    if (u.needs) u.needs.fun = Math.min(100, u.needs.fun + t.fun);
    emote(u, t.say, 2.4); this.emit("gift", { u, item, tier });
    if (item.clothes) this.giveClothes(u, item.clothes);                        // 손뜨개 목도리: 그 갈매미 옷이 되어 바로 둘러 줌
    const thanks = this.addBond(u, t.bond * (item.stampGift ? STAMP_GIFT_BOND : 1));
    return { item, tier, say: t.say, bond: u.bond, thanks };
  }
  /** 쓰다듬기: 정·재미가 조금 오름. 갈매미마다 마을 하루에 PET_DAILY번까지(실제 시계가 아니라 마을 날짜).
   *  돌려주는 값: { ok, left: 오늘 남은 횟수, thanks } · 못 했으면 { ok: false, reason: "cap" | "away" } */
  pet(u) {
    if (!u || !this.units.includes(u) || u.insideBuildingId || u.state === UnitState.Held || u.sailing) return { ok: false, reason: "away" };
    const day = newsDay(this.time);
    if (!petsLeft(u, day)) return { ok: false, reason: "cap", left: 0 };
    if (u.petDay !== day) { u.petDay = day; u.petN = 0; }
    u.petN++; if (u.needs) u.needs.fun = Math.min(100, u.needs.fun + PET_FUN);
    emote(u, bondStage(u.bond) >= 2 ? "♥ 좋아" : "♥", 1.6);
    const thanks = this.addBond(u, PET_BOND); this.emit("pet", { u });
    return { ok: true, left: PET_DAILY - u.petN, thanks };
  }

  // ---- 계절 축제의 날(festival.js)
  /** 축제 소원을 올림: 이번 계절 축제를 아직 안 열었고 마을 등급이 되면 한 번(소원 2개 제한과 따로). 난수를 쓰지 않음(소원이 없는 갈매미 중, 없으면 모두 중에서 마을 시간으로 고름) */
  wishFestival() {
    const key = this.festKey;
    if (!festivalOf(key) || this.festivals[key] || this.festival || this.rank < FESTIVAL_RANK || this.wishes.some(x => x.id === "festival")) return null;
    const idle = this.units.filter(u => !this.wishOf(u)), free = idle.length ? idle : this.units; if (!free.length) return null;   // 모두 소원이 있으면(갈매미가 한두 마리뿐인 마을) 아무나 하나 더 빎
    const u = free[Math.floor(this.time) % free.length], wish = { id: "festival", unitId: u.unitId, base: key, had: festiveCount(this), age: 0 };
    this.wishes.push(wish); emote(u, "💭 🎉", 3); this.emit("wish", { wish, u }); return wish;
  }
  /** 축제를 엶(광장이 있어야 함). 밖에서 깨어 있는 갈매미가 환호함. 열었으면 true */
  startFestival(key = this.festKey) {
    const f = festivalOf(key), plaza = festivalPlaza(this); if (!f || this.festival || plaza.x === null) return false;
    this.festival = { id: key, t: FESTIVAL_SECS, x: plaza.x, z: plaza.z, who: [] };
    for (const u of this.units) if (!u.insideBuildingId && ![UnitState.Sleep, UnitState.Held].includes(u.state)) emote(u, `🎉 ${f.def.icon}`, 3);
    this.emit("festival", { key, def: f.def, festival: this.festival }); return true;
  }
  /** 축제를 마침: 함께한 갈매미는 여운(만족도 덤)이 남고, 마을 가방에 그 계절 기념 가구 하나. 그 계절 도장을 찍어 다시 열리지 않음 */
  endFestival() {
    const fest = this.festival, f = fest && festivalOf(fest.id); if (!f) { this.festival = null; return false; }
    this.festival = null; this.festivals[fest.id] = true;
    const joined = this.units.filter(u => fest.who.includes(u.unitId));
    for (const u of joined) { u.cheer = FESTIVAL_CHEER_SECS; if (!u.insideBuildingId && u.state !== UnitState.Sleep) emote(u, "♥ 즐거웠어!", 3); }
    const item = festivalGift(fest.id); if (item) this.items[item.id] = (this.items[item.id] || 0) + 1;
    this.emit("festivalEnd", { key: fest.id, def: f.def, item, n: joined.length }); return true;
  }
  stepFestival(dt) {
    if (this.festival && (this.festival.t -= dt) <= 0) this.endFestival();
    if ((this.festClock += dt) < 1) return; const step = this.festClock; this.festClock = 0;
    for (const u of this.units) if (u.cheer > 0) u.cheer = Math.max(0, u.cheer - step);
    // 빈 뒤에 장식을 치웠으면 그만큼 낮춰 둠 → 흩어진 장식을 옮겨 모으거나 치웠다 다시 놓아도 "새 장식"으로 침
    const fw = this.wishes.find(x => x.id === "festival"); if (fw) fw.had = Math.min(fw.had ?? 0, festiveCount(this));
    this.wishFestival();
  }

  // ---- 소원
  wishOf(u) { return this.wishes.find(x => x.unitId === u.unitId) || null; }
  makeWish() {
    if (this.wishes.filter(x => x.id !== "festival").length >= 2 || !this.units.length) return null;   // 축제 소원은 2개 제한에 세지 않음
    const free = this.units.filter(u => !this.wishOf(u));
    for (let k = 0; k < 6 && free.length; k++) {
      const ru = free[Math.floor(this.wrnd() * free.length)], u = (k === 0 && free.find(o => dreamWishId(o, this.time))) || ru;   // 꿈속 소원(dreams.js)을 본 갈매미가 먼저 · 난수 쓰는 순서는 그대로
      const cands = WISHES.filter(d => !this.wishes.some(x => x.id === d.id) && d.ok(this, u));
      if (!cands.length) continue;
      const rd = cands[Math.floor(this.wrnd() * cands.length)], d = cands.find(c => c.id === dreamWishId(u, this.time)) || rd; u.dreamWish = null;
      const wish = { id: d.id, unitId: u.unitId, base: d.base ? d.base(this, u) : this.units.length, age: 0 };
      this.wishes.push(wish); emote(u, `💭 ${d.icon}`, 3); this.emit("wish", { wish, u }); return wish;
    }
    return null;
  }
  stepWishes(dt) {
    if ((this.wishT -= dt) <= 0) { this.wishT = (80 + this.wrnd() * 70) * (this.postB() ? 0.6 : 1); this.makeWish(); }   // 우체국: 소원이 더 자주
    if ((this.wishClock += dt) < 1) return; const step = this.wishClock; this.wishClock = 0;
    for (const wish of [...this.wishes]) {
      const u = this.units.find(o => o.unitId === wish.unitId), d = WISH_BY_ID[wish.id];
      if (!u || !d) { this.wishes.splice(this.wishes.indexOf(wish), 1); continue; }
      wish.age += step;
      if (!d.done(this, u, wish) && d.lost?.(this, u, wish)) { this.wishes.splice(this.wishes.indexOf(wish), 1); this.emit("wishLost", { wish, u, def: d }); continue; }   // 이제 이룰 수 없는 소원은 접음
      if (d.done(this, u, wish)) {
        this.wishes.splice(this.wishes.indexOf(wish), 1); this.wishDone++;
        if (this.economy) this.issue(u, WISH_REWARD * (this.postB() ? 2 : 1));   // 우체국이 있으면 축하 편지와 함께 두 배
        u.full = Math.min(J.FULL_MAX, (u.full ?? 80) + 10); emote(u, "♥ 소원 이뤘어요!", 3);
        this.emit("wishDone", { wish, u, def: d });
        if (wish.id === "festival") this.startFestival(wish.base);                // "축제 하자!"가 이루어지면 바로 축제가 열림
      } else if (Math.floor(wish.age) % 20 === 0) emote(u, `💭 ${d.icon}`, 2.5);   // 20초마다 말풍선으로 다시 알림
    }
  }

  // ---- 벌목·채광(나무꾼은 도끼질이 세서 덜 하고 많이 얻음, 광부는 돌을 많이 얻고 철이 잘 나옴)
  hitTree(t, who) {
    if (!t.alive) return;
    t.hp -= who ? 3 / J.chopsNeeded(who) : 1; this.emit("treeHit", t);
    if (t.hp > 1e-6) return;
    t.alive = false; const got = who ? J.woodYield(who) : 2; this.gain(who, "wood", got); t.lastYield = got;
    this.emit("treeFell", { tree: t, dir: [t.x + 0.5 - who.x, t.z + 0.5 - who.z] }); this.notice(t.x + 0.5, t.z + 0.5, "tree", who);
    this.after(25 + this.rnd() * 15, () => { if (t.removed) return; t.alive = true; t.hp = 3; this.emit("treeGrow", t); });   // 그사이 치운 나무(꾸미기)는 되살리지 않음
  }
  hitOre(o, who = null) {
    if (!o.alive) return;
    o.hp--; this.emit("oreHit", o);
    if (o.hp > 0) return;
    o.alive = false; const got = who ? J.stoneYield(who) : 2; this.gain(who, "stone", got); o.lastYield = got;
    o.lastIron = who && this.rnd() < J.ironChance(who) ? 1 : 0; if (o.lastIron) this.gain(who, "iron", o.lastIron);
    this.emit("oreBroke", o);
    this.after(20 + this.rnd() * 12, () => { if (o.removed) return; o.alive = true; o.hp = 3; this.emit("oreGrow", o); });
  }
  /** 낚시 결과: 못 낚음 / 물고기(흔하면 음식, 희귀 이상이면 보물) + 가끔 물건. 도감에 기록. */
  /** bonus: 찌 당기기 배율(희귀 이상 비중에 곱함, 기본 1 = 예전 그대로) */
  catchFish(u, bonus = 1) {
    const fishFx = this.fx.fish; if (fishFx <= 0) return null;                       // 폭풍: 못 낚음
    if (this.rnd() >= Math.min(0.95, J.catchChance(u) * fishFx)) return null;
    const got = this.landFish(u, this.rnd, bonus), { fish: f, item, size } = got;
    this.emit("fish", { u, fish: f, item, size }); if (f.rarity !== "common" || item) this.notice(u.x, u.z, "fish", u);
    if (got.record) this.emit("fishRecord", { u, fish: f, size, first: got.first, medal: got.medal, up: got.medal > got.prevMedal });
    for (const g of got.medalGifts) this.emit("medalGift", g);   // 크기 기록 → 기증 → 선물 순서로 알림(뒤의 것이 알림 줄에 남음)
    if (got.gifts) this.tellDonation(u, f, got.gifts, size);
    return got;
  }
  /** 찌 당기기: 입질이 온(u.bite) 갈매미와 같이 당김 → 바로 낚아 올리고 이번 한 번만 희귀 보너스. 입질이 아니면 아무 일도 없음(false) */
  /** 지금 같이 당길 수 있는지(입질 중이고 아직 안 당김). 당기기 버튼도 이것으로 보임 */
  canTug(u) { return !!u && !!u.bite && !u.tugged && u.state === UnitState.Fish && u.fishT > 0; }
  tugFloat(u) {
    if (!this.canTug(u)) return false;
    u.tugged = true; u.fishT = 0;
    if (u.needs) u.needs.fun = Math.min(100, u.needs.fun + J.TUG_FUN);
    emote(u, "영차! ♪", 1.2); this.emit("tug", { u });
    return true;
  }
  /** 낚은 것을 챙김(알림 없이): 물고기를 뽑아 도감에 적고(흔하면 음식, 희귀 이상이면 낚은 갈매미의 소지품), 가끔 물건도(그 갈매미 소지품,
   *  가구는 집이 있으면 그 집에 놓거나 창고로). 크기(cm)는 난수를 쓰지 않고 정해(aquarium.js) 종류별 기록을 고치고,
   *  수족관이 있으면 처음 낚은 희귀 이상 한 마리는 소지품 대신 기증.
   *  돌려주는 값: { fish, item, size, record: 새 기록인지, first: 그 종류 첫 기록인지, donated, gifts: 기증했으면 받은 선물들(아니면 null), medal·prevMedal: 메달 단계(지금·전), medalGifts: 금메달 기념 가구들 } */
  landFish(u, rnd, bonus = 1) {
    const f = J.rollFish(u, rnd, this.season, bonus); if (!this.economy) this.res.fish++;
    const size = fishSize(f, sizeNoise(this.time, u.unitId, Object.values(this.collection).reduce((a, b) => a + b, 0)));
    const prev = this.fishRecord[f.id] || 0, record = size > prev; if (record) this.fishRecord[f.id] = size;
    const medal = fishMedal(f, this.fishRecord[f.id]), prevMedal = fishMedal(f, prev), medalGifts = grantMedalGifts(this);   // 기록이 아니어도 셈(예전 저장의 밀린 가구가 다음 기록까지 기다리지 않게)
    this.collection[f.id] = (this.collection[f.id] || 0) + 1;
    const gifts = this.donateFish(f);
    if (f.rarity === "common") { if (this.economy) this.gain(u, "fish", 1); else this.res.food += f.food; } else if (!gifts) stashAdd(u, f.id);
    let item = null;
    if (rnd() < J.itemChance(u) * this.fx.item) { item = J.rollItem(u, rnd, this.season, bonus); this.keepCatch(u, item); }
    return { fish: f, item, size, record, first: !prev, donated: !!gifts, gifts, medal, prevMedal, medalGifts };
  }
  /** 낚시로 건진 물건을 그 갈매미가 챙김: 가구는 집이 있으면 그 집에 놓고(자리가 없으면 창고), 집이 없으면 들고 있다가 집을 사면 옮김. 나머지는 소지품 */
  keepCatch(u, item) {
    const home = item.furniture && u.home && this.buildings.get(u.home);
    if (home) { if (!F.autoPlace(this, home, item.furniture)) { const it = F.room(home); it.stash[item.furniture] = (it.stash[item.furniture] || 0) + 1; emote(u, F.NO_ROOM_SAY, 2.4); } return; }
    stashAdd(u, item.id);
  }
  /** 다녀온 사이: 게임을 꺼 둔 실제 시간(ms, 밖에서 재서 넘겨줌)만큼 가볍게 쳐 줌. 마을을 돌리지 않고 딱 두 가지만:
   *  자라던 밭이 익고(10분이면 어느 계절·날씨에도 다 익음), 어부가 낚싯대를 몇 번(awayCasts) 던짐. 돈·시세·시장은 그대로.
   *  돌려주는 값: { ms, hours, ripened, catches: [{ who, fish, item }] } 또는 null(10분 안쪽·이상한 시각) */
  applyAway(ms, rnd = this.rnd) {
    const hours = awayHours(ms); if (!hours) return null;
    let ripened = 0; const catches = [], made = this.bank.mon?.made;                 // 다녀온 사이 낚은 것은 물가 식의 '만든 물건'에 세지 않음(돈·시세는 그대로)
    for (const p of this.plots) if (p.stage === "growing") { p.stage = "ripe"; p.t = 0; ripened++; this.emit("plot", p); }
    this.stepCustom(Infinity);                                                    // 심은 묘목·빈 광석 바위도 다 자람(밭과 같은 규칙)
    const fishers = this.spots.length ? this.units.filter(u => u.job === "fisher") : [];
    for (let i = 0, n = fishers.length ? awayCasts(hours) : 0; i < n; i++) {
      const u = fishers[i % fishers.length]; if (rnd() >= J.catchChance(u)) continue;
      const got = this.landFish(u, rnd); catches.push({ who: u.name, fish: got.fish, item: got.item, size: got.size, donated: got.donated });
      if (got.gifts) { this.noteNews("donate", { u, fish: got.fish }); for (const g of got.gifts) this.noteNews("donateGift", g); }   // 그동안의 기증은 소식지에만
      for (const g of got.medalGifts) this.noteNews("medalGift", g);               // 그동안 받은 금메달 기념 가구도 소식지에(가방에만 조용히 들어가던 것)
    }
    const fished = catches.length ? `물고기 ${catches.length}마리를 낚았어요` : "", did = ripened ? `밭 ${ripened}칸이 ${fished ? `익고 ${fished}` : "익었어요"}` : fished;
    if (did) addNews(this.newsLog, this.time, { icon: "💌", text: `다녀온 사이에 ${did}`, weight: 3 });
    if (this.bank.mon) this.bank.mon.made = made;
    return { ms, hours, ripened, catches };
  }

  // ---- 시장(상인만): 남는 자재·음식·보물·물건을 팔고, 공사에 모자란 나무·돌·철을 사 온다. 상인 희귀도만큼 비싸게 팔고 싸게 산다.
  trade(u) {
    const m = J.skillMult(u, "trade"), r = this.res, log = { sold: 0, bought: 0 };
    const sell = (key, keep) => { const n = Math.max(0, r[key] - keep); if (!n) return; r[key] -= n; const c = Math.round(n * PRICES[key] * m); r.coins += c; log.sold += c; };
    sell("wood", 20); sell("stone", 20); sell("iron", 10); sell("food", 30);
    for (const [id, n] of Object.entries(this.treasures)) { const f = FISH.find(f => f.id === id); if (!n || !f || this.keep[id]) continue; const gifts = this.donateFish(f); if (gifts) this.tellDonation(null, f, gifts);   // 수족관이 생기기 전에 아껴 둔 보물: 아직 기증 안 한 종류면 한 마리는 팔지 않고 기증
      const c = Math.round((n - (gifts ? 1 : 0)) * f.price * m); r.coins += c; log.sold += c; this.treasures[id] = 0; }
    for (const [id, n] of Object.entries(this.items)) { const it = ITEMS.find(i => i.id === id); if (!n || !it || it.furniture || it.gift || this.keep[id]) continue; const c = Math.round(n * it.price * m); r.coins += c; log.sold += c; this.items[id] = 0; }   // 가구·간직하는 것·플레이어 몫 선물거리(gift)는 팔지 않음
    const building = [...this.buildings.values()].filter(b => !this.isDone(b));
    const buy = (key, want) => { while (r[key] < want) { const cost = Math.max(1, Math.round(PRICES[key] * 2 / m)); if (r.coins < cost) break; r.coins -= cost; r[key]++; log.bought += cost; } };
    if (building.length) { buy("wood", 4); buy("stone", 4); if (building.some(b => (BUILDINGS[b.defId].tier || 1) >= 3)) buy("iron", 2); }
    if (this.avgFull() < J.HUNGRY + 10) buy("food", 6);
    this.emit("trade", { u, ...log }); return log;
  }

  // ---- 밭(농부만): 빈 밭에 심고, 다 자라면 거둬 음식이 됨
  farmPlot(p, u) {
    if (p.stage === "empty") { p.stage = "growing"; p.grow = J.growSeconds(u); p.t = p.grow; this.emit("plot", p); return "plant"; }
    if (p.stage === "ripe") { const n = J.harvestYield(u) + this.fx.harvest; this.gain(u, "food", n); p.stage = "empty"; p.t = 0; p.lastYield = n; this.emit("plot", p); return "harvest"; }
    return null;
  }
  /** 밭에 물을 줌(농부가 물가에서 떠 온 물): 촉촉함이 다 참 */
  waterPlot(p, u = null) { p.moisture = 1; this.emit("plotWater", { p, u }); return true; }
  /** 격자 좌표(연속)에 서는 높이: 부두처럼 걸을 수 있는 시설 위면 그 높이, 아니면 보이는 땅 높이(경사면 포함). */
  standHeight(gx, gz) {
    const x = Math.floor(gx), z = Math.floor(gz), c = this.grid.get(x, z), o = c?.occupiedId && this.grid.occupants.get(c.occupiedId);
    if (o && o.ramp && o.walkable) {                                             // 계단: 디딤판 높이
      const r = o.ramp, u = gx - x, v = gz - z, t = r.dx ? (r.dx > 0 ? u : 1 - u) : (r.dz > 0 ? v : 1 - v);
      return stairStep(r, t);
    }
    if (o && o.walkable) return o.surface;
    return terrainHeight(this.grid, gx, gz);
  }
  isPlot(x, z) { return this.plots.some(p => p.x === x && p.z === z); }

  /** 이 등급의 건물을 지을 수 있는 건축가가 있나(1등급은 누구나). */
  builderFor(def) { return this.units.find(u => J.canBuild(u, def)) || null; }   // 그 건물을 지을 직업의 갈매미가 있어야 함(집·계단 = 건축가, 시설 = 목수)

  // ---- 바닥 칠하기(지시서 3-B): 땅 칸이고 나무·바위·밭·계단이 없을 때. 건물 밑도 칠함(모델이 차지 칸보다 작아 바닥이 드러남 — 길 연결은 roads.isPaved가 건물 칸을 빼서 그대로)
  canPaint(x, z) { const c = this.grid.get(x, z); return !!c && !this.grid.isWater(x, z) && paintableUnder(this, c.occupiedId) && !this.isPlot(x, z); }
  paint(x, z, type) { if (!this.canPaint(x, z)) return false; const ok = this.grid.setGround(x, z, type); if (ok) this.emit("ground", { x, z, type }); return ok; }

  // ---- 높이(층·경사·계단·연못): 한 단 = MAX_STEP(0.25 m). 한 단 차이는 걸어 다니는 경사, 두 단 이상은 절벽. 올리기 한 번 = heightStep(0.5 m = 두 단).
  //      오르내리는 계단은 계단 건축물(BUILDINGS.stairs)로. 바다 높이 아래로 파면 물이 차서 연못이 됨.
  canReshape(x, z) { const c = this.grid.get(x, z); return !!c && !c.occupiedId && !this.isPlot(x, z) && !this.grid.doorOwner(x, z); }
  /**
   * op: "raise" | "lower" | "flatten"(target 높이로) | "smooth"(이웃과 비슷하게). amount(0~1): 부드러운 붓의 세기(가운데 1, 가장자리로 갈수록 작게).
   * animateShape가 켜져 있으면 높이가 0.2초쯤에 걸쳐 스르르 바뀐다(update). 바뀌면 true.
   */
  reshape(x, z, op, target = 0, amount = 1) {
    if (!this.canReshape(x, z) || amount <= 0) return false;
    const c = this.grid.get(x, z), idx = this.grid.index(x, z), step = this.heightStep;
    const cur = this.shaping.get(idx)?.target ?? c.elevation;
    let e = cur;
    if (op === "raise") e = cur + step * amount;
    else if (op === "lower") e = cur - step * amount;
    else if (op === "flatten") e = cur + (target - cur) * amount;
    else if (op === "smooth") {
      let sum = 0, n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const o = this.grid.get(x + dx, z + dz); if (o && (dx || dz)) { sum += this.shaping.get(this.grid.index(x + dx, z + dz))?.target ?? o.elevation; n++; } }
      if (n) e = cur + (sum / n - cur) * 0.6 * amount;
    }
    e = Math.max(-1, Math.min(3, Math.round(e * 100) / 100));
    if (op === "raise" && cur < 0 && cur > -step && e > 0 && amount >= 0.99) e = 0;      // 모래사장 비탈(-0.15 등)은 0으로 맞춤
    if (Math.abs(e - cur) < 0.005) return false;
    if (!this.reshapeAllowed(x, z, cur, e)) return false;                            // 땅↔물 경계를 넘으면 꾸미기 값·검사(customize.js), 먼 바다 높이기 금지
    if (this.animateShape) { const prev = this.shaping.get(idx); this.shaping.set(idx, { x, z, target: e, w0: prev ? prev.w0 : this.grid.isWater(x, z) }); return true; }   // w0: 스르르 바뀌기 전 물이었나(중간 높이가 물 높이를 먼저 넘어도 끝에서 땅↔물 정리를 하게)
    return this.applyHeight(x, z, e);
  }
  /** 높이를 실제로 바꾸고, 물에 잠긴 씨앗·갈매미를 정리. was: 바뀌기 전 물이었나(스르르 바뀌기가 넘김, 없으면 지금 칸으로 봄) */
  applyHeight(x, z, e, was = null) {
    const c = this.grid.get(x, z), wasWater = was ?? this.grid.isWater(x, z);
    if (was === null) this.shaping.delete(this.grid.index(x, z));                  // 바로 바꾸면(파기·메우기·되돌리기) 그 칸의 스르르 바뀌기는 그만둠(아니면 낸 값과 달리 예전 목표 높이로 되돌아감)
    if (!this.grid.setElevation(x, z, e) && was === null) return false;
    if (wasWater && !this.grid.isWater(x, z) && c.groundType !== "Sand") c.groundType = "Sand";
    const nowWater = this.grid.isWater(x, z), key = CU.decorKey(x, z);
    if (wasWater !== nowWater) { if (nowWater) this.dug.add(key); else this.dug.delete(key); }   // 플레이어가 판 물 칸(깊어도 다시 메울 수 있음)
    this.dropDecor([[x, z]]);                                                      // 높이가 바뀐 칸의 놓은 덤불·꽃은 지움
    for (const s of [...this.seeds]) if (s.x === x && s.z === z && this.grid.isWater(x, z)) this.eatSeed(s);   // 물에 잠긴 씨앗은 없앰
    for (const u of this.units) if (!u.insideBuildingId && u.state !== UnitState.Held && Math.floor(u.x) === x && Math.floor(u.z) === z && !this.grid.isWalkable(x, z) && !(u.swimming && this.grid.isWater(x, z))) {
      const spot = nearestWalkable(this.grid, x, z); if (spot) { u.x = spot[0] + 0.5; u.z = spot[1] + 0.5; } setIdle(u, this.rnd, this);   // 물에 빠지면 가까운 땅으로
    }
    if (wasWater !== nowWater) this.pruneSpots();                                  // 바라보는 물이 땅이 된 낚시 자리는 지움
    this.emit("ground", { x, z }); return true;
  }
  /** 스르르 바뀌는 중인 칸들을 목표 높이 쪽으로 옮김(초당 1.5 m). */
  stepShaping(dt) {
    for (const [idx, s] of this.shaping) {
      const c = this.grid.get(s.x, s.z), d = s.target - c.elevation, mv = Math.sign(d) * Math.min(Math.abs(d), 1.5 * dt);
      if (Math.abs(d) <= 1.5 * dt + 1e-6) { this.shaping.delete(idx); this.applyHeight(s.x, s.z, s.target, s.w0 ?? null); }
      else this.grid.setElevation(s.x, s.z, Math.round((c.elevation + mv) * 1000) / 1000);
    }
  }

  // ---- 섬 꾸미기(customize.js): 나무·야자수·바위·광석 바위 심기/치우기, 덤불·꽃, 지형지물 옮기기, 연못·물길 파기/메우기.
  //  결과 모양은 건물 놓기와 같음: 실패 { ok: false, reason, cost }, 성공 { ok: true, cost, …, inverse }. opt.dry = 검사·값만(고스트), opt.free = 돈 안 냄(시험 받침·되돌리기).
  //  값은 금고에서 바로(경제가 없으면 0), 금고는 맨 마지막에 봄. 난수를 쓰지 않음(variant·rot = 칸 좌표 해시, 일을 멈춘 갈매미의 쉬는 시간도 고정).
  //  알림: moduleAdded · moduleRemoved · moduleMoved · decorChanged · custom(성공 요약) · customRefused(높이 도구가 막힘) · 기존 treeGrow/oreGrow/ground
  /** 이 일의 값(🪙). op = place | remove | move | dig | fill */
  customCost(op, kind) { return CU.customCostOf(op, kind, this.economy, this.priceMult()); }
  /** 화면 카드용: 지금 수·한도·값표·금고 */
  customInfo() {
    const cost = (op, list) => Object.fromEntries(list.map(k => [k, this.customCost(op, k)]));
    return { trees: this.trees.length, treeMax: CU.LIMITS.trees, ores: this.ores.length, oreMax: CU.LIMITS.ores, rocks: this.modules.filter(m => m.defId === "beachRock").length, rockMax: CU.LIMITS.rocks,
      decor: this.decor.add.size, decorMax: CU.LIMITS.decor, growing: this.trees.concat(this.ores).filter(t => t.grow > 0).length,
      landmarks: CU.LANDMARKS.filter(d => this.landmark(d)), economy: this.economy, vault: Math.floor(this.bank.vault), spent: this.bank.custom || 0,
      costs: { place: cost("place", [...CU.NATURE, ...CU.DECOR]), remove: cost("remove", [...CU.NATURE, ...CU.DECOR]), move: cost("move", CU.LANDMARKS), dig: this.customCost("dig"), fill: this.customCost("fill") } };
  }
  /** 모듈 하나를 나무·광석 목록에 넣음(생성자·심기). grow > 0이면 묘목·빈 바위(alive=false → 갈매미가 찜하지 않음) */
  trackModule(m) {
    const [x, z] = m.cells[0], grow = m.grow > 0 ? m.grow : 0, e = { id: m.id, x, z, alive: !grow, hp: 3, claimed: null };
    if (grow) { e.grow = grow; e.sapling = true; }
    if (m.defId === "tree" || m.defId === "palm") { this.trees.push(e); return { tree: e }; }
    if (m.defId === "ore") { this.ores.push(e); return { ore: e }; }
    return {};
  }
  /** 묘목·빈 바위 자라기(계절·비와 상관없이 마을 시간으로). 다 자라면 기존 treeGrow/oreGrow */
  stepCustom(dt) {
    for (const list of [this.trees, this.ores]) for (const t of list) {
      if (!(t.grow > 0) || (t.grow -= dt) > 0) continue;
      t.grow = 0; delete t.sapling; t.alive = true; t.hp = 3;
      const m = this.modules.find(o => o.id === t.id); if (m) delete m.grow;
      this.emit(list === this.trees ? "treeGrow" : "oreGrow", t);
    }
  }
  /** 저장 전에 모듈의 남은 자람 시간을 맞춤(모듈 목록이 그대로 저장되므로) */
  syncGrow() { for (const t of this.trees.concat(this.ores)) if (t.grow > 0) { const m = this.modules.find(o => o.id === t.id); if (m) m.grow = Math.ceil(t.grow); } }
  /** 금고에서 꾸미기 값을 냄 */
  payCustom(cost) { if (!(cost > 0)) return; const bk = this.bank; bk.vault -= cost; bk.custom = (bk.custom || 0) + cost; this.led("custom", cost); this.checkLow(); }
  /** 되돌리기 환불(방금 낸 값만) */
  refundCustom(n) {
    if (!(n > 0)) return; const bk = this.bank; bk.vault += n; bk.custom = Math.max(0, (bk.custom || 0) - n); this.led("custom", -n);
    if (bk.vault >= BK.VAULT_REARM) bk.low = 0; this.settleOwed();
  }
  /** 되돌리기 표 하나(한 번짜리, 최근 UNDO_KEEP개만, 저장 안 함) */
  undoOf(inv, opt = {}) {
    if (opt.noUndo) return null;
    const token = `u${++this.undoSeq}`; this.undo.set(token, true);
    while (this.undo.size > CU.UNDO_KEEP) this.undo.delete(this.undo.keys().next().value);
    return { ...inv, token };
  }
  /** 선착장·낚시터 앞 물 칸(배를 대는 곳·낚시 방향)이면 그 건물(짓는 중 포함), 아니면 null */
  berthOwner(x, z) {
    for (const b of this.buildings.values()) { const d = BUILDINGS[b.defId]; if (!d.dock && !d.pier) continue; const p = this.berth(b); if (p.x === x && p.z === z) return b; }
    return null;
  }
  /** 이 칸들에 밖에 나와 선(헤엄 포함) 갈매미가 있나(들려 있거나 건물 안은 빼고). 헤엄치는 갈매미가 올라올 땅 칸(u.swim.sx·sz)도 그 갈매미 자리로 봄
   *  (거기에 나무·바위·지형지물을 놓으면 헤엄을 마치고 그 안으로 올라와 갇힘) */
  unitOn(cells) {
    const keys = new Set(cells.map(([x, z]) => CU.decorKey(x, z)));
    return this.units.some(u => !u.insideBuildingId && u.state !== UnitState.Held && (keys.has(CU.decorKey(Math.floor(u.x), Math.floor(u.z))) || (u.swimming && u.swim && keys.has(CU.decorKey(u.swim.sx, u.swim.sz)))));
  }
  /** 땅 칸에 kind(tree·palm·beachRock·ore·bush·flower)를 놓을 수 없는 까닭, 되면 "". self: 비어 있는 것으로 볼 모듈 id(옮기기) */
  landProblem(x, z, kind, self = null) {
    const g = this.grid; if (!g.inBounds(x, z)) return "섬 밖이에요";
    if (g.isWater(x, z)) return kind === "tree" || kind === "palm" ? "물에는 심을 수 없어요" : "물에는 놓을 수 없어요";
    const c = g.get(x, z); if (c.occupiedId && c.occupiedId !== self) return "다른 것과 겹쳐요";
    if (this.isPlot(x, z)) return "밭에는 놓을 수 없어요";
    if (g.doorOwner(x, z)) return "건물 문 앞이에요";
    if (!CU.DECOR.includes(kind) && this.spots.some(s => s.x === x && s.z === z)) return "낚시 자리예요";   // 걷기를 막는 것(나무·바위·지형지물)은 낚시 자리에 못 놓음(덤불·꽃은 됨)
    return kind ? CU.groundReason(kind, c.groundType) : "";
  }
  /** 걸어서 이어진 덩어리 번호(캐시·grid.version을 건드리지 않고 지금 칸 상태로 새로 셈). comps()와 같은 규칙 */
  floodComps() {
    const g = this.grid, comp = new Int32Array(g.w * g.h).fill(-1); let id = 0;
    for (let s = 0; s < comp.length; s++) {
      if (comp[s] >= 0) continue; const sx = s % g.w, sz = (s / g.w) | 0; if (!g.isWalkable(sx, sz)) continue;
      const q = [s]; comp[s] = id;
      while (q.length) { const i = q.pop(), x = i % g.w, z = (i / g.w) | 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (!g.inBounds(nx, nz)) continue; const ni = nz * g.w + nx; if (comp[ni] >= 0 || !g.canStep(x, z, nx, nz)) continue; comp[ni] = id; q.push(ni); } }
      id++;
    }
    return comp;
  }
  /** 칸 상태를 잠깐 바꿔(fn) 덩어리를 새로 세고 되돌림(grid.version·캐시는 그대로) */
  probeComps(cells, free = [], elev = null) {
    const g = this.grid, saved = [], P = "__probe"; g.occupants.set(P, { kind: "module", walkable: false, surface: 0 });
    for (const [x, z] of free) { const c = g.get(x, z); saved.push([c, c.occupiedId, c.elevation]); c.occupiedId = null; }
    for (const [x, z] of cells) { const c = g.get(x, z); saved.push([c, c.occupiedId, c.elevation]); if (elev === null) c.occupiedId = P; else c.elevation = elev; }
    const comp = this.floodComps();
    for (let i = saved.length - 1; i >= 0; i--) { const [c, id, e] = saved[i]; c.occupiedId = id; c.elevation = e; }
    g.occupants.delete(P); return comp;
  }
  /** 걸을 수 없는 것을 cells에 놓아도(free 칸은 비운 채로) 둘레 8칸의 걸을 수 있는 칸끼리 이어짐이 그대로인가(길 끊김 검사) */
  /** 빠른 길: excl 칸을 빼고도 starts 칸들이 둘레 R칸 창 안에서 서로 걸어서 이어지나(이어지면 섬 전체 이어짐도 그대로라 덩어리를 새로 셀 필요 없음) */
  localLinked(excl, starts, R = 3) {
    if (starts.length < 2) return true;
    const g = this.grid, W = g.w, xs = [...excl].map(i => i % W), zs = [...excl].map(i => (i / W) | 0);
    const x0 = Math.min(...xs) - R, x1 = Math.max(...xs) + R, z0 = Math.min(...zs) - R, z1 = Math.max(...zs) + R;
    const seen = new Set([starts[0]]), q = [starts[0]];
    while (q.length) { const i = q.pop(), x = i % W, z = (i / W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz, ni = nz * W + nx;
        if (nx < x0 || nx > x1 || nz < z0 || nz > z1 || !g.inBounds(nx, nz) || seen.has(ni) || excl.has(ni) || !g.canStep(x, z, nx, nz)) continue; seen.add(ni); q.push(ni); } }
    return starts.every(i => seen.has(i));
  }
  keepsLinks(cells, free = []) {
    const g = this.grid, W = g.w, own = new Set(cells.map(([x, z]) => z * W + x)), near = [];
    if (!free.length) {                                                            // 나무·바위 하나: 둘레 걸을 수 있는 칸끼리 가까이에서 이어지면 바로 통과(붓·고스트가 매번 섬 전체를 세지 않게)
      const nb = []; for (const [x, z] of cells) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, nz = z + dz, i = nz * W + nx; if (g.inBounds(nx, nz) && !own.has(i) && g.isWalkable(nx, nz)) nb.push(i); }
      if (this.localLinked(own, nb)) return true;
    }
    const before = free.length ? this.probeComps([], free) : this.comps();
    for (const [x, z] of cells) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz; if (!g.inBounds(nx, nz)) continue; const i = nz * W + nx; if (own.has(i) || before[i] < 0) continue; near.push(i);
    }
    if (near.length < 2) return true;
    const after = this.probeComps(cells, free), pair = new Map();
    for (const i of near) { const b = before[i], a = after[i]; if (!pair.has(b)) pair.set(b, a); else if (pair.get(b) !== a) return false; }
    return true;
  }
  /** 파기: 다 지은 건물 문 → 공식은행 문 이어짐이 끊기지 않나(은행이 없으면 검사 안 함) */
  keepsBankLink(x, z, e) { return !this.digLinkProblem(x, z, e); }
  /** 파기(땅 → 물) 길 검사: 다 지은 건물 문 → 공식은행 문 이어짐, 그리고 밖에 있는 갈매미(헤엄 중이면 올라올 칸)가 물에 둘러싸여 갇히지 않는가.
   *  기준 칸은 공식은행 문(은행이 없는 예전 섬은 섬 가운데). 문제가 있으면 까닭(한국어), 없으면 "" */
  digLinkProblem(x, z, e) {
    const g = this.grid, W = g.w;
    { const nb = [];                                                               // 빠른 길: 이 칸으로 드나들던 이웃끼리 가까이에서 이어지면 아무 길도 안 끊김
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (g.inBounds(nx, nz) && g.canStep(x, z, nx, nz)) nb.push(nz * W + nx); }
      if (this.localLinked(new Set([z * W + x]), nb)) return ""; }
    const bank = this.bankB(); let ref = bank ? bank.door : { x: Math.floor(this.center?.x ?? g.w / 2), z: Math.floor(this.center?.z ?? g.h / 2) };
    if (ref.x === x && ref.z === z) { const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dz]) => g.inBounds(x + dx, z + dz) && g.canStep(x, z, x + dx, z + dz)); if (!n) return ""; ref = { x: x + n[0], z: z + n[1] }; }   // 은행 없는 섬의 가운데 칸을 파면 이웃 칸을 기준으로
    const before = this.comps(), at = p => g.inBounds(p.x, p.z) ? before[p.z * W + p.x] : -1, home = at(ref); if (home < 0) return "";
    const doors = bank ? [...this.buildings.values()].filter(b => b !== bank && this.isDone(b) && !BUILDINGS[b.defId].bridge && at(b.door) === home).map(b => b.door) : [];
    const gulls = this.units.filter(u => !u.insideBuildingId && u.state !== UnitState.Held && !u.sailing)
      .map(u => u.swimming && u.swim ? { x: u.swim.sx, z: u.swim.sz } : { x: Math.floor(u.x), z: Math.floor(u.z) }).filter(p => !(p.x === x && p.z === z) && at(p) === home);
    if (!doors.length && !gulls.length) return "";
    const after = this.probeComps([[x, z]], [], e), aid = p => after[p.z * W + p.x], h = aid(ref);
    if (!doors.every(d => aid(d) === h)) return "길이 끊겨요(다리를 먼저 놓아요)";
    if (!gulls.every(p => aid(p) === h)) return "갈매미가 갇혀요(물로 둘러싸지 말아 주세요)";
    return "";
  }
  /** 놓은 덤불·꽃을 지움(건물·나무·지형지물·높이 바꾸기). 돈은 안 돌려줌 */
  dropDecor(cells) {
    for (const [x, z] of cells) { const key = CU.decorKey(x, z); if (!this.decor.add.has(key)) continue; this.decor.add.delete(key); this.emit("decorChanged", { x, z, k: null, v: 0, off: this.decor.off.has(key) }); }
  }
  /** 바라보는 칸이 땅이 되었거나 서는 칸을 못 쓰게 된 낚시 자리를 지움(낚시터 자리 dock은 빼고). 찜한 갈매미는 그만둠 */
  pruneSpots() {
    for (const s of [...this.spots]) {
      if (s.dock || (this.grid.isWater(s.x + s.dir[0], s.z + s.dir[1]) && this.grid.isWalkable(s.x, s.z))) continue;
      this.spots.splice(this.spots.indexOf(s), 1);
      for (const u of this.units) if (u.focus === s) setIdle(u, this.rnd, this, 0.6);
      this.emit("spotRemoved", s);
    }
  }
  /** 그 칸의 나무·야자수·바위·광석 모듈(지형지물·소품은 null) */
  natureAt(x, z) { const m = this.moduleAt(x, z); return m && CU.NATURE.includes(m.defId) ? m : null; }
  moduleAt(x, z) { const id = this.grid.get(x, z)?.occupiedId; return id ? this.modules.find(m => m.id === id) || null : null; }
  natureLimit(kind) {
    if ((kind === "tree" || kind === "palm") && this.trees.length >= CU.LIMITS.trees) return `나무는 섬에 ${CU.LIMITS.trees}그루까지예요`;
    if (kind === "ore" && this.ores.length >= CU.LIMITS.ores) return `광석 바위는 섬에 ${CU.LIMITS.ores}개까지예요`;
    if (kind === "beachRock" && this.modules.filter(m => m.defId === "beachRock").length >= CU.LIMITS.rocks) return `바위는 섬에 ${CU.LIMITS.rocks}개까지예요`;
    return "";
  }
  /** 심기·놓기: kind = tree | palm | beachRock | ore | auto(모래면 야자수, 아니면 나무). 새 나무는 묘목(TREE_GROW초), 새 광석 바위는 빈 바위(ORE_FILL초).
   *  opt: dry, free, rot, variant(없으면 칸 해시), (되돌리기용) id, grow, by. 성공: { ok, cost, kind, x, z, module, tree?, ore?, inverse } */
  placeNature(kind, x, z, opt = {}) {
    const g = this.grid, fail = (reason, cost = 0, short = false) => ({ ok: false, reason, cost, ...(short ? { short } : {}) });
    if (kind === "auto") kind = g.inBounds(x, z) ? CU.autoKind(g.get(x, z).groundType) : "tree";
    if (!CU.NATURE.includes(kind)) return fail("심을 수 없는 것이에요");
    const cost = opt.free ? 0 : this.customCost("place", kind);
    const why = this.landProblem(x, z, kind); if (why) return fail(why, cost);
    if (this.unitOn([[x, z]])) return fail("갈매미가 서 있어요", cost);
    const lim = this.natureLimit(kind); if (lim) return fail(lim, cost);
    if (!opt.restore && !this.keepsLinks([[x, z]])) return fail("길이 막혀요(갈매미가 지나갈 틈을 남겨 주세요)", cost);   // 되돌리기(restore)는 원래 있던 자리라 길 검사 안 함
    if (cost > this.bank.vault) return fail(CU.customReason(cost, this.bank.vault), cost, true);
    if (opt.dry) return { ok: true, dry: true, cost, kind, x, z };
    const m = { id: opt.id || `${kind}-c${this.nextId++}`, defId: kind, cells: [[x, z]], rot: opt.rot ?? CU.rotAt(x, z), variant: opt.variant ?? CU.variantAt(x, z) };
    const by = "by" in opt ? opt.by : "player"; if (by) m.by = by;
    const grow = opt.grow ?? (kind === "tree" || kind === "palm" ? CU.TREE_GROW : kind === "ore" ? CU.ORE_FILL : 0); if (grow > 0) m.grow = grow;
    const def = MODULES[kind]; g.occupy(m.cells, m.id, { kind: "module", walkable: def.walkable, surface: def.surface ?? 0 });
    this.modules.push(m); const t = this.trackModule(m);
    this.payCustom(cost); this.dropDecor(m.cells);
    this.emit("moduleAdded", { module: m, ...t }); if (!opt.quiet) this.emit("custom", { op: "place", kind, cost, x, z });
    return { ok: true, cost, kind, x, z, module: m, ...t, inverse: this.undoOf({ op: "removeNature", args: { id: m.id }, refund: cost }, opt) };
  }
  /** 치우기·뽑기: 모듈 id 또는 { x, z }. 나무·돌을 주지 않음(공짜 자원 막기). 이 나무·광석을 노리던 갈매미는 찜을 풀고 그만둠.
   *  지형지물은 "옮기기만", 그 밖의 소품은 치울 수 없음. 성공: { ok, cost, module, inverse } */
  removeNature(target, opt = {}) {
    const fail = (reason, cost = 0, short = false) => ({ ok: false, reason, cost, ...(short ? { short } : {}) });
    const m = typeof target === "string" ? this.modules.find(o => o.id === target) : target && this.grid.inBounds(target.x, target.z) ? this.moduleAt(target.x, target.z) : null;
    if (!m) return fail("치울 게 없어요");
    if (CU.LANDMARKS.includes(m.defId)) return fail(`${josa(CU.NAMES[m.defId], "은", "는")} 옮기기만 할 수 있어요`);
    if (!CU.NATURE.includes(m.defId)) return fail("치울 수 없어요");
    const cost = opt.free ? 0 : this.customCost("remove", m.defId);
    if (cost > this.bank.vault) return fail(CU.customReason(cost, this.bank.vault), cost, true);
    const [x, z] = m.cells[0];
    if (opt.dry) return { ok: true, dry: true, cost, kind: m.defId, x, z, module: m };
    const list = m.defId === "ore" ? this.ores : m.defId === "beachRock" ? null : this.trees, e = list?.find(t => t.id === m.id);
    const grow = !e ? 0 : e.grow > 0 ? Math.ceil(e.grow) : e.alive ? 0 : 30;      // 되돌리면: 묘목은 남은 시간 그대로, 다 베인 그루터기는 30초 뒤 다시 자람
    if (e) {
      e.alive = false; e.removed = true;                                           // 다시 자라기 타이머가 되살리지 않게
      for (const u of this.units) if (u.focus === e) setIdle(u, this.rnd, this, 0.6);   // 찜 풀기(도끼질 중이던 갈매미는 나무를 못 얻음)
      list.splice(list.indexOf(e), 1);
    }
    this.modules.splice(this.modules.indexOf(m), 1); this.grid.release(m.id);
    this.payCustom(cost);
    this.emit("moduleRemoved", { module: m }); if (!opt.quiet) this.emit("custom", { op: "remove", kind: m.defId, cost, x, z });
    const args = { kind: m.defId, x, z, id: m.id, rot: m.rot, variant: m.variant, grow, by: m.by ?? null };
    return { ok: true, cost, kind: m.defId, x, z, module: m, inverse: this.undoOf({ op: "placeNature", args, refund: cost }, opt) };
  }
  /** 덤불·꽃 놓기(걷기를 막지 않음, 칸마다 하나). opt.v = 모양(0~3, 없으면 칸 해시). 성공: { ok, cost, x, z, k, v, inverse } */
  placeDecor(kind, x, z, opt = {}) {
    const fail = (reason, cost = 0, short = false) => ({ ok: false, reason, cost, ...(short ? { short } : {}) });
    if (!CU.DECOR.includes(kind)) return fail("놓을 수 없는 것이에요");
    const cost = opt.free ? 0 : this.customCost("place", kind);
    const why = this.landProblem(x, z, kind); if (why) return fail(why, cost);
    const key = CU.decorKey(x, z), had = this.decor.add.get(key);
    if (had) return fail(`이미 ${josa(CU.NAMES[had.k], "이", "가")} 있어요`, cost);
    if (this.decor.add.size >= CU.LIMITS.decor) return fail(`덤불·꽃은 섬에 ${CU.LIMITS.decor}개까지예요`, cost);
    if (cost > this.bank.vault) return fail(CU.customReason(cost, this.bank.vault), cost, true);
    const v = Math.max(0, Math.min(3, (opt.v ?? CU.variantAt(x, z, 4)) | 0));
    if (opt.dry) return { ok: true, dry: true, cost, x, z, k: kind, v };
    this.decor.add.set(key, { k: kind, v }); this.payCustom(cost);
    this.emit("decorChanged", { x, z, k: kind, v, off: this.decor.off.has(key) }); if (!opt.quiet) this.emit("custom", { op: "place", kind, cost, x, z });
    return { ok: true, cost, x, z, k: kind, v, inverse: this.undoOf({ op: "clearDecor", args: { x, z, k: kind }, refund: cost }, opt) };
  }
  /** 덤불·꽃 치우기: 놓은 것이 있으면 그것을, 없으면 그림이 씨앗으로 만든 소품을 숨길 칸(off)에 넣음(잔디·모래·바위·흙 땅). 성공: { ok, cost, x, z, was: { k, v } | "seed", inverse } */
  clearDecor(x, z, opt = {}) {
    const fail = (reason, cost = 0, short = false) => ({ ok: false, reason, cost, ...(short ? { short } : {}) });
    const key = CU.decorKey(x, z), had = this.decor.add.get(key), g = this.grid;
    const kind = had ? had.k : "bush", cost = opt.free ? 0 : this.customCost("remove", kind);
    if (!had) {
      const c = g.get(x, z);
      if (!c || g.isWater(x, z) || c.occupiedId || this.isPlot(x, z) || CU.pavedGround(c.groundType) || this.decor.off.has(key)) return fail("치울 게 없어요");
    }
    if (cost > this.bank.vault) return fail(CU.customReason(cost, this.bank.vault), cost, true);
    const was = had ? { ...had } : "seed";
    if (opt.dry) return { ok: true, dry: true, cost, x, z, was };
    if (had) this.decor.add.delete(key); else this.decor.off.add(key);
    this.payCustom(cost);
    this.emit("decorChanged", { x, z, k: null, v: 0, off: this.decor.off.has(key) }); if (!opt.quiet) this.emit("custom", { op: "remove", kind: had ? had.k : "decor", cost, x, z });
    const inv = had ? { op: "placeDecor", args: { x, z, k: had.k, v: had.v }, refund: cost } : { op: "unhideDecor", args: { x, z }, refund: cost };
    return { ok: true, cost, x, z, was, inverse: this.undoOf(inv, opt) };
  }
  /** 지형지물(cave · lighthouse · pier · breakwater) 모듈, 이 섬에 없으면 null. 지우는 API는 없음(옮기기만) */
  landmark(defId) { return CU.LANDMARKS.includes(defId) ? this.modules.find(m => m.defId === defId) || null : null; }
  /** 옮긴 뒤 차지 칸(고스트용, 아무것도 안 바꿈). 기준 칸 (ax, az) = 돌린 모양의 왼쪽 위 */
  landmarkCells(defId, ax, az, rot = 0) { const m = this.landmark(defId); return m ? CU.landmarkCellsOf(m, ax, az, rot) : null; }
  /** 이야기·화면용 "발치" 칸 { x, z }: 동굴은 입구 앞 걸을 수 있는 칸, 그 밖은 가장 가까운 걸을 수 있는 칸. 좌표를 박지 말고 이것으로 찾음 */
  landmarkFront(defId) {
    const m = this.landmark(defId); if (!m) return null;
    if (defId === "cave") { const f = CU.frontCells(m.cells, m.rot || 0).sort((p, q) => p[1] - q[1] || p[0] - q[0]); const ok = f.find(([x, z]) => this.grid.isWalkable(x, z)) || f[0]; if (ok) return { x: ok[0], z: ok[1] }; }
    const s = nearestWalkable(this.grid, m.cells[0][0], m.cells[0][1], 6); return s ? { x: s[0], z: s[1] } : null;
  }
  /** 지형지물을 cells·rot에 둘 수 없는 까닭, 되면 "" (자기 칸은 비어 있는 것으로 봄) */
  landmarkProblem(m, cells, rot, restore = false) {
    const g = this.grid, self = m.id, def = m.defId;
    if (!cells.every(([x, z]) => g.inBounds(x, z))) return "섬 밖이에요";
    const other = (x, z) => { const id = g.get(x, z).occupiedId; return id && id !== self; };
    if (def === "pier" || def === "breakwater") {
      for (const [x, z] of cells) {
        if (!g.isWater(x, z)) return def === "pier" ? "부두는 물 위에 놓아요" : "방파제는 바다에만 놓아요";
        if (other(x, z)) return "다른 것과 겹쳐요";
        const b = this.berthOwner(x, z); if (b) return `${BUILDINGS[b.defId].name} 앞 물이에요`;
        if (this.spots.some(s => s.x + s.dir[0] === x && s.z + s.dir[1] === z && !(def === "pier" && !s.dock && m.cells.some(([a, c]) => a === s.x && c === s.z)))) return "낚시 자리 앞 물이에요";   // 부두 위 자리는 부두와 같이 옮겨지므로 뺌
      }
      if (def === "pier") for (const [x, z] of CU.backCells(cells, rot)) {
        const c = g.get(x, z), occ = c && c.occupiedId && c.occupiedId !== self ? g.occupants.get(c.occupiedId) : null;
        if (!c || g.isWater(x, z) || (occ && !occ.walkable)) return "부두는 물가에서 바다 쪽으로 놓아요(R로 방향 돌리기)";
      }
      if (this.unitOn(cells.filter(([x, z]) => !m.cells.some(([a, b]) => a === x && b === z)))) return "갈매미가 있어요";
      return "";
    }
    for (const [x, z] of cells) { const why = this.landProblem(x, z, null, self); if (why) return why; }
    const e = g.get(cells[0][0], cells[0][1]).elevation;
    if (!restore && cells.some(([x, z]) => Math.abs(g.get(x, z).elevation - e) > 1e-6)) return "바닥이 평평하지 않아요";   // 되돌리기는 원래 자리(섬이 만든 등대 자리는 평평하지 않음)
    if (def === "cave") for (const [x, z] of CU.frontCells(cells, rot)) {
      const c = g.get(x, z); if (!c) return "동굴 입구 앞이 막혀 있어요(R로 방향 돌리기)";
      const h = c.occupiedId === self ? (g.isWater(x, z) ? null : c.elevation) : g.walkHeight(x, z);
      if (h === null || Math.abs(h - e) > MAX_STEP + 1e-6 || g.doorOwner(x, z)) return "동굴 입구 앞이 막혀 있어요(R로 방향 돌리기)";
    }
    if (def === "lighthouse") {
      const R = CU.LIGHTHOUSE_SEA, sea = cells.some(([x, z]) => { for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (g.inBounds(x + dx, z + dz) && g.isWater(x + dx, z + dz)) return true; return false; });
      if (!sea) return `등대는 바닷가(물에서 ${R}칸 안)에 세워요`;
    }
    if (this.unitOn(cells)) return "갈매미가 서 있어요";
    if (!restore && !this.keepsLinks(cells, m.cells)) return "길이 막혀요(갈매미가 지나갈 틈을 남겨 주세요)";   // 되돌리기는 원래 있던 자리(섬이 만든 동굴 뒤 비탈처럼 그 자리로만 이어지던 길도 원래대로)
    return "";
  }
  /** 지형지물 옮기기(섬에 하나씩, 지우기 없음). rot = 0~3(동굴 입구·부두가 바다로 뻗는 방향). 부두는 끝 낚시 자리를 같이 옮김, 동굴은 이름표(zones)를 입구 앞으로.
   *  성공: { ok, cost, module, from: { cells, rot }, inverse } */
  moveLandmark(defId, ax, az, rot = null, opt = {}) {
    const fail = (reason, cost = 0, short = false) => ({ ok: false, reason, cost, ...(short ? { short } : {}) });
    if (!CU.LANDMARKS.includes(defId)) return fail("옮길 수 없는 것이에요");
    const m = this.landmark(defId); if (!m) return fail("이 섬에는 없어요");
    rot = (((rot ?? m.rot ?? 0) | 0) % 4 + 4) % 4;
    const cells = opt.cells ? opt.cells.map(c => [c[0], c[1]]) : CU.landmarkCellsOf(m, ax, az, rot);
    const cost = opt.free ? 0 : this.customCost("move", defId);
    const same = cells.length === m.cells.length && cells.every((c, i) => c[0] === m.cells[i][0] && c[1] === m.cells[i][1]) && rot === (m.rot || 0);
    if (same) return fail("지금 자리와 같아요", cost);
    const why = this.landmarkProblem(m, cells, rot, !!opt.restore); if (why) return fail(why, cost);
    if (cost > this.bank.vault) return fail(CU.customReason(cost, this.bank.vault), cost, true);
    if (opt.dry) return { ok: true, dry: true, cost, cells, rot };
    const from = { cells: m.cells.map(c => [c[0], c[1]]), rot: m.rot || 0 }, def = MODULES[defId];
    const riders = defId === "pier" ? this.units.filter(u => !u.insideBuildingId && u.state !== UnitState.Held && from.cells.some(([x, z]) => x === Math.floor(u.x) && z === Math.floor(u.z))) : [];
    this.grid.release(m.id); m.cells = cells; m.rot = rot;
    this.grid.occupy(cells, m.id, { kind: "module", walkable: def.walkable, surface: def.surface ?? 0 });
    if (defId === "pier") {
      for (const s of this.spots) {                                                // 부두 위 낚시 자리(낚시터 자리 아님)는 같은 모양으로 따라감
        const i = s.dock ? -1 : from.cells.findIndex(([x, z]) => x === s.x && z === s.z); if (i < 0) continue;
        s.x = cells[i][0]; s.z = cells[i][1]; s.dir = CU.frontDir(rot);
        for (const u of this.units) if (u.focus === s) setIdle(u, this.rnd, this, 0.6);
      }
      const end = CU.frontCells(cells, rot), fz = this.zones.find(z => z.id === "fishing"), [dx, dz] = CU.frontDir(rot);
      if (fz && end.length) { fz.x = end.reduce((s, c) => s + c[0], 0) / end.length - dx; fz.z = end.reduce((s, c) => s + c[1], 0) / end.length - dz; }
      for (const u of riders) { if (this.grid.isWalkable(Math.floor(u.x), Math.floor(u.z))) continue; const s = nearestWalkable(this.grid, Math.floor(u.x), Math.floor(u.z)); if (s) { u.x = s[0] + 0.5; u.z = s[1] + 0.5; u.y = this.standHeight(u.x, u.z); } setIdle(u, this.rnd, this, 0.6); }
    }
    if (defId === "cave") { const z = this.zones.find(o => o.id === "cave"), at = CU.caveLabelAt(cells, rot); if (z && at) { z.x = at.x; z.z = at.z; } }
    if (defId === "cave" || defId === "lighthouse") this.dropDecor(cells);
    this.pruneSpots(); this.payCustom(cost);
    this.emit("moduleMoved", { module: m, from }); if (!opt.quiet) this.emit("custom", { op: "move", kind: defId, cost, x: cells[0][0], z: cells[0][1] });
    return { ok: true, cost, module: m, from, inverse: this.undoOf({ op: "moveLandmark", args: { defId, cells: from.cells, rot: from.rot, expect: cells.map(c => [c[0], c[1]]) }, refund: cost }, opt) };
  }
  /** 파기 검사(땅 → 물). opt.cur: 지금 높이 대신 볼 높이(높이 도구의 스르르 목표), e: 바뀔 높이 */
  checkDig(x, z, opt = {}, e = CU.POND_DEPTH) {
    const g = this.grid, cost = opt.free ? 0 : this.customCost("dig"), fail = (reason, short = false) => ({ ok: false, reason, cost, ...(short ? { short } : {}) });
    if (!g.inBounds(x, z)) return fail("섬 밖이에요");
    const c = g.get(x, z), cur = opt.cur ?? c.elevation; if (cur < SEA_LEVEL) return fail("이미 물이에요");
    if (c.occupiedId) return fail("건물·나무가 있는 칸은 팔 수 없어요");
    if (this.isPlot(x, z)) return fail("밭은 팔 수 없어요");
    if (g.doorOwner(x, z)) return fail("건물 문 앞은 팔 수 없어요");
    const cut = this.digLinkProblem(x, z, e); if (cut) return fail(cut);
    if (cost > this.bank.vault) return fail(CU.customReason(cost, this.bank.vault), true);
    return { ok: true, cost, x, z };
  }
  /** 메우기 검사(물 → 땅): 다리·부두가 없고, 선착장·낚시터 앞 물이 아니고, 얕은 물(FILL_MIN 이상, 플레이어가 판 칸은 깊어도 됨)이고, 4방향에 땅이 있어야 함 */
  checkFill(x, z, opt = {}) {
    const g = this.grid, cost = opt.free ? 0 : this.customCost("fill"), fail = (reason, short = false) => ({ ok: false, reason, cost, ...(short ? { short } : {}) });
    if (!g.inBounds(x, z)) return fail("섬 밖이에요");
    const c = g.get(x, z), cur = opt.cur ?? c.elevation; if (cur >= SEA_LEVEL) return fail("이미 땅이에요");
    if (c.occupiedId) return fail("다리·부두가 있는 칸은 메울 수 없어요");
    const b = this.berthOwner(x, z); if (b) return fail(`${BUILDINGS[b.defId].name} 앞 물이에요`);
    if (cur < CU.FILL_MIN - 1e-9 && !this.dug.has(CU.decorKey(x, z))) return fail("먼 바다는 메울 수 없어요");
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => g.inBounds(x + dx, z + dz) && !g.isWater(x + dx, z + dz))) return fail("땅에 붙은 물만 메울 수 있어요");
    if (cost > this.bank.vault) return fail(CU.customReason(cost, this.bank.vault), true);
    return { ok: true, cost, x, z };
  }
  /** 높이 도구(reshape)용: 땅↔물 경계를 넘으면 파기·메우기 검사를 거치고 값을 냄, 섬이 만든 먼 바다는 높이지 못함. 막히면 customRefused를 알리고 false */
  reshapeAllowed(x, z, cur, e) {
    const wasW = cur < SEA_LEVEL, willW = e < SEA_LEVEL;
    if (wasW && willW) {
      if (e > cur && cur < CU.FILL_MIN - 1e-9 && !this.dug.has(CU.decorKey(x, z))) { this.emit("customRefused", { op: "fill", reason: "먼 바다는 메울 수 없어요", cost: 0, x, z }); return false; }
      if (e < cur && cur >= CU.FILL_MIN - 1e-9 && e < CU.FILL_MIN - 1e-9) this.dug.add(CU.decorKey(x, z));   // 메울 수 있던 얕은 물을 플레이어가 깊게 팜 → 다시 높이거나 메울 수 있게(먼 바다로 잠기지 않게)
      return true;
    }
    if (wasW === willW) return true;
    const op = willW ? "dig" : "fill", r = willW ? this.checkDig(x, z, { cur }, e) : this.checkFill(x, z, { cur });
    if (!r.ok) { this.emit("customRefused", { op, reason: r.reason, cost: r.cost, x, z }); return false; }
    this.payCustom(r.cost); this.emit("custom", { op, kind: "reshape", cost: r.cost, x, z });
    return true;
  }
  /** 한 칸 파기: 높이를 POND_DEPTH(−0.6 m)로(물·모래 바닥). 선 갈매미는 가까운 땅으로(applyHeight). 성공: { ok, cost, x, z, cell: { x, z, e0, g0, e1 }, inverse } */
  digCell(x, z, opt = {}) {
    const r = this.checkDig(x, z, opt); if (!r.ok || opt.dry) return opt.dry && r.ok ? { ...r, dry: true } : r;
    const c = this.grid.get(x, z), cell = { x, z, e0: c.elevation, g0: c.groundType, e1: CU.POND_DEPTH };
    this.grid.setGround(x, z, "Sand"); this.applyHeight(x, z, CU.POND_DEPTH); this.payCustom(r.cost);
    if (!opt.quiet) this.emit("custom", { op: "dig", kind: "cell", cost: r.cost, x, z });
    return { ok: true, cost: r.cost, x, z, cell, inverse: this.undoOf({ op: "restoreCells", args: { cells: [cell] }, refund: r.cost }, opt) };
  }
  /** 한 칸 메우기: 높이를 FILL_HEIGHT(0 m, 모래)로. 바라보던 물이 땅이 된 낚시 자리는 지워짐. 성공은 digCell과 같은 모양 */
  fillCell(x, z, opt = {}) {
    const r = this.checkFill(x, z, opt); if (!r.ok || opt.dry) return opt.dry && r.ok ? { ...r, dry: true } : r;
    const c = this.grid.get(x, z), cell = { x, z, e0: c.elevation, g0: c.groundType, e1: CU.FILL_HEIGHT };
    this.applyHeight(x, z, CU.FILL_HEIGHT); this.payCustom(r.cost);
    if (!opt.quiet) this.emit("custom", { op: "fill", kind: "cell", cost: r.cost, x, z });
    return { ok: true, cost: r.cost, x, z, cell, inverse: this.undoOf({ op: "restoreCells", args: { cells: [cell] }, refund: r.cost }, opt) };
  }
  /** 여러 칸 파기·메우기(붓·길·네모): 못 하는 칸은 건너뛰고(skipped), 돈이 떨어지면 거기서 멈춤(앞의 칸은 됨). 되돌리기 하나로 묶음.
   *  { ok: 한 칸이라도 됐나, done 칸 수, cost, skipped: [{ x, z, reason }], cells, inverse, reason(아무것도 못 했을 때) } */
  digCells(cells, opt = {}) { return this.cellsOp("dig", cells, opt); }
  fillCells(cells, opt = {}) { return this.cellsOp("fill", cells, opt); }
  cellsOp(op, cells, opt) {
    const done = [], skipped = []; let cost = 0, stop = -1;
    for (let i = 0; i < cells.length; i++) {
      const [x, z] = cells[i];
      if (opt.dry) {                                                               // 미리보기: 칸마다 따로 보고 값은 쌓아서 금고와 비교
        const r = op === "dig" ? this.checkDig(x, z, { free: opt.free }) : this.checkFill(x, z, { free: opt.free });
        if (r.ok && cost + r.cost > this.bank.vault) { skipped.push({ x, z, reason: CU.customReason(cost + r.cost, this.bank.vault) }); stop = i; break; }
        if (r.ok || r.short) { if (!r.ok) { skipped.push({ x, z, reason: r.reason }); stop = i; break; } done.push({ x, z }); cost += r.cost; } else skipped.push({ x, z, reason: r.reason });
        continue;
      }
      const r = op === "dig" ? this.digCell(x, z, { free: opt.free, noUndo: true, quiet: true }) : this.fillCell(x, z, { free: opt.free, noUndo: true, quiet: true });
      if (r.ok) { done.push(r.cell); cost += r.cost; continue; }
      skipped.push({ x, z, reason: r.reason }); if (r.short) { stop = i; break; }
    }
    if (stop >= 0) for (let i = stop + 1; i < cells.length; i++) skipped.push({ x: cells[i][0], z: cells[i][1], reason: "금고가 모자라 멈췄어요" });
    const out = { ok: done.length > 0, done: done.length, cost, skipped, cells: done, reason: done.length ? "" : skipped[0]?.reason || "할 칸이 없어요" };
    if (opt.dry || !done.length) return { ...out, dry: !!opt.dry };
    this.emit("custom", { op, kind: "cells", cost, n: done.length, x: done[0].x, z: done[0].z });
    return { ...out, inverse: this.undoOf({ op: "restoreCells", args: { cells: done }, refund: cost }, opt) };
  }
  /** 높이 도구의 되돌리기·다시하기용(화면이 applyHeight를 바로 부르지 않게): 칸을 바닥 g·높이 e로. canReshape를 보고, 땅↔물 경계를 넘으면 파기·메우기 검사·값 */
  restoreCell(x, z, ground, e, opt = {}) {
    if (!this.canReshape(x, z)) return { ok: false, reason: "건물·나무·문 앞·밭 칸은 바꿀 수 없어요", cost: 0 };
    const c = this.grid.get(x, z), wasW = c.elevation < SEA_LEVEL, willW = e < SEA_LEVEL; let cost = 0;
    if (wasW !== willW) { const r = willW ? this.checkDig(x, z, opt, e) : this.checkFill(x, z, opt); if (!r.ok) return r; cost = r.cost; }
    if (opt.dry) return { ok: true, dry: true, cost };
    this.applyHeight(x, z, e); if (ground && c.groundType !== ground && !willW) { this.grid.setGround(x, z, ground); this.emit("ground", { x, z }); }
    this.payCustom(cost); return { ok: true, cost };
  }
  /** 되돌리기: 꾸미기 결과의 inverse를 실행하고 낸 값을 돌려줌. 표가 살아 있고 대상이 그대로일 때만(한 번만). 성공: { ok, refund, … } */
  applyInverse(inv) {
    const changed = why => ({ ok: false, reason: `그사이 바뀌어서 되돌릴 수 없어요${why ? ` (${why})` : ""}`, cost: 0 });
    if (!inv || !this.undo.has(inv.token)) return { ok: false, reason: "이미 되돌렸거나 되돌릴 수 없어요", cost: 0 };
    const a = inv.args || {}, free = { free: true, noUndo: true, quiet: true, restore: true }; let r;
    switch (inv.op) {
      case "removeNature": {
        const m = this.modules.find(o => o.id === a.id), e = this.trees.concat(this.ores).find(t => t.id === a.id);
        r = !m ? changed("이미 없어요") : e && (!e.sapling || e.claimed) ? changed("다 자랐거나 갈매미가 쓰는 중") : this.removeNature(a.id, free); break;
      }
      case "placeNature": r = this.placeNature(a.kind, a.x, a.z, { ...free, id: a.id, rot: a.rot, variant: a.variant, grow: a.grow, by: a.by }); break;
      case "moveLandmark": {
        const m = this.landmark(a.defId), same = m && m.cells.length === a.expect.length && m.cells.every((c, i) => c[0] === a.expect[i][0] && c[1] === a.expect[i][1]);
        r = same ? this.moveLandmark(a.defId, 0, 0, a.rot, { ...free, cells: a.cells }) : changed(); break;
      }
      case "restoreCells": {
        const g = this.grid, bad = a.cells.find(c => Math.abs(g.get(c.x, c.z).elevation - c.e1) > 1e-6 || !this.canReshape(c.x, c.z));
        if (bad) { r = changed(); break; }
        for (const c of a.cells) { this.applyHeight(c.x, c.z, c.e0); if (g.get(c.x, c.z).groundType !== c.g0) { g.setGround(c.x, c.z, c.g0); this.emit("ground", { x: c.x, z: c.z }); } }
        r = { ok: true, cells: a.cells }; break;
      }
      case "clearDecor": r = this.decor.add.get(CU.decorKey(a.x, a.z))?.k === a.k ? this.clearDecor(a.x, a.z, free) : changed(); break;
      case "placeDecor": r = this.placeDecor(a.k, a.x, a.z, { ...free, v: a.v }); break;
      case "unhideDecor": {
        const key = CU.decorKey(a.x, a.z); if (!this.decor.off.has(key)) { r = changed(); break; }
        this.decor.off.delete(key); this.emit("decorChanged", { x: a.x, z: a.z, k: this.decor.add.get(key)?.k ?? null, v: this.decor.add.get(key)?.v ?? 0, off: false }); r = { ok: true }; break;
      }
      default: r = { ok: false, reason: "모르는 되돌리기예요" };
    }
    if (!r.ok) return r.reason?.startsWith("그사이") || r.reason === "모르는 되돌리기예요" ? r : changed(r.reason);
    this.undo.delete(inv.token); const refund = Math.max(0, inv.refund || 0); this.refundCustom(refund);
    this.emit("custom", { op: "undo", kind: inv.op, cost: 0, refund, x: a.x ?? a.cells?.[0]?.x ?? a.cells?.[0]?.[0], z: a.z ?? a.cells?.[0]?.z ?? a.cells?.[0]?.[1] });
    return { ...r, refund, inverse: null };
  }

  // ---- 건물(지시서 4-1). 놓으면 공사장이 되고, 갈매미가 나무 1·돌 1을 들고 와서 망치질 3번씩 해서 완공한다.
  /** 놓을 수 있나. 경제가 있으면 마지막에 설계비(금고)를 봄 → 통과하면 { ...r, fee }. opt.free: 갈매미가 스스로 주문한 공사(설계비 없음) */
  check(defId, ax, az, rot, opt = {}) {
    const def = BUILDINGS[defId], r = checkPlacement(this.grid, def, ax, az, rot, this.units);
    if (def.upgradeFrom) return { ...r, ok: false, reason: `${def.name}은 다 지은 ${BUILDINGS[def.upgradeFrom].name}을 업그레이드해서 지어요` };   // 업그레이드로만 생기는 건물(startUpgrade)
    if (!r.ok) return r;
    if (r.cells.some(([x, z]) => this.isPlot(x, z))) return { ...r, ok: false, reason: "밭에는 지을 수 없어요" };
    if (def.fixed) return { ...r, ok: false, reason: `${def.name}은 하나뿐이에요` };
    if (def.winterOnly && this.season !== "winter") return { ...r, ok: false, reason: `${def.name}은 겨울에만 만들 수 있어요` };
    if (rankNeed(def) > this.rank) return { ...r, ok: false, reason: `🏅 마을 등급이 ${RANKS[rankNeed(def)].icon} ${RANKS[rankNeed(def)].name}이 되면 지을 수 있어요` };
    const job = def.builtBy || "builder", word = { builder: "건축", carpenter: "목수" }[job] || job;
    if (!this.units.some(u => u.job === job)) return { ...r, ok: false, reason: `${word} 갈매미가 있어야 지을 수 있어요 (🥚 소환)` };
    if (!this.builderFor(def)) return { ...r, ok: false, reason: `${RARITY[["", "common", "rare", "epic", "legend"][def.tier]].name} 이상 건축가가 있어야 지을 수 있어요` };
    if (opt.order && (opt.order.u?.coins || 0) < opt.order.cost) return { ...r, ok: false, reason: `주문한 갈매미 돈이 모자라요 (🪙${opt.order.cost})` };
    const fee = opt.free ? 0 : this.feeFor(defId);
    if (fee > this.bank.vault) return { ...r, ok: false, fee, reason: BK.feeReason(fee, this.bank.vault) };
    return { ...r, fee };
  }
  /** 건물 놓기. hits를 넘기면(불러오기·섬 만들기·시험 받침) 검사·설계비 없이. 플레이어가 놓으면 설계비를 금고에서 내고 b.fee에 적음 */
  placeBuilding(defId, ax, az, rot, id = null, hits = null, opt = {}) {
    const def = BUILDINGS[defId], r = hits !== null ? checkPlacement(this.grid, def, ax, az, rot, this.units) : this.check(defId, ax, az, rot, opt);
    if (!r.ok) return { ok: false, reason: r.reason, fee: r.fee };
    const b = createBuildingData(id || `b${this.nextId++}`, def, ax, az, rot, r.cells, r.door);
    b.elevation = r.elevation; b.need = 3 * (def.work ?? def.footprint.w * def.footprint.d); b.hits = hits ?? (this.instantBuild ? b.need : 0); b.busy = null;
    b.ramp = r.ramp; if (b.ramp) b.hits = Math.min(b.hits, b.need);
    b.fee = hits === null ? r.fee || 0 : 0;
    b.order = null; if (hits === null && opt.order && this.economy) this.openOrder(b, opt.order.u, opt.order.cost);   // 갈매미 주문 공사: 품삯·자재값을 맡김
    if (hits === null && !opt.order) { b.undoable = true; b.placedDay = newsDay(this.time); b.lowWas = this.bank.low || 0; }   // 플레이어가 놓은 공사장: 아직 아무것도 안 썼으면 ↶로 무를 수 있음(undoBuild · 저장 안 함)
    this.payFee(b);
    this.grid.occupy(b.cells, b.id, { kind: "building", walkable: (!!b.ramp && this.isDone(b)) || !!def.field || (!!def.bridge && this.isDone(b)), surface: r.elevation, ramp: b.ramp });   // 밭은 처음부터 걸어 다님   // 길찾기 장애물로 반영(grid.version 증가). 계단은 다 지으면 걸을 수 있음
    if (!def.bridge) this.grid.reserveDoor(b.door.x, b.door.z, b.id);            // 다리는 문이 없음(줄로 이어 놓음)
    if (b.ramp) this.grid.reserveDoor(b.ramp.bx, b.ramp.bz, b.id);              // 계단 위쪽 칸도 비워 둠(다른 건물·높이 바꾸기 못 함)
    this.buildings.set(b.id, b); this.powerRev++; this.emit("buildingAdded", b); if (hits === null) this.notice(b.door.x + 0.5, b.door.z + 0.5, "site");
    this.dropDecor(b.cells);                                                     // 지은 칸의 놓은 덤불·꽃은 지움(돈은 안 돌려줌)
    if (hits === null) { const was = b.undoable ? b.cells.map(([x, z]) => this.grid.get(x, z)?.groundType) : null;   // 둘레가 거의 한 가지 길이면 건물 밑 잔디도 그 바닥으로(groundMatch.js, 불러오기는 아님)
      if (matchGround(this, b) && was) b.matched = b.cells.filter(([x, z], i) => this.grid.get(x, z)?.groundType !== was[i]).map(([x, z]) => [x, z, this.grid.get(x, z).groundType, was[b.cells.findIndex(c => c[0] === x && c[1] === z)]]); }   // ↶ 짓기 되돌리기는 맞춘 바닥도 잔디로 되돌림(철거는 그대로 둠)
    if (this.isDone(b)) { this.completed(b); if (hits === null) this.builtNow(b); if (b.order) this.settleOrder(b); }   // ⚡ 바로 완공도 다 지은 것(불러오기·시험 받침은 hits를 넘김 → 아님)
    return { ok: true, building: b };
  }
  /** 짓기 되돌리기(편의성 점검 8번, 규칙은 buildUndo.js): 방금 놓고 아직 망치질·재료 쓰기 전인 공사장을 없애고 설계비를 그대로 돌려줌. { ok, reason, refund } */
  undoBuild(id) {
    const b = this.buildings.get(id), why = undoBlock(b, !!b && this.isDone(b)); if (why) return { ok: false, reason: why, refund: 0 };
    const fee = b.fee || 0, bk = this.bank;
    if (fee) { const L = feeUndoLedger(fee, b.placedDay, newsDay(this.time)); bk.vault += fee; bk.fees -= fee; this.led(L.key, L.n); b.fee = 0; b.feeHeld = false; if (bk.vault >= BK.VAULT_REARM || (!b.lowWas && bk.vault >= BK.VAULT_LOW)) bk.low = 0; }   // 놓기 전에 안 켜져 있던 '얼마 안 남음'은 다시 끔 · 같은 날이면 그날 설계비 칸에서 뺌, 날이 바뀌었으면 오늘 환불 칸에
    this.removeBuilding(id); if (fee) this.settleOwed();                           // b.fee를 0으로 해 둬서 removeBuilding이 또 돌려주지 않음
    for (const [x, z, t, was] of b.matched || []) if (this.grid.get(x, z)?.groundType === t && this.grid.setGround(x, z, was)) this.emit("ground", { x, z });   // 자동 맞춤(matchGround)으로 바뀐 칸: 그 뒤 손으로 다시 칠하지 않았으면 놓기 전 바닥으로
    b.matched = null;
    this.emit("buildUndo", { b, refund: fee });
    return { ok: true, reason: "", refund: fee, building: b };
  }
  isDone(b) { return b.hits >= b.need; }
  /** 저장할 은행 창고: 짓는 갈매미가 공사 재료로 꺼내 들고 있는 짐(u.load, 저장 안 함)을 창고에 되돌려 셈 */
  resWithLoads() { const r = { ...this.res }; for (const u of this.units) for (const [k, n] of Object.entries(u.load || {})) r[k] = (r[k] || 0) + n; return r; }
  hammer(b, u) {
    if (this.isDone(b)) return;
    this.releaseFee(b);                                                             // 첫 망치질 = 공사 시작 → 맡아 둔 설계비가 건축가에게
    b.hits = Math.min(b.need, b.hits + (u ? J.hammerPower(u) : 1));       // 건축가는 한 번에 배율만큼
    b.lastBuilder = u ? u.unitId : null; this.emit("buildingProgress", b);
    if (this.isDone(b)) { this.completed(b); this.emit("buildingDone", b); this.builtNow(b); if (!u && b.order) this.settleOrder(b); if (u) emote(u, b.ramp ? "계단 완성!" : "🏠!"); this.notice(b.door.x + 0.5, b.door.z + 0.5, "building", u); }
  }
  finishAll() { for (const b of this.buildings.values()) if (!this.isDone(b)) { b.hits = b.need; this.completed(b); this.emit("buildingDone", b); this.builtNow(b); if (b.order) this.settleOrder(b); } }
  /** 공사가 끝나 다 지어졌을 때(망치질·finishAll·⚡ 바로 완공. 불러오기는 아님): 수족관이면 갈매미들이 아껴 둔 물고기를 기증 */
  builtNow(b) { if (b.defId === "aquarium") this.donateStashes(); if (b.upFrom) { const from = b.upFrom; b.upFrom = null; this.emit("upgraded", { b, from }); } }

  // ---- 건물 업그레이드(일반병원 → 종합병원 등. def.upgradeTo / upgradeFrom으로 일반화)
  //  다 지은 건물을 그 자리에서 더 큰 건물의 공사장으로 바꿈: 문 칸·방향은 그대로, 칸은 옆·뒤로 넓힘(넓힐 칸이 막혀 있으면 안 됨).
  //  설계비(새 건물 설계비, 물가 배수)는 금고에서 · 재료·품삯은 보통 공사처럼(재료를 다 모은 뒤 지음). 공사 중에는 그 건물 기능이 멈추고 안에 있던 갈매미는 나옴.
  //  당번 의사(doctor)는 이어받음. 공사 중 철거하면 보통 공사처럼 설계비를 돌려줌(예전 건물은 돌아오지 않음).
  /** 업그레이드해서 놓일 자리: 같은 방향, 문 칸이 같고 예전 칸을 모두 덮는 앵커. 없으면 null */
  upgradeSpot(b, to = BUILDINGS[BUILDINGS[b.defId]?.upgradeTo]) {
    if (!to) return null; const own = new Set(b.cells.map(([x, z]) => `${x},${z}`)), R = Math.max(to.footprint.w, to.footprint.d);
    for (let az = b.z - R; az <= b.z + R; az++) for (let ax = b.x - R; ax <= b.x + R; ax++) {
      const fp = footprint(to, ax, az, b.rot);
      if (fp.door.x === b.door.x && fp.door.z === b.door.z && b.cells.every(([x, z]) => fp.cells.some(([cx, cz]) => cx === x && cz === z))) return { ax, az, cells: fp.cells, door: fp.door, extra: fp.cells.filter(([x, z]) => !own.has(`${x},${z}`)) };
    }
    return null;
  }
  /** 넓힐 칸 하나를 무엇이 막나(없으면 ""). 무엇이 막는지 이름으로 */
  upgradeBlock(b, x, z, e) {
    const g = this.grid, c = g.get(x, z); if (!c) return "섬 밖이에요";
    if (g.isWater(x, z)) return "옆 칸이 바다예요";
    if (c.occupiedId) { const o = this.buildings.get(c.occupiedId), m = o ? null : this.modules.find(q => q.id === c.occupiedId);
      return `옆 칸에 ${o ? josa(BUILDINGS[o.defId].name, "이", "가") : m ? josa(MODULES[m.defId]?.name || "지형지물", "이", "가") : "무언가가"} 있어요`; }
    const door = g.doorOwner(x, z); if (door && door !== b.id) { const o = this.buildings.get(door); return `옆 칸이 ${o ? BUILDINGS[o.defId].name : "다른 건물"}의 문 앞이에요`; }
    if (this.isPlot(x, z)) return "옆 칸이 밭이에요";
    if (Math.abs(c.elevation - e) > 1e-6) return "옆 칸 바닥 높이가 달라요";
    if (this.units.some(u => !u.insideBuildingId && Math.floor(u.x) === x && Math.floor(u.z) === z)) return "옆 칸에 갈매미가 서 있어요";
    return "";
  }
  /** 업그레이드할 수 있나: { ok, reason, to, fee, spot }. 화면 단추(ui/upgradeView.js)와 startUpgrade가 같은 판정을 씀 */
  upgradeCheck(b) {
    const def = b && BUILDINGS[b.defId], to = def && BUILDINGS[def.upgradeTo];
    const fail = (reason, extra = {}) => ({ ok: false, reason, to: to || null, fee: extra.fee ?? (to ? this.upgradeFee(to.id) : 0), spot: extra.spot || null });
    if (!to) return fail("업그레이드할 수 없는 건물이에요");
    if (!this.isDone(b)) return fail(`${def.name}을 다 지은 뒤에 업그레이드할 수 있어요`);
    if (rankNeed(to) > this.rank) return fail(`🏅 마을 등급이 ${RANKS[rankNeed(to)].icon} ${RANKS[rankNeed(to)].name}이 되면 업그레이드할 수 있어요`);
    const job = to.builtBy || "builder", word = { builder: "건축", carpenter: "목수" }[job] || job;
    if (!this.units.some(u => u.job === job) || !this.builderFor(to)) return fail(`${word} 갈매미가 있어야 지을 수 있어요 (🥚 소환)`);
    const spot = this.upgradeSpot(b, to); if (!spot) return fail(`${to.name}이 들어갈 자리를 못 찾았어요`);
    for (const [x, z] of spot.extra) { const why = this.upgradeBlock(b, x, z, b.elevation ?? 0); if (why) return fail(`${why} (${to.name}은 ${to.footprint.w}×${to.footprint.d}칸이라 옆·뒤로 넓혀요)`, { spot }); }
    const fee = this.upgradeFee(to.id);
    if (fee > this.bank.vault) return fail(BK.feeReason(fee, this.bank.vault), { fee, spot });
    return { ok: true, reason: "", to, fee, spot };
  }
  /** 업그레이드 설계비: 새 건물의 설계비 × 물가(경제가 없으면 0) */
  upgradeFee(toId) { return this.economy ? BK.scaled(BK.feeOf(toId), this.priceMult()) : 0; }
  /** 업그레이드 시작: 설계비를 내고, 예전 건물 자리(같은 id)에 새 건물 공사장을 놓음. { ok, reason, building } */
  startUpgrade(id) {
    const old = this.buildings.get(id), r = this.upgradeCheck(old); if (!r.ok) return { ok: false, reason: r.reason };
    const from = old.defId, keep = { doctor: old.doctor || null };
    for (const u of this.units) if (u.state === UnitState.GoToBuilding && u.targetBuildingId === id) setIdle(u, this.rnd, this);   // 가던 환자·의사는 그만(공사장에 들어가지 않게)
    this.removeBuilding(id);                                                        // 안에 있던 갈매미는 문 앞으로 · 다 지은 건물이라 설계비 환불 없음
    const put = this.placeBuilding(r.to.id, r.spot.ax, r.spot.az, old.rot, id, this.instantBuild ? 1e9 : 0);
    if (!put.ok) {                                                                  // 거의 없음(같은 판정을 앞에서 함): 예전 건물을 그대로 되돌림
      const back = this.placeBuilding(from, old.x, old.z, old.rot, id, 1e9); if (back.ok) Object.assign(back.building, { interior: old.interior, doctor: keep.doctor });
      return { ok: false, reason: put.reason };
    }
    const b = put.building; b.hits = Math.min(b.hits, b.need); b.doctor = keep.doctor; b.upFrom = from; b.fee = r.fee;
    this.payFee(b);
    this.notice(b.door.x + 0.5, b.door.z + 0.5, "site");
    this.emit("upgradeStart", { b, from, fee: b.fee });
    if (this.isDone(b)) this.builtNow(b);                                           // ⚡ 바로 완공
    return { ok: true, reason: "", building: b };
  }
  /** 다 지었을 때: 계단·낚시터는 걸을 수 있게, 밭은 칸마다 밭(심고 거둠), 낚시터는 낚시 자리 */
  completed(b) {
    const def = BUILDINGS[b.defId]; this.powerRev++;                                // 풍차가 다 지어지면 전기 범위를 다시 셈(power.js)
    if (def.house && !b.interior.furnished) { b.interior.furnished = true; for (const id of ["chair", "table"]) F.autoPlace(this, b, id); }   // 새 집엔 의자·테이블이 기본으로
    this.openStairs(b);
    if (def.field) for (const [x, z] of b.cells) if (!this.isPlot(x, z)) {
      this.grid.setGround(x, z, "Dirt"); const p = { x, z, stage: "empty", t: 0, grow: 40, claimed: null, field: b.id, moisture: FM.MOIST_START }; this.plots.push(p); this.emit("plotAdded", p);
    }
    if (def.bridge || def.pier) { const o = this.grid.occupants.get(b.id); if (o && !o.walkable) { o.walkable = true; this.grid.version++; } }
    if (def.dock) {
      const o = this.grid.occupants.get(b.id); if (o && !o.walkable) { o.walkable = true; this.grid.version++; }
      const [x, z] = b.cells[0], had = this.spots.find(s => s.x === x && s.z === z);
      if (had) had.dock = b.id;                                                    // 불러온 예전 저장(낚시 자리에 dock 표시가 빠짐)도 철거하면 같이 지워지게
      else this.spots.push({ x, z, dir: [x - b.door.x, z - b.door.z], claimed: null, dock: b.id });
    }
  }
  /** 다 지은 계단을 걸을 수 있게(길찾기 다시) */
  openStairs(b) { const o = b.ramp && this.grid.occupants.get(b.id); if (o && !o.walkable) { o.walkable = true; this.grid.version++; } }
  isHouse(b) { const d = BUILDINGS[b.defId]; return this.economy ? !!d.house : !d.stairs && !d.field && !d.dock && !d.deco; }   // 들어가 쉬는 건물(경제가 있으면 집만)
  /** 이 갈매미가 이 건물에 들어갈 수 있나: 전용 집(forUnit)은 그 갈매미만, 전용 집이 있는 갈매미(자이언트)는 그 집에만 */
  canEnter(u, b) {
    if ((b.defId === "cafe" || b.defId === "aquarium") && this.isDone(b)) return true;   // 카페·수족관은 누구나(카페: 재미·친구, 수족관: 재미가 차오름)
    if (BUILDINGS[b.defId].clinic) return this.isDone(b) && (!!u.sick || b.doctor === u.name);   // 의원: 아픈 갈매미와 당번 의사만
    if (!this.isHouse(b) || !this.isDone(b)) return false;
    if (this.economy) return HM.livesIn(b, u);                                      // 경제가 있으면 사는 집만(산 주인 + 같이 사는 갈매미, homes.js)
    return this.canFit(u, b);
  }
  removeBuilding(id) {
    const b = this.buildings.get(id); if (!b) return false;
    if (b.fee && !this.isDone(b)) {                                                // 다 짓기 전 철거(공사 취소): 설계비를 돌려줌(쓴 자재·치른 품삯은 그대로). 중앙은행: 받은 갈매미가 가진 만큼만 되돌려 받음(돈이 새로 생기지 않게)
      const t = !b.feeHeld && this.monOn() ? (this.units.find(u => u.name === b.feeTo) || (b.feeTo ? null : this.feeTaker(b.defId))) : null;   // 맡아 둔 설계비는 그대로 · 이미 건축가에게 간 건 그 갈매미가 가진 만큼만(마을을 떠났으면 0)
      const n = b.feeHeld || !this.monOn() ? b.fee : t ? Math.min(b.fee, Math.max(0, Math.floor(t.coins || 0))) : 0; if (t) t.coins -= n;
      this.bank.vault += n; this.bank.fees -= n; this.led("refunds", n); b.refunded = n; b.fee = 0; b.feeHeld = false; this.settleOwed();
    }
    if (b.order) this.settleOrder(b);                                              // 갈매미 주문 공사를 철거: 남은 맡긴 돈을 주문한 갈매미에게
    for (const u of this.units) if (u.insideBuildingId === id) exitBuilding(u, this, this.rnd);   // 안에 있던 갈매미는 문 앞으로
    for (const u of this.units) { if (u.focus === b) setIdle(u, this.rnd, this); if (u.committed === id) uncommit(u, this); }   // 짓던 갈매미는 그만(은행에서 꺼내 온 짐은 창고로)
    this.grid.release(id); this.buildings.delete(id); this.powerRev++; this.emit("buildingRemoved", b);
    for (const p of this.plots.filter(p => p.field === id)) { this.plots.splice(this.plots.indexOf(p), 1); this.emit("plotRemoved", p); }
    this.spots = this.spots.filter(s => s.dock !== id);
    for (const u of this.units) if (u.home === id) { u.home = null; if (u.loan) { this.bank.forgiven += u.loan.left; u.loan = null; } }   // 플레이어가 부순 집의 남은 빚은 없애 줌
    return true;
  }
  /** 사는 갈매미 정리(불러온 뒤): 마을에 없거나 그 집을 집으로 두지 않은 같이 사는 갈매미는 빼고, 자리보다 많으면 뒤에서부터 집 없음,
   *  주인이 마을에 없으면 같이 사는 갈매미가 주인이 됨(homes.js). 같이 살 수 없는 집(1자리)의 mates는 비움 */
  tidyResidents() {
    const byId = id => this.units.find(u => u.unitId === id);
    for (const b of this.buildings.values()) {
      if (!BUILDINGS[b.defId]?.house) { b.mates = []; continue; }
      let mates = HM.matesFromSave(b.mates).filter((id, i, a) => a.indexOf(id) === i && id !== b.owner && byId(id)?.home === b.id);
      if (b.owner != null && !byId(b.owner) && mates.length) { b.owner = mates.shift(); }
      const keep = Math.max(0, HM.homeCap(b) - (b.owner != null ? 1 : 0));
      for (const id of mates.slice(keep)) { const u = byId(id); if (u) u.home = null; }
      b.mates = mates.slice(0, keep);
    }
  }
  buildingAt(x, z) { const c = this.grid.get(x, z); return c && c.occupiedId ? this.buildings.get(c.occupiedId) || null : null; }

  // ---- 갈매미 들어 옮기기(드래그). 건물 안에 있는 갈매미는 보이지 않으므로 들 수 없다.
  pickUpUnit(u) {
    if (!u || u.insideBuildingId || u.state === UnitState.Held || u.sailing || u.state === UnitState.Faint) return false;   // 배 타는 중엔 못 집음 · 쓰러진 갈매미도(곧 병원으로 실려 가거나 그 자리에서 잠)
    uncommit(u, this); setIdle(u, this.rnd, this);                          // 하던 일(찜한 나무·낚시 자리·맡은 공사)을 내려놓음
    u.heldFrom = { x: u.x, z: u.z, y: u.y }; u.state = UnitState.Held; emote(u, BOND_STAGES[bondStage(u.bond)].held);   // 친해질수록 덜 놀람
    return true;
  }
  /** 내려놓기. 완공된 건물이면 들어가고, 걸을 수 있는 칸이면 거기 서고(나무·광석·공사장 칸이면 바로 옆 땅에),
   *  가까이 있는 것(나무·광석·낚시 자리·공사장·밭·씨앗·친구)과 바로 상호작용한다. 바다 등은 원래 자리로 돌아간다.
   *  돌려주는 값: { ok, building?, act?: { kind, label } } 또는 { ok: false, reason } */
  dropUnit(u, x, z, at = null) {                                             // at: 마우스가 가리킨 정확한 점(그 칸 안이면 거기에)
    if (!u || u.state !== UnitState.Held) return { ok: false, reason: "" };
    const b = this.grid.inBounds(x, z) ? this.buildingAt(x, z) : null, back = u.heldFrom; u.heldFrom = null;
    if (b && b.ramp && this.isDone(b) && this.grid.inBounds(x, z)) { u.x = x + 0.5; u.z = z + 0.5; u.y = this.standHeight(u.x, u.z); setIdle(u, this.rnd, this); return { ok: true }; }   // 다 지은 계단 위
    if (b && this.isDone(b) && !this.canEnter(u, b)) { u.x = back.x; u.z = back.z; u.y = back.y; setIdle(u, this.rnd, this);
      const only = BUILDINGS[b.defId].forUnit; return { ok: false, reason: only ? `${only} 전용 집이에요` : BUILDINGS[b.defId].clinic ? "병원에는 아픈 갈매미와 당번 의사만 들어가요" : `${u.name}에게는 너무 작아요(전용 집에 들어가요)` }; }
    if (b && this.isDone(b)) { u.x = b.door.x + 0.5; u.z = b.door.z + 0.5; u.y = this.grid.walkHeight(b.door.x, b.door.z) ?? 0; enterBuilding(u, b, this.rnd, this); return { ok: true, building: b }; }
    let spot = null;
    if (b) spot = this.grid.isWalkable(b.door.x, b.door.z) ? [b.door.x, b.door.z] : null;                 // 공사장: 문 앞에
    else if (this.grid.inBounds(x, z) && !this.grid.isWater(x, z)) { const s = nearestWalkable(this.grid, x, z, 2); if (s && Math.hypot(s[0] - x, s[1] - z) <= 2.5) spot = s; }   // 나무·광석 칸이면 바로 옆 땅
    if (spot) {
      const exact = at && spot[0] === x && spot[1] === z && !b;
      u.x = exact ? clampIn(at.x, x + 0.15, x + 0.85) : spot[0] + 0.5; u.z = exact ? clampIn(at.z, z + 0.15, z + 0.85) : spot[1] + 0.5; u.y = this.standHeight(u.x, u.z); setIdle(u, this.rnd, this);
      const act = interactNear(u, this, this.rnd, 2.6, b);
      if (!act) { emote(u, "휴…"); this.notice(u.x, u.z, "drop", u); return { ok: true }; }
      return { ok: true, act };
    }
    if (this.grid.inBounds(x, z) && this.grid.isWater(x, z)) {                                          // 물가(땅에서 2칸 안) 물에 놓으면 헤엄
      const land = nearestWalkable(this.grid, x, z, 2);
      if (land && Math.hypot(land[0] - x, land[1] - z) <= 2.5) { u.x = at ? clampIn(at.x, x + 0.15, x + 0.85) : x + 0.5; u.z = at ? clampIn(at.z, z + 0.15, z + 0.85) : z + 0.5; startSwimHere(u, this, this.rnd, land[0], land[1]); return { ok: true, act: { kind: "swim", label: "헤엄쳐요" } }; }
    }
    u.x = back.x; u.z = back.z; u.y = back.y; setIdle(u, this.rnd, this);
    return { ok: false, reason: b ? "공사장 문 앞이 막혀 있어요" : this.grid.isWater(x, z) ? "바다에는 내려놓을 수 없어요" : "거기에는 내려놓을 수 없어요" };
  }

  update(dt) {
    this.time += dt;
    if (this.shaping.size) this.stepShaping(dt);
    this.stepCustom(dt);
    this.stepWeather(dt); this.stepSnow(dt); this.stepSky(dt); this.stepSparkles(dt);
    const grow = this.fx.grow;                                                   // 계절·비에 따라 밭이 빨리/늦게 자람 × 촉촉함(마른 밭은 1/4 빠르기까지 느려짐, farming.js)
    for (const p of this.plots) { FM.stepMoisture(p, dt, this.season, this.weather.kind); if (p.stage === "growing" && (p.t -= dt * grow * FM.waterFactor(p.moisture)) <= 0) { p.stage = "ripe"; this.emit("plot", p); } }
    if ((this.priceClock += dt) >= 5) { this.priceClock = 0; this.updatePrices(); this.tallyJobless(5); }
    if ((this.histClock += dt) >= 20) { this.histClock = 0; this.priceHist.push({ t: Math.round(this.time), ...this.prices }); if (this.priceHist.length > 48) this.priceHist.shift(); }
    this.stepWishes(dt); this.stepFestival(dt); this.stepBank(); this.stepLodging();
    if ((this.rankClock += dt) >= 2) { this.rankClock = 0; this.updateRoads(); this.stepRank(); }
    for (let i = this.timers.length - 1; i >= 0; i--) if ((this.timers[i].t -= dt) <= 0) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
    this.air = this.airNow();
    for (const u of this.units) updateUnit(u, dt, this, this.rnd);
    this.stepHealth(dt);
    this.separate();
  }
  // 겹친 갈매미를 살짝 밀어냄. 밀린 자리가 걸을 수 없는 칸이면 밀지 않는다.
  // 걷는 중인 갈매미는 밀지 않음(잠깐 겹쳐 지나감) → 좁은 곳에서 서로 밀다가 제자리에서 떠는 일이 없음.
  separate() {
    const us = this.units.filter(u => !u.insideBuildingId && !u.swimming && u.state !== UnitState.Held && !(u.path && u.pathIndex < u.path.length));
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
      const A = us[i], B = us[j], dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
      const ra = 0.16 * (A.scale || 1) + 0.08, rb = 0.16 * (B.scale || 1) + 0.08, min = ra + rb;
      if (d >= min || d < 1e-5) continue;
      const push = (min - d) / d, wa = rb / min, wb = ra / min;
      const move = (u, mx, mz) => { const nx = u.x + mx, nz = u.z + mz;
        if (this.grid.isWalkable(Math.floor(nx), Math.floor(nz))) { u.x = nx; u.z = nz; } };
      move(A, -dx * push * wa, -dz * push * wa); move(B, dx * push * wb, dz * push * wb);
    }
  }

  // ---- ✨ 반짝이(sparkles.js): 하루 몇 번 생기고, 플레이어가 주우면 내 주머니로
  /** 수명이 다했거나 그 칸을 이제 못 쓰면(그사이 건물·물) 지우고, SPARKLE_EVERY초마다 한 회차 */
  stepSparkles(dt) {
    sparkleDusk(this);   // 🌙 해 뜨면 밤 반짝이 옅어짐 · 해 지면 첫 밤 반짝이를 곧
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i]; if ((s.t -= dt) > 0 && sparkleCellFree(this, s.x, s.z)) continue;
      this.sparkles.splice(i, 1); this.emit("sparkleGone", s);
    }
    if ((this.sparkClock += dt) >= SPARKLE_EVERY) { this.sparkClock = 0; this.spawnSparkles(); }
  }
  /** 한 회차: 바닷가 1 + 마을 1(sparkRnd만 씀). 생긴 반짝이들을 돌려줌(시험 손잡이로도 씀) */
  spawnSparkles() {
    const night = this.isNight === true; if (sparkleRoom(this.sparkles, night) <= 0) return [];
    const made = rollSparkles(sparkleCells(this), this.sparkles, this.season, this.sparkRnd, undefined, night).map(s => ({ id: this.sparkId++, k: s.k, x: s.x, z: s.z, t: sparkleLife(s.k) }));
    for (const s of made) { this.sparkles.push(s); this.emit("sparkleSpawn", s); }
    return made;
  }
  /** 반짝이 줍기: 내 주머니(world.items)에 하나 넣음. 주운 물건(ITEMS 줄)을 돌려줌, 없으면 null.
   *  알림: sparkleGone({ ...s, picked: true }) → sparkle({ item, s }) */
  pickSparkle(id) {
    const i = this.sparkles.findIndex(s => s.id === id); if (i < 0) return null;
    const s = this.sparkles[i], item = ITEMS.find(it => it.id === s.k); this.sparkles.splice(i, 1);
    if (!item) return null;
    this.items[item.id] = (this.items[item.id] || 0) + 1;
    this.emit("sparkleGone", { ...s, picked: true }); this.emit("sparkle", { item, s }); return item;
  }
  /** 이 자리(격자 좌표, 연속값도 됨)에서 r칸 안의 가장 가까운 반짝이(칸 가운데와의 거리). 없으면 null */
  sparkleNear(x, z, r = SPARKLE_PICK_R) {
    let best = null, bd = r;
    for (const s of this.sparkles) { const d = Math.hypot(s.x + 0.5 - x, s.z + 0.5 - z); if (d <= bd) { bd = d; best = s; } }
    return best;
  }

  // ---- 예전 저장 옮기기(소지품 개편 전: 갈매미가 잡은 것이 마을 가방 world.treasures·items에 쌓였음). 난수를 쓰지 않음
  /** 원칙: 갈매미가 잡은 것을 플레이어에게 주지 않고, 플레이어가 받은 것은 말없이 지우지 않음.
   *  보물 물고기 → 낚시꾼(없으면 모두)에게 돌아가며 · 간직 표시 없는 물건 → 갈매미들에게(별조각은 야행성에게) · 간직한 물건·가구 → 내 가방에 그대로.
   *  옮긴 수 { fish, items, kept }를 돌려주고 this.migrated에 적음(저장 안 함) */
  /** 갈매미가 하나도 없어 미뤄 둔 예전 저장 옮기기: 첫 갈매미가 오면(summon·addUnitByName) 그때 옮기고, 수족관이 있으면 기증 */
  migrateLate() { if (!this.ownershipPending) return; this.migrateOwnership(); if (!this.ownershipPending && this.aquariumB()) this.donateStashes(); }
  migrateOwnership() {
    const res = { fish: 0, items: 0, kept: 0 }, units = this.units;
    this.ownershipPending = !units.length; if (!units.length) return res;      // 갈매미가 없으면 미뤄 둠(저장에 ownership 0) → 처음 부르는 갈매미 때 옮김(addUnitByName)
    const fishers = units.filter(u => u.job === "fisher"), night = units.filter(isNocturnal);
    const deal = (list, id, n) => { for (let k = 0; k < n; k++) stashAdd(list[k % list.length], id); };
    for (const f of FISH) {
      const n = Math.floor(+this.treasures[f.id] || 0); if (!(f.id in this.treasures)) continue;
      delete this.treasures[f.id]; delete this.keep[f.id]; if (n <= 0 || !stashDef(f.id)) continue;
      deal(fishers.length ? fishers : units, f.id, n); res.fish += n;
    }
    for (const it of ITEMS) {
      const n = Math.floor(+this.items[it.id] || 0); if (n <= 0 || it.furniture || it.gift) continue;
      if (this.keep[it.id]) { res.kept += n; continue; }
      delete this.items[it.id]; deal(it.id === STAR_ITEM && night.length ? night : units, it.id, n); res.items += n;
    }
    if (res.fish + res.items) addNews(this.newsLog, this.time, { icon: "📦", text: `예전 마을 가방의 ${[res.fish ? `물고기 ${res.fish}마리` : "", res.items ? `물건 ${res.items}개` : ""].filter(Boolean).join("·")}를 갈매미들이 나눠 가졌어요. 선물은 이제 ✨ 반짝이를 주워서!`, weight: 4 });
    this.migrated = res; return res;
  }

  // ---- 저장/불러오기
  /** savedAt: 저장하는 실제 시각(ms). 월드는 기기 시계를 모르므로 화면이 넣어 줌. */
  serialize(savedAt = null) {
    this.syncGrow();
    return { version: 2, ownership: this.ownershipPending ? 0 : 1, seed: this.seed ?? null, nextId: this.nextId, grid: this.grid.serialize(), modules: this.modules,
      spots: this.spots.map(({ x, z, dir, dock }) => dock ? { x, z, dir, dock } : { x, z, dir }), zones: this.zones,
      decor: CU.decorToSave(this.decor), dug: [...this.dug].map(k => k.split(",").map(Number)), res: this.resWithLoads(),
      treasures: this.treasures, collection: this.collection, items: this.items, stall: this.stall,
      plots: this.plots.map(({ x, z, stage, t, grow, moisture }) => ({ x, z, stage, t, grow, moisture: Math.round((moisture ?? 1) * 1000) / 1000 })),
      units: this.units.map(u => ({ name: u.name, coins: u.coins || 0, saved: u.saved || 0, inv: u.inv, home: u.home || null, raw: u.raw, goods: u.goods, friends: friendsToNames(u, this.units), bond: u.bond || 0, bondGifts: u.bondGifts || 0, petDay: u.petDay || 0, petN: u.petN || 0, lodgeNight: u.lodgeNight || null, cheer: Math.round(u.cheer || 0), stash: u.stash || {}, loan: u.loan || null, wageOwed: u.wageOwed || 0, loanRefused: !!u.loanRefused, bodyT: Math.round((u.bodyT ?? CLIM.BODY_NORMAL) * 10) / 10, feltCold: u.feltCold || 0, clothes: u.clothes || [], wear: u.wear || CLO.emptyWear(), sick: u.sick ? { kind: u.sick.kind, left: Math.round(u.sick.left), med: !!u.sick.med } : null, immune: Math.round(u.immune || 0), wet: Math.round((u.wet || 0) * 100) / 100 })), healthStats: this.healthStats, keep: this.keep, bank: this.bank, wild: !!this.wild, weather: this.weather, wishDone: this.wishDone, rank: this.rank, granary: this.granary, wishes: this.wishes, priceHist: this.priceHist, time: this.time, snow: this.snow, newsLog: this.newsLog, newsSeason: this.newsSeason, savedAt, donated: this.donated, fishRecord: this.fishRecord, donateGifts: this.donateGifts, medalGifts: this.medalGifts,
      skySeen: this.skySeen, firstSnowYear: this.firstSnowYear,
      festival: this.festival, festivals: this.festivals,
      daily: this.daily, stamps: this.stamps, stampBought: this.stampBought,
      sparkles: this.sparkles.map(({ k, x, z, t }) => ({ k, x, z, t })), sparkClock: this.sparkClock,
      buildings: [...this.buildings.values()].map(b => ({ id: b.id, defId: b.defId, x: b.x, z: b.z, rot: b.rot, hits: b.hits, interior: b.interior, owner: b.owner || null, ...(b.mates?.length ? { mates: b.mates } : {}), fee: b.fee || 0, ...(b.feeHeld ? { feeHeld: 1 } : {}), ...(b.feeTo ? { feeTo: b.feeTo } : {}), order: b.order ? { by: b.order.by, left: b.order.left } : null, ...(b.doctor ? { doctor: b.doctor } : {}), ...(b.upFrom ? { up: b.upFrom } : {}) })) };
  }
  static fromJSON(j, rnd = Math.random) {
    if (!j || ![1, 2].includes(j.version)) throw new Error("저장 형식이 달라요");
    const w = new World(Grid.fromJSON(j.grid), j.modules, rnd, j);
    w.time = j.time || 0;
    if (j.firstSnowYear === undefined && w.snow > 0.02) w.firstSnowYear = "?";    // 예전 저장(첫눈 기록 없음)인데 눈이 쌓여 있으면 이번 겨울 첫눈은 지난 일
    w.seed = j.seed; if (j.res) Object.assign(w.res, j.res);
    Object.assign(w.treasures, j.treasures || {}); Object.assign(w.collection, j.collection || {}); Object.assign(w.items, j.items || {});
    for (const s of j.buildings) { const r = w.placeBuilding(s.defId, s.x, s.z, s.rot, s.id, s.hits ?? 1e9); if (r.ok) { r.building.interior = s.interior; r.building.hits = Math.min(r.building.hits, r.building.need); r.building.owner = s.owner || null; r.building.mates = HM.matesFromSave(s.mates); r.building.fee = Math.max(0, +s.fee || 0); r.building.feeHeld = !!s.feeHeld && r.building.fee > 0; r.building.feeTo = typeof s.feeTo === "string" ? s.feeTo : null; r.building.order = s.order && s.order.by != null ? { by: s.order.by, left: Math.max(0, Math.floor(+s.order.left || 0)) } : null; r.building.doctor = BUILDINGS[s.defId]?.clinic && typeof s.doctor === "string" ? s.doctor : null;
      r.building.upFrom = !w.isDone(r.building) && BUILDINGS[s.defId]?.upgradeFrom === s.up ? s.up : null; } }   // 업그레이드 공사 중(예전 저장엔 없음 → 보통 공사)
    w.wild = !!j.wild; if (w.wild) { w.hungerScale = 0.48; w.seedFood = 20; }
    w.decor = CU.decorFromSave(j.decor, (x, z, k) => !w.landProblem(x, z, k));      // 덤불·꽃 겹(예전 저장엔 없음 → 빈 겹). 건물을 다시 놓은 뒤에(그사이 못 쓰게 된 칸은 버림)
    const saved = (j.units || null)?.map(u => typeof u === "string" ? { name: u } : u);
    w.spawnUnits(saved ? saved.map(u => u.name) : undefined);                       // 예전 저장(units 없음)은 8마리 모두
    for (const s of saved || []) { const u = w.units.find(o => o.name === s.name); if (!u) continue; u.coins = s.coins || 0; u.saved = Math.max(0, Math.floor(+s.saved || 0)); if (s.inv) u.inv = { ...E.newBag(), ...s.inv }; u.home = s.home || null; if (s.raw) u.raw = { ...u.raw, ...s.raw }; if (s.goods) u.goods = { ...u.goods, ...s.goods }; friendsFromNames(u, s.friends, w.units);
      u.bond = Math.max(0, Math.min(BOND_MAX, +s.bond || 0)); u.bondGifts = Math.max(0, Math.min(BOND_STAGES.length - 1, s.bondGifts | 0)); u.lodgeNight = typeof s.lodgeNight === "string" ? s.lodgeNight : null; u.petDay = s.petDay | 0; u.petN = Math.max(0, s.petN | 0); u.cheer = Math.max(0, Math.min(FESTIVAL_CHEER_SECS, +s.cheer || 0)); u.stash = stashFromSave(s.stash);
      u.loan = BK.loanFromSave(s.loan); u.wageOwed = Math.max(0, Math.floor(+s.wageOwed || 0)); u.loanRefused = !!s.loanRefused;   // 대출·밀린 품삯(예전 저장엔 없음 → 없음)                       // 정·답례·쓰다듬기(예전 저장엔 없음 → 0)   // 친구 사이는 이름으로(예전 저장엔 없음 → 처음부터)
      u.bodyT = Number.isFinite(+s.bodyT) && s.bodyT != null ? Math.max(35, Math.min(43, +s.bodyT)) : CLIM.BODY_NORMAL; u.feltCold = Math.max(0, s.feltCold | 0);   // 체온·추웠던 횟수(예전 저장엔 없음 → 40.0 · 0)
      u.clothes = CLO.clothesFromSave(s.clothes); u.wear = CLO.wearFromSave(s.wear, u.clothes);   // 가진 옷·입은 옷(예전 저장엔 없음 → 빈 옷장)
      u.sick = HL.sickFromSave(s.sick); u.immune = Math.max(0, Math.min(HL.IMMUNE_SECS, +s.immune || 0)); u.wet = Math.max(0, Math.min(1, +s.wet || 0)); }   // 병·면역(예전 저장엔 없음 → 건강)
    w.bank = BK.bankFromSave(j.bank, w.time);                                     // 갈매미를 다시 만든 뒤에(상인 창업 자금이 두 번 세지지 않게). 금고가 없는 예전 저장은 100 + 돌아온 돈
    w.bank.owed = w.units.reduce((s, u) => s + (u.wageOwed || 0), 0);
    for (const b of w.buildings.values()) if (b.doctor && !w.units.some(u => u.name === b.doctor)) b.doctor = null;   // 마을에 없는 당번 의사는 비움
    w.tidyResidents();
    w.daily = dailyFromSave(j.daily);                                             // 오늘의 부탁은 다 만든 뒤에(불러오며 다시 놓는 건물을 세지 않게. 예전 저장엔 없음 → 화면이 날짜를 넣어 줄 때 새로 고름)
    // 반짝이: 아는 것만, 그사이 못 쓰게 된 칸은 버림(id는 새로 매김). 시계가 없으면(예전 저장) 첫 반짝이는 SPARKLE_FIRST초 뒤
    w.sparkles = sparklesFromSave(j.sparkles).filter(s => sparkleCellFree(w, s.x, s.z)).map(s => ({ id: w.sparkId++, ...s }));
    if (Number.isFinite(j.sparkClock)) w.sparkClock = Math.min(SPARKLE_EVERY, Math.max(0, j.sparkClock));
    if (!j.ownership) { w.migrateOwnership(); if (!w.ownershipPending && w.aquariumB()) w.donateStashes(); }   // 소지품 개편 전 저장: 한 번만(다시 저장하면 ownership 표시가 붙음). 수족관이 있으면 옮겨 받은 물고기를 바로 기증
    w.nextId = j.nextId; return w;
  }
}
