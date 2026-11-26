// 기존 갈매미 모델(web/village/models: gmm_char1~8.glb, 애니메이션 Idle·Walk·Run 등)을 불러 유닛에 입힌다.
// 모델 폴더는 MODEL_DIRS를 차례로 찾는다. 파일은 .glb 그대로이거나, claude.ai 아티팩트처럼 .glb.json(base64)일 수 있다.
// 처음에 한 번 받아 메모리(gullLoad.js GullPool)에 두고 섬·방이 같이 씀. 다 받을 때까지 불러오는 중 화면(캡슐 대신 모습은 없음).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// 가벼운 갈매미(assets/gulls: Blender로 삼각형 약 35%·텍스처 1024, tools/lighten_gulls.py)를 먼저 찾고, 없으면 원본
export const MODEL_DIRS = ["assets/gulls/", "../village/models/", "models/"];
export const WALK_SCALE = 2.2, RUN_SCALE = 1.5;        // web/village와 같은 애니메이션 속도 배율(발이 미끄러지지 않게 잰 값)
const loader = new GLTFLoader();

/** .glb를 받아 파싱. 없으면 같은 이름 + ".json"(base64를 담은 {glb}) 도 시도. */
// 불러오기 진행(첫 화면 진행 막대용): 시작한 모델 수·끝난 수·실패한 수
export const loadProgress = { total: 0, done: 0, failed: 0, onChange: null };
// count = false: 진행 막대에 안 셈(갈매미는 GullPool이 따로 셈 · 다시 받기가 막대 수를 늘리지 않게)
export async function loadGLB(url, count = true) {
  if (!count) return fetchGLB(url);
  loadProgress.total++; loadProgress.onChange?.();
  try { return await fetchGLB(url); } catch (e) { loadProgress.failed++; throw e; }
  finally { loadProgress.done++; loadProgress.onChange?.(); }
}
/** 못 받으면 오류에 kind: "network"(두 주소 모두 연결 실패) · "missing"(서버가 없다고 함) — 불러오는 중 화면의 까닭 한 줄 */
async function fetchGLB(url) {
  let net = 0, res = await fetch(url).catch(() => { net++; return null; });
  if (res && res.ok) return loader.parseAsync(await res.arrayBuffer(), url.slice(0, url.lastIndexOf("/") + 1));
  res = await fetch(url + ".json").catch(() => { net++; return null; });
  if (!res || !res.ok) throw Object.assign(new Error("모델을 찾지 못함: " + url), { kind: net === 2 ? "network" : "missing" });
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
/** findCharacterSet과 같지만 못 찾으면 오류(kind 붙음)를 던짐 — GullPool이 다시 받음 */
export async function loadCharacterSet() {
  let net = 0;
  for (const dir of MODEL_DIRS) {
    const r = await fetch(dir + "chars.json").catch(() => { net++; return null; });
    if (r?.ok) { try { return { dir, chars: await r.json() }; } catch { /* 다음 폴더 */ } }
  }
  throw Object.assign(new Error("갈매미 목록(chars.json)을 찾지 못함"), { kind: net === MODEL_DIRS.length ? "network" : "missing" });
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
  hoe:     { up: [0, 0, 1], side: [0, -1, 0] },                                   // 괭이: 도끼처럼 쥠(날은 자루 끝에 앞으로)
  can:     { up: [0, 0, 1], side: [1, 0, 0] },                                    // 물뿌리개: 손잡이를 쥐고 몸통은 아래, 주둥이는 옆(+X)
};
function gripQuaternion(g) {
  const y = new THREE.Vector3(...g.up).normalize();
  const x = new THREE.Vector3(...g.side); x.addScaledVector(y, -x.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

const KEYS = ["Idle", "Walk", "Run", "Jump", "Attack", "Chop", "Mine", "Build", "FishCast", "FishWait", "FishReel"];
const ONCE = new Set(["Jump", "Attack", "FishCast", "FishReel"]);
export const POSE_PERIOD = { Sit: 3.0, Hoe: 1.1, Pave: 0.9 }, POSE_HIT = { Sit: 3.0, Hoe: 0.62, Pave: 0.45 };   // 새로 만든 동작(초)

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
/** 괭이(직접 만듦): 나무 자루 + 끝의 납작한 쇠날 */
function hoeModel() {
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.9 }), iron = new THREE.MeshStandardMaterial({ color: 0x8d949b, roughness: 0.6 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.42, 6), wood); stick.position.y = 0.17; g.add(stick);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.07), iron); blade.position.set(0.035, 0.37, 0); blade.rotation.z = -0.25; g.add(blade);
  return g;
}
/** 물뿌리개(직접 만듦, 색 하나, 모양 하나 = 그리기 호출 하나): 원기둥 몸통 + 비스듬한 주둥이·꽃잎 머리 + 위 손잡이. 쥐는 곳(손잡이)이 원점, 몸통은 그 아래(−Y) */
const CAN_MAT = new THREE.MeshStandardMaterial({ color: 0x4f9bd9, roughness: 0.55 });
function canModel() {
  const body = new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10).translate(0, -0.07, 0);
  const spout = new THREE.CylinderGeometry(0.008, 0.014, 0.12, 6).rotateZ(-1.0).translate(0.075, -0.06, 0);
  const rose = new THREE.CylinderGeometry(0.018, 0.01, 0.02, 8).rotateZ(-1.0).translate(0.125, -0.025, 0);
  const handle = new THREE.TorusGeometry(0.035, 0.007, 5, 10, Math.PI).translate(0, -0.02, 0);
  const g = new THREE.Group(), m = new THREE.Mesh(mergeGeos([body, spout, rose, handle]), CAN_MAT); m.castShadow = true; g.add(m);
  const tip = new THREE.Object3D(); tip.name = "tip"; tip.position.set(0.135, -0.02, 0); g.add(tip);   // 물이 나오는 곳(life.js 물방울)
  return g;
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
    .then(([axe, pickaxe, hammer]) => ({ axe, pickaxe, hammer, rod, hoe: hoeModel(), can: canModel() }));
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

