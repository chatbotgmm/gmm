#!/usr/bin/env python3
"""건물 모델의 등불 유리에 발광 마스크를 넣는다(가로등 lampBody와 같은 방식: glb 안의 emissiveTexture).
사용: python3 tools/glow_mask.py <모델 이름> "x,y,z[,반지름]" ["x,y,z" ...] [--pane v0,v1,g0,g1] [--tanks k] [--out 폴더] [--preview 그림.png]
 - 좌표는 모델(메시) 좌표의 등불 중심. 그 둘레(기본 반지름 0.075) 안에서 밝은 노란 유리 텍셀만 고름(금빛 지붕 장식·창틀은 거리로 빠짐)
 - assets/props/<이름>_{4k,2k,1k}.glb 세 단계 모두에 같은 512px 회색 PNG 마스크를 넣고, 재질 이름을 lanternGlow로,
   재질 extras.lanterns에 등불 중심·크기([x, y, z, 지름])를 적음(render/assets.js가 빛 번짐을 붙이는 자리)
 - 이미 마스크가 든 파일에 다시 돌리면 마스크를 새로 바꿈
 - --tanks k[,ymax]: 청록빛 수조 유리(텍스처에서 색으로 고름)도 제 색 × k(선형 밝기)로 빛나게(수족관). 이때 마스크는 색 PNG — 등불 텍셀에 따뜻한 색을 넣고 emissiveFactor는 [1, 1, 1].
   세기는 등불과 같이 daylight.js lantern()이 정함(낮 0.15 → 밤 2.35, 전기가 닿을 때만) — k 0.45면 낮에는 거의 안 보이고 밤에 물빛으로 빛남
필요: numpy, Pillow, scipy"""
import io, json, struct, sys
import numpy as np
from PIL import Image
from scipy import ndimage

PROPS = __file__.rsplit("/", 2)[0] + "/assets/props/"
MASK = 512          # 마스크 한 변
WORK = 2048         # 고를 때 쓰는 해상도(줄이면서 가장자리가 부드러워짐)
PANE = (0.80, 0.93, 0.66, 0.76)   # 유리로 보는 문턱: 밝기(max) 아래·위, 초록/빨강 비 아래·위 — 유리가 어둡게 그려진 모델은 --pane으로 낮춤
EMISSIVE = [1, 0.5775804404214573, 0.16202937562896222]   # 가로등과 같은 따뜻한 색

def read_glb(path):
    b = open(path, "rb").read(); n = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20:20 + n]), bytearray(b[20 + n + 8:20 + n + 8 + struct.unpack("<I", b[20 + n:24 + n])[0]])

def write_glb(path, j, binb):
    binb = bytes(binb) + b"\0" * (-len(binb) % 4); j["buffers"][0]["byteLength"] = len(binb)
    js = json.dumps(j, separators=(",", ":"), ensure_ascii=False).encode(); js += b" " * (-len(js) % 4)
    open(path, "wb").write(struct.pack("<III", 0x46546C67, 2, 28 + len(js) + len(binb)) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(binb), 0x004E4942) + binb)

