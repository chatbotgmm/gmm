#!/usr/bin/env python3
"""한 메시짜리 사용자 소품 모델(meshopt를 푼 glb)을 게임 소품 형식으로: <이름>_4k / 2k / 1k.glb (assets/props/README.md 방침).
사용: python3 tools/import_prop.py <이름> <tools/demopt.mjs로 푼 glb> <출력 폴더>
 - 면 수 그대로(정점·면·UV 값 그대로, 노멀은 원본 int8 바이트 그대로)
 - 기본색만 4096 / 2048 / 1024px JPEG 92(원본이 더 크면 줄이고, 작으면 키우지 않음), metallic 0.1 · roughness 0.8, 노멀·금속도 텍스처 없음 · doubleSided 뺌
 - KHR_mesh_quantization(위치 float · 노멀 int8 · UV float · 인덱스 u16) — import_windmill_aquarium.py의 수족관과 같은 형식
필요: numpy, Pillow"""
import io, json, struct, sys
import numpy as np
from PIL import Image

def read_glb(path):
    b = open(path, "rb").read(); n = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20:20 + n]), bytearray(b[20 + n + 8:20 + n + 8 + struct.unpack("<I", b[20 + n:24 + n])[0]])

def acc(j, binb, i):
    a = j["accessors"][i]; bv = j["bufferViews"][a["bufferView"]]
    dt = np.dtype({5126: "<f4", 5120: "i1", 5121: "u1", 5122: "<i2", 5123: "<u2", 5125: "<u4"}[a["componentType"]]); nc = {"VEC3": 3, "VEC2": 2, "SCALAR": 1, "VEC4": 4}[a["type"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0); st = bv.get("byteStride") or dt.itemsize * nc
    raw = np.frombuffer(bytes(binb), "u1", st * (a["count"] - 1) + dt.itemsize * nc, off)
    arr = raw[np.arange(a["count"])[:, None] * st + np.arange(dt.itemsize * nc)[None, :]].copy().view(dt).reshape(a["count"], nc).astype("f8")
    if a.get("normalized"): arr /= {5120: 127, 5121: 255, 5122: 32767, 5123: 65535}[a["componentType"]]
    return arr

def write(path, j, views):
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

def main():
    name, src, out = sys.argv[1:4]
    j, b = read_glb(src); pr = j["meshes"][0]["primitives"][0]
    pos, uv = (acc(j, b, pr["attributes"][k]) for k in ("POSITION", "TEXCOORD_0")); idx = acc(j, b, pr["indices"]).ravel().astype(int)
    nb = j["bufferViews"][j["accessors"][pr["attributes"]["NORMAL"]]["bufferView"]]; assert nb["byteStride"] == 4 and len(pos) < 65536
    nrm = bytes(b[nb.get("byteOffset", 0):nb.get("byteOffset", 0) + nb["byteLength"]])
    bv = j["bufferViews"][j["images"][0]["bufferView"]]; o = bv.get("byteOffset", 0)
    img = Image.open(io.BytesIO(bytes(b[o:o + bv["byteLength"]]))).convert("RGB")
    print(name, "tris", len(idx) // 3, "verts", len(pos), "texture", img.size)
    for tag, n in (("4k", 4096), ("2k", 2048), ("1k", 1024)):
        n = min(n, img.size[0]); im = img if img.size[0] == n else img.resize((n, n), Image.LANCZOS)
        jb = io.BytesIO(); im.save(jb, "JPEG", quality=92)
        views = [(jb.getvalue(), None, None), (pos.astype("<f4").tobytes(), 12, 34962), (nrm, 4, 34962), (uv.astype("<f4").tobytes(), 8, 34962), (idx.astype("<u2").tobytes(), None, 34963)]
        accs = [{"bufferView": 1, "componentType": 5126, "count": len(pos), "type": "VEC3", "min": pos.min(0).tolist(), "max": pos.max(0).tolist()},
                {"bufferView": 2, "componentType": 5120, "count": len(pos), "type": "VEC3", "normalized": True},
                {"bufferView": 3, "componentType": 5126, "count": len(pos), "type": "VEC2"},
                {"bufferView": 4, "componentType": 5123, "count": len(idx), "type": "SCALAR"}]
        jj = {"asset": {"version": "2.0", "generator": f"gmm import_prop.py ({name})"}, "extensionsUsed": ["KHR_mesh_quantization"], "extensionsRequired": ["KHR_mesh_quantization"],
              "accessors": accs, "images": [{"mimeType": "image/jpeg", "bufferView": 0}], "textures": [{"sampler": 0, "source": 0}],
              "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
              "materials": [{"pbrMetallicRoughness": {"metallicFactor": 0.1, "roughnessFactor": 0.8, "baseColorTexture": {"index": 0, "texCoord": 0}}, "name": name}],
              "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "material": 0}]}],
              "nodes": [{"name": name, "mesh": 0}], "scenes": [{"nodes": [0]}], "scene": 0}
        write(f"{out}/{name}_{tag}.glb", jj, views)

if __name__ == "__main__":
    main()
