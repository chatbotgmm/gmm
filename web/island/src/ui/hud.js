// 화면 UI: 도구 막대, 갈매미 목록·통계 판, 알림 줄. DOM만 다루고 월드는 콜백으로 바꾼다.
import { GROUND_TYPES, UnitState } from "../data/types.js";
import { GROUND_STYLE, BUILDINGS, JOBS, RARITY, FISH, ITEMS, UNITS, FURNITURE } from "../data/catalog.js";
import * as J from "../world/jobs.js";
import * as M from "../units/mind.js";
import { chronoLabel, chronoNote } from "../units/chrono.js";
import { TRIBES } from "../data/catalog.js";
import * as E from "../world/economy.js";
import { QUALITY, ORDER, QUALITY_NOTE } from "../render/quality.js";
import { RANKS } from "../world/rank.js";
import { SEASONS } from "../world/season.js";
import * as Fu from "../world/furniture.js";
import { DONATE_KINDS, DONATE_GIFTS, donatedCount } from "../world/aquarium.js";
import { MEDALS, MEDAL_GIFTS, fishMedal, medalLine } from "../world/medals.js";
import { newsDay } from "../world/news.js";
import { BOND_STAGES, bondStage, bondHearts, GIFT_CAT_NAME, giftDef, petsLeft, PET_DAILY } from "../world/bond.js";
import { stashTotals } from "../world/belongings.js";
import { SKY_EVENTS } from "../world/skywatch.js";
import { DAILY_COUNT } from "../world/daily.js";
import { CoachMarks } from "./coach.js";
import { josa } from "../util.js";
import { moreBox, vaultChipOf, townChipOf, tempChipOf } from "./hudParts.js";
import { makeSpendSum, chipSpendText, countAt, VF_SUM_MS, VF_COUNT_MS, VF_FLASH_MS } from "./vaultFx.js";
import { bankHtml } from "./bankView.js";
import { planInfo, bridgeInfo, planHtml, cardMeta } from "./buildView.js";
import { summonHtml, summonButton } from "./summonView.js";
import { bldKindOf, siteCardOf, fieldCardOf, clinicCardOf, shopCardOf, shopTabDefault } from "./bldView.js";
import { stateLabelOf, gullFlags, bodyTempOf, gullChips, gullMoreHtml, giftPickHtml, stampShopHtml, stampShopKey, stampBadge } from "./gullView.js";
import { mountUpgrade, hideUpgrade } from "./upgradeView.js";
import { townAppHtml, marketAppHtml, priceCellHtml, dailyHead, wishListHtml, decorHeadHtml, relHeadHtml, relLegendHtml, dexCounts, dexHeadHtml, newsAppHtml, toastHtml } from "./appViews.js";
import { readGridPref, saveGridPref } from "./gridView.js";
import { tapTool } from "../systems/pressKind.js";
import { NATURE_GROUPS, natureToolsFor, natureCard, natureAction, moveInfo, moveHtml } from "./natureView.js";

