// 🗼 등대 불빛(render/lampLook.js)과 등대를 눌렀을 때 한 줄(world/story.js lighthouseNote). node --test tests/
//  · 켜진 등대는 예전(이야기 전) 그대로: 낮 유리 0.9 · 밤 유리 4.4 · 둘레 불빛 30 · 빛줄기
//  · 🗝 3장 「등대 등불」을 고치기 전엔 '잠든 등대': 빛줄기 없이 밤에만 숨 쉬는 불씨(깜깜해서 고장 난 것처럼 보이지 않게)
//  · 고친 순간 밤 불빛은 불씨에서 차오름(fill) · 연출(boost)은 낮에도 켬
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lighthouseLook } from "../src/render/lampLook.js";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import * as ST from "../src/world/story.js";
import { atLabel } from "../src/ui/qolViews.js";

const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

test("켜진 등대: 예전 값 그대로(낮 유리 0.9, 밤 유리 4.4 · 둘레 불빛 30 · 큰 빛 번짐 4.5 · 빛줄기)", () => {
  const day = lighthouseLook({ glow: 0, lit: true }), night = lighthouseLook({ glow: 1, lit: true, t: 3 });
  assert.ok(near(day.glass, 0.9)); assert.equal(day.beam, 0); assert.equal(day.beacon, 0); assert.equal(day.halo, 0);
  assert.ok(near(night.glass, 4.4)); assert.equal(night.beam, 1); assert.ok(near(night.beacon, 30)); assert.ok(near(night.halo, 0.85)); assert.ok(near(night.haloScale, 4.5)); assert.equal(night.warm, 1); assert.equal(night.ember, 0);
  const dusk = lighthouseLook({ glow: 0.4, lit: true });
  assert.ok(near(dusk.n, 0.4) && near(dusk.beam, 0.4), "해 질 녘엔 밤 정도만큼");
  assert.deepEqual(lighthouseLook({ glow: 1 }), lighthouseLook({ glow: 1, lit: true }), "이야기를 모르는 장면(lit 없음)은 켜진 등대");
});

test("잠든 등대(등불을 고치기 전): 낮엔 꺼진 유리, 밤엔 빛줄기·큰 불빛 없이 작은 주황 불씨가 숨 쉼", () => {
  const day = lighthouseLook({ glow: 0, lit: false });
  assert.ok(near(day.glass, 0.12)); assert.equal(day.beam, 0); assert.equal(day.beacon, 0); assert.equal(day.halo, 0); assert.equal(day.warm, 0);
  const seen = [];
  for (let t = 0; t < 8; t += 0.25) {
    const k = lighthouseLook({ glow: 1, lit: false, t }); seen.push(k.glass);
    assert.equal(k.n, 0); assert.equal(k.beam, 0, "빛줄기 없음");
    assert.ok(k.ember >= 0.55 && k.ember <= 1, "밤 불씨는 늘 보임");
    assert.ok(k.glass > 1 && k.glass < 2, `유리는 켜진 등대(4.4)보다 훨씬 어둡고 꺼진 유리(0.12)보다 밝음: ${k.glass}`);
    assert.ok(k.beacon > 0 && k.beacon <= 3, "둘레 불빛은 아주 약하게(켜진 등대 30)");
    assert.ok(k.halo >= 0.25 && k.halo <= 0.5 && near(k.haloScale, 1.9) && k.warm === 0, "작은 주황 빛 번짐");
  }
  assert.ok(Math.max(...seen) - Math.min(...seen) > 0.3, "불씨가 천천히 숨 쉼(세기가 오르내림)");
  const half = lighthouseLook({ glow: 0.5, lit: false, t: 1 }), full = lighthouseLook({ glow: 1, lit: false, t: 1 });
  assert.ok(near(half.ember * 2, full.ember), "밤 정도만큼(낮엔 사라짐)");
});

test("등불을 고친 순간: 밤 불빛이 불씨에서 이어져 차오름(툭 켜지지 않음) · 연출은 낮에도 켬", () => {
  const t = 2.2, asleep = lighthouseLook({ glow: 1, lit: false, t }), f0 = lighthouseLook({ glow: 1, lit: true, fill: 0, t });
  assert.ok(near(f0.glass, asleep.glass) && near(f0.ember, asleep.ember) && f0.n === 0 && f0.beam === 0, "차오르기 시작 = 잠든 등대와 같은 모습");
  let last = -1, lastGlass = 0;
  for (let f = 0; f <= 1.0001; f += 0.1) { const k = lighthouseLook({ glow: 1, lit: true, fill: f, t }); assert.ok(k.n > last, "빛줄기는 점점 세짐"); assert.ok(k.glass >= lastGlass - 1e-9, "유리는 어두워지지 않음"); last = k.n; lastGlass = k.glass; }
  const done = lighthouseLook({ glow: 1, lit: true, fill: 1, t }); assert.equal(done.ember, 0); assert.ok(near(done.glass, 4.4));
  const boostDay = lighthouseLook({ glow: 0, lit: true, boost: 1 });
  assert.equal(boostDay.beam, 1, "엔딩·3장 연출: 낮에도 빛줄기"); assert.ok(near(boostDay.glass, 4.4));
  const boostMid = lighthouseLook({ glow: 0, lit: true, boost: 0.5 }); assert.ok(near(boostMid.n, 0.5));
  for (const bad of [{ glow: NaN }, { glow: -3, boost: 9 }, {}]) { const k = lighthouseLook(bad); for (const v of Object.values(k)) assert.ok(Number.isFinite(v), JSON.stringify(bad)); }
});

