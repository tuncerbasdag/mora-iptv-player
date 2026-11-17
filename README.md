<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-on-dark.svg">
    <img src="assets/logo.svg" alt="Mora IPTV Player logo" width="128">
  </picture>
</p>

# Mora IPTV Player

A personal IPTV **player**. It provides no content: you add your own M3U/M3U8 playlist or Xtream account.

> **Disclaimer:** Mora IPTV Player is only a media player. It does not include, host, sell, recommend or link to any
> channels, playlists or IPTV subscriptions. You are solely responsible for the content you add and for making sure
> you have the right to watch it. The authors do not endorse or take responsibility for any use of this software to
> access content without permission.

It has three targets:

1. **Samsung Smart TV (Tizen)**: you install it on your own TV with Developer Mode.
2. **Desktop (Windows and macOS)**: an Electron app with in-app updates.
3. **Browser**: you open it on your own computer, on `localhost` only.

This file explains installation and how to run it.

## Features

- **Live TV:** category/channel list, live preview, program guide (EPG), favorites, channel search
  (across all categories), channel logos, automatic reconnection when the connection drops.
- **Movies and Series:** poster grid, recently watched, sorting, resume where you left off,
  audio/subtitle selection.
- **Connections:** several M3U or Xtream accounts, one active at a time; automatic refresh on start.
- **Parental lock:** PIN-protected categories and Settings.
- **Remote setup (TV only):** instead of typing long addresses with a TV remote, send a playlist from a
  phone/computer through a portal page (`portal/`). The web version does not have it: just enter the M3U address in Settings.
- **Themes:** Default + 5 themes (Settings → Theme). A language setting exists, but translations are not written yet.

## Project layout

```
packages/core/   → shared logic (no DOM): M3U/Xtream/EPG, type classification, storage,
                   playlist refresh service, live stream watchdog, parental lock
packages/ui/     → shared UI (vanilla TS + DOM): screens, remote/keyboard navigation,
                   player layer (PlayerAdapter), themes; e2e/ = browser tests of the screens
packages/web-player/ → browser-engine player (hls.js + mpegts.js + <video>);
                   used by BOTH web and Tizen (live streams)
apps/web/        → web-only: localhost Node proxy (for CORS), entry point, page
apps/desktop/    → desktop app (Electron, Windows + macOS): runs the web server in-process, auto-update
apps/tizen/      → Tizen widget: live streams with the web engines, movies/series with AVPlay + config.xml
portal/          → standalone "Remote setup" server (send a list to the TV by MAC + PIN)
```

## Requirements

- **Node.js 24 or later** (tested: 24.21). Tests run `.ts` files directly,
  so older Node versions do not work for the tests.
- To install on a Tizen TV you also need: **VS Code** + the "Tizen TV" and "Tizen" extensions
  (see the Tizen section below) and the same network as the TV.

## Setup

```bash
npm install
npm run typecheck
npm test
```

All three should pass without errors (currently 157 unit tests: `packages/core`, `packages/ui`, `portal`).

There are also real-browser tests for every screen (home, settings, Live TV, fullscreen player, movies/series, series detail)
(Playwright, using the Google Chrome on your computer; they use a fake player/data, no real stream or provider is needed):

```bash
npm run test:e2e     # 171 tests, ~1.7 min; Chrome must be installed
```

### Local settings (.env)

Machine-specific addresses are not written into the code. Copy `.env.example` to `.env` and fill it in
(`.env` is not committed to git). Currently there is one variable: `PORTAL_URL`, the address of the Tizen app's
"Remote setup" portal (the machine running `npm run portal:start`, on the same network as the TV). The value is
embedded into the package during `npm run tizen:build`; rebuild after changing it. If it is not defined,
the build prints a warning and only "Remote setup" does not work.

## Running in the browser (web version)

```bash
npm run web          # development: build watch + server (automatic on file changes)
```

or separately:

