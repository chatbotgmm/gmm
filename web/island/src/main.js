// 시작점: 장면·카메라·빛을 만들고 월드, 뷰, 도구, 화면 UI를 잇는다.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { World } from "./world/World.js";
import { GroundChunks } from "./render/groundChunks.js";
import { createWater } from "./render/water.js";
import { BuildingViews, UnitViews, addModuleViews } from "./render/views.js";
import { Tools } from "./systems/tools.js";
import { Hud } from "./ui/hud.js";
import { findCharacterSet, loadCharacter, playAnim, WALK_SCALE, RUN_SCALE } from "./render/characters.js";

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
scene.add(new THREE.HemisphereLight(0xf2f8ff, 0x9fbf7a, 1.35));
const sun = new THREE.DirectionalLight(0xfff2e0, 2.3); sun.position.set(-20, 34, 18); sun.castShadow = true;
sun.shadow.mapSize.set(TOUCH ? 2048 : 4096, TOUCH ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 100 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; scene.add(sun);
const water = createWater(); scene.add(water);
const overlay = document.getElementById("overlay");

// ---------- 월드와 뷰(새 섬 / 불러오기 때 통째로 바꿈)
let world, chunks, buildingViews, unitViews, worldRoot;
function mount(w) {
  if (worldRoot) { scene.remove(worldRoot); chunks.dispose(); overlay.innerHTML = ""; }
  world = w; worldRoot = new THREE.Group(); scene.add(worldRoot);
  chunks = new GroundChunks(worldRoot, world.grid); chunks.sync();
  buildingViews = new BuildingViews(worldRoot, world, overlay);
  unitViews = new UnitViews(worldRoot, world);
  addModuleViews(worldRoot, world);
  if (charSet) { world.applyCharacterProfiles(charSet.chars, WALK_SCALE, RUN_SCALE); unitViews.useCharacters(charSet, loadCharacter); }
  if (tools) { Object.assign(tools, { world, chunks, buildingViews }); tools.setMode("view"); hud.setWorld(world); }
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
document.getElementById("loading").hidden = true;

// ---------- 매 프레임
const clock = new THREE.Clock(); let simT = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); simT += dt;
  world.update(dt);
  chunks.sync();                                    // 바뀐 청크만 다시 만듦
  unitViews.sync(dt, playAnim, WALK_SCALE, RUN_SCALE);
  water.userData.tick(simT);
  controls.target.x = THREE.MathUtils.clamp(controls.target.x, -30, 30); controls.target.z = THREE.MathUtils.clamp(controls.target.z, -30, 30);
  controls.update();
  buildingViews.updateBadges(camera, innerWidth, innerHeight);
  hud.update({ count: chunks.meshes.size, rebuilt: chunks.rebuilt });
  renderer.render(scene, camera); requestAnimationFrame(frame);
}
addEventListener("resize", () => { fitView(); renderer.setSize(innerWidth, innerHeight); });
requestAnimationFrame(frame);

// 자동 시험용 손잡이
window.__island = { get world() { return world; }, get chunks() { return chunks; }, get tools() { return tools; }, camera, controls, renderer, scene,
  run(seconds) { for (let i = 0, n = Math.round(seconds * 30); i < n; i++) world.update(1 / 30); } };
