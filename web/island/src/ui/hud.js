// 화면 UI: 도구 막대, 갈매미 목록·통계 판, 알림 줄. DOM만 다루고 월드는 콜백으로 바꾼다.
import { GROUND_TYPES, UnitState } from "../data/types.js";
import { GROUND_STYLE, BUILDINGS, JOBS, RARITY, FISH, ITEMS, UNITS } from "../data/catalog.js";
import * as J from "../world/jobs.js";
import * as M from "../units/mind.js";
import { TRIBES } from "../data/catalog.js";
import * as E from "../world/economy.js";

const STATE_LABEL = { [UnitState.Forage]: "씨앗 찾는 중", [UnitState.Eat]: "냠냠", [UnitState.Visit]: "친구에게 가는 중", [UnitState.Greet]: "인사 중",
  [UnitState.Zoomies]: "신나서 뛰는 중", [UnitState.Flee]: "도망치는 중", [UnitState.Avoid]: "혼자 있고 싶어",
  [UnitState.GoChop]: "숲으로 가는 중", [UnitState.Chop]: "나무 베는 중", [UnitState.GoMine]: "광산으로 가는 중", [UnitState.Mine]: "광석 캐는 중",
  [UnitState.GoFish]: "낚시터로 가는 중", [UnitState.Fish]: "낚시 중", [UnitState.GoBuild]: "공사장으로 가는 중", [UnitState.Build]: "집 짓는 중",
  [UnitState.Idle]: "쉬는 중", [UnitState.Wander]: "산책 중", [UnitState.GoToBuilding]: "건물로 가는 중",
  [UnitState.Sleep]: "자는 중", [UnitState.Curious]: "구경하러 가는 중", [UnitState.GoSwim]: "헤엄치러 가는 중", [UnitState.Swim]: "헤엄치는 중", [UnitState.GoBank]: "은행에 팔러 가는 중", [UnitState.GoMarket]: "시장 가는 중", [UnitState.GoShore]: "바닷가로 먹이 잡으러",
  [UnitState.GoTrade]: "시장으로 가는 중", [UnitState.Trade]: "장사 중", [UnitState.GoFarm]: "밭으로 가는 중", [UnitState.Farm]: "밭일 중",
  [UnitState.Inside]: "건물 안", [UnitState.GoToFurniture]: "가구로 가는 중", [UnitState.Interact]: "가구 쓰는 중", [UnitState.Held]: "들려 있음" };

