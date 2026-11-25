// ===== 管理者介面（管理者 PIN 登入後顯示）=====
var AD = null;          // overview 資料
var adTab = 'people';

function adminStart(r) {
  show('admin');
  $('adToday').textContent = r.today + '（' + WEEK[new Date(r.today + 'T00:00:00').getDay()] + '）';
  adminLoad();
  syncPush();
}
function adminLoad() {
  return adm('overview').then(function (d) { AD = d; adRender(); }).catch(function (e) { adMsg(e.message, true); });
}
function adm(op, extra) {
  var body = { action: 'admin', u: CODE, op: op };
  for (var k in (extra || {})) body[k] = extra[k];
  return apiPost(body);
}
function adMsg(t, err) { var m = $('adMsg'); m.textContent = t || ''; m.className = 'msg ' + (err ? 'err' : 'ok'); if (t) setTimeout(function () { if (m.textContent === t) m.textContent = ''; }, 5000); }
function adTabGo(t) {
  adTab = t;
  ['people', 'today', 'sched', 'log', 'news', 'settings'].forEach(function (x) { $('at-' + x).classList.toggle('on', x === t); });
  adRender();
}
function adDo(op, extra, okText) {
  if (busy) return;
  busy = true; adMsg('處理中…');
  return adm(op, extra).then(function (r) {
    busy = false; adMsg(typeof okText === 'function' ? okText(r) : okText);
    return adminLoad().then(function () { return r; });
  }).catch(function (e) { busy = false; adMsg(e.message, true); });
}
function staffOpts(sel) {
  return (AD.users || []).filter(function (u) { return u.role === '員工' && u.enabled; })
    .map(function (u) { return '<option' + (u.name === sel ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('');
}
function dlabel(ds) { var d = new Date(ds + 'T00:00:00'); return (d.getMonth() + 1) + '/' + d.getDate() + '（' + WEEK[d.getDay()] + '）'; }

function adRender() {
  if (!AD) return;
  var h = '';
  if (adTab === 'people') h = adPeople();
  if (adTab === 'today') h = adToday();
  if (adTab === 'sched') h = adSched();
  if (adTab === 'log') h = adLog();
  if (adTab === 'news') h = adNews();
  if (adTab === 'settings') h = adSettings();
  $('adBody').innerHTML = h;
}

// ---- 人員 ----
function adPeople() {
  var h = '<div class="card"><h3 class="ah">人員</h3>';
  AD.users.forEach(function (u) {
    if (u.role === '管理者') return;
    var n = esc(u.name), q = "'" + n.replace(/'/g, '') + "'";
    var bell = (AD.devices || {})[u.name] ? ' <small class="ok">🔔 通知已開</small>' : '';
    h += '<div class="prow' + (u.enabled ? '' : ' off') + '"><div class="pn"><b>' + n + bell + '</b><span>PIN ' + esc(u.pin) + (u.enabled ? '' : '・已停用') + '</span></div>'
       + '<div class="pb">'
       + (u.enabled ? '<button class="sb pri" onclick="adDevice(' + q + ')">設定這支手機</button>' : '')
       + '<button class="sb" onclick="adNewPin(' + q + ',this)">換 PIN</button>'
       + '<button class="sb" onclick="adToggle(' + q + ',' + !u.enabled + ')">' + (u.enabled ? '停用' : '啟用') + '</button>'
       + '</div></div>';
  });
  h += '</div><div class="card"><h3 class="ah">新增人員</h3>'
     + '<input id="nuName" placeholder="姓名" maxlength="20">'
     + '<input id="nuPin" placeholder="PIN（4 位數，空白自動產生）" inputmode="numeric" maxlength="4">'
     + '<button class="big send" onclick="adAddUser()">新增</button></div>';
  return h;
}
function adAddUser() {
  var name = $('nuName').value.trim(), pin = $('nuPin').value.trim();
  if (!name) { adMsg('請輸入姓名', true); return; }
  adDo('addUser', { name: name, pin: pin }, function (r) { return '已新增 ' + r.name + '，PIN：' + r.pin; });
}
var pinArm = '';
function adNewPin(name, btn) {
  if (pinArm !== name) { pinArm = name; btn.textContent = '確定換？'; btn.classList.add('warn'); return; }
  pinArm = '';
  adDo('setPin', { name: name }, function (r) { return r.name + ' 的新 PIN：' + r.pin + '（舊的已失效）'; });
}
function adToggle(name, en) { adDo('setEnabled', { name: name, enabled: en }, name + (en ? ' 已啟用' : ' 已停用')); }
function adDevice(name) {
  if (busy) return;
  busy = true; adMsg('設定中…');
  adm('device', { name: name }).then(function (r) {
    busy = false;
    store('dh_pin', r.pin); CODE = r.pin; AD = null;
    show('app'); tab('clock'); load();
    msg('mClock', '這支手機已設定為 ' + r.name + '，可以加到主畫面了', 'ok');
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
           + ' <a class="x" onclick="adShiftCancel(' + q + ')">×</a></span>';
    }).join('') || (i > 0 && i <= 7 ? '<span class="gap">缺人</span>' : '<span class="none">尚無人</span>');
    h += '<div class="row' + (d.getDay() === 0 || d.getDay() === 6 ? ' wk' : '') + '"><div class="dt"><b>' + (d.getMonth() + 1) + '/' + d.getDate() + '</b><small>' + (i === 0 ? '今天' : '週' + WEEK[d.getDay()]) + '</small></div>'
       + '<div class="ppl">' + tags + '</div><button class="op" onclick="adSchedOpen(\'' + ds + '\')">＋</button></div>';
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
  if (!x.name) { adMsg('請選擇員工', true); return; }
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
  var h = '<div class="card"><h3 class="ah">補登簽到／簽退</h3>'
    + '<select id="cfName">' + staffOpts() + '</select>'
    + '<div class="srow2"><input id="cfDate" type="date" value="' + AD.today + '" max="' + AD.today + '"><input id="cfTime" type="time" value="17:00">'
    + '<select id="cfType"><option>簽退</option><option>簽到</option></select></div>'
    + '<button class="big send" onclick="adClockFix()">補登</button><small>紀錄會標示「管理者補登」，統計會一起算進去</small></div>';
  h += '<div class="card"><h3 class="ah">最近的事務回報</h3>' + (AD.reports.length ? '' : '<div class="empty">還沒有回報</div>');
  AD.reports.forEach(function (r) {
    h += '<div class="rep"><div><b>' + esc(r.name) + '</b> <span class="kind' + (r.kind === '異常回報' ? ' bad' : '') + '">' + esc(r.kind) + '</span><small>' + esc(r.date) + ' ' + esc(r.time) + '</small></div>'
       + '<p>' + esc(r.text) + '</p>'
       + (r.photos.length ? '<div class="pl">' + r.photos.map(function (p, i) { return '<a href="' + esc(p) + '" target="_blank" rel="noopener">照片 ' + (i + 1) + '</a>'; }).join('') + '</div>' : '') + '</div>';
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
  var staff = (AD.users || []).filter(function (u) { return u.role === '員工' && u.enabled; });
  var on = staff.filter(function (u) { return (AD.devices || {})[u.name]; }).map(function (u) { return esc(u.name); });
  var off = staff.filter(function (u) { return !(AD.devices || {})[u.name]; }).map(function (u) { return esc(u.name); });
  var h = pushCard('adPush')
    + '<div class="card"><h3 class="ah">發公告給同仁</h3>'
    + '<input id="nwTitle" placeholder="標題（必填，40 字內）" maxlength="40">'
    + '<textarea id="nwBody" placeholder="內容（可空白）" maxlength="1000" style="min-height:110px"></textarea>'
    + '<button class="big send" id="btnNews" onclick="adAnnounce(this)">發送</button>'
    + '<small>已開通知：' + (on.join('、') || '還沒有人') + (off.length ? '<br>還沒開通知：' + off.join('、') + '（他們仍可在 App「公告」看到）' : '') + '</small></div>'
    + '<div class="card"><h3 class="ah">最近的公告</h3>' + (AD.news.length ? '' : '<div class="empty">還沒有公告</div>');
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
  return h + '<button class="big send" onclick="adSaveSettings()">儲存設定</button><small>儲存後立即生效，員工下次打開 App 就會看到新的區域選項</small></div>';
}
function adSaveSettings() {
  var v = {};
  Object.keys(AD.settings).forEach(function (k, i) { v[k] = $('st' + i).value; });
  adDo('settings', { values: v }, '設定已儲存');
}
