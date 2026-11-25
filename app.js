// ===== 設定：部署 Apps Script 後，把 /exec 網址貼在這裡 =====
var API = 'PASTE_APPS_SCRIPT_EXEC_URL';
var MAX_PHOTOS = 3, PHOTO_MAX_SIDE = 1600, PHOTO_QUALITY = 0.7;
var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
var AREAS = ['北一區', '北二區', '桃竹苗', '中區', '南區'], STAY_ROWS = 10;

// ===== 身分：共用連結，第一次輸入個人 PIN 後記在這支手機上 =====
function store(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
  catch (e) { return null; }
}
var CODE = store('dh_pin');
var NAME = '';
var photos = []; // 已壓縮的 dataURL
var busy = false;

function $(id) { return document.getElementById(id); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function msg(id, text, cls) { var m = $(id); m.textContent = text; m.className = 'msg ' + (cls || ''); }
function lock(on) { busy = on; ['btnIn', 'btnOut', 'btnSend', 'btnStay'].forEach(function (b) { $(b).disabled = on; }); }
function invalid(text) { $('app').classList.add('hide'); $('invalidText').textContent = text; $('invalid').classList.remove('hide'); }
function show(id) { ['app', 'login', 'invalid'].forEach(function (x) { $(x).classList.toggle('hide', x !== id); }); }

function login() {
  var pin = $('pin').value.trim();
  if (!/^\d{4}$/.test(pin)) { msg('mLogin', '請輸入 4 位數字', 'err'); return; }
  $('btnLogin').disabled = true; msg('mLogin', '確認中…');
  CODE = pin;
  load().then(function (ok) {
    $('btnLogin').disabled = false;
    if (ok) { store('dh_pin', pin); $('pin').value = ''; msg('mLogin', ''); show('app'); }
  });
}
function logout(text) {
  store('dh_pin', null); CODE = null; NAME = '';
  $('who').textContent = ''; $('sIn').textContent = '—'; $('sOut').textContent = '—';
  show('login'); msg('mLogin', text || '', text ? 'err' : '');
  $('pin').focus();
}

function tab(t) {
  ['clock', 'report', 'schedule'].forEach(function (x) {
    $(x).classList.toggle('hide', x !== t);
    $('tab-' + x).classList.toggle('on', x === t);
  });
  if (t === 'schedule') load();
}

// ===== 與後台溝通 =====
function apiGet(params) {
  var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  return fetch(API + '?' + q).then(parse);
}
function apiPost(body) {
  // 不設 Content-Type（預設 text/plain），避免瀏覽器先送預檢請求
  return fetch(API, { method: 'POST', body: JSON.stringify(body) }).then(parse);
}
function parse(r) {
  return r.json().then(function (j) { if (!j.ok) throw new Error(j.error || '系統錯誤'); return j; });
}

// ===== 載入狀態與班表 =====
function load() {
  return apiGet({ action: 'status', u: CODE }).then(function (r) {
    NAME = r.name;
    $('who').textContent = r.name;
    $('today').textContent = r.today + '（' + WEEK[new Date(r.today + 'T00:00:00').getDay()] + '）';
    if (!$('rDate').value) $('rDate').value = r.today;
    if (r.areas && r.areas.join() !== AREAS.join()) { AREAS = r.areas; buildStay(true); }
    $('stayDate').textContent = r.today.slice(5).replace('-', '/') + '（' + WEEK[new Date(r.today + 'T00:00:00').getDay()] + '）';
    $('sIn').textContent = r.clock['簽到'] || '—';
    $('sOut').textContent = r.clock['簽退'] || '—';
    renderSchedule(r.schedule, r.today, r.days || 60);
    return true;
  }).catch(function (e) {
    if (/PIN/.test(e.message)) logout('PIN 錯誤或已停用，請重新輸入');
    else if (!$('app').classList.contains('hide')) { $('who').textContent = '連線失敗'; msg('mClock', '無法連線，請確認網路後重新整理', 'err'); }
    else msg('mLogin', '無法連線，請確認網路後再試', 'err');
    return false;
  });
}

// 班表：今天起 N 天，每天一列；點按鈕登記／取消自己的班
function renderSchedule(list, today, days) {
  var by = {};
  list.forEach(function (s) { (by[s.date] = by[s.date] || []).push(s); });
  var base = new Date(today + 'T00:00:00'), html = '', month = -1;
  for (var i = 0; i < days; i++) {
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    var ds = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    var people = by[ds] || [], mine = people.some(function (s) { return s.name === NAME; });
    if (d.getMonth() !== month) { month = d.getMonth(); html += '<div class="mon">' + d.getFullYear() + ' 年 ' + (month + 1) + ' 月</div>'; }
    var tags = people.map(function (s) {
      var t = (s.start ? ' ' + esc(s.start) + (s.end ? '–' + esc(s.end) : '') : '') + (s.note ? '・' + esc(s.note) : '');
      return '<span class="who' + (s.name === NAME ? ' me' : '') + '">' + esc(s.name) + t + '</span>';
    }).join('');
    if (!people.length) tags = i > 0 && i <= 7 ? '<span class="gap">缺人</span>' : '<span class="none">尚無人</span>';
    html += '<div class="row' + (d.getDay() === 0 || d.getDay() === 6 ? ' wk' : '') + '">'
         + '<div class="dt"><b>' + (d.getMonth() + 1) + '/' + d.getDate() + '</b><small>' + (i === 0 ? '今天' : '週' + WEEK[d.getDay()]) + '</small></div>'
         + '<div class="ppl">' + tags + '</div>'
         + '<button class="op' + (mine ? ' cancel' : '') + '" onclick="shiftOp(\'' + ds + '\',\'' + (mine ? 'cancel' : 'add') + '\',this)">'
         + (mine ? '取消' : '我要排') + '</button></div>';
  }
  $('schedList').innerHTML = html;
}

function shiftOp(date, op, btn) {
  if (busy) return;
  busy = true; btn.disabled = true; btn.textContent = '…';
  apiPost({ action: 'shift', u: CODE, op: op, date: date })
    .then(function () { busy = false; return load(); })
    .catch(function (e) { busy = false; btn.disabled = false; btn.textContent = op === 'add' ? '我要排' : '取消'; alertMsg(e.message); });
}
function alertMsg(t) { var m = $('mSched'); m.textContent = t; m.className = 'msg err'; setTimeout(function () { m.textContent = ''; }, 4000); }
function esc(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

// ===== 打卡 =====
function getLoc(cb) {
  if (!navigator.geolocation) { cb(null, 'fail'); return; }
  navigator.geolocation.getCurrentPosition(
    function (p) { cb({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); },
    function (e) { cb(null, e.code === 1 ? 'denied' : 'fail'); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

var warned = false;
function clock(type) {
  if (busy) return;
  if (type === '簽退' && $('sIn').textContent === '—' && !warned) {
    warned = true; msg('mClock', '今天還沒簽到，確定要簽退請再按一次', 'err'); return;
  }
  lock(true); msg('mClock', '處理中…');
  getLoc(function (loc, err) {
    if (err === 'denied') {
      lock(false);
      msg('mClock', '請允許「位置」權限後再打卡（手機設定 → 瀏覽器 → 位置）', 'err');
      return;
    }
    // 取不到定位（逾時）仍送出，後台標示「未取得定位」
    apiPost({ action: 'clock', u: CODE, type: type,
              lat: loc ? loc.lat : null, lng: loc ? loc.lng : null, acc: loc ? loc.acc : null })
      .then(function (r) {
        warned = false; lock(false); msg('mClock', r.type + '成功 ' + r.time, 'ok');
        if (r.type === '簽到' && $('sIn').textContent === '—') $('sIn').textContent = r.time;
        if (r.type === '簽退') $('sOut').textContent = r.time;
      })
      .catch(function (e) { lock(false); msg('mClock', e.message === 'Failed to fetch' ? '網路異常，請再按一次' : e.message, 'err'); });
  });
}

// ===== 照片：選取後在手機上先壓縮 =====
function renderPhotos() {
  var html = photos.map(function (p, i) {
    return '<div class="ph"><img src="' + p + '"><button onclick="removePhoto(' + i + ')">×</button></div>';
  }).join('');
  if (photos.length < MAX_PHOTOS) html += '<div class="add" onclick="$(\'pick\').click()">＋<br>加照片</div>';
  $('photos').innerHTML = html;
}
function removePhoto(i) { photos.splice(i, 1); renderPhotos(); }

function compress(file) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var s = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', PHOTO_QUALITY));
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('照片讀取失敗')); };
    img.src = url;
  });
}

document.addEventListener('change', function (e) {
  if (e.target.id !== 'pick') return;
  var files = Array.prototype.slice.call(e.target.files, 0, MAX_PHOTOS - photos.length);
  e.target.value = '';
  msg('mReport', '處理照片中…');
  Promise.all(files.map(compress)).then(function (list) {
    photos = photos.concat(list); renderPhotos(); msg('mReport', '');
  }).catch(function (err) { msg('mReport', err.message, 'err'); });
});

// ===== 回報：事務回報／住廟回報切換 =====
function seg(t) {
  $('rWork').style.display = t === 'work' ? '' : 'none';
  $('rStay').style.display = t === 'stay' ? '' : 'none';
  $('seg-work').classList.toggle('on', t === 'work');
  $('seg-stay').classList.toggle('on', t === 'stay');
}

// 住廟回報：10 列，左邊選區域、右邊填姓名；空白列不送出。日期＝送出當天
function buildStay(keep) {
  var old = keep ? stayValues(true) : [];
  var opts = '<option value="">區域</option>' + AREAS.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join('');
  var html = '';
  for (var i = 0; i < STAY_ROWS; i++) {
    html += '<div class="srow"><span class="n">' + (i + 1) + '</span><select id="sa' + i + '">' + opts + '</select>'
         + '<input id="sn' + i + '" placeholder="姓名" maxlength="30"></div>';
  }
  $('stayRows').innerHTML = html;
  old.forEach(function (r, i) { if (i < STAY_ROWS) { $('sa' + i).value = r.area; $('sn' + i).value = r.name; } });
}
function stayValues(all) {
  var out = [];
  for (var i = 0; i < STAY_ROWS; i++) {
    var r = { area: $('sa' + i).value, name: $('sn' + i).value.trim() };
    if (all || r.name || r.area) out.push(r);
  }
  return out;
}
function sendStay() {
  if (busy) return;
  var rows = stayValues(false);
  var bad = rows.filter(function (r) { return !r.name || !r.area; });
  if (!rows.length) { msg('mStay', '請至少填一位', 'err'); return; }
  if (bad.length) { msg('mStay', '有列只填了區域或姓名，請補齊或清空', 'err'); return; }
  lock(true); msg('mStay', '送出中…');
  apiPost({ action: 'stay', u: CODE, rows: rows })
    .then(function (r) { lock(false); buildStay(false); msg('mStay', '已送出 ' + r.time + '（' + r.count + ' 位）', 'ok'); })
    .catch(function (e) { lock(false); msg('mStay', (e.message === 'Failed to fetch' ? '網路異常' : e.message) + '，內容還在，請再送一次', 'err'); });
}

// ===== 事務回報 =====
function send() {
  if (busy) return;
  var text = $('rText').value.trim();
  if (!text && !photos.length) { msg('mReport', '請填寫內容或附上照片', 'err'); return; }
  lock(true); msg('mReport', photos.length ? '上傳中，照片較多時需要幾秒…' : '送出中…');
  apiPost({ action: 'report', u: CODE, kind: $('rKind').value, date: $('rDate').value, text: text, photos: photos })
    .then(function (r) {
      lock(false); $('rText').value = ''; photos = []; renderPhotos();
      msg('mReport', '已送出 ' + r.time + (r.photos ? '（照片 ' + r.photos + ' 張）' : ''), 'ok');
    })
    .catch(function (e) {
      lock(false);
      msg('mReport', (e.message === 'Failed to fetch' ? '網路異常' : e.message) + '，內容還在，請再送一次', 'err');
    });
}

// ===== 啟動 =====
document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'pin') login(); });
if (!/^https?:\/\//.test(API)) invalid('系統尚未設定完成');
else {
  $('rDate').value = todayStr();
  renderPhotos();
  buildStay(false);
  if (CODE) { show('app'); load(); } else show('login');
}
