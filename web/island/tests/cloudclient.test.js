// 계정 저장 주고받기(src/systems/cloudClient.js)를 가짜 서버(island-save.js 판 3 규칙을 흉내 낸 fetch)로: 꺼짐(주소·404·네트워크) ·
// 로그인 안 함 · 처음 올리기 · 새 기기 새 섬 자동 받기 · 충돌(이 기기 섬으로 / 계정 섬 받기 → 한 단계 되돌리기로 이 기기 섬 되찾음) ·
// 429 다시 보내기 · 묘비(새 섬은 묻지 않고 멈춤 / 손댄 섬은 묻기) · 화면 떠날 때 keepalive(60KB) · 받은 섬이 망가졌으면 덮어쓰지 않음
import { test } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync, gzipSync } from "node:zlib";
import { CloudSaver, gzipB64, gunzipB64 } from "../src/systems/cloudClient.js";
import { CLOUD_META_KEY, CLOUD_EVERY_MS } from "../src/systems/cloudSync.js";
import { World } from "../src/world/World.js";
import { GRID_W } from "../src/config.js";
import { seededRandom } from "../src/util.js";

const SAVE_KEY = "galmaemiman-island-v1";
const mem = () => { const m = new Map(); return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

/** 가짜 계정 서버: 한 계정 한 칸. island-save.js와 같은 순서(로그인 → 충돌 409 → 쓰기 간격 429 → 저장), prev는 replace·지우기·되돌리기 때만 */
function fakeServer({ logged = true, status = null, down = false } = {}) {
  const S = { logged, row: null, calls: [], tooSoon: 0, clock: 1_000_000 };
  const res = (code, body) => ({ status: code, json: async () => body });
  const meta = r => r ? { slot: 0, rev: r.rev, size: r.data.length, savedAt: r.savedAt, updatedAt: r.updatedAt, summary: r.summary, deleted: !!r.deleted,
    prev: r.prev ? { rev: r.prev.rev, size: r.prev.data.length, savedAt: r.prev.savedAt, summary: r.prev.summary, deleted: !r.prev.data } : null } : null;
  S.fetch = async (path, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    S.calls.push({ path, method: init.method, keepalive: !!init.keepalive, size: init.body?.length ?? 0, replace: body?.replace });
    if (down) throw new TypeError("Failed to fetch");
    if (status) return res(status, { error: "x" });
    if (init.headers?.["x-gmm"] !== "1") return res(403, { error: "forbidden" });
    if (!S.logged) return res(401, { error: "login" });
    const r = S.row, now = ++S.clock;
    if (init.method === "GET" && path === "/my/api/island") return res(200, { nickname: "하나", slots: 1, saves: r ? [meta(r)] : [] });
    if (init.method === "GET" && path === "/my/api/island/0") {
      if (!r) return res(404, { error: "없음" });
      if (r.deleted) return res(404, { error: "지운 섬", deleted: true, rev: r.rev });
      return res(200, { ...meta(r), data: r.data });
    }
    if (path === "/my/api/island/0") {
      const rev = r ? r.rev : 0;
      if (body.baseRev !== rev) return res(409, { error: "conflict", server: meta(r) ?? { slot: 0, rev: 0, deleted: false, prev: null } });
      if (S.tooSoon > 0) { S.tooSoon--; return res(429, { error: "조금 뒤에", retryAfter: 1 }); }
      JSON.parse(gunzipSync(Buffer.from(body.data, "base64")).toString("utf8"));   // 서버도 풀어 봄
      const rotate = body.replace === true && r && !r.deleted;
      S.row = { rev: rev + 1, data: body.data, summary: body.summary, savedAt: body.savedAt, updatedAt: now, deleted: false, prev: rotate ? { ...r, prev: null } : r?.prev ?? null };
      return res(200, { ok: true, rev: rev + 1, savedAt: body.savedAt, updatedAt: now });
    }
    if (path === "/my/api/island/0/restore") {
      if (!r?.prev) return res(404, { error: "되돌릴 이전 섬이 없어요." });
      if (body.baseRev !== r.rev) return res(409, { error: "conflict", server: meta(r) });
      const p = r.prev; S.row = { ...p, rev: r.rev + 1, updatedAt: now, deleted: !p.data, prev: { ...r, prev: null } };
      return res(200, { ok: true, rev: r.rev + 1, updatedAt: now, deleted: !p.data });
    }
    if (path === "/my/api/island/0/delete") {
      if (!r || r.deleted) return res(404, { error: "없음" });
      S.row = { rev: r.rev + 1, data: "", summary: null, savedAt: 0, updatedAt: now, deleted: true, prev: { ...r, prev: null } };
      return res(200, { ok: true, rev: r.rev + 1, updatedAt: now });
    }
    return res(404, { error: "not found" });
  };
  /** 다른 기기가 올린 섬을 계정에 넣음 */
  S.put = (w, savedAt = 900_000) => { const j = w.serialize(savedAt); S.row = { rev: (S.row?.rev ?? 0) + 1, data: gzipSync(JSON.stringify(j)).toString("base64"), savedAt, updatedAt: savedAt,
    summary: JSON.stringify({ pop: w.units.length, vault: Math.floor(w.bank.vault), bld: w.buildings.size, day: 1, rank: 0, at: savedAt }), deleted: false, prev: S.row ? { ...S.row, prev: null } : null }; };
  S.json = () => JSON.parse(gunzipSync(Buffer.from(S.row.data, "base64")).toString("utf8"));
  return S;
}

const played = (seed = 5) => { const w = World.create(7, seededRandom(seed), { wild: true }); w.bank.vault = 1234; w.time = 5000; return w; };
const brandNew = () => World.create(7, seededRandom(11), { wild: true });

/** 기기 하나: 저장소 + 지금 섬 + CloudSaver */
function device(srv, w, { path = "/village3d/", now = () => 2_000_000, storage = mem(), search = "" } = {}) {
  const d = { world: w, storage, mounted: [], cookies: [], went: [], timers: [] };
  d.cloud = new CloudSaver({ fetch: srv.fetch, storage, saveKey: SAVE_KEY, gridW: GRID_W, getWorld: () => d.world,
    saveLocal: () => { storage.setItem(SAVE_KEY, JSON.stringify(d.world.serialize(now()))); d.cloud.touch(); },
    fromJSON: j => World.fromJSON(j), mountPulled: (nw, base) => { d.world = nw; d.mounted.push(base); },
    location: { protocol: "https:", pathname: path, search, href: `https://gmm.dpdns.org${path}${search}` },
    setCookie: c => d.cookies.push(c), go: u => d.went.push(u), now, setTimeout: (f, ms) => d.timers.push({ f, ms }), replaceUrl: u => { d.replaced = u; } });
  return d;
}
const flush = async d => { while (d.timers.length) await d.timers.shift().f(); };

test("gzip+base64는 node zlib과 서로 풀림", async () => {
  const b = await gzipB64("갈매미 섬 {\"a\":1}");
  assert.equal(gunzipSync(Buffer.from(b, "base64")).toString("utf8"), "갈매미 섬 {\"a\":1}");
  assert.equal(await gunzipB64(gzipSync("섬").toString("base64")), "섬");
});

test("계정 서버가 없는 곳은 요청 0번으로 끔(아티팩트·개발 서버 /island/) · 첫 GET 404·네트워크 실패도 한 번만 묻고 끔", async () => {
  const s0 = fakeServer(), a = device(s0, played(), { path: "/island/index.html" });
  await a.cloud.start(); assert.equal(a.cloud.mode, "off"); assert.equal(s0.calls.length, 0);
  const s1 = fakeServer({ status: 404 }), b = device(s1, played()); await b.cloud.start();
  assert.equal(b.cloud.mode, "off"); assert.equal(s1.calls.length, 1);
  const s2 = fakeServer({ down: true }), c = device(s2, played()); await c.cloud.start();
  assert.equal(c.cloud.mode, "off"); assert.equal(s2.calls.length, 1);
  for (const x of [b, c]) { x.cloud.tick(); x.cloud.onHide(); await x.cloud.push({ force: true }); }
  assert.equal(s1.calls.length + s2.calls.length, 2);                     // 꺼진 뒤 더 묻지 않음
  const s3 = fakeServer(), e = device(s3, played()); await e.cloud.start({}); assert.equal(e.cloud.mode, "ok");
  const noGzip = device(fakeServer(), played()); noGzip.cloud.o.CompressionStream = null; noGzip.cloud.o.DecompressionStream = undefined;
  const save = globalThis.CompressionStream; globalThis.CompressionStream = undefined;
  try { await noGzip.cloud.start(); } finally { globalThis.CompressionStream = save; }
  assert.equal(noGzip.cloud.mode, "off"); assert.match(noGzip.cloud.offWhy, /압축/);
});

test("로그인 안 함(401) → logout · [카카오로 로그인] = 이 기기 저장 → gmm_ir 쿠키 → /my/kakao", async () => {
  const s = fakeServer({ logged: false }), d = device(s, played());
  await d.cloud.start(); assert.equal(d.cloud.mode, "logout");
  d.cloud.tick(); d.cloud.onHide(); assert.equal(s.calls.length, 1);      // 로그인 전에는 더 보내지 않음
  d.cloud.login();
  assert.ok(d.storage.getItem(SAVE_KEY));
  assert.deepEqual(d.cookies, ["gmm_ir=v3d; Path=/my; Max-Age=300; SameSite=Lax; Secure"]); assert.deepEqual(d.went, ["/my/kakao"]);
});

test("?login=link: 문구 + /my에서 연결하기 · 주소에서 login 지움 · 돌아오면 다시 확인", async () => {
  const s = fakeServer({ logged: false }), d = device(s, played(), { search: "?login=link" });
  await d.cloud.start();
  assert.equal(d.cloud.notice.key, "link"); assert.equal(d.cloud.notice.open.href, "/my?kakao=link"); assert.equal(d.replaced, "/village3d/");
  s.logged = true; d.cloud.lastCheck = 0; d.cloud.onReturn(); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
  assert.equal(s.calls[1].path, "/my/api/island");
});

test("처음 로그인 · 계정에 섬 없음 → 바로 올림(rev 1) → 5분 전엔 안 올림 → 화면 떠날 때 keepalive", async () => {
  let t = 2_000_000; const s = fakeServer(), d = device(s, played(), { now: () => t });
  await d.cloud.start();
  assert.equal(d.cloud.mode, "ok"); assert.equal(s.row.rev, 1); assert.equal(d.cloud.meta.baseRev, 1); assert.equal(d.cloud.meta.dirty, false);
  assert.equal(s.json().bank.vault, 1234);
  d.cloud.touch(); t += 60_000; d.cloud.tick(); assert.equal(s.calls.length, 2);
  t += 20_000; await d.cloud.onHide();
  assert.equal(s.calls.at(-1).keepalive, true); assert.ok(s.calls.at(-1).size < 60_000); assert.equal(s.row.rev, 2);
  d.cloud.touch(); t += CLOUD_EVERY_MS; await d.cloud.tick(); assert.equal(s.row.rev, 3);
  assert.equal(JSON.parse(d.storage.getItem(CLOUD_META_KEY)).baseRev, 3);
});

test("화면 떠날 때 본문이 60KB 넘으면 keepalive를 끔", async () => {
  const s = fakeServer(), d = device(s, played());
  const big = await d.cloud.api("POST", "/my/api/island/0", { baseRev: 0, pad: "x".repeat(70_000) }, { keepalive: true });
  void big; assert.equal(s.calls.at(-1).keepalive, false);
});

test("새 기기의 손대지 않은 새 섬 → 묻지 않고 계정 섬 받기(.bak 남김) · 다녀온 사이 보상 한 번 → 바로 올림", async () => {
  const s = fakeServer(); s.put(played(), 1_000_000);
  const st = mem(); st.setItem(SAVE_KEY, "{\"old\":1}");
  const d = device(s, brandNew(), { storage: st, now: () => 1_000_000 + 3 * 3600_000 });
  await d.cloud.start();
  assert.equal(d.cloud.mode, "ok"); assert.equal(d.world.bank.vault, 1234); assert.equal(d.world.units.length, 0);
  assert.equal(st.getItem(SAVE_KEY + ".bak"), "{\"old\":1}");
  assert.deepEqual(d.mounted, [1_000_000]);                              // 3시간 다녀온 사이 보상 기준
  assert.equal(d.cloud.meta.grantedRev, 1);
  await flush(d); assert.equal(s.row.rev, 2);                             // 보상 준 섬을 바로 올림(lastOfflineGrant)
  assert.equal(s.json().lastOfflineGrant, 1_000_000 + 3 * 3600_000);
});

test("받은 계정 섬이 다른 지도 크기면 이 기기 섬을 덮어쓰지 않음", async () => {
  const s = fakeServer(), w = played(), j = w.serialize(1); j.grid = { ...j.grid, w: 10 };
  s.row = { rev: 1, data: gzipSync(JSON.stringify(j)).toString("base64"), summary: null, savedAt: 1, updatedAt: 1, deleted: false, prev: null };
  const st = mem(); st.setItem(SAVE_KEY, "mine"); const d = device(s, brandNew(), { storage: st });
  await d.cloud.start();
  assert.equal(d.cloud.mode, "error"); assert.match(d.cloud.err, /지도 크기/); assert.equal(st.getItem(SAVE_KEY), "mine"); assert.equal(d.mounted.length, 0);
});

test("충돌: 둘 다 바뀜 → 묻기 · 「이 기기 섬으로」 = replace:true → 덮인 계정 섬은 한 단계 되돌리기로", async () => {
  const s = fakeServer(), a = device(s, played(1)); await a.cloud.start();   // A: rev 1
  const other = played(2); other.bank.vault = 777; s.put(other);           // 다른 기기가 rev 2
  a.cloud.touch(); await a.cloud.check();
  assert.equal(a.cloud.mode, "conflict"); assert.equal(a.cloud.conflict.kind, "ask"); assert.equal(a.cloud.conflict.server.rev, 2);
  a.cloud.tick(); a.cloud.onHide(); assert.equal(s.row.rev, 2);           // 고르기 전엔 자동으로 올리지 않음
  assert.equal(await a.cloud.resolve("mine"), "done");
  assert.equal(s.calls.at(-1).replace, true); assert.equal(s.row.rev, 3); assert.equal(s.json().bank.vault, 1234);
  assert.equal(s.row.prev.rev, 2); assert.equal(a.cloud.canRestore(), true);
  assert.equal(await a.cloud.restore(), "done");                          // 한 단계 되돌리기 → 덮였던 섬(777)을 받음
  assert.equal(a.world.bank.vault, 777); assert.equal(s.row.rev, 4); assert.equal(a.cloud.meta.baseRev, 4);
});

test("충돌: 「계정 섬 받기」 → 이 기기 섬은 계정 prev에 남아 한 단계 되돌리기로 되찾음", async () => {
  const s = fakeServer(), a = device(s, played(1)); await a.cloud.start();
  const other = played(2); other.bank.vault = 555; s.put(other);
  a.cloud.touch(); await a.cloud.check(); assert.equal(a.cloud.mode, "conflict");
  assert.equal(await a.cloud.resolve("theirs"), "done");
  assert.equal(a.world.bank.vault, 555); assert.equal(s.row.prev.rev, 3);
  assert.equal(JSON.parse(gunzipSync(Buffer.from(s.row.prev.data, "base64"))).bank.vault, 1234);
  assert.equal(await a.cloud.restore(), "done"); assert.equal(a.world.bank.vault, 1234);
});

test("429는 기다렸다 같은 요청을 다시(3번까지) · 그 뒤엔 저장 멈춤", async () => {
  const s = fakeServer(), d = device(s, played()); s.tooSoon = 1;
  await d.cloud.start(); assert.equal(s.row, null); assert.equal(d.timers[0].ms, 1000);
  await flush(d); assert.equal(s.row.rev, 1); assert.equal(d.cloud.mode, "ok");
  s.tooSoon = 9; d.cloud.touch(); await d.cloud.push({ force: true }); await flush(d);
  assert.equal(d.cloud.mode, "error"); assert.equal(s.calls.filter(c => c.method === "POST").length, 1 + 1 + 4);
});

test("묘비: 새 기기 새 섬은 묻지 않고 멈춤(5분 뒤에도 안 올림) · 손댄 섬은 다시 올릴지 묻기 → 올리지 않기 / 다시 올리기", async () => {
  const s = fakeServer(); s.put(played()); s.row = { ...s.row, rev: 2, data: "", deleted: true, prev: { ...s.row } };
  let t = 2_000_000; const n = device(s, brandNew(), { now: () => t });
  await n.cloud.start(); assert.equal(n.cloud.mode, "paused"); assert.equal(n.cloud.conflict, null); assert.equal(n.cloud.meta.baseRev, 2);
  t += CLOUD_EVERY_MS * 2; n.cloud.tick(); n.cloud.onHide(); assert.equal(s.calls.length, 1);
  const a = device(s, played(3)); a.cloud.setMeta({ ...a.cloud.meta, baseRev: 1, dirty: true });
  await a.cloud.start(); assert.equal(a.cloud.mode, "conflict"); assert.equal(a.cloud.conflict.kind, "askDeleted");
  await a.cloud.resolve("skip"); assert.equal(a.cloud.mode, "paused"); assert.equal(a.cloud.meta.paused, true);
  assert.equal(await a.cloud.push({ force: true, resume: true }), "done"); assert.equal(s.row.deleted, false); assert.equal(s.row.rev, 3);
  assert.equal(s.row.prev.rev, 1);                                          // 묘비 위에 올려도 지운 섬은 prev에 그대로
});

test("[계정에서 섬 지우기] = 묘비 · 이 기기는 멈춤 · 한 단계 되돌리기로 되살림", async () => {
  const s = fakeServer(), d = device(s, played()); await d.cloud.start();
  assert.equal(await d.cloud.remove(), "done"); assert.equal(s.row.deleted, true); assert.equal(d.cloud.mode, "paused");
  assert.equal(await d.cloud.restore(), "done"); assert.equal(s.row.deleted, false); assert.equal(d.cloud.mode, "ok");
});

test("올리기 401 → 로그인 안 함 · 이 기기에서 새 섬을 만들면 다음 올리기는 replace:true", async () => {
  const s = fakeServer(), d = device(s, played()); await d.cloud.start();
  d.cloud.markReplace(); d.world = brandNew(); await d.cloud.push({ force: true });
  assert.equal(s.calls.at(-1).replace, true); assert.equal(s.row.prev.rev, 1); assert.equal(d.cloud.meta.replaceNext, undefined);
  s.logged = false; d.cloud.touch(); await d.cloud.push({ force: true }); assert.equal(d.cloud.mode, "logout");
});

test("탭 닫기: 저장할 때 미리 압축해 둔 본문을 화면 떠날 때 기다림 없이 보냄(같은 차례에 fetch) · 그 뒤 또 저장했으면 dirty 유지", async () => {
  let t = 2_000_000; const s = fakeServer(), d = device(s, played(), { now: () => t });
  await d.cloud.start(); assert.equal(s.row.rev, 1);
  d.world.bank.vault = 4000; d.cloud.touch(); await flush(d);              // 1분 저장 → prep(미리 압축)
  assert.ok(d.cloud.cache); const n = s.calls.length;
  t += 20_000; const p = d.cloud.onHide();
  assert.equal(s.calls.length, n + 1, "await 전에 fetch가 불려야 탭을 닫아도 요청이 나감");
  assert.equal(s.calls.at(-1).keepalive, true);
  assert.equal(await p, "done"); assert.equal(s.json().bank.vault, 4000); assert.equal(d.cloud.meta.dirty, false); assert.equal(d.cloud.cache, null);
  d.cloud.touch(); await flush(d); d.cloud.touch();                         // 미리 압축한 뒤 또 저장(prep은 아직 안 돎)
  t += 20_000; assert.equal(await d.cloud.onHide(), "done"); assert.equal(d.cloud.meta.dirty, true);   // 올린 본문이 마지막 저장이 아님 → 다음에 또 올림
});

test("충돌 「계정 섬 받기」 중 429 → 올리기만 다시 하지 않고 받기까지 다시(계정에 이 기기 섬만 남지 않게)", async () => {
  const s = fakeServer(), a = device(s, played(1)); await a.cloud.start();
  const other = played(2); other.bank.vault = 555; s.put(other);
  a.cloud.touch(); await a.cloud.check(); assert.equal(a.cloud.mode, "conflict");
  a.timers.length = 0; s.tooSoon = 1;
  assert.equal(await a.cloud.resolve("theirs"), "retry"); assert.equal(s.row.rev, 2);
  await flush(a);
  assert.equal(a.world.bank.vault, 555); assert.equal(a.cloud.mode, "ok");
  assert.equal(JSON.parse(gunzipSync(Buffer.from(s.row.prev.data, "base64"))).bank.vault, 1234);
});
