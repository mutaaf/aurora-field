// aurora-field/face — shared core: the landmarker loader, and the solver that turns MediaPipe
// Face Landmarker results into aurora-field poses ({ yaw, pitch, roll, eyes, face }).
// Modern JS (an optional add-on; the field itself stays ES5).

export const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1';
export const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Load MediaPipe and build a landmarker. In a module worker the wasm loader (a classic script)
// can't use importScripts, so MediaPipe's `self.import` hook evaluates it in global scope.
export async function createLandmarker({ base = CDN, model = MODEL, delegate = 'GPU', inWorker = false } = {}) {
  if (inWorker && !self.import) {
    self.import = async (url) => { const src = await (await fetch(url)).text(); (0, eval)(src + '\n;self.ModuleFactory = ModuleFactory;'); };
  }
  const { FilesetResolver, FaceLandmarker } = await import(base + '/vision_bundle.mjs');
  const files = await FilesetResolver.forVisionTasks(base + '/wasm');
  const opts = { baseOptions: { modelAssetPath: model, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true, outputFaceBlendshapes: true };
  try { return { landmarker: await FaceLandmarker.createFromOptions(files, opts), delegate }; }
  catch (e) {
    if (delegate !== 'GPU') throw e;
    opts.baseOptions.delegate = 'CPU';
    return { landmarker: await FaceLandmarker.createFromOptions(files, opts), delegate: 'CPU' };
  }
}

// Reduce a landmarker result to what crosses threads: 16 matrix floats and the scores.
export function compact(res) {
  const m = res && res.facialTransformationMatrixes && res.facialTransformationMatrixes[0];
  const b = res && res.faceBlendshapes && res.faceBlendshapes[0];
  return { matrix: m ? Array.from(m.data) : null, shapes: b ? b.categories.map(c => [c.categoryName, c.score]) : null };
}

// One Euro filter (Casiez et al., 2012): smooth when still, responsive when moving.
export class OneEuro {
  constructor(minCutoff = 1.2, beta = 0.04, dCutoff = 1) { this.mc = minCutoff; this.b = beta; this.dc = dCutoff; this.x = null; this.dx = 0; this.t = 0; }
  static a(cut, dt) { const r = 2 * Math.PI * cut * dt; return r / (r + 1); }
  filter(v, t) {
    if (this.x === null || !(t > this.t)) { this.x = v; this.t = t; this.dx = 0; return v; }
    const dt = Math.min(0.25, (t - this.t) / 1000); this.t = t;
    const d = (v - this.x) / dt; this.dx += OneEuro.a(this.dc, dt) * (d - this.dx);
    this.x += OneEuro.a(this.mc + this.b * Math.abs(this.dx), dt) * (v - this.x);
    return this.x;
  }
  reset() { this.x = null; }
}

// The solver: head pose from the 4×4 facial transformation (column-major), mirrored like a
// selfie, and sixteen face channels from the blendshapes, each measured against a learned
// resting baseline (it follows low values fast and rises slowly), then filtered.
const CHANNELS = [
  // name, inputs(g, L, R) → raw, dead zone, range, filter cutoff (fast for blinks and jaw)
  ['eyeBlinkL', (g, L) => g('eyeBlink' + L), 0.06, 0.5, 4],
  ['eyeBlinkR', (g, L, R) => g('eyeBlink' + R), 0.06, 0.5, 4],
  ['jawOpen', g => g('jawOpen') + g('mouthFunnel') * 0.3, 0.02, 0.45, 3],
  ['smileL', (g, L) => g('mouthSmile' + L), 0.05, 0.55, 2],
  ['smileR', (g, L, R) => g('mouthSmile' + R), 0.05, 0.55, 2],
  ['pucker', g => Math.max(g('mouthPucker'), g('mouthFunnel') * 0.8), 0.08, 0.6, 2],
  ['press', g => (g('mouthPressLeft') + g('mouthPressRight')) / 2 + g('mouthRollLower') * 0.5, 0.05, 0.5, 2],
  ['mouthL', (g, L) => g('mouth' + L), 0.03, 0.4, 2],
  ['mouthR', (g, L, R) => g('mouth' + R), 0.03, 0.4, 2],
  ['chinRaise', g => g('mouthShrugLower'), 0.05, 0.5, 2],
  ['cheekPuff', g => g('cheekPuff'), 0.05, 0.5, 2],
  ['squintL', (g, L) => Math.max(g('cheekSquint' + L), g('eyeSquint' + L) * 0.7), 0.05, 0.5, 2],
  ['squintR', (g, L, R) => Math.max(g('cheekSquint' + R), g('eyeSquint' + R) * 0.7), 0.05, 0.5, 2],
  ['browUp', g => Math.max(g('browInnerUp'), (g('browOuterUpLeft') + g('browOuterUpRight')) / 2), 0.05, 0.5, 2],
  ['browDownL', (g, L) => g('browDown' + L), 0.05, 0.5, 2],
  ['browDownR', (g, L, R) => g('browDown' + R), 0.05, 0.5, 2]
];
export function createSolver({ mirror = true, swap = false, smoothing = true } = {}) {
  let seen = 0;
  const base = {}, F = {}, head = smoothing ? { yaw: new OneEuro(1.0, 0.05), pitch: new OneEuro(1.0, 0.05), roll: new OneEuro(1.0, 0.05) } : null;
  if (smoothing) for (const c of CHANNELS) F[c[0]] = new OneEuro(c[4], 0.3);
  const L = swap ? 'Right' : 'Left', R = swap ? 'Left' : 'Right';
  return {
    solve(matrix, shapes, t = performance.now()) {
      if (!matrix) return null;
      const m = matrix, yaw0 = Math.asin(Math.max(-1, Math.min(1, -m[2]))), pitch0 = Math.atan2(m[6], m[10]), roll0 = Math.atan2(m[1], m[0]);
      let yaw = mirror ? -yaw0 : yaw0, pitch = pitch0, roll = mirror ? roll0 : -roll0;
      if (head) { yaw = head.yaw.filter(yaw, t); pitch = head.pitch.filter(pitch, t); roll = head.roll.filter(roll, t); }
      let face = null, eyes = 1;
      if (shapes) {
        seen++;
        const map = {}; for (const [n, s] of shapes) map[n] = s;
        const g = n => map[n] || 0;
        face = {};
        for (const [name, fn, dead, range] of CHANNELS) {
          const v = fn(g, L, R);
          let b = base[name]; if (b === undefined) b = v;
          // the first ~2 s calibrate quickly; after that the baseline only creeps up (so held expressions stay)
          b += (v - b) * (v < b ? 0.25 : (seen < 60 ? 0.08 : 0.003)); base[name] = b;
          let x = Math.max(0, Math.min(1, (v - b - dead) / range));
          if (smoothing) x = Math.max(0, Math.min(1, F[name].filter(x, t)));
          face[name] = x;
        }
        eyes = 1 - (face.eyeBlinkL + face.eyeBlinkR) / 2;
      }
      return { yaw, pitch, roll, eyes, face };
    },
    recalibrate() { for (const k in base) delete base[k]; seen = 0; },
    reset() { if (head) for (const k in head) head[k].reset(); for (const k in F) F[k].reset(); }
  };
}
