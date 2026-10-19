// Zero-dependency tests: node test/run.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const AF = require('../src/aurora-field.js');
const src = readFileSync(new URL('../src/aurora-field.js', import.meta.url), 'utf8');
let passed = 0;
const pending = [];
function test(name, fn) {
  const ok = () => { passed++; console.log('  ✓ ' + name); }, bad = e => { console.error('  ✗ ' + name + '\n    ' + (e && e.stack || e)); process.exitCode = 1; };
  try { const r = fn(); if (r && r.then) pending.push(r.then(ok, bad)); else ok(); } catch (e) { bad(e); }
}

console.log('aurora-field ' + AF.version);

test('version matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(AF.version, pkg.version);
  assert.ok(src.startsWith('/*! aurora-field v' + pkg.version + ' '), 'banner carries the version');
});

test('ships the five built-in shapes, in order', () => {
  assert.deepEqual(AF.shapes(), ['mind', 'teams', 'platforms', 'helm', 'ranger']);
});

for (const name of ['mind', 'teams', 'platforms', 'helm', 'ranger']) {
  test(name + ': n finite points inside a 1.3 box', () => {
    for (const n of [64, 900, 1600]) {
      const s = AF.build(name, n, 7);
      assert.equal(s.points.length, n);
      for (const p of s.points) {
        assert.equal(p.length, 3);
        for (const c of p) { assert.ok(Number.isFinite(c)); assert.ok(Math.abs(c) <= 1.3, name + ' coordinate ' + c); }
      }
    }
  });
  test(name + ': same seed, same field', () => {
    assert.deepEqual(AF.build(name, 300, 42).points, AF.build(name, 300, 42).points);
  });
}

test('mind: synapses point at real particles, no self-edges', () => {
  const s = AF.build('mind', 900, 3);
  assert.ok(s.pairs.length > 900 * 0.82 * 0.4, 'edges for most surface points, got ' + s.pairs.length);
  for (const [a, b] of s.pairs) { assert.ok(a >= 0 && b < 900 && a !== b); }
});

test('teams: a lead linked to six', () => {
  const s = AF.build('teams', 700, 3);
  assert.equal(s.links.length, 12);
  assert.ok(s.links.slice(0, 1).every(l => l[0].every(c => c === 0)));
});

test('platforms: streams flow upward and wrap', () => {
  const s = AF.build('platforms', 900, 3);
  const a = s.flow(0, 0), b = s.flow(0, 1);
  assert.ok(a && b && b[1] !== a[1]);
  for (let t = 0; t < 20; t += 0.37) { const y = s.flow(0, t)[1]; assert.ok(y >= -0.8 && y <= 0.8); }
  assert.equal(s.flow(899, 0), null, 'layer points are static');
});

test('helm: faces forward, eyes glow from the front, seams carry signals', () => {
  for (const n of [600, 900, 1600]) {
    const s = AF.build('helm', n, 4);
    assert.equal(s.facing, true);
    assert.ok(s.bright.length >= n * 0.05, 'eye points ' + s.bright.length);
    for (const i of s.bright) { const p = s.points[i]; assert.ok(p[2] < -0.3 && p[1] < 0.02 && p[1] > -0.2, 'eye at ' + p + ' (camera space: -z is toward the viewer, -y is up)'); }
    for (const [a, b] of s.pairs) assert.ok(a >= 0 && b < n && a !== b);
    assert.ok(s.pairs.length > n * 0.12);
    const ys = s.points.map(p => p[1]);
    assert.ok(Math.min(...ys) < -0.8 && Math.max(...ys) > 0.8, 'shell covers crown to jaw');
  }
});

test('rotation: only listed shapes auto-cycle; unknown ones are refused', () => {
  const env = stubEnv();
  const seen = [];
  const f = AF.create(env.canvas, { seed: 1, count: 300, intro: 0, cycle: 1, shapes: ['mind', 'teams', 'helm'], rotation: ['mind', 'teams'], onShape: s => seen.push(s) });
  for (let k = 0; k < 30; k++) env.pump(3, 1000 + k * 100);
  assert.ok(seen.length > 0 && !seen.includes('helm'));
  f.setShape('helm'); assert.equal(f.shape, 'helm');
  f.destroy();
  assert.throws(() => AF.create(stubEnv().canvas, { shapes: ['mind'], rotation: ['teams'] }), /not in shapes/);
});

