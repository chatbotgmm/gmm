// 실내 꾸미기(순수 계산): 집마다 구조(층·방·계단·칸막이벽)가 다르고, 층마다 가구를 놓음.
// 건물의 interior = { levels: [층], stash: { id: 개수 } }
//   층 = { name, w, d, wallH, floor, wallpaper, furniture: [{ id, x, z, rot }], stairs, walls, role }
//    · stairs { x, z, w, d, dir: "up"|"down" }: 계단(아래층)·계단 구멍(위층) 칸 — 가구를 못 놓음
//    · doors [{ wall, at, to }]: 문(아래 LAYOUTS 설명). 문 앞 칸은 비워 둠
//    · walls [{ x, z0, z1, door: [z, z] }]: 세로 칸막이벽(지금 구조엔 안 씀. 방을 나눌 땐 문으로 잇는 방을 따로 둠)(x칸 경계, z0~z1), door 칸은 지나갈 수 있음. 가구가 벽을 걸치면 못 놓음
//  · x, z: 가구가 차지하는 칸 중 왼쪽 위(작은 x·z) 칸. rot 0~3(90°씩). rot이 홀수면 가로·세로가 바뀜. 앞면: rot 0 = +z, 1 = −x, 2 = −z, 3 = +x(arrange.js)
//  · hand: true = 플레이어가 손으로 놓거나 옮긴 가구(다시 정리할 때 안 건드림). 없으면 갈매미가 알아서 놓은 가구(옛 저장도 이것으로 봄)
//  · stash: 그 집에 있지만 아직 안 놓은 가구(주인이 산 것, 치운 것). 마을 가방(world.items)의 낚시 가구도 아무 집에나 놓음
import { FURNITURE, ITEMS } from "../data/catalog.js";
import { arrRelayout, arrPlaceOne, arrKind, isKitchen } from "./arrange.js";
import { residentsOf } from "./homes.js";

// 집마다 구조. 방(levels)은 한 번에 하나씩 보이고, 문을 누르면 다른 방으로 가거나(to: 방 번호) 밖으로 나감(to: "exit").
//  · doors [{ wall: "W"|"E"|"N"|"S", at, to }]: W = 왼쪽(−x) · E = 오른쪽 · N = 뒤(−z) · S = 앞. at = 벽을 따라 몇 번째 칸. 문 앞 칸엔 가구를 못 놓음
//  · stairs.to: 계단을 누르면 갈 방
export const LAYOUT_V = 2;
export const ARRANGE_V = 1;   // 생각하는 배치: 이보다 옛 저장은 처음 열 때 자동 배치 가구만 한 번 다시 놓음(relayout)
export const LAYOUTS = {
  house: [{ name: "원룸", w: 5, d: 4, doors: [{ wall: "W", at: 3, to: "exit" }] }],
  cottage: [
    { name: "1층 거실", w: 6, d: 5, stairs: { x: 4, z: 0, w: 2, d: 1, dir: "up", to: 1 }, doors: [{ wall: "W", at: 4, to: "exit" }, { wall: "E", at: 3, to: 2 }] },
    { name: "2층 침실", w: 6, d: 5, stairs: { x: 4, z: 0, w: 2, d: 1, dir: "down", to: 0 }, role: "bedroom", wallpaper: "pink", floor: "carpet" },
    { name: "1층 부엌", w: 4, d: 4, doors: [{ wall: "W", at: 2, to: 0 }], floor: "tile", role: "kitchen" },
  ],
  giantHouse: [
    { name: "큰 방(천장 높음)", w: 8, d: 7, wallH: 3.6, doors: [{ wall: "W", at: 5, to: "exit" }, { wall: "E", at: 3, to: 1 }] },
    { name: "작은 방", w: 5, d: 4, wallH: 3.6, doors: [{ wall: "W", at: 1, to: 0 }], role: "bedroom" },
  ],
  manor: [
    { name: "1층 거실", w: 7, d: 6, stairs: { x: 0, z: 0, w: 1, d: 2, dir: "up", to: 1 }, doors: [{ wall: "W", at: 4, to: "exit" }, { wall: "E", at: 2, to: 2 }], floor: "dark" },
    { name: "2층 큰 침실", w: 6, d: 5, stairs: { x: 0, z: 0, w: 1, d: 2, dir: "down", to: 0 }, doors: [{ wall: "E", at: 2, to: 3 }], role: "bedroom", wallpaper: "sky" },
    { name: "1층 부엌", w: 5, d: 5, doors: [{ wall: "W", at: 2, to: 0 }], floor: "tile", role: "kitchen" },
    { name: "2층 작은 침실", w: 5, d: 4, doors: [{ wall: "W", at: 1, to: 1 }], role: "bedroom", wallpaper: "pink" },
  ],
};
const ROOM_DEFAULT = { w: 6, d: 5 };