// ---- 새로 만든 동작 3개(앉기·괭이질·길 깔기): 서 있기 첫 자세에서 뼈를 몸 기준으로 돌려 만듦. 갈매미 뼈대와 사람형(자이언트) 뼈대 둘 다.
//  · Sit: 엉덩이를 낮추고 다리를 앞으로 뻗어 앉음(숨 쉬듯 몸이 살짝)  · Hoe: 두 팔을 머리 위로 들었다가 몸을 숙이며 내리찍음
//  · Pave: 쪼그려 앉아 앞에 돌을 놓고 톡톡 두드림
const ease = t => t * t * (3 - 2 * t);
const seg = (f, a, b) => ease(Math.min(1, Math.max(0, (f - a) / (b - a))));
function makePoseClips(root, idle) {
  if (!idle) return {};
  const bones = {}; root.traverse(o => { if (o.isBone) bones[o.name.replace(/[._]/g, "").toLowerCase()] = o; });
  const pick = (...ns) => ns.map(n => bones[n]).find(Boolean);
  const hips = pick("hips", "pelvis"), spine = pick("spine", "chest", "spine001"), head = pick("head");
  const arm = { L: pick("wingupperl", "upperarml"), R: pick("wingupperr", "upperarmr") }, leg = { L: pick("legl", "thighl"), R: pick("legr", "thighr") };
  if (!hips || !arm.L || !arm.R || !leg.L || !leg.R) return {};
  const saved = new Map(); root.traverse(o => { if (o.isBone) saved.set(o, [o.quaternion.clone(), o.position.clone()]); });
  for (const t of idle.tracks) { const dot = t.name.lastIndexOf("."), o = root.getObjectByName(t.name.slice(0, dot)), prop = t.name.slice(dot + 1); if (o && (prop === "quaternion" || prop === "position")) o[prop].fromArray(t.values, 0); }
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert(), rootQInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const charQ = o => rootQInv.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
  const charP = o => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInv);
  const childBone = o => o.children.find(c => c.isBone);
  const toLocal = (o, delta) => { const qp = charQ(o.parent); return qp.clone().invert().multiply(delta).multiply(qp).multiply(o.quaternion); };
  const X = new THREE.Vector3(1, 0, 0);
  const knee = { L: childBone(leg.L), R: childBone(leg.R) };
  const foot = s => { let o = leg[s], last = o; while (o) { last = o; o = childBone(o); } return last; };
  const legLen = Math.max(0.02, charP(leg.L).y - charP(foot("L")).y);
  const hipLocal = d => { const w = charP(hips).add(new THREE.Vector3(0, -d, 0)).applyMatrix4(root.matrixWorld); return hips.parent.worldToLocal(w); };
  const out = {}, B = { hips, spine, head, armL: arm.L, armR: arm.R, legL: leg.L, legR: leg.R, kneeL: knee.L, kneeR: knee.R };
  const build = (name, fn) => {
    const P = POSE_PERIOD[name], N = 30, times = [...Array(N + 1).keys()].map(i => i / N * P), tracks = [], changed = new Set(), rot = {}, pos = [];
    const scl = {};
    for (let i = 0; i <= N; i++) { const r = fn(i / N); for (const [k, q] of Object.entries(r.rot)) (rot[k] ||= []).push(q); pos.push(r.hip || 0); for (const [k, s] of Object.entries(r.scale || {})) (scl[k] ||= []).push(s); }
    for (const [k, qs] of Object.entries(rot)) { const o = B[k]; if (!o || changed.has(o.name)) continue;
      const v = []; qs.forEach((q, i) => toLocal(o, q).toArray(v, i * 4)); tracks.push(new THREE.QuaternionKeyframeTrack(o.name + ".quaternion", times, v)); changed.add(o.name); }
    { const v = []; pos.forEach((d, i) => hipLocal(d).toArray(v, i * 3)); tracks.push(new THREE.VectorKeyframeTrack(hips.name + ".position", times, v)); }
    for (const [k, ss] of Object.entries(scl)) { const o = B[k]; if (!o) continue; const v = []; ss.forEach((s, i) => v.push(o.scale.x * s, o.scale.y * s, o.scale.z * s)); tracks.push(new THREE.VectorKeyframeTrack(o.name + ".scale", times, v)); changed.add(o.name + "#s"); }
    for (const t of idle.tracks) { const bn = t.name.slice(0, t.name.lastIndexOf(".")), prop = t.name.slice(t.name.lastIndexOf(".") + 1);
      if ((prop === "quaternion" && changed.has(bn)) || (prop === "position" && bn === hips.name) || (prop === "scale" && changed.has(bn + "#s"))) continue;
      const n = t.getValueSize(); tracks.push(new t.constructor(t.name, [0], Array.from(t.values.slice(0, n)))); }
    out[name] = new THREE.AnimationClip(name, P, tracks);
  };
  const ax = (v, a) => new THREE.Quaternion().setFromAxisAngle(v, a);
  const armRest = s => { const c = childBone(arm[s]); return c ? charP(c).sub(charP(arm[s])).normalize() : new THREE.Vector3(s === "L" ? 1 : -1, 0, 0); };
  const point = (s, dir) => new THREE.Quaternion().setFromUnitVectors(armRest(s), dir.clone().normalize());
  const side = s => Math.sign(charP(arm[s]).x) || (s === "L" ? 1 : -1);
  // 앉기: 짧은 다리를 1.6배로 늘려(앉은 동안만) 허벅지는 좌판 위로 수평, 정강이는 좌판 앞으로 내려 대롱대롱 — 의자에 걸터앉은 모양
  build("Sit", f => { const br = Math.sin(f * Math.PI * 2) * 0.03, sw = Math.sin(f * Math.PI * 4) * 0.22;
    return { hip: legLen * 0.62, scale: { legL: 1.6, legR: 1.6 }, rot: { legL: ax(X, -1.5), legR: ax(X, -1.5), kneeL: ax(X, 1.45 + sw), kneeR: ax(X, 1.45 - sw), spine: ax(X, -0.08 + br), head: ax(X, 0.05 - br),
      armL: point("L", new THREE.Vector3(side("L") * 0.55, -0.8, 0.15)), armR: point("R", new THREE.Vector3(side("R") * 0.55, -0.8, 0.15)) } }; });
  build("Hoe", f => { const up = seg(f, 0, 0.45) * (1 - seg(f, 0.45, 0.62)), down = seg(f, 0.45, 0.62) * (1 - seg(f, 0.8, 1));
    const dir = s => new THREE.Vector3(side(s) * (0.25 - 0.1 * down), 0.2 + 0.75 * up - 0.95 * down, 0.35 + 0.1 * up + 0.55 * down);
    return { hip: legLen * 0.12 * down, rot: { armL: point("L", dir("L")), armR: point("R", dir("R")), spine: ax(X, -0.18 * up + 0.5 * down), head: ax(X, 0.2 * down), legL: ax(X, -0.15 * down), legR: ax(X, -0.15 * down), kneeL: ax(X, 0.3 * down), kneeR: ax(X, 0.3 * down) } }; });
  build("Pave", f => { const tap = Math.sin(f * Math.PI * 2) * 0.5 + 0.5;
    return { hip: legLen * 0.45, rot: { legL: ax(X, -0.75), legR: ax(X, -0.75), kneeL: ax(X, 1.25), kneeR: ax(X, 1.25), spine: ax(X, 0.65), head: ax(X, 0.25),
      armR: point("R", new THREE.Vector3(side("R") * 0.25, -0.2 - 0.6 * (1 - tap), 0.95)), armL: point("L", new THREE.Vector3(side("L") * 0.45, -0.7, 0.5)) } }; });
  for (const [o, [q, p]] of saved) { o.quaternion.copy(q); o.position.copy(p); }
  root.updateMatrixWorld(true);
  return out;
}

