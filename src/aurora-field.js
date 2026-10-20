/*! aurora-field v3.2.0 · MIT · https://github.com/mutaaf/aurora-field
 * A particle field that assembles into shapes and morphs between them: a neural sphere
 * with travelling signals, a team of orbs, a stack of platforms, an armoured helm, a ranger
 * helmet, a crew of people a pen draws and light fills (figure(), registerCrew()) — or text,
 * SVG paths, images and point clouds (fromText/fromSVG/fromImage/fromPoints, armour() for your own helmets). Two-tone palettes and presets; options change live (set).
 * Runs on any canvas: in a page, headless (OffscreenCanvas, servers) or in a worker (offload).
 * Drag spins it, the cursor parts it, a click sends a shockwave. Particles are damped
 * springs that swirl into place, breathe, trade places and send out scouts; a governor
 * holds the frame rate; points are snapped to device pixels so they stay crisp. WebGL when
 * available (round anti-aliased points, halos, additive bloom, ~2× the particles), canvas-2D
 * otherwise. setPose() lets a tracked head steer facing shapes like the helm, and setFace()
 * drives a rigged helmet's eyelids, brows, jaw, lips, cheeks and chin.
 * Zero dependencies. ES5 on purpose, so it can be inlined into old-device-friendly pages.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AuroraField = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '3.2.0';
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
  //   facing?: true to turn and hold the shape toward the viewer (with a slow sway),
  //   anchors?: { name: [x,y,z] } points overlays can follow via field.anchors() }
  var SHAPES = {};
  var ORDER = [];
  // register(name, build(n, random) → shape) — or a static shape ({ points, tone? … } or a
  // point list), which is resampled to whatever count a field uses
  function register(name, build) {
    if (build && typeof build === 'object') build = fromPoints(build.points || build, build.points ? build : null);
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

  // ---- armour: helmets from line art ----
  // armour(spec) turns a front-view drawing (1024 wide, y down, crown near 172, chin near 1120,
  // one scale for both axes) into a shape: the lines are laid onto a real head volume (rounded-box
  // cross-sections from a front silhouette and a side profile, deeper than it is wide), filled
  // regions glow, and the sides and back are a holographic scan of contour rings that carry
  // signals. helm and ranger are built with it; so can you (AuroraField.armour).
  //   spec: { sil: [[y, halfWidth]…], front: [[y, depth]…], back: [[y, depth]…],
  //     lines: [{ p: [[x, y]…] | edge: [fromY, toY, fraction of the half-width], w?, glow?, mirror?, tone? }…], fills: [{ p, share, mirror?, glow?, cut?: [poly…] }…],
  //     screws?: [[x, y]…], ears?: { y, z, r: [outer, inner] }, plate?: { top, width, lift },
  //     rings?: { count, from, to }, budget?: lineShare, anchors?: { name: [x, y, lift] | [x, y, lift, 'ear', side] },
  //     rig?: [{ ch, box: [x0, y0, x1, y1], soft?, ramp?: [y0, y1], move?: [dx, dy, dz], squeeze?: [cx, k], lid?: y, mirror?: ch }…],
  //     dim?: [leftCh, rightCh], scale?, kick? }   tone (0…1) picks between a palette's point and accent colours
  var ARMOUR_DEFAULTS = {
    front: [[172, 60], [190, 170], [240, 270], [330, 340], [450, 372], [600, 388], [760, 396], [900, 384], [1000, 360], [1080, 318], [1126, 296]],
    back: [[172, 60], [190, 200], [250, 330], [360, 410], [520, 432], [680, 418], [820, 370], [940, 300], [1040, 250], [1116, 236]],
    plate: { top: 590, width: 0.72, lift: 14 }, rings: { count: 13, from: 210, to: 970 }, budget: 0.54, scale: 0.9, kick: 0.2
  };
  function lerpT(T, y) {
    if (y <= T[0][0]) return T[0][1];
    for (var i = 0; i < T.length - 1; i++) if (y <= T[i + 1][0]) return T[i][1] + (T[i + 1][1] - T[i][1]) * (y - T[i][0]) / (T[i + 1][0] - T[i][0]);
    return T[T.length - 1][1];
  }
  function inPoly(P, x, y) {
    var c = false;
    for (var a = 0, b = P.length - 1; a < P.length; b = a++)
      if ((P[a][1] > y) !== (P[b][1] > y) && x < (P[b][0] - P[a][0]) * (y - P[a][1]) / (P[b][1] - P[a][1]) + P[a][0]) c = !c;
    return c;
  }
  function seg3(Q) { var s = [], t = 0; for (var q = 0; q < Q.length - 1; q++) { var dx = Q[q + 1][0] - Q[q][0], dy = Q[q + 1][1] - Q[q][1], dz = (Q[q + 1][2] || 0) - (Q[q][2] || 0), l = Math.sqrt(dx * dx + dy * dy + dz * dz); s.push(l); t += l; } return { s: s, t: t }; }
  function along3(Q, sg, d) {
    var s = 0; while (s < sg.s.length - 1 && d > sg.s[s]) { d -= sg.s[s]; s++; }
    var f = sg.s[s] ? d / sg.s[s] : 0, A = Q[s], B = Q[s + 1];
    return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, (A[2] || 0) + ((B[2] || 0) - (A[2] || 0)) * f];
  }
  function armour(spec) {
    var o = merge(ARMOUR_DEFAULTS, spec);
    o.plate = merge(ARMOUR_DEFAULTS.plate, spec.plate); o.rings = merge(ARMOUR_DEFAULTS.rings, spec.rings);
    return function (n, r) {
      var CX = 512, CY = 645, S = 470, PF = 2.6, PB = 2.2, SIL = o.sil, DF = o.front, DB = o.back, k, i, j;
      function M(P) { var m = []; for (var q = 0; q < P.length; q++) m.push([2 * CX - P[q][0], P[q][1]]); return m; }
      function half(y) { return (lerpT(SIL, y - 24) + 2 * lerpT(SIL, y) + lerpT(SIL, y + 24)) / 4; }   // eased through the knots
      function at(x, y, lift) {
        var w = half(y), a = Math.min(1, Math.abs(x - CX) / Math.max(1, w)), z = -lerpT(DF, y) * Math.pow(1 - Math.pow(a, PF), 1 / PF);
        if (y > o.plate.top && a < o.plate.width) z -= o.plate.lift;                       // the faceplate stands proud
        return [(x - CX) / S, (y - CY) / S, (z - (lift || 0)) / S];
      }
      // drawn lines go onto the shell, subdivided so they hug the curve
      function lift3(P, lift) {
        var Q2 = []; for (var q = 0; q < P.length; q++) Q2.push([P[q][0], P[q][1], 0]);
        var sg = seg3(Q2), m = Math.max(2, Math.ceil(sg.t / 12)), Q = [];
        for (q = 0; q <= m; q++) { var p = along3(Q2, sg, q / m * sg.t); Q.push(at(p[0], p[1], lift)); }
        return Q;
      }
      function ring(y, m) {
        var w = half(y), df = lerpT(DF, y), db = lerpT(DB, y), Q = [];
        for (var q = 0; q <= m; q++) {
          var a = q / m * TAU, c = Math.cos(a), s = Math.sin(a), p = s < 0 ? PF : PB;
          var ex = Math.pow(Math.abs(c), 2 / p) * (c < 0 ? -1 : 1), ez = Math.pow(Math.abs(s), 2 / p) * (s < 0 ? -1 : 1);
          Q.push([ex * w / S, (y - CY) / S, (ez < 0 ? ez * df : ez * db) / S]);
        }
        return Q;
      }
      function ear(side, rad) {
        var Q = [], y0 = o.ears.y, z0 = o.ears.z;
        for (var q = 0; q <= 28; q++) { var a = q / 28 * TAU, y = y0 + Math.sin(a) * rad; Q.push([side * (half(y) + 10) / S, (y - CY) / S, (z0 + Math.cos(a) * rad) / S]); }
        return Q;
      }
      var pts = [], pairs = [], bright = [], links = [], art = [], tone = [], linkTone = [], alpha = [], surf = {};
      function run3(Q, cnt, glow, tn) {
        var sg = seg3(Q);
        for (var q = 0; q < cnt && pts.length < n; q++) {
          if (glow) bright.push(pts.length);
          pts.push(along3(Q, sg, (q + 0.5) / cnt * sg.t)); tone.push(tn || 0); alpha.push(1);
          if (q) pairs.push([pts.length - 2, pts.length - 1]);
        }
      }
      for (i = 0; i < o.lines.length; i++) {
        var ln = o.lines[i];
        if (ln.edge) { ln = merge(ln, { p: [] }); for (k = 0; k <= 12; k++) { var ye = ln.edge[0] + k / 12 * (ln.edge[1] - ln.edge[0]); ln.p.push([CX - half(ye) * ln.edge[2], ye]); } }
        art.push({ Q: lift3(ln.p, 4), w: ln.w || 1, glow: !!ln.glow, tone: ln.tone || 0 });
        if (ln.mirror) art.push({ Q: lift3(M(ln.p), 4), w: ln.w || 1, glow: !!ln.glow, tone: ln.tone || 0 });
      }
      if (o.ears) for (k = 0; k < o.ears.r.length; k++) art.push({ Q: ear(-1, o.ears.r[k]), w: 0.7 - k * 0.2, tone: o.ears.tone || 0 }, { Q: ear(1, o.ears.r[k]), w: 0.7 - k * 0.2, tone: o.ears.tone || 0 });
      var tot = 0; for (i = 0; i < art.length; i++) { art[i].len = seg3(art[i].Q).t; tot += art[i].len * art[i].w; }
      var lineBudget = Math.floor(n * o.budget);
      for (i = 0; i < art.length; i++) {
        run3(art[i].Q, Math.max(4, Math.round(lineBudget * art[i].len * art[i].w / tot)), art[i].glow, art[i].tone);
        for (k = 0; k < art[i].Q.length - 1; k++) { links.push([art[i].Q[k], art[i].Q[k + 1]]); linkTone.push(art[i].tone); }
      }
      // jittered-grid sampling: even coverage (no clumps, no gaps), so filled regions read solid
      function strat(bx, cnt, test) {
        var area = 0, gx, gy, c, hit = [], probe = 0;
        for (k = 0; k < 400; k++) { probe++; if (test(bx[0] + r() * (bx[2] - bx[0]), bx[1] + r() * (bx[3] - bx[1]))) area++; }
        area = area / probe * (bx[2] - bx[0]) * (bx[3] - bx[1]);
        c = Math.max(1.5, Math.sqrt(area / Math.max(1, cnt))); strat.cell = c;
        for (gy = bx[1]; gy < bx[3]; gy += c) for (gx = bx[0]; gx < bx[2]; gx += c) {
          var sx = gx + r() * c, sy = gy + r() * c; if (test(sx, sy)) hit.push([sx, sy]);
        }
        for (k = hit.length - 1; k > 0; k--) { var sw = Math.floor(r() * (k + 1)), tmp = hit[k]; hit[k] = hit[sw]; hit[sw] = tmp; }
        return hit.slice(0, cnt);
      }
      function bbox(polys) { var b = [1e9, 1e9, -1e9, -1e9]; for (var q = 0; q < polys.length; q++) for (var v = 0; v < polys[q].length; v++) { var P0 = polys[q][v]; b[0] = Math.min(b[0], P0[0]); b[1] = Math.min(b[1], P0[1]); b[2] = Math.max(b[2], P0[0]); b[3] = Math.max(b[3], P0[1]); } return b; }
      // filled regions (eyes, a visor): sampled inside the outline, minus any cut-outs
      var holes = [];
      for (i = 0; i < (o.fills || []).length; i++) {
        var F = o.fills[i], polys = F.mirror ? [F.p, M(F.p)] : [F.p], cuts = [], cnt = Math.floor(n * F.share);
        for (k = 0; k < (F.cut || []).length; k++) { cuts.push(F.cut[k]); if (F.mirror) cuts.push(M(F.cut[k])); }
        for (k = 0; k < polys.length; k++) holes.push(polys[k]);
        var got = strat(bbox(polys), cnt, function (fx, fy) {
          var inside = false, q;
          for (q = 0; q < polys.length && !inside; q++) inside = inPoly(polys[q], fx, fy);
          for (q = 0; q < cuts.length && inside; q++) if (inPoly(cuts[q], fx, fy)) inside = false;
          return inside;
        });
        for (j = 0; j < got.length && pts.length < n; j++) {
          if (F.glow !== false) { bright.push(pts.length); surf[pts.length] = strat.cell / S; }
          pts.push(at(got[j][0], got[j][1], 8)); tone.push(F.tone || 0); alpha.push(F.alpha == null ? 1 : F.alpha);
        }
      }
      // the shell itself: an even skin over the whole head, laid in rows round it (equal spacing along
      // each row and between rows), so the helmet reads as a solid under the light from any side.
      // Panels give front regions their own tone (a gold faceplate); the eyes and visor stay open.
      if (o.surface && o.surface.share) {
        var SF = o.surface, panels = [], y0 = SIL[0][0] + 4, y1 = SIL[SIL.length - 1][0] - 4, area = 0, yy, Qr, sgr0, row = 0;
        for (k = 0; k < (SF.panels || []).length; k++) { panels.push(SF.panels[k]); if (SF.panels[k].mirror) panels.push({ p: M(SF.panels[k].p), tone: SF.panels[k].tone, alpha: SF.panels[k].alpha }); }
        for (yy = y0; yy <= y1; yy += 8) area += seg3(ring(yy, 64)).t * S * 8;
        var cnt0 = Math.floor(n * SF.share), cs = Math.sqrt(area / Math.max(1, cnt0)) * 1.04;
        for (yy = y0 + cs * 0.5; yy <= y1 && pts.length < n; yy += cs, row++) {
          Qr = ring(yy, 96); sgr0 = seg3(Qr);
          var m0 = Math.max(3, Math.round(sgr0.t * S / cs)), off = (row * 0.618034) % 1;
          for (j = 0; j < m0 && pts.length < n; j++) {
            var p3 = along3(Qr, sgr0, ((j + off + (r() - 0.5) * 0.5) / m0 % 1) * sgr0.t), sx0 = p3[0] * S + CX, front = p3[2] < 0, ptn = SF.tone || 0, pal0 = SF.alpha == null ? 0.5 : SF.alpha, hole = false;
            if (front) {
              for (k = 0; k < holes.length && !hole; k++) hole = inPoly(holes[k], sx0, yy);
              if (hole) continue;
              for (k = 0; k < panels.length; k++) if (inPoly(panels[k].p, sx0, yy)) { ptn = panels[k].tone || 0; if (panels[k].alpha != null) pal0 = panels[k].alpha; break; }
              p3 = at(sx0, yy, 1);
            }
            surf[pts.length] = cs / S; pts.push(p3); tone.push(ptn); alpha.push(pal0);
          }
        }
      }
      // screws: small rings
      var screws = o.screws || [], sc = screws.length ? Math.floor(n * 0.015) : 0;
      for (i = 0; i < sc && pts.length < n; i++) { var S0 = screws[i % screws.length], a2 = (i / sc) * Math.PI * 12, rr = i % 3 ? 11 : 4; pts.push(at(S0[0] + Math.cos(a2) * rr, S0[1] + Math.sin(a2) * rr, 4)); tone.push(o.screwTone || 0); alpha.push(1); }
      // the scan: contour rings round the shell, skipping the face so the seams read clean
      var RN = o.rings.count, left = n - pts.length, per = [], rt = 0, levels = [];
      for (k = 0; k < RN; k++) {
        var yl = o.rings.from + k / Math.max(1, RN - 1) * (o.rings.to - o.rings.from), Q = ring(yl, 96), keep = [];
        for (j = 0; j < Q.length; j++) { var p0 = Q[j]; keep.push(!(p0[2] < -0.22 && yl > 250 && Math.abs(p0[0]) < half(yl) / S * 0.82)); }
        levels.push({ Q: Q, keep: keep }); var sl = seg3(Q).t; per.push(sl); rt += sl;
      }
      for (k = 0; k < RN && pts.length < n; k++) {
        var lv = levels[k], sgr = seg3(lv.Q), rc = Math.round(left * per[k] / rt), prev = -1;
        for (j = 0; j < rc && pts.length < n; j++) {
          var d = (j + 0.5) / rc * sgr.t, s = 0; while (s < sgr.s.length - 1 && d > sgr.s[s]) { d -= sgr.s[s]; s++; }
          if (!lv.keep[s]) { prev = -1; continue; }
          pts.push(along3(lv.Q, sgr, (j + 0.5) / rc * sgr.t)); tone.push(o.rings.tone || 0); alpha.push(o.rings.alpha == null ? 1 : o.rings.alpha);
          if (prev >= 0) pairs.push([prev, pts.length - 1]); prev = pts.length - 1;
        }
      }
      while (pts.length < n) { var dup = Math.floor(r() * pts.length); pts.push(pts[dup].slice()); tone.push(tone[dup]); alpha.push(alpha[dup]); }
      // normals from the shell's implicit form: F = |x / w(y)|^p + |z / d(y)|^p is 1 on the skin, and its
      // gradient points out of it everywhere (front, back, lines lifted off it, ears), so light can find the form
      function shellF(x, y, z) {
        var w = Math.max(1, half(y)), d = Math.max(1, z < 0 ? lerpT(DF, y) : lerpT(DB, y)), pz = z < 0 ? PF : PB;
        return Math.pow(Math.abs(x) / w, pz) + Math.pow(Math.abs(z) / d, pz);
      }
      var normals = [];
      for (k = 0; k < n; k++) {
        var q0 = pts[k], X0 = q0[0] * S, Y0 = q0[1] * S + CY, Z0 = q0[2] * S, e = 2;
        var gx = shellF(X0 + e, Y0, Z0) - shellF(X0 - e, Y0, Z0), gy = shellF(X0, Y0 + e, Z0) - shellF(X0, Y0 - e, Z0), gz = shellF(X0, Y0, Z0 + e) - shellF(X0, Y0, Z0 - e);
        var gl0 = Math.sqrt(gx * gx + gy * gy + gz * gz);
        normals.push(gl0 > 1e-9 && isFinite(gl0) ? [gx / gl0, gy / gl0, gz / gl0] : [0, 0, Z0 < 0 ? -1 : 1]);
      }
      // named anchors, for overlays that point at the features (field.anchors())
      var anchors = {};
      for (var an in o.anchors || {}) {
        var A = o.anchors[an];
        anchors[an] = A[3] === 'ear' ? [A[4] * (half(A[1]) + 10) / S, (A[1] - CY) / S, A[2] / S] : at(A[0], A[1], A[2]);
      }
      var K = o.scale, out = pts.slice(0, n);
      // the face rig: soft regions of the drawing that move with expression channels
      // (field.setFace). Each front-facing point and link end gets a displacement per channel.
      var rig = null;
      if (o.rig && o.rig.length) {
        var defs = [];
        for (i = 0; i < o.rig.length; i++) {
          var R0 = o.rig[i]; defs.push(R0);
          if (R0.mirror) {
            var b0 = R0.box; defs.push({ ch: R0.mirror, box: [2 * CX - b0[2], b0[1], 2 * CX - b0[0], b0[3]], soft: R0.soft, ramp: R0.ramp, lid: R0.lid,
              move: R0.move ? [-R0.move[0], R0.move[1], R0.move[2]] : null, squeeze: R0.squeeze ? [2 * CX - R0.squeeze[0], R0.squeeze[1]] : null });
          }
        }
        var sm = function (a, b, x) { if (b === a) return x >= a ? 1 : 0; var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        var disp = function (D, p, out3) {
          if (p[2] > -0.05) return false;                                                     // the face only, not the back of the head
          var x = p[0] * S + CX, y = p[1] * S + CY, B = D.box, sf = D.soft || 20;
          var w = sm(B[0] - sf, B[0] + sf, x) * (1 - sm(B[2] - sf, B[2] + sf, x)) * sm(B[1] - sf, B[1] + sf, y) * (1 - sm(B[3] - sf, B[3] + sf, y));
          if (D.ramp) w *= sm(D.ramp[0], D.ramp[1], y);
          if (w <= 0.001) return false;
          var dx = 0, dy = 0, dz = 0;
          if (D.move) { dx += D.move[0]; dy += D.move[1]; dz += D.move[2] || 0; }
          if (D.squeeze) dx += (D.squeeze[0] - x) * D.squeeze[1];
          if (D.lid != null) dy += (D.lid - y) * 0.92;                                        // eyelids: the slit closes onto its lid line
          out3[0] = dx * w / S * K; out3[1] = dy * w / S * K; out3[2] = -dz * w / S * K; return true;
        };
        rig = { P: {}, L: {}, dim: {} };
        var d3 = [0, 0, 0];
        for (i = 0; i < defs.length; i++) {
          var D = defs[i], P = rig.P[D.ch] || (rig.P[D.ch] = new F32(n * 3)), LL = rig.L[D.ch] || (rig.L[D.ch] = new F32(links.length * 6)), hit = false;
          for (k = 0; k < n; k++) if (disp(D, out[k], d3)) { P[k * 3] += d3[0]; P[k * 3 + 1] += d3[1]; P[k * 3 + 2] += d3[2]; hit = true; }
          for (k = 0; k < links.length; k++) for (j = 0; j < 2; j++) if (disp(D, links[k][j], d3)) { LL[k * 6 + j * 3] += d3[0]; LL[k * 6 + j * 3 + 1] += d3[1]; LL[k * 6 + j * 3 + 2] += d3[2]; }
        }
        // glowing points dim with their side's blink
        if (o.dim) for (k = 0; k < bright.length; k++) { var bp = out[bright[k]], side = bp[0] * S + CX < CX ? o.dim[0] : o.dim[1]; (rig.dim[side] || (rig.dim[side] = [])).push(bright[k]); }
      }
      function sc3(p) { return [p[0] * K, p[1] * K, p[2] * K]; }
      for (k = 0; k < out.length; k++) out[k] = sc3(out[k]);
      for (k = 0; k < links.length; k++) links[k] = [sc3(links[k][0]), sc3(links[k][1])];
      for (an in anchors) anchors[an] = sc3(anchors[an]);
      var surfel = []; for (k = 0; k < n; k++) surfel.push(surf[k] ? surf[k] * K : 0);
      return { points: out, pairs: pairs, links: links, bright: bright, anchors: anchors, tone: tone.slice(0, n), alpha: alpha.slice(0, n), normals: normals.slice(0, n), surfel: surfel, linkTone: linkTone, rig: rig, facing: true, kick: o.kick, lineArt: true };
    };
  }

  // helm: an armoured helmet traced from line art — forehead tab, temple screws, a V brow,
  // angular eye slits, cheek slashes, a mouth block with stacked chin plates, ear discs.
  var HELM_RIG = [
    { ch: 'eyeBlinkL', mirror: 'eyeBlinkR', box: [244, 578, 452, 648], soft: 8, lid: 614 },
    { ch: 'browUp', box: [400, 560, 624, 622], soft: 34, move: [0, -22, 0] },
    { ch: 'browDownL', mirror: 'browDownR', box: [205, 548, 470, 600], soft: 22, move: [0, 14, 0] },
    { ch: 'jawOpen', box: [372, 950, 652, 1130], soft: 30, ramp: [936, 992], move: [0, 74, 4] },
    { ch: 'smileL', mirror: 'smileR', box: [398, 900, 470, 1012], soft: 26, move: [-18, -20, 0] },
    { ch: 'pucker', box: [404, 900, 620, 1012], soft: 18, squeeze: [512, 0.34] },
    { ch: 'press', box: [404, 900, 620, 1012], soft: 10, lid: 958 },
    { ch: 'mouthL', mirror: 'mouthR', box: [400, 900, 624, 1012], soft: 20, move: [-24, 0, 0] },
    { ch: 'chinRaise', box: [410, 1004, 614, 1130], soft: 20, move: [0, -18, 0] },
    { ch: 'cheekPuff', mirror: 'cheekPuff', box: [226, 650, 418, 962], soft: 40, move: [-22, 0, 18] },
    { ch: 'squintL', mirror: 'squintR', box: [240, 640, 420, 820], soft: 30, move: [0, -16, 4] }
  ];
  var HELM_EYE = [[252, 582], [437, 603], [445, 628], [418, 642], [300, 636], [250, 603], [252, 582]];
  // the gold faceplate: under the V brow, between the plate edges, down through the chin plates
  var HELM_PLATE = [[205, 598], [258, 560], [430, 583], [462, 612], [562, 612], [594, 583], [766, 560], [819, 598],
    [812, 640], [799, 740], [762, 840], [704, 920], [652, 972], [609, 958], [600, 1010], [592, 1062], [578, 1116], [446, 1116], [432, 1062], [424, 1010],
    [415, 958], [372, 972], [320, 920], [262, 840], [225, 740], [212, 640]];
  register('helm', armour({
    sil: [[172, 40], [182, 122], [220, 227], [295, 297], [410, 330], [500, 334], [620, 316], [740, 294], [860, 266], [960, 226], [1040, 178], [1100, 124], [1126, 96]],
    lines: [
      { p: [[398, 182], [403, 255], [425, 375], [458, 412], [566, 412], [599, 375], [621, 255], [626, 182]], w: 1.1 },          // forehead tab
      { p: [[420, 252], [447, 352], [463, 372], [561, 372], [577, 352], [604, 252], [420, 252]], w: 0.8 },
      { p: [[205, 598], [258, 560], [430, 583], [462, 612], [562, 612], [594, 583], [766, 560], [819, 598]], tone: 1, w: 1.4 },          // V brow
      { p: HELM_EYE, tone: 1, w: 1.3, glow: true, mirror: true },
      { p: [[212, 640], [225, 740], [262, 840], [320, 920], [372, 972], [415, 958]], tone: 1, w: 1.1, mirror: true },                     // plate edge
      { p: [[250, 700], [300, 800], [345, 900], [385, 962]], tone: 1, w: 0.9, mirror: true },                                          // cheek slash
      { p: [[318, 660], [368, 820], [415, 915]], tone: 1, w: 0.7, mirror: true },
      { p: [[413, 912], [612, 912], [606, 968], [590, 1002], [434, 1002], [418, 968], [413, 912]], tone: 1, w: 1.1 },                  // mouth
      { p: [[420, 965], [604, 965]], tone: 1, w: 0.6 },
      { p: [[424, 1010], [600, 1010], [592, 1062], [432, 1062], [424, 1010]], tone: 1, w: 0.9 },                                       // chin plates
      { p: [[436, 1075], [588, 1075], [578, 1112], [446, 1112], [436, 1075]], tone: 1, w: 0.8 },
      { edge: [640, 1110, 0.93], w: 0.9, mirror: true }                                                                       // jaw: along the silhouette
    ],
    fills: [{ p: HELM_EYE, share: 0.07, mirror: true, tone: 1 }],
    surface: { share: 0.34, alpha: 0.5, panels: [{ p: HELM_PLATE, tone: 1, alpha: 0.6 }] },
    budget: 0.36,
    screws: [[270, 255], [754, 255]],
    ears: { y: 560, z: 40, r: [64, 30] },
    rings: { count: 9, from: 210, to: 970, alpha: 0.5 },
    anchors: { tab: [512, 300, 4], eyeL: [346, 612, 8], eyeR: [678, 612, 8], mouth: [512, 960, 4], chin: [512, 1094, 4], earL: [0, 560, 40, 'ear', -1], earR: [0, 560, 40, 'ear', 1] },
    // the face rig (field.setFace): eyelids, brows, jaw, lips, cheeks and chin
    rig: HELM_RIG, dim: ['eyeBlinkL', 'eyeBlinkR']
  }));

  // ranger: a white-and-gold ranger helmet — a gold crest peaking onto the forehead and into
  // the visor, a wide visor that sweeps to the temples and dips to a point, sharp gold fangs
  // under it, a gold band round the face, a slotted mouthplate, and tiger stripes over the
  // crown. Gold is the accent tone, the shell the point tone. Rigged like the helm.
  var RANGER_VISOR = [[234, 588], [352, 566], [468, 552], [494, 570], [512, 600], [530, 570], [556, 552], [672, 566], [790, 588], [786, 640], [744, 668], [668, 700], [598, 748], [548, 796], [512, 812], [476, 796], [426, 748], [356, 700], [280, 668], [238, 640]];
  var RANGER_FANG = [[280, 660], [470, 712], [300, 704]];
  var RANGER_SLOTS = [];
  (function () {
    for (var q = 0; q < 7; q++) {
      var t = (q - 3) / 3, xt = 512 + t * 36, xb = 512 + t * 70, h = 4;
      RANGER_SLOTS.push({ p: [[xt - h, 846], [xt + h, 846], [xb + h * 1.4, 966], [xb - h * 1.4, 966], [xt - h, 846]], w: 0.45, tone: 1 });
    }
  })();
  var RANGER_RIG = [
    { ch: 'eyeBlinkL', mirror: 'eyeBlinkR', box: [232, 552, 500, 712], soft: 12, lid: 630 },
    { ch: 'browUp', box: [390, 400, 634, 600], soft: 36, move: [0, -20, 0] },
    { ch: 'browDownL', mirror: 'browDownR', box: [232, 540, 480, 600], soft: 22, move: [0, 12, 0] },
    { ch: 'jawOpen', box: [392, 840, 632, 1110], soft: 30, ramp: [836, 1000], move: [0, 66, 4] },
    { ch: 'smileL', mirror: 'smileR', box: [396, 930, 470, 1012], soft: 26, move: [-14, -16, 0] },
    { ch: 'pucker', box: [404, 870, 620, 1012], soft: 18, squeeze: [512, 0.26] },
    { ch: 'press', box: [404, 900, 620, 1012], soft: 10, lid: 950 },
    { ch: 'mouthL', mirror: 'mouthR', box: [400, 830, 624, 1012], soft: 20, move: [-20, 0, 0] },
    { ch: 'chinRaise', box: [420, 990, 604, 1100], soft: 20, move: [0, -16, 0] },
    { ch: 'cheekPuff', mirror: 'cheekPuff', box: [222, 660, 430, 1000], soft: 40, move: [-20, 0, 16] },
    { ch: 'squintL', mirror: 'squintR', box: [262, 650, 470, 760], soft: 26, move: [0, -14, 4] }
  ];
  register('ranger', armour({
    sil: [[172, 44], [180, 142], [216, 254], [292, 328], [404, 352], [520, 356], [650, 342], [780, 314], [890, 274], [980, 222], [1048, 168], [1100, 116], [1126, 86]],
    plate: { top: 520, width: 0.74, lift: 12 },
    lines: [
      { p: [[212, 616], [256, 568], [334, 526], [424, 498], [478, 466], [512, 418]], w: 1.4, tone: 1, mirror: true },             // the crest
      { p: [[244, 600], [300, 562], [380, 532], [454, 514], [496, 486], [512, 470]], w: 0.6, tone: 1, mirror: true },             // its inner edge
      { p: [[212, 616], [218, 720], [246, 830], [296, 922], [358, 992], [430, 1050], [512, 1080]], w: 1.3, tone: 1, mirror: true },  // faceplate edge
      { p: [[244, 676], [256, 790], [296, 884], [352, 950], [420, 1006], [470, 1034]], w: 0.6, tone: 1, mirror: true },           // the gold band's inner edge
      { p: RANGER_VISOR.concat([RANGER_VISOR[0]]), w: 1.6, glow: true },                                                           // visor
      { p: RANGER_FANG.concat([RANGER_FANG[0]]), w: 1.0, tone: 1, mirror: true },                                                 // fangs
      { p: [[474, 828], [550, 828], [586, 900], [604, 972], [582, 996], [512, 1006], [442, 996], [420, 972], [438, 900], [474, 828]], w: 1.3, tone: 1 },  // mouthplate
      { p: [[420, 1000], [452, 1044], [512, 1066]], w: 0.8, tone: 1, mirror: true },                                              // chin
      { p: [[512, 194], [512, 300], [500, 352], [512, 396]], w: 0.9 },                                                            // tiger stripes
      { p: [[492, 214], [452, 246], [430, 296], [440, 340]], w: 0.8, mirror: true },
      { p: [[446, 206], [404, 244], [386, 300], [398, 356]], w: 0.7, mirror: true },
      { p: [[384, 220], [344, 262], [330, 318], [346, 372]], w: 0.6, mirror: true },
      { p: [[318, 256], [290, 304], [290, 360]], w: 0.5, mirror: true },
      { edge: [620, 1100, 0.95], w: 0.8, mirror: true }
    ].concat(RANGER_SLOTS),
    fills: [{ p: RANGER_VISOR, share: 0.05, cut: [RANGER_FANG], tone: 0, glow: false, alpha: 0.3 }],   // dark glass
    surface: { share: 0.34, alpha: 0.5, panels: [
      { p: [[212, 616], [218, 720], [246, 830], [296, 922], [358, 992], [430, 1050], [512, 1080], [512, 1046], [470, 1034], [420, 1006], [352, 950], [296, 884], [256, 790], [244, 676]], tone: 1, alpha: 0.6, mirror: true },  // the gold band
      { p: [[212, 616], [256, 568], [334, 526], [424, 498], [478, 466], [512, 418], [512, 470], [496, 486], [454, 514], [380, 532], [300, 562], [244, 600]], tone: 1, alpha: 0.6, mirror: true }  // the crest
    ] },
    budget: 0.36,
    ears: { y: 600, z: 30, r: [56, 26], tone: 1 },
    rings: { count: 9, from: 210, to: 960, alpha: 0.5 },
    kick: 0.25,
    anchors: { tab: [512, 300, 4], eyeL: [372, 630, 8], eyeR: [652, 630, 8], mouth: [512, 900, 4], chin: [512, 1060, 4], earL: [0, 600, 30, 'ear', -1], earR: [0, 600, 30, 'ear', 1] },
    rig: RANGER_RIG, dim: ['eyeBlinkL', 'eyeBlinkR']
  }));

  // ---- figure: people from a skeleton ----
  // figure(spec) → { line, lit }: two builders for one person, sharing a pose, an idle loop and
  // anchors. line is a modern stick figure (bones, joint nodes, prop outlines) that a pen traces
  // head first; lit is the same person as a sleek lit mannequin (a lofted torso, tapered limbs,
  // an egg head, props in the accent tone) with seams that carry signals and a bright core at
  // the chest. Morph line → lit and the drawing fills into a body.
  //   spec: { pose: name | { joint: [x, y, z] }, action?: name, props?: [name…], trace?: ms }
  // Joints sit in a ~1.8-tall box, y down, facing the viewer (−z). Every point belongs to a
  // joint; the idle loop moves joints (breathing, a weight shift, a glance, the trade's own
  // action) and flow carries their points with them, rotations and all.
  var FIG_J = ['pelvis', 'chest', 'neck', 'head', 'shL', 'elL', 'haL', 'shR', 'elR', 'haR', 'hipL', 'knL', 'anL', 'toL', 'hipR', 'knR', 'anR', 'toR'];
  var FIG_UP = [-1, 0, 1, 2, 1, 4, 5, 1, 7, 8, 0, 10, 11, 12, 0, 14, 15, 16];
  var FIG_REST = [[0, -0.06, 0], [0, -0.48, 0], [0, -0.64, 0], [0, -0.8, 0], [-0.175, -0.585, 0], [-0.215, -0.3, 0.01], [-0.235, -0.04, -0.01],
    [0.175, -0.585, 0], [0.215, -0.3, 0.01], [0.235, -0.04, -0.01], [-0.085, -0.03, 0], [-0.095, 0.4, -0.01], [-0.1, 0.83, 0.01], [-0.11, 0.89, -0.09],
    [0.085, -0.03, 0], [0.095, 0.4, -0.01], [0.1, 0.83, 0.01], [0.11, 0.89, -0.09]];
  var FIG_POSES = {
    stand: {},
    tablet: { elL: [-0.2, -0.34, -0.07], haL: [-0.075, -0.31, -0.19], elR: [0.2, -0.34, -0.07], haR: [0.075, -0.31, -0.19], head: [0, -0.79, -0.03] },
    wrench: { elL: [-0.27, -0.33, 0.01], haL: [-0.14, -0.12, -0.05], elR: [0.21, -0.35, -0.08], haR: [0.17, -0.21, -0.25] },
    hammer: { elL: [-0.2, -0.35, -0.09], haL: [-0.11, -0.25, -0.23], elR: [0.26, -0.6, -0.05], haR: [0.22, -0.84, -0.1] },
    phone: { elL: [-0.25, -0.47, -0.05], haL: [-0.105, -0.76, -0.035], elR: [0.21, -0.32, -0.05], haR: [0.12, -0.17, -0.16], head: [-0.015, -0.8, 0] },
    keys: { elL: [-0.25, -0.44, -0.1], haL: [-0.21, -0.66, -0.2] },
    inspect: { elL: [-0.27, -0.33, 0.01], haL: [-0.14, -0.12, -0.05], elR: [0.22, -0.4, -0.11], haR: [0.1, -0.61, -0.2], head: [0, -0.8, -0.02] },
    // both hands on a long pole running from upper left to lower right (roller, rake, skimmer, mop)
    pole: { elL: [-0.19, -0.44, -0.1], haL: [-0.04, -0.46, -0.22], elR: [0.24, -0.35, -0.06], haR: [0.2, -0.2, -0.2] },
    // both hands low in front, carrying (a box, a pane of glass)
    carry: { elL: [-0.2, -0.32, -0.06], haL: [-0.14, -0.12, -0.2], elR: [0.2, -0.32, -0.06], haR: [0.14, -0.12, -0.2] },
    // both arms overhead, holding something up (a solar panel)
    reach: { elL: [-0.24, -0.79, -0.04], haL: [-0.17, -1.0, -0.06], elR: [0.24, -0.79, -0.04], haR: [0.17, -1.0, -0.06], head: [0, -0.8, 0.02] },
    // both hands together at the waist, pushing or gripping (a dolly, a chainsaw)
    push: { elL: [-0.18, -0.34, -0.1], haL: [-0.07, -0.2, -0.25], elR: [0.18, -0.34, -0.1], haR: [0.07, -0.2, -0.25] },
    // one arm out front with a wand, the other on a hip
    spray: { elL: [-0.27, -0.33, 0.01], haL: [-0.14, -0.12, -0.05], elR: [0.27, -0.36, -0.07], haR: [0.37, -0.16, -0.16] },
    // a tray held up at the shoulder
    tray: { elL: [-0.27, -0.43, -0.07], haL: [-0.21, -0.61, -0.19], head: [0.01, -0.8, 0] },
    // seated at a desk, hands on the keyboard
    typing: { pelvis: [0, 0.22, 0.04], head: [0, -0.5, -0.06], elL: [-0.21, -0.06, -0.06], haL: [-0.1, 0.02, -0.3], elR: [0.21, -0.06, -0.06], haR: [0.1, 0.02, -0.3],
      knL: [-0.095, 0.26, -0.4], anL: [-0.1, 0.69, -0.42], toL: [-0.11, 0.73, -0.51], knR: [0.095, 0.26, -0.4], anR: [0.1, 0.69, -0.42], toR: [0.11, 0.73, -0.51] },
    // seated, leaning back a little, one hand at the chin: thinking out the prompt
    prompting: { pelvis: [0, 0.22, 0.05], chest: [0, -0.2, 0.09], head: [0.02, -0.5, 0.06], elL: [-0.25, -0.1, -0.02], haL: [-0.07, -0.38, -0.1], elR: [0.21, -0.05, -0.04], haR: [0.1, 0.02, -0.3],
      knL: [-0.095, 0.26, -0.4], anL: [-0.1, 0.69, -0.42], toL: [-0.11, 0.73, -0.51], knR: [0.095, 0.26, -0.4], anR: [0.1, 0.69, -0.42], toR: [0.11, 0.73, -0.51] }
  };
  // actions: the trade's own motion, as rotations of a joint's subtree about another joint
  function smooth01(a) { a = a < 0 ? 0 : a > 1 ? 1 : a; return a * a * (3 - 2 * a); }
  // actions as data, so they travel as JSON: each term turns a joint's subtree about another joint,
  //   { pivot, joint, axis: [x, y, z], amp (radians), rate (rad/s; cycles/s for swing), wave: 'sin' | 'pulse' | 'swing' | 'burst' | 'hold', gate?, phase? }
  var ACTIONS = {
    tablet: [{ pivot: 'elR', joint: 'haR', axis: [1, 0, 0], amp: 0.07, rate: 2.4, wave: 'pulse' }, { pivot: 'neck', joint: 'head', axis: [1, 0, 0], amp: 0.05, rate: 0.8 }],
    wrench: [{ pivot: 'elR', joint: 'haR', axis: [0, 0, 1], amp: 0.36, rate: 2.1 }, { pivot: 'neck', joint: 'head', axis: [1, 0, 0], amp: 0.08, wave: 'hold' }],
    hammer: [{ pivot: 'shR', joint: 'elR', axis: [1, 0, 0], amp: 0.95, rate: 0.85, wave: 'swing' }, { pivot: 'elR', joint: 'haR', axis: [1, 0, 0], amp: 0.45, rate: 0.85, wave: 'swing' }],
    phone: [{ pivot: 'neck', joint: 'head', axis: [1, 0, 0], amp: 0.05, rate: 1.9 }, { pivot: 'elR', joint: 'haR', axis: [0, 1, 0], amp: 0.22, rate: 0.9 }],
    keys: [{ pivot: 'elL', joint: 'haL', axis: [0, 0, 1], amp: 0.12, rate: 7, wave: 'burst', gate: 0.9 }, { pivot: 'neck', joint: 'head', axis: [0, 1, 0], amp: 0.14, rate: 0.5 }],
    inspect: [{ pivot: 'neck', joint: 'head', axis: [0, 1, 0], amp: 0.12, rate: 0.6 }, { pivot: 'shR', joint: 'elR', axis: [1, 0, 0], amp: 0.08, rate: 0.7 }],
    pole: [{ pivot: 'chest', joint: 'shR', axis: [0, 0, 1], amp: 0.07, rate: 1.6 }, { pivot: 'chest', joint: 'shL', axis: [0, 0, 1], amp: 0.07, rate: 1.6 }],
    carry: [{ pivot: 'neck', joint: 'head', axis: [0, 1, 0], amp: 0.12, rate: 0.5 }],
    reach: [{ pivot: 'chest', joint: 'shR', axis: [0, 0, 1], amp: 0.035, rate: 1 }, { pivot: 'chest', joint: 'shL', axis: [0, 0, 1], amp: 0.035, rate: 1 }],
    push: [{ pivot: 'neck', joint: 'head', axis: [0, 1, 0], amp: 0.1, rate: 0.45 }, { pivot: 'chest', joint: 'shR', axis: [0, 1, 0], amp: 0.04, rate: 3.2 }, { pivot: 'chest', joint: 'shL', axis: [0, 1, 0], amp: 0.04, rate: 3.2 }],
    spray: [{ pivot: 'shR', joint: 'elR', axis: [0, 1, 0], amp: 0.32, rate: 1.4 }],
    tray: [{ pivot: 'elL', joint: 'haL', axis: [1, 0, 0], amp: 0.05, rate: 2 }, { pivot: 'neck', joint: 'head', axis: [0, 1, 0], amp: 0.1, rate: 0.4 }],
    typing: [{ pivot: 'elR', joint: 'haR', axis: [1, 0, 0], amp: 0.07, rate: 11 }, { pivot: 'elL', joint: 'haL', axis: [1, 0, 0], amp: 0.07, rate: 11, phase: 1.7 }, { pivot: 'neck', joint: 'head', axis: [1, 0, 0], amp: 0.03, rate: 0.7 }],
    prompting: [{ pivot: 'neck', joint: 'head', axis: [0, 1, 0], amp: 0.08, rate: 0.5 }, { pivot: 'elR', joint: 'haR', axis: [1, 0, 0], amp: 0.05, rate: 9, wave: 'burst', gate: 0.8 }]
  };
  function smooth01(a) { a = a < 0 ? 0 : a > 1 ? 1 : a; return a * a * (3 - 2 * a); }
  function wave(w, t) {
    var x = t * (w.rate || 1) + (w.phase || 0);
    switch (w.wave) {
      case 'hold': return 1;
      case 'pulse': return Math.pow(Math.max(0, Math.sin(x)), 6);
      case 'swing': var ph = x % 1; return ph < 0.16 ? smooth01(ph / 0.16) : 1 - smooth01((ph - 0.16) / 0.84);   // a quick strike, a slow lift
      case 'burst': return Math.sin(x) * Math.max(0, Math.sin(t * (w.gate || 1)));
      default: return Math.sin(x);
    }
  }
  function actionOf(spec) {
    var A = spec.action && typeof spec.action === 'object' ? spec.action : ACTIONS[spec.action || (typeof spec.pose === 'string' ? spec.pose : '')];
    if (!A || !A.length) return null;
    return function (t, rot) { for (var i = 0; i < A.length; i++) rot(A[i].pivot, A[i].joint, A[i].axis, (A[i].amp || 0) * wave(A[i], t)); };
  }
  // vector helpers (3-arrays)
  function v3(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
  function vsub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }   // Math.hypot is ES2015; this file stays ES5
  function vlen(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function vnorm(a) { var l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function basis(d) { var up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], e1 = vnorm(vcross(d, up)); return [e1, vcross(d, e1)]; }
  function rotM(ax, a) {   // Rodrigues: a 3×3 rotation about a unit axis, row-major
    var x = ax[0], y = ax[1], z = ax[2], c = Math.cos(a), s = Math.sin(a), C = 1 - c;
    return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  }
  function mul3(a, b) { var o = []; for (var r0 = 0; r0 < 3; r0++) for (var c0 = 0; c0 < 3; c0++) o.push(a[r0 * 3] * b[c0] + a[r0 * 3 + 1] * b[3 + c0] + a[r0 * 3 + 2] * b[6 + c0]); return o; }
  function mulMV(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
  function figRig(spec) {
    var J0 = [], j, k, pose = typeof spec.pose === 'string' ? FIG_POSES[spec.pose] || {} : spec.pose || {};
    // pose joints keep their bone lengths; joints a pose leaves alone ride along with their parent
    for (j = 0; j < FIG_J.length; j++) {
      var up = FIG_UP[j], want = pose[FIG_J[j]];
      if (up < 0) { J0.push((want || FIG_REST[j]).slice()); continue; }
      var restOff = vsub(FIG_REST[j], FIG_REST[up]);
      J0.push(want ? v3(J0[up], vnorm(vsub(want, J0[up])), vlen(restOff)) : v3(J0[up], restOff, 1));
    }
    var SUB = [];
    for (j = 0; j < FIG_J.length; j++) { var s = [j]; for (k = j + 1; k < FIG_J.length; k++) { var q = FIG_UP[k]; while (q > j) q = FIG_UP[q]; if (q === j) s.push(k); } SUB.push(s); }
    var idx = {}; for (j = 0; j < FIG_J.length; j++) idx[FIG_J[j]] = j;
    var act = actionOf(spec), JX = [], JM = [], ft = NaN;
    for (j = 0; j < FIG_J.length; j++) { JX.push([0, 0, 0]); JM.push([1, 0, 0, 0, 1, 0, 0, 0, 1]); }
    function rotAbout(P, sub, ax, a) {
      if (!a) return;
      var m = rotM(vnorm(ax), a);
      for (var q = 0; q < sub.length; q++) {
        var i = sub[q], d = mulMV(m, vsub(JX[i], P)), o = JM[i], n2 = [];
        JX[i] = [P[0] + d[0], P[1] + d[1], P[2] + d[2]];
        for (var r0 = 0; r0 < 3; r0++) for (var c0 = 0; c0 < 3; c0++) n2.push(m[r0 * 3] * o[c0] + m[r0 * 3 + 1] * o[3 + c0] + m[r0 * 3 + 2] * o[6 + c0]);
        JM[i] = n2;
      }
    }
    var RY = spec.yaw ? rotM([0, 1, 0], spec.yaw) : null;   // a turned figure turns its motions with it
    function rot(pivot, root, ax, a) { rotAbout(JX[idx[pivot]].slice(), SUB[idx[root]], RY ? mulMV(RY, ax) : ax, a); }
    function at(t) {
      if (t === ft) return; ft = t;
      for (var i = 0; i < FIG_J.length; i++) { JX[i] = J0[i].slice(); JM[i] = [1, 0, 0, 0, 1, 0, 0, 0, 1]; }
      var feet = [(J0[12][0] + J0[16][0]) / 2, (J0[12][1] + J0[16][1]) / 2, (J0[12][2] + J0[16][2]) / 2];
      rotAbout(feet, SUB[0], RY ? mulMV(RY, [0, 0, 1]) : [0, 0, 1], 0.012 * Math.sin(t * 0.5));              // a weight shift
      var br = 0.004 * Math.sin(t * 1.25), ch = SUB[1];                          // breathing
      for (i = 0; i < ch.length; i++) JX[ch[i]][1] -= br;
      if (act) act(t, rot); else rot('neck', 'head', [0, 1, 0], 0.1 * Math.sin(t * 0.33));
    }
    return { J0: J0, idx: idx, at: at, JX: JX, JM: JM };
  }
  // props, placed from the posed joints: [{ owner, tone, prims: [...] }]; prims are
  //   { k: 'cyl', a, b, ra, rb } · { k: 'ell', c, r: [rx, ry, rz], half? } · { k: 'box', c, h: [hx, hy, hz], m? (rotation) } · { k: 'ring', c, r: [r1, r2], ex, ez }
  // props as data, placed from the posed joints, so they travel as JSON. A point is
  //   [x, y, z] · { j: joint, d?: [dx, dy, dz] } · { j, from: joint, t } (t along the bone from 'from' through j)
  //   · { mid: [jointA, jointB] }, each with optional d (an offset) and x / y / z (an absolute axis)
  // and a prim is { k: 'cyl', a, b, r | ra, rb } · { k: 'ell', c, r: [rx, ry, rz], half? }
  //   · { k: 'box', c, h: [hx, hy, hz], tilt?: [ax, ay, az, angle], along?: { j, from }, len? } · { k: 'ring', c, r: [r1, r2], ex?, ez?, band?, plane?: [x, y, z] | { j, from } }
  var LHAND = { j: 'haL', from: 'elL' }, RHAND = { j: 'haR', from: 'elR' };
  function rH(t, d) { return { j: 'haR', from: 'elR', t: t, d: d }; }
  function lH(t, d) { return { j: 'haL', from: 'elL', t: t, d: d }; }
  function jd(j, d) { return { j: j, d: d }; }
  // a pole between the hands, out past both: the head end (top) and the foot end (bottom)
  function poleTop(t, d) { return { j: 'haL', from: 'haR', t: t, d: d }; }
  function poleFoot(t, d) { return { j: 'haR', from: 'haL', t: t, d: d }; }
  var POLE = { k: 'cyl', a: poleTop(0.42), b: poleFoot(0.62), r: 0.011 };
  var PROPS = {
    hardhat: { owner: 'head', prims: [{ k: 'ell', c: jd('head', [0, -0.03, 0]), r: [0.1, 0.088, 0.11], half: true }, { k: 'ring', c: jd('head', [0, -0.03, 0]), r: [0.1, 0.135], ex: 1, ez: 1.08 }, { k: 'box', c: jd('head', [0, -0.118, 0]), h: [0.012, 0.008, 0.09] }] },
    cap: { owner: 'head', prims: [{ k: 'ell', c: jd('head', [0, -0.045, 0]), r: [0.088, 0.07, 0.098], half: true }, { k: 'box', c: jd('head', [0, -0.05, -0.12]), h: [0.07, 0.006, 0.04] }] },
    tablet: { owner: 'chest', prims: [{ k: 'box', c: { mid: ['haL', 'haR'], d: [0, -0.05, -0.01] }, h: [0.105, 0.072, 0.006], tilt: [1, 0, 0, -0.95] }] },
    wrench: { owner: 'haR', prims: [{ k: 'box', c: rH(0.09), h: [0.011, 0.012, 0.012], along: RHAND, len: 0.1 }, { k: 'ring', c: rH(0.2), r: [0.016, 0.034], plane: RHAND }] },
    pipe: { owner: 'pelvis', prims: [{ k: 'cyl', a: jd('haR', [-0.3, 0.17, -0.05]), b: jd('haR', [0.22, 0.17, -0.05]), r: 0.028 }, { k: 'cyl', a: jd('haR', [0.22, 0.17, -0.05]), b: { j: 'haR', d: [0.22, 0, -0.05], y: 0.86 }, r: 0.028 }] },
    toolbelt: { owner: 'pelvis', prims: [{ k: 'ring', c: jd('pelvis', [0, -0.07, 0]), r: [0.138, 0.152], ex: 1, ez: 0.66, band: 0.035 }, { k: 'box', c: jd('pelvis', [-0.13, -0.03, -0.06]), h: [0.03, 0.04, 0.025] }, { k: 'box', c: jd('pelvis', [0.13, -0.03, -0.06]), h: [0.03, 0.04, 0.025] }] },
    tester: { owner: 'haR', prims: [{ k: 'box', c: rH(0.045), h: [0.018, 0.035, 0.009] }, { k: 'cyl', a: rH(0.08), b: rH(0.13), ra: 0.004, rb: 0.002 }] },
    gauge: { owner: 'haR', prims: [{ k: 'ring', c: rH(0.05), r: [0.012, 0.034], plane: [0, 0, 1] }, { k: 'cyl', a: rH(-0.01), b: rH(0.03), r: 0.008 }] },
    hammer: { owner: 'haR', prims: [{ k: 'cyl', a: rH(-0.03), b: rH(0.2), r: 0.012 }, { k: 'box', c: rH(0.2), h: [0.018, 0.018, 0.062] }] },
    phone: { owner: 'haL', prims: [{ k: 'box', c: jd('haL', [0.03, 0, 0]), h: [0.008, 0.038, 0.018] }] },
    clipboard: { owner: 'haR', prims: [{ k: 'box', c: jd('haR', [-0.04, -0.03, -0.03]), h: [0.065, 0.085, 0.005], tilt: [1, 0, 0, -0.5] }] },
    keys: { owner: 'haL', prims: [{ k: 'ring', c: lH(0.05), r: [0.014, 0.022], plane: [0, 0, 1] }, { k: 'box', c: lH(0.085), h: [0.006, 0.022, 0.002] }, { k: 'box', c: lH(0.08, [-0.018, 0, 0]), h: [0.006, 0.018, 0.002] }] },
    remote: { owner: 'haL', prims: [{ k: 'box', c: lH(0.04), h: [0.016, 0.03, 0.008] }] },
    yardsign: { owner: 'pelvis', prims: [{ k: 'cyl', a: [0.38, -0.42, 0.04], b: [0.38, 0.88, 0.04], r: 0.01 }, { k: 'cyl', a: [0.38, -0.4, 0.04], b: [0.6, -0.4, 0.04], r: 0.007 }, { k: 'box', c: [0.49, -0.29, 0.04], h: [0.1, 0.068, 0.006] }] },
    roller: { owner: 'haR', prims: [POLE, { k: 'cyl', a: poleTop(0.42, [-0.07, 0, 0]), b: poleTop(0.42, [0.07, 0, 0]), r: 0.03 }] },
    rake: { owner: 'haR', prims: [POLE, { k: 'box', c: poleFoot(0.62), h: [0.11, 0.012, 0.02] }, { k: 'box', c: poleFoot(0.62, [0, 0.025, 0]), h: [0.1, 0.02, 0.004] }] },
    skimmer: { owner: 'haR', prims: [POLE, { k: 'ring', c: poleFoot(0.66, [0.05, 0, 0]), r: [0.05, 0.075], ex: 1, ez: 1, plane: [0, 1, 0.3] }] },
    mop: { owner: 'haR', prims: [POLE, { k: 'ell', c: poleFoot(0.64, [0, 0.02, 0]), r: [0.07, 0.03, 0.05] }] },
    bucket: { owner: 'pelvis', prims: [{ k: 'cyl', a: [0.4, 0.72, -0.02], b: [0.4, 0.88, -0.02], ra: 0.07, rb: 0.08 }, { k: 'ring', c: [0.4, 0.72, -0.02], r: [0.06, 0.072] }] },
    sprayer: { owner: 'pelvis', prims: [{ k: 'cyl', a: [-0.3, -0.2, 0.02], b: [-0.3, 0.1, 0.02], r: 0.058 }, { k: 'ell', c: [-0.3, -0.2, 0.02], r: [0.058, 0.03, 0.058], half: true }, { k: 'cyl', a: jd('haR', [0, 0, 0]), b: rH(0.44), r: 0.008 }, { k: 'cyl', a: rH(0.44), b: rH(0.5), ra: 0.008, rb: 0.022 }] },
    box: { owner: 'chest', prims: [{ k: 'box', c: { mid: ['haL', 'haR'], d: [0, -0.06, -0.08] }, h: [0.16, 0.11, 0.11] }] },
    windowpane: { owner: 'chest', prims: [{ k: 'box', c: { mid: ['haL', 'haR'], d: [0, -0.2, -0.04] }, h: [0.2, 0.26, 0.008] }, { k: 'box', c: { mid: ['haL', 'haR'], d: [0, -0.2, -0.05] }, h: [0.006, 0.25, 0.004] }, { k: 'box', c: { mid: ['haL', 'haR'], d: [0, -0.2, -0.05] }, h: [0.19, 0.006, 0.004] }] },
    solarpanel: { owner: 'chest', prims: [{ k: 'box', c: { mid: ['haL', 'haR'], d: [0, -0.03, 0] }, h: [0.34, 0.012, 0.2], tilt: [1, 0, 0, 0.3] }, { k: 'box', c: { mid: ['haL', 'haR'], d: [0, -0.045, 0] }, h: [0.005, 0.004, 0.19], tilt: [1, 0, 0, 0.3] }] },
    dolly: { owner: 'chest', prims: [{ k: 'cyl', a: { mid: ['haL', 'haR'], d: [-0.08, 0, 0] }, b: { mid: ['haL', 'haR'], d: [-0.08, 0, -0.12], y: 0.84 }, r: 0.01 }, { k: 'cyl', a: { mid: ['haL', 'haR'], d: [0.08, 0, 0] }, b: { mid: ['haL', 'haR'], d: [0.08, 0, -0.12], y: 0.84 }, r: 0.01 }, { k: 'box', c: { mid: ['haL', 'haR'], d: [0, 0, -0.2], y: 0.62 }, h: [0.14, 0.2, 0.1] }, { k: 'ring', c: { mid: ['haL', 'haR'], d: [0, 0, -0.14], y: 0.84 }, r: [0.02, 0.045], plane: [1, 0, 0] }] },
    chainsaw: { owner: 'chest', prims: [{ k: 'box', c: { mid: ['haL', 'haR'], d: [0.02, 0.03, -0.05] }, h: [0.08, 0.07, 0.09] }, { k: 'box', c: { mid: ['haL', 'haR'], d: [0.26, 0.06, -0.08] }, h: [0.19, 0.028, 0.012], tilt: [0, 0, 1, 0.25] }] },
    trowel: { owner: 'haR', prims: [{ k: 'box', c: rH(0.04, [0, 0.03, 0]), h: [0.05, 0.004, 0.09] }, { k: 'cyl', a: rH(-0.01), b: rH(0.04, [0, 0.028, 0]), r: 0.006 }] },
    fence: { owner: 'pelvis', prims: [{ k: 'cyl', a: [0.36, -0.1, 0.06], b: [0.36, 0.88, 0.06], r: 0.018 }, { k: 'cyl', a: [0.7, -0.1, 0.06], b: [0.7, 0.88, 0.06], r: 0.018 }, { k: 'box', c: [0.53, 0.12, 0.06], h: [0.18, 0.015, 0.008] }, { k: 'box', c: [0.53, 0.5, 0.06], h: [0.18, 0.015, 0.008] }] },
    fan: { owner: 'pelvis', prims: [{ k: 'ring', c: [0.46, 0.45, 0.02], r: [0.1, 0.12], plane: [0, 0, 1] }, { k: 'box', c: [0.46, 0.45, 0.02], h: [0.1, 0.012, 0.004], tilt: [0, 0, 1, 0.6] }, { k: 'box', c: [0.46, 0.45, 0.02], h: [0.1, 0.012, 0.004], tilt: [0, 0, 1, -0.6] }, { k: 'cyl', a: [0.46, 0.57, 0.02], b: [0.46, 0.88, 0.02], r: 0.012 }] },
    hvacunit: { owner: 'pelvis', prims: [{ k: 'box', c: [0.5, 0.66, 0.04], h: [0.15, 0.22, 0.15] }, { k: 'ring', c: [0.5, 0.43, 0.04], r: [0.04, 0.11] }] },
    garagedoor: { owner: 'pelvis', prims: [{ k: 'box', c: [0.62, 0.42, 0.12], h: [0.24, 0.46, 0.01] }, { k: 'box', c: [0.62, 0.2, 0.11], h: [0.24, 0.004, 0.004] }, { k: 'box', c: [0.62, 0.42, 0.11], h: [0.24, 0.004, 0.004] }, { k: 'box', c: [0.62, 0.64, 0.11], h: [0.24, 0.004, 0.004] }] },
    tray: { owner: 'haL', prims: [{ k: 'ring', c: jd('haL', [0, -0.03, 0]), r: [0, 0.13], plane: [0, 1, -0.75] }, { k: 'ell', c: jd('haL', [0, -0.05, 0]), r: [0.065, 0.06, 0.065], half: true }, { k: 'cyl', a: jd('haL', [0, -0.11, 0]), b: jd('haL', [0, -0.13, 0]), r: 0.008 }] },
    bullfloat: { owner: 'haR', prims: [POLE, { k: 'box', c: poleFoot(0.64, [0, 0.02, 0]), h: [0.17, 0.012, 0.05] }] },
    // the builder's desk: a top and legs in front of him, a keyboard under his hands, a monitor angled toward him, a chair
    desk: { owner: 'pelvis', prims: [{ k: 'box', c: [0, 0.07, -0.36], h: [0.5, 0.016, 0.2] }, { k: 'cyl', a: [-0.46, 0.09, -0.48], b: [-0.46, 0.74, -0.48], r: 0.014 }, { k: 'cyl', a: [0.46, 0.09, -0.48], b: [0.46, 0.74, -0.48], r: 0.014 }] },
    keyboard: { owner: 'pelvis', prims: [{ k: 'box', c: [0, 0.046, -0.33], h: [0.15, 0.006, 0.045] }] },
    monitor: { owner: 'pelvis', prims: [{ k: 'box', c: [0.33, -0.17, -0.42], h: [0.2, 0.13, 0.008], tilt: [0, 1, 0, 0.75] }, { k: 'cyl', a: [0.33, -0.04, -0.42], b: [0.33, 0.055, -0.42], r: 0.012 }, { k: 'box', c: [0.33, 0.058, -0.42], h: [0.06, 0.004, 0.04] }] },
    chair: { owner: 'pelvis', prims: [{ k: 'box', c: [0, 0.27, 0.05], h: [0.17, 0.018, 0.16] }, { k: 'box', c: [0, -0.05, 0.2], h: [0.16, 0.22, 0.016], tilt: [1, 0, 0, -0.12] }, { k: 'cyl', a: [0, 0.29, 0.05], b: [0, 0.68, 0.05], r: 0.016 }, { k: 'ring', c: [0, 0.7, 0.05], r: [0.02, 0.17], ez: 0.9 }] },
    // an agent's sleek visor and earpiece: how you tell an agent from a person
    visor: { owner: 'head', prims: [{ k: 'ring', c: jd('head', [0, -0.005, 0]), r: [0.084, 0.1], ex: 1, ez: 1.08, band: 0.03 }, { k: 'ell', c: jd('head', [0.09, 0.0, 0]), r: [0.012, 0.022, 0.022] }] }
  };
  function figProps(names, J, idx) {
    function joint(n) { var q = idx[n]; if (q == null) throw new Error('aurora-field: unknown joint "' + n + '"'); return J[q]; }
    function at(p) {
      if (Array.isArray(p)) return p.slice();
      var v;
      if (p.mid) { var A = joint(p.mid[0]), B = joint(p.mid[1]); v = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]; }
      else { v = joint(p.j).slice(); if (p.from) v = v3(v, vnorm(vsub(joint(p.j), joint(p.from))), p.t || 0); }
      if (p.d) v = v3(v, p.d, 1);
      if (p.x != null) v[0] = p.x; if (p.y != null) v[1] = p.y; if (p.z != null) v[2] = p.z;
      return v;
    }
    function dir(p) { return Array.isArray(p) ? vnorm(p) : vnorm(vsub(joint(p.j), joint(p.from))); }
    var out = [], i, k;
    for (i = 0; i < (names || []).length; i++) {
      var def = typeof names[i] === 'string' ? PROPS[names[i]] : names[i];
      if (!def) throw new Error('aurora-field: unknown prop "' + names[i] + '"');
      var prims = [];
      for (k = 0; k < def.prims.length; k++) {
        var q = def.prims[k], o = { k: q.k };
        if (q.k === 'cyl') { o.a = at(q.a); o.b = at(q.b); o.ra = q.ra != null ? q.ra : q.r; o.rb = q.rb != null ? q.rb : q.r; }
        else if (q.k === 'ell') { o.c = at(q.c); o.r = q.r.slice(); o.half = !!q.half; }
        else if (q.k === 'box') { o.c = at(q.c); o.h = q.h.slice(); if (q.tilt) o.m = rotM(vnorm(q.tilt.slice(0, 3)), q.tilt[3]); if (q.along) { o.along = dir(q.along); o.len = q.len || 0.1; } }
        else if (q.k === 'ring') { o.c = at(q.c); o.r = q.r.slice(); o.ex = q.ex || 1; o.ez = q.ez || 1; if (q.band) o.band = q.band; if (q.plane) o.plane = dir(q.plane); }
        else throw new Error('aurora-field: unknown prim "' + q.k + '"');
        prims.push(o);
      }
      out.push({ name: typeof names[i] === 'string' ? names[i] : (def.name || 'prop' + i), owner: def.owner, prims: prims });
    }
    return out;
  }
  // the body as lit surfaces: [{ k, owner, …, area }], shared by the lit build and (as bones) the line build
  var FIG_TORSO = [[0.05, 0.128, 0.08], [-0.06, 0.142, 0.088], [-0.22, 0.114, 0.075], [-0.4, 0.148, 0.088], [-0.5, 0.166, 0.084], [-0.56, 0.156, 0.078], [-0.6, 0.122, 0.07], [-0.635, 0.066, 0.056]];
  // the torso's profile moved to where the pelvis is (a seated figure sits 0.28 lower)
  function torsoAt(J, idx) { var dy = J[idx.pelvis][1] + 0.06; return { dy: dy, z: J[idx.pelvis][2], prof: FIG_TORSO.map(function (r) { return [r[0] + dy, r[1], r[2]]; }) }; }
  function figBody(J, idx, yaw) {
    var B = [], g = function (n) { return J[idx[n]]; }, tor = torsoAt(J, idx);
    function limb(a, b, ra, rb) { B.push({ k: 'cyl', a: g(a), b: g(b), ra: ra, rb: rb, owner: b }); }
    B.push({ k: 'loft', prof: tor.prof, x: g('pelvis')[0], z: tor.z, yaw: yaw || 0, owners: ['pelvis', 'chest'], split: -0.25 + tor.dy });
    B.push({ k: 'cyl', a: v3(g('neck'), [0, 0.03, 0], 1), b: v3(g('head'), [0, 0.06, 0], 1), ra: 0.036, rb: 0.034, owner: 'neck' });
    B.push({ k: 'ell', c: g('head'), r: [0.082, 0.108, 0.094], owner: 'head', chin: true });
    limb('shL', 'elL', 0.043, 0.036); limb('elL', 'haL', 0.034, 0.025); limb('shR', 'elR', 0.043, 0.036); limb('elR', 'haR', 0.034, 0.025);
    limb('hipL', 'knL', 0.066, 0.047); limb('knL', 'anL', 0.045, 0.031); limb('hipR', 'knR', 0.066, 0.047); limb('knR', 'anR', 0.045, 0.031);
    B.push({ k: 'ell', c: g('shL'), r: [0.05, 0.05, 0.05], owner: 'shL' }, { k: 'ell', c: g('shR'), r: [0.05, 0.05, 0.05], owner: 'shR' });
    B.push({ k: 'ell', c: g('elL'), r: [0.037, 0.037, 0.037], owner: 'elL' }, { k: 'ell', c: g('elR'), r: [0.037, 0.037, 0.037], owner: 'elR' });
    B.push({ k: 'ell', c: g('knL'), r: [0.049, 0.049, 0.049], owner: 'knL' }, { k: 'ell', c: g('knR'), r: [0.049, 0.049, 0.049], owner: 'knR' });
    B.push({ k: 'ell', c: v3(g('haL'), vnorm(vsub(g('haL'), g('elL'))), 0.035), r: [0.024, 0.04, 0.02], owner: 'haL' });
    B.push({ k: 'ell', c: v3(g('haR'), vnorm(vsub(g('haR'), g('elR'))), 0.035), r: [0.024, 0.04, 0.02], owner: 'haR' });
    function foot(an, to) { var a = g(an), b = g(to); B.push({ k: 'ell', c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.03, (a[2] + b[2]) / 2], r: [0.04, 0.03, 0.085], owner: to }); }
    foot('anL', 'toL'); foot('anR', 'toR');
    return B;
  }
  function loftAt(prof, y) {   // torso half-width and half-depth at height y
    if (y >= prof[0][0]) return [prof[0][1], prof[0][2]];
    for (var i = 0; i < prof.length - 1; i++) if (y >= prof[i + 1][0]) { var f = (y - prof[i][0]) / (prof[i + 1][0] - prof[i][0]); return [prof[i][1] + (prof[i + 1][1] - prof[i][1]) * f, prof[i][2] + (prof[i + 1][2] - prof[i][2]) * f]; }
    var l = prof[prof.length - 1]; return [l[1], l[2]];
  }
  function ellPerim(a, b) { return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))); }
  function primArea(p) {
    var r = p.r, l;
    if (p.k === 'cyl') return Math.PI * (p.ra + p.rb) * vlen(vsub(p.b, p.a));
    if (p.k === 'ell') { var m = (r[0] * r[1] + r[1] * r[2] + r[0] * r[2]) / 3; return 4 * Math.PI * m * (p.half ? 0.5 : 1); }
    if (p.k === 'box') return 8 * (p.h[0] * p.h[1] + p.h[1] * p.h[2] + p.h[0] * p.h[2]);
    if (p.k === 'ring') return p.band ? ellPerim(r[1] * p.ex, r[1] * p.ez) * p.band : Math.PI * (r[1] * r[1] - r[0] * r[0]);
    if (p.k === 'loft') { l = 0; for (var y = p.prof[0][0]; y > p.prof[p.prof.length - 1][0]; y -= 0.01) { var wd = loftAt(p.prof, y); l += ellPerim(wd[0], wd[1]) * 0.01; } return l; }
    return 0;
  }
  // one point on a primitive's surface, with its unit normal: [p, n]
  // k: the point's index within its primitive, for an even (R2 low-discrepancy) spread; null for random
  function primPoint(p, r, k) {
    var u, th, d, e, rad;
    if (k == null) { u = r(); th = r() * TAU; } else { u = (0.5 + 0.7548776662 * k) % 1; th = ((0.5 + 0.569840291 * k) % 1) * TAU; }
    var c = Math.cos(th), s = Math.sin(th);
    if (p.k === 'cyl') {
      d = vsub(p.b, p.a); var L = vlen(d); d = vnorm(d); e = basis(d); rad = p.ra + (p.rb - p.ra) * u;
      var nn = [e[0][0] * c + e[1][0] * s, e[0][1] * c + e[1][1] * s, e[0][2] * c + e[1][2] * s];
      return [v3(v3(p.a, d, L * u), nn, rad), nn];
    }
    if (p.k === 'ell') {
      var uy = 1 - 2 * u, rr = Math.sqrt(Math.max(0, 1 - uy * uy)); if (p.half && uy > 0) uy = -uy;
      var ux = rr * c, uz = rr * s, R3 = p.r, sx = 1;
      if (p.chin && uy > 0.25) sx = 1 - 0.28 * (uy - 0.25) / 0.75;              // the jaw narrows to the chin
      return [[p.c[0] + R3[0] * ux * sx, p.c[1] + R3[1] * uy, p.c[2] + R3[2] * uz * sx], vnorm([ux / R3[0], uy / R3[1], uz / R3[2]])];
    }
    if (p.k === 'box') {
      var h = p.h, a1 = h[1] * h[2], a2 = h[0] * h[2], a3 = h[0] * h[1], pick = r() * (a1 + a2 + a3), sg = r() < 0.5 ? -1 : 1, q, n3;
      var a = (r() * 2 - 1), b = (r() * 2 - 1);
      if (pick < a1) { q = [sg * h[0], a * h[1], b * h[2]]; n3 = [sg, 0, 0]; } else if (pick < a1 + a2) { q = [a * h[0], sg * h[1], b * h[2]]; n3 = [0, sg, 0]; } else { q = [a * h[0], b * h[1], sg * h[2]]; n3 = [0, 0, sg]; }
      if (p.along) { var bs = basis(p.along), L2 = (p.len || 0.1) / 2; q = v3(v3(v3([0, 0, 0], bs[0], q[0]), p.along, q[1] / h[1] * L2), bs[1], q[2]); n3 = vnorm(v3(v3(v3([0, 0, 0], bs[0], n3[0]), p.along, n3[1]), bs[1], n3[2])); }
      else if (p.m) { q = mulMV(p.m, q); n3 = mulMV(p.m, n3); }
      return [v3(p.c, q, 1), n3];
    }
    if (p.k === 'ring') {
      var R1 = p.r[0], R2 = p.r[1];
      if (p.band) { var yb = (u - 0.5) * p.band; return [[p.c[0] + R2 * p.ex * c, p.c[1] + yb, p.c[2] + R2 * p.ez * s], vnorm([c / p.ex, 0, s / p.ez])]; }
      rad = Math.sqrt(R1 * R1 + (R2 * R2 - R1 * R1) * u);
      if (p.plane) { e = basis(vnorm(p.plane)); return [v3(v3(p.c, e[0], rad * c), e[1], rad * s), vnorm(p.plane)]; }
      return [[p.c[0] + rad * c * p.ex, p.c[1], p.c[2] + rad * s * p.ez], [0, -1, 0]];
    }
    // loft: a height by its girth (an inverse CDF over the profile), then a point round that ring
    if (!p.cdf) {
      var top = p.prof[p.prof.length - 1][0], bot = p.prof[0][0], acc = 0; p.cdf = [[0, bot]];
      for (var q = 1; q <= 96; q++) { var yq = bot + (top - bot) * q / 96, w0 = loftAt(p.prof, yq); acc += ellPerim(w0[0], w0[1]); p.cdf.push([acc, yq]); }
      for (q = 0; q < p.cdf.length; q++) p.cdf[q][0] /= acc;
    }
    var lo = 0; while (lo < p.cdf.length - 2 && p.cdf[lo + 1][0] < u) lo++;
    var A0 = p.cdf[lo], A1 = p.cdf[lo + 1], y = A0[1] + (A1[1] - A0[1]) * ((u - A0[0]) / ((A1[0] - A0[0]) || 1)), wd2 = loftAt(p.prof, y);
    var lx = wd2[0] * c, lz = wd2[1] * s, nx = c / wd2[0], nz = s / wd2[1];
    if (p.yaw) { var cy = Math.cos(p.yaw), sy = Math.sin(p.yaw), rx = cy * lx + sy * lz, rz = -sy * lx + cy * lz, qx = cy * nx + sy * nz, qz = -sy * nx + cy * nz; lx = rx; lz = rz; nx = qx; nz = qz; }
    return [[p.x + lx, y, p.z + lz], vnorm([nx, 0, nz])];
  }
  // a surfel no wider than the thing it paints: thin legs, rails and plates stay crisp, not blobs
  function thinCap(p) {
    if (p.k === 'cyl') return 2.2 * Math.max(p.ra, p.rb) + 0.006;
    if (p.k === 'box') return 2 * Math.min(p.h[0], p.h[1], p.h[2]) + 0.012;
    if (p.k === 'ring') return (p.band || (p.r[1] - p.r[0])) * 1.5 + 0.006;
    if (p.k === 'ell') return Math.min(p.r[0], p.r[1], p.r[2]) * 1.4;
    return 1;
  }
  function primOwner(p, pt) { return p.owners ? (pt[1] > p.split ? p.owners[0] : p.owners[1]) : p.owner; }

  // ---- the outline: how a figure reads as a drawing ----
  // Splat every surface (body and props) into a front-view grid that keeps the nearest depth,
  // its joint and its part. Keep a cell edge where the figure meets empty space (the silhouette)
  // or where one part passes in front of another (an arm across the chest). Chain the edges into
  // strokes, smooth them (Chaikin) and hand them back in drawing order: the silhouette from the
  // crown round, then the inner lines top to bottom. Deterministic, so the line and lit builds of
  // one figure share it exactly.
  var OUT_CELL = 0.0105, OUT_X0 = -1.05, OUT_Y0 = -1.1, OUT_W = Math.ceil(2.1 / OUT_CELL), OUT_H = Math.ceil(2.2 / OUT_CELL);
  function figGroup(owner) {
    if (owner === 'head' || owner === 'neck') return 1;
    if (owner === 'chest' || owner === 'pelvis') return 0;
    if (/^(sh|el|ha)L$/.test(owner)) return 2;
    if (/^(sh|el|ha)R$/.test(owner)) return 3;
    return /L$/.test(owner) ? 4 : 5;
  }
  function figOutline(body, props, idx) {
    var W = OUT_W, H = OUT_H, NC = W * H, Z = new F32(NC), O = new I32(NC), G = new I32(NC), i, k, q, r = rng(0x5eed);
    for (i = 0; i < NC; i++) { Z[i] = 9; O[i] = -1; G[i] = -1; }
    var parts = [];
    for (i = 0; i < body.length; i++) parts.push({ p: body[i], g: -2 });
    for (i = 0; i < props.length; i++) for (k = 0; k < props[i].prims.length; k++) parts.push({ p: props[i].prims[k], g: 6 + i, owner: props[i].owner });
    for (i = 0; i < parts.length; i++) {
      var P = parts[i].p, cnt = Math.ceil(primArea(P) / (OUT_CELL * OUT_CELL) * 1.8) + 24;
      for (k = 0; k < cnt; k++) {
        var sp = primPoint(P, r, k), pt = sp[0], ix = Math.floor((pt[0] - OUT_X0) / OUT_CELL), iy = Math.floor((pt[1] - OUT_Y0) / OUT_CELL);
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
        var c = iy * W + ix;
        if (pt[2] < Z[c]) {
          var own = parts[i].owner || primOwner(P, pt);
          Z[c] = pt[2]; O[c] = idx[own]; G[c] = parts[i].g >= 0 ? parts[i].g : figGroup(own);
        }
      }
    }
    // close pinholes the sampling missed: an empty cell with three or more filled neighbours takes the nearest one
    for (var pass = 0; pass < 2; pass++) for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
      var c2 = y * W + x; if (O[c2] >= 0) continue;
      var nb = [c2 - 1, c2 + 1, c2 - W, c2 + W], f = 0, best = -1;
      for (q = 0; q < 4; q++) if (O[nb[q]] >= 0) { f++; if (best < 0 || Z[nb[q]] < Z[best]) best = nb[q]; }
      if (f >= 3) { Z[c2] = Z[best]; O[c2] = O[best]; G[c2] = G[best]; }
    }
    // edges on the cell lattice: [x0, y0, x1, y1, cell] with lattice vertices at cell corners
    var E = [], EPS = 0.045;
    // which inner lines read as drawing: an arm or a prop in front of the body; not leg against leg or hip against torso
    function inner(front, back) { return front === 2 || front === 3 || front >= 6 || (back >= 6 && front <= 3); }
    function edge(c3, side, kind) {   // kind 0: silhouette, 1: one part in front of another
      var x3 = c3 % W, y3 = (c3 - x3) / W;
      if (side === 0) E.push([x3, y3, x3, y3 + 1, c3, kind]); else if (side === 1) E.push([x3 + 1, y3, x3 + 1, y3 + 1, c3, kind]);
      else if (side === 2) E.push([x3, y3, x3 + 1, y3, c3, kind]); else E.push([x3, y3 + 1, x3 + 1, y3 + 1, c3, kind]);
    }
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      var c4 = y * W + x; if (O[c4] < 0) continue;
      var N4 = [c4 - 1, c4 + 1, c4 - W, c4 + W];
      for (q = 0; q < 4; q++) { var m = N4[q]; if (O[m] < 0) edge(c4, q, 0); else if (G[m] !== G[c4] && Z[c4] < Z[m] - EPS && inner(G[c4], G[m])) edge(c4, q, 1); }
    }
    // chain the edges: walk vertex to vertex, preferring to keep straight, then to turn the same way
    var at = {}, used = new Uint8Array(E.length);
    function key(a, b) { return a * 4096 + b; }
    for (i = 0; i < E.length; i++) { var k0 = key(E[i][0], E[i][1]), k1 = key(E[i][2], E[i][3]); (at[k0] || (at[k0] = [])).push(i); (at[k1] || (at[k1] = [])).push(i); }
    // from vertex (vx, vy) heading (dx, dy), follow unused edges: keep straight, then turn the same way
    function walk(vx, vy, dx, dy, kind) {   // silhouettes and inner lines chain separately, so a loop never wanders inside
      var out = [];
      for (;;) {
        var cand = at[key(vx, vy)] || [], nxt = -1, score = -9;
        for (var j = 0; j < cand.length; j++) {
          var ce = cand[j]; if (used[ce] || E[ce][5] !== kind) continue;
          var E2 = E[ce], fw = E2[0] === vx && E2[1] === vy, nx2 = (fw ? E2[2] : E2[0]) - vx, ny2 = (fw ? E2[3] : E2[1]) - vy;
          var sc = nx2 * dx + ny2 * dy + (dx * ny2 - dy * nx2) * 0.5;
          if (sc > score) { score = sc; nxt = ce; }
        }
        if (nxt < 0) return out;
        used[nxt] = 1;
        var e = E[nxt], f2 = e[0] === vx && e[1] === vy, ox = f2 ? e[2] : e[0], oy = f2 ? e[3] : e[1];
        dx = ox - vx; dy = oy - vy; vx = ox; vy = oy; out.push([vx, vy, e[4]]);
      }
    }
    var chains = [];
    for (i = 0; i < E.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      var e0 = E[i], fwd = walk(e0[2], e0[3], e0[2] - e0[0], e0[3] - e0[1], e0[5]), bwd = walk(e0[0], e0[1], e0[0] - e0[2], e0[1] - e0[3], e0[5]);
      var raw = bwd.reverse().concat([[e0[0], e0[1], e0[4]], [e0[2], e0[3], e0[4]]]).concat(fwd);
      if (raw.length < 6) continue;
      var first = raw[0], last = raw[raw.length - 1], closed = first[0] === last[0] && first[1] === last[1];
      var pts = [];
      for (q = 0; q < raw.length; q++) { var cc = raw[q][2]; pts.push([OUT_X0 + raw[q][0] * OUT_CELL, OUT_Y0 + raw[q][1] * OUT_CELL, Z[cc], O[cc], G[cc]]); }
      if (closed) pts.pop();
      // depth along an edge jumps cell to cell (an arm's front, then the torso's side): smooth it, or the line zigzags as it turns
      for (var sw = 0; sw < 3; sw++) {
        var zs = pts.map(function (p8) { return p8[2]; }), nn = pts.length, rad = 6;
        for (q = 0; q < nn; q++) { var acc8 = 0, cnt8 = 0; for (var o8 = -rad; o8 <= rad; o8++) { var j8 = q + o8; if (closed) j8 = (j8 + nn) % nn; else if (j8 < 0 || j8 >= nn) continue; acc8 += zs[j8]; cnt8++; } pts[q][2] = acc8 / cnt8; }
      }
      chains.push({ P: chaikin(chaikin(chaikin(pts, closed), closed), closed), closed: closed });
    }
    // measure, drop crumbs, put the silhouette (the chain through the crown) first, starting at the crown
    var top = -1, ty = 9;
    for (i = 0; i < chains.length; i++) {
      var C = chains[i], L = 0; for (q = 1; q < C.P.length; q++) L += hyp(C.P[q][0] - C.P[q - 1][0], C.P[q][1] - C.P[q - 1][1]);
      if (C.closed) L += hyp(C.P[0][0] - C.P[C.P.length - 1][0], C.P[0][1] - C.P[C.P.length - 1][1]);
      C.L = L; for (q = 0; q < C.P.length; q++) if (C.P[q][1] < ty) { ty = C.P[q][1]; top = i; }
    }
    chains = chains.filter(function (c5, j5) { return j5 === top || c5.L > 0.08; });
    var main = null; for (i = 0; i < chains.length; i++) { var hasTop = false; for (q = 0; q < chains[i].P.length; q++) if (chains[i].P[q][1] === ty) hasTop = true; if (hasTop) main = chains[i]; }
    if (main && main.closed) {
      var ti = 0; for (q = 0; q < main.P.length; q++) if (main.P[q][1] === ty) ti = q;
      main.P = main.P.slice(ti).concat(main.P.slice(0, ti));
      var area = 0; for (q = 0; q < main.P.length; q++) { var a5 = main.P[q], b5 = main.P[(q + 1) % main.P.length]; area += a5[0] * b5[1] - b5[0] * a5[1]; }
      if (area < 0) main.P = [main.P[0]].concat(main.P.slice(1).reverse());   // clockwise on screen
    }
    var rest = chains.filter(function (c6) { return c6 !== main; }).map(function (c7) {
      if (!c7.closed && c7.P[0][1] > c7.P[c7.P.length - 1][1]) c7.P.reverse();
      c7.top = Math.min.apply(null, c7.P.map(function (p7) { return p7[1]; })); return c7;
    }).sort(function (a8, b8) { return a8.top - b8.top; });
    return main ? [main].concat(rest) : rest;
  }
  // Chaikin corner cutting on [x, y, z, owner, group] points: z interpolates, owner and group follow the nearer end
  function chaikin(P, closed) {
    var out = [], n = P.length, i;
    if (n < 3) return P;
    if (!closed) out.push(P[0]);
    for (i = 0; i < (closed ? n : n - 1); i++) {
      var a = P[i], b = P[(i + 1) % n];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, a[2] * 0.75 + b[2] * 0.25, a[3], a[4]]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, a[2] * 0.25 + b[2] * 0.75, b[3], b[4]]);
    }
    if (!closed) out.push(P[n - 1]);
    return out;
  }
  // count evenly spaced samples along a chain: [x, y, z, owner, group, nx, ny, turn] with the outward
  // normal (for a clockwise loop) and how sharply it turns there; s0 offsets the first sample (0…1 of a step)
  function along(C, count, s0) {
    var P = C.P, n = P.length, seg = [], tot = 0, i, out = [];
    for (i = 0; i < (C.closed ? n : n - 1); i++) { var a = P[i], b = P[(i + 1) % n], l = hyp(b[0] - a[0], b[1] - a[1]); seg.push(l); tot += l; }
    if (!count || !tot) return out;
    var step = tot / (C.closed ? count : Math.max(1, count - 1)), j = 0, acc = 0;
    for (i = 0; i < count; i++) {
      var d = Math.min(tot, (i + (s0 || 0)) * step);
      while (j < seg.length - 1 && acc + seg[j] < d) { acc += seg[j]; j++; }
      var A = P[j], B = P[(j + 1) % n], f = seg[j] ? (d - acc) / seg[j] : 0, tx = B[0] - A[0], ty = B[1] - A[1], tl = hyp(tx, ty) || 1;
      var Pp = P[(j - 1 + n) % n], t0x = A[0] - Pp[0], t0y = A[1] - Pp[1], t0l = hyp(t0x, t0y) || 1;
      var turn = Math.abs(Math.atan2(t0x / t0l * ty / tl - t0y / t0l * tx / tl, t0x / t0l * tx / tl + t0y / t0l * ty / tl));
      out.push([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f, f < 0.5 ? A[3] : B[3], f < 0.5 ? A[4] : B[4], ty / tl, -tx / tl, turn]);
    }
    return out;
  }

  function figure(spec) {
    if (typeof spec === 'string') { if (!TRADES[spec]) throw new Error('aurora-field: unknown trade "' + spec + '"'); spec = TRADES[spec]; }
    spec = spec || {};
    var rig = figRig(spec), J = rig.J0, idx = rig.idx, props = figProps(spec.props, J, idx);
    // yaw: turn the whole figure (joints and props) about the vertical, e.g. three-quarters to a desk
    if (spec.yaw) {
      var RY = rotM([0, 1, 0], spec.yaw), tv = function (v) { return mulMV(RY, v); };
      for (var jj = 0; jj < J.length; jj++) { var tj = tv(J[jj]); J[jj][0] = tj[0]; J[jj][1] = tj[1]; J[jj][2] = tj[2]; }
      props.forEach(function (pr) { pr.prims.forEach(function (q) {
        if (q.a) q.a = tv(q.a); if (q.b) q.b = tv(q.b); if (q.c) q.c = tv(q.c);
        if (q.along) q.along = tv(q.along); if (q.plane) q.plane = tv(q.plane);
        if (q.k === 'box' && !q.along) q.m = q.m ? mul3(RY, q.m) : RY;
        if (q.k === 'ring' && !q.plane) q.plane = tv([0, 1, 0]);
      }); });
    }
    var body = figBody(J, idx, spec.yaw || 0);
    // the outline, built once and shared: the line's silhouette and the lit body's rim are the same points
    var outline = null, RIM = 0.24;
    function getOutline() { return outline || (outline = figOutline(body, props, idx)); }
    var anchors = { head: v3(J[idx.head], [0, -0.17, 0], 1), chest: v3(J[idx.chest], [0, 0.04, -0.1], 1), hand: J[idx.haR].slice(), feet: [0, 0.9, 0] };
    if (props.length) { var pp0 = null; for (var q0 = 0; q0 < props.length; q0++) if (['hardhat', 'cap', 'visor'].indexOf(props[q0].name) < 0) { pp0 = props[q0]; break; } var c0 = (pp0 || props[0]).prims[0]; anchors.prop = (c0.c || v3(c0.a, vsub(c0.b, c0.a), 0.5)).slice(); }
    // flow: every point rides its joint (position and rotation), offsets kept from the rest pose
    function rider(n, OWN0, LOC) {
      var OUT = [0, 0, 0];
      return function (i, t) {
        rig.at(t);
        var o = OWN0[i], m = rig.JM[o], x = rig.JX[o], l = i * 3, a = LOC[l], b = LOC[l + 1], c = LOC[l + 2];
        OUT[0] = x[0] + m[0] * a + m[1] * b + m[2] * c; OUT[1] = x[1] + m[3] * a + m[4] * b + m[5] * c; OUT[2] = x[2] + m[6] * a + m[7] * b + m[8] * c;
        return OUT;
      };
    }
    function finish(n, pts, own, extra) {
      var OWN0 = new I32(n), LOC = new F32(n * 3);
      for (var i = 0; i < n; i++) { var o = idx[own[i]], jp = J[o]; OWN0[i] = o; LOC[i * 3] = pts[i][0] - jp[0]; LOC[i * 3 + 1] = pts[i][1] - jp[1]; LOC[i * 3 + 2] = pts[i][2] - jp[2]; }
      extra.points = pts; extra.flow = rider(n, OWN0, LOC); extra.anchors = anchors; extra.facing = true;
      return extra;
    }

    // line: the figure as a drawing. The silhouette from the crown round, then the inner lines (an arm
    // across the chest, a hand on a hip), with a calligraphic weight: a hairline that is shared with
    // the lit body's rim, and a body of ink that thickens on the side away from the light. The pen
    // slows into corners and lifts briefly between strokes.
    function line(n, r) {
      var C = getOutline(), i, k, pts = [], own = [], tone = [], order = [], pairs = [], bright = [0];
      // a timeline over all strokes: arc length plus a pause for every corner, a short lift between strokes
      var T0 = [], TL = [], tsum = 0;
      for (i = 0; i < C.length; i++) {
        var fine = along(C[i], Math.max(16, Math.round(C[i].L / 0.004))), cum = [0];
        for (k = 1; k < fine.length; k++) cum.push(cum[k - 1] + C[i].L / fine.length * (1 + 5 * fine[k][7]));
        T0.push(tsum); TL.push(cum); tsum += cum[cum.length - 1] + 0.025;
      }
      function tAt(ci, frac) { var cum = TL[ci], x = frac * (cum.length - 1), j = Math.min(cum.length - 2, Math.floor(x)); return (T0[ci] + cum[j] + (cum[j + 1] - cum[j]) * (x - j)) / tsum; }
      function put(S, ci, kk, cnt, ink) {
        var x = S[0], y = S[1], frac = C[ci].closed ? kk / cnt : kk / Math.max(1, cnt - 1);
        if (ink) {
          var shade = Math.max(0, S[5] * 0.55 + S[6] * 0.83), w = 0.0015 * (1 + 1.6 * shade);
          if (!C[ci].closed) w *= Math.min(1, frac * 10, (1 - frac) * 10);
          var off = (r() * 2 - 1) * w; x += S[5] * off; y += S[6] * off;
        }
        pts.push([x, y, S[2]]); own.push(FIG_J[S[3]] || 'chest'); tone.push(S[4] >= 6 ? 1 : 0); order.push(Math.min(1, tAt(ci, frac)));
      }
      var rimN = C.length ? Math.round(n * RIM) : 0, rim = rimN ? along(C[0], rimN, 0) : [];
      for (k = 0; k < rim.length; k++) { if (k) pairs.push([k - 1, k]); put(rim[k], 0, k, rim.length, false); }
      if (rim.length > 2 && C[0].closed) pairs.push([0, rim.length - 1]);   // the loop closes back to the crown
      var Ltot = 0; for (i = 0; i < C.length; i++) Ltot += C[i].L;
      for (i = 0; i < C.length; i++) {
        var cnt = i === C.length - 1 ? n - pts.length : Math.round((n - rimN) * C[i].L / Ltot);
        if (cnt <= 0) continue;
        var S2 = along(C[i], cnt, i === 0 ? 0.5 : 0), base = pts.length;
        for (k = 0; k < S2.length && pts.length < n; k++) { if (k && i > 0) pairs.push([base + k - 1, base + k]); put(S2[k], i, k, S2.length, i > 0); }   // the silhouette's ink is points around the hairline; inner lines stay single strokes
        if (i) bright.push(base);
      }
      while (pts.length < n) { pts.push(pts[pts.length - 1].slice()); own.push(own[own.length - 1]); tone.push(tone[tone.length - 1]); order.push(1); }
      return finish(n, pts, own, { pairs: pairs, bright: bright.slice(0, 8), tone: tone, lineArt: true, kick: 0.12, trace: { order: order, ms: spec.trace || 2400 }, still: true });
    }

    // lit: a skin over the body, seams round the joints and down the front, props in the accent
    function lit(n, r) {
      var i, k, skin = [], seams = [], sArea = 0, pArea = 0;
      for (i = 0; i < body.length; i++) { body[i].area = primArea(body[i]); sArea += body[i].area; }
      var pr = []; for (i = 0; i < props.length; i++) for (k = 0; k < props[i].prims.length; k++) { var pq = props[i].prims[k]; pq.owner = props[i].owner; pq.area = primArea(pq); pArea += pq.area; pr.push(pq); }
      var g = function (nm) { return J[idx[nm]]; };
      function ringOn(c, e1, e2, ra, rb, owner, from, to) { var P = []; from = from || 0; to = to == null ? TAU : to; for (var q = 0; q <= 40; q++) { var a = from + (to - from) * q / 40; P.push(v3(v3(c, e1, Math.cos(a) * ra), e2, Math.sin(a) * rb)); } seams.push({ P: P, owner: owner, cen: c }); }
      function limbRing(a, b, u, rad, owner) { var d = vnorm(vsub(g(b), g(a))), e = basis(d), L = vlen(vsub(g(b), g(a))); ringOn(v3(g(a), d, L * u), e[0], e[1], rad, rad, owner); }
      var tor = torsoAt(J, idx), ty = tor.dy, tz = tor.z, wa = loftAt(tor.prof, -0.1 + ty), nk = loftAt(tor.prof, -0.6 + ty);
      ringOn([0, -0.1 + ty, tz], [1, 0, 0], [0, 0, 1], wa[0] * 1.03, wa[1] * 1.03, 'pelvis');                     // the waist
      ringOn([0, -0.6 + ty, tz], [1, 0, 0], [0, 0, 1], nk[0] * 1.04, nk[1] * 1.04, 'chest');                      // the collar
      seams.push({ P: [[0, -0.6 + ty, tz - nk[1] * 1.03], [0, -0.4 + ty, tz - 0.09], [0, -0.22 + ty, tz - 0.078], [0, -0.1 + ty, tz - wa[1] * 1.03]], owner: 'chest', n: [0, 0, -1] });   // down the front
      var hd = g('head');
      ringOn(v3(hd, [0, -0.005, 0], 1), [1, 0, 0], [0, 0, -1], 0.084, 0.096, 'head', -1.1, 1.1);           // a visor line across the face
      limbRing('elL', 'haL', 0.86, 0.028, 'haL'); limbRing('elR', 'haR', 0.86, 0.028, 'haR');
      limbRing('knL', 'anL', 0.9, 0.034, 'anL'); limbRing('knR', 'anR', 0.9, 0.034, 'anR');
      limbRing('hipL', 'knL', 0.96, 0.05, 'knL'); limbRing('hipR', 'knR', 0.96, 0.05, 'knR');
      limbRing('shL', 'elL', 0.08, 0.046, 'elL'); limbRing('shR', 'elR', 0.08, 0.046, 'elR');
      var seamL = 0; for (i = 0; i < seams.length; i++) { var Ls = 0; for (k = 0; k < seams[i].P.length - 1; k++) Ls += vlen(vsub(seams[i].P[k + 1], seams[i].P[k])); seams[i].L = Ls; seamL += Ls; }
      var C = getOutline(), rimN = C.length ? Math.round(n * RIM) : 0, m = n - rimN;
      var coreN = Math.min(10, Math.floor(m * 0.003)), seamN = Math.floor(m * 0.1), propN = pr.length ? Math.floor(m * 0.15) : 0, skinN = m - coreN - seamN - propN;
      var pts = [], nrm = [], al = [], sf = [], tone = [], own = [], pairs = [], bright = [];
      // the rim: exactly the line's hairline, so the drawing's edge stays put while the body fills in
      var rim = rimN ? along(C[0], rimN, 0) : [];
      for (k = 0; k < rim.length; k++) { var R0 = rim[k]; if (k) pairs.push([k - 1, k]); pts.push([R0[0], R0[1], R0[2]]); nrm.push([R0[5], R0[6], 0]); al.push(1); sf.push(0); tone.push(R0[4] >= 6 ? 1 : 0); own.push(FIG_J[R0[3]] || 'chest'); }
      if (rim.length > 2 && C[0].closed) pairs.push([0, rim.length - 1]);   // the loop closes back to the crown
      // ambient occlusion, baked: probe a little way out along the normal; inside the body means a crease
      // is q inside the body? (skip: one primitive to ignore; sh: shrink every other one by this much)
      function inside(q, skip, sh) {
        sh = sh || 0;
        for (var b2 = 0; b2 < body.length; b2++) {
          if (b2 === skip) continue;
          var P2 = body[b2];
          if (P2.k === 'cyl') { var d2 = vsub(P2.b, P2.a), L2 = vlen(d2), u2 = Math.max(0, Math.min(1, ((q[0] - P2.a[0]) * d2[0] + (q[1] - P2.a[1]) * d2[1] + (q[2] - P2.a[2]) * d2[2]) / (L2 * L2))); if (vlen(vsub(q, v3(P2.a, d2, u2))) < P2.ra + (P2.rb - P2.ra) * u2 - sh) return true; }
          else if (P2.k === 'ell') { var ex = (q[0] - P2.c[0]) / (P2.r[0] - sh), ey = (q[1] - P2.c[1]) / (P2.r[1] - sh), ez = (q[2] - P2.c[2]) / (P2.r[2] - sh); if (ex * ex + ey * ey + ez * ez < 1) return true; }
          else if (P2.k === 'loft' && q[1] < P2.prof[0][0] && q[1] > P2.prof[P2.prof.length - 1][0]) {
            var wd = loftAt(P2.prof, q[1]), dx0 = q[0] - P2.x, dz0 = q[2] - P2.z, cyw = Math.cos(P2.yaw || 0), syw = Math.sin(P2.yaw || 0);
            var lx = (cyw * dx0 - syw * dz0) / (wd[0] - sh), lz = (syw * dx0 + cyw * dz0) / (wd[1] - sh); if (lx * lx + lz * lz < 1) return true;
          }
        }
        return false;
      }
      var AOK = [[0.05, 0, 0], [0.04, 0.03, 0], [0.04, -0.03, 0], [0.04, 0, 0.03], [0.04, 0, -0.03], [0.08, 0, 0]];   // along the normal, then fanned out
      function ao(p3, n3) {
        var e = basis(n3), occ = 0;
        for (var pr2 = 0; pr2 < AOK.length; pr2++) { var k3 = AOK[pr2]; if (inside(v3(v3(v3(p3, n3, k3[0]), e[0], k3[1]), e[1], k3[2]))) occ++; }
        return occ / AOK.length;
      }
      // the body's skin: only the surface you could see. A point buried inside another part (a shoulder
      // ball inside the torso) is dropped, and each part's share follows its visible area, so overlaps
      // don't pile up into bright blotches.
      function emitSurf(list, total, count, alpha, tn) {
        var q, z, vis = [], vtot = 0;
        for (q = 0; q < list.length; q++) {
          var seen = 0; if (tn) seen = 1; else { for (z = 0; z < 160; z++) if (!inside(primPoint(list[q], r, z * 7 + 3)[0], list === body ? q : -1, 0.004)) seen++; seen /= 160; }
          vis.push(list[q].area * seen); vtot += list[q].area * seen;
        }
        for (q = 0; q < list.length && count > 0; q++) {
          if (!vis[q]) continue;
          var p = list[q], c = q === list.length - 1 ? count - (pts.length - start) : Math.round(count * vis[q] / (vtot || 1)), w = Math.min(Math.sqrt(vis[q] / Math.max(1, c)), thinCap(p));
          if (pts.length - start + c > count) c = count - (pts.length - start);
          for (z = 0, got = 0; got < c && z < c * 6; z++) {
            var s = primPoint(p, r, z);
            if (!tn && inside(s[0], list === body ? q : -1, 0.004)) continue;
            pts.push(s[0]); nrm.push(s[1]); al.push(tn ? alpha : alpha * (1 - 0.7 * ao(s[0], s[1]))); sf.push(w * 0.9); tone.push(tn); own.push(primOwner(p, s[0])); got++;
          }
        }
      }
      var got = 0;
      var start = pts.length; emitSurf(body, sArea, skinN, 0.7, 0);
      start = pts.length; emitSurf(pr, pArea, propN, 0.9, 1);
      // order the skin and props along the outline, the way the line orders its ink: then each particle's
      // move from the drawing into the body is a short step inward, not a flight across the figure
      (function () {
        var marks = [], ci, kk;
        for (ci = 0; ci < C.length; ci++) { var sm = along(C[ci], Math.max(8, Math.round(C[ci].L / 0.02))); for (kk = 0; kk < sm.length; kk++) marks.push([sm[kk][0], sm[kk][1], ci + kk / sm.length]); }
        if (!marks.length) return;
        var lo = rimN, hi = pts.length, keyed = [];
        for (var q4 = lo; q4 < hi; q4++) {
          var bx = pts[q4][0], by = pts[q4][1], bk = 0, bd2 = 1e9;
          for (var m4 = 0; m4 < marks.length; m4++) { var dx4 = marks[m4][0] - bx, dy4 = marks[m4][1] - by, d4 = dx4 * dx4 + dy4 * dy4; if (d4 < bd2) { bd2 = d4; bk = marks[m4][2]; } }
          keyed.push([bk, pts[q4], nrm[q4], al[q4], sf[q4], tone[q4], own[q4]]);
        }
        keyed.sort(function (a4, b4) { return a4[0] - b4[0]; });
        for (q4 = 0; q4 < keyed.length; q4++) { var K4 = keyed[q4], at4 = lo + q4; pts[at4] = K4[1]; nrm[at4] = K4[2]; al[at4] = K4[3]; sf[at4] = K4[4]; tone[at4] = K4[5]; own[at4] = K4[6]; }
      })();
      start = pts.length;
      for (i = 0; i < seams.length; i++) {
        var sm = seams[i], cnt = i === seams.length - 1 ? seamN - (pts.length - start) : Math.round(seamN * sm.L / seamL), segs = [];
        for (k = 0; k < sm.P.length - 1; k++) segs.push(vlen(vsub(sm.P[k + 1], sm.P[k])));
        for (k = 0; k < cnt; k++) {
          var dist = cnt > 1 ? k / (cnt - 1) * sm.L : 0, sg = 0; while (sg < segs.length - 1 && dist > segs[sg]) { dist -= segs[sg]; sg++; }
          var f = segs[sg] ? dist / segs[sg] : 0, A = sm.P[sg], B = sm.P[sg + 1], pt = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
          if (k > 0) pairs.push([pts.length - 1, pts.length]);
          var nv = sm.n || vnorm(vsub(pt, sm.cen));
          pts.push(pt); nrm.push(nv); al.push(1); sf.push(0); tone.push(0); own.push(sm.owner);
        }
      }
      // the core: a small bright knot on the chest, where the signal lands
      var cc = anchors.chest;
      for (i = 0; i < coreN; i++) { var cp = onSphere(r, 0.004 + 0.012 * r()); bright.push(pts.length); pts.push([cc[0] + cp[0], cc[1] + cp[1], cc[2] - 0.004 + cp[2] * 0.3]); nrm.push([0, 0, -1]); al.push(1); sf.push(0); tone.push(0); own.push('chest'); }
      // a pair from the core to the nearest seam point, so signals from the chest reach the seams
      if (coreN && seamN) { var best = -1, bd = 9; for (i = n - coreN - seamN; i < n - coreN; i++) { var dd2 = vlen(vsub(pts[i], cc)); if (dd2 < bd) { bd = dd2; best = i; } } for (i = 0; i < coreN; i++) pairs.push([n - coreN + i, best]); }
      while (pts.length < n) { var s2 = primPoint(body[0], r); pts.push(s2[0]); nrm.push(s2[1]); al.push(0.55); sf.push(0.02); tone.push(0); own.push(primOwner(body[0], s2[0])); }
      pts.length = n; nrm.length = n; al.length = n; sf.length = n; tone.length = n; own.length = n;
      var cleanPairs = []; for (i = 0; i < pairs.length; i++) if (pairs[i][0] < n && pairs[i][1] < n && pairs[i][1] >= 0) cleanPairs.push(pairs[i]);
      return finish(n, pts, own, { normals: nrm, alpha: al, surfel: sf, tone: tone, pairs: cleanPairs, bright: bright, kick: 0.12, lineArt: true, surfelAlpha: 0.1, surfelFlat: true, still: true, edges: false });
    }
    return { line: line, lit: lit, anchors: anchors };
  }

  // group: several shapes in one, each scaled and placed ([builder, [x, y, z], scale]…); points
  // are shared out by weight, and pairs, bright, anchors and flow are carried over
  // group: several shapes in one, each scaled and placed ([builder, [x, y, z], scale, weight?]…);
  // points are shared out by weight (default: evenly, otherwise by weight × scale²), and pairs,
  // bright, anchors and flow are carried over. A part whose shape draws no edges (a lit body)
  // keeps its pairs out of the group. opts.links: [[from, to]…] drawn as threads between points
  // or anchors ('0.prop' is part 0's prop anchor).
  function group(parts, opts) {
    opts = opts || {};
    return function (n, r) {
      var pts = [], nrm = [], al = [], sf = [], tone = [], pairs = [], bright = [], anchors = {}, flows = [], base = 0, any = { n: false, a: false, s: false }, flags = {};
      var wsum = 0, k; for (k = 0; k < parts.length; k++) wsum += parts[k][3] != null ? parts[k][3] : 1;
      for (k = 0; k < parts.length; k++) {
        var wk = parts[k][3] != null ? parts[k][3] : 1, cnt = k === parts.length - 1 ? n - base : Math.floor(n * wk / wsum), sh = parts[k][0](cnt, r), at = parts[k][1], sc = parts[k][2], i;
        for (i = 0; i < cnt; i++) { var p = sh.points[i]; pts.push([at[0] + p[0] * sc, at[1] + p[1] * sc, at[2] + p[2] * sc]); nrm.push(sh.normals ? sh.normals[i] : [0, 0, -1]); al.push(sh.alpha ? sh.alpha[i] : 1); sf.push(sh.surfel ? sh.surfel[i] * sc : 0); tone.push(sh.tone ? sh.tone[i] : 0); }
        if (sh.normals) any.n = true; if (sh.alpha) any.a = true; if (sh.surfel) any.s = true;
        if (sh.still) flags.still = true; if (sh.surfelFlat) { flags.surfelFlat = true; flags.surfelAlpha = sh.surfelAlpha; }
        if (sh.pairs && sh.edges !== false) for (i = 0; i < sh.pairs.length; i++) pairs.push([sh.pairs[i][0] + base, sh.pairs[i][1] + base]);
        if (sh.bright) for (i = 0; i < sh.bright.length; i++) bright.push(sh.bright[i] + base);
        if (sh.anchors) for (var an in sh.anchors) { var q = sh.anchors[an]; anchors[k + '.' + an] = [at[0] + q[0] * sc, at[1] + q[1] * sc, at[2] + q[2] * sc]; }
        flows.push([base, cnt, sh.flow || null, at, sc]); base += cnt;
      }
      for (var nm in opts.anchors || {}) anchors[nm] = opts.anchors[nm];
      var links = (opts.links || []).map(function (L) { return [typeof L[0] === 'string' ? anchors[L[0]] : L[0], typeof L[1] === 'string' ? anchors[L[1]] : L[1]]; }).filter(function (L) { return L[0] && L[1]; });
      var OUT = [0, 0, 0];
      return { points: pts, normals: any.n ? nrm : null, alpha: any.a ? al : null, surfel: any.s ? sf : null, tone: tone, pairs: pairs, bright: bright, anchors: anchors, facing: true, kick: 0.2,
        links: links.length ? links : undefined, linkTone: links.length ? links.map(function () { return 0; }) : undefined, still: flags.still, surfelFlat: flags.surfelFlat, surfelAlpha: flags.surfelAlpha,
        flow: function (i, t, since) {
          for (var k2 = 0; k2 < flows.length; k2++) { var F = flows[k2]; if (i < F[0] + F[1]) { if (!F[2]) return null; var v = F[2](i - F[0], t, since); if (!v) return null; OUT[0] = F[3][0] + v[0] * F[4]; OUT[1] = F[3][1] + v[1] * F[4]; OUT[2] = F[3][2] + v[2] * F[4]; return OUT; } }
          return null;
        } };
    };
  }

  // the crew: the people Digital Craft builds for, each drawn then lit (registerCrew, or create({ crew: true }))
  // trades: who Digital Craft builds for, each a pose, props and (by default) the pose's action
  var TRADES = {
    contractor: { pose: 'tablet', props: ['hardhat', 'tablet'] },
    plumber: { pose: 'wrench', props: ['wrench', 'pipe'] },
    electrician: { pose: 'inspect', props: ['toolbelt', 'tester'] },
    roofer: { pose: 'hammer', props: ['hardhat', 'hammer'] },
    manager: { pose: 'phone', props: ['phone', 'clipboard'] },
    realtor: { pose: 'keys', props: ['keys', 'yardsign'] },
    hvac: { pose: 'inspect', props: ['gauge', 'hvacunit', 'cap'] },
    painter: { pose: 'pole', props: ['roller', 'cap'] },
    landscaper: { pose: 'pole', props: ['rake', 'cap'] },
    cleaner: { pose: 'pole', props: ['mop', 'bucket'] },
    pest: { pose: 'spray', props: ['sprayer', 'cap'] },
    pool: { pose: 'pole', props: ['skimmer'] },
    restoration: { pose: 'inspect', props: ['tester', 'fan'] },
    mover: { pose: 'carry', props: ['box'] },
    solar: { pose: 'reach', props: ['solarpanel', 'hardhat'] },
    window: { pose: 'carry', props: ['windowpane'] },
    garagedoor: { pose: 'keys', props: ['remote', 'garagedoor'] },
    arborist: { pose: 'push', props: ['chainsaw', 'hardhat'] },
    fencer: { pose: 'hammer', props: ['hammer', 'fence'] },
    concrete: { pose: 'pole', props: ['bullfloat', 'cap'] },
    host: { pose: 'tray', props: ['tray'] }
  };
  var CREW_NAMES = ['contractor', 'plumber', 'electrician', 'roofer', 'manager', 'realtor'];
  var registered = {};
  // crew:<trade>:line and :lit for one trade (or every trade), and crew:all, the default lineup
  function registerCrew(only) {
    var list = only ? [].concat(only) : Object.keys(TRADES), i;
    for (i = 0; i < list.length; i++) {
      var t = list[i]; if (!TRADES[t]) throw new Error('aurora-field: unknown trade "' + t + '"');
      if (registered[t] === TRADES[t]) continue;
      registered[t] = TRADES[t];
      (function (t2) {
        var memo = null; function f() { return memo || (memo = figure(TRADES[t2])); }   // built on first use
        register('crew:' + t2 + ':line', function (n, r) { return f().line(n, r); });
        register('crew:' + t2 + ':lit', function (n, r) { return f().lit(n, r); });
      })(t);
    }
    if (!only && !SHAPES['crew:all']) register('crew:all', crewGroup(CREW_NAMES));
    return CREW_NAMES.slice();
  }
  // a lineup of trades, lit, in a shallow arc
  // with: { builder: true } puts the builder at his desk front and centre, the crew in an arc behind him
  function crewGroup(names, withOpts) {
    var parts = [], k = names.length, b = withOpts && withOpts.builder;
    for (var i = 0; i < k; i++) {
      var f = figure(TRADES[names[i]] || names[i]), x = k > 1 ? -1 + i * 2 / (k - 1) : 0, a = k > 1 ? (i - (k - 1) / 2) / ((k - 1) / 2) : 0;
      parts.push(b ? [f.lit, [x * 1.05, -0.08, 0.42 + 0.12 * a * a], Math.min(0.42, 2.1 / (k + 0.4)), 1] : [f.lit, [x, 0.12, 0.28 * a * a], Math.min(0.5, 2.4 / (k + 0.4))]);
    }
    if (b) { registerBuilder(); parts.unshift([builderFigure('prompting').lit, [0.02, 0.36, -0.22], 0.56, 2.2]); }
    return group(parts);
  }
  // the builder: the person behind the agents, at a desk. Agents: small figures in visors, each
  // doing one job. builder:typing|prompting:line|lit, and builder:agents:<job+job…> (the builder
  // with his agents fanned out, threads running from his screen to each of them).
  var BUILDER_PROPS = ['monitor', 'keyboard', 'desk', 'chair'];
  var AGENTS = {
    answer: { pose: 'phone', props: ['visor', 'phone'], label: 'Answering calls' },
    estimate: { pose: 'tablet', props: ['visor', 'tablet'], label: 'Writing estimates' },
    review: { pose: 'inspect', props: ['visor', 'clipboard'], label: 'Requesting reviews' },
    schedule: { pose: 'tablet', props: ['visor', 'clipboard'], label: 'Booking the calendar' },
    followup: { pose: 'phone', props: ['visor', 'phone'], label: 'Following up leads' },
    analyze: { pose: 'inspect', props: ['visor', 'tablet'], label: 'Analyzing deals' }
  };
  var builders = {};
  function builderFigure(pose) { return builders[pose] || (builders[pose] = figure({ pose: pose, props: BUILDER_PROPS, trace: 2600, yaw: -0.6 })); }
  function agentFigure(job) { var a = AGENTS[job]; if (!a) throw new Error('aurora-field: unknown agent "' + job + '"'); return builders['agent:' + job] || (builders['agent:' + job] = figure({ pose: a.pose, props: a.props, trace: 900, yaw: 0.35 })); }
  function builderGroup(jobs) {
    var parts = [[builderFigure('prompting').lit, [-0.42, 0.08, 0.05], 0.78, 3]], links = [], k = jobs.length;
    for (var i = 0; i < k; i++) {
      var a = k > 1 ? i / (k - 1) : 0.5, x = 0.28 + a * 0.72, y = -0.05 + Math.abs(a - 0.5) * 0.22, z = 0.12 - Math.abs(a - 0.5) * 0.3;
      parts.push([agentFigure(jobs[i]).line, [x, y, z], 0.42, 1]);
      links.push(['0.prop', (i + 1) + '.chest']);
    }
    return group(parts, { links: links });
  }
  function registerBuilder(jobs) {
    if (!SHAPES['builder:typing:line']) {
      register('builder:typing:line', function (n, r) { return builderFigure('typing').line(n, r); });
      register('builder:typing:lit', function (n, r) { return builderFigure('typing').lit(n, r); });
      register('builder:prompting:lit', function (n, r) { return builderFigure('prompting').lit(n, r); });
    }
    if (!jobs) return null;
    var nm = 'builder:agents:' + jobs.join('+');
    if (!SHAPES[nm]) register(nm, builderGroup(jobs));
    return nm;
  }

  // plugins: add vocabulary and shapes without touching the engine.
  //   AuroraField.use({ poses: {…}, props: {…}, actions: {…}, trades: {…}, palettes: {…}, shapes: { name: build | data }, beats: {…} })
  var BEATS = {};
  function use(plugin) {
    if (!plugin) return api0;
    var k;
    for (k in plugin.poses || {}) FIG_POSES[k] = plugin.poses[k];
    for (k in plugin.props || {}) PROPS[k] = plugin.props[k];
    for (k in plugin.actions || {}) ACTIONS[k] = plugin.actions[k];
    for (k in plugin.palettes || {}) PALETTES[k] = plugin.palettes[k];
    for (k in plugin.beats || {}) BEATS[k] = plugin.beats[k];
    for (k in plugin.trades || {}) { TRADES[k] = plugin.trades[k]; if (registered[k]) registerCrew(k); }
    for (k in plugin.shapes || {}) register(k, plugin.shapes[k]);
    return api0;
  }
  // what the vocabulary holds right now (for validation, editors and AI schemas)
  function vocab() { return { poses: Object.keys(FIG_POSES), props: Object.keys(PROPS), actions: Object.keys(ACTIONS), trades: Object.keys(TRADES), agents: Object.keys(AGENTS), palettes: Object.keys(PALETTES), joints: FIG_J.slice() }; }
  var api0 = null;

  // ---- shape factories: point lists, SVG paths, text and images become shapes ----
  // Each returns a build function for register(). Flat sources sit in the x-y plane (y down,
  // like the screen), fitted to the unit box, with a little depth so they still turn in space.
  function fitBox(P, scale) {
    var x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9, i;
    for (i = 0; i < P.length; i++) { var p = P[i]; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); z0 = Math.min(z0, p[2] || 0); z1 = Math.max(z1, p[2] || 0); }
    var mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mz = (z0 + z1) / 2, k = (scale || 0.9) * 2 / Math.max(1e-9, x1 - x0, y1 - y0, z1 - z0);
    return function (p) { return [(p[0] - mx) * k, (p[1] - my) * k, ((p[2] || 0) - mz) * k]; };
  }
  // fromPoints([[x, y, z?]…], { scale, depth, tone: [0…1 per point], facing }) — any count resamples to n
  function fromPoints(P, opt) {
    opt = opt || {};
    if (!P || !P.length) throw new Error('aurora-field: fromPoints needs points');
    var fit = fitBox(P, opt.scale), base = [], tones = opt.tone, i;
    for (i = 0; i < P.length; i++) base.push(fit(P[i]));
    return function (n, r) {
      var pts = [], tone = [], depth = opt.depth == null ? 0.08 : opt.depth;
      for (i = 0; i < n; i++) {
        var j = n <= base.length ? Math.floor(i * base.length / n) : (i < base.length ? i : Math.floor(r() * base.length)), b = base[j];
        var jit = i >= base.length ? 0.012 : 0;
        pts.push([b[0] + (r() - 0.5) * jit, b[1] + (r() - 0.5) * jit, b[2] + (P[j].length < 3 ? (r() - 0.5) * depth : 0)]);
        tone.push(tones ? +tones[j] || 0 : 0);
      }
      return { points: pts, tone: tones ? tone : null, facing: opt.facing !== false, kick: opt.kick == null ? 0.4 : opt.kick };
    };
  }
  // a small SVG path parser: M L H V C S Q T Z (absolute and relative); arcs become lines
  function parsePath(d) {
    var tok = String(d).match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [], i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, subs = [], cur = null;
    function num() { return parseFloat(tok[i++]); }
    function pt(px, py) { if (!cur) { cur = { p: [[x, y]], closed: false }; subs.push(cur); } cur.p.push([px, py]); x = px; y = py; }
    function curve(p0, p1, p2, p3) {
      for (var s = 1; s <= 16; s++) {
        var t = s / 16, u = 1 - t, px, py;
        if (p3) { px = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0]; py = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]; }
        else { px = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]; py = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]; }
        pt(px, py);
      }
    }
    while (i < tok.length) {
      if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
      var rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0, a, b, c, e;
      if (C === 'Z') { if (cur) { cur.closed = true; x = sx; y = sy; cur = null; } continue; }
      if (i >= tok.length || /[A-Za-z]/.test(tok[i])) { i++; continue; }
      if (C === 'M') { x = num() + ox; y = num() + oy; sx = x; sy = y; cur = { p: [[x, y]], closed: false }; subs.push(cur); cmd = rel ? 'l' : 'L'; cx = x; cy = y; continue; }
      if (C === 'L') { a = num() + ox; b = num() + oy; pt(a, b); cx = x; cy = y; }
      else if (C === 'H') { pt(num() + ox, y); cx = x; cy = y; }
      else if (C === 'V') { pt(x, num() + oy); cx = x; cy = y; }
      else if (C === 'C') { a = [num() + ox, num() + oy]; b = [num() + ox, num() + oy]; c = [num() + ox, num() + oy]; curve([x, y], a, b, c); cx = b[0]; cy = b[1]; }
      else if (C === 'S') { a = [2 * x - cx, 2 * y - cy]; b = [num() + ox, num() + oy]; c = [num() + ox, num() + oy]; curve([x, y], a, b, c); cx = b[0]; cy = b[1]; }
      else if (C === 'Q') { a = [num() + ox, num() + oy]; b = [num() + ox, num() + oy]; curve([x, y], a, b); cx = a[0]; cy = a[1]; }
      else if (C === 'T') { a = [2 * x - cx, 2 * y - cy]; b = [num() + ox, num() + oy]; curve([x, y], a, b); cx = a[0]; cy = a[1]; }
      else if (C === 'A') { num(); num(); num(); num(); num(); e = [num() + ox, num() + oy]; pt(e[0], e[1]); cx = x; cy = y; }
      else i++;
    }
    return subs;
  }
  // fromSVG(d | [d…], { stroke: share on the outlines (0.6), depth, scale, tone: [per path] })
  // Outlines become joined particle lines that carry signals; closed paths are also filled.
  function fromSVG(paths, opt) {
    opt = opt || {};
    var list = typeof paths === 'string' ? [paths] : paths, subs = [], i, k;
    for (i = 0; i < list.length; i++) { var sp = parsePath(list[i]); for (k = 0; k < sp.length; k++) if (sp[k].p.length > 1) { sp[k].tone = opt.tone ? +opt.tone[i] || 0 : 0; subs.push(sp[k]); } }
    if (!subs.length) throw new Error('aurora-field: fromSVG found no path data');
    var all = []; for (i = 0; i < subs.length; i++) all = all.concat(subs[i].p);
    var fit = fitBox(all, opt.scale);
    for (i = 0; i < subs.length; i++) { var Q = []; for (k = 0; k < subs[i].p.length; k++) Q.push(fit(subs[i].p[k])); if (subs[i].closed) Q.push(Q[0]); subs[i].q = Q; subs[i].sg = seg3(Q); }
    return function (n, r) {
      var pts = [], pairs = [], tone = [], depth = opt.depth == null ? 0.1 : opt.depth, strokeN = Math.floor(n * (opt.stroke == null ? 0.6 : opt.stroke)), tot = 0, j;
      for (i = 0; i < subs.length; i++) tot += subs[i].sg.t;
      for (i = 0; i < subs.length && pts.length < strokeN; i++) {
        var c = Math.max(2, Math.round(strokeN * subs[i].sg.t / tot));
        for (j = 0; j < c && pts.length < strokeN; j++) {
          var p = along3(subs[i].q, subs[i].sg, (j + 0.5) / c * subs[i].sg.t);
          pts.push([p[0], p[1], (j % 2 ? 0.5 : -0.5) * depth]); tone.push(subs[i].tone);
          if (j > 1) pairs.push([pts.length - 3, pts.length - 1]);                       // front layer to front, back to back
        }
      }
      // fill the closed shapes (even-odd), or scatter along the outlines if none are closed
      var closed = []; for (i = 0; i < subs.length; i++) if (subs[i].closed) closed.push(subs[i]);
      for (k = 0; pts.length < n && k < n * 60; k++) {
        if (!closed.length) { var s0 = subs[Math.floor(r() * subs.length)], q0 = along3(s0.q, s0.sg, r() * s0.sg.t); pts.push([q0[0], q0[1], (r() - 0.5) * depth]); tone.push(s0.tone); continue; }
        var fx = (r() * 2 - 1), fy = (r() * 2 - 1), ins = 0, tn = 0;
        for (i = 0; i < closed.length; i++) if (inPoly(closed[i].q, fx, fy)) { ins++; tn = closed[i].tone; }
        if (ins % 2) { pts.push([fx, fy, (r() - 0.5) * depth]); tone.push(tn); }
      }
      while (pts.length < n) { var dup = Math.floor(r() * pts.length); pts.push(pts[dup].slice()); tone.push(tone[dup]); }
      return { points: pts, pairs: pairs, tone: opt.tone ? tone : null, facing: opt.facing !== false, lineArt: true, kick: 0.3 };
    };
  }
  function rasterCanvas(w, h) {
    if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    throw new Error('aurora-field: no canvas here; pass ImageData ({ width, height, data }) instead');
  }
  // fromImage(ImageData | canvas | image, { threshold 0.5, invert, alpha, edges 0.5, depth, tone: 'luma' })
  // Bright (or opaque) pixels become points; `edges` of them go to outlines so the shape reads crisp.
  function fromImage(src, opt) {
    opt = opt || {};
    var img = src;
    if (!src || !src.data) {
      var w0 = src.naturalWidth || src.videoWidth || src.width, h0 = src.naturalHeight || src.videoHeight || src.height, sc = Math.min(1, 320 / Math.max(w0, h0));
      var cv = rasterCanvas(Math.max(1, Math.round(w0 * sc)), Math.max(1, Math.round(h0 * sc))), g = cv.getContext('2d');
      g.drawImage(src, 0, 0, cv.width, cv.height); img = g.getImageData(0, 0, cv.width, cv.height);
    }
    var W = img.width, H = img.height, D = img.data, th = opt.threshold == null ? 0.5 : opt.threshold, on = new Uint8Array(W * H), lum = new Float32Array(W * H), x, y;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var q = (y * W + x) * 4, L = (0.2126 * D[q] + 0.7152 * D[q + 1] + 0.0722 * D[q + 2]) / 255, A = D[q + 3] / 255;
      var v = opt.alpha ? A : (opt.invert ? 1 - L : L) * A;
      lum[y * W + x] = L; on[y * W + x] = v > th ? 1 : 0;
    }
    var fill = [], edge = [];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      if (!on[y * W + x]) continue;
      var isEdge = x === 0 || y === 0 || x === W - 1 || y === H - 1 || !on[y * W + x - 1] || !on[y * W + x + 1] || !on[(y - 1) * W + x] || !on[(y + 1) * W + x];
      (isEdge ? edge : fill).push(y * W + x);
    }
    if (!fill.length && !edge.length) throw new Error('aurora-field: fromImage found no pixels over the threshold');
    var fit = fitBox([[0, 0, 0], [W, H, 0]], opt.scale);
    return function (n, r) {
      var pts = [], tone = [], ne = edge.length ? Math.floor(n * (opt.edges == null ? 0.5 : opt.edges)) : 0, depth = opt.depth == null ? 0.08 : opt.depth;
      for (var i = 0; i < n; i++) {
        var pool = (i < ne || !fill.length) ? edge : fill, id = pool[Math.floor(r() * pool.length)];
        var p = fit([id % W + r() - 0.5, Math.floor(id / W) + r() - 0.5, 0]);
        pts.push([p[0], p[1], (r() - 0.5) * depth]); tone.push(opt.tone === 'luma' ? lum[id] : 0);
      }
      return { points: pts, tone: opt.tone === 'luma' ? tone : null, facing: opt.facing !== false, kick: 0.3 };
    };
  }
  // fromText('Hello', { font: '800 160px sans-serif', ... fromImage options }) — needs a canvas (DOM or OffscreenCanvas)
  function fromText(text, opt) {
    opt = opt || {};
    var font = opt.font || '800 160px sans-serif', probe = rasterCanvas(8, 8).getContext('2d');
    probe.font = font;
    var lines = String(text).split('\n'), size = parseFloat((font.match(/(\d+(?:\.\d+)?)px/) || [0, 160])[1]), w = 8, i;
    for (i = 0; i < lines.length; i++) w = Math.max(w, Math.ceil(probe.measureText(lines[i]).width));
    var cv = rasterCanvas(w + 16, Math.ceil(size * 1.25 * lines.length) + 16), g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#fff'; g.font = font; g.textBaseline = 'top';
    for (i = 0; i < lines.length; i++) g.fillText(lines[i], 8, 8 + i * size * 1.25);
    return fromImage(g.getImageData(0, 0, cv.width, cv.height), merge({ edges: 0.55 }, opt));
  }

  var DEFAULTS = {
    container: null,          // element whose box sizes the canvas (default: canvas.parentNode)
    stage: null,              // element whose box places and sizes the shape (default: container)
    count: null,              // particle count, or function (width) → count; default WebGL 2800 / 5600, 2D 1400 / 2800
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
    renderer: 'auto',         // 'auto' uses WebGL when it can and canvas-2D otherwise; 'webgl' | '2d'
    quality: 'auto',          // 'auto' governs itself to hold the frame rate; 'high' | 'low' pin it
    fpsFloor: 45,             // the governor steps quality down below this, back up above 57
    autonomy: 1,              // 0…1: breathing, place-trading, scouts, self-lit signals
    interactive: true,
    autoPause: true,          // pause when off-screen or the tab is hidden
    reducedMotion: 'auto',    // 'auto' follows prefers-reduced-motion; true/false forces it
    seed: null,               // number → deterministic field
    clock: 'auto',            // 'manual': no animation loop; field.advance(ms) steps it (tests, goldens, video export)
    blank: false,             // start from an empty sky: particles are born unseen at the centre and appear as they arrive
    crew: false,              // register the built-in crew (crew:<trade>:line|lit, crew:all) before building the field
    palette: {
      point: [123, 227, 195], hot: '#F4FFFB', star: '#CFE9E0',
      signal: [200, 255, 236], head: [220, 255, 244], glow: [123, 227, 195], glow2: [62, 143, 122],
      fog: [52, 92, 110]      // far points fade toward this, for depth
    },
    surfels: true,            // WebGL: lit skins paint soft discs between their points, so they read as solid surfaces
    light: true,              // shapes with normals (helm, ranger) are lit; false turns it off, or { dir, ambient, key, rim, spec, shine }
    lightRig: { dir: [-0.5, -0.62, -0.6], ambient: 0.42, key: 1.05, rim: 0.5, spec: 0.55, shine: 9 },
    onShape: null,            // (name) when a shape becomes current
    onStats: null,            // ({fps, nodes, quality}) once a second while running
    onSpinout: null           // () when someone spins it really hard (|ω| > 7 rad/s)
  };
  // ---- palettes: presets by name; two-tone ones have an accent that shapes paint with `tone` ----
  // (armour lines carry tone: 1 for their accent parts; other shapes shade top → bottom)
  var PALETTES = {
    aurora: {},
    'mark-iii': { point: [214, 46, 52], accent: [255, 196, 92], hot: '#FFF4DC', star: '#F0D8C0', signal: [255, 214, 140], head: [255, 236, 200], glow: [214, 46, 52], glow2: [120, 30, 30], fog: [80, 30, 36] },
    ranger: { point: [236, 242, 250], accent: [232, 182, 72], hot: '#FFFFFF', star: '#E6E2D6', signal: [255, 222, 140], head: [255, 240, 205], glow: [210, 200, 170], glow2: [120, 100, 60], fog: [70, 72, 84] },
    verse: { point: [255, 52, 160], accent: [48, 226, 255], hot: '#FFF0FA', star: '#D8E8FF', signal: [140, 245, 255], head: [255, 210, 240], glow: [255, 52, 160], glow2: [40, 120, 200], fog: [70, 40, 110] },
    barbenheimer: { point: [255, 118, 196], accent: [255, 140, 48], hot: '#FFF3E8', star: '#FFE0D0', signal: [255, 200, 120], head: [255, 230, 210], glow: [255, 118, 196], glow2: [150, 60, 30], fog: [90, 44, 60] },
    'upside-down': { point: [255, 54, 64], accent: [84, 124, 255], hot: '#FFE8E8', star: '#C8D0FF', signal: [150, 180, 255], head: [255, 210, 210], glow: [220, 40, 50], glow2: [40, 60, 160], fog: [60, 30, 70] },
    'night-city': { point: [252, 236, 12], accent: [0, 238, 255], hot: '#FFFFF0', star: '#D0FBFF', signal: [140, 255, 255], head: [255, 252, 200], glow: [252, 236, 12], glow2: [0, 120, 140], fog: [60, 70, 40] },
    spice: { point: [242, 148, 58], accent: [70, 150, 255], hot: '#FFF2E2', star: '#F2DCC0', signal: [150, 200, 255], head: [255, 228, 196], glow: [242, 148, 58], glow2: [120, 70, 30], fog: [84, 58, 44] },
    ember: { point: [255, 158, 94], hot: '#FFF4E8', star: '#FFE2C9', signal: [255, 214, 170], head: [255, 236, 214], glow: [255, 140, 80], glow2: [160, 60, 30], fog: [90, 50, 40] },
    ice: { point: [140, 190, 255], hot: '#F2F7FF', star: '#D6E6FF', signal: [200, 225, 255], head: [230, 240, 255], glow: [120, 170, 255], glow2: [50, 80, 160], fog: [40, 60, 100] },
    mono: { point: [220, 224, 228], hot: '#FFFFFF', star: '#DDE3E6', signal: [245, 247, 248], head: [255, 255, 255], glow: [200, 205, 210], glow2: [90, 95, 100], fog: [70, 74, 80] }
  };
  function palette(p) {
    var base = DEFAULTS.palette;
    if (typeof p === 'string') { if (!PALETTES[p]) throw new Error('aurora-field: unknown palette "' + p + '"'); p = PALETTES[p]; }
    else if (p && typeof p.preset === 'string') p = merge(PALETTES[p.preset] || {}, p);
    var out = merge(base, p);
    if (!out.accent) out.accent = out.point;
    return out;
  }
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
    // tone (0 = point colour, 1 = accent): from the shape, or shaded top → bottom
    var TN = f32(n), lo = 1e9, hi = -1e9;
    if (s.tone && s.tone.length === n) for (i = 0; i < n; i++) TN[i] = +s.tone[i] || 0;
    else { for (i = 0; i < n; i++) { lo = Math.min(lo, T[i * 3 + 1]); hi = Math.max(hi, T[i * 3 + 1]); } for (i = 0; i < n; i++) TN[i] = hi > lo ? (T[i * 3 + 1] - lo) / (hi - lo) : 0; }
    // normals (lit shapes) and per-point alpha (a faint skin under crisp seams), both optional
    var NM = null, AL = null, nx, ny, nz, nl;
    if (s.normals && s.normals.length === n) {
      NM = f32(n * 3);
      for (i = 0; i < n; i++) { nx = +s.normals[i][0] || 0; ny = +s.normals[i][1] || 0; nz = +s.normals[i][2] || 0; nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; NM[i * 3] = nx / nl; NM[i * 3 + 1] = ny / nl; NM[i * 3 + 2] = nz / nl; }
    }
    if (s.alpha && s.alpha.length === n) { AL = f32(n); for (i = 0; i < n; i++) AL[i] = Math.max(0, Math.min(1, +s.alpha[i])); }
    // surfels: points that also paint a soft lit disc this wide (shape units), so a sparse skin reads solid
    var SFS = null;
    if (s.surfel && s.surfel.length === n) { SFS = f32(n); for (i = 0; i < n; i++) SFS[i] = Math.max(0, +s.surfel[i] || 0); }
    // trace: a pen draws the shape in order (0…1 per point) over ms; undrawn points ride the pen
    var TR = null, TRI = null, trMs = 0;
    if (s.trace && s.trace.order && s.trace.order.length === n) {
      TR = f32(n); TRI = [];
      for (i = 0; i < n; i++) { TR[i] = Math.max(0, Math.min(1, +s.trace.order[i] || 0)); TRI.push(i); }
      TRI.sort(function (a, b) { return TR[a] - TR[b]; });
      trMs = Math.max(1, +s.trace.ms || 1800);
    }
    var c = { def: s, T: T, adj: adj, tone: TN, nm: NM, al: AL, sf: SFS, tr: TR, tri: TRI, trMs: trMs };
    CACHE[key] = c; CACHE_KEYS.push(key);
    if (CACHE_KEYS.length > 24) delete CACHE[CACHE_KEYS.shift()];
    return c;
  }

  // quality ladder the governor walks: [particle stride, device-pixel cap]
  var LADDER = [[1, 99], [1, 1.5], [2, 1.25], [3, 1]];

  function create(canvas, options) {
    var o = merge(DEFAULTS, options);
    if (o.crew) registerCrew();
    o.palette = palette(options && options.palette);
    if (!canvas || !canvas.getContext) throw new Error('aurora-field: needs a <canvas>');
    var gl = null, ctx = null;
    if (o.renderer !== '2d') {
      var glo = { alpha: true, antialias: false, premultipliedAlpha: true, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
      try { gl = canvas.getContext('webgl', glo) || canvas.getContext('experimental-webgl', glo); } catch (e) { gl = null; }
    }
    if (!gl) ctx = canvas.getContext('2d');
    if (!gl && !ctx) throw new Error('aurora-field: needs a <canvas> with a WebGL or 2D context');
    // a canvas in a document, or a headless one (OffscreenCanvas in a worker, a server-side
    // canvas): headless fields are sized by width/height/dpr and driven through field.pointer()
    var doc = canvas.ownerDocument || null, headless = !doc || !canvas.getBoundingClientRect;
    var win = (doc && doc.defaultView) || (typeof self !== 'undefined' ? self : {});
    var container = headless ? null : (o.container || canvas.parentNode), stage = headless ? null : (o.stage || container);
    var VW = headless ? (+o.width || canvas.width || 300) : (win.innerWidth || 1024);
    var raf0 = win.requestAnimationFrame ? function (f) { return win.requestAnimationFrame(f); } : function (f) { return setTimeout(function () { f(now()); }, 16); };
    var caf0 = win.cancelAnimationFrame ? function (h) { win.cancelAnimationFrame(h); } : function (h) { clearTimeout(h); };
    var reduced = o.reducedMotion === 'auto' ? !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) : !!o.reducedMotion;
    var AUTO = reduced ? 0 : Math.max(0, Math.min(1, +o.autonomy || 0));
    var seed = o.seed == null ? SESSION_SEED : (o.seed >>> 0);
    var r = rng(seed), i;
    // the GPU path draws ~2× the particles for the same frame budget
    var N = typeof o.count === 'function' ? o.count(VW) : (o.count || (gl ? (VW < 760 ? 2800 : 5600) : (VW < 760 ? 1400 : 2800)));
    var names = (o.shapes || ORDER).slice();
    for (i = 0; i < names.length; i++) if (!SHAPES[names[i]]) throw new Error('aurora-field: unknown shape "' + names[i] + '"');
    var cycleList = (o.rotation || names).slice();
    for (i = 0; i < cycleList.length; i++) if (names.indexOf(cycleList[i]) < 0) throw new Error('aurora-field: rotation shape "' + cycleList[i] + '" is not in shapes');

    // ---- particle state, struct-of-arrays: no per-frame allocation, cache-friendly loops ----
    var X = f32(N), Y = f32(N), Z = f32(N), VX = f32(N), VY = f32(N), VZ = f32(N);
    var OX = f32(N), OY = f32(N), SX = f32(N), SY = f32(N), ZZ = f32(N);
    var W = f32(N), PH = f32(N), GLOW = f32(N), SC = f32(N);
    var HOT = i32(N), TI = i32(N), OWN = i32(N), TONE = f32(N);
    // breathing without per-particle trig: sin(a + q) = sin a cos q + cos a sin q, tables built once
    var BC1 = f32(N), BS1 = f32(N), BC2 = f32(N), BS2 = f32(N), BC3 = f32(N), BS3 = f32(N);
    for (i = 0; i < N; i++) {
      var r0 = o.blank ? between(r, 0, 0.04) : between(r, 2.5, 6), th = between(r, 0, TAU), ph = Math.acos(between(r, -1, 1));
      X[i] = r0 * Math.sin(ph) * Math.cos(th); Y[i] = r0 * Math.cos(ph); Z[i] = r0 * Math.sin(ph) * Math.sin(th);
      W[i] = between(r, 4.2, 8.5);          // each particle's own spring: some eager, some lazy
      PH[i] = between(r, 0, TAU);
      BC1[i] = Math.cos(PH[i]); BS1[i] = Math.sin(PH[i]); BC2[i] = Math.cos(PH[i] * 1.7); BS2[i] = Math.sin(PH[i] * 1.7); BC3[i] = Math.cos(PH[i] * 0.6); BS3[i] = Math.sin(PH[i] * 0.6);
      HOT[i] = r() < 0.07 ? 1 : 0;
      TI[i] = i; OWN[i] = i;                // particle i currently holds point i (they trade later)
    }
    // shapes compile on first use (setShape, or prepare() ahead of time), not all at create
    var S = {}, lineNeed = 0;
    var anyAL = false, visOn = !!o.blank;
    for (i = 0; i < names.length; i++) S[names[i]] = { w: 0, ready: false };
    function ensure(name) {
      var sh = S[name]; if (sh.ready) return sh;
      var c0 = compile(name, N, seed);
      sh.def = c0.def; sh.T = c0.T; sh.adj = c0.adj; sh.tone = c0.tone; sh.nm = c0.nm; sh.al = c0.al; sh.sf = c0.sf; sh.tr = c0.tr; sh.tri = c0.tri; sh.trMs = c0.trMs; sh.ready = true;
      if (c0.al) anyAL = true; if (c0.tr) visOn = true;
      lineNeed = Math.max(lineNeed, (c0.def.pairs || []).length + (c0.def.links || []).length);
      return sh;
    }
    // light: per-particle shade (key + ambient + rim) and a specular glint, for shapes with normals
    var LIT = f32(N), SPC = f32(N), AW = f32(N), FACE = f32(N), litOn = false, LGT = null;
    for (i = 0; i < N; i++) { LIT[i] = 1; AW[i] = 1; }
    // visibility: blank fields and traced shapes hide particles until they're drawn
    var VIS = f32(N); for (i = 0; i < N; i++) VIS[i] = o.blank ? 0 : 1;
    function lightRig(l) {
      if (l === false || l === 0) { LGT = null; return; }
      l = merge(DEFAULTS.lightRig, l && typeof l === 'object' ? l : null);
      var d = l.dir, dl = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1, Lx = d[0] / dl, Ly = d[1] / dl, Lz = d[2] / dl;
      var hx = Lx, hy = Ly, hz = Lz - 1, hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;   // half-vector with the view (0, 0, -1)
      var spl = new F32(257); for (var q = 0; q <= 256; q++) spl[q] = Math.pow(q / 256, l.shine);
      LGT = { L: [Lx, Ly, Lz], H: [hx / hl, hy / hl, hz / hl], amb: l.ambient, key: l.key, rim: l.rim, spec: l.spec, spl: spl };
    }
    lightRig(o.light);
    var stars = [];
    for (i = 0; i < o.stars; i++) stars.push([r(), r() * 0.8, between(r, 0.4, 1.3), between(r, 0, TAU)]);

    if (!names.length) throw new Error('aurora-field: no shapes');
    if (o.initial && !S[o.initial]) throw new Error('aurora-field: initial shape "' + o.initial + '" is not in shapes');
    var shape = o.initial || names[0], autoAt = 0, pinnedUntil = 0, born = 0, introDone = false, shapeAt = 0, traced = null, untr = null, arr = null, HELD = new Uint8Array(N);
    ensure(shape); S[shape].w = 1;
    for (i = 0; i < N; i++) TONE[i] = S[shape].tone[TI[i]];
    if (S[shape].al) for (i = 0; i < N; i++) AW[i] = S[shape].al[TI[i]];
    var CW = 0, CH = 0, DPR = 1, cx = 0, cy = 0, R = 1, D = Math.max(1.6, +o.depth || 2.8);
    var FT = {}, FV = {}, faceOn = false, OFF = null, offFor = null;   // face channels: targets, eased values
    var rotY = 0, rotX = -0.32, rotZ = 0, pose = null, vy = 0.9, kick = 0, mx = -1e4, my = -1e4, pointerIn = false, par = 0, down = null, waves = [], sig = [];
    var BUCKETS = 11, bCount = i32((BUCKETS + 1) * 2), bIdx = i32((BUCKETS + 1) * 2 * N), hotIdx = i32(N), litIdx = i32(N);
    var fps = 60, fAcc = 0, fN = 0, level = o.quality === 'low' ? 3 : 0, good = 0, spunAt = 0;
    var raf = 0, last = 0, running = false, wanted = true, inView = true, destroyed = false, listeners = [], settle = 0, clock = 0, GLR = null, lost = false;
    var glowCache = null, glowKey = '', haloCache = null, haloKey = '';
    // scouts: a few particles leave the shape, orbit with a trail, and come home
    // the pen's comet: its last positions on screen, drawn as a fading tail
    var PENT = 9, PENX = f32(PENT), PENY = f32(PENT), PENP = [0, 0, 0], penH = 0, penN = 0;
    var SCOUTS = [], MAXSCOUTS = Math.round(N * 0.008), TRAIL = 10, arrived = false;

    // events: field.on('shape' | 'stats' | 'spinout' | 'settled' | 'frame', fn); the on* options still work
    var EV = {};
    function emit(name, a) {
      var cb = { shape: o.onShape, stats: o.onStats, spinout: o.onSpinout }[name];
      if (cb) cb(a);
      var l = EV[name]; if (l) for (var q = 0; q < l.length; q++) l[q](a);
    }
    function on(el, ev, fn, opt) { el.addEventListener(ev, fn, opt || false); listeners.push([el, ev, fn, opt || false]); }
    // a manual clock (clock: 'manual') runs only when advance() is called: deterministic frames for tests, goldens and exports
    var manual = o.clock === 'manual', vnow = manual ? 0 : null;
    function now() { return vnow != null ? vnow : Date.now(); }
    function mkCanvas(w, h) {
      if (doc && doc.createElement) { var c = doc.createElement('canvas'); c.width = w; c.height = h; return c; }
      return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : null;
    }
    function step() { return LADDER[level][0]; }

    function layout() {
      var cr, g;
      if (headless) {
        // sized by options (field.resize(w, h, dpr) updates them); the stage is a rect or the whole canvas
        cr = { left: 0, top: 0, width: +o.width || 300, height: +o.height || 150 };
        g = o.stageRect ? { left: o.stageRect.x || 0, top: o.stageRect.y || 0, width: o.stageRect.width, height: o.stageRect.height } : cr;
      } else { cr = container.getBoundingClientRect(); g = stage.getBoundingClientRect(); }
      CW = cr.width; CH = cr.height; if (!CW || !CH) return;
      DPR = Math.min((headless ? +o.dpr : win.devicePixelRatio) || 1, o.maxDpr, LADDER[level][1]);
      canvas.width = Math.round(CW * DPR); canvas.height = Math.round(CH * DPR);
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
      var sz = Math.max(2, Math.ceil(R * 3 * DPR)), c = mkCanvas(sz, sz), g = c && c.getContext && c.getContext('2d');
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
      var c = mkCanvas(64, 64), g = c && c.getContext && c.getContext('2d'); if (!g) return null;
      c.width = c.height = 64;
      var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(o.palette.point, 0.55)); gr.addColorStop(0.35, rgba(o.palette.point, 0.18)); gr.addColorStop(1, rgba(o.palette.point, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      haloCache = c; return c;
    }
    function fire(sh, p, hops) {
      var adj = S[sh].adj; if (!adj || sig.length >= 60 || !adj[p].length || (visOn && VIS[OWN[p]] < 0.5)) return;
      var b = adj[p][Math.floor(Math.random() * adj[p].length)]; if (visOn && VIS[OWN[b]] < 0.5) return;   // signals only run where the pen has drawn
      sig.push({ sh: sh, a: p, b: b, t: 0, hops: hops || 6 + Math.floor(Math.random() * 10) });
    }
    function burst() { if (S[shape].adj) for (var k = 0; k < 14; k++) fire(shape, Math.floor(Math.random() * N)); }

    // project every particle once per frame; both renderers read SX/SY/ZZ
    var P1 = [0, 0, 0];
    var maxEdge2 = 1;
    function projectAll() {
      maxEdge2 = (R * 0.22) * (R * 0.22);
      var c1 = Math.cos(rotY), s1 = Math.sin(rotY), c2 = Math.cos(rotX), s2 = Math.sin(rotX), c3 = Math.cos(rotZ), s3 = Math.sin(rotZ), n;
      for (n = 0; n < N; n++) {
        var x = X[n] * c1 - Z[n] * s1, z = X[n] * s1 + Z[n] * c1, y = Y[n] * c2 - z * s2; z = Y[n] * s2 + z * c2;
        var kk = D / (D + z), xr = x * c3 - y * s3, yr = x * s3 + y * c3;
        SX[n] = xr * R * kk; SY[n] = yr * R * kk; ZZ[n] = z;
      }
      // shade by the current shape's normals, rotated with it; fades in as the shape takes over
      var cur = S[shape], NMc = cur.nm, lw = cur.w;
      if (LGT && NMc && lw > 0.01) {
        var L = LGT.L, H = LGT.H, amb = LGT.amb, key = LGT.key, rimK = LGT.rim, spK = LGT.spec, spl = LGT.spl;
        for (n = 0; n < N; n++) {
          var p = TI[n] * 3, ax = NMc[p], ay = NMc[p + 1], az = NMc[p + 2];
          var bx = ax * c1 - az * s1, bz = ax * s1 + az * c1, by = ay * c2 - bz * s2; bz = ay * s2 + bz * c2;
          var nxr = bx * c3 - by * s3, nyr = bx * s3 + by * c3;
          var dif = nxr * L[0] + nyr * L[1] + bz * L[2], face = -bz, rim = 1 - (face < 0 ? -face : face), hh = nxr * H[0] + nyr * H[1] + bz * H[2];
          if (dif < 0) dif = 0;
          var sh = amb + key * dif + rimK * rim * rim * rim;
          LIT[n] = 1 + (sh - 1) * lw; SPC[n] = hh > 0 && face > 0 ? spK * spl[(hh * 256) | 0] * lw : 0; FACE[n] = face;
        }
        litOn = true;
      } else if (litOn) { for (n = 0; n < N; n++) { LIT[n] = 1; SPC[n] = 0; } litOn = false; }
    }
    function proj3(v, out) {
      var c1 = Math.cos(rotY), s1 = Math.sin(rotY), c2 = Math.cos(rotX), s2 = Math.sin(rotX), c3 = Math.cos(rotZ), s3 = Math.sin(rotZ);
      var x = v[0] * c1 - v[2] * s1, z = v[0] * s1 + v[2] * c1, y = v[1] * c2 - z * s2; z = v[1] * s2 + z * c2;
      var kk = D / (D + z); out[0] = cx + (x * c3 - y * s3) * R * kk; out[1] = cy + (x * s3 + y * c3) * R * kk; out[2] = z;
      return out;
    }
    function draw(t) { projectAll(); if (GLR) GLR.draw(t); else draw2D(t); }
    function draw2D(t) {
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
      var gs = glowSprite();
      if (gs) ctx.drawImage(gs, cx - R * 1.5, cy - R * 1.5, R * 3, R * 3);
      ctx.globalCompositeOperation = 'lighter';
      // edges follow measured convergence: they fade out mid-morph and in as points arrive
      for (var name in S) {
        var sh = S[name], w = sh.w * settle; if (w < 0.02) continue;
        var pairs = sh.def.edges === false ? null : sh.def.pairs, links = sh.def.links;   // edges: false keeps pairs for signals only
        if (pairs) {
          ctx.strokeStyle = rgba(pal.point, 0.13 * w); ctx.lineWidth = 0.7; ctx.beginPath();
          for (i = 0; i < pairs.length; i += stp) {
            var A = OWN[pairs[i][0]], B = OWN[pairs[i][1]]; if ((ZZ[A] > 0.35 && ZZ[B] > 0.35) || SC[A] > 0 || SC[B] > 0 || (visOn && (VIS[A] < 0.5 || VIS[B] < 0.5))) continue;
            var ex2 = SX[A] - SX[B], ey2 = SY[A] - SY[B]; if (ex2 * ex2 + ey2 * ey2 > maxEdge2) continue;
            ctx.moveTo(cx + SX[A] + OX[A], cy + SY[A] + OY[A]); ctx.lineTo(cx + SX[B] + OX[B], cy + SY[B] + OY[B]);
          }
          ctx.stroke();
        }
        if (sh.dlOn) links = sh.dl;
        if (links) {
          var lt = sh.def.linkTone;
          for (var pass = 0; pass < (lt ? 2 : 1); pass++) {
            ctx.strokeStyle = rgba(pass ? pal.accent : pal.point, (sh.def.lineArt ? 0.4 : 0.18) * w); ctx.lineWidth = 1; ctx.beginPath();
            for (i = 0; i < links.length; i++) {
              if (lt && (lt[i] > 0.5 ? 1 : 0) !== pass) continue;
              proj3(links[i][0], P1); ctx.moveTo(P1[0], P1[1]);
              proj3(links[i][1], P1); ctx.lineTo(P1[0], P1[1]);
            }
            ctx.stroke();
          }
        }
      }
      if (sig.length) {
        ctx.strokeStyle = rgba(pal.signal, 0.95); ctx.lineWidth = 1.8; ctx.beginPath();
        for (i = 0; i < sig.length; i++) {
          var g = sig[i], ga = OWN[g.a], gb = OWN[g.b], t0 = Math.max(0, g.t - 0.5);
          var hx = SX[ga] - SX[gb], hy = SY[ga] - SY[gb]; if (hx * hx + hy * hy > maxEdge2) continue;
          ctx.moveTo(cx + SX[ga] + (SX[gb] - SX[ga]) * t0, cy + SY[ga] + (SY[gb] - SY[ga]) * t0);
          ctx.lineTo(cx + SX[ga] + (SX[gb] - SX[ga]) * g.t, cy + SY[ga] + (SY[gb] - SY[ga]) * g.t);
        }
        ctx.stroke();
      }
      if (penN > 1) {
        ctx.lineCap = 'round';
        for (j = 1; j < penN; j++) {
          var e0 = (penH - j + 1 + PENT) % PENT, e1 = (penH - j + PENT) % PENT, fa2 = 1 - j / penN;
          if (Math.abs(PENX[e0] - PENX[e1]) + Math.abs(PENY[e0] - PENY[e1]) > 24) break;   // never draw the tail across a pen lift
          ctx.strokeStyle = rgba(pal.signal, 0.85 * fa2); ctx.lineWidth = 2.6 * fa2 + 0.4;
          ctx.beginPath(); ctx.moveTo(PENX[e0], PENY[e0]); ctx.lineTo(PENX[e1], PENY[e1]); ctx.stroke();
        }
        ctx.fillStyle = pal.hot; ctx.beginPath(); ctx.arc(PENX[penH], PENY[penH], 2.4, 0, TAU); ctx.fill();
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
      var NB = (BUCKETS + 1) * 2;
      for (k = 0; k < NB; k++) bCount[k] = 0;
      var nh = 0, nl = 0;
      for (n = 0; n < N; n += stp) {
        if (visOn && VIS[n] < 0.5) continue;
        if (GLOW[n] > 0.25 || SC[n] > 0) { litIdx[nl++] = n; continue; }
        if (litOn ? SPC[n] > 0.4 : HOT[n]) { hotIdx[nh++] = n; continue; }
        var fz = (1 - ZZ[n]) / 2 * (litOn ? Math.min(1.3, LIT[n]) : 1) * (anyAL ? 0.35 + 0.65 * AW[n] : 1);
        k = Math.max(0, Math.min(BUCKETS, Math.round(fz * BUCKETS))) + (TONE[n] > 0.5 ? BUCKETS + 1 : 0);
        bIdx[k * N + bCount[k]++] = n;
      }
      // depth: far layers are small, dim and fogged; near layers are larger, saturated,
      // and get a one-pixel specular core, so the front reads sharp and the back recedes
      var fog = pal.fog || pal.point;
      for (k = 0; k < NB; k++) {
        var cnt = bCount[k]; if (!cnt) continue;
        var f = (k % (BUCKETS + 1)) / BUCKETS, m = Math.pow(f, 0.85), pc = k > BUCKETS ? pal.accent : pal.point;
        var col = [Math.round(fog[0] + (pc[0] - fog[0]) * m), Math.round(fog[1] + (pc[1] - fog[1]) * m), Math.round(fog[2] + (pc[2] - fog[2]) * m)];
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

    // ---- the GPU path: three programs, one interleaved buffer each, three draw calls ----
    // Points are round, anti-aliased discs at whole device pixels (near ones carry a white
    // specular core), soft halos for lit nodes, additive blending for the bloom; lines are
    // one gl.LINES call for every edge, link, signal, trail and shockwave.
    function makeGL() {
      function hexRGB(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var v = parseInt(h, 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
      function shader(type, src) {
        var sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('aurora-field shader: ' + gl.getShaderInfoLog(sh));
        return sh;
      }
      function program(vs, fs, attrs) {
        var pr = gl.createProgram(); gl.attachShader(pr, shader(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, shader(gl.FRAGMENT_SHADER, fs));
        for (var a = 0; a < attrs.length; a++) gl.bindAttribLocation(pr, a, attrs[a]);
        gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('aurora-field program: ' + gl.getProgramInfoLog(pr));
        return { p: pr, res: gl.getUniformLocation(pr, 'res'), dpr: gl.getUniformLocation(pr, 'dpr'), u: function (n) { return gl.getUniformLocation(pr, n); } };
      }
      var HEAD = 'uniform vec2 res;uniform float dpr;vec4 clip(vec2 q){vec2 c=q/res*2.0-1.0;return vec4(c.x,-c.y,0.0,1.0);}';
      var PT = program(
        'attribute vec2 p;attribute float s;attribute vec4 c;attribute float k;' + HEAD +
        'varying vec4 vc;varying float vk;varying float vs;' +
        'void main(){gl_Position=clip(floor(p*dpr)+0.5);gl_PointSize=s;vc=c;vk=k;vs=s;}',
        'precision mediump float;varying vec4 vc;varying float vk;varying float vs;' +
        'void main(){float d=length(gl_PointCoord-0.5)*2.0;' +
        'if(vk>3.5){gl_FragColor=vec4(vc.rgb,vc.a*(1.0-smoothstep(0.55,1.0,d)));return;}' +
        'if(vk>2.5){gl_FragColor=vec4(vc.rgb,vc.a*exp(-d*d*4.0)*step(d,1.0));return;}' +
        'if(vk>1.5){float h=max(0.0,1.0-d);gl_FragColor=vec4(vc.rgb,vc.a*h*h*h);return;}' +
        'float a=clamp((1.0-d)*vs*0.5,0.0,1.0);' +
        'vec3 col=vc.rgb;if(vk>0.5){col=mix(col,vec3(1.0),clamp((0.38-d)*vs*0.5,0.0,1.0)*0.9);}' +
        'gl_FragColor=vec4(col,vc.a*a);}',
        ['p', 's', 'c', 'k']);
      var LN = program(
        'attribute vec2 p;attribute vec4 c;' + HEAD + 'varying vec4 vc;void main(){gl_Position=clip(p*dpr);vc=c;}',
        'precision mediump float;varying vec4 vc;void main(){gl_FragColor=vc;}',
        ['p', 'c']);
      var GW = program(
        'attribute vec2 p;' + HEAD + 'uniform vec2 ctr;uniform float rad;varying vec2 uv;void main(){uv=p;gl_Position=clip((ctr+p*rad)*dpr);}',
        'precision mediump float;varying vec2 uv;uniform vec3 c0;uniform vec3 c1;' +
        'void main(){float d=length(uv);float a=mix(0.13,0.05,smoothstep(0.0,0.5,d))*(1.0-smoothstep(0.5,1.0,d));gl_FragColor=vec4(mix(c0,c1,smoothstep(0.0,0.5,d)),a);}',
        ['p']);
      var LXTRA = 64 + (MAXSCOUTS + 2) * TRAIL + 4 * 48 + PENT + 8;
      var PMAX = N * 3 + stars.length + 64 + MAXSCOUTS * 2 + 8, LMAX = lineNeed + LXTRA;
      var PB = new F32(PMAX * 8), LB = new F32(LMAX * 12), np = 0, nl = 0;
      var pbuf = gl.createBuffer(), lbuf = gl.createBuffer(), qbuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pbuf); gl.bufferData(gl.ARRAY_BUFFER, PB.byteLength, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, lbuf); gl.bufferData(gl.ARRAY_BUFFER, LB.byteLength, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, qbuf); gl.bufferData(gl.ARRAY_BUFFER, new F32([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      var maxPt = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) || [1, 64])[1];
      var HOTC = null, STARC = null, palKey = '';
      function pt(x, y, size, c, a, k) {
        if (np >= PMAX) return; var b = np * 8;
        PB[b] = x; PB[b + 1] = y; PB[b + 2] = Math.min(maxPt, size); PB[b + 3] = c[0] / 255; PB[b + 4] = c[1] / 255; PB[b + 5] = c[2] / 255; PB[b + 6] = a; PB[b + 7] = k; np++;
      }
      function ln(x0, y0, x1, y1, c, a) {
        if (nl >= LMAX) return; var b = nl * 12, r = c[0] / 255, g = c[1] / 255, bl = c[2] / 255;
        LB[b] = x0; LB[b + 1] = y0; LB[b + 2] = r; LB[b + 3] = g; LB[b + 4] = bl; LB[b + 5] = a;
        LB[b + 6] = x1; LB[b + 7] = y1; LB[b + 8] = r; LB[b + 9] = g; LB[b + 10] = bl; LB[b + 11] = a; nl++;
      }
      var COL = [0, 0, 0], P2 = [0, 0, 0], BASE = [0, 0, 0];
      // depth curves as lookup tables: three Math.pow per particle per frame become three reads
      var LUT_M = new F32(257), LUT_S = new F32(257), LUT_A = new F32(257);
      for (var li = 0; li <= 256; li++) { var lf = li / 256; LUT_M[li] = Math.pow(lf, 0.85); LUT_S[li] = 0.7 + 3.1 * Math.pow(lf, 1.25); LUT_A[li] = 0.12 + 0.88 * Math.pow(lf, 1.5); }
      function drawGL(t) {
        var pal = o.palette, fog = pal.fog || pal.point, stp = step(), n, i, j, k;
        if (lineNeed + LXTRA > LMAX) { LMAX = lineNeed + LXTRA; LB = new F32(LMAX * 12); gl.bindBuffer(gl.ARRAY_BUFFER, lbuf); gl.bufferData(gl.ARRAY_BUFFER, LB.byteLength, gl.DYNAMIC_DRAW); }   // a newly compiled shape needs more lines
        if (palKey !== pal.hot + pal.star) { palKey = pal.hot + pal.star; HOTC = hexRGB(pal.hot); STARC = hexRGB(pal.star); }
        np = 0; nl = 0;
        // stars
        for (i = 0; i < stars.length; i++) {
          var st = stars[i];
          pt(st[0] * CW - par * 8 * st[2], st[1] * CH, Math.max(1, st[2] * DPR), STARC, 0.12 + 0.28 * (0.5 + 0.5 * Math.sin(t * 0.0011 * st[2] + st[3])) * st[2] / 1.3, 0);
        }
        // edges, links, signals: one line batch (1 device px, so a touch brighter than 2D)
        for (var name in S) {
          var sh = S[name], w = sh.w * settle; if (w < 0.02) continue;
          var pairs = sh.def.edges === false ? null : sh.def.pairs, links = sh.def.links;
          if (pairs) for (i = 0; i < pairs.length; i += stp) {
            var A = OWN[pairs[i][0]], B = OWN[pairs[i][1]]; if ((ZZ[A] > 0.35 && ZZ[B] > 0.35) || SC[A] > 0 || SC[B] > 0 || (visOn && (VIS[A] < 0.5 || VIS[B] < 0.5))) continue;
            var gx = SX[A] - SX[B], gy = SY[A] - SY[B]; if (gx * gx + gy * gy > maxEdge2) continue;
            var fa = Math.max(0, Math.min(1, (1 - (ZZ[A] + ZZ[B]) / 2) / 2));
            ln(cx + SX[A] + OX[A], cy + SY[A] + OY[A], cx + SX[B] + OX[B], cy + SY[B] + OY[B], TONE[A] > 0.5 ? pal.accent : pal.point, 0.2 * w * (0.4 + 0.6 * fa));
          }
          var lt2 = sh.def.linkTone; if (sh.dlOn) links = sh.dl;
          if (links) for (i = 0; i < links.length; i++) {
            proj3(links[i][0], P1); proj3(links[i][1], P2);
            ln(P1[0], P1[1], P2[0], P2[1], lt2 && lt2[i] > 0.5 ? pal.accent : pal.point, (sh.def.lineArt ? 0.55 : 0.3) * w * (P1[2] < 0.2 || P2[2] < 0.2 ? 1 : 0.3));
          }
        }
        for (i = 0; i < sig.length; i++) {
          var g = sig[i], ga = OWN[g.a], gb = OWN[g.b], t0 = Math.max(0, g.t - 0.5);
          var hx = SX[ga] - SX[gb], hy = SY[ga] - SY[gb]; if (hx * hx + hy * hy > maxEdge2) continue;
          ln(cx + SX[ga] + (SX[gb] - SX[ga]) * t0, cy + SY[ga] + (SY[gb] - SY[ga]) * t0, cx + SX[ga] + (SX[gb] - SX[ga]) * g.t, cy + SY[ga] + (SY[gb] - SY[ga]) * g.t, pal.signal, 1);
        }
        for (i = 0; i < SCOUTS.length; i++) {
          var sc = SCOUTS[i], tr = sc.trail, len = Math.min(sc.count, TRAIL);
          for (j = 1; j < len; j++) {
            var h0 = (sc.head - j + 1 + TRAIL) % TRAIL, h1 = (sc.head - j + TRAIL) % TRAIL;
            ln(tr[h0 * 2], tr[h0 * 2 + 1], tr[h1 * 2], tr[h1 * 2 + 1], pal.signal, 0.6 * (1 - j / TRAIL) * sc.fade);
          }
        }
        // the pen's comet tail
        for (j = 1; j < penN; j++) { var e0 = (penH - j + 1 + PENT) % PENT, e1 = (penH - j + PENT) % PENT; if (Math.abs(PENX[e0] - PENX[e1]) + Math.abs(PENY[e0] - PENY[e1]) > 24) break; ln(PENX[e0], PENY[e0], PENX[e1], PENY[e1], pal.signal, 0.9 * (1 - j / penN)); }
        for (i = 0; i < waves.length; i++) {
          var wv = waves[i], wa = Math.max(0, 0.5 * (1 - wv.t / 700));
          for (k = 0; k < 48; k++) { var a0 = k / 48 * TAU, a1 = (k + 1) / 48 * TAU; ln(wv.x + Math.cos(a0) * wv.t, wv.y + Math.sin(a0) * wv.t, wv.x + Math.cos(a1) * wv.t, wv.y + Math.sin(a1) * wv.t, pal.point, wa); }
        }
        // particles: continuous depth (no buckets on the GPU) — size, fog and alpha by z
        var pp0 = pal.point, pa0 = pal.accent, two = pp0 !== pa0, SFc = o.surfels ? S[shape].sf : null, swt = S[shape].w, sfK = R * D * DPR;
        for (n = 0; n < N; n += stp) {
          var vz = visOn ? VIS[n] : 1; if (vz < 0.02) continue;
          var x = cx + SX[n] + OX[n], y = cy + SY[n] + OY[n], tn = two ? TONE[n] : 0;
          BASE[0] = pp0[0] + (pa0[0] - pp0[0]) * tn; BASE[1] = pp0[1] + (pa0[1] - pp0[1]) * tn; BASE[2] = pp0[2] + (pa0[2] - pp0[2]) * tn;
          if (GLOW[n] > 0.25 || SC[n] > 0) {
            var gl2 = Math.max(GLOW[n], SC[n] > 0 ? 0.8 : 0), sfe = SFc && !SC[n] ? SFc[TI[n]] : 0;
            if (sfe > 0) pt(x, y, sfe * sfK / (D + ZZ[n]) * 3.6, BASE, 0.34 * gl2 * swt * vz, 3);
            pt(x, y, (5 + 8 * gl2) * DPR, BASE, 0.42 * vz, 2);
            pt(x, y, Math.max(2, 2.4 * DPR), HOTC, vz, 0);
            continue;
          }
          if (HOT[n] && !litOn) { pt(x, y, Math.max(1.5, (ZZ[n] < 0 ? 2.8 : 1.5) * DPR), HOTC, 1, ZZ[n] < 0 ? 1 : 0); continue; }
          var f = (1 - ZZ[n]) / 2; f = f < 0 ? 0 : f > 1 ? 1 : f;
          var li2 = (f * 256 + 0.5) | 0, m = LUT_M[li2], aw = AW[n], size = Math.max(1.2, LUT_S[li2] * DPR * (0.5 + 0.5 * aw)), al = LUT_A[li2] * (aw < 1 && SFc && SFc[TI[n]] > 0 ? 0.6 * aw * aw : 0.35 + 0.65 * aw);
          COL[0] = fog[0] + (BASE[0] - fog[0]) * m; COL[1] = fog[1] + (BASE[1] - fog[1]) * m; COL[2] = fog[2] + (BASE[2] - fog[2]) * m;
          if (litOn) {
            var lt = LIT[n], sp = SPC[n];
            COL[0] *= lt; COL[1] *= lt; COL[2] *= lt;
            if (sp > 0.01) { COL[0] += (255 - COL[0]) * sp; COL[1] += (255 - COL[1]) * sp; COL[2] += (255 - COL[2]) * sp; al += (1 - al) * sp; }
            if (COL[0] > 255) COL[0] = 255; if (COL[1] > 255) COL[1] = 255; if (COL[2] > 255) COL[2] = 255;
            al *= lt < 1 ? 0.45 + 0.55 * lt : 1;
          }
          if (SFc && settle > 0.05) {
            var sfz = SFc[TI[n]];
            if (sfz > 0) {
              var fc = litOn ? FACE[n] : (ZZ[n] < 0 ? 1 : -1), vis = fc > 0.15 ? 1 : fc < -0.15 ? 0.18 : 0.18 + 0.82 * (fc + 0.15) / 0.3;
              var flat = S[shape].def.surfelFlat;   // flat discs blend into an even, solid surface; soft ones into a glow
              pt(x, y, sfz * sfK / (D + ZZ[n]) * (flat ? 3.9 * (0.35 + 0.65 * Math.max(0, Math.min(1, fc))) : 3.4), COL, (S[shape].def.surfelAlpha || 0.12) * swt * settle * vis * vz, flat ? 4 : 3);
            }
          }
          pt(x, y, size, COL, al * vz, f > 0.55 && size >= 3 && (!litOn || SPC[n] > 0.05 || LIT[n] > 1) ? 1 : 0);
        }
        for (i = 0; i < sig.length; i++) {
          var g2 = sig[i], a2 = OWN[g2.a], b2 = OWN[g2.b];
          pt(cx + SX[a2] + (SX[b2] - SX[a2]) * g2.t, cy + SY[a2] + (SY[b2] - SY[a2]) * g2.t, Math.max(3, 4 * DPR), pal.head, 1, 1);
        }
        if (penN) { pt(PENX[penH], PENY[penH], 14 * DPR, pal.signal, 0.35, 2); pt(PENX[penH], PENY[penH], Math.max(3, 3.4 * DPR), HOTC, 1, 1); }
        // draw
        var W = canvas.width, H = canvas.height;
        gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
        // core glow
        gl.useProgram(GW.p); gl.uniform2f(GW.res, W, H); gl.uniform1f(GW.dpr, DPR);
        gl.uniform2f(GW.u('ctr'), cx, cy); gl.uniform1f(GW.u('rad'), R * 1.5);
        gl.uniform3f(GW.u('c0'), pal.glow[0] / 255, pal.glow[1] / 255, pal.glow[2] / 255); gl.uniform3f(GW.u('c1'), pal.glow2[0] / 255, pal.glow2[1] / 255, pal.glow2[2] / 255);
        gl.bindBuffer(gl.ARRAY_BUFFER, qbuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
        gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); gl.disableVertexAttribArray(3);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        if (nl) {
          gl.useProgram(LN.p); gl.uniform2f(LN.res, W, H); gl.uniform1f(LN.dpr, DPR);
          gl.bindBuffer(gl.ARRAY_BUFFER, lbuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, LB.subarray(0, nl * 12));
          gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
          gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
          gl.drawArrays(gl.LINES, 0, nl * 2);
        }
        if (np) {
          gl.useProgram(PT.p); gl.uniform2f(PT.res, W, H); gl.uniform1f(PT.dpr, DPR);
          gl.bindBuffer(gl.ARRAY_BUFFER, pbuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, PB.subarray(0, np * 8));
          gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 32, 0);
          gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 32, 8);
          gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 12);
          gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 32, 28);
          gl.drawArrays(gl.POINTS, 0, np);
        }
      }
      return {
        draw: drawGL,
        destroy: function () {
          gl.deleteBuffer(pbuf); gl.deleteBuffer(lbuf); gl.deleteBuffer(qbuf);
          gl.deleteProgram(PT.p); gl.deleteProgram(LN.p); gl.deleteProgram(GW.p);
          gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        }
      };
    }

    function scoutTarget(sc, out) {
      var a = sc.a;
      out[0] = Math.cos(a) * sc.r; out[1] = Math.sin(a * 0.7 + sc.tilt) * 0.35 + sc.tilt * 0.2; out[2] = Math.sin(a) * sc.r;
    }
    var TT = [0, 0, 0];
    function update(dt, t) {
      var tn = now(), cur = S[shape], def = cur.def, T = cur.T, flowT = t / 1000, n, k;
      // the pen: while a traced shape is being drawn, points past its progress wait at its tip
      var since = (tn - shapeAt) / 1000, tr = cur.tr, prog = 1, pen = -1, trOn = false, vt, park, held;
      var arrT = arr ? tn - arr.at : 0, arrOn = arr && arrT < arr.ms; if (arr && !arrOn) arr = null;
      if (tr && !reduced) {
        var lin = since * 1000 / cur.trMs;
        prog = lin >= 1 ? lin : def.trace.ease === 'linear' ? lin : (1 - Math.cos(Math.PI * lin)) / 2;   // a hand eases in and out
        if (untr && untr.shape === shape) {   // untrace(): the pen runs backwards and takes the drawing with it
          var ul = (tn - untr.at) / untr.ms;
          prog = ul >= 1 ? 0 : (1 + Math.cos(Math.PI * ul)) / 2;
          if (ul >= 1 && !untr.done) { untr.done = true; emit('untraced', shape); }
        }
        if (prog < 1) {
          trOn = true; pen = cur.tri[Math.min(N - 1, Math.max(0, Math.floor(prog * N)))];
          var pf = def.flow ? def.flow(pen, flowT, since) : null, pv = [pf ? pf[0] : T[pen * 3], pf ? pf[1] : T[pen * 3 + 1], pf ? pf[2] : T[pen * 3 + 2]];
          proj3(pv, PENP); if (penN && Math.abs(PENP[0] - PENX[penH]) + Math.abs(PENP[1] - PENY[penH]) > 40) penN = 0;   // a pen lift: no tail across the gap
          penH = (penH + 1) % PENT; PENX[penH] = PENP[0]; PENY[penH] = PENP[1]; penN = Math.min(PENT, penN + 1);
        }
        else if (traced !== shape) { traced = shape; emit('traced', shape); }
      }
      if (!trOn && penN) penN--;   // the tail fades once the pen lifts
      clock += dt;
      if (!introDone && tn - born > o.intro) introDone = true;
      if (introDone && o.cycle > 0 && cycleList.length > 1 && tn > autoAt && tn > pinnedUntil) {
        var ci = cycleList.indexOf(shape); setShape(cycleList[(ci + 1) % cycleList.length]);
      }
      for (var nm in S) S[nm].w += ((nm === shape ? 1 : 0) - S[nm].w) * Math.min(1, dt * 3);
      if (def.facing && !down) {
        vy += (0 - vy) * Math.min(1, dt * 2.5);
        var base = Math.round(rotY / TAU) * TAU;
        if (pose) {
          // follow a tracked head: fast, but smoothed so camera jitter never shows
          var fk = Math.min(1, dt * 14);
          rotY += (base + pose.yaw - rotY) * fk; rotX += (pose.pitch - 0.06 - rotX) * fk; rotZ += (pose.roll - rotZ) * fk;
        } else {
          // turn to face the viewer, then hold with a slow sway
          rotY += (base + Math.sin(clock * 0.42) * 0.2 - rotY) * Math.min(1, dt * 2.2);
          rotX += (-0.1 + Math.sin(clock * 0.31) * 0.06 - rotX) * Math.min(1, dt * 2);
          rotZ += (0 - rotZ) * Math.min(1, dt * 3);
        }
      } else if (!down) {
        vy += (0.16 - vy) * Math.min(1, dt * 0.9);
        rotX += (-0.32 - rotX) * Math.min(1, dt * 0.6);
        rotZ += (0 - rotZ) * Math.min(1, dt * 3);
      }
      rotY += (vy + kick) * dt; kick *= Math.pow(0.12, dt);
      if (Math.abs(vy) > 7 && tn > spunAt) { spunAt = tn + 4000; emit('spinout'); }

      // ---- autonomy: particles manage themselves ----
      if (AUTO > 0 && introDone && !trOn && !def.still) {
        // trade places with a neighbour now and then (the shape keeps reorganising itself)
        var swaps = dt * 3 * AUTO * settle;
        while (Math.random() < swaps) {
          swaps -= 1;
          var span = def.lineArt ? 8 : 240, pa = Math.floor(Math.random() * N), pb = Math.max(0, Math.min(N - 1, pa + Math.floor((Math.random() - 0.5) * span)));
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
        var lit = (0.5 + 0.32 * settle) * S[shape].w * (pose && pose.eyes != null && !(faceOn && def.rig && def.rig.dim) ? 0.15 + 0.85 * pose.eyes : 1), br = def.bright;
        for (k = 0; k < br.length; k++) { var bn = OWN[br[k]]; if (!SC[bn] && GLOW[bn] < lit) GLOW[bn] = lit; }
      }
      // ---- the face rig: ease each channel toward its target, then sum the displacements ----
      var rig = def.rig, rigOn = false;
      if (faceOn || offFor) {
        var fk2 = Math.min(1, dt * 18), any = false;
        for (var ch in FV) { var tv = FT[ch] || 0; FV[ch] += (tv - FV[ch]) * fk2; if (Math.abs(FV[ch]) > 0.002) any = true; else if (!tv) FV[ch] = 0; }
        if (rig && any) {
          if (!OFF) OFF = new F32(N * 3);
          for (k = 0; k < N * 3; k++) OFF[k] = 0;
          for (ch in rig.P) { var fv = FV[ch]; if (!fv) continue; var A3 = rig.P[ch]; for (k = 0; k < N * 3; k++) OFF[k] += A3[k] * fv; }
          rigOn = true; offFor = shape;
          if (rig.dim) for (ch in rig.dim) { var dv = FV[ch]; if (dv > 0.02) { var dl = rig.dim[ch]; for (k = 0; k < dl.length; k++) { var dn = OWN[dl[k]]; GLOW[dn] = Math.min(GLOW[dn], 0.82 * (1 - 0.92 * dv)); } } }
          // deformed links for the renderers
          var L0 = def.links, LR = rig.L, sh0 = S[shape];
          if (L0 && LR) {
            if (!sh0.dl) { sh0.dl = []; for (k = 0; k < L0.length; k++) sh0.dl.push([[0, 0, 0], [0, 0, 0]]); }
            for (k = 0; k < L0.length; k++) for (var e2 = 0; e2 < 2; e2++) { var dst = sh0.dl[k][e2], src = L0[k][e2]; dst[0] = src[0]; dst[1] = src[1]; dst[2] = src[2]; }
            for (ch in LR) { var lv = FV[ch]; if (!lv) continue; var LA = LR[ch]; for (k = 0; k < L0.length; k++) for (e2 = 0; e2 < 2; e2++) { var dd = sh0.dl[k][e2], o6 = k * 6 + e2 * 3; dd[0] += LA[o6] * lv; dd[1] += LA[o6 + 1] * lv; dd[2] += LA[o6 + 2] * lv; } }
            sh0.dlOn = true;
          }
        } else { offFor = null; if (S[shape].dlOn) S[shape].dlOn = false; }
      }
      // ---- physics: each particle is a damped spring toward its point, swirling in ----
      var breathe = 0.014 * AUTO * (def.lineArt && def.trace ? 0.3 : 1), swirlK = 1.6, TN0 = cur.tone, AL0 = cur.al, tk = Math.min(1, dt * 3);
      var bs1 = Math.sin(clock * 1.3), bc1 = Math.cos(clock * 1.3), bs2 = Math.sin(clock * 1.1), bc2 = Math.cos(clock * 1.1), bs3 = Math.sin(clock * 0.9), bc3 = Math.cos(clock * 0.9);
      var near = o.interactive && pointerIn, waveOn = waves.length > 0;
      for (n = 0; n < N; n++) {
        var p = TI[n], tx, ty, tz;
        if (SC[n] > 0) {
          for (k = 0; k < SCOUTS.length; k++) if (SCOUTS[k].i === n) { scoutTarget(SCOUTS[k], TT); break; }
          tx = TT[0]; ty = TT[1]; tz = TT[2];
        } else {
          var fl = def.flow ? def.flow(p, flowT, since) : null;
          if (fl) { tx = fl[0]; ty = fl[1]; tz = fl[2]; } else { tx = T[p * 3]; ty = T[p * 3 + 1]; tz = T[p * 3 + 2]; }
          if (rigOn) { tx += OFF[p * 3]; ty += OFF[p * 3 + 1]; tz += OFF[p * 3 + 2]; }
          if (breathe) {
            tx += breathe * (bs1 * BC1[n] + bc1 * BS1[n]); ty += breathe * (bs2 * BC2[n] + bc2 * BS2[n]); tz += breathe * (bc3 * BC3[n] - bs3 * BS3[n]);
          }
        }
        vt = 1; park = false; held = false;
        if (arrOn && arrT < arr.D[p]) { tx = X[n]; ty = Y[n]; tz = Z[n]; held = true; }
        if (HELD[n] && !held) GLOW[n] = Math.max(GLOW[n], 0.32);   // it lights up as the wave reaches it
        HELD[n] = held ? 1 : 0;
        if (trOn && tr[p] > prog) {
          park = !visOn || VIS[n] < 0.05;   // unseen: ride the pen exactly, so it's already there when drawn
          // not drawn yet: wait in a small knot at the pen; only the next stretch shows, as its bright tip
          tx = T[pen * 3] + 0.025 * BC1[n]; ty = T[pen * 3 + 1] + 0.025 * BS2[n]; tz = T[pen * 3 + 2] + 0.025 * BC3[n];
          vt = tr[p] - prog < 0.004 && !(untr && untr.done) && Math.abs(X[n] - tx) + Math.abs(Y[n] - ty) + Math.abs(Z[n] - tz) < 0.12 ? 1 : 0;   // the tip shows once it has caught up with the pen
        } else if (trOn && VIS[n] < 0.05) park = true;   // just drawn and still unseen: it appears in place, right behind the pen
        var om = W[n] * (introDone ? 1 : 0.55), damp = 1.5 * om;
        var ex = tx - X[n], ey = ty - Y[n], ez = tz - Z[n];
        var dist = Math.abs(ex) + Math.abs(ey) + Math.abs(ez), sw = swirlK * Math.min(1, dist);
        VX[n] += (om * om * ex - damp * VX[n] - ez * sw) * dt;
        VY[n] += (om * om * ey - damp * VY[n]) * dt;
        VZ[n] += (om * om * ez - damp * VZ[n] + ex * sw) * dt;
        X[n] += VX[n] * dt; Y[n] += VY[n] * dt; Z[n] += VZ[n] * dt;
        if (park) { X[n] = tx; Y[n] = ty; Z[n] = tz; VX[n] = VY[n] = VZ[n] = 0; }
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
        if (!held) {
          TONE[n] += (TN0[p] - TONE[n]) * tk;              // colours morph with the shape
          if (anyAL) AW[n] += ((AL0 ? AL0[p] : 1) - AW[n]) * tk;
        }
        if (GLOW[n] > 0) GLOW[n] = Math.max(0, GLOW[n] - dt * 1.6);
        if (visOn) {
          var vv = VIS[n];
          if (vt > vv) { if (trOn && vv < 0.3) GLOW[n] = Math.max(GLOW[n], 0.2); VIS[n] = Math.min(vt, vv + dt * 7); }
          else if (vt < vv) VIS[n] = Math.max(vt, vv - dt * 4);
        }
      }
      for (var w = waves.length - 1; w >= 0; w--) { waves[w].t += dt * 620; if (waves[w].t > 700) waves.splice(w, 1); }
      // how close is the field to its shape? sample 64 particles
      var err = 0, stride = Math.max(1, Math.floor(N / 64)), cnt = 0;
      for (n = 0; n < N; n += stride) {
        if (SC[n] > 0 || (visOn && VIS[n] < 0.5)) continue;
        var pp = TI[n], fq = def.flow ? def.flow(pp, flowT, since) : null;
        err += Math.abs((fq ? fq[0] : T[pp * 3]) - X[n]) + Math.abs((fq ? fq[1] : T[pp * 3 + 1]) - Y[n]) + Math.abs((fq ? fq[2] : T[pp * 3 + 2]) - Z[n]); cnt++;
      }
      // breathing is part of being in shape, so it doesn't count as error
      var target = cnt ? Math.max(0, Math.min(1, 1 - Math.max(0, err / cnt - breathe * 2.2) * 4)) : 1;
      settle += (target - settle) * Math.min(1, dt * 6);
      if (!arrived && settle > 0.9) { arrived = true; emit('settled', shape); }
      // signals: fire on their own; each node they reach lights up
      if (cur.adj && settle > 0.6 && Math.random() < dt * (6 + 8 * AUTO)) fire(shape, Math.floor(Math.random() * N));
      for (var s = sig.length - 1; s >= 0; s--) {
        var g = sig[s]; if (g.sh !== shape) { sig.splice(s, 1); continue; }
        g.t += dt * 3.2;
        if (g.t >= 1) {
          if (AUTO) GLOW[OWN[g.b]] = Math.max(GLOW[OWN[g.b]], 0.6 + 0.4 * AUTO);
          var adj = S[g.sh].adj[g.b];
          var nb = adj.length ? adj[Math.floor(Math.random() * adj.length)] : -1;
          if (--g.hops > 0 && nb >= 0 && !(visOn && VIS[OWN[nb]] < 0.5)) { g.a = g.b; g.b = nb; g.t = 0; } else sig.splice(s, 1);
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
        emit('stats', { fps: fps, nodes: Math.ceil(N / step()), quality: level });
      }
      if (EV.frame) emit('frame', t);
      raf = raf0(frame);
    }
    function sync() {
      var want = !manual && wanted && !destroyed && !lost && !reduced && (!o.autoPause || (!(doc && doc.hidden) && inView));
      if (want && !running) { running = true; last = 0; if (!raf) raf = raf0(frame); }
      else if (!want && running) { running = false; if (raf) { caf0(raf); raf = 0; } }
    }
    function snap(name) {
      var T = ensure(name).T;
      for (var n = 0; n < N; n++) { var p = TI[n]; X[n] = T[p * 3]; Y[n] = T[p * 3 + 1]; Z[n] = T[p * 3 + 2]; VX[n] = VY[n] = VZ[n] = 0; TONE[n] = S[name].tone[p]; AW[n] = S[name].al ? S[name].al[p] : 1; VIS[n] = 1; }
      settle = 1; traced = name;
    }
    function setShape(name, opt) {
      if (!S[name]) throw new Error('aurora-field: shape "' + name + '" is not in this field');
      ensure(name);
      var pin = opt && opt.pin;
      if (pin) pinnedUntil = now() + (pin === true ? o.pin : pin);
      autoAt = now() + o.cycle;
      if (name === shape) return api;
      // arrive: points switch to the new shape in a wave from a source, nearest first; the rest hold where they are
      arr = null;
      var av = opt && opt.arrive;
      if (av && !reduced) {
        var src = typeof av.from === 'string' ? (S[name].def.anchors || {})[av.from] : av.from, T2 = S[name].T, Dl = f32(N), mx2 = 1e-6, q2;
        if (!src) src = [0, 0, 0];
        for (q2 = 0; q2 < N; q2++) { var ax = T2[q2 * 3] - src[0], ay = T2[q2 * 3 + 1] - src[1], az = T2[q2 * 3 + 2] - src[2]; Dl[q2] = Math.sqrt(ax * ax + ay * ay + az * az); if (Dl[q2] > mx2) mx2 = Dl[q2]; }
        var ams = Math.max(1, +av.ms || 900); for (q2 = 0; q2 < N; q2++) Dl[q2] = Dl[q2] / mx2 * ams;
        arr = { at: now(), ms: ams, D: Dl };
      }
      shape = name; shapeAt = now(); traced = null; untr = null; kick += S[name].def.kick || 0.6; sig.length = 0; arrived = false;
      for (var nm2 in S) S[nm2].dlOn = false;
      if (reduced) { for (var nm in S) S[nm].w = nm === name ? 1 : 0; snap(name); draw(0); }
      emit('shape', name);
      return api;
    }

    // ---- input: DOM pointer events and field.pointer() share one path ----
    function pMove(x, y) {
      mx = x; my = y; par = mx / (CW || 1) - 0.5;
      pointerIn = Math.abs(mx - cx) < R * 1.8 + 90 && Math.abs(my - cy) < R * 1.8 + 90;
      if (down) {
        var dx = x - down[0];
        vy = dx * 0.06 * 60 / Math.max(16, now() - down[2] + 16);
        rotY += dx * 0.006; rotX = Math.max(-1.1, Math.min(0.6, rotX + (y - down[1]) * 0.004));
        down = [x, y, now(), down[3] + Math.abs(dx) + Math.abs(y - down[1])];
        if (!running) draw(0);
      }
    }
    function pLeave() { mx = my = -1e4; pointerIn = false; }
    function pDown(x, y) { down = [x, y, now(), 0]; }
    function pUp(x, y, touch) {
      if (!down) return; var moved = down[3]; down = null;
      if (moved < 6) pulse(x, y);
      if (touch) pLeave();
    }
    function pulse(x, y) { waves.push({ x: x, y: y, t: 0 }); if (waves.length > 4) waves.shift(); kick += 0.8; burst(); }
    function pos(e) { var b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
    if (o.interactive && !headless) {
      on(canvas, 'pointermove', function (e) { var p = pos(e); pMove(p[0], p[1]); });
      on(canvas, 'pointerleave', pLeave);
      on(canvas, 'pointerdown', function (e) {
        var p = pos(e); pDown(p[0], p[1]); canvas.setAttribute('data-dragging', '');
        if (e.pointerType !== 'touch' && canvas.setPointerCapture) try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      });
      on(canvas, 'pointerup', function (e) { var p = pos(e); canvas.removeAttribute('data-dragging'); pUp(p[0], p[1], e.pointerType === 'touch'); });
      on(canvas, 'pointercancel', function () { down = null; canvas.removeAttribute('data-dragging'); });
    }
    var io = null;
    if (o.autoPause && doc) {
      if (win.IntersectionObserver && container) { io = new win.IntersectionObserver(function (es) { inView = es[0].isIntersecting; sync(); }); io.observe(container); }
      on(doc, 'visibilitychange', sync);
    }
    if (!headless && win.addEventListener) on(win, 'resize', function () { layout(); });

    var api = {
      version: VERSION,
      get shape() { return shape; },
      shapes: names.slice(),
      setShape: setShape,
      // drive facing shapes from a tracked head: {yaw, pitch, roll} in radians, eyes 0…1; null to release
      setPose: function (p) {
        pose = p && isFinite(p.yaw) ? { yaw: +p.yaw || 0, pitch: +p.pitch || 0, roll: +p.roll || 0, eyes: p.eyes == null ? null : Math.max(0, Math.min(1, +p.eyes)) } : null;
        if (p && p.face) api.setFace(p.face); else if (!p) api.setFace(null);
        if (!running && !reduced) return api;
        return api;
      },
      // drive a rigged shape's face: { eyeBlinkL, eyeBlinkR, jawOpen, smileL, smileR, pucker, press,
      // mouthL, mouthR, chinRaise, cheekPuff, squintL, squintR, browUp, browDownL, browDownR } 0…1; null relaxes
      setFace: function (f) {
        var k2;
        for (k2 in FT) FT[k2] = 0;
        if (f) for (k2 in f) { var v = +f[k2]; if (isFinite(v)) { FT[k2] = Math.max(-1, Math.min(1, v)); if (FV[k2] == null) FV[k2] = 0; } }
        faceOn = !!f;
        return api;
      },
      // where a shape-space point is on screen right now, in CSS px within the container (z > 0 is behind)
      project: function (p) { var q = proj3(p, [0, 0, 0]); return { x: q[0], y: q[1], z: q[2] }; },
      // the current shape's named anchors (a shape may declare anchors: { name: [x, y, z] }), projected
      anchors: function () { var a = S[shape].def.anchors, res = {}; if (a) for (var k in a) res[k] = api.project(a[k]); return res; },
      // the field's current orientation in radians, and the shape radius in CSS px
      view: function () { var y = rotY % TAU; if (y > Math.PI) y -= TAU; if (y < -Math.PI) y += TAU; return { yaw: y, pitch: rotX, roll: rotZ, radius: R, x: cx, y: cy }; },
      // drive input without DOM events (workers, game loops, other platforms): type is
      // 'move' | 'down' | 'up' | 'leave' | 'pulse'; x, y in CSS px within the field
      pointer: function (type, x, y) {
        if (type === 'move') pMove(x, y); else if (type === 'down') { pMove(x, y); pDown(x, y); }
        else if (type === 'up') pUp(x, y, false); else if (type === 'leave') pLeave(); else if (type === 'pulse') pulse(x, y);
        return api;
      },
      on: function (name, fn) { (EV[name] || (EV[name] = [])).push(fn); return api; },
      off: function (name, fn) { var l = EV[name]; if (l) for (var q = l.length - 1; q >= 0; q--) if (!fn || l[q] === fn) l.splice(q, 1); return api; },
      // change options live: palette (name or object), autonomy, cycle, pin, depth, quality,
      // fpsFloor, maxDpr, radius, rotation, interactive, autoPause; headless: width, height, dpr, stageRect
      set: function (opts) {
        if (!opts) return api;
        var relayout = false;
        if (opts.palette !== undefined) { o.palette = palette(opts.palette); glowKey = ''; haloKey = ''; }
        if (opts.autonomy !== undefined) AUTO = reduced ? 0 : Math.max(0, Math.min(1, +opts.autonomy || 0));
        if (opts.cycle !== undefined) { o.cycle = +opts.cycle || 0; autoAt = now() + o.cycle; }
        if (opts.pin !== undefined) o.pin = +opts.pin;
        if (opts.depth !== undefined) D = Math.max(1.6, +opts.depth || 2.8);
        if (opts.light !== undefined) { o.light = opts.light; lightRig(o.light); }
        if (opts.surfels !== undefined) o.surfels = !!opts.surfels;
        if (opts.fpsFloor !== undefined) o.fpsFloor = +opts.fpsFloor;
        if (opts.quality !== undefined) { o.quality = opts.quality; level = o.quality === 'low' ? 3 : 0; good = 0; relayout = true; }
        if (opts.rotation !== undefined) {
          var rl = (opts.rotation || names).slice();
          for (var q = 0; q < rl.length; q++) if (names.indexOf(rl[q]) < 0) throw new Error('aurora-field: rotation shape "' + rl[q] + '" is not in shapes');
          cycleList = rl;
        }
        if (opts.interactive !== undefined) { o.interactive = !!opts.interactive; if (!o.interactive) pLeave(); }
        if (opts.autoPause !== undefined) { o.autoPause = !!opts.autoPause; sync(); }
        var lk = ['maxDpr', 'radius', 'width', 'height', 'dpr', 'stageRect'];
        for (q = 0; q < lk.length; q++) if (opts[lk[q]] !== undefined) { o[lk[q]] = opts[lk[q]]; relayout = true; }
        if (relayout) layout();
        if (!running) draw(0);
        return api;
      },
      // manual clock: step the simulation ms forward in fixed frames, then draw once
      advance: function (ms) {
        if (!manual) throw new Error("aurora-field: advance() needs create({ clock: 'manual' })");
        var steps = Math.max(1, Math.round((+ms || 0) / 16.667)), h = (+ms || 0) / steps;
        for (var q = 0; q < steps; q++) { vnow += h; update(h / 1000, vnow); if (EV.frame) emit('frame', vnow); }
        draw(vnow); return api;
      },
      // add shapes to a live field (registered names); they compile on first use
      add: function (list) {
        for (var q = 0; q < (list || []).length; q++) { var nm = list[q]; if (!SHAPES[nm]) throw new Error('aurora-field: unknown shape "' + nm + '"'); if (!S[nm]) { S[nm] = { w: 0, ready: false }; names.push(nm); } }
        return api;
      },
      // compile shapes ahead of use, one per idle slice, so setShape never stalls a frame
      prepare: function (list, done) {
        var q = (list || names).filter(function (nm) { return S[nm] && !S[nm].ready; }), ric = win.requestIdleCallback || function (f) { return setTimeout(f, 16); };
        (function next() { if (destroyed) return; if (!q.length) { if (done) done(); return; } ensure(q.shift()); ric(next); })();
        return api;
      },
      // replay the current shape's trace: the pen draws it again from the start
      trace: function () { shapeAt = now(); traced = null; untr = null; return api; },
      // the reverse: the pen runs back over the drawing and takes it with it (a traced shape only); emits 'untraced'
      untrace: function (ms) { if (S[shape].tr && !reduced) untr = { shape: shape, at: now(), ms: Math.max(1, +ms || 1600) }; return api; },
      // send signals from a point of the current shape (an anchor name or [x, y, z]; default: anywhere)
      signal: function (at, hops, count) {
        var a = typeof at === 'string' ? (S[shape].def.anchors || {})[at] : at, T0 = S[shape].T, adj0 = S[shape].adj, best = -1, bd = 1e9, q;
        if (!adj0) return api;
        if (a) { for (q = 0; q < N; q++) { if (!adj0[q].length) continue; var dx = T0[q * 3] - a[0], dy = T0[q * 3 + 1] - a[1], dz = T0[q * 3 + 2] - a[2], d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = q; } } }
        for (q = 0; q < (count || 1); q++) fire(shape, best >= 0 ? best : Math.floor(Math.random() * N), hops);
        return api;
      },
      next: function () { var ci = cycleList.indexOf(shape); return setShape(cycleList[(ci + 1) % cycleList.length], { pin: true }); },
      play: function () { wanted = true; layout(); sync(); return api; },
      pause: function () { wanted = false; sync(); return api; },
      resize: function (w, h, dpr) { if (w != null) { o.width = w; o.height = h; if (dpr != null) o.dpr = dpr; } layout(); return api; },
      stats: function () { return { fps: fps, nodes: Math.ceil(N / step()), running: running, reduced: reduced, shape: shape, quality: level, scouts: SCOUTS.length, settle: Math.round(settle * 100) / 100, renderer: GLR ? 'webgl' : '2d', headless: headless }; },
      destroy: function () {
        destroyed = true; sync();
        for (var l = 0; l < listeners.length; l++) listeners[l][0].removeEventListener(listeners[l][1], listeners[l][2], listeners[l][3]);
        if (io) io.disconnect();
        if (GLR) GLR.destroy(); else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
      }
    };

    born = now(); shapeAt = born; autoAt = born + o.intro + o.cycle;
    if (gl) {
      GLR = makeGL();
      // the GPU can take the context away (driver reset, too many tabs): pause, then rebuild
      if (canvas.addEventListener) on(canvas, 'webglcontextlost', function (e) { e.preventDefault(); lost = true; sync(); });
      if (canvas.addEventListener) on(canvas, 'webglcontextrestored', function () { GLR = makeGL(); lost = false; layout(); sync(); });
    }
    if (reduced) snap(shape);
    layout();
    sync();
    return api;
  }

  // ---- offload: run the field in a Web Worker on an OffscreenCanvas ----
  // offload(canvas, options, workerUrl) moves rendering and physics off the main thread
  // (workerUrl: dist/aurora-field.worker.js). Returns a field-like handle, or null where
  // OffscreenCanvas isn't supported (call create() instead). Options must be clonable:
  // functions don't cross; pass static shapes as options.shapeData { name: { points } }.
  function offload(canvas, options, url) {
    if (!canvas || !canvas.transferControlToOffscreen || typeof Worker === 'undefined' || !url) return null;
    var win = canvas.ownerDocument.defaultView, doc = canvas.ownerDocument, o = options || {}, clean = {}, k;
    for (k in o) if (Object.prototype.hasOwnProperty.call(o, k) && typeof o[k] !== 'function' && k !== 'container' && k !== 'stage') clean[k] = o[k];
    var container = o.container || canvas.parentNode, stage = o.stage || null, worker = new Worker(url), EV = {}, last = { shape: o.initial || (o.shapes && o.shapes[0]) || null, stats: null };
    function rect() {
      var b = container.getBoundingClientRect(), g = stage ? stage.getBoundingClientRect() : null;
      return { width: b.width, height: b.height, dpr: win.devicePixelRatio || 1, stageRect: g ? { x: g.left - b.left, y: g.top - b.top, width: g.width, height: g.height } : null };
    }
    var r0 = rect(), off = canvas.transferControlToOffscreen();
    clean.width = r0.width; clean.height = r0.height; clean.dpr = r0.dpr; if (r0.stageRect) clean.stageRect = r0.stageRect;
    if (clean.reducedMotion == null || clean.reducedMotion === 'auto') clean.reducedMotion = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
    worker.postMessage({ type: 'init', canvas: off, options: clean }, [off]);
    worker.onmessage = function (e) {
      var m = e.data; if (!m || m.type !== 'event') return;
      if (m.name === 'shape') last.shape = m.data; if (m.name === 'stats') last.stats = m.data; if (m.name === 'pose') last.pose = m.data;
      var cb = { shape: o.onShape, stats: o.onStats, spinout: o.onSpinout }[m.name]; if (cb) cb(m.data);
      var l = EV[m.name]; if (l) for (var q = 0; q < l.length; q++) l[q](m.data);
    };
    function call(method, args) { worker.postMessage({ type: 'call', method: method, args: args }); }
    var listeners = [];
    function on(el, ev, fn) { el.addEventListener(ev, fn); listeners.push([el, ev, fn]); }
    function pos(e) { var b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
    if (o.interactive !== false) {
      on(canvas, 'pointermove', function (e) { var p = pos(e); call('pointer', ['move', p[0], p[1]]); });
      on(canvas, 'pointerdown', function (e) { var p = pos(e); call('pointer', ['down', p[0], p[1]]); });
      on(canvas, 'pointerup', function (e) { var p = pos(e); call('pointer', ['up', p[0], p[1]]); if (e.pointerType === 'touch') call('pointer', ['leave']); });
      on(canvas, 'pointerleave', function () { call('pointer', ['leave']); });
    }
    function resize() { var q = rect(); call('set', [{ width: q.width, height: q.height, dpr: q.dpr, stageRect: q.stageRect }]); }
    var ro = win.ResizeObserver ? new win.ResizeObserver(resize) : null;
    if (ro) ro.observe(container); else on(win, 'resize', resize);
    if (o.autoPause !== false) on(doc, 'visibilitychange', function () { call(doc.hidden ? 'pause' : 'play', []); });
    var api = {
      version: VERSION, offloaded: true, worker: worker,
      get shape() { return last.shape; },
      stats: function () { return last.stats; },
      // the last anchors and view the worker sent (about 30 times a second), for overlays
      anchors: function () { return last.pose ? last.pose.anchors : {}; },
      view: function () { return last.pose ? last.pose.view : null; },
      on: function (n, fn) { (EV[n] || (EV[n] = [])).push(fn); return api; },
      off: function (n, fn) { var l = EV[n]; if (l) for (var q = l.length - 1; q >= 0; q--) if (!fn || l[q] === fn) l.splice(q, 1); return api; },
      destroy: function () { call('destroy', []); for (var q = 0; q < listeners.length; q++) listeners[q][0].removeEventListener(listeners[q][1], listeners[q][2]); if (ro) ro.disconnect(); setTimeout(function () { worker.terminate(); }, 50); }
    };
    var M = ['setShape', 'next', 'play', 'pause', 'setPose', 'set', 'pointer', 'trace', 'untrace', 'signal', 'prepare'];
    for (k = 0; k < M.length; k++) (function (m) { api[m] = function () { call(m, Array.prototype.slice.call(arguments)); return api; }; })(M[k]);
    return api;
  }
  // inside a worker: wire messages to a field (dist/aurora-field.worker.js calls this)
  function serve(scope) {
    var field = null;
    scope.onmessage = function (e) {
      var m = e.data; if (!m) return;
      if (m.type === 'init') {
        var opt = m.options || {}, data = opt.shapeData || {};
        for (var nm in data) register(nm, data[nm]);
        delete opt.shapeData;
        field = create(m.canvas, opt);
        ['shape', 'stats', 'spinout', 'settled', 'traced', 'untraced'].forEach(function (ev) { field.on(ev, function (d) { scope.postMessage({ type: 'event', name: ev, data: d }); }); });
        // overlays on the main thread follow the field: anchors and the view, about 30 times a second
        var lastPose = 0;
        field.on('frame', function (t) { if (t - lastPose < 33) return; lastPose = t; scope.postMessage({ type: 'event', name: 'pose', data: { anchors: field.anchors(), view: field.view() } }); });
        scope.postMessage({ type: 'event', name: 'ready', data: { shape: field.shape, renderer: field.stats().renderer } });
      } else if (m.type === 'call' && field && typeof field[m.method] === 'function') field[m.method].apply(field, m.args || []);
    };
  }

  // pure: build a shape without a canvas (tests, previews, custom renderers)
  function build(name, n, seed) {
    if (!SHAPES[name]) throw new Error('aurora-field: unknown shape "' + name + '"');
    return SHAPES[name](n, rng(seed == null ? 1 : seed));
  }

  // ---- the stage: a story told as data ----
  // stage(canvas, storyboard, opts) plays a storyboard: beats that draw a trade from a blank
  // canvas, show the moment it went wrong (a missed call at 9:47 PM), bring in the AI, fill the
  // drawing with light from the chest, and caption the outcome; and beats that line up the crew.
  // A storyboard is JSON (validate() checks it, schema() describes it), so it can come from a
  // server, an editor or an AI and change while the page is open: load() swaps it at the next beat.
  //   { version: 1, palette?, light?, loop?: true, beats: [
  //       { trade: 'roofer' | { pose, props, action }, draw?: { ms }, moment?: { text, at?, ms? }, ai?: { ms?, text? },
  //         fill?: { from?, ms? }, caption?: { who?, did, metric?: { to, from?, prefix?, suffix?, ms? } }, hold?: ms },
  //       { trade, moment, missed: { text?, ms? }, caption? }   the "before": no AI comes, and the pen takes the drawing back,
  //       { crew: ['contractor', …] | true, caption?, hold? } ] }
  var ANCHORS = ['head', 'chest', 'hand', 'prop', 'feet'];
  var LIMITS = { beats: 12, crew: 8, who: 32, did: 64, moment: 48, prompt: 72, ms: 20000 };
  var BUILDER_BEATS = ['typing', 'prompting', 'agents'];
  function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function present(v) { return v !== undefined && v !== null; }
  function validate(sb, opts) {
    var errs = [], V = vocab(), i;
    function err(path, msg) { errs.push(path + ': ' + msg); }
    function text(path, v, max) {
      if (!present(v)) return;
      if (typeof v !== 'string') return err(path, 'must be text');
      if (v.length > max) err(path, 'is ' + v.length + ' characters; the limit is ' + max);
      if (opts && opts.text) { var m = opts.text(v, path); if (m) err(path, m); }
    }
    function ms(path, v) { if (present(v) && !(typeof v === 'number' && v >= 0 && v <= LIMITS.ms)) err(path, 'must be 0…' + LIMITS.ms + ' ms'); }
    function caption(path, c) {
      if (!present(c)) return;
      if (!isObj(c)) return err(path, 'must be an object');
      text(path + '.who', c.who, LIMITS.who); text(path + '.did', c.did, LIMITS.did);
      if (!present(c.did) && !present(c.who)) err(path, 'needs did or who');
      if (present(c.metric)) {
        var m = c.metric;
        if (!isObj(m) || typeof m.to !== 'number' || !isFinite(m.to)) err(path + '.metric', 'needs a number "to"');
        else { text(path + '.metric.prefix', m.prefix, 8); text(path + '.metric.suffix', m.suffix, 12); ms(path + '.metric.ms', m.ms); }
      }
    }
    function trade(path, t) {
      if (typeof t === 'string') { if (V.trades.indexOf(t) < 0) err(path, 'unknown trade "' + t + '" (known: ' + V.trades.join(', ') + ')'); return; }
      if (!isObj(t)) return err(path, 'must be a trade name or { pose, props, action }');
      if (typeof t.pose === 'string' && V.poses.indexOf(t.pose) < 0) err(path + '.pose', 'unknown pose "' + t.pose + '"');
      if (present(t.props)) { if (!Array.isArray(t.props)) err(path + '.props', 'must be a list'); else t.props.forEach(function (p, k) { if (typeof p === 'string' ? V.props.indexOf(p) < 0 : !(isObj(p) && Array.isArray(p.prims))) err(path + '.props[' + k + ']', 'unknown prop ' + JSON.stringify(p)); }); }
      if (typeof t.action === 'string' && V.actions.indexOf(t.action) < 0) err(path + '.action', 'unknown action "' + t.action + '"');
    }
    if (!isObj(sb)) return { ok: false, errors: ['storyboard: must be an object'] };
    if (sb.version !== 1) err('version', 'must be 1');
    if (present(sb.palette) && typeof sb.palette === 'string' && V.palettes.indexOf(sb.palette) < 0) err('palette', 'unknown palette "' + sb.palette + '"');
    if (!Array.isArray(sb.beats) || !sb.beats.length) err('beats', 'needs at least one beat');
    else if (sb.beats.length > LIMITS.beats) err('beats', 'at most ' + LIMITS.beats);
    else for (i = 0; i < sb.beats.length; i++) {
      var b = sb.beats[i], p = 'beats[' + i + ']';
      if (!isObj(b)) { err(p, 'must be an object'); continue; }
      var isBuilder = present(b.builder) && !present(b.crew);   // crew beats may say builder: true (the builder joins the lineup)
      var kinds = (present(b.trade) ? 1 : 0) + (present(b.crew) ? 1 : 0) + (isBuilder ? 1 : 0);
      if (present(b.crew) && present(b.builder) && b.builder !== true && b.builder !== false) err(p + '.builder', 'on a crew beat, builder is true or false');
      if (kinds !== 1) { err(p, 'needs exactly one of trade, crew or builder'); continue; }
      if (isBuilder) {
        if (BUILDER_BEATS.indexOf(b.builder) < 0) err(p + '.builder', 'must be one of ' + BUILDER_BEATS.join(', '));
        if (present(b.prompt)) { if (!isObj(b.prompt)) err(p + '.prompt', 'must be { text }'); else { text(p + '.prompt.text', b.prompt.text, LIMITS.prompt); ms(p + '.prompt.ms', b.prompt.ms); } }
        if (b.builder === 'agents') {
          if (!Array.isArray(b.agents) || !b.agents.length || b.agents.length > 4) err(p + '.agents', 'needs 1…4 agents');
          else b.agents.forEach(function (a, k) { if (V.agents.indexOf(a) < 0) err(p + '.agents[' + k + ']', 'unknown agent "' + a + '" (known: ' + V.agents.join(', ') + ')'); });
        }
      } else if (present(b.trade)) {
        trade(p + '.trade', b.trade);
        if (present(b.draw)) ms(p + '.draw.ms', b.draw.ms);
        if (present(b.moment)) { text(p + '.moment.text', b.moment.text, LIMITS.moment); ms(p + '.moment.ms', b.moment.ms); if (present(b.moment.at) && ANCHORS.indexOf(b.moment.at) < 0) err(p + '.moment.at', 'must be one of ' + ANCHORS.join(', ')); }
        if (present(b.ai)) { ms(p + '.ai.ms', b.ai.ms); text(p + '.ai.text', b.ai.text, LIMITS.moment); }
        if (present(b.missed)) {
          if (!isObj(b.missed)) err(p + '.missed', 'must be { text?, ms? }');
          else { text(p + '.missed.text', b.missed.text, LIMITS.moment); ms(p + '.missed.ms', b.missed.ms); }
          if (present(b.ai) || present(b.fill)) err(p + '.missed', 'a missed beat has no ai or fill');
        }
        if (present(b.fill)) { ms(p + '.fill.ms', b.fill.ms); if (present(b.fill.from) && ANCHORS.indexOf(b.fill.from) < 0) err(p + '.fill.from', 'must be one of ' + ANCHORS.join(', ')); }
      } else if (b.crew !== true) {
        if (!Array.isArray(b.crew) || !b.crew.length || b.crew.length > LIMITS.crew) err(p + '.crew', 'must be true or 1…' + LIMITS.crew + ' trades');
        else b.crew.forEach(function (t, k) { trade(p + '.crew[' + k + ']', t); });
      }
      caption(p + '.caption', b.caption); ms(p + '.hold', b.hold);
    }
    return { ok: !errs.length, errors: errs };
  }
  // JSON Schema for a storyboard, with today's vocabulary as enums. strict: the shape OpenAI's
  // structured outputs accept (every key required, optional ones nullable, no extra keys).
  function schema(opts) {
    var V = vocab(), strict = opts && opts.strict;
    function obj(props, req) {
      var o = { type: 'object', properties: props, additionalProperties: false };
      if (strict) { o.required = Object.keys(props); for (var k in props) if (!req || req.indexOf(k) < 0) props[k] = nullable(props[k]); }
      else if (req) o.required = req;
      return o;
    }
    function nullable(s) { var c = {}; for (var k in s) c[k] = s[k]; c.type = [].concat(s.type, 'null'); if (c.enum) c.enum = c.enum.concat([null]); return c; }
    var str = function (max) { return { type: 'string', maxLength: max }; }, num = { type: 'number' }, msS = { type: 'number', minimum: 0, maximum: LIMITS.ms };
    var anchor = { type: 'string', enum: ANCHORS }, trade = { type: 'string', enum: V.trades };
    var caption = obj({ who: str(LIMITS.who), did: str(LIMITS.did), metric: obj({ to: num, from: num, prefix: str(8), suffix: str(12), ms: msS }, ['to']) }, ['did']);
    var tradeBeat = obj({ trade: trade, moment: obj({ text: str(LIMITS.moment), at: anchor, ms: msS }, ['text']), ai: obj({ ms: msS, text: str(LIMITS.moment) }), fill: obj({ from: anchor, ms: msS }), missed: obj({ text: str(LIMITS.moment), ms: msS }), caption: caption, hold: msS }, ['trade']);
    var crewBeat = obj({ crew: { type: 'array', items: trade, minItems: 1, maxItems: LIMITS.crew }, builder: { type: 'boolean' }, caption: caption, hold: msS }, ['crew']);
    var builderBeat = obj({ builder: { type: 'string', enum: BUILDER_BEATS }, prompt: obj({ text: str(LIMITS.prompt), code: { type: 'boolean' }, ms: msS }, ['text']), agents: { type: 'array', items: { type: 'string', enum: V.agents }, minItems: 1, maxItems: 4 }, caption: caption, hold: msS }, ['builder']);
    return obj({ version: { type: 'number', enum: [1] }, loop: { type: 'boolean' }, beats: { type: 'array', minItems: 1, maxItems: LIMITS.beats, items: { anyOf: [tradeBeat, crewBeat, builderBeat] } } }, ['version', 'beats']);
  }

  var STAGE_CSS = '.af-hud{position:absolute;inset:0;pointer-events:none;font:500 12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--af-ink,#f4efe6)}' +
    '.af-hud>*{position:absolute;left:0;top:0;opacity:0;transition:opacity .45s ease;will-change:transform}' +
    '.af-hud .af-on{opacity:1}' +
    '.af-moment{display:flex;align-items:center;gap:8px;white-space:nowrap;color:var(--af-alert,#ffb547);text-transform:uppercase;letter-spacing:.12em;font-size:11px}' +
    '.af-moment i{width:12px;height:12px;border-radius:50%;border:2px solid currentColor;flex:none;animation:af-ping 1.1s ease-out infinite}' +
    '@keyframes af-ping{0%{box-shadow:0 0 0 0 currentColor}100%{box-shadow:0 0 0 14px transparent}}' +
    '.af-orb{width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:radial-gradient(circle,#fff 0,var(--af-accent,#7be3c3) 40%,transparent 72%);box-shadow:0 0 22px 6px var(--af-accent,#7be3c3);transition:opacity .4s ease,transform .7s cubic-bezier(.2,.7,.2,1)}' +
    '.af-caption{min-width:180px;max-width:260px;padding:9px 12px;border:1px solid rgba(255,255,255,.12);border-radius:3px;background:rgba(11,11,13,.72);backdrop-filter:blur(6px)}' +
    '.af-caption .af-who{display:flex;align-items:center;gap:7px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.6}' +
    '.af-caption .af-who:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--af-accent,#7be3c3);box-shadow:0 0 8px var(--af-accent,#7be3c3)}' +
    '.af-caption .af-did{margin-top:4px;letter-spacing:.06em;text-transform:uppercase}' +
    '.af-caption .af-metric{display:block;margin-top:2px;font-size:22px;letter-spacing:0;color:var(--af-accent,#7be3c3)}' +
    '.af-crewline{left:50%!important;top:auto!important;bottom:10px;transform:translateX(-50%)!important;letter-spacing:.14em;text-transform:uppercase;font-size:10px;opacity:0}' +
    '.af-prompt{min-width:200px;max-width:300px;padding:9px 12px 10px;border:1px solid rgba(123,227,195,.28);border-radius:4px;background:rgba(8,12,13,.82);backdrop-filter:blur(6px);font-size:12px;color:var(--af-accent,#7be3c3);white-space:pre-wrap;word-break:break-word}' +
    '.af-prompt:before{content:attr(data-head);display:block;margin-bottom:5px;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--af-ink,#f4efe6);opacity:.45}' +
    '.af-prompt b{display:inline-block;width:7px;height:13px;margin-left:2px;vertical-align:-2px;background:currentColor;animation:af-blink 1s steps(1) infinite}' +
    '@keyframes af-blink{50%{opacity:0}}' +
    '.af-chip{padding:3px 8px;border:1px solid rgba(123,227,195,.35);border-radius:999px;background:rgba(8,12,13,.7);color:var(--af-accent,#7be3c3);font-size:10px;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}' +
    '.af-moment.af-gone{color:var(--af-lost,#8d8a86)}.af-moment.af-gone i{animation:none;border-style:dashed}.af-moment.af-gone span{text-decoration:line-through;text-decoration-thickness:1px}' +
    '.af-caption.af-lost{border-color:rgba(255,181,71,.22)}.af-caption.af-lost .af-who:before{background:var(--af-alert,#ffb547);box-shadow:0 0 8px var(--af-alert,#ffb547)}' +
    '.af-orb:after{content:attr(data-label);position:absolute;left:20px;top:-2px;white-space:nowrap;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--af-accent,#7be3c3)}' +
    '@media (prefers-reduced-motion:reduce){.af-moment i,.af-prompt b{animation:none}.af-orb{transition:none}}';
  var cssDone = false;

  function stage(canvas, sb, opts) {
    opts = opts || {};
    var V = validate(sb, opts);
    if (!V.ok) throw new Error('aurora-field: invalid storyboard: ' + V.errors.join('; '));
    var doc = canvas.ownerDocument || null, win = doc && doc.defaultView, headless = !!opts.headless || !doc;
    var host = opts.container || canvas.parentNode;
    var EV = {}, Q = [], now = 0, board = sb, pending = null, idx = -1, seq = 0, focused = null, phase = '', beat = null, shapeName = '', still = false;
    function emit(n, a) { var l = EV[n]; if (l) for (var k = 0; k < l.length; k++) l[k](a); }
    function at(ms, fn) { var my = seq; Q.push({ t: now + ms, fn: function () { if (my === seq) fn(); } }); }
    function shapesFor(b) { return Array.isArray(b.crew) || b.crew === true ? [] : [b.trade]; }
    // every trade the board names, registered as crew:<trade>:line|lit (inline trades get their own names)
    var inline = 0;
    function tradeKey(t) {
      if (typeof t === 'string') { registerCrew(t); return t; }
      var name = 'inline' + (++inline); TRADES[name] = t; registerCrew(name); return name;
    }
    function groupKey(list, withBuilder) {
      var keys = (list === true ? CREW_NAMES : list).map(tradeKey), nm = 'crew:group:' + (withBuilder ? 'builder+' : '') + keys.join('+');
      if (!SHAPES[nm]) register(nm, crewGroup(keys, { builder: withBuilder }));
      return nm;
    }
    function prepare(b0) {
      var names = [];
      b0.beats.forEach(function (b) {
        if (present(b.builder) && !present(b.crew)) { registerBuilder(); if (b.builder === 'agents') { b._g = registerBuilder(b.agents); names.push(b._g); } else names.push('builder:typing:line', 'builder:typing:lit', 'builder:prompting:lit'); }
        else if (present(b.trade)) { b._k = tradeKey(b.trade); names.push('crew:' + b._k + ':line', 'crew:' + b._k + ':lit'); }
        else { b._g = groupKey(b.crew, b.builder === true); names.push(b._g); }
      });
      return names;
    }
    var names = prepare(board), all = names.slice();
    // the field holds every shape any board may need; a board loaded later adds its own via set()
    var fo = { crew: false, blank: true, cycle: 0, seed: opts.seed != null ? opts.seed : 7, stars: opts.stars != null ? opts.stars : 60, autonomy: 0.45,
      palette: board.palette || opts.palette || { preset: 'ranger', signal: [123, 227, 195], head: [200, 255, 236], glow: [62, 143, 122], glow2: [24, 30, 32] },
      light: board.light || opts.light || { ambient: 0.18, key: 1.35, rim: 0.95, spec: 0.8, shine: 14 } };
    ['container', 'stage', 'count', 'radius', 'depth', 'interactive', 'quality', 'renderer', 'reducedMotion', 'clock', 'maxDpr'].forEach(function (k) { if (opts[k] !== undefined) fo[k] = opts[k]; });
    fo.shapes = uniq(all.concat(names)); fo.initial = names[0];
    var field = create(canvas, fo);
    field.prepare(names.slice(0, 4));
    still = field.stats().reduced;

    // the HUD: a moment pulse, the AI orb, the caption; DOM over the canvas unless headless
    var hud = null, el = {};
    if (!headless) {
      if (!cssDone && doc.head && opts.styles !== false) { var st = doc.createElement('style'); st.textContent = STAGE_CSS; doc.head.appendChild(st); cssDone = true; }
      hud = doc.createElement('div'); hud.className = 'af-hud'; hud.setAttribute('aria-hidden', 'true');
      if (win && win.getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.appendChild(hud);
      ['moment', 'orb', 'caption', 'crewline', 'prompt'].forEach(function (k) { var d = doc.createElement('div'); d.className = 'af-' + k; hud.appendChild(d); el[k] = d; });
      el.chips = [];
    }
    var mods = {};   // extra classes per overlay: the moment once it's gone, the caption of a loss
    function show(k, on) { if (el[k]) el[k].className = 'af-' + k + (mods[k] ? ' ' + mods[k] : '') + (on ? ' af-on' : ''); emit('overlay', { el: k, on: !!on }); }
    function place(k, x, y) { if (el[k]) el[k].style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)'; }
    var metric = null, typing = null;
    // the prompt: a terminal over the builder's screen that types itself out
    function typeOut(text, head, ms) {
      typing = { text: text, t0: now, per: Math.max(14, (ms || text.length * 38) / Math.max(1, text.length)), n: -1 };
      if (el.prompt) el.prompt.setAttribute('data-head', head);
      show('prompt', true); emit('prompt', { text: text });
      return typing.per * text.length;
    }
    function chips(labels) {
      if (headless) { emit('chips', labels); return; }
      el.chips.forEach(function (c) { if (c.parentNode) c.parentNode.removeChild(c); }); el.chips = [];
      labels.forEach(function (lb) { var c = doc.createElement('div'); c.className = 'af-chip af-on'; c.textContent = lb; c.style.position = 'absolute'; c.style.left = '0'; c.style.top = '0'; hud.appendChild(c); el.chips.push(c); });
    }
    function setCaption(c) {
      if (!c) { show('caption', false); return; }
      if (el.caption) el.caption.innerHTML = '<span class="af-who"></span><span class="af-did"></span>' + (c.metric ? '<span class="af-metric"></span>' : '');
      if (el.caption) { el.caption.querySelector('.af-who').textContent = c.who || ''; el.caption.querySelector('.af-did').textContent = c.did || ''; }
      metric = c.metric ? { m: c.metric, t0: now } : null;
      show('caption', true); emit('caption', c);
    }
    function anchor(name) { var a = field.anchors(); return a[name] || a.chest || null; }
    var lastT = -1;
    field.on('frame', function (t) {
      // the story's own clock: it stops while the field is paused (pause(), a hidden tab, scrolled away)
      // and picks up where it left off, instead of firing every beat it missed at once
      now += lastT < 0 ? 0 : Math.max(0, Math.min(100, t - lastT)); lastT = t;
      Q.sort(function (a, b) { return a.t - b.t; });
      while (Q.length && Q[0].t <= now) Q.shift().fn();
      if (headless) return;
      var W = host.clientWidth, H = host.clientHeight, lowCap = beat && present(beat.builder) && !present(beat.crew), c = lowCap ? null : anchor('chest');
      if (lowCap) place('caption', 12, Math.max(8, H - (el.caption.offsetHeight || 54) - 14));   // builder beats: the caption sits low, clear of the screen and the agents
      else if (c) {
        var cap = el.caption, x = Math.min(W - (cap.offsetWidth || 200) - 8, Math.max(8, c.x + W * 0.12));
        place('caption', x, Math.max(8, c.y - 24));
      }
      if (beat && beat.moment) {   // right of its anchor; flipped to the left when it would run off the stage
        var m = anchor(beat.moment.at || 'prop'), mw = el.moment.offsetWidth || 160;
        if (m) place('moment', m.x + 10 + mw > W - 8 ? Math.max(8, m.x - 10 - mw) : m.x + 10, m.y - 6);
      }
      var scr = anchor('prop') || anchor('0.prop'), hd = field.anchors().head || field.anchors()['0.head'];
      if (scr && el.prompt) {   // the prompt floats above the builder's head, toward his screen
        var pw = el.prompt.offsetWidth || 220, ph2 = el.prompt.offsetHeight || 60, top = Math.min(scr.y, hd ? hd.y : scr.y);
        place('prompt', Math.min(W - pw - 8, Math.max(8, (hd ? (hd.x + scr.x) / 2 : scr.x) - pw / 2)), Math.max(8, top - ph2 - 14));
      }
      if (el.chips.length) {   // one row per agent, stacked above the highest head, each over its own agent
        var AN = field.anchors(), topY = 1e9;
        for (var ci = 0; ci < el.chips.length; ci++) { var a0 = AN[(ci + 1) + '.head']; if (a0) topY = Math.min(topY, a0.y); }
        for (ci = 0; ci < el.chips.length; ci++) {
          var ah = AN[(ci + 1) + '.head'], cw = el.chips[ci].offsetWidth || 110;
          if (ah) el.chips[ci].style.transform = 'translate3d(' + Math.round(Math.min(W - cw - 6, Math.max(6, ah.x - cw / 2))) + 'px,' + Math.round(topY - 34 - (el.chips.length - 1 - ci) * 28) + 'px,0)';
        }
      }
      if (typing && el.prompt) {
        var nch = Math.min(typing.text.length, Math.floor((now - typing.t0) / typing.per));
        if (nch !== typing.n) { typing.n = nch; el.prompt.innerHTML = ''; el.prompt.appendChild(doc.createTextNode(typing.text.slice(0, nch))); el.prompt.appendChild(doc.createElement('b')); }
      }
      if (metric && el.caption) {
        var mm = metric.m, k = Math.min(1, (now - metric.t0) / (mm.ms || 900)), e = 1 - Math.pow(1 - k, 3), v = (mm.from || 0) + (mm.to - (mm.from || 0)) * e;
        var out = el.caption.querySelector('.af-metric'); if (out) out.textContent = (mm.prefix || '') + (Math.abs(mm.to) >= 10 ? Math.round(v) : v.toFixed(1)) + (mm.suffix || '');
      }
    });
    field.on('traced', function (nm) { if (!beat || nm !== shapeName || phase !== 'draw') return; if (present(beat.builder) && !present(beat.crew)) { if (builderDone) builderDone(); } else afterDraw(); });

    // a lineup (the agents, the crew) is wider than one person: it gets opts.groupRadius when given
    function fit(isGroup) { if (opts.groupRadius && opts.radius) field.set({ radius: isGroup ? opts.groupRadius : opts.radius }); }
    function go(i) {
      seq++; Q.length = 0;
      if (pending) { board = pending; pending = null; prepare(board); emit('load', board); i = 0; }
      if (i >= board.beats.length) { if (board.loop === false) return; i = 0; emit('loop'); }
      if (still) for (var sk = 0; sk < board.beats.length && board.beats[i].missed; sk++) i = (i + 1) % board.beats.length;   // reduced motion holds one beat: never the loss
      idx = i; beat = board.beats[i]; emit('beat', { index: i, beat: beat });
      mods = {}; show('moment', false); show('orb', false); show('crewline', false); show('prompt', false); typing = null; chips([]); setCaption(null);
      fit(present(beat.crew) || beat.builder === 'agents');
      if (present(beat.builder) && !present(beat.crew)) return builderBeat(beat);
      if (present(beat.crew)) {
        phase = 'crew'; emit('phase', { index: i, phase: phase });
        shapeName = beat._g; field.setShape(shapeName, { pin: 1e9, arrive: { from: [0, 0.2, 0], ms: 1400 } }).signal(undefined, 30, 10);
        if (beat.caption) at(900, function () { if (el.crewline) { el.crewline.textContent = beat.caption.did || beat.caption.who || ''; show('crewline', true); } emit('caption', beat.caption); });
        return at(still ? 1e9 : (beat.hold || 4500) + 1400, next);
      }
      if (still) { shapeName = 'crew:' + beat._k + ':lit'; field.setShape(shapeName, { pin: 1e9 }); setCaption(beat.caption); phase = 'hold'; return; }
      phase = 'draw'; emit('phase', { index: i, phase: phase });
      shapeName = 'crew:' + beat._k + ':line'; field.setShape(shapeName, { pin: 1e9 }); field.trace();
      at((beat.draw && beat.draw.ms) || 3200, function () { if (phase === 'draw') afterDraw(); });   // in case the pen's event is missed
    }
    function afterDraw() {
      var b = beat;
      phase = 'moment';
      if (b.moment) {
        emit('phase', { index: idx, phase: phase, text: b.moment.text });
        if (el.moment) el.moment.innerHTML = '<i></i><span></span>', el.moment.querySelector('span').textContent = b.moment.text;
        show('moment', true);
      }
      if (b.missed) return at(b.moment ? (b.moment.ms || 1400) : 0, function () { missed(b); });
      at(b.moment ? (b.moment.ms || 1400) : 0, function () {
        phase = 'ai'; emit('phase', { index: idx, phase: phase });
        var dur = (b.ai && b.ai.ms) || 900, m = anchor((b.moment && b.moment.at) || 'prop'), h = anchor('head');
        if (el.orb && m) { el.orb.setAttribute('data-label', (b.ai && b.ai.text) || 'AI agent'); place('orb', 20, 20); show('orb', true); at(30, function () { place('orb', m.x, m.y); }); at(dur * 0.6, function () { if (h) place('orb', h.x, h.y); }); }
        field.signal('head', 40, 6);
        at(dur, function () {
          phase = 'fill'; emit('phase', { index: idx, phase: phase });
          show('moment', false); show('orb', false);
          shapeName = 'crew:' + b._k + ':lit';
          field.setShape(shapeName, { pin: 1e9, arrive: { from: (b.fill && b.fill.from) || 'chest', ms: (b.fill && b.fill.ms) || 1100 } }).signal('chest', 30, 8);
          at(((b.fill && b.fill.ms) || 1100) * 0.6, function () { phase = 'caption'; emit('phase', { index: idx, phase: phase }); setCaption(b.caption); });
          at(((b.fill && b.fill.ms) || 1100) + (b.hold || 3600), next);
        });
      });
    }
    // the "before": the moment rings out, nobody comes, and the pen runs back over the drawing
    function missed(b) {
      var ums = b.missed.ms || 1800;
      phase = 'missed'; emit('phase', { index: idx, phase: phase, text: b.missed.text });
      if (b.missed.text && el.moment) el.moment.querySelector('span').textContent = b.missed.text;
      mods.moment = 'af-gone'; show('moment', !!b.moment);
      at(500, function () { field.untrace(ums); });
      at(500 + ums * 0.55, function () { mods.caption = 'af-lost'; setCaption(b.caption); });
      at(500 + ums + (b.hold || 2400), next);
    }
    function next() { if (focused) return; go(idx + 1); }
    // builder beats: typing (drawn by the pen, then lit, code on the screen), prompting (the prompt
    // types itself and an agent leaves the screen), agents (the agents at work, threads to the screen)
    function builderBeat(b) {
      var hold = b.hold || 3200;
      phase = b.builder; emit('phase', { index: idx, phase: phase });
      if (b.builder === 'typing') {
        if (still) { shapeName = 'builder:typing:lit'; field.setShape(shapeName, { pin: 1e9 }); setCaption(b.caption); return; }
        shapeName = 'builder:typing:line'; field.setShape(shapeName, { pin: 1e9 }); field.trace(); phase = 'draw';
        var lit = function () {
          if (phase !== 'draw') return; phase = 'typing';
          shapeName = 'builder:typing:lit'; field.setShape(shapeName, { pin: 1e9, arrive: { from: 'prop', ms: 1100 } });
          var dur = b.prompt ? typeOut(b.prompt.text, b.prompt.code === false ? 'prompt' : 'editor', b.prompt.ms) : 0;
          at(600, function () { setCaption(b.caption); });
          at(Math.max(dur + 900, 1100 + hold), next);
        };
        builderDone = lit;
        return at(3600, lit);
      }
      if (b.builder === 'prompting') {
        shapeName = 'builder:prompting:lit'; field.setShape(shapeName, { pin: 1e9, arrive: { from: 'chest', ms: 700 } });
        var d2 = b.prompt ? typeOut('> ' + b.prompt.text, 'prompt', b.prompt.ms) : 0;
        return at(d2 + 500, function () {
          phase = 'ai'; emit('phase', { index: idx, phase: 'ai' });
          var sc = anchor('prop'), W2 = host.clientWidth;
          if (el.orb && sc) { el.orb.setAttribute('data-label', 'AI agent'); place('orb', sc.x, sc.y); show('orb', true); at(40, function () { place('orb', W2 * 0.82, sc.y - 60); }); }
          field.signal('prop', 30, 8);
          at(500, function () { setCaption(b.caption); });
          at(900 + hold, next);
        });
      }
      // agents
      shapeName = b._g; field.setShape(shapeName, { pin: 1e9, arrive: { from: '0.prop', ms: 1500 } });
      at(1300, function () { chips(b.agents.map(function (a) { return (AGENTS[a] && AGENTS[a].label) || a; })); for (var k2 = 1; k2 <= b.agents.length; k2++) field.signal(k2 + '.chest', 20, 3); });
      at(1700, function () { setCaption(b.caption); });
      return at(1500 + hold, next);
    }
    var builderDone = null;

    var api = {
      field: field,
      get storyboard() { return board; }, get index() { return idx; }, get phase() { return phase; },
      // swap in a new storyboard at the next beat (now, if nothing is playing); returns the validation
      load: function (nb) {
        var v = validate(nb, opts); if (!v.ok) return v;
        field.add(prepare(nb));   // trades the field hasn't met yet join it, compiled on first use
        pending = nb; if (idx < 0 || focused) { focused = null; go(0); }
        return v;
      },
      goto: function (i) { focused = null; go(Math.max(0, Math.min(board.beats.length - 1, i | 0))); return api; },
      // show one trade now and hold it (a headline hover); null hands the stage back to the story
      focus: function (t) {
        if (!t) { if (focused) { focused = null; go(idx + 1); } return api; }
        var k = -1; board.beats.forEach(function (b, j) { if (k < 0 && (b.trade === t || b._k === t)) k = j; });
        if (k >= 0) { focused = t; go(k); }   // the beat plays, then holds: next() waits while focused
        return api;
      },
      advance: function (ms) { field.advance(ms); return api; },
      play: function () { field.play(); return api; }, pause: function () { field.pause(); return api; },
      on: function (n, fn) { (EV[n] || (EV[n] = [])).push(fn); return api; },
      off: function (n, fn) { var l = EV[n]; if (l) for (var k = l.length - 1; k >= 0; k--) if (!fn || l[k] === fn) l.splice(k, 1); return api; },
      destroy: function () { seq++; Q.length = 0; field.destroy(); if (hud && hud.parentNode) hud.parentNode.removeChild(hud); }
    };
    function uniq(a) { var o = [], k; for (k = 0; k < a.length; k++) if (o.indexOf(a[k]) < 0) o.push(a[k]); return o; }
    if (still) go(0); else at(0, function () { go(0); });   // the story starts on the first frame, after listeners attach
    return api;
  }

  api0 = {
    version: VERSION, create: create, register: register, build: build, shapes: function () { return ORDER.slice(); }, defaults: DEFAULTS,
    palettes: PALETTES, armour: armour, offload: offload, serve: serve, fromPoints: fromPoints, fromSVG: fromSVG, fromImage: fromImage, fromText: fromText, parsePath: parsePath,
    figure: figure, group: group, registerCrew: registerCrew, crew: CREW_NAMES.slice(), poses: Object.keys(FIG_POSES),
    use: use, vocab: vocab, crewGroup: crewGroup, stage: stage, validate: validate, schema: schema, registerBuilder: registerBuilder, agents: function () { return Object.keys(AGENTS); }, trades: function () { return Object.keys(TRADES); }
  };
  return api0;
});
