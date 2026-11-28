// 넓은 섬 저장(오픈월드 2단계): 격자 전체 대신 씨앗 + 시작 섬 기준(base) + 바뀐 칸(delta)만.
//  저장 grid 칸(version 3):
//   { kind: "chunks", seed, genV(생성 판, 없으면 1), chunk(그리기 조각 16), box: [x0, z0, x1, z1](시작 섬 상자),
//     base: 시작 섬 상자의 높이(×1000)·바닥을 줄 단위 반복 줄임(RLE) + 가변 길이 정수 → base64,
//     delta: 생성 결과(시작 섬은 base)와 다른 칸만 — 청크 열쇠 차이·칸 수·(칸 간격, 높이 차×1000·바닥 바뀜 표시, 바닥) → base64, n: 바뀐 칸 수,
//     genOff: 치운 생성 모듈 id(바깥 생성기는 아직 모듈을 만들지 않아 늘 빈 목록 — 판을 올릴 때 씀),
//     visited: 지나온 청크 열쇠(오름차순 차이) → base64 }
//  · 시작 섬은 씨앗으로 다시 만들지 않고 늘 base로 저장한다(엔진마다 sin·cos가 1ulp 다를 수 있음, 비평 B3-b). 바깥은 정수 해시라 씨앗으로 다시 만든다.
//  · 높이는 ×1000 정수(지금 저장 반올림과 같음). 예전 저장(version 2, 192칸 격자 전체)은 그 격자를 그대로 base로 옮긴다(delta 없음).
import { GROUND_TYPES } from "../data/types.js";
import { Grid } from "./Grid.js";
import { ChunkGrid } from "./chunkGrid.js";
import { GEN_WORLD_V, WCH, WCH_SHIFT, WCH_MASK } from "./worldGen.js";

const SD_NC = WCH * WCH;
// ---- 바이트 쓰기·읽기(가변 길이 정수: 7비트씩, 음수는 지그재그)
class Bytes {
  constructor() { this.a = new Uint8Array(1024); this.n = 0; }
  byte(v) { if (this.n >= this.a.length) { const b = new Uint8Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = v; }
  uv(v) { while (v >= 128) { this.byte((v % 128) | 128); v = Math.floor(v / 128); } this.byte(v); }
  sv(v) { this.uv(v < 0 ? -2 * v - 1 : 2 * v); }
  b64() { let s = ""; for (let i = 0; i < this.n; i += 8192) s += String.fromCharCode.apply(null, this.a.subarray(i, Math.min(this.n, i + 8192))); return btoa(s); }
}
class Reader {
  constructor(b64) { const s = atob(b64 || ""); this.a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) this.a[i] = s.charCodeAt(i); this.i = 0; }
  get done() { return this.i >= this.a.length; }
  byte() { if (this.i >= this.a.length) throw new Error("저장 격자가 잘렸어요"); return this.a[this.i++]; }
  uv() { let v = 0, m = 1, b; do { b = this.byte(); v += (b & 127) * m; m *= 128; } while (b & 128); return v; }
  sv() { const u = this.uv(); return u % 2 ? -(u + 1) / 2 : u / 2; }
}

/** 상자 높이(×1000)·바닥 배열 → 반복 줄임 base64 */
export function encodeBase(be, bg) {
  const out = new Bytes(); let pe = 0, i = 0;
  while (i < be.length) {
    let j = i + 1; while (j < be.length && be[j] === be[i] && bg[j] === bg[i]) j++;
    out.uv(j - i); out.sv(be[i] - pe); out.byte(bg[i]); pe = be[i]; i = j;
  }
  return out.b64();
}
export function decodeBase(b64, n) {
  const r = new Reader(b64), be = new Int16Array(n), bg = new Uint8Array(n); let pe = 0, i = 0;
  while (i < n) { const len = r.uv(), e = pe + r.sv(), g = r.byte(); if (len < 1 || i + len > n) throw new Error("저장 격자(base)가 망가졌어요"); be.fill(e, i, i + len); bg.fill(g, i, i + len); pe = e; i += len; }
  return { be, bg };
}

