// 화면 UI: 도구 막대, 갈매미 목록·통계 판, 알림 줄. DOM만 다루고 월드는 콜백으로 바꾼다.
import { GROUND_TYPES, UnitState } from "../data/types.js";
import { GROUND_STYLE, BUILDINGS } from "../data/catalog.js";

const STATE_LABEL = { [UnitState.Forage]: "씨앗 찾는 중", [UnitState.Eat]: "냠냠", [UnitState.Visit]: "친구에게 가는 중", [UnitState.Greet]: "인사 중",
  [UnitState.Zoomies]: "신나서 뛰는 중", [UnitState.Flee]: "도망치는 중", [UnitState.Avoid]: "혼자 있고 싶어",
  [UnitState.GoChop]: "숲으로 가는 중", [UnitState.Chop]: "나무 베는 중", [UnitState.GoMine]: "광산으로 가는 중", [UnitState.Mine]: "광석 캐는 중",
  [UnitState.GoFish]: "낚시터로 가는 중", [UnitState.Fish]: "낚시 중", [UnitState.GoBuild]: "공사장으로 가는 중", [UnitState.Build]: "집 짓는 중",
  [UnitState.Idle]: "쉬는 중", [UnitState.Wander]: "산책 중", [UnitState.GoToBuilding]: "건물로 가는 중",
  [UnitState.Inside]: "건물 안", [UnitState.GoToFurniture]: "가구로 가는 중", [UnitState.Interact]: "가구 쓰는 중", [UnitState.Held]: "들려 있음" };

const hex = n => "#" + n.toString(16).padStart(6, "0");
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export class Hud {
  constructor({ tools, world, onSave, onLoad, onReset }) {
    this.tools = tools; this.world = world;
    const bar = document.getElementById("tools"), sub = document.getElementById("sub");
    const modes = [["view", "👀 둘러보기"], ["paint", "🖌 바닥 칠하기"], ["build", "🏠 건물 짓기"], ["demolish", "🧹 철거"]];
    this.modeBtns = modes.map(([m, label]) => { const b = el("button", "", label); b.dataset.mode = m; bar.appendChild(b);
      b.onclick = () => tools.setMode(m, m === "paint" ? (this.lastPaint || GROUND_TYPES[1]) : m === "build" ? (this.lastBuild || "house") : null); return b; });
    this.sub = sub;
    tools.onMode = (m, arg) => this.showMode(m, arg);
    tools.onBrush = n => this.brushBtns?.forEach(b => b.classList.toggle("on", +b.dataset.brush === n));
    this.instantBuild = false;
    document.getElementById("seeds").onclick = () => this.onSeeds?.();
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
    this.rows = world.units.map(u => { const r = el("div", "row"); r.append(el("span", "nm", u.name), el("span", "act"));
      r.onclick = () => this.onUnitClick?.(u); this.list.appendChild(r); return r; });
  }
  showMode(mode, arg) {
    this.modeBtns.forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
    this.sub.innerHTML = ""; this.sub.hidden = mode !== "paint" && mode !== "build";
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
      for (const def of Object.values(BUILDINGS)) { const b = el("button", def.id === arg ? "on" : "", `${def.name} ${def.footprint.w}×${def.footprint.d}`);
        b.onclick = () => this.tools.setMode("build", def.id); this.sub.appendChild(b); }
      const r = el("button", "", "↻ 돌리기(R)"); r.onclick = () => this.tools.rotate(); this.sub.appendChild(r);
      const ib = el("button", this.instantBuild ? "on" : "", "⚡ 바로 완공");           // 끄면 갈매미가 나무·돌로 지음
      ib.title = "켜면 놓자마자 완공, 끄면 갈매미가 나무 1·돌 1씩 들고 와서 망치질로 지어요";
      ib.onclick = () => { this.instantBuild = !this.instantBuild; ib.classList.toggle("on", this.instantBuild); this.onInstant?.(this.instantBuild); };
      this.sub.appendChild(ib);
    }
  }
  showFollow(u) { this.rows?.forEach((r, i) => r.classList.toggle("on", this.world.units[i] === u)); }
  status(text) { this.msg.textContent = text; this.msg.hidden = !text; }
  update(chunkInfo) {
    const w = this.world, inside = w.units.filter(u => u.insideBuildingId).length;
    const building = [...w.buildings.values()].filter(b => b.hits < b.need).length;
    this.stats.innerHTML = `<span>🌳 나무 ${w.res.wood}</span><span>⛰ 돌 ${w.res.stone}</span><span>🐟 물고기 ${w.res.fish}</span>` +
      `<span>🏠 건물 ${w.buildings.size}${building ? ` (공사 ${building})` : ""}</span><span>🐦 ${w.units.length}마리 · 건물 안 ${inside}</span>` +
      `<span class="dim">🧩 청크 ${chunkInfo.count}개 · 다시 그림 ${chunkInfo.rebuilt}회</span>`;
    w.units.forEach((u, i) => { const b = u.insideBuildingId && w.buildings.get(u.insideBuildingId);
      this.rows[i].querySelector(".act").textContent = b ? `${BUILDINGS[b.defId].name} 안` : STATE_LABEL[u.state] || u.state; });
  }
}
