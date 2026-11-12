# Dakwar 3D Viewer

The reusable Turntable V1.0 preview lives in [turntable](turntable/). The repository root remains the original viewer entry point.

## Local preview

Run `python -m http.server 8000 --bind 127.0.0.1` from the repository root and open [the local turntable](http://127.0.0.1:8000/turntable/). The preview needs WebGL 2 and loads the pinned Three.js r165 modules from jsDelivr. To work offline, serve the corresponding module files from a local copy of the package and point the import map to them.

Drag to orbit, use right drag to pan, and scroll to zoom. On touch screens, drag with one finger to orbit and use two fingers to pan or pinch. The toolbar provides camera presets, reset, rotation, lighting, per-mode exposure, adjustable cutaway, and fullscreen where the browser exposes it.

## Use another model

Run `python tools/inspect_turntable_glb.py path/to/model.glb --viewer-dir preview` to generate a standalone viewer directory. Serve its parent over HTTP and open `/preview/`. The generator copies the GLB and viewer files and creates a starter configuration with automatic framing and two lighting modes.

See the [production workflow](turntable/METHODOLOGY.md) for the configuration contract, model preparation and deployment steps. The [validation report](reports/turntable-v1/validation.md) covers the versioned Dakwar GLB and local browser measurements.

## Deployment after approval

Publish the complete standalone folder to a static host under a staging path. Verify the deployed GLB, module availability and controls on that URL. On GitHub Pages, serve the approved folder from the existing Pages source and link to its `index.html` from the desired entry point. Switching the root landing page is a separate release step. Keep the prior versioned URL available for rollback.