/** ChunkGrid → 저장 칸 */
export function gridToSave(g) {
  const b = g.box, delta = new Bytes(); let pk = 0, n = 0;
  for (const ch of g.residentChunks().concat([...g.lru.values()].sort((p, q) => p.key - q.key))) {
    const diff = [];
    for (let i = 0; i < SD_NC; i++) { const c = ch.cells[i], e = Math.round(c.elevation * 1000), gi = GROUND_TYPES.indexOf(c.groundType); if (e !== ch.be[i] || gi !== ch.bg[i]) diff.push(i, e - ch.be[i], gi !== ch.bg[i] ? gi : -1); }
    if (!diff.length) continue;
    delta.sv(ch.key - pk); pk = ch.key; delta.uv(diff.length / 3); let pi = -1;
    for (let k = 0; k < diff.length; k += 3) { delta.uv(diff[k] - pi - 1); pi = diff[k]; delta.sv(diff[k + 1] * 2 + (diff[k + 2] >= 0 ? 1 : 0)); if (diff[k + 2] >= 0) delta.byte(diff[k + 2]); }
    n += diff.length / 3;
  }
  const vis = new Bytes(), keys = [...g.visited].sort((p, q) => p - q); let pv = 0; vis.uv(keys.length); for (const k of keys) { vis.uv(k - pv); pv = k; }
  return { kind: "chunks", w: b.x1 - b.x0, h: b.z1 - b.z0, seed: g.seed,   // w·h: 계정 저장 서버(island-save.js) 모양 검사(8~512) 통과용, 읽을 때는 box
     genV: g.genV, chunk: g.chunk, box: [b.x0, b.z0, b.x1, b.z1],
    base: encodeBase(g.startBase.be, g.startBase.bg), delta: delta.b64(), n, genOff: [...(g.genOff || [])], visited: vis.b64() };
}
/** 저장 칸 → ChunkGrid */
export function gridFromSave(j) {
  if (!j || j.kind !== "chunks" || !Array.isArray(j.box)) throw new Error("저장 격자 형식이 달라요");
  const [x0, z0, x1, z1] = j.box, genV = Number.isInteger(j.genV) ? j.genV : 1;
  if (genV > GEN_WORLD_V) throw new Error("더 새 버전 게임에서 만든 섬이에요. 새로 고침해 보세요");
  const g = new ChunkGrid(j.seed, { genV, box: { x0, z0, x1, z1 }, chunk: j.chunk || 16 });
  const { be, bg } = decodeBase(j.base, (x1 - x0) * (z1 - z0)); g.setStartBase(be, bg);
  const r = new Reader(j.delta); let key = 0;
  while (!r.done) {
    key += r.sv(); const cx = (key % 1024) - 512, cz = Math.floor(key / 1024) - 512, ch = g.chunkAt(cx, cz), cnt = r.uv(); let i = -1;
    for (let k = 0; k < cnt; k++) {
      i += r.uv() + 1; const v = r.sv(), gc = v & 1 ? r.byte() : -1, de = (v - (v & 1)) / 2; if (i >= SD_NC) throw new Error("저장 격자(delta)가 망가졌어요");
      const c = ch.cells[i]; c.elevation = (ch.be[i] + de) / 1000; if (gc >= 0) c.groundType = GROUND_TYPES[gc] ?? c.groundType;
    }
    g.pin(cx * WCH, cz * WCH);
  }
  g.genOff = new Set(Array.isArray(j.genOff) ? j.genOff.filter(s => typeof s === "string") : []);
  if (j.visited) { const v = new Reader(j.visited), n = v.uv(); let k = 0; for (let i = 0; i < n; i++) { k += v.uv(); g.visited.add(k); } }
  g.markAllDirty(); return g;
}
/** 예전 넓은 섬 저장(version 2: 192칸 격자 전체) → ChunkGrid. 그 격자가 그대로 시작 섬 기준(base)이 된다 */
export function migrateGrid(seed, old) {
  const start = Grid.fromJSON(old), g = ChunkGrid.fromStart(seed, start); g.markAllDirty(); return g;
}
/** 저장한 바뀐 칸 수 · base64 길이(설정 창·시험용) */
export function deltaStats(j) { return { cells: j?.n || 0, deltaB64: (j?.delta || "").length, baseB64: (j?.base || "").length }; }
void WCH_SHIFT; void WCH_MASK;
