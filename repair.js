// ===== 報修 =====
// 組員：回報 →「報修」；組長：管理 →「報修」；其他角色：上方「報修」分頁
var REP = null, REP_HOST = '', repWho = '', repArm = '', repPh = [], repShowDone = false;

function repOpen(host) { REP_HOST = host; repRender(); repLoad(); }
function repLoad() {
  var who = CODE;
  if (REP && repWho !== who) REP = null;
  return apiPost({ action: 'repair', op: 'list', u: CODE }).then(function (r) {
    if (CODE !== who) return;
    var same = REP && JSON.stringify(REP) === JSON.stringify(r);
    REP = r; repWho = who;
    if (!same) repRender();
  }).catch(function (e) { toast('⚠️ ' + (e.message === 'Failed to fetch' ? '網路異常' : e.message)); });
}
function repActive() {
  if (!REP_HOST || !$(REP_HOST)) return false;
  if (REP_HOST === 'rRepairBody') return $('rRepair').style.display !== 'none';
  return typeof adTab !== 'undefined' && adTab === 'repair' && (REP_HOST !== 'leadBody' || ROLE === 'leader');
}
function repVisible() { return repActive() && $(REP_HOST).offsetParent !== null; }
function repTyping() { return repPh.length || ['rpLoc', 'rpText', 'rpNote'].some(function (id) { return $(id) && $(id).value; }); }
function repRender() {
  if (!repActive()) return;
  $(REP_HOST).innerHTML = repHtml();
  renderRepPh();
  if (typeof loadThumbs === 'function') loadThumbs();
}

