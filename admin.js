// ===== 管理者介面（管理者 PIN 登入後顯示）=====
var AD = null;          // overview 資料
var adTab = 'people';
var HOST = { body: 'adBody', msg: 'adMsg' };   // 管理者畫面；組長用「管理」分頁

// 組長：在組員畫面的「管理」分頁：今日、排班、紀錄（含補登）、零用金
function leadStart() {
  HOST = { body: 'leadBody', msg: 'leadMsg' };
  leadGo(['sched', 'log', 'cash'].indexOf(adTab) >= 0 ? adTab : 'today', true);
  adminLoad();
}
function leadGo(t, noRender) {
  adTab = t;
  ['today', 'sched', 'log', 'cash'].forEach(function (x) { $('lg-' + x).classList.toggle('on', x === t); });
  if (!noRender || t === 'cash') adRender();
  if (t === 'cash') cashLoad();
}

// 管理者與唯讀角色（前賢、執行長、財務）共用這個畫面；唯讀角色只看得到排班、回報、公告、零用金，出勤資料都不能修改
var VIEW_TABS = ['sched', 'log', 'news', 'cash'], AD_TABS = ['people', 'today', 'sched', 'log', 'news', 'cash', 'settings'];
function adminStart(r) {
  busy = false;
  ROLE = r.role === 'viewer' ? 'viewer' : 'admin';
  HOST = { body: 'adBody', msg: 'adMsg' }; adTab = ROLE !== 'viewer' ? 'people' : (r.title === '執行長' || r.title === '財務') ? 'cash' : 'log';
  $('adPinBtn').classList.toggle('hide', r.title === '前賢');
  $('adWho').innerHTML = esc(r.name) + (ROLE === 'viewer' ? '<span class="role">' + esc(r.title || '唯讀') + '</span>' : '');
  $('at-log').textContent = ROLE === 'viewer' ? '回報' : '紀錄';
  AD_TABS.forEach(function (x) {
    $('at-' + x).classList.toggle('hide', ROLE === 'viewer' && VIEW_TABS.indexOf(x) < 0);
    $('at-' + x).classList.toggle('on', x === adTab);
  });
  show('admin');
  $('adToday').textContent = r.today + '（' + WEEK[new Date(r.today + 'T00:00:00').getDay()] + '）';
  adminLoad();
  if (adTab === 'cash') cashLoad();
  syncPush();
}
var adLast = '';
function adminLoad() {
  var who = CODE;
  if (!AD) { try { AD = JSON.parse(store(cacheKey('ad')) || 'null'); if (AD) adRender(); } catch (e) { AD = null; } }
  return adm('overview').then(function (d) {
    if (CODE !== who) return;
    var js = JSON.stringify(d);
    if (js === adLast && AD) return;          // 沒有新資料就不重畫
    adLast = js; AD = d; adRender();
    try { store(cacheKey('ad'), js); } catch (e) {}
  }).catch(function (e) { adMsg(e.message, true); });
}

