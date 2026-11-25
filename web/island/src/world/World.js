// 섬 전체 상태: 격자, 해안 모듈, 자원(나무·광석·씨앗·낚시 자리), 건물, 유닛.
// 그림과 입력은 모르고, 바뀐 일을 이벤트(on/emit)로 알린다. 뷰가 이벤트와 매 프레임 상태를 읽어 그린다.
import { BUILDINGS, MODULES, UNITS, RARITY, FISH, ITEMS, PRICES, FURNITURE } from "../data/catalog.js";
import { WATER_Y } from "../config.js";
import * as J from "./jobs.js";
import { createBuildingData, createUnitAIState, UnitState } from "../data/types.js";
import { Grid } from "./Grid.js";
import { generateIsland, generateWildIsland } from "./islandGen.js";
import { checkPlacement } from "./placement.js";
import { terrainHeight } from "./terrain.js";
import { nearestWalkable, findPath } from "./pathfinding.js";
import { updateUnit, exitBuilding, enterBuilding, setIdle, emote, uncommit, interactNear, startSwimHere, isNocturnal } from "../units/unitBrain.js";
import { initMind, befriend, FRIEND_STAGES, friendStage, affinity, friendsToNames, friendsFromNames } from "../units/mind.js";
import { seededRandom } from "../util.js";
import * as E from "./economy.js";
import * as S from "./season.js";
import { WISHES, WISH_BY_ID, WISH_REWARD } from "./wishes.js";
import { RANKS, RANK_REWARD, rankScore, rankNeed } from "./rank.js";
import * as F from "./furniture.js";
import * as RD from "./roads.js";
import { sizeNoise, fishSize, donatable, giftsEarned, DONATE_GIFTS, donatedFromSave, recordsFromSave } from "./aquarium.js";
import { newsFor, addNews, newsFromSave, awayHours, awayCasts, newsDay } from "./news.js";
import { SKY_EVENTS, skySeed, RAINBOW_CHANCE, METEOR_CHECK_SECS, METEOR_CHANCE, STAR_CHECK_SECS, STAR_CHANCE, STAR_MAX, STAR_ITEM, SKY_LOOK_CHANCE, skySeenFromSave } from "./skywatch.js";
import { FESTIVAL_RANK, FESTIVAL_SECS, FESTIVAL_CHEER_SECS, festivalOf, festivalGift, festivalPlaza, festiveCount, festivalFromSave, festivalsFromSave } from "./festival.js";
import { rollDaily, dailyNote, dailyAllDone, dailyFromSave, stampBoughtFromSave, STAMP_SHOP, STAMP_GIFTS, stampCost } from "./daily.js";
import { BOND_MAX, BOND_STAGES, bondStage, GIFT_TIERS, giftDef, giftTier, PET_DAILY, PET_BOND, PET_FUN, petsLeft, thanksFor, keepFromSave, STAMP_GIFT_BOND } from "./bond.js";
import { STASH_CUT, stashDef, stashPrice, stashFurniture, stashSellable, stashFromSave, stashAdd } from "./belongings.js";
import * as BK from "./bank.js";
import * as P from "./population.js";
import { SPARKLE_EVERY, SPARKLE_MAX, SPARKLE_LIFE, SPARKLE_FIRST, SPARKLE_PICK_R, sparkleSeed, sparkleCells, sparkleCellFree, rollSparkles, sparklesFromSave } from "./sparkles.js";

export const SPEED_BOOST = 1.6;        // 섬은 마을보다 넓어서 걷기·달리기를 이만큼 빠르게(애니메이션도 같은 배율로 빨라짐)
const START_WOOD = 6, START_STONE = 6;

const clampIn = (v, a, b) => Math.min(b, Math.max(a, v));

/** 계단 디딤판: 단 수는 높이 0.12 m에 한 단(3~12단), t(0 입구 → 1 위쪽)에서 밟는 높이. 그림(views.js)과 같은 식. */
export const stairCount = r => Math.max(3, Math.min(12, Math.round((r.h1 - r.h0) / 0.12)));
export const stairStep = (r, t) => { const n = stairCount(r), i = Math.min(n - 1, Math.max(0, Math.floor(t * n))); return r.h0 + (r.h1 - r.h0) * (i + 1) / n; };

