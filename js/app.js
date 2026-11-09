/*
 * MMB Player - UI, navigation and remote-control handling.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    body: document.body,
    catList: $('catList'), catTitle: $('catTitle'),
    chList: $('chList'), chTitle: $('chTitle'), chCount: $('chCount'),
    playerBox: $('playerBox'), video: $('video'),
    overlay: $('overlay'), spinner: $('spinner'), overlayMsg: $('overlayMsg'),
    ctrlBar: $('ctrlBar'), playBtn: $('playBtn'), playIcon: $('playIcon'),
    ctrlName: $('ctrlName'), ctrlQuality: $('ctrlQuality'), liveBadge: $('liveBadge'),
    osd: $('osd'), osdNum: $('osdNum'), osdName: $('osdName'), osdMeta: $('osdMeta'),
    infoLogo: $('infoLogo'), infoName: $('infoName'), infoMeta: $('infoMeta'),
    npName: $('npName'), qualityNow: $('qualityNow'), qualityBtn: $('qualityBtn'),
    qualityMenu: $('qualityMenu'), qualityList: $('qualityList'),
    searchBox: $('searchBox'), searchInput: $('searchInput'),
    filterBtn: $('filterBtn'), filterLabel: $('filterLabel'), settingsBtn: $('settingsBtn'),
    filterPanel: $('filterPanel'), filterTabs: $('filterTabs'), filterList: $('filterList'),
    statChannels: $('statChannels'), statCategories: $('statCategories'),
    clock: $('clock'), toast: $('toast')
  };

  var app = {
    ready: false,
    zone: 'cats',            // cats | chans | player | playbtn | quality | search | filterBtn | settingsBtn | filter | menu
    catMode: 'cats',         // cats | countries
    country: '',             // '' = all countries
    lang: '',                // '' = all languages
    pendingLang: '',         // remembered language, applied once languages have loaded
    fTab: 0,                 // filter panel: 0 language, 1 country, 2 clear
    fPane: 'list',           // filter panel focus: tabs | list
    view: { type: 'cat', id: 'all' }, // what the channel list shows
    lastQuery: '',
    searchResults: [],
    playList: [],            // list the playing channel came from (for zapping)
    playIndex: -1,
    fullscreen: false,
    nativeFs: false,
    menuIndex: 0,
    menuItems: [],
    mutedNotice: false
  };

  var catVL, chVL, fVL;
  var settings = Store.getSettings();   // edited on settings.html

  /* custom remote button -> action id (see Store.ACTIONS) */
  function customAction(code) {
    for (var id in settings.keys) {
      if (settings.keys.hasOwnProperty(id) && settings.keys[id] === code) { return id; }
    }
    return null;
  }

  function runAction(id) {
    if (id === 'next' || id === 'prev') {
      if (!Player.current()) { toast('Start a channel first'); return; }
      zap(id === 'next' ? 1 : -1);
      if (!app.fullscreen) { toast('▶ ' + Player.current().name); }
    } else if (id === 'playPause') {
      togglePause();
    } else if (id === 'favorite') {
      toggleFavorite(!app.fullscreen && app.zone === 'chans' ? chVL.current() : Player.current());
      if (app.fullscreen) { showOsd(); }
    } else if (id === 'fullscreen') {
      if (app.fullscreen) { exitFullscreen(); } else if (Player.current()) { enterFullscreen(); }
    }
  }

  /* Shown first in the country / language lists (most channels first within the group). */
  var PINNED_COUNTRIES = ['IN'];
  var PINNED_LANGS = ['hin', 'tam', 'tel', 'mal', 'ben', 'kan', 'pan', 'mar', 'guj', 'ori', 'bho',
    'asm', 'urd', 'kok', 'mai', 'bgc', 'hne', 'sat', 'lus', 'san', 'snd', 'kas', 'doi', 'mni',
    'brx', 'raj', 'mag', 'awa', 'nep'];

  /* Moves pinned entries (by .code) to the front and marks the last one for a divider. */
  function pinFirst(list, pinned) {
    var top = [], rest = [];
    U.each(list, function (it) { (pinned.indexOf(it.code) !== -1 ? top : rest).push(it); });
    if (top.length && rest.length) { top[top.length - 1].pinEnd = true; }
    return top.concat(rest);
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                          */
  /* ------------------------------------------------------------------ */

  function countryName(code) {
    return code ? (Data.state.countryNames[code] || code) : '';
  }

  function langName(code) {
    return code ? (Data.state.languageNames[code] || code) : '';
  }

  function filters() {
    return { country: app.country, lang: app.lang };
  }

  function buildCategoryItems() {
    var items = [];
    var counts = Data.categoryCounts(filters());
    items.push({ type: 'fav', label: '★ Favorites', count: Store.favoriteIds().length, cls: 'fav-entry' });
    if (app.lastQuery) {
      items.push({ type: 'search', label: '🔍 “' + app.lastQuery + '”', count: app.searchResults.length });
    }
    items.push({ type: 'country', label: '🌐 Country: ' + (app.country ? countryName(app.country) : 'All'), count: null, cls: 'country-entry' });
    items.push({ type: 'cat', id: 'all', label: 'All Channels', count: counts.all });
    U.each(Data.state.categories, function (c) {
      if (counts[c.id]) { items.push({ type: 'cat', id: c.id, label: c.name, count: counts[c.id] }); }
    });
    return items;
  }

  function buildCountryItems() {
    var items = [{ type: 'back', label: '◂ Back to categories', count: null }];
    items.push({ type: 'pickCountry', code: '', label: 'All countries', count: Data.state.channels.length });
    var list = [];
    U.each(Data.state.countries, function (c) {
      list.push({ type: 'pickCountry', code: c.code, label: c.name, count: c.count });
    });
    return items.concat(pinFirst(list, PINNED_COUNTRIES));
  }

  function isActiveCatItem(it) {
    var v = app.view;
    if (it.type === 'fav') { return v.type === 'fav'; }
    if (it.type === 'search') { return v.type === 'search'; }
    if (it.type === 'cat') { return v.type === 'cat' && v.id === it.id; }
    if (it.type === 'pickCountry') { return it.code === app.country; }
    return false;
  }

  function renderCatRow(it) {
    return '<span class="cat-label">' + U.esc(it.label) + '</span>' +
      (it.count != null ? '<span class="cat-count">' + it.count + '</span>' : '<span class="cat-arrow">▸</span>');
  }

  function decorateCatRow(row, it) {
    if (it.cls) { row.className += ' ' + it.cls; }
    if (it.pinEnd) { row.className += ' pin-end'; }
    if (isActiveCatItem(it)) { row.className += ' active'; }
  }

  function renderChRow(ch, idx) {
    var fav = Store.isFavorite(ch.id);
    var meta = [];
    if (ch.country) { meta.push(countryName(ch.country)); }
    var q = ch.streams[0] && ch.streams[0].quality;
    if (q) { meta.push(q); }
    if (ch.streams.length > 1) { meta.push(ch.streams.length + ' sources'); }
    return '<span class="ch-num">' + (idx + 1) + '</span>' +
      logoHtml(ch, 'ch-logo') +
      '<span class="ch-text"><span class="ch-name">' + U.esc(ch.name) + '</span>' +
      '<span class="ch-meta">' + U.esc(meta.join(' · ')) + '</span></span>' +
      '<span class="ch-fav' + (fav ? ' on' : '') + '" data-fav="1" title="Favorite">' + (fav ? '★' : '☆') + '</span>';
  }

  function decorateChRow(row, ch) {
    if (ch === Player.current()) { row.className += ' playing'; }
  }

  function logoHtml(ch, cls) {
    var img = ch.logo ?
      '<img src="' + U.esc(ch.logo) + '" alt="" style="visibility:hidden" ' +
      'onload="this.style.visibility=\'visible\'" onerror="this.parentNode.removeChild(this)">' : '';
    return '<span class="' + cls + '"><span class="logo-txt">' + U.esc(U.initials(ch.name)) + '</span>' + img + '</span>';
  }

  function currentChannelList() {
    var v = app.view;
    if (v.type === 'fav') {
      var list = [];
      U.each(Store.favoriteIds(), function (id) {
        var ch = Data.state.byId[id];
        if (ch) { list.push(ch); }
      });
      list.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
      return list;
    }
    if (v.type === 'search') { return app.searchResults; }
    return Data.filter({ category: v.id, country: app.country, lang: app.lang });
  }

  function viewTitle() {
    var v = app.view;
    if (v.type === 'fav') { return '★ Favorites'; }
    if (v.type === 'search') { return 'Search: “' + app.lastQuery + '”'; }
    var name = 'All Channels';
    if (v.id !== 'all') {
      U.each(Data.state.categories, function (c) { if (c.id === v.id) { name = c.name; } });
    }
    return name + (app.lang ? ' · ' + langName(app.lang) : '') + (app.country ? ' · ' + countryName(app.country) : '');
  }

  function showCategories(focusIdx) {
    var items = app.catMode === 'countries' ? buildCountryItems() : buildCategoryItems();
    el.catTitle.textContent = app.catMode === 'countries' ? 'Choose country' : 'Categories';
    var f = focusIdx;
    if (f == null) {
      f = 0;
      for (var i = 0; i < items.length; i++) { if (isActiveCatItem(items[i])) { f = i; break; } }
    }
    catVL.setItems(items, f);
  }

  function showChannels(keepFocus) {
    var list = currentChannelList();
    var focus = 0;
    var cur = keepFocus ? chVL.current() : Player.current();
    if (cur) {
      for (var i = 0; i < list.length; i++) { if (list[i] === cur) { focus = i; break; } }
    }
    el.chTitle.textContent = viewTitle();
    el.chCount.textContent = list.length ? list.length : '';
    chVL.setItems(list, focus);
  }

  function emptyChannelsHtml() {
    return app.view.type === 'fav' ?
      'No favorites yet.<br>Press the <b class="red-t">RED</b> button (or click ☆) on a channel to add it.' :
      'No channels found.';
  }

  function selectView(view) {
    app.view = view;
    Store.setState({ view: view.type === 'search' ? { type: 'cat', id: 'all' } : view, country: app.country });
    showChannels(false);
    catVL.refresh();
  }

  /* ------------------------------------------------------------------ */
  /* Focus zones                                                        */
  /* ------------------------------------------------------------------ */

  function setZone(zone) {
    app.zone = zone;
    catVL.setActive(zone === 'cats');
    chVL.setActive(zone === 'chans');
    toggleClass(el.playerBox, 'focused', zone === 'player');
    toggleClass(el.playBtn, 'focused', zone === 'playbtn');
    toggleClass(el.body, 'ctrl-focus', zone === 'playbtn');
    toggleClass(el.qualityBtn, 'focused', zone === 'quality');
    toggleClass(el.searchBox, 'focused', zone === 'search');
    toggleClass(el.filterBtn, 'focused', zone === 'filterBtn');
    toggleClass(el.settingsBtn, 'focused', zone === 'settingsBtn');
  }

  function toggleClass(node, cls, on) {
    if (on) { node.classList.add(cls); } else { node.classList.remove(cls); }
  }

  /* ------------------------------------------------------------------ */
  /* Actions                                                            */
  /* ------------------------------------------------------------------ */

  function activateCatItem(idx) {
    var it = catVL.items[idx];
    if (!it) { return; }
    catVL.setFocus(idx);
    if (it.type === 'country') {
      app.catMode = 'countries';
      showCategories();
      return;
    }
    if (it.type === 'back') {
      app.catMode = 'cats';
      showCategories();
      return;
    }
    if (it.type === 'pickCountry') {
      app.catMode = 'cats';
      setFilter('country', it.code, true);
      return;
    }
    if (it.type === 'fav') { selectView({ type: 'fav' }); }
    else if (it.type === 'search') { selectView({ type: 'search' }); }
    else { selectView({ type: 'cat', id: it.id }); }
    if (chVL.items.length) { setZone('chans'); }
  }

  /* Apply a language / country filter. kind: 'lang' | 'country' | 'clear' */
  function setFilter(kind, code, quiet) {
    if (kind === 'clear') { app.lang = ''; app.country = ''; }
    else if (kind === 'lang') { app.lang = code; }
    else { app.country = code; }
    app.pendingLang = '';
    Store.setState({ lang: app.lang, country: app.country });
    if (app.view.type === 'search') { app.view = { type: 'cat', id: 'all' }; }
    // the selected category may not exist with the new filters
    if (app.view.type === 'cat' && !Data.categoryCounts(filters())[app.view.id]) {
      app.view = { type: 'cat', id: 'all' };
    }
    updateFilterLabel();
    selectView(app.view);
    showCategories();
    if (!quiet) {
      toast(kind === 'clear' ? 'All filters cleared' :
        'Showing ' + chVL.items.length + ' channels' + filterText(' in '));
    }
  }

  function filterText(prefix) {
    var parts = [];
    if (app.lang) { parts.push(langName(app.lang)); }
    if (app.country) { parts.push(countryName(app.country)); }
    return parts.length ? prefix + parts.join(' · ') : '';
  }

  function updateFilterLabel() {
    var t = filterText('');
    el.filterLabel.textContent = t || 'Filter';
    toggleClass(el.filterBtn, 'active', !!t);
  }

  /* ---- filter panel ---- */

  function openFilter() {
    if (!app.ready) { return; }
    app.prevZone = app.zone === 'filter' ? app.prevZone : app.zone;
    app.fTab = app.fTab === 1 ? 1 : 0;
    app.fPane = 'list';
    el.filterPanel.className = 'modal';
    setZone('filter');
    renderFilter();
  }

  function closeFilter() {
    el.filterPanel.className = 'modal hidden';
    setZone(app.prevZone === 'filter' ? 'chans' : (app.prevZone || 'filterBtn'));
  }

  function filterTabs() {
    return [
      { label: 'Language', value: app.lang ? langName(app.lang) : 'Any' },
      { label: 'Country', value: app.country ? countryName(app.country) : 'Any' },
      { label: '✕ Clear all', value: '' }
    ];
  }

  function filterItems() {
    var kind = app.fTab === 1 ? 'country' : 'lang';
    if (kind === 'lang' && !Data.state.languagesReady) { return []; }
    var f = Data.facet(kind, filters());
    var items = [{ code: '', name: kind === 'lang' ? 'Any language' : 'Any country', count: f.total }];
    return items.concat(pinFirst(f.items, kind === 'lang' ? PINNED_LANGS : PINNED_COUNTRIES));
  }

  function renderFilterTabs() {
    var html = '';
    U.each(filterTabs(), function (t, i) {
      var cls = 'ftab' + (i === app.fTab ? ' current' : '') + (i === 2 ? ' clear' : '') +
        (app.fPane === 'tabs' && i === app.fTab ? ' focused' : '');
      html += '<div class="' + cls + '" data-ft="' + i + '"><span class="ftab-label">' + U.esc(t.label) + '</span>' +
        (t.value ? '<span class="ftab-value">' + U.esc(t.value) + '</span>' : '') + '</div>';
    });
    el.filterTabs.innerHTML = html;
  }

  function renderFilter() {
    renderFilterTabs();
    var items = filterItems();
    var cur = app.fTab === 1 ? app.country : app.lang;
    var focus = 0;
    for (var i = 0; i < items.length; i++) { if (items[i].code === cur) { focus = i; break; } }
    fVL.setItems(items, focus);
    fVL.setActive(app.fPane === 'list');
  }

  function filterSwitchTab(i) {
    app.fTab = i;
    if (i === 2) { renderFilterTabs(); return; }
    renderFilter();
  }

  function filterKey(k) {
    var K = U.K;
    if (U.is(k, K.BACK)) { closeFilter(); return true; }
    if (app.fPane === 'tabs') {
      if (U.is(k, K.UP)) { filterSwitchTab(Math.max(0, app.fTab - 1)); }
      else if (U.is(k, K.DOWN)) { filterSwitchTab(Math.min(2, app.fTab + 1)); }
      else if (U.is(k, K.RIGHT) || U.is(k, K.OK)) {
        if (app.fTab === 2) {
          if (U.is(k, K.OK)) { setFilter('clear', ''); closeFilter(); }
        } else {
          app.fPane = 'list';
          renderFilterTabs();
          fVL.setActive(true);
        }
      } else { return false; }
      return true;
    }
    if (U.is(k, K.UP)) { fVL.move(-1); }
    else if (U.is(k, K.DOWN)) { fVL.move(1); }
    else if (U.is(k, K.CH_UP)) { fVL.move(-fVL.pageSize()); }
    else if (U.is(k, K.CH_DOWN)) { fVL.move(fVL.pageSize()); }
    else if (U.is(k, K.LEFT)) { app.fPane = 'tabs'; fVL.setActive(false); renderFilterTabs(); }
    else if (U.is(k, K.RIGHT)) { filterSwitchTab(app.fTab === 0 ? 1 : 0); }
    else if (U.is(k, K.OK)) { chooseFilterItem(fVL.focus); }
    else { return false; }
    return true;
  }

  function chooseFilterItem(idx) {
    var it = fVL.items[idx];
    if (!it) { return; }
    setFilter(app.fTab === 1 ? 'country' : 'lang', it.code);
    closeFilter();
    if (chVL.items.length) { setZone('chans'); }
  }

  function playFromList(list, idx) {
    var ch = list[idx];
    if (!ch) { return; }
    app.playList = list;
    app.playIndex = idx;
    Player.play(ch);
    Store.setState({ lastChannel: ch.id });
    updateNowPlaying();
    chVL.refresh();
  }

  function activateChannel(idx) {
    var ch = chVL.items[idx];
    if (!ch) { return; }
    chVL.setFocus(idx);
    if (ch === Player.current()) {
      enterFullscreen();
    } else {
      playFromList(chVL.items, idx);
    }
  }

  function toggleFavorite(ch) {
    if (!ch) { return; }
    var on = Store.toggleFavorite(ch.id);
    toast(on ? '★ Added to favorites: ' + ch.name : 'Removed from favorites: ' + ch.name);
    if (app.view.type === 'fav') {
      showChannels(true);
    } else {
      chVL.refresh();
    }
    if (app.catMode === 'cats') {
      var f = catVL.focus;
      catVL.items = buildCategoryItems();
      catVL.refresh();
      catVL.setFocus(f);
    }
    updateNowPlaying();
  }

  function zap(delta) {
    var list = app.playList;
    if (!list.length) { return; }
    var idx = app.playIndex + delta;
    if (idx < 0) { idx = list.length - 1; }
    if (idx >= list.length) { idx = 0; }
    playFromList(list, idx);
    if (chVL.items === list) { chVL.setFocus(idx, true); }
    showOsd();
  }

  function runSearch() {
    var q = el.searchInput.value.replace(/^\s+|\s+$/g, '');
    el.searchInput.blur();
    if (!q) {
      app.lastQuery = '';
      app.searchResults = [];
      if (app.view.type === 'search') { app.view = { type: 'cat', id: 'all' }; }
      showCategories();
      showChannels(false);
      setZone('cats');
      return;
    }
    app.lastQuery = q;
    app.searchResults = Data.search(q);
    app.catMode = 'cats';
    app.view = { type: 'search' };
    showCategories();
    showChannels(false);
    toast(app.searchResults.length + ' channel' + (app.searchResults.length === 1 ? '' : 's') + ' found');
    setZone(app.searchResults.length ? 'chans' : 'search');
  }

  /* ------------------------------------------------------------------ */
  /* Player UI                                                          */
  /* ------------------------------------------------------------------ */

  function setStatus(text, kind) {
    if (kind === 'hide') {
      el.overlay.className = 'overlay hidden';
      return;
    }
    el.overlay.className = 'overlay ' + (kind || '');
    el.overlayMsg.innerHTML = U.esc(text).replace(/\n/g, '<br>');
  }

  function updatePlayState() {
    var paused = Player.isPaused();
    el.playIcon.className = paused ? 'ico-play' : 'ico-pause';
    toggleClass(el.body, 'paused', paused);
    toggleClass(el.body, 'has-channel', !!Player.current());
    el.liveBadge.textContent = paused ? 'PAUSED' : 'LIVE';
  }

  function togglePause() {
    if (!Player.current()) { toast('Choose a channel first'); return; }
    Player.togglePause();
    updatePlayState();
    showOsd();
  }

  function updateNowPlaying() {
    var ch = Player.current();
    updatePlayState();
    if (!ch) {
      el.npName.textContent = '—';
      return;
    }
    el.npName.textContent = ch.name;
    el.ctrlName.textContent = ch.name;
    el.infoLogo.innerHTML = logoHtml(ch, 'big-logo');
    el.infoName.innerHTML = U.esc(ch.name) + (Store.isFavorite(ch.id) ? ' <span class="star">★</span>' : '');
    var meta = [];
    if (ch.country) { meta.push(countryName(ch.country)); }
    var cats = [];
    U.each(ch.cats, function (id) {
      U.each(Data.state.categories, function (c) { if (c.id === id) { cats.push(c.name); } });
    });
    if (cats.length) { meta.push(cats.join(', ')); }
    var si = Player.streamInfo();
    if (si && si.total > 1) { meta.push('Source ' + (si.index + 1) + ' of ' + si.total); }
    el.infoMeta.textContent = meta.join('  ·  ');
    el.osdNum.textContent = app.playIndex >= 0 ? app.playIndex + 1 : '';
    el.osdName.textContent = ch.name;
    el.osdMeta.textContent = meta.join('  ·  ');
  }

  function updateQuality() {
    el.qualityNow.textContent = Player.qualityText();
    el.ctrlQuality.textContent = Player.qualityText();
    if (app.zone === 'menu') { renderMenu(); }
  }

  /* ---- quality menu ---- */

  function openMenu() {
    if (!Player.current()) { toast('Start a channel first'); return; }
    app.menuItems = Player.levels();
    var cur = Player.currentLevelIndex();
    app.menuIndex = 0;
    for (var i = 0; i < app.menuItems.length; i++) {
      if (app.menuItems[i].index === cur) { app.menuIndex = i; }
    }
    app.prevZone = app.zone === 'menu' ? app.prevZone : app.zone;
    el.qualityMenu.className = 'modal';
    setZone('menu');
    renderMenu();
  }

  function renderMenu() {
    var cur = Player.currentLevelIndex();
    var html = '';
    U.each(app.menuItems, function (it, i) {
      html += '<div class="menu-item' + (i === app.menuIndex ? ' focused' : '') +
        (it.index === cur ? ' checked' : '') + '" data-mi="' + i + '">' +
        '<span class="check">' + (it.index === cur ? '✓' : '') + '</span>' + U.esc(it.label) +
        (it.index === -1 ? '<span class="menu-sub">' + U.esc(Player.qualityText().replace(/^\w+ · /, '')) + '</span>' : '') +
        '</div>';
    });
    if (app.menuItems.length === 1) {
      html += '<div class="menu-note">This stream offers a single quality.</div>';
    }
    el.qualityList.innerHTML = html;
  }

  function closeMenu() {
    el.qualityMenu.className = 'modal hidden';
    setZone(app.prevZone || 'player');
  }

  function chooseMenu(i) {
    var it = app.menuItems[i];
    if (!it) { return; }
    Player.setLevel(it.index);
    toast('Quality: ' + it.label);
    closeMenu();
  }

  /* ---- fullscreen ---- */

  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || null;
  }

  function enterFullscreen() {
    if (app.fullscreen) { return; }
    if (app.zone === 'menu') { closeMenu(); }
    app.fullscreen = true;
    el.body.classList.add('fs');
    var root = document.documentElement;
    var req = root.requestFullscreen || root.webkitRequestFullscreen || root.mozRequestFullScreen;
    app.nativeFs = false;
    if (req) {
      try {
        var p = req.call(root);
        app.nativeFs = true;
        if (p && p.then) { p.then(null, function () { app.nativeFs = false; }); }
      } catch (e) { app.nativeFs = false; }
    }
    showOsd();
  }

  function exitFullscreen() {
    if (!app.fullscreen) { return; }
    app.fullscreen = false;
    el.body.classList.remove('fs');
    el.body.classList.remove('osd-on');
    if (fsElement()) {
      var ex = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
      try { if (ex) { ex.call(document); } } catch (e) { /* ignore */ }
    }
    app.nativeFs = false;
    setZone('player');
  }

  function onFsChange() {
    if (!fsElement() && app.fullscreen && app.nativeFs) {
      // user left native fullscreen with ESC / browser control
      exitFullscreen();
    }
  }

  var osdTimer = null;
  function showOsd() {
    el.body.classList.add('osd-on');
    clearTimeout(osdTimer);
    osdTimer = setTimeout(function () { el.body.classList.remove('osd-on'); }, 3500);
  }

  /* ---- misc UI ---- */

  var toastTimer = null;
  function toast(text) {
    el.toast.textContent = text;
    el.toast.className = 'toast show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.className = 'toast'; }, 2600);
  }

  function tickClock() {
    var d = new Date();
    el.clock.textContent = U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
  }

  /* ------------------------------------------------------------------ */
  /* Remote control / keyboard                                          */
  /* ------------------------------------------------------------------ */

  function onKey(e) {
    var k = e.keyCode;
    var K = U.K;
    var handled = true;

    if (app.mutedNotice) {
      app.mutedNotice = false;
      Player.unmute();
    }

    // Typing in the search field: only intercept Enter / Back / Down
    if (document.activeElement === el.searchInput) {
      if (k === 13) { runSearch(); }
      else if (k === 27 || k === 10009 || k === 461) { el.searchInput.blur(); setZone('search'); }
      else if (k === 40) { el.searchInput.blur(); setZone('chans'); }
      else { return; }
      e.preventDefault();
      return;
    }

    if (!app.ready) { return; }

    // buttons assigned on the settings page win over the built-in ones
    var custom = customAction(k);
    if (custom && app.zone !== 'menu' && app.zone !== 'filter') {
      runAction(custom);
      e.preventDefault();
      return;
    }

    if (app.fullscreen) {
      if (U.is(k, K.PLAY_PAUSE)) { togglePause(); }
      else if (U.is(k, K.OK) || U.is(k, K.BACK) || U.is(k, K.BLUE)) { exitFullscreen(); }
      else if (U.is(k, K.CH_UP)) { zap(1); }       // CH ∧ = next channel
      else if (U.is(k, K.CH_DOWN)) { zap(-1); }    // CH ∨ = previous channel
      else if (U.is(k, K.UP) && settings.arrowZap) { zap(-1); }
      else if (U.is(k, K.DOWN) && settings.arrowZap) { zap(1); }
      else if (U.is(k, K.RED)) { toggleFavorite(Player.current()); showOsd(); }
      else { showOsd(); handled = U.is(k, K.LEFT) || U.is(k, K.RIGHT); }
      if (handled) { e.preventDefault(); }
      return;
    }

    if (app.zone === 'menu') {
      if (U.is(k, K.UP)) { app.menuIndex = Math.max(0, app.menuIndex - 1); renderMenu(); }
      else if (U.is(k, K.DOWN)) { app.menuIndex = Math.min(app.menuItems.length - 1, app.menuIndex + 1); renderMenu(); }
      else if (U.is(k, K.OK)) { chooseMenu(app.menuIndex); }
      else if (U.is(k, K.BACK) || U.is(k, K.GREEN) || U.is(k, K.LEFT)) { closeMenu(); }
      else { handled = false; }
      if (handled) { e.preventDefault(); }
      return;
    }

    if (app.zone === 'filter') {
      if (filterKey(k)) { e.preventDefault(); }
      return;
    }

    // Colour / shortcut keys work in every zone
    if (U.is(k, K.PLAY_PAUSE)) {
      togglePause();
    } else if (U.is(k, K.RED)) {
      toggleFavorite(app.zone === 'chans' ? chVL.current() : Player.current());
    } else if (U.is(k, K.GREEN)) {
      openMenu();
    } else if (U.is(k, K.YELLOW)) {
      setZone('search');
      el.searchInput.focus();
    } else if (U.is(k, K.BLUE)) {
      if (Player.current()) { enterFullscreen(); }
    } else if (U.is(k, K.BACK)) {
      handleBack();
    } else {
      handled = navigate(k);
    }
    if (handled) { e.preventDefault(); }
  }

  function handleBack() {
    if (app.catMode === 'countries') {
      app.catMode = 'cats';
      showCategories();
      setZone('cats');
    } else if (app.zone !== 'cats') {
      setZone(app.zone === 'quality' || app.zone === 'player' || app.zone === 'playbtn' ? 'chans' : 'cats');
    }
  }

  function navigate(k) {
    var K = U.K;
    var z = app.zone;

    if (z === 'cats') {
      if (U.is(k, K.UP)) { if (!catVL.move(-1)) { setZone('search'); } }
      else if (U.is(k, K.DOWN)) { catVL.move(1); }
      else if (U.is(k, K.RIGHT)) { setZone('chans'); }
      else if (U.is(k, K.OK)) { activateCatItem(catVL.focus); }
      else if (U.is(k, K.CH_UP)) { catVL.move(-catVL.pageSize()); }
      else if (U.is(k, K.CH_DOWN)) { catVL.move(catVL.pageSize()); }
      else { return false; }
      return true;
    }
    if (z === 'chans') {
      if (U.is(k, K.UP)) { if (!chVL.move(-1)) { setZone('search'); } }
      else if (U.is(k, K.DOWN)) { chVL.move(1); }
      else if (U.is(k, K.LEFT)) { setZone('cats'); }
      else if (U.is(k, K.RIGHT)) { setZone('player'); }
      else if (U.is(k, K.OK)) { activateChannel(chVL.focus); }
      else if (U.is(k, K.CH_UP)) { chVL.move(-chVL.pageSize()); }
      else if (U.is(k, K.CH_DOWN)) { chVL.move(chVL.pageSize()); }
      else { return false; }
      return true;
    }
    if (z === 'player') {
      if (U.is(k, K.OK)) { if (Player.current()) { enterFullscreen(); } else { toast('Choose a channel first'); } }
      else if (U.is(k, K.LEFT)) { setZone('chans'); }
      else if (U.is(k, K.DOWN)) { setZone(Player.current() ? 'playbtn' : 'quality'); }
      else if (U.is(k, K.UP)) { setZone('search'); }
      else if (U.is(k, K.CH_UP)) { zap(1); }
      else if (U.is(k, K.CH_DOWN)) { zap(-1); }
      else { return false; }
      return true;
    }
    if (z === 'playbtn') {
      if (U.is(k, K.OK)) { togglePause(); }
      else if (U.is(k, K.UP)) { setZone('player'); }
      else if (U.is(k, K.DOWN)) { setZone('quality'); }
      else if (U.is(k, K.LEFT)) { setZone('chans'); }
      else { return false; }
      return true;
    }
    if (z === 'quality') {
      if (U.is(k, K.OK)) { openMenu(); }
      else if (U.is(k, K.UP)) { setZone(Player.current() ? 'playbtn' : 'player'); }
      else if (U.is(k, K.LEFT)) { setZone('chans'); }
      else { return false; }
      return true;
    }
    if (z === 'search') {
      if (U.is(k, K.OK)) { el.searchInput.focus(); }
      else if (U.is(k, K.DOWN)) { setZone('chans'); }
      else if (U.is(k, K.LEFT)) { setZone('cats'); }
      else if (U.is(k, K.RIGHT)) { setZone('filterBtn'); }
      else { return false; }
      return true;
    }
    if (z === 'filterBtn') {
      if (U.is(k, K.OK)) { openFilter(); }
      else if (U.is(k, K.DOWN)) { setZone('chans'); }
      else if (U.is(k, K.LEFT)) { setZone('search'); }
      else if (U.is(k, K.RIGHT)) { setZone('settingsBtn'); }
      else { return false; }
      return true;
    }
    if (z === 'settingsBtn') {
      if (U.is(k, K.OK)) { openSettings(); }
      else if (U.is(k, K.DOWN)) { setZone('chans'); }
      else if (U.is(k, K.LEFT)) { setZone('filterBtn'); }
      else if (U.is(k, K.RIGHT)) { setZone('player'); }
      else { return false; }
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Mouse / touch                                                      */
  /* ------------------------------------------------------------------ */

  function bindPointer() {
    el.playerBox.addEventListener('click', function (e) {
      e.preventDefault();
      if (app.mutedNotice) { app.mutedNotice = false; Player.unmute(); }
      if (!Player.current()) { return; }
      if (app.fullscreen) { exitFullscreen(); } else { setZone('player'); enterFullscreen(); }
    });
    el.playerBox.addEventListener('dblclick', function (e) { e.preventDefault(); });
    // the control bar must not trigger the fullscreen toggle of the video
    el.ctrlBar.addEventListener('click', function (e) { e.stopPropagation(); });
    el.playBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (app.mutedNotice) { app.mutedNotice = false; Player.unmute(); }
      togglePause();
    });
    el.playerBox.addEventListener('mousemove', function () { if (!app.fullscreen) { showOsd(); } });
    document.addEventListener('mousemove', function () { if (app.fullscreen) { showOsd(); } });

    el.qualityBtn.addEventListener('click', function () { setZone('quality'); openMenu(); });
    el.qualityMenu.addEventListener('click', function (e) {
      var item = U.closest(e.target, 'data-mi', el.qualityMenu);
      if (item) { chooseMenu(parseInt(item.getAttribute('data-mi'), 10)); }
      else if (e.target === el.qualityMenu) { closeMenu(); }
    });
    el.searchInput.addEventListener('focus', function () { setZone('search'); });

    el.filterBtn.addEventListener('click', function () { setZone('filterBtn'); openFilter(); });
    el.settingsBtn.addEventListener('click', openSettings);
    el.filterTabs.addEventListener('click', function (e) {
      var t = U.closest(e.target, 'data-ft', el.filterTabs);
      if (!t) { return; }
      var i = parseInt(t.getAttribute('data-ft'), 10);
      if (i === 2) { setFilter('clear', ''); closeFilter(); return; }
      app.fPane = 'list';
      filterSwitchTab(i);
    });
    el.filterPanel.addEventListener('click', function (e) {
      if (e.target === el.filterPanel) { closeFilter(); }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  function openSettings() {
    Player.stop();
    window.location.href = 'settings.html';
  }

  function restore() {
    var s = Store.getState();
    if (s.country && Data.state.countryNames[s.country]) { app.country = s.country; }
    app.pendingLang = s.lang || '';   // languages arrive later (see boot)
    if (s.view && (s.view.type === 'fav' || s.view.type === 'cat')) { app.view = s.view; }
    if (s.view && s.view.type === 'cat') { app.pendingView = s.view; }
    if (app.view.type === 'cat' && !Data.categoryCounts(filters())[app.view.id]) {
      app.view = { type: 'cat', id: 'all' };
    }
    if (settings.startView === 'all') { app.view = { type: 'cat', id: 'all' }; app.pendingView = null; }
    if (settings.startView === 'fav') { app.view = { type: 'fav' }; app.pendingView = null; }
    if (app.view.type === 'fav' && !Store.favoriteIds().length) {
      app.view = { type: 'cat', id: 'all' };
    }
    showCategories();
    showChannels(false);
    // put the cursor on the last watched channel
    if (s.lastChannel) {
      for (var i = 0; i < chVL.items.length; i++) {
        if (chVL.items[i].id === s.lastChannel) { chVL.setFocus(i, true); break; }
      }
    }
  }

  function boot() {
    U.autoScale();
    tickClock();
    setInterval(tickClock, 10000);

    catVL = new VList(el.catList, {
      rowRem: 2.6,
      className: 'cat-row',
      render: renderCatRow,
      decorate: decorateCatRow,
      onClick: function (idx) { setZone('cats'); activateCatItem(idx); }
    });
    chVL = new VList(el.chList, {
      rowRem: 3.6,
      className: 'ch-row',
      render: renderChRow,
      decorate: decorateChRow,
      empty: emptyChannelsHtml,
      onClick: function (idx, target) {
        setZone('chans');
        if (U.closest(target, 'data-fav', el.chList)) {
          chVL.setFocus(idx);
          toggleFavorite(chVL.items[idx]);
        } else {
          activateChannel(idx);
        }
      }
    });

    fVL = new VList(el.filterList, {
      rowRem: 2.6,
      className: 'f-row',
      render: function (it) {
        var cur = app.fTab === 1 ? app.country : app.lang;
        return '<span class="f-check">' + (it.code === cur ? '✓' : '') + '</span>' +
          '<span class="cat-label">' + U.esc(it.name) + '</span><span class="cat-count">' + it.count + '</span>';
      },
      empty: function () {
        return app.fTab === 0 && !Data.state.languagesReady ?
          'Loading languages…<br>This takes a few seconds the first time.' : 'Nothing to choose.';
      },
      decorate: function (row, it) { if (it.pinEnd) { row.className += ' pin-end'; } },
      onClick: function (idx) { chooseFilterItem(idx); }
    });

    Player.setMaxHeight(settings.maxQuality);
    Player.init(el.video, {
      status: setStatus,
      quality: updateQuality,
      playing: function () { updateQuality(); },
      failed: function () { updateQuality(); },
      streamChanged: updateNowPlaying,
      playState: updatePlayState,
      mutedAutoplay: function () {
        app.mutedNotice = true;
        toast('Autoplay was blocked – sound muted. Press any key to unmute.');
      }
    });

    document.addEventListener('keydown', onKey, false);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    window.addEventListener('resize', function () {
      U.autoScale();
      catVL.refresh();
      chVL.refresh();
    });
    bindPointer();
    setZone('cats');

    setStatus('Loading channels…', 'busy');
    Data.load(function (msg) { setStatus(msg, 'busy'); }, function (err) {
      if (err) {
        setStatus('Could not load the channel list.\nCheck the internet connection and reload.', 'error');
        if (window.console) { console.error(err); }
        return;
      }
      app.ready = true;
      el.statChannels.textContent = Data.state.channels.length;
      el.statCategories.textContent = Data.state.categories.length;
      setStatus('Select a channel to start watching', 'info');
      restore();
      setZone(chVL.items.length ? 'chans' : 'cats');
      updateFilterLabel();
      // languages first (needed by the filter), then logos
      Data.loadLanguages(function (lerr) {
        if (lerr && window.console) { console.error(lerr); }
        if (!lerr && app.pendingLang && Data.state.languageNames[app.pendingLang]) {
          var keep = app.pendingView;
          app.lang = app.pendingLang;
          if (keep && app.view.type === 'cat') { app.view = keep; }
          setFilter('lang', app.lang, true);
        }
        app.pendingView = null;
        if (app.zone === 'filter') { renderFilter(); }
        if (!settings.logos) { return; }
        Data.loadLogos(function () {
          chVL.refresh();
          updateNowPlaying();
        });
      });
    });
  }

  boot();
})();
