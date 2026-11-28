// meshopt 압축 GLB(gltfpack: EXT_meshopt_compression + KHR_mesh_quantization) -> 압축 없는 GLB(모양 그대로, KHR_mesh_quantization 유지), 노멀·금속도 텍스처 뺌, 재질은 bank와 같게
// 사용: node tools/demopt.mjs 원본.glb 푼.glb   (meshoptimizer npm 패키지가 필요: npm i meshoptimizer — 저장소에는 넣지 않음)
// 수족관·분수를 넣을 때 씀(assets/props/README.md). 다음 단계: tools/import_prop.py
import fs from "fs";
import { MeshoptDecoder } from "meshoptimizer";
const [inp, outp] = process.argv.slice(2);
const b = fs.readFileSync(inp), jl = b.readUInt32LE(12), g = JSON.parse(b.subarray(20, 20 + jl).toString());
const o = 20 + jl, bl = b.readUInt32LE(o), bin = b.subarray(o + 8, o + 8 + bl);
await MeshoptDecoder.ready;
const views = g.bufferViews.map(bv => {
  const e = bv.extensions?.EXT_meshopt_compression;
  if (!e) return bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const src = bin.subarray(e.byteOffset || 0, (e.byteOffset || 0) + e.byteLength), dst = new Uint8Array(e.count * e.byteStride);
  MeshoptDecoder.decodeGltfBuffer(dst, e.count, e.byteStride, src, e.mode, e.filter || "NONE");
  return Buffer.from(dst);
});
// 재질: 기본색만
const m = g.materials[0], baseTex = m.pbrMetallicRoughness.baseColorTexture.index, baseImg = g.textures[baseTex].source;
g.materials = [{ pbrMetallicRoughness: { metallicFactor: 0.1, roughnessFactor: 0.8, baseColorTexture: { index: 0, texCoord: 0 } }, name: m.name }];
g.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }];
const keepImgView = g.images[baseImg].bufferView;
// 쓸 bufferView: 접근자 것 + 기본색 그림
const used = [...new Set([...g.accessors.map(a => a.bufferView), keepImgView])].sort((a, c) => a - c), remap = new Map(used.map((v, i) => [v, i]));
g.images = [{ mimeType: g.images[baseImg].mimeType, bufferView: remap.get(keepImgView) }];
g.textures = [{ sampler: 0, source: 0 }];
for (const a of g.accessors) a.bufferView = remap.get(a.bufferView);
const out = []; let off = 0; const nbv = [];
for (const v of used) {
  const old = g.bufferViews[v], d = views[v]; while (off % 4) { out.push(Buffer.alloc(1)); off++; }
  const bv = { buffer: 0, byteOffset: off, byteLength: d.length }; if (old.byteStride) bv.byteStride = old.byteStride; if (old.target) bv.target = old.target;
  nbv.push(bv); out.push(d); off += d.length;
}
while (off % 4) { out.push(Buffer.alloc(1)); off++; }
g.bufferViews = nbv; g.buffers = [{ byteLength: off }];
g.extensionsUsed = (g.extensionsUsed || []).filter(x => x !== "EXT_meshopt_compression");
g.extensionsRequired = (g.extensionsRequired || []).filter(x => x !== "EXT_meshopt_compression");
let j = Buffer.from(JSON.stringify(g)); while (j.length % 4) j = Buffer.concat([j, Buffer.from(" ")]);
const binb = Buffer.concat(out), hdr = Buffer.alloc(12); hdr.writeUInt32LE(0x46546C67, 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(12 + 8 + j.length + 8 + binb.length, 8);
const c1 = Buffer.alloc(8); c1.writeUInt32LE(j.length, 0); c1.writeUInt32LE(0x4E4F534A, 4);
const c2 = Buffer.alloc(8); c2.writeUInt32LE(binb.length, 0); c2.writeUInt32LE(0x004E4942, 4);
fs.writeFileSync(outp, Buffer.concat([hdr, c1, j, c2, binb]));
console.log(outp, "tris", g.accessors[g.meshes[0].primitives[0].indices].count / 3, "verts", g.accessors[0].count, (fs.statSync(outp).size / 1024 | 0) + "KB");
