// 🗝 메인 스토리 「갈매미섬의 비밀」(world/story.js · data/story.js · World 연결): 조각마다 얻는 길(두 길 포함) · 2단계 힌트 · 고칠 곳 · 엔딩 ·
// 저장/불러오기(예전 저장은 0장부터) · 난수 순서가 그대로인지 · 갈매미 소지품은 단서가 아닌지
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { FISH, ITEMS, FURNITURE } from "../src/data/catalog.js";
import * as ST from "../src/world/story.js";
import { STORY_CHAPTERS, STORY_PIECES, STORY_PIECE_IDS, STORY_TOTAL, STORY_CHAIR, STORY_LETTER, STORY_EVERY, STORY_WAVE_SECS } from "../src/data/story.js";
import { SPARKLE_EVERY, SPARKLE_FIRST } from "../src/world/sparkles.js";
import { newsFor, awayLetter } from "../src/world/news.js";
import { rewardOf, REWARD_EVENTS } from "../src/ui/rewardFx.js";
import { storyAppHtml, storyBadge } from "../src/ui/storyView.js";
import { noteTarget, atKey, atParse, atLabel } from "../src/ui/qolViews.js";

const town = (seed = 7, rnd = seededRandom(1)) => { const w = World.create(seed, rnd, { wild: true, firstGull: true }); w.instantBuild = true; return w; };
const dayOf = (w, d) => { w.time = (d - 1) * 600 + 1; };
const wave = w => w.storyEvent("wave");
const sparkOf = (w, key) => w.sparkles.find(s => s.story === key);
const pickKey = (w, key) => { const s = sparkOf(w, key); assert.ok(s, `이야기 반짝이 ${key}가 있어야 함`); return w.pickSparkle(s.id); };
const pickPlain = (w, n = 1) => { for (let i = 0; i < n; i++) { const id = w.sparkId++; w.sparkles.push({ id, k: "shell", x: 1, z: 1, t: 600 }); assert.ok(w.pickSparkle(id)); } };
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
const events = (w, names) => { const got = []; for (const n of names) w.on(n, a => got.push([n, a])); return got; };
const addGull = (w, name) => w.addUnitByName(name);
/** 1장을 엶(둘째 날 문패) */
const start = w => { dayOf(w, 2); wave(w); pickKey(w, "c1_sign"); assert.equal(w.story.chapter, 1); };
const placeNear = (w, defId, at, R = 6) => { for (let r = 1; r <= R; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; const res = w.placeBuilding(defId, at.x + dx, at.z + dz, 0, null, 1e9); if (res.ok) return res.building; } return null; };
/** 장 n까지 빨리 감기(조각·재료를 채워 고침) */
function toChapter(w, n) {
  start(w);
  if (n >= 2) { pickPlain(w, 5); w.addBond(w.units[0], 14); w.res.wood += 2; assert.ok(w.storyRestore(1).ok); }
  if (n >= 3) { wave(w); pickKey(w, "c2_wall"); pickPlain(w, 5); w.addBond(w.units[0], 28);
    const f = w.landmarkFront("cave"); assert.ok(placeNear(w, "streetlamp", f) && placeNear(w, "streetlamp", f)); assert.ok(w.storyRestore(2).ok); }
  if (n >= 4) { for (let d = 0; d < 3; d++) { dayOf(w, newsDayOf(w) + 1); wave(w); pickKey(w, "seed:B"); }
    pickPlain(w, 5); w.units[0].petDay = 0; w.units[0].petAt = 0; w.pet(w.units[0]); w.res.iron += 1; assert.ok(w.storyRestore(3).ok); }
  assert.equal(w.story.chapter, n);
}
const newsDayOf = w => Math.floor(w.time / 600) + 1;

