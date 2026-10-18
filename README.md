# aurora-field

A canvas-2D particle field that assembles into shapes and morphs between them: a neural sphere with signals travelling its synapses, a team of orbs, a stack of platforms with traffic streaming through, or any shape you register. Drag to spin it, move through it to part it, click to send a shockwave.

**[Live demo →](https://mutaaf.github.io/aurora-field/)** · seen on [mutaafaziz.com](https://mutaafaziz.com)

![aurora-field: a glowing neural sphere of particles on a night sky](docs/preview.jpg)

- **Zero dependencies.** One file, about 20 KB unminified, and ES5, so it can be inlined into pages that support old devices.
- **Honest performance.** 1,600 points at 60 fps on a laptop and 900 on phones. It measures its own frame rate and halves the drawn points if it drops below 38 fps. Device-pixel-ratio aware, capped at 2×.
- **Polite.** Pauses off-screen and in hidden tabs. Under `prefers-reduced-motion` it draws one still frame.
- **Deterministic when you want it.** Pass a `seed` and the same field is drawn every time.

## Install

```sh
npm i aurora-field
```

Or drop in one tag:

```html
<script src="https://unpkg.com/aurora-field"></script>
```

Until the package is published on npm, copy `src/aurora-field.js`.

## Use

```html
<section id="hero" style="position:relative;height:100vh;background:#0B0F12">
  <canvas id="field" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
</section>
<script>
  const field = AuroraField.create(document.getElementById('field'), {
    shapes: ['mind', 'teams', 'platforms'],
    onShape: (name) => console.log('now showing', name),
  });
  // e.g. tie shapes to the words of a headline
  document.querySelector('[data-shape=teams]').onmouseenter = () => field.setShape('teams', { pin: true });
</script>
```

The canvas fills its `container` (default: its parent). Pass a `stage` element to place the shape inside a region, for example the right half of a hero, so it sits beside your text.

## Options

| option | default | |
|---|---|---|
| `container` | `canvas.parentNode` | element whose box sizes the canvas |
| `stage` | `container` | element whose box centres and sizes the shape |
| `count` | `900` / `1600` | particle count (below / above 760px), or `(viewportWidth) => n` |
| `shapes` | all registered | cycle order |
| `initial` | `shapes[0]` | first shape |
| `cycle` | `6500` | ms per shape; `0` turns auto-cycling off |
| `pin` | `14000` | ms that `setShape(name, {pin:true})` holds before cycling resumes |
| `intro` | `2600` | ms before auto-cycling may begin |
| `stars` | `140` | background stars (twinkle, slight parallax) |
| `radius` | `min(w·.42, h·.36, 330)` | `(stageW, stageH) => px` |
| `interactive` | `true` | drag to spin, cursor parts the field, click for a shockwave |
| `autoPause` | `true` | pause when off-screen or the tab is hidden |
| `reducedMotion` | `'auto'` | `true` / `false` overrides `prefers-reduced-motion` |
| `seed` | `null` | number → deterministic field |
| `palette` | aurora | `{ point:[r,g,b], hot, star, signal:[r,g,b], head:[r,g,b], glow:[r,g,b], glow2:[r,g,b] }` |
| `onShape` | | `(name)` when a shape becomes current |
| `onStats` | | `({ fps, nodes })` once a second while running |
| `onSpinout` | | `()` when someone spins it really hard |

## API

```js
field.setShape('platforms', { pin: true })  // or { pin: 5000 }
field.next()
field.pause(); field.play()
field.resize()      // after a layout change the window didn't announce
field.stats()       // { fps, nodes, running, reduced, shape }
field.destroy()     // removes listeners and clears the canvas

AuroraField.register(name, build)  // add a shape, before create()
AuroraField.build(name, n, seed)   // build a shape without a canvas
AuroraField.shapes()               // registered names
```

## Custom shapes

A shape is a function that turns `n` particles into targets in a roughly unit box:

```js
AuroraField.register('ring', function (n, random) {
  var points = [];
  for (var i = 0; i < n; i++) {
    var a = i / n * Math.PI * 2, r = 1 + (random() - 0.5) * 0.08;
    points.push([Math.cos(a) * r, (random() - 0.5) * 0.06, Math.sin(a) * r]);
  }
  return {
    points: points,                 // required: n × [x, y, z]
    pairs: [[0, 1], [1, 2]],        // optional: edges that glow and carry signals
    links: [[[0,0,0], [1,0,0]]],    // optional: static segments drawn with the shape
    flow: function (i, t) {         // optional: per-frame target for animated points
      return null;                  //   (t in seconds; null means "use points[i]")
    },
    kick: 0.8                       // optional: extra spin on arrival
  };
});
```

The demo registers a double helix this way; see `index.html`.

## How it draws

Each frame rotates every point around Y and then X, applies a light perspective, and sorts points into eight depth buckets. Each bucket is filled with a single `rect` path, so 1,600 points cost eight fills, not 1,600. Edges are one stroked path. Additive blending (`lighter`) gives the glow without blur filters. Edges fade with *measured* convergence: the field samples 64 points each frame to see how close it is to its shape. That keeps the intro and every morph clean at any frame rate.

## Develop

```sh
node test/run.mjs     # zero-dependency tests (shapes, determinism, ES5 guard, lifecycle)
npm run demo          # http://localhost:8080
```

MIT © [Mutaaf Aziz](https://mutaafaziz.com)
