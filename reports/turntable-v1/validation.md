# Turntable V1.0 validation

The web export is 37,889,264 bytes (36.13 MiB). It contains 157 mesh primitives, 95,869 stored triangles, 34 material records and 36 embedded images. A comparison against the independently exported Stage 09A room context verified identical binary payload, asset tables, scene nodes and transforms after removing pilot-only metadata. The source scene and original GLB remain available.

Chrome WebGL 2 on SwiftShader rendered the versioned GLB. On localhost, the GLB transfer took 116 ms and the first frame took 1.61 s from viewer startup. The uncompressed initial resource bodies totaled about 37.56 MiB, excluding the HTML. A local gzip level 6 measurement reduced the model payload to 33,062,452 bytes (31.53 MiB). The GLB retains its original geometry and image data. These loopback timings do not model a production network or physical GPU.

The browser exercised desktop orbit, pan, zoom, preset selection, reset after camera movement, automatic rotation, Day and Evening switching, independent EV values and reset, fullscreen, cutaway and height adjustment. At 390 × 844 mobile emulation the layout had no horizontal overflow and touch orbit changed the camera pose. There were no browser console errors during the checks. The measured matched view issued 140 draw calls and 89,565 triangles. Physical mobile performance and non-Chromium browsers were outside the available test setup.

The optional baked path remains available in the reusable viewer. Dakwar V1.0 uses the configured live rigs because the pilot showed brick hot spots, patchy floor and ceiling shading, and an unresolved cabinet discontinuity. The web area-light approximations also differ from Cycles in shadow softness and reflections.

- [Desktop Day](desktop-day.png) · [Desktop Evening](desktop-evening.png) · [Cutaway](desktop-cutaway.png) · [Mobile](mobile.png)
- [Browser metrics](browser.json) · [Export inventory](export.json)
