// 💾 저장 앱 맨 위 「계정 카드」 + 충돌 창(#cloudAsk). 글은 모두 textContent(innerHTML 안 씀: 서버·주소에서 온 글이 태그로 읽히지 않게).
// 가독성 원칙: 상태 한 줄을 크게(로그인 안 함 / 저장됨 n분 전 / 저장 멈춤 · 다시 올리기 / 충돌) → 할 수 있는 단추 → 세부는 [자세히 보기]에 접어 둠.
// installCloud가 CloudSaver(systems/cloudClient.js)를 만들고 타이머·화면 떠남·돌아옴 이벤트를 단다. main.js는 이것 하나만 부름.
import { CloudSaver } from "../systems/cloudClient.js";
import { cloudStatus, readSummary, summaryRows, summaryOf, CLOUD_MY, LINK_OPEN } from "../systems/cloudSync.js";

const cvEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const cvBtn = (cls, text, onClick) => { const b = cvEl("button", cls, text); b.type = "button"; b.onclick = onClick; return b; };

/** 계정 카드(💾 저장 앱 안 #cloudBox) */
export class CloudCard {
  constructor({ box, cloud, confirm, status }) {
    this.cloud = cloud; this.confirm = confirm; this.status = status; this.showLogout = false;
    box.textContent = "";
    const sum = this.sum = cvEl("div", "sum cc-sum"); sum.setAttribute("role", "status"); sum.setAttribute("aria-live", "polite");
    this.ico = cvEl("span", "sum-ico"); this.ico.setAttribute("aria-hidden", "true");
    const main = cvEl("div", "sum-main"); this.big = cvEl("b", "sum-big cc-big"); this.line = cvEl("div", "sum-line cc-line");
    main.append(this.big, this.line); sum.append(this.ico, main);
    this.note = cvEl("p", "cc-note"); this.note.hidden = true;
    this.link = cvEl("a", "cc-link"); this.link.hidden = true; this.link.target = "_blank"; this.link.rel = "noopener";
    this.link.onclick = () => cloud.wantRecheck();
    const acts = this.acts = cvEl("div", "col cc-acts");
    this.bLogin = cvBtn("go", "🟡 카카오로 로그인", () => cloud.login());
    this.bResolve = cvBtn("go", "⚖️ 어느 섬을 쓸지 고르기", () => this.ask());
    this.bResume = cvBtn("go", "⤴ 다시 올리기", () => this.run(() => cloud.push({ force: true, resume: true }), "계정에 올렸어요"));
    this.bNow = cvBtn("", "☁️ 지금 계정에 저장", () => this.run(() => { cloud.o.saveLocal(); return cloud.push({ force: true }); }, "계정에 저장했어요"));
    this.bPull = cvBtn("", "⬇️ 계정 섬 받기", () => this.pull());
    this.bRestore = cvBtn("", "↩️ 한 단계 되돌리기", () => this.restore());
    this.bLogout = cvBtn("ghost", "🚪 로그아웃은 어떻게 해요?", () => { this.showLogout = !this.showLogout; this.render(); });
    acts.append(this.bLogin, this.bResolve, this.bResume, this.bNow, this.bPull, this.bRestore, this.bLogout);
    this.logout = cvEl("div", "cc-note cc-logout"); this.logout.hidden = true;
    const lp = cvEl("p", "", "로그아웃은 계정 페이지(/my)에서 해요. 로그아웃해도 이 기기 섬은 그대로 남고, 계정 섬도 지워지지 않아요.");
    const la = cvEl("a", "cc-link", "/my 열기(새 탭)"); la.href = CLOUD_MY; la.target = "_blank"; la.rel = "noopener"; la.onclick = () => cloud.wantRecheck();
    this.logout.append(lp, la);
    // 자세히 보기(접기)
    const more = this.more = cvEl("details", "more cc-more"); const ms = cvEl("summary", "", "자세히 보기"); more.append(ms);
    this.moreBody = cvEl("div", "more-b"); more.append(this.moreBody);
    this.bDelete = cvBtn("danger cc-del", "🗑 계정에서 섬 지우기", () => this.remove());
    box.append(sum, this.note, this.link, acts, this.logout, more);
    cloud.onChange(() => this.render());
    this.render();
  }
  async run(fn, okText) {
    if (this.running) return null;                  // 두 번 누름 막기(되돌리기·받기는 요청이 여러 번)
    this.running = true; this.render();
    let r; try { r = await fn(); } finally { this.running = false; this.render(); }
    if (r === "done") this.status?.(`☁️ ${okText}`);
    else if (this.cloud.mode === "error") this.status?.(`⏸ ${this.cloud.err}`, { kind: "warn" });
    return r;
  }
  async pull() {
    const c = this.cloud, srv = c.server;
    if (srv && srv.rev !== c.meta.baseRev && c.meta.dirty) { c.setMode("conflict", { conflict: { kind: "ask", server: srv } }); return this.ask(); }   // 둘 다 바뀜 → 고르기 창
    const ok = await this.confirm({ title: "⬇️ 계정 섬을 받을까요?", body: "이 기기 섬이 계정 섬으로 바뀌어요. 계정에 올린 뒤 이 기기에서 바뀐 것은 사라져요(이 브라우저에 한 벌 남겨 둬요).", ok: "받기" });
    if (ok) await this.run(() => c.pull(), "계정 섬을 받았어요");
  }
  async restore() {
    const p = readSummary(this.cloud.server?.prev?.summary);
    const ok = await this.confirm({ title: "↩️ 바로 전 계정 섬으로 되돌릴까요?", body: `계정의 지금 섬과 바로 전 섬을 맞바꾸고, 그 섬을 이 기기로 받아요${p?.pop != null ? `(갈매미 ${p.pop}마리 · 건물 ${p.bld}채)` : ""}. 한 번 더 누르면 다시 돌아와요.`, ok: "되돌리기" });
    if (ok) await this.run(() => this.cloud.restore(), "바로 전 계정 섬으로 되돌렸어요");
  }
  async remove() {
    const ok = await this.confirm({ title: "🗑 계정에서 섬을 지울까요?", body: "계정의 섬만 지워요. 이 기기 섬은 그대로 남고, 자동으로 올리지 않게 멈춰요. [한 단계 되돌리기]로 한 번 되살릴 수 있어요.", ok: "지우기", danger: true });
    if (ok) await this.run(() => this.cloud.remove(), "계정에서 섬을 지웠어요");
  }
  ask() { this.onAsk?.(); }
  render() {
    const c = this.cloud, s = cloudStatus(c), m = c.mode, logged = m === "ok" || m === "paused" || m === "error" || m === "conflict";
    this.ico.textContent = s.icon; this.big.textContent = s.big; this.line.textContent = s.line;
    if (s.tone) this.sum.dataset.tone = s.tone; else delete this.sum.dataset.tone;
    this.sum.dataset.mode = m;
    // ?login= 문구(정해진 값만, 로그인 여부는 서버 응답으로만) · login=link면 /my에서 연결하기(새 탭)
    // ok·linked(「확인하는 중…」)은 확인이 끝나면 숨김 · 취소·실패·이미 연결·link는 로그인 안 한 동안 보임
    const n = c.notice, showN = n && m !== "off" && (m === "checking" || (m === "logout" && n.key !== "ok" && n.key !== "linked"));
    this.note.hidden = !showN; this.note.textContent = showN ? n.text : "";
    const open = showN && m === "logout" ? n.open : null; this.link.hidden = !open;
    if (open) { this.link.textContent = `🔗 ${open.label ?? LINK_OPEN.label}(새 탭)`; this.link.href = open.href; this.note.textContent = `${n.text} ${open.after}`; }
    this.acts.hidden = m === "off" || m === "checking";
    this.bLogin.hidden = m !== "logout";
    this.bResolve.hidden = m !== "conflict";
    this.bResume.hidden = !(m === "paused" || m === "error");
    this.bNow.hidden = m !== "ok";
    this.bPull.hidden = !logged || m === "conflict" || !c.server || c.server.deleted || !(c.server.rev > 0);
    this.bRestore.hidden = !c.canRestore();
    this.bLogout.hidden = !logged;
    this.logout.hidden = !(logged && this.showLogout);
    for (const b of [this.bResume, this.bNow, this.bPull, this.bRestore, this.bResolve]) b.disabled = c.busy || !!this.running;
    this.drawMore();
  }
  drawMore() {
    const c = this.cloud, b = this.moreBody, m = c.mode; b.textContent = "";
    const ul = cvEl("ul", "cc-rules");
    const li = t => ul.append(cvEl("li", "", t));
    if (m === "off") {
      li("계정 저장은 계정 서버와 같은 주소(gmm.dpdns.org/village3d/)에서 열었을 때만 돼요.");
      li("여기서는 지금처럼 이 브라우저에 1분마다 저장돼요.");
      b.append(ul); return;
    }
    li("로그인하면 5분마다, 그리고 화면을 떠날 때 계정에 올려요(이 브라우저 저장은 1분마다 그대로).");
    li("다른 기기에서 같은 카카오 계정으로 열면 이어서 해요. 새 기기의 손대지 않은 새 섬은 묻지 않고 계정 섬을 받아요.");
    li("두 기기에서 둘 다 바뀌면 어느 섬을 쓸지 물어요. 고르지 않은 섬은 [한 단계 되돌리기]로 한 번 되찾을 수 있어요.");
    li("계정에서 섬을 지우면 다른 기기도 조용히 되살리지 않고 다시 올릴지 물어요.");
    b.append(ul);
    const t = cvEl("table", "tbl cc-tbl"), row = (k, v) => { const tr = cvEl("tr"); tr.append(cvEl("td", "", k), cvEl("td", "", v)); t.append(tr); };
    const srv = c.server;
    if (c.nickname) row("계정", c.nickname);
    row("계정 섬 판", srv ? (srv.deleted ? `${srv.rev}(지움)` : String(srv.rev)) : "없음");
    row("이 기기가 맞춘 판", String(c.meta.baseRev));
    row("이 기기에서 바뀜", c.meta.dirty ? "예(아직 안 올림)" : "아니요");
    const ps = readSummary(srv?.prev?.summary);
    row("바로 전 계정 섬", srv?.prev ? (srv.prev.deleted ? "지운 섬" : ps ? `갈매미 ${ps.pop ?? "?"}마리 · 건물 ${ps.bld ?? "?"}채` : `판 ${srv.prev.rev}`) : "없음");
    b.append(t);
    if (srv && !srv.deleted && srv.rev > 0 && m !== "conflict" && m !== "logout") { this.bDelete.disabled = c.busy; b.append(this.bDelete); }
  }
}

