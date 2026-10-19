// aurora-field/face — camera face tracking for aurora-field, built on MediaPipe Face Landmarker.
//
//   import { trackFace } from 'aurora-field/face';
//   const tracker = trackFace(field, { onStatus: s => console.log(s) });
//   await tracker.start();          // asks for the camera; the video never leaves the browser
//   tracker.stop();
//
// Efficient: detection runs in a Web Worker (ImageBitmaps in, 16 floats and 52 scores out), one
// frame in flight, at an adaptive rate that backs off when the device is slow; the main thread
// only grabs frames. Smooth: One Euro filters on the head and every face channel. Self-healing:
// a watchdog restarts a stalled pipeline, a crashed worker falls back to the main thread, a GPU
// failure falls back to the CPU, a lost camera (unplugged, revoked, sleeping) is re-acquired
// with backoff, and hidden tabs pause processing. Statuses: starting, tracking, no-face,
// recovering, paused, stopped, error.
import { CDN, MODEL, createLandmarker, compact, createSolver } from './face-core.mjs';

export { CDN, MODEL, createSolver, OneEuro } from './face-core.mjs';

export function createFaceTracker(options = {}) {
  const o = Object.assign({
    base: CDN, model: MODEL, worker: true, workerUrl: null, delegate: 'GPU', maxFps: 30, minFps: 8,
    mirror: true, swap: false, smoothing: true, holdMs: 400, stallMs: 2500, hiddenStopMs: 60000, upgradeMs: 60000,
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
    onPose: null, onStatus: null
  }, options);
  const solver = createSolver(o);
  let state = 'stopped', stream = null, video = null, worker = null, lm = null, mode = null, delegate = o.delegate;
  let inFlight = false, lastSent = 0, lastResult = 0, lastFace = 0, latency = 0, frames = 0, fpsT = 0, fps = 0;
  let restarts = 0, failures = 0, camTries = 0, gen = 0, vfc = 0, raf = 0, dog = 0, hiddenAt = 0, wantRun = false, warmUntil = 0, recoveries = 0, healthySince = 0, upgradeWait = o.upgradeMs;

  const emitPose = (p) => { if (o.onPose) try { o.onPose(p); } catch (e) {} };
  const status = (s, detail) => { if (s === state && !detail) return; state = s; if (o.onStatus) try { o.onStatus(s, detail || null); } catch (e) {} };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // ---- camera ----
  async function openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('This browser has no camera API.'), { name: 'NotSupportedError' });
    stream = await navigator.mediaDevices.getUserMedia({ video: o.video, audio: false });
    const track = stream.getVideoTracks()[0];
    // a camera that goes away (unplugged, revoked, the OS took it) is re-acquired
    track.addEventListener('ended', () => { if (wantRun) heal('camera-ended'); });
    video = document.createElement('video');
    video.playsInline = true; video.muted = true; video.srcObject = stream;
    await video.play();
  }
  function closeCamera() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (video) { try { video.pause(); } catch (e) {} video.srcObject = null; }
    stream = null; video = null;
  }

  // ---- the detector: a worker first, the main thread if that fails ----
  function startWorker() {
    return new Promise((resolve, reject) => {
      let w;
      try { w = new Worker(o.workerUrl || new URL('./face-worker.mjs', import.meta.url), { type: 'module' }); } catch (e) { return reject(e); }
      const t = setTimeout(() => { w.terminate(); reject(new Error('worker timed out')); }, 30000);
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'ready') { clearTimeout(t); delegate = m.delegate; w.onmessage = onWorker; w.onerror = () => { mode = 'main'; heal('worker-crashed'); }; resolve(w); }
        else if (m.type === 'error') { clearTimeout(t); w.terminate(); reject(new Error(m.message)); }
      };
      w.onerror = (e) => { clearTimeout(t); w.terminate(); reject(new Error(e.message || 'worker failed')); };
      w.postMessage({ type: 'init', base: o.base, model: o.model, delegate });
    });
  }
  async function startDetector() {
    if (o.worker && typeof Worker !== 'undefined' && typeof createImageBitmap === 'function' && mode !== 'main') {
      try { worker = await startWorker(); mode = 'worker'; return; }
      catch (e) { worker = null; if (o.onStatus) o.onStatus('recovering', 'worker unavailable, using the main thread: ' + e.message); }
    }
    lm = await createLandmarker({ base: o.base, model: o.model, delegate });
    delegate = lm.delegate; mode = 'main';
  }
  // the first detections after a (re)start compile GPU shaders: give them time before the watchdog judges
  function warm() { warmUntil = performance.now() + 15000; }
  function stopDetector() {
    if (worker) { try { worker.postMessage({ type: 'close' }); } catch (e) {} const w = worker; setTimeout(() => w.terminate(), 100); worker = null; }
    if (lm) { try { lm.landmarker.close(); } catch (e) {} lm = null; }
    inFlight = false;
  }

  // ---- results ----
  function onWorker(e) {
    const m = e.data;
    if (m.gen !== gen) return;                                                          // a stale answer from before a restart
    if (m.type === 'result') { inFlight = false; result(m.matrix, m.shapes, m.ms, m.t); }
    else if (m.type === 'error') { inFlight = false; detectFailed(m.message); }
  }
  function result(matrix, shapes, ms, t) {
    const now = performance.now();
    if (healing) return;
    lastResult = now; failures = 0;
    latency = latency ? latency * 0.85 + ms * 0.15 : ms;
    frames++; if (now - fpsT >= 1000) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; }
    const p = solver.solve(matrix, shapes, t);
    if (p) { lastFace = now; emitPose(p); if (state !== 'tracking') { status('tracking'); camTries = 0; if (!healthySince) healthySince = now; } }
    else if (now - lastFace > o.holdMs) { emitPose(null); if (state !== 'no-face') status('no-face'); }   // a short hold rides over dropped frames
  }
  function detectFailed(msg) {
    if (++failures >= 3) {
      // the GPU path failing repeatedly: rebuild on the CPU; a broken worker: go to the main thread
      if (delegate === 'GPU') delegate = 'CPU'; else if (mode === 'worker') mode = 'main';
      heal('detector: ' + msg);
    }
  }

  // ---- the frame pump: one frame in flight, at an adaptive rate ----
  function interval() {
    // spend at most ~60% of the time detecting: a slow device gets fewer, not later, frames
    const byFps = 1000 / o.maxFps, byLoad = latency / 0.6;
    return Math.min(1000 / o.minFps, Math.max(byFps, byLoad));
  }
  function schedule() {
    if (!video || !wantRun) return;
    if (video.requestVideoFrameCallback) vfc = video.requestVideoFrameCallback(pump); else raf = requestAnimationFrame(pump);
  }
  async function pump() {
    const my = gen;
    if (!wantRun || !video || my !== gen) return;
    const now = performance.now();
    if (!inFlight && !document.hidden && video.readyState >= 2 && now - lastSent >= interval()) {
      lastSent = now; inFlight = true;
      try {
        if (mode === 'worker') {
          const bmp = await createImageBitmap(video);
          if (my !== gen || !worker) { bmp.close(); inFlight = false; }
          else worker.postMessage({ type: 'frame', bitmap: bmp, t: now, gen: my }, [bmp]);
        } else {
          const t0 = performance.now(), r = compact(lm.landmarker.detectForVideo(video, now));
          inFlight = false; result(r.matrix, r.shapes, performance.now() - t0, now);
        }
      } catch (e) { inFlight = false; detectFailed(String((e && e.message) || e)); }
    }
    schedule();
  }

  // ---- the watchdog: restart anything that stops answering ----
  function watch() {
    clearInterval(dog);
    dog = setInterval(() => {
      if (!wantRun || state === 'recovering' || document.hidden) return;
      const now = performance.now();
      if (inFlight && now - lastSent > (now < warmUntil ? 15000 : o.stallMs)) heal('detector stalled');
      else if (video && video.readyState < 2 && now - lastResult > o.stallMs * 2) heal('camera stalled');
      else if (stream && stream.getVideoTracks()[0] && stream.getVideoTracks()[0].readyState === 'ended') heal('camera-ended');
      // degraded (main thread or CPU) but healthy for a while: try the fast path again, backing off if it fails
      else if ((mode === 'main' && o.worker || delegate !== o.delegate) && healthySince && now - healthySince > upgradeWait) {
        upgradeWait = Math.min(600000, upgradeWait * 2); healthySince = 0;
        mode = o.worker ? null : mode; delegate = o.delegate; heal('upgrade');
      }
    }, 1000);
  }
  let healing = null;
  function heal(why) {
    if (healing || !wantRun) return healing;
    status('recovering', why);
    healthySince = 0;
    healing = (async () => {
      restarts++; recoveries++;
      gen++; stopDetector();
      const cameraGone = /camera/.test(why) || !stream || !stream.active;
      if (cameraGone) closeCamera();
      for (;;) {
        if (!wantRun) break;
        try {
          if (!stream) { await openCamera(); }
          await startDetector(); warm();
          lastResult = performance.now(); lastSent = 0; solver.reset();
          schedule(); status('starting', 'recovered from ' + why);
          break;
        } catch (e) {
          if (e && (e.name === 'NotAllowedError' || e.name === 'NotSupportedError')) { stop(); status('error', e.name); break; }
          camTries++;
          if (camTries > 6) { stop(); status('error', 'gave up after ' + camTries + ' tries: ' + ((e && e.message) || e)); break; }
          closeCamera();
          await wait(Math.min(8000, 500 * Math.pow(2, camTries - 1)));      // backoff: 0.5, 1, 2, 4, 8, 8 s
        }
      }
      healing = null;
    })();
    return healing;
  }

  // ---- hidden tabs: pause processing; after a minute, let the camera go too ----
  function onVisibility() {
    if (!wantRun) return;
    if (document.hidden) { hiddenAt = performance.now(); status('paused'); emitPose(null); setTimeout(() => { if (wantRun && document.hidden && performance.now() - hiddenAt >= o.hiddenStopMs - 50) { gen++; stopDetector(); closeCamera(); } }, o.hiddenStopMs); }
    else if (!stream) heal('camera released while hidden');
    else { lastResult = performance.now(); status('starting'); }
  }

  async function start() {
    if (wantRun) return;
    wantRun = true; gen++; restarts = 0; failures = 0; camTries = 0;
    status('starting');
    try { await openCamera(); await startDetector(); warm(); }
    catch (e) { wantRun = false; stopDetector(); closeCamera(); status('error', (e && e.name) || String(e)); throw e; }
    lastResult = performance.now(); fpsT = lastResult;
    document.addEventListener('visibilitychange', onVisibility);
    watch(); schedule();
  }
  function stop() {
    wantRun = false; gen++;
    clearInterval(dog);
    if (video && video.cancelVideoFrameCallback && vfc) video.cancelVideoFrameCallback(vfc);
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    stopDetector(); closeCamera();
    emitPose(null);
    status('stopped');
  }
  return {
    start, stop,
    get running() { return wantRun; },
    get state() { return state; },
    stats: () => ({ state, mode, delegate, fps, latency: Math.round(latency * 10) / 10, interval: Math.round(interval()), recoveries }),
    // for tests: make the pipeline fail the way real devices do, and watch it heal
    simulate(kind) {
      if (kind === 'worker-crash' && worker && worker.onerror) worker.onerror(new Event('error'));
      else if (kind === 'camera-lost' && stream) stream.getVideoTracks().forEach(t => t.stop());
      else if (kind === 'detector-fail') { failures = 2; detectFailed('simulated'); }
      else if (kind === 'stall') { inFlight = true; lastSent = performance.now() - 60000; warmUntil = 0; }
    }
  };
}

// Wire a tracker to a field: the head turns facing shapes, the face drives rigged ones.
export function trackFace(field, options = {}) {
  const user = options.onPose;
  return createFaceTracker(Object.assign({}, options, { onPose: (p) => { field.setPose(p); if (user) user(p); } }));
}