```bash
npm run web:build    # bundles packages/ui + apps/web into a single bundle.js
npm run web:start    # starts the server at http://127.0.0.1:8787
npm run web:dev      # build watch only (start the server separately with web:start)
```

Then open **http://127.0.0.1:8787** in your browser. From the welcome screen go to
**Settings → Connections** and add your own M3U/M3U8 address or Xtream details; the list is downloaded
and parsed automatically. After changing code, hard-refresh the browser (Cmd/Ctrl+Shift+R).
If `apps/web/server.mjs` changes while `npm run web` is running, the server restarts by itself.

The server binds to `127.0.0.1` only; it cannot be reached from other devices on the network. This is intentional
(personal use, not a publicly exposed service).

### Why is there a proxy?

Most IPTV servers do not send CORS headers, so a browser cannot download the M3U list and video
segments directly. `apps/web/server.mjs` works around this with a local `/proxy`
endpoint; segment/sub-playlist addresses in `.m3u8` responses are rewritten automatically
so they pass through the proxy. This is entirely local and transparent: requests to your
IPTV provider are unchanged, the proxy simply sits between the browser and the provider.
The Tizen app does not need the proxy: the widget connects to the provider directly with
`access origin="*"` in `config.xml`.

### Player engines

For live streams the engine is chosen by stream type (`packages/web-player/src/engines/engineFactory.ts`):
`.ts` → **mpegts.js**, `.m3u8` → **hls.js**, native HLS if MSE is unavailable (Safari). For movies/series,
hls.js is used for HLS and a plain `<video>` for files such as MP4/MKV. On Tizen, live streams also run with the same web
engines (the video stays inside the DOM, so the preview box works); movies/series play with
**AVPlay**. To return to the old behavior, run in the TV browser console:
`localStorage.setItem('iptv.livePlayer', 'avplay')`.

### Live TV buffer

The buffer on live streams is deliberately short: channels open quickly and latency and memory stay low.
Playback starts **as soon as the first frame arrives**, without waiting for the buffer to fill.

| Setting | Value | Where |
|---|---|---|
| hls.js (`.m3u8`): start position from the live edge | 3 segments behind (≈ 6-18 s latency for 2-6 s segments) | `web-player/src/engines/hlsEngine.ts` → `liveSyncDurationCount` |
| hls.js: forward buffer target / upper limit | 10 s / 20 s | `maxBufferLength` / `maxMaxBufferLength` |
| hls.js: back buffer (already played) | 30 s, older data is dropped | `backBufferLength` |
| mpegts.js (`.ts`) | No special setting, library default (usually 1-3 s of forward buffer on live) | `web-player/src/engines/mpegtsEngine.ts` |
| Resume threshold after a stall (live) | **dynamic**: 2 s normally, 5 s after repeated stalls (see below) | `web-player/src/liveBuffer.ts` |
| Delay before the stall ring appears | for pauses longer than 400 ms | `playerController.ts` → `BUFFERING_SHOW_AFTER_MS` |

**Dynamic live buffer.** Playback starts on the first frame with low latency. If the network is flaky (2 stalls within a minute)
the player switches to a *stable* mode: after a stall it waits until about **5 s** are buffered before resuming. The extra latency
does **not** stack: the threshold stays 5 s however many stalls happen, and if a burst of delayed data makes the player fall more
than 8 s behind, it jumps toward the live edge. The same threshold applies when a channel opens: the first frame is held until it is
buffered (about 2 s, so opening takes ~1-2 s longer but does not stutter). After 3 calm minutes it returns to low latency. All values are in
`DEFAULT_LIVE_BUFFER` (`packages/web-player/src/liveBuffer.ts`); the rules are covered by unit tests, and the same code runs
on Tizen for live streams (movies/series play with AVPlay there).

The buffer affects resilience to network fluctuation, not picture quality; quality is determined by the resolution and
bitrate the provider sends. A larger buffer reduces stalls but slows down channel start and increases live latency and
memory use. Behavior of mpegts.js over very long sessions (e.g. 5 hours) has not been tested yet.

