/*! aurora-field v0.1.0 · MIT · https://github.com/mutaaf/aurora-field
 * A canvas-2D particle field that assembles into shapes and morphs between them:
 * a neural sphere with travelling signals, a team of orbs, a stack of platforms.
 * Drag spins it, the cursor parts it, a click sends a shockwave.
 * Zero dependencies. ES5 on purpose, so it can be inlined into old-device-friendly pages.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AuroraField = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '0.1.0';
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
  //   kick?:  extra spin when the shape arrives }
  var SHAPES = {};
  var ORDER = [];
  function register(name, build) {
    if (typeof build !== 'function') throw new Error('aurora-field: shape "' + name + '" needs a build function');
    if (!SHAPES[name]) ORDER.push(name);
    SHAPES[name] = build;
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
        return s ? [s[0], ((s[2] + t * 0.12) % 1) * 1.6 - 0.8, s[1]] : null;
      }
    };
  });

  var DEFAULTS = {
    container: null,          // element whose box sizes the canvas (default: canvas.parentNode)
    stage: null,              // element whose box places and sizes the shape (default: container)
    count: null,              // particle count, or function (width) → count; default 900 / 1600
    shapes: null,             // cycle order (default: every registered shape)
    initial: null,            // first shape (default: shapes[0])
    cycle: 6500,              // ms per shape; 0 turns auto-cycling off
    pin: 14000,               // ms a setShape(…, {pin:true}) holds before cycling resumes
    intro: 2600,              // ms for the scatter-to-shape assembly
    stars: 140,
    radius: null,             // function (stageWidth, stageHeight) → px
    maxDpr: 2,
    fpsFloor: 38,             // below this after 3s, draw every other particle
    interactive: true,
    autoPause: true,          // pause when off-screen or the tab is hidden
    reducedMotion: 'auto',    // 'auto' follows prefers-reduced-motion; true/false forces it
    seed: null,               // number → deterministic field
    palette: {
      point: [123, 227, 195], hot: '#F4FFFB', star: '#CFE9E0',
      signal: [200, 255, 236], head: [220, 255, 244], glow: [123, 227, 195], glow2: [62, 143, 122]
    },
    onShape: null,            // (name) when a shape becomes current
    onStats: null,            // ({fps, nodes}) once a second while running
    onSpinout: null           // () when someone spins it really hard (|ω| > 7 rad/s)
  };
  function merge(base, over) {
    var out = {}, k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    if (over) for (k in over) if (Object.prototype.hasOwnProperty.call(over, k) && over[k] !== undefined) out[k] = over[k];
    return out;
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function create(canvas, options) {
    var o = merge(DEFAULTS, options);
    o.palette = merge(DEFAULTS.palette, options && options.palette);
    var ctx = canvas && canvas.getContext && canvas.getContext('2d');
    if (!ctx) throw new Error('aurora-field: needs a <canvas> with a 2D context');
    var win = canvas.ownerDocument.defaultView || window, doc = canvas.ownerDocument;
    var container = o.container || canvas.parentNode, stage = o.stage || container;
    var reduced = o.reducedMotion === 'auto' ? !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) : !!o.reducedMotion;
    var r = rng(o.seed), i;
    var N = typeof o.count === 'function' ? o.count(win.innerWidth) : (o.count || (win.innerWidth < 760 ? 900 : 1600));
    var names = (o.shapes || ORDER).slice();
    for (i = 0; i < names.length; i++) if (!SHAPES[names[i]]) throw new Error('aurora-field: unknown shape "' + names[i] + '"');

    // particles, then every shape's targets, built once
    var P = [];
    for (i = 0; i < N; i++) {
      var r0 = between(r, 2.5, 6), th = between(r, 0, TAU), ph = Math.acos(between(r, -1, 1));
      P.push({ x: r0 * Math.sin(ph) * Math.cos(th), y: r0 * Math.cos(ph), z: r0 * Math.sin(ph) * Math.sin(th),
        k: between(r, 0.022, 0.06), ox: 0, oy: 0, hot: r() < 0.07, sx: 0, sy: 0, zz: 0 });
    }
    var S = {};
    for (i = 0; i < names.length; i++) {
      var s = SHAPES[names[i]](N, r);
      if (!s || !s.points || s.points.length !== N) throw new Error('aurora-field: shape "' + names[i] + '" must return ' + N + ' points');
      var adj = null;
      if (s.pairs && s.pairs.length) {
        adj = []; for (var a = 0; a < N; a++) adj.push([]);
        for (a = 0; a < s.pairs.length; a++) { adj[s.pairs[a][0]].push(s.pairs[a][1]); adj[s.pairs[a][1]].push(s.pairs[a][0]); }
      }
      S[names[i]] = { def: s, adj: adj, w: 0 };
    }
    var stars = [];
    for (i = 0; i < o.stars; i++) stars.push([r(), r() * 0.8, between(r, 0.4, 1.3), between(r, 0, TAU)]);

    var shape = o.initial || names[0], autoAt = 0, pinnedUntil = 0, born = 0, introDone = false;
    S[shape].w = 1;
    var W = 0, H = 0, DPR = 1, cx = 0, cy = 0, R = 1;
    var rotY = 0, rotX = -0.32, vy = 0.9, kick = 0, mx = -1e4, my = -1e4, par = 0, down = null, waves = [], sig = [];
    var BUCKETS = 7, bx = [], fps = 60, fAcc = 0, fN = 0, fT = 0, step = 1, spunAt = 0;
    for (i = 0; i <= BUCKETS; i++) bx.push([]);
    var raf = 0, last = 0, running = false, wanted = true, inView = true, destroyed = false, listeners = [], settle = 0;

    function on(el, ev, fn, opt) { el.addEventListener(ev, fn, opt || false); listeners.push([el, ev, fn, opt || false]); }
    function now() { return Date.now(); }

    function layout() {
      var cr = container.getBoundingClientRect(); W = cr.width; H = cr.height; if (!W || !H) return;
      DPR = Math.min(win.devicePixelRatio || 1, o.maxDpr);
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      var g = stage.getBoundingClientRect();
      cx = g.left - cr.left + g.width / 2; cy = g.top - cr.top + g.height / 2;
      R = o.radius ? o.radius(g.width, g.height) : Math.max(90, Math.min(g.width * 0.42, g.height * 0.36, 330));
      if (!running) draw(0);
    }
    function project(p, c1, s1, c2, s2) {
      var x = p.x * c1 - p.z * s1, z = p.x * s1 + p.z * c1, y = p.y * c2 - z * s2; z = p.y * s2 + z * c2;
      var k = 3.4 / (3.4 + z); p.sx = x * R * k; p.sy = y * R * k; p.zz = z;
    }
    function fire(sh, a) {
      var adj = S[sh].adj; if (!adj || sig.length >= 60 || !adj[a].length) return;
      sig.push({ sh: sh, a: a, b: adj[a][Math.floor(Math.random() * adj[a].length)], t: 0, hops: 6 + Math.floor(Math.random() * 10) });
    }
    function burst() { if (S[shape].adj) for (var k = 0; k < 14; k++) fire(shape, Math.floor(Math.random() * N)); }

    function draw(t) {
      var pal = o.palette, k, j, p;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = pal.star;
      for (i = 0; i < stars.length; i++) {
        var st = stars[i];
        ctx.globalAlpha = 0.12 + 0.28 * (0.5 + 0.5 * Math.sin(t * 0.0011 * st[2] + st[3])) * st[2] / 1.3;
        ctx.fillRect(st[0] * W - par * 8 * st[2], st[1] * H, st[2], st[2]);
      }
      ctx.globalAlpha = 1;
      var c1 = Math.cos(rotY), s1 = Math.sin(rotY), c2 = Math.cos(rotX), s2 = Math.sin(rotX);
      for (i = 0; i < N; i++) project(P[i], c1, s1, c2, s2);
      var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
      cg.addColorStop(0, rgba(pal.glow, 0.13)); cg.addColorStop(0.5, rgba(pal.glow2, 0.05)); cg.addColorStop(1, rgba(pal.glow2, 0));
      ctx.fillStyle = cg; ctx.fillRect(cx - R * 1.5, cy - R * 1.5, R * 3, R * 3);
      ctx.globalCompositeOperation = 'lighter';
      // edges follow measured convergence: they fade out mid-morph and in as points arrive,
      // so the intro reads as stars gathering, not a scribble (on any frame rate)
      for (var name in S) {
        var sh = S[name], w = sh.w * settle; if (w < 0.02) continue;
        var pairs = sh.def.pairs, links = sh.def.links;
        if (pairs) {
          ctx.strokeStyle = rgba(pal.point, 0.13 * w); ctx.lineWidth = 0.7; ctx.beginPath();
          for (i = 0; i < pairs.length; i += step) {
            var A = P[pairs[i][0]], B = P[pairs[i][1]]; if (A.zz > 0.35 && B.zz > 0.35) continue;
            ctx.moveTo(cx + A.sx + A.ox, cy + A.sy + A.oy); ctx.lineTo(cx + B.sx + B.ox, cy + B.sy + B.oy);
          }
          ctx.stroke();
        }
        if (links) {
          ctx.strokeStyle = rgba(pal.point, 0.18 * w); ctx.lineWidth = 1; ctx.beginPath();
          for (i = 0; i < links.length; i++) {
            var u = { x: links[i][0][0], y: links[i][0][1], z: links[i][0][2] }, v = { x: links[i][1][0], y: links[i][1][1], z: links[i][1][2] };
            project(u, c1, s1, c2, s2); project(v, c1, s1, c2, s2);
            ctx.moveTo(cx + u.sx, cy + u.sy); ctx.lineTo(cx + v.sx, cy + v.sy);
          }
          ctx.stroke();
        }
      }
      if (sig.length) {
        ctx.strokeStyle = rgba(pal.signal, 0.95); ctx.lineWidth = 1.8; ctx.beginPath();
        for (i = 0; i < sig.length; i++) {
          var g = sig[i], ga = P[g.a], gb = P[g.b], t0 = Math.max(0, g.t - 0.5);
          ctx.moveTo(cx + ga.sx + (gb.sx - ga.sx) * t0, cy + ga.sy + (gb.sy - ga.sy) * t0);
          ctx.lineTo(cx + ga.sx + (gb.sx - ga.sx) * g.t, cy + ga.sy + (gb.sy - ga.sy) * g.t);
        }
        ctx.stroke();
      }
      for (i = 0; i <= BUCKETS; i++) bx[i].length = 0;
      var hot = [];
      for (i = 0; i < N; i += step) {
        p = P[i]; if (p.hot) { hot.push(p); continue; }
        bx[Math.max(0, Math.min(BUCKETS, Math.round((1 - p.zz) / 2 * BUCKETS)))].push(p);
      }
      for (k = 0; k <= BUCKETS; k++) {
        var arr = bx[k]; if (!arr.length) continue;
        ctx.fillStyle = rgba(pal.point, 0.2 + 0.8 * Math.pow(k / BUCKETS, 1.4)); ctx.beginPath();
        var sz = 0.9 + 2.1 * (k / BUCKETS);
        for (j = 0; j < arr.length; j++) ctx.rect(cx + arr[j].sx + arr[j].ox - sz / 2, cy + arr[j].sy + arr[j].oy - sz / 2, sz, sz);
        ctx.fill();
      }
      ctx.fillStyle = pal.hot; ctx.beginPath();
      for (i = 0; i < hot.length; i++) { var h = hot[i], hs = h.zz < 0 ? 2.6 : 1.4; ctx.rect(cx + h.sx + h.ox - hs / 2, cy + h.sy + h.oy - hs / 2, hs, hs); }
      ctx.fill();
      if (sig.length) {
        ctx.fillStyle = rgba(pal.head, 1); ctx.beginPath();
        for (i = 0; i < sig.length; i++) { var g2 = sig[i], a2 = P[g2.a], b2 = P[g2.b]; ctx.rect(cx + a2.sx + (b2.sx - a2.sx) * g2.t - 1.6, cy + a2.sy + (b2.sy - a2.sy) * g2.t - 1.6, 3.2, 3.2); }
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      for (i = 0; i < waves.length; i++) {
        var wv = waves[i]; ctx.strokeStyle = rgba(pal.point, Math.max(0, 0.45 * (1 - wv.t / 700))); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(wv.x, wv.y, wv.t, 0, TAU); ctx.stroke();
      }
    }

    function update(dt, t) {
      var tn = now(), cur = S[shape], def = cur.def, pts = def.points;
      if (!introDone && tn - born > o.intro) introDone = true;
      if (introDone && o.cycle > 0 && names.length > 1 && tn > autoAt && tn > pinnedUntil) setShape(names[(names.indexOf(shape) + 1) % names.length]);
      for (var nm in S) S[nm].w += ((nm === shape ? 1 : 0) - S[nm].w) * 0.05;
      if (!down) vy += (0.16 - vy) * Math.min(1, dt * 0.9);
      rotY += (vy + kick) * dt; kick *= Math.pow(0.12, dt);
      if (Math.abs(vy) > 7 && tn > spunAt) { spunAt = tn + 4000; if (o.onSpinout) o.onSpinout(); }
      var flowT = t / 1000;
      for (var n = 0; n < N; n++) {
        var p = P[n], T = (def.flow && def.flow(n, flowT)) || pts[n];
        var k = p.k * (introDone ? 1.4 : 1) * dt * 60;
        p.x += (T[0] - p.x) * k; p.y += (T[1] - p.y) * k; p.z += (T[2] - p.z) * k;
        if (o.interactive) {
          var dx = cx + p.sx + p.ox - mx, dy = cy + p.sy + p.oy - my, d2 = dx * dx + dy * dy;
          if (d2 < 8100 && d2 > 0.01) { var d = Math.sqrt(d2), f = (1 - d / 90); f = f * f * 7; p.ox += dx / d * f; p.oy += dy / d * f; }
          for (var w = 0; w < waves.length; w++) {
            var wv = waves[w], ex = cx + p.sx - wv.x, ey = cy + p.sy - wv.y, ed = Math.sqrt(ex * ex + ey * ey), band = ed - wv.t;
            if (band > -20 && band < 6 && ed > 0.1) { var push = (1 - Math.abs(band + 7) / 20) * 5; p.ox += ex / ed * push; p.oy += ey / ed * push; }
          }
        }
        p.ox *= 0.9; p.oy *= 0.9;
      }
      for (w = waves.length - 1; w >= 0; w--) { waves[w].t += dt * 620; if (waves[w].t > 700) waves.splice(w, 1); }
      // how close is the field to its shape? sample 64 particles
      var err = 0, stride = Math.max(1, Math.floor(N / 64)), cnt = 0;
      for (n = 0; n < N; n += stride) {
        var q = P[n], Q = (def.flow && def.flow(n, flowT)) || pts[n];
        err += Math.abs(Q[0] - q.x) + Math.abs(Q[1] - q.y) + Math.abs(Q[2] - q.z); cnt++;
      }
      var target = Math.max(0, Math.min(1, 1 - (err / cnt) * 4));
      settle += (target - settle) * Math.min(1, dt * 6);
      if (cur.adj && Math.random() < dt * 12) fire(shape, Math.floor(Math.random() * N));
      for (var s = sig.length - 1; s >= 0; s--) {
        var g = sig[s]; if (g.sh !== shape) { sig.splice(s, 1); continue; }
        g.t += dt * 3.2;
        if (g.t >= 1) {
          var adj = S[g.sh].adj[g.b];
          if (--g.hops > 0 && adj.length) { g.a = g.b; g.b = adj[Math.floor(Math.random() * adj.length)]; g.t = 0; } else sig.splice(s, 1);
        }
      }
    }
    function frame(t) {
      raf = 0; if (!running) return;
      var dt = Math.min(0.05, (t - (last || t)) / 1000) || 0.016; last = t;
      update(dt, t); draw(t);
      fAcc += dt; fN++;
      if (fAcc >= 1) {
        fps = Math.round(fN / fAcc); fAcc = 0; fN = 0; fT++;
        if (fT === 3 && fps < o.fpsFloor && step === 1) step = 2;
        if (o.onStats) o.onStats({ fps: fps, nodes: Math.ceil(N / step) });
      }
      raf = win.requestAnimationFrame(frame);
    }
    function sync() {
      var want = wanted && !destroyed && !reduced && (!o.autoPause || (!doc.hidden && inView));
      if (want && !running) { running = true; last = 0; if (!raf) raf = win.requestAnimationFrame(frame); }
      else if (!want && running) { running = false; if (raf) { win.cancelAnimationFrame(raf); raf = 0; } }
    }
    function snap(name) {
      var pts = S[name].def.points;
      for (var n = 0; n < N; n++) { P[n].x = pts[n][0]; P[n].y = pts[n][1]; P[n].z = pts[n][2]; }
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
        var p = pos(e); mx = p[0]; my = p[1]; par = mx / (W || 1) - 0.5;
        if (down) {
          var dx = p[0] - down[0];
          vy = dx * 0.06 * 60 / Math.max(16, now() - down[2] + 16);
          rotY += dx * 0.006; rotX = Math.max(-1.1, Math.min(0.6, rotX + (p[1] - down[1]) * 0.004));
          down = [p[0], p[1], now(), down[3] + Math.abs(dx) + Math.abs(p[1] - down[1])];
          if (!running) draw(0);
        }
      });
      on(canvas, 'pointerleave', function () { mx = my = -1e4; });
      on(canvas, 'pointerdown', function (e) {
        var p = pos(e); down = [p[0], p[1], now(), 0]; canvas.setAttribute('data-dragging', '');
        if (e.pointerType !== 'touch' && canvas.setPointerCapture) try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      });
      on(canvas, 'pointerup', function (e) {
        if (!down) return; var moved = down[3]; down = null; canvas.removeAttribute('data-dragging');
        if (moved < 6) { var p = pos(e); waves.push({ x: p[0], y: p[1], t: 0 }); if (waves.length > 4) waves.shift(); kick += 0.8; burst(); }
        if (e.pointerType === 'touch') mx = my = -1e4;
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
      next: function () { return setShape(names[(names.indexOf(shape) + 1) % names.length], { pin: true }); },
      play: function () { wanted = true; layout(); sync(); return api; },
      pause: function () { wanted = false; sync(); return api; },
      resize: function () { layout(); return api; },
      stats: function () { return { fps: fps, nodes: Math.ceil(N / step), running: running, reduced: reduced, shape: shape }; },
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
