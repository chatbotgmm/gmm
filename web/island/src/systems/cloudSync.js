// 섬 계정 저장: 이 기기(localStorage)와 계정(서버)을 맞추는 규칙 — 초안 3판(scratchpad cloudsave_draft5/cloudSync.js와 같은 규칙)을 게임에 넣음.
// 순수 함수(DOM·fetch 없음) → node로 시험(tests/cloudsync.test.js). 실제 주고받기는 cloudClient.js, 화면은 ui/cloudView.js.
// meta(기기에 따로 저장, 키 galmaemiman-island-cloud):
//   { baseRev: 마지막으로 서버와 맞춘 rev, dirty: 그 뒤 이 기기에서 바뀜, upAt: 마지막으로 올린 시각,
//     paused: 계정에서 섬을 지운 뒤 다시 올리지 않기로 함, grantedRev: 이 기기가 다녀온 사이 보상을 이미 준 계정 판 }
// 2판(비평 B3-6·B3-8·B4-2·B4-3·B4-4·B4-5): 손대지 않은 새 섬이면 자동 pull · 받은 섬 검사 실패 시 덮어쓰지 않음 ·
//   .bak 따로 try · 다녀온 사이 보상 중복 막기(lastOfflineGrant) · 지운 섬(묘비) 되살림 막기 · ?login= 불신
// 3판(확인 C1·B3·B2·C2·B4): 새 섬 판정에 시간·수집·도장·밭 조건 · 손대지 않은 섬 + 묘비 = none · 덮어쓰기는 replace:true ·
//   writeWithBackup 반환값 바로잡음 · login=link 때 「/my에서 연결하기」 신호(새 탭 + 돌아오면 다시 확인)
export const CLOUD_META_KEY = "galmaemiman-island-cloud";
export const CLOUD_EVERY_MS = 5 * 60_000;          // 자동으로 올리는 간격 5분(기기 저장은 지금처럼 1분)
export const RETURN_COOKIE = "gmm_ir", RETURN_MAX_AGE = 300;   // 서버 island-save.js와 같은 값(5분)
export const CLOCK_SKEW_MS = 24 * 3600_000;        // 기기 시계와 서버 시각이 하루 넘게 다르면 서버 시각을 믿음

export function emptyMeta() { return { baseRev: 0, dirty: true, upAt: 0, paused: false, grantedRev: 0 }; }
export function metaFromSave(j) {
  const m = emptyMeta(); if (!j || typeof j !== "object") return m;
  if (Number.isInteger(j.baseRev) && j.baseRev >= 0) m.baseRev = j.baseRev;
  m.dirty = j.dirty !== false; m.upAt = Number.isFinite(j.upAt) ? j.upAt : 0;
  m.paused = j.paused === true; m.grantedRev = Number.isInteger(j.grantedRev) && j.grantedRev >= 0 ? j.grantedRev : 0;
  return m;
}

/** 손대지 않은 새 섬인가(B4-4, 3판 C1). main.js는 저장이 없으면 바로 World.create로 새 섬을 만들고 1분 안에 저장하므로,
 *  "이 기기 섬 없음"은 거의 오지 않는다. 그래서 새 섬 그대로면 묻지 않고 계정 섬을 받는다.
 *  j: world.serialize() 결과. 기준(섬 HEAD 6166122 World.serialize 필드): 새 넓은 섬 = 은행 + 다 지은 작은 집 1채, 갈매미 0, 금고 VAULT_START(300),
 *  time 0, collection·items·treasures·fishRecord·donated {}, stamps 0, plots [], dug [].
 *  금고를 쓰는 일(짓기·꾸미기·소환 등)은 금고에, 파기·메우기(무료)는 dug에, 반짝이 줍기는 items에, 낚시는 collection·fishRecord에,
 *  보물·기증은 treasures·donated에, 매일 할 일은 stamps에 남는다. 그래도 놓친 무료 진행이 있을 수 있어 첫 마을 하루(600초) 안일 때만 새 섬으로 본다.
 *  한 번이라도 계정과 맞췄으면(baseRev>0) 새 섬이 아니다. 예전 저장에 없는 칸(undefined)은 빈 것으로 본다. */