test("데이터: 4장 18조각, 장마다 4~5칸, 힌트 두 단계, 덤은 2·3장에만", () => {
  assert.equal(STORY_CHAPTERS.length, 4); assert.equal(STORY_TOTAL, 18);
  assert.deepEqual(STORY_CHAPTERS.map(c => c.pieces.length), [4, 5, 5, 4]);
  assert.equal(new Set(STORY_PIECE_IDS).size, 18);
  for (const id of STORY_PIECE_IDS) { const p = STORY_PIECES[id]; assert.equal(p.hint.length, 2, id); assert.notEqual(p.hint[0], p.hint[1], id); assert.ok(p.text && p.title && p.icon, id); }
  assert.deepEqual(STORY_PIECE_IDS.filter(id => STORY_PIECES[id].bonus), ["c2_rainbow", "c2_festival", "c3_snow"]);
  assert.ok(FURNITURE[STORY_CHAIR]?.comfort === 5 && ITEMS.find(i => i.id === STORY_CHAIR)?.furniture === STORY_CHAIR, "엔딩 흔들의자(편안함 5)");
  assert.ok(STORY_LETTER.lines.length >= 4);
});

test("시작: 새 마을·예전 저장은 0장부터, 둘째 마을 날 첫 반짝이 차례에 등대 발치 문패 → 비밀 수첩", () => {
  const w = town();
  assert.equal(w.story.chapter, 0); assert.ok(!ST.storyStarted(w.story));
  dayOf(w, 1); wave(w); assert.ok(!sparkOf(w, "c1_sign"), "첫날엔 아직");
  const got = events(w, ["storySpark", "storyPiece"]);
  dayOf(w, 2); wave(w);
  const sp = sparkOf(w, "c1_sign"); assert.ok(sp); assert.ok(cheb(sp, w.landmarkFront("lighthouse")) <= 3, "등대 발치");
  assert.equal(got[0][0], "storySpark"); assert.equal(got[0][1].x, sp.x);
  wave(w); assert.equal(w.sparkles.filter(s => s.story === "c1_sign").length, 1, "두 번 놓지 않음");
  w.time += 5000; w.stepSparkles(1); assert.ok(sparkOf(w, "c1_sign"), "이야기 반짝이는 줍기 전까지 안 사라짐");
  pickKey(w, "c1_sign");
  assert.equal(w.story.chapter, 1); assert.ok(w.story.found.c1_sign); assert.equal(got.at(-1)[0], "storyPiece");
  assert.ok(!w.items.story && !Object.keys(w.items).some(k => k.startsWith("c1")), "조각은 주머니를 거치지 않음");
  // 예전 저장: story 칸이 없으면 0장
  const j = w.serialize(); delete j.story; const old = World.fromJSON(JSON.parse(JSON.stringify(j)));
  assert.equal(old.story.chapter, 0); assert.deepEqual(old.story.found, {}); assert.ok(!old.sparkles.some(s => s.story));
  assert.deepEqual(ST.storyFromSave(null), ST.newStory()); assert.deepEqual(ST.storyFromSave({ chapter: "x", found: { nope: 1 } }).found, {});
});

