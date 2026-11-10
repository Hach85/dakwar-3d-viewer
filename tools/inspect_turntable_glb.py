"""Inspect a self-contained GLB and optionally generate a turntable configuration."""
import argparse
from hashlib import sha256
import json
import math
import os
from shutil import copy2
from pathlib import Path
import struct


def read_glb(path):
    data = path.read_bytes()
    if len(data) < 20 or struct.unpack_from("<4sII", data) != (b"glTF", 2, len(data)):
        raise ValueError("Invalid GLB 2.0 header or byte length")
    size, kind = struct.unpack_from("<I4s", data, 12)
    if kind != b"JSON" or 20 + size > len(data):
        raise ValueError("Missing or truncated JSON chunk")
    document = json.loads(data[20:20+size])
    offset = 20+size
    binary = b""
    if offset < len(data):
        length, kind = struct.unpack_from("<I4s", data, offset)
        if kind != b"BIN\0" or offset+8+length != len(data):
            raise ValueError("Invalid BIN chunk")
        binary = data[offset+8:]
    for buffer in document.get("buffers", []):
        if "uri" in buffer or buffer["byteLength"] > len(binary):
            raise ValueError("Expected embedded buffers")
    for view in document.get("bufferViews", []):
        if view.get("byteOffset", 0)+view["byteLength"] > len(binary):
            raise ValueError("Buffer view exceeds binary data")
    for image in document.get("images", []):
        if "bufferView" not in image:
            raise ValueError("Expected embedded images")
    return document, binary


def summary(path, document):
    meshes = document.get("meshes", [])
    primitives = [p for mesh in meshes for p in mesh["primitives"]]
    if not primitives:
        raise ValueError("Model contains no mesh primitives")
    accessors = document["accessors"]
    materials = document.get("materials", [])
    triangles = 0
    for primitive in primitives:
        position = accessors[primitive["attributes"]["POSITION"]]
        if position["type"] != "VEC3" or not all(math.isfinite(x) for x in position["min"] + position["max"]):
            raise ValueError("Invalid POSITION accessor")
        if "material" in primitive:
            materials[primitive["material"]]
        if primitive.get("mode", 4) == 4:
            count = accessors[primitive["indices"]]["count"] if "indices" in primitive else position["count"]
            if count % 3:
                raise ValueError("Triangle index count is not divisible by three")
            triangles += count // 3
    return dict(file=path.name, bytes=path.stat().st_size, sha256=sha256(path.read_bytes()).hexdigest(),
                meshes=len(meshes), primitives=len(primitives), triangles=triangles,
                materials=[m.get("name", "") for m in materials], images=len(document.get("images", [])),
                extensions=document.get("extensionsUsed", []))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("model", type=Path)
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--config", type=Path)
    output.add_argument("--viewer-dir", type=Path, help="Create a standalone viewer folder with a copy of the model")
    parser.add_argument("--compare", type=Path, help="Verify buffers and render asset tables against an approved export")
    args = parser.parse_args()
    document, binary = read_glb(args.model)
    report = summary(args.model, document)
    if args.compare:
        approved, approved_binary = read_glb(args.compare)
        keys = ("meshes", "materials", "textures", "images", "accessors", "bufferViews", "cameras")
        changed = [key for key in keys if document.get(key) != approved.get(key)]
        if binary != approved_binary or changed:
            raise ValueError(f"Export differs from approved buffers or asset tables: {changed}")
        for node in approved.get("nodes", []):
            if node.get("extras", {}).pop("pilot", None) or node.get("extras", {}).pop("pilotCamera", None):
                if not node["extras"]:
                    node.pop("extras")
        if document.get("nodes") != approved.get("nodes") or document.get("scenes") != approved.get("scenes"):
            raise ValueError("Export differs in scene nodes or transforms")
        report["matched_approved_asset_tables_and_binary"] = args.compare.name
    config_path = args.config
    model_path = args.model
    if args.viewer_dir:
        args.viewer_dir.mkdir()
        template = Path(__file__).resolve().parents[1] / "turntable"
        for name in ("index.html", "viewer.css", "viewer.js"):
            copy2(template/name, args.viewer_dir/name)
        model_path = args.viewer_dir / args.model.name
        copy2(args.model, model_path)
        config_path = args.viewer_dir / "model.json"
    if config_path:
        relative = Path(os.path.relpath(model_path.resolve(), config_path.resolve().parent)).as_posix()
        with config_path.open("x", encoding="utf-8") as output:
            json.dump(dict(title=args.model.stem, model=relative, scale=1, rotation=[0, 0, 0],
                           defaultMode="day", cutaway={"enabled": False}, lightmaps=[]), output, indent=2)
            output.write("\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
