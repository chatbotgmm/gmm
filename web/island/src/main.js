// 시작점: 장면·카메라·빛을 만들고 월드, 뷰, 도구, 화면 UI를 잇는다.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { World, SPEED_BOOST } from "./world/World.js";
import { GRID_W, toWorldX, toWorldZ, toGridX, toGridZ } from "./config.js";
import { GroundChunks } from "./render/groundChunks.js";
import { createWater } from "./render/water.js";
import { skyBackground, createClouds } from "./render/sky.js";
import { Daylight } from "./render/daylight.js";
import { PowerRange } from "./render/powerRange.js";
import { Toon } from "./render/toon.js";
import { BuildingViews, UnitViews, addModuleViews } from "./render/views.js";
import { LifeViews } from "./render/life.js";
import { Decor } from "./render/decor.js";
import { WeatherViews } from "./render/weather.js";
import { SkyShow } from "./render/skyshow.js";
import { SKY_EVENTS, winterYearOf } from "./world/skywatch.js";
import { FestaView } from "./render/festa.js";
import { festivalKey, FESTIVAL_SECS } from "./world/festival.js";
import { SeasonLook, FallingLeaves } from "./render/seasons.js";
import { Footprints } from "./render/footprints.js";
import { SEASONS, WEATHER, seasonOf } from "./world/season.js";
import { WISH_BY_ID, WISH_REWARD, wishText } from "./world/wishes.js";
import { RANK_REWARD } from "./world/rank.js";
import { newsFor, awayLetter, newsPages } from "./world/news.js";
import { dailyKey, STAMP_SHOP } from "./world/daily.js";
import { PROPS, TRIBES, JOBS, BUILDINGS, MODULES } from "./data/catalog.js";
import { Tools } from "./systems/tools.js";
import { UnitControl } from "./systems/unitControl.js";
import { josa } from "./util.js";
import { TwoFinger } from "./systems/twoFinger.js";
import { QuarterCam } from "./systems/quarterView.js";
import { BuildingThumbs } from "./render/thumbs.js";
import { Hud } from "./ui/hud.js";
import { Quality } from "./render/quality.js";
import { PROP_LOD } from "./render/assets.js";
import { RoomView } from "./render/room.js";
import { Minimap } from "./ui/minimap.js";
import { installKeys } from "./ui/keys.js";
import { Sfx } from "./audio/sfx.js";
import { setTerrainDetail } from "./render/groundChunks.js";
import { findCharacterSet, preloadCharacters, loadTools, playAnim, WALK_SCALE, RUN_SCALE, loadProgress } from "./render/characters.js";

const SAVE_KEY = "galmaemiman-island-v1";
const TOUCH = matchMedia("(pointer: coarse)").matches;

// ---------- 렌더러·장면
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 2)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = skyBackground(); scene.fog = new THREE.Fog(0xdceff4, 110, 230);   // 위는 파랗고 수평선은 밝은 하늘, 안개는 멀리서만
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 260);   // 안개 너머(230 m)는 그리지 않음
const portrait = () => innerWidth < innerHeight;
function fitView() { camera.fov = portrait() ? 62 : 45; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }   // 세로 화면은 넓은 렌즈
fitView();
camera.position.set(0, portrait() ? 70 : 54, portrait() ? 50 : 52);   // 처음엔 섬 전체가 보이게 높고 넓게(참고 그림처럼 비스듬히)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 1.5;   // 낮게(거의 눈높이)·가까이(1.5 m)까지 볼 수 있게. 땅속으로는 못 들어감(아래 keepCameraAboveGround)
 controls.maxDistance = 110;
controls.screenSpacePanning = false; controls.target.set(0, 0, 4);
const hemi = new THREE.HemisphereLight(0xdcefff, 0x8a8f5a, 0.85); scene.add(hemi);   // 하늘빛(위)·땅빛(아래)
const sun = new THREE.DirectionalLight(0xffe2b8, 3.3);   // 따뜻한 햇빛
 sun.position.set(-26, 24, 14); sun.castShadow = true;   // 해를 조금 낮춰 언덕·비탈에 음영
sun.shadow.mapSize.set(TOUCH ? 2048 : 4096, TOUCH ? 2048 : 4096);
// 그림자는 보는 곳 둘레 ±26 m만(넓은 섬 전체를 한 장에 담으면 흐리고 무거움). 해와 그림자 범위가 화면 중심을 따라감(frame)
const SUN_OFF = new THREE.Vector3(-26, 24, 14), SHADOW_R = 26;
Object.assign(sun.shadow.camera, { left: -SHADOW_R, right: SHADOW_R, top: SHADOW_R, bottom: -SHADOW_R, near: 1, far: 100 }); scene.add(sun.target);
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; scene.add(sun);
const water = createWater(); scene.add(water);
const clouds = createClouds(18, 80, 150); scene.add(clouds);   // 넓은 지도(192 m)를 덮게
// 현실 시간대(기기 시계): 해·하늘·안개·바다·구름·등대 / 툰 셰이딩(재질을 단계 명암으로)
const daylight = new Daylight({ scene, renderer, sun, hemi, water, clouds, skyTex: scene.background });
const toon = new Toon(scene); let lastToon = 0;
// 계절·날씨: 계절은 기기 날짜(설정에서 바꿔 볼 수 있음), 날씨는 마을 안에서 바뀜 → 비·눈·번개·땅 색
const weatherViews = new WeatherViews(scene, daylight), skyShow = new SkyShow(scene);   // + 드문 하늘(무지개·유성우)
const festaView = new FestaView(scene);                                           // 축제 색종이
let seasonPick = null;                                                            // null = 실제 날짜
const seasonNow = () => seasonPick || seasonOf(daylight.now());
const seasonLook = new SeasonLook(toon), leaves = new FallingLeaves(scene), footprints = new Footprints(scene);   // 눈·모래 위 발자국
footprints.onStep = (u, kind) => sfx.play("step", { pos: { x: toWorldX(u.x), z: toWorldZ(u.z) }, vol: kind === "snow" ? 0.35 : 0.22, rate: kind === "snow" ? 0.7 : kind === "sand" ? 0.85 : 1.05 });   // 발소리(가까운 갈매미만)
weatherViews.onBolt = () => sfx.thunder(0.9);
let moduleObjs = null;                                                            // 나무 등 모듈 물체(계절 잎 색)
function tintGround() {                                                           // 나무 잎·덤불을 지금 계절로(땅은 셰이더가 천천히 바꿈)
  if (!world?.season) return;
  if (moduleObjs) seasonLook.applyTrees(world, moduleObjs, world.season);
  seasonLook.applyDecor(decor, world.season);
}
const SEASON_NOTE = { spring: "밭이 빨리 자라요", summer: "밭이 조금 빨리 자라요", autumn: "거둘 때 곡식이 하나 더", winter: "밭이 느리게 자라고, 배가 빨리 고프고, 음식 값이 올라요" };
const WEATHER_NOTE = { clear: "", cloudy: "", rain: "밭이 빨리 자라고 물고기가 잘 잡혀요", storm: "낚시를 못 하고 배가 빨리 고파요", snow: "밭이 천천히 자라요" };

