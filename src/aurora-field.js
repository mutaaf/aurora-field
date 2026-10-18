/*! aurora-field v0.3.0 · MIT · https://github.com/mutaaf/aurora-field
 * A canvas-2D particle field that assembles into shapes and morphs between them:
 * a neural sphere with travelling signals, a team of orbs, a stack of platforms, a helm.
 * Drag spins it, the cursor parts it, a click sends a shockwave. Particles are damped
 * springs that swirl into place, breathe, trade places and send out scouts; a governor
 * holds the frame rate; points are snapped to device pixels so they stay crisp.
 * Zero dependencies. ES5 on purpose, so it can be inlined into old-device-friendly pages.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AuroraField = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '0.3.0';
  var TAU = Math.PI * 2;

  var imul = Math.imul || function (a, b) {
    var ah = (a >>> 16) & 0xffff, al = a & 0xffff, bh = (b >>> 16) & 0xffff, bl = b & 0xffff;
    return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0);
  };
  // ---- seeded randomness: the same seed draws the same field ----
  function rng(seed) {
    if (seed == null) return Math.random;
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = imul(t ^ (t >>> 15), t | 1);
      t ^= t + imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function between(r, a, b) { return a + r() * (b - a); }
  function onSphere(r, radius) {
    var u = between(r, 0, TAU), v = Math.acos(between(r, -1, 1));
    return [radius * Math.sin(v) * Math.cos(u), radius * Math.cos(v), radius * Math.sin(v) * Math.sin(u)];
  }

  // ---- shapes ----
  // A shape is build(n, r) → { points: [[x,y,z]…n] in a unit-ish box,
  //   pairs?: [[i,j]…]  edges that light up and carry signals,
  //   links?: [[[x,y,z],[x,y,z]]…]  static segments drawn with the shape,
  //   flow?:  function (i, t) → [x,y,z] | null  per-frame target for animated points,
  //   kick?:  extra spin when the shape arrives,
  //   bright?: [i…] points that glow while the shape is up (eyes, beacons),
  //   facing?: true to turn and hold the shape toward the viewer (with a slow sway) }
  var SHAPES = {};
  var ORDER = [];
  function register(name, build) {
    if (typeof build !== 'function') throw new Error('aurora-field: shape "' + name + '" needs a build function');
    if (!SHAPES[name]) ORDER.push(name);
    SHAPES[name] = build;
    if (typeof CACHE !== 'undefined') for (var k in CACHE) if (k.indexOf(name + '|') === 0) delete CACHE[k];
  }

  // mind: a Fibonacci sphere with a denser core; synapses to the nearest neighbours
  register('mind', function (n, r) {
    var pts = [], surf = Math.floor(n * 0.82), ga = Math.PI * (3 - Math.sqrt(5)), i;
    for (i = 0; i < n; i++) {
      if (i < surf) {
        var y = 1 - (i / (surf - 1)) * 2, rr = Math.sqrt(1 - y * y), a = ga * i;
        pts.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
      } else pts.push(onSphere(r, between(r, 0.15, 0.55)));
    }
    var pairs = [];
    for (var p = 0; p < surf; p++) {
      var A = pts[p], b1 = -1, b2 = -1, d1 = 9, d2 = 9;
      for (var q = Math.max(0, p - 60); q < Math.min(surf, p + 60); q++) {
        if (q === p) continue;
        var B = pts[q], dx = A[0] - B[0], dy = A[1] - B[1], dz = A[2] - B[2], d = dx * dx + dy * dy + dz * dz;
        if (d < d1) { d2 = d1; b2 = b1; d1 = d; b1 = q; } else if (d < d2) { d2 = d; b2 = q; }
      }
      if (b1 > p) pairs.push([p, b1]);
      if (b2 > p && r() < 0.6) pairs.push([p, b2]);
    }
    return { points: pts, pairs: pairs, kick: 0.6 };
  });

  // teams: a lead and six around them, each a small orb, linked
  register('teams', function (n, r) {
    var orbs = [[0, 0, 0, 0.34]], pts = [], links = [], i;
    for (i = 0; i < 6; i++) { var a = i / 6 * TAU; orbs.push([Math.cos(a) * 1.05, Math.sin(a * 2) * 0.12, Math.sin(a) * 1.05, 0.19]); }
    for (i = 0; i < n; i++) {
      var O = orbs[i < n * 0.3 ? 0 : 1 + (i % 6)], s = onSphere(r, O[3] * (0.82 + r() * 0.18));
      pts.push([O[0] + s[0], O[1] + s[1], O[2] + s[2]]);
    }
    for (i = 1; i < orbs.length; i++) {
      var nb = orbs[i % 6 + 1];
      links.push([[0, 0, 0], [orbs[i][0], orbs[i][1], orbs[i][2]]]);
      links.push([[orbs[i][0], orbs[i][1], orbs[i][2]], [nb[0], nb[1], nb[2]]]);
    }
    return { points: pts, links: links, kick: 1.2 };
  });

  // platforms: three layers, with traffic streaming up through them
  register('platforms', function (n, r) {
    var pts = [], streams = {}, sn = Math.floor(n * 0.22), i;
    for (i = 0; i < n; i++) {
      if (i < sn) {
        var sa = (i % 9) / 9 * TAU + 0.3;
        streams[i] = [Math.cos(sa) * 0.62, Math.sin(sa) * 0.62, r()];
        pts.push([0, 0, 0]);
        continue;
      }
      var L = i % 3, ring = 1 + Math.floor(r() * 5), a = between(r, 0, TAU), rad = ring / 5 * (L === 1 ? 1.1 : 0.95);
      pts.push([Math.cos(a) * rad, [-0.62, 0, 0.62][L], Math.sin(a) * rad]);
    }
    return {
      points: pts, kick: 0.6,
      flow: function (idx, t) {
        var s = streams[idx];
        return s ? [s[0], 0.8 - ((s[2] + t * 0.12) % 1) * 1.6, s[1]] : null;  // screen y is down: this rises
      }
    };
  });

  // helm: an armoured helmet that turns to face you. Shell, faceplate seams that carry
  // signals like circuitry, a crest, a jaw ring, and two eye slits that glow.
  register('helm', function (n, r) {
    var A = 0.74, B = 1, C = 0.84;
    // silhouette: crown, a slight cheek flare, then a squared jaw
    function width(y) { return y > 0.5 ? 1 - (y - 0.5) * 0.25 : y > -0.3 ? 1 + (0.5 - Math.abs(y + 0.05)) * 0.04 : 1 - (-0.3 - y) * 0.38; }
    function shellZ(x, y) {
      var u = x / (A * width(y)), v = y / B, q = 1 - u * u - v * v;
      return q <= 0 ? 0 : C * Math.pow(q, 0.42);                                   // boxier than an ellipsoid
    }
    function inPoly(P, x, y) {
      var c = false;
      for (var i = 0, j = P.length - 1; i < P.length; j = i++)
        if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
      return c;
    }
    var PLATE = [[-0.36, 0.6], [-0.47, 0.3], [-0.5, 0.02], [-0.44, -0.3], [-0.32, -0.6], [-0.15, -0.84], [0.15, -0.84], [0.32, -0.6], [0.44, -0.3], [0.5, 0.02], [0.47, 0.3], [0.36, 0.6], [0, 0.7], [-0.36, 0.6]];
    // the faceplate stands proud of the shell and is flatter
    function plateZ(x, y) { return shellZ(x, y) * 0.9 + 0.075; }
    function eyeHit(x, y) {                                                        // trapezoid slits: tall at the nose, thin at the temple
      var ax = Math.abs(x); if (ax < 0.08 || ax > 0.37) return false;
      var t = (ax - 0.08) / 0.29, top = 0.235 - t * 0.012, bottom = 0.165 + t * 0.045;
      return y < top && y > bottom;
    }
    function face(x, y, lift) { return [x, y, (inPoly(PLATE, x, y) ? plateZ(x, y) : shellZ(x, y)) + (lift || 0)]; }
    function polyline(P, count, jit, lift) {
      var segs = [], total = 0, i, out = [];
      for (i = 0; i < P.length - 1; i++) { var dx = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1], L = Math.sqrt(dx * dx + dy * dy); segs.push(L); total += L; }
      for (i = 0; i < count; i++) {
        var d = (i + 0.5) / count * total, s = 0;
        while (s < segs.length - 1 && d > segs[s]) { d -= segs[s]; s++; }
        var f = segs[s] ? d / segs[s] : 0;
        out.push(face(P[s][0] + (P[s + 1][0] - P[s][0]) * f + (r() - 0.5) * jit, P[s][1] + (P[s + 1][1] - P[s][1]) * f + (r() - 0.5) * jit, lift));
      }
      return out;
    }
    var pts = [], pairs = [], bright = [], links = [], i, k;
    function run(P, count, jit, lift) { var start = pts.length, a = polyline(P, count, jit, lift); for (var j = 0; j < a.length; j++) { pts.push(a[j]); if (j) pairs.push([start + j - 1, start + j]); } }
    var seams = Math.floor(n * 0.2);
    run(PLATE, Math.floor(seams * 0.42), 0.004, 0.012);
    run([[-0.46, 0.33], [-0.2, 0.31], [0, 0.36], [0.2, 0.31], [0.46, 0.33]], Math.floor(seams * 0.14), 0.004, 0.014);     // brow ridge
    run([[-0.2, -0.47], [-0.07, -0.5], [0.07, -0.5], [0.2, -0.47]], Math.floor(seams * 0.08), 0.003, 0.012);               // mouth
    run([[-0.44, -0.3], [-0.24, -0.34], [-0.1, -0.66]], Math.floor(seams * 0.1), 0.003, 0.012);                            // cheek seams
    run([[0.44, -0.3], [0.24, -0.34], [0.1, -0.66]], Math.floor(seams * 0.1), 0.003, 0.012);
    run([[0, 0.7], [0, 0.99]], Math.max(2, seams - pts.length), 0.004, 0.012);   // crest
    // eyes: dense, sharp, glowing
    var eyes = Math.floor(n * 0.075), edge = Math.floor(eyes * 0.55);
    // half the eye points trace each slit's outline (crisp edges), half fill it
    for (i = 0; i < edge; i++) {
      var sd = i % 2 ? 1 : -1, u = (i >> 1) / Math.max(1, (edge >> 1) - 1), q = u * 4, e2;
      if (q < 1) e2 = [0.08 + q * 0.29, 0.235 - q * 0.012];                          // top edge, nose → temple
      else if (q < 2) e2 = [0.37, 0.223 - (q - 1) * 0.013];                          // temple end
      else if (q < 3) e2 = [0.37 - (q - 2) * 0.29, 0.21 - (q - 2) * 0.045];          // bottom edge, temple → nose
      else e2 = [0.08, 0.165 + (q - 3) * 0.07];                                      // nose end
      bright.push(pts.length); pts.push(face(sd * e2[0], e2[1], 0.022));
    }
    for (i = edge, k = 0; i < eyes && k < eyes * 30; k++) {
      var ex = (r() * 2 - 1) * 0.37, ey = 0.16 + r() * 0.08;
      if (!eyeHit(ex, ey)) continue;
      bright.push(pts.length); pts.push(face(ex, ey, 0.02)); i++;
    }
    // ear discs: a ring and a hub on each side
    var ears = Math.floor(n * 0.04);
    for (i = 0; i < ears; i++) {
      var s = i % 2 ? 1 : -1, a = r() * Math.PI * 2, rad = i % 3 ? 0.15 : 0.07;
      pts.push([s * (A * 1.01 + 0.015), 0.04 + Math.sin(a) * rad, Math.cos(a) * rad * 1.1 - 0.02]);
    }
    // faceplate surface, denser than the shell so the plate reads as one piece
    var plate = Math.floor(n * 0.25);
    for (i = 0, k = 0; i < plate && k < plate * 40; k++) {
      var fx = (r() * 2 - 1) * 0.5, fy = -0.84 + r() * 1.54;
      if (!inPoly(PLATE, fx, fy) || eyeHit(fx, fy)) continue;
      pts.push([fx, fy, plateZ(fx, fy)]); i++;
    }
    // jaw ring and neck seal
    var jaw = Math.floor(n * 0.04);
    for (i = 0; i < jaw; i++) { var ja = i / jaw * Math.PI * 2; pts.push([Math.cos(ja) * A * 0.58, -0.93, Math.sin(ja) * C * 0.6]); }
    // the shell, everywhere the plate isn't
    var rest = n - pts.length, M = Math.ceil(rest * 1.7) + 8, ga = Math.PI * (3 - Math.sqrt(5)), cand = [];
    for (k = 0; k < M; k++) {
      var y = 1 - (k + 0.5) / M * 2, rr = Math.sqrt(Math.max(0, 1 - y * y)), an = ga * k;
      var px = Math.cos(an) * rr * A * width(y), py = y * B, pz = Math.sin(an) * rr;
      pz = (pz < 0 ? -1 : 1) * C * Math.pow(Math.abs(pz), 0.84);
      if (pz > 0 && inPoly(PLATE, px, py)) continue;
      cand.push([px, py, pz]);
    }
    for (k = 0; k < rest && cand.length; k++) pts.push(cand[Math.min(cand.length - 1, Math.floor(k * cand.length / rest))]);
    while (pts.length < n) pts.push(face((r() - 0.5) * 0.6, (r() - 0.5) * 1.4, 0));
    function lineOf(P, lift) { for (var q = 0; q < P.length - 1; q++) links.push([face(P[q][0], P[q][1], lift), face(P[q + 1][0], P[q + 1][1], lift)]); }
    lineOf(PLATE, 0.012);
    lineOf([[-0.46, 0.33], [-0.2, 0.31], [0, 0.36], [0.2, 0.31], [0.46, 0.33]], 0.014);
    lineOf([[-0.2, -0.47], [-0.07, -0.5], [0.07, -0.5], [0.2, -0.47]], 0.012);
    lineOf([[-0.44, -0.3], [-0.24, -0.34], [-0.1, -0.66]], 0.012);
    lineOf([[0.44, -0.3], [0.24, -0.34], [0.1, -0.66]], 0.012);
    lineOf([[0, 0.7], [0, 0.99]], 0.012);
    // authored y-up and face-forward (+z); the camera looks down +z with y down,
    // so flip both once on the way out and the face turns toward the viewer
    var out = pts.slice(0, n);
    for (k = 0; k < out.length; k++) out[k] = [out[k][0], -out[k][1], -out[k][2]];
    for (k = 0; k < links.length; k++) links[k] = [[links[k][0][0], -links[k][0][1], -links[k][0][2]], [links[k][1][0], -links[k][1][1], -links[k][1][2]]];
    return { points: out, pairs: pairs, links: links, bright: bright, facing: true, kick: 0.2 };
  });

  var DEFAULTS = {
    container: null,          // element whose box sizes the canvas (default: canvas.parentNode)
    stage: null,              // element whose box places and sizes the shape (default: container)
    count: null,              // particle count, or function (width) → count; default 900 / 1600
    shapes: null,             // shapes in this field (default: every registered shape)
    rotation: null,           // which of them auto-cycle, in order (default: all of shapes)
    initial: null,            // first shape (default: shapes[0])
    cycle: 6500,              // ms per shape; 0 turns auto-cycling off
    pin: 14000,               // ms a setShape(…, {pin:true}) holds before cycling resumes
    intro: 2600,              // ms before auto-cycling may begin
    stars: 140,
    radius: null,             // function (stageWidth, stageHeight) → px
    maxDpr: 2,
    depth: 2.8,               // camera distance in shape radii: lower is more dramatic perspective
    quality: 'auto',          // 'auto' governs itself to hold the frame rate; 'high' | 'low' pin it
    fpsFloor: 45,             // the governor steps quality down below this, back up above 57
    autonomy: 1,              // 0…1: breathing, place-trading, scouts, self-lit signals
    interactive: true,
    autoPause: true,          // pause when off-screen or the tab is hidden
    reducedMotion: 'auto',    // 'auto' follows prefers-reduced-motion; true/false forces it
    seed: null,               // number → deterministic field
    palette: {
      point: [123, 227, 195], hot: '#F4FFFB', star: '#CFE9E0',
      signal: [200, 255, 236], head: [220, 255, 244], glow: [123, 227, 195], glow2: [62, 143, 122],
      fog: [52, 92, 110]      // far points fade toward this, for depth
    },
    onShape: null,            // (name) when a shape becomes current
    onStats: null,            // ({fps, nodes, quality}) once a second while running
    onSpinout: null           // () when someone spins it really hard (|ω| > 7 rad/s)
  };
  function merge(base, over) {
    var out = {}, k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    if (over) for (k in over) if (Object.prototype.hasOwnProperty.call(over, k) && over[k] !== undefined) out[k] = over[k];
    return out;
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  var F32 = typeof Float32Array !== 'undefined' ? Float32Array : Array;
  var I32 = typeof Int32Array !== 'undefined' ? Int32Array : Array;
  function f32(n) { var a = new F32(n); if (a.fill) a.fill(0); else for (var i = 0; i < n; i++) a[i] = 0; return a; }
  function i32(n) { var a = new I32(n); if (a.fill) a.fill(0); else for (var i = 0; i < n; i++) a[i] = 0; return a; }

  // ---- shape cache: a shape is built once per (name, count, seed), then shared ----
  var SESSION_SEED = (Math.random() * 4294967296) >>> 0, CACHE = {}, CACHE_KEYS = [];
  function hashName(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) h = imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function compile(name, n, seed) {
    var key = name + '|' + n + '|' + seed;
    if (CACHE[key]) return CACHE[key];
    var s = SHAPES[name](n, rng((seed ^ hashName(name)) >>> 0));
    if (!s || !s.points || s.points.length !== n) throw new Error('aurora-field: shape "' + name + '" must return ' + n + ' points');
    var T = f32(n * 3), i;
    for (i = 0; i < n; i++) { T[i * 3] = s.points[i][0]; T[i * 3 + 1] = s.points[i][1]; T[i * 3 + 2] = s.points[i][2]; }
    var adj = null;
    if (s.pairs && s.pairs.length) {
      adj = []; for (i = 0; i < n; i++) adj.push([]);
      for (i = 0; i < s.pairs.length; i++) { adj[s.pairs[i][0]].push(s.pairs[i][1]); adj[s.pairs[i][1]].push(s.pairs[i][0]); }
    }
    var c = { def: s, T: T, adj: adj };
    CACHE[key] = c; CACHE_KEYS.push(key);
    if (CACHE_KEYS.length > 24) delete CACHE[CACHE_KEYS.shift()];
    return c;
  }

  // quality ladder the governor walks: [particle stride, device-pixel cap]
  var LADDER = [[1, 99], [1, 1.5], [2, 1.25], [3, 1]];

  function create(canvas, options) {
    var o = merge(DEFAULTS, options);
    o.palette = merge(DEFAULTS.palette, options && options.palette);
    var ctx = canvas && canvas.getContext && canvas.getContext('2d');
    if (!ctx) throw new Error('aurora-field: needs a <canvas> with a 2D context');
    var win = canvas.ownerDocument.defaultView || window, doc = canvas.ownerDocument;
    var container = o.container || canvas.parentNode, stage = o.stage || container;
    var reduced = o.reducedMotion === 'auto' ? !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) : !!o.reducedMotion;
    var AUTO = reduced ? 0 : Math.max(0, Math.min(1, +o.autonomy || 0));
    var seed = o.seed == null ? SESSION_SEED : (o.seed >>> 0);
    var r = rng(seed), i;
    var N = typeof o.count === 'function' ? o.count(win.innerWidth) : (o.count || (win.innerWidth < 760 ? 900 : 1600));
    var names = (o.shapes || ORDER).slice();
    for (i = 0; i < names.length; i++) if (!SHAPES[names[i]]) throw new Error('aurora-field: unknown shape "' + names[i] + '"');
    var cycleList = (o.rotation || names).slice();
    for (i = 0; i < cycleList.length; i++) if (names.indexOf(cycleList[i]) < 0) throw new Error('aurora-field: rotation shape "' + cycleList[i] + '" is not in shapes');

    // ---- particle state, struct-of-arrays: no per-frame allocation, cache-friendly loops ----
    var X = f32(N), Y = f32(N), Z = f32(N), VX = f32(N), VY = f32(N), VZ = f32(N);
    var OX = f32(N), OY = f32(N), SX = f32(N), SY = f32(N), ZZ = f32(N);
    var W = f32(N), PH = f32(N), GLOW = f32(N), SC = f32(N);
    var HOT = i32(N), TI = i32(N), OWN = i32(N);
    for (i = 0; i < N; i++) {
      var r0 = between(r, 2.5, 6), th = between(r, 0, TAU), ph = Math.acos(between(r, -1, 1));
      X[i] = r0 * Math.sin(ph) * Math.cos(th); Y[i] = r0 * Math.cos(ph); Z[i] = r0 * Math.sin(ph) * Math.sin(th);
      W[i] = between(r, 4.2, 8.5);          // each particle's own spring: some eager, some lazy
      PH[i] = between(r, 0, TAU);
      HOT[i] = r() < 0.07 ? 1 : 0;
      TI[i] = i; OWN[i] = i;                // particle i currently holds point i (they trade later)
    }
    var S = {};
    for (i = 0; i < names.length; i++) { var c0 = compile(names[i], N, seed); S[names[i]] = { def: c0.def, T: c0.T, adj: c0.adj, w: 0 }; }
    var stars = [];
    for (i = 0; i < o.stars; i++) stars.push([r(), r() * 0.8, between(r, 0.4, 1.3), between(r, 0, TAU)]);

    var shape = o.initial || names[0], autoAt = 0, pinnedUntil = 0, born = 0, introDone = false;
    S[shape].w = 1;
    var CW = 0, CH = 0, DPR = 1, cx = 0, cy = 0, R = 1, D = Math.max(1.6, +o.depth || 2.8);
    var rotY = 0, rotX = -0.32, vy = 0.9, kick = 0, mx = -1e4, my = -1e4, pointerIn = false, par = 0, down = null, waves = [], sig = [];
    var BUCKETS = 11, bCount = i32(BUCKETS + 1), bIdx = i32((BUCKETS + 1) * N), hotIdx = i32(N), litIdx = i32(N);
    var fps = 60, fAcc = 0, fN = 0, level = o.quality === 'low' ? 3 : 0, good = 0, spunAt = 0;
    var raf = 0, last = 0, running = false, wanted = true, inView = true, destroyed = false, listeners = [], settle = 0, clock = 0;
    var glowCache = null, glowKey = '', haloCache = null, haloKey = '';
    // scouts: a few particles leave the shape, orbit with a trail, and come home
    var SCOUTS = [], MAXSCOUTS = Math.round(N * 0.008 * AUTO), TRAIL = 10;

    function on(el, ev, fn, opt) { el.addEventListener(ev, fn, opt || false); listeners.push([el, ev, fn, opt || false]); }
    function now() { return Date.now(); }
    function step() { return LADDER[level][0]; }

    function layout() {
      var cr = container.getBoundingClientRect(); CW = cr.width; CH = cr.height; if (!CW || !CH) return;
      DPR = Math.min(win.devicePixelRatio || 1, o.maxDpr, LADDER[level][1]);
      canvas.width = Math.round(CW * DPR); canvas.height = Math.round(CH * DPR);
      var g = stage.getBoundingClientRect();
      cx = g.left - cr.left + g.width / 2; cy = g.top - cr.top + g.height / 2;
      R = o.radius ? o.radius(g.width, g.height) : Math.max(90, Math.min(g.width * 0.42, g.height * 0.36, 330));
      glowKey = '';
      if (!running) draw(0);
    }
    // the core glow is a gradient; render it once per size into a sprite, then just blit it
    function glowSprite() {
      var key = Math.round(R * DPR) + '|' + o.palette.glow + '|' + o.palette.glow2;
      if (key === glowKey) return glowCache;
      glowKey = key; glowCache = null;
      if (!doc.createElement) return null;
      var sz = Math.max(2, Math.ceil(R * 3 * DPR)), c = doc.createElement('canvas'), g = c.getContext && c.getContext('2d');
      if (!g) return null;
      c.width = sz; c.height = sz;
      var gr = g.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
      gr.addColorStop(0, rgba(o.palette.glow, 0.13)); gr.addColorStop(0.5, rgba(o.palette.glow2, 0.05)); gr.addColorStop(1, rgba(o.palette.glow2, 0));
      g.fillStyle = gr; g.fillRect(0, 0, sz, sz);
      glowCache = c; return c;
    }
    // a soft round halo for lit nodes and scouts, rendered once per palette
    function haloSprite() {
      var key = String(o.palette.point);
      if (key === haloKey) return haloCache;
      haloKey = key; haloCache = null;
      if (!doc.createElement) return null;
      var c = doc.createElement('canvas'), g = c.getContext && c.getContext('2d'); if (!g) return null;
      c.width = c.height = 64;
      var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(o.palette.point, 0.55)); gr.addColorStop(0.35, rgba(o.palette.point, 0.18)); gr.addColorStop(1, rgba(o.palette.point, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      haloCache = c; return c;
    }
    function fire(sh, p) {
      var adj = S[sh].adj; if (!adj || sig.length >= 60 || !adj[p].length) return;
      sig.push({ sh: sh, a: p, b: adj[p][Math.floor(Math.random() * adj[p].length)], t: 0, hops: 6 + Math.floor(Math.random() * 10) });
    }
    function burst() { if (S[shape].adj) for (var k = 0; k < 14; k++) fire(shape, Math.floor(Math.random() * N)); }

    function draw(t) {
      var pal = o.palette, k, j, p, n;
      var stp = step();
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, CW, CH);
      ctx.fillStyle = pal.star;
      for (i = 0; i < stars.length; i++) {
        var st = stars[i];
        ctx.globalAlpha = 0.12 + 0.28 * (0.5 + 0.5 * Math.sin(t * 0.0011 * st[2] + st[3])) * st[2] / 1.3;
        ctx.fillRect(st[0] * CW - par * 8 * st[2], st[1] * CH, st[2], st[2]);
      }
      ctx.globalAlpha = 1;
      // project every particle once
      var c1 = Math.cos(rotY), s1 = Math.sin(rotY), c2 = Math.cos(rotX), s2 = Math.sin(rotX);
      for (n = 0; n < N; n++) {
        var x = X[n] * c1 - Z[n] * s1, z = X[n] * s1 + Z[n] * c1, y = Y[n] * c2 - z * s2; z = Y[n] * s2 + z * c2;
        var kk = D / (D + z); SX[n] = x * R * kk; SY[n] = y * R * kk; ZZ[n] = z;
      }
      var gs = glowSprite();
      if (gs) ctx.drawImage(gs, cx - R * 1.5, cy - R * 1.5, R * 3, R * 3);
      ctx.globalCompositeOperation = 'lighter';
      // edges follow measured convergence: they fade out mid-morph and in as points arrive
      for (var name in S) {
        var sh = S[name], w = sh.w * settle; if (w < 0.02) continue;
        var pairs = sh.def.pairs, links = sh.def.links;
        if (pairs) {
          ctx.strokeStyle = rgba(pal.point, 0.13 * w); ctx.lineWidth = 0.7; ctx.beginPath();
          for (i = 0; i < pairs.length; i += stp) {
            var A = OWN[pairs[i][0]], B = OWN[pairs[i][1]]; if ((ZZ[A] > 0.35 && ZZ[B] > 0.35) || SC[A] > 0 || SC[B] > 0) continue;
            ctx.moveTo(cx + SX[A] + OX[A], cy + SY[A] + OY[A]); ctx.lineTo(cx + SX[B] + OX[B], cy + SY[B] + OY[B]);
          }
          ctx.stroke();
        }
        if (links) {
          ctx.strokeStyle = rgba(pal.point, 0.18 * w); ctx.lineWidth = 1; ctx.beginPath();
          for (i = 0; i < links.length; i++) {
            var L0 = links[i][0], L1 = links[i][1];
            var ux = L0[0] * c1 - L0[2] * s1, uz = L0[0] * s1 + L0[2] * c1, uy = L0[1] * c2 - uz * s2; uz = L0[1] * s2 + uz * c2;
            var vx = L1[0] * c1 - L1[2] * s1, vz = L1[0] * s1 + L1[2] * c1, vyy = L1[1] * c2 - vz * s2; vz = L1[1] * s2 + vz * c2;
            var ku = D / (D + uz), kv = D / (D + vz);
            ctx.moveTo(cx + ux * R * ku, cy + uy * R * ku); ctx.lineTo(cx + vx * R * kv, cy + vyy * R * kv);
          }
          ctx.stroke();
        }
      }
      if (sig.length) {
        ctx.strokeStyle = rgba(pal.signal, 0.95); ctx.lineWidth = 1.8; ctx.beginPath();
        for (i = 0; i < sig.length; i++) {
          var g = sig[i], ga = OWN[g.a], gb = OWN[g.b], t0 = Math.max(0, g.t - 0.5);
          ctx.moveTo(cx + SX[ga] + (SX[gb] - SX[ga]) * t0, cy + SY[ga] + (SY[gb] - SY[ga]) * t0);
          ctx.lineTo(cx + SX[ga] + (SX[gb] - SX[ga]) * g.t, cy + SY[ga] + (SY[gb] - SY[ga]) * g.t);
        }
        ctx.stroke();
      }
      // scout trails
      if (SCOUTS.length) {
        ctx.lineWidth = 1.2;
        for (i = 0; i < SCOUTS.length; i++) {
          var sc = SCOUTS[i], tr = sc.trail, len = Math.min(sc.count, TRAIL);
          for (j = 1; j < len; j++) {
            var h0 = (sc.head - j + 1 + TRAIL) % TRAIL, h1 = (sc.head - j + TRAIL) % TRAIL;
            ctx.strokeStyle = rgba(pal.signal, 0.5 * (1 - j / TRAIL) * sc.fade);
            ctx.beginPath(); ctx.moveTo(tr[h0 * 2], tr[h0 * 2 + 1]); ctx.lineTo(tr[h1 * 2], tr[h1 * 2 + 1]); ctx.stroke();
          }
        }
      }
      // points, crisp: identity transform, snapped to whole device pixels, batched by depth
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (k = 0; k <= BUCKETS; k++) bCount[k] = 0;
      var nh = 0, nl = 0;
      for (n = 0; n < N; n += stp) {
        if (GLOW[n] > 0.25 || SC[n] > 0) { litIdx[nl++] = n; continue; }
        if (HOT[n]) { hotIdx[nh++] = n; continue; }
        k = Math.max(0, Math.min(BUCKETS, Math.round((1 - ZZ[n]) / 2 * BUCKETS)));
        bIdx[k * N + bCount[k]++] = n;
      }
      // depth: far layers are small, dim and fogged; near layers are larger, saturated,
      // and get a one-pixel specular core, so the front reads sharp and the back recedes
      var fog = pal.fog || pal.point;
      for (k = 0; k <= BUCKETS; k++) {
        var cnt = bCount[k]; if (!cnt) continue;
        var f = k / BUCKETS, m = Math.pow(f, 0.85);
        var col = [Math.round(fog[0] + (pal.point[0] - fog[0]) * m), Math.round(fog[1] + (pal.point[1] - fog[1]) * m), Math.round(fog[2] + (pal.point[2] - fog[2]) * m)];
        ctx.fillStyle = rgba(col, 0.1 + 0.9 * Math.pow(f, 1.5)); ctx.beginPath();
        var sz = Math.max(1, Math.round((0.6 + 2.9 * Math.pow(f, 1.25)) * DPR)), half = sz / 2;
        for (j = 0; j < cnt; j++) {
          p = bIdx[k * N + j];
          ctx.rect(Math.round((cx + SX[p] + OX[p]) * DPR - half), Math.round((cy + SY[p] + OY[p]) * DPR - half), sz, sz);
        }
        ctx.fill();
        if (f > 0.55 && sz >= 3) {
          var core = Math.max(1, Math.round(sz * 0.38)), ch = core / 2;
          ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.5 * (f - 0.55) / 0.45) + ')'; ctx.beginPath();
          for (j = 0; j < cnt; j++) {
            p = bIdx[k * N + j];
            ctx.rect(Math.round((cx + SX[p] + OX[p]) * DPR - ch), Math.round((cy + SY[p] + OY[p]) * DPR - ch), core, core);
          }
          ctx.fill();
        }
      }
      ctx.fillStyle = pal.hot; ctx.beginPath();
      for (j = 0; j < nh; j++) {
        p = hotIdx[j]; var hs = Math.max(1, Math.round((ZZ[p] < 0 ? 2.6 : 1.4) * DPR));
        ctx.rect(Math.round((cx + SX[p] + OX[p]) * DPR - hs / 2), Math.round((cy + SY[p] + OY[p]) * DPR - hs / 2), hs, hs);
      }
      ctx.fill();
      // lit nodes (a signal just passed) and scouts: a bright core and a soft halo
      if (nl) {
        var hsprite = haloSprite();
        if (hsprite) for (j = 0; j < nl; j++) {
          p = litIdx[j]; var hz = (6 + 9 * Math.max(GLOW[p], SC[p] > 0 ? 0.8 : 0)) * DPR;
          ctx.drawImage(hsprite, (cx + SX[p] + OX[p]) * DPR - hz / 2, (cy + SY[p] + OY[p]) * DPR - hz / 2, hz, hz);
        }
        ctx.fillStyle = pal.hot; ctx.beginPath();
        for (j = 0; j < nl; j++) {
          p = litIdx[j]; var hc = Math.max(1, Math.round(2.2 * DPR));
          ctx.rect(Math.round((cx + SX[p] + OX[p]) * DPR - hc / 2), Math.round((cy + SY[p] + OY[p]) * DPR - hc / 2), hc, hc);
        }
        ctx.fill();
      }
      if (sig.length) {
        ctx.fillStyle = rgba(pal.head, 1); ctx.beginPath();
        var hh = Math.max(2, Math.round(3.2 * DPR));
        for (i = 0; i < sig.length; i++) {
          var g2 = sig[i], a2 = OWN[g2.a], b2 = OWN[g2.b];
          ctx.rect(Math.round((cx + SX[a2] + (SX[b2] - SX[a2]) * g2.t) * DPR - hh / 2), Math.round((cy + SY[a2] + (SY[b2] - SY[a2]) * g2.t) * DPR - hh / 2), hh, hh);
        }
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      for (i = 0; i < waves.length; i++) {
        var wv = waves[i]; ctx.strokeStyle = rgba(pal.point, Math.max(0, 0.45 * (1 - wv.t / 700))); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(wv.x, wv.y, wv.t, 0, TAU); ctx.stroke();
      }
    }

    function scoutTarget(sc, out) {
      var a = sc.a;
      out[0] = Math.cos(a) * sc.r; out[1] = Math.sin(a * 0.7 + sc.tilt) * 0.35 + sc.tilt * 0.2; out[2] = Math.sin(a) * sc.r;
    }
    var TT = [0, 0, 0];
    function update(dt, t) {
      var tn = now(), cur = S[shape], def = cur.def, T = cur.T, flowT = t / 1000, n, k;
      clock += dt;
      if (!introDone && tn - born > o.intro) introDone = true;
      if (introDone && o.cycle > 0 && cycleList.length > 1 && tn > autoAt && tn > pinnedUntil) {
        var ci = cycleList.indexOf(shape); setShape(cycleList[(ci + 1) % cycleList.length]);
      }
      for (var nm in S) S[nm].w += ((nm === shape ? 1 : 0) - S[nm].w) * Math.min(1, dt * 3);
      if (def.facing && !down) {
        // turn to face the viewer, then hold with a slow sway
        vy += (0 - vy) * Math.min(1, dt * 2.5);
        var base = Math.round(rotY / TAU) * TAU, want = base + Math.sin(clock * 0.42) * 0.38;
        rotY += (want - rotY) * Math.min(1, dt * 2.2);
        rotX += (-0.1 + Math.sin(clock * 0.31) * 0.06 - rotX) * Math.min(1, dt * 2);
      } else if (!down) {
        vy += (0.16 - vy) * Math.min(1, dt * 0.9);
        rotX += (-0.32 - rotX) * Math.min(1, dt * 0.6);
      }
      rotY += (vy + kick) * dt; kick *= Math.pow(0.12, dt);
      if (Math.abs(vy) > 7 && tn > spunAt) { spunAt = tn + 4000; if (o.onSpinout) o.onSpinout(); }

      // ---- autonomy: particles manage themselves ----
      if (AUTO > 0 && introDone) {
        // trade places with a neighbour now and then (the shape keeps reorganising itself)
        var swaps = dt * 3 * AUTO * settle;
        while (Math.random() < swaps) {
          swaps -= 1;
          var pa = Math.floor(Math.random() * N), pb = Math.max(0, Math.min(N - 1, pa + Math.floor((Math.random() - 0.5) * 240)));
          var ia = OWN[pa], ib = OWN[pb]; if (SC[ia] > 0 || SC[ib] > 0) continue;
          if (def.bright && (GLOW[ia] > 0.5 || GLOW[ib] > 0.5)) continue;
          OWN[pa] = ib; OWN[pb] = ia; TI[ia] = pb; TI[ib] = pa;
        }
        // scouts leave, orbit, come home
        if (SCOUTS.length < MAXSCOUTS && settle > 0.7 && Math.random() < dt * 0.9 * AUTO) {
          var si = Math.floor(Math.random() * N);
          if (!SC[si]) {
            SC[si] = between(Math.random, 3, 6);
            SCOUTS.push({ i: si, a: Math.atan2(Z[si], X[si]), w: between(Math.random, 0.5, 1.1) * (Math.random() < 0.5 ? -1 : 1),
              r: between(Math.random, 1.3, 1.6), tilt: between(Math.random, -0.6, 0.6), trail: f32(TRAIL * 2), head: 0, count: 0, fade: 0 });
          }
        }
      }
      for (k = SCOUTS.length - 1; k >= 0; k--) {
        var sc = SCOUTS[k]; SC[sc.i] -= dt; sc.a += sc.w * dt;
        sc.fade = Math.min(1, sc.fade + dt * 2) * (SC[sc.i] > 0.6 ? 1 : Math.max(0, SC[sc.i] / 0.6));
        sc.head = (sc.head + 1) % TRAIL; sc.count++;
        sc.trail[sc.head * 2] = cx + SX[sc.i] + OX[sc.i]; sc.trail[sc.head * 2 + 1] = cy + SY[sc.i] + OY[sc.i];
        if (SC[sc.i] <= 0) { SC[sc.i] = 0; GLOW[sc.i] = 1; SCOUTS.splice(k, 1); }
      }

      if (def.bright && settle > 0.25) {
        var lit = (0.5 + 0.32 * settle) * S[shape].w, br = def.bright;
        for (k = 0; k < br.length; k++) { var bn = OWN[br[k]]; if (!SC[bn] && GLOW[bn] < lit) GLOW[bn] = lit; }
      }
      // ---- physics: each particle is a damped spring toward its point, swirling in ----
      var breathe = 0.014 * AUTO, swirlK = 1.6;
      var near = o.interactive && pointerIn, waveOn = waves.length > 0;
      for (n = 0; n < N; n++) {
        var p = TI[n], tx, ty, tz;
        if (SC[n] > 0) {
          for (k = 0; k < SCOUTS.length; k++) if (SCOUTS[k].i === n) { scoutTarget(SCOUTS[k], TT); break; }
          tx = TT[0]; ty = TT[1]; tz = TT[2];
        } else {
          var fl = def.flow ? def.flow(p, flowT) : null;
          if (fl) { tx = fl[0]; ty = fl[1]; tz = fl[2]; } else { tx = T[p * 3]; ty = T[p * 3 + 1]; tz = T[p * 3 + 2]; }
          if (breathe) {
            var q = PH[n];
            tx += breathe * Math.sin(clock * 1.3 + q); ty += breathe * Math.sin(clock * 1.1 + q * 1.7); tz += breathe * Math.cos(clock * 0.9 + q * 0.6);
          }
        }
        var om = W[n] * (introDone ? 1 : 0.55), damp = 1.5 * om;
        var ex = tx - X[n], ey = ty - Y[n], ez = tz - Z[n];
        var dist = Math.abs(ex) + Math.abs(ey) + Math.abs(ez), sw = swirlK * Math.min(1, dist);
        VX[n] += (om * om * ex - damp * VX[n] - ez * sw) * dt;
        VY[n] += (om * om * ey - damp * VY[n]) * dt;
        VZ[n] += (om * om * ez - damp * VZ[n] + ex * sw) * dt;
        X[n] += VX[n] * dt; Y[n] += VY[n] * dt; Z[n] += VZ[n] * dt;
        if (near) {
          var dx = cx + SX[n] + OX[n] - mx, dy = cy + SY[n] + OY[n] - my, d2 = dx * dx + dy * dy;
          if (d2 < 8100 && d2 > 0.01) { var d = Math.sqrt(d2), f = (1 - d / 90); f = f * f * 7; OX[n] += dx / d * f; OY[n] += dy / d * f; if (f > 2) GLOW[n] = Math.max(GLOW[n], 0.4); }
        }
        if (waveOn) {
          for (var wq = 0; wq < waves.length; wq++) {
            var wv = waves[wq], wx = cx + SX[n] - wv.x, wy = cy + SY[n] - wv.y, ed = Math.sqrt(wx * wx + wy * wy), band = ed - wv.t;
            if (band > -20 && band < 6 && ed > 0.1) { var push = (1 - Math.abs(band + 7) / 20) * 5; OX[n] += wx / ed * push; OY[n] += wy / ed * push; GLOW[n] = Math.max(GLOW[n], 0.5); }
          }
        }
        OX[n] *= 0.9; OY[n] *= 0.9;
        if (GLOW[n] > 0) GLOW[n] = Math.max(0, GLOW[n] - dt * 1.6);
      }
      for (var w = waves.length - 1; w >= 0; w--) { waves[w].t += dt * 620; if (waves[w].t > 700) waves.splice(w, 1); }
      // how close is the field to its shape? sample 64 particles
      var err = 0, stride = Math.max(1, Math.floor(N / 64)), cnt = 0;
      for (n = 0; n < N; n += stride) {
        if (SC[n] > 0) continue;
        var pp = TI[n], fq = def.flow ? def.flow(pp, flowT) : null;
        err += Math.abs((fq ? fq[0] : T[pp * 3]) - X[n]) + Math.abs((fq ? fq[1] : T[pp * 3 + 1]) - Y[n]) + Math.abs((fq ? fq[2] : T[pp * 3 + 2]) - Z[n]); cnt++;
      }
      // breathing is part of being in shape, so it doesn't count as error
      var target = cnt ? Math.max(0, Math.min(1, 1 - Math.max(0, err / cnt - breathe * 2.2) * 4)) : 1;
      settle += (target - settle) * Math.min(1, dt * 6);
      // signals: fire on their own; each node they reach lights up
      if (cur.adj && Math.random() < dt * (6 + 8 * AUTO)) fire(shape, Math.floor(Math.random() * N));
      for (var s = sig.length - 1; s >= 0; s--) {
        var g = sig[s]; if (g.sh !== shape) { sig.splice(s, 1); continue; }
        g.t += dt * 3.2;
        if (g.t >= 1) {
          if (AUTO) GLOW[OWN[g.b]] = Math.max(GLOW[OWN[g.b]], 0.6 + 0.4 * AUTO);
          var adj = S[g.sh].adj[g.b];
          if (--g.hops > 0 && adj.length) { g.a = g.b; g.b = adj[Math.floor(Math.random() * adj.length)]; g.t = 0; } else sig.splice(s, 1);
        }
      }
    }
    // the governor: holds the frame rate by walking a quality ladder, and walks back up
    function govern() {
      if (o.quality !== 'auto') return;
      var was = level;
      if (fps < o.fpsFloor && level < LADDER.length - 1) { level++; good = 0; }
      else if (fps >= 57 && level > 0) { if (++good >= 3) { level--; good = 0; } }
      else good = 0;
      if (level !== was && LADDER[level][1] !== LADDER[was][1]) layout();
    }
    function frame(t) {
      raf = 0; if (!running) return;
      var dt = Math.min(0.05, (t - (last || t)) / 1000) || 0.016; last = t;
      update(dt, t); draw(t);
      fAcc += dt; fN++;
      if (fAcc >= 1) {
        fps = Math.round(fN / fAcc); fAcc = 0; fN = 0;
        govern();
        if (o.onStats) o.onStats({ fps: fps, nodes: Math.ceil(N / step()), quality: level });
      }
      raf = win.requestAnimationFrame(frame);
    }
    function sync() {
      var want = wanted && !destroyed && !reduced && (!o.autoPause || (!doc.hidden && inView));
      if (want && !running) { running = true; last = 0; if (!raf) raf = win.requestAnimationFrame(frame); }
      else if (!want && running) { running = false; if (raf) { win.cancelAnimationFrame(raf); raf = 0; } }
    }
    function snap(name) {
      var T = S[name].T;
      for (var n = 0; n < N; n++) { var p = TI[n]; X[n] = T[p * 3]; Y[n] = T[p * 3 + 1]; Z[n] = T[p * 3 + 2]; VX[n] = VY[n] = VZ[n] = 0; }
      settle = 1;
    }
    function setShape(name, opt) {
      if (!S[name]) throw new Error('aurora-field: shape "' + name + '" is not in this field');
      var pin = opt && opt.pin;
      if (pin) pinnedUntil = now() + (pin === true ? o.pin : pin);
      autoAt = now() + o.cycle;
      if (name === shape) return api;
      shape = name; kick += S[name].def.kick || 0.6; sig.length = 0;
      if (reduced) { for (var nm in S) S[nm].w = nm === name ? 1 : 0; snap(name); draw(0); }
      if (o.onShape) o.onShape(name);
      return api;
    }

    // ---- input ----
    function pos(e) { var b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
    if (o.interactive) {
      on(canvas, 'pointermove', function (e) {
        var p = pos(e); mx = p[0]; my = p[1]; par = mx / (CW || 1) - 0.5;
        pointerIn = Math.abs(mx - cx) < R * 1.8 + 90 && Math.abs(my - cy) < R * 1.8 + 90;
        if (down) {
          var dx = p[0] - down[0];
          vy = dx * 0.06 * 60 / Math.max(16, now() - down[2] + 16);
          rotY += dx * 0.006; rotX = Math.max(-1.1, Math.min(0.6, rotX + (p[1] - down[1]) * 0.004));
          down = [p[0], p[1], now(), down[3] + Math.abs(dx) + Math.abs(p[1] - down[1])];
          if (!running) draw(0);
        }
      });
      on(canvas, 'pointerleave', function () { mx = my = -1e4; pointerIn = false; });
      on(canvas, 'pointerdown', function (e) {
        var p = pos(e); down = [p[0], p[1], now(), 0]; canvas.setAttribute('data-dragging', '');
        if (e.pointerType !== 'touch' && canvas.setPointerCapture) try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      });
      on(canvas, 'pointerup', function (e) {
        if (!down) return; var moved = down[3]; down = null; canvas.removeAttribute('data-dragging');
        if (moved < 6) { var p = pos(e); waves.push({ x: p[0], y: p[1], t: 0 }); if (waves.length > 4) waves.shift(); kick += 0.8; burst(); }
        if (e.pointerType === 'touch') { mx = my = -1e4; pointerIn = false; }
      });
      on(canvas, 'pointercancel', function () { down = null; canvas.removeAttribute('data-dragging'); });
    }
    var io = null;
    if (o.autoPause) {
      if (win.IntersectionObserver) { io = new win.IntersectionObserver(function (es) { inView = es[0].isIntersecting; sync(); }); io.observe(container); }
      on(doc, 'visibilitychange', sync);
    }
    on(win, 'resize', function () { layout(); });

    var api = {
      version: VERSION,
      get shape() { return shape; },
      shapes: names.slice(),
      setShape: setShape,
      next: function () { var ci = cycleList.indexOf(shape); return setShape(cycleList[(ci + 1) % cycleList.length], { pin: true }); },
      play: function () { wanted = true; layout(); sync(); return api; },
      pause: function () { wanted = false; sync(); return api; },
      resize: function () { layout(); return api; },
      stats: function () { return { fps: fps, nodes: Math.ceil(N / step()), running: running, reduced: reduced, shape: shape, quality: level, scouts: SCOUTS.length, settle: Math.round(settle * 100) / 100 }; },
      destroy: function () {
        destroyed = true; sync();
        for (var l = 0; l < listeners.length; l++) listeners[l][0].removeEventListener(listeners[l][1], listeners[l][2], listeners[l][3]);
        if (io) io.disconnect();
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    born = now(); autoAt = born + o.intro + o.cycle;
    if (reduced) snap(shape);
    layout();
    sync();
    return api;
  }

  // pure: build a shape without a canvas (tests, previews, custom renderers)
  function build(name, n, seed) {
    if (!SHAPES[name]) throw new Error('aurora-field: unknown shape "' + name + '"');
    return SHAPES[name](n, rng(seed == null ? 1 : seed));
  }

  return { version: VERSION, create: create, register: register, build: build, shapes: function () { return ORDER.slice(); }, defaults: DEFAULTS };
});