def accessor(j, binb, i):
    a = j["accessors"][i]; bv = j["bufferViews"][a["bufferView"]]
    dt = np.dtype({5126: "<f4", 5120: "i1", 5121: "u1", 5122: "<i2", 5123: "<u2", 5125: "<u4"}[a["componentType"]]); nc = {"VEC3": 3, "VEC2": 2, "SCALAR": 1}[a["type"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0); st = bv.get("byteStride") or dt.itemsize * nc
    raw = np.frombuffer(binb, "u1", st * (a["count"] - 1) + dt.itemsize * nc, off)
    arr = raw[np.arange(a["count"])[:, None] * st + np.arange(dt.itemsize * nc)[None, :]].copy().view(dt).reshape(a["count"], nc).astype("f8")
    if a.get("normalized"): arr /= {5120: 127, 5121: 255, 5122: 32767, 5123: 65535}[a["componentType"]]
    return arr

def base_image(j, binb):
    im = j["images"][j["textures"][j["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]["index"]]["source"]]; bv = j["bufferViews"][im["bufferView"]]
    return Image.open(io.BytesIO(bytes(binb[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]))).convert("RGB")

def position_map(pos, uv, idx, n, centers):
    """텍셀마다 모델 좌표(등불 둘레 삼각형만 칠함)"""
    pm = np.full((n, n, 3), np.nan)
    near = np.zeros(len(pos), bool)
    for c in centers: near |= np.linalg.norm(pos - c[:3], axis=1) < c[3] * 2.5
    for t in idx[near[idx].any(1)]:
        u = uv[t] * n - 0.5; p = pos[t]
        x0, x1 = max(int(np.floor(u[:, 0].min())), 0), min(int(np.ceil(u[:, 0].max())), n - 1); y0, y1 = max(int(np.floor(u[:, 1].min())), 0), min(int(np.ceil(u[:, 1].max())), n - 1)
        d = (u[1, 1] - u[2, 1]) * (u[0, 0] - u[2, 0]) + (u[2, 0] - u[1, 0]) * (u[0, 1] - u[2, 1])
        if x1 < x0 or y1 < y0 or abs(d) < 1e-12: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        a = ((u[1, 1] - u[2, 1]) * (xs - u[2, 0]) + (u[2, 0] - u[1, 0]) * (ys - u[2, 1])) / d; b = ((u[2, 1] - u[0, 1]) * (xs - u[2, 0]) + (u[0, 0] - u[2, 0]) * (ys - u[2, 1])) / d; c = 1 - a - b
        m = (a >= -0.05) & (b >= -0.05) & (c >= -0.05)
        pm[ys[m], xs[m]] = a[m][:, None] * p[0] + b[m][:, None] * p[1] + c[m][:, None] * p[2]
    return pm

def smooth(lo, hi, x): t = np.clip((x - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t)

def srgb(x): x = np.clip(x, 0, 1); return np.where(x <= 0.0031308, 12.92 * x, 1.055 * x ** (1 / 2.4) - 0.055)
def linear(x): return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)

def tank_mask(rgb, pm, ymax):
    """청록 수조 유리: 초록·파랑이 밝고 빨강보다 뚜렷이 큼(흰 벽·금빛·남색 띠는 빠짐). 모델이 실제로 쓰는 텍셀(pm)이면서 높이 ymax 아래만
    (텍스처 가장자리의 번진 틈 색·지붕 쪽 청록 얼룩은 빠짐)"""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return smooth(0.45, 0.6, np.minimum(g, b)) * smooth(0.12, 0.25, np.minimum(g, b) - r) * (np.nan_to_num(pm[..., 1], nan=9) < ymax)

def make_mask(name, centers, th=PANE, tanks=0, ymax=9):
    j, binb = read_glb(f"{PROPS}{name}_4k.glb"); pr = j["meshes"][0]["primitives"][0]
    pos, uv, idx = accessor(j, binb, pr["attributes"]["POSITION"]), accessor(j, binb, pr["attributes"]["TEXCOORD_0"]), accessor(j, binb, pr["indices"]).reshape(-1, 3).astype(int)
    rgb = np.asarray(base_image(j, binb).resize((WORK, WORK), Image.LANCZOS)).astype("f8") / 255
    pm = position_map(pos, uv, idx, WORK, centers)
    v = rgb.max(2); sat = (v - rgb.min(2)) / np.maximum(v, 1e-6); gr = rgb[..., 1] / np.maximum(rgb[..., 0], 1e-6)
    pane = smooth(th[0], th[1], v) * smooth(th[2], th[3], gr) * smooth(0.20, 0.34, sat)    # 밝고 노란 유리(주황 갈색 틀·흰 벽·흰 뚜껑은 빠짐)
    w = np.zeros((WORK, WORK)); found = []
    for c in centers:
        dist = np.linalg.norm(np.nan_to_num(pm, nan=1e9) - c[:3], axis=2); k = pane * (dist < c[3])
        base = k > 0.5; lab, n = ndimage.label(ndimage.binary_fill_holes(base) & ~base)     # 유리 한가운데 하얗게 바랜 곳(채도가 낮아 빠진 작은 구멍)을 메움
        if n: k = np.maximum(k, (np.isin(lab, 1 + np.flatnonzero(np.bincount(lab.ravel())[1:] < base.sum() * 0.25)) & (v > th[0]) & (dist < c[3])) * 1.0)
        w = np.maximum(w, k)
        sel = k > 0.5; p = pm[sel]
        if not len(p): raise SystemExit(f"{name}: {c} 둘레에 등불 유리가 없음")
        cen = (p.min(0) + p.max(0)) / 2; found.append([round(float(x), 4) for x in cen] + [round(float(np.linalg.norm(p.max(0) - p.min(0))), 4)])
    if tanks:                                                   # 색 마스크: 등불 = 따뜻한 색(emissiveFactor가 하던 몫), 수조 = 제 색 × tanks
        t = tank_mask(rgb, position_map(pos, uv, idx, WORK, [np.array([0, 0, 0, 99])]), ymax) * (w < 0.5); col = linear(rgb) * tanks * t[..., None] + np.array(EMISSIVE) * w[..., None]
        mask = Image.fromarray((srgb(col) * 255).round().astype("u1"), "RGB").resize((MASK, MASK), Image.BOX)
        return mask, found, rgb
    mask = Image.fromarray((w * 255).round().astype("u1")).resize((MASK, MASK), Image.BOX)
    return mask, found, rgb

def embed(path, png, lanterns, factor=EMISSIVE):
    j, binb = read_glb(path); m = j["materials"][0]
    if "emissiveTexture" in m:                                  # 다시 돌릴 때: 전에 넣은 마스크(파일 맨 끝)를 떼고 새로
        tx = j["textures"].pop(m["emissiveTexture"]["index"]); im = j["images"].pop(tx["source"]); bv = j["bufferViews"].pop(im["bufferView"])
        assert m["emissiveTexture"]["index"] == len(j["textures"]) and tx["source"] == len(j["images"]) and im["bufferView"] == len(j["bufferViews"]) and bv["byteOffset"] + bv["byteLength"] >= len(binb) - 3, "마스크가 맨 끝이 아님"
        del binb[bv["byteOffset"]:]
    binb += b"\0" * (-len(binb) % 4)
    j["bufferViews"].append({"buffer": 0, "byteOffset": len(binb), "byteLength": len(png)}); binb += png
    j["images"].append({"mimeType": "image/png", "bufferView": len(j["bufferViews"]) - 1})
    j["textures"].append({"sampler": j["textures"][0].get("sampler", 0), "source": len(j["images"]) - 1})
    m.update(name="lanternGlow", emissiveFactor=factor, emissiveTexture={"index": len(j["textures"]) - 1, "texCoord": 0}, extras={"lanterns": lanterns})
    write_glb(path, j, binb)

def main():
    args = sys.argv[1:]; opt = {}
    for k in ("--preview", "--out", "--pane", "--tanks"):
        if k in args: i = args.index(k); opt[k] = args[i + 1]; del args[i:i + 2]
    name = args[0]; centers = [np.array(([float(x) for x in a.split(",")] + [0.075])[:4]) for a in args[1:]]
    tk = [float(x) for x in opt.get("--tanks", "0").split(",")]; tanks = tk[0]
    mask, lanterns, rgb = make_mask(name, centers, tuple(float(x) for x in opt["--pane"].split(",")) if "--pane" in opt else PANE, tanks, tk[1] if len(tk) > 1 else 9)
    buf = io.BytesIO(); mask.save(buf, "PNG", optimize=True); png = buf.getvalue()
    lit = int((np.asarray(mask.convert("L")) > 127).sum())
    print(f"{name}: 마스크 {MASK}px PNG {len(png)} bytes, 밝은 텍셀 {lit}개, 등불 {lanterns}")
    if "--preview" in opt:                                      # 텍스처 위에 마스크를 자홍색으로 얹은 그림(확인용)
        big = np.asarray(mask.convert("L").resize((WORK, WORK), Image.BILINEAR)).astype("f8")[..., None] / 255
        if tanks: big = np.minimum(1, big * 3)
        Image.fromarray(((rgb * 0.6 * (1 - big) + np.array([1, 0, 1]) * big) * 255).astype("u1")).save(opt["--preview"])
    if "--out" in opt: mask.save(f"{opt['--out']}/{name}_mask.png")
    for t in ("4k", "2k", "1k"): embed(f"{PROPS}{name}_{t}.glb", png, lanterns, [1, 1, 1] if tanks else EMISSIVE)

if __name__ == "__main__": main()
