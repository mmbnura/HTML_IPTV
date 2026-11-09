/*
 * MMB Player - small helpers.
 * Written in ES5 on purpose: older Smart TV browsers (Tizen / webOS)
 * do not understand arrow functions, let/const, template strings or fetch().
 */
var U = (function () {
  'use strict';

  function getJSON(url, cb, timeoutMs) {
    var xhr = new XMLHttpRequest();
    var done = false;
    function finish(err, data) {
      if (done) { return; }
      done = true;
      cb(err, data);
    }
    xhr.open('GET', url, true);
    xhr.timeout = timeoutMs || 90000;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) { return; }
      if ((xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.responseText)) {
        var data;
        try { data = JSON.parse(xhr.responseText); } catch (e) { return finish(e); }
        finish(null, data);
      } else {
        finish(new Error('HTTP ' + xhr.status + ' for ' + url));
      }
    };
    xhr.ontimeout = function () { finish(new Error('Timeout loading ' + url)); };
    xhr.onerror = function () { finish(new Error('Network error loading ' + url)); };
    xhr.send();
    return xhr;
  }

  /* Element.closest() replacement (missing on old TV browsers). */
  function closest(el, attr, stopAt) {
    while (el && el !== stopAt && el.nodeType === 1) {
      if (el.hasAttribute(attr)) { return el; }
      el = el.parentNode;
    }
    return null;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initials(name) {
    var parts = String(name || '?').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/);
    var out = '';
    for (var i = 0; i < parts.length && out.length < 2; i++) {
      if (parts[i]) { out += parts[i].charAt(0).toUpperCase(); }
    }
    return out || '#';
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function each(arr, fn) {
    for (var i = 0; i < arr.length; i++) { fn(arr[i], i); }
  }

  /*
   * Scale the whole UI with the screen: everything in CSS is in rem and
   * designed for a 1920x1080 canvas with a 20px root font.
   */
  function autoScale() {
    var w = window.innerWidth || document.documentElement.clientWidth || 1280;
    var h = window.innerHeight || document.documentElement.clientHeight || 720;
    var size = Math.min(w / 1920, h / 1080) * 20;
    if (size < 9) { size = 9; }
    document.documentElement.style.fontSize = size.toFixed(2) + 'px';
    return size;
  }

  /* Remote-control key codes (desktop keyboard + Tizen + webOS + generic). */
  var K = {
    LEFT: [37], UP: [38], RIGHT: [39], DOWN: [40],
    OK: [13, 32],
    BACK: [27, 8, 10009, 461, 166],
    RED: [403, 70], GREEN: [404, 81], YELLOW: [405, 83], BLUE: [406],   // desktop: F, Q, S
    CH_UP: [427, 33], CH_DOWN: [428, 34],
    PLAY_PAUSE: [10252, 415, 19, 179, 80]   // TV play/pause, play, pause; media key; desktop: P
  };
  function is(code, list) { return list.indexOf(code) !== -1; }

  /* Buttons needed to move around the app; they can't be assigned to actions. */
  var RESERVED = [37, 38, 39, 40, 13, 32, 27, 8, 10009, 461, 166];

  var KEY_NAMES = {
    427: 'CH ∧', 428: 'CH ∨', 33: 'Page Up / CH ∧', 34: 'Page Down / CH ∨',
    403: 'Red', 404: 'Green', 405: 'Yellow', 406: 'Blue',
    10252: 'Play/Pause', 415: 'Play', 19: 'Pause', 413: 'Stop', 417: 'Fast-forward', 412: 'Rewind',
    10233: 'Next ⏭', 10232: 'Previous ⏮', 176: 'Next ⏭', 177: 'Previous ⏮', 179: 'Play/Pause',
    457: 'Info', 458: 'Guide', 10133: 'Menu', 10073: 'Channel list', 10190: 'Pre-CH',
    447: 'Volume +', 448: 'Volume −', 449: 'Mute',
    37: '←', 38: '↑', 39: '→', 40: '↓', 13: 'OK / Enter', 32: 'Space',
    27: 'Back / Esc', 8: 'Back / Backspace', 10009: 'Back', 461: 'Back', 166: 'Back'
  };

  function keyName(code, key) {
    if (KEY_NAMES[code]) { return KEY_NAMES[code]; }
    if (code >= 48 && code <= 57) { return 'Number ' + (code - 48); }
    if (code >= 65 && code <= 90) { return 'Key ' + String.fromCharCode(code); }
    if (key && key !== 'Unidentified' && key.length < 20) { return key; }
    return 'Button';
  }

  return {
    getJSON: getJSON, closest: closest, esc: esc, initials: initials,
    pad2: pad2, each: each, autoScale: autoScale, K: K, is: is,
    RESERVED: RESERVED, keyName: keyName
  };
})();
