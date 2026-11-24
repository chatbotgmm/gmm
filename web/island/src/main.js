// 시작점: 장면·카메라·빛을 만들고 월드, 뷰, 도구, 화면 UI를 잇는다.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { World, SPEED_BOOST } from "./world/World.js";
import { GroundChunks } from "./render/groundChunks.js";
import { createWater } from "./render/water.js";
import { BuildingViews, UnitViews, addModuleViews } from "./render/views.js";
import { LifeViews } from "./render/life.js";
import { PROPS, TRIBES, JOBS } from "./data/catalog.js";
import { Tools } from "./systems/tools.js";
import { UnitControl } from "./systems/unitControl.js";
import { TwoFinger } from "./systems/twoFinger.js";
import { Hud } from "./ui/hud.js";
import { Quality } from "./render/quality.js";
import { setTerrainDetail } from "./render/groundChunks.js";
import { findCharacterSet, preloadCharacters, loadTools, playAnim, WALK_SCALE, RUN_SCALE, loadProgress } from "./render/characters.js";

const SAVE_KEY = "galmaemiman-island-v1";
const TOUCH = matchMedia("(pointer: coarse)").matches;

// ---------- 렌더러·장면
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 2)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xcfeaf3); scene.fog = new THREE.Fog(0xcfeaf3, 85, 170);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 220);   // 안개 너머(170 m)는 그리지 않음
const portrait = () => innerWidth < innerHeight;
function fitView() { camera.fov = portrait() ? 62 : 45; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }   // 세로 화면은 넓은 렌즈
fitView();
camera.position.set(0, portrait() ? 42 : 30, portrait() ? 40 : 34);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.46; controls.minDistance = 5; controls.maxDistance = 110;
controls.screenSpacePanning = false; controls.target.set(0, 0, 4);
scene.add(new THREE.HemisphereLight(0xf2f8ff, 0x8fae6a, 1.05));          // 하늘빛은 조금 줄이고
const sun = new THREE.DirectionalLight(0xfff0dc, 2.8); sun.position.set(-26, 24, 14); sun.castShadow = true;   // 해를 조금 낮춰 언덕·비탈에 음영
sun.shadow.mapSize.set(TOUCH ? 2048 : 4096, TOUCH ? 2048 : 4096);
// 그림자는 보는 곳 둘레 ±26 m만(넓은 섬 전체를 한 장에 담으면 흐리고 무거움). 해와 그림자 범위가 화면 중심을 따라감(frame)
const SUN_OFF = new THREE.Vector3(-26, 24, 14), SHADOW_R = 26;
Object.assign(sun.shadow.camera, { left: -SHADOW_R, right: SHADOW_R, top: SHADOW_R, bottom: -SHADOW_R, near: 1, far: 100 }); scene.add(sun.target);
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; scene.add(sun);
const water = createWater(); scene.add(water);

const overlay = document.getElementById("overlay");

