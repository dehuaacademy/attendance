// ===== 設定：部署 Apps Script 後，把 /exec 網址貼在這裡 =====
var API = 'PASTE_APPS_SCRIPT_EXEC_URL';
var MAX_PHOTOS = 3, PHOTO_MAX_SIDE = 1600, PHOTO_QUALITY = 0.7;
var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

// ===== 身分：第一次用專屬連結（?u=代碼）打開後記在手機上，之後從主畫面圖示開也認得 =====
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
var qs = new URLSearchParams(location.search);
if (qs.get('u')) store('dh_u', qs.get('u'));
var CODE = qs.get('u') || store('dh_u');
var NAME = '';
var photos = []; // 已壓縮的 dataURL
var busy = false;

function $(id) { return document.getElementById(id); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function msg(id, text, cls) { var m = $(id); m.textContent = text; m.className = 'msg ' + (cls || ''); }
function lock(on) { busy = on; ['btnIn', 'btnOut', 'btnSend'].forEach(function (b) { $(b).disabled = on; }); }
function invalid(text) { $('app').classList.add('hide'); $('invalidText').textContent = text; $('invalid').classList.remove('hide'); }

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
    $('sIn').textContent = r.clock['簽到'] || '—';
    $('sOut').textContent = r.clock['簽退'] || '—';
    renderSchedule(r.schedule, r.today);
  }).catch(function (e) {
    if (/連結無效/.test(e.message)) invalid('連結無效');
    else { $('who').textContent = '連線失敗'; msg('mClock', '無法連線，請確認網路後重新整理', 'err'); }
  });
}

function renderSchedule(list, today) {
  var box = $('schedList');
  if (!list.length) { box.innerHTML = '<div class="empty">未來兩週還沒有排班</div>'; return; }
  var html = '', cur = '';
  list.forEach(function (s) {
    if (s.date !== cur) {
      if (cur) html += '</div>';
      cur = s.date;
      var d = new Date(s.date + 'T00:00:00');
      html += '<div class="day"><h3>' + (d.getMonth() + 1) + '/' + d.getDate() + '（' + WEEK[d.getDay()] + '）'
           + (s.date === today ? '<small>今天</small>' : '') + '</h3>';
    }
    html += '<div class="shift' + (s.name === NAME ? ' me' : '') + '"><span>' + esc(s.name)
         + (s.note ? '<span class="note">' + esc(s.note) + '</span>' : '') + '</span><span>'
         + esc(s.start) + (s.end ? '–' + esc(s.end) : '') + '</span></div>';
  });
  box.innerHTML = html + '</div>';
}
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

// ===== 回報 =====
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
if (!CODE) invalid('連結無效');
else if (!/^https?:\/\//.test(API)) invalid('系統尚未設定完成');
else {
  $('app').classList.remove('hide');
  $('rDate').value = todayStr();
  renderPhotos();
  load();
}
