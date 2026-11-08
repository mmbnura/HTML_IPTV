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
    osd: $('osd'), osdNum: $('osdNum'), osdName: $('osdName'), osdMeta: $('osdMeta'),
    infoLogo: $('infoLogo'), infoName: $('infoName'), infoMeta: $('infoMeta'),
    npName: $('npName'), qualityNow: $('qualityNow'), qualityBtn: $('qualityBtn'),
    qualityMenu: $('qualityMenu'), qualityList: $('qualityList'),
    searchBox: $('searchBox'), searchInput: $('searchInput'),
    statChannels: $('statChannels'), statCategories: $('statCategories'),
    clock: $('clock'), toast: $('toast')
  };

  var app = {
    ready: false,
    zone: 'cats',            // cats | chans | player | quality | search | menu
    catMode: 'cats',         // cats | countries
    country: '',             // '' = all countries
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

  var catVL, chVL;

  /* ------------------------------------------------------------------ */
  /* Rendering                                                          */
  /* ------------------------------------------------------------------ */

  function countryName(code) {
    return code ? (Data.state.countryNames[code] || code) : '';
  }

  function buildCategoryItems() {
    var items = [];
    var counts = Data.categoryCounts(app.country);
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
    U.each(Data.state.countries, function (c) {
      items.push({ type: 'pickCountry', code: c.code, label: c.name, count: c.count });
    });
    return items;
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
    return Data.filter({ category: v.id, country: app.country });
  }

  function viewTitle() {
    var v = app.view;
    if (v.type === 'fav') { return '★ Favorites'; }
    if (v.type === 'search') { return 'Search: “' + app.lastQuery + '”'; }
    var name = 'All Channels';
    if (v.id !== 'all') {
      U.each(Data.state.categories, function (c) { if (c.id === v.id) { name = c.name; } });
    }
    return name + (app.country ? ' · ' + countryName(app.country) : '');
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
    toggleClass(el.qualityBtn, 'focused', zone === 'quality');
    toggleClass(el.searchBox, 'focused', zone === 'search');
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
      app.country = it.code;
      app.catMode = 'cats';
      if (app.view.type !== 'cat') { app.view = { type: 'cat', id: 'all' }; }
      // the selected category may not exist in the new country
      var counts = Data.categoryCounts(app.country);
      if (!counts[app.view.id]) { app.view = { type: 'cat', id: 'all' }; }
      selectView(app.view);
      showCategories();
      return;
    }
    if (it.type === 'fav') { selectView({ type: 'fav' }); }
    else if (it.type === 'search') { selectView({ type: 'search' }); }
    else { selectView({ type: 'cat', id: it.id }); }
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

  function updateNowPlaying() {
    var ch = Player.current();
    if (!ch) {
      el.npName.textContent = '—';
      return;
    }
    el.npName.textContent = ch.name;
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

    if (app.fullscreen) {
      if (U.is(k, K.OK) || U.is(k, K.BACK) || U.is(k, K.BLUE)) { exitFullscreen(); }
      else if (U.is(k, K.UP) || U.is(k, K.CH_UP)) { zap(-1); }
      else if (U.is(k, K.DOWN) || U.is(k, K.CH_DOWN)) { zap(1); }
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

    // Colour / shortcut keys work in every zone
    if (U.is(k, K.RED)) {
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
      setZone(app.zone === 'quality' || app.zone === 'player' ? 'chans' : 'cats');
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
      else if (U.is(k, K.DOWN)) { setZone('quality'); }
      else if (U.is(k, K.UP)) { setZone('search'); }
      else if (U.is(k, K.CH_UP)) { zap(-1); }
      else if (U.is(k, K.CH_DOWN)) { zap(1); }
      else { return false; }
      return true;
    }
    if (z === 'quality') {
      if (U.is(k, K.OK)) { openMenu(); }
      else if (U.is(k, K.UP)) { setZone('player'); }
      else if (U.is(k, K.LEFT)) { setZone('chans'); }
      else { return false; }
      return true;
    }
    if (z === 'search') {
      if (U.is(k, K.OK)) { el.searchInput.focus(); }
      else if (U.is(k, K.DOWN)) { setZone('chans'); }
      else if (U.is(k, K.LEFT)) { setZone('cats'); }
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
    document.addEventListener('mousemove', function () { if (app.fullscreen) { showOsd(); } });

    el.qualityBtn.addEventListener('click', function () { setZone('quality'); openMenu(); });
    el.qualityMenu.addEventListener('click', function (e) {
      var item = U.closest(e.target, 'data-mi', el.qualityMenu);
      if (item) { chooseMenu(parseInt(item.getAttribute('data-mi'), 10)); }
      else if (e.target === el.qualityMenu) { closeMenu(); }
    });
    el.searchInput.addEventListener('focus', function () { setZone('search'); });
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  function restore() {
    var s = Store.getState();
    if (s.country && Data.state.countryNames[s.country]) { app.country = s.country; }
    if (s.view && (s.view.type === 'fav' || s.view.type === 'cat')) { app.view = s.view; }
    if (app.view.type === 'cat' && !Data.categoryCounts(app.country)[app.view.id]) {
      app.view = { type: 'cat', id: 'all' };
    }
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

    Player.init(el.video, {
      status: setStatus,
      quality: updateQuality,
      playing: function () { updateQuality(); },
      failed: function () { updateQuality(); },
      streamChanged: updateNowPlaying,
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
      Data.loadLogos(function () {
        chVL.refresh();
        updateNowPlaying();
      });
    });
  }

  boot();
})();