const overlay = document.getElementById("overlay");

// ---------- 월드와 뷰(새 섬 / 불러오기 때 통째로 바꿈)
let world, chunks, buildingViews, unitViews, lifeViews, worldRoot, waterDirty = false, lastWater = 0;
// 화질(자동·높음·낮음): 해상도·그림자·지형 조각 수. 자동이면 느릴 때 해상도를 낮춤.
// 효과음(Kenney RPG sounds CC0 + 합성). 화면 중심에서 가까운 일만 들림
const sfx = new Sfx();
const at = o => o ? { x: toWorldX((o.x ?? 0) + 0.5), z: toWorldZ((o.z ?? 0) + 0.5) } : null;
function hookSounds(w) {
  w.on("treeHit", t => sfx.play("chop", { pos: at(t) }));
  w.on("treeFell", e => sfx.play("creak", { pos: at(e.tree), vol: 0.8, rate: 0.8 }));
  w.on("oreHit", o => sfx.play("mine", { pos: at(o), vol: 0.7, rate: 0.75 }));
  w.on("buildingProgress", b => sfx.play("hammer", { pos: at(b.door), vol: 0.55, rate: 1.1 }));
  w.on("buildingAdded", b => { if (ready) sfx.play("place", { pos: at(b.door) }); });
  w.on("buildingDone", b => { sfx.play("done", { pos: at(b.door), vol: 0.8 }); sfx.chime([659, 784], 0.08, 0.12); });
  w.on("fish", e => { sfx.splash(at(e.u), 0.8); if (e.fish.rarity !== "common" || e.fish.season) sfx.chime([880, 1175], 0.08, 0.15); });
  for (const ev of ["market", "bank", "foodSale", "granary"]) w.on(ev, e => sfx.play("coins", { pos: at(e.u || e.buyer), vol: 0.6 }));
  w.on("furnitureBought", e => sfx.play("bag", { pos: at(e.u) }));
  w.on("beachcomb", e => sfx.chime([1047, 1319], 0.07, 0.14));
  w.on("wishDone", () => sfx.chime([784, 988, 1175, 1568], 0.1, 0.2));
  w.on("rank", () => sfx.fanfare());
  w.on("unitAdded", () => { if (ready) sfx.summon(); });
}
// 사용자 제공 소품(가로등·야자수): 최고 품질·높음은 원래 모양, 그 아래는 가벼운 판(새로 만들어지는 것부터)
function applyAssetTier(c) {
  PROP_LOD.level = c.lod ?? 0;                                                    // 소품 텍스처 단계(4k·2k·1k)
  drawDist = c.drawDist ?? 200; lastCull = 0;   // 그리기 거리(보는 곳 둘레 반지름 = drawDist × 0.7), 끝은 안개로 가림(fitFog)
}
// 그리기 거리: 0.3초마다 나무·바위·건물·소품을 카메라와의 거리로 보이기/숨기기(멀리 있는 것은 그리지도, 그림자도 만들지 않음).
// 다른 코드가 쓰는 visible(쓰러진 나무 등)과 겹치지 않게 레이어로: 멀면 메쉬를 레이어 3으로 옮김(카메라·그림자는 레이어 0만 봄)
let drawDist = 200, lastCull = 0;
const farState = new WeakMap(), _cp = new THREE.Vector3();
function setFar(obj, far) {                                                       // 바뀔 때만 그 아래 메쉬 전부(모델이 늦게 붙어도 됨)
  if ((farState.get(obj) ?? false) === far) return; farState.set(obj, far);
  obj.traverse(o => { if (o.isMesh || o.isSprite || o.isPoints || o.isLineSegments) o.layers.set(far ? 3 : 0); });
}
/** 안개·카메라 먼 거리: 카메라에서 보는 곳까지 거리 + 그리기 반지름(멀리서 내려다봐도 보는 곳 둘레는 보이게) */
function fitFog() {
  const R = drawDist * 0.7, cd = camera.position.distanceTo(controls.target);
  scene.fog.near = cd + R * 0.45; scene.fog.far = cd + R * 1.05; const far = cd + R * 1.3 + 20; if (Math.abs(camera.far - far) > 2) { camera.far = far; camera.updateProjectionMatrix(); }
}
function cullFar(now) {
  fitFog();
  if (now - lastCull < 300 || !worldRoot) return; lastCull = now;
  // 보는 곳(화면 가운데) 둘레 R 안 + 카메라에서 너무 먼 작은 것은 뺌(멀리서 보면 점처럼 작아 보여도 그리기 호출은 같음): 소품·나무 1.3배, 건물 1.6배, 갈매미 1배
  const t = controls.target, cam = camera.position, R = drawDist * 0.7;
  const check = (obj, k) => { obj.getWorldPosition(_cp); const dt2 = (_cp.x - t.x) ** 2 + (_cp.z - t.z) ** 2, dc2 = _cp.distanceToSquared(cam), L = drawDist * k; setFar(obj, dt2 > R * R || dc2 > L * L); };
  if (moduleObjs) for (const o of moduleObjs.values()) check(o, 1.3);
  for (const v of buildingViews.views.values()) if (v.model) check(v.holder, 1.6);
  for (const v of unitViews.views || []) if (v?.g) check(v.g, 1.0);
}
// 그래픽 설정 5단계: 바뀌면 땅 상세도·소품·갈매미 그림자 거리를 다시 맞춤
let decor = null;
const quality = new Quality(renderer, sun, c => {
  applyAssetTier(c);
  daylight?.setLampLights(c.lampLights);
  if (setTerrainDetail(c.terrainSub, c.lodScale, c.farDrop) && world) world.grid.markAllDirty();
  unitViews?.setShadowDist(c.shadows ? c.gullShadowDist : 0);
  if (decor && worldRoot) { decor.dispose(); decor = new Decor(worldRoot, world, c.decor); seasonLook?.applyDecor(decor, world.season); }
  weatherViews?.setAmount(c.decor.density); leaves?.setAmount(c.decor.density); festaView?.setAmount(c.decor.density); footprints?.setCapacity(c.footprints);
});
weatherViews.setAmount(quality.cfg.decor.density); leaves.setAmount(quality.cfg.decor.density); festaView.setAmount(quality.cfg.decor.density); footprints.setCapacity(quality.cfg.footprints);
function mount(w) {
  if (worldRoot) { scene.remove(worldRoot); chunks.dispose(); overlay.innerHTML = ""; }
  world = w; world.animateShape = false; worldRoot = new THREE.Group(); scene.add(worldRoot);   // 높이는 누르는 대로 바로 바뀜(스르르 효과는 끔)
  chunks = new GroundChunks(worldRoot, world.grid); chunks.sync();
  water.userData.setGrid(world.grid); world.on("ground", () => { waterDirty = true; });   // 물 깊이(얕은 물빛·물거품)
  buildingViews = new BuildingViews(worldRoot, world, overlay);
  unitViews = new UnitViews(worldRoot, world, charPool); unitViews.setShadowDist(quality.cfg.shadows ? quality.cfg.gullShadowDist : 0);
  lifeViews = new LifeViews(worldRoot, world, overlay);
  moduleObjs = null; decor?.dispose(); decor = new Decor(worldRoot, world, quality.cfg.decor);   // 덤불·꽃·자갈(보기만, 양·모양은 그래픽 설정)
  const waits = [buildingViews.ready, addModuleViews(worldRoot, world).then(map => { lifeViews.attachModules(map); moduleObjs = map; tintGround(); })];
  if (charSet) { world.applyCharacterProfiles(charSet.chars, WALK_SCALE, RUN_SCALE); waits.push(charPool); }
  world.on("unitAdded", u => { hud?.setWorld(world); hud?.setSummon(world); if (tools?.mode === "build") hud.showMode("build", hud.lastBuild);
    hud?.status(`🎉 ${u.name} 등장! (${TRIBES[u.tribe]?.icon ?? ""}${u.tribe} 종족 · ${JOBS[u.job]?.icon ?? ""}${JOBS[u.job]?.name ?? u.job})`, { kind: "good", queue: true }); });
  world.winterYear = winterYearOf(daylight.now());                              // 첫 프레임의 마을 계산보다 먼저(첫눈을 본 겨울과 견줄 해)
  world.festKey = festivalKey(new Date());                                      // 계절 축제 열쇠: 진짜 기기 날짜로(설정의 계절 바꿔 보기·시간 배수와 상관없음)
  world.setSeason(seasonNow()); tintGround(); hookSounds(world);
  world.setDay(dailyKey(new Date()));                                           // 오늘의 부탁: 진짜 기기 날짜로(설정의 시간 배수·계절 바꿔 보기와 상관없음). 계절이 정해진 뒤에 고름
  // 알림 줄: 소식지와 같은 문장(news.js) + 알림에만 붙는 덧말. 차례로 보여 주는 알림(앞 알림·버튼 안내를 덮지 않음), 종류 = 색 띠
  const say = (ev, arg, tail = "") => { const n = newsFor(ev, arg, world); if (n) hud?.status(`${n.icon} ${n.text}${tail}`, { kind: ev === "weather" ? (arg?.kind === "storm" ? "warn" : "info") : ev === "season" || ev === "gift" ? "info" : "good", queue: true }); };
  world.on("season", s => { tintGround(); say("season", s, ` · ${SEASON_NOTE[s]}`); });
  world.on("weather", e => say("weather", e, WEATHER_NOTE[e.kind] ? ` · ${WEATHER_NOTE[e.kind]}` : ""));
  // 드문 하늘: 무지개·유성우가 시작될 때, 겨울 첫눈, 유성우 밤에 주운 별조각
  world.on("sky", e => { say("sky", e, ` · ${e.def.note} (📖 도감)`); sfx.chime(e.kind === "meteor" ? [988, 1319, 1568] : [659, 784, 988, 1175], 0.1, 0.14); });
  world.on("firstSnow", e => { say("firstSnow", e, " (📖 도감 · 하늘 기록)"); sfx.chime([1175, 988, 784], 0.14, 0.12); });
  world.on("starPiece", e => { say("starPiece", e, " (📖 가방)"); sfx.chime([1319, 1568], 0.08, 0.14); });
  world.on("wish", ({ wish, u }) => { const d = WISH_BY_ID[wish.id]; hud?.status(`💭 ${u.name}: "${wishText(d, world, u, wish)}" (${d.hint})`, { kind: "info", queue: true }); });
  world.on("friendship", e => { say("friendship", e, " (📱 관계도)"); if (e.stage >= 2) sfx.chime([659, 784, 988], 0.09, 0.16); });
  world.on("wishLost", ({ wish, u, def }) => hud?.status(`💭 ${u.name}: "${wishText(def, world, u, wish)}" 소원은 접었어요(이제 이루기 어려워요)`, { kind: "warn", queue: true }));
  world.on("rank", e => { say("rank", e, ` ${e.def.unlock.map(id => BUILDINGS[id].name).join(", ")} 건설 가능 · 모두에게 축하금 🪙${RANK_REWARD}`); if (tools?.mode === "build") hud.showMode("build", hud.lastBuild); });
  world.on("beachcomb", e => say("beachcomb", e, " (📖 도감)"));
  world.on("fish", e => { if (e.fish.season) say("fish", e, " (📖 도감)"); });
  // 수족관: 크기 기록(흔한 물고기의 첫 기록은 조용히) · 기증 · 기념 선물
  world.on("fishRecord", e => { if (!e.first || e.fish.rarity !== "common") say("fishRecord", e, " (📖 도감)"); });
  world.on("donate", e => { say("donate", e, " (📖 도감)"); sfx.chime([784, 988, 1319], 0.09, 0.16); });
  world.on("donateGift", e => say("donateGift", e, " (🏠 집 꾸미기에서 놓아요)"));
  // 선물 반응 · 하트 단계가 올라 받은 답례(답례가 뒤에 와서 알림 줄에 남음)
  world.on("gift", e => { say("gift", e); sfx.chime(e.tier >= 2 ? [784, 988, 1175] : e.tier ? [784, 988] : [440], 0.08, 0.14); });
  world.on("bondStage", e => { say("bondStage", e, !e.gift ? "" : e.gift.kind === "furniture" ? " (🏠 집 꾸미기에서 놓아요)" : world.keep[e.gift.id] ? " (📖 가방 · 💛 간직하기를 켜 뒀어요)" : " (🏠 집 꾸미기에서 놓아요)"); sfx.chime([659, 784, 988, 1319], 0.09, 0.16); });
  // 계절 축제의 날: 열림(색종이·팡파르) · 끝남(기념 가구)
  world.on("festival", e => { say("festival", e, ` · 마을 시간 ${Math.round(FESTIVAL_SECS / 60)}분 동안 열려요 (📱 마을)`); sfx.fanfare(); });
  world.on("festivalEnd", e => { say("festivalEnd", e, e.item ? " (🏠 집 꾸미기에서 놓아요 · 📱 마을에 도장)" : ""); sfx.chime([784, 988, 1175, 1568], 0.1, 0.18); });
  world.on("wishDone", e => say("wishDone", e, world.economy ? ` 축하금 🪙${WISH_REWARD}` : ""));
  // 오늘의 부탁: 하나 끝날 때마다 알림(같은 일의 다른 알림에 묻히지 않게 한 박자 늦게), 모두 끝나면 도장
  world.on("dailyDone", e => { const w = world; setTimeout(() => { if (world !== w) return;
    hud?.status(e.all ? `🎉 오늘의 부탁을 모두 들어줬어요! 도장 하나 받았어요(모은 도장 ${e.stamps}개) · 📱 소원 → 도장 가게` : `📋 오늘의 부탁 완료: ${e.req.text}${e.left ? ` · ${e.left}개 남았어요` : ""}`, { kind: "good", queue: true });
    sfx.chime(e.all ? [784, 988, 1175, 1568] : [880, 1175], 0.09, 0.15); }, 60); });
  if (tools) { Object.assign(tools, { world, chunks, buildingViews }); tools.setMode("view"); hud.setWorld(world); unitControl.setFollow(null); world.instantBuild = hud.instantBuild; }
  return Promise.allSettled(waits);                 // 모델·건물·나무를 다 그린 때
}
let tools = null, hud = null;
// 첫 화면: 모델을 다 받을 때까지 「불러오는 중」 화면(진행 막대)을 보여 주고, 그동안 마을 시간은 멈춤
const loadingEl = document.getElementById("loading"), loadBar = document.getElementById("loadBar"), loadText = document.getElementById("loadText");
let ready = false;
loadProgress.onChange = () => {
  const { total, done } = loadProgress; if (!total) return;
  loadBar.style.width = `${Math.round(done / total * 100)}%`; loadText.textContent = `모델 불러오는 중 ${done} / ${total}`;
};
const charSet = await findCharacterSet();          // web/village의 갈매미 모델(없으면 캡슐)
// 갈매미 8종 모델은 처음에 모두 받아 둠(소환하면 바로 나타나게)
const charPool = charSet ? preloadCharacters(charSet, loadTools(PROPS), charSet.dir.includes("gulls") ? quality.cfg.liteModel : quality.cfg.model) : null;
// 저장: 이 브라우저에 1분마다·화면을 떠날 때 자동 저장, 다시 열면 이어서(저장이 없거나 망가졌으면 새 섬)
let lastSaved = 0, resumed = false;
function saveNow(quiet = true) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(world.serialize(Date.now()))); lastSaved = Date.now(); if (!quiet) hud?.status("저장했어요(이 브라우저에만 · 1분마다 자동 저장)"); return true; }
  catch (e) { if (!quiet) hud?.status("저장하지 못했어요: " + e.message); return false; }
}
let oldMap = false;
function loadSaved() { try { const s = localStorage.getItem(SAVE_KEY); if (!s) return null; const j = JSON.parse(s); if (j.grid?.w !== GRID_W) { oldMap = true; return null; } const w = World.fromJSON(j); return w.wild ? w : null; } catch (e) { console.warn("저장을 못 읽어 새 섬으로 시작", e); return null; } }   // 지도 크기가 바뀐 예전 저장은 새 섬으로
const savedWorld = loadSaved(); resumed = !!savedWorld;
/** 다녀온 사이 편지: 저장한 때부터 지금까지 지난 실제 시간(기기 시계 그대로 → 설정의 시간 배수와 상관없음)을 월드에 넘겨 가볍게 쳐 주고, 편지 글을 만듦.
 *  섬을 올린(mount) 뒤에 부름(계절이 정해진 뒤). 10분이 안 지났거나 예전 저장(시각 없음)이면 null. */