var REP_TAG = { '待處理': 'bad', '處理中': 'mid', '已完成': 'ok', '取消': 'mid' };
function repHtml() {
  var h = '<div class="card"><h3 class="ah">報修</h3>'
    + '<input id="rpLoc" maxlength="40" placeholder="地點：哪裡、什麼東西（例如大殿冷氣）">'
    + '<textarea id="rpText" maxlength="500" style="min-height:90px" placeholder="狀況：怎麼了"></textarea>'
    + '<label class="chk"><input type="checkbox" id="rpUrgent"> 緊急（會影響安全或明天的活動）</label>'
    + '<label>照片（最多 3 張，可不附）</label><div class="photos" id="rpPhotos"></div>'
    + '<input type="file" id="rpPick" accept="image/*" multiple class="hide">'
    + '<button class="big send" onclick="repAdd()">送出報修</button>'
    + '<small>設備、建物壞了用報修；人或安全狀況請用「回報 → 事務回報 → 異常回報」</small></div>';
  if (!REP) return h + '<div class="card"><div class="empty">載入中…</div></div>';
  var open = REP.rows.filter(function (r) { return r.status === '待處理' || r.status === '處理中'; });
  var done = REP.rows.filter(function (r) { return r.status !== '待處理' && r.status !== '處理中'; });
  h += '<div class="card"><h3 class="ah">還沒修好（' + open.length + '）</h3>' + (open.length ? open.map(repItem).join('') : '<div class="empty">目前沒有待修的項目 🙏</div>') + '</div>';
  h += '<div class="card"><h3 class="ah">已結案</h3>';
  if (!repShowDone) h += done.length ? '<button class="sb" onclick="repShowDone=true;repRender()">看已結案的 ' + done.length + ' 筆</button>' : '<div class="empty">還沒有</div>';
  else h += done.slice(0, 50).map(repItem).join('');
  return h + '</div>';
}
function repItem(r) {
  var me = REP.me.name, id = r.id, h = '<div class="rep citem">';
  h += '<div><b>' + (r.urgent ? '🚨 ' : '') + esc(r.loc) + '</b> <span class="' + (REP_TAG[r.status] || 'mid') + '">' + esc(r.status) + '</span></div>'
     + '<small class="cmeta">' + esc(r.created.slice(5).replace('-', '/')) + '・' + esc(r.by) + ' 回報' + (r.handler ? '・處理：' + esc(r.handler) : '') + '</small>'
     + '<p>' + esc(r.text) + '</p>';
  if (r.result) h += '<p class="crem">' + (r.status === '取消' ? '取消原因：' : '處理結果：') + esc(r.result) + '</p>';
  if (r.pr) h += '<small class="cmeta">📝 已開請購單 ' + esc(r.pr) + '</small>';
  if (r.photos.length) h += '<div class="pl">' + r.photos.map(thumbHtml).join('') + '</div>';
  var btn = [], openSt = r.status === '待處理' || r.status === '處理中';
  if (REP.canHandle && r.status === '待處理') btn.push('<button class="sb pri" onclick="repOp(\'start\',\'' + id + '\')">開始處理</button>');
  if (REP.canHandle && openSt) btn.push('<button class="sb pri" onclick="repAsk(\'done\',\'' + id + '\')">修好了</button>');
  if (REP.canRequest && openSt && !r.pr) btn.push('<button class="sb" onclick="repToPreq(\'' + id + '\')">要花錢：開請購單</button>');
  if ((r.by === me && r.status === '待處理') || (REP.canHandle && openSt)) btn.push('<button class="sb" onclick="repAsk(\'cancel\',\'' + id + '\')">取消</button>');
  if (btn.length) h += '<div class="pb">' + btn.join('') + '</div>';
  var m = repArm.match(/^(done|cancel):(.+)$/);
  if (m && m[2] === id) {
    h += '<div class="sform"><input id="rpNote" maxlength="300" placeholder="' + (m[1] === 'done' ? '處理結果（例如：換了壓縮機）' : '取消原因') + '">'
       + '<button class="sb ' + (m[1] === 'done' ? 'pri' : 'warn') + '" onclick="repOp(\'' + m[1] + '\',\'' + id + '\')">確定</button> <button class="sb" onclick="repArm=\'\';repRender()">返回</button></div>';
  }
  return h + '</div>';
}
function repAsk(op, id) { repArm = repArm === op + ':' + id ? '' : op + ':' + id; repRender(); if ($('rpNote')) $('rpNote').focus(); }
function repSend(body, okText) {
  if (isBusy()) return Promise.reject(new Error('busy'));
  busy = true; busySince = Date.now(); toast('處理中…');
  body.action = 'repair'; body.u = CODE;
  return apiPost(body).then(function (r) {
    busy = false; toast(okText); repArm = ''; return repLoad();
  }).catch(function (e) { busy = false; if (e.message !== 'busy') toast('⚠️ ' + (e.message === 'Failed to fetch' ? '網路異常，請再試一次' : e.message)); throw e; });
}
function repOp(op, id) {
  var note = $('rpNote') ? $('rpNote').value.trim() : '';
  if ((op === 'done' || op === 'cancel') && !note) { toast('⚠️ 請填' + (op === 'done' ? '處理結果' : '取消原因')); return; }
  repSend({ op: op, id: id, note: note }, { start: '已開始處理', done: '已結案', cancel: '已取消' }[op]).catch(function () {});
}
function repAdd() {
  var x = { op: 'add', loc: $('rpLoc').value.trim(), text: $('rpText').value.trim(), urgent: $('rpUrgent').checked, photos: repPh };
  if (!x.loc) { toast('⚠️ 請填地點'); return; }
  if (!x.text) { toast('⚠️ 請填狀況'); return; }
  repSend(x, x.urgent ? '緊急報修已送出，已通知組長' : '報修已送出').then(function () {
    repPh = []; $('rpLoc').value = ''; $('rpText').value = ''; repRender();
  }).catch(function () {});
}
// 從報修開請購：跳到財務 → 請購，表單帶入這張報修單
function repToPreq(id) {
  var r = REP.rows.filter(function (x) { return x.id === id; })[0];
  preqFromRepair(id, r ? r.loc : id);
  if (REP_HOST === 'rRepairBody') seg('cash');
  else if (REP_HOST === 'leadBody') leadGo('cash');
  else adTabGo('cash');
}

function renderRepPh() {
  if (!$('rpPhotos')) return;
  var html = repPh.map(function (p, i) { return '<div class="ph"><img src="' + p + '"><button onclick="repPh.splice(' + i + ',1);renderRepPh()">×</button></div>'; }).join('');
  if (repPh.length < MAX_PHOTOS) html += '<div class="add" onclick="$(\'rpPick\').click()">＋<br>加照片</div>';
  $('rpPhotos').innerHTML = html;
}
document.addEventListener('change', function (e) {
  if (e.target.id !== 'rpPick') return;
  var files = Array.prototype.slice.call(e.target.files, 0, MAX_PHOTOS - repPh.length);
  e.target.value = '';
  toast('處理照片中…');
  Promise.all(files.map(compress)).then(function (list) { repPh = repPh.concat(list); renderRepPh(); })
    .catch(function (err) { toast('⚠️ ' + err.message); });
});