export const PRISTINE_MAX_TIME = 600;              // 마을 하루(farming.js DAY_SECS = 600)
const PRISTINE_EMPTY = ["collection", "items", "treasures", "fishRecord", "donated"];
const isEmptyBag = (v) => v == null || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
export function isPristine(j, meta, vaultStart = 300) {
  if (!j || typeof j !== "object" || (meta && meta.baseRev > 0)) return false;
  const units = Array.isArray(j.units) ? j.units.length : 1, blds = Array.isArray(j.buildings) ? j.buildings : null;
  if (units !== 0 || !blds || blds.length > 2 || blds.some(b => b.defId !== "bank" && b.defId !== "house")) return false;
  if (Array.isArray(j.dug) && j.dug.length > 0) return false;
  const t = j.time == null ? 0 : Number(j.time);
  if (!Number.isFinite(t) || t >= PRISTINE_MAX_TIME) return false;
  if (!PRISTINE_EMPTY.every(k => isEmptyBag(j[k]))) return false;
  if ((Number(j.stamps) || 0) !== 0) return false;
  if (j.plots != null && (!Array.isArray(j.plots) || j.plots.length > 0)) return false;
  return Math.floor(j.bank?.vault ?? -1) >= vaultStart;
}

/** 로그인 뒤 처음 맞출 때 무엇을 할지.
 *  local: null/false(이 기기 섬 없음) · true · 또는 { pristine: bool }
 *  meta: 위 · server: 서버 칸 정보({rev, deleted, savedAt, summary} 또는 null)
 *  반환: "none" · "push"(이 기기 → 계정) · "pull"(계정 → 이 기기) · "ask"(둘 다 바뀜) · "askDeleted"(다른 기기에서 계정 섬을 지움: 다시 올릴지 묻기)
 *  손대지 않은 새 섬 + 묘비(B3)는 묻지 않고 "none": 부르는 쪽은 meta = afterTombstone(meta, server.rev)로 멈춰 둔다
 *  (안 그러면 5분 뒤 자동 올리기가 409 deleted를 받고 결국 같은 질문을 띄운다). "ask"에서 「이 기기 섬으로」를 고르면 overwriteRequest(server)를 쓴다. */
export function decideSync(local, meta, server) {
  const srev = server ? server.rev : 0, deleted = !!server?.deleted;
  if (!local) return srev > 0 && !deleted ? "pull" : "none";
  if (deleted) {                                   // 묘비(B4-5): 예전 baseRev로 조용히 다시 만들지 않는다
    if (typeof local === "object" && local.pristine) return "none";   // 새 기기의 빈 섬으로 "다시 올릴까요?"를 묻지 않는다(B3)
    if (meta.baseRev === srev) return meta.paused ? "none" : (meta.dirty ? "push" : "none");
    return "askDeleted";
  }
  if (srev === 0) return meta.paused ? "none" : "push";   // 계정에 아직 없음
  if (typeof local === "object" && local.pristine && srev !== meta.baseRev) return "pull";   // 손대지 않은 새 섬 → 계정 섬 받기
  if (srev === meta.baseRev) return meta.dirty && !meta.paused ? "push" : "none";
  if (!meta.dirty && srev > meta.baseRev) return "pull";  // 이 기기는 그대로, 다른 기기가 올림
  return "ask";                                    // 이 기기도 바뀌고 계정도 바뀜(또는 처음 로그인한 기기에 다른 섬)
}
/** 자동으로 올릴 때인가 */
export function dueUpload(meta, now, force = false) { return meta.dirty && !meta.paused && (force || now - meta.upAt >= CLOUD_EVERY_MS); }

/** 올리기 응답 처리(B3-2·B3-3). force는 없다.
 *  반환: {meta, next}  next = "done" | "ask"(409: 창을 띄움, conflict에 server) | "askDeleted" | "retry"(429: wait 초 뒤 같은 요청 다시) | "login"(401) | "off"(404: 패치 전 서버) | "later"(그 밖) */
