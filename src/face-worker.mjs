// aurora-field/face — the worker: runs the landmarker off the main thread. Receives
// ImageBitmaps, returns compact results. Started by face.mjs; not used directly.
import { createLandmarker, compact } from './face-core.mjs';
let lm = null;
self.onmessage = async (e) => {
  const m = e.data || {};
  if (m.type === 'init') {
    try { lm = await createLandmarker({ base: m.base, model: m.model, delegate: m.delegate, inWorker: true }); self.postMessage({ type: 'ready', delegate: lm.delegate }); }
    catch (err) { self.postMessage({ type: 'error', stage: 'init', message: String((err && err.message) || err) }); }
  } else if (m.type === 'frame') {
    const t0 = performance.now();
    try {
      if (!lm) throw new Error('not ready');
      const r = compact(lm.landmarker.detectForVideo(m.bitmap, m.t));
      self.postMessage({ type: 'result', gen: m.gen, t: m.t, ms: performance.now() - t0, matrix: r.matrix, shapes: r.shapes });
    } catch (err) { self.postMessage({ type: 'error', stage: 'detect', gen: m.gen, message: String((err && err.message) || err) }); }
    finally { if (m.bitmap && m.bitmap.close) m.bitmap.close(); }
  } else if (m.type === 'close') { try { lm && lm.landmarker.close(); } catch (err) {} lm = null; }
};
