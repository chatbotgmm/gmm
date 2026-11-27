// 생각하는 가구 배치(순수 계산, 결정적 — 난수 없음). furniture.js의 autoPlace·relayout이 씀.
//  · 앞면: rot 0 = +z(방 앞쪽), 1 = −x, 2 = −z, 3 = +x (render/furniture.js 모델의 앞 = +z, 방 화면 yaw = −rot·90°). 뒤 = 그 반대(침대는 머리판 = 베개 쪽)
//  · 벽 가구(침대·책장·옷장·오븐)는 뒤가 벽에 닿아야 함(소파는 되도록). 옷장·책장·오븐은 앞 칸이 모두 비어야 하고, 침대는 긴 옆 한 칸, 소파는 앞 한 칸,
//    의자·탁자는 옆 한 칸이 비어 문에서 걸어갈 수 있어야 함(BFS). 문·계단에서 들어오는 길은 하나로 이어져야 함.
//  · 묶음: 깔개는 방 가운데 → 탁자는 깔개 위 → 의자는 탁자 옆에서 탁자를 봄 → 소파는 깔개·탁자를 봄 → 스탠드는 소파·침대 옆 → 화분은 구석.
//    침대는 침실 층부터, 원룸이면 문에서 먼 구석. 오븐은 부엌 층부터.
//  · 자리가 없으면 놓지 않음(호출한 쪽이 창고로).
import { FURNITURE } from "../data/catalog.js";
import { size, fits, doorCell, landing } from "./furniture.js";

export const ARR_FRONT = [[0, 1], [-1, 0], [0, -1], [1, 0]];
export const arrKind = id => FURNITURE[id]?.shape || id;
const ARR_WALL = new Set(["bed", "bookshelf", "wardrobe", "oven"]);                // 뒤가 벽이어야 함
const ARR_STRICT = new Set(["bookshelf", "wardrobe", "oven"]);                     // 앞 칸이 모두 비어야 함(문·서랍을 엶)
// 다시 놓는 차례(앞일수록 좋은 자리를 먼저 가짐 · 좁은 방에서 끝내 못 놓는 건 뒤의 것)
const ARR_PRI = { rug: 0, bed: 1, table: 2, chair: 3, bookshelf: 4, sofa: 5, wardrobe: 6, oven: 7, floorLamp: 8, plant: 9 };
const arrRots = id => { const k = arrKind(id), f = FURNITURE[id].footprint; return k === "table" || k === "plant" || k === "floorLamp" || (k === "rug" && f.w === f.d) ? [0] : [0, 1, 2, 3]; };

const arrCells = o => { const s = size(o.id, o.rot), out = []; for (let dz = 0; dz < s.d; dz++) for (let dx = 0; dx < s.w; dx++) out.push([o.x + dx, o.z + dz]); return out; };
/** 가구 바로 옆(dir 쪽) 칸들 */
export function arrSide(o, dir) { const cs = arrCells(o), set = new Set(cs.map(c => c[0] + "," + c[1])), out = []; for (const [x, z] of cs) { const n = [x + dir[0], z + dir[1]]; if (!set.has(n[0] + "," + n[1])) out.push(n); } return out; }
export const arrFrontCells = o => arrSide(o, ARR_FRONT[o.rot]);
const arrBackCells = o => { const f = ARR_FRONT[o.rot]; return arrSide(o, [-f[0], -f[1]]); };
const arrLongSides = o => { const f = ARR_FRONT[o.rot]; return [...arrSide(o, [f[1], -f[0]]), ...arrSide(o, [-f[1], f[0]])]; };
const arrIn = (L, x, z) => x >= 0 && z >= 0 && x < L.w && z < L.d;
const arrInStair = (L, x, z) => { const s = L.stairs; return !!s && x >= s.x && x < s.x + s.w && z >= s.z && z < s.z + s.d; };
export const isKitchen = L => L.role === "kitchen" || /부엌/.test(L.name || "");

