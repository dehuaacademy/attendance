/**
 * 德化廟務 App（德化宮 廟務總管小組）｜簽到退＋回報＋自選排班＋管理者／組長／前賢介面＋App 推播與公告 後台（v5.3）
 * 這份程式碼放在公開的 GitHub（dehuaacademy/attendance/backend），不可寫入任何密碼或頻道名稱。
 * 更新方式：推到 GitHub 後，由獨立的「德化更新器」自動安裝並更新部署（見維護說明）。
 * 綁定在試算表「德化 廟務打卡紀錄」上，部署成網頁應用程式，只回傳資料（JSON），不負責畫面。
 * 前台網頁放在 GitHub Pages：https://dehuaacademy.github.io/attendance/
 *
 * 試算表分頁：
 *   人員     PIN｜姓名｜啟用（是／否）｜角色（組員／組長／前賢／執行長／財務／管理者）（舊資料的「員工」視同組員）
 *            執行長、財務＝唯讀看出勤＋零用金權限（執行長核准大額、財務撥款與核對）
 *            前賢＝唯讀帳號（看回報、排班、公告，收公告與異常回報通知），可多人共用一組 PIN ← App 管理介面或這裡都能改
 *   設定     項目｜值｜說明  ← 區域、定位範圍、可排班天數、推播開關；App 管理介面可改
 *   操作紀錄 管理者在 App 上的每一個操作
 *   排班表   組員在 App 自選日期登記／取消（系統寫入）；管理者也可以直接加列或改狀態
 *   打卡紀錄 系統自動寫入
 *   回報     事務回報，系統自動寫入（照片存雲端硬碟，這裡放連結）
 *   住廟回報 每位住廟者一列：送出日期｜回報人｜區域｜姓名（送出日期即住廟日期）
 *   推播裝置 每支開啟通知的手機一列（App 自動登記；失效的會標示，不用手動整理）
 *   公告     管理者在 App 發的公告
 *   零用金   零用金帳本（撥入／繳回／支出／代墊），收據照片存雲端硬碟
 *   統計     每天自動更新（也可從選單「德化廟務 → 更新統計」手動更新），不在 App 顯示
 *
 * 每天早上自動檢查未來 7 天，有哪天沒人排班就推播提醒（觸發器由 setup() 建立）。
 */

var VERSION = '6.0';          // 每次更新遞增；更新器用 ?action=ping 確認新版已上線

var CONFIG = {
  TEMPLE_LAT: 23.783748,      // 發一靈隱德化宮
  TEMPLE_LNG: 120.6999639,
  RADIUS_M: 500,              // 允許範圍（公尺）
  TZ: 'Asia/Taipei',
  MAX_PHOTOS: 3,
  MAX_PHOTO_CHARS: 4000000,   // 單張 base64 上限（約 3MB），前台已先壓縮到約 300KB
  SCHEDULE_DAYS: 60,          // 可登記、可查看：今天起幾天
  GAP_CHECK_DAYS: 7,          // 每天檢查未來幾天有沒有人排班
  GAP_CHECK_HOUR: 8,          // 每天幾點檢查（台北時間）
  PHOTO_ROOT: '德化 廟務回報照片',
  REPORT_KINDS: ['日報', '異常回報', '其他'],
  // 推播通知（ntfy）：頻道名稱等同密碼，存在「設定」分頁的「ntfy頻道」列，不寫在程式碼裡
  NOTIFY_REPORT_KINDS: ['異常回報'],  // 哪些回報類型要推播
  AREAS: ['北一區', '北二區', '桃竹苗', '中區', '南區'],   // 住廟回報的區域選項
  STAY_MAX_ROWS: 30,
  // App 推播（Firebase Cloud Messaging）。專案 ID 不是密碼，可以放這裡
  FCM_PROJECT_ID: 'dehua-temple-managers-ap-ab58a',
  APP_URL: 'https://dehuaacademy.github.io/attendance/',
  NEWS_DAYS: 60,              // App 顯示幾天內的公告
  NEWS_MAX: 20
};

var SHEETS = {
  users:    { name: '人員',     header: ['PIN', '姓名', '啟用', '角色'] },
  settings: { name: '設定',     header: ['項目', '值', '說明'] },
  oplog:    { name: '操作紀錄', header: ['時間', '操作者', '動作', '內容'] },
  schedule: { name: '排班表',   header: ['日期', '姓名', '上班', '下班', '備註', '來源', '狀態', '登記時間', '取消時間'] },
  clock:    { name: '打卡紀錄', header: ['日期', '時間', '姓名', '類型', '是否在範圍內', '距離(公尺)', '緯度', '經度', '定位精確度(公尺)', '伺服器時間戳記'] },
  report:   { name: '回報',     header: ['送出日期', '送出時間', '回報日期', '姓名', '類型', '內容', '照片1', '照片2', '照片3', '伺服器時間戳記'] },
  stay:     { name: '住廟回報', header: ['送出日期', '送出時間', '回報人', '區域', '姓名', '伺服器時間戳記'] },
  devices:  { name: '推播裝置', header: ['Token', '姓名', '角色', '裝置', '登記時間', '最後更新', '狀態'] },
  news:     { name: '公告',     header: ['時間', '發布者', '標題', '內容', '送達手機數'] },
  cash:     { name: '零用金',   header: ['編號', '建立時間', '日期', '類型', '金額', '科目', '說明', '經手人', '收據1', '收據2', '收據3', '狀態', '核准金額', '核准人', '核准時間', '核對人', '核對時間', '還款時間', '備註'] },
  stats:    { name: '統計',     header: ['月份', '姓名', '排班天數', '出勤天數', '實際出勤時數', '缺簽退天數', '更新時間'] }
};

// ===== 可在 App 管理介面修改的設定（存在「設定」分頁；分頁沒有的項目用這裡的預設值）=====
var SETTINGS = [
  ['住廟區域',       '北一區,北二區,桃竹苗,中區,南區', '用逗號分隔'],
  ['定位範圍(公尺)', '500', '簽到退時離德化宮多遠以內算「範圍內」'],
  ['可排班天數',     '60',  '今天起幾天內可以登記'],
  ['推播：簽到簽退', '是',  '是／否'],
  ['推播：異常回報', '是',  '是／否'],
  ['推播：排班異動', '是',  '是／否'],
  ['推播：缺人檢查', '是',  '是／否（每天 8 點檢查未來 7 天；管理者和同仁都會收到）'],
  ['推播：ntfy',     '是',  '是／否（舊的 ntfy 通知；App 推播穩定後可以關掉）'],
  ['推播：零用金',   '是',  '是／否（支出、待核准、撥款、低餘額通知）'],
  ['零用金科目',     '香燭供品,供果供品,食材,清潔用品,水電修繕,交通,餐點,文具,雜支', '用逗號分隔'],
  ['零用金核准門檻(元)', '5000', '超過這個金額要先申請，執行長核准後才能花'],
  ['免核准科目',     '供果供品', '這些科目超過門檻也不用核准，用逗號分隔'],
  ['零用金低餘額(元)', '2000', '組長手上餘額低於這個數字時通知組長、財務、管理者']
];
var _cfg = null;

// ===== 角色 =====
var ROLES = ['組員', '組長', '前賢', '執行長', '財務', '管理者'];
var VIEW_ROLES = ['前賢', '執行長', '財務'];     // 唯讀看出勤（排班、回報、公告）
var PUSH_DESC = { '組員': '公告和缺人提醒', '組長': '簽到退、異常回報、缺人提醒、零用金和公告', '前賢': '公告和異常回報',
                  '執行長': '公告和零用金核准', '財務': '公告和零用金', '管理者': '簽到退、異常回報、缺人提醒和零用金' };

// ===== 快取：讀試算表很慢（每次 0.2–0.5 秒），常用資料放在 Script Cache 最多 10 分鐘 =====
// App 裡任何寫入都會立刻清掉相關快取；直接改試算表會由 onEdit 清掉全部快取
var CACHE_TTL = 600;
var CK = { users: 'c_users', settings: 'c_settings', shifts: 'c_shifts_', news: 'c_news_', clock: 'c_clock_',
           reports: 'c_reports', stays: 'c_stays', dev: 'c_dev', photos: 'c_photos', cash: 'c_cash' };   // 結尾是 _ 的會加上今天日期
