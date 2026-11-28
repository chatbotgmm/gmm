// 갈매미 모델 한 마리 몫(순수: three.js를 직접 모름 — 복제 함수와 믹서를 넘겨받음 → node 시험 가능).
// 같은 모습(예: 기본)이 여럿이어도 서로 모델을 빼앗지 않게, 메모리 캐시(GullPool)의 원본을 마리마다 복제함.
//  · 뼈대·메시는 SkeletonUtils.clone(지오메트리·텍스처는 같이 씀 → 섬을 다시 만들 때 dispose하지 않고 떼기만).
//  · SkinnedMesh 재질은 마리마다 복제(아픈 갈매미의 붉은 기운 sickTint가 같은 모습 모두에게 번지지 않게). 툰으로 바뀐 재질이면 원래 재질에서 복제(toonSrc.origin) → 그림체는 다음 sweep이 다시 입힘.
//  · 손의 도구(inHand: prop.?R 손 뼈 아래)·옷(wear)은 복제본 안에서 같은 자리의 것으로 다시 찾음. 동작(acts)은 새 믹서로, 한 번만 하는 동작 설정도 그대로.
import { origin } from "./toonSrc.js";

const cloneMat = m => (m ? origin(m).clone() : m);
/** ch: 원본 캐릭터(characters.js loadCharacter) · cloneRoot: SkeletonUtils.clone · Mixer: THREE.AnimationMixer */
export function instanceChar(ch, { cloneRoot, Mixer }) {
  const root = cloneRoot(ch.root), map = new Map();
  (function walk(a, b) { map.set(a, b); (a.children || []).forEach((c, i) => { const d = b.children?.[i]; if (d) walk(c, d); }); })(ch.root, root);
  root.traverse(o => { if (o.isSkinnedMesh && o.material) o.material = Array.isArray(o.material) ? o.material.map(cloneMat) : cloneMat(o.material); });
  const mixer = new Mixer(root), acts = {};
  for (const [k, a] of Object.entries(ch.acts || {})) { const n = mixer.clipAction(a.getClip()); if (a.loop != null) n.setLoop?.(a.loop, a.repetitions); n.clampWhenFinished = !!a.clampWhenFinished; acts[k] = n; }
  const pick = obj => Object.fromEntries(Object.entries(obj || {}).map(([k, t]) => [k, map.get(t)]).filter(([, t]) => t));
  return { root, mixer, acts, cfg: ch.cfg, anim: "", clip: ch.clip, inHand: pick(ch.inHand), wear: ch.wear ? pick(ch.wear) : null, onceRef: null, humanSwim: !!ch.humanSwim, proto: ch };
}
