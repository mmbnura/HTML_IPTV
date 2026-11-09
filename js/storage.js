/* MMB Player - localStorage persistence (favorites + last position). */
var Store = (function () {
  'use strict';

  var FAV_KEY = 'mmb.favorites';
  var STATE_KEY = 'mmb.state';
  var SETTINGS_KEY = 'mmb.settings';

  /* User settings (edited on settings.html) */
  var DEFAULT_SETTINGS = {
    keys: {},              // action -> keyCode, e.g. { next: 427 } (custom remote buttons)
    maxQuality: 0,         // 0 = no limit, otherwise highest height used by Auto (1080/720/480)
    arrowZap: true,        // ↑/↓ change channel in fullscreen
    startView: 'last',     // last | all | fav
    logos: true            // download channel logos
  };
  /* Actions that can get a custom remote button (settings.html). */
  var ACTIONS = [
    { id: 'next', label: 'Next channel', builtin: 'CH ∧ · Page Up' },
    { id: 'prev', label: 'Previous channel', builtin: 'CH ∨ · Page Down' },
    { id: 'playPause', label: 'Play / Pause', builtin: 'Play/Pause · P' },
    { id: 'favorite', label: 'Add / remove favorite', builtin: 'Red · F' },
    { id: 'fullscreen', label: 'Fullscreen', builtin: 'Blue · OK on the video' }
  ];
  var favs = {};

  function read(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full / disabled */ }
  }

  function loadFavorites() {
    favs = {};
    var list = read(FAV_KEY, []);
    for (var i = 0; i < list.length; i++) { favs[list[i]] = true; }
  }
  function saveFavorites() {
    var list = [];
    for (var id in favs) { if (favs.hasOwnProperty(id)) { list.push(id); } }
    write(FAV_KEY, list);
  }

  loadFavorites();

  return {
    isFavorite: function (id) { return !!favs[id]; },
    toggleFavorite: function (id) {
      if (favs[id]) { delete favs[id]; } else { favs[id] = true; }
      saveFavorites();
      return !!favs[id];
    },
    favoriteIds: function () {
      var list = [];
      for (var id in favs) { if (favs.hasOwnProperty(id)) { list.push(id); } }
      return list;
    },
    ACTIONS: ACTIONS,
    defaultSettings: function () { return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); },
    getSettings: function () {
      var s = read(SETTINGS_KEY, {});
      var out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      for (var k in s) { if (s.hasOwnProperty(k) && out.hasOwnProperty(k)) { out[k] = s[k]; } }
      if (!out.keys || typeof out.keys !== 'object') { out.keys = {}; }
      return out;
    },
    saveSettings: function (s) { write(SETTINGS_KEY, s); },
    resetSettings: function () { try { window.localStorage.removeItem(SETTINGS_KEY); } catch (e) { /* ignore */ } },
    clearFavorites: function () { favs = {}; saveFavorites(); },
    getState: function () { return read(STATE_KEY, {}); },
    setState: function (patch) {
      var s = read(STATE_KEY, {});
      for (var k in patch) { if (patch.hasOwnProperty(k)) { s[k] = patch[k]; } }
      write(STATE_KEY, s);
    }
  };
})();
