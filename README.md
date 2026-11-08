# Dakwar 3D Viewer

Standalone interactive architectural 3D presentation for the Dakwar residence, built with Three.js. This project is independent of Cortex Lab.

## Getting started

The website requires these files in the repository root:

- `index.html` — viewer application
- `dakwar.glb` — complete 3D model with embedded textures (upload separately; GitHub connector does not support this binary upload)

## Local testing

Open a terminal in the folder containing both files and run `python -m http.server 8000`, then visit http://localhost:8000.

## Publish using GitHub Pages

1. Upload `dakwar.glb` to the repository root, next to `index.html`.
2. Go to **Settings → Pages** on GitHub.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/(root)**, then **Save**.
4. Visit https://hach85.github.io/dakwar-3d-viewer/ once GitHub reports a successful Pages deployment.

## Viewer features

Orbit, zoom, pan, overview/front/side/top camera presets, day/evening exposure modes, auto-rotation, fullscreen, and a horizontal ceiling cutaway height slider.

**Note:** The cutaway clips all scene geometry above the horizontal plane; it does not identify only roof geometry. The included GLB and textures become accessible to anyone visiting the public website.
