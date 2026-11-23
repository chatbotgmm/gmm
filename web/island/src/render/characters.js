// 기존 갈매미 모델(web/village/models: gmm_char1~8.glb, 애니메이션 Idle·Walk·Run 등)을 불러 유닛에 입힌다.
// 모델 폴더는 MODEL_DIRS를 차례로 찾는다. 파일은 .glb 그대로이거나, claude.ai 아티팩트처럼 .glb.json(base64)일 수 있다.
// 못 찾으면 null을 돌려주고, 그러면 임시 캡슐을 그대로 쓴다.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const MODEL_DIRS = ["../village/models/", "models/"];
export const WALK_SCALE = 2.2, RUN_SCALE = 1.5;        // web/village와 같은 애니메이션 속도 배율(발이 미끄러지지 않게 잰 값)
const loader = new GLTFLoader();

/** .glb를 받아 파싱. 없으면 같은 이름 + ".json"(base64를 담은 {glb}) 도 시도. */
export async function loadGLB(url) {
  let res = await fetch(url).catch(() => null);
  if (res && res.ok) return loader.parseAsync(await res.arrayBuffer(), url.slice(0, url.lastIndexOf("/") + 1));
  res = await fetch(url + ".json").catch(() => null);
  if (!res || !res.ok) throw new Error("모델을 찾지 못함: " + url);
  const bin = Uint8Array.from(atob((await res.json()).glb), c => c.charCodeAt(0)).buffer;
  return loader.parseAsync(bin, url.slice(0, url.lastIndexOf("/") + 1));
}

/** chars.json이 있는 모델 폴더와 그 내용. 없으면 null. */
export async function findCharacterSet() {
  for (const dir of MODEL_DIRS) {
    try { const r = await fetch(dir + "chars.json"); if (r.ok) return { dir, chars: await r.json() }; } catch { /* 다음 폴더 */ }
  }
  return null;
}

const KEYS = ["Idle", "Walk", "Run", "Jump", "Attack", "Chop", "Mine", "Build", "FishCast", "FishWait", "FishReel"];
const ONCE = new Set(["Jump", "Attack", "FishCast", "FishReel"]);

// ---- 손에 드는 도구(도끼·곡괭이·망치: Kenney Survival Kit, 낚싯대: 도형). web/village와 같은 크기·잡는 위치.
let toolProtos = null;
async function toolModel(url, len) {                   // 손잡이가 +Y, 손잡이 끝 조금 위를 쥠
  const root = (await loadGLB(url)).scene;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; for (const m of [].concat(o.material)) m.metalness = 0; } });
  const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3()), h = box.getSize(new THREE.Vector3()).y;
  root.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
  const m = new THREE.Group(); m.add(root); m.scale.setScalar(len / h); m.position.y = -0.18 * len;
  const g = new THREE.Group(); g.add(m); return g;
}
export function loadTools(props) {
  if (toolProtos) return toolProtos;
  const rod = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.009, 0.62, 6), new THREE.MeshStandardMaterial({ color: 0x8a5a32 }));
  stick.position.y = 0.25; rod.add(stick);
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), new THREE.MeshStandardMaterial({ color: 0x777b80 }));
  reel.rotation.z = Math.PI / 2; reel.position.y = 0.02; rod.add(reel);
  const tip = new THREE.Object3D(); tip.name = "tip"; tip.position.y = 0.56; rod.add(tip);
  const tryTool = (url, len) => toolModel(url, len).catch(e => { console.warn("도구 모델을 못 불러옴", url, e); return null; });
  toolProtos = Promise.all([tryTool(props.axe, 0.34), tryTool(props.pickaxe, 0.34), tryTool(props.hammer, 0.24)])
    .then(([axe, pickaxe, hammer]) => ({ axe, pickaxe, hammer, rod }));
  return toolProtos;
}

/** 캐릭터 하나: 장면 오브젝트, 애니메이션 믹서, 동작들, 손에 붙인 도구, 동작 길이(clip: AI가 타격 시점 계산에 씀). */
export async function loadCharacter(dir, cfg, tools = null) {
  const g = await loadGLB(dir + cfg.file.split("/").pop()), root = g.scene;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false;
    for (const m of [].concat(o.material)) { m.metalness = 0; m.metalnessMap = null; } } });   // 환경맵 없이 검게 보이지 않게
  root.scale.setScalar(cfg.scale);
  const mixer = new THREE.AnimationMixer(root), acts = {}, clip = {};
  for (const src of g.animations) {
    const key = KEYS.find(k => src.name.endsWith("|" + k) || src.name === k);
    if (!key) continue;
    const c = src.clone(), t0 = Math.min(...c.tracks.map(t => t.times[0]));
    c.tracks.forEach(t => t.shift(-t0)); c.resetDuration();                    // 블렌더 키가 1프레임부터 시작: 0으로 당김
    const a = mixer.clipAction(c);
    if (ONCE.has(key)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    acts[key] = a;
    const hit = { Chop: cfg.workHit?.Chop, Mine: cfg.workHit?.Mine, Build: cfg.workHit?.Build, Attack: cfg.hit, FishReel: 0.25, Jump: c.duration / 2 }[key];
    clip[key] = { len: c.duration, hit: hit ?? c.duration };
  }
  let hand = null; root.traverse(o => { if (o.isBone && /^prop.?R$/i.test(o.name)) hand = o; });
  const inHand = {};
  if (hand && tools) for (const [k, proto] of Object.entries(await tools)) {
    if (!proto) continue;
    const t = proto.clone(true); t.visible = false; hand.add(t); inHand[k] = t;            // 마을과 같이 몸 크기에 비례
  }
  return { root, mixer, acts, cfg, anim: "", clip, inHand, onceRef: null };
}

export function playAnim(ch, key, speed = 1, fade = 0.2, restart = false) {
  const a = ch.acts[key]; if (!a) return false; a.timeScale = speed;
  if (ch.anim === key && !restart) return true;
  const prev = ch.acts[ch.anim]; a.reset().play(); if (prev && prev !== a) a.crossFadeFrom(prev, fade, false); ch.anim = key;
  return true;
}
