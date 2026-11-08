/*
 * MMB Player - HLS playback.
 *
 * - hls.js with Adaptive Bitrate when Media Source Extensions are available
 * - native HLS (<video src=".m3u8">) otherwise (Safari, some TV browsers)
 * - automatic recovery from network and media errors
 * - falls back to the channel's next stream when one does not start
 */
var Player = (function () {
  'use strict';

  var video, cb;
  var hls = null;
  var channel = null;
  var streamIdx = 0;
  var mode = '';                 // 'hls' | 'native'
  var netRetries = 0, mediaRetries = 0;
  var startTimer = null;
  var stallTimer = null;
  var autoLevel = true;
  var failed = false;
  var levelHeight = 0;
  var START_TIMEOUT = 20000;
  var STALL_TIMEOUT = 25000;

  var HLS_CONFIG = {
    enableWorker: true,
    lowLatencyMode: false,
    startLevel: -1,
    capLevelToPlayerSize: false,
    // buffering tuned for smooth live playback without exhausting TV memory
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    maxBufferSize: 40 * 1000 * 1000,
    backBufferLength: 20,
    maxBufferHole: 0.5,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 10,
    nudgeMaxRetry: 5,
    abrEwmaDefaultEstimate: 1500000,
    abrBandWidthFactor: 0.9,
    abrBandWidthUpFactor: 0.7,
    manifestLoadingTimeOut: 12000,
    manifestLoadingMaxRetry: 2,
    levelLoadingTimeOut: 12000,
    levelLoadingMaxRetry: 3,
    fragLoadingTimeOut: 20000,
    fragLoadingMaxRetry: 6
  };

  function init(videoEl, callbacks) {
    video = videoEl;
    cb = callbacks;              // {status, quality, playing, failed, streamChanged, mutedAutoplay}
    video.controls = false;

    video.addEventListener('playing', function () {
      clearTimeout(startTimer);
      armStallWatch(false);
      cb.status('', 'hide');
      cb.playing();
    });
    video.addEventListener('waiting', function () {
      if (channel) { cb.status('Buffering…', 'busy'); armStallWatch(true); }
    });
    video.addEventListener('timeupdate', function () {
      if (stallTimer && !video.paused) { armStallWatch(false); }
    });
    video.addEventListener('resize', function () { cb.quality(); });
    video.addEventListener('loadedmetadata', function () { cb.quality(); });
    video.addEventListener('error', function () {
      if (mode === 'native' && channel) { nextStream('Stream error'); }
    });
    // Live TV is never paused by the UI; if something pauses it, resume.
    video.addEventListener('pause', function () {
      if (channel && !failed && !video.ended) {
        setTimeout(function () { if (channel && !failed && video.paused) { safePlay(); } }, 300);
      }
    });
  }

  function armStallWatch(on) {
    clearTimeout(stallTimer);
    stallTimer = null;
    if (on) {
      stallTimer = setTimeout(function () { nextStream('Stream stalled'); }, STALL_TIMEOUT);
    }
  }

  function safePlay() {
    var p;
    try { p = video.play(); } catch (e) { p = null; }
    if (p && typeof p.then === 'function') {
      p.then(null, function (err) {
        if (err && err.name === 'NotAllowedError' && !video.muted) {
          // autoplay with sound blocked: start muted, unmute on next interaction
          video.muted = true;
          cb.mutedAutoplay();
          safePlay();
        }
      });
    }
  }

  function destroy() {
    clearTimeout(startTimer);
    armStallWatch(false);
    if (hls) {
      try { hls.destroy(); } catch (e) { /* ignore */ }
      hls = null;
    }
    try {
      video.removeAttribute('src');
      video.load();
    } catch (e2) { /* ignore */ }
  }

  function play(ch) {
    destroy();
    channel = ch;
    failed = false;
    streamIdx = 0;
    start();
  }

  function stop() {
    destroy();
    channel = null;
  }

  function start() {
    var s = channel.streams[streamIdx];
    netRetries = 0;
    mediaRetries = 0;
    autoLevel = true;
    levelHeight = Data.qualityHeight(s.quality);
    cb.status('Connecting' + (channel.streams.length > 1 ? ' (stream ' + (streamIdx + 1) + '/' + channel.streams.length + ')' : '') + '…', 'busy');
    cb.streamChanged();
    cb.quality();

    startTimer = setTimeout(function () { nextStream('Stream did not start'); }, START_TIMEOUT);

    if (window.Hls && window.Hls.isSupported()) {
      mode = 'hls';
      startHls(s.url);
    } else if (video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL')) {
      mode = 'native';
      video.src = s.url;
      safePlay();
    } else {
      clearTimeout(startTimer);
      cb.status('This browser cannot play HLS streams', 'error');
    }
  }

  function startHls(url) {
    var H = window.Hls;
    hls = new H(HLS_CONFIG);
    var my = hls;

    hls.on(H.Events.MANIFEST_PARSED, function () {
      if (my !== hls) { return; }
      cb.quality();
      safePlay();
    });
    hls.on(H.Events.LEVEL_SWITCHED, function (evt, data) {
      if (my !== hls) { return; }
      var lv = hls.levels[data.level];
      if (lv && lv.height) { levelHeight = lv.height; }
      cb.quality();
    });
    hls.on(H.Events.FRAG_LOADED, function () {
      if (my === hls) { netRetries = 0; }
    });
    hls.on(H.Events.ERROR, function (evt, data) {
      if (my !== hls || !data.fatal) { return; }
      if (data.type === H.ErrorTypes.NETWORK_ERROR) {
        var manifestFail = data.details === H.ErrorDetails.MANIFEST_LOAD_ERROR ||
          data.details === H.ErrorDetails.MANIFEST_LOAD_TIMEOUT ||
          data.details === H.ErrorDetails.MANIFEST_PARSING_ERROR;
        if (!manifestFail && netRetries < 3) {
          netRetries++;
          cb.status('Network problem, retrying…', 'busy');
          setTimeout(function () { if (my === hls) { hls.startLoad(); } }, 1000 * netRetries);
        } else {
          nextStream('Stream unavailable');
        }
      } else if (data.type === H.ErrorTypes.MEDIA_ERROR) {
        mediaRetries++;
        if (mediaRetries === 1) {
          hls.recoverMediaError();
        } else if (mediaRetries === 2) {
          hls.swapAudioCodec();
          hls.recoverMediaError();
        } else {
          nextStream('Media error');
        }
      } else {
        nextStream('Playback error');
      }
    });

    hls.loadSource(url);
    hls.attachMedia(video);
  }

  function nextStream(reason) {
    if (!channel) { return; }
    destroy();
    if (streamIdx + 1 < channel.streams.length) {
      streamIdx++;
      cb.status(reason + ' – trying another source…', 'busy');
      setTimeout(function () { if (channel) { start(); } }, 600);
    } else {
      cb.status('Channel unavailable right now.\n' + reason + '. Try another channel.', 'error');
      failed = true;
      cb.failed();
    }
  }

  /* ---- quality ---- */

  function levels() {
    // [{index, label}] — Auto first, then unique heights high → low
    var out = [{ index: -1, label: 'Auto', height: 0 }];
    if (mode !== 'hls' || !hls || !hls.levels) { return out; }
    var best = {};
    for (var i = 0; i < hls.levels.length; i++) {
      var l = hls.levels[i];
      var h = l.height || 0;
      if (!h) { continue; }
      if (!best[h] || l.bitrate > hls.levels[best[h]].bitrate) { best[h] = i; }
    }
    var heights = [];
    for (var k in best) { if (best.hasOwnProperty(k)) { heights.push(+k); } }
    heights.sort(function (a, b) { return b - a; });
    for (var j = 0; j < heights.length; j++) {
      out.push({ index: best[heights[j]], label: heights[j] + 'p', height: heights[j] });
    }
    return out;
  }

  function setLevel(index) {
    if (mode !== 'hls' || !hls) { return; }
    autoLevel = index < 0;
    hls.currentLevel = index;      // -1 = automatic (ABR)
    if (!autoLevel && hls.levels[index]) { levelHeight = hls.levels[index].height; }
    cb.quality();
  }

  function currentLevelIndex() {
    if (mode !== 'hls' || !hls || autoLevel) { return -1; }
    return hls.currentLevel;
  }

  function qualityText() {
    if (!channel || failed) { return ''; }
    var h = video.videoHeight || levelHeight;
    var txt = h ? h + 'p' : '…';
    if (mode === 'hls') { return (autoLevel ? 'Auto · ' : 'Locked · ') + txt; }
    return txt;
  }

  return {
    init: init, play: play, stop: stop, levels: levels, setLevel: setLevel,
    currentLevelIndex: currentLevelIndex, qualityText: qualityText,
    current: function () { return channel; },
    streamInfo: function () { return channel ? { index: streamIdx, total: channel.streams.length } : null; },
    unmute: function () { video.muted = false; }
  };
})();
