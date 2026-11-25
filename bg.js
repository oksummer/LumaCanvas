/* 背景特效模块：app.js 每帧以已按 dpr 缩放的 ctx 调用 tick，本模块只在其上叠透明层。
   除自身 save/restore 外不改动任何 canvas 全局状态，也不监听 DOM 事件。 */
(function () {
  'use strict';

  var LIST = [
    { id: 'none', name: '无' },
    { id: 'water', name: '水波纹' },
    { id: 'bokeh', name: '动态光斑' },
    { id: 'flow', name: '流光渐变' },
    { id: 'stars', name: '星空' },
    { id: 'aurora', name: '极光' },
    { id: 'rain', name: '雨滴' },
    { id: 'snow', name: '飘雪' },
    { id: 'network', name: '星点连线' },
    { id: 'hearts', name: '漂浮爱心' },
    { id: 'fish', name: '鱼群游动' },
    { id: 'vine', name: '藤蔓生长' },
    { id: 'matrix', name: '数字雨' }
  ];

  var TAU = Math.PI * 2;
  var cur = 'none';
  var light = false;
  var T = 0;
  var lastW = -1;
  var lastH = -1;
  var st = {};      // 各特效状态，只在 set / 尺寸变化时重建
  var pal;
  var P = { s: 1, n: 1, i: 1 };  // speed/count/intensity 乘数，set 时更新
  function nOf(base) { return Math.max(2, Math.round(base * P.n)); }
  function ka() { return P.i < 1 ? P.i : 1; }  // 强度只加浓度，超过 1 不提亮防过曝
  function pnum(v) { return typeof v === 'number' && isFinite(v) ? Math.min(3, Math.max(0.3, v)) : 1; }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // 调色板在 set 时一次定好，避免每帧根据 light 分支拼色值
  function setPalette() {
    pal = light ? {
      wave: '18,76,148', drop: '34,74,124', flake: '74,94,124',
      star: '34,44,64', node: '26,42,64', meteor: '14,24,44',
      bokeh: ['24,54,124', '104,34,124', '14,94,94', '124,68,14'],
      bokehA: 0.30 * ka(), flowA: 0.45 * ka(), flowS: 52, flowL: 33,
      aurA: 0.32 * ka(), aurS: 52, aurL: 36,
      heart: '150,20,52',
      fish: ['20,50,80', '40,30,70', '20,64,64', '70,40,24', '36,54,36', '58,28,44'],
      vine: '22,80,38', mtrx: '10,110,44'
    } : {
      wave: '148,204,255', drop: '178,216,255', flake: '236,246,255',
      star: '255,255,255', node: '234,244,255', meteor: '255,255,255',
      bokeh: ['124,184,255', '255,154,224', '154,255,224', '255,228,144'],
      bokehA: 0.22 * ka(), flowA: 0.55 * ka(), flowS: 74, flowL: 58,
      aurA: 0.38 * ka(), aurS: 70, aurL: 60,
      heart: '242,90,124',
      fish: ['255,170,80', '120,200,255', '255,120,170', '140,240,160', '255,220,120', '190,150,255'],
      vine: '96,220,110', mtrx: '70,255,110'
    };
  }
  setPalette();

  /* ---------------- 水波纹 ---------------- */

  function initWater(w, h) {
    var layers = [];
    for (var i = 0; i < nOf(5); i++) {
      layers.push({
        yf: 0.14 + i * 0.18 + rnd(-0.03, 0.03),
        amp: (rnd(5, 9) + i * 2.5) * P.i,
        len: rnd(90, 160) + i * 60,
        sp: rnd(0.18, 0.34) * (i % 2 ? -1 : 1),
        ph: rnd(0, TAU),
        a: (0.10 + i * 0.025) * ka()
      });
    }
    var ripples = [];
    for (var j = 0; j < nOf(3); j++) ripples.push(newRipple(w, h));
    st.water = { layers: layers, ripples: ripples };
  }

  function newRipple(w, h) {
    return {
      x: rnd(w * 0.1, w * 0.9), y: rnd(h * 0.15, h * 0.9),
      r: rnd(2, 10), max: rnd(60, 150), sp: rnd(28, 60)
    };
  }

  function drawWater(ctx, w, h, dt) {
    var s = st.water, i, L, R, x, y, step, k;
    ctx.save();
    ctx.lineWidth = 1.5 * P.i;
    ctx.strokeStyle = 'rgba(' + pal.wave + ',1)';
    step = Math.max(8, w / 36);
    for (i = 0; i < s.layers.length; i++) {
      L = s.layers[i];
      ctx.globalAlpha = L.a;
      ctx.beginPath();
      for (x = 0; x <= w + step; x += step) {
        y = h * L.yf + Math.sin(x / L.len * TAU + T * L.sp + L.ph) * L.amp;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (i = 0; i < s.ripples.length; i++) {
      R = s.ripples[i];
      R.r += R.sp * dt;
      if (R.r > R.max) {
        R.x = rnd(w * 0.1, w * 0.9); R.y = rnd(h * 0.15, h * 0.9);
        R.r = rnd(2, 10); R.max = rnd(60, 150); R.sp = rnd(28, 60);
      }
      k = 1 - R.r / R.max;
      ctx.globalAlpha = 0.5 * k * ka();
      ctx.beginPath(); ctx.arc(R.x, R.y, R.r * P.i, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.3 * k * ka();
      ctx.beginPath(); ctx.arc(R.x, R.y, R.r * 0.6 * P.i, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- 动态光斑 ---------------- */

  function initBokeh(w, h) {
    var arr = [];
    for (var i = 0; i < nOf(14); i++) {
      arr.push({
        x: rnd(0, w), y: rnd(0, h),
        vx: rnd(-14, 14), vy: rnd(-12, 12),
        r: rnd(30, 80) * P.i,
        c: pal.bokeh[i % pal.bokeh.length],
        a: rnd(0.5, 1) * pal.bokehA,
        bs: rnd(0.4, 1.1), bp: rnd(0, TAU)
      });
    }
    st.bokeh = arr;
  }

  function drawBokeh(ctx, w, h, dt) {
    var arr = st.bokeh, i, b, a, g;
    ctx.save();
    ctx.globalAlpha = 1;
    for (i = 0; i < arr.length; i++) {
      b = arr[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      // 出没：飘出边界后从对侧重入，保证数量恒定
      if (b.x < -b.r) b.x = w + b.r; else if (b.x > w + b.r) b.x = -b.r;
      if (b.y < -b.r) b.y = h + b.r; else if (b.y > h + b.r) b.y = -b.r;
      a = b.a * (0.6 + 0.4 * Math.sin(T * b.bs + b.bp));
      g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, 'rgba(' + b.c + ',' + a + ')');
      g.addColorStop(1, 'rgba(' + b.c + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------- 流光渐变 ---------------- */

  function initFlow(w, h) {
    var hues = [210, 285, 160, 32, 335];
    var arr = [];
    for (var i = 0; i < nOf(5); i++) {
      arr.push({
        xf: rnd(0.15, 0.85), yf: rnd(0.15, 0.85),
        dr: rnd(0.12, 0.26), sp: rnd(0.05, 0.13) * (i % 2 ? -1 : 1),
        ph: rnd(0, TAU), rf: rnd(0.35, 0.6),
        hue: hues[i % hues.length], hs: rnd(2, 6) * (i % 2 ? -1 : 1)
      });
    }
    st.flow = arr;
  }

  function drawFlow(ctx, w, h) {
    var arr = st.flow, i, b, cx, cy, r, hue, g;
    var R = Math.max(w, h);
    ctx.save();
    ctx.globalAlpha = 1;
    for (i = 0; i < arr.length; i++) {
      b = arr[i];
      cx = w * b.xf + Math.sin(T * b.sp + b.ph) * w * b.dr;
      cy = h * b.yf + Math.cos(T * b.sp * 0.8 + b.ph) * h * b.dr;
      r = R * b.rf * P.i;
      hue = (b.hue + T * b.hs) % 360;
      if (hue < 0) hue += 360;
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'hsla(' + hue + ',' + pal.flowS + '%,' + pal.flowL + '%,' + pal.flowA + ')');
      g.addColorStop(1, 'hsla(' + hue + ',' + pal.flowS + '%,' + pal.flowL + '%,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------- 星空 ---------------- */

  function initStars(w, h) {
    var arr = [];
    for (var i = 0; i < nOf(70); i++) {
      arr.push({
        x: rnd(0, w), y: rnd(0, h), r: rnd(0.4, 1.7) * P.i,
        ph: rnd(0, TAU), sp: rnd(1, 3.6), a: rnd(0.35, 1) * ka()
      });
    }
    st.stars = { list: arr, m: { on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0 } };
  }

  function drawStars(ctx, w, h, dt) {
    var s = st.stars, arr = s.list, m = s.m, i, a;
    ctx.save();
    ctx.fillStyle = 'rgba(' + pal.star + ',1)';
    for (i = 0; i < arr.length; i++) {
      a = arr[i].a * (0.45 + 0.55 * Math.sin(T * arr[i].sp + arr[i].ph));
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(arr[i].x, arr[i].y, arr[i].r, 0, TAU);
      ctx.fill();
    }
    if (!m.on && Math.random() < dt * 0.05) {
      m.on = true;
      m.x = Math.random() < 0.5 ? rnd(w * 0.3, w) : rnd(0, w * 0.7);
      m.y = rnd(0, h * 0.3);
      m.vx = (Math.random() < 0.5 ? -1 : 1) * rnd(250, 500);
      m.vy = rnd(450, 750);
      m.t = rnd(0.7, 1.3);
    }
    if (m.on) {
      m.x += m.vx * dt; m.y += m.vy * dt; m.t -= dt;
      if (m.t <= 0 || m.x < -60 || m.x > w + 60 || m.y > h + 60) {
        m.on = false;
      } else {
        a = Math.min(1, m.t * 2.5);
        ctx.strokeStyle = 'rgba(' + pal.meteor + ',1)';
        ctx.lineWidth = 4 * P.i;
        ctx.globalAlpha = 0.18 * a * ka();
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.vx * 0.07, m.y - m.vy * 0.07);
        ctx.stroke();
        ctx.lineWidth = 1.6 * P.i;
        ctx.globalAlpha = 0.85 * a * ka();
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.vx * 0.04, m.y - m.vy * 0.04);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ---------------- 极光 ---------------- */

  var AUR = [
    { xf: 0.18, wf: 0.34, sp: 0.13, ph: 0.0, hue: 138, a: 0.95 },
    { xf: 0.42, wf: 0.30, sp: -0.10, ph: 2.1, hue: 168, a: 0.85 },
    { xf: 0.66, wf: 0.32, sp: 0.09, ph: 4.2, hue: 196, a: 0.8 },
    { xf: 0.86, wf: 0.30, sp: -0.12, ph: 1.3, hue: 288, a: 0.75 }
  ];

  function drawAurora(ctx, w, h) {
    var i, k, x, y, x0, bw, amp, g, ph;
    var step = Math.max(8, h / 28);
    ctx.save();
    ctx.globalAlpha = 1;
    for (i = 0; i < nOf(AUR.length); i++) {
      k = AUR[i % AUR.length];
      x0 = w * k.xf + Math.sin(T * k.sp + k.ph) * w * 0.1;
      bw = w * k.wf * P.i;
      amp = w * 0.06 * P.i;
      ph = T * k.sp * 2 + k.ph;
      ctx.beginPath();
      for (y = 0; y <= h + step; y += step) {
        x = x0 + Math.sin(y * 0.014 + ph) * amp;
        if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (y = h + step; y >= 0; y -= step) {
        ctx.lineTo(x0 + bw + Math.sin(y * 0.014 + ph + 1.2) * amp * 0.7, y);
      }
      ctx.closePath();
      // 横向渐变让光带两侧融进背景，避免硬边
      g = ctx.createLinearGradient(x0 - amp, 0, x0 + bw + amp, 0);
      g.addColorStop(0, 'hsla(' + k.hue + ',' + pal.aurS + '%,' + pal.aurL + '%,0)');
      g.addColorStop(0.5, 'hsla(' + k.hue + ',' + pal.aurS + '%,' + pal.aurL + '%,' + (pal.aurA * k.a) + ')');
      g.addColorStop(1, 'hsla(' + k.hue + ',' + pal.aurS + '%,' + pal.aurL + '%,0)');
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------- 雨滴 ---------------- */

  function initRain(w, h) {
    var drops = [];
    for (var i = 0; i < nOf(80); i++) {
      drops.push({
        x: rnd(-40, w), y: rnd(-h, h),
        v: rnd(520, 950), len: rnd(10, 24) * P.i, a: rnd(0.2, 0.6) * ka()
      });
    }
    var pool = [];
    for (var j = 0; j < nOf(14); j++) pool.push({ x: 0, y: 0, life: 0 });
    st.rain = { drops: drops, pool: pool };
  }

  function drawRain(ctx, w, h, dt) {
    var s = st.rain, d = s.drops, pool = s.pool, i, j, sp, k;
    ctx.save();
    ctx.strokeStyle = 'rgba(' + pal.drop + ',1)';
    ctx.lineWidth = 1.2 * P.i;
    for (i = 0; i < d.length; i++) {
      d[i].y += d[i].v * dt;
      d[i].x += d[i].v * dt * 0.28;
      if (d[i].y > h) {
        // 触底：留一个短溅圈后从顶部随机重生
        for (j = 0; j < pool.length; j++) {
          if (pool[j].life <= 0) {
            pool[j].x = d[i].x; pool[j].y = h - 2; pool[j].life = 0.35;
            break;
          }
        }
        d[i].y = -d[i].len - rnd(0, h * 0.3);
        d[i].x = rnd(-40, w);
      } else if (d[i].x > w + 40) {
        d[i].x = -30;
      }
      ctx.globalAlpha = d[i].a;
      ctx.beginPath();
      ctx.moveTo(d[i].x, d[i].y);
      ctx.lineTo(d[i].x - d[i].len * 0.28, d[i].y - d[i].len);
      ctx.stroke();
    }
    ctx.lineWidth = 1.4 * P.i;
    for (j = 0; j < pool.length; j++) {
      sp = pool[j];
      if (sp.life > 0) {
        sp.life -= dt;
        k = sp.life > 0 ? sp.life / 0.35 : 0;
        ctx.globalAlpha = 0.5 * k * ka();
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, ((1 - k) * 15 + 2) * P.i, Math.PI, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ---------------- 飘雪 ---------------- */

  function initSnow(w, h) {
    var arr = [];
    for (var i = 0; i < nOf(60); i++) {
      arr.push({
        x: rnd(0, w), y: rnd(-10, h), r: rnd(1.6, 5) * P.i,
        v: rnd(18, 62), amp: rnd(8, 34), fr: rnd(0.4, 1.4),
        ph: rnd(0, TAU), rot: rnd(0, TAU), rs: rnd(-1.6, 1.6),
        a: rnd(0.35, 0.95) * ka()
      });
    }
    st.snow = arr;
  }

  function drawSnow(ctx, w, h, dt) {
    var arr = st.snow, i, f, r;
    ctx.save();
    ctx.strokeStyle = 'rgba(' + pal.flake + ',1)';
    ctx.lineWidth = P.i;
    for (i = 0; i < arr.length; i++) {
      f = arr[i];
      f.y += f.v * dt;
      f.x += Math.cos(T * f.fr + f.ph) * f.amp * f.fr * dt;
      f.rot += f.rs * dt;
      if (f.y > h + 6) { f.y = -6; f.x = rnd(0, w); }
      if (f.x < -8) f.x = w + 8; else if (f.x > w + 8) f.x = -8;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.globalAlpha = f.a;
      r = f.r;
      ctx.beginPath();
      ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
      ctx.moveTo(r * 0.5, r * 0.87); ctx.lineTo(-r * 0.5, -r * 0.87);
      ctx.moveTo(r * 0.5, -r * 0.87); ctx.lineTo(-r * 0.5, r * 0.87);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------------- 星点连线 ---------------- */

  function initNetwork(w, h) {
    var arr = [];
    for (var i = 0; i < nOf(40); i++) {
      arr.push({
        x: rnd(6, w - 6), y: rnd(6, h - 6),
        vx: rnd(-18, 18), vy: rnd(-18, 18)
      });
    }
    st.network = arr;
  }

  function drawNetwork(ctx, w, h, dt) {
    var arr = st.network, i, j, n, dx, dy, d;
    var D = 110, D2 = D * D;
    ctx.save();
    ctx.lineWidth = P.i;
    ctx.strokeStyle = 'rgba(' + pal.node + ',1)';
    for (i = 0; i < arr.length; i++) {
      n = arr[i];
      n.x += n.vx * dt; n.y += n.vy * dt;
      if (n.x < 6) { n.x = 6; n.vx = -n.vx; }
      else if (n.x > w - 6) { n.x = w - 6; n.vx = -n.vx; }
      if (n.y < 6) { n.y = 6; n.vy = -n.vy; }
      else if (n.y > h - 6) { n.y = h - 6; n.vy = -n.vy; }
    }
    for (i = 0; i < arr.length; i++) {
      for (j = i + 1; j < arr.length; j++) {
        dx = arr[i].x - arr[j].x;
        dy = arr[i].y - arr[j].y;
        d = dx * dx + dy * dy;
        if (d < D2) {
          ctx.globalAlpha = (1 - Math.sqrt(d) / D) * 0.5 * ka();
          ctx.beginPath();
          ctx.moveTo(arr[i].x, arr[i].y);
          ctx.lineTo(arr[j].x, arr[j].y);
          ctx.stroke();
        }
      }
    }
    ctx.fillStyle = 'rgba(' + pal.node + ',1)';
    for (i = 0; i < arr.length; i++) {
      n = arr[i];
      ctx.globalAlpha = 0.14 * ka();
      ctx.beginPath();
      ctx.arc(n.x, n.y, 6 * P.i, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.95 * ka();
      ctx.beginPath();
      ctx.arc(n.x, n.y, 2.2 * P.i, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------- 漂浮爱心 ---------------- */

  function initHearts(w, h) {
    var arr = [];
    for (var i = 0; i < nOf(14); i++) {
      arr.push({
        x: rnd(0, w), y: rnd(0, h * 1.4),
        vy: rnd(18, 42), amp: rnd(10, 30), fr: rnd(0.3, 0.8),
        ph: rnd(0, TAU), rot: rnd(-0.35, 0.35), rf: rnd(0.4, 1),
        s: rnd(8, 22) * P.i, a: rnd(0.25, 0.6) * ka()
      });
    }
    st.hearts = arr;
  }

  function drawHearts(ctx, w, h, dt) {
    var arr = st.hearts, i, f, t, x, y, k, s;
    ctx.save();
    ctx.fillStyle = 'rgba(' + pal.heart + ',1)';
    for (i = 0; i < arr.length; i++) {
      f = arr[i];
      f.y -= f.vy * dt;
      if (f.y < -f.s * 2) { f.y = h + f.s * 2; f.x = rnd(0, w); }
      x = f.x + Math.sin(T * f.fr + f.ph) * f.amp;
      s = f.s / 16;
      ctx.save();
      ctx.translate(x, f.y);
      ctx.rotate(f.rot + Math.sin(T * f.rf + f.ph) * 0.15);
      ctx.scale(s, s);
      ctx.globalAlpha = f.a;
      // 心形参数方程 x=16sin³t, y=13cost-5cos2t-2cos3t-cos4t
      ctx.beginPath();
      for (t = 0; t <= TAU + 0.01; t += TAU / 18) {
        k = 16 * Math.pow(Math.sin(t), 3);
        y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        if (t === 0) ctx.moveTo(k, y); else ctx.lineTo(k, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------------- 鱼群游动 ---------------- */

  function initFish(w, h) {
    var arr = [];
    for (var i = 0; i < nOf(6); i++) {
      arr.push({
        x: rnd(0, w), y: rnd(h * 0.12, h * 0.88),
        dir: Math.random() < 0.5 ? -1 : 1,
        v: rnd(20, 50), s: rnd(11, 20) * P.i,
        wf: rnd(1.6, 3.2), ph: rnd(0, TAU),
        ba: rnd(6, 20), bf: rnd(0.3, 0.9),
        c: pal.fish[i % pal.fish.length]
      });
    }
    st.fish = arr;
  }

  function drawFish(ctx, w, h, dt) {
    var arr = st.fish, i, f, y, wag, s;
    ctx.save();
    for (i = 0; i < arr.length; i++) {
      f = arr[i];
      f.x += f.dir * f.v * dt;
      // 碰壁转向；朝向镜像用 scale(dir,1)，尾鳍摆动相位不翻转
      if (f.x < f.s * 2) { f.x = f.s * 2; f.dir = 1; }
      else if (f.x > w - f.s * 2) { f.x = w - f.s * 2; f.dir = -1; }
      y = f.y + Math.sin(T * f.bf + f.ph) * f.ba;
      wag = Math.sin(T * f.wf + f.ph) * 0.55;
      s = f.s;
      ctx.save();
      ctx.translate(f.x, y);
      ctx.scale(f.dir, 1);
      ctx.globalAlpha = 0.9 * ka();
      ctx.fillStyle = 'rgba(' + f.c + ',1)';
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, 0);
      ctx.lineTo(-s * 1.8, s * 0.5 + wag * s);
      ctx.lineTo(-s * 1.8, -s * 0.5 + wag * s);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------------- 藤蔓生长 ---------------- */

  function initVine(w, h) {
    var arr = [], n = nOf(4 + (Math.random() < 0.5 ? 0 : 1)), i;
    for (i = 0; i < n; i++) {
      arr.push({
        x: (i + 0.5 + rnd(-0.18, 0.18)) * w / n,
        amp: rnd(12, 34), fr: rnd(0.12, 0.3), ph: rnd(0, TAU),
        target: rnd(0.6, 0.8), grow: 0, gsp: rnd(0.1, 0.18)
      });
    }
    st.vine = arr;
  }

  function drawVine(ctx, w, h, dt) {
    var arr = st.vine, i, V, len, y, x, s, side, j;
    ctx.save();
    ctx.strokeStyle = 'rgba(' + pal.vine + ',1)';
    ctx.lineWidth = 2.5 * P.i;
    ctx.fillStyle = 'rgba(' + pal.vine + ',1)';
    for (i = 0; i < arr.length; i++) {
      V = arr[i];
      if (V.grow < 1) { V.grow += V.gsp * dt; if (V.grow > 1) V.grow = 1; }
      len = V.target * h * V.grow;
      ctx.beginPath();
      for (y = 0; ; y += 8) {
        if (y > len) y = len;
        x = V.x + Math.sin(y * 0.012 + T * V.fr + V.ph) * V.amp * (0.3 + 0.7 * y / (len || 1));
        if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        if (y === len) break;
      }
      ctx.stroke();
      for (j = 40, side = 1; j < len; j += 55, side = -side) {
        x = V.x + Math.sin(j * 0.012 + T * V.fr + V.ph) * V.amp * (0.3 + 0.7 * j / len);
        s = (6 + (j % 3) * 2) * (1 + 0.12 * Math.sin(T * 1.2 + j + V.ph)) * P.i;
        ctx.save();
        ctx.translate(x, j);
        ctx.rotate(side * 0.7);
        ctx.globalAlpha = 0.85 * ka();
        ctx.beginPath();
        ctx.ellipse(side * s * 0.9, 0, s, s * 0.5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /* ---------------- 数字雨 ---------------- */

  var MCH = '01ｱｳｼｴｵｶｷｹｺｻｽﾀﾂﾁﾃﾅﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ:.-=';
  function mChar() { return MCH.charAt(Math.floor(Math.random() * MCH.length)); }

  function initMatrix(w, h) {
    var n = nOf(18 + Math.floor(rnd(0, 5)));
    var cellH = 14 * P.i;
    var trail = Math.max(6, Math.min(24, Math.ceil(h / cellH)));
    var cols = [], i, j, chars;
    for (i = 0; i < n; i++) {
      chars = [];
      for (j = 0; j < trail; j++) chars.push(mChar());
      cols.push({
        x: (i + 0.5) * w / n, v: rnd(60, 160),
        y: rnd(-h, h), delay: 0, chars: chars
      });
    }
    st.matrix = { cols: cols, cellH: cellH, trail: trail };
  }

  function drawMatrix(ctx, w, h, dt) {
    var s = st.matrix, cols = s.cols, i, j, C, cy, a;
    ctx.save();
    ctx.font = Math.round(12 * P.i) + 'px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(' + pal.mtrx + ',1)';
    for (i = 0; i < cols.length; i++) {
      C = cols[i];
      if (C.delay > 0) {
        C.delay -= dt;
        if (C.delay <= 0) C.y = -rnd(0, h * 0.6);
      } else {
        C.y += C.v * dt;
        if (C.y - s.trail * s.cellH > h) C.delay = rnd(0.3, 2);
      }
      if (Math.random() < dt * 3) C.chars[Math.floor(rnd(0, s.trail))] = mChar();
      if (C.delay > 0) continue;
      for (j = 0; j < s.trail; j++) {
        cy = C.y - j * s.cellH;
        if (cy < -s.cellH || cy > h + s.cellH) continue;
        a = (j === 0 ? 0.95 : 0.8 * (1 - j / s.trail) * (1 - j / s.trail)) * ka();
        ctx.globalAlpha = a;
        ctx.fillText(C.chars[j], C.x, cy);
      }
    }
    ctx.restore();
  }

  /* ---------------- 调度 ---------------- */

  var inits = {
    water: initWater, bokeh: initBokeh, flow: initFlow, stars: initStars,
    rain: initRain, snow: initSnow, network: initNetwork,
    hearts: initHearts, fish: initFish, vine: initVine, matrix: initMatrix
    // aurora 全部按比例计算，无需按尺寸建状态
  };

  var draws = {
    water: drawWater, bokeh: drawBokeh, flow: drawFlow, stars: drawStars,
    aurora: drawAurora, rain: drawRain, snow: drawSnow, network: drawNetwork,
    hearts: drawHearts, fish: drawFish, vine: drawVine, matrix: drawMatrix
  };

  function set(id, opts) {
    cur = 'none';
    for (var i = 0; i < LIST.length; i++) {
      if (LIST[i].id === id) { cur = id; break; }
    }
    light = !!(opts && opts.light);
    var p = (opts && opts.params) || {};
    P.s = pnum(p.speed); P.n = pnum(p.count); P.i = pnum(p.intensity);
    setPalette();
    lastW = -1;  // 强制下一帧按新特效（和新配色）重建状态
    lastH = -1;
  }

  function tick(ctx, dt) {
    ctx.clearRect(0, 0, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    var w = ctx.canvas.clientWidth, h = ctx.canvas.clientHeight;
    if (w < 1 || h < 1) return;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.05) dt = 0.05;
    dt *= P.s;  // speed 统一放大时间步：速率与闪烁/摆动频率同步变化
    T += dt;
    if (w !== lastW || h !== lastH) {
      lastW = w; lastH = h;
      if (inits[cur]) inits[cur](w, h);
    }
    if (draws[cur]) draws[cur](ctx, w, h, dt);
  }

  window.BgFx = { list: LIST, set: set, tick: tick };
})();
