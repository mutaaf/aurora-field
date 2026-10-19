# Changelog

## 3.0.0 — 2026-10-19
- **Stories as data.**
  - `stage(canvas, board, opts)` plays a storyboard. Each trade beat runs the pen's drawing, the moment it went wrong (a pulse at an anchor), an AI orb, light spreading from the chest, and a caption with a count-up. Crew beats line up a lit crew.
  - `load()` swaps a board in at the next beat. `focus()` holds a trade. `headless` swaps the HUD for events.
  - `validate()` checks boards against the vocabulary and limits, with house rules through `text`. `schema({ strict })` emits JSON Schema (an OpenAI structured-outputs shape), so an AI can write boards.
- **Everything as data, plus plugins.**
  - Props are primitives placed by point references (a joint, along a bone, between joints).
  - Actions are keyframe-free terms (`sin`, `pulse`, `swing`, `burst`, `hold`).
  - `use({ poses, props, actions, trades, palettes, shapes })` extends the vocabulary without touching the engine. `vocab()` lists it.
- **21 trades and 13 poses:**
  - New poses: `pole`, `carry`, `reach`, `push`, `spray`, `tray`.
  - New props: roller, rake, skimmer, mop, bucket, sprayer, box, windowpane, solarpanel, dolly, chainsaw, trowel, bullfloat, fence, fan, hvacunit, garagedoor, tray, gauge, remote, cap.
  - `registerCrew(only?)` registers trades lazily. `crewGroup(trades)` builds any lineup.
- **React:** `aurora-field/react` gives you `<AuroraStage src fallback live focus />`, with ETag polling, so open pages follow a changed board without a deploy.
- **Studio:** a storyboard editor that validates as you type, plays, and publishes to a scene endpoint.
- **Release:**
  - `field.add(names)` adds shapes to a live field. `clock: 'manual'` emits `frame`.
  - A publish workflow (tag `v*`, npm provenance) and SRI-pinned CDN snippets in the README.
  - The bundle budget is now 45 KB gzipped, for the engine, the people and the stage together (42.4 KB today).

## 3.0.0-alpha.1 — 2026-10-19
Quality and speed, ahead of the stage, plugin and React work in 3.0.
- **Drawings that read as people.** `figure().line` is now an outline instead of stick bones.
  - **How it's built:** the body and props are splatted into a front-view depth grid. Edges are kept where the figure meets empty space (the silhouette), and where an arm or a prop passes in front of the body. Silhouette and inner edges are chained separately, then depth-smoothed, Chaikin-smoothed and resampled.
  - **Drawing order:** the pen draws the silhouette as one stroke, clockwise from the crown, then the inner lines.
  - **Line weight:** a crisp hairline, plus ink that thickens on the side away from the light.
- **A pen that draws like a hand.** It eases in and out (`trace.ease`) and slows into corners. Its head is a comet with a short tail, and the tail never bridges a pen lift. Points the pen hasn't reached ride with it exactly. A drawn point appears in place, right behind the pen, so nothing streaks.
- **Enlightenment spreads.** `setShape(name, { arrive: { from, ms } })` switches points to the new shape in a wave from an anchor. The lit body's rim is the same points as the drawing's hairline, and the skin is ordered along the outline. So the edge of the drawing stays put while the body fills in from it.
- **Lit bodies that read as solid, not fog:**
  - Skin points buried inside another part are culled, and each part's share follows its visible area.
  - Ambient occlusion is baked with deterministic probes.
  - New flat-disc surfels (`surfelFlat`, `surfelAlpha`), which shrink edge-on so the silhouette stays clean.
  - Figures hold still: `still` turns off place-trading and scouts, and `edges: false` keeps pairs for signals only.
- **Faster:**
  - Shapes compile on first use; `field.prepare(names, done)` warms them in idle slices. `create()` with all 13 crew shapes takes 2.3 ms.
  - A cold trade outline takes about 25–37 ms.
  - `offload()` streams anchors and view back about 30×/s, so overlays work with the worker.
