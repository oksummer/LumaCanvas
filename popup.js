// MV3 扩展页 CSP 禁止内联脚本，逻辑放独立文件
var NAMES = {
  none: '无',
  fireworks: '烟花', fireripple: '烟花波纹', explosion: '爆炸', hearts: '爱心', text: '文字',
  confetti: '彩带', sparkle: '闪粉', bubble: '泡泡', ripple: '水波', snow: '雪花'
};

document.addEventListener('DOMContentLoaded', function () {
  var out = document.getElementById('fx');
  function fill(c) {
    var id = (c && c.fx) || 'fireworks';
    out.textContent = NAMES[id] || id;
  }
  try {
    chrome.storage.local.get('miFxConfig', function (d) { fill(d && d.miFxConfig); });
    document.getElementById('open').addEventListener('click', function () {
      if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
      else window.open('index.html');
    });
  } catch (e) {
    out.textContent = NAMES.fireworks;
    document.getElementById('open').addEventListener('click', function () { window.open('index.html'); });
  }
});
