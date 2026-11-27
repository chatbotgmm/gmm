// 계정 저장 규칙(src/systems/cloudSync.js, 순수): decideSync 표 · isPristine(실제 새 섬) · afterPush · 덮어쓰기 칸 · 묘비 멈춤 ·
// writeWithBackup · awayFor · ?login= 문구 · 표시 쿠키 · 켜는 곳(cloudWhere) · keepalive 한도 · 상태 한 줄 · 요약 줄
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CS from "../src/systems/cloudSync.js";
import { World } from "../src/world/World.js";
import { GRID_W } from "../src/config.js";
import { seededRandom } from "../src/util.js";

const fresh = () => World.create(7, seededRandom(3), { wild: true });
const meta = o => ({ ...CS.emptyMeta(), ...o });

test("새 넓은 섬은 손대지 않은 섬 · 한 번 맞춘 섬·하루 넘긴 섬·반짝이 주운 섬은 아님", () => {
  const w = fresh(), j = w.serialize(Date.now());
  assert.equal(CS.isPristine(j, CS.emptyMeta()), true);
  assert.equal(CS.isPristine(j, meta({ baseRev: 1 })), false);
  assert.equal(CS.isPristine({ ...j, time: 600 }, CS.emptyMeta()), false);
  assert.equal(CS.isPristine({ ...j, items: { seaglass: 1 } }, CS.emptyMeta()), false);
  assert.equal(CS.isPristine({ ...j, bank: { ...j.bank, vault: 10 } }, CS.emptyMeta()), false);
  assert.equal(CS.isPristine(null, CS.emptyMeta()), false);
});

test("decideSync: 표 그대로", () => {
  const d = CS.decideSync;
  assert.equal(d(null, CS.emptyMeta(), { rev: 3 }), "pull");
  assert.equal(d(null, CS.emptyMeta(), null), "none");
  assert.equal(d({ pristine: false }, meta({ dirty: true }), null), "push");                   // 계정에 아직 없음
  assert.equal(d({ pristine: false }, meta({ dirty: true, paused: true }), null), "none");
  assert.equal(d({ pristine: true }, CS.emptyMeta(), { rev: 4 }), "pull");                     // 새 기기 새 섬 → 묻지 않고 받기
  assert.equal(d({ pristine: false }, meta({ baseRev: 4, dirty: true }), { rev: 4 }), "push");
  assert.equal(d({ pristine: false }, meta({ baseRev: 4, dirty: false }), { rev: 4 }), "none");
  assert.equal(d({ pristine: false }, meta({ baseRev: 3, dirty: false }), { rev: 5 }), "pull");
  assert.equal(d({ pristine: false }, meta({ baseRev: 3, dirty: true }), { rev: 5 }), "ask");
  assert.equal(d({ pristine: false }, CS.emptyMeta(), { rev: 5 }), "ask");                     // 처음 로그인한 기기에 다른 섬
  assert.equal(d({ pristine: true }, CS.emptyMeta(), { rev: 5, deleted: true }), "none");      // 새 섬 + 묘비 = 묻지 않음
  assert.equal(d({ pristine: false }, meta({ baseRev: 3 }), { rev: 5, deleted: true }), "askDeleted");
  assert.equal(d({ pristine: false }, meta({ baseRev: 5, paused: true }), { rev: 5, deleted: true }), "none");
});

test("afterPush: 200·409·409 묘비·429·401·404·그 밖", () => {
  const m = meta({ baseRev: 2, dirty: true });
  const ok = CS.afterPush(m, 200, { ok: true, rev: 3 }, 1000);
  assert.deepEqual([ok.next, ok.meta.baseRev, ok.meta.dirty, ok.meta.upAt], ["done", 3, false, 1000]);
  assert.equal(CS.afterPush(m, 409, { server: { rev: 5 } }, 0).next, "ask");
  assert.equal(CS.afterPush(m, 409, { server: { rev: 5, deleted: true } }, 0).next, "askDeleted");
  const r = CS.afterPush(m, 429, { retryAfter: 7 }, 0); assert.deepEqual([r.next, r.wait], ["retry", 7]);
  assert.equal(CS.afterPush(m, 429, { retryAfter: 999 }, 0).wait, 60);
  assert.equal(CS.afterPush(m, 401, null, 0).next, "login");
  assert.equal(CS.afterPush(m, 404, null, 0).next, "off");
  assert.equal(CS.afterPush(m, 500, null, 0).next, "later");
  assert.equal(CS.afterPush(m, 0, null, 0).next, "later");
});

test("덮어쓰기 칸은 {server.rev, replace:true} · 묘비 뒤 멈춤 → 자동 올리기 안 함", () => {
  assert.deepEqual(CS.overwriteRequest({ rev: 9 }), { baseRev: 9, replace: true });
  assert.equal(CS.overwriteRequest({}), null);
  const m = CS.afterTombstone(meta({ baseRev: 4 }), 5);
  assert.deepEqual([m.baseRev, m.paused, m.dirty], [5, true, true]);
  assert.equal(CS.dueUpload(m, 1e12), false);
  assert.equal(CS.dueUpload(meta({ dirty: true, upAt: 0 }), CS.CLOUD_EVERY_MS), true);
  assert.equal(CS.dueUpload(meta({ dirty: true, upAt: 1000 }), 1000 + CS.CLOUD_EVERY_MS - 1), false);
});