- **Minified builds:** `dist/aurora-field.min.js` (UMD, 35 KB gzipped) and `.min.mjs`. esbuild is a dev dependency only; the runtime has zero dependencies.
- **Deterministic and measured:**
  - `clock: 'manual'` with `field.advance(ms)`.
  - `npm run budget` keeps a lit figure's frame within 1.25× the lit helm's (same machine), 8 ms for `create()` and 40 KB gzipped, in CI.
  - `npm run render` renders contact sheets in headless Chromium. `--check` diffs them against goldens and `--update` refreshes the goldens.

## 2.1.0 — 2026-10-19
- **People, drawn then lit.** `figure(spec)` builds a person from an 18-joint skeleton in two forms.
  - **The line form** is a modern stick figure: bones, joint nodes and prop outlines, with pairs along every stroke for signals. A pen traces it from the chin round.
  - **The lit form** is the same person as a sleek, solid mannequin: a lofted torso, tapered limbs and an egg head, sampled evenly (R2 low-discrepancy) with analytic normals and surfels. Seams at the collar, waist, wrists and knees carry signals, a visor line crosses the face, and a bright core sits at the chest. Props take the accent tone.
  - **Shared by both:** pose, props, anchors (`head`, `chest`, `hand`, `prop`, `feet`) and an idle loop. Every point rides its joint through `flow`: breathing, a weight shift, a glance, and the trade's action (the hammer swings, the wrench turns, the head nods on the phone).
  - **The crew:** `registerCrew()` (or `create({ crew: true })`, which also works in workers) adds a contractor, plumber, electrician, roofer, property manager and realtor, each as `crew:<trade>:line` and `crew:<trade>:lit`, plus `crew:all`. `group()` composes shapes.
- **The pen.** Any shape can carry `trace: { order, ms }`. Undrawn points wait unseen at the pen, which shows as a bright tip; points glint as they're drawn; edges appear only between drawn points. Place-trading pauses while it draws. The field emits `traced` once a drawing is done, and `field.trace()` replays it.
- **`blank: true`** starts from an empty sky, with particles born unseen at the centre. `field.signal(at, hops, count)` sends signals from an anchor or a point. `flow(i, t, since)` now gets the seconds since the shape arrived.
- **The studio** has a crew panel: draw any trade, *draw again*, or *loop the crew*.
- `<aurora-field crew blank>`. `create` now explains an unknown `initial` shape instead of failing later. Bench: `crew:contractor:lit` costs the same per frame as the lit helm (0.26 ms at 2,800 points).

## 2.0.1 — 2026-10-19
- Republish of 2.0.0 from its tag. The 2.0.0 tarball on npm was packed from a working tree that held unreleased work; 2.0.1 is exactly the 2.0.0 release. Use 2.0.1.

## 2.0.0 — 2026-10-19
- **Lit, solid shapes.** Shapes can carry `normals`, and the field lights them as they turn: ambient, a key light, a rim at the silhouette, and a sheen (`light: true | false | { dir, ambient, key, rim, spec, shine }`, live through `set`). Shapes can also carry per-point `alpha` and `surfel` widths. On WebGL, a surfel is a soft lit disc as wide as the gap to its neighbours, so a sparse skin reads as a continuous surface (`surfels`, default on).
- **The helmets, as objects.** `armour()` grows a `surface`: a skin laid in even rows round the whole head, with `panels` that tone front regions. Normals come from the shell's implicit form, so everything on it is lit. Fills are sampled on a jittered grid, so eyes read solid. The **helm** wears a gold faceplate over a red shell. The **ranger** is a white helmet with a gold band and crest and a black glass visor. Lit shapes drop the random sparkle points, which read as noise on a surface.
- **The studio.** The demo is now a tool: shape, palette, a light you drag, rim, sheen, ambient, perspective, autonomy and node count (up to 40,000). It adds sixteen face sliders, a *perform* loop that acts out expressions without a camera, *follow cursor*, and camera tracking. You can type a word, or drop an image or an SVG. It exports a PNG or a recorded clip (WebM/MP4, up to 30 s), and its URL carries the whole state, so links reproduce exactly what you saw. It has keyboard shortcuts (`?`) and a bottom sheet on phones.
- `<aurora-field light="false" surfels="false">`. Tests run the WebGL path through a recording stub.