// ---------- 월드와 뷰(새 섬 / 불러오기 때 통째로 바꿈)
let world, chunks, buildingViews, unitViews, lifeViews, worldRoot;
// 화질(자동·높음·낮음): 해상도·그림자·지형 조각 수. 자동이면 느릴 때 해상도를 낮춤.
const quality = new Quality(renderer, sun, sub => { if (setTerrainDetail(sub) && world) world.grid.markAllDirty(); });
function mount(w) {
  if (worldRoot) { scene.remove(worldRoot); chunks.dispose(); overlay.innerHTML = ""; }
  world = w; world.animateShape = false; worldRoot = new THREE.Group(); scene.add(worldRoot);   // 높이는 누르는 대로 바로 바뀜(스르르 효과는 끔)
  chunks = new GroundChunks(worldRoot, world.grid); chunks.sync();
  buildingViews = new BuildingViews(worldRoot, world, overlay);
  unitViews = new UnitViews(worldRoot, world, charPool);
  lifeViews = new LifeViews(worldRoot, world, overlay);
  const waits = [buildingViews.ready, addModuleViews(worldRoot, world).then(map => lifeViews.attachModules(map))];
  if (charSet) { world.applyCharacterProfiles(charSet.chars, WALK_SCALE, RUN_SCALE); waits.push(charPool); }
  world.on("unitAdded", u => { hud?.setWorld(world); hud?.setSummon(world); if (tools?.mode === "build") hud.showMode("build", hud.lastBuild);
    hud?.status(`🎉 ${u.name} 등장! (${TRIBES[u.tribe]?.icon ?? ""}${u.tribe} 종족 · ${JOBS[u.job]?.icon ?? ""}${JOBS[u.job]?.name ?? u.job})`); });
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
const firstLoad = mount(World.create(7, Math.random, { wild: true }));            // 넓은 섬: 자연 + 공식은행 + 기본 갈매미 한 마리 → 🥚 소환으로 더
tools = new Tools({ world, scene, camera, dom: renderer.domElement, controls, chunks, buildingViews, onStatus: t => hud?.status(t) });
new TwoFinger({ dom: renderer.domElement, camera, controls });   // 두 손가락: 비틀면 돌리기, 벌리면 확대
tools.applyControls();                              // 처음부터 조작 배치 적용(터치: 한 손가락 = 옮기기, 두 손가락 = 돌리기·확대)
hud = new Hud({ tools, world,
  onSave: () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(world.serialize())); hud.status("저장했어요(이 브라우저에만)"); } catch (e) { hud.status("저장하지 못했어요: " + e.message); } },
  onLoad: () => { try { const s = localStorage.getItem(SAVE_KEY); if (!s) return hud.status("저장한 섬이 없어요"); mount(World.fromJSON(JSON.parse(s))); hud.status("불러왔어요"); } catch (e) { hud.status("불러오지 못했어요: " + e.message); } },
  onReset: () => { mount(World.create(Math.floor(Math.random() * 1e6), Math.random, { wild: true })); hud.setSummon(world); hud.status("새 섬을 만들었어요 · 🥚 소환으로 갈매미를 불러 보세요"); },
});
const unitControl = new UnitControl({ dom: renderer.domElement, camera, controls, tools, getWorld: () => world, getUnitViews: () => unitViews,
  onStatus: t => hud.status(t), onFollow: u => hud.showFollow(u) });
hud.onUnitClick = u => unitControl.setFollow(unitControl.follow === u ? null : u);
hud.onSummon = () => { if (!world.summon()) hud.status("8마리 모두 모였어요"); };
hud.setSummon(world);
hud.onSeeds = () => { for (let i = 0; i < 10; i++) world.addSeed(); hud.status("씨앗을 뿌렸어요"); };
hud.onZones = on => { lifeViews.showZones = on; };
hud.onInstant = on => { world.instantBuild = on; if (on) world.finishAll(); hud.status(on ? "이제 건물이 바로 완공돼요" : "이제 갈매미가 나무·돌로 건물을 지어요"); };
// 다 받으면(늦어도 90초) 보여 줌. 못 받은 모델은 임시 모양으로 남음
Promise.race([firstLoad, new Promise(r => setTimeout(r, 90000))]).then(() => {
  loadProgress.onChange = null; ready = true; clock.getDelta();
  if (!world.units.length) hud.status("갈매미가 아직 없어요 · 📱 → 🥚 소환을 눌러 불러 보세요");
  else if (world.wild) hud.status("🏦 공식은행 앞에 🔨 기본 갈매미가 왔어요 · 🏠 건물 짓기에서 집을 지어 보세요(나무는 기본이 직접 베어 와요)");
  if (loadProgress.failed) hud.status(`모델 ${loadProgress.failed}개를 못 불러와 임시 모양으로 보여요`);
  else if (loadProgress.done < loadProgress.total) hud.status("아직 받는 모델이 있어요(받는 대로 바뀌어요)");
  loadingEl.classList.add("done"); setTimeout(() => { loadingEl.hidden = true; }, 450);
});

