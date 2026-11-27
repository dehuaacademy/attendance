// ===== 財務：請購｜記帳｜月報 =====
// 組員：回報 →「財務」；組長：管理 →「財務」；管理者、前賢、執行長、財務：上方「財務」分頁
var CASH = null, CASH_HOST = '', cashWho = '', cashArm = '', cashType = '', cashMonth = '', cashSeg = 'book';
var cashPr = '', prRepair = null;     // 記帳時預選的請購單；開請購單時對應的報修單 {id, loc}
var cashPh = [], qPh = [];
var cashEnt = '';                     // 月報篩選主體（空白＝全部）            // 收據照片、報價照片（已壓縮的 dataURL）

function cashOpen(host) { CASH_HOST = host; cashRender(); cashLoad(); }
function cashLoad() {
  var who = CODE;
  if (CASH && cashWho !== who) CASH = null;
  return apiPost({ action: 'cash', op: 'list', u: CODE }).then(function (r) {
    if (CODE !== who) return;
    var same = CASH && JSON.stringify(CASH) === JSON.stringify(r);
    if (!CASH && !prRepair) {   // 第一次打開：依角色決定先看哪一頁
      var k = r.caps;
      cashSeg = k.approve ? 'preq' : (k.spend || k.advance || k.direct || k.fund) ? 'book' : 'month';
    }
    CASH = r; cashWho = who;
    if (!same) cashRender();
  }).catch(function (e) { toast('⚠️ ' + (e.message === 'Failed to fetch' ? '網路異常' : e.message)); });
}
// 目前畫面是不是財務頁（同一個 adBody／leadBody 也用來顯示其他分頁）
function cashActive() {
  if (!CASH_HOST || !$(CASH_HOST)) return false;
  if (CASH_HOST === 'rCashBody') return $('rCash').style.display !== 'none';
  return typeof adTab !== 'undefined' && adTab === 'cash' && (CASH_HOST !== 'leadBody' || ROLE === 'leader');
}
function cashVisible() { return cashActive() && $(CASH_HOST).offsetParent !== null; }
function cashRender() {
  if (!cashActive()) return;
  $(CASH_HOST).innerHTML = cashHtml();
  entLock();
  renderCashPh();
  if (typeof loadThumbs === 'function') loadThumbs();
}
// 正在填表時不要自動重畫
function cashTyping() {
  return cashPh.length || qPh.length || ['cxAmt', 'cxNote', 'cfAmt', 'cfNote', 'caNote', 'pqItem', 'pqEst', 'pqNote', 'pqReason'].some(function (id) { return $(id) && $(id).value; });
}

