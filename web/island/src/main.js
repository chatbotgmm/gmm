// 시작점: 장면·카메라·빛을 만들고 월드, 뷰, 도구, 화면 UI를 잇는다.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { World, SPEED_BOOST } from "./world/World.js";
import { GRID_W } from "./config.js";
import { GroundChunks } from "./render/groundChunks.js";
import { createWater } from "./render/water.js";
import { skyBackground, createClouds } from "./render/sky.js";
import { Daylight } from "./render/daylight.js";
import { Toon } from "./render/toon.js";
import { BuildingViews, UnitViews, addModuleViews } from "./render/views.js";
import { LifeViews } from "./render/life.js";
import { Decor } from "./render/decor.js";
import { WeatherViews } from "./render/weather.js";
import { SeasonLook, FallingLeaves } from "./render/seasons.js";
import { SEASONS, WEATHER, seasonOf } from "./world/season.js";
import { WISH_BY_ID, WISH_REWARD } from "./world/wishes.js";
import { RANK_REWARD } from "./world/rank.js";
import { PROPS, TRIBES, JOBS, BUILDINGS, MODULES } from "./data/catalog.js";
import { Tools } from "./systems/tools.js";
import { UnitControl } from "./systems/unitControl.js";
import { TwoFinger } from "./systems/twoFinger.js";
import { Hud } from "./ui/hud.js";
import { Quality } from "./render/quality.js";
import { RoomView } from "./render/room.js";
import { Minimap } from "./ui/minimap.js";
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
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.46; controls.minDistance = 5; controls.maxDistance = 110;
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
const weatherViews = new WeatherViews(scene, daylight);
let seasonPick = null;                                                            // null = 실제 날짜
const seasonNow = () => seasonPick || seasonOf(daylight.now());
const seasonLook = new SeasonLook(toon), leaves = new FallingLeaves(scene);
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
// 사용자 제공 소품(가로등·야자수): 최고 품질·높음은 원래 모양, 그 아래는 가벼운 판(새로 만들어지는 것부터)
function applyAssetTier(c) {
  const lite = c.model < 1;
  for (const d of Object.values(BUILDINGS)) if (d.liteAsset) { d.fullAsset ??= d.asset; d.asset = lite ? d.liteAsset : d.fullAsset; }
  for (const d of Object.values(BUILDINGS)) if (d.liteProp) { d.fullProp ??= d.prop; d.prop = lite ? d.liteProp : d.fullProp; }
  for (const d of Object.values(MODULES)) if (d.liteAssets) { d.fullAssets ??= d.assets; d.assets = lite ? d.liteAssets : d.fullAssets; }
}
// 그래픽 설정 5단계: 바뀌면 땅 상세도·소품·갈매미 그림자 거리를 다시 맞춤
let decor = null;
const quality = new Quality(renderer, sun, c => {
  applyAssetTier(c);
  daylight?.setLampLights(c.lampLights);
  if (setTerrainDetail(c.terrainSub, c.lodScale, c.farDrop) && world) world.grid.markAllDirty();
  unitViews?.setShadowDist(c.shadows ? c.gullShadowDist : 0);
  if (decor && worldRoot) { decor.dispose(); decor = new Decor(worldRoot, world, c.decor); seasonLook?.applyDecor(decor, world.season); }
  weatherViews?.setAmount(c.decor.density); leaves?.setAmount(c.decor.density);
});
weatherViews.setAmount(quality.cfg.decor.density); leaves.setAmount(quality.cfg.decor.density);
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
    hud?.status(`🎉 ${u.name} 등장! (${TRIBES[u.tribe]?.icon ?? ""}${u.tribe} 종족 · ${JOBS[u.job]?.icon ?? ""}${JOBS[u.job]?.name ?? u.job})`); });
  world.setSeason(seasonNow()); tintGround();
  world.on("season", s => { tintGround(); hud?.status(`${SEASONS[s].icon} ${SEASONS[s].name}이에요 · ${SEASON_NOTE[s]}`); });
  world.on("weather", e => { const w = WEATHER[e.kind]; hud?.status(`${w.icon} 날씨: ${w.name}${WEATHER_NOTE[e.kind] ? ` · ${WEATHER_NOTE[e.kind]}` : ""}`); });
  world.on("wish", ({ wish, u }) => { const d = WISH_BY_ID[wish.id]; hud?.status(`💭 ${u.name}: "${d.text}" (${d.hint})`); });
  world.on("rank", ({ def }) => { hud?.status(`🏅 마을 등급이 올랐어요: ${def.icon} ${def.name}! ${def.unlock.map(id => BUILDINGS[id].name).join(", ")} 건설 가능 · 모두에게 축하금 🪙${RANK_REWARD}`); if (tools?.mode === "build") hud.showMode("build", hud.lastBuild); });
  world.on("beachcomb", ({ u, item }) => hud?.status(`✨ ${u.name}이 바닷가에서 ${item.name}을 주웠어요 (📖 도감)`));
  world.on("fish", ({ u, fish }) => { if (fish.season) hud?.status(`🎣 ${u.name}이 제철 ${fish.name}을 낚았어요! (📖 도감)`); });
  world.on("wishDone", ({ u, def }) => hud?.status(`♥ ${u.name}의 소원 "${def.text}"이 이루어졌어요!${world.economy ? ` 축하금 🪙${WISH_REWARD}` : ""}`));
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
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(world.serialize())); lastSaved = Date.now(); if (!quiet) hud?.status("저장했어요(이 브라우저에만 · 1분마다 자동 저장)"); return true; }
  catch (e) { if (!quiet) hud?.status("저장하지 못했어요: " + e.message); return false; }
}
let oldMap = false;
function loadSaved() { try { const s = localStorage.getItem(SAVE_KEY); if (!s) return null; const j = JSON.parse(s); if (j.grid?.w !== GRID_W) { oldMap = true; return null; } const w = World.fromJSON(j); return w.wild ? w : null; } catch (e) { console.warn("저장을 못 읽어 새 섬으로 시작", e); return null; } }   // 지도 크기가 바뀐 예전 저장은 새 섬으로
const savedWorld = loadSaved(); resumed = !!savedWorld;
const firstLoad = mount(savedWorld || World.create(7, Math.random, { wild: true }));   // 넓은 섬: 자연 + 공식은행 + 기본 갈매미 한 마리 → 🥚 소환으로 더
setInterval(() => { if (ready && !document.hidden) saveNow(); }, 60000);
addEventListener("visibilitychange", () => { if (document.hidden && ready) saveNow(); });
addEventListener("pagehide", () => { if (ready) saveNow(); });
tools = new Tools({ world, scene, camera, dom: renderer.domElement, controls, chunks, buildingViews, onStatus: t => hud?.status(t) });
new TwoFinger({ dom: renderer.domElement, camera, controls });   // 두 손가락: 비틀면 돌리기, 벌리면 확대
tools.applyControls();                              // 처음부터 조작 배치 적용(터치: 한 손가락 = 옮기기, 두 손가락 = 돌리기·확대)
hud = new Hud({ tools, world,
  onSave: () => saveNow(false),
  onLoad: () => { try { const s = localStorage.getItem(SAVE_KEY); if (!s) return hud.status("저장한 섬이 없어요"); mount(World.fromJSON(JSON.parse(s))); hud.status("불러왔어요"); } catch (e) { hud.status("불러오지 못했어요: " + e.message); } },
  onReset: () => { if (!confirm("지금 섬을 버리고 새 섬을 만들까요? (자동 저장도 새 섬으로 바뀌어요)")) return; mount(World.create(Math.floor(Math.random() * 1e6), Math.random, { wild: true })); saveNow(); hud.setSummon(world); hud.status("새 섬을 만들었어요 · 🥚 소환으로 갈매미를 불러 보세요"); },
});
const unitControl = new UnitControl({ dom: renderer.domElement, camera, controls, tools, getWorld: () => world, getUnitViews: () => unitViews,
  onStatus: t => hud.status(t), onFollow: u => hud.showFollow(u) });
