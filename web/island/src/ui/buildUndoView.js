// 짓기 되돌리기·철거 확인 글(편의성 점검 8번). 규칙·돈 계산은 world/buildUndo.js · World.undoBuild, 여기는 글만(시험: tests/buildundo.test.js)
import { josa } from "../util.js";

/** 되돌린 뒤 알림 한 줄. name = 건물 이름, n = 되돌린 수, total = 되돌리려던 수(다리는 여러 칸), refund = 돌려받은 설계비, fails = 못 되돌린 까닭 */
export function buildUndoText({ name = "건물", n = 0, total = 1, refund = 0, fails = [] } = {}) {
  if (!n) return `🚫 ${fails[0] || "되돌릴 수 없어요"}`;
  const what = total > 1 ? `${name} ${n}칸` : name, back = refund ? ` · 설계비 🪙${refund} 돌려받음` : "";
  const cut = n < total ? ` · ${total - n}칸은 못 되돌렸어요(${fails[0] || "공사가 시작됨"})` : "";
  return `↶ ${josa(what, "을", "를")} 되돌렸어요${back}${cut}`;
}

/** 철거 확인창 글: { title, body, ok }. name = 건물 이름, done = 다 지었나, fee = 돌려받을 설계비(다 짓기 전만), owner = 사는 갈매미 이름, loan = 남은 빚 */
export function demolishAsk({ name = "건물", done = true, fee = 0, owner = "", loan = 0 } = {}) {
  const lines = [];
  if (!done) lines.push(fee ? `공사 중이라 설계비(🪙${fee})는 금고로 돌려받아요. 이미 쓴 재료·품삯은 돌아오지 않아요.` : "공사 중인 자리를 치워요. 이미 쓴 재료·품삯은 돌아오지 않아요.");
  else lines.push("다 지은 건물은 철거하면 되돌릴 수 없어요(설계비도 돌아오지 않아요).");
  if (owner) lines.push(`${josa(owner, "은", "는")} 집을 잃어요${loan ? `(남은 빚 🪙${loan}은 없어져요)` : ""}.`);
  return { title: `🧹 ${josa(name, "을", "를")} 철거할까요?`, body: lines.join(" "), ok: "🧹 철거" };
}
