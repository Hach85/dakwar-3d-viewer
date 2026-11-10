# Turntable V1.0 production workflow

1. Inspect the source model in its authoring application. Verify unit scale, transforms, normals, material assignments, texture dependencies, UV sets and the intended view. Record evaluated triangle and texture counts. For a professional source, retain its authored geometry and PBR materials.
2. Export a self-contained glTF 2.0 GLB with material textures and all required UV sets. For Blender, enable camera export if a specific lens is required. The Dakwar source export is reproducible with Blender 5.2 using `-b --python-exit-code 1 --python tools/blender/export_turntable.py`. It reads Stage 08B and writes the versioned GLB and its configuration.
3. Inspect the file with `python tools/inspect_turntable_glb.py path/to/model.glb`. It checks the GLB container, embedded buffers and images, and position and triangle metadata. Run a dedicated glTF validator for a full conformance check and inspect the model in the browser. To compare exports that should be identical, use `--compare approved.glb`.
4. Create a standalone folder with `python tools/inspect_turntable_glb.py path/to/model.glb --viewer-dir preview`. The viewer frames the transformed bounds using the camera field of view and viewport aspect when an explicit starting pose is absent. Review the default presets and add asset-specific presets through configuration.
5. Set up lighting and exposure at the desired starting values. The viewer supports named rigs with hemisphere, directional, spot and point lights. Blender area lights in the Dakwar configuration are represented by spot lights on the web, so their shadow shape and reflection behavior differ from Cycles. Check each lighting mode at its default EV before tuning the presentation.
6. Optimize based on measurements. Start with HTTP gzip or Brotli where supported. A reviewed derivative may resize oversized textures or add a compression format, provided its decoder ships with the viewer. Compare geometry bounds, triangle counts, UV channels, material slots, texture appearance and close views after optimization. Keep data maps linear and normal-map orientation correct. For V1.0 the GLB's geometry and image payloads are preserved exactly.
7. Serve locally over HTTP. Verify model download and console, desktop orbit/pan/zoom, touch gestures, presets/reset, rotation, lighting modes, exposure persistence per mode, cutaway range, and fullscreen. Measure uncached transfer and first rendered frame. Check at least one physical phone before committing to a production performance target. The Dakwar Chrome test runs with `node tools/validate_turntable_browser.mjs`, optionally using `DAKWAR_THREE_PACKAGE` for local r165 modules.
8. Stage the standalone folder on a static host after local review. Serve GLB files as `model/gltf-binary` and versioned assets with long cache lifetimes. Give the HTML and configuration short cache lifetimes. Test the actual staging URL and retain the old version for rollback. Promote only after approval.

## Configuration

The viewer reads `model.json` beside `index.html`. Relative asset paths resolve against the config URL. The renderer uses Y-up Three.js coordinates.

| Key | Meaning |
| --- | --- |
| title, background, model | Display name, CSS color, and relative or absolute GLB URL |
| scale, rotation | Uniform multiplier and XYZ Euler angles in radians |
| camera | Optional world-space position, target and vertical fov in degrees. An embedded camera name can supply fov |
| presets | Entries with a label and a world-space position/target or a direction for automatic bounds framing |
| lighting, defaultMode | Named modes and initially selected key |
| cutaway | enabled, initial active state, and height fraction from model bottom to top |
| lightmaps | Optional array of entries with mesh name, channel, optional intensity, and modes mapping mode keys to RGBE paths |

Each lighting mode accepts a label, exposure in EV, baseExposure multiplier, hemisphere colors and intensity, and an array of direct lights. Direct lights use type, position, color, intensity, optional direction, and spot angle and penumbra. Colors may be CSS strings or linear RGB arrays. Exposure is stored separately for each mode during the session.

Enable baked maps only for receivers with verified chart padding, orientation and channel indices on the exported GLB. The RGBE path expects top-first files and linear irradiance. A baked receiver replaces hemisphere irradiance with the selected map. Use unique mesh names for targets. A cutaway clips all surfaces above a horizontal plane. For an asset without a removable roof presentation, disable the cutaway in configuration.

The Dakwar test asset ships with Stage 08B meshes, PBR data, and distinct Day/Evening runtime rigs. Stage 09A found visible noise, hot spots, or an unresolved chart discontinuity across the pilot receiver set, so the Dakwar config leaves baked maps unassigned.