// 집 꾸미기(방 화면): 섬 화면 대신 방을 그림. 마을 시간은 계속 흐름
const roomView = new RoomView({ renderer, onExit: () => hud.status("집에서 나왔어요") });
const minimap = new Minimap({ getWorld: () => world, camera, controls });   // 넓은 지도: 미니맵(누르면 그곳으로)
hud.onDecorate = b => { unitControl.setFollow(null); roomView.open(world, b); };
unitControl.onTapGround = c => { const id = world.grid.get(c.x, c.z)?.occupiedId, b = id && world.buildings.get(id); hud.houseCard(b && BUILDINGS[b.defId].house && world.isDone(b) ? b : null); };
hud.onUnitClick = u => unitControl.setFollow(unitControl.follow === u ? null : u);
hud.onSummon = () => { if (!world.summon()) hud.status("8마리 모두 모였어요"); };
hud.setSummon(world);
hud.onZones = on => { lifeViews.showZones = on; };
hud.onInstant = on => { world.instantBuild = on; if (on) world.finishAll(); hud.status(on ? "이제 건물이 바로 완공돼요" : "이제 갈매미가 나무·돌로 건물을 지어요"); };
// 다 받으면(늦어도 90초) 보여 줌. 못 받은 모델은 임시 모양으로 남음
Promise.race([firstLoad, new Promise(r => setTimeout(r, 90000))]).then(() => {
  loadProgress.onChange = null; ready = true; clock.getDelta();
  if (oldMap) hud.status("🗺 지도가 넓어져(본섬 + 작은 섬 5개) 새 섬으로 시작했어요 · 예전 저장은 이 크기와 맞지 않아요");
  else if (resumed) hud.status(`💾 지난 섬을 이어서 해요 (갈매미 ${world.units.length}마리 · 새로 하려면 📱 → 💾 저장 → 🏝 새 섬)`);
  else if (!world.units.length) hud.status("갈매미가 아직 없어요 · 📱 → 🥚 소환을 눌러 불러 보세요");
  else if (world.wild) hud.status("🏦 공식은행 앞에 🔨 기본 갈매미가 왔어요 · 🏠 건물 짓기에서 집을 지어 보세요(나무는 기본이 직접 베어 와요)");
  if (loadProgress.failed) hud.status(`모델 ${loadProgress.failed}개를 못 불러와 임시 모양으로 보여요`);
  else if (loadProgress.done < loadProgress.total) hud.status("아직 받는 모델이 있어요(받는 대로 바뀌어요)");
  loadingEl.classList.add("done"); setTimeout(() => { loadingEl.hidden = true; }, 450);
});