// ---- 옷(목도리·외투): 입은 옷(u.wear)을 보이게 하는 장신구. 모양·재질은 모두가 같이 씀(그리기 호출 = 입은 장신구 수, 갈매미당 많아야 2).
//  자리·크기는 갈매미마다 서 있기 자세의 피부 꼭짓점에서 잼: 목도리는 머리 뼈 높이(목), 외투는 골반~목. 둘 다 몸통 뼈(spine/chest)에 붙여 몸을 따라 움직임.
//  반지름은 앞뒤(z) 두께로 잼 — 갈매미 날개가 옆(x)으로 펼쳐져 있어 옆 폭으로 재면 날개까지 감쌈(외투 옆 폭만 그 높이 꼭짓점 옆 거리의 가운데 값으로 따로).
export const WEAR_MAT = {
  scarf: new THREE.MeshStandardMaterial({ color: 0xd9433a, roughness: 0.9 }),
  coat: new THREE.MeshStandardMaterial({ color: 0x2f3f73, roughness: 0.85 }),
};
for (const m of Object.values(WEAR_MAT)) m.userData.noSnow = true;
const WEAR_GEO = {
  scarf: (() => { const ring = new THREE.TorusGeometry(1, 0.2, 6, 16).rotateX(Math.PI / 2), tail = new THREE.BoxGeometry(0.34, 0.9, 0.12).translate(0.35, -0.5, 1.02);   // 둥근 고리 + 앞으로 늘어진 끝자락
    return mergeGeos([ring, tail]); })(),
  coat: (() => { const body = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.42), top = Math.cos(Math.PI * 0.3), rt = Math.sin(Math.PI * 0.3);   // 둥근 몸을 감싸는 공의 가운데 띠(가슴~배) + 위 깃
    return mergeGeos([body, new THREE.TorusGeometry(rt, 0.07, 5, 16).rotateX(Math.PI / 2).translate(0, top, 0)]); })(),
};
/** 여러 모양을 한 모양으로(그리기 호출 하나) — BufferGeometryUtils 없이: 위치·법선·색인만 */
function mergeGeos(list) {
  const g = new THREE.BufferGeometry(), total = list.reduce((a, x) => a + x.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), idx = []; let o = 0;
  for (const x of list) {
    const n = x.attributes.position.count; pos.set(x.attributes.position.array, o * 3); nor.set(x.attributes.normal.array, o * 3);
    if (x.index) for (const i of x.index.array) idx.push(i + o); else for (let i = 0; i < n; i++) idx.push(i + o);
    o += n;
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); g.setIndex(idx); g.computeBoundingSphere();
  return g;
}
function fitWear(root) {
  const bones = {}; root.traverse(o => { if (o.isBone) bones[o.name.replace(/[._]/g, "").toLowerCase()] = o; });
  const head = bones.head, torso = bones.chest || bones.spine, hips = bones.hips || bones.pelvis; let mesh = null;
  root.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  if (!head || !torso || !hips || !mesh) return {};
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), at = o => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const pos = mesh.geometry.attributes.position, p = new THREE.Vector3(), pts = [];
  for (let i = 0; i < pos.count; i += 2) { mesh.getVertexPosition(i, p); pts.push(p.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(inv)); }
  let y0 = Infinity, y1 = -Infinity; for (const q of pts) { y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const H = y1 - y0, cx = at(hips).x;
  /** y 높이 띠에서 몸 가운데(z)와 앞뒤 반지름(가운데 x 띠 안 꼭짓점의 95번째 값) */
  const ring = y => {
    const band = pts.filter(q => Math.abs(q.y - y) < H * 0.05 && Math.abs(q.x - cx) < H * 0.12); if (band.length < 4) return null;
    const zs = band.map(q => q.z).sort((a, b) => a - b), lo = zs[Math.floor(zs.length * 0.03)], hi = zs[Math.ceil(zs.length * 0.97) - 1];
    return { z: (lo + hi) / 2, r: (hi - lo) / 2 };
  };
  const neckY = at(head).y, hipY = at(hips).y, neck = ring(neckY), mid = ring((neckY + hipY) / 2), low = ring(hipY + (neckY - hipY) * 0.15);
  if (!neck || !mid || !low) return {};
  const tM = inv.clone().multiply(torso.matrixWorld).invert(), out = {};          // 몸 좌표 → 몸통 뼈 좌표
  const put = (kind, x, y, z, rx, ry, rz) => {
    const m = new THREE.Mesh(WEAR_GEO[kind], WEAR_MAT[kind]); m.castShadow = true; m.visible = false; m.name = "wear_" + kind;
    new THREE.Matrix4().multiplyMatrices(tM, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(rx, ry, rz))).decompose(m.position, m.quaternion, m.scale);
    torso.add(m); out[kind] = m;
  };
  const rs = neck.r * 1.12;                                                         // 목도리: 목 둘레보다 조금 크게, 고리 두께는 반지름의 0.2
  put("scarf", cx, neckY - rs * 0.1, neck.z, rs, rs * 0.9, rs);
  const cy = (neckY + hipY) / 2, ry = (neckY - hipY) * 0.62, rc = Math.max(mid.r, low.r) * 1.07;   // 외투: 골반~목 가운데를 중심으로 몸 두께보다 7% 크게(띠 위끝이 목도리 밑에 닿음)
  const xs = pts.filter(q => Math.abs(q.y - cy) < H * 0.05).map(q => Math.abs(q.x - cx)).sort((a, b) => a - b), rx = Math.max(rc, (xs[Math.floor(xs.length * 0.5)] || 0) * 1.12);   // 옆 폭: 몸이 앞뒤보다 넓은 갈매미(자이언트·물방울)는 옆으로 넓게(가운데 값 — 팔·날개 끝은 뺌)
  put("coat", cx, cy, (mid.z + low.z) / 2, rx, ry, rc);
  return out;
}

