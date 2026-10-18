// Zero-dependency tests: node test/run.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const AF = require('../src/aurora-field.js');
const src = readFileSync(new URL('../src/aurora-field.js', import.meta.url), 'utf8');
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e && e.stack || e)); process.exitCode = 1; }
}

console.log('aurora-field ' + AF.version);

test('version matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(AF.version, pkg.version);
  assert.ok(src.startsWith('/*! aurora-field v' + pkg.version + ' '), 'banner carries the version');
});

test('ships the four built-in shapes, in order', () => {
  assert.deepEqual(AF.shapes(), ['mind', 'teams', 'platforms', 'helm']);
});

for (const name of ['mind', 'teams', 'platforms', 'helm']) {
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
    assert.ok(s.bright.length >= n * 0.06, 'eye points ' + s.bright.length);
    for (const i of s.bright) { const p = s.points[i]; assert.ok(p[2] < -0.4 && p[1] < -0.05 && p[1] > -0.32, 'eye at ' + p + ' (camera space: -z is toward the viewer, -y is up)'); }
    for (const [a, b] of s.pairs) assert.ok(a >= 0 && b < n && a !== b);
    assert.ok(s.pairs.length > n * 0.12);
    const ys = s.points.map(p => p[1]);
    assert.ok(Math.min(...ys) < -0.85 && Math.max(...ys) > 0.9, 'shell covers crown to jaw');
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
function stubEnv({ reduce = false } = {}) {
  const calls = { raf: 0 }, listeners = [];
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
  const canvas = Object.assign(el(1200, 800), { ownerDocument: doc, parentNode: container, getContext: () => ctx, setAttribute() {}, removeAttribute() {} });
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

test('create: refuses a missing canvas', () => {
  assert.throws(() => AF.create(null), /canvas/);
});

console.log(`${passed} passed${process.exitCode ? ', with failures' : ''}`);