var _users = null, _bustKeys = [];
function cache_(key, loader) {
  var c = CacheService.getScriptCache(), v = null;
  try { v = c.get(key); } catch (e) {}
  if (v) { try { return JSON.parse(v); } catch (e) {} }
  var x = loader();
  try { c.put(key, JSON.stringify(x), CACHE_TTL); } catch (e) {}
  return x;
}
function bust_(names) {
  var t = day_(0);
  var keys = names.map(function (n) { var k = CK[n]; return /_$/.test(k) ? k + t : k; });
  if (names.indexOf('users') >= 0) _users = null;
  if (names.indexOf('settings') >= 0) _cfg = null;
  _bustKeys = _bustKeys.concat(keys);
  try { CacheService.getScriptCache().removeAll(keys); } catch (e) {}
}
function bustAll_() { bust_(Object.keys(CK)); }
function onEdit() { bustAll_(); }   // 有人直接改試算表

function settingsRows_() {
  return cache_(CK.settings, function () {
    var sh = sheet_('settings');
    return sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues() : [];
  });
}
// 今天的簽到退（依時間順序）
function clockToday_() {
  var today = day_(0);
  return cache_(CK.clock + today, function () {
    var out = [], ck = sheet_('clock'), last = ck.getLastRow();
    if (last < 2) return out;
    var st = Math.max(2, last - 300);
    ck.getRange(st, 1, last - st + 1, 6).getDisplayValues().forEach(function (r) {
      if (normDate_(r[0]) === today) out.push({ time: hhmm_(r[1]), name: r[2], type: r[3], inRange: r[4], dist: r[5] });
    });
    return out;
  });
}
function splitList_(v) { return String(v || '').split(/[,，、]/).map(function (x) { return x.trim(); }).filter(String); }
function cfg_() {
  if (_cfg) return _cfg;
  var map = {};
  SETTINGS.forEach(function (r) { map[r[0]] = r[1]; });
  settingsRows_().forEach(function (r) {
    if (r[0] && r[1] !== '') map[r[0]] = r[1];
  });
  var areas = String(map['住廟區域']).split(/[,，、]/).map(function (x) { return x.trim(); }).filter(String);
  _cfg = {
    areas: areas.length ? areas : CONFIG.AREAS,
    radius: Number(map['定位範圍(公尺)']) || CONFIG.RADIUS_M,
    days: Math.min(365, Math.max(7, Number(map['可排班天數']) || CONFIG.SCHEDULE_DAYS)),
    nClock: map['推播：簽到簽退'] !== '否',
    nReport: map['推播：異常回報'] !== '否',
    nShift: map['推播：排班異動'] !== '否',
    nGap: map['推播：缺人檢查'] !== '否',
    nNtfy: map['推播：ntfy'] !== '否',
    ntfy: String(map['ntfy頻道'] || '').trim(),
    mailTo: String(map['備援Email'] || '').trim(),
    nCash: map['推播：零用金'] !== '否',
    cashCats: splitList_(map['零用金科目']),
    cashLimit: Number(map['零用金核准門檻(元)']) || 5000,
    cashExempt: splitList_(map['免核准科目']),
    cashLow: Number(map['零用金低餘額(元)']) || 2000
  };
  return _cfg;
}

// ===== 入口 =====
function doGet(e) {
  return handle_(function () {
    var p = (e && e.parameter) || {};
    if (p.action === 'ping') return { version: VERSION };
    if (p.action === 'status') return status_(p.u);
    throw new Error('未知的操作');
  });
}

function doPost(e) {
  return handle_(function () {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'clock')  return clock_(body);
    if (body.action === 'report') return report_(body);
    if (body.action === 'shift')  return shift_(body);
    if (body.action === 'stay')   return stay_(body);
    if (body.action === 'admin')  return admin_(body);
    if (body.action === 'push')   return push_(body);
    if (body.action === 'photo')  return photo_(body);
    if (body.action === 'thumbs') return thumbs_(body);
    if (body.action === 'cash')   return cash_(body);
    if (body.action === 'me')     return me_(body);
    throw new Error('未知的操作');
  });
}

function handle_(fn) {
  var out;
  // 先強制寫入試算表：寫入被拒（例如資料驗證不符）時會在這裡變成錯誤，不會假裝成功
  try {
    out = fn(); SpreadsheetApp.flush(); out.ok = true;
    // 寫入完成後再清一次快取，避免寫入期間有人讀到舊資料又放回快取
    if (_bustKeys.length) try { CacheService.getScriptCache().removeAll(_bustKeys); } catch (e) {}
  }
  catch (err) { out = { ok: false, error: String(err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ===== 狀態：姓名、今日打卡、全組班表 =====
function status_(code) {
  var who = auth_(code);
  var today = fmt_(new Date(), 'yyyy-MM-dd');
  if (who.role === '管理者') return { name: who.name, role: 'admin', today: today };
  if (VIEW_ROLES.indexOf(who.role) >= 0) return { name: who.name, role: 'viewer', title: who.role, today: today };
  var name = who.name;
  var res = { name: name, leader: who.role === '組長', today: today, clock: { 簽到: null, 簽退: null }, schedule: [] };

  clockToday_().forEach(function (c) {
    if (c.name !== name) return;
    if (c.type === '簽到' && !res.clock['簽到']) res.clock['簽到'] = c.time;   // 第一次簽到
    if (c.type === '簽退') res.clock['簽退'] = c.time;                         // 最後一次簽退
  });

  res.days = cfg_().days;
  res.areas = cfg_().areas;
  res.news = news_(CONFIG.NEWS_MAX);
  res.schedule = shifts_(today, day_(cfg_().days - 1)).map(function (s) {
    return { date: s.date, name: s.name, start: s.start, end: s.end, note: s.note };
  });
  return res;
}

// ===== 自選排班：登記／取消（立即生效，沒有取消期限）=====
function shift_(b) {
  var name = user_(b.u);
  var date = normDate_(b.date);
  var today = day_(0), last = day_(cfg_().days - 1);
  if (!date || date < today || date > last) throw new Error('只能登記今天起 ' + cfg_().days + ' 天內的日期');
  if (b.op !== 'add' && b.op !== 'cancel') throw new Error('未知的操作');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var mine = shifts_(date, date, true).filter(function (s) { return s.name === name; });
    var sh = sheet_('schedule');
    var now = new Date();
    bust_(['shifts']);
    if (b.op === 'add') {
      if (mine.length) throw new Error('你已經登記這天了');
      sh.appendRow(["'" + date, name, '', '', '', '自選', '已登記', now, '']);
    } else {
      if (!mine.length) throw new Error('你沒有登記這天');
      mine.forEach(function (s) { sh.getRange(s.row, 7, 1, 3).setValues([['已取消', s.created, now]]); });
    }
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }

  var label = date.slice(5).replace('-', '/') + '（' + '日一二三四五六'.charAt(dow_(date)) + '）';
  if (!cfg_().nShift) return { date: date, op: b.op };
  if (b.op === 'add') notify_('📅 ' + name + ' 登記 ' + label, '自選排班', 2);
  else notify_('↩️ ' + name + ' 取消 ' + label, shifts_(date, date).length ? '這天還有其他人' : '這天目前沒人排班', 3);
  return { date: date, op: b.op };
}

// 讀排班表中「有效」的班（排除已取消），日期區間含頭尾
function shifts_(from, to, fresh) {
  var today = day_(0);
  if (!fresh && from >= today) {
    return cache_(CK.shifts + today, function () {
      return readShifts_(today, '9999-12-31').map(function (s) { s.created = ''; return s; });
    }).filter(function (s) { return s.date >= from && s.date <= to; });
  }
  return readShifts_(from, to);
}
function readShifts_(from, to) {
  var sh = sheet_('schedule'), out = [];
  var n = sh.getLastRow() - 1;
  if (n < 1) return out;
  var vals = sh.getRange(2, 1, n, 9).getDisplayValues();
  var raw = sh.getRange(2, 8, n, 1).getValues();
  vals.forEach(function (r, i) {
    var d = normDate_(r[0]);
    if (d && r[1] && r[6] !== '已取消' && d >= from && d <= to) {
      out.push({ row: i + 2, date: d, name: r[1], start: r[2], end: r[3], note: r[4], created: raw[i][0] });
    }
  });
  out.sort(function (a, b) { return (a.date + a.start + a.name).localeCompare(b.date + b.start + b.name); });
  return out;
}

// ===== 打卡 =====
function clock_(b) {
  var name = user_(b.u);
  if (b.type !== '簽到' && b.type !== '簽退') throw new Error('類型錯誤');

  var now = new Date();
  var inRange = '未取得定位', dist = '', lat = '', lng = '', acc = '';
  if (isFinite(b.lat) && isFinite(b.lng) && b.lat !== null && b.lng !== null) {
    lat = Number(b.lat); lng = Number(b.lng);
    acc = isFinite(b.acc) ? Math.round(b.acc) : '';
    dist = Math.round(distanceM_(lat, lng, CONFIG.TEMPLE_LAT, CONFIG.TEMPLE_LNG));
    inRange = dist <= cfg_().radius ? '是' : '否';
  }
  // 日期、時間前加 ' 存成文字，避免試算表自動轉格式
  bust_(['clock']);
  sheet_('clock').appendRow(["'" + fmt_(now, 'yyyy-MM-dd'), "'" + fmt_(now, 'HH:mm:ss'), name, b.type,
                             inRange, dist, lat, lng, acc, now]);

  var ok = inRange === '是';
  if (cfg_().nClock) notify_((ok ? '🟢 ' : '⚠️ ') + name + ' ' + fmt_(now, 'HH:mm') + ' ' + b.type,
          inRange === '是' ? '範圍內（' + dist + ' 公尺）'
          : inRange === '否' ? '範圍外（距離 ' + dist + ' 公尺）'
          : '未取得定位', ok ? 3 : 4);
  // 只回傳時間，不回傳距離／是否在範圍內
  return { time: fmt_(now, 'HH:mm'), type: b.type };
}

// ===== 回報（可附照片）=====
function report_(b) {
  var name = user_(b.u);
  var text = String(b.text || '').trim();
  var photos = Array.isArray(b.photos) ? b.photos : [];
  if (!text && !photos.length) throw new Error('請填寫內容或附上照片');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date))) throw new Error('日期格式錯誤');
  if (CONFIG.REPORT_KINDS.indexOf(b.kind) < 0) throw new Error('回報類型錯誤');
  if (photos.length > CONFIG.MAX_PHOTOS) throw new Error('照片最多 ' + CONFIG.MAX_PHOTOS + ' 張');

  var now = new Date();
  var links = ['', '', ''];
  if (photos.length) {
    var folder = monthFolder_(now);
    var stamp = fmt_(now, 'yyyyMMdd_HHmmss');
    photos.forEach(function (p, i) {
      var data = String(p).replace(/^data:image\/\w+;base64,/, '');
      if (data.length > CONFIG.MAX_PHOTO_CHARS) throw new Error('第 ' + (i + 1) + ' 張照片太大');
      var blob = Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', stamp + '_' + name + '_' + (i + 1) + '.jpg');
      links[i] = folder.createFile(blob).getUrl();
    });
  }
  bust_(['reports', 'photos']);
  sheet_('report').appendRow(["'" + fmt_(now, 'yyyy-MM-dd'), "'" + fmt_(now, 'HH:mm:ss'), "'" + b.date, name, b.kind,
                              text, links[0], links[1], links[2], now]);

  if (cfg_().nReport && CONFIG.NOTIFY_REPORT_KINDS.indexOf(b.kind) >= 0) {
    notify_('🔴 ' + name + ' ' + b.kind,
            (text ? text.slice(0, 200) : '（無文字）') + (photos.length ? '\n附照片 ' + photos.length + ' 張' : ''), 4, ['管理者', '組長', '前賢']);
  }
  return { time: fmt_(now, 'HH:mm'), photos: photos.length };
}

