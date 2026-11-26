// 건축에서 금고 돈이 나갈 때 보이는 효과의 순수 로직(DOM·three 없음 → tests/vaultfx.test.js).
//  · 금고 칩 옆 −n: 이어서 나가면 합침(VF_SUM_MS 안) · 칩 숫자는 VF_COUNT_MS 동안 예전 값에서 새 값으로 줄어듦
//  · 공사장 위 표시: 설계비 "설계비 🪙−n" · 품삯 "🪙−n" · 금고 부족 "💸 품삯 밀림". 같은 공사장은 떠 있는 동안 합치고(글만 고침),
//    새로 띄우는 것은 공사장마다 VF_SITE_GAP_MS에 한 번, 한꺼번에 VF_MAX개까지(넘으면 띄우지 않음 — 금고 칩 −n은 그대로)
//  · 주문 공사(갈매미 돈)는 금고에서 안 나가므로 아무것도 띄우지 않음(World.payWage가 이벤트를 내지 않음)
export const VF_SUM_MS = 3000;        // 칩 옆 −n이 떠 있는 시간(이어서 나가면 합치고 다시 3초) — 기존 꾸미기 −n과 같음
export const VF_COUNT_MS = 600;       // 칩 숫자가 줄어드는 시간
export const VF_FLASH_MS = 700;       // 칩 숫자가 빨간 글로 바뀌어 있는 시간
export const VF_LIFE_MS = 1800;       // 공사장 위 표시가 떠 있는 시간(떠오르며 옅어짐)
export const VF_SITE_GAP_MS = 2500;   // 같은 공사장에 새 표시를 띄우는 최소 간격(그 사이 품삯은 떠 있는 표시에 합침)
export const VF_MAX = 6;              // 한꺼번에 떠 있는 공사장 표시 수 상한
export const VF_FLY_MS = 650;         // 금고 칩 → 공사장으로 날아가는 동전 시간
export const VF_FLY_MAX = 3;          // 한꺼번에 나는 동전 수 상한

/** 공사장 위 글: kind = "fee" | "wage" | "owed" */
export function siteSpendText(kind, n) {
  n = Math.max(0, Math.round(n || 0));
  if (kind === "owed") return n > 0 ? `💸 품삯 밀림 ${n}` : "💸 품삯 밀림";
  if (kind === "fee") return `설계비 🪙−${n}`;
  return `🪙−${n}`;
}
/** 칩 옆 글(합): 음수면 −n, 양수면 +n, 0이면 "" */
export function chipSpendText(sum) { sum = Math.round(sum || 0); return sum ? `${sum > 0 ? "+" : "−"}${Math.abs(sum)}` : ""; }

/** 칩 옆 합: add(d, now) → { sum, until } (VF_SUM_MS가 지나면 새로 시작) */
export function makeSpendSum(win = VF_SUM_MS) {
  let sum = 0, until = 0;
  return { add(d, now) { if (now > until) sum = 0; sum += d; until = now + win; return { sum, until }; }, get sum() { return sum; }, reset() { sum = 0; until = 0; } };
}

/** 카운트다운: from → to를 k(0~1)에서 얼마로 보일지(ease-out, 정수) */
export function countAt(from, to, k) { k = Math.max(0, Math.min(1, k)); const e = 1 - (1 - k) * (1 - k); return Math.round(from + (to - from) * e); }

/** 공사장 표시 판단기. push(key, kind, n, now) →
 *   { act: "new", pop } 새로 띄움 · { act: "merge", pop } 떠 있는 것에 합침(글만 고침) · { act: "skip", why } 띄우지 않음
 *  pop = { key, kind, n, t0 } (t0 = 띄운 때. 합쳐도 t0는 그대로 → 계속 들어와도 VF_LIFE_MS 넘게 떠 있지 않음… 단 합칠 때 끝을 조금 늘림)
 *  sweep(now): 끝난 것을 지움 */
export function makeSiteGate({ life = VF_LIFE_MS, gap = VF_SITE_GAP_MS, max = VF_MAX } = {}) {
  const live = new Map(), last = new Map();
  const sweep = now => { for (const [k, p] of live) if (now >= p.end) live.delete(k); };
  return {
    live, sweep,
    push(key, kind, n, now) {
      sweep(now); const p = live.get(key);
      if (p) {
        if (kind === "owed" && p.kind !== "owed") { p.kind = "owed"; p.n = n; p.end = now + life; return { act: "merge", pop: p }; }   // 밀림이 이김(경고)
        if (p.kind === "owed" && kind !== "owed") return { act: "skip", why: "owed" };                                             // 밀림 표시를 덮지 않음
        if (p.kind === "fee" && kind === "wage") return { act: "skip", why: "fee" };                                               // 설계비 표시 동안 들어온 품삯은 칩에만
        p.n += n; p.end = Math.max(p.end, Math.min(p.t0 + life * 1.5, now + life * 0.6)); return { act: "merge", pop: p };
      }
      if (kind !== "fee" && now - (last.get(key) ?? -Infinity) < gap) return { act: "skip", why: "gap" };   // 설계비는 놓는 순간이라 언제나
      if (live.size >= max) return { act: "skip", why: "max" };
      const q = { key, kind, n, t0: now, end: now + life }; live.set(key, q); last.set(key, now); return { act: "new", pop: q };
    },
    clear() { live.clear(); last.clear(); },
  };
}