test("이야기 빠르기 그대로: 반짝이 회차(300초·1개)와 따로 이야기 차례는 예전처럼 200초마다 → 문패가 예전과 같은 마을 시각", () => {
  // 예전(3b3b0be: 반짝이 200초마다 2개 = 이야기 차례)에서 같은 마을(씨앗 7, 0.5초씩)로 잰 값: 차례 20·220·420·620·820·1020초, 문패 620초(둘째 날 첫 차례)
  assert.equal(STORY_WAVE_SECS, 200); assert.equal(SPARKLE_EVERY, 300);
  const w = town(), waves = [], spawns = [], beats = [];
  const se = w.storyEvent.bind(w); w.storyEvent = (ev, a) => { if (ev === "wave") waves.push(w.time); return se(ev, a); };
  w.on("sparkleSpawn", () => spawns.push(w.time)); w.on("storySpark", e => beats.push([e.key, w.time]));
  for (let i = 0; i < 1800 * 2; i++) w.update(0.5);
  assert.deepEqual(waves, [20, 220, 420, 620, 820, 1020, 1220, 1420, 1620], "이야기 차례 = 예전 반짝이 회차 시각");
  assert.deepEqual(spawns, [20, 320, 620, 920, 1220, 1520], "보통 반짝이는 300초마다 1개(첫 반짝이는 그대로 20초)");
  assert.deepEqual(beats, [["c1_sign", 620]], "문패 반짝이 = 예전과 같은 620초");
  // 해가 지면 예전처럼 두 시계를 함께 당김(첫 밤 반짝이 SPARKLE_FIRST초 뒤 · 이야기 차례도 예전과 같은 때)
  const v = town(); v.stepSparkles(0); v.sparkClock = 0; v.waveClock = 0; v.isNight = true; v.stepSparkles(0);
  assert.equal(v.sparkClock, SPARKLE_EVERY - SPARKLE_FIRST); assert.equal(v.waveClock, STORY_WAVE_SECS - SPARKLE_FIRST);
  // 저장·불러오기: 이야기 차례 시계가 남고, 그 시계가 없는 예전 저장은 그때의 반짝이 시계(= 예전 이야기 차례 시계)를 그대로
  w.waveClock = 123.5; const j = JSON.parse(JSON.stringify(w.serialize())); assert.equal(World.fromJSON(j).waveClock, 123.5);
  const old = JSON.parse(JSON.stringify(j)); delete old.waveClock; old.sparkClock = 150; assert.equal(World.fromJSON(old).waveClock, 150);
  old.sparkClock = 260; assert.equal(World.fromJSON(old).waveClock, STORY_WAVE_SECS, "200초를 넘는 값은 200으로(곧 차례)");
});

test("1장: 젖은 쪽지(2번째 줍기) · 할머니 이야기(♥♥ 갈매미) · 엽서(다녀온 사이 편지 / 사흘 뒤 줍기) · 2단계 힌트", () => {
  const w = town(); start(w); assert.equal(STORY_EVERY, 2, "반짝이 하루 2개: 쪽지는 2번째 줍기(예전 하루 6개 · 5번째와 같은 때)");
  pickPlain(w, STORY_EVERY - 1); assert.ok(!w.story.found.c1_note); pickPlain(w, 1); assert.ok(w.story.found.c1_note, "2번째");
  assert.match(STORY_PIECES.c1_note.hint[1], /두 번/); assert.ok(!STORY_PIECE_IDS.some(id => STORY_PIECES[id].hint.some(h => /다섯/.test(h))), "힌트 글도 새 줍기 수");
  const u = w.units[0]; w.addBond(u, 13.5); assert.ok(!w.story.found.c1_tale); w.addBond(u, 1);
  assert.equal(w.story.found.c1_tale.who, u.name); assert.match(ST.pieceText("c1_tale", u.name), new RegExp(`^${u.name}:`));
  const r = w.applyAway(20 * 60000); assert.ok(w.story.found.c1_card, "다녀온 사이 편지"); assert.ok(r.story.some(l => l.includes("엽서")));
  assert.ok(awayLetter(r).lines.some(l => l.includes("📮 우체통에 낡은 엽서")));
  // 둘째 길: 장이 열리고 마을 사흘 뒤 반짝이 줍기
  const v = town(); start(v); dayOf(v, 4); pickPlain(v, 1); assert.ok(!v.story.found.c1_card, "사흘 전엔 아님");
  dayOf(v, 5); pickPlain(v, 1); assert.ok(v.story.found.c1_card, "사흘 뒤 줍기");
  // 힌트: 처음엔 흐릿, 장이 열리고(마지막 조각 뒤) 마을 이틀 동안 그대로면 구체적
  const h = town(); start(h); const d0 = newsDayOf(h);
  assert.equal(ST.pieceHint(h.story, "c1_tale", d0), STORY_PIECES.c1_tale.hint[0]);
  assert.equal(ST.pieceHint(h.story, "c1_tale", d0 + 1), STORY_PIECES.c1_tale.hint[0]);
  assert.equal(ST.pieceHint(h.story, "c1_tale", d0 + 2), STORY_PIECES.c1_tale.hint[1]);
  dayOf(h, d0 + 2); pickPlain(h, 5); assert.equal(ST.pieceHint(h.story, "c1_tale", d0 + 2), STORY_PIECES.c1_tale.hint[0], "조각이 늘면 다시 흐릿하게");
});

