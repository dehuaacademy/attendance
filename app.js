// ===== 設定：部署 Apps Script 後，把 /exec 網址貼在這裡 =====
var API = 'https://script.google.com/macros/s/AKfycby8HebCpG-vkz4_Gg6Lb0mfeAdu_dNPyLTGxxbLVMhLtMZyiysfUqaTbkVVng9t_OkW/exec';
var MAX_PHOTOS = 3, PHOTO_MAX_SIDE = 1600, PHOTO_QUALITY = 0.7;
var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
var AREAS = ['北一區', '北二區', '桃竹苗', '中區', '南區'], STAY_ROWS = 10, STAY_DUTIES = ['天廚', '志工', '輪值', '其他'];

// ===== 身分：共用連結，第一次輸入個人 PIN 後記在這支手機上 =====
function store(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
  catch (e) { return null; }
}
var CODE = store('dh_id') || store('dh_pin');   // 「姓名|PIN」；舊版只存 PIN，打開後會自動升級
var ROLE = 'staff';   // staff／leader／admin
var NAME = '';
var photos = []; // 已壓縮的 dataURL
var busy = false, busySince = 0;
// 上一個動作卡住（例如定位一直沒回應）超過 25 秒就自動解除，並提示使用者，不再靜靜擋掉按鈕
function isBusy() {
  if (busy && Date.now() - busySince > 25000) busy = false;
  if (busy) toast('上一個動作還在處理中，請稍等幾秒');
  return busy;
}

