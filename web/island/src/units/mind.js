// 갈매미의 "마음": 욕구 · 경험으로 배우는 취향 · 친구 관계 · 호기심. 순수 함수만 둔다(시험하기 쉽게).
//
// 욕구(0~100, 낮을수록 급함): 기력(energy) · 친구가 그리움(social) · 재미(fun). 배고픔은 포만감(full, jobs.js).
// 학습: 활동을 마치면 결과(보상)로 그 활동의 기대 보상 v를 고친다(v ← v + α(보상 − v), 이동 평균 = 간단한 강화학습).
//       다음에 활동을 고를 때 v가 높은 활동을 더 자주 고른다 → 갈매미마다 겪은 일에 따라 취향이 달라진다.
// 친구: 인사하면 서로 호감이 오르고, 친구를 찾아갈 때 호감 높은 쪽을 더 자주 고른다.
export const NEED_KEYS = ["energy", "social", "fun"];
export const LEARN_RATE = 0.15;
const ACTIVITIES = ["rest", "wander", "forage", "visit", "zoomies", "chop", "mine", "fish", "build", "enter", "eat", "trade", "farm", "swim", "deposit", "market"];
const WORK = new Set(["chop", "mine", "fish", "build", "trade", "farm"]);

export function initMind(u, rnd) {
  u.needs = { energy: 70 + rnd() * 30, social: 50 + rnd() * 40, fun: 50 + rnd() * 40 };
  u.value = Object.fromEntries(ACTIVITIES.map(a => [a, 0.5]));     // 활동별 기대 보상(처음엔 모두 같음)
  u.tries = Object.fromEntries(ACTIVITIES.map(a => [a, 0]));
  u.friends = {};                                                   // 다른 갈매미 id → 호감(-5~10)
  u.activity = null;
}
// 쉬기는 피곤할 때만: 기력이 REST_BELOW 아래로 내려가야 쉬기를 고를 수 있고(낮을수록 자주), TIRED 아래면 바로 쉼. 한 번 쉬면 REST_UNTIL까지 차면 일어남.
// 쉬기로 고른 쉼은 그냥 서 있을 때(+0.6/초)보다 빨리 참: 서서 +REST_GAIN, 벤치 +BENCH_GAIN(초당, 더해지는 값).
export const REST_BELOW = 50, TIRED = 30, REST_UNTIL = 80, REST_GAIN = 1.4, BENCH_GAIN = 2.4;
/** 일 사이 숨 고르기(초): 일을 마치거나 끊긴 뒤 다음 일을 고르기 전의 짧은 멈춤. 예전 1~4초 → 0.3~1초 */
export const pauseSecs = rnd => 0.3 + rnd() * 0.7;
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));

/** 매 프레임 욕구 변화: 시간이 지나면 줄고, 하는 일에 따라 찬다. */
export function tickNeeds(u, dt, state, inside) {
  const n = u.needs; if (!n) return;
  // 기력(= 100 − 피로도): 일하면 피로가 쌓이고(기력 −0.55/초), 앉아 쉬거나 자면 풀림(벤치·침대는 unitBrain에서 더)
  const working = ["Chop", "Mine", "Build", "Farm", "Trade", "Fish", "Improve"].includes(state), resting = state === "Idle" || state === "Sleep" || state === "Sit";
  n.energy = clamp(n.energy + dt * (state === "Sleep" ? 6 : inside ? 3 : resting ? 0.6 : working ? -0.55 : -0.15));
  n.social = clamp(n.social + dt * (inside ? 0.8 : -0.12));
  n.fun = clamp(n.fun + dt * (state === "Zoomies" || state === "Swim" ? 4 : state === "Fish" ? 0.8 : -0.1));
}

/** 욕구가 급할수록 그 욕구를 채우는 활동의 비중을 키움(지친 갈매미는 일을 덜 함). */
export function needMult(u, kind) {
  const n = u.needs; if (!n) return 1;
  if (kind === "rest") return n.energy >= REST_BELOW ? 0 : 1 + (REST_BELOW - n.energy) / 5;   // 안 피곤하면 쉬기를 고르지 않음
  if (kind === "enter") return 0.4 + (100 - n.energy) / 50 + (100 - n.social) / 50;          // 집 구경(화면에서 사라짐)은 지치거나 친구가 그리울 때 주로
  if (kind === "visit") return 1 + (100 - n.social) / 22;
  if (kind === "zoomies" || kind === "wander" || kind === "swim") return 1 + (100 - n.fun) / 30;
  if (WORK.has(kind)) return clamp(n.energy / 60, 0.25, 1.3);
  return 1;
}
/** 배운 취향에 따른 배율(기대 보상이 높을수록 자주). */
export const prefMult = (u, kind) => clamp(0.5 + (u.value?.[kind] ?? 0.5), 0.3, 2.2);

