/*
 * MMB Player - iptv-org data loading and indexing.
 *
 * Builds one entry per channel that has at least one playable HLS stream.
 * A channel can have several streams; the player falls back to the next one
 * automatically when a stream fails.
 */
var Data = (function () {
  'use strict';

  var API = 'https://iptv-org.github.io/api/';

  var state = {
    channels: [],        // sorted by name
    byId: {},            // id -> channel
    categories: [],      // [{id, name, count}] sorted by name
    countries: [],       // [{code, name, flag, count}] sorted by name
    countryNames: {},    // code -> name
    languages: [],       // [{code, name, count}] most channels first (filled by loadLanguages)
    languageNames: {},   // code -> name
    languagesReady: false
  };

  function qualityHeight(q) {
    var m = /(\d{3,4})/.exec(q || '');
    return m ? parseInt(m[1], 10) : 0;
  }

  function streamScore(s) {
    var score = qualityHeight(s.quality);
    var labels = s.labels || [];
    if (labels.indexOf('Geo-blocked') !== -1) { score -= 5000; }
    if (labels.indexOf('Not 24/7') !== -1) { score -= 2000; }
    if (s.url.indexOf('https:') === 0) { score += 500; }
    return score;
  }

  function build(raw) {
    var pageIsHttps = window.location.protocol === 'https:';
    var meta = {};
    var i, c, s;

    for (i = 0; i < raw.channels.length; i++) {
      c = raw.channels[i];
      meta[c.id] = c;
    }

    var catNames = {};
    for (i = 0; i < raw.categories.length; i++) {
      catNames[raw.categories[i].id] = raw.categories[i].name;
    }

    for (i = 0; i < raw.countries.length; i++) {
      state.countryNames[raw.countries[i].code] = raw.countries[i].name;
    }

    // Group usable streams by channel
    var groups = {};
    var order = [];
    for (i = 0; i < raw.streams.length; i++) {
      s = raw.streams[i];
      if (!s.url || s.url.indexOf('.m3u8') === -1) { continue; }      // HLS only
      if (s.referrer || s.user_agent) { continue; }                    // browsers cannot set these headers
      if (pageIsHttps && s.url.indexOf('http:') === 0) { continue; }   // mixed content would be blocked

      var m = s.channel ? meta[s.channel] : null;
      if (m && (m.is_nsfw || m.closed)) { continue; }

      var key = m ? m.id : 'title:' + String(s.title || '').toLowerCase();
      var g = groups[key];
      if (!g) {
        var cats = (m && m.categories && m.categories.length) ? m.categories.slice(0) : ['other'];
        g = groups[key] = {
          id: key,
          name: m ? m.name : (s.title || 'Unknown'),
          country: m ? m.country : '',
          cats: cats,
          alt: m && m.alt_names ? m.alt_names.join(' ') : '',
          langs: [],
          streams: [],
          urls: {},
          logo: null
        };
        order.push(g);
      }
      if (g.urls[s.url]) { continue; }
      g.urls[s.url] = true;
      g.streams.push({ url: s.url, quality: s.quality || '', labels: s.labels || [], score: 0 });
      g.streams[g.streams.length - 1].score = streamScore(s);
    }

    // Finalise channels
    var catCount = {};
    var countryCount = {};
    for (i = 0; i < order.length; i++) {
      c = order[i];
      delete c.urls;
      c.streams.sort(function (a, b) { return b.score - a.score; });
      c.search = (c.name + ' ' + c.alt).toLowerCase();
      for (var j = 0; j < c.cats.length; j++) {
        catCount[c.cats[j]] = (catCount[c.cats[j]] || 0) + 1;
      }
      if (c.country) { countryCount[c.country] = (countryCount[c.country] || 0) + 1; }
      state.byId[c.id] = c;
    }
    order.sort(function (a, b) {
      var x = a.name.toLowerCase(), y = b.name.toLowerCase();
      return x < y ? -1 : (x > y ? 1 : 0);
    });
    state.channels = order;

    var id;
    for (id in catCount) {
      if (catCount.hasOwnProperty(id) && id !== 'xxx') {
        state.categories.push({ id: id, name: catNames[id] || (id === 'other' ? 'Other' : id), count: catCount[id] });
      }
    }
    state.categories.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });

    for (id in countryCount) {
      if (countryCount.hasOwnProperty(id)) {
        state.countries.push({ code: id, name: state.countryNames[id] || id, count: countryCount[id] });
      }
    }
    state.countries.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
  }

  /* Loads everything needed for the UI. onProgress(text), done(err) */
  function load(onProgress, done) {
    var files = ['streams', 'channels', 'categories', 'countries'];
    var raw = {};
    var pending = files.length;
    var failed = false;

    U.each(files, function (name) {
      U.getJSON(API + name + '.json', function (err, data) {
        if (failed) { return; }
        if (err) { failed = true; return done(err); }
        raw[name] = data;
        pending--;
        onProgress('Loading channel database… ' + (files.length - pending) + '/' + files.length);
        if (pending === 0) {
          onProgress('Preparing channel list…');
          // let the UI paint the message before the heavy work
          setTimeout(function () {
            try { build(raw); } catch (e) { return done(e); }
            raw = null;
            done(null);
          }, 30);
        }
      });
    });
  }

  /* Logos are optional and big, so they load in the background afterwards. */
  function loadLogos(done) {
    U.getJSON(API + 'logos.json', function (err, logos) {
      if (err || !logos) { return done && done(err); }
      for (var i = 0; i < logos.length; i++) {
        var l = logos[i];
        var ch = state.byId[l.channel];
        if (!ch || !l.url) { continue; }
        // prefer the main feed's logo
        if (!ch.logo || !l.feed) { ch.logo = l.url; }
      }
      if (done) { done(null); }
    });
  }

  /*
   * Languages come from feeds.json (one channel has one or more feeds, each
   * with its languages). It is a big file, so it loads in the background.
   */
  function loadLanguages(done) {
    U.getJSON(API + 'languages.json', function (err, langs) {
      if (err || !langs) { return done(err || new Error('no languages')); }
      var i;
      for (i = 0; i < langs.length; i++) { state.languageNames[langs[i].code] = langs[i].name; }
      langs = null;
      U.getJSON(API + 'feeds.json', function (err2, feeds) {
        if (err2 || !feeds) { return done(err2 || new Error('no feeds')); }
        for (i = 0; i < feeds.length; i++) {
          var ch = state.byId[feeds[i].channel];
          var fl = feeds[i].languages;
          if (!ch || !fl) { continue; }
          for (var j = 0; j < fl.length; j++) {
            if (ch.langs.indexOf(fl[j]) === -1) { ch.langs.push(fl[j]); }
          }
        }
        feeds = null;
        var counts = {};
        for (i = 0; i < state.channels.length; i++) {
          var cl = state.channels[i].langs;
          for (var k = 0; k < cl.length; k++) { counts[cl[k]] = (counts[cl[k]] || 0) + 1; }
        }
        for (var code in counts) {
          if (counts.hasOwnProperty(code)) {
            state.languages.push({ code: code, name: state.languageNames[code] || code, count: counts[code] });
          }
        }
        state.languages.sort(function (a, b) { return b.count - a.count; });
        state.languagesReady = true;
        done(null);
      }, 120000);
    });
  }

  function matches(c, f) {
    if (f.country && c.country !== f.country) { return false; }
    if (f.lang && c.langs.indexOf(f.lang) === -1) { return false; }
    return true;
  }

  /* channel counts per language (kind 'lang') or per country (kind 'country')
     honouring the *other* filter, most channels first */
  function facet(kind, f) {
    var counts = {};
    var total = 0;
    var i, j;
    for (i = 0; i < state.channels.length; i++) {
      var c = state.channels[i];
      if (kind === 'lang') {
        if (f.country && c.country !== f.country) { continue; }
        total++;
        for (j = 0; j < c.langs.length; j++) { counts[c.langs[j]] = (counts[c.langs[j]] || 0) + 1; }
      } else {
        if (f.lang && c.langs.indexOf(f.lang) === -1) { continue; }
        total++;
        if (c.country) { counts[c.country] = (counts[c.country] || 0) + 1; }
      }
    }
    var names = kind === 'lang' ? state.languageNames : state.countryNames;
    var out = [];
    for (var code in counts) {
      if (counts.hasOwnProperty(code)) { out.push({ code: code, name: names[code] || code, count: counts[code] }); }
    }
    out.sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : 1); });
    return { items: out, total: total };
  }

  function search(text) {
    var q = String(text || '').toLowerCase().replace(/^\s+|\s+$/g, '');
    if (!q) { return []; }
    var words = q.split(/\s+/);
    var out = [];
    for (var i = 0; i < state.channels.length; i++) {
      var c = state.channels[i];
      var ok = true;
      for (var w = 0; w < words.length; w++) {
        if (c.search.indexOf(words[w]) === -1) { ok = false; break; }
      }
      if (ok) { out.push(c); }
    }
    // names that start with the query first
    out.sort(function (a, b) {
      var x = a.search.indexOf(q) === 0 ? 0 : 1;
      var y = b.search.indexOf(q) === 0 ? 0 : 1;
      return x - y;
    });
    return out;
  }

  function filter(opts) {
    // opts: {category: id|'all', country: code|'', lang: code|''}
    var out = [];
    for (var i = 0; i < state.channels.length; i++) {
      var c = state.channels[i];
      if (!matches(c, opts)) { continue; }
      if (opts.category && opts.category !== 'all' && c.cats.indexOf(opts.category) === -1) { continue; }
      out.push(c);
    }
    return out;
  }

  function categoryCounts(f) {
    var counts = {};
    var total = 0;
    for (var i = 0; i < state.channels.length; i++) {
      var c = state.channels[i];
      if (!matches(c, f)) { continue; }
      total++;
      for (var j = 0; j < c.cats.length; j++) { counts[c.cats[j]] = (counts[c.cats[j]] || 0) + 1; }
    }
    counts.all = total;
    return counts;
  }

  return {
    state: state, load: load, loadLogos: loadLogos, loadLanguages: loadLanguages, facet: facet,
    search: search, filter: filter, categoryCounts: categoryCounts,
    qualityHeight: qualityHeight
  };
})();
