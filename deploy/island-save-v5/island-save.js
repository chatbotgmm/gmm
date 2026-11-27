// island-save 판: 3
// 갈매미맨 마을(섬, /village3d/) 계정 저장 — 초안 3판(2026-11-27). 운영 dist/src/defense-save.js와 같은 방식:
// 운영 Prisma 클라이언트에 모델이 없으므로 SQL로 직접 읽고 쓴다. 표는 계정을 지우면 함께 지워지게 ON DELETE CASCADE.
// 로그인은 기존 웹 로그인(쿠키 gmm_s, Path=/my)을 그대로 쓴다. 그래서 주소는 모두 /my/api/island 아래.
// 게임 계산은 브라우저에서 하므로 서버는 모양·크기만 확인하고 그대로 보관한다(조작 방지 장치는 아님).
// 1판 → 2판(비평 B3): force 없앰(server.rev를 baseRev로 다시 보냄) · 409를 429보다 먼저 · 409는 쓰기 간격에 안 셈 ·
//   직전 판 한 벌(prev*) 보관 + 되돌리기 주소 · 지우기는 묘비(rev+1, data 비움, 지운 판은 prev로) · 계정 삭제 뒤 섬 줄 지우기(onResponse) ·
//   모양 검사는 필수 필드만 · 카카오 콜백에서만 섬으로 돌려보냄(GET /my 훅 없앰)
// 2판 → 3판(확인 B2): prev는 충돌 덮어쓰기(replace:true)·지우기·되돌리기 때만 갈아 끼운다. 보통 순차 저장(5분 자동 올리기 등)은 prev를 그대로 둔다.
//   지금 칸이 묘비면 replace:true여도 prev(지운 섬)를 그대로 둔다(묘비 위에 다시 올려도 지운 섬을 되돌릴 수 있게).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { sessionPredatesReset } from './game-reset-session.js';

export const ISLAND_SAVE_VERSION = 3;             // apply.sh가 이 줄로 판을 읽는다(첫 줄 주석과 같게)
export const ISLAND_SLOTS = 1;                    // 슬롯 수(사용자 결정. 표는 여러 슬롯을 받을 수 있게 만듦)
export const ISLAND_B64_MAX = 262_144;            // 압축(gzip)+base64 저장 묶음 최대 256KB
export const ISLAND_RAW_MAX = 2 * 1024 * 1024;    // 풀었을 때 최대 2MB
export const ISLAND_SUMMARY_MAX = 600;            // 충돌 창에 보여 줄 요약(인구·금고·날짜 등) 최대 글자
export const ISLAND_BODY_LIMIT = 300_000;         // 요청 본문 한도(앱 기본 32KB보다 크게, 이 주소만)
export const WRITE_GAP_MS = 10_000;               // 같은 계정 "성공한" 저장 간격 최소 10초(메모리, 서버 재시작 시 비움)
export const RETURN_COOKIE = 'gmm_ir', RETURN_MAX_AGE = 300;   // 섬이 카카오 로그인 전에 남기는 표시(5분)

const CREATE = `CREATE TABLE IF NOT EXISTS "IslandSave" (
    "playerId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 0,
    "data" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "savedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "prevRev" INTEGER,
    "prevData" TEXT,
    "prevSize" INTEGER,
    "prevSummary" TEXT,
    "prevSavedAt" DATETIME,
    PRIMARY KEY ("playerId", "slot"),
    CONSTRAINT "IslandSave_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`;
// 1판 표가 이미 있으면(초안을 먼저 올린 경우) 빠진 칸만 더한다. 1판의 NOT NULL("data","savedAt")은 그대로 남으므로 묘비는 빈 글('')과 0으로 쓴다.
const ADD = [['deletedAt', 'DATETIME'], ['prevRev', 'INTEGER'], ['prevData', 'TEXT'], ['prevSize', 'INTEGER'], ['prevSummary', 'TEXT'], ['prevSavedAt', 'DATETIME']];
let ready = null;
export function islandReady(db) {
    ready ??= (async () => {
        await db.$executeRawUnsafe(CREATE);
        const have = new Set((await db.$queryRawUnsafe('PRAGMA table_info("IslandSave")')).map((c) => c.name));
        for (const [n, t] of ADD) if (!have.has(n)) await db.$executeRawUnsafe(`ALTER TABLE "IslandSave" ADD COLUMN "${n}" ${t}`);
    })().catch((e) => { ready = null; throw e; });
    return ready;
}
export function _resetReadyForTest() { ready = null; }

