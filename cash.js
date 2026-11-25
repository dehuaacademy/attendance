// ===== 零用金 =====
// 組員：回報 →「代墊」；組長：管理 →「零用金」；管理者、前賢、執行長、財務：上方「零用金」分頁
var CASH = null, CASH_HOST = '', cashWho = '', cashArm = '', cashType = '', cashMonth = '';
var cashPh = [], crPh = [];           // 新增表單的收據、補收據的收據（已壓縮的 dataURL）

function cashOpen(host) { CASH_HOST = host; cashRender(); cashLoad(); }
function cashLoad() {
  var who = CODE;
  if (CASH && cashWho !== who) CASH = null;
  return apiPost({ action: 'cash', op: 'list', u: CODE }).then(function (r) {
    if (CODE !== who) return;
    var same = CASH && JSON.stringify(CASH) === JSON.stringify(r);
    CASH = r; cashWho = who;
    if (!same) cashRender();
  }).catch(function (e) { toast('⚠️ ' + (e.message === 'Failed to fetch' ? '網路異常' : e.message)); });
}
// 目前畫面是不是零用金（同一個 adBody／leadBody 也用來顯示其他分頁）
function cashActive() {
  if (!CASH_HOST || !$(CASH_HOST)) return false;
  if (CASH_HOST === 'rCashBody') return $('rCash').style.display !== 'none';
  return typeof adTab !== 'undefined' && adTab === 'cash' && (CASH_HOST !== 'leadBody' || ROLE === 'leader');
}
function cashVisible() { return cashActive() && $(CASH_HOST).offsetParent !== null; }
function cashRender() {
  if (!cashActive()) return;
  $(CASH_HOST).innerHTML = cashHtml();
  renderCashPh();
  if (typeof loadThumbs === 'function') loadThumbs();
}
// 正在填表時不要自動重畫
function cashTyping() {
  return cashPh.length || crPh.length || ['cxAmt', 'cxNote', 'cfAmt', 'cfNote', 'crAmt', 'caNote'].some(function (id) { return $(id) && $(id).value; });
}