function welcomeBack(w) {
  if (!w.savedAt) return null;
  const news = newsPages(w.newsLog, 3)[0]?.heads ?? [], r = w.applyAway(Date.now() - w.savedAt); w.savedAt = null;   // 같은 저장으로 두 번 쳐 주지 않게
  if (!r) return null;
  saveNow();                                       // 쳐 준 것을 바로 저장: 저장 전에 다시 불러와도 편지·낚은 물고기를 또 받지 않게
  const wishes = w.wishes.map(x => { const u = w.units.find(o => o.unitId === x.unitId), d = WISH_BY_ID[x.id]; return u && d ? { who: u.name, text: wishText(d, w, u, x) } : null; }).filter(Boolean);
  return awayLetter(r, { post: !!w.postB(), news, wishes });
}
const firstLoad = mount(savedWorld || World.create(7, Math.random, { wild: true }));   // 넓은 섬: 자연 + 공식은행 + 기본 갈매미 한 마리 → 🥚 소환으로 더
const backLetter = savedWorld ? welcomeBack(world) : null;                        // 다 불러온 뒤에 보여 줌
setInterval(() => { if (ready && !document.hidden) saveNow(); }, 60000);
addEventListener("visibilitychange", () => { if (document.hidden && ready) saveNow(); });
addEventListener("pagehide", () => { if (ready) saveNow(); });
tools = new Tools({ world, scene, camera, dom: renderer.domElement, controls, chunks, buildingViews, onStatus: t => hud?.status(t) });
const twoFinger = new TwoFinger({ dom: renderer.domElement, camera, controls });   // 두 손가락: 비틀면 돌리기, 벌리면 확대
const quarterCam = new QuarterCam({ camera, controls });                        // 건설 모드: 고정 쿼터뷰(⟲ ⟳ 로 90°씩), 끝내면 보던 각도로
const buildingThumbs = new BuildingThumbs(renderer);                            // 건설 갤러리의 건물 사진
tools.applyControls();                              // 처음부터 조작 배치 적용(터치: 한 손가락 = 옮기기, 두 손가락 = 돌리기·확대)
hud = new Hud({ tools, world,
  onSave: () => saveNow(false),
  onLoad: () => { try { const s = localStorage.getItem(SAVE_KEY); if (!s) return hud.status("저장한 섬이 없어요"); mount(World.fromJSON(JSON.parse(s))); hud.status("불러왔어요"); hud.showLetter(welcomeBack(world)); } catch (e) { hud.status("불러오지 못했어요: " + e.message); } },
  onReset: () => { mount(World.create(Math.floor(Math.random() * 1e6), Math.random, { wild: true })); saveNow(); hud.setSummon(world); hud.status("새 섬을 만들었어요 · 🥚 소환으로 갈매미를 불러 보세요"); },
});
// 건설 모드에 들어가고 나올 때: 카메라 고정·풀기 + 조작 배치(돌리기 대신 옮기기). 화면(HUD)은 hud.showMode가 그대로 맡음
{ const showMode = tools.onMode; tools.onMode = (m, arg) => { showMode(m, arg); const on = m !== "view"; if (on === quarterCam.locked) return;
  if (on) quarterCam.enter(); else quarterCam.exit(); tools.viewLock = twoFinger.lock = on; tools.applyControls(); }; }
