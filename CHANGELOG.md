# Changelog

## 0.4.0 — 2026-10-18
- **WebGL renderer** (default when available): round anti-aliased points snapped to device pixels, specular cores, soft halos and additive bloom, with edges, links, signals, trails and shockwaves in a single `gl.LINES` batch. Three draw calls a frame. Default counts double (2,800 / 1,400). Canvas-2D is the automatic fallback (`renderer: '2d'` forces it), and WebGL context loss pauses and rebuilds.
- **`setPose({ yaw, pitch, roll, eyes })`**: a tracked head drives facing shapes, and `eyes` (0…1) dims their bright points on a blink. The projection gains roll.
- **The helm, redrawn** from line art: forehead tab, temple screws, a V brow, angular eye slits, cheek slashes, a mouth block with stacked chin plates, ear pieces, and the shell silhouette. Particle lines sit over a 3D shell. A new `lineArt` shape flag draws its links brighter and keeps place-trading local, so the drawing never tears.
- **Fix.** Edges and signal hops stretched across the shape by particles in transit are no longer drawn, and signals wait until the field has settled.

## 0.3.0 — 2026-10-18
- **New shape: `helm`.** An armoured helmet with a faceplate, brow ridge, cheek and mouth seams that carry signals, a crest, ear discs, a jaw ring, and two eye slits that glow. It turns to face you and holds there with a slow sway.
- **Depth.** A stronger perspective (`depth`, default 2.8) and 12 depth layers instead of 8. Far points fade toward `palette.fog`, and near points get a one-pixel specular core.
- **Shape API.** `bright: [i…]` (points that glow while the shape is up) and `facing: true` (turn toward the viewer).
- **`rotation`.** Choose which shapes auto-cycle; the rest wait for `setShape`.
- **Fix.** `platforms` traffic now streams *up* on screen. Screen-space y points down, and the docs now say so.

## 0.2.0 — 2026-10-18
- **Autonomous particles.** Each particle is a damped spring with its own stiffness and swirls into place. Then it breathes, trades points with neighbours, sends out scouts (orbit, trail, return), and lights up when a signal reaches it. Tune with `autonomy: 0…1`.
- **Performance.** Struct-of-arrays typed buffers with no per-frame allocation, cached shape builds (per name, count and seed), pre-rendered glow and halo sprites, and pointer and shockwave work skipped when idle. About 2–3 ms a frame for 1,600 points on a retina laptop.
- **Governor.** `quality: 'auto'` walks a ladder (resolution, then point density) to hold the frame rate, and climbs back up. `fpsFloor` now defaults to 45.
- **Crisp.** Points are snapped to whole device pixels.
- **Fix.** Edges no longer stretch to particles that are away scouting. Convergence ignores breathing.
- `stats()` adds `quality`, `scouts` and `settle`; `onStats` adds `quality`.

## 0.1.0 — 2026-10-18
- First release: mind / teams / platforms shapes, `register()`, palettes, seeded fields, pause when hidden or off-screen, a still frame under reduced motion.
