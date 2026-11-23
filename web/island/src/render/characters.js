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

/** 캐릭터 하나: 장면 오브젝트, 애니메이션 믹서, 동작(Idle·Walk·Run). */
export async function loadCharacter(dir, cfg) {
  const g = await loadGLB(dir + cfg.file.split("/").pop()), root = g.scene;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false;
    for (const m of [].concat(o.material)) { m.metalness = 0; m.metalnessMap = null; } } });   // 환경맵 없이 검게 보이지 않게
  root.scale.setScalar(cfg.scale);
  const mixer = new THREE.AnimationMixer(root), acts = {};
  for (const src of g.animations) {
    const key = ["Idle", "Walk", "Run"].find(k => src.name.endsWith("|" + k) || src.name === k);
    if (!key) continue;
    const clip = src.clone(), t0 = Math.min(...clip.tracks.map(t => t.times[0]));
    clip.tracks.forEach(t => t.shift(-t0)); clip.resetDuration();             // 블렌더 키가 1프레임부터 시작: 0으로 당김
    acts[key] = mixer.clipAction(clip);
  }
  return { root, mixer, acts, cfg, anim: "" };
}

export function playAnim(ch, key, speed = 1, fade = 0.2) {
  const a = ch.acts[key]; if (!a) return; a.timeScale = speed; if (ch.anim === key) return;
  const prev = ch.acts[ch.anim]; a.reset().play(); if (prev) a.crossFadeFrom(prev, fade, false); ch.anim = key;
}