test("1장 고칠 곳: 조각 3 + 나무 2 → 등대 문 · 모자라면 안 됨 · 2장 굴 벽 그림은 다음 차례 동굴 입구", () => {
  const w = town(); start(w); w.res.wood = 0;
  assert.equal(w.storyRestore(1).ok, false); pickPlain(w, 5); w.addBond(w.units[0], 14);
  let chk = ST.restoreCheck(w.story, w, 1); assert.ok(chk.rows[0].ok && !chk.rows[1].ok && !chk.ok);
  w.res.wood = 2; chk = ST.restoreCheck(w.story, w, 1); assert.ok(chk.ok);
  const got = events(w, ["storyRestore"]); assert.ok(w.storyRestore(1).ok); assert.equal(w.res.wood, 0); assert.equal(got.length, 1);
  assert.ok(w.story.restored.door); assert.equal(w.story.chapter, 2); assert.equal(w.storyRestore(1).ok, false, "두 번 안 고침");
  wave(w); const sp = sparkOf(w, "c2_wall"); assert.ok(sp && cheb(sp, w.landmarkFront("cave")) <= 3, "동굴 입구");
});

test("고칠 곳 재료가 창고에 없으면 갈매미 가방에서 시장 값으로 사 옴(창고에 철이 안 들어오는 마을도 안 막힘)", () => {
  const w = town(); toChapter(w, 3); for (let d = 0; d < 3; d++) { dayOf(w, newsDayOf(w) + 1); wave(w); pickKey(w, "seed:B"); }
  pickPlain(w, 5); w.units[0].petDay = 0; w.units[0].petAt = 0; w.pet(w.units[0]); w.res.iron = 0;
  for (const u of w.units) u.inv.iron = 0;
  let chk = ST.restoreCheck(w.story, w, 3); assert.ok(!chk.ok, "철이 어디에도 없으면 아직");
  const miner = addGull(w, "불씨"); miner.inv.iron = 4; miner.coins = 0; assert.ok(w.economy); w.bank.vault = 100;
  chk = ST.restoreCheck(w.story, w, 3); const row = chk.rows.find(r => r.k === "iron"), price = ST.storyRawPrice(w, "iron");
  assert.ok(chk.ok && row.buy === 1 && row.price === price && /갈매미에게서 1개 사기/.test(row.text));
  w.bank.vault = price - 1; assert.ok(!ST.restoreCheck(w.story, w, 3).ok, "금고가 모자라면 아직"); w.bank.vault = 100;
  assert.ok(w.storyRestore(3).ok); assert.equal(miner.inv.iron, 3); assert.equal(miner.coins, price); assert.equal(w.bank.vault, 100 - price); assert.equal(w.res.iron, 0);
});

