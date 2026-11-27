// 섬 계정 저장 — 주고받기(fetch·gzip·타이머). 규칙은 cloudSync.js(순수), 화면은 ui/cloudView.js.
// DOM을 직접 만지지 않고 필요한 것(fetch·저장소·월드·쿠키·주소)은 모두 넘겨받는다 → node에서 가짜 서버로 흐름을 시험(tests/cloudclient.test.js).
// 서버(island-save.js 판 3): GET /my/api/island(목록) · GET /my/api/island/0 · POST /my/api/island/0 {baseRev, data, savedAt, summary, replace}
//   · POST …/0/restore {baseRev} · POST …/0/delete {confirm:"지우기", baseRev}. 머리글 x-gmm: 1, 쿠키 gmm_s(같은 출처).
// 켜는 곳: cloudWhere(location)(같은 출처 /village3d/)이고 CompressionStream이 있을 때. 첫 GET이 404·네트워크 실패면 끈다(그 뒤 요청 없음).
import { CLOUD_META_KEY, CLOUD_EVERY_MS, CLOUD_API, CLOUD_LOGIN, HIDE_GAP_MS, RETRY_MAX, ISLAND_B64_LIMIT, CLOUD_AWAY_MIN_MS, emptyMeta, metaFromSave, isPristine, decideSync, dueUpload, afterPush, overwriteRequest, afterTombstone, checkPulled, writeWithBackup, awayFor, afterGrant, withGrant, loginNotice, returnCookie, summaryOf, cloudWhere, keepaliveOk } from "./cloudSync.js";

/** gzip + base64(브라우저 CompressionStream). 없으면 null */
export async function gzipB64(text, CS = globalThis.CompressionStream) {
  if (typeof CS !== "function") return null;
  const buf = new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CS("gzip"))).arrayBuffer());
  let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
export async function gunzipB64(b64, DS = globalThis.DecompressionStream) {
  const bin = atob(b64), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Response(new Blob([buf]).stream().pipeThrough(new DS("gzip"))).text();
}

const OFF_WHERE = "계정 저장은 gmm.dpdns.org/village3d/에서만 돼요. 이 섬은 이 브라우저에만 저장돼요.";

export class CloudSaver {
  /** o: { fetch, storage, saveKey, gridW, getWorld, saveLocal, fromJSON, mountPulled(w, awayBase|null), location, setCookie(str), go(url),
   *       now, setTimeout, CompressionStream, DecompressionStream, replaceUrl(url) } */
  constructor(o) {
    this.o = o; this.now = o.now || (() => Date.now()); this.later = o.setTimeout || ((f, ms) => setTimeout(f, ms));
    this.mode = "checking"; this.offWhy = ""; this.err = ""; this.server = null; this.nickname = null; this.conflict = null;
    this.busy = false; this.lastTry = 0; this.lastCheck = 0; this.recheck = false; this.notice = null; this.requests = 0;
    this.seq = 0; this.cache = null; this.prepping = false; this.prepAgain = false;   // seq: 이 기기 저장 차례(touch마다 +1) · cache: 미리 압축한 본문(prep)
    this.meta = this.loadMeta(); this.listeners = [];
    if (!cloudWhere(o.location)) { this.mode = "off"; this.offWhy = OFF_WHERE; }   // 아티팩트·로컬: 모델을 다 받기 전에도 카드가 바로 꺼짐(요청 없음)
  }
  onChange(f) { this.listeners.push(f); }
  emit() { for (const f of this.listeners) { try { f(this); } catch (e) { console.warn("계정 카드 그리기 실패", e); } } }
  // ── 기기에 따로 두는 맞춤 정보(meta) ──
  loadMeta() {
    let j = null; try { j = JSON.parse(this.o.storage.getItem(CLOUD_META_KEY) || "null"); } catch { j = null; }
    const m = metaFromSave(j);
    if (j && Number.isFinite(j.grantAt)) m.grantAt = j.grantAt;
    if (j && j.replaceNext === true) m.replaceNext = true;
    return m;
  }
  saveMeta() { try { this.o.storage.setItem(CLOUD_META_KEY, JSON.stringify(this.meta)); } catch { /* 한도 초과 등: 다음에 다시 */ } }
  setMeta(m) { this.meta = m; this.saveMeta(); }
  /** 이 기기에 저장할 때마다(main.js saveNow): 계정과 맞춘 뒤 바뀜 */
  touch() { this.seq++; if (!this.meta.dirty) { this.meta = { ...this.meta, dirty: true }; this.saveMeta(); } this.prep(); }
  /** 탭을 닫을 때(pagehide)는 비동기 gzip이 끝나기 전에 페이지가 사라져 요청이 아예 안 나간다(검토: Playwright page.close에서 POST 0번).
   *  그래서 이 기기에 저장할 때마다(1분마다) 올릴 본문을 미리 압축해 두고(cache), 화면 떠날 때는 그것을 기다림 없이 바로 보낸다. */
  prep() {
    if ((this.mode !== "ok" && this.mode !== "error") || this.meta.paused) return;
    if (this.prepping) { this.prepAgain = true; return; }
    this.prepping = true;
    this.later(async () => {
      try { const e = await this.encode(); if (e && e.data.length <= ISLAND_B64_LIMIT && !(this.cache && this.cache.seq > e.seq)) this.cache = e; }
      catch { /* 다음 저장 때 다시 */ }
      finally { this.prepping = false; if (this.prepAgain) { this.prepAgain = false; this.prep(); } }
    }, 0);
  }
  /** 이 기기에서 새 섬을 만듦: 다음 올리기는 replace:true(덮이는 계정 섬을 prev로 남겨 한 단계 되돌릴 수 있게) */
  markReplace() { this.setMeta({ ...this.meta, dirty: true, replaceNext: true }); }
  setMode(m, extra = {}) { this.mode = m; Object.assign(this, extra); this.emit(); }
  off(why) { this.setMode("off", { offWhy: why, conflict: null }); }

