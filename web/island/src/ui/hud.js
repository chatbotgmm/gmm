// 화면 UI: 도구 막대, 갈매미 목록·통계 판, 알림 줄. DOM만 다루고 월드는 콜백으로 바꾼다.
import { GROUND_TYPES, UnitState } from "../data/types.js";
import { GROUND_STYLE, BUILDINGS, JOBS, RARITY, FISH, ITEMS } from "../data/catalog.js";
import * as J from "../world/jobs.js";
import * as M from "../units/mind.js";
import { TRIBES } from "../data/catalog.js";

const STATE_LABEL = { [UnitState.Forage]: "씨앗 찾는 중", [UnitState.Eat]: "냠냠", [UnitState.Visit]: "친구에게 가는 중", [UnitState.Greet]: "인사 중",
  [UnitState.Zoomies]: "신나서 뛰는 중", [UnitState.Flee]: "도망치는 중", [UnitState.Avoid]: "혼자 있고 싶어",
  [UnitState.GoChop]: "숲으로 가는 중", [UnitState.Chop]: "나무 베는 중", [UnitState.GoMine]: "광산으로 가는 중", [UnitState.Mine]: "광석 캐는 중",
  [UnitState.GoFish]: "낚시터로 가는 중", [UnitState.Fish]: "낚시 중", [UnitState.GoBuild]: "공사장으로 가는 중", [UnitState.Build]: "집 짓는 중",
  [UnitState.Idle]: "쉬는 중", [UnitState.Wander]: "산책 중", [UnitState.GoToBuilding]: "건물로 가는 중",
  [UnitState.Sleep]: "자는 중", [UnitState.Curious]: "구경하러 가는 중",
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
    tools.onMode = (m, arg) => this.showMode(m, arg);
    tools.onBrush = n => this.brushBtns?.forEach(b => b.classList.toggle("on", +b.dataset.brush === n));
    this.instantBuild = false;
    document.getElementById("seeds").onclick = () => this.onSeeds?.();
    document.getElementById("dexBtn").onclick = () => this.showDex(true);
    document.getElementById("dexClose").onclick = () => this.showDex(false);
    this.info = document.getElementById("info");
    const zb = document.getElementById("zones"); zb.onclick = () => { zb.classList.toggle("off"); this.onZones?.(!zb.classList.contains("off")); };
    document.getElementById("save").onclick = onSave;
    document.getElementById("load").onclick = onLoad;
    document.getElementById("reset").onclick = onReset;
    const panel = document.getElementById("panel"), fold = document.getElementById("fold");
    const setFold = f => { panel.classList.toggle("folded", f); fold.textContent = f ? "펼치기" : "접기"; };
    fold.onclick = () => setFold(!panel.classList.contains("folded")); setFold(innerWidth <= 640);
    this.list = document.getElementById("units"); this.stats = document.getElementById("stats"); this.msg = document.getElementById("msg");
    this.setWorld(world); this.showMode("view");
  }
  setWorld(world) {
    this.world = world; this.list.innerHTML = "";
    // 줄마다: 직업 아이콘 · 이름(희귀도 색) · 하는 일 · 포만감
    this.rows = world.units.map(u => { const r = el("div", "row"), nm = el("span", "nm");
      nm.append(el("span", "job", JOBS[u.job]?.icon ?? ""), u.name); nm.style.color = RARITY[u.rarity]?.color;
      nm.title = `${RARITY[u.rarity]?.name} ${JOBS[u.job]?.name}: ${JOBS[u.job]?.desc}`;
      r.append(nm, el("span", "act"), el("span", "full"));
      r.onclick = () => this.onUnitClick?.(u); this.list.appendChild(r); return r; });
    this.follow = null;
  }
  showMode(mode, arg) {
    this.modeBtns.forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
    this.sub.innerHTML = ""; this.sub.hidden = !["paint", "build", "height"].includes(mode);
    if (mode === "height") {
      this.lastHeight = arg;
      for (const [op, label] of [["raise", "⬆ 올리기"], ["lower", "⬇ 내리기"], ["flatten", "▬ 평평하게"]]) {
        const b = el("button", op === arg ? "on" : "", label); b.onclick = () => this.tools.setMode("height", op); this.sub.appendChild(b); }
      this.sub.appendChild(el("span", "lab", "붓"));
      this.brushBtns = [1, 3, 5, 7].map(n => { const b = el("button", n === this.tools.brush ? "on" : "", `${n}×${n}`); b.dataset.brush = n;
        b.onclick = () => this.tools.setBrush(n); this.sub.appendChild(b); return b; });
      this.status("한 번에 한 단(0.25 m) · 한 단 차이는 걸어 다니는 경사, 두 단 이상은 절벽 · 경사에 돌길·데크를 깔면 계단 · 바다 높이 아래로 파면 연못");
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
      for (const def of Object.values(BUILDINGS)) {
        const locked = !this.world.builderFor(def), tierName = RARITY[["", "common", "rare", "epic", "legend"][def.tier]].name;
        const b = el("button", (def.id === arg ? "on " : "") + (locked ? "locked" : ""), `${locked ? "🔒 " : ""}${def.name} ${def.footprint.w}×${def.footprint.d}`);
        b.title = def.tier > 1 ? `${tierName} 이상 건축가가 지을 수 있어요${locked ? " (지금은 없음)" : ""}` : "누구나 지을 수 있어요";
        b.onclick = () => this.tools.setMode("build", def.id); this.sub.appendChild(b); }
      const r = el("button", "", "↻ 돌리기(R)"); r.onclick = () => this.tools.rotate(); this.sub.appendChild(r);
      const ib = el("button", this.instantBuild ? "on" : "", "⚡ 바로 완공");           // 끄면 갈매미가 나무·돌로 지음
      ib.title = "켜면 놓자마자 완공, 끄면 갈매미가 나무 1·돌 1씩 들고 와서 망치질로 지어요";
      ib.onclick = () => { this.instantBuild = !this.instantBuild; ib.classList.toggle("on", this.instantBuild); this.onInstant?.(this.instantBuild); };
      this.sub.appendChild(ib);
    }
  }
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
  status(text) { this.msg.textContent = text; this.msg.hidden = !text; }
  update(chunkInfo) {
    const w = this.world, inside = w.units.filter(u => u.insideBuildingId).length;
    const building = [...w.buildings.values()].filter(b => b.hits < b.need).length;
    const avg = w.avgFull(), mood = avg < J.HUNGRY ? "😫" : avg > J.OVERFULL ? "😴" : avg >= 60 ? "😋" : "🙂";
    this.stats.innerHTML = `<span>🌳 나무 ${w.res.wood}</span><span>⛰ 돌 ${w.res.stone}</span><span>⚙ 철 ${w.res.iron}</span>` +
      `<span>🍗 음식 ${w.res.food}</span><span>🐚 조개 ${w.res.coins}</span><span>${mood} 포만감 ${avg.toFixed(0)}</span>` +
      `<span>🏠 건물 ${w.buildings.size}${building ? ` (공사 ${building})` : ""}</span><span>🐦 ${w.units.length}마리 · 건물 안 ${inside}</span>` +
      `<span class="dim">🧩 청크 ${chunkInfo.count}개 · 다시 그림 ${chunkInfo.rebuilt}회</span>`;
    w.units.forEach((u, i) => { const b = u.insideBuildingId && w.buildings.get(u.insideBuildingId);
      this.rows[i].querySelector(".act").textContent = b ? `${BUILDINGS[b.defId].name} 안` : STATE_LABEL[u.state] || u.state;
      const f = this.rows[i].querySelector(".full"); f.textContent = Math.round(u.full ?? 0);
      f.className = "full" + ((u.full ?? 80) < J.HUNGRY ? " hungry" : (u.full ?? 0) > J.OVERFULL ? " lazy" : ""); });
    // 따라가는 갈매미 정보
    const u = this.follow; this.info.hidden = !u;
    if (u) { const job = JOBS[u.job], r = RARITY[u.rarity];
      const n = u.needs || {}, fav = M.favorite(u), bf = M.bestFriend(u, w.units), tr = TRIBES[u.tribe];
      this.info.innerHTML = `<b style="color:${r.color}">${job.icon} ${u.name}</b> · ${tr ? `${tr.icon} ${u.tribe} · ` : ""}${r.name} ${job.name} (특기 ×${r.mult})<br>` +
        `🍗 ${Math.round(u.full)} · ⚡기력 ${Math.round(n.energy ?? 0)} · 💬친구 ${Math.round(n.social ?? 0)} · 🎈재미 ${Math.round(n.fun ?? 0)} · 능률 ×${(u.eff ?? 1).toFixed(2)}` +
        `${J.isLazy(u) ? " · 배불러 게으름" : (u.full < J.HUNGRY ? " · 배고픔" : "")}<br>` +
        `좋아하게 된 일: ${fav ? M.ACTIVITY_NAME[fav] : "아직 몰라"}${bf ? ` · 단짝: ${bf.name} ♥${Math.round(M.affinity(u, bf))}` : ""}<br><span class="dim">${job.desc}</span>`; }
  }
}