hud.onViewTurn = dir => quarterCam.turn(dir); hud.thumbs = buildingThumbs;
const unitControl = new UnitControl({ dom: renderer.domElement, camera, controls, tools, getWorld: () => world, getUnitViews: () => unitViews,
  onStatus: t => hud.status(t), onFollow: u => { hud.showFollow(u); world.watchId = u ? u.unitId : null; } });
// 찌 당기기(같이 낚시하기): 따라가는 갈매미에게 입질(❗)이 왔을 때 🎣 당기기! 버튼이나 스페이스 키
const tugNow = () => { const u = unitControl.follow; if (!u || !world.tugFloat(u)) return false; hud.showTug(false); hud.status(`영차! ${josa(u.name, "과", "와")} 같이 당겼어요 · 귀한 물고기가 올 가능성이 커져요`); return true; };
hud.onTug = tugNow;
// 선물 · 쓰다듬기 · 간직하기(선물 알림은 월드가 알려 줌: gift · bondStage)
hud.onGift = (u, id) => world.giveGift(u, id);
hud.onKeep = id => world.toggleKeep(id);
// 도장 가게(오늘의 부탁을 모두 들어주고 받은 도장으로 한정 가구 사기)
hud.onStampBuy = id => { const ok = world.buyStamp(id); if (ok) sfx.play("bag", { vol: 0.7 });
  hud.status(ok ? `🏪 도장 가게에서 ${josa(STAMP_SHOP.find(s => s.id === id).name, "을", "를")} 받아 왔어요 (🏠 집 꾸미기에서 놓아요)` : "도장이 모자라요 · 오늘의 부탁을 모두 들어주면 하나 받아요"); return ok; };