test("2장: 첫 비밀(♥♥♥, 이미 닿았으면 장이 열릴 때) · 매앰 쪽지 · 무지개 깃털(덤) · 일곱 둥지(축제 끝, 덤) · 가로등 2 → 메아리 굴", () => {
  const w = town(); start(w); pickPlain(w, 5); w.addBond(w.units[0], 30); w.res.wood += 2;   // ♥♥♥는 1장 중에 이미
  assert.ok(!w.story.found.c2_secret1); assert.ok(w.storyRestore(1).ok);
  assert.equal(w.story.found.c2_secret1?.who, w.units[0].name, "장이 열릴 때 바로 들려줌");
  wave(w); pickKey(w, "c2_wall"); pickPlain(w, 5); assert.ok(w.story.found.c2_name);
  w.startSky("rainbow", true); const rb = sparkOf(w, "c2_rainbow"); assert.ok(rb && cheb(rb, w.landmarkFront("lighthouse")) <= 7, "등대 둘레");
  pickKey(w, "c2_rainbow"); assert.ok(w.story.found.c2_rainbow);
  w.emit("festivalEnd", { key: "2026-autumn", def: { name: "단풍 축제" }, item: null, n: 1, who: ["기본"] }); assert.equal(w.story.found.c2_festival.who, "기본");
  assert.equal(ST.restoreCheck(w.story, w, 2).ok, false, "가로등 없음");
  const f = w.landmarkFront("cave"); placeNear(w, "streetlamp", f); assert.equal(ST.lampsNearCave(w), 1);
  placeNear(w, "streetlamp", f); assert.equal(ST.lampsNearCave(w), 2); assert.equal(ST.restoreCheck(w.story, w, 2).kind, "build");
  assert.ok(w.storyRestore(2).ok); assert.equal(w.story.chapter, 3);
  // 무지개·축제 반짝이는 장이 안 열렸으면 안 생김
  const v = town(); v.startSky("rainbow", true); assert.ok(!sparkOf(v, "c2_rainbow"));
});

test("3장: 별씨 두 길(유성우 밤 · 마을 날 아침, 하루 하나) · 병 편지 · 둘째 비밀(다음 날 ♥♥♥ 쓰다듬기) · 첫눈(덤) · 등불", () => {
  const w = town(); toChapter(w, 3); const d = newsDayOf(w);
  wave(w); assert.ok(sparkOf(w, "seed:B"), "아침 별씨"); wave(w); assert.equal(w.sparkles.filter(s => s.story?.startsWith("seed")).length, 1, "하루 하나");
  pickKey(w, "seed:B"); assert.equal(w.story.seeds, 1); wave(w); assert.ok(!sparkOf(w, "seed:B"), "같은 날 또 안 생김");
  w.startSky("meteor", true); assert.ok(sparkOf(w, "seed:A"), "유성우 별씨"); pickKey(w, "seed:A"); assert.equal(w.story.seeds, 2);
  dayOf(w, d + 1); wave(w); pickKey(w, "seed:B"); assert.equal(w.story.seeds, 3); assert.ok(w.story.found.c3_seed, "별씨 3개 = 조각 한 칸");
  dayOf(w, d + 2); wave(w); assert.ok(!sparkOf(w, "seed:B"), "다 모으면 더 안 생김");
  pickPlain(w, 5); assert.ok(w.story.found.c3_bottle);
  const u = w.units[0]; w.units[0].petDay = 0; w.units[0].petAt = 0;
  const v = town(); toChapter(v, 3); const vu = v.units[0]; vu.petDay = 0; vu.petAt = 0; v.pet(vu); assert.ok(!v.story.found.c3_secret2, "3장이 열린 날엔 아님");
  dayOf(v, newsDayOf(v) + 1); vu.petDay = 0; vu.petAt = 0; v.pet(vu); assert.equal(v.story.found.c3_secret2?.who, vu.name, "다음 마을 날");
  w.firstSnow(true); assert.ok(w.story.found.c3_snow);
  assert.ok(!ST.storyLampLit(w.story)); w.res.iron = 1; const ok = w.storyRestore(3); assert.ok(ok.ok, ok.reason);
  assert.equal(w.res.iron, 0); assert.equal(w.story.seeds, 0); assert.ok(ST.storyLampLit(w.story)); assert.ok(w.story.found.c4_lit, "켜진 등대는 저절로");
  assert.equal(w.story.chapter, 4); assert.ok(w.story.queue.includes("c4_pole"));
  void u;
});