  // ── 서버 요청 ── 반환 {status, body}. 네트워크 실패는 status 0
  async api(method, path, body, { keepalive = false } = {}) {
    this.requests++;
    const init = { method, credentials: "same-origin", cache: "no-store", headers: { "x-gmm": "1" } };
    if (body !== undefined) { init.headers["content-type"] = "application/json"; init.body = JSON.stringify(body); if (keepalive && keepaliveOk(init.body.length)) init.keepalive = true; }
    let r;
    try { r = await this.o.fetch(path, init); } catch { return { status: 0, body: null }; }
    let j = null; try { j = await r.json(); } catch { j = null; }
    return { status: r.status, body: j };
  }

  /** 시작: 켤 수 있는 곳인지 → ?login= 문구 → 목록 GET → decideSync */
  async start() {
    const loc = this.o.location;
    if (!cloudWhere(loc)) return this.off(OFF_WHERE);
    if (typeof (this.o.CompressionStream ?? globalThis.CompressionStream) !== "function" || typeof (this.o.DecompressionStream ?? globalThis.DecompressionStream) !== "function")
      return this.off("이 브라우저는 압축(CompressionStream)을 못 해서 계정 저장을 쓸 수 없어요. 크롬·사파리 최신판에서 열어 보세요.");
    this.notice = loginNotice(loc.search);
    if (this.notice) { try { const u = new URL(loc.href); u.searchParams.delete("login"); this.o.replaceUrl?.(u.pathname + u.search + u.hash); } catch { /* 주소 정리 실패는 무시 */ } }
    if (this.notice?.open?.recheckOnReturn) this.recheck = true;
    return this.check(true);
  }
  /** 목록을 다시 받아 맞춤. first: 처음이면 404·네트워크 실패·이상한 응답에서 끈다 */
  async check(first = false) {
    this.lastCheck = this.now();
    if (this.mode !== "off" && first) this.setMode("checking");
    const r = await this.api("GET", CLOUD_API);
    if (r.status === 401) return this.setMode("logout", { server: null, conflict: null });
    if (r.status !== 200 || !r.body || !Array.isArray(r.body.saves)) {
      if (first || r.status === 404) return this.off("이 주소에는 계정 서버가 없어요. 이 섬은 이 브라우저에만 저장돼요.");
      return this.setMode("error", { err: "계정을 확인하지 못했어요. 이 브라우저에는 저장돼요." });
    }
    this.nickname = r.body.nickname ?? null; this.server = r.body.saves.find(s => s.slot === 0) ?? null;
    return this.decide();
  }
  localState() {
    const j = this.o.getWorld().serialize(this.now());
    return { j, pristine: isPristine(j, this.meta) };
  }
  async decide() {
    const { pristine } = this.localState(), srv = this.server, act = decideSync({ pristine }, this.meta, srv);
    if (act === "none") {
      if (srv?.deleted && !this.meta.paused) this.setMeta(afterTombstone(this.meta, srv.rev));   // 손대지 않은 새 섬 + 묘비: 묻지 않고 멈춤(B3)
      return this.setMode(this.meta.paused ? "paused" : "ok", { conflict: null });
    }
    if (act === "push") { this.setMode("ok"); return this.push({ force: true }); }
    if (act === "pull") return this.pull({ auto: true });
    return this.setMode("conflict", { conflict: { kind: act, server: srv } });
  }