hud.onPet = u => { const r = world.pet(u); if (r.ok) sfx.chime([880, 1047], 0.06, 0.1);
  if (r.ok && !r.thanks.length) hud.status(r.left ? `♥ ${josa(u.name, "을", "를")} 쓰다듬었어요 · 오늘 ${r.left}번 더 할 수 있어요` : `♥ ${josa(u.name, "을", "를")} 쓰다듬었어요 · 오늘은 여기까지, 내일 또 만나요`);
  else if (!r.ok) hud.status(r.reason === "cap" ? `${josa(u.name, "은", "는")} 오늘 충분히 쓰다듬어 줬어요 · 마을 날이 바뀌면 또 할 수 있어요` : `지금은 ${josa(u.name, "을", "를")} 쓰다듬을 수 없어요`);
  return r; };
addEventListener("keydown", e => { if (e.code !== "Space" || e.repeat || e.target?.tagName === "INPUT" || roomView?.isOpen) return; if (tugNow()) e.preventDefault(); });
// 집 꾸미기(방 화면): 섬 화면 대신 방을 그림. 마을 시간은 계속 흐름
const roomView = new RoomView({ renderer, onExit: () => hud.status("집에서 나왔어요") });
sfx.listener = { target: controls.target, camera };
tools.onEdit = kind => sfx.play(kind === "height" ? "dig" : "paint", { vol: 0.5 }); tools.onUndoSound = () => sfx.play("undo", { vol: 0.6 });
roomView.onSound = n => sfx.play(n, { vol: 0.7 });
hud.sfx = sfx; hud.initSound?.();
addEventListener("pointerdown", e => { if (e.target.closest?.("button")) sfx.play("click", { vol: 0.35 }); }, true);   // 버튼 누를 때 작은 소리
const minimap = new Minimap({ getWorld: () => world, camera, controls });   // 넓은 지도: 미니맵(누르면 그곳으로)
// 키보드·포인터 층(Esc 단계 닫기 · 열린 창 뒤로 키 안 새게 · 단축키 · 툴팁) + 새 섬·불러오기 확인창은 hud.confirm
hud.hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } };
installKeys({ hud, tools, roomView });
roomView.chars = charPool;                                                      // 방 안 갈매미 모델
hud.onDecorate = b => { unitControl.setFollow(null); roomView.open(world, b); };
const powerRange = new PowerRange({ scene, camera, controls, getWorld: () => world, card: document.getElementById("houseCard") });   // 풍차 전기 범위 고리(풍차를 누르거나 풍차·가로등 자리를 고를 때)
unitControl.onTapGround = c => { const id = world.grid.get(c.x, c.z)?.occupiedId, b = id && world.buildings.get(id); hud.houseCard(b && BUILDINGS[b.defId].house && world.isDone(b) ? b : null); powerRange.tap(b || null, tools.ray.ray, c); };
hud.onUnitClick = u => unitControl.setFollow(unitControl.follow === u ? null : u);
hud.onSummon = () => { if (!world.summon()) hud.status("8마리 모두 모였어요"); };
hud.setSummon(world);
hud.onZones = on => { lifeViews.showZones = on; };
hud.onInstant = on => { world.instantBuild = on; if (on) world.finishAll(); hud.status(on ? "이제 건물이 바로 완공돼요" : "이제 갈매미가 나무·돌로 건물을 지어요"); };
// 다 받으면(늦어도 90초) 보여 줌. 못 받은 모델은 임시 모양으로 남음
Promise.race([firstLoad, new Promise(r => setTimeout(r, 90000))]).then(() => {
  loadProgress.onChange = null; ready = true; clock.getDelta();
  if (oldMap) hud.status("🗺 지도가 넓어져(본섬 + 작은 섬 5개) 새 섬으로 시작했어요 · 예전 저장은 이 크기와 맞지 않아요", { queue: true });
  else if (resumed) hud.status(`💾 지난 섬을 이어서 해요 (갈매미 ${world.units.length}마리 · 새로 하려면 📱 → 💾 저장 → 🏝 새 섬)`, { queue: true });
  else if (!world.units.length) hud.status("갈매미가 아직 없어요 · 📱 → 🥚 소환을 눌러 불러 보세요", { queue: true });
  else if (world.wild) hud.status("🏦 공식은행 앞에 🔨 기본 갈매미가 왔어요 · 아래 🔨 건설 → 🏠 짓기에서 집을 지어 보세요(나무는 기본이 직접 베어 와요)", { queue: true });
  if (loadProgress.failed) hud.status(`모델 ${loadProgress.failed}개를 못 불러와 임시 모양으로 보여요`, { kind: "warn", queue: true });
  else if (loadProgress.done < loadProgress.total) hud.status("아직 받는 모델이 있어요(받는 대로 바뀌어요)", { queue: true });
  hud.showLetter(backLetter);
  loadingEl.classList.add("done"); setTimeout(() => { loadingEl.hidden = true; }, 450);
});