// ---------- 매 프레임
const clock = new THREE.Clock(); let simT = 0, lastSync = 0, lastHud = 0;
// 키보드로 화면: Q/E 돌리기, 방향키 옮기기(입력창이 아닐 때)
const keys = new Set();
addEventListener("keydown", e => { if (e.target?.tagName !== "INPUT" && /^(KeyQ|KeyE|Arrow(Up|Down|Left|Right))$/.test(e.code)) { keys.add(e.code); if (e.code.startsWith("Arrow")) e.preventDefault(); } });
addEventListener("keyup", e => keys.delete(e.code)); addEventListener("blur", () => keys.clear());
function keyCamera(dt) {
  if (!keys.size) return;
  const t = controls.target, off = camera.position.clone().sub(t);
  const turn = (keys.has("KeyQ") ? 1 : 0) - (keys.has("KeyE") ? 1 : 0);
  if (turn) off.applyAxisAngle(THREE.Object3D.DEFAULT_UP, turn * 1.6 * dt);
  const fwd = new THREE.Vector3(-off.x, 0, -off.z).normalize(), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const mv = new THREE.Vector3().addScaledVector(fwd, (keys.has("ArrowUp") ? 1 : 0) - (keys.has("ArrowDown") ? 1 : 0))
    .addScaledVector(right, (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0)).multiplyScalar(Math.max(4, off.length() * 0.6) * dt);
  t.add(mv); camera.position.copy(t).add(off);
}
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); simT += dt;
  if (ready) world.update(dt);                       // 불러오는 동안은 멈춤
  // 바뀐 청크만 다시 만듦. 높이가 스르르 바뀌는 동안은 60 ms에 한 번만(매 프레임 다시 그리면 무거움)
  const now = performance.now(); if (!world.shaping.size || now - lastSync > 60) { chunks.sync(controls.target); lastSync = now; }   // + 거리별 상세도
  // 해·그림자 범위가 화면 중심을 따라감(2 m 단위로 옮겨 그림자가 떨리지 않게)
  const sx = Math.round(controls.target.x / 2) * 2, sz = Math.round(controls.target.z / 2) * 2;
  if (sun.target.position.x !== sx || sun.target.position.z !== sz) { sun.target.position.set(sx, 0, sz); sun.position.set(sx, 0, sz).add(SUN_OFF); }
  keyCamera(dt);
  unitViews.sync(dt, playAnim, WALK_SCALE, RUN_SCALE, SPEED_BOOST, simT, camera);
  buildingViews.updateConstruction(dt);
  lifeViews.update(dt, camera, innerWidth, innerHeight);
  water.userData.tick(simT);
  unitControl.update(dt);                           // 따라가기
  const lim = world.grid.w / 2 - 4; controls.target.x = THREE.MathUtils.clamp(controls.target.x, -lim, lim); controls.target.z = THREE.MathUtils.clamp(controls.target.z, -lim, lim);
  controls.update();
  buildingViews.updateBadges(camera, innerWidth, innerHeight);
  if (now - lastHud > 200) { lastHud = now; hud.update({ count: chunks.meshes.size, rebuilt: chunks.rebuilt, fps: quality.fps, tris: chunks.triangles }); }   // 글자판은 1초에 5번만
  quality.frame(dt, now);
  renderer.render(scene, camera); requestAnimationFrame(frame);
}
addEventListener("resize", () => { fitView(); renderer.setSize(innerWidth, innerHeight); });
hud.onQuality = () => { quality.next(); hud.status(`화질: ${quality.cfg.name} · 갈매미 모델 정밀도는 다음에 열 때부터`); return quality.cfg.name; };
hud.setQualityLabel(quality.cfg.name);
requestAnimationFrame(frame);

// 자동 시험용 손잡이
window.__island = { quality, get world() { return world; }, get chunks() { return chunks; }, get tools() { return tools; }, get unitControl() { return unitControl; }, camera, controls, renderer, scene,
  run(seconds) { for (let i = 0, n = Math.round(seconds * 30); i < n; i++) world.update(1 / 30); } };