export class World {
  constructor(grid, modules, rnd = Math.random, extra = {}) {
    this.grid = grid; this.modules = modules; this.rnd = rnd; this.time = 0;
    this.buildings = new Map(); this.units = []; this.nextId = 1; this.listeners = {}; this.timers = [];
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
    this.plots = (extra.plots || []).map(p => ({ x: p.x, z: p.z, stage: p.stage || "empty", t: p.t || 0, grow: p.grow || 40, claimed: null }));
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
    for (const m of modules) {
      const def = MODULES[m.defId];
      grid.occupy(m.cells, m.id, { kind: "module", walkable: def.walkable, surface: def.surface ?? 0 });
      const [x, z] = m.cells[0];
      if (m.defId === "tree" || m.defId === "palm") this.trees.push({ id: m.id, x, z, alive: true, hp: 3, claimed: null });
      if (m.defId === "ore") this.ores.push({ id: m.id, x, z, alive: true, hp: 3, claimed: null });
    }
  }
  /** empty: 갈매미 없이 시작. wild: 넓은 섬(자연만 + 가운데 공식은행 + 다 지은 작은 집 한 채, 갈매미 없음 → 첫 갈매미는 🥚 소환으로. 게임 화면).
   *  firstGull: 넓은 섬에 기본 갈매미를 미리 불러 둠(시험 받침). 시험은 기본값(예전 섬, 8마리 모두). */
  static create(seed = 7, rnd = Math.random, { empty = false, wild = false, firstGull = false } = {}) {
    const g = wild ? generateWildIsland(seed) : generateIsland(seed), w = new World(g.grid, g.modules, rnd, g);
    w.seed = seed; w.wild = wild; w.sparkRnd = seededRandom(sparkleSeed(seed, 0));   // 반짝이 난수는 섬 씨앗으로(생성 결과 g에는 seed가 없음)
    if (wild) {
      Object.assign(w.res, { wood: 0, stone: 0, iron: 0, food: 0, fish: 0 });     // 은행 창고는 비어서 시작
      w.hungerScale = 0.48; w.seedFood = 20;                                       // 넓은 지도: 오가는 길이 멀어 배고픔을 늦춤(본섬 지름 1.3배 → 0.6 × 0.8)
      w.placeBank(g.center);                                                       // 가운데 공식은행(가운데가 평평하지 않은 섬은 가장 가까운 평지)
      w.placeStarterHouse();                                                       // 인구 = 집 수: 첫 갈매미가 올 집 한 채(다 지은 작은 집, 설계비 없음)
      if (firstGull) w.addUnitByName("기본");
    } else if (!empty) w.spawnUnits();
    return w;
  }
  /** 새 섬의 공식은행: 가운데에, 가운데 바닥이 평평하지 않으면(섬 씨앗 열에 하나쯤) 가운데에서 가장 가까운 놓을 수 있는 자리에(난수 안 씀). 못 찾으면 null */
  placeBank(c = this.center) {
    const def = BUILDINGS.bank, x0 = Math.floor(c.x) - Math.floor(def.footprint.w / 2), z0 = Math.floor(c.z) - Math.floor(def.footprint.d / 2), cands = [];
    for (let dz = -12; dz <= 12; dz++) for (let dx = -12; dx <= 12; dx++) cands.push([Math.hypot(dx, dz), x0 + dx, z0 + dz]);
    cands.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
    for (const [, x, z] of cands) { const r = this.placeBuilding("bank", x, z, 0, null, 1e9); if (r.ok) return r.building; }
    return null;
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
  get center() { return { x: this.grid.w / 2, z: this.grid.h / 2 }; }
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
    if (this.economy && s.job === "merchant") this.issue(s, E.MERCHANT_START);  // 상인 창업 자금(은행)
    if (this.profiles) this.applyProfile(s);
    this.units.push(s); return s;
  }
  // ---- 인구 = 집 수(population.js): 공식은행이 있는 섬에서는 다 지은 집 한 채당 갈매미 한 마리까지만 부를 수 있음
  /** 화면용: 지금 🥚 소환할 수 있는가와 까닭(난수 안 씀).
   *  { can, reason(못 부를 때 한국어 글, 부를 수 있으면 ""), houses(다 지은 보통 집), gulls(보통 갈매미), free(남은 집 자리), left(아직 안 온 갈매미 수),
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
  gain(u, item, n) { if (this.economy && u && u.inv) u.inv[item] = (u.inv[item] || 0) + n; else this.res[item] = (this.res[item] || 0) + n; }
  issue(u, coins) { u.coins = (u.coins || 0) + coins; this.bank.issued += coins; }
  merchantU() { return this.units.find(u => u.job === "merchant") || null; }
  /** 시장: 원자재(나무·돌·철)를 상인에게 팖. 상인 돈이 허락하는 만큼. */
  sellToMarket(u) {
    const m = this.merchantU(), items = { wood: 0, stone: 0, iron: 0 }; let coins = 0;
    if (!this.marketB() || !m || m === u) return { items, coins };
    for (const k of E.RAW) {
      const price = this.prices[k] ?? E.MARKET_BUY[k], n = Math.min(u.inv[k] || 0, Math.floor((m.coins || 0) / price)); if (!n) continue;
      const c = n * price; u.inv[k] -= n; m.raw[k] += n; m.coins -= c; u.coins = (u.coins || 0) + c; items[k] = n; coins += c;
    }
    this.emit("market", { u, kind: "sell", items, coins }); return { items, coins };
  }
  /** 상인: 사 들인 원자재를 가공(목재·석재·철괴). 가공한 개수를 돌려줌. */
  processRaw(m) { let n = 0; for (const k of E.RAW) { const c = m.raw[k] || 0; m.raw[k] = 0; m.goods[k] = (m.goods[k] || 0) + c; n += c; } return n; }
  /** 상인: 가공품을 공식은행에 팖 → 새 돈, 은행 창고(공사 재료)로 */
  sellProcessed(m) {
    let coins = 0; const items = { ...m.goods };
    for (const k of E.RAW) { const n = m.goods[k] || 0; if (!n) continue; coins += n * E.BANK_PROCESSED[k]; this.res[k] = (this.res[k] || 0) + n; m.goods[k] = 0; }
    if (coins) this.issue(m, coins);
    this.emit("bank", { u: m, items, coins }); return { items, coins };
  }
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
    if (b?.order || b?.orderBy != null) { const n = this.payOrder(b, E.WAGE); u.coins = (u.coins || 0) + n; if (b.order && this.isDone(b)) this.settleOrder(b); return; }   // 이미 정산된 주문 공사(orderBy)의 마지막 품삯도 금고가 아니라 주문한 갈매미 지갑에서
    this.settleOwed();
    if (this.bank.vault >= E.WAGE && !(u.wageOwed > 0)) { this.bank.vault -= E.WAGE; this.bank.wages += E.WAGE; this.led("wages", E.WAGE); u.coins = (u.coins || 0) + E.WAGE; this.checkLow(); return; }
    u.wageOwed = (u.wageOwed || 0) + E.WAGE; this.bank.owed += E.WAGE;
    emote(u, "품삯이 밀렸어…", 2); this.emit("wageOwed", { u, n: E.WAGE }); this.vaultShort("wage", u);
  }
  /** 시장에서 낸 돈: 상인이 가판에 있으면 몫을 주고 나머지는 금고로(회수) */
  pay(u, price) {
    u.coins -= price; const m = this.units.find(o => o.job === "merchant" && o.state === UnitState.Trade);
    const cut = m && m !== u ? Math.min(price, E.COMMISSION) : 0; if (cut) m.coins = (m.coins || 0) + cut;
    this.deposit(price - cut);
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
    if (!e || e.day !== d) { e = { day: d, tax: 0, returned: 0, fees: 0, wages: 0, lent: 0, refunds: 0 }; L.push(e); while (L.length > BK.LEDGER_DAYS) L.shift(); }
    e[key] += n;
  }
  /** 금고에 돈이 들어옴: kind "returned"(갈매미가 낸 돈) | "tax". 들어올 때마다 밀린 품삯부터 갚음 */
  deposit(n, kind = "returned") {
    if (!(n > 0)) return;
    this.bank.vault += n; if (kind === "tax") { this.bank.taxed += n; this.led("tax", n); } else { this.bank.returned += n; this.led("returned", n); }
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
  priceMult() { return this.economy ? BK.priceMult(this.rank, this.growthCount()) : 1; }
  /** 화면용 물가 정보: { mult, rank, n, free, rankPart, buildPart, cap, nextAt }. nextAt = 다음 집·시설 몇 채째부터 오르는지(최대면 null) */
  priceInfo() {
    const rank = this.rank || 0, n = this.growthCount(), mult = this.priceMult();
    return { mult, rank, n, free: BK.PRICE_FREE, rankPart: +BK.rankPartOf(rank).toFixed(2), buildPart: +BK.buildPartOf(n).toFixed(2),
      cap: BK.PRICE_CAP, nextAt: mult >= BK.PRICE_CAP ? null : Math.max(n, BK.PRICE_FREE) + 1 };
  }
  /** 지금 집값(물가를 곱한 값). b는 건물 또는 defId */
  housePrice(b) { const def = BUILDINGS[typeof b === "string" ? b : b?.defId]; return BK.scaled(def?.price || 30, this.priceMult()); }
  /** 집 거래 판단 { ok, price, down, loan, reason }(난수 안 씀). 값은 지금 물가로 */
  houseDeal(u, b) { return BK.houseDealFor(this.economy ? this.housePrice(b) : BUILDINGS[b.defId].price || 30, u.coins, this.bank.vault, this.economy); }
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
    bk.day = d; if (!this.economy) return;
    for (const b of this.buildings.values()) if (b.order && this.isDone(b)) this.settleOrder(b);   // 다 지었는데 마지막 품삯 전에 일이 끊긴 주문 공사: 남은 돈 돌려줌
    let total = 0, n = 0;
    for (const u of this.units) {
      const out = !u.insideBuildingId; let said = false;
      if (u.loan) {
        const k = BK.repayOf(u.loan, u.coins);
        if (k) { u.coins -= k; u.loan.left -= k; bk.repaid += k; this.deposit(k); }
        if (u.loan.left <= 0) { u.loan = null; emote(u, "🏠 집값 다 갚았다!", 2.4); said = true; this.emit("loanPaid", { u }); }
        else if (!k && out) { emote(u, "집값은 내일 갚을게…", 2); said = true; }
      }
      const t = BK.taxOf(u.coins); if (!t) continue;
      u.coins -= t; this.deposit(t, "tax"); total += t; n++;
      if (out && !said) emote(u, `🏦 -${t}`, 1.6);
    }
    this.emit("tax", { total, n });
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
    this.pay(u, deal.down);                                                       // 빌려준 돈은 곧바로 집값으로 돌아오므로 금고에는 계약금만큼 늘어남
    if (deal.loan) { u.loan = { left: deal.loan, per: BK.perOf(deal.loan) }; this.bank.lent += deal.loan; this.led("lent", deal.loan); }
    u.loanRefused = false; b.owner = u.unitId; u.home = b.id;
    for (const [id, n] of Object.entries(u.stash || {})) { const fid = stashFurniture(id); if (!fid || !(n > 0)) continue; const it = F.room(b); it.stash[fid] = (it.stash[fid] || 0) + n; delete u.stash[id]; }   // 들고 다니던 낚시 가구는 새 집 창고로
    this.emit("market", { u, kind: "house", b, down: deal.down, loan: deal.loan }); return true;
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
    const k = this.weather.kind, winter = this.season === "winter";
    const goal = winter ? (k === "snow" ? 1 : k === "rain" ? 0.15 : k === "storm" ? 0.7 : 0.55) : 0;
    const rate = goal > this.snow ? (k === "snow" ? 1 / 80 : 1 / 400) : (winter ? 1 / 300 : k === "rain" ? 1 / 30 : 1 / 60);
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
    u.coins -= def.price; this.deposit(def.price);
    if (!F.autoPlace(this, home, id)) { const it = F.room(home); it.stash[id] = (it.stash[id] || 0) + 1; }
    this.emit("furnitureBought", { u, id, b: home }); return true;
  }

  // ---- 전기(풍차 발전소 둘레 18칸)
  powered(b) { return [...this.buildings.values()].some(p => BUILDINGS[p.defId].power && this.isDone(p) && Math.hypot(p.x + 1 - (b.x + 1), p.z + 1 - (b.z + 1)) <= 18); }
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
  /** 갈매미가 스스로 소지품을 팖: 먼저 수족관 기증, 그다음 팔 것(belongings.js stashSellable)을 카탈로그 값에 팖.
   *  조개는 주인에게(상인 몫 STASH_CUT/개, 상인 자신이 팔 땐 없음). 경제 마을이면 은행이 사들여 새 돈을 찍음(물건은 마을 밖으로).
   *  시장(경제가 없으면 가판대)이나 상인이 없으면 아무 일 없음. 돌려주는 값: { n 판 개수, coins 판 값, cut 상인 몫, items [{ id, n }], donated [물고기] } */
  sellStash(u) {
    const m = this.merchantU(), place = this.economy ? this.marketB() : this.stall;
    if (!u || !place || !m) return { n: 0, coins: 0, cut: 0, items: [], donated: [] };
    const donated = this.donateFromStash(u), items = []; let n = 0, coins = 0;
    for (const [id, k] of Object.entries(stashSellable(u))) { coins += stashPrice(id) * k; n += k; if (!(u.stash[id] -= k)) delete u.stash[id]; items.push({ id, n: k }); }
    const cut = m !== u ? Math.min(coins, STASH_CUT * n) : 0;
    if (cut) m.coins = (m.coins || 0) + cut;
    u.coins = (u.coins || 0) + coins - cut; if (this.economy) this.bank.issued += coins;
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
  /** 농부·어부: 먹을 것 FOOD_KEEP+2개를 남기고 나머지를 저장고에 팖(1개 🪙GRANARY_BUY, 은행이 새로 찍음) */
  stockFood(u) {
    let n = Math.min(E.meals(u) - (E.FOOD_KEEP + 2), E.GRANARY_MAX - this.granary); if (!this.granaryB() || n <= 0) return 0;
    const sold = n;
    for (const k of ["fish", "food"]) { const t = Math.min(u.inv[k], n); u.inv[k] -= t; n -= t; }
    this.granary += sold; this.issue(u, sold * E.GRANARY_BUY); this.emit("granary", { u, kind: "stock", n: sold }); return sold;
  }
  /** 저장고에서 음식 하나: 돈이 있으면 시세대로 사고(은행으로 돌아감), 없고 아주 배고프면(포만감 E.RATION_FULL 아래) 나눠 받음 */
  takeFood(u) {
    if (!this.granaryB() || this.granary <= 0) return null;
    const price = this.foodPrice();
    if ((u.coins || 0) >= price) { u.coins -= price; this.deposit(price); this.granary--; u.inv.food++; this.emit("granary", { u, kind: "buy" }); return "buy"; }
    if ((u.full ?? 80) < E.RATION_FULL) { this.granary--; u.inv.food++; this.emit("granary", { u, kind: "free" }); return "free"; }
    return null;
  }

  // ---- 시세
  foodPrice() { return this.prices.food; }
  updatePrices() {
    const m = this.merchantU();
    for (const k of E.RAW) this.prices[k] = E.marketPrice(k, m ? (m.raw[k] || 0) + (m.goods[k] || 0) : 0);
    const spare = this.units.filter(E.isProducer).reduce((s, u) => s + Math.max(0, E.meals(u) - E.FOOD_KEEP), 0);
    const hungry = this.units.filter(u => (u.full ?? 80) < J.HUNGRY + 10).length / Math.max(1, this.units.length);
    this.prices.food = E.foodPriceFor(spare, hungry, this.fx.foodPrice);
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
      const u = free[Math.floor(this.wrnd() * free.length)];
      const cands = WISHES.filter(d => !this.wishes.some(x => x.id === d.id) && d.ok(this, u));
      if (!cands.length) continue;
      const d = cands[Math.floor(this.wrnd() * cands.length)];
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
    this.after(25 + this.rnd() * 15, () => { t.alive = true; t.hp = 3; this.emit("treeGrow", t); });
  }
  hitOre(o, who = null) {
    if (!o.alive) return;
    o.hp--; this.emit("oreHit", o);
    if (o.hp > 0) return;
    o.alive = false; const got = who ? J.stoneYield(who) : 2; this.gain(who, "stone", got); o.lastYield = got;
    o.lastIron = who && this.rnd() < J.ironChance(who) ? 1 : 0; if (o.lastIron) this.gain(who, "iron", o.lastIron);
    this.emit("oreBroke", o);
    this.after(20 + this.rnd() * 12, () => { o.alive = true; o.hp = 3; this.emit("oreGrow", o); });
  }
  /** 낚시 결과: 못 낚음 / 물고기(흔하면 음식, 희귀 이상이면 보물) + 가끔 물건. 도감에 기록. */
  /** bonus: 찌 당기기 배율(희귀 이상 비중에 곱함, 기본 1 = 예전 그대로) */
  catchFish(u, bonus = 1) {
    const fishFx = this.fx.fish; if (fishFx <= 0) return null;                       // 폭풍: 못 낚음
    if (this.rnd() >= Math.min(0.95, J.catchChance(u) * fishFx)) return null;
    const got = this.landFish(u, this.rnd, bonus), { fish: f, item, size } = got;
    this.emit("fish", { u, fish: f, item, size }); if (f.rarity !== "common" || item) this.notice(u.x, u.z, "fish", u);
    if (got.record) this.emit("fishRecord", { u, fish: f, size, first: got.first });   // 크기 기록 → 기증 → 선물 순서로 알림(뒤의 것이 알림 줄에 남음)
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
   *  돌려주는 값: { fish, item, size, record: 새 기록인지, first: 그 종류 첫 기록인지, donated, gifts: 기증했으면 받은 선물들(아니면 null) } */
  landFish(u, rnd, bonus = 1) {
    const f = J.rollFish(u, rnd, this.season, bonus); if (!this.economy) this.res.fish++;
    const size = fishSize(f, sizeNoise(this.time, u.unitId, Object.values(this.collection).reduce((a, b) => a + b, 0)));
    const prev = this.fishRecord[f.id] || 0, record = size > prev; if (record) this.fishRecord[f.id] = size;
    this.collection[f.id] = (this.collection[f.id] || 0) + 1;
    const gifts = this.donateFish(f);
    if (f.rarity === "common") { if (this.economy) this.gain(u, "fish", 1); else this.res.food += f.food; } else if (!gifts) stashAdd(u, f.id);
    let item = null;
    if (rnd() < J.itemChance(u) * this.fx.item) { item = J.rollItem(u, rnd, this.season, bonus); this.keepCatch(u, item); }
    return { fish: f, item, size, record, first: !prev, donated: !!gifts, gifts };
  }
  /** 낚시로 건진 물건을 그 갈매미가 챙김: 가구는 집이 있으면 그 집에 놓고(자리가 없으면 창고), 집이 없으면 들고 있다가 집을 사면 옮김. 나머지는 소지품 */
  keepCatch(u, item) {
    const home = item.furniture && u.home && this.buildings.get(u.home);
    if (home) { if (!F.autoPlace(this, home, item.furniture)) { const it = F.room(home); it.stash[item.furniture] = (it.stash[item.furniture] || 0) + 1; } return; }
    stashAdd(u, item.id);
  }
  /** 다녀온 사이: 게임을 꺼 둔 실제 시간(ms, 밖에서 재서 넘겨줌)만큼 가볍게 쳐 줌. 마을을 돌리지 않고 딱 두 가지만:
   *  자라던 밭이 익고(10분이면 어느 계절·날씨에도 다 익음), 어부가 낚싯대를 몇 번(awayCasts) 던짐. 돈·시세·시장은 그대로.
   *  돌려주는 값: { ms, hours, ripened, catches: [{ who, fish, item }] } 또는 null(10분 안쪽·이상한 시각) */
  applyAway(ms, rnd = this.rnd) {
    const hours = awayHours(ms); if (!hours) return null;
    let ripened = 0; const catches = [];
    for (const p of this.plots) if (p.stage === "growing") { p.stage = "ripe"; p.t = 0; ripened++; this.emit("plot", p); }
    const fishers = this.spots.length ? this.units.filter(u => u.job === "fisher") : [];
    for (let i = 0, n = fishers.length ? awayCasts(hours) : 0; i < n; i++) {
      const u = fishers[i % fishers.length]; if (rnd() >= J.catchChance(u)) continue;
      const got = this.landFish(u, rnd); catches.push({ who: u.name, fish: got.fish, item: got.item, size: got.size, donated: got.donated });
      if (got.gifts) { this.noteNews("donate", { u, fish: got.fish }); for (const g of got.gifts) this.noteNews("donateGift", g); }   // 그동안의 기증은 소식지에만
    }
    const fished = catches.length ? `물고기 ${catches.length}마리를 낚았어요` : "", did = ripened ? `밭 ${ripened}칸이 ${fished ? `익고 ${fished}` : "익었어요"}` : fished;
    if (did) addNews(this.newsLog, this.time, { icon: "💌", text: `다녀온 사이에 ${did}`, weight: 3 });
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

  // ---- 바닥 칠하기(지시서 3-B): 땅 칸이고 건물·시설이 없을 때만
  canPaint(x, z) { const c = this.grid.get(x, z); return !!c && !this.grid.isWater(x, z) && !c.occupiedId && !this.isPlot(x, z); }
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
    if (this.animateShape) { this.shaping.set(idx, { x, z, target: e }); return true; }
    return this.applyHeight(x, z, e);
  }
  /** 높이를 실제로 바꾸고, 물에 잠긴 씨앗·갈매미를 정리. */
  applyHeight(x, z, e) {
    const c = this.grid.get(x, z), wasWater = this.grid.isWater(x, z);
    if (!this.grid.setElevation(x, z, e)) return false;
    if (wasWater && !this.grid.isWater(x, z) && c.groundType !== "Sand") c.groundType = "Sand";
    for (const s of [...this.seeds]) if (s.x === x && s.z === z && this.grid.isWater(x, z)) this.eatSeed(s);   // 물에 잠긴 씨앗은 없앰
    for (const u of this.units) if (!u.insideBuildingId && u.state !== UnitState.Held && Math.floor(u.x) === x && Math.floor(u.z) === z && !this.grid.isWalkable(x, z) && !(u.swimming && this.grid.isWater(x, z))) {
      const spot = nearestWalkable(this.grid, x, z); if (spot) { u.x = spot[0] + 0.5; u.z = spot[1] + 0.5; } setIdle(u, this.rnd, this);   // 물에 빠지면 가까운 땅으로
    }
    this.emit("ground", { x, z }); return true;
  }
  /** 스르르 바뀌는 중인 칸들을 목표 높이 쪽으로 옮김(초당 1.5 m). */
  stepShaping(dt) {
    for (const [idx, s] of this.shaping) {
      const c = this.grid.get(s.x, s.z), d = s.target - c.elevation, mv = Math.sign(d) * Math.min(Math.abs(d), 1.5 * dt);
      if (Math.abs(d) <= 1.5 * dt + 1e-6) { this.shaping.delete(idx); this.applyHeight(s.x, s.z, s.target); }
      else this.grid.setElevation(s.x, s.z, Math.round((c.elevation + mv) * 1000) / 1000);
    }
  }

  // ---- 건물(지시서 4-1). 놓으면 공사장이 되고, 갈매미가 나무 1·돌 1을 들고 와서 망치질 3번씩 해서 완공한다.
  /** 놓을 수 있나. 경제가 있으면 마지막에 설계비(금고)를 봄 → 통과하면 { ...r, fee }. opt.free: 갈매미가 스스로 주문한 공사(설계비 없음) */
  check(defId, ax, az, rot, opt = {}) {
    const def = BUILDINGS[defId], r = checkPlacement(this.grid, def, ax, az, rot, this.units);
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
    if (b.fee) { this.bank.vault -= b.fee; this.bank.fees += b.fee; this.led("fees", b.fee); this.emit("fee", { b, fee: b.fee }); this.checkLow(); }
    this.grid.occupy(b.cells, b.id, { kind: "building", walkable: (!!b.ramp && this.isDone(b)) || !!def.field || (!!def.bridge && this.isDone(b)), surface: r.elevation, ramp: b.ramp });   // 밭은 처음부터 걸어 다님   // 길찾기 장애물로 반영(grid.version 증가). 계단은 다 지으면 걸을 수 있음
    if (!def.bridge) this.grid.reserveDoor(b.door.x, b.door.z, b.id);            // 다리는 문이 없음(줄로 이어 놓음)
    if (b.ramp) this.grid.reserveDoor(b.ramp.bx, b.ramp.bz, b.id);              // 계단 위쪽 칸도 비워 둠(다른 건물·높이 바꾸기 못 함)
    this.buildings.set(b.id, b); this.emit("buildingAdded", b); if (hits === null) this.notice(b.door.x + 0.5, b.door.z + 0.5, "site");
    if (this.isDone(b)) { this.completed(b); if (hits === null) this.builtNow(b); if (b.order) this.settleOrder(b); }   // ⚡ 바로 완공도 다 지은 것(불러오기·시험 받침은 hits를 넘김 → 아님)
    return { ok: true, building: b };
  }
  isDone(b) { return b.hits >= b.need; }
  hammer(b, u) {
    if (this.isDone(b)) return;
    b.hits = Math.min(b.need, b.hits + (u ? J.hammerPower(u) : 1));       // 건축가는 한 번에 배율만큼
    b.lastBuilder = u ? u.unitId : null; this.emit("buildingProgress", b);
    if (this.isDone(b)) { this.completed(b); this.emit("buildingDone", b); this.builtNow(b); if (!u && b.order) this.settleOrder(b); if (u) emote(u, b.ramp ? "계단 완성!" : "🏠!"); this.notice(b.door.x + 0.5, b.door.z + 0.5, "building", u); }
  }
  finishAll() { for (const b of this.buildings.values()) if (!this.isDone(b)) { b.hits = b.need; this.completed(b); this.emit("buildingDone", b); this.builtNow(b); if (b.order) this.settleOrder(b); } }
  /** 공사가 끝나 다 지어졌을 때(망치질·finishAll·⚡ 바로 완공. 불러오기는 아님): 수족관이면 갈매미들이 아껴 둔 물고기를 기증 */
  builtNow(b) { if (b.defId === "aquarium") this.donateStashes(); }
  /** 다 지었을 때: 계단·낚시터는 걸을 수 있게, 밭은 칸마다 밭(심고 거둠), 낚시터는 낚시 자리 */
  completed(b) {
    const def = BUILDINGS[b.defId];
    if (def.house && !b.interior.furnished) { b.interior.furnished = true; for (const id of ["chair", "table"]) F.autoPlace(this, b, id); }   // 새 집엔 의자·테이블이 기본으로
    this.openStairs(b);
    if (def.field) for (const [x, z] of b.cells) if (!this.isPlot(x, z)) {
      this.grid.setGround(x, z, "Dirt"); const p = { x, z, stage: "empty", t: 0, grow: 40, claimed: null, field: b.id }; this.plots.push(p); this.emit("plotAdded", p);
    }
    if (def.bridge || def.pier) { const o = this.grid.occupants.get(b.id); if (o && !o.walkable) { o.walkable = true; this.grid.version++; } }
    if (def.dock) {
      const o = this.grid.occupants.get(b.id); if (o && !o.walkable) { o.walkable = true; this.grid.version++; }
      const [x, z] = b.cells[0]; if (!this.spots.some(s => s.x === x && s.z === z)) this.spots.push({ x, z, dir: [x - b.door.x, z - b.door.z], claimed: null, dock: b.id });
    }
  }
  /** 다 지은 계단을 걸을 수 있게(길찾기 다시) */
  openStairs(b) { const o = b.ramp && this.grid.occupants.get(b.id); if (o && !o.walkable) { o.walkable = true; this.grid.version++; } }
  isHouse(b) { const d = BUILDINGS[b.defId]; return this.economy ? !!d.house : !d.stairs && !d.field && !d.dock && !d.deco; }   // 들어가 쉬는 건물(경제가 있으면 집만)
  /** 이 갈매미가 이 건물에 들어갈 수 있나: 전용 집(forUnit)은 그 갈매미만, 전용 집이 있는 갈매미(자이언트)는 그 집에만 */
  canEnter(u, b) {
    if ((b.defId === "cafe" || b.defId === "aquarium") && this.isDone(b)) return true;   // 카페·수족관은 누구나(카페: 재미·친구, 수족관: 재미가 차오름)
    if (!this.isHouse(b) || !this.isDone(b)) return false;
    if (this.economy) return b.owner === u.unitId;                                  // 경제가 있으면 산 집(주인)만
    return this.canFit(u, b);
  }
  removeBuilding(id) {
    const b = this.buildings.get(id); if (!b) return false;
    if (b.fee && !this.isDone(b)) { this.bank.vault += b.fee; this.bank.fees -= b.fee; this.led("refunds", b.fee); b.fee = 0; this.settleOwed(); }   // 다 짓기 전 철거(공사 취소): 설계비를 돌려줌(쓴 자재·치른 품삯은 그대로)
    if (b.order) this.settleOrder(b);                                              // 갈매미 주문 공사를 철거: 남은 맡긴 돈을 주문한 갈매미에게
    for (const u of this.units) if (u.insideBuildingId === id) exitBuilding(u, this, this.rnd);   // 안에 있던 갈매미는 문 앞으로
    for (const u of this.units) { if (u.focus === b) setIdle(u, this.rnd, this); if (u.committed === id) u.committed = null; }   // 짓던 갈매미는 그만
    this.grid.release(id); this.buildings.delete(id); this.emit("buildingRemoved", b);
    for (const p of this.plots.filter(p => p.field === id)) { this.plots.splice(this.plots.indexOf(p), 1); this.emit("plotRemoved", p); }
    this.spots = this.spots.filter(s => s.dock !== id);
    for (const u of this.units) if (u.home === id) { u.home = null; if (u.loan) { this.bank.forgiven += u.loan.left; u.loan = null; } }   // 플레이어가 부순 집의 남은 빚은 없애 줌
    return true;
  }
  buildingAt(x, z) { const c = this.grid.get(x, z); return c && c.occupiedId ? this.buildings.get(c.occupiedId) || null : null; }

  // ---- 갈매미 들어 옮기기(드래그). 건물 안에 있는 갈매미는 보이지 않으므로 들 수 없다.
  pickUpUnit(u) {
    if (!u || u.insideBuildingId || u.state === UnitState.Held || u.sailing) return false;   // 배 타는 중엔 못 집음
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
      const only = BUILDINGS[b.defId].forUnit; return { ok: false, reason: only ? `${only} 전용 집이에요` : `${u.name}에게는 너무 작아요(전용 집에 들어가요)` }; }
    if (b && this.isDone(b)) { u.x = b.door.x + 0.5; u.z = b.door.z + 0.5; u.y = this.grid.walkHeight(b.door.x, b.door.z) ?? 0; enterBuilding(u, b, this.rnd); return { ok: true, building: b }; }
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
    this.stepWeather(dt); this.stepSnow(dt); this.stepSky(dt); this.stepSparkles(dt);
    const grow = this.fx.grow;                                                   // 계절·비에 따라 밭이 빨리/늦게 자람
    for (const p of this.plots) if (p.stage === "growing" && (p.t -= dt * grow) <= 0) { p.stage = "ripe"; this.emit("plot", p); }
    if ((this.priceClock += dt) >= 5) { this.priceClock = 0; this.updatePrices(); }
    if ((this.histClock += dt) >= 20) { this.histClock = 0; this.priceHist.push({ t: Math.round(this.time), ...this.prices }); if (this.priceHist.length > 48) this.priceHist.shift(); }
    this.stepWishes(dt); this.stepFestival(dt); this.stepBank();
    if ((this.rankClock += dt) >= 2) { this.rankClock = 0; this.updateRoads(); this.stepRank(); }
    for (let i = this.timers.length - 1; i >= 0; i--) if ((this.timers[i].t -= dt) <= 0) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
    for (const u of this.units) updateUnit(u, dt, this, this.rnd);
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
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i]; if ((s.t -= dt) > 0 && sparkleCellFree(this, s.x, s.z)) continue;
      this.sparkles.splice(i, 1); this.emit("sparkleGone", s);
    }
    if ((this.sparkClock += dt) >= SPARKLE_EVERY) { this.sparkClock = 0; this.spawnSparkles(); }
  }
  /** 한 회차: 바닷가 1 + 마을 1(sparkRnd만 씀). 생긴 반짝이들을 돌려줌(시험 손잡이로도 씀) */
  spawnSparkles() {
    if (this.sparkles.length >= SPARKLE_MAX) return [];
    const made = rollSparkles(sparkleCells(this), this.sparkles, this.season, this.sparkRnd).map(s => ({ id: this.sparkId++, k: s.k, x: s.x, z: s.z, t: SPARKLE_LIFE }));
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
    return { version: 2, ownership: this.ownershipPending ? 0 : 1, seed: this.seed ?? null, nextId: this.nextId, grid: this.grid.serialize(), modules: this.modules,
      spots: this.spots.map(({ x, z, dir }) => ({ x, z, dir })), zones: this.zones, res: this.res,
      treasures: this.treasures, collection: this.collection, items: this.items, stall: this.stall,
      plots: this.plots.map(({ x, z, stage, t, grow }) => ({ x, z, stage, t, grow })),
      units: this.units.map(u => ({ name: u.name, coins: u.coins || 0, inv: u.inv, home: u.home || null, raw: u.raw, goods: u.goods, friends: friendsToNames(u, this.units), bond: u.bond || 0, bondGifts: u.bondGifts || 0, petDay: u.petDay || 0, petN: u.petN || 0, cheer: Math.round(u.cheer || 0), stash: u.stash || {}, loan: u.loan || null, wageOwed: u.wageOwed || 0, loanRefused: !!u.loanRefused })), keep: this.keep, bank: this.bank, wild: !!this.wild, weather: this.weather, wishDone: this.wishDone, rank: this.rank, granary: this.granary, wishes: this.wishes, priceHist: this.priceHist, time: this.time, snow: this.snow, newsLog: this.newsLog, newsSeason: this.newsSeason, savedAt, donated: this.donated, fishRecord: this.fishRecord, donateGifts: this.donateGifts,
      skySeen: this.skySeen, firstSnowYear: this.firstSnowYear,
      festival: this.festival, festivals: this.festivals,
      daily: this.daily, stamps: this.stamps, stampBought: this.stampBought,
      sparkles: this.sparkles.map(({ k, x, z, t }) => ({ k, x, z, t })), sparkClock: this.sparkClock,
      buildings: [...this.buildings.values()].map(b => ({ id: b.id, defId: b.defId, x: b.x, z: b.z, rot: b.rot, hits: b.hits, interior: b.interior, owner: b.owner || null, fee: b.fee || 0, order: b.order ? { by: b.order.by, left: b.order.left } : null })) };
  }
  static fromJSON(j, rnd = Math.random) {
    if (!j || ![1, 2].includes(j.version)) throw new Error("저장 형식이 달라요");
    const w = new World(Grid.fromJSON(j.grid), j.modules, rnd, j);
    w.time = j.time || 0;
    if (j.firstSnowYear === undefined && w.snow > 0.02) w.firstSnowYear = "?";    // 예전 저장(첫눈 기록 없음)인데 눈이 쌓여 있으면 이번 겨울 첫눈은 지난 일
    w.seed = j.seed; if (j.res) Object.assign(w.res, j.res);
    Object.assign(w.treasures, j.treasures || {}); Object.assign(w.collection, j.collection || {}); Object.assign(w.items, j.items || {});
    for (const s of j.buildings) { const r = w.placeBuilding(s.defId, s.x, s.z, s.rot, s.id, s.hits ?? 1e9); if (r.ok) { r.building.interior = s.interior; r.building.hits = Math.min(r.building.hits, r.building.need); r.building.owner = s.owner || null; r.building.fee = Math.max(0, +s.fee || 0); r.building.order = s.order && s.order.by != null ? { by: s.order.by, left: Math.max(0, Math.floor(+s.order.left || 0)) } : null; } }
    w.wild = !!j.wild; if (w.wild) { w.hungerScale = 0.48; w.seedFood = 20; }
    const saved = (j.units || null)?.map(u => typeof u === "string" ? { name: u } : u);
    w.spawnUnits(saved ? saved.map(u => u.name) : undefined);                       // 예전 저장(units 없음)은 8마리 모두
    for (const s of saved || []) { const u = w.units.find(o => o.name === s.name); if (!u) continue; u.coins = s.coins || 0; if (s.inv) u.inv = { ...E.newBag(), ...s.inv }; u.home = s.home || null; if (s.raw) u.raw = { ...u.raw, ...s.raw }; if (s.goods) u.goods = { ...u.goods, ...s.goods }; friendsFromNames(u, s.friends, w.units);
      u.bond = Math.max(0, Math.min(BOND_MAX, +s.bond || 0)); u.bondGifts = Math.max(0, Math.min(BOND_STAGES.length - 1, s.bondGifts | 0)); u.petDay = s.petDay | 0; u.petN = Math.max(0, s.petN | 0); u.cheer = Math.max(0, Math.min(FESTIVAL_CHEER_SECS, +s.cheer || 0)); u.stash = stashFromSave(s.stash);
      u.loan = BK.loanFromSave(s.loan); u.wageOwed = Math.max(0, Math.floor(+s.wageOwed || 0)); u.loanRefused = !!s.loanRefused; }   // 대출·밀린 품삯(예전 저장엔 없음 → 없음)                       // 정·답례·쓰다듬기(예전 저장엔 없음 → 0)   // 친구 사이는 이름으로(예전 저장엔 없음 → 처음부터)
    w.bank = BK.bankFromSave(j.bank, w.time);                                     // 갈매미를 다시 만든 뒤에(상인 창업 자금이 두 번 세지지 않게). 금고가 없는 예전 저장은 100 + 돌아온 돈
    w.bank.owed = w.units.reduce((s, u) => s + (u.wageOwed || 0), 0);
    w.daily = dailyFromSave(j.daily);                                             // 오늘의 부탁은 다 만든 뒤에(불러오며 다시 놓는 건물을 세지 않게. 예전 저장엔 없음 → 화면이 날짜를 넣어 줄 때 새로 고름)
    // 반짝이: 아는 것만, 그사이 못 쓰게 된 칸은 버림(id는 새로 매김). 시계가 없으면(예전 저장) 첫 반짝이는 SPARKLE_FIRST초 뒤
    w.sparkles = sparklesFromSave(j.sparkles).filter(s => sparkleCellFree(w, s.x, s.z)).map(s => ({ id: w.sparkId++, ...s }));
    if (Number.isFinite(j.sparkClock)) w.sparkClock = Math.min(SPARKLE_EVERY, Math.max(0, j.sparkClock));
    if (!j.ownership) { w.migrateOwnership(); if (!w.ownershipPending && w.aquariumB()) w.donateStashes(); }   // 소지품 개편 전 저장: 한 번만(다시 저장하면 ownership 표시가 붙음). 수족관이 있으면 옮겨 받은 물고기를 바로 기증
    w.nextId = j.nextId; return w;
  }
}