// ── 모양 확인(순수 함수, node로 시험) ── 필수 필드만 본다. 격자 모양 같은 세부는 클라이언트 fromJSON이 본다(B3-5).
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
export function checkIslandBody(b) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: '저장 모양이 맞지 않아요.' };
    const { data, baseRev, savedAt, summary, replace } = b;
    if (typeof data === 'string' && data.length > ISLAND_B64_MAX) return { error: '섬이 너무 커서 계정에 올릴 수 없어요.', code: 413 };
    if (typeof data !== 'string' || data.length < 20 || data.length % 4 !== 0 || !B64.test(data)) return { error: '저장 모양이 맞지 않아요.' };
    if (!Number.isInteger(baseRev) || baseRev < 0) return { error: '저장 번호가 맞지 않아요.' };
    if (!Number.isInteger(savedAt) || savedAt <= 0) return { error: '저장 시각이 맞지 않아요.' };
    if (summary !== undefined && summary !== null && (typeof summary !== 'string' || summary.length > ISLAND_SUMMARY_MAX)) return { error: '요약이 너무 길어요.' };
    let world;
    try {
        world = JSON.parse(gunzipSync(Buffer.from(data, 'base64'), { maxOutputLength: ISLAND_RAW_MAX }).toString('utf8'));
    } catch { return { error: '섬 저장을 읽을 수 없어요.' }; }
    const g = world?.grid;
    if (!world || typeof world !== 'object' || Array.isArray(world) || !Number.isInteger(world.version) || world.version < 1
        || !g || typeof g !== 'object' || !Number.isInteger(g.w) || !Number.isInteger(g.h) || g.w < 8 || g.h < 8 || g.w > 512 || g.h > 512)
        return { error: '섬 저장 모양이 아니에요.' };
    return { ok: { data, baseRev, savedAt, summary: summary ?? null, replace: replace === true } };   // replace: true일 때만(그 밖의 값은 false)
}

const ms = (v) => (v == null || v === '' ? null : v instanceof Date ? v.getTime() : Number(v) || null);
const meta = (r) => ({
    slot: Number(r.slot), rev: Number(r.rev), size: Number(r.size ?? 0), savedAt: ms(r.savedAt), updatedAt: ms(r.updatedAt), summary: r.summary ?? null,
    deleted: r.deletedAt != null,
    prev: r.prevRev == null ? null : { rev: Number(r.prevRev), size: Number(r.prevSize ?? 0), savedAt: ms(r.prevSavedAt), summary: r.prevSummary ?? null, deleted: !r.prevData },
});
const COLS = '"slot", "rev", "size", "summary", "savedAt", "updatedAt", "deletedAt", "prevRev", "prevSize", "prevSummary", "prevSavedAt", ("prevData" IS NOT NULL AND "prevData" <> \'\') AS "prevData"';
const SEL = `SELECT ${COLS} FROM "IslandSave" WHERE "playerId" = ?`;
const empty = (slot) => ({ slot, rev: 0, size: 0, savedAt: null, updatedAt: null, summary: null, deleted: false, prev: null });

