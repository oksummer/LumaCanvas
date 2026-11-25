// 扩展形态运行时：在任意网页注入点击/滑动特效与背景（配置与选项页经 chrome.storage 共享）
(function () {
  'use strict';
  if (window.__mfxInjected) return;
  window.__mfxInjected = true;

  var cfg = { fx: 'fireworks', swipe: 'none', bg: 'none', text: '', params: {} };

  // 参数原样透传，缺省/越界由模块按各效果 spec 归一
  function getP(cat, id) { return (cfg.params && cfg.params[cat + ':' + id]) || {}; }

  function applyCfg(next) {
    if (next && typeof next === 'object') {
      if (typeof next.fx === 'string') cfg.fx = next.fx;
      if (typeof next.swipe === 'string') cfg.swipe = next.swipe;
      if (typeof next.bg === 'string') cfg.bg = next.bg;
      if (typeof next.text === 'string') cfg.text = next.text;
      if (next.params && typeof next.params === 'object') cfg.params = next.params;
    }
    if (window.BgFx) BgFx.set(cfg.bg, { light: false, params: getP('bg', cfg.bg) });
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('miFxConfig', function (d) { applyCfg(d && d.miFxConfig); });
      chrome.storage.onChanged.addListener(function (ch, area) {
        if (area === 'local' && ch.miFxConfig) applyCfg(ch.miFxConfig.newValue);
      });
    }
  } catch (e) { /* 无存储权限时用默认配置，不阻断注入 */ }

  function boot() {
    if (!window.Fx || !window.BgFx) return;

    var bg = document.createElement('canvas');
    var fx = document.createElement('canvas');
    [bg, fx].forEach(function (c, i) {
      c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;';
      c.style.zIndex = i ? 2147483647 : 2147483646;
      (document.body || document.documentElement).appendChild(c);
    });
    var bgX = bg.getContext('2d');
    var fxX = fx.getContext('2d');

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = window.innerWidth, h = window.innerHeight;
      [bg, fx].forEach(function (c) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
        c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      });
    }
    resize();
    window.addEventListener('resize', resize);
    applyCfg(null);

    var running = true, last = 0;
    function frame(t) {
      if (!running) return;
      var dt = Math.min((t - last) / 1000 || 0.016, 0.05);
      last = t;
      BgFx.tick(bgX, dt);
      Fx.tick(fxX, dt);
      requestAnimationFrame(frame);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) running = false;
      else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    });
    last = performance.now();
    requestAnimationFrame(frame);

    var down = false, lastX = 0, lastY = 0;
    document.addEventListener('pointerdown', function (e) {
      down = true; lastX = e.clientX; lastY = e.clientY;
      Fx.spawn(cfg.fx, e.clientX, e.clientY, { light: false, params: getP('fx', cfg.fx) });
    }, true);
    document.addEventListener('pointermove', function (e) {
      if (!down || cfg.swipe === 'none') return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (dx * dx + dy * dy < 64) return;   // 8px 节流，防止轨迹粒子堆积
      lastX = e.clientX; lastY = e.clientY;
      Fx.swipe(cfg.swipe, e.clientX, e.clientY, { light: false, params: getP('swipe', cfg.swipe) });
    }, true);
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      document.addEventListener(ev, function () { down = false; }, true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