export function afterPush(meta, status, body, now) {
  if (status === 200 && body?.ok) return { meta: { ...meta, baseRev: body.rev, dirty: false, upAt: now, paused: false }, next: "done" };
  if (status === 409) return { meta, next: body?.server?.deleted ? "askDeleted" : "ask", conflict: body?.server ?? null };
  if (status === 429) return { meta, next: "retry", wait: Math.max(1, Math.min(60, Number(body?.retryAfter) || 10)) };
  if (status === 401) return { meta, next: "login" };
  if (status === 404) return { meta, next: "off" };
  return { meta, next: "later" };
}
/** 충돌 창에서 「이 기기 섬으로 덮어쓰기」: 409로 받은 server.rev를 baseRev로 보낸다("내가 본 그 판을 덮어쓴다").
 *  그사이 또 바뀌었으면 서버가 다시 409를 주고 창을 새로 띄운다. */
export function overwriteBaseRev(conflictServer) { return Number.isInteger(conflictServer?.rev) && conflictServer.rev >= 0 ? conflictServer.rev : null; }
/** 덮어쓰기 요청에 붙일 칸(3판 B2): {baseRev: server.rev, replace: true}. replace:true일 때만 서버가 덮이는 계정 섬을 prev로 옮겨
 *  「바로 전 계정 섬으로 되돌리기」가 된다. 보통 자동 올리기에는 붙이지 않는다(prev를 지키려고). 429로 다시 보낼 때도 같은 칸을 그대로 쓴다. */
export function overwriteRequest(conflictServer) { const b = overwriteBaseRev(conflictServer); return b == null ? null : { baseRev: b, replace: true }; }
/** 계정에서 섬을 지운 뒤(이 기기에서든, 다른 기기 묘비를 보고 "올리지 않기"를 골랐든): 그 rev를 보고 멈춤 */
export function afterTombstone(meta, rev) { return { ...meta, baseRev: rev, paused: true, dirty: true }; }

/** 넓은 섬 저장 판 3(오픈월드: 씨앗 + 시작 섬 기준 + 바뀐 칸, world/saveDelta.js)의 격자 칸이 읽을 만한가.
 *  생성 판(genV)이 이 게임보다 새것이면 못 읽음(바깥 섬 모양이 달라 델타가 틀어짐). 없으면 1 */
export const GEN_V_MAX = 1;
export function gridV3Ok(g) {
  if (!g || g.kind !== "chunks" || !Array.isArray(g.box) || g.box.length !== 4 || typeof g.base !== "string" || typeof g.delta !== "string") return false;
  const v = g.genV ?? 1; return Number.isInteger(v) && v >= 1 && v <= GEN_V_MAX;
}
/** 받은 섬 검사(B3-6). 실패하면 이 기기 섬을 덮어쓰지 않는다(덮어쓰면 loadSaved가 새 섬을 만들고 → dirty → 계정 섬까지 덮일 수 있음).
 *  j: 계정에서 받아 푼 JSON. 성공이면 {ok:true}, 실패면 {ok:false, why}. 호출하는 쪽은 이어서 World.fromJSON도 try로 돌려 본다. */
export function checkPulled(j, gridW) {
  if (!j || typeof j !== "object" || Array.isArray(j)) return { ok: false, why: "계정 섬을 읽을 수 없어요." };
  if (![1, 2, 3].includes(j.version)) return { ok: false, why: "계정 섬이 다른 버전이라 열 수 없어요. 게임을 새로 고침해 보세요." };
  if (j.version === 3 ? !gridV3Ok(j.grid) : j.grid?.w !== gridW) return { ok: false, why: "계정 섬은 지도 크기가 다른 예전 섬이라 열 수 없어요. 이 기기 섬은 그대로 둬요." };
  if (!j.wild) return { ok: false, why: "계정 섬은 작은 예전 섬이라 열 수 없어요. 이 기기 섬은 그대로 둬요." };
  if (!Array.isArray(j.buildings) || !Array.isArray(j.units)) return { ok: false, why: "계정 섬 저장이 망가져 열 수 없어요." };
  return { ok: true };
}