// ---------- 매 프레임
const clock = new THREE.Clock(); let simT = 0, lastSync = 0, lastHud = 0, lastSeason = 0;
// 키보드로 화면: Q 올리기 · E 내리기(카메라 높이), W·A·S·D·방향키 옮기기(입력창이 아닐 때)
const keys = new Set();
const WASD = { KeyW: "ArrowUp", KeyS: "ArrowDown", KeyA: "ArrowLeft", KeyD: "ArrowRight" };   // W·A·S·D = 방향키
addEventListener("keydown", e => { if (e.target?.tagName === "INPUT" || roomView?.isOpen || e.ctrlKey || e.metaKey) return; const code = WASD[e.code] || e.code; if (/^(KeyQ|KeyE|Arrow(Up|Down|Left|Right))$/.test(code)) { keys.add(code); if (code.startsWith("Arrow")) e.preventDefault(); } if (e.shiftKey) keys.add("Fast"); });
addEventListener("keyup", e => { keys.delete(WASD[e.code] || e.code); if (!e.shiftKey) keys.delete("Fast"); });
addEventListener("blur", () => keys.clear());
/** 카메라가 땅(또는 물) 아래로 내려가지 않게: 낮은 각도·가까운 거리에서 언덕 뒤로 돌아가도 땅을 뚫지 않음 */
function keepCameraAboveGround() {
  const p = camera.position, h = world?.standHeight?.(toGridX(p.x), toGridZ(p.z));
  const floor = (Number.isFinite(h) ? Math.max(0, h) : 0) + 0.35;
  if (p.y < floor) p.y = floor;
}
function keyCamera(dt) {
  if (!keys.size || (keys.size === 1 && keys.has("Fast"))) return;
  const t = controls.target, off = camera.position.clone().sub(t);
  const lift = (keys.has("KeyQ") ? 1 : 0) - (keys.has("KeyE") ? 1 : 0);              // PC: Q = 카메라를 위로, E = 아래로(보는 각도는 그대로, 카메라와 보는 점을 함께 올리고 내림)
  if (lift) t.y = THREE.MathUtils.clamp(t.y + lift * Math.max(3, off.length() * 0.3) * dt * (keys.has("Fast") ? 2.2 : 1), 0, 40);
  const fwd = new THREE.Vector3(-off.x, 0, -off.z).normalize(), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const mv = new THREE.Vector3().addScaledVector(fwd, (keys.has("ArrowUp") ? 1 : 0) - (keys.has("ArrowDown") ? 1 : 0))
    .addScaledVector(right, (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0)).multiplyScalar(Math.max(4, off.length() * 0.6) * dt * (keys.has("Fast") ? 2.2 : 1));   // Shift = 빠르게
  t.add(mv); camera.position.copy(t).add(off);
}
// 한 프레임에서 오류가 나도 게임이 통째로 멈추지 않게: 오류는 기록하고(같은 오류는 5초에 한 번) 다음 프레임을 이어 감
let frameErrAt = 0, frameErrMsg = "";
function frame() {
  try { frameBody(); }
  catch (e) {
    const now = performance.now(), msg = String(e?.message || e);
    if (msg !== frameErrMsg || now - frameErrAt > 5000) { frameErrMsg = msg; frameErrAt = now; console.error("프레임 오류(계속 진행):", e); try { hud?.status("⚠️ 잠깐 문제가 있었지만 계속할게요", { kind: "warn" }); } catch { /* 알림도 못 띄우면 넘어감 */ } }
    requestAnimationFrame(frame);
  }
}
function frameBody() {
  if (quality.skip(performance.now())) { requestAnimationFrame(frame); return; }   // 성능 우선: 30fps 상한
  const dt = Math.min(clock.getDelta(), 0.05); simT += dt;
  if (ready) for (let k = 0; k < simSpeed; k++) world.update(dt);                 // 불러오는 동안은 멈춤. 시간 배수(테스트)면 마을도 여러 번 돌림
  if (roomView.isOpen) {                                                          // 방 화면: 섬은 그리지 않음
    roomView.update(dt); quality.frame(dt, performance.now());
    renderer.render(roomView.scene, roomView.camera); requestAnimationFrame(frame); return;
  }
  // 바뀐 청크만 다시 만듦. 높이가 스르르 바뀌는 동안은 60 ms에 한 번만(매 프레임 다시 그리면 무거움)
  const now = performance.now(); if (!world.shaping.size || now - lastSync > 60) { chunks.sync(controls.target, 2, camera.position.distanceTo(controls.target)); lastSync = now; }   // + 거리별 상세도
  // 해·그림자 범위가 화면 중심을 따라감(2 m 단위로 옮겨 그림자가 떨리지 않게)
  const sx = Math.round(controls.target.x / 2) * 2, sz = Math.round(controls.target.z / 2) * 2;
  cullFar(now);
  daylight.focus = controls.target; daylight.world = world; daylight.update(dt, now); powerRange.update(tools);   // world: 가로등·등불이 풍차 전기를 확인
  world.winterYear = winterYearOf(daylight.now());                              // 첫눈은 겨울마다 한 번(어느 해 겨울인지는 화면이 알려 줌)
  skyShow.update(dt, world.sky, controls.target, camera);
  festaView.update(dt, world.festival, world.festival ? world.standHeight(world.festival.x, world.festival.z) : 0);
  world.isNight = (daylight.night ?? 0) > 0.5;                                 // 밤(해가 진 뒤): 보통 갈매미는 집에서 자고, 야행성은 일함
  weatherViews.update(dt, world.weather.kind, controls.target); sfx.ambience(world.weather.kind, dt);
  seasonLook.update(dt, world.season, world.weather.kind, world.snow); footprints.update(dt, world); leaves.update(dt, world.season, world.weather.kind, controls.target);
  if (now - lastSeason > 1000) { lastSeason = now; world.setSeason(seasonNow()); world.festKey = festivalKey(new Date()); world.setDay(dailyKey(new Date())); }
  sun.target.position.set(sx, 0, sz); sun.position.set(sx, 0, sz).addScaledVector(daylight.dir, 40);   // 해(달) 방향은 시간대에 따라
  if (now - lastToon > 700) { toon.sweep(); lastToon = now; }   // 새로 생긴 모델도 툰으로
  keyCamera(dt);
  unitViews.sync(dt, playAnim, WALK_SCALE, RUN_SCALE, SPEED_BOOST, simT, camera);
  buildingViews.updateConstruction(dt);
  lifeViews.update(dt, camera, innerWidth, innerHeight);
  water.userData.tick(simT); clouds.userData.tick(dt);
  if (waterDirty && now - lastWater > 300) { water.userData.setGrid(world.grid); waterDirty = false; lastWater = now; }   // 땅을 바꾸면 물 깊이도 다시
  unitControl.update(dt);                           // 따라가기
  hud.showTug(!roomView.isOpen && world.canTug(unitControl.follow), unitControl.follow?.fishT);   // 입질 동안만 당기기 버튼
  minimap.update(dt); tools.tick();                  // 십자선 모드: 화면 가운데 칸
  const lim = world.grid.w / 2 - 4; controls.target.x = THREE.MathUtils.clamp(controls.target.x, -lim, lim); controls.target.z = THREE.MathUtils.clamp(controls.target.z, -lim, lim);
  controls.update(); quarterCam.tick(now);           // 건설 모드: 각도 고정 · 돌리는 중
  keepCameraAboveGround();
  buildingViews.updateBadges(camera, innerWidth, innerHeight);
  if (now - lastHud > 200) { lastHud = now; hud.update({ count: chunks.meshes.size, rebuilt: chunks.rebuilt, fps: quality.fps, tris: chunks.triangles }); }   // 글자판은 1초에 5번만
  quality.frame(dt, now);
  buildingThumbs.pump();                             // 기다리는 건물 사진이 있으면 한 장(이어서 그리는 섬이 덮음)
  renderer.render(scene, camera); requestAnimationFrame(frame);
}
addEventListener("resize", () => { fitView(); renderer.setSize(innerWidth, innerHeight); });
// 시간 배수(테스트용): 시각·날짜·계절이 빨리 감 + 마을 진행(눈 쌓임·갈매미 하루)도 simSpeed배. 실제 시간 모드에서만 날짜가 바뀜
const TIME_MULTS = [[1, 1, "×1"], [60, 2, "×60 (1분=1시간)"], [1440, 4, "×1440 (1분=하루)"], [86400, 8, "×86400 (1초=하루)"]];
let simSpeed = 1;
hud.onTimeMult = to => { const j = TIME_MULTS.findIndex(m => m[0] === to), i = j >= 0 ? j : (TIME_MULTS.findIndex(m => m[0] === daylight.mult) + 1) % TIME_MULTS.length, [m, sp, l] = TIME_MULTS[i];   // to = 고른 배수(없으면 다음 값)
  if (m > 1 && daylight.mode !== "real") { daylight.mode = "real"; document.getElementById("timeMode").textContent = "시간: 실제 시간"; }
  daylight.setMult(m); simSpeed = sp; return l; };
