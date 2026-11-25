// ===== App 推播（Firebase Cloud Messaging）＋公告 =====
// Firebase 網頁設定與推播金鑰不是密碼（本來就會出現在網頁裡）
var FB = {
  apiKey: 'AIzaSyAnEEFWFIh925VP9Zk2QYAYcMoUxyWCrtI',
  authDomain: 'dehua-temple-managers-ap-ab58a.firebaseapp.com',
  projectId: 'dehua-temple-managers-ap-ab58a',
  storageBucket: 'dehua-temple-managers-ap-ab58a.firebasestorage.app',
  messagingSenderId: '1066790243199',
  appId: '1:1066790243199:web:e1762e1b3fdfd7f6ac284a'
};
var VAPID = 'BMN3Ortf7BjAljwT0T1tbUqIYjAY13F4filUmBq4cLZMAvI681AyWEtokKiEfWkzr9CosWeeh_M2G8pkIW4jlio';
var FBV = '12.6.0';
var _fbm = null;

function pushReady() { return FB.apiKey.indexOf('__') < 0 && VAPID.indexOf('__') < 0; }
function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function deviceName() { var u = navigator.userAgent; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : '電腦'; }

// off（尚未設定）／ios-home（iPhone 要先加到主畫面）／unsupported／denied／on／ask
function pushState() {
  if (!pushReady()) return 'off';
  if (!pushSupported()) return isIOS() && !standalone() ? 'ios-home' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted' && store('dh_push_tok')) return 'on';
  return 'ask';
}

function fbMessaging() {
  if (_fbm) return Promise.resolve(_fbm);
  var base = 'https://www.gstatic.com/firebasejs/' + FBV + '/';
  return Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-messaging.js')]).then(function (m) {
    var inst = m[1].getMessaging(m[0].initializeApp(FB));
    m[1].onMessage(inst, onForegroundPush);   // App 開著時收到的推播，改用畫面上方提示
    _fbm = { m: m[1], inst: inst };
    return _fbm;
  });
}
function pushToken() {
  return navigator.serviceWorker.register('firebase-messaging-sw.js').then(function (reg) {
    return fbMessaging().then(function (x) { return x.m.getToken(x.inst, { vapidKey: VAPID, serviceWorkerRegistration: reg }); });
  });
}
function rememberPush(tok) { store('dh_push_tok', tok); store('dh_push_for', CODE); store('dh_push_at', String(Date.now())); }

// 使用者按「開啟通知」（iPhone 規定一定要由按鈕觸發）
function enablePush(btn, msgId) {
  btn.disabled = true; msg(msgId, '開啟中…');
  Notification.requestPermission().then(function (p) {
    if (p !== 'granted') throw new Error(p === 'denied' ? '通知被拒絕了，請到手機設定開啟' : '沒有允許通知，請再按一次');
    return pushToken();
  }).then(function (tok) {
    return apiPost({ action: 'push', u: CODE, token: tok, device: deviceName(), op: 'test' }).then(function () { rememberPush(tok); });
  }).then(function () {
    toast('🔔 通知已開啟\n稍後會收到一則測試通知');
    renderPushCards();
  }).catch(function (e) {
    btn.disabled = false;
    msg(msgId, e.message === 'Failed to fetch' ? '網路異常，請再試一次' : e.message, 'err');
  });
}

// 每次打開 App：已允許通知的手機，自動更新登記（換人使用、代碼更新、每天一次）
function syncPush() {
  if (!CODE || !pushReady() || !pushSupported() || Notification.permission !== 'granted') return;
  pushToken().then(function (tok) {
    if (tok === store('dh_push_tok') && store('dh_push_for') === CODE && Date.now() - (+store('dh_push_at') || 0) < 86400000) return;
    return apiPost({ action: 'push', u: CODE, token: tok, device: deviceName() }).then(function () { rememberPush(tok); renderPushCards(); });
  }).catch(function () {});
}
// 切換使用者：這支手機先停止收原本那個人的通知
function pushLogout() {
  var t = store('dh_push_tok');
  if (t && CODE) apiPost({ action: 'push', u: CODE, token: t, op: 'remove' }).catch(function () {});
  store('dh_push_for', null);
}

function pushCard(msgId) {
  var st = pushState(), body = '';
  if (st === 'off' || st === 'on') return '';
  if (st === 'ask') body = '<p>開啟後，' + (AD ? '簽到退、異常回報、缺人提醒' : '公告和缺人提醒') + '會直接跳通知。</p>'
    + '<button class="big send" onclick="enablePush(this,\'' + msgId + '\')">開啟通知</button>';
  if (st === 'ios-home') body = '<p>iPhone 要先在 Safari 按「分享 → 加入主畫面」，再從主畫面的「德化打卡」打開，才能開啟通知（需 iOS 16.4 以上）。</p>';
  if (st === 'denied') body = '<p>這支手機關掉了通知。請到手機「設定 → 通知 → 德化打卡」改成允許，再重新打開 App。</p>';
  if (st === 'unsupported') body = '<p>這支手機目前不支援通知。Android 請用安裝包或 Chrome；iPhone 請更新到 iOS 16.4 以上並加到主畫面。</p>';
  return '<div class="card push"><label>🔔 通知</label>' + body + '<div class="msg" id="' + msgId + '"></div></div>';
}
function renderPushCards() {
  if ($('pushStaff')) $('pushStaff').innerHTML = pushCard('mPush');
  if (AD && adTab === 'news') adRender();
}

// App 開著時收到推播：上方提示，並更新公告
function onForegroundPush(p) {
  var n = (p && p.notification) || {};
  toast((n.title || '新通知') + (n.body ? '\n' + n.body : ''));
  if (AD) adminLoad(); else if (CODE) load();
}
function toast(t) {
  var el = $('toast');
  el.textContent = t; el.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('on'); }, 6000);
}

// ===== 公告（員工）=====
var NEWS = [];
function renderNews(list) {
  NEWS = list || [];
  var seen = store('dh_news_seen') || '', unread = NEWS.filter(function (n) { return n.time > seen; }).length;
  $('tab-news').innerHTML = '公告' + (unread ? '<i class="dot">' + unread + '</i>' : '');
  $('newsList').innerHTML = NEWS.length ? NEWS.map(function (n) {
    return '<div class="rep' + (n.time > seen ? ' new' : '') + '"><div><b>' + esc(n.title) + '</b><small>' + esc(n.time) + '</small></div>'
         + (n.body ? '<p>' + esc(n.body) + '</p>' : '') + '</div>';
  }).join('') : '<div class="empty">目前沒有公告</div>';
}
function newsSeen() {
  if (NEWS.length) store('dh_news_seen', NEWS[0].time);
  $('tab-news').innerHTML = '公告';
}
