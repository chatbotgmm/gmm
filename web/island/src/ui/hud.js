// 화면 UI: 도구 막대, 갈매미 목록·통계 판, 알림 줄. DOM만 다루고 월드는 콜백으로 바꾼다.
import { GROUND_TYPES, UnitState } from "../data/types.js";
import { GROUND_STYLE, BUILDINGS, JOBS, RARITY, FISH, ITEMS, UNITS, FURNITURE, PERSONA } from "../data/catalog.js";
import * as J from "../world/jobs.js";
import * as M from "../units/mind.js";
import { TRIBES } from "../data/catalog.js";
import * as E from "../world/economy.js";
import { QUALITY, ORDER, QUALITY_NOTE } from "../render/quality.js";
import { WISH_BY_ID, WISH_REWARD, wishText } from "../world/wishes.js";
import { RANKS, RANK_REWARD, rankScore } from "../world/rank.js";
import { SEASONS } from "../world/season.js";
import * as Fu from "../world/furniture.js";
import { DONATE_KINDS, DONATE_GIFTS, donatedCount } from "../world/aquarium.js";
import { newsDay, newsPages, NEWS_HEADLINES, NEWS_KEEP_DAYS } from "../world/news.js";
import { BOND_STAGES, bondStage, bondHearts, GIFT_CAT_NAME, giftables, petsLeft, PET_DAILY } from "../world/bond.js";
import { SKY_EVENTS } from "../world/skywatch.js";

const escHtml = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);   // 글을 그대로 보여 주기(태그로 읽히지 않게)

const STATE_LABEL = { [UnitState.Forage]: "씨앗 찾는 중", [UnitState.Eat]: "냠냠", [UnitState.Visit]: "친구에게 가는 중", [UnitState.Greet]: "인사 중",
  [UnitState.Zoomies]: "신나서 뛰는 중", [UnitState.Flee]: "도망치는 중", [UnitState.Avoid]: "혼자 있고 싶어",
  [UnitState.GoChop]: "숲으로 가는 중", [UnitState.Chop]: "나무 베는 중", [UnitState.GoMine]: "광산으로 가는 중", [UnitState.Mine]: "광석 캐는 중",
  [UnitState.GoFish]: "낚시터로 가는 중", [UnitState.Fish]: "낚시 중", [UnitState.GoBuild]: "공사장으로 가는 중", [UnitState.Build]: "집 짓는 중",
  [UnitState.Idle]: "쉬는 중", [UnitState.Wander]: "산책 중", [UnitState.GoToBuilding]: "건물로 가는 중",
  [UnitState.Sleep]: "자는 중", [UnitState.Curious]: "구경하러 가는 중", [UnitState.GoSwim]: "헤엄치러 가는 중", [UnitState.Swim]: "헤엄치는 중", [UnitState.GoBank]: "은행에 팔러 가는 중", [UnitState.GoMarket]: "시장 가는 중", [UnitState.GoShore]: "바닷가로 먹이 잡으러", [UnitState.GoImprove]: "동네 고치러 가는 중", [UnitState.Improve]: "동네 고치는 중", [UnitState.GoSit]: "벤치로 가는 중", [UnitState.Sit]: "벤치에 앉아 쉬는 중",
  [UnitState.GoTrade]: "시장으로 가는 중", [UnitState.Trade]: "장사 중", [UnitState.GoFarm]: "밭으로 가는 중", [UnitState.Farm]: "밭일 중",
  [UnitState.Inside]: "건물 안", [UnitState.GoToFurniture]: "가구로 가는 중", [UnitState.Interact]: "가구 쓰는 중", [UnitState.Held]: "들려 있음" };

// 하늘 기록(도감): 드문 하늘마다 언제 볼 수 있는지 한 줄
const SKY_HINT = { rainbow: "낮에 비가 갠 뒤 가끔 · 물건을 더 잘 찾아요", meteor: "맑은 밤에 아주 가끔 · 별조각이 떨어져요", firstSnow: "겨울마다 처음 내리는 눈" };

