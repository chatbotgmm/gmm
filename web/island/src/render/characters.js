// 기존 갈매미 모델(web/village/models: gmm_char1~8.glb, 애니메이션 Idle·Walk·Run 등)을 불러 유닛에 입힌다.
// 모델 폴더는 MODEL_DIRS를 차례로 찾는다. 파일은 .glb 그대로이거나, claude.ai 아티팩트처럼 .glb.json(base64)일 수 있다.
// 못 찾으면 null을 돌려주고, 그러면 임시 캡슐을 그대로 쓴다.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// 가벼운 갈매미(assets/gulls: Blender로 삼각형 약 35%·텍스처 1024, tools/lighten_gulls.py)를 먼저 찾고, 없으면 원본
export const MODEL_DIRS = ["assets/gulls/", "../village/models/", "models/"];
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

// ---- 갈매미 모델 가볍게: 마리당 약 3만 삼각형이라 불러올 때 meshoptimizer로 줄인다(뼈대 가중치는 꼭짓점에 그대로 있어 애니메이션 유지).
let simplifier = null;
async function getSimplifier() {
  if (!simplifier) simplifier = import("https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_simplifier.module.js")
    .then(async m => { await m.MeshoptSimplifier.ready; return m.MeshoptSimplifier; }).catch(e => { console.warn("모델 줄이기를 못 불러옴(원본 사용)", e); return null; });
  return simplifier;
}
/** 메쉬 하나의 삼각형을 ratio(0~1) 정도로 줄임. 재질 묶음(groups)이 있으면 묶음마다. */
export async function simplifyMesh(mesh, ratio) {
  const S = await getSimplifier(), g = mesh.geometry;
  if (!S || ratio >= 0.99 || !g.index || !g.attributes.position || g.attributes.position.isInterleavedBufferAttribute) return false;
  const pos = g.attributes.position, P = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { P[i * 3] = pos.getX(i); P[i * 3 + 1] = pos.getY(i); P[i * 3 + 2] = pos.getZ(i); }
  const idx = g.index.array, groups = g.groups.length ? g.groups : [{ start: 0, count: idx.length, materialIndex: 0 }];
  const parts = [], newGroups = [];
  for (const gr of groups) {
    const src = new Uint32Array(idx.subarray(gr.start, gr.start + gr.count)), target = Math.max(3, Math.floor(src.length * ratio / 3) * 3);
    const [out] = S.simplify(src, P, 3, target, 0.02, ["LockBorder"]);
    newGroups.push({ start: parts.reduce((a, p) => a + p.length, 0), count: out.length, materialIndex: gr.materialIndex }); parts.push(out);
  }
  const all = new Uint32Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  g.setIndex(new THREE.BufferAttribute(all, 1)); g.clearGroups(); if (g.groups !== undefined && groups.length > 1) for (const gr of newGroups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  return true;
}

// 손에 쥐는 방향(손 뼈 propR 좌표): up = 도구 손잡이→머리(+Y)가 향할 방향, side = 도구 +X가 향할 방향.
// 각 도구를 쓰는 동작(Chop/Mine/Build/FishWait)에서 손 뼈 축이 실제 어디를 보는지 재서 정함(+Y 앞쪽 손바닥 방향은 동작마다 다름).
//  도끼: 손잡이를 세우고, 날(모델의 -X쪽, 더 넓은 쪽)이 내려치는 앞쪽을 보게
//  곡괭이: 손잡이를 위-앞으로, 머리는 앞뒤로 / 망치: 손잡이를 세우고 때리는 면(-X)이 앞쪽
//  낚싯대: 앞쪽으로 약 60° 세움
export const TOOL_GRIP = {
  default: { up: [0, 0, 1], side: [1, 0, 0] },
  axe:     { up: [0, 0, 1], side: [0, -1, 0] },
  pickaxe: { up: [1, 0, 0], side: [0, 0, 1] },
  hammer:  { up: [0, 0, 1], side: [-1, 0, 0] },
  rod:     { up: [0.56, 0.77, 0.29], side: [0, 0, 1] },
};
function gripQuaternion(g) {
  const y = new THREE.Vector3(...g.up).normalize();
  const x = new THREE.Vector3(...g.side); x.addScaledVector(y, -x.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
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
export async function loadCharacter(dir, cfg, tools = null, simplifyRatio = 1) {
  const g = await loadGLB(dir + cfg.file.split("/").pop()), root = g.scene;
  if (simplifyRatio < 0.99) { const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); }); for (const m of meshes) await simplifyMesh(m, simplifyRatio); }
  // 그림자는 발밑 원판으로(무거운 모델을 그림자용으로 한 번 더 그리지 않음). 화면 밖이면 그리지 않게, 움직여도 잘리지 않을 만큼 넉넉한 범위.
  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = true;
    if (o.geometry) { o.geometry.computeBoundingSphere(); if (o.geometry.boundingSphere) o.geometry.boundingSphere.radius *= 1.6; }
    if (o.isSkinnedMesh) { o.computeBoundingSphere?.(); if (o.boundingSphere) o.boundingSphere.radius *= 1.6; }
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
  if (hand && tools) {
    // 손 뼈에는 모델 안에서 따로 붙은 크기가 있어 그대로 붙이면 도구가 아주 작아짐 → 몸 크기 기준으로 되돌림
    root.updateMatrixWorld(true);
    const handScale = hand.getWorldScale(new THREE.Vector3()).x / cfg.scale;
    for (const [k, proto] of Object.entries(await tools)) {
      if (!proto) continue;
      const t = proto.clone(true), g = TOOL_GRIP[k] || TOOL_GRIP.default;
      t.quaternion.copy(gripQuaternion(g)); t.scale.multiplyScalar(1 / handScale);
      t.visible = false; hand.add(t); inHand[k] = t;                                       // 크기는 몸 크기에 비례(자이언트는 큰 도구)
    }
  }
  return { root, mixer, acts, cfg, anim: "", clip, inHand, onceRef: null };
}

export function playAnim(ch, key, speed = 1, fade = 0.2, restart = false) {
  const a = ch.acts[key]; if (!a) return false; a.timeScale = speed;
  if (ch.anim === key && !restart) return true;
  const prev = ch.acts[ch.anim]; a.reset().play(); if (prev && prev !== a) a.crossFadeFrom(prev, fade, false); ch.anim = key;
  return true;
}