// ===== 每天自動執行：檢查未來 7 天有沒有人排班，並更新統計 =====
function dailyCheck() {
  var from = day_(1), to = day_(CONFIG.GAP_CHECK_DAYS);
  var taken = {};
  shifts_(from, to).forEach(function (s) { taken[s.date] = true; });
  var gaps = [];
  for (var i = 1; i <= CONFIG.GAP_CHECK_DAYS; i++) {
    var d = day_(i);
    if (!taken[d]) gaps.push(d.slice(5).replace('-', '/') + '（' + '日一二三四五六'.charAt(dow_(d)) + '）');
  }
  if (gaps.length && cfg_().nGap) notify_('⚠️ 未來 ' + CONFIG.GAP_CHECK_DAYS + ' 天有 ' + gaps.length + ' 天沒人排班', gaps.join('、') + '\n打開 App「班表」就能登記', 4, 'all');
  updateStats();
}

// ===== 統計：每人每月 排班天數／出勤天數／實際出勤時數／缺簽退天數（只寫在試算表）=====
function updateStats() {
  var agg = {};
  function cell(month, name) {
    var k = month + '|' + name;
    return agg[k] || (agg[k] = { month: month, name: name, shift: {}, att: 0, hours: 0, miss: 0 });
  }
  shifts_('2000-01-01', '2999-12-31').forEach(function (s) { cell(s.date.slice(0, 7), s.name).shift[s.date] = true; });

  var ck = sheet_('clock'), n = ck.getLastRow() - 1, days = {};
  if (n > 0) {
    ck.getRange(2, 1, n, 4).getDisplayValues().forEach(function (r) {
      var d = normDate_(r[0]), m = String(r[1]).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (!d || !r[2] || !m) return;
      var hh = +m[1];
      if (/下午|PM/i.test(r[1]) && hh < 12) hh += 12;
      if (/上午|AM/i.test(r[1]) && hh === 12) hh = 0;
      var t = hh * 3600 + (+m[2]) * 60 + (+(m[3] || 0));
      var k = d + '|' + r[2], x = days[k] || (days[k] = { date: d, name: r[2], in: null, out: null });
      if (r[3] === '簽到' && (x.in === null || t < x.in)) x.in = t;      // 當天第一次簽到
      if (r[3] === '簽退' && (x.out === null || t > x.out)) x.out = t;   // 當天最後一次簽退
    });
  }
  Object.keys(days).forEach(function (k) {
    var x = days[k];
    if (x.in === null) return;
    var c = cell(x.date.slice(0, 7), x.name);
    c.att++;
    if (x.out !== null && x.out > x.in) c.hours += (x.out - x.in) / 3600; else c.miss++;
  });

  var now = fmt_(new Date(), 'yyyy-MM-dd HH:mm');
  var rows = Object.keys(agg).map(function (k) {
    var c = agg[k];
    return [c.month, c.name, Object.keys(c.shift).length, c.att, Math.round(c.hours * 10) / 10, c.miss, now];
  }).sort(function (a, b) { return a[0] === b[0] ? String(a[1]).localeCompare(b[1]) : (a[0] < b[0] ? 1 : -1); });

  var sh = sheet_('stats');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 7).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, 7).setNumberFormat('@').setValues(rows.map(function (r) {
    return r.map(String);
  }));
}

// 試算表上方選單
function onOpen() {
  SpreadsheetApp.getUi().createMenu('德化廟務')
    .addItem('更新統計', 'updateStats')
    .addItem('立即檢查未來 7 天排班', 'dailyCheck')
    .addToUi();
}

// ===== 住廟回報：一次送出多位（區域＋姓名），日期即送出當天 =====
function stay_(b) {
  var who = user_(b.u);
  var rows = (Array.isArray(b.rows) ? b.rows : []).map(function (r) {
    return { area: String(r && r.area || '').trim(), name: String(r && r.name || '').trim() };
  }).filter(function (r) { return r.name; });
  if (!rows.length) throw new Error('請至少填一位住廟者');
  if (rows.length > CONFIG.STAY_MAX_ROWS) throw new Error('一次最多 ' + CONFIG.STAY_MAX_ROWS + ' 位');
  rows.forEach(function (r, i) {
    if (cfg_().areas.indexOf(r.area) < 0) throw new Error('第 ' + (i + 1) + ' 位「' + r.name + '」請選擇區域');
    if (r.name.length > 30) throw new Error('姓名太長：' + r.name.slice(0, 10) + '…');
  });
  var now = new Date(), d = "'" + fmt_(now, 'yyyy-MM-dd'), t = "'" + fmt_(now, 'HH:mm:ss');
  var sh = sheet_('stay');
  bust_(['stays']);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 6).setValues(rows.map(function (r) {
    return [d, t, who, r.area, r.name, now];
  }));
  return { time: fmt_(now, 'HH:mm'), count: rows.length };
}

