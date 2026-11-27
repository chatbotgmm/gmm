// 🗝 비밀 수첩(📱 갈매폰 「비밀」 앱) 화면 HTML. 순수: DOM을 모름 → node 시험(tests/story.test.js). hud.js가 HTML을 받아 바뀐 때만 넣음.
//  · 표지: 등대 그림(장을 마칠 때마다 밝아짐) · 모은 조각 n/18 · 별씨 · 엔딩 뒤 「등불지기」 도장
//  · 장마다: 제목 + 조각 k/3 · 조각 칸(열림 = 아이콘·제목·글·얻은 날·들려준 갈매미 / 잠김 = ??? + 힌트(2단계) / 덤 = 점선) · 고칠 곳 체크리스트 + [고치기]·[고치러 가기]
//  · 안 열린 장: 「다음 이야기는 아직 안개 속이에요.」 · 엔딩 뒤: 보름의 답장 다시 읽기 · 엽서함 · 덤을 다 모으면 그림
import { STORY_TITLE, STORY_CHAPTERS, STORY_TOTAL, STORY_SEEDS, STORY_NEED, STORY_STAMP, STORY_PICTURE, STORY_POSTCARDS } from "../data/story.js";
import * as ST from "../world/story.js";
import { newsDay } from "../world/news.js";

const stSvEsc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ST_SEASON_ICON = { spring: "🌸", summer: "🌊", autumn: "🍁", winter: "❄️" };
/** 📱 비밀 앱 배지: 수첩에서 아직 안 본 새 조각 수(이야기를 시작하기 전엔 0) */
export const storyBadge = w => ST.storyStarted(w?.story) ? ST.unreadCount(w.story) : 0;
/** 표지 등대 밝기 0~4(고친 곳 수) */
const stLightLevel = s => ["door", "cave", "lamp", "mailbox"].filter(k => s.restored[k]).length;