/** 충돌 창(#cloudAsk): 두 섬 요약 카드(갈매미 수·건물 수·금고·마지막 저장 시각) + 고르기 */
export class CloudAsk {
  constructor({ box, cloud, getWorld, status, savedAt }) {
    this.box = box; this.cloud = cloud; this.getWorld = getWorld; this.status = status; this.savedAt = savedAt || (() => Date.now());
    this.title = box.querySelector("#cloudAskTitle"); this.body = box.querySelector("#cloudAskBody");
    this.cards = box.querySelector(".ca-cards"); this.btns = box.querySelector(".lbtns"); this.foot = box.querySelector(".ca-foot");
    let down = false; box.onpointerdown = e => { down = e.target === box; }; box.onclick = e => { if (e.target === box && down) this.close(); down = false; };
  }
  card(head, s, cls) {
    const d = cvEl("section", `ca-card ${cls}`); d.append(cvEl("h5", "", head));
    const t = cvEl("table", "tbl");
    for (const [k, v] of summaryRows(s)) { const tr = cvEl("tr"); tr.append(cvEl("td", "", k), cvEl("td", "", v)); t.append(tr); }
    d.append(t); return d;
  }
  open() {
    const c = this.cloud.conflict; if (!c) return;
    const del = c.kind === "askDeleted" || c.server?.deleted, mine = readSummary(summaryOf(this.getWorld(), this.savedAt()));   // 이 기기 섬의 마지막 저장 = 이 브라우저에 마지막으로 저장한 때
    this.title.textContent = del ? "🗑 다른 기기에서 계정 섬을 지웠어요" : "⚖️ 어느 섬을 쓸까요?";
    this.body.textContent = del ? "이 기기 섬을 계정에 다시 올릴까요? 올리지 않으면 이 기기에만 저장하고 자동으로 올리지 않아요." : "이 기기와 계정의 섬이 둘 다 바뀌었어요. 쓸 섬을 골라 주세요.";
    this.cards.textContent = "";
    this.cards.append(this.card("📱 이 기기 섬", mine, "ca-mine"));
    if (del) { const d = cvEl("section", "ca-card ca-theirs"); d.append(cvEl("h5", "", "☁️ 계정 섬"), cvEl("p", "ca-gone", "지움(묘비)")); this.cards.append(d); }
    else this.cards.append(this.card("☁️ 계정 섬", readSummary(c.server?.summary), "ca-theirs"));
    this.btns.textContent = "";
    const go = (choice, text) => async () => { this.close(true); const r = await this.cloud.resolve(choice); if (r === "done") this.status?.(`☁️ ${text}`); else if (this.cloud.mode === "error") this.status?.(`⏸ ${this.cloud.err}`, { kind: "warn" }); };
    if (del) this.btns.append(cvBtn("ghost", "올리지 않기", go("skip", "")), cvBtn("go", "⤴ 이 기기 섬 다시 올리기", go("mine", "이 기기 섬을 계정에 다시 올렸어요")));
    else this.btns.append(cvBtn("ghost", "나중에", () => this.close()), cvBtn("", "⬇️ 계정 섬 받기", go("theirs", "계정 섬을 받았어요")), cvBtn("go", "📱 이 기기 섬으로", go("mine", "이 기기 섬으로 계정을 덮어썼어요")));
    this.foot.textContent = del ? "다시 올려도 지운 섬은 [한 단계 되돌리기]로 한 번 되살릴 수 있어요." : "고르지 않은 섬은 계정에 한 벌 남아 [한 단계 되돌리기]로 한 번 되찾을 수 있어요.";
    this.back = document.activeElement; this.box.hidden = false;
    this.btns.querySelector(".ghost")?.focus({ preventScroll: true });
  }
  /** 닫기. picked가 아니면 「나중에」(충돌 그대로 · 자동 올리기 멈춤) */
  close(picked = false) {
    if (this.box.hidden) return;
    this.box.hidden = true;
    if (!picked && this.cloud.conflict) this.cloud.resolve("later");
    if (this.back?.isConnected && !this.back.closest("[hidden]")) this.back.focus({ preventScroll: true });
  }
}

