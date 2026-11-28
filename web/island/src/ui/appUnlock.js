// 갈매폰 앱이 필요할 때 생기게(순수: DOM을 모름 → tests/appunlock.test.js).
// 처음 섬에는 소원·갈매미·소식지·소환·저장·설정·도움말만. 나머지는 쓸 일이 생기면 나타나고 「새 앱」 표시가 붙음.
//  · 이야기·처음 안내가 가리키는 앱(🥚 소환 · 💭 소원 · 🗝 비밀)은 숨기지 않음. 🗝 비밀은 이야기를 시작하면(hud가 따로 봄)
//  · 숨긴 앱도 다른 길(금고 칩 → 은행, 등급 칩 → 마을, 갈매미 카드 💞 → 관계도)로 열 수 있고, 한 번 열면 그 뒤로 늘 보임(hud.appOpened)
//  · ⚙ 설정 → 🔧 자세히 보기를 켜면 모든 앱이 보임
import { BUILDINGS, FURNITURE } from "../data/catalog.js";

/** 처음부터 늘 보이는 앱 */
export const APPS_ALWAYS = ["wish", "gulls", "news", "summon", "files", "settings", "help"];
/** 나중에 생기는 앱 → 생기는 때(사람이 읽는 글: 도움말·시험용) */
export const APP_WHEN = {
  dex: "물고기나 물건을 처음 모으면",
  rel: "갈매미가 세 마리가 되면",
  decor: "갈매미가 둘이 되거나 놓을 가구가 생기면",
  bank: "처음 공사를 하거나 금고가 모자라면",
  town: "마을 등급이 처음 오르거나 갈매미가 셋이 되면",
  market: "시장을 지으면",
};
const anyPos = o => Object.values(o || {}).some(v => (typeof v === "number" ? v > 0 : !!v));

/** 지금 보여야 하는 앱 id 묶음(Set). opened = 이미 한 번 연 앱(늘 보임), adv = 자세히 보기 */
export function appsVisible(w, { opened = null, adv = false } = {}) {
  const on = new Set(APPS_ALWAYS);
  if (opened) for (const a of opened) on.add(a);
  if (adv) { for (const a of Object.keys(APP_WHEN)) on.add(a); return on; }
  if (!w) return on;
  const n = w.units?.length || 0, blds = [...(w.buildings?.values?.() || [])];
  if (anyPos(w.collection) || anyPos(w.items) || anyPos(w.skySeen) || anyPos(w.donated) || anyPos(w.treasures)) on.add("dex");
  if (n >= 3) on.add("rel");
  if (n >= 2 || Object.keys(w.items || {}).some(k => FURNITURE[k] && w.items[k] > 0)) on.add("decor");
  const L = w.bank?.ledger || [];
  if (w.economy && (L.some(e => (e.fees || 0) + (e.wages || 0) + (e.custom || 0) > 0) || (w.vaultState && w.vaultState() !== "ok"))) on.add("bank");
  if ((w.rank || 0) > 0 || n >= 3) on.add("town");
  if (blds.some(b => BUILDINGS[b.defId]?.market)) on.add("market");
  return on;
}