const hex = n => "#" + n.toString(16).padStart(6, "0");
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
    const modes = [["view", "👀 둘러보기"], ["paint", "🖌 바닥 칠하기"], ["height", "⛰ 높이"], ["build", "🏠 건물 짓기"], ["demolish", "🧹 철거"]];
    this.modeBtns = modes.map(([m, label]) => { const b = el("button", "", label); b.dataset.mode = m; bar.appendChild(b);
      b.onclick = () => tools.setMode(m, m === "paint" ? (this.lastPaint || GROUND_TYPES[1]) : m === "build" ? (this.lastBuild || "house") : m === "height" ? (this.lastHeight || "raise") : null); return b; });
    this.sub = sub;
    // ✋ 화면 이동: 도구를 쓰는 중에 켜면 드래그로 화면만 돌리고 옮김(도구는 잠시 멈춤)
    this.handBtn = el("button", "hand", "✋ 화면 이동"); this.handBtn.title = "켜면 드래그로 화면을 돌리고 옮겨요(도구는 잠시 멈춤). PC는 스페이스를 누른 채 드래그해도 돼요";
    this.handBtn.onclick = () => tools.setHand(!tools.hand); bar.appendChild(this.handBtn);
    tools.onHand = on => this.handBtn.classList.toggle("on", on);
    tools.onMode = (m, arg) => this.showMode(m, arg);
    // 건물 자리를 정하면 🔨 건설 / ↻ 돌리기 / ✕ 취소 막대(지을 수 없는 자리면 건설 버튼 꺼짐)
    const cf = document.getElementById("confirm"), cfBuild = document.getElementById("cfBuild");
    tools.onPlan = (on, ok) => {
      cf.hidden = !on; cfBuild.disabled = !ok; if (!on) return;
      const top = document.getElementById("top").getBoundingClientRect();           // 휴대폰은 도구 막대가 아래 → 그 바로 위에 띄움
      cf.style.bottom = top.top > innerHeight / 2 ? `${innerHeight - top.top + 8}px` : "";
    };
    cfBuild.onclick = () => tools.confirmBuild();
    document.getElementById("cfRot").onclick = () => tools.rotate();
    document.getElementById("cfCancel").onclick = () => tools.clearPlan();
    tools.onBrush = n => this.brushBtns?.forEach(b => b.classList.toggle("on", +b.dataset.brush === n));
    this.instantBuild = false;
    this.summonBtn = document.getElementById("summon"); this.summonBtn.onclick = () => this.onSummon?.();
    document.getElementById("dexBtn").onclick = () => this.showDex(true);
    // 그래픽 설정 5단계(설정 앱): 누르면 바로 바뀜
    this.qBox = document.getElementById("quality");
    for (const k of ORDER) { const b = el("button", "", QUALITY[k].name); b.dataset.q = k; b.title = QUALITY_NOTE[k]; b.onclick = () => this.setQuality(this.onQuality?.(k)); this.qBox.appendChild(b); }
    document.getElementById("dexClose").onclick = () => this.showDex(false);
    this.info = document.getElementById("info");
    this.tugBtn = document.getElementById("tugBtn"); this.tugBtn.onclick = () => this.onTug?.();   // 찌 당기기(따라가는 갈매미에게 입질이 왔을 때만 보임)
    // 선물·쓰다듬기(따라가기 카드 위): 카드는 매 프레임 다시 그리므로 버튼은 따로 둠
    this.bondBar = document.getElementById("bondBar"); this.giftPick = document.getElementById("giftPick"); this.giftBtn = document.getElementById("giftBtn"); this.petBtn = document.getElementById("petBtn");
    this.giftBtn.onclick = () => { this.giftPick.hidden = !this.giftPick.hidden; if (!this.giftPick.hidden) this.drawGifts(); };
    this.petBtn.onclick = () => { if (!this.follow) return; this.onPet?.(this.follow); this.showBond(this.follow); };   // 남은 횟수는 바로 고침(글자판은 1초에 5번만 그림)
    this.giftPick.onclick = e => { const b = e.target.closest?.("[data-gift]"), u = this.follow; if (!b || !u) return; this.onGift?.(u, b.dataset.gift); this.drawGifts(); };
    const zb = document.getElementById("zones"); zb.onclick = () => { zb.classList.toggle("off"); this.onZones?.(!zb.classList.contains("off")); };
    document.getElementById("save").onclick = () => { onSave(); this.closePhone(); };
    document.getElementById("load").onclick = () => { onLoad(); this.closePhone(); };
    document.getElementById("reset").onclick = () => { onReset(); this.closePhone(); };
    this.list = document.getElementById("units"); this.stats = document.getElementById("stats"); this.msg = document.getElementById("msg");
    // ---- 갈매폰: 📱 → 앱 메뉴(갈매미·은행·시장·건설·소환·도감·저장·설정·도움말)
    this.phone = document.getElementById("phone"); this.phoneBtn = document.getElementById("phoneBtn");
    this.phoneBtn.onclick = () => this.openPhone();
    document.getElementById("phoneClose").onclick = () => this.closePhone();
    document.getElementById("phoneBack").onclick = () => this.openApp(null);
    this.phone.addEventListener("pointerdown", e => { if (e.target === this.phone) this.closePhone(); });
    for (const b of document.querySelectorAll(".apps button")) b.onclick = () => {
      const app = b.dataset.app;
      if (app === "build") { this.closePhone(); tools.setMode("build", this.lastBuild || "house"); return; }
      if (app === "dex") { this.closePhone(); this.showDex(true); return; }
      this.openApp(app);
    };
    // 배고픈 갈매미 알림: 누르면 그 갈매미를 따라감
    this.alertBtn = document.getElementById("alert"); this.alertBtn.onclick = () => { if (this.hungry) this.onUnitClick?.(this.hungry); };
    this.chipMoney = document.getElementById("chipMoney"); this.chipPop = document.getElementById("chipPop"); this.chipTime = document.getElementById("chipTime");
    this.chipWeather = document.getElementById("chipWeather"); this.chipWeather.onclick = () => this.onWeatherInfo?.();
    document.getElementById("chipRank").onclick = () => { this.openPhone(); this.openApp("town"); };
    this.wishBtn = document.getElementById("chipWish"); this.wishBtn.onclick = () => { this.openPhone(); this.openApp("wish"); };
    this.seasonBtn = document.getElementById("seasonMode"); this.seasonBtn.onclick = () => this.setSeasonLabel(this.onSeasonMode?.());
    const tm = document.getElementById("timeMode"); tm.onclick = () => { const l = this.onTimeMode?.(); if (l) tm.textContent = `시간: ${l}`; };
    const tx = document.getElementById("timeMult"); tx.onclick = () => { const l = this.onTimeMult?.(); if (l) tx.textContent = `시간 배수: ${l}`; };
    const tb = document.getElementById("toonBtn"); tb.onclick = () => { const l = this.onToon?.(); if (l) tb.textContent = `그림체: ${l}`; };
    addEventListener("resize", () => this.layout());
    this.setWorld(world); this.showMode("view"); this.layout();
  }
  /** 섬에서 집을 눌렀을 때 작은 카드 */
  houseCard(b) {
    const c = document.getElementById("houseCard"); if (!b) { c.hidden = true; return; }
    const w = this.world, owner = w.units.find(u => u.unitId === b.owner);
    c.querySelector("b").textContent = `🏠 ${BUILDINGS[b.defId].name}`; c.querySelector("span").textContent = `${owner ? `주인 ${owner.name}` : "주인 없음"} · 🛋 아늑함 ${Fu.comfort(b)}`;
    c.querySelector(".go").onclick = () => { c.hidden = true; this.onDecorate?.(b); }; c.querySelector(".hx").onclick = () => { c.hidden = true; }; c.hidden = false;
    clearTimeout(this.hcT); this.hcT = setTimeout(() => { c.hidden = true; }, 6000);
  }
  setSeasonLabel(t) { if (t) this.seasonBtn.textContent = `계절: ${t}`; }
  // ---- 갈매폰
  openPhone() { this.phone.hidden = false; this.openApp(null); this.sfx?.play("phoneOpen", { vol: 0.5 }); }
  closePhone() { if (!this.phone.hidden) this.sfx?.play("phoneClose", { vol: 0.5 }); this.phone.hidden = true; this.app = null; }
  initSound() {
    const b = document.getElementById("sfxBtn"), v = document.getElementById("sfxVol"), s = this.sfx, label = () => { b.textContent = `소리: ${s.on ? "켬" : "끔"}`; };
    label(); v.value = Math.round(s.volume * 100); b.onclick = () => { s.setOn(!s.on); label(); }; v.oninput = () => s.setVolume(v.value / 100);
  }
  openApp(app) {
    this.app = app;
    const pages = { null: "pageHome", gulls: "pageGulls", bank: "pageBank", market: "pageMarket", summon: "pageSummon", files: "pageFiles", settings: "pageSettings", help: "pageHelp", wish: "pageWish", town: "pageTown", decor: "pageDecor", rel: "pageRel", news: "pageNews" };
    const titles = { null: "📱 갈매폰", gulls: "🐦 갈매미", bank: "🏦 공식은행", market: "🐚 시장", summon: "🥚 소환", files: "💾 저장", settings: "⚙ 설정", help: "❓ 도움말", wish: "💭 소원", town: "🏅 마을", decor: "🛋 집 꾸미기", rel: "💞 관계도", news: "📰 소식지" };
    for (const [k, id] of Object.entries(pages)) document.getElementById(id).hidden = String(app) !== k;
    document.getElementById("phoneTitle").textContent = titles[app];
    document.getElementById("phoneBack").hidden = app === null;
    this.refreshApp();
  }
  /** 휴대폰: 도구 막대가 아래에 있으면 📱·따라가기 카드를 그 위로 */
  layout() {
    const top = document.getElementById("top").getBoundingClientRect(), low = top.top > innerHeight / 2, b = low ? `${innerHeight - top.top + 10}px` : "";
    this.phoneBtn.style.bottom = b; this.info.style.bottom = b;
    const mm = document.getElementById("minimap"); if (mm) mm.style.bottom = low ? `${innerHeight - top.top + 74}px` : "";   // 미니맵은 📱 위
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
      document.getElementById("townBody").innerHTML =
        `<div class="rankhead"><span class="big">${cur.icon}</span><div><b>${cur.name}</b><div class="dim">점수 ${score}${nxt ? ` / 다음 ${nxt.icon} ${nxt.name} ${nxt.need}` : " · 가장 높은 등급"}</div></div></div>` +
        `<div class="rbar"><i style="width:${pct}%"></i></div>` +
        (nxt ? `<p class="dim">${nxt.name}이 되면: ${nxt.unlock.map(BN).join(", ")} 건설 · 갈매미마다 축하금 🪙${RANK_REWARD}</p>` : "") +
        `<table class="tbl">${parts.map(([name, n, per, pts]) => `<tr><td>${name}</td><td>${n} × ${per} = <b>${pts}</b></td></tr>`).join("")}</table>` +
        `<h4>❄️ 겨울 대비</h4><p>${toWinter > 0 ? `겨울(12월 1일)까지 <b>${toWinter}일</b>` : `<b>지금 겨울이에요</b>`} · ${SEASONS.winter.icon} 겨울엔 밭이 절반 속도로 자라고, 배가 1.25배 빨리 고프고, 음식 값이 올라요.</p>` +
        (gr ? `<p>🏚 저장고 음식 <b>${w.granary}</b> / ${E.GRANARY_MAX} · 농부·어부가 남는 음식을 🪙${E.GRANARY_BUY}에 팔아 쌓고, 배고픈 갈매미는 시세대로 사 가요(돈이 없고 아주 배고프면 나눠 받아요).</p>`
          : `<p class="dim">저장고가 없어요. 🪚 목수가 있으면 🏠 건설에서 <b>저장고</b>를 지을 수 있어요.</p>`) +
        `<h4>등급별 건물</h4><table class="tbl">${RANKS.slice(1).map((r, i) => `<tr><td>${w.rank >= i + 1 ? "✅" : "🔒"} ${r.icon} ${r.name} (${r.need}점)</td><td>${r.unlock.map(BN).join(", ")}</td></tr>`).join("")}</table>`;
    } else if (this.app === "wish") {
      const rows = w.wishes.map(x => { const d = WISH_BY_ID[x.id], u = w.units.find(o => o.unitId === x.unitId); return `<tr><td>${d.icon} <b>${u?.name ?? ""}</b>: ${wishText(d, w, u, x)}</td><td class="dim">${d.hint}</td></tr>`; }).join("");
      document.getElementById("wishBody").innerHTML = `<p class="dim">갈매미가 가끔 마을에 바라는 것을 말해요. 들어주면 기뻐하고 ${w.economy ? `공식은행이 축하금 🪙${WISH_REWARD}을 줘요` : "배가 조금 불러요"}.</p>` +
        (rows ? `<table class="tbl">${rows}</table>` : `<p class="dim">지금은 바라는 게 없어요.</p>`) + `<p>이룬 소원: <b>${w.wishDone}</b>개</p>`;
    } else if (this.app === "rel") {
      this.drawRelations();
    } else if (this.app === "news") {
      this.drawNews();
    } else if (this.app === "files") {
      document.getElementById("saveInfo").textContent = this.savedLabel?.() || "";
    } else if (this.app === "summon") {
      this.setSummon(w);
    }
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
    box.onpointerdown = e => { if (e.target === box) close(); };
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
      nm.title = `${RARITY[u.rarity]?.name} ${JOBS[u.job]?.name}: ${JOBS[u.job]?.desc}`;
      r.append(nm, el("span", "act"), el("span", "coins"), el("span", "full"));
      r.onclick = () => { this.onUnitClick?.(u); this.closePhone(); }; this.list.appendChild(r); return r; });
    this.follow = null;
  }
  /** 칠하기·높이 공통: 모양(붓·길·네모) · 🎯 십자선 · ↶ ↷ */
  addEditTools() {
    const t = this.tools; this.sub.appendChild(el("span", "lab", "모양"));
    for (const [s, label] of [["brush", "🖌 붓"], ["line", "〰 길"], ["rect", "▭ 네모"]]) { const b = el("button", t.shape === s ? "on" : "", label); b.onclick = () => { t.setShape(s); this.showMode(t.mode, t.mode === "paint" ? t.paintType : t.heightOp); }; this.sub.appendChild(b); }
    const c = el("button", t.cross ? "on" : "", "🎯 십자선"); c.title = "화면 가운데를 붓으로: 한 손가락으로 화면을 옮기고, 아래 큰 버튼을 누르는 동안 칠해요"; c.onclick = () => { t.setCross(!t.cross); c.classList.toggle("on", t.cross); }; this.sub.appendChild(c);
    const u = el("button", "", "↶"), r = el("button", "", "↷"); u.title = "되돌리기(Ctrl+Z)"; r.title = "다시하기(Ctrl+Shift+Z)"; u.onclick = () => t.undo(); r.onclick = () => t.redo();
    u.disabled = !t.history.length; r.disabled = !t.redoStack.length; this.undoBtns = [u, r]; this.sub.append(u, r);
  }
  showMode(mode, arg) {
    this.modeBtns.forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
    this.handBtn.hidden = mode === "view"; if (mode === "view" && this.tools.hand) this.tools.setHand(false);
    this.sub.innerHTML = ""; this.sub.hidden = !["paint", "build", "height"].includes(mode);
    if (mode === "height") {
      this.lastHeight = arg;
      for (const [op, label] of [["raise", "⬆ 올리기"], ["lower", "⬇ 내리기"], ["smooth", "〰 다듬기"], ["flatten", "▬ 평평하게"], ["level", "🎚 단 맞추기"]]) {
        const b = el("button", op === arg ? "on" : "", label); b.onclick = () => this.tools.setMode("height", op); this.sub.appendChild(b); }
      if (arg === "level") { this.sub.appendChild(el("span", "lab", "높이")); for (const hgt of [0, 0.5, 1, 1.5, 2]) { const b = el("button", this.tools.levelH === hgt ? "on" : "", `${hgt} m`); b.onclick = () => { this.tools.levelH = hgt; this.showMode("height", "level"); }; this.sub.appendChild(b); } }
      this.sub.appendChild(el("span", "lab", "붓"));
      this.brushBtns = [1, 3, 5, 7].map(n => { const b = el("button", n === this.tools.brush ? "on" : "", `${n}×${n}`); b.dataset.brush = n;
        b.onclick = () => this.tools.setBrush(n); this.sub.appendChild(b); return b; });
      this.addEditTools();
      this.status(arg === "level" ? `🎚 단 맞추기: 문지른 곳을 ${this.tools.levelH} m 높이로 맞춰요(한 번에 여러 번 눌러 올릴 필요 없음)` : "붓 안 전체가 한 번에 0.5 m씩(옆과 턱이 생김 · 오르내리려면 🏠 계단) · 다듬기: 울퉁불퉁한 곳을 매끈하게 · 바다 높이 아래로 파면 연못");
    }
    if (mode === "paint") {
      this.lastPaint = arg;
      for (const t of GROUND_TYPES) { const b = el("button", t === arg ? "on" : "");
        const sw = el("span", "sw"); sw.style.background = hex(GROUND_STYLE[t].colors[0]); b.append(sw, GROUND_STYLE[t].label);
        b.onclick = () => this.tools.setMode("paint", t); this.sub.appendChild(b); }
      const lab = el("span", "lab", "붓"); this.sub.appendChild(lab);           // 붓 크기 1×1 · 3×3 · 5×5 · 7×7 ( [ ] 키 )
      this.brushBtns = [1, 3, 5, 7].map(n => { const b = el("button", n === this.tools.brush ? "on" : "", `${n}×${n}`); b.dataset.brush = n;
        b.onclick = () => this.tools.setBrush(n); this.sub.appendChild(b); return b; });
      this.addEditTools();
    }
    if (mode === "build") {
      this.lastBuild = arg;
      if (!this.world.units.some(u => u.job === "builder")) this.status("🔨 건축 갈매미가 있어야 지을 수 있어요 · 🥚 소환으로 불러 보세요");
      for (const def of Object.values(BUILDINGS)) {
        if (def.menu === false) continue;                                           // 은행·예전 건물은 메뉴에서 뺌
        const rankLock = (def.rank || 0) > this.world.rank, locked = rankLock || !this.world.builderFor(def), tierName = RARITY[["", "common", "rare", "epic", "legend"][def.tier]].name;
        const b = el("button", (def.id === arg ? "on " : "") + (locked ? "locked" : ""), `${locked ? "🔒 " : ""}${def.name} ${def.footprint.w}×${def.footprint.d}${rankLock ? ` ${RANKS[def.rank].icon}` : ""}`);
        const who = def.builtBy === "carpenter" ? "🪚 목수" : "🔨 건축가";
        b.title = `${def.tier > 1 ? tierName + " 이상 " : ""}${who}가 지어요${def.price ? ` · 다 지으면 시장에서 🪙${def.price}에 팔려요` : ""}${rankLock ? ` (🏅 마을 등급 ${RANKS[def.rank].icon} ${RANKS[def.rank].name}부터)` : locked ? " (지금은 없음)" : ""}`;
        b.onclick = () => this.tools.setMode("build", def.id); this.sub.appendChild(b); }
      const r = el("button", "", "↻ 돌리기(R)"); r.onclick = () => this.tools.rotate(); this.sub.appendChild(r);
      const ib = el("button", this.instantBuild ? "on" : "", "⚡ 바로 완공");           // 끄면 갈매미가 나무·돌로 지음
      ib.title = "켜면 놓자마자 완공, 끄면 갈매미가 나무 1·돌 1씩 들고 와서 망치질로 지어요";
      ib.onclick = () => { this.instantBuild = !this.instantBuild; ib.classList.toggle("on", this.instantBuild); this.onInstant?.(this.instantBuild); };
      this.sub.appendChild(ib);
    }
  }
  /** 🥚 소환 버튼: 마을에 있는 수 / 전체, 다 모이면 끔 */
  setSummon(world) { const n = world.units.length, all = UNITS.length; this.summonBtn.textContent = n >= all ? `🥚 모두 모임 ${n}/${all}` : `🥚 소환 ${n}/${all}`; this.summonBtn.disabled = n >= all;
    const left = UNITS.filter(d => !world.units.some(u => u.name === d.name)).map(d => d.name); document.getElementById("summonLast").textContent = left.length ? `아직 안 온 갈매미: ${left.join(", ")}` : ""; }
  showFollow(u) { this.follow = u; this.rows?.forEach((r, i) => r.classList.toggle("on", this.world.units[i] === u)); }
  /** 🎣 당기기! 버튼: 따라가기 카드 바로 위에 붙여서 보여 줌(입질 동안만). 매 프레임 불러도 바뀔 때만 손댐 */
  showTug(on, secs = 1.5) {
    const b = this.tugBtn; if (b.hidden === !on) return;
    if (on) b.style.setProperty("--tug", `${Math.max(0.1, secs).toFixed(2)}s`);   // 줄어드는 줄은 실제로 남은 시간만큼
    if (on) b.style.bottom = `${Math.round(innerHeight - (this.info.hidden ? innerHeight - 60 : this.info.getBoundingClientRect().top) + 8)}px`;
    b.hidden = !on;
  }
  /** 🎁 선물·♥ 쓰다듬기 버튼: 따라가는 갈매미가 있을 때 카드 바로 위에(당기기 버튼이 떠 있는 동안은 비켜 줌). 매 프레임 불러도 바뀔 때만 손댐 */
  showBond(u) {
    const on = !!u && this.tugBtn.hidden, bar = this.bondBar;
    if (!on || u !== this.bondU) this.giftPick.hidden = true;                       // 다른 갈매미로 바꾸면 고르는 판은 닫음
    this.bondU = u; if (bar.hidden === on) bar.hidden = !on; if (!on) return;
    const bottom = `${Math.round(innerHeight - this.info.getBoundingClientRect().top + 6)}px`; if (bar.style.bottom !== bottom) bar.style.bottom = bottom;
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
  /** 도감(낚은 물고기)·가방(건진 물건) 창 */
  showDex(on) {
    const d = document.getElementById("dex"); d.hidden = !on; if (!on) return;
    const w = this.world, body = document.getElementById("dexBody"); body.innerHTML = "";
    // 간직하기: 켜 두면 상인이 팔지 않음(그 자리에서 글자만 바꿈 → 스크롤이 튀지 않게)
    const keepBtn = id => { const b = el("button", "keep"), draw = () => { const on = !!w.keep[id]; b.textContent = on ? "💛 간직 중" : "🤍 간직하기"; b.classList.toggle("on", on); b.title = on ? "상인이 팔지 않아요 · 누르면 풀어요" : "켜 두면 상인이 팔지 않아요"; };
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
  status(text) { this.msg.textContent = text; this.msg.hidden = !text; clearTimeout(this.msgT); if (text) this.msgT = setTimeout(() => { this.msg.hidden = true; }, 6000); }   // 알림은 6초 뒤 사라짐
  update(chunkInfo) {
    const w = this.world, inside = w.units.filter(u => u.insideBuildingId).length;
    const building = [...w.buildings.values()].filter(b => b.hits < b.need).length;
    const avg = w.avgFull(), mood = avg < J.HUNGRY ? "😫" : avg > J.OVERFULL ? "😴" : avg >= 60 ? "😋" : "🙂";
    this.stats.innerHTML = `<span>${mood} 포만감 ${avg.toFixed(0)}</span><span>🏠 건물 ${w.buildings.size}${building ? ` (공사 ${building})` : ""}</span><span>🐦 ${w.units.length}마리 · 건물 안 ${inside}</span>` +
      (w.economy ? `<span>🏦 창고 🪵${w.res.wood} 🪨${w.res.stone} 🍗${(w.res.food || 0) + (w.res.fish || 0)}</span>` : `<span>🌳 ${w.res.wood} ⛰ ${w.res.stone} 🍗 ${w.res.food} 🐚 ${w.res.coins}</span>`) +
      `<span>🧩 땅 ${chunkInfo.tris ? Math.round(chunkInfo.tris / 1000) + "천 삼각형 · " : ""}${chunkInfo.fps ? `${chunkInfo.fps} fps` : ""}</span>`;
    this.chipMoney.textContent = w.economy ? `🪙 ${w.moneySupply()}` : `🐚 ${w.res.coins}`; this.chipMoney.title = "갈매미들이 가진 돈 합계";
    const sat = w.avgSat ? w.avgSat() : 50, face = sat >= 75 ? "😄" : sat >= 55 ? "🙂" : sat >= 35 ? "😐" : "😣";
    const small = innerWidth <= 640;
    this.chipPop.textContent = small ? `🐦${w.units.length} ${face}${sat.toFixed(0)} ${mood}${avg.toFixed(0)}` : `🐦 ${w.units.length} · ${face} 만족 ${sat.toFixed(0)} · ${mood} ${avg.toFixed(0)}`; this.chipPop.title = "갈매미 수 · 평균 만족도 · 평균 포만감";
    document.getElementById("chipRank").textContent = small ? RANKS[w.rank].icon : `${RANKS[w.rank].icon} ${RANKS[w.rank].name}`;
    document.getElementById("mapBtn").textContent = small ? "🗺" : "🗺 지도";
    if (this.timeLabel) this.chipTime.textContent = this.timeLabel();
    if (this.weatherLabel) this.chipWeather.textContent = small ? this.weatherLabel().replace(/ [가-힣]+(?= · |$)/g, "").replace(/ · /g, " ") : this.weatherLabel();   // 휴대폰: 아이콘만
    const nw = this.world.wishes.length; this.wishBtn.hidden = !nw; this.wishBtn.textContent = small ? `💭${nw}` : `💭 소원 ${nw}`;
    if (this.app === "wish" || this.app === "market") { this.appT = (this.appT || 0) + 1; if (this.appT % 5 === 0) this.refreshApp(); }
    const hungry = w.units.filter(u => (u.full ?? 80) < J.HUNGRY).sort((a, b) => a.full - b.full)[0];
    this.hungry = hungry; this.alertBtn.hidden = !hungry; if (hungry) this.alertBtn.textContent = `😣 ${hungry.name} 배고파요`;
    if (!this.phone.hidden && this.app && this.app !== "gulls") this.refreshApp();
    this.layout();                                                                   // 도구 막대 높이가 바뀌어도 📱·카드가 그 위에
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
      if (this.infoOpen === undefined) { this.infoOpen = !matchMedia("(max-width: 640px)").matches; this.info.onclick = () => { this.infoOpen = !this.infoOpen; }; }   // 휴대폰은 접힌 채(누르면 펼침)
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