const TIME_MODES = [["real", "실제 시간"], ["noon", "낮 고정"], ["fast", "빠르게(1분=1시간)"]];
hud.onTimeMode = to => { const j = TIME_MODES.findIndex(m => m[0] === to), i = j >= 0 ? j : (TIME_MODES.findIndex(m => m[0] === daylight.mode) + 1) % TIME_MODES.length; daylight.mode = TIME_MODES[i][0]; daylight.last = -1; return TIME_MODES[i][1]; };
const STYLES = [["toon", "툰"], ["clay", "클레이"], ["basic", "기본"]];
function applyStyle(s) { toon.setStyle(s); roomView.toon.setStyle(s); tintGround(); try { localStorage.setItem("galmaemiman-style", s); } catch { /* 무시 */ } return STYLES.find(x => x[0] === s)[1]; }
hud.onToon = to => applyStyle(STYLES.some(x => x[0] === to) ? to : STYLES[(STYLES.findIndex(x => x[0] === toon.style) + 1) % STYLES.length][0]);   // 그림체: 툰 → 클레이 → 기본
{ let s0 = null; try { s0 = localStorage.getItem("galmaemiman-style"); } catch { /* 무시 */ } if (s0 && s0 !== "toon" && STYLES.some(x => x[0] === s0)) document.getElementById("toonBtn").textContent = `그림체: ${applyStyle(s0)}`; }
hud.savedLabel = () => lastSaved ? `마지막 저장 ${new Date(lastSaved).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : "아직 저장 안 함";
hud.timeLabel = () => daylight.label(); hud.today = () => daylight.now();
hud.weatherLabel = () => `${SEASONS[world.season]?.icon ?? ""} ${SEASONS[world.season]?.name ?? ""} · ${WEATHER[world.weather.kind].icon} ${WEATHER[world.weather.kind].name}${world.sky ? ` · ${SKY_EVENTS[world.sky.kind].icon} ${SKY_EVENTS[world.sky.kind].name}` : ""}`;
hud.onWeatherInfo = () => hud.status(`${hud.weatherLabel()} · ${[SEASON_NOTE[world.season], WEATHER_NOTE[world.weather.kind]].filter(Boolean).join(" · ")}`);
const SEASON_PICKS = [null, "spring", "summer", "autumn", "winter"];
const seasonText = () => seasonPick ? SEASONS[seasonPick].name : `실제 날짜(${SEASONS[seasonOf(daylight.now())].name})`;
hud.onSeasonMode = to => { seasonPick = to !== undefined && SEASON_PICKS.includes(to) ? to : SEASON_PICKS[(SEASON_PICKS.indexOf(seasonPick) + 1) % SEASON_PICKS.length]; world.setSeason(seasonNow()); return seasonText(); };
hud.setSeasonLabel(seasonText());
hud.settingNow = () => ({ season: seasonPick || "real", time: daylight.mode, mult: daylight.mult, toon: toon.style });   // 설정 고르기 칸의 ✓
hud.onQuality = mode => { quality.set(mode); hud.status(`그래픽: ${quality.cfg.name} · 갈매미 모델 정밀도는 다음에 열 때부터`); return quality.mode; };
hud.setQuality(quality.mode);
requestAnimationFrame(frame);

// 자동 시험용 손잡이
window.__island = { sfx, roomView, festaView, daylight, toon, quality, weatherViews, seasonLook, skyShow,
  sky: kind => kind === "firstSnow" ? world.firstSnow(true) : world.startSky(kind, true),   // 드문 하늘을 바로 띄워 보기: "rainbow" | "meteor" | "firstSnow"
  setSeason: s => { seasonPick = s; world.setSeason(seasonNow()); }, get world() { return world; }, get chunks() { return chunks; }, get tools() { return tools; }, get unitControl() { return unitControl; }, get hud() { return hud; }, camera, controls, renderer, scene, quarterCam, thumbs: buildingThumbs,
  run(seconds) { for (let i = 0, n = Math.round(seconds * 30); i < n; i++) world.update(1 / 30); } };
