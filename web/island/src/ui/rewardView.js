// 플레이어 보상을 크게 보여 주는 화면(DOM·소리). 규칙(단계·차례·합치기)은 ui/rewardFx.js — 여기는 그리기만.
//  · big: 가운데 큰 카드(빛살·색종이·통통 튐 + 팡파르·진동). 카드를 누르면 받기 → 내 주머니(📱)나 금고 칩으로 날아감. 안 눌러도 RF_BIG_MS 뒤 저절로
//  · medium: 위쪽 가운데 띠(큰 아이콘 + 굵은 한 줄). 누를 수 없음(pointer-events: none) → 놀이·건설을 막지 않음
//  · small: 큰 「+N 🪙」이 떠올라 금고 칩으로 날아가고, 닿으면 칩 숫자가 올라감(hud.vaultSpent + count). 날아가는 동안 칩은 예전 값(hud.holdVault)
//  · 움직임 줄이기(html[data-motion="reduce"]): 색종이·빛살·튐·날기 없이 나타났다 사라지기만(CSS + 여기서 날기 건너뜀)
//  · 건설 모드·방 안·편지·불러오기 화면에서는 큰 카드를 미뤘다가(hold) 돌아오면 보여 줌
import { makeRewardQueue, makeSmallSum, smallText, confetti, RF_FLY_MS, RF_BIG_MS } from "./rewardFx.js";

const rwEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const BIG_NOTES = [1047, 1319, 1568, 2093], MED_NOTES = [784, 988, 1319], GLINT = [1319, 1760, 2093];