export const size = (id, rot) => { const f = FURNITURE[id].footprint; return rot % 2 ? { w: f.d, d: f.w } : { w: f.w, d: f.d }; };
/** 집 실내(층 목록)를 만들거나 예전 저장(층 없이 furniture만)을 첫 층으로 옮김 */
export function room(b) {
  const it = b.interior; it.stash ||= {};
  if (!it.levels || it.layoutV !== LAYOUT_V) {
    const w0 = it.w || ROOM_DEFAULT.w, d0 = it.d || ROOM_DEFAULT.d;
    const plan = LAYOUTS[b.defId] || [{ name: "방", w: w0, d: d0, doors: [{ wall: "W", at: d0 - 1, to: "exit" }, { wall: "E", at: 1, to: 1 }] }, { name: "뒷방", w: 4, d: 4, doors: [{ wall: "W", at: 1, to: 0 }] }];
    const prev = it.levels || [{ furniture: it.furniture || [], floor: it.floor, wallpaper: it.wallpaper }];   // 예전 저장: 층 없이 furniture만 · 예전 구조(칸막이벽)
    it.levels = plan.map((p, i) => ({ ...p, stairs: p.stairs ? { ...p.stairs } : null, walls: (p.walls || []).map(w => ({ ...w })), doors: (p.doors || []).map(d => ({ ...d })), wallH: p.wallH || 2.4,
      floor: prev[i]?.floor || p.floor || "wood", wallpaper: prev[i]?.wallpaper || p.wallpaper || "cream", furniture: [] }));
    delete it.furniture; delete it.floor; delete it.wallpaper; it.layoutV = LAYOUT_V;
    prev.forEach((P, i) => { for (const o of P.furniture || []) { const L = it.levels[i]; if (L && fits(L, o.id, o.x, o.z, o.rot)) L.furniture.push(o); else it.stash[o.id] = (it.stash[o.id] || 0) + 1; } });   // 같은 번째 방에 맞으면 그대로, 아니면 창고로
  }
  if (it.arrangeV !== ARRANGE_V) { it.arrangeV = ARRANGE_V; if (it.levels.some(L => L.furniture.some(o => !o.hand))) relayout(null, b); }   // 옛 배치(벽·앞면·통로를 안 보던 것)를 한 번 정리
  return it;
}
export const levels = b => room(b).levels;
export const allFurniture = b => levels(b).flatMap(L => L.furniture);
const cellsOf = (id, x, z, rot) => { const s = size(id, rot), out = []; for (let dz = 0; dz < s.d; dz++) for (let dx = 0; dx < s.w; dx++) out.push([x + dx, z + dz]); return out; };
/** 계단 앞 디딤 칸(오르는 계단의 가장 낮은 단 바로 앞): 늘 비워 둠 */
export const landing = s => !s || s.dir !== "up" ? null : s.w >= s.d ? [s.x + s.w - 1, s.z + s.d] : [s.x, s.z + s.d];
/** 문 앞 칸(방 안쪽 첫 칸): 늘 비워 둠 */
export const doorCell = (L, d) => d.wall === "W" ? [0, d.at] : d.wall === "E" ? [L.w - 1, d.at] : d.wall === "N" ? [d.at, 0] : [d.at, L.d - 1];
const atDoor = (L, x, z) => (L.doors || []).some(d => { const c = doorCell(L, d); return c[0] === x && c[1] === z; });
const inStairs = (L, x, z) => { const s = L.stairs; if (!s) return false; const l = landing(s); return (x >= s.x && x < s.x + s.w && z >= s.z && z < s.z + s.d) || (!!l && l[0] === x && l[1] === z); };
/** 칸막이벽을 걸치는가(벽 양쪽 칸을 같이 차지하고, 그 줄이 문이 아님) */
const crossesWall = (L, cells) => (L.walls || []).some(w => {
  const set = new Set(cells.map(c => c.join(",")));
  return cells.some(([x, z]) => x === w.x - 1 && z >= w.z0 && z < w.z1 && set.has(`${w.x},${z}`) && !(w.door && z >= w.door[0] && z <= w.door[1]));
});
/** 놓을 수 있나(층 L): 방 안, 계단 칸 아님, 칸막이벽을 안 걸침, 같은 층(깔개끼리 / 나머지끼리) 가구와 안 겹침. skip: 옮기는 중인 가구 번호 */
export function fits(L, id, x, z, rot, skip = -1) {
  const f = FURNITURE[id]; if (!f) return false;
  const cells = cellsOf(id, x, z, rot);
  if (cells.some(([cx, cz]) => cx < 0 || cz < 0 || cx >= L.w || cz >= L.d || inStairs(L, cx, cz) || atDoor(L, cx, cz))) return false;
  if (crossesWall(L, cells)) return false;
  const floor = f.layer === "floor";
  return !L.furniture.some((o, i) => {
    if (i === skip || (FURNITURE[o.id].layer === "floor") !== floor) return false;
    const oc = new Set(cellsOf(o.id, o.x, o.z, o.rot).map(c => c.join(","))); return cells.some(c => oc.has(c.join(",")));
  });
}
/** 놓을 수 있는 가구 목록: 그 집 창고(stash) + 마을 가방(낚시 가구) */
export function available(world, b) {
  const it = room(b), out = {};
  for (const [id, n] of Object.entries(it.stash)) if (n > 0) out[id] = { n, from: "stash" };
  for (const item of ITEMS) if (item.furniture && (world.items[item.id] || 0) > 0) { const id = item.furniture; out[id] = { n: (out[id]?.n || 0) + world.items[item.id], from: out[id] ? "both" : "bag", item: item.id }; }
  return out;
}
function take(world, b, id) {
  const it = room(b); if ((it.stash[id] || 0) > 0) { it.stash[id]--; return true; }
  const item = ITEMS.find(i => i.furniture === id); if (item && (world.items[item.id] || 0) > 0) { world.items[item.id]--; return true; }
  return false;
}
const lv = (b, li) => levels(b)[li] || levels(b)[0];
export function place(world, b, id, x, z, rot = 0, li = 0) {
  const L = lv(b, li); if (!fits(L, id, x, z, rot) || !take(world, b, id)) return false;
  L.furniture.push({ id, x, z, rot, hand: true }); world.emit?.("furniture", { b, kind: "place" }); return true;   // kind "place": 내가 손으로 놓음(오늘의 부탁이 셈)
}
export function move(world, b, i, x, z, rot, li = 0) {
  const L = lv(b, li), o = L.furniture[i]; if (!o || !fits(L, o.id, x, z, rot, i)) return false;
  Object.assign(o, { x, z, rot, hand: true }); world.emit?.("furniture", { b }); return true;
}
/** 치우기: 그 집 창고로 */
export function stow(world, b, i, li = 0) {
  const L = lv(b, li), o = L.furniture[i]; if (!o) return false;
  L.furniture.splice(i, 1); const it = room(b); it.stash[o.id] = (it.stash[o.id] || 0) + 1; world.emit?.("furniture", { b }); return true;
}
/** 산 가구를 놓을 자리가 없을 때 갈매미 말풍선(가구는 집 창고로) */
export const NO_ROOM_SAY = "자리가 없어… 창고에 둘게 📦";
/** 가구를 놓아 볼 층 차례: 침대·옷장은 침실 층부터, 오븐은 부엌 층부터, 나머지는 아래층(앞 번호)부터 */
function levelOrder(ls, id) {
  const k = arrKind(id), want = L => k === "bed" || k === "wardrobe" ? L.role === "bedroom" : k === "oven" ? isKitchen(L) : false;
  return ls.map((L, i) => i).sort((a, c) => want(ls[c]) - want(ls[a]) || a - c);
}
/** 층 L의 자동 배치 가구를 모두 다시 놓아 봄(하나라도 못 놓으면 원래대로 두고 false). 깔개가 아직 없으면 탁자가 방 한가운데로 나와 좁은 방이 막히므로
 *  깔개 자리를 잡아 둔 셈 치고 한 번 더(다 산 방과 같은 꼴 — 원룸에서 차례 탓에 스탠드·책장이 창고로 가던 것) */
