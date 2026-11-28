// 짓기 되돌리기(편의성 점검 8번): 방금 놓은 건물을 ↶로 무름 = 철거 + 설계비 전액 환불, 장부도 놓기 전과 같게.
// 규칙: 플레이어가 놓은 건물(b.undoable)이고, 아직 아무것도 더 쓰지 않았을 때만 — 망치질 0번(b.hits 0 → 품삯도 아직 안 나감)이고 재료를 하나도 쓰지 않음(b.used 없음).
//   이때 금고에서 나간 돈은 설계비(b.fee)뿐이라 그 값을 그대로 돌려주면 금고·장부가 놓기 전과 같아짐.
//   중앙은행(MON-5) 섬: 설계비는 건축가 갈매미에게 가지만 공사가 시작될 때(첫 망치질·첫 재료 — World.releaseFee) 감. 그 전엔 금고가 맡아 둠(b.feeHeld)
//   → 되돌리기는 늘 맡아 둔 설계비를 금고로 되돌리는 것이라 갈매미 주머니를 건드리지 않고 정확함(돈의 합 보존: tests/monconserve.test.js).
//   공사가 시작된 뒤에는 되돌리기 대신 🧹 철거(다 짓기 전이면 설계비만 돌려받고 쓴 재료·품삯은 그대로 — World.removeBuilding).
// 장부: 놓은 날과 같은 날 되돌리면 그날 설계비(fees) 칸에서 뺌(낸 적 없는 것처럼) · 날이 바뀌었으면 오늘 칸에 환불(refunds)로(지난 날 칸은 건드리지 않음 — 설계비 칸이 음수가 되지 않게).

/** 되돌릴 수 없는 까닭(되돌릴 수 있으면 ""). b = 건물 자료, done = 다 지었나 */
export function undoBlock(b, done = false) {
  if (!b) return "이미 없어요";
  if (!b.undoable) return "되돌릴 수 없는 건물이에요";
  if (done) return "다 지어져서 되돌릴 수 없어요";
  if (b.hits > 0 || b.used) return "공사가 시작돼서 되돌릴 수 없어요. 🧹 철거하면 설계비는 돌려받아요";
  return "";
}
/** 설계비를 되돌릴 때 장부에 적을 것: { key, n } (World.led(key, n)) */
export function feeUndoLedger(fee, placedDay, today) {
  return placedDay != null && placedDay === today ? { key: "fees", n: -fee } : { key: "refunds", n: fee };
}
