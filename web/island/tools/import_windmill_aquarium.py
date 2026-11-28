#!/usr/bin/env python3
"""풍차(windmill)·수족관(aquarium) 사용자 모델을 게임 소품 형식으로(2026-11-28, assets/props/README.md).
사용: python3 tools/import_windmill_aquarium.py <출력 폴더> <windmill_3d_model.glb> <수족관 meshopt를 푼 glb>
 - 수족관 원본은 EXT_meshopt_compression이라 먼저 풀어서 넣음(meshoptimizer npm의 MeshoptDecoder.decodeGltfBuffer로 bufferView를 풀고 확장만 뺀 glb)
 - 면 수 그대로, 기본색만 4096/2048/1024 JPEG 92, metallic 0.1·roughness 0.8, KHR_mesh_quantization(위치 float · 노멀 int8 · UV float · 인덱스 u16)
 - 풍차: 조각 54개를 몸통·날개(windBlades 노드: 허브 중심 피벗, 로컬 z = 날개 축) 두 메시로 합침
 - 다음에 등불·수조 발광: tools/glow_mask.py (README의 명령)
필요: numpy, Pillow"""
import json, struct, numpy as np
def read_glb(path):
    b=open(path,"rb").read(); n=struct.unpack("<I",b[12:16])[0]
    return json.loads(b[20:20+n]), bytearray(b[20+n+8:20+n+8+struct.unpack("<I",b[20+n:24+n])[0]])
def acc(j,binb,i):
    a=j["accessors"][i]; bv=j["bufferViews"][a["bufferView"]]
    dt=np.dtype({5126:"<f4",5120:"i1",5121:"u1",5122:"<i2",5123:"<u2",5125:"<u4"}[a["componentType"]]); nc={"VEC3":3,"VEC2":2,"SCALAR":1,"VEC4":4}[a["type"]]
    off=bv.get("byteOffset",0)+a.get("byteOffset",0); st=bv.get("byteStride") or dt.itemsize*nc
    raw=np.frombuffer(bytes(binb),"u1",st*(a["count"]-1)+dt.itemsize*nc,off)
    arr=raw[np.arange(a["count"])[:,None]*st+np.arange(dt.itemsize*nc)[None,:]].copy().view(dt).reshape(a["count"],nc).astype("f8")
    if a.get("normalized"): arr/= {5120:127,5121:255,5122:32767,5123:65535}[a["componentType"]]
    return arr
def image_bytes(j,binb,k=0):
    bv=j["bufferViews"][j["images"][k]["bufferView"]]; o=bv.get("byteOffset",0); return bytes(binb[o:o+bv["byteLength"]])

import sys, io, json, struct, numpy as np
from PIL import Image
OUT, WM_SRC, AQ_SRC = sys.argv[1:4]
MAT = lambda name: {"pbrMetallicRoughness": {"metallicFactor": 0.1, "roughnessFactor": 0.8, "baseColorTexture": {"index": 0, "texCoord": 0}}, "name": name}
SAMPLER = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}]

def jpeg(img, n):
    im = img if img.size[0] == n else img.resize((n, n), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, "JPEG", quality=92); return b.getvalue()

def write(path, j, views):
    """views: [(bytes, stride or None, target or None)] → bufferViews 순서대로"""
    binb = bytearray(); j["bufferViews"] = []
    for data, st, tg in views:
        while len(binb) % 4: binb += b"\0"
        bv = {"buffer": 0, "byteOffset": len(binb), "byteLength": len(data)}
        if st: bv["byteStride"] = st
        if tg: bv["target"] = tg
        j["bufferViews"].append(bv); binb += data
    while len(binb) % 4: binb += b"\0"
    j["buffers"] = [{"byteLength": len(binb)}]
    js = json.dumps(j, separators=(",", ":"), ensure_ascii=False).encode(); js += b" " * (-len(js) % 4)
    open(path, "wb").write(struct.pack("<III", 0x46546C67, 2, 28 + len(js) + len(binb)) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(binb), 0x004E4942) + bytes(binb))

def prim_views(pos, nrm, uv, idx, base):
    """KHR_mesh_quantization 형식(다른 소품과 같음): 위치 float, 노멀 int8 정규화(4바이트 칸), UV float, 인덱스 u16"""
    if nrm.dtype == np.int8: n8 = nrm
    else:
      n8 = np.zeros((len(nrm), 4), "i1"); nn = nrm / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9); n8[:, :3] = np.clip(np.round(nn * 127), -127, 127)
    assert len(pos) < 65536
    views = [(pos.astype("<f4").tobytes(), 12, 34962), (n8.tobytes(), 4, 34962), (uv.astype("<f4").tobytes(), 8, 34962), (idx.astype("<u2").tobytes(), None, 34963)]
    accs = [{"bufferView": base, "byteOffset": 0, "componentType": 5126, "count": len(pos), "type": "VEC3", "min": pos.min(0).tolist(), "max": pos.max(0).tolist()},
            {"bufferView": base + 1, "byteOffset": 0, "componentType": 5120, "count": len(pos), "type": "VEC3", "normalized": True},
            {"bufferView": base + 2, "byteOffset": 0, "componentType": 5126, "count": len(pos), "type": "VEC2"},
            {"bufferView": base + 3, "byteOffset": 0, "componentType": 5123, "count": len(idx), "type": "SCALAR"}]
    return views, accs

