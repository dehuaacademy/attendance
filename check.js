// ===== 每日檢核（廟務經辦 v0.4 第 3 頁）=====
// 組員、組長：「簽到/簽退」頁下方，可以勾；管理者：「今日」頁，可以勾也可以看進度
var CHK = null, chkWho = '', chkOpen = {}, CHK_HOST = '';

function chkLoad(host) {
  if (host) CHK_HOST = host;
  var who = CODE;
  if (CHK && chkWho !== who) CHK = null;
  return apiPost({ action: 'check', op: 'list', u: CODE }).then(function (r) {
    if (CODE !== who) return;
    if (CHK && JSON.stringify(CHK) === JSON.stringify(r)) return;
    CHK = r; chkWho = who; chkRender();
  }).catch(function () {});
}
function chkTyping() { var a = document.activeElement; return !!(a && a.id && a.id.indexOf('ck_') === 0); }
function chkRender() {
  if (!CHK_HOST || !$(CHK_HOST)) return;
  if (chkTyping()) return;
  $(CHK_HOST).innerHTML = chkHtml();
}
function ckId(x) { return 'ck_' + (x.sec + x.item).replace(/[^\w一-鿿]/g, ''); }
function chkHtml() {
  if (!CHK) return '<div class="card"><div class="empty">今日檢核載入中…</div></div>';
  var C = CHK, st = C.state || {}, done = 0, total = 0, secs = [];
  C.items.forEach(function (x) {
    if (secs.indexOf(x.sec) < 0) secs.push(x.sec);
    if (x.type === 'check') { total++; if ((st[x.sec + '｜' + x.item] || {}).v) done++; }
  });
  var h = '<div class="card chkcard"><h3 class="ah">今日檢核 <span class="chkn' + (done === total ? ' ok' : '') + '">' + done + ' / ' + total + '</span></h3>';
  var ho = C.handover || {}, hk = Object.keys(ho);
  if (hk.length) h += '<div class="chkho"><b>上一班交接</b>' + hk.map(function (k) { return '<div><small>' + esc(k) + '</small>' + esc(ho[k].v) + ' <small>（' + esc(ho[k].by) + '）</small></div>'; }).join('') + '</div>';
  secs.forEach(function (sec) {
    var items = C.items.filter(function (x) { return x.sec === sec; });
    var chks = items.filter(function (x) { return x.type === 'check'; });
    var d = chks.filter(function (x) { return (st[x.sec + '｜' + x.item] || {}).v; }).length;
    var open = chkOpen[sec] !== undefined ? chkOpen[sec] : d < chks.length || !chks.length;
    h += '<div class="chks"><div class="chkt" onclick="chkOpen[\'' + sec + '\']=' + !open + ';chkRender()"><b>' + esc(sec) + '</b>'
       + (chks.length ? '<span class="' + (d === chks.length ? 'ok' : 'mid') + '">' + d + '/' + chks.length + '</span>' : '') + '<span class="chkar">' + (open ? '▾' : '▸') + '</span></div>';
    if (open) {
      h += '<div class="chkl">';
      items.forEach(function (x) {
        var s = st[x.sec + '｜' + x.item] || {}, q = "'" + esc(x.sec) + "','" + esc(x.item) + "'";
        if (x.type === 'text') {
          h += '<div class="chkx"><label>' + esc(x.item) + (s.v ? ' <small>（' + esc(s.by) + ' ' + esc(s.at) + '）</small>' : '') + '</label>'
             + (C.canEdit ? '<div class="srow2"><input id="' + ckId(x) + '" value="' + esc(s.v || '') + '" placeholder="沒有就留白" maxlength="300"><button class="sb" onclick="chkSave(' + q + ',\'' + ckId(x) + '\')">儲存</button></div>'
                          : '<p>' + esc(s.v || '—') + '</p>') + '</div>';
        } else {
          h += '<button class="chkb' + (s.v ? ' on' : '') + '"' + (C.canEdit ? ' onclick="chkToggle(' + q + ')"' : ' disabled') + '>'
             + (s.v ? '✓ ' : '') + esc(x.item) + (s.v ? '<small>' + esc(s.by) + ' ' + esc(s.at) + '</small>' : '') + '</button>';
        }
      });
      h += '</div>';
    }
    h += '</div>';
  });
  return h + '</div>';
}
function chkSend(sec, item, v) {
  var who = CODE;
  return apiPost({ action: 'check', op: 'set', u: CODE, sec: sec, item: item, v: v }).then(function (r) {
    if (CODE !== who || !CHK) return;
    CHK.state[r.key] = r.v ? { v: r.v, by: r.by, at: r.at } : {};
    chkRender();
  });
}
function chkToggle(sec, item) {
  var k = sec + '｜' + item, on = !(CHK.state[k] || {}).v;
  CHK.state[k] = on ? { v: '✓', by: NAME || '', at: '…' } : {};   // 先畫出來，送出失敗再還原
  chkRender();
  chkSend(sec, item, on).catch(function (e) {
    CHK.state[k] = on ? {} : { v: '✓' }; chkRender();
    toast('⚠️ ' + (e.message === 'Failed to fetch' ? '網路異常，請再按一次' : e.message));
  });
}
function chkSave(sec, item, id) {
  var v = $(id).value.trim();
  $(id).blur();
  chkSend(sec, item, v).then(function () { toast('已儲存'); })
    .catch(function (e) { toast('⚠️ ' + (e.message === 'Failed to fetch' ? '網路異常，請再試一次' : e.message)); });
}