The percentage on the initial loading ring shows the larger of the real buffer percentage and an estimate curve that
slows down over time, because the player's real buffer figure stays at 0 until the first frame (`loadProgress.ts`
→ `createLoadEstimator`); it completes to 100% when the first frame arrives.

## Desktop app (Windows and macOS)

**Download:** get the installer for your computer from the [latest release](https://github.com/tuncerbasdag/mora-iptv-player/releases/latest):

| Your computer | File |
| --- | --- |
| Mac with **Apple Silicon** (M1, M2, M3, M4 ...) | `Mora-IPTV-Player-<version>-mac-arm64.dmg` |
| Mac with an **Intel** processor | `Mora-IPTV-Player-<version>-mac-x64.dmg` |
| **Windows** 10 / 11 (64-bit) | `Mora-IPTV-Player-<version>-win-x64.exe` |

Not sure which Mac you have? Apple menu → **About This Mac**: "Chip: Apple M..." is Apple Silicon, "Processor: Intel..." is Intel.
**First launch:** the app is not signed by Apple or Microsoft, so your system warns you once.

- **macOS:** after "Not Opened" appears, click **Done**, open **System Settings → Privacy & Security**, scroll to **Security** and click
  **Open Anyway** next to "Mora IPTV Player". If that does not help, run once in Terminal:
  `xattr -dr com.apple.quarantine "/Applications/Mora IPTV Player.app"`.
- **Windows:** on "Windows protected your PC", click **More info → Run anyway**.

Later updates installed from inside the app do not show this warning again.

Each release also lists `SHA256SUMS.txt` so you can verify the download (`shasum -a 256 -c SHA256SUMS.txt`).

The desktop app wraps the web version in an Electron window. It starts the same local server (with the CORS proxy)
inside the app, so there is nothing to install or run besides the app itself. Your connections and favorites are
stored in the app's own data folder.

```bash
npm run desktop        # run the desktop app from source
npm run desktop:pack   # unpacked app in release/ (quick local check)
npm run desktop:dist   # installers in release/ (.dmg + .zip on macOS, .exe on Windows)
```

### Versioning and releases

Releases are fully automated via GitHub Actions using **Conventional Commits**. When changes are pushed or merged into `main`, the workflow inspects the commit/PR message and bumps the version in `package.json` accordingly:

| Commit / PR prefix | Release type | Version increment | Example |
| :--- | :--- | :--- | :--- |
| `fix:` (e.g. `fix: resolve click glitch in fullscreen`) | Patch | `+0.0.1` | `0.0.1` ➔ `0.0.2` |
| `feat:` (e.g. `feat: add mouse back button in live tv`) | Minor | `+0.1.0` | `0.0.1` ➔ `0.1.0` |
| `BREAKING CHANGE:` or `feat!:` / `fix!:` | Major | `+1.0.0` | `0.0.1` ➔ `1.0.0` |
| `chore:`, `docs:`, `test:`, `style:`, `refactor:` | None | No release triggered | Workflow skips build |

#### How it works:
1. Squash-and-merge or push your commit to `main` with a conventional commit prefix (e.g. `feat: ...`).
2. The `.github/workflows/release.yml` workflow automatically:
   - Detects the bump level (`patch`, `minor`, `major`).
   - Increments the version in `package.json` and creates a git tag `vX.X.X`.
   - Runs type checks and unit tests.
   - Builds installers for macOS (`.dmg`, `.zip`) and Windows (`.exe`).
   - Creates one GitHub release titled **Mora IPTV Player X.Y.Z** with a download table (Apple Silicon / Intel / Windows)
     and generated notes, and attaches the macOS `.dmg`/`.zip`, the Windows `.exe`, the update metadata
     (`latest.yml`, `latest-mac.yml`) and `SHA256SUMS.txt`.
   - Publishes the release once both platforms have finished uploading; installed desktop apps then discover the update.
3. If a release run fails, fix the cause and re-run the **Release** workflow manually (Actions → Release → Run workflow)
   with the existing version (e.g. `0.1.0`); delete the half-finished draft release first.

### Updates

The app checks quietly for a new version shortly after start and every 6 hours. Nothing is downloaded or installed
without your say-so: open **Settings → Update** (or **Help → Check for Updates…**, which opens that page and starts a
check) to see the current version, check manually, and update when you want. The page exists only in the desktop app.
Both the Windows and macOS installers are on the same GitHub release page; the app reads `latest.yml` / `latest-mac.yml`
from the latest published release (no server of our own).

- **Windows:** **Download** fetches the update in the background (progress in the page and on the taskbar icon), then
  **Restart and install** finishes it (it is also installed when you quit the app).
- **macOS:** Squirrel.Mac refuses unsigned apps, so while `macSigned` is `false` in `apps/desktop/build-info.json` the app updates
  itself (`apps/desktop/macSelfUpdate.mjs`): **Download** fetches the release `.zip` for your CPU, verifies its sha512 from
  `latest-mac.yml`, and **Restart and install** quits the app, swaps the `.app` bundle, re-signs it ad-hoc and relaunches. It
  needs write access to the folder the app lives in (normally `/Applications`). Set `macSigned` to `true` once the build is
  signed with an Apple Developer ID to use the standard updater instead.
- A development run (`npm run desktop`) never checks: the page says updates only work in the installed app.
- Unsigned apps show an operating system warning the first time: on macOS right-click the app and choose **Open**; on
  Windows choose **More info → Run anyway** in the SmartScreen dialog.

## Remote setup portal

```bash
npm run portal:start     # default port 8788
```

By default the portal only listens on `127.0.0.1` (loopback), so the TV/emulator cannot reach it. On the
same network as the TV, start it bound to all interfaces instead:

```bash
HOST=0.0.0.0 npm run portal:start     # Git Bash / macOS / Linux
```

On Windows PowerShell: `$env:HOST = '0.0.0.0'; npm run portal:start`.

To pair with the portal, the TV shows a device identifier (MAC) and a PIN; from another device on the same
network you open the portal page and send the address/account. For the Tizen app to find the portal, put its address
in `PORTAL_URL` in `.env` (see "Local settings" above). The web version does not use the portal (the
playlist is entered directly in Settings). The portal deliberately shares no code with `apps/web/server.mjs` and can be deployed separately.

## Installing on a Samsung TV (Tizen)

### 1) Enable Developer Mode on the TV

1. Open the **Apps** screen on the TV.
2. With the remote, press **1-2-3-4-5** in order (use the TV remote's virtual numpad if there are no
   number keys). A "Developer mode" window should open.
3. Turn Developer mode **On** and enter this computer's local network IP address in the **Host PC IP**
   field (`ipconfig getifaddr en0` on a Mac, `ipconfig` on Windows).
4. Restart the TV.
5. The TV and this computer must be on the **same network** (same router/switch).

### 2) Build and install with VS Code (the method we use)

1. Install the **"Tizen TV"** and **"Tizen"** extensions in VS Code; from the extension's Package Manager install the
   **Baseline SDK** and the **10.0 TV** package.
2. With the extension's **Certificate Manager**, create a certificate profile with your Samsung account
   (add your TV to the device list). The package will not install on the TV without this step.
3. Build first from the project root; the extension does not compile TypeScript:
   ```bash
   npm run tizen:build
   ```
   This produces `apps/tizen/bundle.js` and `apps/tizen/styles.css`; the `apps/tizen/` folder, together with
   `config.xml` and `index.html`, is a standalone Tizen widget project.
4. Open the `apps/tizen` folder as a project in VS Code and use the extension's **Run Project** with the
   TV as the target; packaging, signing and installation happen automatically.

Notes:
- The **package id must be exactly 10 characters** (`IptvPlayer`); otherwise installation fails with the
  `118, -4 Load archive info fail` error.
- The emulator may not start on Intel Macs; try a real TV.
- The app icon is `apps/tizen/icon.png` (117×117, generated from `assets/logo.svg`) and is declared in `config.xml` with `<icon src="icon.png"/>`.
- After changing the build (code, `.env`) repeat `npm run tizen:build` every time and reinstall on the TV. For quick
  UI experiments you can run the same UI code in the browser with `npm run web`; however playback and AVPlay can only be
  verified on the TV.

### Alternative: command line (tizen CLI)

```bash
tizen package -t wgt -s <certificate-profile-name> -- apps/tizen
tizen install -n apps/tizen/<generated-package>.wgt -t <device-id>
```

`<certificate-profile-name>` is the name of the profile you created; `<device-id>` is the TV identifier (`sdb devices`).
The `tizen` CLI comes with Tizen Studio or the extension's SDK and must be added to your PATH.

### Using it on the TV

Once installed, the app appears on the TV's Apps screen. On the remote:

- **Arrow keys:** move between cards/list items.
- **OK/Enter:** select; pause/resume playback.
- **Back:** return to the previous screen.
- **Yellow key:** refresh the list manually.
- **Blue key:** add/remove the focused channel to/from favorites in Live TV (`F` on the keyboard).
- **CH+ / CH−:** next / previous channel in fullscreen live.
- **Info or Green key** (`I` on the keyboard): diagnostics panel in the fullscreen player: engine, buffer (s), buffer mode and stalls,
  dropped frames. If the picture freezes while the buffer drops to 0 the network/provider is the cause; if frames are dropped while
  the buffer is full, the device cannot decode fast enough.
- **Media keys:** play/pause.

## Known status

This project was developed step by step with Claude Code. In short: `packages/core`, `packages/ui` and
`portal` are verified by unit tests; every screen is verified by real-browser tests with a fake player and data;
the web UI (Live TV, themes, search, loading indicator) was also tried in a real browser with a real provider stream.
`apps/tizen` has not been opened on any emulator or TV in its current form: live playback with the web engines on the TV,
AVPlay behavior for movies/series, remote-control navigation and the Remote setup portal still need to be verified on a real TV.

## Troubleshooting

- **Live stream keeps dropping / "Cannot reach provider server" message:**
  The watchdog tries to reconnect at 1-2-4-8-15 s intervals and eventually gives up (details: `LiveWatchdog` in the
  source). Make sure the provider's server is reachable at that moment.
- **"Account is in use on another device (1/1 connections)":** Your provider allows only one stream at a time. The app
  itself opens only one stream at a time; close the stream on the other device (the TV, another tab) and try again.
- **List does not update / looks empty:** Check in Settings that the address or Xtream details are correct; in the web
  version the address is fetched through `/proxy`, so the server (`npm run web` or `npm run web:start`) must be running.
- **CSS/UI changes do not show in the browser:** `npm run web` (or `web:dev`) must be running; otherwise run
  `npm run web:build` and hard-refresh.
- **Cannot connect to the Tizen TV:** Check that the TV and the computer are on the same network, that Developer Mode
  is on and that the Host PC IP is current; if the IP changes you need to update that field on the TV and restart the TV.
- **"Remote setup" does not work on the TV:** Check that `PORTAL_URL` is defined in `.env`, that the portal
  (`npm run portal:start`) is running and that it is on the same network as the TV; if you changed `.env`, rebuild
  with `npm run tizen:build` and reinstall.

## Contributing

This repository only accepts bug reports and feature requests through **Issues**. Pull requests are not
reviewed or merged — please open an issue instead of a PR.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Personal, educational, and other noncommercial use is permitted;
**commercial use is not**. See the [LICENSE](LICENSE) file for the full terms.
Third-party components (hls.js, mpegts.js, Electron and others) are under their own licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