def merge(parts):
    P, N, U, I, o = [], [], [], [], 0
    for p, n, u, i in parts: P.append(p); N.append(n); U.append(u); I.append(i + o); o += len(p)
    return np.vstack(P), np.vstack(N), np.vstack(U), np.concatenate(I)

# ---------- 풍차 ----------
BLADES = [1, 8, 9, 10, 11, 25, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 53]   # 날개 틀·돛 4장·허브·끝 장식(금빛 마개)
HUB = np.array([0.0005, 0.6560, 0.2252])          # 바깥 마개 8개·안쪽 마개 8개의 원 중심(x, y) · 날개 면 z
j, b = read_glb(WM_SRC)
body, blades = [], []
for nd in j["nodes"][:54]:
    pr = j["meshes"][nd["mesh"]]["primitives"][0]; t = np.array(nd.get("translation", [0, 0, 0]))
    part = (acc(j, b, pr["attributes"]["POSITION"]) + t, acc(j, b, pr["attributes"]["NORMAL"]), acc(j, b, pr["attributes"]["TEXCOORD_0"]), acc(j, b, pr["indices"]).ravel().astype(int))
    (blades if int(nd["name"].split("_")[-1]) in BLADES else body).append(part)
# 날개 회전축: 마개 16개가 놓인 면의 법선(거의 +z, 0.3° 기욺) → 노드 회전으로 축을 로컬 z에 맞춤(views.js가 rotation.z를 돌림)
ax = np.array([0.00519, -0.00438, 0.99998]); ax /= np.linalg.norm(ax)
zz = np.array([0, 0, 1.0]); v = np.cross(zz, ax); s = np.linalg.norm(v); c = zz @ ax
K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); R = np.eye(3) + K + K @ K * ((1 - c) / s**2)   # z → ax
q = np.array([*(v / s * np.sin(np.arccos(c) / 2)), np.cos(np.arccos(c) / 2)])
bp, bn, bu, bi = merge(blades); bp = (bp - HUB) @ R; bn = bn @ R   # R^T 적용(행 벡터)
mp, mn, mu, mi = merge(body)
img = Image.open(io.BytesIO(image_bytes(j, b))).convert("RGB")
print("windmill body tris", len(mi) // 3, "verts", len(mp), "/ blades tris", len(bi) // 3, "verts", len(bp), "/ total tris", (len(mi) + len(bi)) // 3)
for tag, n in (("4k", 4096), ("2k", 2048), ("1k", 1024)):
    v0, a0 = prim_views(mp, mn, mu, mi, 1); v1, a1 = prim_views(bp, bn, bu, bi, 5)
    for a in a1: a["bufferView"] = a["bufferView"]
    jj = {"asset": {"version": "2.0", "generator": "gmm windmill import (Tripo windmill_3d_model.glb)"}, "extensionsUsed": ["KHR_mesh_quantization"], "extensionsRequired": ["KHR_mesh_quantization"],
          "accessors": a0 + a1, "images": [{"mimeType": "image/jpeg", "bufferView": 0}], "textures": [{"sampler": 0, "source": 0}], "samplers": SAMPLER,
          "materials": [MAT("windmill"), MAT("windBladesMat")],
          "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "material": 0}]},
                     {"primitives": [{"attributes": {"POSITION": 4, "NORMAL": 5, "TEXCOORD_0": 6}, "indices": 7, "material": 1}]}],
          "nodes": [{"name": "windmill", "children": [1, 2]}, {"name": "windmillBody", "mesh": 0},
                    {"name": "windBlades", "mesh": 1, "translation": HUB.tolist(), "rotation": q.tolist()}],
          "scenes": [{"nodes": [0]}], "scene": 0}
    write(f"{OUT}/windmill_{tag}.glb", jj, [(jpeg(img, n), None, None)] + v0 + v1)

# ---------- 수족관 ----------
j, b = read_glb(AQ_SRC); pr = j["meshes"][0]["primitives"][0]
pos, uv = (acc(j, b, pr["attributes"][k]) for k in ("POSITION", "TEXCOORD_0")); idx = acc(j, b, pr["indices"]).ravel().astype(int)
nb = j["bufferViews"][j["accessors"][pr["attributes"]["NORMAL"]]["bufferView"]]; assert nb["byteStride"] == 4
nrm = np.frombuffer(bytes(b[nb.get("byteOffset", 0):nb.get("byteOffset", 0) + nb["byteLength"]]), "i1").reshape(-1, 4)   # 노멀 원본 바이트 그대로
img = Image.open(io.BytesIO(image_bytes(j, b))).convert("RGB")
print("aquarium tris", len(idx) // 3, "verts", len(pos))
for tag, n in (("4k", 4096), ("2k", 2048), ("1k", 1024)):
    v0, a0 = prim_views(pos, nrm, uv, idx, 1)
    jj = {"asset": {"version": "2.0", "generator": "gltfpack 1.2"}, "extensionsUsed": ["KHR_mesh_quantization"], "extensionsRequired": ["KHR_mesh_quantization"],
          "accessors": a0, "images": [{"mimeType": "image/jpeg", "bufferView": 0}], "textures": [{"sampler": 0, "source": 0}], "samplers": SAMPLER,
          "materials": [MAT(j["materials"][0]["name"])], "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "material": 0}]}],
          "nodes": [{"name": j["nodes"][0]["name"], "mesh": 0}], "scenes": [{"nodes": [0]}], "scene": 0}
    write(f"{OUT}/aquarium_{tag}.glb", jj, [(jpeg(img, n), None, None)] + v0)
