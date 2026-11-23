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
// 불러오기 진행(첫 화면 진행 막대용): 시작한 모델 수·끝난 수·실패한 수
export const loadProgress = { total: 0, done: 0, failed: 0, onChange: null };
export async function loadGLB(url) {
  loadProgress.total++; loadProgress.onChange?.();
  try { return await fetchGLB(url); } catch (e) { loadProgress.failed++; throw e; }
  finally { loadProgress.done++; loadProgress.onChange?.(); }
}
async function fetchGLB(url) {
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

// ---- 헤엄 동작: 모델에 없어서 기존 동작으로 만든다(뼈 이름이 모델마다 달라도 되게 이름 규칙으로 고름).
// 다리(leg/thigh/shin/foot)는 걷기 동작을 조금 느리게 되풀이 = 물속에서 발 젓기, 나머지(몸·날개·머리)는 서 있기 동작 = 날개를 접고 떠 있음.
// 몸이 출렁이고 기우는 것과 물결은 views.js에서 더함.
const LEG = /^(leg|thigh|shin|foot|toe|calf)[._]?[LR]?$/i;                 // three.js가 뼈 이름의 점을 지움(leg.L → legL)
function tileTrack(t, srcDur, dstDur, slow) {
  const times = [], values = [], n = t.getValueSize(), period = srcDur * slow;
  for (let k = 0; k * period < dstDur + 1e-6; k++) {
    for (let i = 0; i < t.times.length; i++) {
      const tt = k * period + t.times[i] * slow; if (tt > dstDur + 1e-6) break;
      if (times.length && tt <= times[times.length - 1] + 1e-6) continue;
      times.push(tt); for (let j = 0; j < n; j++) values.push(t.values[i * n + j]);
    }
  }
  return new t.constructor(t.name, times, values);
}
export function makeSwimClip(idle, walk) {
  if (!idle || !walk) return null;
  const bone = t => t.name.split(".").slice(0, -1).join("."), isLeg = t => LEG.test(bone(t));
  const dur = Math.max(idle.duration, walk.duration * 1.4 * 2);
  const tracks = [...idle.tracks.filter(t => !isLeg(t)).map(t => tileTrack(t, idle.duration, dur, 1)),
                  ...walk.tracks.filter(isLeg).map(t => tileTrack(t, walk.duration, dur, 1.4))];
  return tracks.some(isLeg) ? new THREE.AnimationClip("Swim", dur, tracks) : null;
}

// ---- 사람형(윗팔·아래팔·허벅지가 따로 있는 뼈대, 지금은 자이언트) 헤엄: 자유형.
// 서 있기 첫 자세에서 시작해 몸 기준 방향으로 계산: 팔은 어깨를 중심으로 번갈아 크게 돌리고(앞→아래로 당기기→뒤→물 위로 넘겨 앞으로),
// 다리는 팔의 두 배 빠르기로 위아래 차기, 몸통은 팔을 따라 좌우로 구르고, 고개는 들어 앞을 봄(몸을 눕히는 것은 views.js).
const SWIM_PERIOD = 1.6;
function makeHumanSwimClip(root, idle) {
  if (!idle) return null;
  const bones = {}; root.traverse(o => { if (o.isBone) bones[o.name.replace(/[._]/g, "").toLowerCase()] = o; });
  const B = n => bones[n];
  const arm = { L: B("upperarml"), R: B("upperarmr") }, leg = { L: B("thighl"), R: B("thighr") }, head = B("head"), chest = B("chest") || B("spine");
  if (!arm.L || !arm.R || !leg.L || !leg.R) return null;
  const saved = new Map(); root.traverse(o => { if (o.isBone) saved.set(o, [o.quaternion.clone(), o.position.clone()]); });
  for (const t of idle.tracks) {                                                  // 서 있기 첫 자세로
    const dot = t.name.lastIndexOf("."), o = root.getObjectByName(t.name.slice(0, dot)), prop = t.name.slice(dot + 1);
    if (o && (prop === "quaternion" || prop === "position")) o[prop].fromArray(t.values, 0);
  }
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert(), rootQInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const charQ = o => rootQInv.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
  const charP = o => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInv);
  const childBone = o => o.children.find(c => c.isBone);
  // 몸 기준 회전 delta를 그 뼈의 자기 회전으로: 새 local = (부모)⁻¹ · delta · (부모) · 원래 local
  const toLocal = (o, delta) => { const qp = charQ(o.parent); return qp.clone().invert().multiply(delta).multiply(qp).multiply(o.quaternion); };
  const N = 24, times = [...Array(N + 1).keys()].map(i => i / N * SWIM_PERIOD), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
  const tracks = [], changed = new Set();
  const addTrack = (o, fn) => { const v = []; times.forEach((t, i) => fn(t, i / N).toArray(v, i * 4)); tracks.push(new THREE.QuaternionKeyframeTrack(o.name + ".quaternion", times, v)); changed.add(o.name); };
  for (const [s, o] of Object.entries(arm)) {
    const c = childBone(o); if (!c) continue;
    const rest = charP(c).sub(charP(o)).normalize(), side = Math.sign(charP(o).x) || (s === "L" ? 1 : -1);
    addTrack(o, (t, f) => {
      const th = Math.PI / 2 - f * Math.PI * 2 + (s === "R" ? Math.PI : 0);                    // 앞(π/2) → 아래(0) → 뒤 → 위 → 앞
      const d = new THREE.Vector3(side * 0.35, -Math.cos(th), Math.sin(th)).normalize();
      return toLocal(o, new THREE.Quaternion().setFromUnitVectors(rest, d));
    });
  }
  for (const [s, o] of Object.entries(leg)) addTrack(o, (t, f) => toLocal(o, new THREE.Quaternion().setFromAxisAngle(X, 0.32 * Math.sin(f * Math.PI * 4 + (s === "R" ? Math.PI : 0)))));
  if (head) addTrack(head, () => toLocal(head, new THREE.Quaternion().setFromAxisAngle(X, -0.85)));
  if (chest) addTrack(chest, (t, f) => toLocal(chest, new THREE.Quaternion().setFromAxisAngle(Z, 0.2 * Math.sin(f * Math.PI * 2))));
  for (const t of idle.tracks) if (!changed.has(t.name.slice(0, t.name.lastIndexOf(".")))) {          // 나머지 뼈는 서 있기 첫 자세로 고정
    const n = t.getValueSize(); tracks.push(new t.constructor(t.name, [0], Array.from(t.values.slice(0, n))));
  }
  for (const [o, [q, p]] of saved) { o.quaternion.copy(q); o.position.copy(p); }
  root.updateMatrixWorld(true);
  return new THREE.AnimationClip("Swim", SWIM_PERIOD, tracks);
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
  const human = makeHumanSwimClip(root, acts.Idle?.getClip());              // 사람형 뼈대(팔·다리 마디)면 자유형
  const swim = human || makeSwimClip(acts.Idle?.getClip(), acts.Walk?.getClip());
  if (swim) { acts.Swim = mixer.clipAction(swim); clip.Swim = { len: swim.duration, hit: swim.duration }; }
  let hand = null; root.traverse(o => { if (o.isBone && /^prop.?R$/i.test(o.name)) hand = o; });
  const inHand = {};
  if (hand && tools) {
    // 손 뼈에 따로 붙은 배율이 있으면 상쇄해 몸 크기 기준으로 맞춤(지금 갈매미 모델은 1이라 그대로)
    root.updateMatrixWorld(true);
    const handScale = hand.getWorldScale(new THREE.Vector3()).x / cfg.scale;
    for (const [k, proto] of Object.entries(await tools)) {
      if (!proto) continue;
      const t = proto.clone(true), g = TOOL_GRIP[k] || TOOL_GRIP.default;
      t.quaternion.copy(gripQuaternion(g)); t.scale.multiplyScalar(1 / handScale);
      t.visible = false; hand.add(t); inHand[k] = t;                                       // 크기는 몸 크기에 비례(자이언트는 큰 도구)
    }
  }
  return { root, mixer, acts, cfg, anim: "", clip, inHand, onceRef: null, humanSwim: !!human };
}

export function playAnim(ch, key, speed = 1, fade = 0.2, restart = false) {
  const a = ch.acts[key]; if (!a) return false; a.timeScale = speed;
  if (ch.anim === key && !restart) return true;
  const prev = ch.acts[ch.anim]; a.reset().play(); if (prev && prev !== a) a.crossFadeFrom(prev, fade, false); ch.anim = key;
  return true;
}