test('register: custom shapes join the cycle; bad ones are refused', () => {
  AF.register('ring', (n) => ({ points: Array.from({ length: n }, (_, i) => [Math.cos(i / n * 6.283), 0, Math.sin(i / n * 6.283)]) }));
  assert.ok(AF.shapes().includes('ring'));
  assert.equal(AF.build('ring', 10).points.length, 10);
  assert.throws(() => AF.register('nope', 42), /build function/);
  assert.throws(() => AF.build('missing', 10), /unknown shape/);
});

test('source stays ES5 (it gets inlined into ES5-only pages)', () => {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/'(?:\\.|[^'\\])*'/g, "''");
  for (const [re, what] of [[/=>/, 'arrow function'], [/\b(let|const)\s/, 'let/const'], [/`/, 'template literal'],
    [/\bclass\s+\w/, 'class'], [/\?\./, 'optional chaining'], [/\.\.\.\w/, 'spread'], [/\basync\b|\bawait\b/, 'async']]) {
    assert.ok(!re.test(code), 'found ' + what);
  }
});

// ---- create() against a stub canvas: wiring, lifecycle, callbacks ----
function stubEnv({ reduce = false, gl = false } = {}) {
  const calls = { raf: 0, points: null }, listeners = [];
  // a recording WebGL stub: keeps the last point batch (8 floats a point: x, y, size, rgba, kind)
  let bound = null, nbuf = 0;
  const glStub = gl ? new Proxy({
    getParameter: () => [1, 1024], getShaderParameter: () => true, getProgramParameter: () => true, getExtension: () => null,
    createBuffer: () => ({ id: ++nbuf }), bindBuffer: (t, b) => { bound = b; },
    bufferSubData: (t, o, data) => { if (bound && bound.id === 1) calls.points = Array.from(data); },
  }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[A-Z_0-9]+$/.test(k) ? 1 : () => ({})) ) }) : null;
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => (t[k] = v, true) });
  const el = (w, h) => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }), addEventListener: (e, f) => listeners.push(e), removeEventListener() {} });
  const queue = [];
  const win = {
    innerWidth: 1200, devicePixelRatio: 2,
    matchMedia: (q) => ({ matches: reduce && /reduced-motion/.test(q) }),
    requestAnimationFrame: (f) => { calls.raf++; queue.push(f); return queue.length; },
    cancelAnimationFrame() {}, addEventListener: (e) => listeners.push(e), removeEventListener() {},
  };
  const doc = { hidden: false, defaultView: win, addEventListener: (e) => listeners.push(e), removeEventListener() {} };
  const container = el(1200, 800);
  const canvas = Object.assign(el(1200, 800), { ownerDocument: doc, parentNode: container, getContext: (type) => (type === '2d' ? (gl ? null : ctx) : (gl ? glStub : null)), setAttribute() {}, removeAttribute() {} });
  const pump = (n, t0 = 1000, ms = 16.7) => { for (let i = 0; i < n; i++) { const q = queue.splice(0); q.forEach(f => f(t0 + i * ms)); } };
  return { canvas, container, win, calls, listeners, pump };
}

test('create: runs, morphs on setShape, reports shapes, cleans up', () => {
  const env = stubEnv();
  const seen = [];
  const f = AF.create(env.canvas, { seed: 5, count: 400, shapes: ['mind', 'teams', 'platforms'], onShape: (s) => seen.push(s) });
  assert.equal(f.shape, 'mind');
  env.pump(30);
  assert.ok(f.stats().running);
  f.setShape('teams', { pin: true });
  env.pump(10);
  assert.deepEqual(seen, ['teams']);
  assert.equal(f.next().shape, 'platforms');
  assert.throws(() => f.setShape('ring-of-fire'), /not in this field/);
  f.pause(); assert.equal(f.stats().running, false);
  f.play(); assert.equal(f.stats().running, true);
  f.destroy(); assert.equal(f.stats().running, false);
  assert.ok(env.listeners.includes('pointerdown') && env.listeners.includes('visibilitychange'));
});

test('create: reduced motion draws one still frame and never animates', () => {
  const env = stubEnv({ reduce: true });
  const f = AF.create(env.canvas, { count: 200 });
  assert.equal(f.stats().reduced, true);
  assert.equal(f.stats().running, false);
  assert.equal(env.calls.raf, 0);
});

test('physics: the field converges onto its shape and stays finite', () => {
  const env = stubEnv();
  const f = AF.create(env.canvas, { seed: 9, count: 500, intro: 0, cycle: 0 });
  env.pump(420);
  const st = f.stats();
  assert.ok(st.settle > 0.85, 'settle ' + st.settle);
  f.destroy();
});

test('autonomy: scouts go out and come home; autonomy 0 keeps everyone in', () => {
  const env = stubEnv();
  const f = AF.create(env.canvas, { seed: 2, count: 1600, intro: 0, cycle: 0 });
  let most = 0; for (let k = 0; k < 40; k++) { env.pump(60, 1000 + k * 1002); most = Math.max(most, f.stats().scouts); }
  assert.ok(most > 0 && most <= Math.round(1600 * 0.008), 'scouts ' + most);
  f.destroy();
  const env2 = stubEnv();
  const g = AF.create(env2.canvas, { seed: 2, count: 1600, intro: 0, cycle: 0, autonomy: 0 });
  env2.pump(1200); assert.equal(g.stats().scouts, 0); g.destroy();
});

test('governor: a slow device steps quality down, a fast one never does', () => {
  const slow = stubEnv();
  const f = AF.create(slow.canvas, { seed: 1, count: 300 });
  slow.pump(200, 1000, 40);              // 25 fps
  assert.ok(f.stats().quality >= 2, 'quality ' + f.stats().quality);
  assert.ok(f.stats().nodes < 300);
  f.destroy();
  const fast = stubEnv();
  const g = AF.create(fast.canvas, { seed: 1, count: 300 });
  fast.pump(400); assert.equal(g.stats().quality, 0); g.destroy();
  const pinned = stubEnv();
  const h = AF.create(pinned.canvas, { seed: 1, count: 300, quality: 'high' });
  pinned.pump(200, 1000, 40); assert.equal(h.stats().quality, 0); h.destroy();
});

test('renderer: falls back to canvas-2D without WebGL; pose drives a facing shape', () => {
  const env = stubEnv();
  const f = AF.create(env.canvas, { seed: 3, count: 600, shapes: ['helm'], cycle: 0, intro: 0 });
  assert.equal(f.stats().renderer, '2d');
  f.setPose({ yaw: 0.4, pitch: -0.2, roll: 0.1, eyes: 0.5 }); env.pump(60);
  f.setPose(null); env.pump(10);
  assert.ok(f.stats().settle >= 0);
  f.destroy();
});

test('overlays: the helm declares anchors that follow its turn', () => {
  const sh = AF.build('helm', 900, 1);
  for (const k of ['tab', 'eyeL', 'eyeR', 'mouth', 'chin', 'earL', 'earR']) assert.ok(sh.anchors[k] && sh.anchors[k].every(Number.isFinite), k);
  assert.ok(sh.anchors.eyeL[0] < 0 && sh.anchors.eyeR[0] > 0, 'eyeL is on screen-left');
  assert.ok(sh.anchors.eyeL[2] < 0, 'eyes face the viewer');
  const env = stubEnv();
  const f = AF.create(env.canvas, { seed: 3, count: 600, shapes: ['helm'], cycle: 0, intro: 0 });
  env.pump(40);
  const a = f.anchors(), v = f.view();
  assert.ok(a.eyeL.x < a.eyeR.x, 'left eye projects left of the right eye');
  assert.ok(a.tab.y < a.mouth.y, 'forehead above the mouth');
  assert.ok(v.radius > 0 && Number.isFinite(v.yaw));
  f.setPose({ yaw: 0.9, pitch: 0, roll: 0 }); env.pump(80);
  const b = f.anchors();
  assert.ok(b.earL.z < b.earR.z, 'turning right brings the left ear forward');
  f.destroy();
});

test('ranger: a two-tone helmet — gold accent seams, a glowing visor, anchors', () => {
  const s = AF.build('ranger', 1600, 3);
  assert.equal(s.tone.length, 1600);
  const gold = s.tone.filter(t => t === 1).length;
  assert.ok(gold > 200 && gold < 1200, 'gold seams are a part, not all: ' + gold);
  assert.ok(s.bright.length > 100, 'the visor glows');
  assert.ok(s.linkTone.length === s.links.length);
  assert.ok(s.anchors.eyeL[0] < 0 && s.anchors.eyeR[0] > 0);
});

test('armour: build your own helmet from a spec', () => {
  const b = AF.armour({ sil: [[172, 40], [400, 330], [800, 300], [1126, 90]], lines: [{ p: [[300, 600], [724, 600]], tone: 1 }], fills: [{ p: [[300, 580], [500, 580], [500, 640], [300, 640]], share: 0.05, mirror: true }] });
  const s = b(800, () => 0.5);
  assert.equal(s.points.length, 800);
  assert.ok(s.points.every(p => p.every(Number.isFinite)));
});

test('palettes: presets by name, two-tone accents, unknown names throw', () => {
  for (const name of ['aurora', 'mark-iii', 'ranger', 'verse', 'barbenheimer', 'upside-down', 'night-city', 'spice']) assert.ok(AF.palettes[name], name);
  for (const [name, p] of Object.entries(AF.palettes)) if (name !== 'aurora') assert.ok(p.point && p.hot && p.glow && p.fog, name + ' is complete');
  for (const name of ['mark-iii', 'ranger', 'verse', 'barbenheimer', 'upside-down', 'night-city', 'spice']) assert.ok(AF.palettes[name].accent, name + ' is two-tone');
  const env = stubEnv();
  assert.throws(() => AF.create(env.canvas, { palette: 'nope', count: 50 }), /unknown palette/);
  const f = AF.create(env.canvas, { palette: 'verse', count: 300, shapes: ['ranger'], cycle: 0 });
  env.pump(10); f.set({ palette: 'ranger' }); env.pump(5); f.set({ palette: { point: [1, 2, 3] } }); env.pump(5);
  f.destroy();
});

test('set(): live options; on/off events; settled fires once a shape arrives', () => {
  const env = stubEnv();
  const seen = { shape: [], settled: 0, stats: 0 };
  const f = AF.create(env.canvas, { seed: 2, count: 400, shapes: ['mind', 'teams'], cycle: 0, intro: 0 });
  f.on('shape', s => seen.shape.push(s)).on('settled', () => seen.settled++).on('stats', () => seen.stats++);
  env.pump(240);
  assert.ok(seen.settled >= 1, 'settled');
  assert.ok(seen.stats >= 1, 'stats');
  f.set({ autonomy: 0, depth: 2, cycle: 1000, quality: 'low', rotation: ['teams'] });
  assert.throws(() => f.set({ rotation: ['nope'] }), /not in shapes/);
  f.setShape('teams'); assert.deepEqual(seen.shape, ['teams']);
  const n = seen.shape.length; f.off('shape'); f.setShape('mind'); assert.equal(seen.shape.length, n);
  f.destroy();
});

test('pointer(): input without DOM events drags, pulses and parts', () => {
  const env = stubEnv();
  const f = AF.create(env.canvas, { seed: 2, count: 300, shapes: ['mind'], cycle: 0, intro: 0 });
  env.pump(20);
  const y0 = f.view().yaw;
  f.pointer('down', 600, 400).pointer('move', 700, 400).pointer('up', 700, 400);
  assert.notEqual(f.view().yaw, y0, 'a drag turns it');
  f.pointer('pulse', 600, 400).pointer('leave'); env.pump(10);
  assert.ok(f.stats().settle >= 0);
  f.destroy();
});

test('headless: a canvas with no document (OffscreenCanvas, servers) runs from width/height', () => {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => (t[k] = v, true) });
  const canvas = { width: 0, height: 0, getContext: t => (t === '2d' ? ctx : null) };
  const g = globalThis; const had = g.requestAnimationFrame; const q = [];
  g.requestAnimationFrame = f => (q.push(f), q.length); g.cancelAnimationFrame = () => {};
  try {
    const f = AF.create(canvas, { width: 640, height: 480, dpr: 2, count: 300, shapes: ['ranger'], palette: 'ranger', cycle: 0 });
    assert.equal(f.stats().headless, true);
    assert.equal(canvas.width, 1280); assert.equal(canvas.height, 960);
    for (let i = 0; i < 30; i++) q.splice(0).forEach(fn => fn(1000 + i * 16));
    f.resize(320, 240, 1); assert.equal(canvas.width, 320);
    const a = f.anchors(); assert.ok(a.eyeL.x > 0 && a.eyeL.x < 320);
    f.destroy();
  } finally { g.requestAnimationFrame = had; delete g.cancelAnimationFrame; }
});

test('factories: points, SVG paths (curves, relative commands), images', () => {
  const pts = AF.fromPoints([[0, 0], [10, 0], [5, 8]])(90, Math.random);
  assert.equal(pts.points.length, 90);
  const sub = AF.parsePath('M10 10 h20 v20 h-20 Z m40 0 c10 0 10 20 0 20 q-10 -10 0 -20 z');
  assert.equal(sub.length, 2); assert.ok(sub[0].closed && sub[1].closed && sub[1].p.length > 20);
  const star = AF.fromSVG('M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z', { tone: [1] })(700, Math.random);
  assert.equal(star.points.length, 700); assert.ok(star.pairs.length > 100);
  for (const p of star.points) for (const c of p) assert.ok(Math.abs(c) <= 1.05);
  const W = 40, H = 20, data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { const v = (i % W) > 10 && (i % W) < 30 ? 255 : 0; data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  const img = AF.fromImage({ width: W, height: H, data }, { tone: 'luma' })(500, Math.random);
  assert.equal(img.points.length, 500);
  assert.throws(() => AF.fromImage({ width: 2, height: 2, data: new Uint8ClampedArray(16) }), /no pixels/);
  AF.register('tri', [[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
  assert.equal(AF.build('tri', 33, 1).points.length, 33);
});

test('dist: the ES module build matches the source', async () => {
  const m = await import('../dist/aurora-field.mjs');
  assert.equal(m.default.version, AF.version);
  for (const k of ['create', 'register', 'fromSVG', 'fromText', 'armour', 'offload', 'palettes']) assert.ok(m[k], k);
});

test('face rig: helmets move eyelids, jaw, lips, cheeks, chin and brows', () => {
  for (const name of ['helm', 'ranger']) {
    const s = AF.build(name, 1600, 3), P = s.rig.P;
    for (const ch of ['eyeBlinkL', 'eyeBlinkR', 'jawOpen', 'smileL', 'smileR', 'pucker', 'press', 'mouthL', 'mouthR', 'chinRaise', 'cheekPuff', 'squintL', 'squintR', 'browUp', 'browDownL', 'browDownR'])
      assert.ok(P[ch] && P[ch].some(v => v !== 0), name + ' rigs ' + ch);
    let down = 0; for (let i = 0; i < 1600; i++) if (P.jawOpen[i * 3 + 1] > 0) down++;
    assert.ok(down > 20, name + ': the jaw drops points');
    let lx = 0, rx = 0; for (let i = 0; i < 1600; i++) { if (P.eyeBlinkL[i * 3 + 1]) lx += s.points[i][0]; if (P.eyeBlinkR[i * 3 + 1]) rx += s.points[i][0]; }
    assert.ok(lx < 0 && rx > 0, name + ': the left lid is on screen-left');
    assert.ok(s.rig.dim.eyeBlinkL.length && s.rig.dim.eyeBlinkR.length);
    for (let i = 0; i < 1600; i++) if (s.points[i][2] > 0) assert.equal(P.jawOpen[i * 3 + 1], 0, 'the back of the head never moves');
  }
  const env = stubEnv();
  const f = AF.create(env.canvas, { seed: 2, count: 800, shapes: ['ranger'], cycle: 0, intro: 0 });
  env.pump(60);
  f.setFace({ jawOpen: 1, eyeBlinkL: 1, smileL: 0.5 }); env.pump(30);
  f.setPose({ yaw: 0.2, pitch: 0, roll: 0, face: { pucker: 1 } }); env.pump(20);
  f.setPose(null); env.pump(40);
  assert.ok(f.stats().settle > 0);
  f.destroy();
});

test('light: helmets carry unit normals, a lit skin of surfels, and faint skin alpha', () => {
  for (const name of ['helm', 'ranger']) {
    const n = 3000, s = AF.build(name, n, 5);
    assert.equal(s.normals.length, n); assert.equal(s.alpha.length, n); assert.equal(s.surfel.length, n);
    for (const v of s.normals) assert.ok(Math.abs(Math.hypot(v[0], v[1], v[2]) - 1) < 1e-6, 'unit normal');
    const skin = []; for (let i = 0; i < n; i++) if (s.surfel[i] > 0) skin.push(i);
    assert.ok(skin.length > n * 0.25, name + ': a skin, not just seams (' + skin.length + ')');
    let front = 0, out = 0, back = 0;
    for (const i of skin) { const p = s.points[i], v = s.normals[i]; if (p[2] < -0.2) { front++; if (v[2] < 0) out++; } if (p[2] > 0.2) back++; }
    assert.ok(out / front > 0.97, name + ': front skin faces the viewer');
    assert.ok(back > skin.length * 0.25, name + ': the skin wraps the back of the head');
    assert.ok(s.alpha.some(a => a < 1) && s.alpha.some(a => a === 1), 'seams stay crisp, the skin is fainter');
  }
  // the gold faceplate is a panel: front skin inside it takes the accent tone
  const h = AF.build('helm', 3000, 5); let gold = 0; for (let i = 0; i < 3000; i++) if (h.surfel[i] > 0 && h.tone[i] === 1) gold++;
  assert.ok(gold > 100, 'helm: a gold faceplate (' + gold + ')');
  const kinds = () => { const P = envG.calls.points, k = {}; for (let i = 7; i < P.length; i += 8) k[P[i]] = (k[P[i]] || 0) + 1; return k; };
  const envG = stubEnv({ gl: true });
  const g = AF.create(envG.canvas, { seed: 2, count: 900, shapes: ['helm', 'mind'], cycle: 0, intro: 0 });
  envG.pump(90);
  assert.equal(g.stats().renderer, 'webgl');
  assert.ok(kinds()[3] > 200, 'webgl: the lit skin paints surfels (' + kinds()[3] + ')');
  g.set({ surfels: false }); envG.pump(2); assert.ok(!kinds()[3], 'surfels: false turns them off');
  g.set({ surfels: true }); g.setShape('mind'); envG.pump(90); assert.ok(!kinds()[3], 'shapes without a skin paint none');
  g.destroy();
  for (const renderer of ['webgl', '2d']) {
    const env = stubEnv({ gl: renderer === 'webgl' });
    const f = AF.create(env.canvas, { seed: 2, count: 900, shapes: ['helm', 'mind'], cycle: 0, intro: 0, renderer });
    assert.equal(f.stats().renderer, renderer);
    env.pump(40); f.set({ light: { dir: [1, 0, -1], rim: 0 } }); env.pump(10);
    f.set({ light: false }); env.pump(10); f.set({ light: true, surfels: false }); env.pump(10);
    f.setShape('mind'); env.pump(30);
    assert.ok(f.stats().settle >= 0); f.destroy();
  }
});

test('face: the solver mirrors the head, learns a resting face, and smooths', async () => {
  const { createSolver, OneEuro } = await import('../src/face-core.mjs');
  const yawM = a => [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
  const s = createSolver({ smoothing: false });
  const p = s.solve(yawM(0.3), [['eyeBlinkLeft', 0.05], ['jawOpen', 0.02]], 0);
  assert.ok(Math.abs(p.yaw + 0.3) < 1e-6, 'mirrored like a selfie');
  for (let i = 0; i < 40; i++) s.solve(yawM(0), [['eyeBlinkLeft', 0.2], ['jawOpen', 0.04]], i * 33);
  const rest = s.solve(yawM(0), [['eyeBlinkLeft', 0.2], ['jawOpen', 0.04]], 2000);
  assert.ok(rest.face.eyeBlinkL < 0.05 && rest.face.jawOpen < 0.05, 'a resting face reads as zero');
  const wink = s.solve(yawM(0), [['eyeBlinkLeft', 0.9], ['jawOpen', 0.6]], 2033);
  assert.ok(wink.face.eyeBlinkL > 0.9 && wink.face.jawOpen > 0.9 && wink.face.eyeBlinkR === 0, 'a wink and an open mouth read as ~1');
  assert.ok(wink.eyes < 0.6);
  const s2 = createSolver({ smoothing: false, swap: true }); s2.solve(yawM(0), [['eyeBlinkLeft', 0.02]], 0);
  const sw = s2.solve(yawM(0), [['eyeBlinkLeft', 0.9]], 33);
  assert.ok(sw.face.eyeBlinkR > 0.5 && sw.face.eyeBlinkL === 0, 'swap flips sides');
  assert.equal(s.solve(null, null), null);
  const f = new OneEuro(1, 0); let x = 0; for (let t = 0; t < 1000; t += 16) x = f.filter(t % 32 ? 1 : -1, t);
  assert.ok(Math.abs(x) < 0.6, 'jitter is damped');
  const g = new OneEuro(1, 0.5); let y = 0; for (let t = 0; t < 300; t += 16) y = g.filter(5, t);
  assert.ok(y > 4.5, 'a real move gets through quickly');
});

test('figure: every pose builds a line and a lit person, in the box, deterministic', () => {
  for (const pose of AF.poses) {
    const f = AF.figure({ pose, props: ['hardhat', 'tablet', 'wrench', 'pipe', 'toolbelt', 'tester', 'hammer', 'phone', 'clipboard', 'keys', 'yardsign'] });
    for (const kind of ['line', 'lit']) for (const n of [64, 900, 3000]) {
      const s = f[kind](n, () => 0.5);
      assert.equal(s.points.length, n, pose + ' ' + kind + ' ' + n);
      for (const p of s.points) for (const c of p) { assert.ok(Number.isFinite(c)); assert.ok(Math.abs(c) <= 1.3, pose + ' ' + kind + ' coordinate ' + c); }
      for (const [a, b] of s.pairs) assert.ok(a >= 0 && b >= 0 && a < n && b < n && a !== b);
      for (const k of ['head', 'chest', 'hand', 'feet', 'prop']) assert.ok(s.anchors[k], 'anchor ' + k);
      if (kind === 'lit') {
        for (const v of s.normals) assert.ok(Math.abs(Math.hypot(v[0], v[1], v[2]) - 1) < 1e-6, 'unit normal');
        assert.equal(s.surfel.length, n); assert.ok(s.alpha.some(a => a < 1) && s.alpha.some(a => a === 1), 'a skin under crisp seams');
      } else {
        const o = s.trace.order; assert.equal(o.length, n);
        for (const v of o) assert.ok(v >= 0 && v <= 1);
        for (const [a, b] of s.pairs) assert.ok(o[b] >= o[a], 'the pen moves forward along a stroke');
        assert.ok(s.lineArt && s.bright.length > 0);
      }
    }
  }
  const a = AF.figure({ pose: 'hammer', props: ['hammer'] }).lit(500, () => 0.3), b = AF.figure({ pose: 'hammer', props: ['hammer'] }).lit(500, () => 0.3);
  assert.deepEqual(a.points, b.points);
});

test('figure: the idle loop moves joints and carries their points, the hammer swings', () => {
  const s = AF.figure({ pose: 'hammer', props: ['hammer'] }).lit(1200, () => 0.4);
  const hand = s.points.findIndex((p, i) => i > 0 && Math.hypot(p[0] - s.anchors.hand[0], p[1] - s.anchors.hand[1], p[2] - s.anchors.hand[2]) < 0.05);
  assert.ok(hand >= 0);
  const at = t => s.flow(hand, t, t).slice();
  let travel = 0; for (let t = 0; t < 1.2; t += 0.1) travel = Math.max(travel, Math.hypot(...at(t).map((c, k) => c - at(0)[k])));
  assert.ok(travel > 0.05, 'the hand moves with the swing (' + travel.toFixed(3) + ')');
  const st = AF.figure({ pose: 'stand' }).lit(400, () => 0.4), d = Math.hypot(...st.flow(10, 3).map((c, k) => c - st.points[10][k]));
  assert.ok(d < 0.03, 'standing still is (nearly) still');
});

test('crew: registers six trades, drawn and lit, plus the whole crew; idempotent', () => {
  const before = AF.shapes().length;
  assert.deepEqual(AF.registerCrew(), AF.crew);
  assert.equal(AF.crew.length, 6);
  assert.equal(AF.shapes().length, before + 13);
  AF.registerCrew(); assert.equal(AF.shapes().length, before + 13, 'idempotent');
  for (const c of AF.crew) for (const k of ['line', 'lit']) assert.equal(AF.build('crew:' + c + ':' + k, 700, 3).points.length, 700);
  const all = AF.build('crew:all', 1800, 3);
  assert.equal(all.points.length, 1800); assert.ok(all.anchors['0.chest'] && all.anchors['5.prop']);
  assert.ok(all.flow(1799, 1) && all.flow(0, 1));
});

test('trace: a blank field draws a traced shape with the pen, says so once, and replays', async () => {
  AF.register('tfig:line', AF.figure({ pose: 'stand', trace: 40 }).line);
  AF.register('tfig:lit', AF.figure({ pose: 'stand' }).lit);
  for (const gl of [true, false]) {
    const env = stubEnv({ gl }), traced = [];
    const f = AF.create(env.canvas, { seed: 3, count: 600, shapes: ['tfig:line', 'tfig:lit', 'mind'], cycle: 0, intro: 0, blank: true });
    f.on('traced', s => traced.push(s));
    const until = async (ms) => { const end = Date.now() + ms; let i = 0; while (Date.now() < end) { env.pump(1, 1000 + (i++) * 16.7); await new Promise(r => setTimeout(r, 2)); } };
    await until(120);
    assert.deepEqual(traced, ['tfig:line'], 'traced once');
    f.signal('chest', 10, 3); f.signal([0, 0, 0]); f.setShape('tfig:lit'); await until(30); f.signal('chest', 10, 3);
    f.setShape('tfig:line'); await until(120); assert.equal(traced.length, 2, 'a new visit traces again');
    f.trace(); await until(120); assert.equal(traced.length, 3, 'trace() replays');
    f.setShape('mind'); await until(20); f.signal(); f.destroy();
  }
  const env = stubEnv(); let since = null;
  AF.register('tsince', () => ({ points: [[0, 0, 0], [0.1, 0, 0]], flow: (i, t, s) => { since = s; return null; } }));
  const g = AF.create(env.canvas, { count: 2, shapes: ['tsince'] }); env.pump(3);
  assert.ok(typeof since === 'number' && since >= 0, 'flow gets the seconds since the shape arrived'); g.destroy();
  assert.throws(() => AF.create(stubEnv().canvas, { shapes: ['mind'], initial: 'teams' }), /not in shapes/);
  const h = AF.create(stubEnv().canvas, { crew: true, count: 500, shapes: ['crew:roofer:line', 'crew:roofer:lit'], cycle: 0 }); h.destroy();
});

test('create: refuses a missing canvas', () => {
  assert.throws(() => AF.create(null), /canvas/);
});

await Promise.all(pending);
console.log(`${passed} passed${process.exitCode ? ', with failures' : ''}`);