## 1.2.0 — 2026-10-19
- **`aurora-field/face`.** Camera face tracking that drives `setPose` and `setFace`: MediaPipe Face Landmarker in a Web Worker, One Euro smoothing, per-person calibration, an adaptive frame rate, and self-healing. The watchdog handles stalls, a crashed worker falls back to the main thread and a failing GPU to the CPU (both upgrade back when healthy), and a lost camera is re-acquired with backoff. Includes a failure drill (`simulate`). The demo has a camera button.
- **Twice the particles by default:** WebGL 5,600 (2,800 on phones), canvas-2D 2,800 (1,400).

## 1.1.0 — 2026-10-19
- **Face rig.** `field.setFace({...})` (and `setPose({ …, face })`) drives sixteen eased channels on rigged shapes. Eyelids close per eye and dim that eye's glow; the jaw opens; lips smile, pucker, press and shift; cheeks puff and squint; the chin raises; brows lift and furrow. Link art deforms with the particles. `armour()` takes `rig` and `dim`.
- **The ranger, refined.** An angular visor with the crest dipping into it, a gold band with an inner edge, larger fangs, a mouthplate with seven slots, and flowing tiger stripes.

## 1.0.0 — 2026-10-18
- **New shape: `ranger`.** A white-and-gold ranger helmet with a gold crest, a V visor that glows, gold fangs, a grille mouthplate and tiger stripes.
- **`armour(spec)`.** The helmet builder behind `helm` and `ranger`, now public: draw a front view, and get a turning 3D helmet with seams, glowing fills, ear discs, scan rings and anchors.
- **Shape factories.** `fromText`, `fromSVG` (its own path parser, with no DOM), `fromImage` (`ImageData`, canvas or image; edge-weighted) and `fromPoints`. `register()` also accepts static data.
- **Two-tone palettes.** `palette.accent` plus a per-point `tone`, and per-link tone for line art. Colours morph with the shape. Presets by name: `aurora`, `mark-iii`, `ranger`, `verse`, `barbenheimer`, `upside-down`, `night-city`, `spice`, `ember`, `ice`, `mono`. `palette` also takes `{ preset, …overrides }`.
- **Live configuration.** `field.set()` covers palette, autonomy, cycle, pin, depth, quality, fpsFloor, maxDpr, radius, rotation, interactive, autoPause and headless size. `field.on/off` handles the `shape`, `settled`, `stats`, `spinout` and `frame` events.
- **Platform-agnostic.** Headless canvases (`width`/`height`/`dpr`, `stageRect`), `field.pointer()` for input without DOM events, and `AuroraField.offload()` to run in a Web Worker on an `OffscreenCanvas` (`dist/aurora-field.worker.js`). Also new: a `<aurora-field>` web component (`src/element.js`, `dist/aurora-field-element.mjs`), an ES module build, and package `exports` for import, require, element and worker.
- **Faster.** The WebGL path spends 1.5–2.2× less CPU per frame and canvas-2D 1.15–1.3× less (`npm run bench`). Breathing uses angle-addition tables instead of per-particle trig, and depth curves are lookup tables.
- **Fix.** The WebGL renderer's hot-colour constant shadowed the per-particle hot flags, so sparkle points drew as ordinary points. They now sparkle, as they do in 2D.

## 0.6.0 — 2026-10-18
- **Overlays that follow the field.** `field.project([x, y, z])` gives a shape-space point's position on screen. `field.anchors()` projects the current shape's named `anchors`, and `field.view()` returns the live yaw, pitch, roll, radius and centre. Together they let a HUD point leaders at features that turn.
- **The helm declares anchors**: `tab`, `eyeL`, `eyeR`, `mouth`, `chin`, `earL` and `earR`.

## 0.5.0 — 2026-10-18
- **The helm, rebuilt as a true helmet.** One scale for both axes, so it is no longer stretched 1.4× wide. It's now a real head volume: rounded-box cross-sections, deeper front to back than side to side, with a proud faceplate. Turned to the side, it reads as a helmet instead of a slab.
- **Crisper.** No jitter on the seams, which now hug the curved shell. The random surface fill is gone: the face is clean line art, and the sides and back are a holographic scan of contour rings that carry signals. Ear discs sit on the sides of the shell.

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