/** 층 L을 읽음: 걸을 수 있는 칸·문(입구)에서 닿는 칸·가구마다 못 쓰는지(bad) */
export function arrScan(L) {
  const occ = new Set();
  for (const o of L.furniture) if (FURNITURE[o.id]?.layer !== "floor") for (const [x, z] of arrCells(o)) occ.add(x + "," + z);
  const walk = (x, z) => arrIn(L, x, z) && !arrInStair(L, x, z) && !occ.has(x + "," + z);
  const groups = (L.doors || []).map(d => [doorCell(L, d)]); const ld = landing(L.stairs); if (ld) groups.push([ld]);
  const s = L.stairs;
  if (s && s.dir !== "up") { const g = []; for (let x = s.x; x < s.x + s.w; x++) for (let z = s.z; z < s.z + s.d; z++) for (const [dx, dz] of ARR_FRONT) { const n = [x + dx, z + dz]; if (arrIn(L, ...n) && !arrInStair(L, ...n)) g.push(n); } groups.push(g); }   // 위층: 계단 구멍 둘레로 올라옴
  const comp = new Map(); let id = 0;
  for (const g of groups) for (const c of g) {
    if (!walk(...c) || comp.has(c[0] + "," + c[1])) continue; const q = [c]; comp.set(c[0] + "," + c[1], id);
    while (q.length) { const [x, z] = q.pop(); for (const [dx, dz] of ARR_FRONT) { const nx = x + dx, nz = z + dz, k = nx + "," + nz; if (walk(nx, nz) && !comp.has(k)) { comp.set(k, id); q.push([nx, nz]); } } }
    id++;
  }
  const gc = groups.map(g => g.filter(c => walk(...c)).map(c => comp.get(c[0] + "," + c[1])));
  const entriesOk = gc.every(l => l.length) && (gc.length < 2 || gc.every(l => l.includes(gc[0][0])));   // 문·계단끼리 한 길로 이어짐
  const main = gc[0]?.[0], reach = (x, z) => walk(x, z) && comp.has(x + "," + z) && (main === undefined || comp.get(x + "," + z) === main);
  const okAcc = cs => cs.some(c => reach(...c));
  const bad = new Set();
  for (const o of L.furniture) {
    const k = arrKind(o.id); if (FURNITURE[o.id]?.layer === "floor") continue;
    let ok = true;
    if (ARR_STRICT.has(k)) { const fc = arrFrontCells(o); ok = fc.every(c => walk(...c)) && okAcc(fc); }
    else if (k === "sofa") ok = okAcc(arrFrontCells(o));
    else if (k === "bed") ok = okAcc(arrLongSides(o));
    else if (k === "chair") ok = okAcc(ARR_FRONT.flatMap(d => arrSide(o, d)));
    else if (k === "table") { const tc = new Set(arrCells(o).map(c => c + "")); ok = okAcc(ARR_FRONT.flatMap(d => arrSide(o, d))) || L.furniture.some(c => arrKind(c.id) === "chair" && arrFrontCells(c).some(fc => tc.has(fc + ""))); }
    if (!ok) bad.add(o);
  }
  let pockets = 0; for (let z = 0; z < L.d; z++) for (let x = 0; x < L.w; x++) if (walk(x, z) && !reach(x, z)) pockets++;   // 빈 칸인데 못 가는 곳
  return { walk, reach, entriesOk, bad, pockets, entries: groups.flat() };
}
/** 뒤가 모두 방 벽에 닿나 */
export const backToWall = (L, o) => arrBackCells(o).every(c => !arrIn(L, ...c));
const arrWallsTouched = (L, o) => { const s = size(o.id, o.rot); return (o.x === 0) + (o.z === 0) + (o.x + s.w === L.w) + (o.z + s.d === L.d); };
const arrCenter = o => { const s = size(o.id, o.rot); return [o.x + s.w / 2, o.z + s.d / 2]; };
const arrMan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

