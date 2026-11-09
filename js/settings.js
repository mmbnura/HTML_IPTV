/*
 * MMB Player - settings page.
 * Game-style button assignment ("press the button you want to use") plus a
 * few defaults. Everything is stored in localStorage and read by the player.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    list: $('settingsList'), lastKey: $('lastKey'), clock: $('clock'), toast: $('toast'),
    capture: $('capture'), capTitle: $('capTitle'), capMsg: $('capMsg'), capSub: $('capSub'), capIcon: $('capIcon')
  };

  var settings = Store.getSettings();
  var rows = [];          // [{type, ...}] — one per line
  var focusRow = 0;
  var focusCell = 0;
  var cap = null;         // capture state {action, timer, done}
  var confirmId = null;   // button waiting for a second OK

  var OPTIONS = {
    maxQuality: [
      { v: 0, label: 'Best available' },
      { v: 1080, label: 'Up to 1080p' },
      { v: 720, label: 'Up to 720p' },
      { v: 480, label: 'Up to 480p (data saver)' }
    ],
    arrowZap: [
      { v: true, label: 'On' },
      { v: false, label: 'Off' }
    ],
    startView: [
      { v: 'last', label: 'Last used list' },
      { v: 'all', label: 'All channels' },
      { v: 'fav', label: 'Favorites' }
    ],
    logos: [
      { v: true, label: 'On' },
      { v: false, label: 'Off (faster on slow TVs)' }
    ]
  };

  function buildRows() {
    rows = [];
    rows.push({ type: 'header', label: 'Remote buttons' });
    U.each(Store.ACTIONS, function (a) { rows.push({ type: 'key', action: a }); });
    rows.push({ type: 'header', label: 'Playback' });
    rows.push({ type: 'option', id: 'maxQuality', label: 'Automatic quality', help: 'Highest resolution Auto may use' });
    rows.push({ type: 'option', id: 'arrowZap', label: '↑ / ↓ change channel in fullscreen' });
    rows.push({ type: 'header', label: 'Start-up' });
    rows.push({ type: 'option', id: 'startView', label: 'Open with' });
    rows.push({ type: 'option', id: 'logos', label: 'Channel logos' });
    rows.push({ type: 'header', label: 'Reset' });
    rows.push({ type: 'button', id: 'clearFavs', label: 'Remove all favorites' });
    rows.push({ type: 'button', id: 'reset', label: 'Restore default settings' });
    rows.push({ type: 'button', id: 'back', label: '◂ Back to player', cls: 'primary' });
  }

  function focusable(i) { return rows[i] && rows[i].type !== 'header'; }
  function cellCount(r) { return r.type === 'key' ? 2 : 1; }

  function optionLabel(id) {
    var list = OPTIONS[id];
    for (var i = 0; i < list.length; i++) { if (list[i].v === settings[id]) { return list[i].label; } }
    return list[0].label;
  }

  /* ---------------- rendering ---------------- */

  function render() {
    var html = '';
    U.each(rows, function (r, i) {
      if (r.type === 'header') {
        html += '<div class="set-header">' + U.esc(r.label) + '</div>';
        return;
      }
      var rowFocus = i === focusRow;
      html += '<div class="set-row' + (rowFocus ? ' row-focus' : '') + (r.cls ? ' ' + r.cls : '') + (r.type === 'button' ? ' btn-row' : '') + '" data-row="' + i + '">';
      if (r.type === 'key') {
        var code = settings.keys[r.action.id];
        html += '<div class="set-label">' + U.esc(r.action.label) +
          '<div class="set-help">Built-in: ' + U.esc(r.action.builtin) + '</div></div>' +
          cell(i, 0, code ? U.esc(U.keyName(code)) + ' <span class="code">(' + code + ')</span>' : '<span class="muted">Press OK to assign</span>', 'assign') +
          cell(i, 1, '✕', 'clear' + (code ? '' : ' disabled'));
      } else if (r.type === 'option') {
        html += '<div class="set-label">' + U.esc(r.label) +
          (r.help ? '<div class="set-help">' + U.esc(r.help) + '</div>' : '') + '</div>' +
          cell(i, 0, '<span class="arrow">◂</span>' + U.esc(optionLabel(r.id)) + '<span class="arrow">▸</span>', 'option');
      } else {
        var label = confirmId === r.id ? 'Press OK again to confirm' : r.label;
        html += cell(i, 0, U.esc(label), 'button' + (confirmId === r.id ? ' confirm' : ''));
      }
      html += '</div>';
    });
    el.list.innerHTML = html;
    var row = el.list.querySelector('.row-focus');
    if (row) { ensureVisible(row); }
  }

  function cell(row, idx, html, cls) {
    var f = row === focusRow && idx === focusCell;
    return '<div class="set-cell ' + cls + (f ? ' focused' : '') + '" data-row="' + row + '" data-cell="' + idx + '">' + html + '</div>';
  }

  function ensureVisible(node) {
    var top = node.offsetTop, h = node.offsetHeight;
    var view = el.list;
    if (top - 60 < view.scrollTop) { view.scrollTop = Math.max(0, top - 60); }
    else if (top + h + 20 > view.scrollTop + view.clientHeight) { view.scrollTop = top + h + 20 - view.clientHeight; }
  }

  /* ---------------- actions ---------------- */

  function save() { Store.saveSettings(settings); }

  function moveRow(d) {
    var i = focusRow + d;
    while (rows[i] && !focusable(i)) { i += d; }
    if (!rows[i]) { return; }
    focusRow = i;
    focusCell = 0;
    confirmId = null;
    render();
  }

  function cycleOption(r, d) {
    var list = OPTIONS[r.id];
    var cur = 0;
    for (var i = 0; i < list.length; i++) { if (list[i].v === settings[r.id]) { cur = i; } }
    cur = (cur + d + list.length) % list.length;
    settings[r.id] = list[cur].v;
    save();
    render();
  }

  function activate() {
    var r = rows[focusRow];
    if (!r) { return; }
    if (r.type === 'key') {
      if (focusCell === 1) { clearKey(r.action); } else { startCapture(r.action); }
    } else if (r.type === 'option') {
      cycleOption(r, 1);
    } else if (r.type === 'button') {
      pressButton(r.id);
    }
  }

  function pressButton(id) {
    if (id === 'back') { goBack(); return; }
    if (confirmId !== id) { confirmId = id; render(); return; }
    confirmId = null;
    if (id === 'clearFavs') {
      Store.clearFavorites();
      toast('All favorites removed');
    } else if (id === 'reset') {
      Store.resetSettings();
      settings = Store.getSettings();
      toast('Default settings restored');
    }
    render();
  }

  function clearKey(action) {
    if (!settings.keys[action.id]) { return; }
    delete settings.keys[action.id];
    save();
    toast('Custom button removed from ' + action.label);
    focusCell = 0;
    render();
  }

  function goBack() {
    window.location.href = 'index.html';
  }

  /* ---------------- "press a button" capture ---------------- */

  function startCapture(action) {
    cap = { action: action, done: false };
    el.capTitle.textContent = action.label;
    el.capMsg.innerHTML = 'Press the button you want to use…';
    el.capSub.textContent = 'Press BACK to cancel';
    el.capIcon.className = 'cap-icon';
    el.capture.className = 'modal';
    cap.timer = setTimeout(function () {
      if (!cap || cap.done) { return; }
      el.capIcon.className = 'cap-icon fail';
      el.capMsg.innerHTML = 'No button was detected.';
      el.capSub.innerHTML = 'If you pressed a button, your TV keeps it for itself and does not pass it to web pages.<br>Press OK to try again or BACK to cancel.';
      cap.timedOut = true;
    }, 10000);
  }

  function endCapture() {
    if (cap) { clearTimeout(cap.timer); clearTimeout(cap.closeTimer); }
    cap = null;
    el.capture.className = 'modal hidden';
    render();
  }

  function captureKey(e) {
    var k = e.keyCode;
    e.preventDefault();
    if (cap.done) { return; }
    if (U.is(k, U.K.BACK)) { endCapture(); return; }
    if (cap.timedOut && U.is(k, U.K.OK)) { var a = cap.action; endCapture(); startCapture(a); return; }
    if (!k) {
      el.capIcon.className = 'cap-icon warn';
      el.capMsg.innerHTML = 'The TV sent that button without a code, so it can\'t be used.';
      el.capSub.textContent = 'Press a different button, or BACK to cancel';
      return;
    }
    if (U.RESERVED.indexOf(k) !== -1) {
      el.capIcon.className = 'cap-icon warn';
      el.capMsg.innerHTML = '<b>' + U.esc(U.keyName(k, e.key)) + '</b> is needed to move around the app.';
      el.capSub.textContent = 'Press a different button, or BACK to cancel';
      return;
    }
    // assign; a button can only do one thing
    var note = '';
    U.each(Store.ACTIONS, function (a) {
      if (a.id !== cap.action.id && settings.keys[a.id] === k) {
        delete settings.keys[a.id];
        note = '<br><span class="muted">(removed from “' + U.esc(a.label) + '”)</span>';
      }
    });
    settings.keys[cap.action.id] = k;
    save();
    cap.done = true;
    clearTimeout(cap.timer);
    el.capIcon.className = 'cap-icon ok';
    el.capMsg.innerHTML = '✓ <b>' + U.esc(U.keyName(k, e.key)) + '</b> <span class="code">(' + k + ')</span> assigned' + note;
    el.capSub.textContent = '';
    cap.closeTimer = setTimeout(endCapture, 1500);
  }

  /* ---------------- input ---------------- */

  function showLastKey(e) {
    el.lastKey.innerHTML = '<b>' + U.esc(U.keyName(e.keyCode, e.key)) + '</b><span class="code">code ' + e.keyCode + '</span>';
  }

  function onKey(e) {
    showLastKey(e);
    if (cap) { captureKey(e); return; }
    var k = e.keyCode, K = U.K;
    var r = rows[focusRow];
    var handled = true;
    if (U.is(k, K.UP)) { moveRow(-1); }
    else if (U.is(k, K.DOWN)) { moveRow(1); }
    else if (U.is(k, K.LEFT) || U.is(k, K.RIGHT)) {
      var d = U.is(k, K.LEFT) ? -1 : 1;
      if (r.type === 'option') { cycleOption(r, d); }
      else if (r.type === 'key') { focusCell = Math.max(0, Math.min(1, focusCell + d)); render(); }
    }
    else if (U.is(k, K.OK)) { activate(); }
    else if (U.is(k, K.BACK)) { goBack(); }
    else { handled = false; }
    if (handled) { e.preventDefault(); }
  }

  function onClick(e) {
    if (cap) {
      if (e.target === el.capture) { endCapture(); }
      return;
    }
    var c = U.closest(e.target, 'data-cell', el.list);
    if (!c) { return; }
    focusRow = parseInt(c.getAttribute('data-row'), 10);
    focusCell = parseInt(c.getAttribute('data-cell'), 10);
    var r = rows[focusRow];
    if (r.type === 'option') {
      // click on the left arrow goes back, anywhere else goes forward
      cycleOption(r, e.target.className === 'arrow' && e.target === c.firstChild ? -1 : 1);
      return;
    }
    if (r.type !== 'button') { confirmId = null; }
    activate();
  }

  function toastFn() {
    var timer = null;
    return function (text) {
      el.toast.textContent = text;
      el.toast.className = 'toast show';
      clearTimeout(timer);
      timer = setTimeout(function () { el.toast.className = 'toast'; }, 2400);
    };
  }
  var toast = toastFn();

  function tick() {
    var d = new Date();
    el.clock.textContent = U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
  }

  U.autoScale();
  window.addEventListener('resize', function () { U.autoScale(); render(); });
  document.addEventListener('keydown', onKey, false);
  document.addEventListener('click', onClick, false);
  tick();
  setInterval(tick, 10000);
  buildRows();
  moveRow(1);   // first focusable row
})();
