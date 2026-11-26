// 섬 꾸미기(순수 규칙·숫자): 나무·야자수·바위·광석 바위 심기/치우기, 덤불·꽃 놓기/치우기, 지형지물(동굴·등대·부두·방파제) 옮기기, 연못·물길 파기/메우기.
//  · 상태를 바꾸는 일은 World 메서드(placeNature·removeNature·placeDecor·clearDecor·moveLandmark·digCell·fillCell…)가 하고, 여기는 숫자와 계산만.
//  · 값은 금고(bank.vault)에서 바로 냄. 물가 배수는 곱하지 않음(CUSTOM_SCALE). 경제가 없는 섬(은행 없음)은 0.
//  · 난수를 쓰지 않음: 모양(variant)·방향(rot)은 칸 좌표 해시 → 같은 섬 + 같은 조작이면 결과가 같고, 마을 난수 순서를 바꾸지 않음.
import { GroundType } from "../data/types.js";

/** 꾸미기 값(🪙). place = 놓기·심기, remove = 치우기·뽑기, move = 지형지물 옮기기, dig·fill = 칸당 */
export const CUSTOM_COST = {
  place: { tree: 2, palm: 2, beachRock: 1, ore: 4, bush: 1, flower: 1 },
  remove: { tree: 1, palm: 1, beachRock: 1, ore: 1, bush: 1, flower: 1 },
  move: { cave: 15, lighthouse: 15, pier: 10, breakwater: 10 },
  dig: 0, fill: 0,                    // 파기·메우기 = 높이 바꾸기라 무료(사용자 요청 "높이바꾸기에 금고돈 쓰면 안될듯"). 높이 도구 되돌리기(restoreCell)도 이 값을 써서 무료
};
/** true면 물가 배수(priceMult)를 곱함(bank.js scaled). 지금은 끔: 값이 1~4라 반올림이 들쭉날쭉하고, 꾸미기는 마을 성장과 상관없는 취향 놀이 */
export const CUSTOM_SCALE = false;
export const TREE_GROW = 300;        // 새로 심은 나무·야자수: 묘목으로 300초(마을 반나절) 동안 못 벰(자연 다시 자람 25~40초의 약 8~12배)
export const ORE_FILL = 600;         // 새로 놓은 광석 바위: 빈 바위로 600초(마을 하루) 동안 못 캠(자연 다시 차기 20~32초의 약 20~30배)
export const POND_DEPTH = -0.6;      // 파기 한 번에 바뀌는 높이(섬이 만든 연못과 같은 깊이)
export const FILL_HEIGHT = 0;        // 메우기 한 번에 바뀌는 높이(모래)
export const FILL_MIN = -0.7;        // 이보다 깊은 물(섬이 만든 먼 바다 −1 m)은 메우지 못함(플레이어가 판 칸은 됨) → 섬을 끝없이 넓히지 못함
export const LIGHTHOUSE_SEA = 3;     // 등대는 물에서 3칸 안(바닷가)
export const LIMITS = { trees: 260, ores: 40, rocks: 60, decor: 800 };   // 나무+야자수(그루마다 GLB 복제, 인스턴싱 아님 → 지금 140그루의 약 1.9배) · 광석 · 해변 바위 · 놓은 덤불·꽃(인스턴싱)
export const UNDO_KEEP = 60;         // 되돌리기 표를 최근 몇 개까지 기억하나(tools.js history 60과 같게)

export const NATURE = ["tree", "palm", "beachRock", "ore"];
export const DECOR = ["bush", "flower"];
export const LANDMARKS = ["cave", "lighthouse", "pier", "breakwater"];
export const NAMES = { tree: "나무", palm: "야자수", beachRock: "바위", ore: "광석 바위", bush: "덤불", flower: "꽃", cave: "동굴", lighthouse: "등대", pier: "부두", breakwater: "방파제" };

const G = GroundType;
/** 놓을 수 있는 바닥. 돌길·나무 데크(포장도로)는 모두 안 됨(길을 지킴) */
export const GROUND_OK = {
  tree: [G.Grass, G.Dirt], palm: [G.Sand, G.Grass], beachRock: [G.Sand, G.Grass, G.Rock, G.Dirt], ore: [G.Grass, G.Dirt, G.Rock, G.Sand],
  bush: [G.Grass, G.Dirt], flower: [G.Grass],
};
const GROUND_WORD = { tree: "나무는 잔디·흙에 심어요", palm: "야자수는 모래·잔디에 심어요", beachRock: "바위는 모래·잔디·바위·흙에 놓아요",
  ore: "광석 바위는 잔디·흙·바위·모래에 놓아요", bush: "덤불은 잔디·흙에 놓아요", flower: "꽃은 잔디에 놓아요" };
export const pavedGround = type => type === G.Cobble || type === G.WoodDeck;
/** 이 바닥에 놓을 수 없으면 까닭(한국어), 되면 "" */
export function groundReason(kind, type) {
  if (GROUND_OK[kind]?.includes(type)) return "";
  if (pavedGround(type)) return kind === "tree" || kind === "palm" ? "길(돌길·데크)에는 심지 않아요" : "길(돌길·데크)에는 놓지 않아요";
  return GROUND_WORD[kind] || "여기에는 놓을 수 없어요";
}
/** "auto" 나무: 모래면 야자수, 아니면 나무 */
export const autoKind = type => type === G.Sand ? "palm" : "tree";