  // ── 올리기 ──
  async encode() {
    const w = this.o.getWorld(), now = this.now(), seq = this.seq;
    let j = w.serialize(now);
    if (Number.isFinite(this.meta.grantAt)) j = withGrant(j, this.meta.grantAt);
    const data = await gzipB64(JSON.stringify(j), this.o.CompressionStream ?? globalThis.CompressionStream);
    return data && { data, seq, savedAt: Number.isInteger(j.savedAt) ? j.savedAt : now, summary: summaryOf(w, now) };
  }
  /** opt: force(5분 안 기다림) · keepalive(화면 떠날 때) · req({baseRev, replace} 덮어쓰기) · tries(429 다시 보내기 횟수)
   *  · enc(미리 압축한 본문: 있으면 await 없이 같은 차례에 fetch → 탭 닫기에도 요청이 나감) · again(429 때 같은 요청 대신 부를 것) */
  async push(opt = {}) {
    if (this.busy || this.mode === "off" || this.mode === "logout" || this.mode === "checking") return null;
    if ((this.mode === "conflict" || this.meta.paused) && !opt.req && !opt.resume) return null;   // 고르기 전·멈춤에는 자동으로 올리지 않음
    this.busy = true; this.lastTry = this.now();
    try {
      if (opt.resume) this.setMeta({ ...this.meta, paused: false, dirty: true });
      const enc = opt.enc || await this.encode();
      if (!enc) { this.setMode("error", { err: "압축하지 못해 올리지 못했어요." }); return "later"; }
      if (enc.data.length > ISLAND_B64_LIMIT) { this.setMode("error", { err: "섬이 너무 커서 계정에 올릴 수 없어요(256KB 넘음)." }); return "later"; }
      const replace = opt.req ? opt.req.replace === true : this.meta.replaceNext === true;
      const body = { baseRev: opt.req ? opt.req.baseRev : this.meta.baseRev, data: enc.data, savedAt: enc.savedAt, summary: enc.summary };
      if (replace) body.replace = true;
      const before = this.server;
      const r = await this.api("POST", `${CLOUD_API}/0`, body, { keepalive: !!opt.keepalive });
      const res = afterPush(this.meta, r.status, r.body, this.now());
      if (res.next === "done") {
        const { replaceNext, ...m } = res.meta; void replaceNext;
        if (enc.seq !== this.seq) m.dirty = true;          // 올린 본문 뒤에 이 기기에서 또 저장함(미리 압축한 본문 등) → 다음에 또 올림
        if (this.cache && this.cache.seq <= enc.seq) this.cache = null;
        this.setMeta(m);
        const prev = replace && before && before.rev > 0 && !before.deleted ? { rev: before.rev, summary: before.summary, savedAt: before.savedAt, deleted: false } : before?.prev ?? null;
        this.server = { slot: 0, rev: r.body.rev, savedAt: enc.savedAt, updatedAt: r.body.updatedAt, summary: enc.summary, deleted: false, prev };
        this.setMode("ok", { conflict: null, err: "" });
      } else if (res.next === "ask" || res.next === "askDeleted") {
        this.server = res.conflict ?? this.server;
        this.setMode("conflict", { conflict: { kind: res.next, server: res.conflict } });
      } else if (res.next === "retry") {
        const tries = (opt.tries || 0) + 1;
        if (tries > RETRY_MAX) this.setMode("error", { err: "계정 서버가 바빠요. 조금 뒤에 다시 올려요." });
        else this.later(() => (opt.again ? opt.again(tries) : this.push({ ...opt, enc: null, force: true, tries })), res.wait * 1000);
      } else if (res.next === "login") this.setMode("logout", { conflict: null });
      else if (res.next === "off") this.off("이 주소에는 계정 서버가 없어요. 이 섬은 이 브라우저에만 저장돼요.");
      else this.setMode("error", { err: r.status === 0 ? "인터넷이 끊겨 계정에 올리지 못했어요. 이 브라우저에는 저장돼요." : (r.body?.error || `계정에 올리지 못했어요(${r.status}).`) });
      return res.next;
    } finally { this.busy = false; this.emit(); }
  }
  /** 5분마다(main.js가 30초마다 부름): 올릴 때가 됐고, 지난 시도도 5분 넘었으면 */
  tick() {
    if (this.mode !== "ok" && this.mode !== "error") return null;
    const now = this.now();
    if (now - this.lastTry >= CLOUD_EVERY_MS && dueUpload(this.meta, now)) return this.push();
    return null;
  }
  /** 화면을 떠날 때(visibilitychange hidden · pagehide): 바뀐 게 있으면 바로(15초 안에 또 보내지 않음). 본문이 60KB 넘으면 keepalive를 끔 */
  onHide() {
    if (this.mode !== "ok" && this.mode !== "error") return null;
    if (!this.meta.dirty || this.meta.paused || this.now() - this.lastTry < HIDE_GAP_MS) return null;
    const c = this.cache; this.cache = null;
    return this.push({ force: true, keepalive: true, enc: c });
  }
  /** 섬 탭으로 돌아옴: /my에서 연결·로그아웃하러 새 탭을 열었으면 계정을 다시 확인 */
  onReturn() { if (this.recheck && this.mode !== "off" && !this.busy && this.now() - this.lastCheck > 3000) { this.recheck = false; this.check(); } }
  wantRecheck() { this.recheck = true; }

