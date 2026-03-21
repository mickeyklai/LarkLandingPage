/**
 * Cinematic cracked-glass intro.
 * Pure Canvas 2D + GSAP — no PNG textures, no THREE.js.
 * Seeded RNG ensures the fracture layout is art-directed and identical every load.
 */
(function () {
  'use strict';

  var root = document.getElementById('glass-shatter-root');
  if (!root) return;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof gsap === 'undefined') { root.remove(); return; }

  /* ── Canvas ─────────────────────────────────────────────────────────────── */
  var canvas = document.createElement('canvas');
  var ctx    = canvas.getContext('2d');
  root.appendChild(canvas);
  canvas.style.cssText = 'display:block;position:absolute;inset:0;width:100%;height:100%;';

  var W = 0, H = 0, dpr = 1;

  /* ── Animation state ─────────────────────────────────────────────────────── */
  var S = { time: 0, flashA: 0, shardA: 0, glowM: 1.5 };

  /* ── Reproducible seeded LCG ─────────────────────────────────────────────── */
  function lcg(seed) {
    var s = seed >>> 0;
    return function () {
      s = ((s * 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  var rng = lcg(0xCAFE31);

  /* ── Crack network ───────────────────────────────────────────────────────── */
  var allCracks = [];
  var primaryCracks = [];

  function makePath(x0, y0, angle, length, jitter, nSegs) {
    var pts = [{ x: x0, y: y0 }];
    var a = angle, cx = x0, cy = y0, step = length / nSegs;
    for (var i = 0; i < nSegs; i++) {
      a  += (rng() - 0.5) * jitter;
      cx += Math.cos(a) * step;
      cy += Math.sin(a) * step;
      pts.push({ x: cx, y: cy });
    }
    return pts;
  }

  function pathLen(pts) {
    var l = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
      l += Math.sqrt(dx*dx + dy*dy);
    }
    return l;
  }

  function pointAt(pts, t) {
    var tot = pathLen(pts), tgt = tot * Math.max(0, Math.min(1, t)), acc = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
      var sl = Math.sqrt(dx*dx + dy*dy);
      if (acc + sl >= tgt) {
        var f = (tgt - acc) / sl;
        return { x: pts[i-1].x + dx*f, y: pts[i-1].y + dy*f };
      }
      acc += sl;
    }
    return pts[pts.length-1];
  }

  function buildNetwork() {
    rng = lcg(0xCAFE31);
    allCracks    = [];
    primaryCracks = [];

    var ox = W * 0.500, oy = H * 0.420;
    var span = Math.sqrt(W*W + H*H);

    var defs = [
      { a: -0.20, lf: 0.80 },  /* ENE  – upper right                */
      { a:  0.50, lf: 0.74 },  /* ESE                               */
      { a:  1.05, lf: 0.70 },  /* SSE  – lower right                */
      { a:  1.65, lf: 0.86 },  /* S    – straight down              */
      { a:  2.15, lf: 0.74 },  /* SSW                               */
      { a:  2.72, lf: 0.80 },  /* WSW  – lower left                 */
      { a: -2.65, lf: 0.70 },  /* WNW                               */
      { a: -2.20, lf: 0.70 },  /* NNW  – upper left                 */
      { a: -1.57, lf: 0.84 },  /* N    – straight up                */
      { a: -0.88, lf: 0.70 },  /* NNE  – upper right secondary      */
    ];

    defs.forEach(function (d, i) {
      var ang  = d.a + (rng() - 0.5) * 0.22;
      var len  = span * d.lf;
      var nSeg = 10 + Math.floor(rng() * 6);
      var pts  = makePath(ox, oy, ang, len, 0.20, nSeg);

      var delay = i * 0.028;
      var dur   = 0.44 + rng() * 0.10;

      var crack = {
        pts:   pts,
        len:   pathLen(pts),
        delay: delay,
        dur:   dur,
        w:     1.4 + rng() * 1.0,
        op:    0.55 + rng() * 0.35,
        glow:  3.5  + rng() * 3.5,
        primary: true,
      };
      primaryCracks.push(crack);
      allCracks.push(crack);

      var nb = 1 + Math.floor(rng() * 2);
      for (var b = 0; b < nb; b++) {
        var bt   = 0.28 + rng() * 0.45;
        var bp   = pointAt(pts, bt);
        var ba   = ang + (rng() > 0.5 ? 1 : -1) * (0.48 + rng() * 0.75);
        var bl   = len * (0.15 + rng() * 0.28);
        var bPts = makePath(bp.x, bp.y, ba, bl, 0.35, 4 + Math.floor(rng()*4));
        allCracks.push({
          pts:   bPts,
          len:   pathLen(bPts),
          delay: delay + bt * dur * 0.6,
          dur:   dur * 0.50,
          w:     0.45 + rng() * 0.42,
          op:    0.22 + rng() * 0.22,
          glow:  0,
          primary: false,
        });
      }
    });

    for (var k = 0; k < 6; k++) {
      var ha  = (k / 6) * Math.PI * 2 + rng() * 0.5;
      var hl  = H * 0.050 + rng() * H * 0.045;
      var hPts = makePath(ox, oy, ha, hl, 0.65, 4);
      allCracks.push({
        pts:   hPts,
        len:   pathLen(hPts),
        delay: rng() * 0.06,
        dur:   0.10 + rng() * 0.08,
        w:     0.35,
        op:    0.28,
        glow:  0,
        primary: false,
      });
    }
  }

  /* ── Drawing ─────────────────────────────────────────────────────────────── */
  function tracecrack(crack, eased) {
    var pts = crack.pts;
    var tgt = crack.len * eased;
    var acc = 0;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
      var sl = Math.sqrt(dx*dx + dy*dy);
      if (acc + sl >= tgt) {
        var f = (tgt - acc) / sl;
        ctx.lineTo(pts[i-1].x + dx*f, pts[i-1].y + dy*f);
        return;
      }
      ctx.lineTo(pts[i].x, pts[i].y);
      acc += sl;
    }
  }

  function crackLocalT(crack, time) {
    var lt = (time - crack.delay) / crack.dur;
    if (lt <= 0) return -1;
    return Math.min(lt, 1);
  }

  function easeOut(lt) {
    return 1 - Math.pow(1 - lt, 1.8);
  }

  function drawShards(shardA, time) {
    if (shardA < 0.005 || primaryCracks.length < 2) return;
    var ox = W * 0.500, oy = H * 0.420;
    var span = Math.sqrt(W*W + H*H);
    var n = primaryCracks.length;

    for (var i = 0; i < n; i++) {
      var c1 = primaryCracks[i];
      var c2 = primaryCracks[(i+1) % n];
      if (crackLocalT(c1, time) < 0.5) continue;
      if (crackLocalT(c2, time) < 0.5) continue;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      c1.pts.forEach(function (p) { ctx.lineTo(p.x, p.y); });
      for (var k = c2.pts.length - 1; k >= 0; k--) ctx.lineTo(c2.pts[k].x, c2.pts[k].y);
      ctx.closePath();

      var ci  = i % 3;
      var rgb = ci === 0 ? '205,215,228' : ci === 1 ? '218,215,210' : '200,210,220';
      var g   = ctx.createRadialGradient(ox, oy, 0, ox, oy, span * 0.75);
      g.addColorStop(0,   'rgba(' + rgb + ',0)');
      g.addColorStop(0.4, 'rgba(' + rgb + ',' + (0.038 * shardA).toFixed(3) + ')');
      g.addColorStop(1.0, 'rgba(' + rgb + ',' + (0.022 * shardA).toFixed(3) + ')');

      ctx.globalAlpha = 0.8;
      ctx.fillStyle   = g;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawCracks(time, glowM) {
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    if (glowM > 0) {
      allCracks.forEach(function (crack) {
        if (!crack.primary || crack.glow === 0) return;
        var lt = crackLocalT(crack, time);
        if (lt < 0) return;
        var eased = easeOut(lt);
        var opa = crack.op * Math.min(lt * 4, 1) * 0.16 * glowM;
        if (opa < 0.004) return;

        ctx.save();
        ctx.lineWidth   = crack.w * 3.5;
        ctx.strokeStyle = 'rgba(200,215,255,' + opa.toFixed(3) + ')';
        ctx.shadowBlur  = crack.glow * 1.8;
        ctx.shadowColor = 'rgba(220,235,255,0.55)';
        tracecrack(crack, eased);
        ctx.stroke();
        ctx.restore();
      });
    }

    allCracks.forEach(function (crack) {
      var lt = crackLocalT(crack, time);
      if (lt < 0) return;
      var eased = easeOut(lt);
      var opa = crack.op * Math.min(lt * 5, 1);
      if (opa < 0.005) return;

      ctx.save();
      ctx.lineWidth   = crack.w;
      ctx.strokeStyle = 'rgba(220,226,234,' + opa.toFixed(3) + ')';
      tracecrack(crack, eased);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawImpact(time, glowM) {
    if (time <= 0.005) return;
    var ox = W * 0.500, oy = H * 0.420;
    var a  = Math.min(time * 8, 1) * 0.50 * glowM;
    var r  = 10 + (1 - Math.min(time / 0.45, 1)) * 32;
    ctx.save();
    var g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
    g.addColorStop(0,   'rgba(255,255,255,' + a.toFixed(3) + ')');
    g.addColorStop(0.5, 'rgba(240,244,255,' + (a * 0.28).toFixed(3) + ')');
    g.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFlash(flashA) {
    if (flashA < 0.005) return;
    ctx.save();
    ctx.globalAlpha = flashA * 0.58;
    ctx.fillStyle   = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawShards(S.shardA, S.time);
    drawCracks(S.time, S.glowM);
    drawImpact(S.time, S.glowM);
    drawFlash(S.flashA);
  }

  /* ── Animation timeline ──────────────────────────────────────────────────── */
  function runAnimation() {
    var tl = gsap.timeline({
      onUpdate: render,
    });

    tl.to(S, { flashA: 1,   duration: 0.05, ease: 'none'        },  0.00);
    tl.to(S, { flashA: 0,   duration: 0.20, ease: 'power2.in'   },  0.05);
    tl.to(S, { time: 1.30,  duration: 0.35, ease: 'power2.out'  },  0.00);
    tl.to(S, { shardA: 1,   duration: 0.18, ease: 'power2.out'  },  0.18);
    tl.to(S, { glowM: 0.70, duration: 0.18, ease: 'sine.inOut'  },  0.28);

    tl.to(root, { opacity: 0, duration: 0.50, ease: 'power1.inOut',
      onComplete: function () {
        root.style.display = 'none';
        if (root.parentNode) root.remove();
      }
    }, 0.38);
  }

  /* ── Setup & resize ──────────────────────────────────────────────────────── */
  function setup() {
    W   = window.innerWidth;
    H   = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    buildNetwork();
  }

  window.addEventListener('resize', setup);

  setup();

  if (reducedMotion) {
    if (root.parentNode) root.remove();
  } else {
    runAnimation();
  }

})();