test("checkPulled: 다른 지도·작은 섬·망가진 저장은 거절(이 기기 섬 그대로)", () => {
  const j = fresh().serialize(Date.now());
  assert.equal(CS.checkPulled(j, GRID_W).ok, true);
  assert.equal(j.version, 3, "넓은 섬 = 저장 판 3(씨앗 + 시작 섬 기준 + 바뀐 칸)"); assert.equal(j.grid.kind, "chunks");
  assert.equal(CS.checkPulled({ ...j, grid: { w: 10, h: 10 } }, GRID_W).ok, false, "판 3인데 격자가 판 3 모양이 아님");
  assert.equal(CS.checkPulled({ ...j, grid: { ...j.grid, genV: 2 } }, GRID_W).ok, false, "더 새 생성 판");
  assert.equal(CS.checkPulled({ ...j, grid: { ...j.grid, genV: undefined } }, GRID_W).ok, true, "생성 판이 없으면 1");
  const old = { ...j, version: 2, grid: { w: GRID_W, h: GRID_W, chunk: 16, ground: [], elevation: [] } };   // 예전 판 2(192칸 격자 전체)도 받음 → 불러올 때 판 3으로 옮김
  assert.equal(CS.checkPulled(old, GRID_W).ok, true); assert.equal(CS.checkPulled({ ...old, grid: { ...old.grid, w: 10 } }, GRID_W).ok, false);
  assert.equal(CS.checkPulled({ ...j, wild: false }, GRID_W).ok, false);
  assert.equal(CS.checkPulled({ ...j, units: null }, GRID_W).ok, false);
  assert.equal(CS.checkPulled([], GRID_W).ok, false);
});

test("writeWithBackup: .bak 남김 · 한도 초과면 .bak 지우고 다시 · 둘 다 실패면 예전 섬 그대로", () => {
  const mk = (limit = Infinity) => { const m = new Map(); return { m, getItem: k => m.get(k) ?? null, removeItem: k => m.delete(k),
    setItem: (k, v) => { const size = [...m].filter(([x]) => x !== k).reduce((a, [, y]) => a + y.length, 0) + v.length; if (size > limit) throw Object.assign(new Error("full"), { name: "QuotaExceededError" }); m.set(k, v); } }; };
  const s = mk(); s.setItem("k", "old");
  assert.deepEqual(CS.writeWithBackup(s, "k", "new"), { ok: true, bak: true }); assert.equal(s.m.get("k.bak"), "old");
  const t = mk(12); t.setItem("k", "12345");
  assert.deepEqual(CS.writeWithBackup(t, "k", "abcdefgh"), { ok: true, bak: false }); assert.equal(t.m.get("k"), "abcdefgh"); assert.equal(t.m.has("k.bak"), false);
  const u = mk(8); u.setItem("k", "12345");
  const r = CS.writeWithBackup(u, "k", "abcdefghij"); assert.equal(r.ok, false); assert.equal(u.m.get("k"), "12345");
});

test("awayFor: 같은 판은 한 번만 · 시계가 하루 넘게 틀리면 서버 시각", () => {
  const now = 10 * 86400_000;
  assert.deepEqual(CS.awayFor({ savedAt: now - 3600_000 }, { rev: 2 }, meta({}), now), { away: 3600_000, base: now - 3600_000 });
  assert.equal(CS.awayFor({ savedAt: now - 3600_000 }, { rev: 2 }, meta({ grantedRev: 2 }), now).away, 0);
  assert.equal(CS.awayFor({ savedAt: now - 3600_000, lastOfflineGrant: now - 60_000 }, { rev: 2 }, meta({}), now).away, 60_000);
  assert.equal(CS.awayFor({ savedAt: now - 5 * 86400_000 }, { rev: 2, updatedAt: now - 7200_000 }, meta({}), now).away, 7200_000);
  assert.equal(CS.awayFor({ savedAt: now + 5000 }, { rev: 2 }, meta({}), now).away, 0);
});

test("?login=: 정해진 값만 글로(믿지 않음) · link면 /my에서 연결하기(새 탭) · 표시 쿠키", () => {
  assert.equal(CS.loginNotice("?login=<script>"), null);
  assert.equal(CS.loginNotice(""), null);
  assert.match(CS.loginNotice("?login=ok").text, /확인하는 중/);
  assert.equal(CS.loginNotice("?login=ok").open, undefined);
  const l = CS.loginNotice("?login=link");
  assert.deepEqual([l.open.href, l.open.newTab, l.open.recheckOnReturn], ["/my?kakao=link", true, true]);
  assert.equal(CS.returnCookie(true), "gmm_ir=v3d; Path=/my; Max-Age=300; SameSite=Lax; Secure");
  assert.equal(CS.returnCookie(false), "gmm_ir=v3d; Path=/my; Max-Age=300; SameSite=Lax");
});