/** 받은 섬을 이 기기에 쓰기(B4-2): .bak은 따로 try. .bak이 실패해도(한도 초과 등) 본 저장은 시도하고,
 *  본 저장이 실패하면 예전 섬은 그대로 남는다(setItem 실패는 기존 값을 지우지 않음).
 *  storage: localStorage 같은 것. 반환 {ok, bak} */
export function writeWithBackup(storage, key, text) {
  let old = null, bak = false;
  try { old = storage.getItem(key); } catch { /* 읽기 실패: 백업 없이 진행 */ }
  if (old != null) { try { storage.setItem(key + ".bak", old); bak = true; } catch { bak = false; } }
  try { storage.setItem(key, text); return { ok: true, bak }; }
  catch (e) {
    if (bak) {                                     // 한도 때문이면 방금 만든 .bak을 지우고 한 번 더(예전 섬은 key에 그대로 있음)
      let removed = false;
      try { storage.removeItem(key + ".bak"); removed = true; storage.setItem(key, text); return { ok: true, bak: false }; }
      catch { if (removed) bak = false; }          // 3판 C2: .bak을 지운 뒤 실패했으면 bak:false(예전엔 true로 잘못 돌려줌)
    }
    return { ok: false, bak, error: String(e?.name || e) };
  }
}

/** 다녀온 사이 보상 중복 막기(B4-3).
 *  계정 섬 JSON 맨 위에 lastOfflineGrant(보상을 어디까지 줬는지, 밀리초)를 둔다. 받은 섬의 보상 기준 = max(savedAt, lastOfflineGrant).
 *  기기 시계가 서버와 하루 넘게 다르면 서버 updatedAt을 기준으로 쓴다. 같은 계정 판(rev)으로는 한 기기에서 두 번 주지 않는다(grantedRev).
 *  반환: {away: 쳐 줄 밀리초(0 이상), base} */
export function awayFor(j, server, meta, now) {
  if (server && Number.isInteger(server.rev) && meta && meta.grantedRev === server.rev) return { away: 0, base: now };
  let base = Math.max(Number(j?.savedAt) || 0, Number(j?.lastOfflineGrant) || 0);
  const up = Number(server?.updatedAt) || 0;
  if (up && Math.abs(base - up) > CLOCK_SKEW_MS) base = up;   // 올린 기기 시계가 크게 틀림
  if (!base || base > now) return { away: 0, base: now };
  return { away: now - base, base };
}
/** 보상을 준 뒤: 올릴 섬에 lastOfflineGrant=now를 적고, 이 판은 다시 주지 않게 grantedRev를 적고, 바로 올린다(dirty, 기다리지 않음).
 *  다른 기기가 이 사이(올리기 전 몇 초)에 같은 판을 받으면 한 번 더 받을 수 있다 — 혼자 하는 게임이라 남겨 둔 작은 틈. */
export function afterGrant(meta, serverRev, now) { return { ...meta, grantedRev: serverRev ?? meta.grantedRev, dirty: true, upAt: 0, grantAt: now }; }
export function withGrant(j, now) { return { ...j, lastOfflineGrant: Math.max(Number(j?.lastOfflineGrant) || 0, now) }; }

/** ?login= 는 믿지 않는다(B3-8): 누구나 /village3d/?login=ok 링크를 만들 수 있다.
 *  정해진 값이면 상태 문구(글자)만 고르고, 로그인 여부는 늘 GET /my/api/island(200/401)로 판단한다.
 *  화면에는 textContent로만 넣는다(innerHTML 금지). 알 수 없는 값은 null. */