const hex = n => "#" + n.toString(16).padStart(6, "0");
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export class Hud {
  constructor({ tools, world, onSave, onLoad, onReset }) {
    this.tools = tools; this.world = world;
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
    this.qBtn = document.getElementById("quality"); this.qBtn.onclick = () => this.setQualityLabel(this.onQuality?.());
    document.getElementById("dexClose").onclick = () => this.showDex(false);
    this.info = document.getElementById("info");
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
    const tm = document.getElementById("timeMode"); tm.onclick = () => { const l = this.onTimeMode?.(); if (l) tm.textContent = `시간: ${l}`; };
    const tb = document.getElementById("toonBtn"); tb.onclick = () => { const l = this.onToon?.(); if (l) tb.textContent = `그림체: ${l}`; };
    addEventListener("resize", () => this.layout());
    this.setWorld(world); this.showMode("view"); this.layout();
  }
  // ---- 갈매폰
  openPhone() { this.phone.hidden = false; this.openApp(null); }
  closePhone() { this.phone.hidden = true; this.app = null; }
  openApp(app) {
    this.app = app;
    const pages = { null: "pageHome", gulls: "pageGulls", bank: "pageBank", market: "pageMarket", summon: "pageSummon", files: "pageFiles", settings: "pageSettings", help: "pageHelp" };
    const titles = { null: "📱 갈매폰", gulls: "🐦 갈매미", bank: "🏦 공식은행", market: "🐚 시장", summon: "🥚 소환", files: "💾 저장", settings: "⚙ 설정", help: "❓ 도움말" };
    for (const [k, id] of Object.entries(pages)) document.getElementById(id).hidden = String(app) !== k;
    document.getElementById("phoneTitle").textContent = titles[app];
    document.getElementById("phoneBack").hidden = app === null;
    this.refreshApp();
  }
  /** 휴대폰: 도구 막대가 아래에 있으면 📱·따라가기 카드를 그 위로 */
  layout() {
    const top = document.getElementById("top").getBoundingClientRect(), low = top.top > innerHeight / 2, b = low ? `${innerHeight - top.top + 10}px` : "";
    this.phoneBtn.style.bottom = b; this.info.style.bottom = b;
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
        : `<h4>상인이 사는 원자재</h4>${m ? `<table class="tbl">${E.RAW.map(k => `<tr><td>${E.ITEM_ICON[k]} ${E.ITEM_NAME[k]}</td><td>🪙${E.MARKET_BUY[k]} · 상인 창고 ${(m.raw[k] || 0) + (m.goods[k] || 0)}</td></tr>`).join("")}<tr><td>상인(${m.name}) 돈</td><td>🪙${m.coins || 0}</td></tr></table>` : `<p class="dim">상인 🐚 갈매미가 없어요(소환하면 와요).</p>`}` +
          `<h4>팔리는 집</h4>${sale.length ? `<table class="tbl">${sale.map(b => `<tr><td>🏠 ${BUILDINGS[b.defId].name}${BUILDINGS[b.defId].forUnit ? ` (${BUILDINGS[b.defId].forUnit} 전용)` : ""}</td><td>🪙${BUILDINGS[b.defId].price}</td></tr>`).join("")}</table>` : `<p class="dim">다 팔렸어요. 건축가가 집을 더 지으면 여기에 나와요.</p>`}` +
          `<h4>음식(농부·어부에게서 🪙${E.FOOD_PRICE})</h4><table class="tbl">${food.map(u => `<tr><td>${JOBS[u.job].icon} ${u.name}</td><td>🍗${u.inv?.food || 0} 🐟${u.inv?.fish || 0}</td></tr>`).join("") || `<tr><td class="dim">농부·어부가 없어요</td><td></td></tr>`}</table>` +
          `<h4>집 주인</h4><table class="tbl">${w.units.filter(u => u.home).map(u => `<tr><td>${u.name}</td><td>${BUILDINGS[w.buildings.get(u.home)?.defId]?.name ?? ""}</td></tr>`).join("") || `<tr><td class="dim">아직 없어요</td><td></td></tr>`}</table>`;
    } else if (this.app === "summon") {
      this.setSummon(w);
    }
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
  showMode(mode, arg) {
    this.modeBtns.forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
    this.handBtn.hidden = mode === "view"; if (mode === "view" && this.tools.hand) this.tools.setHand(false);
    this.sub.innerHTML = ""; this.sub.hidden = !["paint", "build", "height"].includes(mode);
    if (mode === "height") {
      this.lastHeight = arg;
      for (const [op, label] of [["raise", "⬆ 올리기"], ["lower", "⬇ 내리기"], ["smooth", "〰 다듬기"], ["flatten", "▬ 평평하게"]]) {
        const b = el("button", op === arg ? "on" : "", label); b.onclick = () => this.tools.setMode("height", op); this.sub.appendChild(b); }
      this.sub.appendChild(el("span", "lab", "붓"));
      this.brushBtns = [1, 3, 5, 7].map(n => { const b = el("button", n === this.tools.brush ? "on" : "", `${n}×${n}`); b.dataset.brush = n;
        b.onclick = () => this.tools.setBrush(n); this.sub.appendChild(b); return b; });
      this.status("붓 안 전체가 한 번에 0.5 m씩(옆과 턱이 생김 · 오르내리려면 🏠 계단) · 다듬기: 울퉁불퉁한 곳을 매끈하게 · 바다 높이 아래로 파면 연못");
    }
    if (mode === "paint") {
      this.lastPaint = arg;
      for (const t of GROUND_TYPES) { const b = el("button", t === arg ? "on" : "");
        const sw = el("span", "sw"); sw.style.background = hex(GROUND_STYLE[t].colors[0]); b.append(sw, GROUND_STYLE[t].label);
        b.onclick = () => this.tools.setMode("paint", t); this.sub.appendChild(b); }
      const lab = el("span", "lab", "붓"); this.sub.appendChild(lab);           // 붓 크기 1×1 · 3×3 · 5×5 · 7×7 ( [ ] 키 )
      this.brushBtns = [1, 3, 5, 7].map(n => { const b = el("button", n === this.tools.brush ? "on" : "", `${n}×${n}`); b.dataset.brush = n;
        b.onclick = () => this.tools.setBrush(n); this.sub.appendChild(b); return b; });
    }
    if (mode === "build") {
      this.lastBuild = arg;
      if (!this.world.units.some(u => u.job === "builder")) this.status("🔨 건축 갈매미가 있어야 지을 수 있어요 · 🥚 소환으로 불러 보세요");
      for (const def of Object.values(BUILDINGS)) {
        if (def.menu === false) continue;                                           // 은행·예전 건물은 메뉴에서 뺌
        const locked = !this.world.builderFor(def), tierName = RARITY[["", "common", "rare", "epic", "legend"][def.tier]].name;
        const b = el("button", (def.id === arg ? "on " : "") + (locked ? "locked" : ""), `${locked ? "🔒 " : ""}${def.name} ${def.footprint.w}×${def.footprint.d}`);
        const who = def.builtBy === "carpenter" ? "🪚 목수" : "🔨 건축가";
        b.title = `${def.tier > 1 ? tierName + " 이상 " : ""}${who}가 지어요${def.price ? ` · 다 지으면 시장에서 🪙${def.price}에 팔려요` : ""}${locked ? " (지금은 없음)" : ""}`;
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
  /** 도감(낚은 물고기)·가방(건진 물건) 창 */
  showDex(on) {
    const d = document.getElementById("dex"); d.hidden = !on; if (!on) return;
    const w = this.world, body = document.getElementById("dexBody"); body.innerHTML = "";
    const sec = (title, list, count, extra) => {
      body.append(el("h3", "", title)); const g = el("div", "dexgrid");
      for (const it of list) { const n = count(it), c = el("div", "dexcell" + (n ? "" : " unknown"));
        c.style.borderColor = RARITY[it.rarity].color;
        c.append(el("b", "", n ? it.name : "???"), el("span", "", `${RARITY[it.rarity].name}${n ? ` · ${n}개` : ""}`), el("span", "dim", n ? extra(it) : ""));
        g.append(c); }
      body.append(g);
    };
    sec(`🐟 물고기 도감 (${FISH.filter(f => w.collection[f.id]).length}/${FISH.length})`, FISH, f => w.collection[f.id] || 0,
      f => f.rarity === "common" ? `음식 +${f.food}` : `보물 ${f.price}🐚${w.treasures[f.id] ? ` · 보관 ${w.treasures[f.id]}` : ""}`);
    sec(`🎁 가방 (${ITEMS.filter(i => w.items[i.id]).length}/${ITEMS.length})`, ITEMS, i => w.items[i.id] || 0,
      i => i.furniture ? "가구 · 2단계 실내 꾸미기에서 놓기" : `${i.price}🐚`);
    body.append(el("p", "dim", "다른 사람과 바꾸기는 서버(여러 사람 접속)가 생기면 붙일 예정이에요."));
  }
  setQualityLabel(name) { if (name) this.qBtn.textContent = `화질: ${name}`; }
  status(text) { this.msg.textContent = text; this.msg.hidden = !text; }
  update(chunkInfo) {
    const w = this.world, inside = w.units.filter(u => u.insideBuildingId).length;
    const building = [...w.buildings.values()].filter(b => b.hits < b.need).length;
    const avg = w.avgFull(), mood = avg < J.HUNGRY ? "😫" : avg > J.OVERFULL ? "😴" : avg >= 60 ? "😋" : "🙂";
    this.stats.innerHTML = `<span>${mood} 포만감 ${avg.toFixed(0)}</span><span>🏠 건물 ${w.buildings.size}${building ? ` (공사 ${building})` : ""}</span><span>🐦 ${w.units.length}마리 · 건물 안 ${inside}</span>` +
      (w.economy ? `<span>🏦 창고 🪵${w.res.wood} 🪨${w.res.stone} 🍗${(w.res.food || 0) + (w.res.fish || 0)}</span>` : `<span>🌳 ${w.res.wood} ⛰ ${w.res.stone} 🍗 ${w.res.food} 🐚 ${w.res.coins}</span>`) +
      `<span>🧩 땅 ${chunkInfo.tris ? Math.round(chunkInfo.tris / 1000) + "천 삼각형 · " : ""}${chunkInfo.fps ? `${chunkInfo.fps} fps` : ""}</span>`;
    this.chipMoney.textContent = w.economy ? `🪙 ${w.moneySupply()}` : `🐚 ${w.res.coins}`; this.chipMoney.title = "갈매미들이 가진 돈 합계";
    this.chipPop.textContent = `🐦 ${w.units.length} · ${mood} ${avg.toFixed(0)}`;
    if (this.timeLabel) this.chipTime.textContent = this.timeLabel();
    const hungry = w.units.filter(u => (u.full ?? 80) < J.HUNGRY).sort((a, b) => a.full - b.full)[0];
    this.hungry = hungry; this.alertBtn.hidden = !hungry; if (hungry) this.alertBtn.textContent = `😣 ${hungry.name} 배고파요`;
    if (!this.phone.hidden && this.app && this.app !== "gulls") this.refreshApp();
    this.layout();                                                                   // 도구 막대 높이가 바뀌어도 📱·카드가 그 위에
    w.units.forEach((u, i) => { const b = u.insideBuildingId && w.buildings.get(u.insideBuildingId);
      this.rows[i].querySelector(".act").textContent = b ? `${BUILDINGS[b.defId].name} 안` : STATE_LABEL[u.state] || u.state;
      this.rows[i].querySelector(".coins").textContent = w.economy ? `🪙${u.coins || 0}${u.home ? " 🏠" : ""}` : "";
      const f = this.rows[i].querySelector(".full"); f.textContent = "🍗" + Math.round(u.full ?? 0);
      f.className = "full" + ((u.full ?? 80) < J.HUNGRY ? " hungry" : (u.full ?? 0) > J.OVERFULL ? " lazy" : ""); });
    // 따라가는 갈매미 정보
    const u = this.follow; this.info.hidden = !u;
    if (u) { const job = JOBS[u.job], r = RARITY[u.rarity];
      const n = u.needs || {}, fav = M.favorite(u), bf = M.bestFriend(u, w.units), tr = TRIBES[u.tribe];
      // 따라가기 카드: 이름·직업 배지 / 지금 하는 일 / 욕구 막대 4개 / 돈·가방·집 칩 (긴 설명은 뺌)
      const bIn = u.insideBuildingId && w.buildings.get(u.insideBuildingId), doing = bIn ? `${BUILDINGS[bIn.defId].name} 안` : STATE_LABEL[u.state] || u.state;
      const bar = (label, v, cls = "") => `<div class="need"><span>${label}</span><i class="${cls}"><b style="width:${Math.max(0, Math.min(100, v))}%"></b></i><em>${Math.round(v)}</em></div>`;
      const full = u.full ?? 80, note = J.isLazy(u) ? "배불러 게을러요" : full < J.HUNGRY ? "배고파요" : "";
      const bag = E.ITEMS_ORDER.filter(k => u.inv?.[k]).map(k => `${E.ITEM_ICON[k]}${u.inv[k]}`).join(" ");
      this.info.innerHTML = `<div class="ihead"><b>${u.name}</b><span class="jobtag">${job.icon} ${job.name}</span><span class="dim">${tr ? `${tr.icon} ${u.tribe} · ` : ""}${r.name}</span></div>` +
        `<div class="doing">${doing}${note ? ` · <span class="warn">${note}</span>` : ""}</div>` +
        `<div class="needs">${bar("포만감", Math.min(100, full), full < J.HUNGRY ? "low" : "")}${bar("기력", n.energy ?? 0)}${bar("친구", n.social ?? 0)}${bar("재미", n.fun ?? 0)}</div>` +
        (w.economy ? `<div class="ichips"><span>🪙 ${u.coins || 0}</span><span>${bag ? "🎒 " + bag : "🎒 비었음"}</span><span>${u.home ? "🏠 " + (BUILDINGS[w.buildings.get(u.home)?.defId]?.name ?? "") : "🏠 집 없음"}</span></div>` : "") +
        `<div class="dim small">좋아하는 일: ${fav ? M.ACTIVITY_NAME[fav] : "아직 몰라"}${bf ? ` · 단짝: ${bf.name}` : ""} · 능률 ×${(u.eff ?? 1).toFixed(2)}</div>`; }
  }
}