// ===== 管理者介面 =====
function admin_(b) {
  var me = auth_(b.u);
  var LEADER_OPS = ['overview', 'shift', 'clockFix'];   // 組長可以做的管理操作
  var VIEWER_OPS = ['overview'];                        // 前賢只能看
  var allowed = me.role === '管理者' || (me.role === '組長' && LEADER_OPS.indexOf(b.op) >= 0) || (VIEW_ROLES.indexOf(me.role) >= 0 && VIEWER_OPS.indexOf(b.op) >= 0);
  if (!allowed) throw new Error('沒有管理權限');
  var op = b.op, today = day_(0), r;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (op === 'overview') return overview_(today, me.role === '管理者' ? 'admin' : me.role === '組長' ? 'leader' : 'viewer');

    if (op === 'addUser') {
      var name = String(b.name || '').trim();
      if (!name || name.length > 20) throw new Error('請輸入姓名');
      if (/[|｜]/.test(name)) throw new Error('姓名不能有「|」');
      if (users_().some(function (u) { return u.name === name; })) throw new Error('已經有「' + name + '」了');
      var pin = newPin_(b.pin);
      var nrole = VIEW_ROLES.indexOf(b.role) >= 0 ? b.role : '組員';
      bust_(['users', 'dev']);
      sheet_('users').appendRow(["'" + pin, name, '是', nrole]);
      log_(me.name, '新增人員', name + (nrole !== '組員' ? '（' + nrole + '）' : ''));
      return { name: name, pin: pin, role: nrole };
    }

    var target = null;
    if (b.name) {
      target = users_().filter(function (u) { return u.name === b.name; })[0];
      if (!target && op !== 'shift' && op !== 'clockFix') throw new Error('找不到「' + b.name + '」');
    }

    if ((op === 'setPin' || op === 'setEnabled' || op === 'device' || op === 'setRole') && !target) throw new Error('請選擇人員');

    if (op === 'setRole') {
      if (target.role === '管理者') throw new Error('管理者帳號不能改角色');
      var role = ['組長'].concat(VIEW_ROLES).indexOf(b.role) >= 0 ? b.role : '組員';
      bust_(['users', 'dev']);
      sheet_('users').getRange(target.row, 4).setValue(role);
      log_(me.name, '角色改為' + role, target.name);
      return { name: target.name, role: role };
    }
    if (op === 'adminPin') {
      var np = String(b.pin || '').trim();
      if (!/^\d{6}$/.test(np)) throw new Error('管理者 PIN 要 6 位數字');
      checkPin_(np);
      bust_(['users']);
      sheet_('users').getRange(me.row, 1).setValue("'" + np);
      log_(me.name, '更換管理者 PIN', '');
      return { pin: np, name: me.name };
    }

    if (op === 'setPin') {
      if (target.role === '管理者' && !b.pin) throw new Error('管理者 PIN 請自行指定 6 位數');
      if (target.role === '管理者' && b.pin && !/^\d{6}$/.test(b.pin)) throw new Error('管理者 PIN 要 6 位數');
      var p = target.role === '管理者' ? String(b.pin || '') : newPin_(b.pin);
      if (target.role === '管理者') checkPin_(p);
      bust_(['users']);
      sheet_('users').getRange(target.row, 1).setValue("'" + p);
      log_(me.name, '更換 PIN', target.name);
      return { name: target.name, pin: p };
    }
    if (op === 'setEnabled') {
      if (target.role === '管理者') throw new Error('管理者帳號請到試算表修改');
      bust_(['users', 'dev']);
      sheet_('users').getRange(target.row, 3).setValue(b.enabled ? '是' : '否');
      log_(me.name, b.enabled ? '啟用' : '停用', target.name);
      return { name: target.name, enabled: !!b.enabled };
    }
    if (op === 'device') {
      if (!target || target.role === '管理者' || !target.enabled) throw new Error('只能設定已啟用的人員');
      log_(me.name, '設定手機登入', target.name);
      return { name: target.name, pin: target.pin };
    }

    if (op === 'shift') {
      if (!target || (target.role !== '組員' && target.role !== '組長')) throw new Error('請選擇組員');
      var date = normDate_(b.date);
      if (!date || date < today || date > day_(cfg_().days - 1)) throw new Error('日期超出可排班範圍');
      var sh = sheet_('schedule');
      var mine = shifts_(date, date, true).filter(function (s) { return s.name === target.name; });
      bust_(['shifts']);
      var st = hhmmIn_(b.start), en = hhmmIn_(b.end), note = String(b.note || '').slice(0, 50);
      if (b.mode === 'cancel') {
        if (!mine.length) throw new Error(target.name + ' 這天沒有班');
        mine.forEach(function (x) { sh.getRange(x.row, 7, 1, 3).setValues([['已取消', x.created, new Date()]]); });
        log_(me.name, '取消排班', target.name + ' ' + date);
      } else if (mine.length) {
        sh.getRange(mine[0].row, 3, 1, 3).setValues([[st ? "'" + st : '', en ? "'" + en : '', note]]);
        log_(me.name, '修改排班', target.name + ' ' + date + ' ' + st + '-' + en + ' ' + note);
      } else {
        sh.appendRow(["'" + date, target.name, st ? "'" + st : '', en ? "'" + en : '', note, me.role, '已登記', new Date(), '']);
        log_(me.name, '新增排班', target.name + ' ' + date + ' ' + st + '-' + en + ' ' + note);
      }
      SpreadsheetApp.flush();
      return { ok2: true };
    }

    if (op === 'clockFix') {
      if (!target || (target.role !== '組員' && target.role !== '組長')) throw new Error('請選擇組員');
      var d = normDate_(b.date), t = hhmmIn_(b.time);
      if (!d || d > today) throw new Error('日期錯誤');
      if (!t) throw new Error('請輸入時間');
      if (b.type !== '簽到' && b.type !== '簽退') throw new Error('類型錯誤');
      bust_(['clock']);
      sheet_('clock').appendRow(["'" + d, "'" + t + ':00', target.name, b.type, me.role === '管理者' ? '管理者補登' : '組長補登', '', '', '', '', new Date()]);
      log_(me.name, '補登' + b.type, target.name + ' ' + d + ' ' + t);
      return { ok2: true };
    }

    if (op === 'settings') {
      var v = b.values || {}, sh2 = sheet_('settings');
      bust_(['settings']);
      var rows = SETTINGS.map(function (x) {
        var val = v.hasOwnProperty(x[0]) ? String(v[x[0]]).trim() : null;
        return [x[0], val, x[2]];
      });
      if (v['住廟區域'] !== undefined && !String(v['住廟區域']).replace(/[,，、\s]/g, '')) throw new Error('區域不能空白');
      if (v['定位範圍(公尺)'] !== undefined && !(Number(v['定位範圍(公尺)']) >= 50)) throw new Error('定位範圍至少 50 公尺');
      var cur = {};
      if (sh2.getLastRow() > 1) sh2.getRange(2, 1, sh2.getLastRow() - 1, 2).getDisplayValues().forEach(function (r, i) { cur[r[0]] = i + 2; });
      var changed = [];
      rows.forEach(function (x) {
        if (x[1] === null) return;
        if (cur[x[0]]) sh2.getRange(cur[x[0]], 2).setValue("'" + x[1]);
        else sh2.appendRow([x[0], "'" + x[1], x[2]]);
        changed.push(x[0] + '=' + x[1]);
      });
      _cfg = null;
      log_(me.name, '修改設定', changed.join('；'));
      return { ok2: true };
    }

    if (op === 'notifyTest') return notify_('🔧 德化廟務通知測試', '管理者送出的測試通知', 3);

    if (op === 'announce') {
      var title = String(b.title || '').trim(), body = String(b.body || '').trim();
      if (!title || title.length > 40) throw new Error('標題請填 1–40 字');
      if (body.length > 1000) throw new Error('內容最多 1000 字');
      var res = fcm_(devices_(['組員', '組長'].concat(VIEW_ROLES)), '📢 ' + title, body || title, 'news');
      bust_(['news']);
      sheet_('news').appendRow(["'" + fmt_(new Date(), 'yyyy-MM-dd HH:mm'), me.name, title, body, res.sent]);
      log_(me.name, '發公告', title + '（送達 ' + res.sent + ' 支手機）');
      return { sent: res.sent, error: res.error || '' };
    }
    throw new Error('未知的管理操作');
  } finally { lock.releaseLock(); }
}

