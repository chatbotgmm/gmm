// 갈매미 모델 받기(gullLoad.js): 다시 받기 간격·실패 모델 목록·불러오는 중 글. DOM·three 없이. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { RETRY_DELAYS, retryDelay, withRetry, missingChars, GullPool, failReason, loadingView } from "../src/render/gullLoad.js";

const CHARS = ["기본", "미니", "자이언트", "꽃", "황금", "물방울", "불씨", "그림자", "목수"].map(name => ({ name }));
const noSleep = slept => ms => { slept.push(ms); return Promise.resolve(); };
const err = kind => Object.assign(new Error(kind), { kind });

test("retryDelay: 1.5초 → 4초 → 10초, 세 번 다시 받은 뒤엔 null", () => {
  assert.deepEqual(RETRY_DELAYS, [1500, 4000, 10000]);
  assert.deepEqual([0, 1, 2, 3, -1].map(n => retryDelay(n)), [1500, 4000, 10000, null, null]);
  assert.ok(RETRY_DELAYS.every((d, i) => !i || d > RETRY_DELAYS[i - 1]), "간격이 늘어남");
  assert.equal(RETRY_DELAYS.reduce((a, b) => a + b, 0), 15500, "단추가 나오기까지 기다리는 시간 합");
});

test("withRetry: 두 번 실패 후 성공하면 값, 간격대로 기다림 · 네 번 다 실패하면 마지막 오류", async () => {
  const slept = []; let n = 0;
  assert.equal(await withRetry(async () => { if (n++ < 2) throw err("network"); return "ok"; }, { sleep: noSleep(slept) }), "ok");
  assert.deepEqual(slept, [1500, 4000]); assert.equal(n, 3);
  const s2 = []; let m = 0;
  await assert.rejects(withRetry(async () => { m++; throw err("missing" + m); }, { sleep: noSleep(s2) }), /missing4/);
  assert.equal(m, 4, "처음 + 다시 세 번"); assert.deepEqual(s2, [1500, 4000, 10000]);
});

test("missingChars: map에 없는 것만", () => {
  assert.deepEqual(missingChars(CHARS, new Map([["기본", 1], ["목수", 1]])).map(c => c.name), ["미니", "자이언트", "꽃", "황금", "물방울", "불씨", "그림자"]);
  assert.deepEqual(missingChars(CHARS, new Map(CHARS.map(c => [c.name, 1]))), []);
});

test("GullPool: 모두 받으면 ready가 같은 map으로 풀리고 한 번씩만 받음", async () => {
  const calls = []; const p = new GullPool({ loadSet: async () => ({ dir: "d/", chars: CHARS }), loadChar: async (s, c) => { calls.push(c.name); return { name: c.name }; }, sleep: noSleep([]) });
  await p.start(); const map = await p.ready;
  assert.equal(map, p.map); assert.equal(map.size, 9); assert.equal(p.state, "done"); assert.equal(calls.length, 9);
  assert.equal(p.get("꽃").name, "꽃"); assert.equal(p.retry(), false, "끝난 뒤엔 다시 시도 없음");
  await p.start(); assert.equal(calls.length, 9, "다시 받지 않음");
});

test("GullPool: 하나가 잠깐 실패 → 자동으로 다시 받아 성공", async () => {
  const slept = [], tries = {};
  const p = new GullPool({ loadSet: async () => ({ dir: "d/", chars: CHARS }), sleep: noSleep(slept),
    loadChar: async (s, c) => { tries[c.name] = (tries[c.name] || 0) + 1; if (c.name === "미니" && tries[c.name] < 3) throw err("network"); return c.name; } });
  const seen = []; p.onChange(q => seen.push(q.progress().retrying));
  await p.start();
  assert.equal(p.state, "done"); assert.equal(tries["미니"], 3); assert.equal(tries["기본"], 1); assert.deepEqual(slept, [1500, 4000]);
  assert.ok(seen.some(r => r > 0), "다시 받는 중이 알려짐");
});