function $(id) { return document.getElementById(id); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function msg(id, text, cls) { var m = $(id); m.textContent = text; m.className = 'msg ' + (cls || ''); }
function lock(on) { busy = on; busySince = Date.now(); ['btnIn', 'btnOut', 'btnSend', 'btnStay'].forEach(function (b) { $(b).disabled = on; }); }
function invalid(text) { $('app').classList.add('hide'); $('invalidText').textContent = text; $('invalid').classList.remove('hide'); }
function show(id) { ['app', 'login', 'invalid', 'admin'].forEach(function (x) { $(x).classList.toggle('hide', x !== id); }); }

function login() {
  var name = $('lname').value.trim(), pin = $('pin').value.trim();
  if (!name) { msg('mLogin', '請輸入姓名', 'err'); return; }
  if (!/^\d{4}$|^\d{6}$/.test(pin)) { msg('mLogin', '請輸入 PIN 碼', 'err'); return; }
  $('btnLogin').disabled = true; msg('mLogin', '確認中…');
  CODE = name + '|' + pin;
  load().then(function (ok) {
    $('btnLogin').disabled = false;
    if (ok) { store('dh_id', CODE); store('dh_pin', null); store('dh_lastname', name); $('pin').value = ''; msg('mLogin', ''); if (ok !== 'admin') show('app'); }
  });
}
function setCode(name, pin) { CODE = name + '|' + pin; store('dh_id', CODE); store('dh_pin', null); store('dh_lastname', name); }

// ===== 自己改 PIN（前賢是共用帳號，不開放）=====
var myPinLen = 4;
function myPinOpen() {
  myPinLen = ROLE === 'admin' ? 6 : 4;
  ['mpA', 'mpB'].forEach(function (i) { $(i).value = ''; $(i).maxLength = myPinLen; $(i).placeholder = (i === 'mpA' ? '新的 ' : '再輸入一次 ') + myPinLen + ' 位數 PIN'; });
  msg('mPin', ''); $('pinBox').classList.remove('hide'); $('mpA').focus();
}
function myPinClose() { $('pinBox').classList.add('hide'); }
function myPinSave() {
  var a = $('mpA').value.trim(), b = $('mpB').value.trim();
  if (!new RegExp('^\\d{' + myPinLen + '}$').test(a)) { msg('mPin', '請輸入 ' + myPinLen + ' 位數字', 'err'); return; }
  if (a !== b) { msg('mPin', '兩次輸入不一樣', 'err'); return; }
  msg('mPin', '更改中…');
  apiPost({ action: 'me', op: 'pin', u: CODE, pin: a }).then(function (r) {
    setCode(r.name, r.pin); myPinClose(); toast('PIN 已更改，請記好新的 PIN。其他手機下次打開要重新登入');
  }).catch(function (e) { msg('mPin', e.message === 'Failed to fetch' ? '網路異常，請再試一次' : e.message, 'err'); });
}
function logout(text) {
  pushLogout();
  lock(false); msg('mClock', '');
  store('dh_pin', null); store('dh_id', null); CODE = null; NAME = ''; myPinClose();
  $('who').textContent = ''; $('sIn').textContent = '—'; $('sOut').textContent = '—';
  AD = null; CASH = null; cashArm = ''; cashPh = []; qPh = []; cashPr = ''; prRepair = null; REP = null; repPh = []; repArm = ''; CHK = null; ROLE = 'staff'; $('tab-lead').classList.add('hide'); show('login'); msg('mLogin', text || '', text ? 'err' : '');
  if (!$('lname').value) $('lname').value = store('dh_lastname') || '';
  ($('lname').value ? $('pin') : $('lname')).focus();
}

function tab(t) {
  ['clock', 'report', 'schedule', 'news', 'lead'].forEach(function (x) {
    $(x).classList.toggle('hide', x !== t);
    $('tab-' + x).classList.toggle('on', x === t);
  });
  if (t === 'schedule') load();
  if (t === 'news') newsSeen();
  if (t === 'lead') leadStart();
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
// 先顯示手機上記住的上一次畫面，同時向後台要最新資料（打開 App 不用等）
function cacheKey(k) { return 'dh_' + k + '_' + CODE; }
function load() {
  var who = CODE;
  return apiGet({ action: 'status', u: CODE }).then(function (r) {
    if (CODE !== who) return false;
    if (CODE.indexOf('|') < 0 && r.name) { setCode(r.name, CODE); who = CODE; }   // 舊版只存 PIN → 升級成「姓名|PIN」
    store(cacheKey('st'), JSON.stringify(r));
    if (r.role === 'admin' || r.role === 'viewer') {
      var want = r.role === 'viewer' ? 'viewer' : 'admin';
      if (ROLE !== want || $('admin').classList.contains('hide')) adminStart(r);
      return 'admin';
    }
    applyStatus(r);
    syncPush();
    return true;
  }).catch(function (e) {
    if (/PIN/.test(e.message)) logout(e.message);
    else if (!$('app').classList.contains('hide')) { msg('mClock', '無法連線，畫面是上次的資料，請確認網路後重新整理', 'err'); }
    else if (!$('admin').classList.contains('hide')) adMsg('無法連線，畫面是上次的資料', true);
    else msg('mLogin', '無法連線，請確認網路後再試', 'err');
    return false;
  });
}
function applyStatus(r) {
    NAME = r.name;
    ROLE = r.leader ? 'leader' : 'staff';
    $('tab-lead').classList.toggle('hide', !r.leader);
    $('seg-cash').classList.toggle('hide', !!r.leader);          // 組員在「回報」裡有報修、財務；組長在「管理」裡
    $('seg-repair').classList.toggle('hide', !!r.leader);
    if (r.leader && ($('rCash').style.display !== 'none' || $('rRepair').style.display !== 'none')) seg('work');
    if (!r.leader && !$('lead').classList.contains('hide')) tab('clock');
    $('who').innerHTML = esc(r.name) + (r.leader ? '<span class="role">組長</span>' : '');
    $('today').textContent = r.today + '（' + WEEK[new Date(r.today + 'T00:00:00').getDay()] + '）';
    if (!$('rDate').value) $('rDate').value = r.today;
    if (r.areas && r.areas.join() !== AREAS.join()) { AREAS = r.areas; buildStay(true); }
    $('stayDate').textContent = r.today.slice(5).replace('-', '/') + '（' + WEEK[new Date(r.today + 'T00:00:00').getDay()] + '）';
    $('sIn').textContent = r.clock['簽到'] || '—';
    $('sOut').textContent = r.clock['簽退'] || '—';
    FEST = r.fest || [];
    $('festStaff').innerHTML = festCard(FEST, r.today);
    renderSchedule(r.schedule, r.today, r.days || 60);
    renderNews(r.news);
    if (!$('news').classList.contains('hide')) newsSeen();
    renderPushCards();
    if (typeof chkLoad === 'function') { CHK_HOST = 'chkStaff'; chkRender(); chkLoad('chkStaff'); }
}
// 打開 App：有上次的資料就立刻畫出來
function startCached() {
  var r = null;
  try { r = JSON.parse(store(cacheKey('st')) || 'null'); } catch (e) {}
  if (!r) { show('app'); return; }
  if (r.role === 'admin' || r.role === 'viewer') { adminStart(r); return; }
  if (r.today !== todayStr()) { r.today = todayStr(); r.clock = { 簽到: null, 簽退: null }; }   // 昨天的簽到退不要顯示
  show('app'); applyStatus(r);
}

// ===== 節日：簽到頁／今日頁的「近期節日」卡片，班表上的節日標籤 =====
var FEST = [];
function festDays(ds, today) { return Math.round((new Date(ds + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000); }
function festCard(list, today) {
  var soon = (list || []).filter(function (x) { var n = festDays(x.date, today); return n >= 0 && n <= 14; }).slice(0, 5);
  if (!soon.length) return '';
  return '<div class="card fest"><h3 class="ah">🏮 近期節日</h3>' + soon.map(function (x) {
    var n = festDays(x.date, today), d = new Date(x.date + 'T00:00:00');
    var when = n === 0 ? '今天' : n === 1 ? '明天' : '還有 ' + n + ' 天';
    return '<div class="frow' + (n <= x.lead ? ' near' : '') + '"><div><b>' + (d.getMonth() + 1) + '/' + d.getDate() + '（' + WEEK[d.getDay()] + '）</b> <small>' + esc(x.lunar) + '</small></div>'
      + '<div class="fn">' + esc(x.name) + (x.rite ? ' <small>' + esc(x.rite) + '</small>' : '') + '<span class="fw">' + when + '</span></div>'
      + (x.prep ? '<small class="fp">準備：' + esc(x.prep) + '</small>' : '') + '</div>';
  }).join('') + '</div>';
}
function festTag(ds) {
  var f = FEST.filter(function (x) { return x.date === ds; })[0];
  return f ? '<div class="ftag">🏮 ' + esc(f.lunar) + '・' + esc(f.name) + '</div>' : '';
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
         + '<div class="ppl">' + festTag(ds) + tags + '</div>'
         + '<button class="op' + (mine ? ' cancel' : '') + '" onclick="shiftOp(\'' + ds + '\',\'' + (mine ? 'cancel' : 'add') + '\',this)">'
         + (mine ? '取消' : '我要排') + '</button></div>';
  }
  $('schedList').innerHTML = html;
}

function shiftOp(date, op, btn) {
  if (isBusy()) return;
  busy = true; busySince = Date.now(); btn.disabled = true; btn.textContent = '…';
  apiPost({ action: 'shift', u: CODE, op: op, date: date })
    .then(function () { busy = false; return load(); })
    .catch(function (e) { busy = false; btn.disabled = false; btn.textContent = op === 'add' ? '我要排' : '取消'; alertMsg(e.message); });
}
function alertMsg(t) { var m = $('mSched'); m.textContent = t; m.className = 'msg err'; setTimeout(function () { m.textContent = ''; }, 4000); }
function esc(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

// ===== 簽到／簽退 =====
function getLoc(cb0) {
  // 有些手機在定位授權視窗沒關掉時，兩個回呼都不會發生；20 秒後一律放行（後台標「未取得定位」）
  var done = false, cb = function (a, b) { if (!done) { done = true; cb0(a, b); } };
  setTimeout(function () { cb(null, 'fail'); }, 20000);
  if (!navigator.geolocation) { cb(null, 'fail'); return; }
  navigator.geolocation.getCurrentPosition(
    function (p) { cb({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); },
    function (e) { cb(null, e.code === 1 ? 'denied' : 'fail'); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

var warned = false;
function clock(type) {
  if (isBusy()) return;
  if (type === '簽退' && $('sIn').textContent === '—' && !warned) {
    warned = true; msg('mClock', '今天還沒簽到，確定要簽退請再按一次', 'err'); return;
  }
  lock(true); msg('mClock', '處理中…');
  var who = CODE;   // 記下按鈕當下是誰，避免定位還沒回來就切換使用者
  getLoc(function (loc, err) {
    if (CODE !== who) return;
    if (err === 'denied') {
      lock(false);
      msg('mClock', '請允許「位置」權限後再簽到退（手機設定 → 瀏覽器 → 位置）', 'err');
      return;
    }
    // 取不到定位（逾時）仍送出，後台標示「未取得定位」
    apiPost({ action: 'clock', u: who, type: type,
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
  ['work', 'stay', 'repair', 'cash'].forEach(function (x) {
    $('r' + x.charAt(0).toUpperCase() + x.slice(1)).style.display = t === x ? '' : 'none';
    $('seg-' + x).classList.toggle('on', t === x);
  });
  if (t === 'cash') cashOpen('rCashBody');
  if (t === 'repair') repOpen('rRepairBody');
}

// 住廟回報：10 列，左邊選區域、右邊填姓名；空白列不送出。日期＝送出當天
function buildStay(keep) {
  var old = keep ? stayValues(true) : [];
  var opts = '<option value="">區域</option>' + AREAS.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join('');
  var html = '';
  for (var i = 0; i < STAY_ROWS; i++) {
    html += '<div class="srow"><span class="n">' + (i + 1) + '</span><select id="sa' + i + '">' + opts + '</select>'
         + '<input id="sn' + i + '" placeholder="姓名" maxlength="30">'
         + '<select id="sd' + i + '" class="sduty"><option value="">事務</option>' + STAY_DUTIES.map(function (d) { return '<option>' + d + '</option>'; }).join('') + '</select></div>';
  }
  $('stayRows').innerHTML = html;
  old.forEach(function (r, i) { if (i < STAY_ROWS) { $('sa' + i).value = r.area; $('sn' + i).value = r.name; $('sd' + i).value = r.duty || ''; } });
}
function stayValues(all) {
  var out = [];
  for (var i = 0; i < STAY_ROWS; i++) {
    var r = { area: $('sa' + i).value, name: $('sn' + i).value.trim(), duty: $('sd' + i).value };
    if (all || r.name || r.area) out.push(r);
  }
  return out;
}
function sendStay() {
  if (isBusy()) return;
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
  if (isBusy()) return;
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

// ===== 自動更新：回到 App 時、以及開著的時候每 60 秒更新一次；也可以按 ↻ =====
var lastRefresh = 0;
function canAutoRender() {
  var a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;      // 正在輸入
  if (typeof schedOpen !== 'undefined' && schedOpen) return false;          // 排班表單開著
  if (ROLE === 'admin' && adTab === 'settings') return false;
  if (typeof cashTyping === 'function' && cashTyping()) return false;
  if (typeof repTyping === 'function' && repTyping()) return false;
  return !['nuName', 'nuPin', 'nwTitle', 'nwBody', 'apPin', 'mpA'].some(function (id) { return $(id) && $(id).value; });
}
function refresh(force) {
  if (!CODE || document.hidden) return;
  if (!force && (Date.now() - lastRefresh < 15000 || busy)) return;
  lastRefresh = Date.now();
  if (force) toast('更新中…');
  var cashOn = typeof cashVisible === 'function' && cashVisible() && (force || canAutoRender());
  var repOn = typeof repVisible === 'function' && repVisible() && (force || canAutoRender());
  if (repOn) repLoad();
  if (typeof CHK_HOST !== 'undefined' && CHK_HOST && $(CHK_HOST) && $(CHK_HOST).offsetParent !== null && (force || canAutoRender())) chkLoad();
  if (ROLE === 'admin' || ROLE === 'viewer') { if (force || canAutoRender()) adminLoad(); if (cashOn) cashLoad(); return; }
  load();
  if (AD && !$('lead').classList.contains('hide') && (force || canAutoRender())) adminLoad();
  if (cashOn) cashLoad();
}
document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
setInterval(function () { refresh(); }, 60000);

// ===== 啟動 =====
document.addEventListener('keydown', function (e) { if (e.key !== 'Enter') return; if (e.target.id === 'pin') login(); if (e.target.id === 'lname') $('pin').focus(); });
if (!/^https?:\/\//.test(API)) invalid('系統尚未設定完成');
else {
  $('rDate').value = todayStr();
  renderPhotos();
  buildStay(false);
  // 管理者 PIN 是 6 位數
  $('pin').maxLength = 6; $('pin').placeholder = 'PIN 碼';
  $('lname').value = store('dh_lastname') || '';
  // 等 admin.js、push.js 也載入完再啟動
  document.addEventListener('DOMContentLoaded', function () {
    if (CODE) { startCached(); load(); } else show('login');
  });
}
