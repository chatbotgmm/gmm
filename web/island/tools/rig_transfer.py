# 사용법: <blender python> tools/rig_transfer.py -- <뼈대 있는 갈매미.glb> <새 모델.glb> <결과.glb> <Z축 회전(라디안, Tripo 모델은 -1.5708)>
# 기존 갈매미(gmm_char1)의 뼈대·동작 11개를 새 모델에 옮겨 심기
import bpy, sys, bmesh
from mathutils import Vector, Matrix
base, src, dst, rotz = sys.argv[-4], sys.argv[-3], sys.argv[-2], float(sys.argv[-1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=base)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
old = next(o for o in bpy.context.scene.objects if o.type == "MESH" and o.vertex_groups)
for o in list(bpy.context.scene.objects):
    if o.type == "MESH" and o is not old: bpy.data.objects.remove(o)          # 떠 있는 Icosphere 등
before = set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=src)
new = next(o for o in bpy.context.scene.objects if o not in before and o.type == "MESH")
for o in list(bpy.context.scene.objects):
    if o not in before and o is not new and o.type != "MESH": pass
# 새 메쉬: 부모 풀고 변환 적용, 앞을 맞춰 돌림
bpy.ops.object.select_all(action="DESELECT"); new.select_set(True); bpy.context.view_layer.objects.active = new
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True); new.rotation_mode = "XYZ"; new.rotation_euler = (0, 0, rotz); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
def bbox(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]; return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])
nmin, nmax = bbox(new); omin, omax = bbox(old)
# 새 메쉬를 발바닥 0, 가운데 0으로
off = Vector(((nmin.x + nmax.x) / 2, (nmin.y + nmax.y) / 2, nmin.z)); new.location -= off
bpy.ops.object.transform_apply(location=True)
nmin, nmax = bbox(new)
oc = Vector(((omin.x + omax.x) / 2, (omin.y + omax.y) / 2, omin.z))
s = Vector([(nmax[i] - nmin[i]) / (omax[i] - omin[i]) for i in range(3)])
print("SCALE", [round(v, 3) for v in s])
# 뼈대(+옛 메쉬)를 새 메쉬 크기로 늘림
bpy.ops.object.select_all(action="DESELECT"); arm.select_set(True); old.select_set(True); bpy.context.view_layer.objects.active = arm
arm.location = -Vector((oc.x * s.x, oc.y * s.y, oc.z * s.z)); arm.scale = s
bpy.ops.object.transform_apply(location=True, scale=True)
# 옛 메쉬 무게 → 새 메쉬(가까운 면 보간)
bpy.ops.object.select_all(action="DESELECT"); new.select_set(True); bpy.context.view_layer.objects.active = new
for g in old.vertex_groups: new.vertex_groups.new(name=g.name)
m = new.modifiers.new("wt", "DATA_TRANSFER"); m.object = old; m.use_vert_data = True; m.data_types_verts = {"VGROUP_WEIGHTS"}; m.vert_mapping = "POLYINTERP_NEAREST"
m.layers_vgroup_select_src = "ALL"; m.layers_vgroup_select_dst = "NAME"
bpy.ops.object.modifier_apply(modifier=m.name)
unw = sum(1 for v in new.data.vertices if not any(g.weight > 1e-4 for g in v.groups)); print("UNWEIGHTED", unw, "/", len(new.data.vertices))
bpy.data.objects.remove(old)
new.parent = arm; md = new.modifiers.new("Armature", "ARMATURE"); md.object = arm
# 텍스처: 기본색만 1024로(노멀·금속도 빼서 가볍게)
for mat in new.data.materials:
    nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    for name in ("Normal", "Metallic", "Roughness"):
        for l in list(bsdf.inputs[name].links): nt.links.remove(l)
    bsdf.inputs["Metallic"].default_value = 0; bsdf.inputs["Roughness"].default_value = 0.85
    for n in nt.nodes:
        if n.type == "TEX_IMAGE" and n.image and max(n.image.size) > 1024: n.image.scale(1024, 1024)
new.name = "body"
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_image_format="JPEG", export_jpeg_quality=85, export_animations=True, export_skins=True, export_def_bones=False)
print("DONE")