function stSlotHtml(s, p, day, fresh) {
  const f = s.found[p.id], bonus = p.bonus ? `<i class="st-tag">덤</i>` : "", isNew = f && (fresh ? fresh.has(p.id) : !s.read[p.id]) ? `<i class="st-new">새 쪽</i>` : "";
  if (f) return `<li class="st-slot on${p.bonus ? " bonus" : ""}" data-piece="${p.id}"><span class="st-ico">${p.icon}</span><div><b>${stSvEsc(p.title)}</b>${bonus}${isNew}` +
    `<p>${stSvEsc(ST.pieceText(p.id, f.who))}</p><small>${f.day}째 날${f.who ? ` · ${stSvEsc(f.who)}에게 들음` : ""}</small></div></li>`;
  const seeds = p.how === "seed" ? ` <em class="st-seeds">🌟 ${s.seeds}/${STORY_SEEDS}</em>` : "";
  return `<li class="st-slot off${p.bonus ? " bonus" : ""}"><span class="st-ico">❔</span><div><b>???</b>${bonus}${seeds}<p class="st-hint">💡 ${stSvEsc(ST.pieceHint(s, p.id, day))}</p></div></li>`;
}
function stFixHtml(s, w, ch) {
  const r = ch.restore, chk = ST.restoreCheck(s, w, ch.n);
  if (chk.done) return `<div class="st-fix done"><b>✅ ${r.icon} ${stSvEsc(r.title)}</b><p>${stSvEsc(r.done)}</p><p class="st-art">${stSvEsc(r.art)}</p><details class="st-outro"><summary>그때 이야기</summary><p>${stSvEsc(r.outro)}</p></details></div>`;
  if (chk.locked) return `<div class="st-fix lock"><b>🔒 ${r.icon} ${stSvEsc(r.title)}</b><p class="dim">이야기를 끝까지 읽으면 고칠 수 있어요.</p></div>`;
  const rows = chk.rows.map(x => `<li class="${x.ok ? "ok" : ""}">${x.ok ? "☑" : "☐"} ${x.icon} ${stSvEsc(x.text)} <b>${x.have}/${x.need}</b></li>`).join("");
  const go = r.at === "pole" ? "lighthouse" : r.at;
  const btn = chk.ok ? `<button class="go st-fixbtn" data-restore="${ch.n}">🔧 고치기</button>`
    : chk.kind === "build" ? `<button class="st-gobtn" data-sgo="${go}" data-sbuild="streetlamp">💡 고치러 가기</button>`
    : `<button class="ghost st-gobtn" data-sgo="${go}">📍 ${go === "cave" ? "동굴" : "등대"} 보기</button>`;
  return `<div class="st-fix"><b>🔧 고칠 곳: ${r.icon} ${stSvEsc(r.title)}</b><ul>${rows}</ul>${btn}</div>`;
}
/** 비밀 앱 HTML. day: 마을 날(없으면 world.time으로) · fresh: 「새 쪽」으로 보일 조각 id들(없으면 아직 안 읽은 조각) */
export function storyAppHtml(w, { day = newsDay(w.time), fresh = null } = {}) {
  const s = w.story;
  if (!ST.storyStarted(s)) return `<div class="st-cover"><div class="st-lh lv0">🗼</div><b class="st-title">${STORY_TITLE}</b><p class="dim">섬 끝 하얀 탑 근처에서 무언가 반짝이면 주워 보세요.</p></div>`;
  const n = ST.foundCount(s), lv = stLightLevel(s);
  const cover = `<div class="st-cover"><div class="st-lh lv${lv}">🗼</div><b class="st-title">${STORY_TITLE}</b>` +
    `<p class="st-count">모은 조각 <b>${n}</b> / ${STORY_TOTAL}${ST.chapterOpen(s, 3) && !s.restored.lamp ? ` · 🌟 별씨 <b>${s.seeds}</b>/${STORY_SEEDS}` : ""}</p>` +
    (s.ended ? `<p class="st-stamp">${STORY_STAMP}</p>` : `<p class="dim">장마다 아무 조각 ${STORY_NEED}개를 모으고 고칠 곳을 고치면 다음 이야기가 열려요. 기한은 없어요.</p>`) + `</div>`;
  const chs = STORY_CHAPTERS.map(ch => {
    if (!ST.chapterOpen(s, ch.n)) return `<section class="st-ch fog"><h4>${ch.n}장. ???</h4><p class="dim">다음 이야기는 아직 안개 속이에요.</p></section>`;
    const k = ST.chapterCount(s, ch.n), done = !!s.restored[ch.restore.id];
    return `<section class="st-ch${done ? " done" : ""}" data-ch="${ch.n}"><h4>${ch.n}장. ${stSvEsc(ch.title)} <em>${ch.n < 4 ? `조각 ${Math.min(k, STORY_NEED)}/${STORY_NEED}` : `조각 ${k}/${ch.pieces.length}`}</em></h4>` +
      (done || k >= STORY_NEED ? `<p class="st-learn">📖 ${stSvEsc(ch.learn)}</p>` : "") +
      `<ul class="st-grid">${ch.pieces.map(p => stSlotHtml(s, p, day, fresh)).join("")}</ul>${stFixHtml(s, w, ch)}</section>`;
  }).join("");
  let after = "";
  if (s.ended) {
    const cards = Object.keys(s.postcards).sort().map(k => { const sea = k.split("-")[1]; return `<li>${ST_SEASON_ICON[sea] || "📮"} <small>${k.split("-")[0]}</small> ${stSvEsc(STORY_POSTCARDS[sea] || "")}</li>`; }).join("");
    after = `<section class="st-ch st-end"><h4>💌 보름의 답장</h4><button class="go" data-sletter="1">💌 다시 읽기</button>` +
      `<h4>📮 엽서함</h4>${cards ? `<ul class="st-cards">${cards}</ul>` : `<p class="dim">${s.restored.mailbox ? "계절이 바뀌면 할머니 엽서가 와요." : "4장의 반딧불 우체통을 세우면 계절마다 엽서가 와요."}</p>`}` +
      (ST.allBonus(s) ? `<p class="st-pic">🖼 ${stSvEsc(STORY_PICTURE)}</p>` : `<p class="dim">덤 조각을 다 모으면 수첩에 그림이 한 장 붙어요.</p>`) + `</section>`;
  }
  return cover + chs + after;
}