/** 자리 점수(낮을수록 좋음) */
function arrScore(L, o, sc, entries) {
  const k = arrKind(o.id), cs = arrCells(o), c = arrCenter(o), walls = arrWallsTouched(L, o), back = backToWall(L, o);
  const rug = L.furniture.find(x => x !== o && FURNITURE[x.id]?.layer === "floor"), table = L.furniture.find(x => x !== o && arrKind(x.id) === "table");
  const hub = rug ? arrCenter(rug) : table ? arrCenter(table) : [L.w / 2, L.d / 2];       // 방의 가운데 자리(깔개 → 탁자 → 방 가운데)
  const doorD = entries.length ? Math.min(...cs.flatMap(a => entries.map(e => arrMan(a, e)))) : 9;
  let s = sc.pockets * 6 + (doorD <= 1 && k !== "rug" ? 4 : 0);                       // 못 가는 빈 칸 · 문 바로 옆은 비워 둠
  if (FURNITURE[o.id].height >= 1.4 && back && (L.doors || []).every(d => d.wall !== "N" && d.wall !== "E")) {   // 키 큰 가구가 창문(문 없는 뒤·오른쪽 벽 가운데)을 가림
    const f = ARR_FRONT[o.rot]; if ((f[1] === 1 && cs.some(([x]) => Math.abs(x + 0.5 - L.w / 2) < 0.75)) || (f[0] === -1 && cs.some(([, z]) => Math.abs(z + 0.5 - L.d / 2) < 0.75))) s += 3;
  }
  if (FURNITURE[o.id].height >= 1.4 && back) { const f = ARR_FRONT[o.rot]; s += f[1] === -1 ? 8 : f[0] === -1 ? 2 : 0; }   // 방 화면 카메라(앞·오른쪽 위)를 등진 키 큰 가구는 방을 가리고 뒷면만 보임 → 앞벽은 낮은 가구 차지
  switch (k) {
    case "rug": s += arrMan(c, [L.w / 2, L.d / 2]) * 2; break;
    case "bed": s += (walls >= 2 ? 0 : 20) - doorD * 2; break;                          // 구석, 문에서 멀리
    case "table": { const free = ARR_FRONT.flatMap(d => arrSide(o, d)).filter(x => sc.walk(...x)).length; s += arrMan(c, hub) * 3 - free + (rug && !cs.every(([x, z]) => x >= rug.x && z >= rug.z && x < rug.x + size(rug.id, rug.rot).w && z < rug.z + size(rug.id, rug.rot).d) ? 6 : 0); break; }
    case "chair": { const fc = arrFrontCells(o), faces = table && fc.some(x => arrCells(table).some(t => t + "" === x + "")); s += faces ? arrMan(c, hub) : 40 + (back ? 0 : 8) - doorD; break; }
    case "sofa": { const fc = arrFrontCells(o), fcC = [fc.reduce((a, x) => a + x[0] + 0.5, 0) / fc.length, fc.reduce((a, x) => a + x[1] + 0.5, 0) / fc.length]; s += (back ? 0 : 30) + arrMan(fcC, hub) * 3; break; }
    case "bookshelf": case "wardrobe": s += -arrMan(c, hub) * 0.5 + (walls >= 2 ? -2 : 0); break;
    case "oven": s += (walls >= 2 ? -2 : 0) + arrMan(c, hub) * -0.3; break;
    case "floorLamp": { const near = L.furniture.some(x => x !== o && (arrKind(x.id) === "sofa" || arrKind(x.id) === "bed") && arrCells(x).some(a => Math.max(Math.abs(a[0] - o.x), Math.abs(a[1] - o.z)) === 1)); s += (near ? -10 : 0) - walls * 3; break; }
    case "plant": s += -walls * 5 + arrMan(c, hub) * -0.2; break;
    default: s += -walls * 2;
  }
  if (ARR_WALL.has(k) && !back) s += 100;
  if ((k === "floorLamp" || k === "plant") && !walls) s += 12;
  return s;
}
/** 층 L에 가구 하나(o: { id, ... })를 가장 좋은 자리에 놓음(L.furniture에 넣고 true). 이미 있던 가구가 못 쓰이게 되거나 길이 끊기는 자리는 안 씀 */
export function arrPlaceOne(L, o) {
  const before = arrScan(L), entries = before.entries; let best = null;
  const wallOnly = ARR_WALL.has(arrKind(o.id));
  for (const rot of arrRots(o.id)) for (let z = 0; z < L.d; z++) for (let x = 0; x < L.w; x++) {
    if (!fits(L, o.id, x, z, rot)) continue;
    const t = { id: o.id, x, z, rot }; if (wallOnly && !backToWall(L, t)) continue;
    L.furniture.push(t); const sc = arrScan(L);
    const ok = !sc.bad.has(t) && [...sc.bad].every(b => before.bad.has(b)) && (sc.entriesOk || !before.entriesOk);
    const s = ok ? arrScore(L, t, sc, entries) : 0; L.furniture.pop();
    if (ok && (!best || s < best[0] - 1e-9)) best = [s, x, z, rot];
  }
  if (!best) return false;
  Object.assign(o, { x: best[1], z: best[2], rot: best[3] }); L.furniture.push(o); return true;
}
/** 층 L의 자동 배치 가구(objs: L.furniture 안의 객체들)를 처음부터 다시 놓음 — 손으로 놓은 나머지는 그대로. 같은 객체를 고쳐 씀(갈매미가 쓰던 가구 그대로).
 *  돌려주는 값: 못 놓은 객체 목록(L에서 빠짐). keepIfFail이면 하나라도 못 놓을 때 모두 원래대로 되돌림 */
export function arrRelayout(L, objs, { keepIfFail = false } = {}) {
  const set = new Set(objs), keep = objs.map(o => ({ o, x: o.x, z: o.z, rot: o.rot })), oldList = L.furniture.slice();
  L.furniture = L.furniture.filter(o => !set.has(o));
  const order = objs.slice().sort((a, b) => (ARR_PRI[arrKind(a.id)] ?? 5) - (ARR_PRI[arrKind(b.id)] ?? 5) || (FURNITURE[b.id].comfort || 0) - (FURNITURE[a.id].comfort || 0));
  const left = order.filter(o => !arrPlaceOne(L, o));
  if (left.length && keepIfFail) { for (const k of keep) Object.assign(k.o, { x: k.x, z: k.z, rot: k.rot }); L.furniture = oldList; return left; }
  const at = o => { const i = oldList.indexOf(o); return i < 0 ? 1e9 : i; }; L.furniture.sort((a, b) => at(a) - at(b));   // 원래 차례 그대로(새 가구는 끝)
  return left;
}