test("3장 큰점박이 두 길: 고래상어 기증 · 물방울 ♥♥♥ (이미 기증했으면 장이 열릴 때)", () => {
  const whale = FISH.find(f => f.id === "whaleshark");
  const a = town(); toChapter(a, 3); a.emit("donate", { u: a.units[0], fish: whale }); assert.ok(a.story.found.c3_whale);
  const b = town(); toChapter(b, 3); const drop = addGull(b, "물방울"); assert.ok(drop); b.addBond(drop, 28); assert.equal(b.story.found.c3_whale?.who, "물방울");
  const c = town(); toChapter(c, 2); c.donated.whaleshark = true; c.emit("donate", { fish: whale }); assert.ok(!c.story.found.c3_whale, "장이 열리기 전엔 아님");
  wave(c); pickKey(c, "c2_wall"); pickPlain(c, 5); c.addBond(c.units[0], 28); const f = c.landmarkFront("cave"); placeNear(c, "streetlamp", f); placeNear(c, "streetlamp", f);
  assert.ok(c.storyRestore(2).ok); assert.ok(c.story.found.c3_whale, "이미 기증했으면 장이 열릴 때");
  const d = town(); toChapter(d, 3); d.emit("donate", { fish: FISH.find(f => f.id !== "whaleshark") }); assert.ok(!d.story.found.c3_whale);
});

test("4장: 조개섬 말뚝(사흘 뒤 본섬 바닷가) · 깜빡이는 대답(밤 연출 / 다음 날 소식 / 다녀온 사이) · 답장 → 엔딩 · 우체통 엽서", () => {
  const w = town(); toChapter(w, 4); const d = newsDayOf(w);
  wave(w); const pole = sparkOf(w, "c4_pole"), isl = w.zones.find(z => z.id === "islet-shell");
  assert.ok(pole && Math.hypot(pole.x - isl.x, pole.z - isl.z) <= 8, "조개섬");
  // 깜빡임: 등불을 켠 날이라도 밤이면 연출(scene) · 엔딩 유리병은 세 조각 뒤 다음 차례
  const got = events(w, ["storyBlink", "storyEnd", "storyGather"]);
  w.isNight = true; w.storyClock = 1; w.stepStory(0.1); assert.ok(!w.story.found.c4_blink, "불을 막 켰으면 카드가 지나간 뒤에");
  w.time += ST.STORY_BLINK_WAIT; w.storyClock = 1; w.stepStory(0.1); assert.ok(w.story.found.c4_blink); assert.equal(got[0][1].scene, true); w.isNight = false;
  assert.ok(!w.story.queue.includes("c4_reply"), "말뚝 전엔 아직");
  dayOf(w, d + 3); w.storyEvent("tick"); const moved = sparkOf(w, "c4_pole"); assert.ok(Math.hypot(moved.x - isl.x, moved.z - isl.z) > 20, "본섬 바닷가로");
  assert.equal(w.grid.get(moved.x, moved.z).groundType, "Sand");
  pickKey(w, "c4_pole"); assert.ok(w.story.found.c4_pole);
  assert.ok(w.story.queue.includes("c4_reply")); wave(w); pickKey(w, "c4_reply");
  assert.ok(w.story.ended); assert.equal(w.items[STORY_CHAIR], 1); assert.ok(got.some(e => e[0] === "storyEnd")); assert.equal(w.gather?.kind, "ending");
  // 우체통: 엔딩 뒤 나무 2 → 계절마다 엽서
  assert.ok(ST.restoreCheck(w.story, w, 4).rows.length); w.res.wood = 2; assert.ok(w.storyRestore(4).ok);
  const cards = events(w, ["storyPostcard"]); w.festKey = "2026-autumn"; w.storyClock = 1; w.stepStory(0.1); assert.equal(cards.length, 1);
  w.storyClock = 1; w.stepStory(0.1); assert.equal(cards.length, 1, "계절마다 한 번"); w.festKey = "2026-winter"; w.storyClock = 1; w.stepStory(0.1); assert.equal(cards.length, 2);
  // 낮에만 노는 사람: 등불을 켠 다음 마을 날 소식 · 다녀온 사이 편지
  const v = town(); toChapter(v, 4); const g2 = events(v, ["storyBlink"]); v.storyClock = 1; v.stepStory(0.1); assert.ok(!v.story.found.c4_blink, "같은 날 낮엔 아직");
  dayOf(v, newsDayOf(v) + 1); v.storyClock = 1; v.stepStory(0.1); assert.ok(v.story.found.c4_blink); assert.equal(g2[0][1].scene, false);
  assert.equal(newsFor("storyBlink", g2[0][1], v).text, "어젯밤 수평선에서 불빛이 깜빡였대요");
  const a = town(); toChapter(a, 4); const r = a.applyAway(30 * 60000); assert.ok(a.story.found.c4_blink); assert.ok(r.story.some(l => l.includes("깜빡")));
});

