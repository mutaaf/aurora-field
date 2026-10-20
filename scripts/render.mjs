// Visual regression: render contact sheets on a manual clock in headless Chromium, then
// compare them with the goldens in test/golden/.
//   node scripts/render.mjs              render every sheet into test/render-out/
//   node scripts/render.mjs --check      ...and fail if one drifts from its golden
//   node scripts/render.mjs --update     ...and make these the goldens
//   node scripts/render.mjs pen fill     only these sheets
// Needs the dev dependency playwright (npm i). WebGL runs on SwiftShader, so goldens are
// per-machine-class: regenerate them with --update when the look changes on purpose.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2), flags = new Set(args.filter(a => a.startsWith('--'))), only = args.filter(a => !a.startsWith('--'));
const TRADES = ['contractor', 'plumber', 'electrician', 'roofer', 'manager', 'realtor'];
const TRACE = 2400;
const ONLY = process.env.TRADES ? process.env.TRADES.split(',') : null;

const line = t => `crew:${t}:line`, lit = t => `crew:${t}:lit`;
const SHEETS = {
  // the pen at 30%, 60% and done, for every trade
  pen: { cols: 3, cells: TRADES.flatMap(t => [0.3, 0.6, 1.15].map(k => ({ label: `${t} · pen ${Math.round(Math.min(k, 1) * 100)}%`, shapes: [line(t), lit(t)], steps: [[line(t), TRACE * k]], opts: { blank: true } }))) },
  // drawn → filling → lit
  fill: { cols: 4, cells: ['contractor', 'roofer', 'realtor'].flatMap(t => [[0], [250], [700], [2600]].map(([ms]) => ({ label: `${t} · lit +${ms}ms`, shapes: [line(t), lit(t)], steps: ms ? [[line(t), 2800], [lit(t), ms, { arrive: { from: 'chest', ms: 1100 } }]] : [[line(t), 2800]], opts: { blank: true } }))) },
  // close up: the lit body at hero size
  close: { cols: 3, cells: ['contractor', 'roofer', 'realtor'].map(t => ({ label: `${t} · lit close`, shapes: [lit(t)], steps: [[lit(t), 2600]], opts: { radius: 220 } })) },
  // every trade in the vocabulary: drawn, then lit
  trades: { cols: 6, cells: ['contractor', 'plumber', 'electrician', 'roofer', 'manager', 'realtor', 'hvac', 'painter', 'landscaper', 'cleaner', 'pest', 'pool', 'restoration', 'mover', 'solar', 'window', 'garagedoor', 'arborist', 'fencer', 'concrete', 'host'].filter(t => !ONLY || ONLY.includes(t)).flatMap(t => [{ label: t + ' · drawn', shapes: [line(t)], steps: [[line(t), 3200]], opts: { blank: true, stars: 0 } }, { label: t + ' · lit', shapes: [lit(t)], steps: [[lit(t), 2600]], opts: { stars: 0 } }]) },
  // the builder at his desk: drawn, lit, prompting, and with his agents
  builder: { cols: 3, cells: [
    { label: 'builder · pen 50%', shapes: ['builder:typing:line'], steps: [['builder:typing:line', 1300]], opts: { blank: true, builder: true } },
    { label: 'builder · drawn', shapes: ['builder:typing:line'], steps: [['builder:typing:line', 3400]], opts: { blank: true, builder: true } },
    { label: 'builder · typing, lit', shapes: ['builder:typing:lit'], steps: [['builder:typing:lit', 2600]], opts: { builder: true } },
    { label: 'builder · prompting', shapes: ['builder:prompting:lit'], steps: [['builder:prompting:lit', 2600]], opts: { builder: true } },
    { label: 'builder · agents at work', shapes: ['builder:agents:answer+estimate+review'], steps: [['builder:agents:answer+estimate+review', 3000]], opts: { builder: ['answer', 'estimate', 'review'] } }
  ] },
  // the crew, the 2D fallback, reduced motion
  crew: { cols: 3, cells: [
    { label: 'crew:all', shapes: ['crew:all'], steps: [['crew:all', 3000]] },
    { label: 'plumber lit · 2d', shapes: [lit('plumber')], steps: [[lit('plumber'), 3000]], opts: { renderer: '2d' } },
    { label: 'electrician · reduced motion', shapes: [lit('electrician')], steps: [[lit('electrician'), 100]], opts: { reducedMotion: true } }
  ] }
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const { chromium } = await import('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`http://localhost:${port}/test/render.html`);
await mkdir(join(ROOT, 'test/render-out'), { recursive: true });
let failed = 0;
for (const [name, spec] of Object.entries(SHEETS)) {
  if (only.length && !only.includes(name)) continue;
  const out = await page.evaluate(s => window.renderSheet(s), spec);
  const file = join(ROOT, 'test/render-out', name + '.png');
  await writeFile(file, Buffer.from(out.dataURL.split(',')[1], 'base64'));
  let verdict = '';
  const golden = join(ROOT, 'test/golden', name + '.png');
  if (flags.has('--check')) {
    const have = await access(golden).then(() => true, () => false);
    if (!have) { verdict = 'no golden'; failed++; }
    else {
      const g = 'data:image/png;base64,' + (await readFile(golden)).toString('base64');
      const d = await page.evaluate(([a, b]) => window.diffImages(a, b), [g, out.dataURL]);
      const bad = d.size || d.mean > 3 || d.moved > 0.02;
      verdict = d.size ? 'size changed' : `diff mean ${d.mean.toFixed(2)} · moved ${(d.moved * 100).toFixed(2)}%`;
      if (bad) { verdict += ' ✗'; failed++; }
    }
  }
  if (flags.has('--update')) { await mkdir(join(ROOT, 'test/golden'), { recursive: true }); await copyFile(file, golden); verdict = 'golden updated'; }
  const slow = out.timings.reduce((m, t) => Math.max(m, t.ms), 0);
  console.log(`${name.padEnd(6)} ${spec.cells.length} cells · ${out.ms} ms (slowest cell ${slow} ms) · ${file.replace(ROOT, '')} ${verdict}`);
}
if (errors.length) { console.error('page errors:', errors); failed++; }
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