function overview_(today, mode) {
  var c = cfg_(), full = mode === 'admin', viewer = mode === 'viewer';
  var users = users_().map(function (u) { return { name: u.name, pin: full && u.role !== '管理者' ? u.pin : '', enabled: u.enabled, role: u.role }; });

  var clock = clockToday_();
  function tail(key, cols, k) {
    var sh = sheet_(key), m = sh.getLastRow() - 1;
    if (m < 1) return [];
    var s0 = Math.max(2, sh.getLastRow() - k + 1);
    return sh.getRange(s0, 1, sh.getLastRow() - s0 + 1, cols).getDisplayValues().reverse();
  }
  var reports = cache_(CK.reports, function () {
    return tail('report', 9, 30).map(function (r) {
      return { date: normDate_(r[0]), time: hhmm_(r[1]), forDate: normDate_(r[2]), name: r[3], kind: r[4], text: r[5], photos: [r[6], r[7], r[8]].filter(String) };
    });
  });
  var stays = cache_(CK.stays, function () {
    return tail('stay', 5, 60).map(function (r) { return { date: normDate_(r[0]), by: r[2], area: r[3], name: r[4] }; });
  });

  var settings = {};
  SETTINGS.forEach(function (x) { settings[x[0]] = { value: x[1], note: x[2] }; });
  settingsRows_().forEach(function (r) {
    if (settings[r[0]] && r[1] !== '') settings[r[0]].value = r[1];
  });

  return {
    today: today, days: c.days, users: viewer ? [] : users, clock: viewer ? [] : clock,
    schedule: shifts_(today, day_(c.days - 1)).map(function (s) { return { date: s.date, name: s.name, start: s.start, end: s.end, note: s.note }; }),
    reports: reports, stays: stays, settings: full ? settings : {},
    news: news_(CONFIG.NEWS_MAX), devices: viewer ? {} : deviceCount_(), role: mode
  };
}

// 產生或檢查 4 位數 PIN。v6.0 起登入要「姓名＋PIN」，所以 PIN 可以和別人重複（也不能檢查重複，否則等於洩漏別人的 PIN）
function newPin_(want) {
  want = String(want || '').trim();
  if (want) {
    if (!/^\d{4}$/.test(want)) throw new Error('PIN 要 4 位數字');
    return checkPin_(want);
  }
  for (var i = 0; i < 200; i++) {
    var p = ('000' + Math.floor(Math.random() * 10000)).slice(-4);
    if (!weakPin_(p) && new Set(p.split('')).size > 2) return p;
  }
  throw new Error('無法產生 PIN，請手動指定');
}
// 太好猜的 PIN：全部同一個數字、連號（1234、9876、123456…）
function weakPin_(p) { return /^(\d)\1+$/.test(p) || '01234567890'.indexOf(p) >= 0 || '09876543210'.indexOf(p) >= 0; }
function checkPin_(p) { if (weakPin_(p)) throw new Error('這組 PIN 太好猜（同一個數字或連號），請換一組'); return p; }

// 自己改 PIN（前賢是共用帳號，只能由管理者改）
function me_(b) {
  var who = auth_(b.u);
  if (b.op !== 'pin') throw new Error('未知的操作');
  if (who.role === '前賢') throw new Error('前賢是共用帳號，請管理者更改 PIN');
  var p = String(b.pin || '').trim(), len = who.role === '管理者' ? 6 : 4;
  if (!new RegExp('^\\d{' + len + '}$').test(p)) throw new Error('PIN 要 ' + len + ' 位數字');
  checkPin_(p);
  if (p === who.pin) throw new Error('和原本的 PIN 一樣');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    bust_(['users']);
    sheet_('users').getRange(who.row, 1).setValue("'" + p);
    log_(who.name, '自己更換 PIN', '');
  } finally { lock.releaseLock(); }
  return { name: who.name, pin: p };
}
function hhmmIn_(s) { var m = String(s || '').match(/^(\d{1,2}):(\d{2})$/); return m && +m[1] < 24 && +m[2] < 60 ? ('0' + m[1]).slice(-2) + ':' + m[2] : ''; }
function log_(who, action, detail) {
  try { sheet_('oplog').appendRow(["'" + fmt_(new Date(), 'yyyy-MM-dd HH:mm:ss'), who, action, detail]); } catch (e) {}
}

// ===== 推播通知 =====
// audience：'admin'（預設：管理者＋組長）、'all'（管理者＋組長＋組員）、或角色陣列
// App 推播（FCM）和 ntfy 並行；兩種都沒送到管理者時改寄 Email。通知失敗不影響打卡
function notify_(title, message, priority, audience) {
  var c = cfg_(), toAdmin = 0, ntfyOk = false, rep = { fcm: '', ntfy: '', mail: '' };
  try {
    var roles = Array.isArray(audience) ? audience : audience === 'all' ? ['管理者', '組長', '組員'] : ['管理者', '組長'];
    var list = devices_(roles);
    var r = fcm_(list, title, message, audience === 'all' ? 'all' : 'admin');
    toAdmin = r.sentAdmin;
    rep.fcm = '裝置 ' + list.length + '、送達 ' + r.sent + (r.error ? '、' + r.error : '');
  } catch (e) { rep.fcm = '錯誤：' + e.message; }
  if (!c.nNtfy) rep.ntfy = '設定為關閉';
  else if (!c.ntfy) rep.ntfy = '設定分頁沒有 ntfy頻道';
  else {
    try {
      var n = UrlFetchApp.fetch('https://ntfy.sh/', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ topic: c.ntfy, title: title, message: message, priority: priority || 3 })
      });
      ntfyOk = n.getResponseCode() < 300;
      rep.ntfy = 'HTTP ' + n.getResponseCode() + (ntfyOk ? '' : '：' + n.getContentText().slice(0, 150));
    } catch (e) { rep.ntfy = '錯誤：' + e.message; }
  }
  if (!toAdmin && !ntfyOk) {
    try {
      // 主旨固定，讓 Gmail 歸在同一串，不會一直冒出新信
      MailApp.sendEmail(c.mailTo || Session.getEffectiveUser().getEmail(), '[德化廟務] 推播未送達紀錄',
                        fmt_(new Date(), 'yyyy-MM-dd HH:mm') + '\n' + title + '\n' + message
                        + '\n\n（管理者手機沒有收到 App 推播時，才會寄這封備份）');
      rep.mail = '已寄出';
    } catch (e) { rep.mail = '錯誤：' + e.message; }
  }
  return rep;
}

// 推播裝置：[{row, token, name, role}]，只取狀態「有效」；roles 為 null 時全部
// 角色以「人員」分頁目前的設定為準（指定或取消組長後立即生效），停用的人不推
function devices_(roles) {
  var sh = sheet_('devices'), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var cur = {};
  users_().forEach(function (u) { cur[u.name] = u; });
  return sh.getRange(2, 1, n, 7).getDisplayValues().map(function (r, i) {
    var u = cur[r[1]];
    return { row: i + 2, token: r[0], name: r[1], role: u ? u.role : r[2], ok: !!(u && u.enabled), status: r[6] };
  }).filter(function (d) { return d.token && d.ok && d.status === '有效' && (!roles || roles.indexOf(d.role) >= 0); });
}
function deviceCount_() {
  return cache_(CK.dev, function () {
    var out = {};
    devices_(null).forEach(function (d) { out[d.name] = (out[d.name] || 0) + 1; });
    return out;
  });
}

