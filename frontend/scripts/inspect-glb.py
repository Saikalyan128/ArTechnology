#!/usr/bin/env python3
"""Inspect a GLB file header/JSON chunk (no external deps)."""
from pathlib import Path
import json
import struct
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else
            "assets/3D_motion/boccia_titanium_wrist_watch__animatable.glb")
data = path.read_bytes()
print("path", path)
print("size_bytes", len(data))
print("size_mb", round(len(data) / (1024 * 1024), 2))

magic, version, length = struct.unpack_from("<4sII", data, 0)
print("magic", magic, "glb_version", version, "declared_length", length)

chunk_len, chunk_type = struct.unpack_from("<I4s", data, 12)
print("json_chunk_len", chunk_len, "type", chunk_type)
js = data[20:20 + chunk_len].decode("utf-8").rstrip(" \x00")
g = json.loads(js)

asset = g.get("asset") or {}
print("gltf_version", asset.get("version"))
print("generator", asset.get("generator"))
print("copyright", asset.get("copyright"))

for k in ["scenes", "nodes", "meshes", "materials", "textures",
          "images", "animations", "skins", "cameras", "accessors"]:
    print(k, len(g.get(k) or []))

print("extensionsUsed", g.get("extensionsUsed"))
print("extensionsRequired", g.get("extensionsRequired"))

anims = g.get("animations") or []
accessors = g.get("accessors") or []
for i, a in enumerate(anims):
    name = a.get("name") or ("clip_" + str(i))
    ch = len(a.get("channels") or [])
    max_t = 0.0
    for s in a.get("samplers") or []:
        inp = s.get("input")
        if inp is None:
            continue
        mx = (accessors[inp] or {}).get("max")
        if mx:
            max_t = max(max_t, float(mx[0]))
    print("anim", i, "name=", name, "channels=", ch, "duration_s=", round(max_t, 3))

nodes = g.get("nodes") or []
names = [n.get("name") for n in nodes if n.get("name")]
print("named_nodes", len(names))
print("sample_nodes", names[:30])
print("mesh_names", [m.get("name") for m in (g.get("meshes") or [])][:25])
print("material_names", [m.get("name") for m in (g.get("materials") or [])][:25])

prims = 0
for m in g.get("meshes") or []:
    prims += len(m.get("primitives") or [])
print("mesh_primitives", prims)
print("has_skins", bool(g.get("skins")))
print("top_keys", sorted(g.keys()))
