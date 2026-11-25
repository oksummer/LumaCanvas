/* 小米浏览器互动应用 —— 点击特效模块。零依赖、非 module。
   坐标系为 CSS 像素（app.js 已做 dpr 缩放）；app.js 每帧调 tick，点击时调 spawn。 */
window.Fx = (function () {
  'use strict';

  var MAX = 900;
  var P = [];
  var TAU = 6.283185307;

  var BRIGHT = ['#ff5f7e', '#4dd0ff', '#7cff6b', '#ffd166', '#c084fc', '#ff9f43'];
  var DEEP = ['#c81e4b', '#0b5ed7', '#1a7f37', '#a16207', '#7c3aed', '#b45309'];
  var PINK_BRIGHT = ['#ff4d88', '#ff2d78', '#ff7aa8', '#e63970'];
  var PINK_DEEP = ['#be123c', '#9f1239', '#db2777', '#a21caf'];
  var FIRE_BRIGHT = ['#ff9f43', '#ffd166', '#f97316', '#fbbf24'];
  var FIRE_DEEP = ['#c2410c', '#a16207', '#b45309', '#92400e'];

  var list = [
    { id: 'none', name: '无' },
    { id: 'fireworks', name: '烟花' },
    { id: 'fireripple', name: '烟花波纹' },
    { id: 'explosion', name: '爆炸' },
    { id: 'hearts', name: '爱心' },
    { id: 'text', name: '文字' },
    { id: 'confetti', name: '彩带' },
    { id: 'sparkle', name: '闪粉' },
    { id: 'bubble', name: '泡泡' },
    { id: 'ripple', name: '水波' },
    { id: 'snow', name: '雪花' }
  ];

  // 滑动轨迹特效：轻量、短寿命，避免拖动时粒子堆积
  var swipeList = [
    { id: 'none', name: '无' },
    { id: 'flower', name: '花朵' },
    { id: 'star', name: '星光' },
    { id: 'heart', name: '爱心' },
    { id: 'bubble', name: '泡泡' }
  ];

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function rgba(rgb, a) { return 'rgba(' + rgb + ',' + a + ')'; }

  // 每效果定制设置项：range 是倍率语义，数值越界先 clamp [min,max]，模块再兜底 [0.3,3]
  function R(key, name) { return { key: key, name: name, type: 'range', min: 0.5, max: 2, step: 0.1, def: 1 }; }
  var TXT = { key: 'text', name: '文字内容', type: 'text', def: '嗨', max: 6 };

  var SPECS = {
    none: [],
    fireworks: [R('speed', '绽放速度'), R('count', '火星数量'), R('size', '火星大小')],
    fireripple: [R('speed', '扩散速度'), R('count', '火星数量'), R('size', '大小')],
    explosion: [R('speed', '爆发速度'), R('count', '碎块数量'), R('size', '碎块大小')],
    hearts: [R('speed', '上浮速度'), R('count', '爱心数量'), R('size', '爱心大小')],
    text: [TXT, R('speed', '上浮速度'), R('size', '字号')],
    confetti: [R('speed', '抛洒速度'), R('count', '纸屑数量'), R('size', '纸屑大小')],
    sparkle: [R('speed', '扩散速度'), R('count', '星星数量'), R('size', '星星大小')],
    bubble: [R('speed', '上浮速度'), R('count', '泡泡数量'), R('size', '泡泡大小')],
    ripple: [R('speed', '扩散速度'), R('count', '圈数'), R('size', '最大半径')],
    snow: [R('speed', '喷洒速度'), R('count', '雪花数量'), R('size', '雪花大小')]
  };
  // 滑动特效同构：消散速度、每点密度、大小
  var SWIPE_SPEC = [R('speed', '消散速度'), R('count', '密度'), R('size', '大小')];
  var SW_SPECS = { none: [], flower: SWIPE_SPEC, star: SWIPE_SPEC, heart: SWIPE_SPEC, bubble: SWIPE_SPEC };

  function paramSpec(id) { return SPECS[id] || []; }
  function swipeSpec(id) { return SW_SPECS[id] || []; }

  var CUR = null; // 本次 spawn 的归一化参数；tick 里 popBurst 补的粒子必须不受影响，故 spawn 结束即清空
  function setPrm(spec, opts) {
    var m = (opts && opts.params) || {}, i, it, v;
    CUR = {};
    for (i = 0; i < spec.length; i++) {
      it = spec[i];
      v = m[it.key];
      if (it.type === 'text') {
        // opts.text 保留作 text 兜底，兼容旧调用
        if (typeof v !== 'string' || !v) v = opts && typeof opts.text === 'string' ? opts.text : '';
        CUR.text = (v || it.def).slice(0, it.max);
      } else {
        if (typeof v !== 'number' || !isFinite(v)) v = it.def;
        CUR[it.key] = Math.min(3, Math.max(0.3, Math.min(it.max, Math.max(it.min, v))));
      }
    }
  }
  // 数量下限 3：再少就看不出形状，count 缩放后再兜底
  function cnt(n) { return Math.max(3, Math.round(n * (CUR && CUR.count ? CUR.count : 1))); }

  var MOT = ['vx', 'vy', 'vr', 'vrt']; // 初速/角速度类运动项，由 speed 缩放
  // size 只缩画出来的尺寸（半径/边长/字号）；线宽、摆幅、扩散半径不是“大小”
  var SZ = { 1: ['s'], 2: ['r0', 'r1'], 3: ['w', 'h'], 5: ['s'], 6: ['px'], 7: ['w', 'h'], 8: ['s'], 9: ['r'], 10: ['s'], 11: ['s'] };

  function add(p) {
    // 参数只在入池瞬间套一次：tick 里的阻尼/重力系数保持不动，无 params 时 CUR 为 null 整段跳过
    if (CUR) {
      var j, f, sf = SZ[p.k] || [], s = CUR.speed || 1, z = CUR.size || 1;
      for (j = 0; j < MOT.length; j++) { f = MOT[j]; if (p[f] !== undefined) p[f] *= s; }
      for (j = 0; j < sf.length; j++) { f = sf[j]; if (p[f] !== undefined) p[f] *= z; }
      p.life = Math.min(4, Math.max(0.3, p.life / s));
    }
    P.push(p);
    // 超上限丢最旧的，防止移动端长时间点击把粒子堆爆
    if (P.length > MAX) P.splice(0, P.length - MAX);
  }

  function eo3(u) { var m = 1 - u; return 1 - m * m * m; }              // ease-out cubic
  function eob(u) { var m = u - 1; return 1 + 2.70158 * m * m * m + 1.70158 * m * m; } // ease-out back（回弹）

  function heartPath(ctx, s) {
    // 参数方程心形（x=16sin³t 系列），比贝塞尔版对称规整、小尺寸也好认
    var k = s / 16, i, t, x, y;
    for (i = 0; i <= 28; i++) {
      t = (i / 28) * TAU;
      x = 16 * Math.sin(t) * Math.sin(t) * Math.sin(t);
      y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      if (i === 0) ctx.moveTo(x * k, y * k); else ctx.lineTo(x * k, y * k);
    }
    ctx.closePath();
  }

  function starPath(ctx, s) {
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(0, 0, s, 0);
    ctx.quadraticCurveTo(0, 0, 0, s);
    ctx.quadraticCurveTo(0, 0, -s, 0);
    ctx.quadraticCurveTo(0, 0, 0, -s);
    ctx.closePath();
  }

  function hexPath(ctx, s) {
    var k, a, c, sn, bx, by;
    ctx.moveTo(0, 0);
    for (k = 0; k < 6; k++) {
      a = k * 1.0472;
      c = Math.cos(a) * s; sn = Math.sin(a) * s;
      ctx.moveTo(0, 0);
      ctx.lineTo(c, sn);
      bx = c * 0.6; by = sn * 0.6;
      ctx.moveTo(bx + Math.cos(a + 1.05) * s * 0.32, by + Math.sin(a + 1.05) * s * 0.32);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + Math.cos(a - 1.05) * s * 0.32, by + Math.sin(a - 1.05) * s * 0.32);
    }
  }

  /* ---------- spawn ---------- */

  function spawnFireworks(x, y, L) {
    var cols = L ? DEEP : BRIGHT;
    // 深色底用加法混合更亮，浅色底必须 source-over，否则颜色洗白
    var co = L ? 'source-over' : 'lighter';
    var i, a, sp;
    for (i = 0; i < cnt(40); i++) {
      a = Math.random() * TAU;
      sp = rnd(80, 300);
      add({
        k: 1, x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        t: 0, life: rnd(0.7, 1.35), c: pick(cols), s: rnd(1.6, 3.2),
        ph: rnd(0, TAU), pop: Math.random() < 0.16 ? 1 : 0, co: co
      });
    }
  }

  function popBurst(x, y, c, co) {
    var i, a, sp;
    for (i = 0; i < 5; i++) {
      a = Math.random() * TAU;
      sp = rnd(30, 110);
      add({
        k: 1, x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        t: 0, life: rnd(0.25, 0.5), c: c, s: rnd(1.2, 2),
        ph: rnd(0, TAU), pop: 0, co: co
      });
    }
  }

  function spawnExplosion(x, y, L) {
    var ringRgb = L ? '194,65,12' : '255,159,67';
    var smokeRgb = L ? '105,105,105' : '150,150,150';
    var cols = L ? FIRE_DEEP : FIRE_BRIGHT;
    var i, a, sp;
    add({ k: 2, x: x, y: y, t: 0, life: 0.45, r0: 8, r1: 150, lw: 9,
      fs: rgba(ringRgb, 1), fd: rgba(ringRgb, 0.12), fl: 0 });
    add({ k: 2, x: x, y: y, t: -0.1, life: 0.55, r0: 6, r1: 105, lw: 5,
      fs: rgba(ringRgb, 1), fd: rgba(ringRgb, 0.1), fl: 0 });
    for (i = 0; i < cnt(16); i++) {
      a = Math.random() * TAU;
      sp = rnd(70, 280);
      add({
        k: 3, x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        t: 0, life: rnd(0.45, 0.8), c: pick(cols),
        w: rnd(5, 11), h: rnd(2.5, 5), rot: Math.random() * TAU, vr: rnd(-12, 12)
      });
    }
    // count 名称是碎块数量，烟雾固定 8 团不跟着变
    for (i = 0; i < 8; i++) {
      a = Math.random() * TAU;
      sp = rnd(15, 70);
      add({
        k: 4, x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 12,
        t: 0, life: rnd(0.8, 1.5), fs: rgba(smokeRgb, 1),
        r0: rnd(5, 9), r1: rnd(16, 30)
      });
    }
  }

  function spawnHearts(x, y, L) {
    var cols = L ? PINK_DEEP : PINK_BRIGHT;
    var i, a;
    for (i = 0; i < cnt(10); i++) {
      a = Math.random() * TAU;
      add({
        // 径向散布 + 横向分离速度：避免所有爱心叠成一团
        k: 5, x0: x + Math.cos(a) * rnd(10, 75), x: x,
        y: y + Math.sin(a) * rnd(8, 55),
        vx: Math.cos(a) * rnd(30, 80),
        vy: rnd(-125, -55), t: 0, life: rnd(1.4, 2.2), s: rnd(8, 16),
        sw: rnd(6, 18), fr: rnd(1.6, 3.4), ph: rnd(0, TAU),
        rot: rnd(-0.12, 0.12), vr: rnd(-0.25, 0.25), c: pick(cols)
      });
    }
  }

  function spawnText(x, y, L) {
    add({
      k: 6, x: x, y: y, y0: y, t: 0, life: 1.2, px: 28,
      txt: CUR.text,
      rot: rnd(-0.16, 0.16), c: L ? '#111827' : '#ffffff'
    });
  }

  function spawnConfetti(x, y, L) {
    var cols = L ? DEEP : BRIGHT;
    var i, a, sp;
    for (i = 0; i < cnt(35); i++) {
      a = -Math.random() * Math.PI;   // 向上抛洒的半圆扇面
      sp = rnd(70, 250);
      add({
        k: 7, x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        t: 0, life: rnd(1.4, 2.6), c: pick(cols),
        w: rnd(6, 12), h: rnd(4, 8), rot: Math.random() * TAU, vr: rnd(-10, 10),
        ff: rnd(5, 13), ph: rnd(0, TAU)
      });
    }
  }

  function spawnSparkle(x, y, L) {
    var cols = L ? ['#a16207', '#7c3aed', '#be123c', '#0f766e']
                 : ['#ffffff', '#ffd166', '#c084fc', '#7cff6b'];
    var co = L ? 'source-over' : 'lighter';
    var i, a;
    for (i = 0; i < cnt(24); i++) {
      a = Math.random() * TAU;
      add({
        k: 8, x0: x, y0: y, ang: a, r: rnd(4, 26), vr: rnd(18, 60),
        s: rnd(5, 13), t: 0, life: rnd(0.6, 1.3),
        ff: rnd(6, 14), ph: rnd(0, TAU), rot: Math.random() * TAU,
        vrt: rnd(-2, 2), c: pick(cols), co: co
      });
    }
  }

  function spawnBubble(x, y, L) {
    var rgb = L ? '13,110,253' : '255,255,255';
    var i;
    for (i = 0; i < cnt(12); i++) {
      add({
        k: 9, x0: x + rnd(-24, 24), x: x, y: y + rnd(-10, 10),
        vy: rnd(-80, -32), r: rnd(6, 20), t: 0, life: rnd(1.6, 3), lw: 1.4,
        sw: rnd(6, 20), fr: rnd(1.2, 2.6), ph: rnd(0, TAU),
        fs: rgba(rgb, 0.16), ss: rgba(rgb, 0.8), hs: 'rgba(255,255,255,0.9)'
      });
    }
  }

  function spawnRipple(x, y, L) {
    var rgb = L ? '13,110,253' : '125,211,252';
    // count 是圈数倍率不是粒子数；无参 3 圈与旧版一致，取整后至少 1 圈
    var rings = Math.max(1, Math.round(3 * (CUR && CUR.count ? CUR.count : 1)));
    var i;
    for (i = 0; i < rings; i++) {
      add({
        k: 2, x: x, y: y, t: -i * 0.14, life: 0.9, r0: 6, r1: rnd(95, 150),
        lw: 7 - i, fs: rgba(rgb, 1), fd: rgba(rgb, 0.1), fl: i === 0 ? 1 : 0
      });
    }
  }

  function spawnSnow(x, y, L) {
    var i, a, sp;
    for (i = 0; i < cnt(20); i++) {
      a = -Math.random() * Math.PI;   // 向上喷出
      sp = rnd(50, 175);
      add({
        k: 10, x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        t: 0, life: rnd(2.4, 3.8), s: rnd(6, 13), lw: 1.4,
        rot: Math.random() * TAU, vr: rnd(-2, 2),
        fr: rnd(1, 2.4), ph: rnd(0, TAU), c: L ? '#334155' : '#e2e8f0'
      });
    }
  }

  function spawnFireRipple(x, y, L) {
    // 彩环复用 case 2、火花复用 case 1（径向初速+重力+线拖尾+闪烁已齐），不加新 case
    var cols = L ? DEEP : BRIGHT;
    var co = L ? 'source-over' : 'lighter';
    var i, a, sp;
    // count 名称是火星数量，彩环固定 3 圈不跟着变
    for (i = 0; i < 3; i++) {
      add({ k: 2, x: x, y: y, t: -i * 0.12, life: 0.65, r0: 8,
        r1: rnd(65, 120) - i * 12, lw: 6 - i, fs: pick(cols), fd: 0, fl: 0 });
    }
    for (i = 0; i < cnt(24); i++) {
      a = Math.random() * TAU;
      sp = rnd(90, 260);
      add({
        k: 1, x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        t: 0, life: rnd(0.5, 0.9), c: pick(cols), s: rnd(1.4, 2.8),
        ph: rnd(0, TAU), pop: 0, co: co
      });
    }
  }

  function spawn(id, x, y, opts) {
    var L = !!(opts && opts.light);
    setPrm(SPECS[id] || [], opts);
    if (id === 'fireworks') spawnFireworks(x, y, L);
    else if (id === 'fireripple') spawnFireRipple(x, y, L);
    else if (id === 'explosion') spawnExplosion(x, y, L);
    else if (id === 'hearts') spawnHearts(x, y, L);
    else if (id === 'text') spawnText(x, y, L);
    else if (id === 'confetti') spawnConfetti(x, y, L);
    else if (id === 'sparkle') spawnSparkle(x, y, L);
    else if (id === 'bubble') spawnBubble(x, y, L);
    else if (id === 'ripple') spawnRipple(x, y, L);
    else if (id === 'snow') spawnSnow(x, y, L);
    CUR = null; // tick 里 popBurst 补的粒子不能沾染本次参数
    // 未知 id 静默忽略
  }

  /* 每个轨迹点生成 round(count) 个（clamp 1~3）短寿命粒子，沿手指轨迹连点成串 */
  function swipe(id, x, y, opts) {
    var L = !!(opts && opts.light);
    setPrm(SW_SPECS[id] || [], opts);
    // count 是每点密度：round(1*count) 个粒子
    var n = Math.min(3, Math.max(1, Math.round(CUR && CUR.count ? CUR.count : 1))), d;
    for (d = 0; d < n; d++) {
      if (id === 'flower') {
        add({
          k: 11, x: x, y: y, t: 0, life: rnd(0.5, 0.7), s: rnd(8, 13),
          rot: Math.random() * TAU, vr: rnd(-1.2, 1.2), fr: rnd(4, 8),
          c: pick(L ? DEEP : BRIGHT), c2: L ? '#7c2d12' : '#ffe9a8'
        });
      } else if (id === 'star') {
        // 固定 r=0 复用 case 8：闪烁脉冲淡出正好是星光轨迹
        add({
          k: 8, x0: x, y0: y, ang: 0, r: 0, vr: 0, s: rnd(4, 8),
          t: 0, life: rnd(0.45, 0.65), ff: rnd(9, 15), ph: rnd(0, TAU),
          rot: Math.random() * TAU, vrt: rnd(-2, 2),
          c: pick(L ? DEEP : BRIGHT), co: L ? 'source-over' : 'lighter'
        });
      } else if (id === 'heart') {
        add({
          k: 5, x0: x, x: x, y: y, vx: 0, vy: rnd(-70, -40), t: 0,
          life: rnd(0.5, 0.7), s: rnd(5, 9), sw: rnd(2, 5), fr: rnd(3, 6),
          ph: rnd(0, TAU), rot: rnd(-0.15, 0.15), vr: rnd(-0.6, 0.6),
          c: pick(L ? PINK_DEEP : PINK_BRIGHT)
        });
      } else if (id === 'bubble') {
        var rgb = L ? '13,110,253' : '255,255,255';
        add({
          k: 9, x0: x, x: x, y: y, vy: rnd(-90, -55), r: rnd(3, 7), t: 0, lw: 1.4,
          life: rnd(0.45, 0.65), sw: rnd(2, 5), fr: rnd(3, 6), ph: rnd(0, TAU),
          fs: rgba(rgb, 0.16), ss: rgba(rgb, 0.8), hs: 'rgba(255,255,255,0.9)'
        });
      }
    }
    CUR = null;
    // 'none' 与未知 id 静默忽略
  }

  /* ---------- tick ---------- */

  function tick(ctx, dt) {
    ctx.clearRect(0, 0, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    if (!(dt > 0)) dt = 0;
    else if (dt > 0.05) dt = 0.05;

    ctx.lineCap = 'round';
    var i, j, a, p, u, al, e, rr, dg;

    for (i = P.length - 1; i >= 0; i--) {
      p = P[i];
      p.t += dt;
      if (p.t >= p.life) { P.splice(i, 1); continue; }
      u = p.t / p.life;

      switch (p.k) {
        case 1: // 烟花火星：阻力 + 重力 + 衰减闪烁，线段即拖尾
          dg = 1 - 2.2 * dt;
          p.vx *= dg;
          p.vy = p.vy * dg + 330 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.pop && p.t > p.life * 0.7) {
            p.pop = 0;
            popBurst(p.x, p.y, p.c, p.co);
          }
          al = (1 - u) * (0.55 + 0.45 * Math.sin(p.t * 34 + p.ph));
          if (al <= 0.02) break;
          ctx.globalCompositeOperation = p.co;
          ctx.globalAlpha = al;
          ctx.strokeStyle = p.c;
          ctx.lineWidth = p.s;
          ctx.beginPath();
          ctx.moveTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          break;

        case 2: // 冲击环 / 水波环：负 t 表示延迟启动，未到点不画
          if (p.t < 0) break;
          e = eo3(u);
          rr = p.r0 + (p.r1 - p.r0) * e;
          al = 1 - u;
          ctx.globalAlpha = al;
          if (p.fl) {
            ctx.fillStyle = p.fd;
            ctx.beginPath();
            ctx.arc(p.x, p.y, rr * 0.8, 0, TAU);
            ctx.fill();
          }
          ctx.strokeStyle = p.fs;
          ctx.lineWidth = p.lw * (1 - e) + 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, rr, 0, TAU);
          ctx.stroke();
          break;

        case 3: // 爆炸碎块
          dg = 1 - 2 * dt;
          p.vx *= dg;
          p.vy = p.vy * dg + 520 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          al = 1 - u;
          if (al <= 0) break;
          ctx.globalAlpha = al;
          ctx.fillStyle = p.c;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w * (1 - 0.5 * u), p.h);
          ctx.restore();
          break;

        case 4: // 烟雾
          dg = 1 - 1.6 * dt;
          p.vx *= dg;
          p.vy *= dg;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          al = (1 - u) * 0.5;
          if (al <= 0.01) break;
          ctx.globalAlpha = al;
          ctx.fillStyle = p.fs;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * u, 0, TAU);
          ctx.fill();
          break;

        case 5: // 爱心
          p.vy *= 1 - 0.7 * dt;
          p.x0 += (p.vx || 0) * dt;
          p.y += p.vy * dt;
          p.x = p.x0 + Math.sin(p.t * p.fr + p.ph) * p.sw;
          p.rot += p.vr * dt;
          al = 1 - u;
          if (al <= 0) break;
          ctx.globalAlpha = al;
          ctx.fillStyle = p.c;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          heartPath(ctx, p.s * (u < 0.34 ? eob(u / 0.34) : 1));
          ctx.fill();
          ctx.restore();
          break;

        case 6: // 文字
          p.y = p.y0 - 70 * eo3(u);
          al = u < 0.55 ? Math.min(1, u / 0.08) : 1 - (u - 0.55) / 0.45;
          if (al <= 0) break;
          e = u < 0.3 ? eob(u / 0.3) : 1;
          if (e < 0.02) e = 0.02;
          ctx.globalAlpha = al;
          ctx.fillStyle = p.c;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(e, e);
          ctx.font = 'bold ' + p.px + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.txt, 0, 0);
          ctx.restore();
          break;

        case 7: // 彩带：宽度随翻面周期变化模拟纸片翻滚
          dg = 1 - 1.1 * dt;
          p.vx *= dg;
          p.vy = p.vy * dg + 540 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          al = u > 0.65 ? (1 - u) / 0.35 : 1;
          if (al <= 0) break;
          ctx.globalAlpha = al;
          ctx.fillStyle = p.c;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.w / 2, -p.h / 2,
            p.w * (0.28 + 0.72 * Math.abs(Math.sin(p.t * p.ff + p.ph))), p.h);
          ctx.restore();
          break;

        case 8: // 闪粉
          p.r += p.vr * dt;
          p.rot += p.vrt * dt;
          p.x = p.x0 + Math.cos(p.ang) * p.r;
          p.y = p.y0 + Math.sin(p.ang) * p.r;
          al = Math.sin(Math.PI * u) * (0.45 + 0.55 * Math.abs(Math.sin(p.t * p.ff + p.ph)));
          if (al <= 0.02) break;
          ctx.globalCompositeOperation = p.co;
          ctx.globalAlpha = al;
          ctx.fillStyle = p.c;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          starPath(ctx, p.s * (0.72 + 0.28 * Math.sin(p.t * p.ff * 0.7 + p.ph)));
          ctx.fill();
          ctx.restore();
          break;

        case 9: // 泡泡
          p.vy *= 1 - 0.5 * dt;
          p.y += p.vy * dt;
          p.x = p.x0 + Math.sin(p.t * p.fr + p.ph) * p.sw;
          al = Math.pow(1 - u, 0.8);
          if (al <= 0.02) break;
          ctx.globalAlpha = al;
          ctx.fillStyle = p.fs;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = p.ss;
          ctx.lineWidth = p.lw;
          ctx.stroke();
          ctx.fillStyle = p.hs;
          ctx.beginPath();
          ctx.arc(p.x - p.r * 0.32, p.y - p.r * 0.32, p.r * 0.22, 0, TAU);
          ctx.fill();
          break;

        case 10: // 雪花：先被喷上去，阻力让速度衰减后被重力带下来
          dg = 1 - 1.4 * dt;
          p.vx = p.vx * dg + Math.sin(p.t * p.fr + p.ph) * 26 * dt;
          p.vy = p.vy * dg + 60 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          al = u > 0.7 ? (1 - u) / 0.3 : 1;
          if (al <= 0) break;
          ctx.globalAlpha = al;
          ctx.strokeStyle = p.c;
          ctx.lineWidth = p.lw;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          hexPath(ctx, p.s);
          ctx.stroke();
          ctx.restore();
          break;

        case 11: // 滑动小花：5 瓣椭圆绕心，弹入缩放 + 微旋 + 淡出
          p.rot += p.vr * dt;
          al = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
          if (al <= 0) break;
          e = u < 0.3 ? eob(u / 0.3) : 1;
          ctx.globalAlpha = al;
          ctx.fillStyle = p.c;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot + Math.sin(p.t * p.fr) * 0.15);
          ctx.scale(e, e);
          // 圆花瓣 + 花心：细长椭圆瓣在小尺寸下会看成五边形
          ctx.fillStyle = p.c;
          ctx.beginPath();
          for (j = 0; j < 5; j++) {
            a = j * 1.25664;
            ctx.moveTo(Math.cos(a) * p.s * 0.55 + p.s * 0.36, Math.sin(a) * p.s * 0.55);
            ctx.arc(Math.cos(a) * p.s * 0.55, Math.sin(a) * p.s * 0.55, p.s * 0.36, 0, TAU);
          }
          ctx.fill();
          ctx.fillStyle = p.c2;
          ctx.beginPath();
          ctx.arc(0, 0, p.s * 0.28, 0, TAU);
          ctx.fill();
          ctx.restore();
          break;
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'butt';
  }

  return { list: list, paramSpec: paramSpec, spawn: spawn, swipeList: swipeList, swipeSpec: swipeSpec, swipe: swipe, tick: tick };
})();
