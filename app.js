(function () {
  'use strict';

  var KEY = 'mi-click-fx-config';
  var COLORS = ['#101426', '#3d4258', '#0b3b2e', '#3b1430', '#0a2f4a', '#f6f1e7', '#ffe9ec', '#e8f0ff'];
  var defaults = { fx: 'fireworks', swipe: 'none', bg: 'none', color: '#101426', text: '', params: {} };

  var stage = document.getElementById('stage');
  var bgCanvas = document.getElementById('bgCanvas');
  var fxCanvas = document.getElementById('fxCanvas');
  var hint = document.getElementById('hint');
  var fab = document.getElementById('fab');
  var panel = document.getElementById('panel');
  var collapseBtn = document.getElementById('collapseBtn');
  var fxList = document.getElementById('fxList');
  var bgList = document.getElementById('bgList');
  var colorList = document.getElementById('colorList');
  var textSec = document.getElementById('textSec');
  var textInput = document.getElementById('textInput');

  var bgX = bgCanvas.getContext('2d');
  var fxX = fxCanvas.getContext('2d');
  var cfg = load();
  var light = false;
  var hinted = false;

  // ---- 配置读写：失败按默认继续 ----
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return copy(defaults);
      var c = JSON.parse(raw);
      var ok = copy(defaults);
      if (c && typeof c === 'object') {
        if (typeof c.color === 'string') ok.color = c.color;
        if (typeof c.text === 'string') ok.text = c.text;
        if (typeof c.fx === 'string') ok.fx = c.fx;
        if (typeof c.swipe === 'string') ok.swipe = c.swipe;
        if (typeof c.bg === 'string') ok.bg = c.bg;
        if (c.params && typeof c.params === 'object') ok.params = c.params;
      }
      return ok;
    } catch (e) {
      return copy(defaults);
    }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* 存储不可用不阻塞玩法 */ }
    // 扩展形态下内容脚本从 chrome.storage 读配置
    try { if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) chrome.storage.local.set({ miFxConfig: cfg }); } catch (e) {}
  }
  function copy(o) { return { fx: o.fx, swipe: o.swipe, bg: o.bg, color: o.color, text: o.text, params: o.params || {} }; }

  // ---- 效果参数（速度/数量/强度），按 类别:特效id 存储，互不影响 ----
  var PARAM_KEYS = [['speed', '速度'], ['count', '数量'], ['intensity', '强度']];
  function paramKey(cat, id) { return cat + ':' + id; }
  function getParams(cat, id) {
    var p = cfg.params[paramKey(cat, id)] || {};
    return {
      speed: typeof p.speed === 'number' ? p.speed : 1,
      count: typeof p.count === 'number' ? p.count : 1,
      intensity: typeof p.intensity === 'number' ? p.intensity : 1
    };
  }
  function setParam(cat, id, k, v) {
    var key = paramKey(cat, id);
    if (!cfg.params[key]) cfg.params[key] = { speed: 1, count: 1, intensity: 1 };
    cfg.params[key][k] = v;
    save();
    if (cat === 'bg' && window.BgFx) BgFx.set(cfg.bg, { light: light, params: getParams('bg', cfg.bg) });
  }
  function buildParams(container, cat, getSel) {
    container.innerHTML = '';   // 仅清空容器再用 DOM API 建节点，不注入任何字符串
    PARAM_KEYS.forEach(function (pk) {
      var row = document.createElement('label');
      row.className = 'param-row';
      var name = document.createElement('span');
      name.textContent = pk[1];
      var input = document.createElement('input');
      input.type = 'range';
      input.min = '0.5'; input.max = '2'; input.step = '0.1';
      input.value = getParams(cat, getSel())[pk[0]];
      input.setAttribute('aria-label', pk[1]);
      var val = document.createElement('b');
      val.textContent = Number(input.value).toFixed(1) + '×';
      input.addEventListener('input', function () {
        var v = parseFloat(input.value);
        val.textContent = v.toFixed(1) + '×';
        setParam(cat, getSel(), pk[0], v);
      });
      row.appendChild(name); row.appendChild(input); row.appendChild(val);
      container.appendChild(row);
    });
  }

  // ---- 背景亮度：决定特效用深色系还是亮色系 ----
  function isLight(hex) {
    if (hex === 'none') return true;   // 透明背景按浅色处理
    var m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return false;
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
  }

  // ---- 尺寸（DPR 上限 2，防移动端高分屏过载） ----
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = stage.clientWidth, h = stage.clientHeight;
    [bgCanvas, fxCanvas].forEach(function (c) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }

  // ---- 背景与提示的明暗跟随 ----
  function applyColor() {
    document.body.style.background = cfg.color === 'none' ? 'transparent' : cfg.color;
    light = isLight(cfg.color);
    hint.classList.toggle('dark', light);
    if (window.BgFx) BgFx.set(cfg.bg, { light: light, params: getParams('bg', cfg.bg) });
  }

  // ---- 主循环：页面隐藏时暂停 ----
  var running = false, last = 0;
  function frame(t) {
    if (!running) return;
    var dt = Math.min((t - last) / 1000 || 0.016, 0.05);
    last = t;
    BgFx.tick(bgX, dt);
    Fx.tick(fxX, dt);
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  });

  // ---- 点击触发特效（面板在外层，不会冒泡进来） ----
  var down = false, lastX = 0, lastY = 0;
  stage.addEventListener('pointerdown', function (e) {
    down = true;
    lastX = e.clientX; lastY = e.clientY;
    var rect = stage.getBoundingClientRect();
    Fx.spawn(cfg.fx, e.clientX - rect.left, e.clientY - rect.top, { light: light, text: cfg.text, params: getParams('fx', cfg.fx) });
    if (!hinted) { hinted = true; hint.classList.add('gone'); }
  }, { passive: true });

  // 滑动特效：按住拖动沿轨迹生成（pointermove 统一覆盖触摸/鼠标）
  stage.addEventListener('pointermove', function (e) {
    if (!down || cfg.swipe === 'none') return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (dx * dx + dy * dy < 64) return;   // 8px 节流，防止轨迹粒子堆积
    lastX = e.clientX; lastY = e.clientY;
    var rect = stage.getBoundingClientRect();
    Fx.swipe(cfg.swipe, e.clientX - rect.left, e.clientY - rect.top, { light: light, params: getParams('swipe', cfg.swipe) });
  }, { passive: true });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    stage.addEventListener(ev, function () { down = false; }, { passive: true });
  });

  // ---- 设置面板 ----
  function togglePanel(open) {
    panel.classList.toggle('hidden', !open);
  }
  fab.addEventListener('click', function () { togglePanel(panel.classList.contains('hidden')); });
  collapseBtn.addEventListener('click', function () { togglePanel(false); });

  function chip(container, item, current, onPick) {
    var b = document.createElement('button');
    b.className = 'chip' + (item.id === current ? ' active' : '');
    b.textContent = item.name;
    b.addEventListener('click', function () {
      [].forEach.call(container.children, function (c) { c.classList.remove('active'); });
      b.classList.add('active');
      onPick(item.id);
    });
    container.appendChild(b);
  }
  (window.Fx ? Fx.list : []).forEach(function (it) {
    chip(fxList, it, cfg.fx, function (id) {
      var el = document.getElementById('fxParams');
      if (id === cfg.fx) { el.classList.toggle('hidden'); return; }  // 二次点选已选项 = 展开/收起参数
      cfg.fx = id;
      textSec.classList.toggle('hidden', id !== 'text');
      buildParams(el, 'fx', function () { return cfg.fx; });
      el.classList.add('hidden');
      save();
    });
  });
  (window.BgFx ? BgFx.list : []).forEach(function (it) {
    chip(bgList, it, cfg.bg, function (id) {
      var el = document.getElementById('bgParams');
      if (id === cfg.bg) {
        if (id !== 'none') el.classList.toggle('hidden');
        return;
      }
      cfg.bg = id;
      BgFx.set(id, { light: light, params: getParams('bg', id) });
      buildParams(el, 'bg', function () { return cfg.bg; });
      el.classList.toggle('hidden', id === 'none');
      save();
    });
  });
  var swipeListEl = document.getElementById('swipeList');
  (window.Fx && Fx.swipeList ? Fx.swipeList : []).forEach(function (it) {
    chip(swipeListEl, it, cfg.swipe, function (id) {
      var el = document.getElementById('swipeParams');
      if (id === cfg.swipe) { el.classList.toggle('hidden'); return; }
      cfg.swipe = id;
      buildParams(el, 'swipe', function () { return cfg.swipe; });
      el.classList.add('hidden');
      save();
    });
  });

  var noneSw = document.createElement('button');
  noneSw.className = 'swatch none' + (cfg.color === 'none' ? ' active' : '');
  noneSw.textContent = '无';
  noneSw.setAttribute('aria-label', '不设置背景色');
  noneSw.addEventListener('click', function () {
    [].forEach.call(colorList.children, function (el) { el.classList.remove('active'); });
    noneSw.classList.add('active');
    cfg.color = 'none';
    applyColor();
    save();
  });
  colorList.appendChild(noneSw);
  COLORS.forEach(function (c) {
    var b = document.createElement('button');
    b.className = 'swatch' + (c.toLowerCase() === cfg.color.toLowerCase() ? ' active' : '');
    b.style.background = c;
    b.setAttribute('aria-label', '背景色 ' + c);
    b.addEventListener('click', function () {
      [].forEach.call(colorList.children, function (el) { el.classList.remove('active'); });
      b.classList.add('active');
      cfg.color = c;
      applyColor();
      save();
    });
    colorList.appendChild(b);
  });
  var custom = document.createElement('input');
  custom.type = 'color';
  custom.id = 'customColor';
  custom.value = cfg.color;
  custom.setAttribute('aria-label', '自定义背景色');
  custom.addEventListener('input', function () {
    [].forEach.call(colorList.children, function (el) { el.classList.remove('active'); });
    cfg.color = custom.value;
    applyColor();
    save();
  });
  colorList.appendChild(custom);

  textInput.value = cfg.text;
  textInput.addEventListener('input', function () { cfg.text = textInput.value; save(); });

  // ---- 启动 ----
  textSec.classList.toggle('hidden', cfg.fx !== 'text');
  buildParams(document.getElementById('fxParams'), 'fx', function () { return cfg.fx; });
  buildParams(document.getElementById('swipeParams'), 'swipe', function () { return cfg.swipe; });
  buildParams(document.getElementById('bgParams'), 'bg', function () { return cfg.bg; });
  // 参数默认收起，二次点选已选中的效果才展开
  document.getElementById('fxParams').classList.add('hidden');
  document.getElementById('swipeParams').classList.add('hidden');
  document.getElementById('bgParams').classList.add('hidden');
  resize();
  applyColor();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
})();
