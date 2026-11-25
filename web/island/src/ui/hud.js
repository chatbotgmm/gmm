// 화면 UI: 도구 막대, 갈매미 목록·통계 판, 알림 줄. DOM만 다루고 월드는 콜백으로 바꾼다.
import { GROUND_TYPES, UnitState } from "../data/types.js";
import { GROUND_STYLE, BUILDINGS, JOBS, RARITY, FISH, ITEMS, UNITS, FURNITURE, PERSONA } from "../data/catalog.js";
import * as J from "../world/jobs.js";
import * as M from "../units/mind.js";
import { TRIBES } from "../data/catalog.js";
import * as E from "../world/economy.js";
import { QUALITY, ORDER, QUALITY_NOTE } from "../render/quality.js";
import { WISH_BY_ID, WISH_REWARD, wishText } from "../world/wishes.js";
import { FESTIVAL_RANK, FESTIVAL_NEED, FESTIVAL_RADIUS, festivalOf, festivalGift, festivalPlaza, festivalStamps } from "../world/festival.js";
import { RANKS, RANK_REWARD, rankScore } from "../world/rank.js";
import { SEASONS } from "../world/season.js";
import * as Fu from "../world/furniture.js";
import { DONATE_KINDS, DONATE_GIFTS, donatedCount } from "../world/aquarium.js";
import { newsDay, newsPages, NEWS_HEADLINES, NEWS_KEEP_DAYS } from "../world/news.js";
import { BOND_STAGES, bondStage, bondHearts, GIFT_CAT_NAME, giftables, petsLeft, PET_DAILY } from "../world/bond.js";
import { SKY_EVENTS } from "../world/skywatch.js";
import { STAMP_SHOP, DAILY_COUNT } from "../world/daily.js";

const escHtml = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);   // 글을 그대로 보여 주기(태그로 읽히지 않게)

const STATE_LABEL = { [UnitState.Forage]: "씨앗 찾는 중", [UnitState.Eat]: "냠냠", [UnitState.Visit]: "친구에게 가는 중", [UnitState.Greet]: "인사 중",
  [UnitState.Zoomies]: "신나서 뛰는 중", [UnitState.Flee]: "도망치는 중", [UnitState.Avoid]: "혼자 있고 싶어",
  [UnitState.GoChop]: "숲으로 가는 중", [UnitState.Chop]: "나무 베는 중", [UnitState.GoMine]: "광산으로 가는 중", [UnitState.Mine]: "광석 캐는 중",
  [UnitState.GoFish]: "낚시터로 가는 중", [UnitState.Fish]: "낚시 중", [UnitState.GoBuild]: "공사장으로 가는 중", [UnitState.Build]: "집 짓는 중",
  [UnitState.Idle]: "쉬는 중", [UnitState.Wander]: "산책 중", [UnitState.GoToBuilding]: "건물로 가는 중",
  [UnitState.Sleep]: "자는 중", [UnitState.Curious]: "구경하러 가는 중", [UnitState.GoSwim]: "헤엄치러 가는 중", [UnitState.Swim]: "헤엄치는 중", [UnitState.GoBank]: "은행에 팔러 가는 중", [UnitState.GoMarket]: "시장 가는 중", [UnitState.GoShore]: "바닷가로 먹이 잡으러", [UnitState.GoImprove]: "동네 고치러 가는 중", [UnitState.Improve]: "동네 고치는 중", [UnitState.GoSit]: "벤치로 가는 중", [UnitState.Sit]: "벤치에 앉아 쉬는 중",
  [UnitState.GoTrade]: "시장으로 가는 중", [UnitState.Trade]: "장사 중", [UnitState.GoFarm]: "밭으로 가는 중", [UnitState.Farm]: "밭일 중",
  [UnitState.GoFest]: "축제 광장으로 가는 중", [UnitState.Inside]: "건물 안", [UnitState.GoToFurniture]: "가구로 가는 중", [UnitState.Interact]: "가구 쓰는 중", [UnitState.Held]: "들려 있음" };

// 하늘 기록(도감): 드문 하늘마다 언제 볼 수 있는지 한 줄
const SKY_HINT = { rainbow: "낮에 비가 갠 뒤 가끔 · 물건을 더 잘 찾아요", meteor: "맑은 밤에 아주 가끔 · 별조각이 떨어져요", firstSnow: "겨울마다 처음 내리는 눈" };