// 送 FCM 推播。回傳 {sent, sentAdmin, error}；失效的 Token 自動標示「已失效」
function fcm_(list, title, body, tag) {
  if (!list.length) return { sent: 0, sentAdmin: 0 };
  var url = 'https://fcm.googleapis.com/v1/projects/' + CONFIG.FCM_PROJECT_ID + '/messages:send';
  var auth = 'Bearer ' + ScriptApp.getOAuthToken();
  var reqs = list.map(function (d) {
    return {
      url: url, method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: auth },
      payload: JSON.stringify({ message: {
        token: d.token,
        notification: { title: title, body: body },
        data: { tag: tag || '' },
        webpush: {
          notification: { icon: CONFIG.APP_URL + 'icon-192.png', badge: CONFIG.APP_URL + 'icon-192.png' },
          fcm_options: { link: CONFIG.APP_URL }
        }
      } })
    };
  });
  var res = UrlFetchApp.fetchAll(reqs), sent = 0, sentAdmin = 0, error = '', dead = [];
  res.forEach(function (r, i) {
    var code = r.getResponseCode();
    if (code < 300) { sent++; if (list[i].role === '管理者' || list[i].role === '組長') sentAdmin++; return; }
    var t = r.getContentText();
    if (code === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT.*token|not a valid FCM registration token/i.test(t)) { if (list[i].row) dead.push(list[i].row); }
    else error = 'FCM ' + code + '：' + t.slice(0, 200);
  });
  if (dead.length) {
    bust_(['dev']);
    var sh = sheet_('devices');
    dead.forEach(function (row) { sh.getRange(row, 7).setValue('已失效'); });
  }
  return { sent: sent, sentAdmin: sentAdmin, error: error };
}

// App 登記／移除推播裝置、送測試通知（所有角色都可以）
function push_(b) {
  var who = auth_(b.u), token = String(b.token || '').trim();
  if (!/^[\w:\-]{20,4096}$/.test(token)) throw new Error('推播代碼不正確');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = sheet_('devices'), n = sh.getLastRow() - 1, row = 0, now = "'" + fmt_(new Date(), 'yyyy-MM-dd HH:mm:ss');
    bust_(['dev']);
    if (n > 0) sh.getRange(2, 1, n, 1).getDisplayValues().forEach(function (r, i) { if (r[0] === token) row = i + 2; });
    if (b.op === 'remove') {
      if (row) sh.getRange(row, 7).setValue('已登出');
      return { removed: !!row };
    }
    var dev = String(b.device || '').slice(0, 60);
    if (row) { sh.getRange(row, 2, 1, 3).setValues([[who.name, who.role, dev]]); sh.getRange(row, 6, 1, 2).setValues([[now, '有效']]); }
    else sh.appendRow([token, who.name, who.role, dev, now, now, '有效']);
  } finally { lock.releaseLock(); }
  if (b.op === 'test') {
    var r = fcm_([{ token: token, role: who.role, row: 0 }], '✅ 德化廟務通知已開啟', who.name + '，之後的' + PUSH_DESC[who.role] + '會顯示在這裡', 'test');
    if (!r.sent) throw new Error('已登記，但測試通知沒送出：' + (r.error || '請稍後再試'));
  }
  return { registered: true };
}