export async function islandList(db, playerId) {
    await islandReady(db);
    return (await db.$queryRawUnsafe(`${SEL} ORDER BY "slot"`, playerId)).map(meta);
}
export async function islandLoad(db, playerId, slot) {
    await islandReady(db);
    const r = (await db.$queryRawUnsafe(`SELECT ${COLS}, "data" AS "d" FROM "IslandSave" WHERE "playerId" = ? AND "slot" = ?`, playerId, slot))[0];
    if (!r) return null;
    return r.deletedAt != null || !r.d ? { ...meta(r), data: null } : { ...meta(r), data: r.d };
}
// 지금 판을 prev로 옮기고 새 판을 쓰는 SQL(충돌 덮어쓰기·지우기·되돌리기). 묘비(data '')도 prev로 옮긴다(되돌리면 다시 묘비가 됨).
const INS = `INSERT INTO "IslandSave" ("playerId", "slot", "rev", "data", "size", "summary", "savedAt", "updatedAt", "deletedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT("playerId", "slot") DO UPDATE SET`;
const SET_NEW = `"rev" = excluded."rev", "data" = excluded."data", "size" = excluded."size", "summary" = excluded."summary", "savedAt" = excluded."savedAt", "updatedAt" = excluded."updatedAt", "deletedAt" = excluded."deletedAt"`;
const WRITE = `${INS}
      "prevRev" = "IslandSave"."rev", "prevData" = "IslandSave"."data", "prevSize" = "IslandSave"."size", "prevSummary" = "IslandSave"."summary", "prevSavedAt" = "IslandSave"."savedAt",
      ${SET_NEW}`;
// 보통 순차 저장: prev는 그대로(B2). 그래서 덮어쓴 뒤 그 기기가 계속 놀며 자동으로 올려도 덮이기 전 계정 섬이 prev에 남는다.
const WRITE_KEEP = `${INS}
      ${SET_NEW}`;

/** 낙관적 잠금: baseRev가 지금 rev와 같을 때만 받는다. 다르면 conflict(409). force는 없다:
 *  충돌 창에서 「이 기기 섬으로 덮어쓰기」를 고르면 409의 server.rev를 baseRev로, replace:true와 함께 다시 보낸다("내가 본 그 판을 덮어쓴다").
 *  replace:true이고 지금 칸이 묘비가 아니면 지금 판을 prev로 옮긴다(한 단계 되돌리기). 그 밖에는 prev를 그대로 둔다.
 *  gate(): 충돌이 아닐 때만 부르는 쓰기 간격 검사. 숫자(초)를 돌려주면 tooSoon(429)으로 끝낸다. 409는 간격에 안 센다. */
export async function islandStore(db, playerId, slot, body, gate = () => 0) {
    await islandReady(db);
    return db.$transaction(async (tx) => {
        const cur = (await tx.$queryRawUnsafe(`${SEL} AND "slot" = ?`, playerId, slot))[0];
        const rev = cur ? Number(cur.rev) : 0;
        if (body.baseRev !== rev) return { conflict: cur ? meta(cur) : empty(slot) };
        const wait = gate();
        if (wait > 0) return { tooSoon: wait };
        const next = rev + 1, now = Date.now();
        const rotate = body.replace === true && !!cur && cur.deletedAt == null;
        await tx.$executeRawUnsafe(rotate ? WRITE : WRITE_KEEP, playerId, slot, next, body.data, body.data.length, body.summary, body.savedAt, now, null);
        return { rev: next, savedAt: body.savedAt, updatedAt: now };
    });
}
/** 계정에서 섬만 지우기 = 묘비: rev+1, data 비움, 지우기 전 판은 prev로(한 번 되돌릴 수 있음).
 *  다른 기기가 예전 baseRev로 올리면 409(deleted:true)를 받고 "다시 올릴까요?"를 묻게 된다(B4-5). */
