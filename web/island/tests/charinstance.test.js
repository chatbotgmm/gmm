// 갈매미 모델 복제(render/charInstance.js): 같은 모습 여럿이 서로 모델을 빼앗지 않고, 재질도 마리마다(한 마리만 아파 붉어져도 다른 마리는 그대로). three 없이 가짜 물체로.
import { test } from "node:test";
import assert from "node:assert/strict";
import { instanceChar } from "../src/render/charInstance.js";
import { markToonMade } from "../src/render/toonSrc.js";

let matId = 0;
const mat = (name = "body") => ({ id: ++matId, name, emissive: { hex: 0 }, clone() { return { ...mat(this.name), emissive: { hex: this.emissive.hex }, from: this }; } });
const node = (name, extra = {}, children = []) => ({ name, children, ...extra, traverse(f) { f(this); for (const c of this.children) c.traverse(f); } });
const cloneTree = n => node(n.name, { isSkinnedMesh: n.isSkinnedMesh, material: n.material, isBone: n.isBone }, n.children.map(cloneTree));   // SkeletonUtils.clone처럼 재질은 같이 씀
class Mixer { constructor(root) { this.root = root; } clipAction(c) { return { clip: c, setLoop(l, r) { this.loop = l; this.reps = r; } }; } stopAllAction() {} }
const proto = () => {
  const hammer = node("hammer"), hand = node("propR", { isBone: true }, [hammer]), scarf = node("wear_scarf");
  const body = node("body", { isSkinnedMesh: true, material: mat() }), root = node("gull", {}, [body, node("spine", { isBone: true }, [hand, scarf])]);
  return { root, acts: { Idle: { getClip: () => "idle", loop: 2201, repetitions: Infinity, clampWhenFinished: false }, Jump: { getClip: () => "jump", loop: 2200, repetitions: 1, clampWhenFinished: true } },
    inHand: { hammer }, wear: { scarf }, cfg: { name: "기본" }, clip: { Idle: { len: 1 } }, humanSwim: true };
};

test("같은 모습 둘: 서로 다른 root·믹서·도구·옷 · 원본은 장면에 안 붙음", () => {
  const p = proto(), a = instanceChar(p, { cloneRoot: cloneTree, Mixer }), b = instanceChar(p, { cloneRoot: cloneTree, Mixer });
  assert.notEqual(a.root, b.root); assert.notEqual(a.root, p.root); assert.notEqual(a.mixer, b.mixer);
  assert.notEqual(a.inHand.hammer, p.inHand.hammer); assert.equal(a.inHand.hammer.name, "hammer"); assert.notEqual(a.inHand.hammer, b.inHand.hammer);
  assert.equal(a.wear.scarf.name, "wear_scarf"); assert.notEqual(a.wear.scarf, p.wear.scarf);
  assert.equal(a.acts.Jump.loop, 2200); assert.equal(a.acts.Jump.clampWhenFinished, true); assert.equal(a.acts.Idle.clip, "idle");
  assert.equal(a.humanSwim, true); assert.equal(a.cfg, p.cfg); assert.equal(a.anim, "");
});

test("재질은 마리마다: 한 마리만 아파서(sickTint처럼 emissive를 바꿈) 붉어져도 다른 마리·원본은 그대로 · 툰 재질이면 원래 재질에서 복제", () => {
  const p = proto(), a = instanceChar(p, { cloneRoot: cloneTree, Mixer }), b = instanceChar(p, { cloneRoot: cloneTree, Mixer });
  const ma = a.root.children[0].material, mb = b.root.children[0].material, mp = p.root.children[0].material;
  assert.notEqual(ma, mb); assert.notEqual(ma, mp);
  ma.emissive.hex = 0x4a1208; assert.equal(mb.emissive.hex, 0); assert.equal(mp.emissive.hex, 0);
  const std = mat("std"), toon = markToonMade(mat("toon"), std); p.root.children[0].material = toon;
  const c = instanceChar(p, { cloneRoot: cloneTree, Mixer }); assert.equal(c.root.children[0].material.from, std, "툰 재질이 아니라 원래 재질을 복제(그림체는 다음 sweep이 다시 입힘)");
});