function nt(n) { return 'NT$ ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
var CASH_TAG = { '待核准': 'mid', '已核准': 'mid', '待核對': 'mid', '待還款': 'mid', '已核對': 'ok', '已入帳': 'ok', '退回': 'bad', '作廢': 'bad' };
function cashSpent(e) {
  if (e.type === '支出') return ['已核准', '待核對', '已核對'].indexOf(e.status) >= 0;
  if (e.type === '代墊') return ['待還款', '待核對', '已核對'].indexOf(e.status) >= 0;
  return false;
}
function cashBig(amount, cat) { return amount > CASH.limit && CASH.exempt.indexOf(cat) < 0; }

function cashHtml() {
  if (!CASH) return '<div class="card"><div class="empty">載入中…</div></div>';
  var C = CASH, k = C.caps, me = C.me.name, h = '';

  // 1. 餘額
  if (C.balance !== null) {
    var low = C.balance < C.low;
    h += '<div class="card cbal' + (low ? ' low' : '') + '"><small>組長手上零用金</small><b>' + nt(C.balance) + '</b>'
       + (low ? '<span class="bad">低於 ' + nt(C.low) + '，請財務撥款</span>' : '') + '</div>';
  }

  // 2. 待處理（只列我能處理的）
  var todo = C.rows.filter(function (e) {
    return (k.approve && e.status === '待核准') || (k.check && e.status === '待核對') || (k.repay && e.type === '代墊' && e.status === '待還款')
        || (e.status === '已核准' && (e.by === me || k.repay));
  });
  if (todo.length) {
    h += '<div class="card"><h3 class="ah">待處理（' + todo.length + '）</h3>';
    todo.forEach(function (e) { h += cashItem(e, true); });
    h += '</div>';
  }

  // 3. 登記
  var types = (k.spend ? ['支出'] : []).concat(k.advance ? ['代墊'] : []);
  if (types.length) {
    if (types.indexOf(cashType) < 0) cashType = types[0];
    h += '<div class="card"><h3 class="ah">' + (types.length > 1 ? '記一筆' : '登記代墊（自己先付的錢）') + '</h3>';
    if (types.length > 1) h += '<div class="seg">' + types.map(function (t) {
      return '<button class="' + (t === cashType ? 'on' : '') + '" onclick="cashType=\'' + t + '\';cashRender()">' + (t === '支出' ? '用零用金付' : '自己先付（代墊）') + '</button>'; }).join('') + '</div>';
    h += '<div class="srow2"><input id="cxDate" type="date" value="' + C.today + '"><select id="cxCat" onchange="cashHint()"><option value="">科目</option>'
       + C.cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></div>'
       + '<input id="cxAmt" type="number" inputmode="numeric" min="1" placeholder="金額（元）" oninput="cashHint()">'
       + '<input id="cxNote" maxlength="200" placeholder="說明：買了什麼、在哪裡買">'
       + '<label>收據照片（最多 3 張）</label><div class="photos" id="cxPhotos"></div>'
       + '<input type="file" id="cxPick" accept="image/*" multiple class="hide">'
       + '<div id="cxHint" class="chint"></div>'
       + '<button class="big send" id="cxBtn" onclick="cashAdd()">送出</button>'
       + '<small>超過 ' + nt(C.limit) + '（' + esc(C.exempt.join('、') || '無') + '除外）要先申請，執行長核准後才能花，花完再補收據</small></div>';
  }
  if (k.fund) {
    h += '<div class="card"><h3 class="ah">撥款／繳回</h3>'
       + '<div class="srow2"><select id="cfType"><option value="撥入">撥款給組長</option><option value="繳回">組長繳回</option></select><input id="cfDate" type="date" value="' + C.today + '"></div>'
       + '<input id="cfAmt" type="number" inputmode="numeric" min="1" placeholder="金額（元）">'
       + '<input id="cfNote" maxlength="200" placeholder="備註（可空白）">'
       + '<button class="big in" onclick="cashFund()">登記</button></div>';
  }

  // 4. 月報／我的紀錄
  var months = [];
  C.rows.forEach(function (e) { var m = (e.date || '').slice(0, 7); if (m && months.indexOf(m) < 0) months.push(m); });
  months.sort().reverse();
  if (!cashMonth || months.indexOf(cashMonth) < 0) cashMonth = months[0] || C.today.slice(0, 7);
  var list = C.rows.filter(function (e) { return (e.date || '').slice(0, 7) === cashMonth; });
  h += '<div class="card"><h3 class="ah">' + (k.all ? '月報' : '我的代墊') + '</h3>';
  if (months.length > 1) h += '<select onchange="cashMonth=this.value;cashRender()">' + months.map(function (m) {
    return '<option' + (m === cashMonth ? ' selected' : '') + ' value="' + m + '">' + m.replace('-', ' 年 ') + ' 月</option>'; }).join('') + '</select>';
  if (k.all) {
    var by = {}, out = 0, fin = 0, ret = 0;
    list.forEach(function (e) {
      if (e.type === '撥入' && e.status === '已入帳') fin += e.amount;
      else if (e.type === '繳回' && e.status === '已入帳') ret += e.amount;
      else if (cashSpent(e)) { by[e.cat] = (by[e.cat] || 0) + e.amount; out += e.amount; }
    });
    h += '<div class="csum"><div><small>撥入</small><b>' + nt(fin) + '</b></div><div><small>支出＋代墊</small><b>' + nt(out) + '</b></div>' + (ret ? '<div><small>繳回</small><b>' + nt(ret) + '</b></div>' : '') + '</div>';
    var cats = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
    if (cats.length) h += cats.map(function (c) { return '<div class="lrow"><span>' + esc(c) + '</span><b>' + nt(by[c]) + '</b></div>'; }).join('');
    h += '<small>只算已花出去的（含已核准、待核對、已還款），不含待核准、退回、作廢</small>';
  }
  h += '<div class="clist">' + (list.length ? list.map(function (e) { return cashItem(e, false); }).join('') : '<div class="empty">這個月沒有紀錄</div>') + '</div></div>';
  return h;
}

// 一筆紀錄；act=true 時顯示可以處理的按鈕
function cashItem(e, act) {
  var k = CASH.caps, me = CASH.me.name, id = e.id, h = '<div class="rep citem">';
  var sign = e.type === '撥入' ? '＋' : '－';
  h += '<div><b>' + esc(e.type === '撥入' || e.type === '繳回' ? e.type : e.cat) + '</b> <span class="' + (CASH_TAG[e.status] || 'mid') + '">' + esc(e.status) + '</span>'
     + '<span class="camt' + (e.type === '撥入' ? ' plus' : '') + '">' + sign + nt(e.amount).slice(4) + '</span></div>'
     + '<small class="cmeta">' + esc(e.date.slice(5).replace('-', '/')) + '・' + esc(e.by) + (e.type === '代墊' ? '・代墊' : '') + (e.type === '支出' || e.type === '代墊' ? '' : '')
     + (e.apprBy ? '・' + (e.status === '退回' ? '退回' : '核准') + '：' + esc(e.apprBy) + (e.apprAmt && Number(e.apprAmt) !== e.amount ? '（核准 ' + nt(Number(e.apprAmt)).slice(4) + '）' : '') : '')
     + (e.checkBy ? '・核對：' + esc(e.checkBy) : '') + (e.repaidAt ? '・已還款' : '') + '</small>';
  if (e.note) h += '<p>' + esc(e.note) + '</p>';
  if (e.remark) h += '<p class="crem">備註：' + esc(e.remark) + '</p>';
  if (e.photos.length) h += '<div class="pl">' + e.photos.map(thumbHtml).join('') + '</div>';
  else if (e.type === '支出' || e.type === '代墊') { if (e.status !== '待核准' && e.status !== '退回' && e.status !== '作廢' && e.status !== '已核准') h += '<small class="mid">沒有收據照片</small>'; }

  var btn = [];
  if (act) {
    if (k.approve && e.status === '待核准') {
      btn.push('<button class="sb pri" onclick="cashOp(\'approve\',\'' + id + '\')">核准</button>');
      btn.push('<button class="sb" onclick="cashAsk(\'reject\',\'' + id + '\')">退回</button>');
    }
    if (k.check && e.status === '待核對') btn.push('<button class="sb pri" onclick="cashOp(\'check\',\'' + id + '\')">核對無誤</button>');
    if (k.repay && e.type === '代墊' && e.status === '待還款') btn.push('<button class="sb pri" onclick="cashConfirm(\'repay\',\'' + id + '\',this)">已還 ' + esc(e.by) + ' ' + nt(e.amount).slice(4) + ' 元</button>');
    if (e.status === '已核准' && (e.by === me || k.repay)) btn.push('<button class="sb pri" onclick="cashAsk(\'receipt\',\'' + id + '\')">補收據</button>');
  } else {
    var canVoid = (e.by === me && ['待核准', '已核准', '待核對', '待還款', '已入帳'].indexOf(e.status) >= 0) || (CASH.me.role === '管理者' && ['已核對', '作廢'].indexOf(e.status) < 0);
    if (canVoid) btn.push('<button class="sb" onclick="cashAsk(\'void\',\'' + id + '\')">作廢</button>');
  }
  if (btn.length) h += '<div class="pb">' + btn.join('') + '</div>';

  // 展開的輸入（退回原因、作廢原因、補收據）
  if (cashArm === 'reject:' + id || cashArm === 'void:' + id) {
    var op = cashArm.split(':')[0];
    h += '<div class="sform"><input id="caNote" maxlength="200" placeholder="' + (op === 'reject' ? '退回原因' : '作廢原因') + '">'
       + '<button class="sb warn" onclick="cashOp(\'' + op + '\',\'' + id + '\')">確定' + (op === 'reject' ? '退回' : '作廢') + '</button> <button class="sb" onclick="cashArm=\'\';cashRender()">取消</button></div>';
  }
  if (cashArm === 'receipt:' + id) {
    h += '<div class="sform"><input id="crAmt" type="number" inputmode="numeric" placeholder="實際金額（核准 ' + nt(e.amount).slice(4) + '）" value="">'
       + '<label>收據照片</label><div class="photos" id="crPhotos"></div><input type="file" id="crPick" accept="image/*" multiple class="hide">'
       + '<button class="sb pri" onclick="cashReceipt(\'' + id + '\')">送出收據</button> <button class="sb" onclick="cashArm=\'\';crPh=[];cashRender()">取消</button></div>';
  }
  return h + '</div>';
}

function cashHint() {
  if (!$('cxAmt')) return;
  var a = Number($('cxAmt').value), big = a > 0 && cashBig(a, $('cxCat').value);
  $('cxHint').textContent = big ? '超過 ' + nt(CASH.limit) + '：會先送執行長核准，核准後再去買、補收據' : '';
  $('cxBtn').textContent = big ? '送出申請（需執行長核准）' : '送出';
}
function cashAsk(op, id) { cashArm = cashArm === op + ':' + id ? '' : op + ':' + id; crPh = []; cashRender(); var f = $('caNote') || $('crAmt'); if (f) f.focus(); }
var cashConfirmArm = '';
function cashConfirm(op, id, btn) {
  if (cashConfirmArm !== op + id) { cashConfirmArm = op + id; btn.textContent = '確定已還款？'; btn.classList.add('warn'); return; }
  cashConfirmArm = ''; cashOp(op, id);
}

function cashSend(body, okText) {
  if (isBusy()) return Promise.resolve();
  busy = true; busySince = Date.now(); toast('處理中…');
  body.action = 'cash'; body.u = CODE;
  return apiPost(body).then(function (r) {
    busy = false; toast(typeof okText === 'function' ? okText(r) : okText);
    cashArm = ''; return cashLoad().then(function () { return r; });
  }).catch(function (e) { busy = false; toast('⚠️ ' + (e.message === 'Failed to fetch' ? '網路異常，請再試一次' : e.message)); throw e; });
}
function cashOp(op, id) {
  var note = $('caNote') ? $('caNote').value.trim() : '';
  if ((op === 'reject' || op === 'void') && !note) { toast('⚠️ 請填原因'); return; }
  var ok = { approve: '已核准', reject: '已退回', check: '已核對', repay: '已登記還款', void: '已作廢' }[op];
  cashSend({ op: op, id: id, note: note }, ok).catch(function () {});
}
function cashAdd() {
  var x = { op: 'add', type: cashType, date: $('cxDate').value, cat: $('cxCat').value, amount: Number($('cxAmt').value), note: $('cxNote').value.trim(), photos: cashPh };
  if (!x.cat) { toast('⚠️ 請選擇科目'); return; }
  if (!(x.amount > 0)) { toast('⚠️ 請填金額'); return; }
  if (!x.note) { toast('⚠️ 請填說明'); return; }
  var big = cashBig(x.amount, x.cat);
  if (!big && !cashPh.length && !confirm('沒有拍收據，確定送出？')) return;
  cashSend(x, function (r) { return r.status === '待核准' ? '申請已送出，等執行長核准' : '已登記（' + r.status + '）'; })
    .then(function () { cashPh = []; renderCashPh(); ['cxAmt', 'cxNote'].forEach(function (i) { if ($(i)) $(i).value = ''; }); cashRender(); }).catch(function () {});
}
function cashFund() {
  var x = { op: 'add', type: $('cfType').value, date: $('cfDate').value, amount: Number($('cfAmt').value), note: $('cfNote').value.trim() };
  if (!(x.amount > 0)) { toast('⚠️ 請填金額'); return; }
  cashSend(x, x.type === '撥入' ? '已登記撥款' : '已登記繳回').then(function () { $('cfAmt').value = ''; $('cfNote').value = ''; cashRender(); }).catch(function () {});
}
function cashReceipt(id) {
  var a = Number($('crAmt').value);
  if (!(a > 0)) { toast('⚠️ 請填實際金額'); return; }
  if (!crPh.length) { toast('⚠️ 請拍收據'); return; }
  cashSend({ op: 'receipt', id: id, amount: a, photos: crPh }, '收據已送出').then(function () { crPh = []; cashRender(); }).catch(function () {});
}

// 收據照片：沿用回報的壓縮方式
function renderCashPh() {
  [['cxPhotos', cashPh, 'cxPick'], ['crPhotos', crPh, 'crPick']].forEach(function (x) {
    if (!$(x[0])) return;
    var html = x[1].map(function (p, i) { return '<div class="ph"><img src="' + p + '"><button onclick="cashPhDel(\'' + x[0] + '\',' + i + ')">×</button></div>'; }).join('');
    if (x[1].length < MAX_PHOTOS) html += '<div class="add" onclick="$(\'' + x[2] + '\').click()">＋<br>拍收據</div>';
    $(x[0]).innerHTML = html;
  });
}
function cashPhDel(box, i) { (box === 'cxPhotos' ? cashPh : crPh).splice(i, 1); renderCashPh(); }
document.addEventListener('change', function (e) {
  if (e.target.id !== 'cxPick' && e.target.id !== 'crPick') return;
  var arr = e.target.id === 'cxPick' ? cashPh : crPh;
  var files = Array.prototype.slice.call(e.target.files, 0, MAX_PHOTOS - arr.length);
  e.target.value = '';
  toast('處理照片中…');
  Promise.all(files.map(compress)).then(function (list) { list.forEach(function (p) { arr.push(p); }); renderCashPh(); })
    .catch(function (err) { toast('⚠️ ' + err.message); });
});