test("GullPool: 끝내 실패 → failed + 못 받은 목록, retry()는 못 받은 것만 다시 받고 ready가 풀림", async () => {
  let broken = true; const calls = [];
  const p = new GullPool({ loadSet: async () => ({ dir: "d/", chars: CHARS }), sleep: noSleep([]),
    loadChar: async (s, c) => { calls.push(c.name); if (broken && (c.name === "꽃" || c.name === "불씨")) throw err("missing"); return c.name; } });
  let resolved = false; p.ready.then(() => { resolved = true; });
  await p.start();
  const g = p.progress();
  assert.equal(g.state, "failed"); assert.deepEqual(g.failed, ["꽃", "불씨"]); assert.equal(g.done, 7); assert.equal(g.total, 9);
  assert.deepEqual(g.kinds, ["missing", "missing"]); assert.equal(resolved, false, "실패하면 게임을 열지 않음");
  assert.equal(calls.filter(n => n === "꽃").length, 4, "꽃: 처음 + 자동 3번");
  broken = false; calls.length = 0;
  assert.equal(p.retry(), true); await p.ready;
  assert.deepEqual(calls.sort(), ["꽃", "불씨"].sort(), "이미 받은 7종은 다시 받지 않음");
  assert.equal(p.state, "done"); assert.equal(p.map.size, 9); assert.equal(resolved, true);
});

test("GullPool: 갈매미 목록(chars.json)이 실패하면 목록부터 다시", async () => {
  let n = 0;
  const p = new GullPool({ loadSet: async () => { n++; if (n <= 4) throw err("network"); return { dir: "d/", chars: CHARS.slice(0, 2) }; }, loadChar: async (s, c) => c.name, sleep: noSleep([]) });
  await p.start();
  assert.equal(p.state, "failed"); assert.equal(p.progress().setFailed, true); assert.equal(p.progress().setKnown, false); assert.equal(n, 4);
  assert.equal(p.retry(), true); await p.round; const map = await p.ready; assert.equal(map.size, 2); assert.equal(n, 5);
  assert.equal((await p.setReady).chars.length, 2);
});

test("failReason: 까닭 한 줄(연결 끊김·파일 없음·그 밖, 이름은 셋까지)", () => {
  assert.equal(failReason({ failed: ["꽃"], kinds: ["network"] }), "갈매미 1종(꽃)을 받지 못했어요. 인터넷 연결을 확인해 주세요");
  assert.equal(failReason({ failed: ["꽃", "미니"], kinds: ["missing", "missing"] }), "갈매미 2종(꽃·미니)을 받지 못했어요. 서버에서 모델 파일을 찾지 못했어요");
  assert.match(failReason({ failed: ["a", "b", "c", "d"], kinds: ["error"] }), /4종\(a·b·c 등\).*문제가 생겼어요/);
  assert.match(failReason({ failed: ["꽃"], kinds: ["missing"] }, false), /인터넷 연결/, "기기가 오프라인이면 연결부터");
  assert.match(failReason({ setFailed: true, kinds: ["missing"] }), /^갈매미 목록을 받지 못했어요/);
  assert.ok(!/\n/.test(failReason({ failed: CHARS.map(c => c.name), kinds: ["network"] })), "한 줄");
});

test("loadingView: 갈매미가 남으면 「갈매미 불러오는 중 n/9」, 다 받으면 다른 모델, 실패하면 failed", () => {
  const g = o => ({ state: "loading", done: 0, total: 9, setKnown: true, retrying: 0, failed: [], setFailed: false, kinds: [], ...o });
  assert.equal(loadingView(g({ setKnown: false, total: 0 })).text, "갈매미 목록 불러오는 중…");
  assert.equal(loadingView(g({ done: 4 }), { done: 10, total: 20 }).text, "갈매미 불러오는 중 4/9");
  assert.equal(loadingView(g({ done: 4, retrying: 1 })).text, "갈매미 불러오는 중 4/9 · 다시 받는 중");
  assert.equal(loadingView(g({ done: 8 }), { done: 20, total: 20 }, true).text, "갈매미 불러오는 중 8/9", "다른 모델이 90초로 끝나도 갈매미는 기다림");
  assert.equal(loadingView(g({ state: "done", done: 9 }), { done: 12, total: 20 }).text, "모델 불러오는 중 12 / 20");
  assert.equal(loadingView(g({ state: "done", done: 9 }), { done: 20, total: 20 }, true).frac, 1);
  assert.equal(loadingView(g({ done: 9 * 0 }), { done: 0, total: 0 }).frac, 0);
  assert.equal(loadingView(g({ done: 3 }), { done: 5, total: 10 }).frac, (3 / 9 + 0.5) / 2);
  const f = loadingView(g({ state: "failed", done: 7, failed: ["꽃", "불씨"] }));
  assert.equal(f.failed, true); assert.equal(f.text, "갈매미 불러오는 중 7/9 · 멈춤");
  assert.equal(loadingView(g({ state: "failed", setFailed: true, setKnown: false })).text, "갈매미 목록 불러오는 중 · 멈춤", "까닭 줄과 같은 말을 되풀이하지 않음");
});
