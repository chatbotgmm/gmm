// 「처음이에요」 말풍선(상호작용을 처음 만날 때 한 번) 규칙 — DOM 없이 계산만(node --test로 시험). 편의성 점검 13번:
// 몇 초 뒤 한 줄로 접히고(위쪽 100 px를 오래 가리지 않게), 건설 모드·방 안에서는 숨김(방 안내만 방 안에서).

/** 처음 보인 뒤 이만큼(ms) 지나면 한 줄로 접음(「펼치기」로 다시 펼치면 그 안내는 더 안 접음) */
export const COACH_FOLD_MS = 6000;

/** 이 안내를 지금 보여도 되나: 방 안내는 방 안에서만, 나머지(선물·입질)는 둘러보기에서만(건설 모드·방 안이면 기다림) */
export function momentShowable(kind, { inRoom = false, editMode = false } = {}) {
  return kind === "room" ? inRoom : !inRoom && !editMode;
}

/** 대기열에서 지금 보일 안내(보일 수 없는 것은 건너뜀 — 앞의 선물 안내 때문에 방 안내가 막히지 않게). 없으면 null */
export function pickMoment(queue, ctx) { return queue.find(k => momentShowable(k, ctx)) ?? null; }

/** 접을까: 처음 보인 때(since)에서 COACH_FOLD_MS가 지났고 펼쳐 두기(keep)를 안 눌렀으면 */
export function momentFolded(since, now, keep = false, ms = COACH_FOLD_MS) { return !keep && since != null && now - since >= ms; }
