// 「처음이에요」 말풍선(상호작용을 처음 만날 때 한 번) 규칙 — DOM 없이 계산만(node --test로 시험). 편의성 점검 13번:
// 몇 초 뒤 한 줄로 접히고(위쪽 100 px를 오래 가리지 않게), 건설 모드·방 안에서는 숨김(방 안내만 방 안에서).

/** 처음 보인 뒤 이만큼(ms) 지나면 한 줄로 접음(「펼치기」로 다시 펼치면 그 안내는 더 안 접음) */
export const COACH_FOLD_MS = 6000;

/** 이 안내를 지금 보여도 되나: 방 안내는 방 안에서만, 나머지(선물·입질·첫 밤)는 둘러보기에서만(건설 모드·방 안이면 기다림).
 *  첫 밤 안내는 처음 안내 3단계가 도는 동안(stepping)에도 기다림(한 번에 하나만) */
export function momentShowable(kind, { inRoom = false, editMode = false, stepping = false } = {}) {
  if (kind === "night" && stepping) return false;
  return kind === "room" ? inRoom : !inRoom && !editMode;
}

/** 첫 밤 안내(🌙 밤이 깜깜하죠? 풍차를 지으면…)를 띄울 만한가: 풍차를 지어 줄 목수가 있고(없으면 고칠 길이 없음), 풍차를 하나도 안 놓았음(짓는 중 포함).
 *  밤인지·이미 봤는지는 부르는 쪽(coach.js night)이 봄. isPower: 건물 def → 풍차인가(data/catalog.js power) */
export function nightTipFits(w, isPower) {
  if (!w?.units?.some(u => u.job === "carpenter")) return false;
  for (const b of w.buildings?.values?.() || []) if (isPower(b.defId)) return false;
  return true;
}

/** 대기열에서 지금 보일 안내(보일 수 없는 것은 건너뜀 — 앞의 선물 안내 때문에 방 안내가 막히지 않게). 없으면 null */
export function pickMoment(queue, ctx) { return queue.find(k => momentShowable(k, ctx)) ?? null; }

/** 접을까: 처음 보인 때(since)에서 COACH_FOLD_MS가 지났고 펼쳐 두기(keep)를 안 눌렀으면 */
export function momentFolded(since, now, keep = false, ms = COACH_FOLD_MS) { return !keep && since != null && now - since >= ms; }