// ---------- 매 프레임
const clock = new THREE.Clock(); let simT = 0, lastSync = 0, lastHud = 0, lastSeason = 0;
// 키보드로 화면: Q/E 돌리기, 방향키 옮기기(입력창이 아닐 때)
const keys = new Set();
const WASD = { KeyW: "ArrowUp", KeyS: "ArrowDown", KeyA: "ArrowLeft", KeyD: "ArrowRight" };   // W·A·S·D = 방향키
addEventListener("keydown", e => { if (e.target?.tagName === "INPUT" || roomView?.isOpen || e.ctrlKey || e.metaKey) return; const code = WASD[e.code] || e.code; if (/^(KeyQ|KeyE|Arrow(Up|Down|Left|Right))$/.test(code)) { keys.add(code); if (code.startsWith("Arrow")) e.preventDefault(); } if (e.shiftKey) keys.add("Fast"); });
addEventListener("keyup", e => { keys.delete(WASD[e.code] || e.code); if (!e.shiftKey) keys.delete("Fast"); });
addEventListener("blur", () => keys.clear());
function keyCamera(dt) {
  if (!keys.size || (keys.size === 1 && keys.has("Fast"))) return;
  const t = controls.target, off = camera.position.clone().sub(t);
  const turn = (keys.has("KeyQ") ? 1 : 0) - (keys.has("KeyE") ? 1 : 0);
  if (turn) off.applyAxisAngle(THREE.Object3D.DEFAULT_UP, turn * 1.6 * dt);
  const fwd = new THREE.Vector3(-off.x, 0, -off.z).normalize(), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const mv = new THREE.Vector3().addScaledVector(fwd, (keys.has("ArrowUp") ? 1 : 0) - (keys.has("ArrowDown") ? 1 : 0))
    .addScaledVector(right, (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0)).multiplyScalar(Math.max(4, off.length() * 0.6) * dt * (keys.has("Fast") ? 2.2 : 1));   // Shift = 빠르게
  t.add(mv); camera.position.copy(t).add(off);
}
function frame() {
  if (quality.skip(performance.now())) { requestAnimationFrame(frame); return; }   // 성능 우선: 30fps 상한
  const dt = Math.min(clock.getDelta(), 0.05); simT += dt;
  if (ready) world.update(dt);                       // 불러오는 동안은 멈춤
  if (roomView.isOpen) {                                                          // 방 화면: 섬은 그리지 않음
    roomView.update(dt); quality.frame(dt, performance.now());
    renderer.render(roomView.scene, roomView.camera); requestAnimationFrame(frame); return;
  }
  // 바뀐 청크만 다시 만듦. 높이가 스르르 바뀌는 동안은 60 ms에 한 번만(매 프레임 다시 그리면 무거움)
  const now = performance.now(); if (!world.shaping.size || now - lastSync > 60) { chunks.sync(controls.target, 2, camera.position.distanceTo(controls.target)); lastSync = now; }   // + 거리별 상세도
  // 해·그림자 범위가 화면 중심을 따라감(2 m 단위로 옮겨 그림자가 떨리지 않게)
  const sx = Math.round(controls.target.x / 2) * 2, sz = Math.round(controls.target.z / 2) * 2;
  daylight.focus = controls.target; daylight.update(dt, now);
  weatherViews.update(dt, world.weather.kind, controls.target);
  seasonLook.update(dt, world.season, world.weather.kind); leaves.update(dt, world.season, world.weather.kind, controls.target);
  if (now - lastSeason > 1000) { lastSeason = now; world.setSeason(seasonNow()); }
  sun.target.position.set(sx, 0, sz); sun.position.set(sx, 0, sz).addScaledVector(daylight.dir, 40);   // 해(달) 방향은 시간대에 따라
  if (now - lastToon > 700) { toon.sweep(); lastToon = now; }   // 새로 생긴 모델도 툰으로
  keyCamera(dt);
  unitViews.sync(dt, playAnim, WALK_SCALE, RUN_SCALE, SPEED_BOOST, simT, camera);
  buildingViews.updateConstruction(dt);
  lifeViews.update(dt, camera, innerWidth, innerHeight);
  water.userData.tick(simT); clouds.userData.tick(dt);
  if (waterDirty && now - lastWater > 300) { water.userData.setGrid(world.grid); waterDirty = false; lastWater = now; }   // 땅을 바꾸면 물 깊이도 다시
  unitControl.update(dt);                           // 따라가기
  minimap.update(dt);
  const lim = world.grid.w / 2 - 4; controls.target.x = THREE.MathUtils.clamp(controls.target.x, -lim, lim); controls.target.z = THREE.MathUtils.clamp(controls.target.z, -lim, lim);
  controls.update();
  buildingViews.updateBadges(camera, innerWidth, innerHeight);
  if (now - lastHud > 200) { lastHud = now; hud.update({ count: chunks.meshes.size, rebuilt: chunks.rebuilt, fps: quality.fps, tris: chunks.triangles }); }   // 글자판은 1초에 5번만
  quality.frame(dt, now);
  renderer.render(scene, camera); requestAnimationFrame(frame);
}
addEventListener("resize", () => { fitView(); renderer.setSize(innerWidth, innerHeight); });
const TIME_MODES = [["real", "실제 시간"], ["noon", "낮 고정"], ["fast", "빠르게(1분=1시간)"]];
hud.onTimeMode = () => { const i = (TIME_MODES.findIndex(m => m[0] === daylight.mode) + 1) % TIME_MODES.length; daylight.mode = TIME_MODES[i][0]; daylight.last = -1; return TIME_MODES[i][1]; };
hud.onToon = () => { toon.set(!toon.on); tintGround(); return toon.on ? "툰" : "기본"; };
hud.savedLabel = () => lastSaved ? `마지막 저장 ${new Date(lastSaved).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : "아직 저장 안 함";
hud.timeLabel = () => daylight.label(); hud.today = () => daylight.now();
hud.weatherLabel = () => `${SEASONS[world.season]?.icon ?? ""} ${SEASONS[world.season]?.name ?? ""} · ${WEATHER[world.weather.kind].icon} ${WEATHER[world.weather.kind].name}`;
hud.onWeatherInfo = () => hud.status(`${hud.weatherLabel()} · ${[SEASON_NOTE[world.season], WEATHER_NOTE[world.weather.kind]].filter(Boolean).join(" · ")}`);
const SEASON_PICKS = [null, "spring", "summer", "autumn", "winter"];
const seasonText = () => seasonPick ? SEASONS[seasonPick].name : `실제 날짜(${SEASONS[seasonOf(daylight.now())].name})`;
hud.onSeasonMode = () => { seasonPick = SEASON_PICKS[(SEASON_PICKS.indexOf(seasonPick) + 1) % SEASON_PICKS.length]; world.setSeason(seasonNow()); return seasonText(); };
hud.setSeasonLabel(seasonText());
hud.onQuality = mode => { quality.set(mode); hud.status(`그래픽: ${quality.cfg.name} · 갈매미 모델 정밀도는 다음에 열 때부터`); return quality.mode; };
hud.setQuality(quality.mode);
requestAnimationFrame(frame);

// 자동 시험용 손잡이
window.__island = { roomView, daylight, toon, quality, weatherViews, seasonLook, setSeason: s => { seasonPick = s; world.setSeason(seasonNow()); }, get world() { return world; }, get chunks() { return chunks; }, get tools() { return tools; }, get unitControl() { return unitControl; }, camera, controls, renderer, scene,
  run(seconds) { for (let i = 0, n = Math.round(seconds * 30); i < n; i++) world.update(1 / 30); } };