test("켜는 곳: 같은 출처 /village3d/만(아티팩트·로컬 파일·개발 서버 /island/는 끔)", () => {
  assert.equal(CS.cloudWhere({ protocol: "https:", pathname: "/village3d/" }), true);
  assert.equal(CS.cloudWhere({ protocol: "https:", pathname: "/village3d/index.html" }), true);
  assert.equal(CS.cloudWhere({ protocol: "http:", pathname: "/village3d" }), true);
  assert.equal(CS.cloudWhere({ protocol: "https:", pathname: "/island/index.html" }), false);
  assert.equal(CS.cloudWhere({ protocol: "file:", pathname: "/village3d/index.html" }), false);
  assert.equal(CS.cloudWhere({ protocol: "about:", pathname: "srcdoc" }), false);
  assert.equal(CS.cloudWhere(null), false);
});

test("저장 크기: 새 넓은 섬 계정 저장(gzip+base64)은 keepalive 안 · 2만 칸을 바꿔도 140KB 아래(한도 256KB)", async () => {
  const { gzipSync } = await import("node:zlib");
  const b64 = j => gzipSync(JSON.stringify(j)).toString("base64").length;
  const w = fresh(), n0 = b64(w.serialize(1));
  assert.ok(n0 < 30_000 && CS.keepaliveOk(n0 + 200), `새 섬 ${n0}자`);
  const r = seededRandom(5), g = w.grid, T = ["Grass", "Cobble", "WoodDeck", "Dirt", "Sand", "Rock"], seen = new Set();   // 붓질처럼 7×7 덩어리, 높이는 연속값(다듬기 도구를 쓴 최악) · 바닥 무작위
  while (seen.size < 20000) { const cx = Math.floor(r() * 900) - 350, cz = Math.floor(r() * 900) - 350;
    for (let dz = 0; dz < 7; dz++) for (let dx = 0; dx < 7; dx++) { const x = cx + dx, z = cz + dz, k = x + "," + z; if (seen.has(k) || seen.size >= 20000) continue; seen.add(k);
      g.setElevation(x, z, Math.round((r() * 3 - 1.5) * 1000) / 1000); g.setGround(x, z, T[Math.floor(r() * 6)]); } }
  const j = w.serialize(1), n = b64(j);
  assert.ok(j.grid.n >= 19000, `바뀐 칸 ${j.grid.n}`); assert.ok(n < 140_000 && n < CS.ISLAND_B64_LIMIT, `2만 칸 ${n}자`);
  assert.equal(CS.checkPulled(j, GRID_W).ok, true);
});

test("keepalive는 60KB 아래만 · 상태 한 줄 다섯 가지 · n분 전", () => {
  assert.equal(CS.keepaliveOk(59_999), true); assert.equal(CS.keepaliveOk(60_000), false); assert.equal(CS.keepaliveOk(0), false);
  const now = 1e12;
  assert.equal(CS.cloudStatus({ mode: "logout" }, now).big, "로그인 안 함");
  assert.equal(CS.cloudStatus({ mode: "ok", meta: meta({ baseRev: 3, upAt: now - 3 * 60_000 }) }, now).big, "저장됨 3분 전");
  assert.equal(CS.cloudStatus({ mode: "paused", meta: meta({}) }, now).big, "저장 멈춤 · 다시 올리기");
  assert.equal(CS.cloudStatus({ mode: "error", err: "x" }, now).big, "저장 멈춤 · 다시 올리기");
  assert.equal(CS.cloudStatus({ mode: "conflict" }, now).big, "충돌");
  assert.equal(CS.cloudStatus({ mode: "off" }, now).big, "이 주소에서는 계정 저장을 쓸 수 없어요");
  assert.deepEqual(["방금", "1분 전", "2시간 전", "3일 전"], [CS.agoText(now - 5000, now), CS.agoText(now - 60_000, now), CS.agoText(now - 2 * 3600_000, now), CS.agoText(now - 3 * 86400_000, now)]);
});

test("요약: summaryOf → readSummary → 충돌 창 네 줄(갈매미·건물·금고·마지막 저장)", () => {
  const w = fresh(), at = new Date(2026, 10, 27, 14, 5).getTime();
  const s = CS.readSummary(CS.summaryOf(w, at));
  assert.deepEqual([s.pop, s.bld, s.vault, s.at], [0, w.buildings.size, Math.floor(w.bank.vault), at]);
  const rows = CS.summaryRows(s, at + 180_000);
  assert.deepEqual(rows.map(r => r[0]), ["🐦 갈매미", "🏠 건물", "🏦 금고", "🕒 마지막 저장"]);
  assert.equal(rows[3][1], "11/27 14:05 · 3분 전");
  assert.equal(CS.readSummary("{망가짐"), null);
  assert.equal(CS.summaryRows(null)[0][1], "알 수 없음");
  assert.ok(CS.summaryOf(w).length <= 600);
});
