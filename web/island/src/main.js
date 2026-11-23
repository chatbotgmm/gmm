// 시작점: 장면·카메라·빛을 만들고 월드, 뷰, 도구, 화면 UI를 잇는다.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { World, SPEED_BOOST } from "./world/World.js";
import { GroundChunks } from "./render/groundChunks.js";
import { createWater } from "./render/water.js";
import { BuildingViews, UnitViews, addModuleViews } from "./render/views.js";
import { LifeViews } from "./render/life.js";
import { PROPS } from "./data/catalog.js";
import { Tools } from "./systems/tools.js";
import { UnitControl } from "./systems/unitControl.js";
import { Hud } from "./ui/hud.js";
import { Quality } from "./render/quality.js";
import { setTerrainDetail } from "./render/groundChunks.js";
import { findCharacterSet, loadCharacter, loadTools, playAnim, WALK_SCALE, RUN_SCALE } from "./render/characters.js";

const SAVE_KEY = "galmaemiman-island-v1";
const TOUCH = matchMedia("(pointer: coarse)").matches;

// ---------- 렌더러·장면
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 2)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xcfeaf3); scene.fog = new THREE.Fog(0xcfeaf3, 70, 150);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 400);
const portrait = () => innerWidth < innerHeight;
function fitView() { camera.fov = portrait() ? 62 : 45; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }   // 세로 화면은 넓은 렌즈
fitView();
camera.position.set(0, portrait() ? 50 : 34, portrait() ? 44 : 38);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.46; controls.minDistance = 5; controls.maxDistance = 90;
controls.screenSpacePanning = false; controls.target.set(0, 0, 2);
scene.add(new THREE.HemisphereLight(0xf2f8ff, 0x8fae6a, 1.05));          // 하늘빛은 조금 줄이고
const sun = new THREE.DirectionalLight(0xfff0dc, 2.8); sun.position.set(-26, 24, 14); sun.castShadow = true;   // 해를 조금 낮춰 언덕·비탈에 음영
sun.shadow.mapSize.set(TOUCH ? 2048 : 4096, TOUCH ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 100 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; scene.add(sun);
const water = createWater(); scene.add(water);

const overlay = document.getElementById("overlay");

// ---------- 월드와 뷰(새 섬 / 불러오기 때 통째로 바꿈)
let world, chunks, buildingViews, unitViews, lifeViews, worldRoot;
// 화질(자동·높음·낮음): 해상도·그림자·지형 조각 수. 자동이면 느릴 때 해상도를 낮춤.
const quality = new Quality(renderer, sun, sub => { if (setTerrainDetail(sub) && world) world.grid.markAllDirty(); });
function mount(w) {
  if (worldRoot) { scene.remove(worldRoot); chunks.dispose(); overlay.innerHTML = ""; }
  world = w; world.animateShape = true; worldRoot = new THREE.Group(); scene.add(worldRoot);   // 화면에서는 높이가 스르르 바뀜
  chunks = new GroundChunks(worldRoot, world.grid); chunks.sync();
  buildingViews = new BuildingViews(worldRoot, world, overlay);
  unitViews = new UnitViews(worldRoot, world);
  lifeViews = new LifeViews(worldRoot, world, overlay);
  addModuleViews(worldRoot, world).then(map => lifeViews.attachModules(map));
  if (charSet) { world.applyCharacterProfiles(charSet.chars, WALK_SCALE, RUN_SCALE); unitViews.useCharacters(charSet, loadCharacter, loadTools(PROPS), quality.cfg.model); }
  if (tools) { Object.assign(tools, { world, chunks, buildingViews }); tools.setMode("view"); hud.setWorld(world); unitControl.setFollow(null); world.instantBuild = hud.instantBuild; }
}
let tools = null, hud = null;
const charSet = await findCharacterSet();          // web/village의 갈매미 모델(없으면 캡슐)
mount(World.create(7));
tools = new Tools({ world, scene, camera, dom: renderer.domElement, controls, chunks, buildingViews, onStatus: t => hud?.status(t) });
hud = new Hud({ tools, world,
  onSave: () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(world.serialize())); hud.status("저장했어요(이 브라우저에만)"); } catch (e) { hud.status("저장하지 못했어요: " + e.message); } },
  onLoad: () => { try { const s = localStorage.getItem(SAVE_KEY); if (!s) return hud.status("저장한 섬이 없어요"); mount(World.fromJSON(JSON.parse(s))); hud.status("불러왔어요"); } catch (e) { hud.status("불러오지 못했어요: " + e.message); } },
  onReset: () => { mount(World.create(7)); hud.status("새 섬을 만들었어요"); },
});
const unitControl = new UnitControl({ dom: renderer.domElement, camera, controls, tools, getWorld: () => world, getUnitViews: () => unitViews,
  onStatus: t => hud.status(t), onFollow: u => hud.showFollow(u) });
hud.onUnitClick = u => unitControl.setFollow(unitControl.follow === u ? null : u);
hud.onSeeds = () => { for (let i = 0; i < 10; i++) world.addSeed(); hud.status("씨앗을 뿌렸어요"); };
hud.onZones = on => { lifeViews.showZones = on; };
hud.onInstant = on => { world.instantBuild = on; if (on) world.finishAll(); hud.status(on ? "이제 건물이 바로 완공돼요" : "이제 갈매미가 나무·돌로 건물을 지어요"); };
document.getElementById("loading").hidden = true;

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
  world.update(dt);
  // 바뀐 청크만 다시 만듦. 높이가 스르르 바뀌는 동안은 60 ms에 한 번만(매 프레임 다시 그리면 무거움)
  const now = performance.now(); if (!world.shaping.size || now - lastSync > 60) { chunks.sync(); lastSync = now; }
  keyCamera(dt);
  unitViews.sync(dt, playAnim, WALK_SCALE, RUN_SCALE, SPEED_BOOST, simT, camera);
  buildingViews.updateConstruction(dt);
  lifeViews.update(dt, camera, innerWidth, innerHeight);
  water.userData.tick(simT);
  unitControl.update(dt);                           // 따라가기
  controls.target.x = THREE.MathUtils.clamp(controls.target.x, -30, 30); controls.target.z = THREE.MathUtils.clamp(controls.target.z, -30, 30);
  controls.update();
  buildingViews.updateBadges(camera, innerWidth, innerHeight);
  if (now - lastHud > 200) { lastHud = now; hud.update({ count: chunks.meshes.size, rebuilt: chunks.rebuilt, fps: quality.fps }); }   // 글자판은 1초에 5번만
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