/** 캐릭터 하나: 장면 오브젝트, 애니메이션 믹서, 동작들, 손에 붙인 도구, 동작 길이(clip: AI가 타격 시점 계산에 씀). */
export async function loadCharacter(dir, cfg, tools = null, simplifyRatio = 1) {
  const g = await loadGLB(dir + cfg.file.split("/").pop(), false), root = g.scene;
  if (simplifyRatio < 0.99) { const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); }); for (const m of meshes) await simplifyMesh(m, simplifyRatio); }
  // 화면 밖이면 그리지 않게, 움직여도 잘리지 않을 만큼 넉넉한 범위.
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = true;   // 갈매미도 실제 그림자를 드리움(화질 낮음이면 views.js가 끄고 발밑 원판)
    if (o.geometry) { o.geometry.computeBoundingSphere(); if (o.geometry.boundingSphere) o.geometry.boundingSphere.radius *= 1.6; }
    if (o.isSkinnedMesh) { o.computeBoundingSphere?.(); if (o.boundingSphere) o.boundingSphere.radius *= 1.6; }
    for (const m of [].concat(o.material)) { m.metalness = 0; m.metalnessMap = null; m.userData.noSnow = true; } } });   // 갈매미 몸엔 눈을 안 얹음   // 환경맵 없이 검게 보이지 않게
  root.scale.setScalar(cfg.scale);
  if (cfg.tint) {                                                                   // 같은 모델을 다른 갈매미로 쓸 때(목수): 재질을 복제해 색을 입힘
    const tint = new THREE.Color(cfg.tint);
    root.traverse(o => { if (o.isMesh) o.material = [].concat(o.material).map(m => { const c = m.clone(); c.color.multiply(tint); return c; }).reduce((a, m, i, arr) => arr.length === 1 ? m : arr, null); });
  }
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
  for (const [k, c] of Object.entries(makePoseClips(root, acts.Idle?.getClip()))) { acts[k] = mixer.clipAction(c); clip[k] = { len: c.duration, hit: POSE_HIT[k] }; }   // 앉기·괭이질·길 깔기
  const wear = fitWear(root);                                                       // 목도리·외투(숨긴 채로 붙여 둠, views.js가 u.wear대로 보임)
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
  return { root, mixer, acts, cfg, anim: "", clip, inHand, wear, onceRef: null, humanSwim: !!human };
}

export function playAnim(ch, key, speed = 1, fade = 0.2, restart = false) {
  const a = ch.acts[key]; if (!a) return false; a.timeScale = speed;
  if (ch.anim === key && !restart) return true;
  const prev = ch.acts[ch.anim]; a.reset().play(); if (prev && prev !== a) a.crossFadeFrom(prev, fade, false); ch.anim = key;
  return true;
}
