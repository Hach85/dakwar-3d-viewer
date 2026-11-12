"""Export the approved scene and its viewer configuration without editing the blend."""
import json
import math
from pathlib import Path
import tempfile
import struct

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "turntable"
SOURCE = ROOT / "Dakwar_V3_Stage08B.blend"
MODEL = "dakwar-turntable-v1.0.glb"


def xyz(vector):
    x, y, z = vector
    return [round(x, 6), round(z, 6), round(-y, 6)]


def main():
    OUT.mkdir(exist_ok=True)
    tempfile.tempdir = str(OUT)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    modes = {}
    for key in ("day", "evening"):
        scene = bpy.data.scenes[f"Stage 08 | {key.title()}"]
        lights = []
        for obj in scene.objects:
            if obj.type != "LIGHT" or obj.hide_render:
                continue
            source = obj.data
            lights.append(dict(
                type={"SUN": "directional", "AREA": "spot", "SPOT": "spot"}.get(source.type, "point"),
                intensity=source.energy * (1 if source.type == "SUN" else .23),
                color=list(source.color), position=xyz(obj.matrix_world.translation),
                direction=xyz(obj.matrix_world.to_quaternion() @ Vector((0, 0, -1))),
            ))
        modes[key] = dict(label=key.title(), exposure=scene.view_settings.exposure,
                          hemisphere=dict(sky="#ece8dc", ground="#625044",
                                          intensity=.55 if key == "day" else .32), lights=lights)
    scene = bpy.data.scenes["Stage 08 | Day"]
    bpy.context.window.scene = scene
    camera = scene.camera
    origin = camera.matrix_world.translation
    target = origin + camera.matrix_world.to_quaternion() @ Vector((0, 0, -5))
    config = dict(title="Dakwar Turntable V1.0", model=MODEL, scale=1, rotation=[0, 0, 0],
                  camera=dict(position=xyz(origin), target=xyz(target), embedded=camera.name),
                  presets=[dict(label=label, direction=direction) for label, direction in (
                      ("Overview", [1, .65, 1]), ("Front", [0, .25, 1]),
                      ("Side", [1, .25, 0]), ("Top", [0, 1, .001]))],
                  lighting=modes, defaultMode="day", cutaway=dict(enabled=True, height=.7), lightmaps=[])
    assert bpy.ops.export_scene.gltf(filepath=str(OUT/MODEL), export_format="GLB",
        use_active_scene=True, export_cameras=True, export_lights=False, export_extras=True,
        export_texcoords=True) == {"FINISHED"}
    with (OUT/MODEL).open("rb") as model:
        model.seek(12)
        length, chunk = struct.unpack("<I4s", model.read(8))
        assert chunk == b"JSON"
        exported = json.loads(model.read(length))
    camera_export = next(item for item in exported["cameras"] if item["name"] == camera.name)
    config["camera"]["fov"] = math.degrees(camera_export["perspective"]["yfov"])
    (OUT/"model.json").write_text(json.dumps(config, indent=2)+"\n", encoding="utf-8")


if __name__ == "__main__":
    main()
