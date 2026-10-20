// CPU cost per frame (physics + projection + building the draw batch), in Node with stub
// canvases: node bench/run.mjs [path/to/aurora-field.js]. GPU time is not measured here;
// on a real page the WebGL path is three draw calls a frame.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const AF = require(resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || new URL('../src/aurora-field.js', import.meta.url).pathname));

function env(kind) {
  const queue = [];
  const fn = () => () => ({});
  const gl = new Proxy({ getParameter: () => [1, 64], getShaderParameter: () => true, getProgramParameter: () => true, getExtension: () => null }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[A-Z_0-9]+$/.test(k) ? 1 : fn())) });
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => (t[k] = v, true) });
  const el = (w, h) => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }), addEventListener() {}, removeEventListener() {} });
  const win = { innerWidth: 1440, devicePixelRatio: 2, matchMedia: () => ({ matches: false }), requestAnimationFrame: (f) => (queue.push(f), queue.length), cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {} };
  const doc = { hidden: false, defaultView: win, addEventListener() {}, removeEventListener() {}, createElement: () => ({ getContext: () => ctx }) };
  const container = el(1440, 900);
  const canvas = Object.assign(el(1440, 900), { ownerDocument: doc, parentNode: container, width: 0, height: 0, getContext: (t) => (t === '2d' ? (kind === '2d' ? ctx : null) : (kind === 'gl' ? gl : null)), setAttribute() {}, removeAttribute() {} });
  let t = 1000;
  return { canvas, pump: (n) => { for (let i = 0; i < n; i++) { const q = queue.splice(0); t += 16.7; q.forEach(f => f(t)); } } };
}
const rows = [];
if (AF.registerCrew) AF.registerCrew();
for (const kind of ['gl', '2d']) for (const shape of ['mind', 'helm'].concat(AF.registerCrew ? ['crew:contractor:lit'] : [])) for (const n of [2800, 10000, 30000]) {
  const e = env(kind);
  const f = AF.create(e.canvas, { seed: 1, count: n, shapes: [shape], cycle: 0, intro: 0, quality: 'high', autoPause: false, renderer: kind === 'gl' ? 'webgl' : '2d' });
  e.pump(120);                                  // settle and warm the JIT
  // best of five 60-frame runs: the minimum is the honest cost, the rest is the machine
  let ms = Infinity;
  for (let k = 0; k < 5; k++) { const t0 = process.hrtime.bigint(); e.pump(60); ms = Math.min(ms, Number(process.hrtime.bigint() - t0) / 1e6 / 60); }
  rows.push({ renderer: f.stats().renderer, shape, nodes: n, 'ms/frame': +ms.toFixed(3) });
  f.destroy();
}
console.log('aurora-field ' + AF.version + ' · ' + process.version);
console.table(rows);

// --budget: fail when the library gets slower or heavier than it promises
if (process.argv.includes('--budget')) {
  const { gzipSync } = await import('node:zlib');
  const { readFileSync } = await import('node:fs');
  // frame cost is relative to the lit helm on the same machine (CI runners are slower than laptops); sizes are absolute
  const BUDGET = { 'lit figure frame ÷ lit helm frame @2800': 1.25, 'create() ms (crew field)': 8, 'min.js gzip KB': 48 };   // the whole bundle: engine, people (21 trades, the builder and agents) and the stage
  const lit = rows.find(r => r.renderer === 'webgl' && r.shape === 'crew:contractor:lit' && r.nodes === 2800), helm = rows.find(r => r.renderer === 'webgl' && r.shape === 'helm' && r.nodes === 2800);
  let best = Infinity;
  for (let k = 0; k < 5; k++) { const e = env('gl'); const t0 = process.hrtime.bigint(); const f = AF.create(e.canvas, { seed: 1, count: 2800, crew: true, shapes: AF.crew.flatMap(t => ['crew:' + t + ':line', 'crew:' + t + ':lit']), initial: 'crew:contractor:line', cycle: 0 }); best = Math.min(best, Number(process.hrtime.bigint() - t0) / 1e6); f.destroy(); }
  const gz = gzipSync(readFileSync(new URL('../dist/aurora-field.min.js', import.meta.url))).length / 1024;
  const got = { 'lit figure frame ÷ lit helm frame @2800': lit && helm ? +(lit['ms/frame'] / helm['ms/frame']).toFixed(2) : Infinity, 'create() ms (crew field)': +best.toFixed(2), 'min.js gzip KB': +gz.toFixed(1) };
  let over = 0;
  for (const k in BUDGET) { const ok = got[k] <= BUDGET[k]; if (!ok) over++; console.log((ok ? '✓ ' : '✗ ') + k + ': ' + got[k] + ' (budget ' + BUDGET[k] + ')'); }
  if (over) process.exit(1);
}
