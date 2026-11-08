/* MMB Player - localStorage persistence (favorites + last position). */
var Store = (function () {
  'use strict';

  var FAV_KEY = 'mmb.favorites';
  var STATE_KEY = 'mmb.state';
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
    getState: function () { return read(STATE_KEY, {}); },
    setState: function (patch) {
      var s = read(STATE_KEY, {});
      for (var k in patch) { if (patch.hasOwnProperty(k)) { s[k] = patch[k]; } }
      write(STATE_KEY, s);
    }
  };
})();
