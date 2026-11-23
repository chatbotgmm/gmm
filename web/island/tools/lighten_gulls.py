"""갈매미 모델 가볍게 만들기(Blender, 화면 없이). bpy 4.2 파이썬 패키지 또는 `blender -b --python`으로 실행.

  python tools/lighten_gulls.py <원본 폴더> <저장 폴더> [삼각형 비율=0.35] [기본색·노멀 크기=1024] [거칠기 크기=256]

- 삼각형: Decimate(Collapse)로 비율만큼 남김. 뼈대 가중치(꼭짓점 그룹)와 애니메이션은 그대로.
- 텍스처: 기본 색·노멀은 크기를 줄이고, 금속성·거칠기 맵(이 모델들은 금속성 0이라 거칠기만 쓰임)은 더 작게. 모두 JPEG로 저장.
- chars.json(이름·키·속도)은 그대로 복사.
"""
import glob
import json
import os
import shutil
import sys

import bpy


def lighten(src, dst, ratio, tex, rough):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    before = after = 0
    for ob in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        before += sum(len(p.vertices) - 2 for p in ob.data.polygons)
        if ob.data.shape_keys:
            print("  모양 키가 있어 줄이기를 건너뜀:", ob.name)
            continue
        mod = ob.modifiers.new("lighten", "DECIMATE")
        mod.decimate_type = "COLLAPSE"; mod.ratio = ratio; mod.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = ob
        while ob.modifiers[0].name != "lighten":                      # 뼈대(Armature)보다 먼저 적용해야 함
            bpy.ops.object.modifier_move_up(modifier="lighten")
        bpy.ops.object.modifier_apply(modifier="lighten")
        after += sum(len(p.vertices) - 2 for p in ob.data.polygons)
    # 텍스처 크기 줄이기: 어떤 슬롯에 쓰였는지 보고 크기 결정
    roles = {}
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type != "TEX_IMAGE" or not node.image:
                continue
            links = [l.to_socket.name for out in node.outputs for l in out.links]
            role = "rough" if any("Roughness" in n or "Metallic" in n for n in links) or any(
                l.to_node.type == "SEPRGB" or l.to_node.type == "SEPARATE_COLOR" for out in node.outputs for l in out.links) else "main"
            roles[node.image.name] = role if roles.get(node.image.name) != "main" else "main"
    for img in bpy.data.images:
        if img.size[0] == 0:
            continue
        size = rough if roles.get(img.name) == "rough" else tex
        if img.size[0] > size:
            img.scale(size, size)
    bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_image_format="JPEG", export_jpeg_quality=88,
                              export_animations=True, export_skins=True, export_apply=False, export_yup=True)
    return before, after


def main():
    src_dir, dst_dir = sys.argv[1], sys.argv[2]
    ratio = float(sys.argv[3]) if len(sys.argv) > 3 else 0.35
    tex = int(sys.argv[4]) if len(sys.argv) > 4 else 1024
    rough = int(sys.argv[5]) if len(sys.argv) > 5 else 256
    os.makedirs(dst_dir, exist_ok=True)
    for src in sorted(glob.glob(os.path.join(src_dir, "gmm_char*.glb"))):
        dst = os.path.join(dst_dir, os.path.basename(src))
        b, a = lighten(src, dst, ratio, tex, rough)
        print(f"{os.path.basename(src)}: 삼각형 {b} → {a}, 파일 {os.path.getsize(src) // 1024}KB → {os.path.getsize(dst) // 1024}KB")
    if os.path.exists(os.path.join(src_dir, "chars.json")):
        shutil.copy(os.path.join(src_dir, "chars.json"), os.path.join(dst_dir, "chars.json"))


if __name__ == "__main__":
    main()