export async function islandTombstone(db, playerId, slot, baseRev) {
    await islandReady(db);
    return db.$transaction(async (tx) => {
        const cur = (await tx.$queryRawUnsafe(`${SEL} AND "slot" = ?`, playerId, slot))[0];
        if (!cur || cur.deletedAt != null) return { none: true };
        if (baseRev != null && baseRev !== Number(cur.rev)) return { conflict: meta(cur) };
        const next = Number(cur.rev) + 1, now = Date.now();
        await tx.$executeRawUnsafe(WRITE, playerId, slot, next, '', 0, null, 0, now, now);
        return { rev: next, updatedAt: now };
    });
}
/** 바로 전 계정 섬으로 되돌리기: 지금 판과 prev를 맞바꾸고 rev+1(되돌리기도 다시 되돌릴 수 있음). baseRev가 지금 rev와 같아야 한다. */
export async function islandRestorePrev(db, playerId, slot, baseRev) {
    await islandReady(db);
    return db.$transaction(async (tx) => {
        const cur = (await tx.$queryRawUnsafe('SELECT "rev", "prevRev", "prevData", "prevSize", "prevSummary", "prevSavedAt" FROM "IslandSave" WHERE "playerId" = ? AND "slot" = ?', playerId, slot))[0];
        if (!cur || cur.prevRev == null) return { none: true };
        if (baseRev !== Number(cur.rev)) return { conflict: (await tx.$queryRawUnsafe(`${SEL} AND "slot" = ?`, playerId, slot)).map(meta)[0] };
        const next = Number(cur.rev) + 1, now = Date.now(), wasTomb = !cur.prevData;
        await tx.$executeRawUnsafe(WRITE, playerId, slot, next, cur.prevData ?? '', Number(cur.prevSize ?? 0), cur.prevSummary ?? null, cur.prevSavedAt ?? 0, now, wasTomb ? now : null);
        return { rev: next, updatedAt: now, deleted: wasTomb };
    });
}
/** 계정 삭제 뒤 남은 줄 정리(외래키가 지워 주지만 혹시 꺼져 있을 때를 위해 — defenseForget과 같은 이유). 줄을 아예 지운다(묘비 아님). */
export async function islandForget(db, playerId) {
    await islandReady(db);
    await db.$executeRawUnsafe('DELETE FROM "IslandSave" WHERE "playerId" = ?', playerId);
}