const LOGIN_TEXT = {
  ok: { text: "카카오 로그인을 마쳤어요. 계정을 확인하는 중…", code: false },
  cancel: { text: "카카오 로그인을 취소했어요.", code: false },
  fail: { text: "카카오 로그인에 실패했어요. 다시 해 보세요.", code: false },
  taken: { text: "이 카카오 계정은 이미 다른 계정에 연결돼 있어요.", code: false },
  link: { text: "처음 쓰는 카카오 계정이에요. 10분 안에 카톡 코드로 한 번 로그인하면 연결돼요.", code: true, open: null },
  linked: { text: "카카오 계정을 연결했어요.", code: false },
};
/** login=link(3판 B4): 섬 화면에 「/my에서 연결하기」 버튼을 보여 줄 신호. 운영 /my(my.html)는 ?kakao=link를 /login?next=/game60&kakao=link로 보내고,
 *  /login의 next는 /game·/game60·/account·/defense만 받으므로(site.js NEXT) 연결을 마치면 섬이 아니라 /game60으로 간다.
 *  그래서 새 탭으로 열고(섬 탭은 그대로), 섬 탭에 돌아오면(visibilitychange·focus) GET /my/api/island를 다시 불러 로그인을 확인한다.
 *  gmm_kp(처음 카카오 표시)는 10분·Path=/my라 새 탭에서도 쓰인다. */
export const LINK_OPEN = Object.freeze({ href: "/my?kakao=link", label: "/my에서 연결하기", newTab: true, recheckOnReturn: true,
  after: "연결을 마쳤으면 이 탭으로 돌아오세요. 계정을 다시 확인해요." });
export function loginNotice(search) {
  let v = null; try { v = new URLSearchParams(String(search ?? "")).get("login"); } catch { return null; }
  if (!v || !Object.prototype.hasOwnProperty.call(LOGIN_TEXT, v)) return null;
  const n = { key: v, ...LOGIN_TEXT[v] };
  if (v === "link") n.open = LINK_OPEN;
  return n;
}
/** 카카오 로그인 직전에 남기는 표시 쿠키(서버는 콜백 응답에서만 본다) */
export function returnCookie(secure = true) { return `${RETURN_COOKIE}=v3d; Path=/my; Max-Age=${RETURN_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`; }

/** 충돌 창에 보여 줄 요약(서버에도 이 글을 그대로 보관, 600자 안) */
export function summaryOf(w, now = Date.now()) {
  const s = { pop: w.units?.length ?? 0, vault: Math.floor(w.bank?.vault ?? 0), bld: w.buildings?.size ?? 0, day: Math.floor((w.time ?? 0) / 600) + 1, rank: w.rank ?? 0, at: now };
  return JSON.stringify(s);
}

// ── 게임 연결에 쓰는 순수 부분(2026-11-27, 섬 클라이언트) ──
/** 계정 서버가 있는 곳: 계정 서버와 같은 출처의 /village3d/ 아래(gmm.dpdns.org/village3d/)에서만 켠다.
 *  claude.ai 아티팩트·로컬 파일·다른 경로(개발 서버 /island/)에서는 요청을 한 번도 보내지 않고 끈다(콘솔 오류·네트워크 폭주 없음). */