test("저장/불러오기: 조각·별씨·줍기 수·이야기 반짝이(같은 칸)·대기열이 그대로", () => {
  const w = town(); toChapter(w, 3); pickPlain(w, 1); wave(w); pickKey(w, "seed:B"); w.startSky("meteor", true);
  const sp = sparkOf(w, "seed:A"); const j = JSON.parse(JSON.stringify(w.serialize()));
  assert.ok(!j.sparkles.some(s => s.k === "story"), "보통 반짝이 칸엔 안 섞임");
  const v = World.fromJSON(j);
  assert.deepEqual(v.story.found, w.story.found); assert.equal(v.story.seeds, 1); assert.equal(v.story.pickN, 1); assert.equal(v.story.chapter, 3);
  assert.equal(ST.storyFromSave({ ...j.story, pickN: 4 }).pickN, STORY_EVERY - 1, "예전 저장의 줍기 수(5까지 세던 4)는 새 수 - 1로: 다음 줍기에 쪽지");
  const vs = sparkOf(v, "seed:A"); assert.ok(vs && vs.x === sp.x && vs.z === sp.z);
  pickKey(v, "seed:A"); assert.equal(v.story.seeds, 2);
  assert.deepEqual(ST.storyFromSave(ST.storyToSave(w.story)), ST.storyFromSave(j.story));
});

test("난수 순서가 그대로: 이야기가 있어도 없어도 마을 난수·반짝이·날씨·하늘 순서와 보통 반짝이가 같음", () => {
  const run = off => {
    const w = World.create(11, seededRandom(42), { wild: true, firstGull: true }); w.instantBuild = true; w.storyOff = off;
    const trace = [];
    for (let i = 0; i < 2600; i++) {
      w.update(0.5);
      if (i === 1300) { const s = w.sparkles.find(o => o.story); if (s) w.pickSparkle(s.id); }   // 이야기 반짝이를 주워도
      if (i % 200 === 0) trace.push(w.units.map(u => `${u.x.toFixed(3)},${u.z.toFixed(3)},${u.state}`).join("|"));
    }
    return { w, trace, plain: w.sparkles.filter(s => !s.story).map(({ k, x, z }) => `${k}@${x},${z}`), next: [w.rnd(), w.sparkRnd(), w.wrnd(), w.skyRnd(), w.hrnd()] };
  };
  const a = run(false), b = run(true);
  assert.ok(a.w.story.chapter >= 1, "이야기는 실제로 시작됨(문패를 주움)"); assert.equal(b.w.story.chapter, 0);
  assert.deepEqual(a.next, b.next); assert.deepEqual(a.plain, b.plain); assert.deepEqual(a.trace, b.trace);
});

test("갈매미 소지품은 단서가 아님: 낚시·바닷가 줍기·별조각·소지품 판매는 이야기를 안 바꿈", () => {
  const w = town(); toChapter(w, 3); const before = JSON.stringify(w.story);
  const u = w.units[0], fish = FISH.find(f => f.rarity === "legend");
  for (const [ev, arg] of [["fish", { u, fish }], ["beachcomb", { u, item: ITEMS[0] }], ["starPiece", { u, item: ITEMS.find(i => i.id === "stardust") }], ["stashSale", { u, items: [], coins: 0, cut: 0 }], ["fishRecord", { u, fish, size: 10 }]]) {
    w.emit(ev, arg); assert.equal(JSON.stringify(w.story), before, ev);
    for (let ch = 0; ch <= 4; ch++) { const s = ST.newStory(); s.chapter = ch; assert.deepEqual(ST.storyOnEvent(s, ev, arg, w, 3), [], `${ev}@${ch}`); }
  }
  assert.ok(!STORY_PIECE_IDS.some(id => ["fish", "beachcomb", "starPiece", "stash"].includes(STORY_PIECES[id].how)));
  assert.ok(!ITEMS.some(i => i.id === "c3_seed" || i.id === "starSeed"), "별씨는 ITEMS(선물·주머니)에 없음");
});