function nt(n) { return 'NT$ ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function nn(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
var CASH_TAG = { '待核准': 'mid', '已核准': 'mid', '待核對': 'mid', '待還款': 'mid', '已核對': 'ok', '已入帳': 'ok', '已付款': 'ok', '已採購': 'ok', '退回': 'bad', '作廢': 'bad' };
var TYPE_LABEL = { '支出': '零用金支出', '代墊': '代墊', '直付': '財務直付', '撥入': '撥入', '繳回': '繳回' };
function cashSpent(e) {
  if (e.type === '支出') return ['已核准', '待核對', '已核對'].indexOf(e.status) >= 0;
  if (e.type === '代墊') return ['待還款', '待核對', '已核對'].indexOf(e.status) >= 0;
  if (e.type === '直付') return e.status === '已付款';
  return false;
}
function cashBig(amount, cat) { return amount > CASH.limit && CASH.exempt.indexOf(cat) < 0; }
function prById(id) { return (CASH.preqs || []).filter(function (p) { return p.id === id; })[0]; }
function entOfCat(cat) { var m = CASH.entCats || {}; return (CASH.ents || []).filter(function (k) { return (m[k] || []).indexOf(cat) >= 0; })[0] || ''; }
function entOpts(sel, blank) { return (blank ? '<option value="">' + blank + '</option>' : '') + (CASH.ents || []).map(function (k) { return '<option' + (k === sel ? ' selected' : '') + '>' + k + '</option>'; }).join(''); }
// 選科目時自動帶主體（交通、雜支等沒有預設的要自己選）
function entAuto(catId, entId) { if ($(entId)) $(entId).value = entOfCat($(catId).value); entLock(); }
// 有預設主體的科目：非財務鎖住主體（後台也會擋）
function entLock() {
  ['cx', 'pq'].forEach(function (x) {
    var c = $(x + 'Cat'), e = $(x + 'Ent'); if (!c || !e) return;
    var d = entOfCat(c.value);
    if (d && !CASH.caps.check) { e.value = d; e.disabled = true; } else e.disabled = false;
  });
}
// 主體和科目預設不同（財務改過）
function entOff(x) { var d = entOfCat(x.cat); return !!(d && x.ent && x.ent !== d); }
function entOffTag(x) { return entOff(x) ? '<span class="warn">⚠️ 主體與科目預設不同</span>' : ''; }
function catOpts(sel) { return '<option value="">科目</option>' + CASH.cats.map(function (c) { return '<option' + (c === sel ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join(''); }

function cashHtml() {
  if (!CASH) return '<div class="card"><div class="empty">載入中…</div></div>';
  var C = CASH, k = C.caps, me = C.me.name, h = '';

  // 1. 餘額
  if (C.bal) {
    h += '<div class="cbal2">' + C.ents.map(function (k) {
      var cash = C.bal[k] || 0, q = C.quota[k] || 0, low = cash < C.low;
      return '<div class="card cbal' + (low ? ' low' : '') + '"><small>' + k + '零用金</small><b>' + nt(cash) + '</b>'
        + '<small>額度 ' + nn(q) + '・待補憑證 ' + nn(q - cash) + (C.pend[k] ? '（待核對 ' + nn(C.pend[k]) + '）' : '') + '</small>'
        + (low ? '<span class="bad">低於 ' + nn(C.low) + '，請財務撥補</span>' : '') + '</div>';
    }).join('') + '</div>';
    if (C.bal['未指定']) h += '<small class="mid">有舊紀錄沒有主體（' + nt(C.bal['未指定']) + '），請財務在月報改主體</small>';
  }

  // 2. 待處理（只列我能處理的）
  var ptodo = C.preqs.filter(function (p) {
    return (k.approve && p.status === '待核准') || (p.status === '已核准' && (p.by === me || k.spend || k.direct));
  });
  var todo = C.rows.filter(function (e) {
    return (k.check && e.status === '待核對') || (k.repay && e.type === '代墊' && e.status === '待還款');
  });
  if (ptodo.length || todo.length) {
    h += '<div class="card"><h3 class="ah">待處理（' + (ptodo.length + todo.length) + '）</h3>';
    ptodo.forEach(function (p) { h += preqItem(p, true); });
    todo.forEach(function (e) { h += cashItem(e, true); });
    h += '</div>';
  }

  // 3. 分頁
  var segs = [['preq', '請購'], ['book', '記帳'], ['month', k.all ? '月報' : '我的紀錄']];
  if (!k.request && !k.approve && !k.all) segs = segs.filter(function (x) { return x[0] !== 'preq'; });
  h += '<div class="seg">' + segs.map(function (x) {
    return '<button class="' + (x[0] === cashSeg ? 'on' : '') + '" onclick="cashSeg=\'' + x[0] + '\';cashArm=\'\';cashRender()">' + x[1] + '</button>'; }).join('') + '</div>';
  if (cashSeg === 'preq') h += preqHtml();
  else if (cashSeg === 'month') h += monthHtml();
  else h += bookHtml();
  return h;
}

// ---- 請購 ----
function preqHtml() {
  var C = CASH, k = C.caps, h = '';
  if (k.request) {
    h += '<div class="card"><h3 class="ah">開請購單</h3>'
       + (prRepair ? '<div class="clink">🔧 對應報修：' + esc(prRepair.loc) + ' <a onclick="prRepair=null;cashRender()">取消對應</a></div>' : '')
       + '<input id="pqItem" maxlength="60" placeholder="品項：要買什麼、修什麼">'
       + '<div class="srow2"><select id="pqCat" onchange="entAuto(\'pqCat\',\'pqEnt\')">' + catOpts() + '</select><select id="pqEnt">' + entOpts('', '主體') + '</select></div>'
       + '<input id="pqEst" type="number" inputmode="numeric" placeholder="預估金額（元）">'
       + '<input id="pqNote" maxlength="300" placeholder="用途、說明（可空白）">'
       + '<label>報價照片（至少 2 家，最多 3 張）</label><div class="photos" id="pqPhotos"></div>'
       + '<input type="file" id="pqPick" accept="image/*" multiple class="hide">'
       + '<input id="pqReason" maxlength="200" placeholder="只有 1 家或沒有報價時，請寫原因（例如原廠維修）">'
       + '<button class="big send" onclick="preqAdd()">送出請購（執行長核准）</button>'
       + '<small>核准後就可以採購。付款後記帳時選這張請購單；超過 ' + nt(C.limit) + '（' + esc(C.exempt.join('、') || '無') + '除外）的支出一定要有核准的請購單</small></div>';
  }
  h += '<div class="card"><h3 class="ah">' + (k.all ? '最近的請購' : '我的請購') + '</h3>';
  h += C.preqs.length ? C.preqs.slice(0, 50).map(function (p) { return preqItem(p, false); }).join('') : '<div class="empty">還沒有請購單</div>';
  return h + '</div>';
}
function preqItem(p, act) {
  var k = CASH.caps, me = CASH.me.name, id = p.id, h = '<div class="rep citem">';
  h += '<div><b>' + esc(p.item) + '</b> <span class="' + (CASH_TAG[p.status] || 'mid') + '">請購・' + esc(p.status) + '</span><span class="camt">' + nn(p.est) + '</span></div>'
     + '<small class="cmeta">' + esc(p.created.slice(5, 10).replace('-', '/')) + '・' + esc(p.by) + '・' + esc(p.ent || '未指定') + '・' + esc(p.cat) + '・報價 ' + p.quotes.length + ' 家'
     + (p.apprBy ? '・' + (p.status === '退回' ? '退回' : '核准') + '：' + esc(p.apprBy) : '') + '</small>' + entOffTag(p);
  if (p.note) h += '<p>' + esc(p.note) + '</p>';
  if (p.reason) h += '<p class="crem">單一報價理由：' + esc(p.reason) + '</p>';
  if (p.remark) h += '<p class="crem">備註：' + esc(p.remark) + '</p>';
  if (p.repair) h += '<small class="cmeta">🔧 報修單 ' + esc(p.repair) + '</small>';
  if (p.quotes.length) h += '<div class="pl">' + p.quotes.map(thumbHtml).join('') + '</div>';
  var btn = [];
  if (act && k.approve && p.status === '待核准') {
    btn.push('<button class="sb pri" onclick="cashOp(\'papprove\',\'' + id + '\')">核准</button>');
    btn.push('<button class="sb" onclick="cashAsk(\'preject\',\'' + id + '\')">退回</button>');
  }
  if (act && p.status === '已核准' && (p.by === me || k.spend || k.direct)) btn.push('<button class="sb pri" onclick="cashUsePr(\'' + id + '\')">付款後記帳</button>');
  if (!act && ((p.by === me && ['待核准', '已核准'].indexOf(p.status) >= 0) || (CASH.me.role === '管理者' && ['已採購', '作廢'].indexOf(p.status) < 0)))
    btn.push('<button class="sb" onclick="cashAsk(\'pvoid\',\'' + id + '\')">作廢</button>');
  if (btn.length) h += '<div class="pb">' + btn.join('') + '</div>';
  h += reasonBox(id);
  return h + '</div>';
}
function cashUsePr(id) { cashPr = id; cashSeg = 'book'; var p = prById(id); if (p && cashType !== '直付') cashType = CASH.caps.spend ? '支出' : '代墊'; cashRender(); }
// 從報修單開請購（repair.js 呼叫）
function preqFromRepair(id, loc) { prRepair = { id: id, loc: loc }; cashSeg = 'preq'; }

// ---- 記帳 ----
function bookHtml() {
  var C = CASH, k = C.caps, h = '';
  var types = (k.spend ? ['支出'] : []).concat(k.advance ? ['代墊'] : []).concat(k.direct ? ['直付'] : []);
  if (types.length) {
    if (types.indexOf(cashType) < 0) cashType = types[0];
    var label = { '支出': '用零用金付', '代墊': '自己先付', '直付': '財務直付' };
    var prs = C.preqs.filter(function (p) { return p.status === '已核准'; });
    var sel = prById(cashPr);
    h += '<div class="card"><h3 class="ah">記一筆</h3>';
    if (types.length > 1) h += '<div class="seg">' + types.map(function (t) {
      return '<button class="' + (t === cashType ? 'on' : '') + '" onclick="cashType=\'' + t + '\';cashRender()">' + label[t] + '</button>'; }).join('') + '</div>';
    else h += '<small>' + (cashType === '代墊' ? '自己先付的錢，組長之後用零用金還你' : '') + '</small>';
    h += '<select id="cxPr" onchange="cashPr=this.value;cashRender()"><option value="">不對應請購單（小額支出）</option>' + prs.map(function (p) {
           return '<option value="' + p.id + '"' + (p.id === cashPr ? ' selected' : '') + '>請購：' + esc(p.item) + '（' + nn(p.est) + '）</option>'; }).join('') + '</select>'
       + '<div class="srow2"><select id="cxCat" onchange="entAuto(\'cxCat\',\'cxEnt\');cashHint()">' + catOpts(sel ? sel.cat : '') + '</select><select id="cxEnt">' + entOpts(sel ? sel.ent : '', '主體') + '</select></div>'
       + '<input id="cxDate" type="date" value="' + C.today + '" max="' + C.today + '">'
       + '<input id="cxAmt" type="number" inputmode="numeric" min="1" placeholder="實際金額（元）" oninput="cashHint()">'
       + '<input id="cxNote" maxlength="200" placeholder="說明：買了什麼、在哪裡買" value="' + (sel ? esc(sel.item) : '') + '">'
       + '<label>' + (cashType === '直付' ? '發票、匯款單照片' : '收據照片') + '（最多 3 張）</label><div class="photos" id="cxPhotos"></div>'
       + '<input type="file" id="cxPick" accept="image/*" multiple class="hide">'
       + '<div id="cxHint" class="chint"></div>'
       + '<button class="big send" id="cxBtn" onclick="cashAdd()">送出</button>'
       + '<small>主體依科目自動帶（德化宮：' + esc((C.entCats['德化宮'] || []).join('、')) + '；其他科目多為基金會，交通、雜支請自己選；有預設的只有財務能改）。付現金時從該主體的信封拿，收據放回同一個信封。'
       + (cashType === '直付' ? '財務直付不扣組長的零用金，但會算進月報' : '超過 ' + nt(C.limit) + '（' + esc(C.exempt.join('、') || '無') + '除外）要先開請購單，核准後在上面選那張請購單') + '</small></div>';
  }
  if (k.fund) {
    h += '<div class="card"><h3 class="ah">零用金撥款／繳回</h3>'
       + '<div class="srow2"><select id="cfType"><option value="撥入">撥款／撥補給組長</option><option value="繳回">組長繳回</option></select><select id="cfEnt">' + entOpts('', '哪一個零用金') + '</select></div>'
       + '<input id="cfDate" type="date" value="' + C.today + '" max="' + C.today + '">'
       + '<input id="cfAmt" type="number" inputmode="numeric" min="1" placeholder="金額（元）">'
       + '<input id="cfNote" maxlength="200" placeholder="備註（可空白）">'
       + '<button class="big in" onclick="cashFund()">登記</button>'
       + '<small>定額制：核對憑證後，撥補已花掉的金額，讓現金回到額度（德化宮 ' + nn(C.quota['德化宮']) + '、基金會 ' + nn(C.quota['基金會']) + '）</small></div>';
  }
  if (!types.length && !k.fund) h += '<div class="card"><div class="empty">你的角色只能看帳，可以看「月報」</div></div>';
  return h;
}

// ---- 月報 ----
function monthHtml() {
  var C = CASH, k = C.caps, h = '';
  var months = [];
  C.rows.forEach(function (e) { var m = (e.date || '').slice(0, 7); if (m && months.indexOf(m) < 0) months.push(m); });
  months.sort().reverse();
  if (!cashMonth || months.indexOf(cashMonth) < 0) cashMonth = months[0] || C.today.slice(0, 7);
  var list = C.rows.filter(function (e) { return (e.date || '').slice(0, 7) === cashMonth && (!cashEnt || (e.ent || '未指定') === cashEnt); });
  h += '<div class="card"><h3 class="ah">' + (k.all ? '月報' : '我的紀錄') + '</h3>';
  if (months.length > 1) h += '<select onchange="cashMonth=this.value;cashRender()">' + months.map(function (m) {
    return '<option' + (m === cashMonth ? ' selected' : '') + ' value="' + m + '">' + m.replace('-', ' 年 ') + ' 月</option>'; }).join('') + '</select>';
  h += '<div class="seg">' + [['', '全部']].concat(C.ents.map(function (k) { return [k, k]; })).map(function (x) {
    return '<button class="' + (x[0] === cashEnt ? 'on' : '') + '" onclick="cashEnt=\'' + x[0] + '\';cashRender()">' + x[1] + '</button>'; }).join('') + '</div>';
  if (k.all) {
    var by = {}, petty = 0, direct = 0, fin = 0, ret = 0;
    list.forEach(function (e) {
      if (e.type === '撥入' && e.status === '已入帳') fin += e.amount;
      else if (e.type === '繳回' && e.status === '已入帳') ret += e.amount;
      else if (cashSpent(e)) { by[e.cat] = (by[e.cat] || 0) + e.amount; if (e.type === '直付') direct += e.amount; else petty += e.amount; }
    });
    h += '<div class="csum"><div><small>零用金撥入</small><b>' + nt(fin) + '</b></div><div><small>零用金支出</small><b>' + nt(petty) + '</b></div><div><small>財務直付</small><b>' + nt(direct) + '</b></div></div>';
    if (ret) h += '<small>本月繳回 ' + nt(ret) + '</small>';
    var cats = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
    if (cats.length) h += cats.map(function (c) { return '<div class="lrow"><span>' + esc(c) + '</span><b>' + nt(by[c]) + '</b></div>'; }).join('')
      + '<div class="lrow"><span><b>合計</b></span><b>' + nt(petty + direct) + '</b></div>';
    h += '<small>只算已經花出去的（零用金支出、代墊、財務直付），不含作廢' + (cashEnt ? '；只看' + cashEnt : '；德化宮、基金會合計，交帳請分開看') + '</small>';
  }
  h += '<div class="clist">' + (list.length ? list.map(function (e) { return cashItem(e, false); }).join('') : '<div class="empty">這個月沒有紀錄</div>') + '</div></div>';
  return h;
}

// 一筆帳；act=true 時顯示可以處理的按鈕
function cashItem(e, act) {
  var k = CASH.caps, me = CASH.me.name, id = e.id, h = '<div class="rep citem">';
  var sign = e.type === '撥入' ? '＋' : '－', pr = e.pr ? prById(e.pr) : null;
  h += '<div><b>' + esc(e.type === '撥入' || e.type === '繳回' ? e.type : e.cat) + '</b> <span class="' + (CASH_TAG[e.status] || 'mid') + '">' + esc(e.status) + '</span>'
     + '<span class="camt' + (e.type === '撥入' ? ' plus' : '') + '">' + sign + nn(e.amount) + '</span></div>'
     + '<small class="cmeta"><span class="cent">' + esc(e.ent || '未指定') + '</span>' + esc(e.date.slice(5).replace('-', '/')) + '・' + esc(e.by) + '・' + esc(TYPE_LABEL[e.type] || e.type)
     + (e.checkBy ? '・核對：' + esc(e.checkBy) : '') + (e.repaidAt ? '・已還款' : '') + '</small>' + entOffTag(e);
  if (e.note) h += '<p>' + esc(e.note) + '</p>';
  if (e.pr) h += '<small class="cmeta">📝 請購 ' + (pr ? esc(pr.item) + '（預估 ' + nn(pr.est) + (e.amount > pr.est ? '，⚠️ 超過' : '') + '）' : esc(e.pr)) + '</small>';
  if (e.remark) h += '<p class="crem">備註：' + esc(e.remark) + '</p>';
  if (e.photos.length) h += '<div class="pl">' + e.photos.map(thumbHtml).join('') + '</div>';
  else if (['支出', '代墊', '直付'].indexOf(e.type) >= 0 && e.status !== '作廢') h += '<small class="mid">沒有收據照片</small>';

  var btn = [];
  if (act) {
    if (k.check && e.status === '待核對') btn.push('<select id="ce' + id + '" class="csel">' + entOpts(e.ent, e.ent ? '' : '主體') + '</select><button class="sb pri" onclick="cashCheck(\'' + id + '\')">核對無誤</button>');
    if (k.repay && e.type === '代墊' && e.status === '待還款') btn.push('<button class="sb pri" onclick="cashConfirm(\'repay\',\'' + id + '\',this)">已還 ' + esc(e.by) + ' ' + nn(e.amount) + ' 元</button>');
  } else {
    var canVoid = (e.by === me && ['待核准', '已核准', '待核對', '待還款', '已入帳', '已付款'].indexOf(e.status) >= 0) || (CASH.me.role === '管理者' && ['已核對', '作廢'].indexOf(e.status) < 0);
    if (canVoid) btn.push('<button class="sb" onclick="cashAsk(\'void\',\'' + id + '\')">作廢</button>');
    if (k.check && e.status !== '作廢') CASH.ents.forEach(function (x) { if (x !== e.ent) btn.push('<button class="sb" onclick="cashEntSet(\'' + id + '\',\'' + x + '\')">改為' + x + '</button>'); });
  }
  if (btn.length) h += '<div class="pb">' + btn.join('') + '</div>';
  h += reasonBox(id);
  return h + '</div>';
}
// 退回、作廢要填原因
function reasonBox(id) {
  var m = cashArm.match(/^(void|preject|pvoid):(.+)$/);
  if (!m || m[2] !== id) return '';
  var op = m[1], word = op === 'preject' ? '退回' : '作廢';
  return '<div class="sform"><input id="caNote" maxlength="200" placeholder="' + word + '原因">'
       + '<button class="sb warn" onclick="cashOp(\'' + op + '\',\'' + id + '\')">確定' + word + '</button> <button class="sb" onclick="cashArm=\'\';cashRender()">取消</button></div>';
}

function cashHint() {
  if (!$('cxAmt')) return;
  var a = Number($('cxAmt').value), big = a > 0 && cashType !== '直付' && !cashPr && cashBig(a, $('cxCat').value);
  $('cxHint').textContent = big ? '超過 ' + nt(CASH.limit) + '：要先開請購單，執行長核准後在上面選那張請購單' : '';
}
function cashAsk(op, id) { cashArm = cashArm === op + ':' + id ? '' : op + ':' + id; cashRender(); if ($('caNote')) $('caNote').focus(); }
var cashConfirmArm = '';
function cashConfirm(op, id, btn) {
  if (cashConfirmArm !== op + id) { cashConfirmArm = op + id; btn.textContent = '確定已還款？'; btn.classList.add('warn'); return; }
  cashConfirmArm = ''; cashOp(op, id);
}

function cashSend(body, okText) {
  if (isBusy()) return Promise.reject(new Error('busy'));
  busy = true; busySince = Date.now(); toast('處理中…');
  body.action = 'cash'; body.u = CODE;
  return apiPost(body).then(function (r) {
    busy = false; toast(typeof okText === 'function' ? okText(r) : okText);
    cashArm = ''; return cashLoad().then(function () { return r; });
  }).catch(function (e) { busy = false; if (e.message !== 'busy') toast('⚠️ ' + (e.message === 'Failed to fetch' ? '網路異常，請再試一次' : e.message)); throw e; });
}
function cashOp(op, id) {
  var note = $('caNote') ? $('caNote').value.trim() : '';
  if (['preject', 'void', 'pvoid'].indexOf(op) >= 0 && !note) { toast('⚠️ 請填原因'); return; }
  var ok = { papprove: '請購已核准', preject: '請購已退回', pvoid: '請購已作廢', check: '已核對', repay: '已登記還款', void: '已作廢' }[op];
  cashSend({ op: op, id: id, note: note }, ok).catch(function () {});
}
function cashCheck(id) {
  var ent = $('ce' + id) ? $('ce' + id).value : '';
  if (!ent) { toast('⚠️ 請先選主體'); return; }
  cashSend({ op: 'check', id: id, ent: ent }, '已核對（' + ent + '）').catch(function () {});
}
function cashEntSet(id, ent) {
  if (!confirm('這筆改成「' + ent + '」？兩個零用金的待補金額會跟著調整')) return;
  cashSend({ op: 'ent', id: id, ent: ent }, '已改為' + ent).catch(function () {});
}
function preqAdd() {
  var x = { op: 'padd', item: $('pqItem').value.trim(), cat: $('pqCat').value, est: Number($('pqEst').value), note: $('pqNote').value.trim(),
            reason: $('pqReason').value.trim(), quotes: qPh, repair: prRepair ? prRepair.id : '', ent: $('pqEnt').value };
  if (!x.item) { toast('⚠️ 請填品項'); return; }
  if (!x.cat) { toast('⚠️ 請選擇科目'); return; }
  if (!x.ent) { toast('⚠️ 請選主體（德化宮或基金會）'); return; }
  if (!(x.est > 0)) { toast('⚠️ 請填預估金額'); return; }
  if (qPh.length < 2 && !x.reason) { toast('⚠️ 請附至少 2 家報價，或填只有 1 家的原因'); $('pqReason').focus(); return; }
  cashSend(x, '請購已送出，等執行長核准').then(function () {
    qPh = []; prRepair = null; ['pqItem', 'pqEst', 'pqNote', 'pqReason'].forEach(function (i) { if ($(i)) $(i).value = ''; }); cashRender();
  }).catch(function () {});
}
function cashAdd() {
  var x = { op: 'add', type: cashType, date: $('cxDate').value, cat: $('cxCat').value, amount: Number($('cxAmt').value), note: $('cxNote').value.trim(), photos: cashPh, pr: cashPr, ent: $('cxEnt').value };
  if (!x.cat) { toast('⚠️ 請選擇科目'); return; }
  if (!x.ent) { toast('⚠️ 請選主體（德化宮或基金會）'); return; }
  if (!(x.amount > 0)) { toast('⚠️ 請填金額'); return; }
  if (!x.note) { toast('⚠️ 請填說明'); return; }
  if (x.type !== '直付' && !cashPr && cashBig(x.amount, x.cat)) { toast('⚠️ 超過 ' + nt(CASH.limit) + '，請先開請購單'); return; }
  if (!cashPh.length && !confirm('沒有拍收據，確定送出？')) return;
  cashSend(x, function (r) { return '已登記（' + r.status + '）'; })
    .then(function () { cashPh = []; cashPr = ''; ['cxAmt', 'cxNote'].forEach(function (i) { if ($(i)) $(i).value = ''; }); cashRender(); }).catch(function () {});
}
function cashFund() {
  var x = { op: 'add', type: $('cfType').value, date: $('cfDate').value, amount: Number($('cfAmt').value), note: $('cfNote').value.trim(), ent: $('cfEnt').value };
  if (!x.ent) { toast('⚠️ 請選哪一個零用金'); return; }
  if (!(x.amount > 0)) { toast('⚠️ 請填金額'); return; }
  cashSend(x, (x.type === '撥入' ? '已登記撥款：' : '已登記繳回：') + x.ent).then(function () { $('cfAmt').value = ''; $('cfNote').value = ''; cashRender(); }).catch(function () {});
}

// 照片：沿用回報的壓縮方式
var PH_BOX = { cxPhotos: ['cxPick', '拍收據'], pqPhotos: ['pqPick', '拍報價'] };
function phArr(box) { return box === 'cxPhotos' ? cashPh : qPh; }
function renderCashPh() {
  Object.keys(PH_BOX).forEach(function (box) {
    if (!$(box)) return;
    var arr = phArr(box);
    var html = arr.map(function (p, i) { return '<div class="ph"><img src="' + p + '"><button onclick="cashPhDel(\'' + box + '\',' + i + ')">×</button></div>'; }).join('');
    if (arr.length < MAX_PHOTOS) html += '<div class="add" onclick="$(\'' + PH_BOX[box][0] + '\').click()">＋<br>' + PH_BOX[box][1] + '</div>';
    $(box).innerHTML = html;
  });
}
function cashPhDel(box, i) { phArr(box).splice(i, 1); renderCashPh(); }
document.addEventListener('change', function (e) {
  var box = e.target.id === 'cxPick' ? 'cxPhotos' : e.target.id === 'pqPick' ? 'pqPhotos' : '';
  if (!box) return;
  var arr = phArr(box), files = Array.prototype.slice.call(e.target.files, 0, MAX_PHOTOS - arr.length);
  e.target.value = '';
  toast('處理照片中…');
  Promise.all(files.map(compress)).then(function (list) { list.forEach(function (p) { arr.push(p); }); renderCashPh(); })
    .catch(function (err) { toast('⚠️ ' + err.message); });
});