const escHtml = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);   // 글을 그대로 보여 주기(태그로 읽히지 않게)

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
// 작은 화면은 덜 키움: 배율로 나눈 짧은 변이 300px 밑으로 가면 칩·카드·미니맵이 서로 덮음(320px 폭 130% = 246px) → 390px는 130%, 360px는 120%, 330px 미만은 100%까지
const uiScaleMax = () => { const lim = Math.floor(Math.min(innerWidth, innerHeight) / 15) * 5; return Math.min(uiCoarse() ? UI_SCALE_RANGE[2] : UI_SCALE_RANGE[1], lim < 110 ? 100 : lim); };
const uiScaleClamp = v => Math.max(UI_SCALE_RANGE[0], Math.min(uiScaleMax(), Math.round((Number(v) || 100) / 5) * 5));
// 아주 큰 PC 화면(1920×1080보다 큼 · 마우스)에서는 글자가 작아 보이지 않게 저절로 키움(최대 2배, 0.05 단위). 휴대폰·보통 화면은 1
const uiAutoScale = () => uiCoarse() ? 1 : Math.max(1, Math.min(2, Math.floor(Math.min(innerHeight / 1080, innerWidth / 1920) * 20) / 20));
// 건설 갤러리의 분류(화면에서만 쓰는 표 — 건물 정의에는 분류가 없음)
const BUILD_CATS = [["all", "전체"], ["home", "집"], ["work", "시설"], ["deco", "장식"], ["road", "교통"]];
const buildCatOf = d => d.house ? "home" : d.deco ? "deco" : d.stairs || d.bridge || d.pier ? "road" : "work";
const cardPut = (node, t) => { if (node.textContent !== t) node.textContent = t; };   // 바뀐 글자만 고침(따라가기 카드)
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
    this.coach = new CoachMarks(this);                                               // 처음 안내(3단계 말풍선 · 처음 여는 앱 안내)
    // 도구 버튼: [아이콘, 이름, 휴대폰용 짧은 이름]. 건설 모드에서만 보이고, 맨 앞 ✓ 완료(view)를 누르면 평소 화면으로
    const modes = [["view", "✓", "완료", "완료"], ["paint", "🖌", "바닥 칠하기", "칠하기"], ["height", "⛰", "높이", "높이"], ["build", "🏠", "건물 짓기", "짓기"], ["demolish", "🧹", "철거", "철거"], ["nature", "🌳", "자연·지형", "자연"]];
    this.modeBtns = modes.map(([m, icon, label, short]) => { const b = this.toolBtn(m === "view" ? "done" : "", icon, label, short); b.dataset.mode = m; bar.appendChild(b);
      b.onclick = () => tools.setMode(m, m === "paint" ? (this.lastPaint || GROUND_TYPES[1]) : m === "build" ? (this.lastBuild || "house") : m === "height" ? (this.lastHeight || "raise") : m === "nature" ? (this.lastNature || "auto") : null); return b; });
    this.modeBtns[0].setAttribute("aria-label", "완료 — 건설 모드 끝내기");
    // 🔨 건설: 평소 화면의 유일한 건설 입구. 마지막에 쓴 건설 도구로 들어감(처음엔 건물 짓기)
    this.lastEdit = "build";
    document.getElementById("editBtn").onclick = () => this.modeBtns.find(b => b.dataset.mode === this.lastEdit)?.click();
    this.sub = sub;
    // 한 줄 건물 갤러리: 마우스 휠(세로)을 옆으로 밀기로 — 옆으로 넘칠 때만, 아래위로 넘치는 트레이(가로 폰 세로 열)는 그대로
    sub.addEventListener("wheel", e => { if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || sub.scrollWidth <= sub.clientWidth + 1 || sub.scrollHeight > sub.clientHeight + 1) return;
      sub.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 32 : 1); e.preventDefault(); }, { passive: false });
    // ---- 보조 줄(#ebar): 분류 칩(건물 짓기) · 철거 안내 · 보조 버튼(✋ 화면 이동 · ↶ ↷ · 🎯 십자선 · ⟲ ⟳ 화면 돌리기). 한 번만 만들고 도구에 따라 보이기만 바꿈
    const ebar = document.getElementById("ebar"), aux = el("div", "eaux");
    const auxBtn = (id, icon, label, tip) => { const b = el("button", "abtn", icon); if (id) b.id = id; b.setAttribute("aria-label", label); b.dataset.tip = tip; aux.appendChild(b); return b; };
    this.buildCat = "all"; this.ecats = el("div", "ecats"); this.ecats.setAttribute("role", "group"); this.ecats.setAttribute("aria-label", "건물 분류");
    this.catBtns = BUILD_CATS.map(([id, label]) => { const b = el("button", "", label); b.dataset.cat = id; b.onclick = () => { this.buildCat = id; this.sub.scrollLeft = this.sub.scrollTop = 0; this.filterBuild(); }; this.ecats.appendChild(b); return b; });
    this.ehint = el("span", "ehint", "🧹 누른 건물이 바로 사라져요 · 되돌릴 수 없어요");
    // ✋ 화면 이동: 끌어서 칠하는 도구(칠하기·높이·자연)를 쓰는 중에 켜면 드래그로 화면만 옮김(도구는 잠시 멈춤).
    // 짓기·철거·지형지물 옮기기는 끌기가 원래 화면 옮기기(톡 = 고르기)라 ✋를 숨김(showMode)
    this.handBtn = auxBtn("", "✋", "화면 이동", "켜면 드래그로 화면을 옮겨요(칠하기는 잠시 멈춤). PC는 스페이스를 누른 채 끌거나 오른쪽 버튼으로, 휴대폰은 두 손가락으로 끌어도 돼요"); this.handBtn.classList.add("hand");
    this.handBtn.onclick = () => tools.setHand(!tools.hand);
    tools.onHand = on => { this.handBtn.classList.toggle("on", on); this.handBtn.setAttribute("aria-pressed", String(on)); };
    const undo = auxBtn("", "↶", "되돌리기", "되돌리기(Ctrl+Z)"), redo = auxBtn("", "↷", "다시하기", "다시하기(Ctrl+Shift+Z)"); undo.onclick = () => tools.undo(); redo.onclick = () => tools.redo();
    undo.disabled = redo.disabled = true; this.undoBtns = [undo, redo];
    this.crossBtn = auxBtn("", "🎯", "십자선", "화면 가운데를 붓으로: 한 손가락으로 화면을 옮기고, 아래 큰 버튼을 누르는 동안 칠해요");
    this.crossBtn.onclick = () => { tools.setCross(!tools.cross); this.crossBtn.classList.toggle("on", tools.cross); this.crossBtn.setAttribute("aria-pressed", String(tools.cross)); };
    this.auxSep = el("i", "vsep"); aux.appendChild(this.auxSep);
    // ▦ 격자: 건설 모드 땅 위 칸 경계선 켜기·끄기(G). 처음엔 켜짐, 고른 것은 기억(main.js가 gridOn을 읽어 땅 셰이더 세기만 바꿈)
    this.gridOn = readGridPref(k => localStorage.getItem(k));
    this.gridBtn = auxBtn("gridBtn", "▦", "격자 보기", "칸 경계 격자선 켜기·끄기"); this.gridBtn.classList.add("grid");
    // 세로 폰: 보조 줄에 44px 칸 일곱 개(✋ ↶ ↷ 🎯 ▦ ⟲ ⟳)가 안 들어가(320px에서 ✋가 잘림) 같은 단추를 위 칩 줄(지도 옆)에 둠 — 어느 쪽이 보일지는 CSS(data-form)
    this.gridChip = el("button", "", "▦"); this.gridChip.id = "gridChip"; this.gridChip.setAttribute("aria-label", "격자 보기"); this.gridChip.dataset.tip = "칸 경계 격자선 켜기·끄기 (G)"; this.gridChip.hidden = true;
    document.getElementById("mapBtn")?.before(this.gridChip);
    const gridSync = () => { for (const b of [this.gridBtn, this.gridChip]) { b.classList.toggle("on", this.gridOn); b.setAttribute("aria-pressed", String(this.gridOn)); } };
    this.gridBtn.onclick = this.gridChip.onclick = () => { this.gridOn = !this.gridOn; gridSync(); saveGridPref((k, v) => localStorage.setItem(k, v), this.gridOn); };
    gridSync();
    // ⟲ ⟳: 건설 모드는 내려다보는 각도가 고정이라, 화면은 이 버튼(Z · X)으로 90°씩 돌려 봄
    this.viewBtns = [auxBtn("viewL", "⟲", "화면을 왼쪽으로 90° 돌리기", "화면을 왼쪽으로 90° 돌려요"), auxBtn("viewR", "⟳", "화면을 오른쪽으로 90° 돌리기", "화면을 오른쪽으로 90° 돌려요")];
    this.viewBtns[0].onclick = () => this.onViewTurn?.(-1); this.viewBtns[1].onclick = () => this.onViewTurn?.(1);
    ebar.append(this.ecats, this.ehint, aux);
    tools.onMode = (m, arg) => this.showMode(m, arg);
    // 건물 자리를 정하면 🔨 건설 / ↻ 돌리기 / ✕ 취소 막대(지을 수 없는 자리면 건설 버튼 꺼짐)
    const cf = document.getElementById("confirm"), cfBuild = document.getElementById("cfBuild");
    tools.onPlan = (on, ok, plan) => {
      cf.hidden = !on; cfBuild.disabled = !ok;                                       // 자리: CSS(--dock-b, 세로 폰은 아래 도구 막대 바로 위)
      this.planNow = on ? plan || null : null; this.drawPlan();                      // 설계비·금고·재료 요약(금고가 바뀌면 update가 다시 셈)
    };
    cfBuild.onclick = () => tools.confirmBuild();
    const cfInfo = document.getElementById("cfInfo");                                // 휴대폰: 둘째 줄(재료·짓는 이)은 한 줄로 줄여 두고 누르면 펼침
    cfInfo.onclick = () => { const open = cfInfo.dataset.open !== "1"; cfInfo.dataset.open = open ? "1" : "0"; cfInfo.setAttribute("aria-expanded", String(open)); };
    cfInfo.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cfInfo.onclick(); } };
    document.getElementById("cfRot").onclick = () => tools.rotate();
    document.getElementById("cfCancel").onclick = () => tools.clearPlan();
    tools.onBrush = n => this.brushBtns?.forEach(b => b.classList.toggle("on", +b.dataset.brush === n));
    this.instantBuild = false;
    this.summonBtn = document.getElementById("summon"); this.summonBtn.onclick = () => this.onSummon?.();
    document.getElementById("summonMid").onclick = e => { const go = e.target.closest("[data-act]"); if (!go) return;   // 🏗 자이언트의 집 지으러 가기 → 폰을 닫고 건설 모드(그 건물을 고른 채)
      this.closePhone(); this.tools.setMode("build", go.dataset.act); };
    document.getElementById("dexBtn").onclick = () => this.showDex(true);
    // ⚡ 바로 완공(시험용): 설정 → 게임 → 🛠 개발자 안에
    const ib = document.getElementById("instantBtn"), ibDraw = () => { ib.textContent = `⚡ 바로 완공: ${this.instantBuild ? "켬" : "끔"}`; ib.classList.toggle("on", this.instantBuild); ib.setAttribute("aria-pressed", String(this.instantBuild)); };
    ib.onclick = () => { this.instantBuild = !this.instantBuild; ibDraw(); this.onInstant?.(this.instantBuild); }; this.drawInstant = ibDraw;
    // 그래픽 설정 5단계(설정 앱): 누르면 바로 바뀜
    this.qBox = document.getElementById("quality");
    for (const k of ORDER) { const b = el("button", "", QUALITY[k].name); b.dataset.q = k; b.dataset.tip = QUALITY_NOTE[k]; b.onclick = () => this.setQuality(this.onQuality?.(k)); this.qBox.appendChild(b); }
    this.info = document.getElementById("info");
    this.tugBtn = document.getElementById("tugBtn"); this.tugBtn.onclick = () => this.onTug?.();   // 찌 당기기(따라가는 갈매미에게 입질이 왔을 때만 보임)
    // 선물·쓰다듬기: 버튼은 카드의 행동 줄에(뼈대를 한 번만 만드니 누르는 중에 사라지지 않음), 선물 고르는 판만 카드 위에 뜸
    this.bondBar = document.getElementById("bondBar"); this.giftPick = document.getElementById("giftPick"); this.giftBtn = document.getElementById("giftBtn"); this.petBtn = document.getElementById("petBtn");
    this.giftBtn.onclick = () => { this.giftPick.hidden = !this.giftPick.hidden; if (!this.giftPick.hidden) { this.drawGifts(); this.coach?.moment("gift"); } };
    this.petBtn.onclick = () => { if (!this.follow) return; this.onPet?.(this.follow); this.showBond(this.follow); };   // 남은 횟수는 바로 고침(글자판은 1초에 5번만 그림)
    this.buildInfoCard();
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
    document.getElementById("coachAgain").onclick = () => { this.closePhone(); this.coach.start({ force: true }); };   // 도움말: 처음 안내 다시 보기
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
    this.chipPop = document.getElementById("chipPop"); this.chipTime = document.getElementById("chipTime");
    this.chipTime.onclick = () => this.onSpeed?.("next");                          // 시간 칩 = ⏩ 배속 바꾸기(유료판 ×1→×2→×3, 무료판이면 잠금 안내)
    this.chipWeather = document.getElementById("chipWeather"); this.chipWeather.onclick = () => this.onWeatherInfo?.();
    this.chipVault = document.getElementById("chipVault"); this.chipTown = document.getElementById("chipTown");   // 🏦 내 금고(내 돈) · 🪙 마을 돈(갈매미들 돈 합계)
    this.chipParts = { vv: this.chipVault.querySelector(".vv"), vt: this.chipVault.querySelector(".vt"), wl: this.chipWeather.querySelector(".wl"), wt: this.chipWeather.querySelector(".wt") };
    document.getElementById("chipRank").onclick = () => { this.openPhone(); this.openApp("town"); };
    this.chipVault.onclick = () => { this.openPhone(); this.openApp("bank"); };       // 금고 → 🏦 은행
    this.chipTown.onclick = () => { this.moreOpen.set("bank.town", true); this.openPhone(); this.openApp("bank"); };   // 마을 돈 → 은행 앱의 「마을에 도는 돈」 접기를 펼친 채로(2단계가 열쇠 bank.town을 씀)
    // 자세히 보기 접기(details.more): 펼침을 이번 실행 동안 기억(저장 안 함) → 앱이 5Hz로 다시 그려도 펼친 채. toggle은 거품이 안 올라와서 잡는 단계(capture)에서 들음
    this.moreOpen = new Map();
    { const hx = document.querySelector("#houseCard .hcx"); hx.addEventListener("click", e => this.bldCardClick(e));   // 건물 카드 안 단추(칸을 다시 그려도 그대로)
      // 누르는 동안(+ 뗀 뒤 0.3초)은 칸을 다시 그리지 않음: 누름과 뗌 사이에 단추·접기 줄이 바뀌면 그 누름이 사라짐(환자 남은 시간은 1초마다 바뀜)
      // 뗌은 문서 전체에서 들음: 마우스를 누른 채 카드 밖으로 끌고 가 떼도 칸이 멈춘 채로 남지 않게
      hx.addEventListener("pointerdown", () => { this.cardPress = Infinity; }); for (const ev of ["pointerup", "pointercancel"]) document.addEventListener(ev, () => { if (this.cardPress === Infinity) this.cardPress = performance.now() + 300; }, true); }
    document.addEventListener("toggle", e => { const d = e.target; if (d instanceof HTMLDetailsElement && d.classList.contains("more") && d.dataset.more) this.moreOpen.set(d.dataset.more, d.open); }, true);
    this.wishBtn = document.getElementById("chipWish"); this.wishBtn.onclick = () => { this.openPhone(); this.openApp("wish"); };
    this.seasonBtn = document.getElementById("seasonMode");                       // 이제 라벨(고르기는 옆 #segSeason)
    addEventListener("resize", () => this.setForm());
    this.setWorld(world); this.showMode("view");
  }
  /** 자세히 보기 접기 HTML(hudParts.moreBox + 기억한 펼침). opts.open = 처음 한 번의 기본값 */
  more(key, title, html, opts = {}) { return moreBox(key, title, html, { ...opts, open: this.moreOpen.get(key) ?? !!opts.open }); }
  /** 금고 칩을 한 번 흔들기(금고 얼마 안 남음·바닥·다시 참 이벤트) */
  bumpVault() { const c = this.chipVault; c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump"); clearTimeout(this.bumpT); this.bumpT = setTimeout(() => c.classList.remove("bump"), 900); }
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
    root.toggleAttribute("data-short", !this.phoneForm && innerHeight / k < 1000);  // 키가 아주 크지 않은 태블릿·PC 창은 건물 갤러리를 한 줄로(건설 판이 화면 높이의 4분의 1을 넘지 않게)
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
    $("uiScale").max = String(max); $("uiScale").value = String(this.uiScale); $("uiScaleLab").textContent = `크기: ${this.uiScale}%${this.uiScale === 100 ? " (기본)" : ""}`;
    $("uiScaleDown").disabled = this.uiScale <= UI_SCALE_RANGE[0]; $("uiScaleUp").disabled = this.uiScale >= max; $("uiScaleReset").disabled = this.uiScale === 100;
    $("uiScaleNote").textContent = `75%~${max}% · 이 기기에만 기억해요(섬 저장과는 따로예요).${this.uiAuto > 1 ? ` 큰 화면이라 기본 크기를 ${Math.round(this.uiAuto * 100)}%로 맞춰 뒀어요.` : ""}`;
    for (const b of $("segKeyhint").children) { const on = b.dataset.v === root.dataset.keyhint; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
    const sw = (id, on) => { const b = $(id); b.classList.toggle("off", !on); b.setAttribute("aria-pressed", String(on)); };
    sw("motionBtn", root.dataset.motion === "reduce"); sw("leftHand", root.dataset.hand === "left"); sw("vibeBtn", root.dataset.vibe !== "off");
  }
  /** 섬에서 건물을 눌렀을 때 작은 카드(저절로 닫히지 않음: ✕ · 빈 땅 누르기 · 도구 바꾸기 · 갈매미 따라가기).
   *  다 지은 집은 예전 집 카드 그대로(🛋 들어가 꾸미기). 공사장·밭·의원·잡화점은 아래 칸(.hcx)에 핵심 요약 + 자세히 보기(bldView.js) — 5Hz로 바뀐 칸만 다시 그림.
   *  b·span.dim·.go·.hx 구조는 그대로(noPower가 span 뒤에 「전기 없음」 까닭을 덧붙이고, powerRange가 풍차 카드로 씀). 카드 종류가 없는 건물이면 닫음 */
  houseCard(b) {
    const c = document.getElementById("houseCard"), x = c.querySelector(".hcx"), w = this.world, kind = b ? bldKindOf(b, w) : null;
    this.cardB = kind ? b : null; this.cardKind = kind; this.cardParts = [];
    x.textContent = ""; if (!x.hidden) x.hidden = true;
    if (kind === "clinic") mountUpgrade(c, this, w, b, x); else hideUpgrade(c);   // 병원: 종합병원 업그레이드 단추(ui/upgradeView.js) · 다른 카드엔 남지 않게
    if (!kind) { delete c.dataset.kind; c.hidden = true; return; }
    c.dataset.kind = kind; c.setAttribute("aria-label", BUILDINGS[b.defId].name);
    const go = c.querySelector(".go"); go.hidden = kind !== "house"; c.querySelector(".hx").onclick = () => { c.hidden = true; };
    if (kind === "house") {
      const owner = w.units.find(u => u.unitId === b.owner);
      c.querySelector("b").textContent = `🏠 ${BUILDINGS[b.defId].name}`; c.querySelector("span").textContent = `${owner ? `주인 ${owner.name}` : "주인 없음"} · 🛋 아늑함 ${Fu.comfort(b)}`;
      go.onclick = () => { c.hidden = true; this.onDecorate?.(b); this.coach?.moment("room"); }; c.hidden = false; return;
    }
    const card = this.bldCardOf(b, kind); c.querySelector("b").textContent = card.title; c.querySelector("span").textContent = card.sub;
    x.hidden = false; c.hidden = false; this.syncBldCard(card);
  }
  /** 카드 종류별 글(bldView.js) */
  bldCardOf(b, kind) {
    const w = this.world, more = (k, t, h, o) => this.more(k, t, h, o);
    if (kind === "site") return siteCardOf(b, w, more);
    if (kind === "field") return fieldCardOf(b, w, more);
    if (kind === "clinic") return clinicCardOf(b, w, more);
    return shopCardOf(b, w, this.shopTab || shopTabDefault(w));
  }
  /** 건물 카드 아래 칸: 칸마다 HTML이 바뀐 것만 고침(update 5Hz). 다 지어져 종류가 바뀌면 다시 열고, 철거되면 닫음 */
  syncBldCard(card = null) {
    const c = document.getElementById("houseCard"), b = this.cardB, w = this.world;
    if (!b || c.hidden || this.cardKind === "house") return;
    if (!card && this.cardPress && performance.now() < this.cardPress) return;      // 누르는 중
    if (w.buildings.get(b.id) !== b) { this.houseCard(null); return; }
    const kind = bldKindOf(b, w);
    if (kind !== this.cardKind) {                                                  // 다 지어짐: 풍차는 powerRange가 쓰는 카드라 아래 칸만 비우고 둠, 나머지는 새 종류로 다시 열거나 닫음
      if (!kind && BUILDINGS[b.defId].power) { const x = c.querySelector(".hcx"); x.textContent = ""; x.hidden = true; delete c.dataset.kind; this.cardB = null; this.cardKind = null; return; }
      this.houseCard(b); return; }
    card ||= this.bldCardOf(b, kind);
    const x = c.querySelector(".hcx"), P = this.cardParts;
    card.parts.forEach((h, i) => { let d = x.children[i]; if (!d) { d = el("div", "hcp"); x.appendChild(d); }
      if (P[i] !== h) { P[i] = h; d.innerHTML = h; } });
    while (x.children.length > card.parts.length) { x.lastChild.remove(); P.length = card.parts.length; }
  }
  /** 건물 카드 안 단추(한 번만 붙임): 맡은 갈매미 따라가기 · 당번 정하기 · 잡화점 탭 · 도장 가게 바로가기 */
  bldCardClick(e) {
    const t = e.target.closest?.("[data-act]"), b = this.cardB, w = this.world; if (!t || !b) return;
    const act = t.dataset.act; this.cardPress = 0;                                 // 누름은 끝났음: 이 단추가 바꾼 칸은 바로 다시 그림(0.3초 막기를 풀어 탭·당번 결과가 늦지 않게)
    if (act === "follow") { const u = w.units.find(o => String(o.unitId) === t.dataset.id); if (u) this.onUnitClick?.(u); return; }
    if (act === "tab") { this.shopTab = t.dataset.tab; this.syncBldCard(); return; }
    if (act === "stamp") { this.openPhone(); this.openApp("wish"); const d = document.querySelector("#dailyBody details.sshop"); if (d) { d.open = true; d.scrollIntoView?.({ block: "nearest" }); } return; }
    if (act === "doctor") {
      const id = t.dataset.id, u = id ? w.units.find(o => String(o.unitId) === id) : null, r = w.setDoctor(b.id, u ? u.unitId : null);
      if (!r.ok) { this.status(r.reason, { kind: "warn" }); return; }
      this.moreOpen.set("clinic.doc", false);
      this.status(u ? `${josa(u.name, "이", "가")} 당번 의사가 됐어요 · 환자가 오면 병원으로 가요` : "당번 의사를 비웠어요 · 환자는 침대에서 쉬며 나아요", { kind: "good" });
      this.syncBldCard();
    }
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
    else if (kind === "mult") { const l = this.onTimeMult?.(+v); if (l) lab("timeMult").textContent = `시계 빨리 감기(시험): ${l}`; }
    else if (kind === "edition") this.onEdition?.(v);
    else if (kind === "speed") this.onSpeed?.(v);
    else if (kind === "toon") { const l = this.onToon?.(v); if (l) lab("toonBtn").textContent = `그림체: ${l}`; }
    this.syncSettings();
  }
  /** 🎟 판 · ⏩ 배속 표시를 지금 값에 맞춤(설정의 판 상자 · 시간 칩 툴팁). edition.onChange와 설정 열 때 부름 */
  syncEdition() {
    const e = this.edition; if (!e) return; const $ = id => document.getElementById(id), paid = e.isPaid, sp = e.speed;
    const box = $("edBox"); if (!box) return;
    box.dataset.edition = e.edition; box.dataset.source = e.source;
    $("edNow").textContent = paid ? "💎 유료판" : "🆓 무료판";
    $("edSrc").textContent = e.source === "account" ? "계정에서 정해졌어요" : "설정에서 고름";
    $("edNote").textContent = e.canPick ? "지금은 시험용이라 누구나 바꿀 수 있어요." : "계정 값이 우선이라 여기서는 볼 수만 있어요.";
    for (const b of $("segEdition").children) b.disabled = !e.canPick;
    $("speedLab").textContent = paid ? `⏩ 배속: ×${sp}` : "⏩ 배속: ×1 🔒";
    for (const b of $("segSpeed").children) { const lock = !paid && b.dataset.v !== "1"; b.classList.toggle("locked", lock); b.textContent = `×${b.dataset.v}${lock ? " 🔒" : ""}`; b.setAttribute("aria-label", lock ? `×${b.dataset.v}(유료판 기능)` : `×${b.dataset.v}`); }
    $("speedNote").textContent = paid ? "마을 진행(걸음·일·공사·밭)이 빨라져요 · 하루 빛·날짜는 실제 시각 그대로 · 시간 칩이나 F 키로도" : "🔒 유료판 기능이에요 · 위에서 유료를 고르면 쓸 수 있어요";
    this.drawTimeChip();
    this.chipTime.dataset.tip = paid ? `⏩ 배속 ×${sp} · 누르면 ×1 → ×2 → ×3 (F)` : "⏩ 배속은 유료판 기능 🔒 · 누르면 안내 (F)";
    this.chipTime.setAttribute("aria-label", `${this.chipTime.textContent} · ${paid ? `배속 ×${sp}, 누르면 바꾸기` : "배속은 유료판 기능"}`);
    this.syncSettings(); }
  /** 시간 칩: 시각 + ⏩ 배속. 넓은 화면은 글자로(🌙 22:02 ⏩×3), 휴대폰은 칩 폭이 늘지 않게 오른쪽 위 작은 딱지(data-speed, CSS ::before) */
  drawTimeChip() {
    const sp = this.edition?.speed ?? 1, small = this.phoneForm, c = this.chipTime; if (!c || !this.timeLabel) return;
    cardPut(c, (small ? this.timeLabel().replace(" ", "") : this.timeLabel()) + (sp > 1 && !small ? ` ⏩×${sp}` : ""));
    c.classList.toggle("fast", sp > 1); const d = sp > 1 && small ? `×${sp}` : ""; if ((c.dataset.speed || "") !== d) { if (d) c.dataset.speed = d; else delete c.dataset.speed; }
  }
  /** 무료판에서 배속을 누름: 🔒 유료판 기능 안내 + 설정의 판 줄로 가는 바로가기 */
  async speedLocked() {
    const flash = () => { const box = document.getElementById("edBox"); box?.scrollIntoView?.({ block: "nearest" }); box?.classList.remove("flash"); void box?.offsetWidth; box?.classList.add("flash"); return box; };
    if (!this.phone.hidden && this.app === "settings") { flash(); this.status("🔒 배속은 유료판 기능이에요 · 🎟 판에서 유료를 고르면 쓸 수 있어요", { kind: "warn" }); return; }   // 설정 안에서 누르면 창 없이 판 줄만 반짝
    const go = await this.confirm({ title: "🔒 유료판 기능이에요", body: "⏩ 배속(×2·×3)은 유료판에서 쓸 수 있어요. 지금은 시험용이라 설정의 🎟 판에서 바로 바꿀 수 있어요.", ok: "🎟 판 바꾸러 가기", cancel: "닫기" });
    if (!go) return;
    if (this.phone.hidden) this.openPhone(); this.openApp("settings");
    flash()?.querySelector('#segEdition [data-v="paid"]')?.focus({ preventScroll: true });
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
    if (app === "settings") { this.showSetTab(this.setTab); this.drawInstant?.(); this.syncEdition(); }
    if (app === "help") { const touch = document.documentElement.dataset.input === "touch";   // 지금 쓰는 쪽 조작만 펼쳐 둠(터치 ↔ 마우스·키보드)
      for (const d of document.querySelectorAll("#help details[data-input]")) d.open = d.dataset.input === (touch ? "touch" : "mouse"); }
    this.coach?.appHint(app, document.getElementById(pages[app]));                 // 처음 여는 앱이면 맨 위에 짧은 안내 한 번
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
      const html = bankHtml(w, (k, t, h, o) => this.more(k, t, h, o)), body = document.getElementById("bankBody");
      if (this.bankHtmlNow !== html) { this.bankHtmlNow = html; body.innerHTML = html; }   // 그릴 값이 같으면 안 씀(5Hz 갱신에 누름·펼침이 끊기지 않게)
    } else if (this.app === "market") {
      const html = marketAppHtml(w, { more: (k, t, h, o) => this.more(k, t, h, o), price: k => this.priceCell(k) }), body = document.getElementById("marketBody");
      if (this.marketHtmlNow !== html) { this.marketHtmlNow = html; body.innerHTML = html; }   // 그릴 값이 같으면 안 씀(펼침·누름이 끊기지 않게)
    } else if (this.app === "decor") {
      const houses = [...w.buildings.values()].filter(b => BUILDINGS[b.defId].house && w.isDone(b));
      const body = document.getElementById("decorBody");
      if (this.decorKey === houses.map(b => b.id + ":" + Fu.comfort(b) + ":" + (b.owner || "")).join(",")) return;   // 바뀐 게 없으면 다시 안 그림(버튼이 눌리게)
      this.decorKey = houses.map(b => b.id + ":" + Fu.comfort(b) + ":" + (b.owner || "")).join(",");
      body.innerHTML = decorHeadHtml(houses.map(b => { const o = w.units.find(u => u.unitId === b.owner); return { name: `${BUILDINGS[b.defId].name}${o ? `(${o.name})` : ""}`, comfort: Fu.comfort(b) }; }), { more: (k, t, h, o) => this.more(k, t, h, o) });
      for (const b of houses) { const owner = w.units.find(u => u.unitId === b.owner), row = el("div", "row");
        row.append(el("span", "nm", `🏠 ${BUILDINGS[b.defId].name}`), el("span", "act", `${owner ? `주인 ${owner.name}` : "주인 없음"} · 🛋 ${Fu.comfort(b)}`));
        row.onclick = () => { this.closePhone(); this.onDecorate?.(b); this.coach?.moment("room"); }; body.appendChild(row); }
    } else if (this.app === "town") {
      const html = townAppHtml(w, { today: this.today?.() || new Date(), more: (k, t, h, o) => this.more(k, t, h, o) }), body = document.getElementById("townBody");
      if (this.townHtmlNow !== html) { this.townHtmlNow = html; body.innerHTML = html; }   // 핵심 요약 + 접기(appViews.js) · 바뀐 때만
    } else if (this.app === "wish") {
      this.drawDaily();
      const html = wishListHtml(w, { more: (k, t, h, o) => this.more(k, t, h, o) }), body = document.getElementById("wishBody");
      if (this.wishHtmlNow !== html) { this.wishHtmlNow = html; body.innerHTML = html; }
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
  /** 배지에 쓰는 값: 할 일(지금 쓸 수 있는 도장 수 — 가구·귀한 선물 가운데 가장 싼 값 이상일 때) · 새 소식(소식지 마지막 기사 · 도감에 모은 가짓수) */
  badgeNow() {
    const w = this.world, log = w.newsLog || [], last = log[log.length - 1];
    const si = w.summonInfo();
    return { act: stampBadge(w), summon: si.can ? si.count : 0,
      news: `${log.length}|${last?.t}|${last?.text}`,
      dex: Object.keys(w.collection || {}).length + Object.keys(w.items || {}).filter(k => w.items[k]).length + Object.keys(w.skySeen || {}).length };
  }
  /** 📱 버튼과 앱 아이콘의 배지(바뀔 때만 손댐). 빨간 숫자가 있으면 📱엔 점을 따로 안 붙임 */
  drawBadges() {
    const now = this.badgeNow(); if (!this.seen) this.seen = { news: now.news, dex: now.dex };
    if (!this.phone.hidden && (this.app === "news" || this.app === "dex")) this.seen[this.app] = now[this.app];   // 보는 중에 온 소식도 본 것으로
    const newNews = now.news !== this.seen.news && this.app !== "news", newDex = now.dex > this.seen.dex && this.app !== "dex";
    const key = `${now.act}|${newNews}|${newDex}|${now.summon}`; if (key === this.badgeKey) return; this.badgeKey = key;
    const cnt = this.phoneBtn.querySelector(".badge-count"), dot = this.phoneBtn.querySelector(".dot");
    cnt.hidden = !now.act; cnt.textContent = now.act || ""; dot.hidden = !!now.act || !(newNews || newDex);
    this.phoneBtn.setAttribute("aria-label", `갈매폰${now.act ? ` · 쓸 수 있는 도장 ${now.act}개` : ""}${newNews || newDex ? " · 새 소식" : ""}`);
    const wb = this.appBtns?.wish; if (wb) for (const e of [wb, wb.firstElementChild]) { if (!e) continue; if (now.act) e.dataset.count = now.act; else delete e.dataset.count; }   // 숫자는 아이콘(span)의 ::after가 attr로 읽음
    const sb = this.appBtns?.summon; if (sb) { for (const e of [sb, sb.firstElementChild]) { if (!e) continue; if (now.summon) e.dataset.count = now.summon; else delete e.dataset.count; }   // 🥚 지금 부를 수 있는 마릿수
      sb.setAttribute("aria-label", now.summon ? `소환 · 지금 ${now.summon}마리 부를 수 있어요` : "소환"); }
    this.appBtns?.news?.classList.toggle("new", newNews); this.appBtns?.dex?.classList.toggle("new", newDex);
  }
  /** 📱 소원 앱 맨 위 「오늘」: 오늘의 부탁(나아간 만큼 막대) · 모은 도장 · 도장 가게. 바뀐 게 없으면 다시 안 그림(가게 단추가 눌리게) */
  drawDaily() {
    const w = this.world, d = w.daily, body = document.getElementById("dailyBody");
    const key = `${d?.key}|${d?.reqs.map(r => r.id + r.have).join(",")}|${d?.stamped}|${w.stamps}|${w.wishes.length}|${stampShopKey(w)}`;
    if (key === this.dailyDrawn && body.firstChild) return;
    this.dailyDrawn = key; const open = !!body.querySelector("details.sshop")?.open, can = stampBadge(w);   // 가게를 펼쳐 뒀으면 다시 그려도 그대로 · 처음엔 접고(10단계: 첫 화면엔 머리+접기 요약만), 바꿀 수 있으면 요약 줄에 굵게
    body.onclick = e => { const b = e.target.closest?.("[data-stamp]"); if (!b || b.disabled) return; this.onStampBuy?.(b.dataset.stamp); this.drawDaily(); };
    const reqs = !d ? `<p class="dim">오늘의 부탁을 읽는 중이에요.</p>` : !d.reqs.length ? `<p class="dim">오늘은 부탁이 없어요. 갈매미를 불러 마을을 시작해 보세요.</p>`
      : d.reqs.map(r => { const ok = r.have >= r.need; return `<div class="dreq${ok ? " done" : ""}" data-daily="${r.id}"><span class="ico">${ok ? "✅" : r.icon}</span><div><div class="dtx"><span>${escHtml(r.text)}</span><em>${r.have} / ${r.need}</em></div><div class="rbar"><i style="width:${Math.round(r.have / r.need * 100)}%"></i></div></div></div>`; }).join("");
    const note = !d?.reqs.length ? "" : d.stamped ? `<p class="dnote"><b>모두 들어줬어요!</b> 도장 하나를 받았어요 · 내일 새 부탁이 와요</p>`
      : `<p class="dim dsub"><span class="av-nw">${d.reqs.length >= DAILY_COUNT ? "세 가지" : "모두"} 들어주면 🏵 도장 하나 ·</span> <span class="av-nw">날이 바뀌면 새 부탁</span></p>`;
    body.innerHTML = `${dailyHead(w)}${reqs}${note}` +
      `<details class="sshop"${open ? " open" : ""}><summary>🏪 도장 가게 ${can ? `<b class="sshop-can">🔔 지금 바꿀 수 있어요</b>` : `<span class="dim">귀한 선물 · 한정 가구</span>`}</summary>${stampShopHtml(w)}</details>`;
  }
  /** 📱 소식지: 마을 날짜별(새 날부터) 머릿기사. 하루 = 마을 시간 NEWS_DAY_SECS초, 최근 NEWS_KEEP_DAYS일치. */
  drawNews() {
    const w = this.world, body = document.getElementById("newsBody"), today = newsDay(w.time), log = w.newsLog, last = log[log.length - 1];
    const key = `${today}|${log.length}|${last?.t}|${last?.text}`;
    if (key === this.newsKey && body.firstChild) return;                            // 바뀐 게 없으면 다시 안 그림(읽는 중에 화면이 튀지 않게)
    this.newsKey = key;
    body.innerHTML = newsAppHtml(w, { more: (k, t, h, o) => this.more(k, t, h, o) });   // 오늘 머리기사 크게 · 나머지·지난 날짜는 접기(appViews.js)
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
    let text;
    if (us.length === 1) text = `<p class="dim">${us[0].name} 혼자예요. 🥚 소환으로 친구를 불러 주면 인사하며 친해져요.</p>`;
    else if (sel < 0) text = `<p class="dim av-tap">👆 갈매미를 누르면 누구와 친한지 보여 줘요</p>`;
    else { const u = us[sel], rows = us.filter(o => o !== u).map(o => [o, M.affinity(u, o)]).sort((a, b) => b[1] - a[1]).map(([o, v]) => { const d = ST[M.friendStage(v)];
        return `<tr><td>${v ? d.icon : "·"} ${o.name}</td><td>${v ? `<b>${d.name}</b> <span class="dim">호감 ${Math.round(v * 10) / 10}</span>` : `<span class="dim">아직 잘 몰라요</span>`}</td></tr>`; }).join("");
      text = `<h4>${JOBS[u.job]?.icon ?? ""} ${u.name}의 사이</h4><table class="tbl">${rows}</table>`; }
    body.innerHTML = relHeadHtml(g.links, us.length) + `<svg viewBox="0 0 300 300" role="img" aria-label="갈매미 관계도">${lines}${dots}</svg>` +
      text + this.more("rel.legend", "🎨 범례 · 읽는 법", relLegendHtml(ST));   // 머리(단짝 수) → 그림 → 고른 갈매미 사이 → 범례는 접기
  }
  /** 시세 칸: 지금 값 + 지난 기록과 비교한 화살표 + 작은 그래프(20초마다 한 점, 최근 16분) */
  priceCell(k) { return priceCellHtml(this.world, k); }
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
  /** 건설 확인창 요약(#cfInfo): 설계비 · 금고 잔액 → 낸 뒤 · 재료 · 짓는 이 · 못 지으면 '착공 불가'와 까닭. 글이 같으면 안 씀 */
  drawPlan() {
    const p = this.planNow, box = document.getElementById("cfInfo"), w = this.world;
    if (!p || !box) { if (box && box.innerHTML) { box.innerHTML = ""; this.planHtmlNow = ""; } return; }
    let info;
    if (p.move) info = moveInfo(w, p.move, w.moveLandmark(p.move, p.ax, p.az, p.rot, { dry: true }));   // 🚚 지형지물 옮기기(dry: 아무것도 안 바꿈)
    else if (p.bridge) info = bridgeInfo(w, p.ok, p.water);
    else info = planInfo(w, p.defId, w.check(p.defId, p.ax, p.az, p.rot));
    const html = p.move ? moveHtml(info) : planHtml(info);
    const goText = p.move ? "🚚 옮기기" : "🔨 건설", cfGo = document.getElementById("cfBuild"); if (cfGo.firstChild?.nodeType === 3 && cfGo.firstChild.nodeValue !== goText) cfGo.firstChild.nodeValue = goText;   // 키 힌트(.kbd)는 그대로
    if (html !== this.planHtmlNow) { this.planHtmlNow = html; box.innerHTML = html; }
    const cfBuild = document.getElementById("cfBuild"); if (cfBuild.disabled !== !info.ok) cfBuild.disabled = !info.ok;
    box.parentElement.classList.toggle("bad", !info.ok);
  }
  /** 갤러리 카드 아래 글(설계비 · 재료)을 금고·물가에 맞춰 고침(바뀐 카드만) */
  drawCardMeta() {
    const w = this.world; if (!this.buildCards) return;
    for (const c of this.buildCards) { const def = BUILDINGS[c.dataset.build]; if (!def || c.dataset.why) continue;
      const m = cardMeta(w, def), meta = c.querySelector(".bmeta"); if (meta && meta.dataset.html !== m.html) { meta.dataset.html = m.html; meta.innerHTML = m.html; c.classList.toggle("short", m.short); c.setAttribute("aria-label", `${def.name}, ${def.footprint.w}×${def.footprint.d}칸, ${m.text}`); } }
  }
  /** 건물 카드 하나: 사진(실제 모델) + 크기 딱지 + 이름 + 재료(잠겼으면 그 이유를 글자로) */
  buildCard(def) {
    const w = this.world, upFrom = def.upgradeFrom && BUILDINGS[def.upgradeFrom], rankLock = (def.rank || 0) > w.rank, locked = rankLock || !!upFrom || !w.builderFor(def), tierName = RARITY[["", "common", "rare", "epic", "legend"][def.tier]].name;
    const who = def.builtBy === "carpenter" ? "🪚 목수" : "🔨 건축가", size = `${def.footprint.w}×${def.footprint.d}`;
    const cost = Object.entries(def.cost || {}).filter(([, n]) => n > 0).map(([k, n]) => `${E.ITEM_ICON[k] ?? k}${n}`).join(" ") || "재료 없음";
    const why = upFrom ? `${upFrom.name}에서 업그레이드${rankLock ? ` · ${RANKS[def.rank].icon} ${RANKS[def.rank].name}부터` : ""}` : rankLock ? `${RANKS[def.rank].icon} ${RANKS[def.rank].name}부터` : locked ? `${who} 필요` : def.winterOnly && w.season !== "winter" ? "❄️ 겨울에만" : "";   // 잠긴 이유는 글자로(🔒 딱지는 사진 위에)
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
    const meta = el("span", "bmeta"), m = cardMeta(w, def);                         // 아래 글: 잠긴 까닭 또는 설계비 · 재료(금고보다 비싸면 빨간 숫자 — drawCardMeta가 금고에 맞춰 고침)
    if (why) { meta.textContent = why; b.dataset.why = why; } else { meta.innerHTML = m.html; meta.dataset.html = m.html; b.classList.toggle("short", m.short); }
    b.append(pic, el("span", "bsz", size), el("span", "bnm", def.name), meta); if (locked) b.append(el("span", "block", "🔒"));
    b.setAttribute("aria-label", why ? `${def.name}, ${size}칸, 재료 ${cost}, ${locked ? "잠김: " : ""}${why}` : `${def.name}, ${size}칸, ${m.text}`);
    b.dataset.tip = `${def.name} ${size}칸 · ${w.economy ? `설계비 🪙${m.fee}(금고에서) · ` : ""}재료 ${cost} · ${def.tier > 1 ? tierName + " 이상 " : ""}${who}가 지어요${def.note ? ` · ${def.note}` : ""}${def.price ? ` · 다 지으면 시장에서 🪙${w.economy ? w.housePrice(def.id) : def.price}에 팔려요` : ""}${rankLock ? ` (🏅 마을 등급 ${RANKS[def.rank].icon} ${RANKS[def.rank].name}부터)` : locked ? " (지금은 없음)" : ""}`;
    b.onclick = upFrom ? () => this.status(`${def.name}은 바로 못 지어요 · 다 지은 ${upFrom.name}을 눌러 업그레이드해요${rankLock ? ` (${RANKS[def.rank].icon} ${RANKS[def.rank].name}부터)` : ""}`, { kind: "info" }) : () => this.tools.setMode("build", def.id); return b;
  }
  /** 건물 갤러리: 잠금·계절이 바뀔 때만 카드를 다시 만들고, 고르기만 했으면 표시만 바꿈(사진이 깜빡이지 않고 밀어 둔 자리도 그대로) */
  drawBuildTray(arg) {
    const w = this.world, defs = Object.values(BUILDINGS).filter(d => d.menu !== false);   // 은행·예전 건물은 메뉴에서 뺌
    const key = `${w.rank}|${w.season}|${defs.map(d => w.builderFor(d) ? 1 : 0).join("")}`;
    if (key !== this.trayKey || w !== this.trayWorld) { this.trayKey = key; this.trayWorld = w; this.buildCards = defs.map(d => this.buildCard(d)); }
    for (const c of this.buildCards) { const on = c.dataset.build === arg; c.classList.toggle("on", on); c.setAttribute("aria-pressed", String(on)); }
    this.sub.append(...this.buildCards); this.filterBuild(); this.drawCardMeta();
  }
  filterBuild() {
    for (const b of this.catBtns) { const on = b.dataset.cat === this.buildCat; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
    for (const c of this.buildCards || []) c.hidden = this.buildCat !== "all" && c.dataset.cat !== this.buildCat;
  }
  showMode(mode, arg) {
    document.getElementById("houseCard").hidden = true;                             // 도구를 바꾸면 집 카드는 닫음
    const dm = mode === "view" ? "browse" : "edit"; if (document.body.dataset.mode !== dm) document.body.dataset.mode = dm;   // 평소(browse) · 건설 모드(edit): 배치는 CSS가
    if (this.ic) this.syncInfo();                                                   // 휴대폰: 건설 중엔 따라가기 카드를 한 줄로 접음(바로)
    if (mode !== "view") this.lastEdit = mode;
    this.modeBtns.forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    if (mode === "view" && this.tools.hand) this.tools.setHand(false);
    const terrain = mode === "paint" || mode === "height", nature = mode === "nature", sub = this.sub;
    if (!terrain && this.tools.cross) this.tools.setCross(false);                   // 십자선은 칠하기·높이에서만(켜 둔 채 짓기로 가면 누르기가 안 먹던 것)
    // 보조 줄: 도구에 맞는 것만
    this.ecats.hidden = mode !== "build"; this.ehint.hidden = mode !== "demolish"; this.crossBtn.hidden = !terrain; this.crossBtn.classList.toggle("on", this.tools.cross);
    const tap = tapTool(mode, nature ? natureAction(arg).kind : null);             // 톡 = 고르기 · 끌기 = 화면 옮기기 도구: ✋가 필요 없음(켜 둔 채 오면 끔 — 켜져 있으면 톡이 안 먹음)
    if (tap && this.tools.hand) this.tools.setHand(false);
    this.handBtn.hidden = mode === "view" || tap;
    this.undoBtns[0].hidden = this.undoBtns[1].hidden = !terrain && !nature; this.undoBtns[0].disabled = !this.tools.history.length; this.undoBtns[1].disabled = !this.tools.redoStack.length;
    for (const b of this.viewBtns) b.hidden = mode === "view";                      // 평소엔 Z·X 키도 쉬게
    this.auxSep.hidden = this.handBtn.hidden && this.undoBtns[0].hidden && this.crossBtn.hidden;   // 앞에 단추가 없으면 칸막이도 숨김
    this.gridBtn.hidden = this.gridChip.hidden = mode === "view";                   // ▦ 격자(G)도 건설 모드에서만
    // 트레이: 같은 도구 안에서 고르기만 했으면 밀어 둔 자리를 지킴
    const keep = mode === this.shownMode ? [sub.scrollLeft, sub.scrollTop] : null; this.shownMode = mode;
    sub.replaceChildren(); sub.hidden = !(terrain || nature || mode === "build"); sub.dataset.kind = mode;
    if (nature) this.drawNatureTray(arg);
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
    if (mode === "demolish") this.status("🧹 철거: 없앨 건물을 톡 누르면 바로 사라져요 · 끌면 화면 이동 · 되돌릴 수 없으니 천천히 골라요");
    if (keep) { sub.scrollLeft = keep[0]; sub.scrollTop = keep[1]; }
    else { sub.scrollLeft = sub.scrollTop = 0; }                                    // 다른 도구로 바꾸면 처음부터(세로 폰: 높이에서 밀어 둔 채 칠하기로 오면 「바닥」 묶음이 왼쪽 밖에 숨던 것)
    if (!keep && nature) { const c = this.natCards?.find(x => x.dataset.nat === arg); if (c && (c.offsetLeft + c.offsetWidth > sub.clientWidth || c.offsetTop + c.offsetHeight > sub.clientHeight)) { sub.scrollLeft = Math.max(0, c.offsetLeft - 8); sub.scrollTop = Math.max(0, c.offsetTop - 8); } }   // 들어올 때: 고른 도구가 보이게
    if (!keep && mode === "build") { const c = this.buildCards.find(x => x.dataset.build === arg && !x.hidden); if (c) { sub.scrollLeft = Math.max(0, c.offsetLeft - 8); sub.scrollTop = Math.max(0, c.offsetTop - 8); } }   // 들어올 때: 고른 건물이 보이게
    if (mode === "height" && arg === "level" && this.shownOp !== "level") { const g = sub.querySelector("[data-level]")?.closest(".tgrp"); if (g) { sub.scrollLeft = Math.max(0, g.offsetLeft - 64); sub.scrollTop = Math.max(0, g.offsetTop - 64); } }   // 🎚 단 맞추기를 고르면 「맞출 높이」가 바로 보이게(세로 폰은 옆으로 미는 한 줄)
    this.shownOp = mode === "height" ? arg : null;
  }
  /** 🌳 자연·지형 트레이: 묶음(심기·놓기 · 치우기 · 땅 · 옮기기)마다 카드(아이콘 + 이름 + 값·한도). 파기·메우기를 고르면 붓 크기·모양도 */
  drawNatureTray(arg) {
    const w = this.world, info = w.customInfo(), tools = natureToolsFor(info), a = natureAction(arg); this.lastNature = arg; this.natCards = [];
    for (const [g, label] of NATURE_GROUPS) {
      const list = tools.filter(t => t.group === g); if (!list.length) continue; const box = this.trayGroup(label);
      for (const t of list) {
        const b = el("button", "ncard"), m = natureCard(t, info), on = t.arg === arg; b.dataset.nat = t.arg; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
        b.append(el("span", "ni", t.icon), el("span", "nn", t.name), el("span", "nm", m.meta)); b.dataset.tip = `${t.icon} ${t.name} ${t.verb}: ${t.tip}`;
        b.classList.toggle("off", m.off); b.classList.toggle("short", !!m.short); b.setAttribute("aria-label", `${t.name} ${t.verb}, ${m.meta}`);
        b.onclick = m.off ? () => this.status(`${t.icon} ${t.name}: ${m.why}`) : () => this.tools.setMode("nature", t.arg);
        box.appendChild(b); this.natCards.push(b);
      }
    }
    if (a.kind === "dig" || a.kind === "fill") this.addEditTools();
    const t = tools.find(x => x.arg === arg); if (t) this.status(`${t.icon} ${t.name} ${t.verb}: ${t.tip}${a.kind === "move" ? " · 자리를 톡 누르고 🚚 옮기기 · 끌면 화면 이동" : a.kind === "dig" || a.kind === "fill" ? "" : " · 누르거나 끌어서"}`);
  }
  /** 자연·지형 카드 아래 글(값·한도·금고 모자람)을 금고·수에 맞춰 고침(바뀐 카드만) */
  drawNatureMeta() {
    if (!this.natCards?.length) return; const info = this.world.customInfo(), tools = natureToolsFor(info);
    for (const c of this.natCards) { const t = tools.find(x => x.arg === c.dataset.nat); if (!t) continue; const m = natureCard(t, info), nm = c.querySelector(".nm");
      if (nm.textContent !== m.meta) { nm.textContent = m.meta; c.setAttribute("aria-label", `${t.name} ${t.verb}, ${m.meta}`); } c.classList.toggle("short", !!m.short); }
  }
  /** 꾸미기로 낸 돈·돌려받은 돈을 금고 칩 옆에 잠깐(3초, 이어서 하면 합쳐서) */
  customSpent(e) { this.vaultSpent((e?.refund || 0) - (e?.cost || 0)); }
  /** 금고 칩 옆 ±n(꾸미기·설계비·품삯을 한 합으로, VF_SUM_MS 안에 이어서 나가면 합침). count: 칩 숫자가 줄어드는 움직임 + 잠깐 빨간 글(설계비·품삯) */
  vaultSpent(d, { count = false } = {}) {
    if (!d) return;
    const sum = (this.spendSum ||= makeSpendSum(VF_SUM_MS)).add(d, performance.now()).sum;
    let s = this.chipVault.querySelector(".vspend"); if (!s) { s = el("span", "vspend"); s.setAttribute("aria-hidden", "true"); this.chipVault.appendChild(s); }
    s.textContent = chipSpendText(sum); s.dataset.sign = sum > 0 ? "plus" : "minus"; s.hidden = !sum;
    clearTimeout(this.spendT); this.spendT = setTimeout(() => { s.hidden = true; this.spendSum.reset(); }, VF_SUM_MS);
    if (count && d < 0) this.countVault(-d);
  }
  /** 칩 숫자: 지금 보이는 값(또는 나가기 전 값)에서 금고 값까지 VF_COUNT_MS 동안 줄어듦. 움직임 줄이기면 바로 새 값(빨간 글은 그대로 — 움직임이 아님) */
  countVault(n) {
    const w = this.world, c = this.chipVault; if (!w?.economy || !c) return;
    c.classList.add("spent"); clearTimeout(this.flashT); this.flashT = setTimeout(() => c.classList.remove("spent"), VF_FLASH_MS);
    const to = Math.floor(w.bank?.vault ?? 0);
    if (document.documentElement.dataset.motion === "reduce") { this.countEnd = 0; this.drawMoneyChips(); return; }
    const from = this.countEnd > performance.now() ? this.countShown : to + n;
    this.countFrom = from; this.countTo = to; this.countT0 = performance.now(); this.countEnd = this.countT0 + VF_COUNT_MS; this.countShown = from;
    if (this.countRaf) return;
    const step = () => {
      const now = performance.now(), k = (now - this.countT0) / VF_COUNT_MS, live = Math.floor(this.world?.bank?.vault ?? this.countTo);
      if (live !== this.countTo) { this.countTo = live; }                         // 세는 동안 금고가 또 바뀌면 그 값으로
      this.countShown = countAt(this.countFrom, this.countTo, k); cardPut(this.chipParts.vv, this.vaultChip(this.countShown).text);
      if (k < 1) this.countRaf = requestAnimationFrame(step); else { this.countRaf = 0; this.countEnd = 0; this.drawMoneyChips(); }
    };
    this.countRaf = requestAnimationFrame(step);
  }
  /** 🥚 소환 페이지: 지금 부를 수 있는 수(인구 = 집 수) · 단추(못 부르면 꺼짐 + 까닭) · 다음 갈매미 · 자이언트 안내 · 자세히. 글이 같으면 안 씀(5Hz 갱신에 누름·펼침이 끊기지 않게) */
  setSummon(world) {
    const info = world.summonInfo(), btn = summonButton(info), v = summonHtml(info, world.units, (k, t, h, o) => this.more(k, t, h, o));
    if (this.summonBtn.textContent !== btn.text) this.summonBtn.textContent = btn.text;
    if (this.summonBtn.disabled !== btn.disabled) this.summonBtn.disabled = btn.disabled;
    const why = document.getElementById("summonWhy"), whyText = v.giantOnly ? "" : btn.why; if (why.textContent !== whyText) why.textContent = whyText; why.hidden = !whyText;
    for (const [id, html] of [["summonHead", v.head], ["summonMid", v.mid], ["summonMore", v.bottom]]) { const e = document.getElementById(id); if (e.dataset.html !== html) { e.dataset.html = html; e.innerHTML = html; } }
  }
  showFollow(u) { if (u) { const hc = document.getElementById("houseCard"); if (!hc.hidden) hc.hidden = true; } this.follow = u; this.rows?.forEach((r, i) => r.classList.toggle("on", this.world.units[i] === u)); if (this.ic) this.syncInfo(); }   // 카드는 바로(다음 갱신까지 기다리지 않게)
  /** 🎣 당기기! 버튼: 따라가기 카드 바로 위에 붙여서 보여 줌(입질 동안만). 매 프레임 불러도 바뀔 때만 손댐 */
  showTug(on, secs = 1.5) {
    const b = this.tugBtn; if (b.hidden === !on) return;
    if (on) b.style.setProperty("--tug", `${Math.max(0.1, secs).toFixed(2)}s`);   // 줄어드는 줄은 실제로 남은 시간만큼(자리는 CSS: 카드 바로 위)
    b.hidden = !on; this.giftBtn.disabled = on; if (on) { this.giftPick.hidden = true; this.coach?.moment("tug"); }   // 당기는 동안 선물 판은 비켜 줌(같은 자리)
  }
  /** 🎁 선물 고르는 판(카드 바로 위, 당기기 버튼과 같은 자리라 그동안은 비켜 줌)과 ♥ 쓰다듬기 남은 횟수. 자주 불러도 바뀔 때만 손댐 */
  showBond(u) {
    const on = !!u && this.tugBtn.hidden, bar = this.bondBar;
    if (!on || u !== this.bondU) this.giftPick.hidden = true;                       // 다른 갈매미로 바꾸면 고르는 판은 닫음
    this.bondU = u; if (bar.hidden === on) bar.hidden = !on; if (!u) return;       // 자리는 CSS(카드 바로 위, 가로 폰은 카드 옆)
    const left = petsLeft(u, newsDay(this.world.time)), away = !!u.insideBuildingId || u.state === UnitState.Held, label = left ? `♥ 쓰다듬기 ${left}/${PET_DAILY}` : "♥ 내일 또 만나요";
    if (this.petBtn.textContent !== label) this.petBtn.textContent = label;
    if (this.petBtn.disabled !== (!left || away)) this.petBtn.disabled = !left || away;
  }
  /** 선물 고르는 판: 내 주머니(주운 반짝이·도장 선물·답례 물건). 조금 친해지면(하트 1개부터) 좋아하는 것을 ♥로 앞에(gullView.js giftPickHtml) */
  drawGifts() {
    const u = this.follow; if (!u) { this.giftPick.hidden = true; return; }
    const html = giftPickHtml(u, this.world); if (html !== this.giftHtml || !this.giftPick.firstChild) { this.giftHtml = html; this.giftPick.innerHTML = html; }
  }
  /** 도감(낚은 물고기)·가방(건진 물건): 이제 갈매폰 안 페이지(‹ 뒤로 = 폰 홈) */
  showDex(on) {
    if (on) { if (this.phone.hidden) this.openPhone(); this.openApp("dex"); }
    else if (this.app === "dex") this.openApp(null);
  }
  drawDex() {
    const w = this.world, body = document.getElementById("dexBody"), cnt = dexCounts(w);
    body.innerHTML = dexHeadHtml(cnt);                                             // 머리: 물고기 n/N(막대) · 기증 · 하늘 · 가방 — 묶음은 저마다 접기(펼침은 기억)
    const held = stashTotals(w);                                                   // 갈매미들이 각자 가진 것(소지품) — 내 것이 아니라 보기만
    const fold = (key, title, note) => { const t = el("div"); t.innerHTML = this.more(key, title, "", { note }); const d = t.firstElementChild; body.append(d); return d.querySelector(".more-b"); };
    let box = body;
    const sec = (title, list, count, extra, more) => {
      const g = el("div", "dexgrid");
      for (const it of list) { const n = count(it), c = el("div", "dexcell" + (n ? "" : " unknown"));
        c.style.borderColor = RARITY[it.rarity].color;
        const ss = it.season ? SEASONS[it.season] : null, now = it.season && it.season === w.season;
        c.append(el("b", "", n ? it.name : "???"), el("span", "", `${RARITY[it.rarity].name}${n ? ` · ${n}개` : ""}`), el("span", "dim", n ? extra(it) : ""));
        if (ss) { const t = el("span", "season" + (now ? " now" : ""), `${ss.icon} ${ss.name}에만${now ? " · 지금!" : ""}`); c.append(t); }
        more?.(it, c, n); g.append(c); }
      box.append(g);
    };
    box = fold("dex.fish", "🐟 물고기 도감", `${cnt.fish}/${cnt.fishAll}`);
    sec("", FISH, f => w.collection[f.id] || 0,
      f => f.rarity === "common" ? `음식 +${f.food}` : `보물 ${f.price}🐚${held[f.id] ? ` · 갈매미들이 ${held[f.id]} 가짐` : ""}`,
      (f, c, n) => {                                                               // 수족관: 크기 기록·메달(다음 메달까지) · 기증됨
        const m = n ? fishMedal(f, w.fishRecord[f.id]) : 0;
        if (m) { const t = medalLine(f, w.fishRecord[f.id]); c.classList.add("m-" + MEDALS[m].id); c.append(el("span", "rec", t.now)); if (t.next) c.append(el("span", "dim", t.next)); }
        if (w.donated[f.id]) c.append(el("span", "donated", "🐠 기증됨"));
      });
    {                                                                              // 수족관 기증 현황(물고기 도감 바로 아래)
      const have = donatedCount(w.donated), next = DONATE_GIFTS[w.donateGifts], gift = next && ITEMS.find(i => i.id === next.item);
      box.append(el("p", "dim aqua", !w.aquariumB() && !have ? "🐠 수족관(마을 등급 ⚓ 항구 마을부터)을 지으면 처음 낚은 희귀 이상 물고기를 한 마리씩 기증해요."
        : `🐠 수족관 기증 ${have}/${DONATE_KINDS.length}종 · ${next ? `다음 기념 선물: ${next.label} 기증하면 ${gift?.name ?? "선물"}` : "기념 선물을 모두 받았어요!"}`));
    }
    {                                                                              // 금메달 기념 가구(기증 현황 아래)
      const next = MEDAL_GIFTS[w.medalGifts], gift = next && ITEMS.find(i => i.id === next.item);
      box.append(el("p", "dim aqua", `🥇 금메달 ${cnt.gold}/${cnt.fishAll}종 · ${next ? `${next.label}이면 기념 가구 ${gift?.name ?? ""}` : "기념 가구를 모두 받았어요!"} · 🥈 상위 절반 · 🥇 상위 15%(제철 물고기 30%)`));
    }
    box = fold("dex.bag", "🎁 가방", `${cnt.bag}/${cnt.bagAll}`);
    sec("", ITEMS, i => w.items[i.id] || 0,
      i => i.furniture ? "가구 · 🏠 집 꾸미기에서 아무 집에나 놓기" : i.gift ? `선물 · ${GIFT_CAT_NAME[giftDef(i.id)?.cat] || "선물거리"}` : `${i.price}🐚${held[i.id] ? ` · 갈매미들이 ${held[i.id]} 가짐` : ""}`);
    {                                                                              // 하늘 기록: 드문 하늘을 본 횟수
      box = fold("dex.sky", "🌈 하늘 기록", `${cnt.sky}/${cnt.skyAll}`); const g = el("div", "dexgrid skydex");
      for (const [k, d] of Object.entries(SKY_EVENTS)) { const n = w.skySeen[k] || 0, c = el("div", "dexcell" + (n ? "" : " unknown")); c.dataset.sky = k;
        c.append(el("b", "", n ? `${d.icon} ${d.name}` : "???"), el("span", "", n ? `${n}번 봤어요` : "아직 못 봤어요"), el("span", "dim", SKY_HINT[k])); g.append(c); }
      box.append(g);
    }
    box = fold("dex.note", "ℹ️ 도감 읽는 법", "");
    box.append(el("p", "dim", "🎁 내 주머니(주운 반짝이·도장 선물)는 갈매미를 따라가며 선물로 건네요. 갈매미가 모은 것은 그 갈매미의 소지품이에요."));
    box.append(el("p", "dim", "계절 한정 물고기·물건은 그 계절에만 나와요(물건은 낚시나 바닷가에서 먹이를 잡다가 주워요). 다른 사람과 바꾸기는 서버(여러 사람 접속)가 생기면 붙일 예정이에요."));
  }
  setQuality(mode) { if (!mode) return; for (const b of this.qBox.children) b.classList.toggle("on", b.dataset.q === mode); document.getElementById("qualityNote").textContent = QUALITY_NOTE[mode]; }
  /** 알림 한 줄. status(글) = 버튼·도구 안내: 바로 바꿔 보여 줌(빈 글이면 안내만 지움 — 도구를 바꿀 때 낡은 안내가 남지 않게).
   *  status(글, { kind, queue: true }) = 마을 소식: 보이는 것을 덮지 않고 차례로(대기 최대 3개, 같은 글이 이어지면 ×2로 묶음), 지난 알림에 남김.
   *  full: true = 차례를 기다리는 소식이라도 꼬리말까지 다 보임(처음 켤 때 안내처럼 할 일이 꼬리에 있는 글)
   *  kind: info(파랑) · good(초록) · warn(주황) · error(빨강) — 왼쪽 색 띠(색만으로 알리지 않게 글 앞에 이모지가 붙어 옴) */
  status(text, opt) {
    const kind = opt?.kind || "info";
    if (opt?.queue) return this.notify(text, kind, !!opt.full);
    if (!text) { if (this.toastCur && !this.toastCur.q) this.toastEnd(); return; }
    if (opt?.kind === "warn" || opt?.kind === "error") this.logNote(text, kind);
    if (this.toastCur?.q) this.toastQ.unshift(this.toastCur);                     // 보이던 소식은 맨 앞으로 되돌려 안내 다음에 다시
    while (this.toastQ.length > 3) this.toastQ.pop();
    this.toastShow({ text, kind, q: false, n: 1 }, document.body.dataset.mode === "edit" ? 4000 : 6000);   // 건설 중 안내는 4초(화면을 덜 가리게)
  }
  notify(text, kind = "info", full = false) {
    if (!text) return; this.logNote(text, kind);
    const same = [this.toastCur, this.toastQ[this.toastQ.length - 1]].find(x => x?.q && x.text === text);
    if (same) { same.n++; if (same === this.toastCur) this.toastShow(same, this.toastMs(same)); return; }   // 같은 소식이 이어지면 ×2, ×3
    this.toastQ.push({ text, kind, q: true, n: 1, full }); while (this.toastQ.length > 3) this.toastQ.shift();   // 너무 밀리면 오래된 것부터 버림(지난 알림엔 남음)
    if (!this.toastCur) this.toastNext();
  }
  toastMs(it) { return toastHtml(it.text, { keepTail: !it.q || it.full }).len > 40 ? 6500 : 4500; }
  toastShow(it, ms) {
    this.toastCur = it; const t = toastHtml(it.text, { keepTail: !it.q || it.full, count: it.n });   // 아이콘 + 핵심 낱말 굵게 · 마을 소식의 긴 꼬리말은 지난 알림에서만
    if (this.msgHtml !== t.html) { this.msgHtml = t.html; this.msg.innerHTML = t.html; } this.msg.dataset.kind = it.kind; this.msg.hidden = false;
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
    this.drawMoneyChips();
    if (this.planNow) this.drawPlan();                                               // 건설 확인창: 품삯·세금으로 금고가 바뀌면 설계비 줄·단추를 다시
    if (document.body.dataset.mode === "edit" && this.tools?.mode === "build") this.drawCardMeta();
    if (document.body.dataset.mode === "edit" && this.tools?.mode === "nature") this.drawNatureMeta();
    const sat = w.avgSat ? w.avgSat() : 50, face = sat >= 75 ? "😄" : sat >= 55 ? "🙂" : sat >= 35 ? "😐" : "😣";
    const small = this.phoneForm;                                                    // 휴대폰(세로·가로): 칩은 아이콘 위주(세로 폰은 포만감도 뺌 — 배고프면 알림 칩이 따로 뜸)
    cardPut(this.chipPop, small ? `🐦${w.units.length} ${face}${sat.toFixed(0)}${this.form === "portrait" ? "" : ` ${mood}${avg.toFixed(0)}`}` : `🐦 ${w.units.length} · ${face} ${sat.toFixed(0)} · ${mood} ${avg.toFixed(0)}`); if (!this.chipPop.dataset.tip) this.chipPop.dataset.tip = "갈매미 수 · 평균 만족도 · 평균 포만감";   // "만족" 낱말은 툴팁으로(금고·마을 돈 칸이 늘어 한 줄에 들어가게)
    cardPut(document.getElementById("chipRank"), small ? RANKS[w.rank].icon : `${RANKS[w.rank].icon} ${RANKS[w.rank].name}`);   // 같은 글이면 안 씀
    const mb = document.getElementById("mapBtn"), mt = small ? "🗺" : "🗺 지도";       // 글자만 바꿈(키 힌트 칸은 그대로)
    if (mb.firstChild?.nodeType === 3) { if (mb.firstChild.nodeValue !== mt) mb.firstChild.nodeValue = mt; } else mb.prepend(mt);
    if (this.timeLabel) this.drawTimeChip();   // 휴대폰: 아이콘과 시각 사이 띄어쓰기 없이(칸 하나 아낌)
    if (this.weatherLabel) { const p = this.chipParts, t = tempChipOf(w.air, this.form);   // 휴대폰: 아이콘 + 기온만(🍂☀️ 3°) · 그 밖: 이름까지 + 3°C(4°C 이하 파랑 · 24°C 이상 주황)
      cardPut(p.wl, small ? this.weatherLabel().replace(/ [가-힣]+(?= · |$)/g, "").replace(/ · /g, "") : `${this.weatherLabel()} ·`); cardPut(p.wt, t.text);
      if ((p.wt.dataset.tone || null) !== t.tone) { if (t.tone) p.wt.dataset.tone = t.tone; else delete p.wt.dataset.tone; } }
    const nw = this.world.wishes.length; this.wishBtn.hidden = !nw; this.wishBtn.textContent = small ? `💭${nw}` : `💭 소원 ${nw}`;
    if (this.app === "wish" || this.app === "market") { this.appT = (this.appT || 0) + 1; if (this.appT % 5 === 0) this.refreshApp(); }
    const hungry = w.units.filter(u => (u.full ?? 80) < J.HUNGRY).sort((a, b) => a.full - b.full)[0];
    this.hungry = hungry; this.alertBtn.hidden = !hungry; if (hungry) this.alertBtn.textContent = `😣 ${hungry.name} 배고파요`;
    if (!this.phone.hidden && this.app && this.app !== "gulls" && this.app !== "dex" && this.app !== "menu") this.refreshApp();
    w.units.forEach((u, i) => { if (!this.rows[i]) return; const b = u.insideBuildingId && w.buildings.get(u.insideBuildingId);
      this.rows[i].querySelector(".act").textContent = b ? (u.useFurni ? `🏠 ${FURNITURE[u.useFurni.id].useLabel}` : `${BUILDINGS[b.defId].name} 안`) : stateLabelOf(u);
      this.rows[i].querySelector(".coins").textContent = w.economy ? `🪙${u.coins || 0}${u.home ? " 🏠" : ""}` : "";
      const f = this.rows[i].querySelector(".full"); f.textContent = "🍗" + Math.round(u.full ?? 0);
      f.className = "full" + ((u.full ?? 80) < J.HUNGRY ? " hungry" : (u.full ?? 0) > J.OVERFULL ? " lazy" : ""); });
    this.syncInfo();                                                               // 따라가는 갈매미 카드(값만 고침)
    this.syncBldCard();                                                            // 건물 카드(공사장·밭·의원·잡화점): 바뀐 칸만
  }
  /** 금고 칩 글(금고 값 vault로) */
  vaultChip(vault) { const w = this.world, bk = w.bank || {}, eco = !!w.economy; return vaultChipOf({ economy: eco, vault, owed: bk.owed ?? 0, state: eco && w.vaultState ? w.vaultState() : "ok", coins: w.res?.coins ?? 0 }, this.form); }
  /** 위쪽 줄 🏦 내 금고 · 🪙 마을 돈: 글자·색이 바뀔 때만 DOM을 고침(5Hz 갱신) */
  drawMoneyChips() {
    const w = this.world, bk = w.bank || {}, eco = !!w.economy, p = this.chipParts, supply = eco ? w.moneySupply() : 0;
    const v = this.vaultChip(bk.vault ?? 0);
    if (!(this.countEnd > performance.now())) cardPut(p.vv, v.text);              // 줄어드는 숫자를 보이는 동안은 countVault가 씀
    cardPut(p.vt, eco ? townChipOf(supply, "portrait") : "");
    const c = this.chipVault; if ((c.dataset.tone || null) !== v.tone) { if (v.tone) c.dataset.tone = v.tone; else delete c.dataset.tone; }
    if (c.dataset.tip !== v.tip) { c.dataset.tip = v.tip; c.setAttribute("aria-label", v.tip); }
    if (this.chipTown.hidden !== !eco) this.chipTown.hidden = !eco; if (eco) cardPut(this.chipTown, townChipOf(supply, this.form));
  }
  // ---- 따라가기 카드(#info): 뼈대는 한 번만 만들고, 그 뒤로는 글자와 막대 길이만 고침(누르는 중에 다시 그려져 누름이 사라지지 않게)
  buildInfoCard() {
    const c = this.info, k = this.ic = {}; c.textContent = "";
    const head = el("div", "ihead"), meta = el("div", "imeta"), body = el("div", "ibody"), acts = el("div", "iacts");
    k.name = el("b"); k.job = el("span", "jobtag"); k.hearts = el("span", "hearts"); k.sub = el("span", "dim isub"); meta.append(k.name, k.job, k.hearts, k.sub);
    k.tog = el("button", "itog ghost"); k.tog.type = "button";
    k.tog.innerHTML = `<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;   // 펼친 카드는 아래 꺾쇠(접기), 접힌 카드는 위 꺾쇠(펼치기) — 돌리기는 CSS
    k.x = el("button", "ix ghost", "✕"); k.x.type = "button"; k.x.setAttribute("aria-label", "따라가기 그만"); k.x.dataset.tip = "따라가기 그만";
    head.append(meta, k.tog, k.x);
    const doing = el("div", "doing"); k.doing = el("span"); k.note = el("span", "warn"); doing.append(k.doing, k.note);
    // 체온 칸(막대 줄 맨 앞 — 5개 막대의 빈 칸을 채워 카드가 높아지지 않게): 39° 이하 파랑·굵게 🥶 · 41° 이상 주황 🥵(색만으로 알리지 않게)
    const temp = k.temp = { row: el("div", "need itemp"), label: el("span", "", "체온"), track: el("i"), fill: el("b"), num: el("em") };
    temp.track.appendChild(temp.fill); temp.row.append(temp.label, temp.track, temp.num);
    const needs = el("div", "needs"); needs.appendChild(temp.row); k.bars = ["만족도", "포만감", "피로도", "친구", "재미"].map(label => {
      const row = el("div", "need"), track = el("i"), fill = el("b"), num = el("em"); track.appendChild(fill); row.append(el("span", "", label), track, num); needs.appendChild(row); return { track, fill, num }; });
    // 칩 줄: 🪙 개인 돈 · 🏠 집/대출 · 💸 밀린 품삯 · 🧣 입은 옷 · 🤧 병 · 📦 짐(빈 칸은 숨김)
    const chips = k.chips = el("div", "ichips"); k.chip = {}; for (const key of ["coin", "home", "wage", "wear", "sick", "load"]) { const sp = el("span"); sp.dataset.chip = key; k.chip[key] = sp; chips.appendChild(sp); }
    // [자세히 보기]: 만족도 내역 · 소지품 · 가방 · 가진 옷 · 면역 · 좋아하는 일(처음엔 닫힘, 이번 실행 동안 펼침을 기억). 요약 줄은 한 번만 만들고 안쪽만 바뀔 때 고침
    const more = k.more = el("details", "more imore"), sum = el("summary"); k.moreN = el("span", "more-n"); sum.append(el("span", "more-t", "자세히 보기"), k.moreN);
    k.moreB = el("div", "more-b"); more.append(sum, k.moreB); more.open = !!this.infoMoreOpen;
    more.addEventListener("toggle", () => { this.infoMoreOpen = more.open; this.infoMoreHtml = null; if (more.open) this.syncInfo(); });
    body.append(doing, needs, chips, more);
    // 행동 줄: 관계 먼저, 그다음 선물 · 쓰다듬기 · 집 보기
    k.rel = el("button", "", "💞 관계"); k.rel.type = "button"; k.rel.dataset.tip = "이 갈매미의 친구 사이를 관계도에서 봐요";
    k.goHome = el("button", "", "🏠 집 보기"); k.goHome.type = "button"; k.goHome.dataset.tip = "이 갈매미의 집으로 화면을 옮겨요";
    acts.append(k.rel, this.giftBtn, this.petBtn, k.goHome); c.append(head, body, acts);
    k.tog.onclick = () => { this.infoOpen = !this.infoOpen; if (this.infoEdit) this.infoWas = this.infoOpen; this.syncInfo(); };
    k.x.onclick = () => { if (this.follow) this.onUnitClick?.(this.follow); };       // 따라가기 그만(카드도 닫힘)
    k.rel.onclick = () => { const u = this.follow; if (!u) return; this.relSel = u.name; if (this.phone.hidden) this.openPhone(); this.openApp("rel"); };
    k.goHome.onclick = () => { const u = this.follow, b = u && u.home && this.world.buildings.get(u.home); if (b) this.onGoto?.(b); };
  }
  /** 카드의 값만 고침. 1초에 5번(update) + 접기·모드가 바뀔 때 바로. 접혀 있어도 머리줄은 계속 고침 */
  syncInfo() {
    const u = this.follow, c = this.info, k = this.ic, w = this.world;
    if (c.hidden !== !u) c.hidden = !u; if (!u) { this.showBond(null); return; }
    if (this.infoOpen === undefined) this.infoOpen = !this.phoneForm;                // 휴대폰은 접힌 채(⌃로 펼침)
    const editing = document.body.dataset.mode === "edit";                          // 건설 모드(모든 화면): 저절로 한 줄로 접어 건설 판·섬을 가리지 않게, 끝내면 보던 대로
    if (editing !== !!this.infoEdit) { this.infoEdit = editing; if (editing) { this.infoWas = this.infoOpen; this.infoOpen = false; } else if (this.infoWas !== undefined) this.infoOpen = this.infoWas; }
    const open = this.infoOpen, job = JOBS[u.job], full = u.full ?? 80, sat = u.sat ?? 50;
    const bIn = u.insideBuildingId && w.buildings.get(u.insideBuildingId), doing = bIn ? `${BUILDINGS[bIn.defId].name} 안` : stateLabelOf(u);
    if (c.classList.contains("mini") === open) c.classList.toggle("mini", !open);
    cardPut(k.name, u.name); cardPut(k.job, `${job.icon} ${job.name}`); cardPut(k.hearts, bondHearts(u.bond));
    const stage = BOND_STAGES[bondStage(u.bond)].name; if (k.hearts.title !== stage) k.hearts.title = stage;
    const exp = String(open); if (k.tog.getAttribute("aria-expanded") !== exp) { k.tog.setAttribute("aria-expanded", exp); k.tog.setAttribute("aria-label", open ? "카드 접기" : "카드 펼치기"); k.tog.dataset.tip = open ? "접기" : "펼치기"; }   // 카드는 아래에 붙어 있어 위로 펼쳐지고 아래로 접힘
    const homeB = u.home && w.buildings.get(u.home); if (k.goHome.hidden !== !homeB) k.goHome.hidden = !homeB;
    const flags = gullFlags(u);                                                     // 🤧 아픔 · 🥶 추움 · 💸 밀린 품삯 — 접혀 있어도 맨 앞에 보이게
    if (!open) { cardPut(k.sub, `${flags ? flags + " " : ""}${doing} · 😊${Math.round(sat)} 🍗${Math.round(full)}`); this.showBond(u); return; }
    const r = RARITY[u.rarity], n = u.needs || {}, fav = M.favorite(u), bf = M.bestFriend(u, w.units), tr = TRIBES[u.tribe];
    cardPut(k.sub, `${tr ? `${tr.icon} ${u.tribe} · ` : ""}${r.name} · ${chronoLabel(u)}`);   // 체질: 🌅 아침형(밤에 더 빨리 지침) · 🌙 야행성(낮에)
    const note = J.isLazy(u) ? "배불러 게을러요" : full < J.HUNGRY ? "배고파요" : chronoNote(u, w);   // 급한 것(게으름·배고픔)이 없으면 체질 영향("밤이라 더 빨리 지쳐요")
    cardPut(k.doing, doing);   /* 펼친 카드는 🤧·💸 칩과 체온 줄이 따로 알림 */ cardPut(k.note, note ? ` · ${note}` : "");
    const bt = bodyTempOf(u), tp = k.temp; if (tp.row.hidden !== !bt) tp.row.hidden = !bt;
    if (bt) { const wd = `${bt.pct}%`; if (tp.fill.style.width !== wd) tp.fill.style.width = wd; cardPut(tp.num, bt.text); cardPut(tp.label, `${bt.tone === "cold" ? "🥶" : bt.tone === "hot" ? "🥵" : ""}체온`); tp.row.title = bt.word ? `체온 ${bt.text} · ${bt.word}` : `체온 ${bt.text}`;
      if ((tp.row.dataset.tone || null) !== bt.tone) { if (bt.tone) tp.row.dataset.tone = bt.tone; else delete tp.row.dataset.tone; } }
    const energy = n.energy ?? 100, vals = [[sat, sat < 35], [Math.min(100, full), full < J.HUNGRY], [100 - energy, energy < 25], [n.social ?? 0, false], [n.fun ?? 0, false]];
    vals.forEach(([v, low], i) => { const b = k.bars[i], wd = `${Math.max(0, Math.min(100, v)).toFixed(0)}%`;
      if (b.fill.style.width !== wd) b.fill.style.width = wd; if (b.track.classList.contains("low") !== low) b.track.classList.toggle("low", low); cardPut(b.num, String(Math.round(v))); });
    const ch = gullChips(u, w); let any = false;
    for (const [key, sp] of Object.entries(k.chip)) { const t = ch[key] || ""; cardPut(sp, t); if (sp.hidden !== !t) sp.hidden = !t; any ||= !!t; }
    if (k.chips.hidden !== !any) k.chips.hidden = !any;
    const nStash = Object.values(u.stash || {}).reduce((a, n) => a + Math.max(0, n || 0), 0); cardPut(k.moreN, nStash ? `소지품 ${nStash}` : "");
    if (k.more.open) {                                                             // 펼쳤을 때만 안쪽을 만들고, 글이 같으면 손대지 않음
      const html = gullMoreHtml(u, w, { fav: fav ? M.ACTIVITY_NAME[fav] : "", friend: bf ? `${["친해지는 중", "친구", "단짝"][M.friendStage(M.affinity(u, bf))]}: ${bf.name}` : "" });
      if (html !== this.infoMoreHtml) { this.infoMoreHtml = html; k.moreB.innerHTML = html; } }
    this.showBond(u);
  }
}