/** 활동을 마쳤을 때: 보상으로 기대 보상을 고침. */
export function learn(u, kind, reward) {
  if (!u.value || !(kind in u.value)) return;
  u.value[kind] += LEARN_RATE * (reward - u.value[kind]); u.tries[kind]++;
}
/** 가장 좋아하게 된 활동(충분히 해 본 것 중). */
export function favorite(u) {
  let best = null, bv = -Infinity;
  for (const [k, v] of Object.entries(u.value || {})) if (u.tries[k] >= 2 && v > bv) { bv = v; best = k; }
  return best;
}

// 사이 단계: 호감이 min 이상이면 그 단계(기준은 여기 한 곳에만 둠). 선 색·굵기는 📱 관계도에서 씀.
export const FRIEND_STAGES = [
  { name: "서먹", icon: "🙂", min: -Infinity, color: "#b9a88a", width: 1.5 },
  { name: "친구", icon: "🧡", min: 3, color: "#f0a04b", width: 3 },
  { name: "단짝", icon: "💞", min: 7, color: "#e0573e", width: 5 },
];
/** 호감 값 → 사이 단계 번호(0 서먹 · 1 친구 · 2 단짝) */
export const friendStage = v => { let s = 0; FRIEND_STAGES.forEach((d, i) => { if ((v || 0) >= d.min) s = i; }); return s; };
/** 서로 친해짐(또는 멀어짐). 둘 사이 단계가 올랐으면 새 단계 번호를, 아니면 0을 돌려줌. */
export function befriend(a, b, amt) {
  const before = friendStage(affinity(a, b));
  a.friends[b.unitId] = clamp((a.friends[b.unitId] || 0) + amt, -5, 10);
  b.friends[a.unitId] = clamp((b.friends[a.unitId] || 0) + amt, -5, 10);
  const after = friendStage(affinity(a, b));
  return after > before ? after : 0;
}
export const affinity = (a, b) => a.friends?.[b.unitId] || 0;
/** 이 갈매미의 단짝(여럿이면 호감이 가장 높은 쪽), 없으면 null */
export function bestieOf(u, units) {
  const f = bestFriend(u, units);
  return f && friendStage(affinity(u, f)) >= 2 ? f : null;
}
/** 마을의 단짝 쌍 수 */
export function bestiePairs(units) {
  let n = 0;
  for (let i = 0; i < units.length; i++) for (let k = i + 1; k < units.length; k++) if (friendStage(affinity(units[i], units[k])) >= 2) n++;
  return n;
}
/** 관계도: 갈매미를 원 위에 고르게 놓고(한 마리면 가운데), 호감이 0보다 큰 쌍을 선으로 이음. size = 그림 한 변, pad = 가장자리 여백 */
export function relationGraph(units, size = 300, pad = 52) {
  const c = size / 2, r = units.length > 1 ? c - pad : 0;
  const nodes = units.map((u, i) => { const a = -Math.PI / 2 + i / Math.max(1, units.length) * Math.PI * 2; return { u, name: u.name, x: c + Math.cos(a) * r, y: c + Math.sin(a) * r }; });
  const links = [];
  for (let i = 0; i < units.length; i++) for (let k = i + 1; k < units.length; k++) {
    const v = affinity(units[i], units[k]); if (v > 0) links.push({ a: i, b: k, v, stage: friendStage(v) });
  }
  return { nodes, links };
}
/** 저장용: 호감을 이름으로(불러올 때 id가 달라져도 되게) · 불러오기: 이름 → 지금 id(마을에 없는 갈매미는 버림) */
export const friendsToNames = (u, units) => Object.fromEntries(units.filter(o => o !== u && u.friends?.[o.unitId]).map(o => [o.name, u.friends[o.unitId]]));
export function friendsFromNames(u, saved, units) {
  for (const [name, v] of Object.entries(saved || {})) { const o = units.find(x => x.name === name); if (o && o !== u && Number.isFinite(v)) u.friends[o.unitId] = clamp(v, -5, 10); }
}
export function bestFriend(u, units) {
  let best = null, bv = 0.5;
  for (const o of units) if (o !== u && affinity(u, o) > bv) { bv = affinity(u, o); best = o; }
  return best;
}

export const ACTIVITY_NAME = { rest: "쉬기", wander: "산책", forage: "씨앗 찾기", visit: "친구 만나기", zoomies: "뛰어놀기", chop: "벌목", mine: "채광",
  fish: "낚시", build: "집 짓기", enter: "집 구경", eat: "먹기", trade: "장사", farm: "밭일", swim: "헤엄", deposit: "은행에 팔기", market: "시장 보기", peddle: "소지품 팔기" };   // peddle은 라벨만(배우는 활동 목록 ACTIVITIES에는 넣지 않음: initMind가 바뀌지 않게)