export class RewardView {
  constructor({ sfx, hud }) {
    this.sfx = sfx; this.hud = hud; this.queue = makeRewardQueue(); this.small = makeSmallSum(); this.seed = 7;
    const root = this.root = rwEl("div", "rw"); root.id = "reward"; root.setAttribute("aria-live", "polite");
    // 띠
    this.ban = rwEl("div", "rwBan"); this.ban.hidden = true; this.banIco = rwEl("span", "rwBanIco"); this.banTxt = rwEl("span", "rwBanTxt");
    this.banTitle = rwEl("b", "rwBanTitle"); this.banLine = rwEl("small", "rwBanLine"); this.banTxt.append(this.banTitle, this.banLine);
    this.banSpark = rwEl("span", "rwBanSpark"); this.ban.append(this.banSpark, this.banIco, this.banTxt);
    // 큰 카드
    this.card = rwEl("div", "rwCard"); this.card.hidden = true;
    this.rays = rwEl("div", "rwRays"); this.conf = rwEl("div", "rwConf"); this.box = rwEl("button", "rwBox"); this.box.type = "button";
    this.kick = rwEl("span", "rwKick"); this.ico = rwEl("span", "rwIco"); this.title = rwEl("b", "rwTitle"); this.line = rwEl("span", "rwLine");
    this.take = rwEl("span", "rwTake", "탭해서 받기"); this.bar = rwEl("i", "rwBar");
    this.box.append(this.kick, this.ico, this.title, this.line, this.take, this.bar); this.card.append(this.rays, this.conf, this.box);
    this.box.addEventListener("click", e => { e.stopPropagation(); this.collect(); });
    root.append(this.ban, this.card); document.body.appendChild(root);
    this.timer = setInterval(() => this.tick(), 80);
  }
  get calm() { return document.documentElement.dataset.motion === "reduce"; }
  /** 큰 카드를 지금 띄우면 안 될 때: 건설 모드 · 방 안 · 다녀온 사이 편지 · 불러오는 화면 */
  get hold() {
    const b = document.body; if (b.dataset.mode === "edit" || b.classList.contains("inroom")) return true;
    for (const id of ["letter", "loading", "ask"]) { const e = document.getElementById(id); if (e && !e.hidden && !e.classList.contains("done") && getComputedStyle(e).display !== "none") return true; }
    return false;
  }
  /** 새 섬·불러오기: 기다리던 것은 버림 */
  reset() { this.queue.clear(); this.small.clear(); this.hideBan(); this.card.hidden = true; }
  push(r) {
    if (!r) return;
    if (r.tier === "small") { const a = this.small.add(r, performance.now()); if (r.to === "vault") this.hud?.holdVault?.(a.p.n, RF_FLY_MS + 1600); return; }
    this.queue.push(r); this.tick();
  }
  collect() { if (this.queue.collect(performance.now())) this.tick(); }
  tick() {
    const now = performance.now();
    for (const s of this.small.due(now)) this.flyNumber(s);
    const hold = this.hold; if (hold && this.queue.cur?.tier === "big") this.queue.collect(now, true);   // 보던 카드 중에 건설 모드·방으로 가면 바로 받아 비켜 줌(건설을 가리지 않게)
    const { show, end } = this.queue.step(now, { hold });
    if (end) end.tier === "big" ? this.endBig(end) : this.hideBan();
    if (show) show.tier === "big" ? this.showBig(show) : this.showBan(show);
    const c = this.queue.cur; if (c?.tier === "big") this.bar.style.transform = `scaleX(${Math.max(0, 1 - (now - c.t0) / ((c.until - c.t0) || RF_BIG_MS)).toFixed(3)})`;
  }
  sound(r, big) {
    const s = this.sfx; if (!s) return;
    if (big) { s.fanfare(); setTimeout(() => s.chime(BIG_NOTES, 0.08, 0.16), 420); try { if (document.documentElement.dataset.vibe !== "off") navigator.vibrate?.([18, 40, 30]); } catch { /* 무시 */ } }
    else s.chime(r.snd === "glint" ? GLINT : MED_NOTES, r.snd === "glint" ? 0.05 : 0.08, 0.16);
  }
  showBan(r) {
    this.banIco.textContent = r.icon; this.banTitle.textContent = r.title + (r.count > 1 ? ` ×${r.count}` : ""); this.banLine.textContent = r.line || ""; this.banLine.hidden = !r.line;
    this.banSpark.textContent = ""; if (!this.calm) for (const p of confetti(10, ++this.seed, 70)) { const i = rwEl("i"); i.style.cssText = `--dx:${p.dx}px;--dy:${p.dy}px;--r:${p.rot}deg;--d:${p.delay}ms;--h:${p.hue}`; this.banSpark.appendChild(i); }
    this.ban.hidden = false; this.ban.classList.remove("on", "off"); void this.ban.offsetWidth; this.ban.classList.add("on");
    this.sound(r, false); if (r.to) this.bump(r.to, 600);
  }
  hideBan() { if (this.ban.hidden) return; this.ban.classList.remove("on"); this.ban.classList.add("off"); clearTimeout(this.banT); this.banT = setTimeout(() => { if (this.ban.classList.contains("off")) this.ban.hidden = true; }, 260); }
  showBig(r) {
    this.kick.textContent = r.kick || (r.key?.startsWith("rank") ? "🎊 축하해요! 🎊" : "✨ 보상 획득 ✨");
    this.card.classList.toggle("story", !!r.story);                                // 🗝 이야기 카드: 밤하늘 색 + 긴 글
    this.ico.textContent = r.icon; this.title.textContent = r.title + (r.count > 1 ? ` ×${r.count}` : ""); this.line.textContent = r.line || "";
    this.conf.textContent = ""; if (!this.calm) for (const p of confetti(28, ++this.seed, Math.min(260, innerWidth * 0.42))) { const i = rwEl("i"); i.style.cssText = `--dx:${p.dx}px;--dy:${p.dy}px;--r:${p.rot}deg;--d:${p.delay}ms;--h:${p.hue}`; this.conf.appendChild(i); }
    this.box.style.transform = ""; this.box.style.opacity = ""; this.card.classList.remove("on", "out"); this.card.hidden = false; void this.card.offsetWidth; this.card.classList.add("on");
    this.box.setAttribute("aria-label", `${r.title}. ${r.line || ""} 누르면 받아요`); this.bar.style.transform = "scaleX(1)";
    this.sound(r, true);
  }
  endBig(r) {
    const c = this.card, t = this.target(r.to);
    c.classList.remove("on"); c.classList.add("out");
    if (t && !this.calm) {   // 받은 것이 내 주머니(📱)·금고 칩으로 쏙
      const b = this.box.getBoundingClientRect(), dx = t.x - (b.left + b.width / 2), dy = t.y - (b.top + b.height / 2);
      this.box.style.transform = `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px) scale(.12)`; this.box.style.opacity = "0";
    }
    clearTimeout(this.cardT); this.cardT = setTimeout(() => { if (c.classList.contains("out")) c.hidden = true; if (r.to) this.bump(r.to, 700); if (r.to === "bag") this.sfx?.play?.("bag", { vol: 0.6 }); }, this.calm ? 200 : 520);
  }
  /** 날아갈 곳(화면 좌표): bag = 📱 갈매폰 단추(내 주머니), vault = 🏦 금고 칩. 안 보이면 null */
  targetEl(to) { const e = document.getElementById(to === "vault" ? "chipVault" : "phoneBtn"); if (!e) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? e : null; }   // 고정(fixed) 요소는 offsetParent가 늘 null이라 크기로 봄
  target(to) { const e = to && this.targetEl(to); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  bump(to, ms) { const e = this.targetEl(to); if (!e) return; e.classList.remove("rwHit"); void e.offsetWidth; e.classList.add("rwHit"); setTimeout(() => e.classList.remove("rwHit"), ms); }
  /** small: 큰 +N이 화면 위쪽에서 톡 튀어나와 금고 칩으로 날아감. 닿으면 칩 숫자가 올라가고 동전 소리 */
  flyNumber(s) {
    const n = rwEl("div", "rwNum"); n.setAttribute("aria-hidden", "true");
    n.append(rwEl("b", "", smallText(s.n)), rwEl("span", "rwNumIco", s.icon || "🪙")); if (s.line) n.append(rwEl("small", "", s.line));
    this.root.appendChild(n);
    const land = () => { n.remove(); if (s.to === "vault") this.hud?.vaultSpent?.(s.n, { count: true }); this.bump(s.to, 700); this.sfx?.play?.("coins", { vol: 0.7 }); };
    const t = this.target(s.to);
    if (this.calm || !t || !n.animate) { n.classList.add("still"); setTimeout(land, 900); return; }
    const r = n.getBoundingClientRect(), dx = t.x - (r.left + r.width / 2), dy = t.y - (r.top + r.height / 2);
    const a = n.animate([
      { transform: "translate(0, 24px) scale(.4)", opacity: 0 },
      { transform: "translate(0, 0) scale(1.2)", opacity: 1, offset: 0.12 },
      { transform: "translate(0, -8px) scale(1)", opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.3)`, opacity: 0.85 },
    ], { duration: RF_FLY_MS, easing: "cubic-bezier(.5,0,.75,.4)" });
    a.onfinish = land; a.oncancel = land;
  }
}