function relayAll(L, auto) {
  if (!arrRelayout(L, auto, { keepIfFail: true }).length) return true;
  if (L.furniture.some(x => FURNITURE[x.id].layer === "floor")) return false;
  const ghost = { id: "rug", x: 0, z: 0, rot: 0 }; L.furniture.push(ghost);
  const ok = !arrRelayout(L, [ghost, ...auto], { keepIfFail: true }).length; L.furniture = L.furniture.filter(x => x !== ghost); return ok;
}
/** 알아서 놓기(갈매미가 사 오거나 건진 가구): 층마다 자동 배치 가구를 새 가구와 함께 다시 생각해 놓아 보고(arrange.js — 벽을 등지고, 앞을 비우고,
 *  문에서 걸어갈 길을 남기고, 의자는 탁자를 봄), 안 되면 지금 배치에 새 가구 하나만 끼워 봄. 어느 층에도 자리가 없으면 false(호출한 쪽이 창고로) */
export function autoPlace(world, b, id) {
  if (!FURNITURE[id]) return false;
  const ls = levels(b);
  for (const li of levelOrder(ls, id)) {
    const L = ls[li], o = { id, x: 0, z: 0, rot: 0 };
    L.furniture.push(o);
    if (relayAll(L, L.furniture.filter(x => !x.hand))) { world?.emit?.("furniture", { b }); return true; }
    L.furniture.pop();
    if (arrPlaceOne(L, o)) { world?.emit?.("furniture", { b }); return true; }
  }
  if (FURNITURE[id].use === "sleep" && !allFurniture(b).some(x => FURNITURE[x.id].use === "sleep")) {   // 침대가 하나도 없으면 침대가 먼저: 덜 중요한 자동 배치 가구를 창고로 비켜 줌
    const L = ls[levelOrder(ls, id)[0]], o = { id, x: 0, z: 0, rot: 0 }; L.furniture.push(o);
    const left = arrRelayout(L, L.furniture.filter(x => !x.hand));
    if (!left.includes(o)) { const it = room(b); for (const x of left) { it.stash[x.id] = (it.stash[x.id] || 0) + 1; for (const u of world?.units || []) if (u.useFurni === x) u.useFurni = null; } world?.emit?.("furniture", { b }); return true; }
    L.furniture = L.furniture.filter(x => x !== o); for (const x of left) if (x !== o) arrPlaceOne(L, x) || (room(b).stash[x.id] = (room(b).stash[x.id] || 0) + 1);
  }
  return false;
}
/** 🪄 정리하기: 손으로 놓은 가구(hand)는 두고, 갈매미가 놓은 가구만 집 전체에서 다시 생각해 놓음 — 가구마다 맞는 층(침대·옷장 = 침실, 오븐 = 부엌, 나머지 = 아래층)에
 *  먼저 놓고, 자리가 없으면 다른 층에, 그래도 없으면 창고로. 같은 가구 객체를 옮겨 씀(갈매미가 쓰던 가구 그대로).
 *  돌려주는 값: { moved: 자리가 바뀐 가구 수, stashed: 창고로 간 가구 id 목록 } */