  // ── 받기 ──
  /** 계정 섬을 이 기기에. auto: 시작 때 자동(손대지 않은 새 섬 등) */
  async pull({ auto = false } = {}) {
    if (this.busy) return null;
    this.busy = true;
    try {
      const r = await this.api("GET", `${CLOUD_API}/0`);
      if (r.status === 401) { this.setMode("logout"); return "login"; }
      if (r.status === 404 && r.body?.deleted) {
        this.setMeta(afterTombstone(this.meta, r.body.rev)); this.server = { ...(this.server || { slot: 0 }), rev: r.body.rev, deleted: true };
        this.setMode("paused", { conflict: null }); return "deleted";
      }
      if (r.status !== 200 || typeof r.body?.data !== "string") { this.setMode("error", { err: r.body?.error || "계정 섬을 받지 못했어요." }); return "later"; }
      let text, j;
      try { text = await gunzipB64(r.body.data, this.o.DecompressionStream ?? globalThis.DecompressionStream); j = JSON.parse(text); }
      catch { this.setMode("error", { err: "계정 섬을 읽을 수 없어요. 이 기기 섬은 그대로 둬요." }); return "bad"; }
      const c = checkPulled(j, this.o.gridW);
      if (!c.ok) { this.setMode("error", { err: c.why }); return "bad"; }
      let w; try { w = this.o.fromJSON(j); } catch { this.setMode("error", { err: "계정 섬을 열 수 없어요. 이 기기 섬은 그대로 둬요." }); return "bad"; }
      const wr = writeWithBackup(this.o.storage, this.o.saveKey, text);
      if (!wr.ok) { this.setMode("error", { err: "이 기기에 쓸 자리가 없어 계정 섬을 받지 못했어요." }); return "bad"; }
      const now = this.now(), srv = { slot: 0, rev: r.body.rev, savedAt: r.body.savedAt, updatedAt: r.body.updatedAt, summary: r.body.summary ?? null, deleted: false, prev: r.body.prev ?? null };
      const away = awayFor(j, srv, this.meta, now);
      const { replaceNext, ...m0 } = this.meta; void replaceNext;
      this.setMeta({ ...m0, baseRev: srv.rev, dirty: false, upAt: now, paused: false });
      this.server = srv; this.cache = null;
      const grant = away.away >= CLOUD_AWAY_MIN_MS;          // 10분 안이면 편지도 보상도 없음(applyAway가 null) → 다시 올릴 까닭 없음
      this.o.mountPulled(w, grant ? away.base : null, { auto, bak: wr.bak });
      if (grant) this.setMeta(afterGrant(this.meta, srv.rev, now));
      else this.setMeta({ ...this.meta, dirty: false });   // mountPulled 안의 저장(touch)은 받은 섬 그대로이므로 바뀜이 아님
      this.setMode("ok", { conflict: null, err: "" });
      if (grant) this.later(() => this.push({ force: true }), 0);   // 보상을 준 섬은 기다리지 않고 올림(lastOfflineGrant를 계정에 남겨 다른 기기가 또 주지 않게)
      return "done";
    } finally { this.busy = false; this.emit(); }
  }
  /** 충돌 창에서 고름. mine = 이 기기 섬으로 덮어쓰기(replace:true → 덮인 계정 섬은 prev) ·
   *  theirs = 계정 섬 받기(먼저 이 기기 섬을 replace로 올리고 되돌리기로 맞바꿔, 이 기기 섬이 prev에 남게 → 한 단계 되돌리기로 되찾음) ·
   *  skip(묘비: 올리지 않기) · later(나중에: 그대로 두고 자동 올리기 멈춤) */
  async resolve(choice, tries = 0) {
    const c = this.conflict; if (!c) return null;
    if (choice === "later") return this.setMode("conflict");
    if (choice === "skip") { this.setMeta(afterTombstone(this.meta, c.server.rev)); return this.setMode("paused", { conflict: null }); }
    if (choice === "mine") return this.push({ req: overwriteRequest(c.server), force: true });
    if (choice === "theirs") {
      if (c.server?.deleted) return null;
      const up = await this.push({ req: overwriteRequest(c.server), force: true, tries, again: n => this.resolve("theirs", n) });   // 429면 올리기만 다시 하지 않고 받기까지 다시(안 그러면 이 기기 섬만 계정에 남음)
      if (up === "done") {
        const r = await this.api("POST", `${CLOUD_API}/0/restore`, { baseRev: this.meta.baseRev });
        if (r.status !== 200 || r.body?.deleted) { this.setMode("error", { err: "계정 섬으로 바꾸지 못했어요. 이 기기 섬을 올려 두었어요." }); return "later"; }
      } else if (up !== null) return up;
      return this.pull();
    }
    return null;
  }
  /** [한 단계 되돌리기]: 계정의 지금 섬과 바로 전 섬을 맞바꾸고, 그 섬을 이 기기로 받음 */
  async restore() {
    if (this.busy || !this.server) return null;
    const r = await this.api("POST", `${CLOUD_API}/0/restore`, { baseRev: this.server.rev });
    if (r.status === 409) { this.server = r.body?.server ?? this.server; this.setMode("conflict", { conflict: { kind: this.server?.deleted ? "askDeleted" : "ask", server: this.server } }); return "ask"; }
    if (r.status === 401) { this.setMode("logout"); return "login"; }
    if (r.status === 404) { this.setMode(this.mode, { err: "" }); return "none"; }
    if (r.status !== 200) { this.setMode("error", { err: r.body?.error || "되돌리지 못했어요." }); return "later"; }
    if (r.body.deleted) {                              // 되돌린 판이 묘비(지우기 전으로 다시 지움)
      this.setMeta(afterTombstone(this.meta, r.body.rev)); this.server = { ...this.server, rev: r.body.rev, deleted: true };
      this.setMode("paused"); return "deleted";
    }
    return this.pull();
  }
  /** [계정에서 섬 지우기](자세히 보기 안): 묘비. 이 기기 섬은 그대로 두고 자동 올리기를 멈춤 */
  async remove() {
    if (this.busy || !this.server || this.server.deleted) return null;
    const r = await this.api("POST", `${CLOUD_API}/0/delete`, { confirm: "지우기", baseRev: this.server.rev });
    if (r.status === 409) { this.server = r.body?.server ?? this.server; this.setMode("conflict", { conflict: { kind: "ask", server: this.server } }); return "ask"; }
    if (r.status !== 200) { this.setMode("error", { err: r.body?.error || "지우지 못했어요." }); return "later"; }
    const old = this.server;
    this.server = { slot: 0, rev: r.body.rev, deleted: true, summary: null, savedAt: null, updatedAt: r.body.updatedAt, prev: { rev: old.rev, summary: old.summary, savedAt: old.savedAt, deleted: false } };
    this.setMeta(afterTombstone(this.meta, r.body.rev)); this.setMode("paused"); return "done";
  }
  /** [카카오로 로그인]: 먼저 이 기기에 저장 → 돌아올 곳 표시 쿠키(gmm_ir=v3d, 5분) → /my/kakao */
  login() {
    try { this.o.saveLocal(); } catch { /* 저장 실패해도 로그인은 진행 */ }
    this.o.setCookie(returnCookie(this.o.location.protocol === "https:"));
    this.o.go(CLOUD_LOGIN);
  }
  /** 바로 전 계정 섬이 있나(한 단계 되돌리기 단추) */
  canRestore() { return !!this.server?.prev && (this.mode === "ok" || this.mode === "paused" || this.mode === "error"); }
}