export const CLOUD_PATH = "/village3d/";
export function cloudWhere(loc) {
  if (!loc || !/^https?:$/.test(String(loc.protocol))) return false;
  const p = String(loc.pathname || "");
  return p === "/village3d" || p.startsWith(CLOUD_PATH);
}
export const CLOUD_API = "/my/api/island", CLOUD_LOGIN = "/my/kakao", CLOUD_MY = "/my";
export const ISLAND_B64_LIMIT = 262_144;            // 서버 island-save.js ISLAND_B64_MAX와 같은 값(압축+base64 256KB)
export const CLOUD_AWAY_MIN_MS = 10 * 60_000;             // 다녀온 사이 편지를 주는 최소 시간(main.js welcomeBack · World.applyAway와 같은 10분)
export const KEEPALIVE_MAX = 60_000;               // fetch keepalive 본문 한도(브라우저 64KB)보다 조금 작게: 넘으면 keepalive를 끔
export const HIDE_GAP_MS = 15_000;                 // 화면을 떠날 때 올리기 최소 간격(서버 쓰기 간격 10초 → 429를 피함)
export const RETRY_MAX = 3;                        // 429(조금 뒤에) 다시 보내기 최대 횟수
export function keepaliveOk(bodyChars) { return Number(bodyChars) > 0 && Number(bodyChars) < KEEPALIVE_MAX; }
/** "방금" · "3분 전" · "2시간 전" · "5일 전" */
export function agoText(at, now = Date.now()) {
  const d = Math.max(0, Number(now) - Number(at));
  if (!Number.isFinite(d) || !at) return "";
  if (d < 60_000) return "방금";
  if (d < 3600_000) return `${Math.floor(d / 60_000)}분 전`;
  if (d < 86400_000) return `${Math.floor(d / 3600_000)}시간 전`;
  return `${Math.floor(d / 86400_000)}일 전`;
}
/** 서버에 보관한 요약 글(summaryOf) 읽기. 모양이 이상하면 null(화면에는 "알 수 없음") */
export function readSummary(text) {
  let s = null; try { s = typeof text === "string" ? JSON.parse(text) : text; } catch { return null; }
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  const n = v => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : null);
  return { pop: n(s.pop), bld: n(s.bld), vault: n(s.vault), day: n(s.day), at: n(s.at) };
}
/** 충돌 창 섬 카드의 줄: [이름, 값]. 시각은 "11/27 14:05 · 3분 전" */
export function summaryRows(s, now = Date.now()) {
  const v = (x, unit) => (x == null ? "알 수 없음" : `${x.toLocaleString("ko-KR")}${unit}`);
  let when = "알 수 없음";
  if (s?.at) { const d = new Date(s.at), p = x => String(x).padStart(2, "0"); when = `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())} · ${agoText(s.at, now)}`; }
  return [["🐦 갈매미", v(s?.pop, "마리")], ["🏠 건물", v(s?.bld, "채")], ["🏦 금고", v(s?.vault, "")], ["🕒 마지막 저장", when]];
}
/** 계정 카드 맨 위 상태 한 줄(크게) + 작은 줄 + 색 상태.
 *  st: {mode: off|checking|logout|ok|paused|error|conflict, meta, server, offWhy, err, nickname}
 *  반환 {big, line, tone(ok|warn|empty|null), icon} */
export function cloudStatus(st, now = Date.now()) {
  const m = st?.mode, meta = st?.meta || emptyMeta(), who = st?.nickname ? `카카오 계정 · ${st.nickname}` : "카카오 계정";
  if (m === "off") return { icon: "☁️", big: "이 주소에서는 계정 저장을 쓸 수 없어요", line: st.offWhy || "이 섬은 이 브라우저에만 저장돼요.", tone: null };
  if (m === "checking") return { icon: "☁️", big: "계정 확인 중…", line: "잠시만요.", tone: null };
  if (m === "logout") return { icon: "☁️", big: "로그인 안 함", line: "지금은 이 브라우저에만 저장돼요. 로그인하면 다른 기기에서도 이어서 해요.", tone: "warn" };
  if (m === "conflict") return { icon: "⚠️", big: "충돌", tone: "empty", line: st.conflict?.kind === "askDeleted"
    ? "다른 기기에서 계정 섬을 지웠어요. 이 기기 섬을 다시 올릴지 골라 주세요." : "이 기기와 계정의 섬이 둘 다 바뀌었어요. 어느 섬을 쓸지 골라 주세요." };
  if (m === "paused") return { icon: "⏸", big: "저장 멈춤 · 다시 올리기", line: "계정에서 섬을 지워서 자동으로 올리지 않아요.", tone: "warn" };
  if (m === "error") return { icon: "⏸", big: "저장 멈춤 · 다시 올리기", line: st.err || "계정에 올리지 못했어요. 이 브라우저에는 저장돼요.", tone: "warn" };
  if (m === "ok") {
    if (!meta.upAt) return { icon: "☁️", big: meta.baseRev > 0 ? "계정 섬을 받았어요" : "아직 안 올림", line: `${who} · 곧 계정에 올려요`, tone: meta.baseRev > 0 ? "ok" : null };
    return { icon: "☁️", big: `저장됨 ${agoText(meta.upAt, now)}`, line: `${who} · 5분마다 자동으로 올려요`, tone: "ok" };
  }
  return { icon: "☁️", big: "", line: "", tone: null };
}