/** 값(경제가 없으면 0). op = place | remove | move | dig | fill */
export function customCostOf(op, kind, economy = true, mult = 1) {
  if (!economy) return 0;
  const t = CUSTOM_COST[op], base = typeof t === "number" ? t : t?.[kind] ?? 0;
  return CUSTOM_SCALE && base > 0 ? Math.max(1, Math.round(base * mult)) : base;
}
/** 금고가 모자랄 때 실패 글(bank.js feeReason과 같은 꼴) */
export const customReason = (cost, vault) => `🏦 금고에 조개가 모자라요 (꾸미기 🪙${cost} · 금고 🪙${Math.floor(vault)})`;

/** 칸 좌표 해시(views.js 나무 크기 해시와 같은 식). 난수 대신 씀 */
export const cellHash = (x, z) => ((x * 73856093) ^ (z * 19349663)) >>> 0;
export const variantAt = (x, z, n = 3) => cellHash(x, z) % n;
export const rotAt = (x, z) => (cellHash(x, z) >>> 3) % 4;

// ---- 지형지물 모양 돌리기. rot은 건물과 같은 방향(three.js rotation.y = rot × 90°): rot 0 = 입구·바다 쪽이 +z, 1 = +x, 2 = −z, 3 = −x
/** rot 방향의 앞(입구·바다 쪽) 한 칸 */
export const frontDir = rot => [[0, 1], [1, 0], [0, -1], [-1, 0]][((rot % 4) + 4) % 4];
/** (x, z)를 한 번(+90°) 돌림: (x, z) → (z, −x) */
const turn1 = ([x, z]) => [z, -x];
/** 칸 목록을 k번 돌리고 왼쪽 위(최소 x·z)를 (0, 0)으로. 순서는 그대로(칸 i → 칸 i) */
export function turnShape(cells, k) {
  let out = cells.map(c => [c[0], c[1]]);
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) out = out.map(turn1);
  const mx = Math.min(...out.map(c => c[0])), mz = Math.min(...out.map(c => c[1]));
  return out.map(([x, z]) => [x - mx, z - mz]);
}
/** 모듈의 지금 칸·방향에서 rot 0 모양(왼쪽 위 (0, 0)) */
export const baseShape = m => turnShape(m.cells, 4 - ((m.rot || 0) % 4));
/** 옮긴 뒤 차지 칸: 기준 칸 (ax, az) = 돌린 모양의 왼쪽 위. 칸 순서는 원래 칸 순서와 같음(부두 낚시 자리를 같이 옮길 때 씀) */
export function landmarkCellsOf(m, ax, az, rot) { return turnShape(baseShape(m), rot).map(([x, z]) => [ax + x, az + z]); }
/** 앞(rot 방향) 쪽으로 모양 바깥에 붙은 칸들 = 동굴 입구 앞 / 부두 끝 바깥 */
export function frontCells(cells, rot) {
  const [dx, dz] = frontDir(rot), has = new Set(cells.map(([x, z]) => `${x},${z}`));
  return cells.map(([x, z]) => [x + dx, z + dz]).filter(([x, z]) => !has.has(`${x},${z}`));
}
/** 뒤(rot 반대) 쪽으로 모양 바깥에 붙은 칸들 = 부두가 땅에 닿는 곳 */
export function backCells(cells, rot) { return frontCells(cells, (rot + 2) % 4); }
/** 동굴 이름표 자리: 입구 앞 칸들과 동굴 사이 경계의 가운데(섬 생성의 zones cave 자리와 같음) */
export function caveLabelAt(cells, rot) {
  const f = frontCells(cells, rot), [dx, dz] = frontDir(rot); if (!f.length) return null;
  const x = f.reduce((s, c) => s + c[0] + 0.5 - dx / 2, 0) / f.length, z = f.reduce((s, c) => s + c[1] + 0.5 - dz / 2, 0) / f.length;
  return { x, z };
}

// ---- 덤불·꽃 겹: world.decor = { add: Map("x,z" → { k, v }), off: Set("x,z") }
export const decorKey = (x, z) => `${x},${z}`;
export const newDecor = () => ({ add: new Map(), off: new Set() });
/** 저장용: { add: [[x, z, k, v]], off: [[x, z]] } */
export function decorToSave(d) {
  return { add: [...d.add].map(([key, o]) => { const [x, z] = key.split(",").map(Number); return [x, z, o.k, o.v]; }),
    off: [...d.off].map(key => key.split(",").map(Number)) };
}
/** 저장에서 읽기: 정수 칸·아는 종류만, 한도 안만(예전 저장엔 없음 → 빈 겹). okCell(x, z, k)로 지금 바닥에 맞지 않는 것은 버림 */
export function decorFromSave(j, okCell = () => true) {
  const d = newDecor(); if (!j || typeof j !== "object") return d;
  for (const e of Array.isArray(j.add) ? j.add : []) {
    if (!Array.isArray(e) || d.add.size >= LIMITS.decor) continue;
    const [x, z, k, v] = e; if (!Number.isInteger(x) || !Number.isInteger(z) || !DECOR.includes(k) || !okCell(x, z, k)) continue;
    d.add.set(decorKey(x, z), { k, v: Math.max(0, Math.min(3, v | 0)) });
  }
  for (const e of Array.isArray(j.off) ? j.off : []) {
    if (!Array.isArray(e) || d.off.size >= 20000) continue;
    const [x, z] = e; if (Number.isInteger(x) && Number.isInteger(z)) d.off.add(decorKey(x, z));
  }
  return d;
}
/** 저장용 판 칸 목록(플레이어가 판 물 칸: 깊어도 메울 수 있음) */
export const dugFromSave = j => new Set((Array.isArray(j) ? j : []).filter(e => Array.isArray(e) && Number.isInteger(e[0]) && Number.isInteger(e[1])).map(([x, z]) => decorKey(x, z)));