const hex = n => "#" + n.toString(16).padStart(6, "0");
// 화면 모양: 가로 폰(높이 480 미만) → 세로 폰(폭 600 미만) → 중간(1200 미만) → 넓음 순서로 판정. CSS는 html[data-form]을 봄(같은 판정을 한곳에서).
// 폭·높이는 배율로 나눈 값(k = 글자·버튼 크기) — 1280×800에서 150%면 853×533으로 보고 「중간」 배치가 됨. 눕힌 휴대폰(실제 높이 480 미만)은 작게(75%) 해도 가로 폰 배치 그대로
const hudFormNow = (k = 1) => { const w = innerWidth / k, h = innerHeight / k; return Math.min(h, innerHeight) < 480 && innerWidth > innerHeight ? "landscape" : w < 600 ? "portrait" : w < 1200 ? "medium" : "wide"; };
// ---- 화면 맞춤 설정: 이 기기(브라우저)에만 기억하고 섬 저장과는 다른 칸에 둠. 배율은 galmaemiman-uiscale(%), 나머지는 galmaemiman-uiprefs
const UI_SCALE_KEY = "galmaemiman-uiscale", UI_PREFS_KEY = "galmaemiman-uiprefs";
const UI_SCALE_RANGE = [75, 150, 130];                                           // 가장 작게 · 가장 크게 · 터치 화면에서 가장 크게(%)
const UI_PREFS_DEFAULT = { keyhint: "auto", hand: "right", motion: "auto", vibe: "on" };   // 키 힌트 auto|on|off · 손 right|left · 움직임 auto(기기 설정)|reduce|full · 진동 on|off
const uiCoarse = () => matchMedia("(pointer: coarse)").matches;
const uiScaleMax = () => uiCoarse() ? UI_SCALE_RANGE[2] : UI_SCALE_RANGE[1];
const uiScaleClamp = v => Math.max(UI_SCALE_RANGE[0], Math.min(uiScaleMax(), Math.round((Number(v) || 100) / 5) * 5));
// 아주 큰 PC 화면(1920×1080보다 큼 · 마우스)에서는 글자가 작아 보이지 않게 저절로 키움(최대 2배, 0.05 단위). 휴대폰·보통 화면은 1
const uiAutoScale = () => uiCoarse() ? 1 : Math.max(1, Math.min(2, Math.floor(Math.min(innerHeight / 1080, innerWidth / 1920) * 20) / 20));
// 건설 갤러리의 분류(화면에서만 쓰는 표 — 건물 정의에는 분류가 없음)
const BUILD_CATS = [["all", "전체"], ["home", "집"], ["work", "시설"], ["deco", "장식"], ["road", "교통"]];
const buildCatOf = d => d.house ? "home" : d.deco ? "deco" : d.stairs || d.bridge || d.pier ? "road" : "work";
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export class Hud {
  constructor({ tools, world, onSave, onLoad, onReset }) {
    this.tools = tools; this.world = world;
    tools.onHistory = () => { if (this.undoBtns) { this.undoBtns[0].disabled = !tools.history.length; this.undoBtns[1].disabled = !tools.redoStack.length; } };
    const crossUI = document.getElementById("cross"), crossGo = document.getElementById("crossGo");
    tools.onCross = on => { crossUI.hidden = !on; crossGo.hidden = !on; };
    crossGo.addEventListener("pointerdown", e => { e.preventDefault(); crossGo.setPointerCapture(e.pointerId); tools.crossPress(true); });
    for (const ev of ["pointerup", "pointercancel"]) crossGo.addEventListener(ev, () => tools.crossPress(false));
    const bar = document.getElementById("tools"), sub = document.getElementById("sub");
    this.initUiPrefs();
    // 도구 버튼: [아이콘, 이름, 휴대폰용 짧은 이름]. 건설 모드에서만 보이고, 맨 앞 ✓ 완료(view)를 누르면 평소 화면으로
    const modes = [["view", "✓", "완료", "완료"], ["paint", "🖌", "바닥 칠하기", "칠하기"], ["height", "⛰", "높이", "높이"], ["build", "🏠", "건물 짓기", "짓기"], ["demolish", "🧹", "철거", "철거"]];
    this.modeBtns = modes.map(([m, icon, label, short]) => { const b = this.toolBtn(m === "view" ? "done" : "", icon, label, short); b.dataset.mode = m; bar.appendChild(b);
      b.onclick = () => tools.setMode(m, m === "paint" ? (this.lastPaint || GROUND_TYPES[1]) : m === "build" ? (this.lastBuild || "house") : m === "height" ? (this.lastHeight || "raise") : null); return b; });
    this.modeBtns[0].setAttribute("aria-label", "완료 — 건설 모드 끝내기");
    // 🔨 건설: 평소 화면의 유일한 건설 입구. 마지막에 쓴 건설 도구로 들어감(처음엔 건물 짓기)
    this.lastEdit = "build";
    document.getElementById("editBtn").onclick = () => this.modeBtns.find(b => b.dataset.mode === this.lastEdit)?.click();
    this.sub = sub;
    // ---- 보조 줄(#ebar): 분류 칩(건물 짓기) · 철거 안내 · 보조 버튼(✋ 화면 이동 · ↶ ↷ · 🎯 십자선 · ⟲ ⟳ 화면 돌리기). 한 번만 만들고 도구에 따라 보이기만 바꿈
    const ebar = document.getElementById("ebar"), aux = el("div", "eaux");
    const auxBtn = (id, icon, label, tip) => { const b = el("button", "abtn", icon); if (id) b.id = id; b.setAttribute("aria-label", label); b.dataset.tip = tip; aux.appendChild(b); return b; };
    this.buildCat = "all"; this.ecats = el("div", "ecats"); this.ecats.setAttribute("role", "group"); this.ecats.setAttribute("aria-label", "건물 분류");
    this.catBtns = BUILD_CATS.map(([id, label]) => { const b = el("button", "", label); b.dataset.cat = id; b.onclick = () => { this.buildCat = id; this.sub.scrollLeft = this.sub.scrollTop = 0; this.filterBuild(); }; this.ecats.appendChild(b); return b; });
    this.ehint = el("span", "ehint", "🧹 누른 건물이 바로 사라져요 · 되돌릴 수 없어요");
    // ✋ 화면 이동: 도구를 쓰는 중에 켜면 드래그로 화면만 옮김(도구는 잠시 멈춤)
    this.handBtn = auxBtn("", "✋", "화면 이동", "켜면 드래그로 화면을 옮겨요(도구는 잠시 멈춤). PC는 스페이스를 누른 채 끌거나 오른쪽 버튼으로, 휴대폰은 두 손가락으로 끌어도 돼요"); this.handBtn.classList.add("hand");
    this.handBtn.onclick = () => tools.setHand(!tools.hand);
    tools.onHand = on => { this.handBtn.classList.toggle("on", on); this.handBtn.setAttribute("aria-pressed", String(on)); };
    const undo = auxBtn("", "↶", "되돌리기", "되돌리기(Ctrl+Z)"), redo = auxBtn("", "↷", "다시하기", "다시하기(Ctrl+Shift+Z)"); undo.onclick = () => tools.undo(); redo.onclick = () => tools.redo();
    undo.disabled = redo.disabled = true; this.undoBtns = [undo, redo];
    this.crossBtn = auxBtn("", "🎯", "십자선", "화면 가운데를 붓으로: 한 손가락으로 화면을 옮기고, 아래 큰 버튼을 누르는 동안 칠해요");
    this.crossBtn.onclick = () => { tools.setCross(!tools.cross); this.crossBtn.classList.toggle("on", tools.cross); this.crossBtn.setAttribute("aria-pressed", String(tools.cross)); };
    aux.appendChild(el("i", "vsep"));
    // ⟲ ⟳: 건설 모드는 내려다보는 각도가 고정이라, 화면은 이 버튼(Z · X)으로 90°씩 돌려 봄
    this.viewBtns = [auxBtn("viewL", "⟲", "화면을 왼쪽으로 90° 돌리기", "화면을 왼쪽으로 90° 돌려요"), auxBtn("viewR", "⟳", "화면을 오른쪽으로 90° 돌리기", "화면을 오른쪽으로 90° 돌려요")];
    this.viewBtns[0].onclick = () => this.onViewTurn?.(-1); this.viewBtns[1].onclick = () => this.onViewTurn?.(1);
    ebar.append(this.ecats, this.ehint, aux);
    tools.onMode = (m, arg) => this.showMode(m, arg);
    // 건물 자리를 정하면 🔨 건설 / ↻ 돌리기 / ✕ 취소 막대(지을 수 없는 자리면 건설 버튼 꺼짐)
    const cf = document.getElementById("confirm"), cfBuild = document.getElementById("cfBuild");
    tools.onPlan = (on, ok) => {
      cf.hidden = !on; cfBuild.disabled = !ok;                                       // 자리: CSS(--dock-b, 세로 폰은 아래 도구 막대 바로 위)
    };
    cfBuild.onclick = () => tools.confirmBuild();
    document.getElementById("cfRot").onclick = () => tools.rotate();
    document.getElementById("cfCancel").onclick = () => tools.clearPlan();
    tools.onBrush = n => this.brushBtns?.forEach(b => b.classList.toggle("on", +b.dataset.brush === n));
    this.instantBuild = false;
    this.summonBtn = document.getElementById("summon"); this.summonBtn.onclick = () => this.onSummon?.();
    document.getElementById("dexBtn").onclick = () => this.showDex(true);
    // ⚡ 바로 완공(시험용): 설정 → 게임 → 🛠 개발자 안에
    const ib = document.getElementById("instantBtn"), ibDraw = () => { ib.textContent = `⚡ 바로 완공: ${this.instantBuild ? "켬" : "끔"}`; ib.classList.toggle("on", this.instantBuild); ib.setAttribute("aria-pressed", String(this.instantBuild)); };
    ib.onclick = () => { this.instantBuild = !this.instantBuild; ibDraw(); this.onInstant?.(this.instantBuild); }; this.drawInstant = ibDraw;
    // 그래픽 설정 5단계(설정 앱): 누르면 바로 바뀜
    this.qBox = document.getElementById("quality");
    for (const k of ORDER) { const b = el("button", "", QUALITY[k].name); b.dataset.q = k; b.dataset.tip = QUALITY_NOTE[k]; b.onclick = () => this.setQuality(this.onQuality?.(k)); this.qBox.appendChild(b); }
    this.info = document.getElementById("info");
    this.tugBtn = document.getElementById("tugBtn"); this.tugBtn.onclick = () => this.onTug?.();   // 찌 당기기(따라가는 갈매미에게 입질이 왔을 때만 보임)
    // 선물·쓰다듬기(따라가기 카드 위): 카드는 매 프레임 다시 그리므로 버튼은 따로 둠
    this.bondBar = document.getElementById("bondBar"); this.giftPick = document.getElementById("giftPick"); this.giftBtn = document.getElementById("giftBtn"); this.petBtn = document.getElementById("petBtn");
    this.giftBtn.onclick = () => { this.giftPick.hidden = !this.giftPick.hidden; if (!this.giftPick.hidden) this.drawGifts(); };
    this.petBtn.onclick = () => { if (!this.follow) return; this.onPet?.(this.follow); this.showBond(this.follow); };   // 남은 횟수는 바로 고침(글자판은 1초에 5번만 그림)
    this.giftPick.onclick = e => { const b = e.target.closest?.("[data-gift]"), u = this.follow; if (!b || !u) return; this.onGift?.(u, b.dataset.gift); this.drawGifts(); };
    const zb = document.getElementById("zones"); zb.onclick = () => { zb.classList.toggle("off"); const on = !zb.classList.contains("off"); zb.setAttribute("aria-pressed", String(on)); this.onZones?.(on); };
    document.getElementById("save").onclick = () => { onSave(); this.closePhone(); };
    // 불러오기는 보통 확인, 새 섬은 위험 확인(지금 섬이 사라짐). 취소하면 갈매폰은 그대로
    document.getElementById("load").onclick = async () => {
      if (this.hasSave?.() !== false && !await this.confirm({ title: "📂 마지막 저장을 불러올까요?", body: `${this.savedLabel?.() || ""} · 그 뒤에 바뀐 것은 돌아가요(1분마다 자동 저장돼요).`, ok: "불러오기" })) return;
      onLoad(); this.closePhone(); };
    document.getElementById("reset").onclick = async () => {
      if (!await this.confirm({ title: "🏝 새 섬을 만들까요?", body: "지금 섬과 갈매미들은 사라지고, 자동 저장도 새 섬으로 바뀌어요. 되돌릴 수 없어요.", ok: "새 섬 만들기", danger: true })) return;
      onReset(); this.closePhone(); };
    this.list = document.getElementById("units"); this.stats = document.getElementById("stats"); this.msg = document.getElementById("msg");
    // 알림: 버튼 안내(바로 바꿈) + 차례로 보여 주는 알림(최대 3개 대기) · 지난 알림 30개(이번에 켠 동안만, 저장 안 함)
    this.toastQ = []; this.toastCur = null; this.noteLog = [];
    document.getElementById("logOpen").onclick = () => this.openApp("log", "news");
    // ---- 갈매폰: 📱 → 홈(맨 아래 독 4개 + 묶음 셋), 같은 시트에 ☰ 메뉴·도감
    this.phone = document.getElementById("phone"); this.phoneBtn = document.getElementById("phoneBtn");
    this.phoneBtn.onclick = () => this.openPhone();
    document.getElementById("phoneClose").onclick = () => this.closePhone();
    document.getElementById("phoneCloseBar").onclick = () => this.closePhone();     // 터치: 아래 닫기 막대
    document.getElementById("phoneBack").onclick = () => this.phoneBackStep();
    // 바깥(어두운 곳) 누르기 = 닫기. 누름과 뗌이 모두 바깥일 때 click에서 닫음 → 뗄 때 생기는 click이 뒤의 칩·버튼으로 새지 않음
    this.phone.addEventListener("pointerdown", e => { this.scrimDown = e.target === this.phone; });
    this.phone.addEventListener("click", e => { if (e.target === this.phone && this.scrimDown) this.closePhone(); this.scrimDown = false; });
    this.sbody = this.phone.querySelector(".sbody");
    for (const b of document.querySelectorAll(".apps button")) b.onclick = () => {
      const app = b.dataset.app;
      if (app === "build") { this.closePhone(); tools.setMode("build", this.lastBuild || "house"); return; }   // 홈에선 숨김(편집 버튼과 같음) · 손잡이는 남김
      this.openApp(app);
    };
    this.appBtns = Object.fromEntries([...document.querySelectorAll(".apps button")].map(b => [b.dataset.app, b]));
    // ☰ 메뉴: 계속하기 · 설정 · 저장 · 도움말(메뉴에서 연 앱의 ‹ 뒤로는 메뉴로)
    document.getElementById("menuBtn").onclick = () => this.openMenu();
    document.getElementById("pageMenu").onclick = e => { const g = e.target.closest?.("[data-go]")?.dataset.go; if (!g) return;
      if (g === "close") this.closePhone(); else if (g === "home") this.openApp(null); else this.openApp(g, "menu"); };
    this.watchSizes();
    // 설정 갈래 탭 + 고르기 칸(누른 값으로 바로: main.js 콜백에 목표 값을 넘김)
    this.setTab = "screen";
    for (const t of document.querySelectorAll(".stabs [data-stab]")) t.onclick = () => this.showSetTab(t.dataset.stab);
    for (const g of document.querySelectorAll(".seg[data-set]")) g.onclick = e => { const b = e.target.closest?.("button[data-v]"); if (b) this.pickSetting(g.dataset.set, b.dataset.v); };
    // 배지: 처음 본 값을 기준으로(불러온 직후엔 점이 없음)
    this.seen = null;
    // 배고픈 갈매미 알림: 누르면 그 갈매미를 따라감
    this.alertBtn = document.getElementById("alert"); this.alertBtn.onclick = () => { if (this.hungry) this.onUnitClick?.(this.hungry); };
    this.chipMoney = document.getElementById("chipMoney"); this.chipPop = document.getElementById("chipPop"); this.chipTime = document.getElementById("chipTime");
    this.chipWeather = document.getElementById("chipWeather"); this.chipWeather.onclick = () => this.onWeatherInfo?.();
    document.getElementById("chipRank").onclick = () => { this.openPhone(); this.openApp("town"); };
    this.chipMoney.onclick = () => { this.openPhone(); this.openApp("bank"); };       // 돈 → 🏦 은행
    this.wishBtn = document.getElementById("chipWish"); this.wishBtn.onclick = () => { this.openPhone(); this.openApp("wish"); };
    this.seasonBtn = document.getElementById("seasonMode");                       // 이제 라벨(고르기는 옆 #segSeason)
    addEventListener("resize", () => this.setForm());
    this.setWorld(world); this.showMode("view");
  }
  /** 도구 막대 버튼 하나: 아이콘 + 이름(휴대폰은 짧은 이름). 읽어 주기는 언제나 원래 이름 */
  toolBtn(cls, icon, label, short) {
    const b = el("button", (cls ? cls + " " : "") + "tbtn"); b.append(el("span", "ti", icon), el("span", "tl", label), el("span", "ts", short)); b.setAttribute("aria-label", label); return b;
  }
  /** 화면 모양을 정해 html[data-form]에 적음(창 크기가 바뀔 때만) */
  setForm() {
    const root = document.documentElement, auto = uiAutoScale(), k = auto * (this.uiScale || 100) / 100;
    if (this.uiAuto !== auto) { this.uiAuto = auto; if (auto === 1) root.style.removeProperty("--ui-auto"); else root.style.setProperty("--ui-auto", String(auto)); }
    const f = hudFormNow(k); this.form = f; this.phoneForm = f === "portrait" || f === "landscape";
    if (root.dataset.form !== f) root.dataset.form = f;
    root.toggleAttribute("data-narrow", f === "medium" && innerWidth / k < 900);   // 중간 화면 가운데 좁은 창(건설 판을 한 칸으로)
    root.toggleAttribute("data-short", !this.phoneForm && innerHeight / k < 600);   // 낮은 창(건물 갤러리를 한 줄로)
  }
  // ---- 화면 맞춤 설정(글자·버튼 크기 · 키 힌트 · 왼손 배치 · 움직임 줄이기 · 진동)
  /** 저장해 둔 값을 읽어 바로 적용(첫 화면이 그려지기 전) */
  initUiPrefs() {
    this.uiScale = 100; this.uiPrefs = { ...UI_PREFS_DEFAULT };
    try { const v = localStorage.getItem(UI_SCALE_KEY); if (v !== null) this.uiScale = uiScaleClamp(v); } catch { /* 저장을 못 쓰는 곳: 기본값으로 */ }
    try { const j = JSON.parse(localStorage.getItem(UI_PREFS_KEY) || "null"); if (j && typeof j === "object") for (const k of Object.keys(UI_PREFS_DEFAULT)) if (typeof j[k] === "string") this.uiPrefs[k] = j[k]; } catch { /* 무시 */ }
    this.applyUiPrefs();
    const $ = id => document.getElementById(id), range = $("uiScale");
    range.max = String(uiScaleMax());
    // 막대는 손을 뗐을 때 적용(끄는 동안 화면이 커지면 막대가 손가락 밑에서 달아남) · －/＋는 5%씩 바로
    range.oninput = () => { $("uiScaleLab").textContent = `크기: ${range.value}%`; };
    range.onchange = () => this.setUiScale(range.value);
    $("uiScaleDown").onclick = () => this.setUiScale(this.uiScale - 5);
    $("uiScaleUp").onclick = () => this.setUiScale(this.uiScale + 5);
    $("uiScaleReset").onclick = () => this.setUiScale(100);
    $("segKeyhint").onclick = e => { const b = e.target.closest?.("button[data-v]"); if (b) this.setUiPref("keyhint", b.dataset.v); };
    $("motionBtn").onclick = () => this.setUiPref("motion", document.documentElement.dataset.motion === "reduce" ? "full" : "reduce");
    $("leftHand").onclick = () => this.setUiPref("hand", this.uiPrefs.hand === "left" ? "right" : "left");
    $("vibeBtn").onclick = () => { this.setUiPref("vibe", this.uiPrefs.vibe === "off" ? "on" : "off"); if (this.uiPrefs.vibe === "on") try { navigator.vibrate?.(12); } catch { /* 무시 */ } };
    $("vibeBtn").hidden = typeof navigator.vibrate !== "function";                 // 진동이 없는 기기(아이폰 등)에선 칸을 숨김
    try { matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => this.applyUiPrefs()); } catch { /* 옛 브라우저 */ }
    this.drawUiPrefs();
  }
  /** 글자·버튼 크기(%)를 바꾸고 이 기기에 기억 */
  setUiScale(v) {
    this.uiScale = uiScaleClamp(v);
    try { localStorage.setItem(UI_SCALE_KEY, String(this.uiScale)); } catch { /* 무시 */ }
    this.applyUiPrefs(); this.drawUiPrefs();
  }
  setUiPref(key, v) {
    this.uiPrefs[key] = v;
    try { localStorage.setItem(UI_PREFS_KEY, JSON.stringify(this.uiPrefs)); } catch { /* 무시 */ }
    this.applyUiPrefs(); this.drawUiPrefs();
  }
  /** 설정 값을 html에 적음: --ui-user(배율) · data-keyhint · data-hand · data-motion · data-vibe. CSS와 tools.js(진동)·quarterView.js(화면 돌리기)가 봄 */
  applyUiPrefs() {
    const root = document.documentElement, p = this.uiPrefs, k = String(this.uiScale / 100);
    if (this.uiScale === 100) root.style.removeProperty("--ui-user"); else if (root.style.getPropertyValue("--ui-user") !== k) root.style.setProperty("--ui-user", k);
    let calm = false; try { calm = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* 무시 */ }
    const set = (name, v) => { if (root.dataset[name] !== v) root.dataset[name] = v; };
    set("keyhint", ["on", "off"].includes(p.keyhint) ? p.keyhint : "auto"); set("hand", p.hand === "left" ? "left" : "right");
    set("motion", p.motion === "reduce" || (p.motion !== "full" && calm) ? "reduce" : "full"); set("vibe", p.vibe === "off" ? "off" : "on");
    this.setForm();
  }
  /** 설정 화면의 칸을 지금 값에 맞춤 */
  drawUiPrefs() {
    const $ = id => document.getElementById(id), root = document.documentElement, max = uiScaleMax();
    $("uiScale").value = String(this.uiScale); $("uiScaleLab").textContent = `크기: ${this.uiScale}%${this.uiScale === 100 ? " (기본)" : ""}`;
    $("uiScaleDown").disabled = this.uiScale <= UI_SCALE_RANGE[0]; $("uiScaleUp").disabled = this.uiScale >= max; $("uiScaleReset").disabled = this.uiScale === 100;
    $("uiScaleNote").textContent = `75%~${max}% · 이 기기에만 기억해요(섬 저장과는 따로예요).${this.uiAuto > 1 ? ` 큰 화면이라 기본 크기를 ${Math.round(this.uiAuto * 100)}%로 맞춰 뒀어요.` : ""}`;
    for (const b of $("segKeyhint").children) { const on = b.dataset.v === root.dataset.keyhint; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
    const sw = (id, on) => { const b = $(id); b.classList.toggle("off", !on); b.setAttribute("aria-pressed", String(on)); };
    sw("motionBtn", root.dataset.motion === "reduce"); sw("leftHand", root.dataset.hand === "left"); sw("vibeBtn", root.dataset.vibe !== "off");
  }
  /** 섬에서 집을 눌렀을 때 작은 카드(저절로 닫히지 않음: ✕ · 빈 땅 누르기 · 도구 바꾸기) */
  houseCard(b) {
    const c = document.getElementById("houseCard"); if (!b) { c.hidden = true; return; }
    const w = this.world, owner = w.units.find(u => u.unitId === b.owner);
    c.querySelector("b").textContent = `🏠 ${BUILDINGS[b.defId].name}`; c.querySelector("span").textContent = `${owner ? `주인 ${owner.name}` : "주인 없음"} · 🛋 아늑함 ${Fu.comfort(b)}`;
    c.querySelector(".go").onclick = () => { c.hidden = true; this.onDecorate?.(b); }; c.querySelector(".hx").onclick = () => { c.hidden = true; }; c.hidden = false;
  }
  /** 확인창(브라우저 confirm 대신): 취소에 먼저 포커스, Esc·바깥 누르기 = 취소. 결과는 Promise<boolean> */
  confirm({ title, body = "", ok = "확인", cancel = "취소", danger = false } = {}) {
    const box = document.getElementById("ask"), yes = document.getElementById("askYes"), no = document.getElementById("askNo");
    this.askDone?.(false);                                                         // 이미 떠 있던 것은 취소로 닫음
    document.getElementById("askTitle").textContent = title; document.getElementById("askBody").textContent = body;
    yes.textContent = ok; yes.className = danger ? "danger" : "go"; no.textContent = cancel;
    const back = document.activeElement; box.hidden = false; no.focus({ preventScroll: true });
    return new Promise(res => {
      this.askDone = v => { this.askDone = null; box.hidden = true; yes.onclick = no.onclick = box.onpointerdown = box.onclick = null;
        if (back?.isConnected && !back.closest("[hidden]")) back.focus({ preventScroll: true }); res(v); };
      yes.onclick = () => this.askDone(true); no.onclick = () => this.askDone(false);
      // 바깥 누르기 = 취소. 누름과 뗌이 모두 바깥일 때 click에서 → 뗄 때의 click이 뒤의 갈매폰 버튼(새 섬 등)으로 새지 않게
      let down = false; box.onpointerdown = e => { down = e.target === box; }; box.onclick = e => { if (e.target === box && down) this.askDone(false); down = false; };
    });
  }
  askCancel() { this.askDone?.(false); }
  setSeasonLabel(t) { if (t) this.seasonBtn.textContent = `계절: ${t}`; }
  /** 설정 고르기 칸 하나를 눌렀을 때: 목표 값으로 바꾸고 라벨(기존 id)과 칸을 고침 */
  pickSetting(kind, v) {
    const lab = id => document.getElementById(id);
    if (kind === "season") this.setSeasonLabel(this.onSeasonMode?.(v === "real" ? null : v));
    else if (kind === "time") { const l = this.onTimeMode?.(v); if (l) lab("timeMode").textContent = `시간: ${l}`; }
    else if (kind === "mult") { const l = this.onTimeMult?.(+v); if (l) lab("timeMult").textContent = `시간 배수: ${l}`; }
    else if (kind === "toon") { const l = this.onToon?.(v); if (l) lab("toonBtn").textContent = `그림체: ${l}`; }
    this.syncSettings();
  }
  /** 고르기 칸의 ✓를 지금 값에 맞춤(시간 배수가 시간을 실제 시간으로 돌려놓는 것처럼 다른 곳에서 바뀌어도) */
  syncSettings() {
    const now = this.settingNow?.(); if (!now) return;
    for (const g of document.querySelectorAll(".seg[data-set]")) { const v = String(now[g.dataset.set]);
      for (const b of g.children) { const on = b.dataset.v === v; if (b.classList.contains("on") !== on) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); } } }
  }
  showSetTab(t) {
    this.setTab = t;
    for (const b of document.querySelectorAll(".stabs [data-stab]")) { const on = b.dataset.stab === t; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); }
    for (const p of document.querySelectorAll(".spanel")) p.hidden = p.dataset.stab !== t;
  }
  // ---- 갈매폰
  openPhone() { this.phone.hidden = false; this.openApp(null); this.sfx?.play("phoneOpen", { vol: 0.5 }); }
  closePhone() { if (!this.phone.hidden) this.sfx?.play("phoneClose", { vol: 0.5 }); this.phone.hidden = true; this.app = null; this.appFrom = null; }
  /** ☰ 메뉴(같은 시트를 씀) */
  openMenu() { if (this.phone.hidden) { this.phone.hidden = false; this.sfx?.play("phoneOpen", { vol: 0.5 }); } this.openApp("menu"); }
  /** ‹ 뒤로 · Esc 한 단계: 앱 → (메뉴·소식지에서 왔으면 그곳, 아니면 홈) → 닫기 */
  phoneBackStep() {
    if (this.app == null || this.app === "menu") this.closePhone();
    else this.openApp(this.appFrom || null);
  }
  initSound() {
    const b = document.getElementById("sfxBtn"), v = document.getElementById("sfxVol"), s = this.sfx, label = () => { b.textContent = `소리: ${s.on ? "켬" : "끔"}`; };
    label(); v.value = Math.round(s.volume * 100); b.onclick = () => { s.setOn(!s.on); label(); }; v.oninput = () => s.setVolume(v.value / 100);
  }
  openApp(app, from = null) {
    if (app !== this.app && this.sbody) this.sbody.scrollTop = 0;                    // 다른 페이지로 가면 맨 위부터
    this.app = app; this.appFrom = app == null || app === "menu" ? null : from;
    const pages = { null: "pageHome", menu: "pageMenu", log: "pageLog", gulls: "pageGulls", bank: "pageBank", market: "pageMarket", summon: "pageSummon", files: "pageFiles", settings: "pageSettings", help: "pageHelp", wish: "pageWish", town: "pageTown", decor: "pageDecor", rel: "pageRel", news: "pageNews", dex: "pageDex" };
    const titles = { null: "📱 갈매폰", menu: "☰ 메뉴", log: "🔔 지난 알림", gulls: "🐦 갈매미", bank: "🏦 공식은행", market: "🐚 시장", summon: "🥚 소환", files: "💾 저장", settings: "⚙ 설정", help: "❓ 도움말", wish: "💭 소원 · 오늘의 부탁", town: "🏅 마을", decor: "🛋 집 꾸미기", rel: "💞 관계도", news: "📰 소식지", dex: "📖 도감 · 가방" };
    for (const [k, id] of Object.entries(pages)) document.getElementById(id).hidden = String(app) !== k;
    document.getElementById("phoneTitle").textContent = titles[app];
    document.getElementById("phoneBack").hidden = app === null || app === "menu";
    if (app === "dex") this.drawDex();                                              // 도감은 열 때 한 번만 그림(읽는 중에 튀지 않게)
    if (app === "settings") { this.showSetTab(this.setTab); this.drawInstant?.(); }
    if (this.seen && (app === "news" || app === "dex")) this.seen[app] = this.badgeNow()[app];   // 열면 점 배지 해제
    this.refreshApp(); this.drawBadges();
  }
  /** 화면 구역의 크기를 CSS 변수로: 도구 막대(--dock-h) · 칩 묶음(--chips-h/-w) · 따라가기 카드(--info-h).
   *  크기가 바뀔 때만 ResizeObserver가 알려 줌(매 프레임 재지 않음) → 📱·카드·집 카드·확인 막대·당기기·미니맵·알림 자리는 CSS가 맞춤 */
  watchSizes() {
    const root = document.documentElement, top = document.getElementById("top"), chips = document.getElementById("chips");
    const put = (k, v) => { const px = `${Math.round(v)}px`; if (root.style.getPropertyValue(k) !== px) root.style.setProperty(k, px); };
    const measure = () => { const t = top.getBoundingClientRect(), c = chips.getBoundingClientRect(), i = this.info.getBoundingClientRect();
      put("--dock-h", t.height); put("--chips-h", c.height); put("--chips-w", c.width); put("--info-h", i.height); };
    if (typeof ResizeObserver === "function") { const ro = new ResizeObserver(measure); for (const e of [top, chips, this.info]) ro.observe(e); }
    else addEventListener("resize", measure);
    measure();
  }
  refreshApp() {
    const w = this.world;
    if (this.app === "bank") {
      const r = w.res;
      document.getElementById("bankBody").innerHTML = w.economy ? `<table class="tbl"><tr><td>찍어 낸 돈(발행)</td><td>🪙${w.bank.issued}</td></tr><tr><td>집값으로 돌아온 돈(회수)</td><td>🪙${w.bank.returned}</td></tr>` +
        `<tr><td><b>갈매미들이 가진 돈</b></td><td><b>🪙${w.moneySupply()}</b></td></tr></table>` +
        `<h4>은행이 사는 가공품(상인이 가져옴)</h4><table class="tbl">${E.RAW.map(k => `<tr><td>${E.ITEM_ICON[k]} ${E.PROCESSED_NAME[k]}</td><td>창고 ${r[k] || 0}개 · 🪙${E.BANK_PROCESSED[k]}</td></tr>`).join("")}</table>` +
        `<p class="dim">돈이 생기는 곳: 🔨 공사 한 바퀴 품삯 🪙${E.WAGE}(건축가·목수) · 🐚 상인이 가공품을 팔 때 · 상인 창업 자금 🪙${E.MERCHANT_START}. 창고의 가공품은 공사 재료로 써요.</p>`
        : `<p class="dim">이 섬에는 공식은행이 없어요(예전 섬).</p>`;
    } else if (this.app === "market") {
      const mk = w.marketB(), sale = w.housesForSale(), m = w.merchantU(), food = w.units.filter(u => E.isProducer(u));
      document.getElementById("marketBody").innerHTML = !mk ? `<p>아직 시장이 없어요. <b>🪚 목수</b>가 있으면 🏠 건설에서 <b>시장</b>을 지을 수 있어요.</p>`
        : `<h4>시세(상인이 사는 값)</h4><p class="dim">상인 창고에 많이 쌓이면 싸지고, 모자라면 비싸져요.</p>${m ? `<table class="tbl">${E.RAW.map(k => `<tr><td>${E.ITEM_ICON[k]} ${E.ITEM_NAME[k]}</td><td>${this.priceCell(k)} · 창고 ${(m.raw[k] || 0) + (m.goods[k] || 0)}</td></tr>`).join("")}<tr><td>상인(${m.name}) 돈</td><td>🪙${m.coins || 0}</td></tr></table>` : `<p class="dim">상인 🐚 갈매미가 없어요(소환하면 와요).</p>`}` +
          `<h4>팔리는 집</h4>${sale.length ? `<table class="tbl">${sale.map(b => `<tr><td>🏠 ${BUILDINGS[b.defId].name}${BUILDINGS[b.defId].forUnit ? ` (${BUILDINGS[b.defId].forUnit} 전용)` : ""}</td><td>🪙${BUILDINGS[b.defId].price}</td></tr>`).join("")}</table>` : `<p class="dim">다 팔렸어요. 건축가가 집을 더 지으면 여기에 나와요.</p>`}` +
          `<h4>음식(농부·어부에게서 ${this.priceCell("food")})</h4><p class="dim">농부·어부가 내놓을 음식이 모자라거나 배고픈 갈매미가 많으면 비싸지고, 겨울엔 더 비싸요.</p><table class="tbl">${food.map(u => `<tr><td>${JOBS[u.job].icon} ${u.name}</td><td>🍗${u.inv?.food || 0} 🐟${u.inv?.fish || 0}</td></tr>`).join("") || `<tr><td class="dim">농부·어부가 없어요</td><td></td></tr>`}</table>` +
          `<h4>집 주인</h4><table class="tbl">${w.units.filter(u => u.home).map(u => `<tr><td>${u.name}</td><td>${BUILDINGS[w.buildings.get(u.home)?.defId]?.name ?? ""}</td></tr>`).join("") || `<tr><td class="dim">아직 없어요</td><td></td></tr>`}</table>`;
    } else if (this.app === "decor") {
      const houses = [...w.buildings.values()].filter(b => BUILDINGS[b.defId].house && w.isDone(b));
      const body = document.getElementById("decorBody");
      if (this.decorKey === houses.map(b => b.id + ":" + Fu.comfort(b) + ":" + (b.owner || "")).join(",")) return;   // 바뀐 게 없으면 다시 안 그림(버튼이 눌리게)
      this.decorKey = houses.map(b => b.id + ":" + Fu.comfort(b) + ":" + (b.owner || "")).join(",");
      body.innerHTML = `<p class="dim">집에 들어가 가구를 놓고 바닥·벽지를 바꿔요. 놓은 가구는 그 집 갈매미가 써요(침대에서 낮잠 등). 집주인은 돈이 모이면 잡화점에서 가구를 사 와요.</p>`;
      if (!houses.length) body.innerHTML += `<p>아직 다 지은 집이 없어요.</p>`;
      for (const b of houses) { const owner = w.units.find(u => u.unitId === b.owner), row = el("div", "row");
        row.append(el("span", "nm", `🏠 ${BUILDINGS[b.defId].name}`), el("span", "act", `${owner ? `주인 ${owner.name}` : "주인 없음"} · 🛋 ${Fu.comfort(b)}`));
        row.onclick = () => { this.closePhone(); this.onDecorate?.(b); }; body.appendChild(row); }
    } else if (this.app === "town") {
      const { score, parts } = rankScore(w), cur = RANKS[w.rank], nxt = RANKS[w.rank + 1];
      const pct = nxt ? Math.min(100, Math.round((score - cur.need) / (nxt.need - cur.need) * 100)) : 100;
      const d = this.today?.() || new Date(), m = d.getMonth() + 1;
      const toWinter = w.season === "winter" || m === 12 || m <= 2 ? 0 : Math.ceil((new Date(d.getFullYear(), 11, 1) - d) / 86400000);   // 다음 12월 1일까지(기상청 겨울 시작)
      const gr = w.granaryB(), BN = id => BUILDINGS[id].name;
      // 계절 축제의 날: 이번 계절 축제가 어디까지 왔는지 + 지난 축제 도장
      const fNow = festivalOf(w.festKey), stamps = festivalStamps(w.festivals), plaza = festivalPlaza(w), fGift = fNow && festivalGift(fNow.key), fOn = w.festival && festivalOf(w.festival.id);
      const fLine = fOn ? `<b>${fOn.def.icon} ${fOn.def.name}</b>가 열리고 있어요! 남은 시간 <b>${Math.max(0, Math.ceil(w.festival.t))}초</b> · 함께한 갈매미 ${w.festival.who.length}마리`
        : !fNow ? `<span class="dim">축제 달력을 읽는 중이에요.</span>`
        : w.festivals[fNow.key] ? `올해 <b>${fNow.def.icon} ${fNow.def.name}</b>는 잘 치렀어요. 다음 계절에 또 만나요!`
        : w.rank < FESTIVAL_RANK ? `<span class="dim">🔒 마을 등급이 ${RANKS[FESTIVAL_RANK].icon} ${RANKS[FESTIVAL_RANK].name}이 되면 계절마다 축제를 열 수 있어요.</span>`
        : `<b>${fNow.def.icon} ${fNow.def.name}</b> 준비 중 · 광장 장식 <b>${Math.min(plaza.n, FESTIVAL_NEED)} / ${FESTIVAL_NEED}</b><br><span class="dim">🏠 건설에서 축제 장식(${Object.values(BUILDINGS).filter(d => d.festive).map(d => d.name).join("·")})을 ${FESTIVAL_RADIUS}칸 안에 ${FESTIVAL_NEED}개 모으면 "축제 하자!" 소원이 이루어져요${plaza.ok ? " · 광장은 다 모였어요! 새 장식을 하나만 더 놓으면 열려요" : ""}${fGift ? ` · 끝나면 🎁 ${fGift.name}` : ""}</span>`;
      const fHtml = `<h4>🎪 계절 축제</h4><p id="festNow">${fLine}</p><div class="stamps" id="festStamps">${stamps.map(x => `<span class="stamp" data-fest="${x.key}">${x.def.icon}<small>${x.year} ${SEASONS[x.season].name}</small></span>`).join("") || `<span class="dim">아직 찍은 축제 도장이 없어요.</span>`}</div>`;
      document.getElementById("townBody").innerHTML =
        `<div class="rankhead"><span class="big">${cur.icon}</span><div><b>${cur.name}</b><div class="dim">점수 ${score}${nxt ? ` / 다음 ${nxt.icon} ${nxt.name} ${nxt.need}` : " · 가장 높은 등급"}</div></div></div>` +
        `<div class="rbar"><i style="width:${pct}%"></i></div>` +
        (nxt ? `<p class="dim">${nxt.name}이 되면: ${nxt.unlock.map(BN).join(", ")} 건설 · 갈매미마다 축하금 🪙${RANK_REWARD}</p>` : "") +
        `<table class="tbl">${parts.map(([name, n, per, pts]) => `<tr><td>${name}</td><td>${n} × ${per} = <b>${pts}</b></td></tr>`).join("")}</table>` +
        fHtml +
        `<h4>❄️ 겨울 대비</h4><p>${toWinter > 0 ? `겨울(12월 1일)까지 <b>${toWinter}일</b>` : `<b>지금 겨울이에요</b>`} · ${SEASONS.winter.icon} 겨울엔 밭이 절반 속도로 자라고, 배가 1.25배 빨리 고프고, 음식 값이 올라요.</p>` +
        (gr ? `<p>🏚 저장고 음식 <b>${w.granary}</b> / ${E.GRANARY_MAX} · 농부·어부가 남는 음식을 🪙${E.GRANARY_BUY}에 팔아 쌓고, 배고픈 갈매미는 시세대로 사 가요(돈이 없고 아주 배고프면 나눠 받아요).</p>`
          : `<p class="dim">저장고가 없어요. 🪚 목수가 있으면 🏠 건설에서 <b>저장고</b>를 지을 수 있어요.</p>`) +
        `<h4>등급별 건물</h4><table class="tbl">${RANKS.slice(1).map((r, i) => `<tr><td>${w.rank >= i + 1 ? "✅" : "🔒"} ${r.icon} ${r.name} (${r.need}점)</td><td>${r.unlock.map(BN).join(", ")}</td></tr>`).join("")}</table>`;
    } else if (this.app === "wish") {
      this.drawDaily();
      const rows = w.wishes.map(x => { const d = WISH_BY_ID[x.id], u = w.units.find(o => o.unitId === x.unitId); return `<tr><td>${d.icon} <b>${u?.name ?? ""}</b>: ${wishText(d, w, u, x)}</td><td class="dim">${d.hint}</td></tr>`; }).join("");
      document.getElementById("wishBody").innerHTML = `<p class="dim">갈매미가 가끔 마을에 바라는 것을 말해요. 들어주면 기뻐하고 ${w.economy ? `공식은행이 축하금 🪙${WISH_REWARD}을 줘요` : "배가 조금 불러요"}.</p>` +
        (rows ? `<table class="tbl">${rows}</table>` : `<p class="dim">지금은 바라는 게 없어요.</p>`) + `<p>이룬 소원: <b>${w.wishDone}</b>개</p>`;
    } else if (this.app === "rel") {
      this.drawRelations();
    } else if (this.app === "news") {
      this.drawNews();
    } else if (this.app === "log") {
      this.drawLog();
    } else if (this.app === "files") {
      document.getElementById("saveInfo").textContent = this.savedLabel?.() || "";
    } else if (this.app === "summon") {
      this.setSummon(w);
    } else if (this.app === "settings") {
      this.syncSettings();
      const ci = this.chunkInfo || {}, dev = `🧩 땅 ${ci.tris ? Math.round(ci.tris / 1000) + "천 삼각형" : "—"} · ${ci.fps ? `${ci.fps} fps` : "fps —"} · 조각 ${ci.count ?? "—"}`;
      const ds = document.getElementById("devStats"); if (ds.textContent !== dev) ds.textContent = dev;
    }
  }
  /** 배지에 쓰는 값: 할 일(도장으로 지금 받을 수 있는 가구 수) · 새 소식(소식지 마지막 기사 · 도감에 모은 가짓수) */
  badgeNow() {
    const w = this.world, log = w.newsLog || [], last = log[log.length - 1];
    return { act: STAMP_SHOP.filter(s => (w.stamps || 0) >= s.stamp).length,
      news: `${log.length}|${last?.t}|${last?.text}`,
      dex: Object.keys(w.collection || {}).length + Object.keys(w.items || {}).filter(k => w.items[k]).length + Object.keys(w.skySeen || {}).length };
  }
  /** 📱 버튼과 앱 아이콘의 배지(바뀔 때만 손댐). 빨간 숫자가 있으면 📱엔 점을 따로 안 붙임 */
  drawBadges() {
    const now = this.badgeNow(); if (!this.seen) this.seen = { news: now.news, dex: now.dex };
    if (!this.phone.hidden && (this.app === "news" || this.app === "dex")) this.seen[this.app] = now[this.app];   // 보는 중에 온 소식도 본 것으로
    const newNews = now.news !== this.seen.news && this.app !== "news", newDex = now.dex > this.seen.dex && this.app !== "dex";
    const key = `${now.act}|${newNews}|${newDex}`; if (key === this.badgeKey) return; this.badgeKey = key;
    const cnt = this.phoneBtn.querySelector(".badge-count"), dot = this.phoneBtn.querySelector(".dot");
    cnt.hidden = !now.act; cnt.textContent = now.act || ""; dot.hidden = !!now.act || !(newNews || newDex);
    this.phoneBtn.setAttribute("aria-label", `갈매폰${now.act ? ` · 받을 수 있는 것 ${now.act}개` : ""}${newNews || newDex ? " · 새 소식" : ""}`);
    const wb = this.appBtns?.wish; if (wb) for (const e of [wb, wb.firstElementChild]) { if (!e) continue; if (now.act) e.dataset.count = now.act; else delete e.dataset.count; }   // 숫자는 아이콘(span)의 ::after가 attr로 읽음
    this.appBtns?.news?.classList.toggle("new", newNews); this.appBtns?.dex?.classList.toggle("new", newDex);
  }
  /** 📱 소원 앱 맨 위 「오늘」: 오늘의 부탁(나아간 만큼 막대) · 모은 도장 · 도장 가게. 바뀐 게 없으면 다시 안 그림(가게 단추가 눌리게) */
  drawDaily() {
    const w = this.world, d = w.daily, body = document.getElementById("dailyBody");
    const key = `${d?.key}|${d?.reqs.map(r => r.id + r.have).join(",")}|${d?.stamped}|${w.stamps}|${STAMP_SHOP.map(s => w.stampBought[s.id] || 0).join(",")}`;
    if (key === this.dailyDrawn && body.firstChild) return;
    this.dailyDrawn = key; const open = body.querySelector("details")?.open || w.stamps > 0;   // 가게를 펼쳐 뒀으면 다시 그려도 그대로 · 도장이 있으면 펼쳐서 보여 줌
    body.onclick = e => { const b = e.target.closest?.("[data-stamp]"); if (!b || b.disabled) return; this.onStampBuy?.(b.dataset.stamp); this.drawDaily(); };
    const reqs = !d ? `<p class="dim">오늘의 부탁을 읽는 중이에요.</p>` : !d.reqs.length ? `<p class="dim">오늘은 부탁이 없어요. 갈매미를 불러 마을을 시작해 보세요.</p>`
      : d.reqs.map(r => { const ok = r.have >= r.need; return `<div class="dreq${ok ? " done" : ""}" data-daily="${r.id}"><span class="ico">${ok ? "✅" : r.icon}</span><div><div class="dtx"><span>${escHtml(r.text)}</span><em>${r.have} / ${r.need}</em></div><div class="rbar"><i style="width:${Math.round(r.have / r.need * 100)}%"></i></div></div></div>`; }).join("");
    const note = !d?.reqs.length ? "" : d.stamped ? `<p class="dnote"><b>오늘의 부탁을 모두 들어줬어요!</b> 도장 하나를 받았어요. 내일 새 부탁이 와요.</p>`
      : `<p class="dim">${d.reqs.length >= DAILY_COUNT ? "세 가지" : "오늘의 부탁"}를 모두 들어주면 도장 하나를 받아요. 날짜가 바뀌면 새 부탁으로 바뀌어요.</p>`;
    const shop = STAMP_SHOP.map(s => { const f = FURNITURE[s.furniture], n = w.stampBought[s.id] || 0;
      return `<div class="sitem"><i style="background:${hex(f.colors[0])}"></i><div><b>${s.name}</b><span class="dim">가구 · 아늑함 +${f.comfort}${n ? ` · ${n}개 받았어요` : ""}</span></div><button data-stamp="${s.id}"${w.stamps < s.stamp ? " disabled" : ""}>도장 ${s.stamp}개</button></div>`; }).join("");
    body.innerHTML = `<h4 class="dhead">📋 오늘의 부탁<span id="stampCount" title="모은 도장">도장 ${w.stamps}개</span></h4>${reqs}${note}` +
      `<details class="sshop"${open ? " open" : ""}><summary>🏪 도장 가게 <span class="dim">도장으로만 바꾸는 한정 가구</span></summary>${shop}<p class="dim">받은 가구는 🏠 집 꾸미기에서 아무 집에나 놓아요.</p></details><h4>💭 갈매미의 소원</h4>`;
  }
  /** 📱 소식지: 마을 날짜별(새 날부터) 머릿기사. 하루 = 마을 시간 NEWS_DAY_SECS초, 최근 NEWS_KEEP_DAYS일치. */
  drawNews() {
    const w = this.world, body = document.getElementById("newsBody"), today = newsDay(w.time), log = w.newsLog, last = log[log.length - 1];
    const key = `${today}|${log.length}|${last?.t}|${last?.text}`;
    if (key === this.newsKey && body.firstChild) return;                            // 바뀐 게 없으면 다시 안 그림(읽는 중에 화면이 튀지 않게)
    this.newsKey = key;
    const pages = newsPages(log).map(p => `<section class="newsday"><h4>${p.day === today ? "오늘" : p.day === today - 1 ? "어제" : `${today - p.day}일 전`} <span class="dim">마을 ${p.day}일째</span></h4>` +
      `<ul>${p.heads.map((e, i) => `<li class="${i ? "" : "top"}"><span class="ico">${e.icon}</span><span>${escHtml(e.text)}</span></li>`).join("")}</ul>` +
      (p.more ? `<p class="dim">그 밖의 소식 ${p.more}건</p>` : "") + `</section>`).join("");
    body.innerHTML = `<p class="dim">오늘은 마을 <b>${today}일째</b>예요. 마을에서 일어난 큰일을 하루에 ${NEWS_HEADLINES}건까지 골라 실어요(최근 ${NEWS_KEEP_DAYS}일).</p>` +
      (pages || `<p class="dim">아직 실을 소식이 없어요. 집을 짓거나, 소원을 들어주거나, 귀한 물고기를 낚으면 여기에 실려요.</p>`);
  }
  /** 💌 다녀온 사이 편지(없으면 아무것도 안 함) */
  showLetter(letter) {
    if (!letter) return;
    const box = document.getElementById("letter");
    document.getElementById("letterTitle").textContent = letter.title;
    document.getElementById("letterBody").innerHTML = letter.lines.map(l => `<p>${escHtml(l)}</p>`).join("") + `<p class="sign">${escHtml(letter.sign)}</p>`;
    box.hidden = false; this.sfx?.play("phoneOpen", { vol: 0.5 });
    const close = () => { box.hidden = true; };
    document.getElementById("letterClose").onclick = close; document.getElementById("letterNews").onclick = () => { close(); this.openPhone(); this.openApp("news"); };
    let down = false; box.onpointerdown = e => { down = e.target === box; }; box.onclick = e => { if (e.target === box && down) close(); down = false; };   // 바깥 누르기: 뒤로 click이 새지 않게
  }
  /** 📱 관계도: 갈매미를 원 위에 놓고 친한 사이를 선으로(친할수록 굵고 따뜻한 색). 갈매미를 누르면 그 갈매미의 사이를 글로. */
  drawRelations() {
    const w = this.world, us = w.units, body = document.getElementById("relBody"), ST = M.FRIEND_STAGES;
    if (!us.some(u => u.name === this.relSel)) this.relSel = null;
    const g = M.relationGraph(us), sel = us.findIndex(u => u.name === this.relSel);
    const key = `${this.relSel}|${us.map(u => u.name + u.job).join(",")}|${us.map(u => us.map(o => M.affinity(u, o).toFixed(1)).join(" ")).join(",")}`;
    if (key === this.relKey && body.firstChild) return;                             // 바뀐 게 없으면 다시 안 그림(누르기가 끊기지 않게)
    this.relKey = key;
    body.onclick = e => { const t = e.target.closest?.("[data-gull]"); if (!t) return; this.relSel = this.relSel === t.dataset.gull ? null : t.dataset.gull; this.drawRelations(); };
    if (!us.length) { body.innerHTML = `<p class="dim">갈매미가 아직 없어요. 📱 → 🥚 소환으로 불러 보세요.</p>`; return; }
    const lines = g.links.map(l => { const a = g.nodes[l.a], b = g.nodes[l.b], d = ST[l.stage], dim = sel >= 0 && l.a !== sel && l.b !== sel;
      return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${d.color}" stroke-width="${d.width}" stroke-linecap="round" opacity="${dim ? 0.2 : 1}"/>`; }).join("");
    const dots = g.nodes.map((n, i) => `<g class="relnode" data-gull="${n.name}"><circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="26" fill="transparent"/>` +
      `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="19" fill="${i === sel ? "#ffe9a8" : "#fbe3cf"}" stroke="${i === sel ? "#e0573e" : "#e3c9ad"}" stroke-width="${i === sel ? 3 : 1.5}"/>` +
      `<text class="ico" x="${n.x.toFixed(1)}" y="${n.y.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${JOBS[n.u.job]?.icon ?? n.name[0]}</text>` +
      `<text x="${n.x.toFixed(1)}" y="${(n.y + 33).toFixed(1)}" text-anchor="middle">${n.name}</text></g>`).join("");
    const count = s => g.links.filter(l => l.stage === s).length;
    let text;
    if (us.length === 1) text = `<p class="dim">${us[0].name} 혼자예요. 🥚 소환으로 친구를 불러 주면 인사하며 친해져요.</p>`;
    else if (sel < 0) text = `<p>💞 단짝 <b>${count(2)}</b>쌍 · 🧡 친구 <b>${count(1)}</b>쌍</p><p class="dim">갈매미를 누르면 누구와 얼마나 친한지 보여 줘요. 만나서 인사할 때마다 조금씩 친해져요(호감 ${ST[1].min}부터 친구, ${ST[2].min}부터 단짝).</p>`;
    else { const u = us[sel], rows = us.filter(o => o !== u).map(o => [o, M.affinity(u, o)]).sort((a, b) => b[1] - a[1]).map(([o, v]) => { const d = ST[M.friendStage(v)];
        return `<tr><td>${v ? d.icon : "·"} ${o.name}</td><td>${v ? `<b>${d.name}</b> <span class="dim">호감 ${Math.round(v * 10) / 10}</span>` : `<span class="dim">아직 잘 몰라요</span>`}</td></tr>`; }).join("");
      text = `<h4>${JOBS[u.job]?.icon ?? ""} ${u.name}의 사이</h4><table class="tbl">${rows}</table>`; }
    body.innerHTML = `<svg viewBox="0 0 300 300" role="img" aria-label="갈매미 관계도">${lines}${dots}</svg>` +
      `<div class="rellegend">${ST.map(d => `<span><i style="height:${d.width}px;background:${d.color}"></i>${d.name}</span>`).join("")}</div>${text}`;
  }
  /** 시세 칸: 지금 값 + 지난 기록과 비교한 화살표 + 작은 그래프(20초마다 한 점, 최근 16분) */
  priceCell(k) {
    const w = this.world, h = w.priceHist.map(p => p[k]), now = w.prices[k], prev = h.length > 1 ? h[h.length - 2] : now;
    const arrow = now > prev ? `<span style="color:#c0392b">▲</span>` : now < prev ? `<span style="color:#2471a3">▼</span>` : `<span class="dim">–</span>`;
    let spark = "";
    if (h.length > 1) {
      const lo = Math.min(...h), hi = Math.max(...h), W = 64, Hh = 16, pts = h.map((v, i) => `${(i / (h.length - 1) * W).toFixed(1)},${(Hh - 2 - (hi > lo ? (v - lo) / (hi - lo) : 0.5) * (Hh - 4)).toFixed(1)}`).join(" ");
      spark = ` <svg width="${W}" height="${Hh}" style="vertical-align:middle" aria-label="최근 시세 ${lo}~${hi}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".7"/></svg>`;
    }
    return `🪙<b>${now}</b> ${arrow}${spark}`;
  }
  setWorld(world) {
    this.world = world; this.list.innerHTML = "";
    // 줄마다: 직업 아이콘 · 이름(희귀도 색) · 하는 일 · 포만감
    this.rows = world.units.map(u => { const r = el("div", "row"), nm = el("span", "nm");
      nm.append(el("span", "job", JOBS[u.job]?.icon ?? ""), u.name); nm.style.color = RARITY[u.rarity]?.color;
      nm.dataset.tip = `${RARITY[u.rarity]?.name} ${JOBS[u.job]?.name}: ${JOBS[u.job]?.desc}`;
      r.append(nm, el("span", "act"), el("span", "coins"), el("span", "full"));
      r.onclick = () => { this.onUnitClick?.(u); this.closePhone(); }; this.list.appendChild(r); return r; });
    this.follow = null; this.seen = null; this.badgeKey = null; this.trayKey = null;   // 새 섬·불러오기: 배지 기준 · 건물 갤러리도 새로
  }
  /** 트레이의 묶음 하나(작은 이름 + 버튼들). 버튼을 담을 칸을 돌려줌 */
  trayGroup(label) { const g = el("div", "tgrp"), box = el("div", "tgb"); g.setAttribute("role", "group"); g.setAttribute("aria-label", label); g.append(el("span", "lab", label), box); this.sub.appendChild(g); return box; }
  /** 칠하기·높이 공통: 붓 크기(1×1 · 3×3 · 5×5 · 7×7, [ ] 키) → 모양(붓·길·네모). ↶ ↷ 🎯은 보조 줄에 */
  addEditTools() {
    const t = this.tools, bb = this.trayGroup("붓 크기");
    this.brushBtns = [1, 3, 5, 7].map(n => { const b = el("button", n === t.brush ? "on" : "", `${n}×${n}`); b.dataset.brush = n; b.onclick = () => t.setBrush(n); bb.appendChild(b); return b; });
    const sb = this.trayGroup("모양");
    for (const [s, label] of [["brush", "🖌 붓"], ["line", "〰 길"], ["rect", "▭ 네모"]]) { const b = el("button", t.shape === s ? "on" : "", label); b.dataset.shape = s; b.onclick = () => { t.setShape(s); this.showMode(t.mode, t.mode === "paint" ? t.paintType : t.heightOp); }; sb.appendChild(b); }
  }
  /** 건물 카드 하나: 사진(실제 모델) + 크기 딱지 + 이름 + 재료(잠겼으면 그 이유를 글자로) */
  buildCard(def) {
    const w = this.world, rankLock = (def.rank || 0) > w.rank, locked = rankLock || !w.builderFor(def), tierName = RARITY[["", "common", "rare", "epic", "legend"][def.tier]].name;
    const who = def.builtBy === "carpenter" ? "🪚 목수" : "🔨 건축가", size = `${def.footprint.w}×${def.footprint.d}`;
    const cost = Object.entries(def.cost || {}).filter(([, n]) => n > 0).map(([k, n]) => `${E.ITEM_ICON[k] ?? k}${n}`).join(" ") || "재료 없음";
    const why = rankLock ? `${RANKS[def.rank].icon} ${RANKS[def.rank].name}부터` : locked ? `${who} 필요` : def.winterOnly && w.season !== "winter" ? "❄️ 겨울에만" : "";   // 잠긴 이유는 글자로(🔒 딱지는 사진 위에)
    const b = el("button", "bcard" + (locked ? " locked" : "")); b.dataset.build = def.id; b.dataset.cat = buildCatOf(def);
    // 사진: 미리 찍어 둔 그림을 먼저, 못 읽으면 그 자리에서 찍어 줌(그동안은 빈 칸이 반짝임). 한 번 만든 <img>는 다시 그려도 그대로 씀
    this.thumbImgs ||= new Map(); let pic = this.thumbImgs.get(def.id);
    if (!pic) {
      pic = el("span", "bimg"); const img = new Image(); img.alt = ""; img.decoding = "async"; img.draggable = false;
      img.onload = () => pic.classList.add("ok");
      img.onerror = () => { img.onerror = null; this.thumbs?.request(def.id).then(u => { if (u) img.src = u; }); };
      pic.appendChild(img); this.thumbImgs.set(def.id, pic);
      if (this.thumbs) img.src = this.thumbs.url(def.id);
    }
    b.append(pic, el("span", "bsz", size), el("span", "bnm", def.name), el("span", "bmeta", why || cost)); if (locked) b.append(el("span", "block", "🔒"));
    b.setAttribute("aria-label", `${def.name}, ${size}칸, 재료 ${cost}${why ? `, ${locked ? "잠김: " : ""}${why}` : ""}`);
    b.dataset.tip = `${def.name} ${size}칸 · 재료 ${cost} · ${def.tier > 1 ? tierName + " 이상 " : ""}${who}가 지어요${def.price ? ` · 다 지으면 시장에서 🪙${def.price}에 팔려요` : ""}${rankLock ? ` (🏅 마을 등급 ${RANKS[def.rank].icon} ${RANKS[def.rank].name}부터)` : locked ? " (지금은 없음)" : ""}`;
    b.onclick = () => this.tools.setMode("build", def.id); return b;
  }
  /** 건물 갤러리: 잠금·계절이 바뀔 때만 카드를 다시 만들고, 고르기만 했으면 표시만 바꿈(사진이 깜빡이지 않고 밀어 둔 자리도 그대로) */
  drawBuildTray(arg) {
    const w = this.world, defs = Object.values(BUILDINGS).filter(d => d.menu !== false);   // 은행·예전 건물은 메뉴에서 뺌
    const key = `${w.rank}|${w.season}|${defs.map(d => w.builderFor(d) ? 1 : 0).join("")}`;
    if (key !== this.trayKey || w !== this.trayWorld) { this.trayKey = key; this.trayWorld = w; this.buildCards = defs.map(d => this.buildCard(d)); }
    for (const c of this.buildCards) { const on = c.dataset.build === arg; c.classList.toggle("on", on); c.setAttribute("aria-pressed", String(on)); }
    this.sub.append(...this.buildCards); this.filterBuild();
  }
  filterBuild() {
    for (const b of this.catBtns) { const on = b.dataset.cat === this.buildCat; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
    for (const c of this.buildCards || []) c.hidden = this.buildCat !== "all" && c.dataset.cat !== this.buildCat;
  }
  showMode(mode, arg) {
    document.getElementById("houseCard").hidden = true;                             // 도구를 바꾸면 집 카드는 닫음
    const dm = mode === "view" ? "browse" : "edit"; if (document.body.dataset.mode !== dm) document.body.dataset.mode = dm;   // 평소(browse) · 건설 모드(edit): 배치는 CSS가
    if (mode !== "view") this.lastEdit = mode;
    this.modeBtns.forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    if (mode === "view" && this.tools.hand) this.tools.setHand(false);
    const terrain = mode === "paint" || mode === "height", sub = this.sub;
    if (!terrain && this.tools.cross) this.tools.setCross(false);                   // 십자선은 칠하기·높이에서만(켜 둔 채 짓기로 가면 누르기가 안 먹던 것)
    // 보조 줄: 도구에 맞는 것만
    this.ecats.hidden = mode !== "build"; this.ehint.hidden = mode !== "demolish"; this.crossBtn.hidden = !terrain; this.crossBtn.classList.toggle("on", this.tools.cross);
    this.undoBtns[0].hidden = this.undoBtns[1].hidden = !terrain; this.undoBtns[0].disabled = !this.tools.history.length; this.undoBtns[1].disabled = !this.tools.redoStack.length;
    for (const b of this.viewBtns) b.hidden = mode === "view";                      // 평소엔 Z·X 키도 쉬게
    // 트레이: 같은 도구 안에서 고르기만 했으면 밀어 둔 자리를 지킴
    const keep = mode === this.shownMode ? [sub.scrollLeft, sub.scrollTop] : null; this.shownMode = mode;
    sub.replaceChildren(); sub.hidden = !(terrain || mode === "build"); sub.dataset.kind = mode;
    if (mode === "height") {
      this.lastHeight = arg; const ob = this.trayGroup("높이 바꾸기");
      for (const [op, label] of [["raise", "⬆ 올리기"], ["lower", "⬇ 내리기"], ["smooth", "〰 다듬기"], ["flatten", "▬ 평평하게"], ["level", "🎚 단 맞추기"]]) {
        const b = el("button", op === arg ? "on" : "", label); b.dataset.op = op; b.onclick = () => this.tools.setMode("height", op); ob.appendChild(b); }
      if (arg === "level") { const lb = this.trayGroup("맞출 높이"); for (const hgt of [0, 0.5, 1, 1.5, 2]) { const b = el("button", this.tools.levelH === hgt ? "on" : "", `${hgt} m`); b.dataset.level = hgt; b.onclick = () => { this.tools.levelH = hgt; this.showMode("height", "level"); }; lb.appendChild(b); } }
      this.addEditTools();
      this.status(arg === "level" ? `🎚 단 맞추기: 문지른 곳을 ${this.tools.levelH} m 높이로 맞춰요(한 번에 여러 번 눌러 올릴 필요 없음)` : "붓 안 전체가 한 번에 0.5 m씩(옆과 턱이 생김 · 오르내리려면 🏠 계단) · 다듬기: 울퉁불퉁한 곳을 매끈하게 · 바다 높이 아래로 파면 연못");
    }
    if (mode === "paint") {
      this.lastPaint = arg; const pb = this.trayGroup("바닥");
      for (const t of GROUND_TYPES) { const b = el("button", t === arg ? "on" : ""); b.dataset.ground = t;
        const sw = el("span", "sw"); sw.style.background = hex(GROUND_STYLE[t].colors[0]); b.append(sw, GROUND_STYLE[t].label);
        b.onclick = () => this.tools.setMode("paint", t); pb.appendChild(b); }
      this.addEditTools();
    }
    if (mode === "build") {
      this.lastBuild = arg;
      if (!this.world.units.some(u => u.job === "builder")) this.status("🔨 건축 갈매미가 있어야 지을 수 있어요 · 🥚 소환으로 불러 보세요");
      this.drawBuildTray(arg);                                                      // ↻ 돌리기는 자리를 정하면 뜨는 확인 막대에(R 키는 그대로) · ⚡ 바로 완공은 설정 → 🛠 개발자
    }
    if (mode === "demolish") this.status("🧹 철거: 없앨 건물을 누르면 바로 사라져요 · 되돌릴 수 없으니 천천히 골라요");
    if (keep) { sub.scrollLeft = keep[0]; sub.scrollTop = keep[1]; }
    else { sub.scrollLeft = sub.scrollTop = 0; }                                    // 다른 도구로 바꾸면 처음부터(세로 폰: 높이에서 밀어 둔 채 칠하기로 오면 「바닥」 묶음이 왼쪽 밖에 숨던 것)
    if (!keep && mode === "build") { const c = this.buildCards.find(x => x.dataset.build === arg && !x.hidden); if (c) { sub.scrollLeft = Math.max(0, c.offsetLeft - 8); sub.scrollTop = Math.max(0, c.offsetTop - 8); } }   // 들어올 때: 고른 건물이 보이게
    if (mode === "height" && arg === "level" && this.shownOp !== "level") { const g = sub.querySelector("[data-level]")?.closest(".tgrp"); if (g) { sub.scrollLeft = Math.max(0, g.offsetLeft - 64); sub.scrollTop = Math.max(0, g.offsetTop - 64); } }   // 🎚 단 맞추기를 고르면 「맞출 높이」가 바로 보이게(세로 폰은 옆으로 미는 한 줄)
    this.shownOp = mode === "height" ? arg : null;
  }
  /** 🥚 소환 버튼: 마을에 있는 수 / 전체, 다 모이면 끔 */
  setSummon(world) { const n = world.units.length, all = UNITS.length; this.summonBtn.textContent = n >= all ? `🥚 모두 모임 ${n}/${all}` : `🥚 소환 ${n}/${all}`; this.summonBtn.disabled = n >= all;
    const left = UNITS.filter(d => !world.units.some(u => u.name === d.name)).map(d => d.name); document.getElementById("summonLast").textContent = left.length ? `아직 안 온 갈매미: ${left.join(", ")}` : ""; }
  showFollow(u) { this.follow = u; this.rows?.forEach((r, i) => r.classList.toggle("on", this.world.units[i] === u)); }
  /** 🎣 당기기! 버튼: 따라가기 카드 바로 위에 붙여서 보여 줌(입질 동안만). 매 프레임 불러도 바뀔 때만 손댐 */
  showTug(on, secs = 1.5) {
    const b = this.tugBtn; if (b.hidden === !on) return;
    if (on) b.style.setProperty("--tug", `${Math.max(0.1, secs).toFixed(2)}s`);   // 줄어드는 줄은 실제로 남은 시간만큼(자리는 CSS: 카드 바로 위)
    b.hidden = !on;
  }
  /** 🎁 선물·♥ 쓰다듬기 버튼: 따라가는 갈매미가 있을 때 카드 바로 위에(당기기 버튼이 떠 있는 동안은 비켜 줌). 매 프레임 불러도 바뀔 때만 손댐 */
  showBond(u) {
    const on = !!u && this.tugBtn.hidden, bar = this.bondBar;
    if (!on || u !== this.bondU) this.giftPick.hidden = true;                       // 다른 갈매미로 바꾸면 고르는 판은 닫음
    this.bondU = u; if (bar.hidden === on) bar.hidden = !on; if (!on) return;      // 자리는 CSS(카드 바로 위, 가로 폰은 카드 옆)
    const left = petsLeft(u, newsDay(this.world.time)), away = !!u.insideBuildingId || u.state === UnitState.Held, label = left ? `♥ 쓰다듬기 ${left}/${PET_DAILY}` : "♥ 내일 또 만나요";
    if (this.petBtn.textContent !== label) this.petBtn.textContent = label;
    if (this.petBtn.disabled !== (!left || away)) this.petBtn.disabled = !left || away;
  }
  /** 선물 고르는 판: 마을 가방의 물건(가구 빼고)과 보물 물고기. 조금 친해지면(하트 1개부터) 좋아하는 것을 알려 줌 */
  drawGifts() {
    const u = this.follow, w = this.world; if (!u) { this.giftPick.hidden = true; return; }
    const list = giftables(w), p = PERSONA[u.name] || {}, names = c => c.map(k => GIFT_CAT_NAME[k]).filter(Boolean).join(", ");
    const hint = bondStage(u.bond) >= 1 && p.likes?.length ? `${u.name}의 취향: ♥ ${names(p.likes)}${p.dislikes?.length ? ` · 음… ${names(p.dislikes)}` : ""}` : `${u.name}에게 무엇을 줄까요? 건네 보면 좋아하는 걸 알 수 있어요.`;
    this.giftPick.innerHTML = `<p class="dim">${hint}</p>` + (list.length
      ? `<div class="gifts">${list.map(g => `<button data-gift="${g.id}">${g.kind === "fish" ? "🐟" : "🎁"} ${g.name} ×${g.n}${w.keep[g.id] ? " 💛" : ""}</button>`).join("")}</div>`
      : `<p>지금은 줄 수 있는 게 없어요. 낚시나 바닷가에서 얻은 물건·보물 물고기를 선물할 수 있어요(📖 도감 · 가방).</p>`);
  }
  /** 도감(낚은 물고기)·가방(건진 물건): 이제 갈매폰 안 페이지(‹ 뒤로 = 폰 홈) */
  showDex(on) {
    if (on) { if (this.phone.hidden) this.openPhone(); this.openApp("dex"); }
    else if (this.app === "dex") this.openApp(null);
  }
  drawDex() {
    const w = this.world, body = document.getElementById("dexBody"); body.innerHTML = "";
    // 간직하기: 켜 두면 상인이 팔지 않음(그 자리에서 글자만 바꿈 → 스크롤이 튀지 않게)
    const keepBtn = id => { const b = el("button", "keep"), draw = () => { const on = !!w.keep[id]; b.textContent = on ? "💛 간직 중" : "🤍 간직하기"; b.classList.toggle("on", on); b.dataset.tip = on ? "상인이 팔지 않아요 · 누르면 풀어요" : "켜 두면 상인이 팔지 않아요"; };
      b.dataset.keep = id; b.onclick = () => { this.onKeep?.(id); draw(); }; draw(); return b; };
    const sec = (title, list, count, extra, more) => {
      body.append(el("h3", "", title)); const g = el("div", "dexgrid");
      for (const it of list) { const n = count(it), c = el("div", "dexcell" + (n ? "" : " unknown"));
        c.style.borderColor = RARITY[it.rarity].color;
        const ss = it.season ? SEASONS[it.season] : null, now = it.season && it.season === w.season;
        c.append(el("b", "", n ? it.name : "???"), el("span", "", `${RARITY[it.rarity].name}${n ? ` · ${n}개` : ""}`), el("span", "dim", n ? extra(it) : ""));
        if (ss) { const t = el("span", "season" + (now ? " now" : ""), `${ss.icon} ${ss.name}에만${now ? " · 지금!" : ""}`); c.append(t); }
        more?.(it, c, n); g.append(c); }
      body.append(g);
    };
    sec(`🐟 물고기 도감 (${FISH.filter(f => w.collection[f.id]).length}/${FISH.length})`, FISH, f => w.collection[f.id] || 0,
      f => f.rarity === "common" ? `음식 +${f.food}` : `보물 ${f.price}🐚${w.treasures[f.id] ? ` · 보관 ${w.treasures[f.id]}` : ""}`,
      (f, c, n) => {                                                               // 수족관: 크기 기록 · 기증됨
        if (n && w.fishRecord[f.id]) c.append(el("span", "rec", `📏 가장 큰 ${w.fishRecord[f.id]}cm`));
        if (w.donated[f.id]) c.append(el("span", "donated", "🐠 기증됨"));
        if (w.treasures[f.id] > 0) c.append(keepBtn(f.id));
      });
    {                                                                              // 수족관 기증 현황(물고기 도감 바로 아래)
      const have = donatedCount(w.donated), next = DONATE_GIFTS[w.donateGifts], gift = next && ITEMS.find(i => i.id === next.item);
      body.append(el("p", "dim aqua", !w.aquariumB() && !have ? "🐠 수족관(마을 등급 ⚓ 항구 마을부터)을 지으면 처음 낚은 희귀 이상 물고기를 한 마리씩 기증해요."
        : `🐠 수족관 기증 ${have}/${DONATE_KINDS.length}종 · ${next ? `다음 기념 선물: ${next.label} 기증하면 ${gift?.name ?? "선물"}` : "기념 선물을 모두 받았어요!"}`));
    }
    sec(`🎁 가방 (${ITEMS.filter(i => w.items[i.id]).length}/${ITEMS.length})`, ITEMS, i => w.items[i.id] || 0,
      i => i.furniture ? "가구 · 🏠 집 꾸미기에서 아무 집에나 놓기" : `${i.price}🐚`,
      (i, c, n) => { if (n && !i.furniture) c.append(keepBtn(i.id)); });
    {                                                                              // 하늘 기록: 드문 하늘을 본 횟수
      body.append(el("h3", "", `🌈 하늘 기록 (${Object.keys(SKY_EVENTS).filter(k => w.skySeen[k]).length}/${Object.keys(SKY_EVENTS).length})`)); const g = el("div", "dexgrid skydex");
      for (const [k, d] of Object.entries(SKY_EVENTS)) { const n = w.skySeen[k] || 0, c = el("div", "dexcell" + (n ? "" : " unknown")); c.dataset.sky = k;
        c.append(el("b", "", n ? `${d.icon} ${d.name}` : "???"), el("span", "", n ? `${n}번 봤어요` : "아직 못 봤어요"), el("span", "dim", SKY_HINT[k])); g.append(c); }
      body.append(g);
    }
    body.append(el("p", "dim", "💛 간직하기를 켜 둔 물건·보물은 상인이 팔지 않아요. 갈매미를 따라가며 🎁 선물로 건넬 수 있어요."));
    body.append(el("p", "dim", "계절 한정 물고기·물건은 그 계절에만 나와요(물건은 낚시나 바닷가에서 먹이를 잡다가 주워요). 다른 사람과 바꾸기는 서버(여러 사람 접속)가 생기면 붙일 예정이에요."));
  }
  setQuality(mode) { if (!mode) return; for (const b of this.qBox.children) b.classList.toggle("on", b.dataset.q === mode); document.getElementById("qualityNote").textContent = QUALITY_NOTE[mode]; }
  /** 알림 한 줄. status(글) = 버튼·도구 안내: 바로 바꿔 보여 줌(빈 글이면 안내만 지움 — 도구를 바꿀 때 낡은 안내가 남지 않게).
   *  status(글, { kind, queue: true }) = 마을 소식: 보이는 것을 덮지 않고 차례로(대기 최대 3개, 같은 글이 이어지면 ×2로 묶음), 지난 알림에 남김.
   *  kind: info(파랑) · good(초록) · warn(주황) · error(빨강) — 왼쪽 색 띠(색만으로 알리지 않게 글 앞에 이모지가 붙어 옴) */
  status(text, opt) {
    const kind = opt?.kind || "info";
    if (opt?.queue) return this.notify(text, kind);
    if (!text) { if (this.toastCur && !this.toastCur.q) this.toastEnd(); return; }
    if (opt?.kind === "warn" || opt?.kind === "error") this.logNote(text, kind);
    if (this.toastCur?.q) this.toastQ.unshift(this.toastCur);                     // 보이던 소식은 맨 앞으로 되돌려 안내 다음에 다시
    while (this.toastQ.length > 3) this.toastQ.pop();
    this.toastShow({ text, kind, q: false, n: 1 }, document.body.dataset.mode === "edit" ? 4000 : 6000);   // 건설 중 안내는 4초(화면을 덜 가리게)
  }
  notify(text, kind = "info") {
    if (!text) return; this.logNote(text, kind);
    const same = [this.toastCur, this.toastQ[this.toastQ.length - 1]].find(x => x?.q && x.text === text);
    if (same) { same.n++; if (same === this.toastCur) this.toastShow(same, this.toastMs(same)); return; }   // 같은 소식이 이어지면 ×2, ×3
    this.toastQ.push({ text, kind, q: true, n: 1 }); while (this.toastQ.length > 3) this.toastQ.shift();   // 너무 밀리면 오래된 것부터 버림(지난 알림엔 남음)
    if (!this.toastCur) this.toastNext();
  }
  toastMs(it) { return it.text.length > 40 ? 6500 : 4500; }
  toastShow(it, ms) {
    this.toastCur = it; const t = it.text + (it.n > 1 ? ` ×${it.n}` : "");
    if (this.msg.textContent !== t) this.msg.textContent = t; this.msg.dataset.kind = it.kind; this.msg.hidden = false;
    clearTimeout(this.msgT); this.msgT = setTimeout(() => this.toastEnd(), ms);
  }
  toastEnd() { clearTimeout(this.msgT); this.toastCur = null; this.msg.hidden = true; if (this.toastQ.length) this.msgT = setTimeout(() => this.toastNext(), 220); }   // 잠깐 비웠다가 다음 것
  toastNext() { const it = this.toastQ.shift(); if (it) this.toastShow(it, this.toastMs(it)); }
  logNote(text, kind) {
    this.noteLog.unshift({ text, kind, at: Date.now() }); if (this.noteLog.length > 30) this.noteLog.length = 30;
    if (!this.phone.hidden && this.app === "log") this.drawLog();
  }
  /** 🔔 지난 알림(새 것부터) */
  drawLog() {
    const body = document.getElementById("logBody"), key = `${this.noteLog.length}|${this.noteLog[0]?.at}|${this.noteLog[0]?.text}`;
    if (key === this.logKey && body.firstChild) return; this.logKey = key;
    const tm = at => new Date(at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    body.innerHTML = this.noteLog.length ? this.noteLog.map(n => `<li data-kind="${n.kind}"><time>${tm(n.at)}</time><span>${escHtml(n.text)}</span></li>`).join("")
      : `<li class="dim">아직 지난 알림이 없어요. 마을에서 일이 생기면 여기에 쌓여요.</li>`;
  }
  update(chunkInfo) {
    const w = this.world, inside = w.units.filter(u => u.insideBuildingId).length;
    const building = [...w.buildings.values()].filter(b => b.hits < b.need).length;
    const avg = w.avgFull(), mood = avg < J.HUNGRY ? "😫" : avg > J.OVERFULL ? "😴" : avg >= 60 ? "😋" : "🙂";
    this.stats.innerHTML = `<span>${mood} 포만감 ${avg.toFixed(0)}</span><span>🏠 건물 ${w.buildings.size}${building ? ` (공사 ${building})` : ""}</span><span>🐦 ${w.units.length}마리 · 건물 안 ${inside}</span>` +
      (w.economy ? `<span>🏦 창고 🪵${w.res.wood} 🪨${w.res.stone} 🍗${(w.res.food || 0) + (w.res.fish || 0)}</span>` : `<span>🌳 ${w.res.wood} ⛰ ${w.res.stone} 🍗 ${w.res.food} 🐚 ${w.res.coins}</span>`);
    this.chunkInfo = chunkInfo;                                                       // 삼각형·fps는 설정 → 🛠 개발자(#devStats)에서
    this.drawBadges();
    this.chipMoney.textContent = w.economy ? `🪙 ${w.moneySupply()}` : `🐚 ${w.res.coins}`;
    const sat = w.avgSat ? w.avgSat() : 50, face = sat >= 75 ? "😄" : sat >= 55 ? "🙂" : sat >= 35 ? "😐" : "😣";
    const small = this.phoneForm;                                                    // 휴대폰(세로·가로): 칩은 아이콘 위주(세로 폰은 포만감도 뺌 — 배고프면 알림 칩이 따로 뜸)
    this.chipPop.textContent = small ? `🐦${w.units.length} ${face}${sat.toFixed(0)}${this.form === "portrait" ? "" : ` ${mood}${avg.toFixed(0)}`}` : `🐦 ${w.units.length} · ${face} 만족 ${sat.toFixed(0)} · ${mood} ${avg.toFixed(0)}`; this.chipPop.dataset.tip = "갈매미 수 · 평균 만족도 · 평균 포만감";
    document.getElementById("chipRank").textContent = small ? RANKS[w.rank].icon : `${RANKS[w.rank].icon} ${RANKS[w.rank].name}`;
    const mb = document.getElementById("mapBtn"), mt = small ? "🗺" : "🗺 지도";       // 글자만 바꿈(키 힌트 칸은 그대로)
    if (mb.firstChild?.nodeType === 3) { if (mb.firstChild.nodeValue !== mt) mb.firstChild.nodeValue = mt; } else mb.prepend(mt);
    if (this.timeLabel) this.chipTime.textContent = this.timeLabel();
    if (this.weatherLabel) this.chipWeather.textContent = small ? this.weatherLabel().replace(/ [가-힣]+(?= · |$)/g, "").replace(/ · /g, " ") : this.weatherLabel();   // 휴대폰: 아이콘만
    const nw = this.world.wishes.length; this.wishBtn.hidden = !nw; this.wishBtn.textContent = small ? `💭${nw}` : `💭 소원 ${nw}`;
    if (this.app === "wish" || this.app === "market") { this.appT = (this.appT || 0) + 1; if (this.appT % 5 === 0) this.refreshApp(); }
    const hungry = w.units.filter(u => (u.full ?? 80) < J.HUNGRY).sort((a, b) => a.full - b.full)[0];
    this.hungry = hungry; this.alertBtn.hidden = !hungry; if (hungry) this.alertBtn.textContent = `😣 ${hungry.name} 배고파요`;
    if (!this.phone.hidden && this.app && this.app !== "gulls" && this.app !== "dex" && this.app !== "menu") this.refreshApp();
    w.units.forEach((u, i) => { if (!this.rows[i]) return; const b = u.insideBuildingId && w.buildings.get(u.insideBuildingId);
      this.rows[i].querySelector(".act").textContent = b ? (u.useFurni ? `🏠 ${FURNITURE[u.useFurni.id].useLabel}` : `${BUILDINGS[b.defId].name} 안`) : STATE_LABEL[u.state] || u.state;
      this.rows[i].querySelector(".coins").textContent = w.economy ? `🪙${u.coins || 0}${u.home ? " 🏠" : ""}` : "";
      const f = this.rows[i].querySelector(".full"); f.textContent = "🍗" + Math.round(u.full ?? 0);
      f.className = "full" + ((u.full ?? 80) < J.HUNGRY ? " hungry" : (u.full ?? 0) > J.OVERFULL ? " lazy" : ""); });
    // 따라가는 갈매미 정보
    const u = this.follow; this.info.hidden = !u; if (!u) this.showBond(null);
    if (u) { const job = JOBS[u.job], r = RARITY[u.rarity];
      const n = u.needs || {}, fav = M.favorite(u), bf = M.bestFriend(u, w.units), tr = TRIBES[u.tribe];
      // 따라가기 카드: 이름·직업 배지 / 지금 하는 일 / 욕구 막대 4개 / 돈·가방·집 칩 (긴 설명은 뺌)
      const bIn = u.insideBuildingId && w.buildings.get(u.insideBuildingId), doing = bIn ? `${BUILDINGS[bIn.defId].name} 안` : STATE_LABEL[u.state] || u.state;
      const bar = (label, v, cls = "") => `<div class="need"><span>${label}</span><i class="${cls}"><b style="width:${Math.max(0, Math.min(100, v))}%"></b></i><em>${Math.round(v)}</em></div>`;
      const full = u.full ?? 80, note = J.isLazy(u) ? "배불러 게을러요" : full < J.HUNGRY ? "배고파요" : "";
      const bag = E.ITEMS_ORDER.filter(k => u.inv?.[k]).map(k => `${E.ITEM_ICON[k]}${u.inv[k]}`).join(" ");
      if (this.infoOpen === undefined) { this.infoOpen = !this.phoneForm; this.info.onclick = () => { this.infoOpen = !this.infoOpen; }; }   // 휴대폰은 접힌 채(누르면 펼침)
      if (!this.infoOpen) { this.info.innerHTML = `<div class="ihead"><b>${u.name}</b><span class="jobtag">${job.icon} ${job.name}</span><span class="dim">${doing}</span><span class="hearts">${bondHearts(u.bond)}</span><span class="dim">😊${Math.round(u.sat ?? 50)} 🍗${Math.round(full)} ▾</span></div>`; this.info.classList.add("mini"); this.showBond(u); return; }
      this.info.classList.remove("mini");
      this.info.innerHTML = `<div class="ihead"><b>${u.name}</b><span class="jobtag">${job.icon} ${job.name}</span><span class="hearts" title="${BOND_STAGES[bondStage(u.bond)].name}">${bondHearts(u.bond)}</span><span class="dim">${tr ? `${tr.icon} ${u.tribe} · ` : ""}${r.name}${(PERSONA[u.name] || {}).nocturnal ? " · 🌙 야행성" : ""}</span></div>` +
        `<div class="doing">${doing}${note ? ` · <span class="warn">${note}</span>` : ""}</div>` +
        `<div class="needs">${bar("만족도", u.sat ?? 50, (u.sat ?? 50) < 35 ? "low" : "")}${bar("포만감", Math.min(100, full), full < J.HUNGRY ? "low" : "")}${bar("피로도", 100 - (n.energy ?? 100), (n.energy ?? 100) < 25 ? "low" : "")}${bar("친구", n.social ?? 0)}${bar("재미", n.fun ?? 0)}</div>` +
        (u.satParts ? `<div class="small dim">만족도: ${u.satParts.map(([n, v]) => `${n} ${v > 0 ? "+" : ""}${v}`).join(" · ")}</div>` : "") +
        (w.economy ? `<div class="ichips"><span>🪙 ${u.coins || 0}</span><span>${bag ? "🎒 " + bag : "🎒 비었음"}</span><span>${u.home ? "🏠 " + (BUILDINGS[w.buildings.get(u.home)?.defId]?.name ?? "") : "🏠 집 없음"}</span></div>` : "") +
        `<div class="dim small">좋아하는 일: ${fav ? M.ACTIVITY_NAME[fav] : "아직 몰라"}${bf ? ` · ${["친해지는 중", "친구", "단짝"][M.friendStage(M.affinity(u, bf))]}: ${bf.name}` : ""} · 능률 ×${(u.eff ?? 1).toFixed(2)} · 누르면 접기 ▴</div>`;
      this.showBond(u); }                                                         // 카드를 그린 뒤에(카드 높이에 맞춰 바로 위에 놓음)
  }
}