/** main.js가 한 번 부름. o: { hud, saveKey, gridW, getWorld, saveLocal, fromJSON, mountPulled } → CloudSaver(시작은 start()) */
export function installCloud(o) {
  const hud = o.hud, status = (t, opt) => hud.status(t, opt);
  let storage = null; try { storage = window.localStorage; storage.getItem("x"); } catch { storage = null; }   // 아티팩트(sandbox)는 읽기만 해도 오류 → 메모리로
  if (!storage) { const m = new Map(); storage = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; }
  const cloud = new CloudSaver({
    fetch: (...a) => fetch(...a), storage, saveKey: o.saveKey, gridW: o.gridW, getWorld: o.getWorld, saveLocal: o.saveLocal,
    fromJSON: o.fromJSON, mountPulled: o.mountPulled, location, setCookie: c => { document.cookie = c; }, go: u => location.assign(u),
    replaceUrl: u => { try { history.replaceState(history.state, "", u); } catch { /* 무시 */ } },
  });
  const card = new CloudCard({ box: document.getElementById("cloudBox"), cloud, confirm: x => hud.confirm(x), status });
  const lastLocal = () => { try { const t = storage.getItem(o.saveKey) || "", i = t.lastIndexOf('"savedAt":'), v = i < 0 ? NaN : parseInt(t.slice(i + 10), 10); return Number.isFinite(v) && v > 0 ? v : Date.now(); } catch { return Date.now(); } };
  const ask = new CloudAsk({ box: document.getElementById("cloudAsk"), cloud, getWorld: o.getWorld, status, savedAt: lastLocal });
  card.onAsk = () => ask.open();
  hud.cloudAskCancel = () => ask.close();          // keys.js: Esc·기기 뒤로 = 나중에
  let shown = null;                                 // 충돌 창은 충돌이 새로 생길 때 한 번 저절로 뜸(나중에를 고르면 카드의 [고르기]로)
  cloud.onChange(() => {
    const k = cloud.conflict ? `${cloud.conflict.kind}:${cloud.conflict.server?.rev}` : null;
    if (k && k !== shown && cloud.mode === "conflict") { shown = k; ask.open(); }
    if (!k) shown = null;
  });
  let noticeShown = false;
  cloud.onChange(() => {                            // ?login= 결과는 계정 확인이 끝난 뒤 알림 한 번(로그인 됐는지는 서버 응답으로만 정함)
    if (noticeShown || !cloud.notice || cloud.mode === "checking") return; noticeShown = true;
    const n = cloud.notice, on = cloud.mode !== "logout" && cloud.mode !== "off";
    status(on && (n.key === "ok" || n.key === "linked") ? "☁️ 카카오 로그인을 마쳤어요 · 이제 계정에도 저장돼요" : `☁️ ${n.text}`, { queue: true, kind: on || n.key === "ok" ? undefined : "warn" });
  });
  setInterval(() => cloud.tick(), 30_000);
  setInterval(() => { if (!document.hidden && card.sum.isConnected && card.sum.offsetParent) card.render(); }, 20_000);   // 「n분 전」 고침(💾 앱이 보일 때만)
  addEventListener("visibilitychange", () => { if (document.hidden) cloud.onHide(); else cloud.onReturn(); });
  addEventListener("pagehide", () => cloud.onHide());
  addEventListener("focus", () => cloud.onReturn());
  return cloud;
}