// ---- 照片：在 App 裡直接看（透過後台讀取，照片仍是私人檔案）----
var PHOTOS = {};
function adPhoto(url) {
  var m = String(url).match(/\/d\/([-\w]{20,})/), id = m && m[1];
  if (!id) { window.open(url, '_blank'); return; }
  $('lbImg').removeAttribute('src'); $('lbMsg').textContent = '載入照片中…'; $('lightbox').classList.remove('hide');
  var show = function (src) { $('lbImg').src = src; $('lbMsg').textContent = '點一下關閉'; };
  if (PHOTOS[id]) { show(PHOTOS[id]); return; }
  apiPost({ action: 'photo', u: CODE, id: id }).then(function (r) {
    PHOTOS[id] = 'data:' + r.mime + ';base64,' + r.data; show(PHOTOS[id]);
  }).catch(function (e) { $('lbMsg').textContent = e.message === 'Failed to fetch' ? '網路異常，請再試一次' : e.message; });
}
// 縮圖：先畫出灰色方塊，再一次向後台要這一頁所有縮圖；拿不到縮圖的改顯示「📷 照片」
var THUMBS = {}, thumbBusy = false;
function photoId(url) { var m = String(url).match(/\/d\/([-\w]{20,})/); return m ? m[1] : ''; }
function thumbHtml(p, i) {
  var id = photoId(p), src = THUMBS[id];
  var click = ' onclick="adPhoto(\'' + esc(p) + '\')"';
  if (src) return '<img class="th" src="' + src + '" alt="照片 ' + (i + 1) + '"' + click + '>';
  if (id && src === undefined) return '<span class="th ld" data-th="' + id + '"' + click + '></span>';
  return '<button class="sb"' + click + '>📷 照片 ' + (i + 1) + '</button>';
}
function loadThumbs() {
  if (thumbBusy) return;
  var els = document.querySelectorAll('[data-th]'), ids = [];
  for (var i = 0; i < els.length; i++) { var id = els[i].getAttribute('data-th'); if (ids.indexOf(id) < 0 && THUMBS[id] === undefined) ids.push(id); }
  if (!ids.length) return;
  thumbBusy = true; var who = CODE;
  apiPost({ action: 'thumbs', u: CODE, ids: ids.slice(0, 30) }).then(function (r) {
    thumbBusy = false; if (CODE !== who) return;
    ids.slice(0, 30).forEach(function (id) { THUMBS[id] = (r.map || {})[id] || ''; });
    var nodes = document.querySelectorAll('[data-th]');
    for (var j = 0; j < nodes.length; j++) {
      var n = nodes[j], id = n.getAttribute('data-th'), src = THUMBS[id];
      if (src === undefined) continue;
      if (src) { var im = document.createElement('img'); im.className = 'th'; im.src = src; im.onclick = n.onclick; n.parentNode.replaceChild(im, n); }
      else { n.removeAttribute('data-th'); n.className = 'sb'; n.textContent = '📷 照片'; }
    }
    loadThumbs();                                   // 超過 30 張時再要下一批
  }).catch(function () { thumbBusy = false; });
}
function closePhoto() { $('lightbox').classList.add('hide'); }
function adm(op, extra) {
  var body = { action: 'admin', u: CODE, op: op };
  for (var k in (extra || {})) body[k] = extra[k];
  return apiPost(body);
}
function adMsg(t, err) {
  if (t && t !== '處理中…' && t !== '設定中…') toast((err ? '⚠️ ' : '') + t);   // 畫面捲到下面時也看得到結果
  var m = $(HOST.msg); m.textContent = t || ''; m.className = 'msg ' + (err ? 'err' : 'ok'); if (t) setTimeout(function () { if (m.textContent === t) m.textContent = ''; }, 5000); }