// ===== 零用金 =====
// 一本帳：撥入（財務→組長，餘額＋）、繳回（組長→財務，餘額－）、支出（組長用零用金付）、代墊（組員自己先付，組長之後還）
// 超過門檻（預設 5000）且不是免核准科目（預設供果供品）→ 先「申請」，執行長核准後才花，花完補收據
// 狀態：待核准 → 已核准 →（補收據）→ 待核對 → 已核對；代墊：待還款 →（組長還款）→ 待核對 → 已核對；退回、作廢不計入
// 組長手上餘額 ＝ 撥入 − 繳回 − 支出（已核准／待核對／已核對）− 代墊（已還款，即待核對／已核對）
var CASH_COLS = 19;
var CASH_SPENT = { '支出': ['已核准', '待核對', '已核對'], '代墊': ['待核對', '已核對'] };
function cashCaps_(role) {
  var adm = role === '管理者';
  return {
    spend: adm || role === '組長', advance: adm || role === '組長' || role === '組員', fund: adm || role === '財務',
    approve: role === '執行長', check: adm || role === '財務', repay: adm || role === '組長', all: role !== '組員'
  };
}
function cashRows_() {
  var sh = sheet_('cash'), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, CASH_COLS).getDisplayValues().map(function (r, i) {
    return { row: i + 2, id: r[0], created: r[1], date: normDate_(r[2]), type: r[3], amount: Number(String(r[4]).replace(/[^\d.-]/g, '')) || 0,
             cat: r[5], note: r[6], by: r[7], photos: [r[8], r[9], r[10]].filter(String), status: r[11],
             apprAmt: r[12], apprBy: r[13], apprAt: r[14], checkBy: r[15], checkAt: r[16], repaidAt: r[17], remark: r[18] };
  }).filter(function (x) { return x.id; });
}
function cashDelta_(e) {
  if (e.status === '作廢' || e.status === '退回') return 0;
  if (e.type === '撥入') return e.amount;
  if (e.type === '繳回') return -e.amount;
  return (CASH_SPENT[e.type] || []).indexOf(e.status) >= 0 ? -e.amount : 0;
}
function cashData_() {
  return cache_(CK.cash, function () {
    var all = cashRows_(), bal = 0;
    all.forEach(function (e) { bal += cashDelta_(e); });
    return { balance: bal, rows: all.slice(-300) };
  });
}
function cashBig_(amount, cat) { var c = cfg_(); return amount > c.cashLimit && c.cashExempt.indexOf(cat) < 0; }
function cashSavePhotos_(photos, name) {
  var links = ['', '', ''];
  if (!photos.length) return links;
  if (photos.length > CONFIG.MAX_PHOTOS) throw new Error('收據照片最多 ' + CONFIG.MAX_PHOTOS + ' 張');
  var now = new Date(), folder = monthFolder_(now), stamp = fmt_(now, 'yyyyMMdd_HHmmss');
  photos.forEach(function (p, i) {
    var data = String(p).replace(/^data:image\/\w+;base64,/, '');
    if (data.length > CONFIG.MAX_PHOTO_CHARS) throw new Error('第 ' + (i + 1) + ' 張照片太大');
    links[i] = folder.createFile(Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', stamp + '_收據_' + name + '_' + (i + 1) + '.jpg')).getUrl();
  });
  return links;
}
function cashNotify_(title, body, roles, names) {
  if (!cfg_().nCash) return;
  try {
    var seen = {}, list = devices_(null).filter(function (d) {
      if (seen[d.token] || (roles.indexOf(d.role) < 0 && (names || []).indexOf(d.name) < 0)) return false;
      return (seen[d.token] = true);
    });
    fcm_(list, title, body, 'cash');
  } catch (e) {}
}
function money_(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function cash_(b) {
  var me = auth_(b.u), caps = cashCaps_(me.role), c = cfg_(), op = b.op;
  if (op === 'list') {
    var d = cashData_(), rows = d.rows.slice().reverse();
    if (!caps.all) rows = rows.filter(function (e) { return e.by === me.name; });
    rows.forEach(function (e) { delete e.row; });
    return { me: { name: me.name, role: me.role }, caps: caps, balance: caps.all ? d.balance : null, low: c.cashLow,
             limit: c.cashLimit, exempt: c.cashExempt, cats: c.cashCats, today: day_(0), rows: rows };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = sheet_('cash'), before = cashData_().balance, now = new Date(), stamp = "'" + fmt_(now, 'yyyy-MM-dd HH:mm');
    var res = cashWrite_(b, me, caps, c, sh, now, stamp);
    bust_(['cash', 'photos']);
    var after = 0; cashRows_().forEach(function (e) { after += cashDelta_(e); });
    if (before >= c.cashLow && after < c.cashLow)
      cashNotify_('⚠️ 零用金餘額剩 ' + money_(after) + ' 元', '低於 ' + money_(c.cashLow) + ' 元，請財務撥款', ['組長', '財務', '管理者']);
    res.balance = after;
    return res;
  } finally { lock.releaseLock(); }
}

function cashWrite_(b, me, caps, c, sh, now, stamp) {
  var op = b.op, note = String(b.note || '').trim().slice(0, 200);
  if (op === 'add') {
    var type = b.type, amount = Math.round(Number(b.amount));
    if (!(amount > 0 && amount <= 1000000)) throw new Error('金額請填 1 到 1,000,000');
    var date = normDate_(b.date) || day_(0);
    var photos = Array.isArray(b.photos) ? b.photos : [];
    var cat = '', status;
    if (type === '撥入' || type === '繳回') {
      if (!caps.fund) throw new Error('只有財務可以撥款或登記繳回');
      if (date > day_(0)) throw new Error('日期不能是未來');
      status = '已入帳';
    } else if (type === '支出' || type === '代墊') {
      if (type === '支出' && !caps.spend) throw new Error('支出由組長登記；自己先付的請選「代墊」');
      if (type === '代墊' && !caps.advance) throw new Error('沒有權限登記代墊');
      cat = String(b.cat || '');
      if (c.cashCats.indexOf(cat) < 0) throw new Error('請選擇科目');
      if (!note) throw new Error('請填說明（買了什麼）');
      var big = cashBig_(amount, cat);
      if (!big && date > day_(0)) throw new Error('日期不能是未來');
      status = big ? '待核准' : type === '支出' ? '待核對' : '待還款';
    } else throw new Error('類型錯誤');
    var links = cashSavePhotos_(photos, me.name);
    var used = {}, id;
    cashRows_().forEach(function (x) { used[x.id] = 1; });
    do { id = 'C' + fmt_(now, 'yyMMddHHmmss') + Math.floor(Math.random() * 900 + 100); } while (used[id]);
    sh.appendRow([id, stamp, "'" + date, type, amount, cat, note, me.name, links[0], links[1], links[2], status, '', '', '', '', '', '', '']);
    log_(me.name, '零用金' + type, money_(amount) + ' ' + cat + ' ' + note + '（' + status + '）');
    var t = money_(amount) + ' 元';
    if (status === '待核准') cashNotify_('📝 待核准：' + me.name + ' 申請' + type + ' ' + t, cat + '・' + note, ['執行長', '管理者']);
    else if (type === '撥入') cashNotify_('💰 零用金撥入 ' + t, me.name + (note ? '：' + note : ''), ['組長', '管理者']);
    else if (type === '繳回') cashNotify_('↩️ 零用金繳回 ' + t, me.name + (note ? '：' + note : ''), ['組長', '財務', '管理者']);
    else cashNotify_('🧾 ' + me.name + ' ' + type + ' ' + t, cat + '・' + note + (links[0] ? '' : '（沒有收據照片）'), ['財務', '管理者']);
    return { id: id, status: status };
  }

  var e = cashRows_().filter(function (x) { return x.id === String(b.id || ''); })[0];
  if (!e) throw new Error('找不到這筆紀錄，請重新整理');
  var amt = money_(e.amount) + ' 元';

  if (op === 'approve' || op === 'reject') {
    if (!caps.approve) throw new Error('只有執行長可以核准');
    if (e.status !== '待核准') throw new Error('這筆已經是「' + e.status + '」');
    if (op === 'reject' && !note) throw new Error('請填退回原因');
    sh.getRange(e.row, 12, 1, 4).setValues([[op === 'approve' ? '已核准' : '退回', e.amount, me.name, stamp]]);
    if (note) sh.getRange(e.row, 19).setValue(note);
    log_(me.name, op === 'approve' ? '核准零用金' : '退回零用金', e.by + ' ' + amt + ' ' + e.note + (note ? '（' + note + '）' : ''));
    cashNotify_(op === 'approve' ? '✅ 已核准：' + e.by + ' ' + amt : '❌ 退回：' + e.by + ' ' + amt,
                e.cat + '・' + e.note + (op === 'approve' ? '\n花完後請在 App 補上收據' : '\n原因：' + note), ['組長', '管理者'], [e.by]);
    return { status: op === 'approve' ? '已核准' : '退回' };
  }
  if (op === 'receipt') {
    if (e.status !== '已核准') throw new Error('這筆不需要補收據');
    if (e.by !== me.name && !caps.repay) throw new Error('只有申請人或組長可以補收據');
    var real = Math.round(Number(b.amount));
    if (!(real > 0 && real <= 1000000)) throw new Error('請填實際金額');
    var ph = Array.isArray(b.photos) ? b.photos : [];
    if (!ph.length) throw new Error('請拍收據');
    var lk = cashSavePhotos_(ph, e.by), ns = e.type === '支出' ? '待核對' : '待還款';
    sh.getRange(e.row, 5).setValue(real);
    sh.getRange(e.row, 9, 1, 4).setValues([[lk[0], lk[1], lk[2], ns]]);
    if (note) sh.getRange(e.row, 19).setValue(note);
    log_(me.name, '零用金補收據', e.by + ' ' + money_(real) + ' 元（核准 ' + money_(e.amount) + '）');
    cashNotify_('🧾 ' + e.by + ' ' + e.type + ' ' + money_(real) + ' 元（已核准）', e.cat + '・' + e.note + (real > e.amount ? '\n⚠️ 超過核准金額 ' + money_(e.amount) : ''), ['財務', '管理者']);
    return { status: ns };
  }
  if (op === 'repay') {
    if (!caps.repay) throw new Error('只有組長可以登記還款');
    if (e.type !== '代墊' || e.status !== '待還款') throw new Error('這筆不是待還款的代墊');
    sh.getRange(e.row, 12).setValue('待核對');
    sh.getRange(e.row, 18).setValue(stamp);
    log_(me.name, '還代墊', e.by + ' ' + amt);
    cashNotify_('💵 已還代墊：' + e.by + ' ' + amt, e.cat + '・' + e.note, ['財務', '管理者'], [e.by]);
    return { status: '待核對' };
  }
  if (op === 'check') {
    if (!caps.check) throw new Error('只有財務可以核對');
    if (e.status !== '待核對') throw new Error('這筆已經是「' + e.status + '」');
    sh.getRange(e.row, 12).setValue('已核對');
    sh.getRange(e.row, 16, 1, 2).setValues([[me.name, stamp]]);
    if (note) sh.getRange(e.row, 19).setValue(note);
    log_(me.name, '核對零用金', e.by + ' ' + amt + ' ' + e.note);
    return { status: '已核對' };
  }
  if (op === 'void') {
    var mine = e.by === me.name && ['待核准', '已核准', '待核對', '待還款', '已入帳'].indexOf(e.status) >= 0;
    var adm = me.role === '管理者' && ['已核對', '作廢'].indexOf(e.status) < 0;
    if (!mine && !adm) throw new Error(e.status === '已核對' ? '已核對的紀錄不能作廢' : '只有登記的人可以作廢');
    if (!note) throw new Error('請填作廢原因');
    sh.getRange(e.row, 12).setValue('作廢');
    sh.getRange(e.row, 19).setValue(note);
    log_(me.name, '作廢零用金', e.by + ' ' + e.type + ' ' + amt + '（' + note + '）');
    return { status: '作廢' };
  }
  throw new Error('未知的零用金操作');
}

// 回報照片：在 App 裡直接看（照片仍是私人檔案，只透過後台、憑 PIN 讀取）
// 只能讀「回報」分頁裡出現過的照片，不能拿來讀雲端硬碟其他檔案
function photoIds_() {
  return cache_(CK.photos, function () {
    var sh = sheet_('report'), last = sh.getLastRow(), ids = {};
    var st = Math.max(2, last - 1000);
    if (last >= 2)
    sh.getRange(st, 7, last - st + 1, 3).getDisplayValues().forEach(function (r) {
      r.forEach(function (u) { var m = String(u).match(/\/d\/([-\w]{20,})/); if (m) ids[m[1]] = 1; });
    });
    // 零用金收據：記下經手人，組員只能看自己的收據
    cashData_().rows.forEach(function (e) {
      e.photos.forEach(function (u) { var m = String(u).match(/\/d\/([-\w]{20,})/); if (m) ids[m[1]] = e.by || 1; });
    });
    return ids;
  });
}
var PHOTO_ROLES = ['管理者', '組長', '前賢', '執行長', '財務'];
function photo_(b) {
  var who = auth_(b.u);
  var id = String(b.id || ''), own = photoIds_()[id];
  if (!/^[-\w]{20,}$/.test(id) || !own) throw new Error('找不到這張照片');
  if (PHOTO_ROLES.indexOf(who.role) < 0 && own !== who.name) throw new Error('沒有權限看照片');
  var blob = DriveApp.getFileById(id).getBlob();
  var bytes = blob.getBytes();
  if (bytes.length > 4000000) throw new Error('照片太大，請到雲端硬碟查看');
  return { mime: blob.getContentType() || 'image/jpeg', data: Utilities.base64Encode(bytes) };
}

// 縮圖：一次最多 30 張，用 Drive 產生的縮圖（約 320px，每張幾十 KB），快取 6 小時
// 剛上傳的照片 Drive 可能還沒做好縮圖，這時回傳空字串，前台改顯示按鈕，下次再試
function thumbs_(b) {
  var who = auth_(b.u);
  var ok = photoIds_(), all = PHOTO_ROLES.indexOf(who.role) >= 0;
  var ids = (b.ids || []).map(String).filter(function (id) { return /^[-\w]{20,}$/.test(id) && ok[id] && (all || ok[id] === who.name); }).slice(0, 30);
  if (!all && !ids.length && (b.ids || []).length) throw new Error('沒有權限看照片');
  var map = {}, c = CacheService.getScriptCache(), got = {};
  if (!ids.length) return { map: map };
  try { got = c.getAll(ids.map(function (id) { return 'th_' + id; })) || {}; } catch (e) {}
  var miss = ids.filter(function (id) { if (got['th_' + id]) { map[id] = got['th_' + id]; return false; } return true; });
  if (!miss.length) return { map: map };
  var h = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  var meta = UrlFetchApp.fetchAll(miss.map(function (id) {
    return { url: 'https://www.googleapis.com/drive/v3/files/' + id + '?fields=thumbnailLink', headers: h, muteHttpExceptions: true };
  }));
  var links = [], lid = [];
  meta.forEach(function (r, i) {
    var t = ''; try { t = JSON.parse(r.getContentText()).thumbnailLink || ''; } catch (e) {}
    if (t) { links.push({ url: t.replace(/=s\d+$/, '') + '=s320', headers: h, muteHttpExceptions: true }); lid.push(miss[i]); }
    else map[miss[i]] = '';
  });
  var put = {};
  if (links.length) UrlFetchApp.fetchAll(links).forEach(function (r, i) {
    var id = lid[i];
    if (r.getResponseCode() !== 200) { map[id] = ''; return; }
    var bl = r.getBlob(), d = 'data:' + (bl.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(bl.getBytes());
    map[id] = d.length < 90000 ? d : '';
    if (map[id]) put['th_' + id] = d;
  });
  try { if (Object.keys(put).length) c.putAll(put, 21600); } catch (e) {}
  return { map: map };
}

// 最近的公告（新的在前）
function news_(max) {
  return cache_(CK.news + day_(0), function () { return readNews_(max); });
}
function readNews_(max) {
  var sh = sheet_('news'), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var s0 = Math.max(2, sh.getLastRow() - max + 1), since = day_(-CONFIG.NEWS_DAYS);
  return sh.getRange(s0, 1, sh.getLastRow() - s0 + 1, 4).getDisplayValues().reverse()
    .filter(function (r) { return r[2] && String(r[0]).slice(0, 10) >= since; })
    .map(function (r) { return { time: String(r[0]).replace(/^'/, ''), by: r[1], title: r[2], body: r[3] }; });
}

// ===== 工具 =====
// 人員分頁：[{row, pin, name, enabled, role}]
function users_() {
  if (_users) return _users;
  _users = cache_(CK.users, readUsers_);
  return _users;
}
function readUsers_() {
  var sh = sheet_('users'), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 4).getDisplayValues().map(function (r, i) {
    return { row: i + 2, pin: String(r[0]).trim(), name: String(r[1]).trim(), enabled: r[2] !== '否', role: ROLES.indexOf(r[3]) >= 0 ? r[3] : '組員' };
  }).filter(function (u) { return u.name; });
}
// 登入身分：「姓名|PIN」（v6.0 起）。同一個姓名連續錯 5 次鎖 15 分鐘
// 舊版只有 PIN：已登入的手機打開 App 後會自動換成「姓名|PIN」；PIN 和別人重複時就要重新登入。
// 舊版路徑整體錯 30 次也鎖 15 分鐘，避免被拿來猜 PIN
var AUTH_TRIES = 5, AUTH_LEGACY_TRIES = 30, AUTH_LOCK_SEC = 900;
function auth_(code) {
  code = String(code || '').trim();
  var i = code.lastIndexOf('|'), legacy = i < 0;
  var name = legacy ? '' : code.slice(0, i).trim(), pin = legacy ? code : code.slice(i + 1).trim();
  var c = CacheService.getScriptCache(), key = 'lk_' + (legacy ? '_legacy' : name), n = 0;
  try { n = Number(c.get(key)) || 0; } catch (e) {}
  if (n >= (legacy ? AUTH_LEGACY_TRIES : AUTH_TRIES)) throw new Error('輸入錯誤太多次，請 15 分鐘後再輸入姓名和 PIN');
  if (pin) {
    var m = users_().filter(function (x) { return x.enabled && x.pin === pin && (legacy || x.name === name); });
    if (m.length === 1) { if (n) try { c.remove(key); } catch (e) {} return m[0]; }
  }
  try { c.put(key, String(n + 1), AUTH_LOCK_SEC); } catch (e) {}
  throw new Error(legacy ? 'PIN 錯誤或已停用，請輸入姓名和 PIN 重新登入' : '姓名或 PIN 錯誤，或帳號已停用');
}
// 組員／組長專用功能：管理者和唯讀角色不能簽到、回報、排班
function user_(code) {
  var u = auth_(code);
  if (u.role !== '組員' && u.role !== '組長') throw new Error(u.role + '帳號不能使用這個功能');
  return u.name;
}

function sheet_(key) {
  var def = SHEETS[key];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.header.length).setValues([def.header])
      .setFontWeight('bold').setBackground('#1C264D').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

// 照片資料夾：我的雲端硬碟／德化 廟務回報照片／yyyy-MM
function monthFolder_(d) {
  var props = PropertiesService.getScriptProperties();
  var rootId = props.getProperty('PHOTO_ROOT_ID');
  var root = null;
  if (rootId) { try { root = DriveApp.getFolderById(rootId); } catch (e) { root = null; } }
  if (!root) {
    root = DriveApp.createFolder(CONFIG.PHOTO_ROOT);
    props.setProperty('PHOTO_ROOT_ID', root.getId());
  }
  var month = fmt_(d, 'yyyy-MM');
  var it = root.getFoldersByName(month);
  return it.hasNext() ? it.next() : root.createFolder(month);
}

// 接受 2026-12-01、2026/12/01、2026/12/1
function normDate_(s) {
  var m = String(s || '').trim().match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (!m) return '';
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}

// 從「8:32:10」「08:32」「上午 8:32:10」取出 HH:mm
function hhmm_(s) {
  var m = String(s || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return '';
  var h = +m[1];
  if (/下午|PM/i.test(s) && h < 12) h += 12;
  if (/上午|AM/i.test(s) && h === 12) h = 0;
  return ('0' + h).slice(-2) + ':' + m[2];
}

function fmt_(d, pattern) { return Utilities.formatDate(d, CONFIG.TZ, pattern); }
function day_(offset) { return fmt_(new Date(Date.now() + offset * 86400000), 'yyyy-MM-dd'); }   // 台北時間今天 + offset 天
function dow_(ds) { var p = ds.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }

function distanceM_(lat1, lng1, lat2, lng2) {
  var R = 6371000, r = Math.PI / 180;
  var dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 部署前手動執行一次：確認分頁與欄位、建立每日檢查觸發器、觸發授權、發測試推播
function setup() {
  bustAll_();
  Object.keys(SHEETS).forEach(function (k) {
    var sh = sheet_(k), h = SHEETS[k].header;
    var cur = sh.getRange(1, 1, 1, h.length).getDisplayValues()[0];
    h.forEach(function (name, i) { if (!cur[i]) sh.getRange(1, i + 1).setValue(name); });   // 補上缺的欄位名稱
    sh.getRange(1, 1, 1, h.length).setFontWeight('bold').setBackground('#1C264D').setFontColor('#FFFFFF');
  });
  // 人員分頁「角色」欄的下拉選單要包含所有角色，否則寫入組長／前賢會被拒
  var uSh = sheet_('users');
  uSh.getRange(2, 4, Math.max(uSh.getMaxRows() - 1, 1), 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(ROLES, true).setAllowInvalid(false).build());
  var ss = sheet_('settings'), have = {};
  if (ss.getLastRow() > 1) ss.getRange(2, 1, ss.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) { have[r[0]] = true; });
  SETTINGS.forEach(function (x) { if (!have[x[0]]) ss.appendRow([x[0], "'" + x[1], x[2]]); });
  monthFolder_(new Date());
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyCheck').timeBased().everyDays(1).atHour(CONFIG.GAP_CHECK_HOUR).inTimezone(CONFIG.TZ).create();
  updateStats();
  notify_('✅ 德化廟務通知測試', '收到這則就代表推播設定成功', 3);
}