// ── 주소 등록: app.js에서 registerMy 바로 다음에 registerIslandSave(app, { db, secret, gameResetSessionCutoff }) ──
// my.js의 preHandler(앱 전체에 걸림)가 먼저 돌아 심사 계정(rv_)은 403, 초기화 전 세션은 401로 이미 막는다.
// 여기서는 같은 서명 규칙(my.js와 같은 열쇠: HMAC(secret,'web-session'))으로 플레이어 id만 다시 꺼낸다.
const COOKIE = 'gmm_s';
const RETURN_TO = { v3d: '/village3d/' };          // 로그인 뒤 돌아갈 곳(정해진 값만)
const KAKAO_BACK = /^\/my(?:\?kakao=(cancel|fail|taken|link|linked))?$/;   // my.js의 back()/kakaoBack()이 웹 흐름에서 보내는 곳만
export function registerIslandSave(app, opt) {
    const key = createHmac('sha256', opt.secret).update('web-session').digest();
    const sign = (v) => createHmac('sha256', key).update(v).digest('base64url');
    const cookie = (req, name) => (req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
    const playerOf = async (req) => {
        const h = req.headers['x-gmm-s'];
        const raw = typeof h === 'string' && h.length < 200 ? h : cookie(req, COOKIE);
        if (!raw || raw.startsWith('rv_')) return null;
        const [id, exp, sig] = raw.split('.');
        if (!id || !exp || !sig) return null;
        const want = Buffer.from(sign(`${id}.${exp}`)), got = Buffer.from(sig);
        if (want.length !== got.length || !timingSafeEqual(want, got) || Number(exp) < Date.now() / 1000) return null;
        if (sessionPredatesReset(raw, opt.gameResetSessionCutoff ?? 0)) return null;
        const p = await opt.db.player.findUnique({ where: { id }, select: { identity: true, nickname: true } });
        return p && !p.identity.startsWith('review:') ? { id, nickname: p.nickname ?? null } : null;
    };
    const ipKey = (p) => (req) => { const ip = req.headers['cf-connecting-ip']; return typeof ip === 'string' && ip.length <= 45 ? `${p}:${ip}` : p; };
    const read = { config: { rateLimit: { max: 60, timeWindow: '1 minute', keyGenerator: ipKey('island-r') } } };
    const write = { bodyLimit: ISLAND_BODY_LIMIT, config: { rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: ipKey('island-w') } } };
    const small = { config: { rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: ipKey('island-w') } } };   // 지우기·되돌리기(본문 작음, 쓰기 제한)
    const guard = (req, reply) => { if (req.headers['x-gmm'] !== '1') { reply.code(403).send({ error: 'forbidden' }); return false; } return true; };
    const slotOf = (req) => { const s = Number(req.params.slot); return Number.isInteger(s) && s >= 0 && s < ISLAND_SLOTS ? s : null; };
    const lastWrite = new Map();
    const noStore = (reply) => reply.header('Cache-Control', 'no-store');
    const secure = (req) => /https/.test(String(req.headers['cf-visitor'] ?? req.headers['x-forwarded-proto'] ?? ''));
    const baseRevOf = (b) => (Number.isInteger(b?.baseRev) && b.baseRev >= 0 ? b.baseRev : null);

    // ① 카카오 로그인 뒤 섬으로 돌아오기(B3-7): GET /my 전체가 아니라 카카오 콜백 응답만 고친다.
    //    섬은 로그인 직전에 document.cookie로 gmm_ir=v3d(Path=/my, Max-Age=300)를 남긴다. 콜백이 웹 흐름으로 /my(?kakao=…)에 보낼 때만
    //    Location을 /village3d/?login=…로 바꾸고 표시를 지운다. 앱(gm:·native:·revised:) 흐름은 Location이 달라 건드리지 않는다.
    //    그래서 홈페이지에서 그냥 연 /my, /my?g=1, /my?next=duel 은 표시가 남아 있어도 섬으로 가지 않는다.
    const toIsland = new WeakSet();
    app.addHook('onRequest', async (req) => {
        if (req.method === 'GET' && req.url.split('?')[0] === '/my/kakao/callback' && RETURN_TO[cookie(req, RETURN_COOKIE) ?? '']) toIsland.add(req);
    });
    app.addHook('onSend', async (req, reply, payload) => {
        if (!toIsland.has(req)) return payload;
        const loc = reply.getHeader('location'), code = reply.statusCode;
        const m = typeof loc === 'string' && (code === 302 || code === 303) ? KAKAO_BACK.exec(loc) : null;
        if (!m) return payload;
        const to = RETURN_TO[cookie(req, RETURN_COOKIE)];
        reply.header('location', `${to}?login=${m[1] ?? 'ok'}`);
        reply.header('Set-Cookie', `${RETURN_COOKIE}=; Path=/my; Max-Age=0; SameSite=Lax${secure(req) ? '; Secure' : ''}`);
        return payload;
    });

    // ② 계정 삭제 뒤 섬 줄 지우기(B3-1): my.js를 고치지 않고 디펜스(defenseForget)와 같은 수준으로.
    const deleting = new WeakMap();
    app.addHook('onRequest', async (req) => {
        if (req.method !== 'POST' || req.url.split('?')[0] !== '/my/api/account/delete') return;
        try { const p = await playerOf(req); if (p) deleting.set(req, p.id); } catch { /* 여기서 실패해도 탈퇴 처리는 my.js가 그대로 함 */ }
    });
    app.addHook('onResponse', async (req, reply) => {
        const id = deleting.get(req);
        if (!id || reply.statusCode !== 200) return;
        lastWrite.delete(id);
        await islandForget(opt.db, id).catch((e) => req.log.warn({ err: e }, 'island save cleanup failed'));
    });

    // 목록(작은 정보만): 로그인 안 돼 있으면 401 → 섬은 이 브라우저에만 저장
    app.get('/my/api/island', read, async (req, reply) => {
        if (!guard(req, reply)) return;
        const p = await playerOf(req);
        if (!p) return noStore(reply).code(401).send({ error: 'login' });
        return noStore(reply).send({ nickname: p.nickname, slots: ISLAND_SLOTS, saves: await islandList(opt.db, p.id) });
    });
    app.get('/my/api/island/:slot', read, async (req, reply) => {
        if (!guard(req, reply)) return;
        const p = await playerOf(req), slot = slotOf(req);
        if (!p) return noStore(reply).code(401).send({ error: 'login' });
        if (slot == null) return noStore(reply).code(404).send({ error: '없는 칸이에요.' });
        const s = await islandLoad(opt.db, p.id, slot);
        if (!s) return noStore(reply).code(404).send({ error: '계정에 저장한 섬이 없어요.' });
        if (s.deleted) return noStore(reply).code(404).send({ error: '계정에서 지운 섬이에요.', deleted: true, rev: s.rev });
        return noStore(reply).send(s);
    });
    // 올리기: 순서 = 모양 → 충돌(409) → 쓰기 간격(429) → 저장. 성공한 저장만 간격에 센다(B3-2).
    app.post('/my/api/island/:slot', write, async (req, reply) => {
        if (!guard(req, reply)) return;
        const p = await playerOf(req), slot = slotOf(req);
        if (!p) return noStore(reply).code(401).send({ error: 'login' });
        if (slot == null) return noStore(reply).code(404).send({ error: '없는 칸이에요.' });
        const c = checkIslandBody(req.body);
        if (!c.ok) return noStore(reply).code(c.code ?? 400).send({ error: c.error });
        let now = 0;
        const gate = () => {
            now = Date.now();
            const prev = lastWrite.get(p.id) ?? 0;
            if (now - prev < WRITE_GAP_MS) return Math.ceil((WRITE_GAP_MS - (now - prev)) / 1000);
            lastWrite.set(p.id, now);   // 같은 트랜잭션 안에서 바로 적어 두어 동시에 온 두 번째 요청을 막는다
            return 0;
        };
        let r;
        try { r = await islandStore(opt.db, p.id, slot, c.ok, gate); }
        catch (e) { if (now && lastWrite.get(p.id) === now) lastWrite.delete(p.id); throw e; }   // 쓰기 실패면 간격 기록도 되돌림
        if (r.conflict) return noStore(reply).code(409).send({ error: 'conflict', server: r.conflict });
        if (r.tooSoon) return noStore(reply).code(429).header('Retry-After', String(r.tooSoon)).send({ error: '조금 뒤에 다시 올려요.', retryAfter: r.tooSoon });
        if (lastWrite.size > 5000) for (const [k, t] of lastWrite) if (now - t > WRITE_GAP_MS) lastWrite.delete(k);
        return noStore(reply).send({ ok: true, ...r });
    });
    // 계정에서 섬만 지우기(이 기기 저장은 그대로). 묘비를 남겨 다른 기기가 조용히 되살리지 못하게 한다.
    app.post('/my/api/island/:slot/delete', small, async (req, reply) => {
        if (!guard(req, reply)) return;
        const p = await playerOf(req), slot = slotOf(req);
        if (!p) return noStore(reply).code(401).send({ error: 'login' });
        if (slot == null) return noStore(reply).code(404).send({ error: '없는 칸이에요.' });
        if (req.body?.confirm !== '지우기') return noStore(reply).code(400).send({ error: '확인 칸에 「지우기」를 적어 주세요.' });
        const r = await islandTombstone(opt.db, p.id, slot, baseRevOf(req.body));
        if (r.none) return noStore(reply).code(404).send({ error: '계정에 저장한 섬이 없어요.' });
        if (r.conflict) return noStore(reply).code(409).send({ error: 'conflict', server: r.conflict });
        return noStore(reply).send({ ok: true, ...r });
    });
    // 바로 전 계정 섬으로 되돌리기(B3-4). [자세히 보기]에서만 부른다.
    app.post('/my/api/island/:slot/restore', small, async (req, reply) => {
        if (!guard(req, reply)) return;
        const p = await playerOf(req), slot = slotOf(req);
        if (!p) return noStore(reply).code(401).send({ error: 'login' });
        if (slot == null) return noStore(reply).code(404).send({ error: '없는 칸이에요.' });
        const base = baseRevOf(req.body);
        if (base == null) return noStore(reply).code(400).send({ error: '저장 번호가 맞지 않아요.' });
        const r = await islandRestorePrev(opt.db, p.id, slot, base);
        if (r.none) return noStore(reply).code(404).send({ error: '되돌릴 이전 섬이 없어요.' });
        if (r.conflict) return noStore(reply).code(409).send({ error: 'conflict', server: r.conflict });
        return noStore(reply).send({ ok: true, ...r });
    });
}