function adTabGo(t) {
  adTab = t;
  AD_TABS.forEach(function (x) { $('at-' + x).classList.toggle('on', x === t); });
  adRender();
  if (t === 'cash') cashLoad();
}
function adDo(op, extra, okText) {
  if (isBusy()) return;
  busy = true; busySince = Date.now(); adMsg('處理中…');
  return adm(op, extra).then(function (r) {
    busy = false; adMsg(typeof okText === 'function' ? okText(r) : okText);
    return adminLoad().then(function () { return r; });
  }).catch(function (e) { busy = false; adMsg(e.message, true); });
}
function staffOpts(sel) {
  return (AD.users || []).filter(function (u) { return (u.role === '組員' || u.role === '組長') && u.enabled; })
    .map(function (u) { return '<option' + (u.name === sel ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('');
}
function dlabel(ds) { var d = new Date(ds + 'T00:00:00'); return (d.getMonth() + 1) + '/' + d.getDate() + '（' + WEEK[d.getDay()] + '）'; }

function adRender() {
  if (adTab === 'cash') { CASH_HOST = HOST.body; cashRender(); return; }
  if (!AD) return;
  var h = '';
  if (adTab === 'people') h = adPeople();
  if (adTab === 'today') h = adToday();
  if (adTab === 'sched') h = adSched();
  if (adTab === 'log') h = adLog();
  if (adTab === 'news') h = adNews();
  if (adTab === 'settings') h = adSettings();
  $(HOST.body).innerHTML = h;
  loadThumbs();
}

// ---- 人員 ----
function adPeople() {
  var h = '<div class="card"><h3 class="ah">人員</h3>';
  AD.users.forEach(function (u) {
    if (u.role === '管理者') return;
    var n = esc(u.name), q = "'" + n.replace(/'/g, '') + "'";
    var bell = (AD.devices || {})[u.name] ? ' <small class="ok">🔔 通知已開</small>' : '';
    var tag = u.role === '組員' ? '' : '<span class="role">' + esc(u.role) + '</span>';
    h += '<div class="prow' + (u.enabled ? '' : ' off') + '"><div class="pn"><b>' + n + tag + bell + '</b><span>PIN ' + esc(u.pin) + (u.enabled ? '' : '・已停用') + '</span></div>'
       + '<div class="pb">'
       + (u.enabled ? '<button class="sb pri" onclick="adDevice(' + q + ')">設定這支手機</button>' : '')
       + '<button class="sb" onclick="adNewPin(' + q + ',this)">換 PIN</button>'
       + '<button class="sb" onclick="adToggle(' + q + ',' + !u.enabled + ')">' + (u.enabled ? '停用' : '啟用') + '</button>'
       + (u.enabled ? '<select class="rsel" onchange="adRole(' + q + ',this.value)">' + ['組員', '組長', '前賢', '執行長', '財務'].map(function (r) {
             return '<option' + (r === u.role ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select>' : '')
       + '</div></div>';
  });
  h += '</div><div class="card"><h3 class="ah">新增人員</h3>'
     + '<input id="nuName" placeholder="姓名" maxlength="20">'
     + '<input id="nuPin" placeholder="PIN（4 位數，空白自動產生）" inputmode="numeric" maxlength="4">'
     + '<select id="nuRole"><option value="組員">組員</option><option value="前賢">前賢（唯讀，可多人共用）</option><option value="執行長">執行長（核准大額零用金）</option><option value="財務">財務（撥款、核對零用金）</option></select>'
     + '<button class="big send" onclick="adAddUser()">新增</button></div>';
  return h;
}
function adAddUser() {
  var name = $('nuName').value.trim(), pin = $('nuPin').value.trim();
  if (!name) { adMsg('請輸入姓名', true); return; }
  adDo('addUser', { name: name, pin: pin, role: $('nuRole').value }, function (r) { return '已新增 ' + r.name + (r.role !== '組員' ? '（' + r.role + '）' : '') + '，PIN：' + r.pin; });
}
var pinArm = '';
function adNewPin(name, btn) {
  if (pinArm !== name) { pinArm = name; btn.textContent = '確定換？'; btn.classList.add('warn'); return; }
  pinArm = '';
  var want = prompt('幫「' + name + '」設定新的 4 位數 PIN\n（空白＝自動產生）', '');
  if (want === null) { adRender(); return; }
  adDo('setPin', { name: name, pin: want.trim() }, function (r) { return r.name + ' 的新 PIN：' + r.pin + '（舊的已失效，登入時輸入姓名和這組 PIN）'; });
}
function adRole(name, role) {
  adDo('setRole', { name: name, role: role }, name + ' 已改為' + role + (role === '組長' ? '（下次打開 App 會多一個「管理」分頁）' : role === '前賢' ? '（只能看回報、排班、公告、零用金）' : role === '執行長' ? '（唯讀出勤＋核准大額零用金）' : role === '財務' ? '（唯讀出勤＋撥款、核對零用金）' : ''));
}
function adToggle(name, en) { adDo('setEnabled', { name: name, enabled: en }, name + (en ? ' 已啟用' : ' 已停用')); }
function adDevice(name) {
  if (isBusy()) return;
  busy = true; busySince = Date.now(); adMsg('設定中…');
  adm('device', { name: name }).then(function (r) {
    busy = false;
    setCode(r.name, r.pin); AD = null;
    load().then(function (ok) {
      if (ok === true) { show('app'); tab('clock'); msg('mClock', '這支手機已設定為 ' + r.name + '，可以加到主畫面了', 'ok'); }
      else toast('這支手機已設定為 ' + r.name);
    });
  }).catch(function (e) { busy = false; adMsg(e.message, true); });
}

// ---- 今日 ----
function adToday() {
  var t = AD.today;
  var h = '<div class="card"><h3 class="ah">簽到／簽退</h3>';
  if (!AD.clock.length) h += '<div class="empty">今天還沒有人簽到</div>';
  AD.clock.forEach(function (c) {
    var tag = c.inRange === '是' ? '<span class="ok">範圍內</span>' : c.inRange === '否' ? '<span class="bad">範圍外 ' + esc(c.dist) + 'm</span>' : '<span class="mid">' + esc(c.inRange) + '</span>';
    h += '<div class="lrow"><b>' + esc(c.time) + '</b><span>' + esc(c.name) + ' ' + esc(c.type) + '</span>' + tag + '</div>';
  });
  var sch = AD.schedule.filter(function (s) { return s.date === t; });
  h += '</div><div class="card"><h3 class="ah">今天的班</h3>' + (sch.length ? '' : '<div class="empty gap">今天沒人排班</div>');
  sch.forEach(function (s) { h += '<div class="lrow"><span>' + esc(s.name) + '</span><span>' + esc(s.start) + (s.end ? '–' + esc(s.end) : '') + ' ' + esc(s.note) + '</span></div>'; });
  var st = AD.stays.filter(function (s) { return s.date === t; });
  h += '</div><div class="card"><h3 class="ah">今天住廟（' + st.length + ' 位）</h3>' + (st.length ? '' : '<div class="empty">還沒有住廟回報</div>');
  st.forEach(function (s) { h += '<div class="lrow"><span>' + esc(s.area) + '</span><span>' + esc(s.name) + '</span><small>' + esc(s.by) + ' 回報</small></div>'; });
  return h + '</div>';
}

// ---- 排班 ----
var schedOpen = '';
function adSched() {
  var by = {};
  AD.schedule.forEach(function (s) { (by[s.date] = by[s.date] || []).push(s); });
  var base = new Date(AD.today + 'T00:00:00'), h = '<div class="card sched">', month = -1;
  for (var i = 0; i < AD.days; i++) {
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    var ds = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    var ppl = by[ds] || [];
    if (d.getMonth() !== month) { month = d.getMonth(); h += '<div class="mon">' + d.getFullYear() + ' 年 ' + (month + 1) + ' 月</div>'; }
    var tags = ppl.map(function (s) {
      var q = "'" + ds + "','" + esc(s.name).replace(/'/g, '') + "'";
      return '<span class="who">' + esc(s.name) + (s.start ? ' ' + esc(s.start) + (s.end ? '–' + esc(s.end) : '') : '') + (s.note ? '・' + esc(s.note) : '')
           + (ROLE === 'viewer' ? '' : ' <a class="x" onclick="adShiftCancel(' + q + ')">×</a>') + '</span>';
    }).join('') || (i > 0 && i <= 7 ? '<span class="gap">缺人</span>' : '<span class="none">尚無人</span>');
    h += '<div class="row' + (d.getDay() === 0 || d.getDay() === 6 ? ' wk' : '') + '"><div class="dt"><b>' + (d.getMonth() + 1) + '/' + d.getDate() + '</b><small>' + (i === 0 ? '今天' : '週' + WEEK[d.getDay()]) + '</small></div>'
       + '<div class="ppl">' + tags + '</div>' + (ROLE === 'viewer' ? '' : '<button class="op" onclick="adSchedOpen(\'' + ds + '\')">＋</button>') + '</div>';
    if (schedOpen === ds) {
      h += '<div class="sform"><select id="sfName">' + staffOpts() + '</select>'
         + '<input id="sfStart" type="time" value="08:30"><input id="sfEnd" type="time" value="17:00">'
         + '<input id="sfNote" placeholder="備註（可空白）" maxlength="50">'
         + '<div class="pb"><button class="sb pri" onclick="adShiftSave(\'' + ds + '\',true)">排入（含時段）</button><button class="sb" onclick="adShiftSave(\'' + ds + '\',false)">排入（不填時段）</button><button class="sb" onclick="adSchedOpen(\'\')">取消</button></div>'
         + '<small>同一人同一天已有班時，會改成新的時段與備註</small></div>';
    }
  }
  return h + '</div>';
}
function adSchedOpen(ds) { schedOpen = schedOpen === ds ? '' : ds; adRender(); }
function adShiftSave(ds, withTime) {
  var x = { name: $('sfName').value, date: ds, mode: 'add', note: $('sfNote').value.trim() };
  if (withTime) { x.start = $('sfStart').value; x.end = $('sfEnd').value; }
  if (!x.name) { adMsg('請選擇組員', true); return; }
  schedOpen = '';
  adDo('shift', x, '已排入 ' + x.name + ' ' + dlabel(ds));
}
var cancelArm = '';
function adShiftCancel(ds, name) {
  var k = ds + name;
  if (cancelArm !== k) { cancelArm = k; adMsg('再按一次 × 取消 ' + name + ' ' + dlabel(ds) + ' 的班'); return; }
  cancelArm = '';
  adDo('shift', { name: name, date: ds, mode: 'cancel' }, '已取消 ' + name + ' ' + dlabel(ds));
}

// ---- 紀錄 ----
function adLog() {
  var h = ROLE === 'viewer' ? '' : '<div class="card"><h3 class="ah">補登簽到／簽退</h3>'
    + '<select id="cfName">' + staffOpts() + '</select>'
    + '<div class="srow2"><input id="cfDate" type="date" value="' + AD.today + '" max="' + AD.today + '"><input id="cfTime" type="time" value="17:00">'
    + '<select id="cfType"><option>簽退</option><option>簽到</option></select></div>'
    + '<button class="big send" onclick="adClockFix()">補登</button><small>紀錄會標示「' + (ROLE === 'leader' ? '組長' : '管理者') + '補登」，統計會一起算進去</small></div>';
  h += '<div class="card"><h3 class="ah">最近的事務回報</h3>' + (AD.reports.length ? '' : '<div class="empty">還沒有回報</div>');
  AD.reports.forEach(function (r) {
    h += '<div class="rep"><div><b>' + esc(r.name) + '</b> <span class="kind' + (r.kind === '異常回報' ? ' bad' : '') + '">' + esc(r.kind) + '</span><small>' + esc(r.date) + ' ' + esc(r.time) + '</small></div>'
       + '<p>' + esc(r.text) + '</p>'
       + (r.photos.length ? '<div class="pl">' + r.photos.map(thumbHtml).join('') + '</div>' : '') + '</div>';
  });
  h += '</div><div class="card"><h3 class="ah">最近的住廟回報</h3>' + (AD.stays.length ? '' : '<div class="empty">還沒有住廟回報</div>');
  var cur = '';
  AD.stays.forEach(function (s) {
    if (s.date !== cur) { cur = s.date; h += '<div class="mon">' + dlabel(s.date) + '</div>'; }
    h += '<div class="lrow"><span>' + esc(s.area) + '</span><span>' + esc(s.name) + '</span><small>' + esc(s.by) + '</small></div>';
  });
  return h + '</div>';
}
function adClockFix() {
  var x = { name: $('cfName').value, date: $('cfDate').value, time: $('cfTime').value, type: $('cfType').value };
  if (!x.name || !x.date || !x.time) { adMsg('請填完整', true); return; }
  adDo('clockFix', x, '已補登 ' + x.name + ' ' + x.date + ' ' + x.time + ' ' + x.type);
}

// ---- 公告 ----
function adNews() {
  var staff = (AD.users || []).filter(function (u) { return (u.role === '組員' || u.role === '組長') && u.enabled; });
  var on = staff.filter(function (u) { return (AD.devices || {})[u.name]; }).map(function (u) { return esc(u.name); });
  var off = staff.filter(function (u) { return !(AD.devices || {})[u.name]; }).map(function (u) { return esc(u.name); });
  var h = pushCard('adPush');
  if (ROLE !== 'viewer') h += '<div class="card"><h3 class="ah">發公告給同仁</h3>'
    + '<input id="nwTitle" placeholder="標題（必填，40 字內）" maxlength="40">'
    + '<textarea id="nwBody" placeholder="內容（可空白）" maxlength="1000" style="min-height:110px"></textarea>'
    + '<button class="big send" id="btnNews" onclick="adAnnounce(this)">發送</button>'
    + '<small>已開通知：' + (on.join('、') || '還沒有人') + (off.length ? '<br>還沒開通知：' + off.join('、') + '（他們仍可在 App「公告」看到）' : '') + '</small></div>';
  h += '<div class="card"><h3 class="ah">最近的公告</h3>' + (AD.news.length ? '' : '<div class="empty">還沒有公告</div>');
  AD.news.forEach(function (n) {
    h += '<div class="rep"><div><b>' + esc(n.title) + '</b><small>' + esc(n.time) + '・' + esc(n.by) + '</small></div>' + (n.body ? '<p>' + esc(n.body) + '</p>' : '') + '</div>';
  });
  return h + '</div>';
}
var newsArm = false;
function adAnnounce(btn) {
  var title = $('nwTitle').value.trim(), body = $('nwBody').value.trim();
  if (!title) { adMsg('請填標題', true); return; }
  if (!newsArm) { newsArm = true; btn.textContent = '確定發送給所有同仁？'; btn.classList.add('in'); return; }
  newsArm = false;
  adDo('announce', { title: title, body: body }, function (r) {
    return '公告已發出，送達 ' + r.sent + ' 支手機' + (r.error ? '（推播異常：' + r.error + '）' : '');
  });
}

// ---- 設定 ----
function adSettings() {
  var s = AD.settings, h = '<div class="card"><h3 class="ah">設定</h3>';
  Object.keys(s).forEach(function (k, i) {
    var v = s[k].value, yn = /^推播/.test(k);
    h += '<label>' + esc(k) + '</label>';
    if (yn) h += '<select id="st' + i + '" data-k="' + esc(k) + '"><option' + (v !== '否' ? ' selected' : '') + '>是</option><option' + (v === '否' ? ' selected' : '') + '>否</option></select>';
    else h += '<input id="st' + i + '" data-k="' + esc(k) + '" value="' + esc(v) + '"' + (/公尺|天數/.test(k) ? ' inputmode="numeric"' : '') + '>';
    if (s[k].note) h += '<small class="note">' + esc(s[k].note) + '</small>';
  });
  return h + '<button class="big send" onclick="adSaveSettings()">儲存設定</button><small>儲存後立即生效，組員下次打開 App 就會看到新的區域選項</small></div>'
    + '<div class="card"><h3 class="ah">更換管理者 PIN</h3>'
    + '<input id="apPin" type="password" inputmode="numeric" maxlength="6" placeholder="新的 6 位數 PIN" autocomplete="off">'
    + '<input id="apPin2" type="password" inputmode="numeric" maxlength="6" placeholder="再輸入一次" autocomplete="off">'
    + '<button class="big in" onclick="adAdminPin()">更換</button><small>換完後舊的 PIN 立即失效；其他已用舊 PIN 登入的管理者手機需要重新輸入</small></div>';
}
function adAdminPin() {
  var a = $('apPin').value.trim(), b2 = $('apPin2').value.trim();
  if (!/^\d{6}$/.test(a)) { adMsg('請輸入 6 位數字', true); return; }
  if (a !== b2) { adMsg('兩次輸入不一樣', true); return; }
  adDo('adminPin', { pin: a }, function (r) { setCode(r.name, r.pin); return '管理者 PIN 已更換，請記好新的 PIN'; });
}
function adSaveSettings() {
  var v = {};
  Object.keys(AD.settings).forEach(function (k, i) { v[k] = $('st' + i).value; });
  adDo('settings', { values: v }, '設定已儲存');
}
