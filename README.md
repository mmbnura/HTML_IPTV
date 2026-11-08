📺 MMB Player – Web-based IPTV Application

MMB Player is a modern, TV-optimized web IPTV player built using HTML, CSS, and JavaScript.
It leverages the iptv-org public IPTV database to stream live television channels through a clean, set-top-box-style interface designed for TV browsers, remote controls, and desktop browsers.

The application is fully client-side, requires no backend, and is hosted as a static web application (GitHub Pages compatible).

✨ Highlights

IPTV-style UI optimized for TVs

Adaptive HLS streaming with buffering optimizations

YouTube-style quality selector

Real-time video quality display

Favorites & search

Fullscreen playback without interruption

No server, no database, no login required

🖥 Supported Platforms

MMB Player works on:

Desktop browsers (Chrome, Edge, Firefox)

Samsung Smart TV (Tizen Browser)

LG Smart TV (webOS Browser)

Android TV browsers (experimental)

⚠️ Stream availability and performance depend on the IPTV source.

🧩 Application Layout

The UI follows a three-column IPTV layout:

Categories panel – Channel categories & favorites

Channels list – Channels within the selected category

Player panel – Live video playback with controls

A bottom status bar displays:

Now Playing channel

Current video quality (center-aligned)

Manual quality selector

🎬 Video Playback Features

Powered by Hls.js

Supports live .m3u8 HLS streams

Adaptive Bitrate Streaming (ABR) enabled by default

Tuned buffering for smoother playback

Automatic recovery from network and media errors

Auto-play on channel selection

🎛 Video Quality Control

YouTube-style manual resolution selector

Shows only available stream qualities

Supports:

Auto (adaptive)

Manual locking (360p / 720p / 1080p, if available)

Real-time display of the actual playing quality

Quality selector and indicator are hidden in fullscreen mode

Example display:

Now Playing: Roja TV        Auto · 1080p        ⚙ Quality

⭐ Favorites

Mark channels as favorites with a star icon

Favorites are stored locally using localStorage

Persistent across page reloads

Dedicated ⭐ Favorites category

No account or backend required

🔍 Search

Search channels by name

Triggered only when user presses Enter / OK

Optimized for TV remote input

Search results appear in the channel list column

🖥 Fullscreen & Remote Control Behavior

Single click / OK toggles fullscreen

Clicking the video never pauses playback

Back / Escape exits fullscreen cleanly

UI controls auto-hide in fullscreen

Designed for TV remote navigation (↑ ↓ OK)

🎮 Remote Control & Keyboard

| Remote key | Keyboard | Action |
|---|---|---|
| ↑ ↓ | ↑ ↓ | Move in a list (in fullscreen: previous / next channel) |
| ← → | ← → | Move between Categories · Channels · Player |
| OK | Enter | Play channel / toggle fullscreen |
| ▶❚❚ Play/Pause | P | Pause / resume (or focus the ▶ button on the video's bottom bar and press OK) |
| BACK | Esc / Backspace | Exit fullscreen, close menu, go back |
| CH+ / CH− | PgUp / PgDn | Page through lists, zap channels |
| 🔴 Red | F | Add / remove favorite |
| 🟢 Green | Q | Quality menu |
| 🟡 Yellow | S | Search |
| 🔵 Blue | — | Fullscreen |
| ↑ to search, → | ↑ to search, → | Focus the Filter button, OK opens the filter panel |

Mouse / touch also work: click a channel to play, click ☆ to favorite, click the video for fullscreen,
click the ▶/❚❚ button in the bar at the bottom of the video to pause or resume.

🎚 Filters (Language & Country)

A Filter button sits to the right of the search box. It opens a panel where
everything is picked from lists, with no typing needed:

Language – every language with its channel count, most common first

Country – every country with its channel count, most common first

✕ Clear all – removes both filters

Selecting an entry applies it immediately and closes the panel. Filters can be
combined (e.g. Hindi · India), the counts update for the other filter, and the
button shows what is active. The choice is remembered across reloads.
The Country entry in the Categories panel controls the same country filter.

Language data comes from iptv-org's feeds.json and loads in the background a
few seconds after the channel list appears.

🗂 Project Structure

```
index.html        App shell (three-column layout + status bar)
css/style.css     TV-optimised styles (auto-scaled to any screen size)
js/util.js        Helpers: XHR JSON loader, key codes, UI scaling
js/storage.js     localStorage: favorites + last category/country/channel
js/data.js        iptv-org download, HLS stream filtering, search, filters
js/vlist.js       Virtualised list (smooth with 10 000+ channels on TVs)
js/player.js      hls.js / native HLS playback, recovery, quality control
js/app.js         UI rendering, focus navigation, remote keys, fullscreen
lib/hls.min.js    Hls.js 1.5.20 (bundled, no CDN needed)
```

All JavaScript is written in ES5 (no build step) so it runs on older
Samsung Tizen and LG webOS browsers.

▶️ Running

Serve the folder with any static web server, e.g.

```bash
python3 -m http.server 8080
```

then open http://localhost:8080 (or the GitHub Pages URL on the TV browser).

Note: when the page is served over HTTPS (GitHub Pages), plain `http://`
streams are hidden because browsers block mixed content. Serving over
plain HTTP on your local network shows more channels.

📡 IPTV Data Source

MMB Player uses the public iptv-org datasets:

Channels:
https://iptv-org.github.io/api/channels.json

Streams:
https://iptv-org.github.io/api/streams.json

Only HLS (.m3u8) streams are used for compatibility.

💾 Storage & Persistence

Uses browser localStorage for:

Favorites

Fully stateless

Works perfectly with static hosting (GitHub Pages)

🌐 Hosting

MMB Player is a pure static application:

No backend server

No database

No API keys

No build tools

It can be hosted on:

GitHub Pages

Any static web server

Local filesystem (limited)

⚠️ Limitations

Stream stability depends on IPTV source quality

Some channels provide only a single resolution

Browser-based playback cannot match native IPTV apps

CORS restrictions may limit advanced features (thumbnails, snapshots)

🚀 Future Enhancements (Optional)

Bitrate (kbps) display

Buffer health indicator

Persist preferred quality per channel

Known-stable channel list

Packaging as a Tizen Web App

Native AVPlayer integration for TVs

📜 License & Disclaimer

This project is for educational and experimental purposes only.

MMB Player does not host or distribute IPTV content

All streams belong to their respective owners

Availability and legality of IPTV streams vary by region

🙌 Acknowledgements

iptv-org
 for the open IPTV database

Hls.js
 for HLS playback

MMB Player demonstrates how far a well-designed, browser-only IPTV application can go — delivering a polished, TV-grade experience using just frontend technologies.