export function relayout(world, b) {
  const it = room(b), ls = it.levels, stashed = [];
  const was = new Map(ls.flatMap((L, li) => L.furniture.filter(o => !o.hand).map(o => [o, `${li},${o.x},${o.z},${o.rot}`])));
  const auto = [...was.keys()], home = new Map(auto.map(o => [o, levelOrder(ls, o.id)[0]]));
  for (const L of ls) L.furniture = L.furniture.filter(o => o.hand);
  const left = [];
  ls.forEach((L, li) => { const mine = auto.filter(o => home.get(o) === li); L.furniture.push(...mine); if (!relayAll(L, mine)) left.push(...arrRelayout(L, mine)); });
  for (const o of left) {
    const to = levelOrder(ls, o.id).filter(i => i !== home.get(o)).find(i => arrPlaceOne(ls[i], o));
    if (to === undefined) { stashed.push(o.id); it.stash[o.id] = (it.stash[o.id] || 0) + 1; for (const u of world?.units || []) if (u.useFurni === o) u.useFurni = null; }
  }
  let moved = 0; for (const [o, k] of was) { const li = ls.findIndex(L => L.furniture.includes(o)); if (li < 0 || `${li},${o.x},${o.z},${o.rot}` !== k) moved++; }
  world?.emit?.("furniture", { b }); return { moved, stashed };
}
/** 집 아늑함: 모든 층에 놓인 가구 comfort 합 */
export const comfort = b => allFurniture(b).reduce((s, o) => s + (FURNITURE[o.id]?.comfort || 0), 0);
/** 집에 있는(놓였거나 창고) 가구 종류 */
export const owns = (b, id) => allFurniture(b).some(o => o.id === id) || (room(b).stash[id] || 0) > 0;
/** 갈매미가 다음에 사고 싶은 가구(없는 것 중 이 순서대로) */
export const WANT_ORDER = ["bed", "chair", "table", "plant", "rug", "floorLamp", "bookshelf", "sofa", "wardrobe", "oven"];
/** 집에 있는(놓였거나 창고) 침대 수 */
export const bedCount = b => allFurniture(b).filter(o => FURNITURE[o.id]?.use === "sleep").length + Object.entries(room(b).stash).reduce((s, [id, n]) => s + (FURNITURE[id]?.use === "sleep" ? Math.max(0, n) : 0), 0);
/** 다음에 살 가구: 사는 갈매미보다 침대가 적으면 침대부터(둘이 사는 2층집 = 침대 둘, homes.js), 아니면 없는 것 중 WANT_ORDER 차례 */
export function nextWant(b) { return bedCount(b) < Math.max(1, residentsOf(b).length) ? "bed" : WANT_ORDER.find(id => !owns(b, id)) || null; }
/** 집에 들어온 갈매미가 쓸 가구: 졸리면 침대(busy = 같은 집에서 다른 갈매미가 쓰는 가구 — 빈 침대부터, 다 차면 첫 침대), 아니면 앉을 것·책장 중 하나 */
export function pickUse(b, sleepy, rnd = Math.random, busy = []) {
  const list = allFurniture(b).filter(o => FURNITURE[o.id].use);
  const beds = list.filter(o => FURNITURE[o.id].use === "sleep");
  if (sleepy && beds.length) return beds.find(o => !busy.includes(o)) || beds[0];
  const other = list.filter(o => FURNITURE[o.id].use !== "sleep"); const pool = other.length ? other : list;
  return pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
}