test("daylight.js가 등대 값(유리 발광·불빛·빛 번짐·빛줄기)을 코드로 실제로 씀(주석에 묻히지 않음)", () => {
  const src = readFileSync(new URL("../src/render/daylight.js", import.meta.url), "utf8");
  const code = src.split("\n").map(l => { const i = l.search(/\s\/\/|^\s*\/\//); return i < 0 ? l : l.slice(0, i); }).join("\n");
  for (const s of ["emissiveIntensity = k.glass", "beacon.intensity = k.beacon", "lampHalo.material.opacity = k.halo", "uOpacity.value = 0.75 * n"]) assert.ok(code.includes(s), s);
  assert.ok(!/getObjectByName\("lighthouse(Lamp|Beam)"\)/.test(code.replace(/lhFind\(name\)[\s\S]*?\n  }/, "")), "매 프레임 장면 전체를 훑지 않고 lhFind로 찾음");
});

const town = () => { const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.instantBuild = true; return w; };

test("등대를 누르면: 왜 꺼져 있고 무엇을 하면 켜지는지(장마다) · 켜진 뒤엔 그 모습 · 수첩이 생긴 뒤에만 수첩으로", () => {
  const w = town(), s = w.story;
  assert.equal(ST.lighthouseNote(null, w, 1).lit, true, "이야기를 끈 섬은 그냥 등대");
  let n = ST.lighthouseNote(s, w, 1);
  assert.equal(n.lit, false); assert.equal(n.app, null, "0장: 아직 수첩이 없음"); assert.match(n.text, /잠들어/); assert.match(n.text, /내일쯤 발치에 ✨ 반짝이/);
  assert.match(ST.lighthouseNote(s, w, 2).text, /곧 발치에 ✨ 반짝이/);
  w.time = 601; w.storyEvent("wave"); assert.ok(s.sparks.some(p => p.p === "c1_sign"), "둘째 날 문패 반짝이");
  assert.match(ST.lighthouseNote(s, w, 2).text, /발치의 ✨ 반짝이를 주워/);
  w.pickSparkle(w.sparkles.find(o => o.story === "c1_sign").id); assert.equal(s.chapter, 1);
  n = ST.lighthouseNote(s, w, 2); assert.equal(n.app, "story"); assert.match(n.text, /3장 「등대 등불」을 고치면 다시 켜져요\(지금 1장\)/);
  s.chapter = 3; w.res.iron = 0; for (const u of w.units) if (u.inv) u.inv.iron = 0;
  n = ST.lighthouseNote(s, w, 5); assert.match(n.text, /남은 것: 🧩 조각 0\/3 · 🌟 별씨 0\/3 · ⛓ 철 0\/1/); assert.equal(n.app, "story");
  for (const id of ["c3_seed", "c3_bottle", "c3_secret2"]) s.found[id] = { day: 3, who: null };
  s.seeds = 3; w.res.iron = 1;
  n = ST.lighthouseNote(s, w, 5); assert.match(n.text, /고칠 준비가 됐어요/); assert.equal(ST.restoreCheck(s, w, 3).ok, true);
  assert.ok(w.storyRestore(3).ok); n = ST.lighthouseNote(s, w, 5); assert.equal(n.lit, true); assert.match(n.text, /불이 켜져 있어요/);
  assert.equal(atLabel(w, { app: "story" }), "🗝 비밀 수첩 열기", "알림을 누르면 수첩으로");
});

test("밤 불빛 코드가 주석에 묻히지 않음: 줄 끝 주석 안에 실행할 문장(대입·호출 + ;)이 없음(등대 유리·가로등 빛 번짐이 그렇게 꺼져 있었음)", () => {
  const swallowed = /[^ ]\s+[a-zA-Z_$][\w$.\[\]]*(\.\w+\(.*\)|\s=\s[^=].*);\s*(\/\/|$)/;
  for (const f of ["render/daylight.js", "render/storyFx.js", "render/lampLook.js", "render/lampPool.js"]) {
    const lines = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8").split("\n");
    lines.forEach((l, i) => { const at = l.search(/\s\/\/\s/); if (at < 0) return; assert.ok(!swallowed.test(l.slice(at)), `${f}:${i + 1} 주석 안의 코드: ${l.slice(at, at + 120)}`); });
  }
  const code = readFileSync(new URL("../src/render/daylight.js", import.meta.url), "utf8").split("\n").map(l => { const i = l.search(/\s\/\//); return i < 0 ? l : l.slice(0, i); }).join("\n");
  assert.ok(/halo\.scale\.setScalar\(LAMP_HALO_M \/ s\);.*o\.add\(halo\)/.test(code), "가로등 빛 번짐을 가로등에 붙임(실제 빛도 이 자리로 옮겨 감)");
  assert.equal((code.match(/o\.add\(halo\)/g) || []).length, 1, "빛 번짐을 붙이는 곳은 한 군데");
  assert.ok(code.includes("setLampPools(near.map(it => it[1]), n)") && !/CircleGeometry/.test(code), "발밑 빛 웅덩이는 원판이 아니라 땅 셰이더(lampPool.js)");
  const seasons = readFileSync(new URL("../src/render/seasons.js", import.meta.url), "utf8").split("\n").map(l => { const i = l.search(/\s\/\//); return i < 0 ? l : l.slice(0, i); }).join("\n");
  assert.ok(seasons.includes("Object.assign(sh.uniforms, U, LAMP_POOL_U)") && seasons.includes('lampPoolFrag("vSeasonW")'), "땅 재질이 빛 웅덩이를 칠함");
});