test("같은 일 → 같은 결과(결정적): 이야기 반짝이 자리·조각이 똑같음", () => {
  const go = () => { const w = town(3); toChapter(w, 4); wave(w); return JSON.stringify([w.story, w.sparkles.filter(s => s.story).map(({ story, x, z }) => [story, x, z])]); };
  assert.equal(go(), go());
});

test("보상·소식·알림: 조각·고침·엔딩은 큰 카드, 이야기 반짝이 알림은 누르면 그곳으로", () => {
  for (const ev of ["storyPiece", "storyRestore", "storyEnd", "storySeed", "storyPostcard"]) assert.ok(REWARD_EVENTS.includes(ev), ev);
  const p = STORY_PIECES.c1_tale, r = rewardOf("storyPiece", { id: "c1_tale", piece: p, who: "기본", text: ST.pieceText("c1_tale", "기본") });
  assert.equal(r.tier, "big"); assert.match(r.title, /할머니의 할머니 이야기/); assert.match(r.line, /^기본:/); assert.ok(r.kick);
  assert.equal(rewardOf("storyRestore", { n: 1, restore: STORY_CHAPTERS[0].restore }).tier, "big");
  assert.equal(rewardOf("storyEnd", { item: ITEMS.find(i => i.id === STORY_CHAIR) }).tier, "big");
  assert.equal(rewardOf("storySeed", { n: 2 }).tier, "medium");
  const at = noteTarget({ key: "c1_sign", x: 12, z: 34, s: { id: 1, k: "story", x: 12, z: 34 } });
  assert.deepEqual(at, { x: 12, z: 34 }); assert.equal(atKey(at), "p:12,34"); assert.deepEqual(atParse("p:12,34"), { x: 12, z: 34 }); assert.ok(atLabel(null, at));
  assert.equal(newsFor("storyPiece", { piece: p, who: "기본" }).weight, 4); assert.equal(newsFor("storyRestore", { restore: STORY_CHAPTERS[0].restore }).weight, 7);
});

test("비밀 수첩 화면: 열린 칸은 글·날·갈매미, 잠긴 칸은 ??? + 힌트, 안 열린 장은 안개 속, 고칠 곳 체크리스트와 [고치기]", () => {
  const w = town(); assert.equal(storyBadge(w), 0);
  start(w); w.addBond(w.units[0], 14);
  const html = storyAppHtml(w);
  assert.match(html, /녹슨 문패/); assert.match(html, /할머니의 할머니 이야기/); assert.match(html, new RegExp(w.units[0].name));
  assert.match(html, /\?\?\?/); assert.match(html, /젖은 종이가 섞여 있대요/); assert.match(html, /안개 속/); assert.match(html, /<b>2<\/b> \/ 18/);
  assert.ok(!/data-restore="1"/.test(html), "조각 모자라면 고치기 없음");
  pickPlain(w, 5); w.res.wood = 2; assert.match(storyAppHtml(w), /data-restore="1"/);
  assert.ok(storyBadge(w) > 0, "안 본 조각"); w.story.read = Object.fromEntries(Object.keys(w.story.found).map(k => [k, true])); assert.equal(storyBadge(w), 0);
  const e = town(); toChapter(e, 2); assert.match(storyAppHtml(e), /data-sgo="cave" data-sbuild="streetlamp"/, "가로등은 [고치러 가기]");
});
